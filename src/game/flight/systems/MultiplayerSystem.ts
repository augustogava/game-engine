import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import type { RemotePlayer } from '../types/index.js';
import { DEFAULT_AIRCRAFT_CONFIG } from '../types/index.js';
import { fetchAircraftConfig } from '../api/AircraftConfigApi.js';
import { MultiplayerClient, PlayerState } from '../../MultiplayerClient.js';
import { EngineSound, ENGINE_SOUND_TYPE_TURBOFAN } from '../../EngineSound.js';
import { AudioCore } from '../../AudioCore.js';

const LABEL_TEX_W = 256;
const LABEL_TEX_H = 80;
const LABEL_AVATAR_SIZE = 48;
const LABEL_PLANE_WIDTH = 18;
const LABEL_PLANE_HEIGHT = 5.6;
const LABEL_Y_OFFSET = 10;

export class MultiplayerSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    initMultiplayer(token: string, onAuthFailure?: () => void, onNoFlightHours?: () => void): void {
        this.scene.mpClient = new MultiplayerClient(token);

        this.scene.mpClient.onPlayersUpdate((players: PlayerState[]) => {
            const now = performance.now();
            const activeIds = new Set<string>();

            for (const p of players) {
                activeIds.add(p.userId);
                let remote = this.scene.remotePlayers.get(p.userId);
                const remoteModelFile = p.aircraftModelFile || null;
                if (!remote) {
                    remote = this.createRemotePlayer(p.userId, remoteModelFile || undefined);
                    this.scene.remotePlayers.set(p.userId, remote);
                } else if (remoteModelFile && remote.aircraftCode !== remoteModelFile) {
                    remote.meshes.forEach((m: BABYLON.AbstractMesh) => m.dispose());
                    remote.meshes = [];
                    const pivot = remote.root.getChildTransformNodes(true).find((n: BABYLON.TransformNode) => n.name.startsWith('remotePivot_'));
                    if (pivot) pivot.dispose();
                    remote.aircraftCode = remoteModelFile;
                    this.loadRemoteModel(p.userId, remote.root, remote, remoteModelFile);
                }
                remote.prevState = remote.nextState;
                remote.nextState = p;
                remote.lastUpdateTime = now;
                this.updatePlayerLabel(remote, p);
                if (!remote.engineTypeResolved && p.aircraftId) {
                    this.resolveRemoteEngineType(remote, p.aircraftId);
                }
            }

            for (const [id, remote] of this.scene.remotePlayers) {
                if (!activeIds.has(id)) {
                    remote.labelTexture?.dispose();
                    remote.labelPlane?.dispose();
                    remote.meshes.forEach((m: BABYLON.AbstractMesh) => m.dispose());
                    remote.root.dispose();
                    try { remote.engineSound?.dispose(); } catch (_) { /* ignore */ }
                    this.scene.remotePlayers.delete(id);
                }
            }
        });

        this.scene.mpClient.onPlayerCountChange((count: number) => {
            if (this.scene.hudOnline) this.scene.hudOnline.textContent = `${count} ONLINE`;
            if (this.scene.dbgMpCount) this.scene.dbgMpCount.textContent = String(count);
            if (this.scene.dbgMpUserId && this.scene.mpClient) {
                this.scene.dbgMpUserId.textContent = String(this.scene.mpClient.userId);
            }
        });

        this.scene.mpClient.onConnectionChange((connected: boolean) => {
            if (this.scene.dbgMpStatus) {
                this.scene.dbgMpStatus.textContent = connected ? 'CONNECTED' : 'DISCONNECTED';
                this.scene.dbgMpStatus.style.color = connected ? '#40ffaa' : '#ff5555';
            }
        });

        if (onAuthFailure) this.scene.mpClient.onAuthFailure(onAuthFailure);
        if (onNoFlightHours) this.scene.mpClient.onNoFlightHours(onNoFlightHours);

        this.scene.mpClient.onFlightLogEnded((msg: any) => {
            if (!this.scene._activeFlightPlanId) return;
            if (msg.status === 'landed') {
                const arrivedAtDest = this.scene._activeFlightPlanArrivalAirportId != null
                    && msg.arrivalAirportId === this.scene._activeFlightPlanArrivalAirportId;
                this.scene._patchFlightPlanStatus(this.scene._activeFlightPlanId, arrivedAtDest ? 'completed' : 'cancelled');
            } else if (msg.status === 'crashed' || msg.status === 'cancelled') {
                this.scene._patchFlightPlanStatus(this.scene._activeFlightPlanId, 'cancelled');
            }
            this.scene._activeFlightPlanId = null;
            this.scene._activeFlightPlanArrivalAirportId = null;
        });

