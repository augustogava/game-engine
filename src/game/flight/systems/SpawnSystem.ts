import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import {
    GROUND_Y,
    SPAWN_SNAP_FRAMES,
    AIRBORNE_MISSION_MIN_OFFSET_M,
    TERRAIN_UNKNOWN_Y,
    WORLD_READY_PROBE_HEIGHT_M,
    WORLD_READY_PROBE_LENGTH_M,
    WORLD_READY_TIMEOUT_MS,
    GEAR_STATE_DOWN,
    GEAR_STATE_UP,
    GEAR_MAX_TRAVEL_M,
    GEAR_SPRING_K_MIN_N_PER_M,
    G_ACCEL,
    ENGINE_TYPE_PISTON,
    MAGNETO_BOTH,
    CAMERA_MODE_CHASE,
    CAMERA_RADIUS_MIN_M,
    CAMERA_RADIUS_MAX_M,
    CINEMATIC_DURATION_MS,
    HUD_FADE_IN_MS,
    ENGINE_SOUND_FADE_IN_MS,
    RUNWAY_COLLIDER_Y_BIAS_M,
    SAVED_FLIGHT_STORAGE_KEY,
    SAVED_FLIGHT_URL_PARAM,
    SAVED_FLIGHT_AUTOSAVE_INTERVAL_MS,
    SAVED_FLIGHT_MIN_AGL_M,
    SAVED_FLIGHT_MAX_AGE_MS,
} from '../constants/index.js';

const SAVED_FLIGHT_VERSION = 1;
const SAVED_FLIGHT_PRESERVED_PARAMS = ['token', 'lang', 'simTime'];

export interface SavedFreeFlight {
    version: number;
    savedAt: number;
    lat: number;
    lon: number;
    altMslM: number;
    headingDeg: number;
    fuelKg: number;
    aircraftId: number | null;
    aircraftCode: string;
}

