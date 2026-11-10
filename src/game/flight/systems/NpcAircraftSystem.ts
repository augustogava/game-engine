import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import type { RemotePlayer, AircraftConfig } from '../types/index.js';
import type { PlayerState } from '../../MultiplayerClient.js';
import { fetchAircraftConfig } from '../api/AircraftConfigApi.js';
import { NpcFlightPath } from '../physics/NpcFlightPath.js';
import { evaluateHoldSlot, SLOT_RADIUS_DEFAULT_M, type SlotEvaluation } from '../physics/HoldSlotMath.js';
import {
    FT_TO_M,
    KT_TO_MS,
    METERS_PER_DEG_LAT,
    HOLD_SLOT_MODE_CHASE,
    type ScenarioHoldSlotConfig,
} from '../constants/index.js';

const NPC_REMOTE_ID = 'npc-scenario';
const NPC_START_AHEAD_DEFAULT_M = 800;
const NPC_SPEED_MIN_KT = 60;
const NPC_SPEED_MAX_KT = 1200;
const NPC_THROTTLE = 0.7;
const NPC_MS_TO_KMH = 3.6;
const NPC_COS_LAT_MIN = 0.001;
const PLAYER_PHYSICS_MAX_STEPS_PER_FRAME = 8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const FULL_CIRCLE_DEG = 360;
const SLOT_MARKER_SEGMENTS = 16;
const SLOT_MARKER_ALPHA = 0.22;
const SLOT_MARKER_COLOR_OUT = { r: 1, g: 0.85, b: 0.2 };
const SLOT_MARKER_COLOR_IN = { r: 0.25, g: 1, b: 0.65 };

export class NpcAircraftSystem {
    private readonly scene: any;
    private _slot: ScenarioHoldSlotConfig | null = null;
    private _label = '';
    private _remote: RemotePlayer | null = null;
    private _path: NpcFlightPath | null = null;
    private _state: PlayerState | null = null;
    private _marker: BABYLON.Mesh | null = null;
    private _markerMaterial: BABYLON.StandardMaterial | null = null;
    private _markerInSlot = false;
    private _startToken = 0;
    private _ready = false;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    isReady(): boolean {
        return this._ready && this._remote != null && this._path != null;
    }

    start(slot: ScenarioHoldSlotConfig | null | undefined, label: string): boolean {
        this.stop();
        const speedKt = Number(slot?.speedKt);
        if (!slot || !Number.isFinite(speedKt) || speedKt < NPC_SPEED_MIN_KT || speedKt > NPC_SPEED_MAX_KT) {
            console.warn(`[Npc] Scripted aircraft not started: speed ${slot?.speedKt} kt is outside ${NPC_SPEED_MIN_KT}-${NPC_SPEED_MAX_KT} kt`);
            return false;
        }
        if (!Array.isArray(slot.legs)) {
            console.warn('[Npc] Scripted aircraft not started: legs must be a list');
            return false;
        }
        this._slot = slot;
        this._label = label || 'NPC';
        const token = ++this._startToken;
        const aircraftId = Number(slot.aircraftId);
        if (Number.isInteger(aircraftId) && aircraftId > 0) {
            fetchAircraftConfig(aircraftId)
                .then((cfg) => { if (token === this._startToken) this.spawn(cfg); })
                .catch((err) => {
                    console.warn(`[Npc] Aircraft ${aircraftId} config fetch failed; using the default model:`, err);
                    if (token === this._startToken) this.spawn(null);
                });
        } else {
            this.spawn(null);
        }
        return true;
    }

    stop(): void {
        this._startToken++;
        this._ready = false;
        const remote = this._remote;
        if (remote) {
            try {
                if (this.scene.remotePlayers.get(NPC_REMOTE_ID) === remote) this.scene.remotePlayers.delete(NPC_REMOTE_ID);
                this.scene._multiplayerSystem.disposeRemotePlayer(remote);
            } catch (err) {
                console.warn('[Npc] Scripted aircraft dispose failed:', err);
            }
            console.debug('[Npc] Scripted aircraft removed');
        }
        this._remote = null;
        this._path = null;
        this._state = null;
        this._slot = null;
        try { this._marker?.dispose(); } catch (err) { console.warn('[Npc] Slot marker dispose failed:', err); }
        try { this._markerMaterial?.dispose(); } catch (err) { console.warn('[Npc] Slot marker material dispose failed:', err); }
        this._marker = null;
        this._markerMaterial = null;
        this._markerInSlot = false;
    }

