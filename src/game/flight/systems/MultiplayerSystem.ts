import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import type { RemotePlayer } from '../types/index.js';
import { DEFAULT_AIRCRAFT_CONFIG } from '../types/index.js';
import { fetchAircraftConfig } from '../api/AircraftConfigApi.js';
import { MultiplayerClient, PlayerState } from '../../MultiplayerClient.js';
import { EngineSound, ENGINE_SOUND_TYPE_TURBOFAN } from '../../EngineSound.js';
import { AudioCore } from '../../AudioCore.js';
import { CONTRAIL_EMIT_LERP_RATE, CONTRAIL_EMIT_RATE_MAX } from '../constants/index.js';

const REMOTE_MODEL_LOAD_TIMEOUT_MS = 12000;
const failedRemoteModelUrls = new Set<string>();

const LABEL_TEX_W = 256;
const LABEL_TEX_H = 80;
const LABEL_AVATAR_SIZE = 48;
const LABEL_PLANE_WIDTH = 18;
const LABEL_PLANE_HEIGHT = 5.6;
const LABEL_Y_OFFSET = 10;
const REMOTE_AIRSPEED_KMH_TO_MS = 1 / 3.6;
const REMOTE_CONTRAIL_FALLBACK_HALF_SPAN = 8;
const REMOTE_RIBBON_FAR_DIST_M = 8000;
const REMOTE_RIBBON_FAR_UPDATE_INTERVAL_S = 0.2;