export class SpawnSystem {
    private readonly scene: any;
    private _pendingResume: SavedFreeFlight | null = null;
    private _autosaveTimer: number | null = null;
    private _onPageHide: (() => void) | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    static loadSavedFreeFlight(): SavedFreeFlight | null {
        try {
            const raw = localStorage.getItem(SAVED_FLIGHT_STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw) as Partial<SavedFreeFlight>;
            if (!data || data.version !== SAVED_FLIGHT_VERSION) return null;
            const numeric = [data.savedAt, data.lat, data.lon, data.altMslM, data.headingDeg, data.fuelKg];
            if (numeric.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
            if (Math.abs(data.lat as number) > 90 || Math.abs(data.lon as number) > 180) return null;
            if (Date.now() - (data.savedAt as number) > SAVED_FLIGHT_MAX_AGE_MS) return null;
            return data as SavedFreeFlight;
        } catch (err) {
            console.warn('[SavedFlight] Failed to read saved flight:', err);
            return null;
        }
    }

    static hasSavedFreeFlight(): boolean {
        return SpawnSystem.loadSavedFreeFlight() !== null;
    }

    static isResumeRequested(): boolean {
        try {
            return new URLSearchParams(window.location.search).get(SAVED_FLIGHT_URL_PARAM) === '1';
        } catch (_) {
            return false;
        }
    }

    private isFreeFlight(): boolean {
        return !this.scene._activeMission && !this.scene._activeMissionId && !this.scene._activeFlightPlanId;
    }

    private currentHeadingDeg(): number {
        const root = this.scene.planeRoot;
        if (!root || !root.rotationQuaternion) return 0;
        const fwd = root.forward;
        const hdgRad = Math.atan2(fwd.x, -fwd.z);
        return ((hdgRad * 180 / Math.PI) + 360) % 360;
    }

    saveFreeFlight(reason: string): boolean {
        const root = this.scene.planeRoot;
        if (!root || !this.scene.spawned || !this.scene._worldReady || this.scene._crashed) return false;
        if (!this.isFreeFlight() || this.scene.isOnGround) return false;
        const terrainY = Number.isFinite(this.scene.terrainY) && this.scene.terrainY !== TERRAIN_UNKNOWN_Y ? this.scene.terrainY : GROUND_Y;
        if (root.position.y - terrainY < SAVED_FLIGHT_MIN_AGL_M) return false;
        const geo = this.scene._apCurrentLatLon();
        if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lon)) return false;
        const altMslM = (Number.isFinite(this.scene.refAlt) ? this.scene.refAlt : 0) + root.position.y;
        if (!Number.isFinite(altMslM)) return false;
        const cfg = this.scene.aircraftConfig;
        const saved: SavedFreeFlight = {
            version: SAVED_FLIGHT_VERSION,
            savedAt: Date.now(),
            lat: geo.lat,
            lon: geo.lon,
            altMslM,
            headingDeg: this.currentHeadingDeg(),
            fuelKg: Number.isFinite(this.scene.fuelRemaining) ? Math.max(0, this.scene.fuelRemaining) : 0,
            aircraftId: Number.isFinite(cfg?.id) ? cfg.id : null,
            aircraftCode: typeof cfg?.code === 'string' ? cfg.code : '',
        };
        try {
            localStorage.setItem(SAVED_FLIGHT_STORAGE_KEY, JSON.stringify(saved));
            console.debug(`[SavedFlight] Saved (${reason}) lat=${saved.lat.toFixed(4)} lon=${saved.lon.toFixed(4)} altM=${saved.altMslM.toFixed(0)} hdg=${saved.headingDeg.toFixed(0)} fuelKg=${saved.fuelKg.toFixed(0)}`);
            return true;
        } catch (err) {
            console.warn('[SavedFlight] Failed to persist saved flight:', err);
            return false;
        }
    }

    applySavedFreeFlightSpawn(): boolean {
        const saved = SpawnSystem.loadSavedFreeFlight();
        if (!saved) {
            console.warn('[SavedFlight] Resume requested but no valid saved flight found');
            return false;
        }
        this.scene._pendingMissionLat = saved.lat;
        this.scene._pendingMissionLon = saved.lon;
        this.scene._pendingMissionHdg = saved.headingDeg;
        this.scene._pendingMissionAltM = Math.max(0, saved.altMslM - AIRBORNE_MISSION_MIN_OFFSET_M);
        this.scene._pendingMissionAirborne = true;
        this._pendingResume = saved;
        console.log(`[SavedFlight] Resuming free flight lat=${saved.lat.toFixed(4)} lon=${saved.lon.toFixed(4)} altM=${saved.altMslM.toFixed(0)} hdg=${saved.headingDeg.toFixed(0)}`);
        return true;
    }

    launchResume(): void {
        if (!SpawnSystem.hasSavedFreeFlight()) {
            console.warn('[SavedFlight] launchResume ignored: nothing saved');
            return;
        }
        try {
            const dest = new URL(window.location.href);
            const keep = new URLSearchParams();
            for (const key of SAVED_FLIGHT_PRESERVED_PARAMS) {
                const v = dest.searchParams.get(key);
                if (v) keep.set(key, v);
            }
            keep.set(SAVED_FLIGHT_URL_PARAM, '1');
            dest.search = keep.toString();
            window.location.href = dest.toString();
        } catch (err) {
            console.error('[SavedFlight] launchResume navigation failed:', err);
        }
    }

    private applyPendingResumeState(): void {
        const saved = this._pendingResume;
        if (!saved) return;
        const cfg = this.scene.aircraftConfig;
        const capacity = Number.isFinite(cfg?.fuel_capacity_kg) ? cfg.fuel_capacity_kg : saved.fuelKg;
        this.scene.fuelRemaining = Math.max(0, Math.min(capacity, saved.fuelKg));
        console.debug(`[SavedFlight] Restored fuel=${this.scene.fuelRemaining.toFixed(0)}kg (saved aircraft=${saved.aircraftCode || saved.aircraftId || 'unknown'})`);
    }

    private startAutosave(): void {
        if (this._autosaveTimer !== null || !this.isFreeFlight()) return;
        this._autosaveTimer = window.setInterval(() => this.saveFreeFlight('autosave'), SAVED_FLIGHT_AUTOSAVE_INTERVAL_MS);
        this._onPageHide = () => { this.saveFreeFlight('pagehide'); };
        window.addEventListener('pagehide', this._onPageHide);
    }

    dispose(): void {
        if (this._autosaveTimer !== null) {
            window.clearInterval(this._autosaveTimer);
            this._autosaveTimer = null;
        }
        if (this._onPageHide) {
            window.removeEventListener('pagehide', this._onPageHide);
            this._onPageHide = null;
        }
    }

    private resolveSpawnHeadingDeg(): number {
        const missionHdg = this.scene._pendingMissionHdg;
        if (this.scene._pendingMissionLat != null && missionHdg != null && Number.isFinite(missionHdg)) {
            return missionHdg;
        }
        return this.scene.initialHeading;
    }

    tickWorldReadyProbe(): void {
        if (this.scene._worldReady) return;
        if (this.scene._worldReadyStartMs === 0) {
            this.scene._worldReadyStartMs = performance.now();
            console.debug('[WorldReady] Probe started; waiting for terrain at spawn position');
        }

        const elapsed = performance.now() - this.scene._worldReadyStartMs;

        if (!this.scene.tiles || !this.scene.planeRoot) {
            this.scene._worldReady = true;
            console.warn('[WorldReady] No tiles or planeRoot; activating physics immediately');
            this.onWorldReady();
            return;
        }

        const pos = this.scene.planeRoot.position;
        this.scene._worldReadyProbeRay.origin.set(pos.x, pos.y + WORLD_READY_PROBE_HEIGHT_M, pos.z);
        this.scene._worldReadyProbeRay.length = WORLD_READY_PROBE_LENGTH_M;
        const hit = this.scene._pickTerrainPreferRunway(this.scene._worldReadyProbeRay);

        if (hit?.hit && hit.pickedPoint) {
            const isRunwayHit = hit.pickedMesh?.metadata?.type === 'runway-collider';
            const adjustedTerrainY = isRunwayHit
                ? hit.pickedPoint.y
                : hit.pickedPoint.y + RUNWAY_COLLIDER_Y_BIAS_M;
            this.scene.terrainY = adjustedTerrainY;
            this.scene._lastKnownSpawnTerrainY = adjustedTerrainY;
            this.scene._worldReady = true;
            console.debug(`[WorldReady] Terrain detected at y=${hit.pickedPoint.y.toFixed(1)}m (adjusted=${adjustedTerrainY.toFixed(2)}m, runway=${isRunwayHit}) after ${elapsed.toFixed(0)}ms`);
            this.onWorldReady();
            return;
        }

        if (elapsed >= WORLD_READY_TIMEOUT_MS) {
            this.scene.terrainY = TERRAIN_UNKNOWN_Y;
            this.scene._lastKnownSpawnTerrainY = TERRAIN_UNKNOWN_Y;
            this.scene._worldReady = true;
            console.warn(`[WorldReady] Timeout after ${elapsed.toFixed(0)}ms; activating physics without terrain`);
            this.onWorldReady();
            return;
        }
    }

    onWorldReady(): void {
        if (this.scene.planeRoot && this.scene.terrainY !== TERRAIN_UNKNOWN_Y) {
            const cfg = this.scene.aircraftConfig;
            const gearHeight = cfg.gear_positions.length > 0
                ? Math.abs(Math.min(...cfg.gear_positions.map((g: { y: number }) => g.y)))
                : 0;
            if (this.scene.spawnAirborne) {
                const isAirborneMission = this.scene._pendingMissionAirborne === true;
                const minOffset = isAirborneMission ? AIRBORNE_MISSION_MIN_OFFSET_M : 100;
                const altOffset = Math.max(minOffset, cfg.spawn_alt_offset_m);
                const minSafeY = this.scene.terrainY + altOffset;
                const resumeY = this._pendingResume && Number.isFinite(this.scene.refAlt)
                    ? this._pendingResume.altMslM - this.scene.refAlt
                    : Number.NaN;
                const desiredY = Number.isFinite(resumeY) ? Math.max(minSafeY, resumeY) : minSafeY;
                if (this.scene.planeRoot.position.y < minSafeY) {
                    console.warn(`[Spawn] Clamped pos.y from ${this.scene.planeRoot.position.y.toFixed(1)}m to ${minSafeY.toFixed(1)}m (below terrain+offset)`);
                }
                this.scene.planeRoot.position.y = desiredY;
                console.debug(`[WorldReady] Airborne spawn snapped to terrainY=${this.scene.terrainY.toFixed(1)}m + offset=${altOffset.toFixed(1)}m -> pos.y=${this.scene.planeRoot.position.y.toFixed(1)}m`);
            } else {
                const nGears = Math.max(1, cfg.gear_positions.length);
                const sitMass = cfg.mass_kg + (this.scene.fuelRemaining || 0);
                const safeSpringK = Math.max(
                    GEAR_SPRING_K_MIN_N_PER_M,
                    Number.isFinite(cfg.gear_spring_k) ? cfg.gear_spring_k : 0,
                );
                const eqComp = Math.min(
                    GEAR_MAX_TRAVEL_M * 0.5,
                    (sitMass * G_ACCEL) / (nGears * safeSpringK),
                );
                const desiredY = this.scene.terrainY + gearHeight - eqComp;
                if (this.scene.planeRoot.position.y < desiredY) {
                    console.warn(`[Spawn] Clamped ground pos.y from ${this.scene.planeRoot.position.y.toFixed(1)}m to ${desiredY.toFixed(1)}m (below terrain+gear)`);
                }
                this.scene.planeRoot.position.y = desiredY;
                this.scene.velocity.set(0, 0, 0);
                this.scene.angularVelocity.set(0, 0, 0);
                console.debug(`[WorldReady] Ground spawn snapped to terrainY=${this.scene.terrainY.toFixed(1)}m + gearHeight=${gearHeight.toFixed(2)}m - eqComp=${eqComp.toFixed(3)}m -> pos.y=${this.scene.planeRoot.position.y.toFixed(2)}m`);
            }
        }
        this.applyPendingResumeState();
        this.scene._spawnSnapFramesLeft = SPAWN_SNAP_FRAMES;
        if (!this.scene._runwayCollidersLoaded && Number.isFinite(this.scene.originLat) && Number.isFinite(this.scene.originLon)) {
            this.scene._runwayCollidersLoaded = true;
            this.scene._buildNearbyRunwayColliders(this.scene.originLat, this.scene.originLon).catch((err: any) => {
                console.warn('[Runway] background load failed:', err);
            });
        }
        this.maybeFireSpawned();
    }

    maybeFireSpawned(): void {
        if (this.scene.spawned && this.scene._worldReady && this.scene.onSpawned) {
            const cb = this.scene.onSpawned;
            this.scene.onSpawned = null;
            this.scene._cinematicActive = true;
            this.scene._cinematicStartMs = performance.now();
            const currentRadius = (this.scene.camera && Number.isFinite(this.scene.camera.radius)) ? this.scene.camera.radius : 35;
            this.scene._cinematicTargetRadius = Math.max(CAMERA_RADIUS_MIN_M, Math.min(CAMERA_RADIUS_MAX_M, currentRadius));
            console.log(`[Cinematic] Starting spawn fly-in (target radius=${this.scene._cinematicTargetRadius.toFixed(1)}m)`);
            try {
                this.scene._engineSound.start();
                this.scene._engineSound.fadeIn(ENGINE_SOUND_FADE_IN_MS);
                this.scene._flightAudio.startWind();
            } catch (err) {
                console.warn('[EngineSound] Init failed:', err);
            }
            const hudEl = document.getElementById('flight-hud');
            if (hudEl) {
                hudEl.style.opacity = '0';
                hudEl.style.transition = `opacity ${HUD_FADE_IN_MS}ms ease`;
            }
            try {
                cb();
            } catch (err) {
                console.warn('[Cinematic] onSpawned callback failed:', err);
            }
            if (this.scene._missionSystem && typeof this.scene._missionSystem.refreshWeatherAtPosition === 'function') {
                this.scene._missionSystem.refreshWeatherAtPosition('spawn');
            }
            this.startAutosave();
            if (this._pendingResume) {
                this.scene._showToast(I18n.t('savedFlight.resumed'));
                this._pendingResume = null;
            }
            this.scene._safeSetTimeout(() => {
                this.scene._cinematicActive = false;
                this.scene._setCameraMode(CAMERA_MODE_CHASE);
                this.scene._hudFadeStartMs = performance.now();
                this.scene._hudFadeActive = true;
                const liveHudEl = document.getElementById('flight-hud');
                if (liveHudEl) liveHudEl.style.opacity = '0.85';
                console.log('[Cinematic] Completed, HUD fade-in started');
            }, CINEMATIC_DURATION_MS);
        }
    }

    spawnPlane(forceGround: boolean = false): void {
        if (!this.scene.planeRoot) return;
        const cfg = this.scene.aircraftConfig;
        const spawnHdg = this.resolveSpawnHeadingDeg();
        const yawRad = (180 - spawnHdg) * Math.PI / 180;
        BABYLON.Quaternion.RotationAxisToRef(BABYLON.Vector3.Up(), yawRad, this.scene.planeRoot.rotationQuaternion!);
        this.scene.angularVelocity.set(0, 0, 0);
        this.scene._worldReady = false;
        this.scene._worldReadyStartMs = 0;
        this.scene.terrainY = GROUND_Y;
        this.scene._lastKnownSpawnTerrainY = TERRAIN_UNKNOWN_Y;
        this.scene.fuelRemaining = cfg.fuel_capacity_kg;
        this.scene.trimPitch = 0;
        this.scene.trimYaw = 0;
        this.scene.gearCompression = new Array(cfg.gear_positions.length).fill(0);
        this.scene.gearState = GEAR_STATE_DOWN;
        this.scene._gearTransitionStartMs = 0;
        this.scene._spawnSnapFramesLeft = SPAWN_SNAP_FRAMES;
        for (const g of this.scene._gearUpAnimGroups) g.stop();
        for (const g of this.scene._gearDownAnimGroups) g.stop();
        if (cfg.engine_type === ENGINE_TYPE_PISTON) {
            this.scene.mixtureLevel = 0.7;
            this.scene.magnetoSwitch = MAGNETO_BOTH;
        }
        const gearHeight = cfg.gear_positions.length > 0
            ? Math.abs(Math.min(...cfg.gear_positions.map((g: { y: number }) => g.y)))
            : 0;
        const useAirborne = this.scene.spawnAirborne && !forceGround;
        if (useAirborne) {
            const isAirborneMission = this.scene._pendingMissionAirborne === true;
            const minOffset = isAirborneMission ? AIRBORNE_MISSION_MIN_OFFSET_M : 100;
            const altOffset = Math.max(minOffset, cfg.spawn_alt_offset_m);
            this.scene.planeRoot.position.set(0, GROUND_Y + altOffset, 0);
            this.scene.thrust = cfg.spawn_airborne_thrust || 0.7;
            this.scene.flapIndex = cfg.default_flap_index_air;
            this.scene.currentFlapDeg = this.scene.FLAP_STEPS[this.scene.flapIndex] || 0;
            const rotMat = new BABYLON.Matrix();
            BABYLON.Matrix.FromQuaternionToRef(this.scene.planeRoot.rotationQuaternion!, rotMat);
            const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), rotMat);
            this.scene.velocity = fwd.scale(cfg.spawn_airborne_speed_ms || 80);
            if (isAirborneMission) {
                this.scene._spawnSnapFramesLeft = 0;
                if (this.scene._gearUpAnimGroups.length > 0) {
                    this.scene.gearState = GEAR_STATE_UP;
                    for (const g of this.scene._gearUpAnimGroups) g.start(false, 100.0, g.from, g.to);
                }
                this.scene._pendingAirborneGearRetract = false;
                const missionAlt = this.scene._pendingMissionAltM ?? 0;
                const gearLabel = this.scene._gearUpAnimGroups.length > 0 ? 'UP' : 'DOWN(fixed)';
                console.debug(`[FlightSimple] Airborne mission respawn: mission_alt=${missionAlt.toFixed(1)}m refAlt=${this.scene.refAlt.toFixed(1)}m posY=${this.scene.planeRoot.position.y.toFixed(1)}m altOffset=${altOffset.toFixed(1)}m snapDisabled gear=${gearLabel} terrainY=${this.scene.terrainY.toFixed(1)}m`);
            }
        } else {
            this.scene.planeRoot.position.set(0, GROUND_Y + gearHeight, 0);
            this.scene.velocity.set(0, 0, 0);
            this.scene.thrust = 0;
            this.scene.flapIndex = cfg.default_flap_index_ground;
            this.scene.currentFlapDeg = this.scene.FLAP_STEPS[this.scene.flapIndex] || 15;
        }

        this.scene._inputSystem.applyMissionStartThrottle();
    }
}