    dispose(): void {
        this.stop();
    }

    repositionAheadOfPlayer(): void {
        const slot = this._slot;
        const path = this._path;
        if (!slot || !path) return;
        const start = this.startPose(slot);
        if (!start) return;
        path.reset(start.x, start.y, start.z, start.headingDeg);
        this.writeState();
        console.debug(`[Npc] Scripted aircraft repositioned ahead of the player at heading ${start.headingDeg.toFixed(0)}`);
    }

    update(dt: number): void {
        if (!this.isReady() || !Number.isFinite(dt) || dt <= 0) return;
        const physicsStepS = Number(this.scene.FIXED_DT);
        const frameBudgetS = Number.isFinite(physicsStepS) && physicsStepS > 0 ? physicsStepS * PLAYER_PHYSICS_MAX_STEPS_PER_FRAME : dt;
        this._path!.step(Math.min(dt, frameBudgetS));
        this.writeState();
    }

    evaluate(): SlotEvaluation | null {
        const slot = this._slot;
        const path = this._path;
        const player = this.playerPose();
        if (!slot || !path || !player || !this.isReady()) return null;
        const evaluation = evaluateHoldSlot(slot, {
            npcX: path.x,
            npcY: path.y,
            npcZ: path.z,
            npcHeadingDeg: path.headingDeg,
            playerX: player.x,
            playerY: player.y,
            playerZ: player.z,
            playerHeadingDeg: player.headingDeg,
            playerForwardX: player.forwardX,
            playerForwardY: player.forwardY,
            playerForwardZ: player.forwardZ,
        });
        if (evaluation) this.updateMarker(evaluation);
        return evaluation;
    }