        if (this.scene.dbgMpUserId) this.scene.dbgMpUserId.textContent = '…';
        this.scene.mpClient.connect();
    }

    createRemotePlayer(id: string, modelFile?: string): RemotePlayer {
        const scene = this.scene.scene;
        const root = new BABYLON.TransformNode(`remote_${id}`, scene);
        root.rotationQuaternion = BABYLON.Quaternion.Identity();

        const aircraftCode = modelFile || null;
        const remote: RemotePlayer = {
            root, meshes: [], prevState: null, nextState: null, lastUpdateTime: 0,
            aircraftCode, labelPlane: null, labelTexture: null,
            currentUsername: null, currentAvatarUrl: null,
            engineSound: null, engineTypeResolved: false,
        };

        this.loadRemoteModel(id, root, remote, modelFile || DEFAULT_AIRCRAFT_CONFIG.model_file);

        try {
            const engineSound = new EngineSound({ engineType: ENGINE_SOUND_TYPE_TURBOFAN, positional: true });
            engineSound.start();
            engineSound.fadeIn(800);
            remote.engineSound = engineSound;
        } catch (err) {
            console.warn('[Remote] EngineSound init failed:', err);
        }

        return remote;
    }

    resolveRemoteEngineType(remote: RemotePlayer, aircraftId: number | undefined): void {
        if (remote.engineTypeResolved || !aircraftId || aircraftId <= 0) return;
        remote.engineTypeResolved = true;
        fetchAircraftConfig(aircraftId).then((cfg) => {
            try {
                remote.engineSound?.setEngineType(this.scene._mapEngineType(cfg.engine_type));
            } catch (err) {
                console.warn('[Remote] setEngineType failed:', err);
            }
        }).catch((err) => {
            console.warn('[Remote] fetch engine type failed:', err);
        });
    }

    loadRemoteModel(id: string, root: BABYLON.TransformNode, remote: RemotePlayer, modelFile: string): void {
        const scene = this.scene.scene;
        const lastSlash = modelFile.lastIndexOf('/');
        const folder = lastSlash >= 0 ? modelFile.substring(0, lastSlash + 1) : '';
        const file = lastSlash >= 0 ? modelFile.substring(lastSlash + 1) : modelFile;

        BABYLON.SceneLoader.ImportMesh(
            '', folder, file, scene,
            (meshes: BABYLON.AbstractMesh[]) => {
                if (!meshes.length) return;
                const glbRoot = meshes[0];
                const bb = glbRoot.getHierarchyBoundingVectors(true);
                const center = bb.min.add(bb.max).scale(0.5);
                const size = bb.max.subtract(bb.min).length();

                const pivot = new BABYLON.TransformNode(`remotePivot_${id}`, scene);
                pivot.parent = root;

                glbRoot.parent = pivot;
                const offset = center.negate();
                offset.y = -bb.min.y;
                glbRoot.position = offset;
                glbRoot.rotationQuaternion = null;
                glbRoot.rotation = BABYLON.Vector3.Zero();

                const targetSize = 40;
                const scaleFactor = targetSize / Math.max(size, 0.1);
                pivot.scaling.setAll(scaleFactor);
                pivot.rotation = new BABYLON.Vector3(0, Math.PI, 0);

                meshes.forEach((m) => {
                    m.isPickable = false;
                    remote.meshes.push(m as BABYLON.Mesh);
                });
            },
            null,
            () => {
                this.buildRemoteFallback(id, root, remote);
            },
        );
    }

    buildRemoteFallback(id: string, root: BABYLON.TransformNode, remote: RemotePlayer): void {
        const scene = this.scene.scene;
        const mat = new BABYLON.PBRMaterial(`remoteMat_${id}`, scene);
        mat.albedoColor = new BABYLON.Color3(1.0, 0.45, 0.15);
        mat.metallic = 0.6;
        mat.roughness = 0.3;

        const body = BABYLON.MeshBuilder.CreateBox(`rb_${id}`, { width: 2.2, height: 0.65, depth: 7 }, scene);
        const wing = BABYLON.MeshBuilder.CreateBox(`rw_${id}`, { width: 16, height: 0.22, depth: 2.5 }, scene);
        const tail = BABYLON.MeshBuilder.CreateBox(`rt_${id}`, { width: 6, height: 0.18, depth: 1.8 }, scene);
        tail.position.set(0, 0.4, -3.0);
        const finV = BABYLON.MeshBuilder.CreateBox(`rf_${id}`, { width: 0.18, height: 2.8, depth: 2.0 }, scene);
        finV.position.set(0, 1.4, -3.0);
        const nose = BABYLON.MeshBuilder.CreateCylinder(`rn_${id}`, {
            height: 2.5, diameterTop: 0, diameterBottom: 1.5, tessellation: 8,
        }, scene);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, 4.5);

        [body, wing, tail, finV, nose].forEach((m) => {
            m.material = mat;
            m.parent = root;
            m.isPickable = false;
            remote.meshes.push(m);
        });
    }

    createPlayerLabel(remote: RemotePlayer, username: string, avatarUrl: string | null): void {
        const scene = this.scene.scene;
        const texW = LABEL_TEX_W;
        const texH = LABEL_TEX_H;

        const tex = new BABYLON.DynamicTexture(`playerLabel_${remote.root.name}`, { width: texW, height: texH }, scene, false);
        tex.hasAlpha = true;

        const plane = BABYLON.MeshBuilder.CreatePlane(`playerLabelPlane_${remote.root.name}`, {
            width: LABEL_PLANE_WIDTH,
            height: LABEL_PLANE_HEIGHT,
        }, scene);
        plane.parent = remote.root;
        plane.position.y = LABEL_Y_OFFSET;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;

        const mat = new BABYLON.StandardMaterial(`playerLabelMat_${remote.root.name}`, scene);
        mat.diffuseTexture = tex;
        mat.useAlphaFromDiffuseTexture = true;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        plane.material = mat;

        remote.labelPlane = plane;
        remote.labelTexture = tex;
        remote.currentUsername = username;
        remote.currentAvatarUrl = avatarUrl ?? null;

        this.drawPlayerLabel(tex, username, null);

        if (avatarUrl) {
            this.loadAvatarAndRedraw(tex, username, avatarUrl);
        }
    }

    drawPlayerLabel(tex: BABYLON.DynamicTexture, username: string, avatarImg: HTMLImageElement | null): void {
        const texW = LABEL_TEX_W;
        const texH = LABEL_TEX_H;
        const avatarSz = LABEL_AVATAR_SIZE;
        const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

        ctx.clearRect(0, 0, texW, texH);

        const radius = 12;
        const pad = 6;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(0, 0, texW, texH, radius);
        } else {
            ctx.rect(0, 0, texW, texH);
        }
        ctx.fill();

        ctx.strokeStyle = 'rgba(64, 255, 170, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(0, 0, texW, texH, radius);
        } else {
            ctx.rect(0, 0, texW, texH);
        }
        ctx.stroke();

        const cx = pad + avatarSz / 2;
        const cy = texH / 2;
        const r = avatarSz / 2 - 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        if (avatarImg) {
            ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
        } else {
            ctx.fillStyle = '#2a6e4e';
            ctx.fill();
            const initials = username.substring(0, 2).toUpperCase();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(initials, cx, cy + 1);
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(64, 255, 170, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        const textX = pad + avatarSz + 8;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const maxTextW = texW - textX - pad;
        ctx.fillText(username, textX, cy, maxTextW);

        tex.update();
    }

    loadAvatarAndRedraw(tex: BABYLON.DynamicTexture, username: string, avatarUrl: string): void {
        const img = new Image();
        img.onload = () => this.drawPlayerLabel(tex, username, img);
        img.onerror = () => this.drawPlayerLabel(tex, username, null);
        img.src = avatarUrl;
    }

    updatePlayerLabel(remote: RemotePlayer, state: PlayerState): void {
        const username = state.username || `Pilot ${state.userId.slice(-4)}`;
        if (!username) return;

        const avatarUrl = state.avatarUrl ?? null;
        const nameChanged = remote.currentUsername !== username;
        const avatarChanged = remote.currentAvatarUrl !== avatarUrl;

        if (!remote.labelPlane) {
            this.createPlayerLabel(remote, username, avatarUrl);
            return;
        }

        if (!nameChanged && !avatarChanged) return;

        remote.currentUsername = username;
        remote.currentAvatarUrl = avatarUrl;

        if (avatarUrl) {
            this.loadAvatarAndRedraw(remote.labelTexture!, username, avatarUrl);
        } else {
            this.drawPlayerLabel(remote.labelTexture!, username, null);
        }
    }

    updateRemotePlayers(): void {
        const now = performance.now();

        try {
            if (this.scene.camera) {
                const camPos = this.scene.camera.position;
                AudioCore.setListenerPosition(camPos.x, camPos.y, camPos.z);
                const target = this.scene.camera.getTarget();
                const fx = target.x - camPos.x;
                const fy = target.y - camPos.y;
                const fz = target.z - camPos.z;
                const fLen = Math.max(1e-6, Math.sqrt(fx * fx + fy * fy + fz * fz));
                AudioCore.setListenerOrientation(fx / fLen, fy / fLen, fz / fLen, 0, 1, 0);
            }
        } catch (_) { /* ignore */ }

        for (const [, remote] of this.scene.remotePlayers) {
            if (!remote.nextState) continue;

            const ns = remote.nextState;
            const targetPos = this.scene._latLonToLocal(ns.lat, ns.lon, ns.alt);

            if (remote.prevState) {
                const elapsed = now - remote.lastUpdateTime;
                const t = Math.min(1, elapsed / 60);
                const ps = remote.prevState;
                const prevPos = this.scene._latLonToLocal(ps.lat, ps.lon, ps.alt);
                remote.root.position = BABYLON.Vector3.Lerp(prevPos, targetPos, t);
            } else {
                remote.root.position.copyFrom(targetPos);
            }

            const yawRad = (180 - ns.heading) * Math.PI / 180;
            const pitchRad = -ns.pitch * Math.PI / 180;
            const rollRad = ns.roll * Math.PI / 180;

            const yawQ = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), yawRad);
            const pitchQ = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Right(), pitchRad);
            const rollQ = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Forward(), rollRad);
            const targetQ = yawQ.multiply(pitchQ).multiply(rollQ);

            BABYLON.Quaternion.SlerpToRef(
                remote.root.rotationQuaternion!,
                targetQ,
                0.15,
                remote.root.rotationQuaternion!,
            );

            const es = remote.engineSound;
            if (es) {
                try {
                    const pos = remote.root.position;
                    es.setPosition(pos.x, pos.y, pos.z);
                    const tt = Number.isFinite(ns.throttle) ? Math.max(0, Math.min(1.5, ns.throttle)) : 0;
                    es.setThrottle(tt);
                    const estimatedRpm = 600 + tt * 2000;
                    es.setRpm(estimatedRpm);
                    es.update();
                } catch (_) { /* ignore */ }
            }
        }
    }

    sendOwnState(): void {
        if (!this.scene.mpClient || !this.scene.spawned) return;
        const { lat, lon, hdg } = this.scene._getCurrentLatLon();
        const pos = this.scene.planeRoot.position;

        const wm = this.scene.planeRoot.getWorldMatrix();
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), wm, this.scene._tmpFwd);
        this.scene._tmpFwd.normalize();
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(1, 0, 0), wm, this.scene._tmpRight);
        this.scene._tmpRight.normalize();
        this.scene._tmpUp.set(0, 1, 0);
        const pitchDeg = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(this.scene._tmpFwd, this.scene._tmpUp)))) * 180 / Math.PI;
        const rollDeg = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(this.scene._tmpRight, this.scene._tmpUp)))) * 180 / Math.PI;

        const aircraftIdToSend = this.scene.aircraftConfig.id && this.scene.aircraftConfig.id > 0
            ? this.scene.aircraftConfig.id
            : undefined;

        if (aircraftIdToSend !== this.scene._lastSentAircraftId) {
            if (aircraftIdToSend) {
                console.log(`[Flight] sendUpdate now sending aircraftId=${aircraftIdToSend} code=${this.scene.aircraftConfig.code} -- flight log persistence ENABLED`);
            } else {
                console.warn(`[Flight] sendUpdate sending aircraftId=undefined (aircraftConfig.id=${this.scene.aircraftConfig.id}) -- flight log persistence DISABLED on server`);
            }
            this.scene._lastSentAircraftId = aircraftIdToSend;
        }

        this.scene.mpClient.sendUpdate({
            lat, lon,
            alt: this.scene.refAlt + pos.y,
            airspeed: this.scene.velocity.length() * 3.6,
            throttle: this.scene.thrust,
            heading: hdg,
            pitch: pitchDeg,
            roll: rollDeg,
            onGround: this.scene.isOnGround,
            aircraftId: aircraftIdToSend,
            aircraftCode: this.scene.aircraftConfig.code || undefined,
            aircraftModelFile: this.scene.aircraftConfig.model_file || undefined,
            flightPlanId: this.scene._activeFlightPlanId ?? undefined,
            missionId: this.scene._activeMissionId ?? undefined,
        });

        this.scene._checkWaypointProgress(lat, lon);
    }
}