export class MultiplayerSystem {
    private readonly scene: any;
    private _lastUpdateMs: number = 0;
    private readonly _tmpYawQ = new BABYLON.Quaternion();
    private readonly _tmpPitchQ = new BABYLON.Quaternion();
    private readonly _tmpRollQ = new BABYLON.Quaternion();
    private readonly _tmpTargetQ = new BABYLON.Quaternion();
    private readonly _axisUp = BABYLON.Vector3.Up();
    private readonly _axisRight = BABYLON.Vector3.Right();
    private readonly _axisForward = BABYLON.Vector3.Forward();

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    initMultiplayer(token: string, onAuthFailure?: () => void, onNoFlightHours?: () => void): void {
        this.scene.mpClient?.dispose();
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
                    remote.animationGroups.forEach((g: BABYLON.AnimationGroup) => { try { g.dispose(); } catch (_) { /* ignore */ } });
                    remote.animationGroups = [];
                    remote.skeletons.forEach((s: BABYLON.Skeleton) => { try { s.dispose(); } catch (_) { /* ignore */ } });
                    remote.skeletons = [];
                    remote.meshes.forEach((m: BABYLON.AbstractMesh) => m.dispose());
                    remote.meshes = [];
                    const pivot = remote.root.getChildTransformNodes(true).find((n: BABYLON.TransformNode) => n.name.startsWith('remotePivot_'));
                    if (pivot) pivot.dispose();
                    this.disposeRemoteContrails(remote);
                    remote.modelPivot = null;
                    remote.modelOriginalSize = 0;
                    remote.modelOriginalHalfWidth = 0;
                    remote.aircraftConfigCached = null;
                    remote.engineTypeResolved = false;
                    remote.pendingConfigApply = false;
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
                    this.disposeRemotePlayer(remote);
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
            this._setConnectionIndicator(connected);
            if (!connected) {
                try {
                    for (const [id, remote] of this.scene.remotePlayers) {
                        try { this.disposeRemotePlayer(remote); } catch (_) { /* ignore */ }
                        this.scene.remotePlayers.delete(id);
                    }
                    console.debug('[MP] Cleared remote players on disconnect');
                } catch (err) {
                    console.warn('[MP] Disconnect cleanup failed:', err);
                }
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

        this.scene.mpClient.onAchievementsUnlocked((achievements: any[]) => {
            try {
                this.scene._hudSystem?.showAchievementToast(achievements);
            } catch (err) {
                console.warn('[Achievements] Toast display failed:', err);
            }
        });

        this.scene.mpClient.onDailyBonus((msg: any) => {
            try {
                const items: { title: string }[] = [];
                if (Number(msg?.streakPoints) > 0) {
                    items.push({ title: `Streak de ${Number(msg.streakDays)} dia(s): +${Number(msg.streakPoints)} pts` });
                }
                if (Number(msg?.dailyMissionPoints) > 0) {
                    items.push({ title: `Missão do dia: +${Number(msg.dailyMissionPoints)} pts` });
                }
                if (items.length) {
                    this.scene._hudSystem?.showAchievementToast(items, 'BÔNUS DIÁRIO');
                }
            } catch (err) {
                console.warn('[Daily] Bonus toast display failed:', err);
            }
        });

        if (this.scene.dbgMpUserId) this.scene.dbgMpUserId.textContent = '…';
        this.scene.mpClient.connect();
    }

    private _setConnectionIndicator(connected: boolean): void {
        try {
            let el = document.getElementById('mp-conn-indicator');
            if (connected) {
                if (el) el.style.display = 'none';
                return;
            }
            if (!el) {
                el = document.createElement('div');
                el.id = 'mp-conn-indicator';
                el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9998;background:rgba(40,20,0,.8);border:1px solid rgba(255,180,60,.5);color:#ffcc66;padding:4px 12px;border-radius:6px;font-family:Inter,sans-serif;font-size:11px;pointer-events:none;backdrop-filter:blur(6px)';
                el.textContent = 'Reconectando…';
                document.body.appendChild(el);
            }
            el.style.display = 'block';
        } catch (err) {
            console.warn('[MP] Connection indicator update failed:', err);
        }
    }

    createRemotePlayer(id: string, modelFile?: string): RemotePlayer {
        const scene = this.scene.scene;
        const root = new BABYLON.TransformNode(`remote_${id}`, scene);
        root.rotationQuaternion = BABYLON.Quaternion.Identity();

        const aircraftCode = modelFile || null;
        const remote: RemotePlayer = {
            root, meshes: [], animationGroups: [], skeletons: [], prevState: null, nextState: null, lastUpdateTime: 0,
            aircraftCode, labelPlane: null, labelTexture: null,
            currentUsername: null, currentAvatarUrl: null,
            engineSound: null, engineTypeResolved: false,
            contrailEmitterLeft: null, contrailEmitterRight: null,
            contrailPSLeft: null, contrailPSRight: null,
            contrailRibbonLeft: null, contrailRibbonRight: null,
            contrailHalfSpan: REMOTE_CONTRAIL_FALLBACK_HALF_SPAN,
            ribbonDtAccum: 0,
            modelPivot: null, modelOriginalSize: 0, modelOriginalHalfWidth: 0,
            aircraftConfigCached: null, pendingConfigApply: false,
            modelLoadToken: 0,
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
        const remoteId = remote.root.name.replace(/^remote_/, '');
        fetchAircraftConfig(aircraftId).then((cfg) => {
            remote.aircraftConfigCached = cfg;
            try {
                remote.engineSound?.setEngineType(this.scene._mapEngineType(cfg.engine_type));
            } catch (err) {
                console.warn('[Remote] setEngineType failed:', err);
            }
            try {
                if (remote.modelPivot && !remote.modelPivot.isDisposed()) {
                    this.applyRemoteAircraftConfig(remote, remoteId);
                } else {
                    remote.pendingConfigApply = true;
                }
            } catch (err) {
                console.warn('[Remote] applyRemoteAircraftConfig from resolve failed:', err);
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

        const myToken = ++remote.modelLoadToken;
        const tokenValid = () => remote.modelLoadToken === myToken
            && this.scene.remotePlayers.get(id) === remote
            && !root.isDisposed();

        if (failedRemoteModelUrls.has(modelFile)) {
            console.debug(`[Remote] Skipping known-broken model ${modelFile} for ${id}; using fallback`);
            this.buildRemoteFallback(id, root, remote);
            this.buildRemoteContrails(remote, REMOTE_CONTRAIL_FALLBACK_HALF_SPAN, id);
            return;
        }

        let settled = false;
        const watchdog = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            if (!tokenValid()) return;
            if (remote.modelPivot && !remote.modelPivot.isDisposed()) return;
            console.warn(`[Remote] Model load watchdog fired for ${id} (${modelFile}); using fallback`);
            this.buildRemoteFallback(id, root, remote);
            this.buildRemoteContrails(remote, REMOTE_CONTRAIL_FALLBACK_HALF_SPAN, id);
        }, REMOTE_MODEL_LOAD_TIMEOUT_MS);

        BABYLON.SceneLoader.ImportMesh(
            '', folder, file, scene,
            (meshes: BABYLON.AbstractMesh[], _particleSystems: BABYLON.IParticleSystem[], skeletons: BABYLON.Skeleton[], animationGroups: BABYLON.AnimationGroup[]) => {
                const watchdogAlreadyFired = settled;
                settled = true;
                try { window.clearTimeout(watchdog); } catch (_) { /* ignore */ }
                if (!meshes.length) return;
                const stillActive = tokenValid();
                if (!stillActive) {
                    console.debug(`[Remote] Discarding GLB for ${id}: entity no longer active or superseded`);
                    try { meshes.forEach((m) => m.dispose()); } catch (_) { /* ignore */ }
                    try { animationGroups.forEach((g) => g.dispose()); } catch (_) { /* ignore */ }
                    try { skeletons.forEach((s) => s.dispose()); } catch (_) { /* ignore */ }
                    return;
                }
                if (watchdogAlreadyFired && remote.meshes.length) {
                    console.debug(`[Remote] GLB arrived after watchdog fallback for ${id}; replacing fallback meshes`);
                }
                try {
                    remote.meshes.forEach((m) => { try { m.material?.dispose(); } catch (_) { /* ignore */ } try { m.dispose(); } catch (_) { /* ignore */ } });
                    remote.meshes = [];
                } catch (_) { /* ignore */ }
                try {
                    animationGroups.forEach((g) => remote.animationGroups.push(g));
                    skeletons.forEach((s) => remote.skeletons.push(s));
                } catch (_) { /* ignore */ }
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

                const cfg = remote.aircraftConfigCached;
                const targetSize = (cfg && Number.isFinite(cfg.model_target_size) && cfg.model_target_size > 0)
                    ? cfg.model_target_size
                    : 40;
                const rotationY = (cfg && Number.isFinite(cfg.model_rotation_y))
                    ? cfg.model_rotation_y
                    : Math.PI;
                const scaleFactor = targetSize / Math.max(size, 0.1);
                pivot.scaling.setAll(scaleFactor);
                pivot.rotation = new BABYLON.Vector3(0, rotationY, 0);

                meshes.forEach((m) => {
                    m.isPickable = false;
                    remote.meshes.push(m as BABYLON.Mesh);
                });

                remote.modelPivot = pivot;
                remote.modelOriginalSize = size;
                const sizeVec = bb.max.subtract(bb.min);
                remote.modelOriginalHalfWidth = sizeVec.x / 2;
                const halfSpan = Math.max(REMOTE_CONTRAIL_FALLBACK_HALF_SPAN, remote.modelOriginalHalfWidth * scaleFactor);
                this.buildRemoteContrails(remote, halfSpan, id);

                if (remote.pendingConfigApply && remote.aircraftConfigCached) {
                    this.applyRemoteAircraftConfig(remote, id);
                }
            },
            null,
            (_scene: BABYLON.Scene, _message?: string, _exception?: any) => {
                if (settled) return;
                settled = true;
                try { window.clearTimeout(watchdog); } catch (_) { /* ignore */ }
                failedRemoteModelUrls.add(modelFile);
                const stillActive = tokenValid();
                if (!stillActive) {
                    console.debug(`[Remote] Skipping fallback for ${id}: entity no longer active or superseded`);
                    return;
                }
                console.warn(`[Remote] Model load failed for ${id} (${modelFile}); using fallback:`, _message || _exception);
                this.buildRemoteFallback(id, root, remote);
                this.buildRemoteContrails(remote, REMOTE_CONTRAIL_FALLBACK_HALF_SPAN, id);
            },
        );
    }

    /** Apply cached aircraft config (scale + rotation) to the already-loaded remote model pivot and rebuild contrails. */
    applyRemoteAircraftConfig(remote: RemotePlayer, idTag: string): void {
        const cfg = remote.aircraftConfigCached;
        const pivot = remote.modelPivot;
        if (!cfg || !pivot || pivot.isDisposed() || !(remote.modelOriginalSize > 0)) {
            remote.pendingConfigApply = !!cfg;
            return;
        }
        try {
            const targetSize = Number.isFinite(cfg.model_target_size) && cfg.model_target_size > 0
                ? cfg.model_target_size
                : 40;
            const rotationY = Number.isFinite(cfg.model_rotation_y) ? cfg.model_rotation_y : Math.PI;
            const scaleFactor = targetSize / Math.max(remote.modelOriginalSize, 0.1);
            pivot.scaling.setAll(scaleFactor);
            pivot.rotation = new BABYLON.Vector3(0, rotationY, 0);

            const halfSpan = Math.max(REMOTE_CONTRAIL_FALLBACK_HALF_SPAN, remote.modelOriginalHalfWidth * scaleFactor);
            this.buildRemoteContrails(remote, halfSpan, idTag);

            remote.pendingConfigApply = false;
            console.debug(`[Remote] Applied aircraft config for ${idTag}: code=${cfg.code} targetSize=${targetSize.toFixed(1)} rotY=${rotationY.toFixed(3)} scale=${scaleFactor.toFixed(3)}`);
        } catch (err) {
            console.warn(`[Remote] applyRemoteAircraftConfig failed for ${idTag}:`, err);
        }
    }

    buildRemoteContrails(remote: RemotePlayer, halfSpan: number, idTag: string): void {
        this.disposeRemoteContrails(remote);
        try {
            const safeHalf = Number.isFinite(halfSpan) && halfSpan > 0 ? halfSpan : REMOTE_CONTRAIL_FALLBACK_HALF_SPAN;
            remote.contrailHalfSpan = safeHalf;
            const pair = this.scene._vfxSystem?.buildContrailPair?.(this.scene.scene, remote.root, safeHalf, `remote_${idTag}`);
            if (!pair) return;
            remote.contrailEmitterLeft  = pair.emL;
            remote.contrailEmitterRight = pair.emR;
            remote.contrailPSLeft  = pair.psL ?? null;
            remote.contrailPSRight = pair.psR ?? null;
            remote.contrailRibbonLeft  = pair.ribL ?? null;
            remote.contrailRibbonRight = pair.ribR ?? null;
        } catch (err) {
            console.warn(`[Remote] buildRemoteContrails failed for ${idTag}:`, err);
        }
    }

    rebuildAllRemoteContrails(): void {
        for (const [id, remote] of this.scene.remotePlayers) {
            const halfSpan = Number.isFinite(remote.contrailHalfSpan) && remote.contrailHalfSpan > 0
                ? remote.contrailHalfSpan
                : REMOTE_CONTRAIL_FALLBACK_HALF_SPAN;
            this.buildRemoteContrails(remote, halfSpan, id);
        }
    }

    disposeRemoteContrails(remote: RemotePlayer): void {
        try { remote.contrailPSLeft?.dispose(); } catch (_) { /* ignore */ }
        try { remote.contrailPSRight?.dispose(); } catch (_) { /* ignore */ }
        try {
            this.scene._vfxSystem?.disposeRibbonPair?.(remote.contrailRibbonLeft, remote.contrailRibbonRight);
        } catch (_) { /* ignore */ }
        try { remote.contrailEmitterLeft?.dispose(); } catch (_) { /* ignore */ }
        try { remote.contrailEmitterRight?.dispose(); } catch (_) { /* ignore */ }
        remote.contrailPSLeft = null;
        remote.contrailPSRight = null;
        remote.contrailRibbonLeft = null;
        remote.contrailRibbonRight = null;
        remote.contrailEmitterLeft = null;
        remote.contrailEmitterRight = null;
    }

    disposeRemotePlayer(remote: RemotePlayer): void {
        this.disposeRemoteContrails(remote);
        try { remote.labelTexture?.dispose(); } catch (_) { /* ignore */ }
        try { remote.labelPlane?.material?.dispose(); } catch (_) { /* ignore */ }
        try { remote.labelPlane?.dispose(); } catch (_) { /* ignore */ }
        try {
            remote.animationGroups.forEach((g: BABYLON.AnimationGroup) => { try { g.dispose(); } catch (_) { /* ignore */ } });
            remote.animationGroups = [];
        } catch (_) { /* ignore */ }
        try {
            remote.skeletons.forEach((s: BABYLON.Skeleton) => { try { s.dispose(); } catch (_) { /* ignore */ } });
            remote.skeletons = [];
        } catch (_) { /* ignore */ }
        try {
            remote.meshes.forEach((m: BABYLON.AbstractMesh) => {
                try { m.material?.dispose(); } catch (_) { /* ignore */ }
                m.dispose();
            });
        } catch (_) { /* ignore */ }
        try { remote.root.dispose(); } catch (_) { /* ignore */ }
        try { remote.engineSound?.dispose(); } catch (_) { /* ignore */ }
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
        const dt = this._lastUpdateMs > 0 ? Math.max(0, Math.min(0.25, (now - this._lastUpdateMs) / 1000)) : 0;
        this._lastUpdateMs = now;

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
                BABYLON.Vector3.LerpToRef(prevPos, targetPos, t, remote.root.position);
            } else {
                remote.root.position.copyFrom(targetPos);
            }

            const yawRad = (180 - ns.heading) * Math.PI / 180;
            const pitchRad = -ns.pitch * Math.PI / 180;
            const rollRad = ns.roll * Math.PI / 180;

            BABYLON.Quaternion.RotationAxisToRef(this._axisUp, yawRad, this._tmpYawQ);
            BABYLON.Quaternion.RotationAxisToRef(this._axisRight, pitchRad, this._tmpPitchQ);
            BABYLON.Quaternion.RotationAxisToRef(this._axisForward, rollRad, this._tmpRollQ);
            this._tmpYawQ.multiplyToRef(this._tmpPitchQ, this._tmpTargetQ);
            this._tmpTargetQ.multiplyToRef(this._tmpRollQ, this._tmpTargetQ);

            BABYLON.Quaternion.SlerpToRef(
                remote.root.rotationQuaternion!,
                this._tmpTargetQ,
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

            try {
                const vfx = this.scene._vfxSystem;
                if (vfx) {
                    const altM = Number.isFinite(ns.alt) ? Math.max(0, ns.alt) : 0;
                    const tempC = vfx.isaTempC(altM);
                    const speedMs = Number.isFinite(ns.airspeed) ? ns.airspeed * REMOTE_AIRSPEED_KMH_TO_MS : 0;
                    const throttle = Number.isFinite(ns.throttle) ? Math.max(0, Math.min(1.5, ns.throttle)) : 0;
                    const targetRate = ns.onGround ? 0 : vfx.computeContrailEmitRate(altM, tempC, speedMs, throttle);

                    if (remote.contrailPSLeft && remote.contrailPSRight) {
                        const curL = remote.contrailPSLeft.emitRate || 0;
                        const curR = remote.contrailPSRight.emitRate || 0;
                        remote.contrailPSLeft.emitRate  = curL + (targetRate - curL) * CONTRAIL_EMIT_LERP_RATE;
                        remote.contrailPSRight.emitRate = curR + (targetRate - curR) * CONTRAIL_EMIT_LERP_RATE;
                    }

                    if ((remote.contrailRibbonLeft || remote.contrailRibbonRight) && typeof vfx.updateRemoteRibbonPair === 'function') {
                        const intensity = targetRate > 0 ? Math.min(1, targetRate / Math.max(1, CONTRAIL_EMIT_RATE_MAX)) : 0;
                        remote.ribbonDtAccum = (remote.ribbonDtAccum || 0) + dt;
                        const camForRibbon = this.scene.camera;
                        const distToCamSq = camForRibbon
                            ? BABYLON.Vector3.DistanceSquared(remote.root.position, camForRibbon.position)
                            : 0;
                        const isFarRemote = distToCamSq > REMOTE_RIBBON_FAR_DIST_M * REMOTE_RIBBON_FAR_DIST_M;
                        if (!isFarRemote || remote.ribbonDtAccum >= REMOTE_RIBBON_FAR_UPDATE_INTERVAL_S) {
                            vfx.updateRemoteRibbonPair(remote.contrailRibbonLeft, remote.contrailRibbonRight, remote.ribbonDtAccum, intensity);
                            remote.ribbonDtAccum = 0;
                        }
                    }
                }
            } catch (_) { /* ignore */ }
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