    private playerPose(): { x: number; y: number; z: number; headingDeg: number; forwardX: number; forwardY: number; forwardZ: number } | null {
        const root = this.scene.planeRoot;
        const q = root?.rotationQuaternion;
        if (!root || !q) return null;
        const forwardX = 2 * (q.x * q.z + q.w * q.y);
        const forwardY = 2 * (q.y * q.z - q.w * q.x);
        const forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
        const headingDeg = ((Math.atan2(forwardX, -forwardZ) * RAD_TO_DEG) + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG;
        return { x: root.position.x, y: root.position.y, z: root.position.z, headingDeg, forwardX, forwardY, forwardZ };
    }

    private startPose(slot: ScenarioHoldSlotConfig): { x: number; y: number; z: number; headingDeg: number } | null {
        const player = this.playerPose();
        if (!player) return null;
        const aheadRaw = Number(slot.startAheadM);
        const aheadM = Number.isFinite(aheadRaw) ? aheadRaw : NPC_START_AHEAD_DEFAULT_M;
        const offsetFt = Number(slot.altitudeOffsetFt);
        const headingRad = player.headingDeg * DEG_TO_RAD;
        return {
            x: player.x + Math.sin(headingRad) * aheadM,
            y: player.y + (Number.isFinite(offsetFt) ? offsetFt * FT_TO_M : 0),
            z: player.z - Math.cos(headingRad) * aheadM,
            headingDeg: player.headingDeg,
        };
    }

    private spawn(cfg: AircraftConfig | null): void {
        const slot = this._slot;
        const babylonScene: BABYLON.Scene | null = this.scene.scene ?? null;
        if (!slot || !babylonScene) return;
        const start = this.startPose(slot);
        if (!start) {
            console.warn('[Npc] Scripted aircraft not spawned: player aircraft not ready');
            return;
        }
        const multiplayer = this.scene._multiplayerSystem;
        const remote: RemotePlayer = multiplayer.createRemotePlayer(NPC_REMOTE_ID, cfg?.model_file || undefined);
        remote.isLocalNpc = true;
        if (cfg) {
            remote.aircraftConfigCached = cfg;
            remote.engineTypeResolved = true;
            try {
                remote.engineSound?.setEngineType(this.scene._mapEngineType(cfg.engine_type));
            } catch (err) {
                console.warn('[Npc] Engine sound type failed:', err);
            }
        }
        this.scene.remotePlayers.set(NPC_REMOTE_ID, remote);
        const path = new NpcFlightPath(slot.legs, Number(slot.speedKt) * KT_TO_MS);
        path.reset(start.x, start.y, start.z, start.headingDeg);
        this._remote = remote;
        this._path = path;
        this._state = {
            userId: NPC_REMOTE_ID,
            lat: 0,
            lon: 0,
            alt: 0,
            airspeed: path.speedMs * NPC_MS_TO_KMH,
            throttle: NPC_THROTTLE,
            heading: start.headingDeg,
            pitch: 0,
            roll: 0,
            onGround: false,
            username: this._label,
            aircraftId: cfg?.id,
            aircraftCode: cfg?.code,
            aircraftModelFile: cfg?.model_file,
        };
        this._ready = true;
        this.writeState();
        try {
            multiplayer.updatePlayerLabel(remote, this._state);
        } catch (err) {
            console.warn('[Npc] Label creation failed:', err);
        }
        if (slot.mode !== HOLD_SLOT_MODE_CHASE) this.buildMarker(babylonScene, slot);
        console.log(`[Npc] Scripted aircraft spawned: mode=${slot.mode} aircraft=${cfg?.code ?? 'default'} speedKt=${slot.speedKt} legs=${slot.legs.length} heading=${start.headingDeg.toFixed(0)}`);
    }

    private writeState(): void {
        const path = this._path;
        const state = this._state;
        const remote = this._remote;
        if (!path || !state || !remote) return;
        const originLat = Number(this.scene.originLat);
        const originLon = Number(this.scene.originLon);
        const refAlt = Number.isFinite(this.scene.refAlt) ? this.scene.refAlt : 0;
        if (!Number.isFinite(originLat) || !Number.isFinite(originLon)) return;
        const metersPerDegLon = METERS_PER_DEG_LAT * Math.max(NPC_COS_LAT_MIN, Math.abs(Math.cos(originLat * DEG_TO_RAD)));
        state.lat = originLat - path.z / METERS_PER_DEG_LAT;
        state.lon = originLon + path.x / metersPerDegLon;
        state.alt = refAlt + path.y;
        state.heading = path.headingDeg;
        state.pitch = path.pitchDeg;
        state.roll = path.bankDeg;
        remote.prevState = null;
        remote.nextState = state;
        remote.lastUpdateTime = performance.now();
    }

    private buildMarker(scene: BABYLON.Scene, slot: ScenarioHoldSlotConfig): void {
        const radiusRaw = Number(slot.radiusM);
        const radius = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : SLOT_RADIUS_DEFAULT_M;
        const material = new BABYLON.StandardMaterial('npcSlotMarkerMat', scene);
        material.emissiveColor = new BABYLON.Color3(SLOT_MARKER_COLOR_OUT.r, SLOT_MARKER_COLOR_OUT.g, SLOT_MARKER_COLOR_OUT.b);
        material.diffuseColor = BABYLON.Color3.Black();
        material.specularColor = BABYLON.Color3.Black();
        material.disableLighting = true;
        material.alpha = SLOT_MARKER_ALPHA;
        material.backFaceCulling = false;
        const marker = BABYLON.MeshBuilder.CreateSphere('npcSlotMarker', { diameter: radius * 2, segments: SLOT_MARKER_SEGMENTS }, scene);
        marker.material = material;
        marker.isPickable = false;
        marker.applyFog = false;
        marker.receiveShadows = false;
        this._marker = marker;
        this._markerMaterial = material;
        this._markerInSlot = false;
    }

    private updateMarker(evaluation: SlotEvaluation): void {
        const marker = this._marker;
        const material = this._markerMaterial;
        if (!marker || !material) return;
        marker.position.set(evaluation.slotX, evaluation.slotY, evaluation.slotZ);
        if (evaluation.inSlot === this._markerInSlot) return;
        this._markerInSlot = evaluation.inSlot;
        const color = evaluation.inSlot ? SLOT_MARKER_COLOR_IN : SLOT_MARKER_COLOR_OUT;
        material.emissiveColor.set(color.r, color.g, color.b);
    }
}
