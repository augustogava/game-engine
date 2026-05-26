import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import type { LiveTrafficFlight } from '../types/LiveTrafficFlight.js';
import { fetchLiveTrafficPositions, LiveTrafficBounds } from '../api/LiveTrafficApi.js';
import {
    LIVE_TRAFFIC_INITIAL_DELAY_MS,
    LIVE_TRAFFIC_POLL_INTERVAL_MS,
    LIVE_TRAFFIC_RANGE_DEG,
    LIVE_TRAFFIC_LIMIT,
    LIVE_TRAFFIC_CATEGORIES,
    LIVE_TRAFFIC_STALE_MS,
    LIVE_TRAFFIC_LABEL_Y_OFFSET,
    LIVE_TRAFFIC_BLEND_DURATION_MS,
    LIVE_TRAFFIC_KTS_TO_MS,
    LIVE_TRAFFIC_FPM_TO_FPS,
    LIVE_TRAFFIC_LABEL_TEX_W,
    LIVE_TRAFFIC_LABEL_TEX_H,
    LIVE_TRAFFIC_LABEL_PLANE_WIDTH,
    LIVE_TRAFFIC_LABEL_PLANE_HEIGHT,
    LIVE_TRAFFIC_MODEL_PATH,
    LIVE_TRAFFIC_MODEL_TARGET_SIZE_M,
    LIVE_TRAFFIC_MODEL_ROTATION_Y,
    FT_TO_M,
    METERS_PER_DEG_LAT,
} from '../constants/index.js';

interface LiveTrafficEntity {
    fr24Id: string;
    callsign: string;
    root: BABYLON.TransformNode;
    meshes: BABYLON.AbstractMesh[];
    bodyMaterial: BABYLON.PBRMaterial | null;
    modelPivot: BABYLON.TransformNode | null;
    animationGroups: BABYLON.AnimationGroup[];
    usesFallback: boolean;
    labelPlane: BABYLON.Mesh | null;
    labelTexture: BABYLON.DynamicTexture | null;
    labelMaterial: BABYLON.StandardMaterial | null;
    baseLat: number;
    baseLon: number;
    baseAltFt: number;
    baseTimeMs: number;
    trackDeg: number;
    gspeedKts: number;
    vspeedFpm: number;
    lastSeenMs: number;
    blendActive: boolean;
    blendStartMs: number;
    blendFromLat: number;
    blendFromLon: number;
    blendFromAltFt: number;
    currentLat: number;
    currentLon: number;
    currentAltFt: number;
}

export interface LiveTrafficMinimapEntry {
    fr24Id: string;
    callsign: string;
    lat: number;
    lon: number;
    trackDeg: number;
    altFt: number;
}

export class LiveTrafficSystem {
    private readonly scene: any;
    private readonly entities = new Map<string, LiveTrafficEntity>();
    private _lastFetchMs = 0;
    private _firstFetchDone = false;
    private _fetchInFlight = false;
    private _initStartMs = 0;
    private _disposed = false;
    private _trafficAssetContainer: BABYLON.AssetContainer | null = null;
    private _trafficModelLoading = false;
    private _trafficModelFailed = false;
    private _trafficModelScale = 1;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    update(_dt: number): void {
        if (this._disposed) return;
        if (!this.scene.spawned) return;
        if (!this._trafficAssetContainer && !this._trafficModelLoading && !this._trafficModelFailed) {
            this._ensureModelTemplate();
        }
        const now = performance.now();
        if (this._initStartMs === 0) this._initStartMs = now;

        if (!this._fetchInFlight) {
            if (!this._firstFetchDone) {
                if (now - this._initStartMs >= LIVE_TRAFFIC_INITIAL_DELAY_MS) {
                    this._triggerFetch(now);
                }
            } else if (now - this._lastFetchMs >= LIVE_TRAFFIC_POLL_INTERVAL_MS) {
                this._triggerFetch(now);
            }
        }

        for (const [, entity] of this.entities) {
            this._updateEntity(entity, now);
        }

        for (const [id, entity] of this.entities) {
            if (now - entity.lastSeenMs > LIVE_TRAFFIC_STALE_MS) {
                this._disposeEntity(entity);
                this.entities.delete(id);
            }
        }
    }

    getTrafficEntries(): LiveTrafficMinimapEntry[] {
        const list: LiveTrafficMinimapEntry[] = [];
        for (const [, entity] of this.entities) {
            list.push({
                fr24Id: entity.fr24Id,
                callsign: entity.callsign,
                lat: entity.currentLat,
                lon: entity.currentLon,
                trackDeg: entity.trackDeg,
                altFt: entity.currentAltFt,
            });
        }
        return list;
    }

    dispose(): void {
        this._disposed = true;
        for (const [, entity] of this.entities) {
            this._disposeEntity(entity);
        }
        this.entities.clear();
        if (this._trafficAssetContainer) {
            try { this._trafficAssetContainer.dispose(); } catch (err) { console.warn('[LiveTraffic] Failed to dispose model asset container:', err); }
            this._trafficAssetContainer = null;
        }
    }

    private _triggerFetch(now: number): void {
        let lat: number;
        let lon: number;
        try {
            const cur = this.scene._getCurrentLatLon();
            lat = cur.lat;
            lon = cur.lon;
        } catch (err) {
            console.warn('[LiveTraffic] _getCurrentLatLon failed; skipping fetch', err);
            return;
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const bounds: LiveTrafficBounds = {
            north: Math.min(90, lat + LIVE_TRAFFIC_RANGE_DEG),
            south: Math.max(-90, lat - LIVE_TRAFFIC_RANGE_DEG),
            west:  Math.max(-180, lon - LIVE_TRAFFIC_RANGE_DEG),
            east:  Math.min(180, lon + LIVE_TRAFFIC_RANGE_DEG),
        };

        this._fetchInFlight = true;
        this._lastFetchMs = now;
        fetchLiveTrafficPositions(bounds, {
            categories: LIVE_TRAFFIC_CATEGORIES,
            limit: LIVE_TRAFFIC_LIMIT,
        }).then((flights) => {
            if (this._disposed) return;
            this._onFetchResult(flights);
        }).catch((err) => {
            console.warn('[LiveTraffic] fetch error:', err);
        }).finally(() => {
            this._fetchInFlight = false;
            this._firstFetchDone = true;
        });
    }

    private _onFetchResult(flights: LiveTrafficFlight[]): void {
        const now = performance.now();
        for (const flight of flights) {
            if (!flight.fr24_id) continue;
            const existing = this.entities.get(flight.fr24_id);
            if (existing) {
                this._refreshEntity(existing, flight, now);
            } else {
                const created = this._createEntity(flight, now);
                if (created) this.entities.set(flight.fr24_id, created);
            }
        }
        console.debug(`[LiveTraffic] Active entities: ${this.entities.size}`);
    }

    private _refreshEntity(entity: LiveTrafficEntity, flight: LiveTrafficFlight, now: number): void {
        entity.blendFromLat = entity.currentLat;
        entity.blendFromLon = entity.currentLon;
        entity.blendFromAltFt = entity.currentAltFt;
        entity.blendActive = true;
        entity.blendStartMs = now;

        entity.baseLat = flight.lat;
        entity.baseLon = flight.lon;
        entity.baseAltFt = flight.alt;
        entity.baseTimeMs = now;
        entity.trackDeg = flight.track;
        entity.gspeedKts = flight.gspeed;
        entity.vspeedFpm = flight.vspeed;
        entity.lastSeenMs = now;

        if (flight.callsign && flight.callsign !== entity.callsign) {
            entity.callsign = flight.callsign;
            if (entity.labelTexture) {
                this._drawTrafficLabel(entity.labelTexture, entity.callsign);
            }
        }
    }

    private _createEntity(flight: LiveTrafficFlight, now: number): LiveTrafficEntity | null {
        const sceneRef = this.scene.scene;
        if (!sceneRef) return null;
        const root = new BABYLON.TransformNode(`liveTraffic_${flight.fr24_id}`, sceneRef);
        root.rotationQuaternion = BABYLON.Quaternion.Identity();

        const entity: LiveTrafficEntity = {
            fr24Id: flight.fr24_id,
            callsign: flight.callsign || flight.fr24_id,
            root,
            meshes: [],
            bodyMaterial: null,
            modelPivot: null,
            animationGroups: [],
            usesFallback: false,
            labelPlane: null,
            labelTexture: null,
            labelMaterial: null,
            baseLat: flight.lat,
            baseLon: flight.lon,
            baseAltFt: flight.alt,
            baseTimeMs: now,
            trackDeg: flight.track,
            gspeedKts: flight.gspeed,
            vspeedFpm: flight.vspeed,
            lastSeenMs: now,
            blendActive: false,
            blendStartMs: 0,
            blendFromLat: flight.lat,
            blendFromLon: flight.lon,
            blendFromAltFt: flight.alt,
            currentLat: flight.lat,
            currentLon: flight.lon,
            currentAltFt: flight.alt,
        };

        try {
            let modelBuilt = false;
            if (this._trafficAssetContainer) {
                modelBuilt = this._buildTrafficModelFromTemplate(entity);
            } else if (!this._trafficModelFailed) {
                this._ensureModelTemplate();
            }
            if (!modelBuilt) {
                this._buildTrafficFallback(entity);
            }
            this._createTrafficLabel(entity);
        } catch (err) {
            console.warn(`[LiveTraffic] Failed to build mesh for ${flight.fr24_id}:`, err);
        }

        this._updateEntity(entity, now);
        return entity;
    }

    private _buildTrafficFallback(entity: LiveTrafficEntity): void {
        const sceneRef = this.scene.scene;
        const id = entity.fr24Id;
        const mat = new BABYLON.PBRMaterial(`liveTrafficMat_${id}`, sceneRef);
        mat.albedoColor = new BABYLON.Color3(0.92, 0.92, 0.95);
        mat.metallic = 0.55;
        mat.roughness = 0.4;
        entity.bodyMaterial = mat;
        entity.usesFallback = true;

        const body = BABYLON.MeshBuilder.CreateBox(`ltb_${id}`, { width: 2.6, height: 0.75, depth: 9 }, sceneRef);
        const wing = BABYLON.MeshBuilder.CreateBox(`ltw_${id}`, { width: 20, height: 0.25, depth: 3 }, sceneRef);
        const tail = BABYLON.MeshBuilder.CreateBox(`ltt_${id}`, { width: 7, height: 0.2, depth: 2 }, sceneRef);
        tail.position.set(0, 0.5, -3.6);
        const finV = BABYLON.MeshBuilder.CreateBox(`ltf_${id}`, { width: 0.2, height: 3.0, depth: 2.2 }, sceneRef);
        finV.position.set(0, 1.6, -3.6);
        const nose = BABYLON.MeshBuilder.CreateCylinder(`ltn_${id}`, {
            height: 3.0, diameterTop: 0, diameterBottom: 1.8, tessellation: 8,
        }, sceneRef);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, 5.4);

        for (const m of [body, wing, tail, finV, nose]) {
            m.material = mat;
            m.parent = entity.root;
            m.isPickable = false;
            entity.meshes.push(m);
        }
    }

    private _ensureModelTemplate(): void {
        if (this._trafficAssetContainer || this._trafficModelLoading || this._trafficModelFailed) return;
        const sceneRef = this.scene.scene;
        if (!sceneRef) return;
        this._trafficModelLoading = true;
        const path = LIVE_TRAFFIC_MODEL_PATH;
        const lastSlash = path.lastIndexOf('/');
        const folder = lastSlash >= 0 ? path.substring(0, lastSlash + 1) : '';
        const file = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
        console.log(`[LiveTraffic] Loading model template: ${path}`);
        BABYLON.SceneLoader.LoadAssetContainerAsync(folder, file, sceneRef).then((container) => {
            this._trafficModelLoading = false;
            if (this._disposed) {
                try { container.dispose(); } catch (_) { /* ignore */ }
                return;
            }
            let minWorld: BABYLON.Vector3 | null = null;
            let maxWorld: BABYLON.Vector3 | null = null;
            for (const m of container.meshes) {
                if (typeof (m as any).getBoundingInfo !== 'function') continue;
                try {
                    m.computeWorldMatrix(true);
                    const bb = m.getBoundingInfo().boundingBox;
                    const mn = bb.minimumWorld.clone();
                    const mx = bb.maximumWorld.clone();
                    if (!minWorld) minWorld = mn; else minWorld.minimizeInPlace(mn);
                    if (!maxWorld) maxWorld = mx; else maxWorld.maximizeInPlace(mx);
                } catch (err) {
                    console.warn(`[LiveTraffic] Failed to read bounding info for template mesh ${m?.name}:`, err);
                }
            }
            if (minWorld && maxWorld) {
                const size = maxWorld.subtract(minWorld).length();
                this._trafficModelScale = LIVE_TRAFFIC_MODEL_TARGET_SIZE_M / Math.max(size, 0.1);
                console.log(`[LiveTraffic] Model template loaded: ${path} size=${size.toFixed(2)}m scale=${this._trafficModelScale.toFixed(4)} meshes=${container.meshes.length}`);
            } else {
                console.log(`[LiveTraffic] Model template loaded: ${path} (no bounding info, default scale) meshes=${container.meshes.length}`);
            }
            this._trafficAssetContainer = container;
            this._swapFallbackEntitiesToModel();
        }).catch((err) => {
            this._trafficModelLoading = false;
            this._trafficModelFailed = true;
            console.warn(`[LiveTraffic] Failed to load model template ${path}; using fallback meshes only:`, err);
        });
    }

    private _buildTrafficModelFromTemplate(entity: LiveTrafficEntity): boolean {
        const sceneRef = this.scene.scene;
        if (!sceneRef || !this._trafficAssetContainer) return false;
        let result: BABYLON.InstantiatedEntries;
        try {
            result = this._trafficAssetContainer.instantiateModelsToScene(
                (name) => `liveTrafficModel_${entity.fr24Id}_${name}`,
                false,
            );
        } catch (err) {
            console.warn(`[LiveTraffic] instantiateModelsToScene failed for ${entity.fr24Id}:`, err);
            return false;
        }
        if (!result || !result.rootNodes || !result.rootNodes.length) {
            console.warn(`[LiveTraffic] instantiateModelsToScene returned empty root nodes for ${entity.fr24Id}`);
            return false;
        }

        const pivot = new BABYLON.TransformNode(`liveTrafficPivot_${entity.fr24Id}`, sceneRef);
        pivot.parent = entity.root;
        pivot.scaling.setAll(this._trafficModelScale);
        pivot.rotation = new BABYLON.Vector3(0, LIVE_TRAFFIC_MODEL_ROTATION_Y, 0);

        const meshes: BABYLON.AbstractMesh[] = [];
        for (const node of result.rootNodes) {
            if (node instanceof BABYLON.TransformNode || node instanceof BABYLON.AbstractMesh) {
                node.parent = pivot;
            }
            if (node instanceof BABYLON.AbstractMesh) {
                node.isPickable = false;
                meshes.push(node);
            }
            const getChildren = (node as any).getChildMeshes;
            if (typeof getChildren === 'function') {
                const children: BABYLON.AbstractMesh[] = getChildren.call(node, false);
                for (const m of children) {
                    if (m instanceof BABYLON.AbstractMesh) {
                        m.isPickable = false;
                        meshes.push(m);
                    }
                }
            }
        }

        entity.modelPivot = pivot;
        entity.meshes = meshes;
        entity.usesFallback = false;
        entity.animationGroups = result.animationGroups || [];
        if (entity.animationGroups.length) {
            entity.animationGroups.forEach((g) => { try { g.stop(); } catch (_) { /* ignore */ } });
        }
        return true;
    }

    private _swapFallbackEntitiesToModel(): void {
        if (!this._trafficAssetContainer) return;
        let swapped = 0;
        for (const [, entity] of this.entities) {
            if (!entity.usesFallback) continue;
            this._disposeEntityVisuals(entity);
            if (this._buildTrafficModelFromTemplate(entity)) {
                swapped++;
            } else {
                this._buildTrafficFallback(entity);
            }
        }
        if (swapped > 0) {
            console.log(`[LiveTraffic] Swapped ${swapped} fallback entit${swapped === 1 ? 'y' : 'ies'} to GLB model`);
        }
    }

    private _disposeEntityVisuals(entity: LiveTrafficEntity): void {
        for (const m of entity.meshes) {
            try { m.dispose(); } catch (_) { /* ignore */ }
        }
        entity.meshes.length = 0;
        try { entity.bodyMaterial?.dispose(); } catch (_) { /* ignore */ }
        entity.bodyMaterial = null;
        if (entity.animationGroups.length) {
            entity.animationGroups.forEach((g) => { try { g.dispose(); } catch (_) { /* ignore */ } });
            entity.animationGroups = [];
        }
        if (entity.modelPivot) {
            try { entity.modelPivot.dispose(); } catch (_) { /* ignore */ }
            entity.modelPivot = null;
        }
        entity.usesFallback = false;
    }

    private _createTrafficLabel(entity: LiveTrafficEntity): void {
        const sceneRef = this.scene.scene;
        const tex = new BABYLON.DynamicTexture(`liveTrafficLabel_${entity.fr24Id}`, {
            width: LIVE_TRAFFIC_LABEL_TEX_W,
            height: LIVE_TRAFFIC_LABEL_TEX_H,
        }, sceneRef, false);
        tex.hasAlpha = true;

        const plane = BABYLON.MeshBuilder.CreatePlane(`liveTrafficLabelPlane_${entity.fr24Id}`, {
            width: LIVE_TRAFFIC_LABEL_PLANE_WIDTH,
            height: LIVE_TRAFFIC_LABEL_PLANE_HEIGHT,
        }, sceneRef);
        plane.parent = entity.root;
        plane.position.y = LIVE_TRAFFIC_LABEL_Y_OFFSET;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;

        const mat = new BABYLON.StandardMaterial(`liveTrafficLabelMat_${entity.fr24Id}`, sceneRef);
        mat.diffuseTexture = tex;
        mat.useAlphaFromDiffuseTexture = true;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        plane.material = mat;

        entity.labelPlane = plane;
        entity.labelTexture = tex;
        entity.labelMaterial = mat;
        this._drawTrafficLabel(tex, entity.callsign);
    }

    private _drawTrafficLabel(tex: BABYLON.DynamicTexture, callsign: string): void {
        const w = LIVE_TRAFFIC_LABEL_TEX_W;
        const h = LIVE_TRAFFIC_LABEL_TEX_H;
        const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
        ctx.clearRect(0, 0, w, h);
        const radius = 8;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0, 0, w, h, radius);
        else ctx.rect(0, 0, w, h);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0, 0, w, h, radius);
        else ctx.rect(0, 0, w, h);
        ctx.stroke();
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = (callsign || '').trim() || 'TRAFFIC';
        ctx.fillText(text, w / 2, h / 2, w - 12);
        tex.update();
    }

    private _updateEntity(entity: LiveTrafficEntity, now: number): void {
        const elapsedS = Math.max(0, (now - entity.baseTimeMs) / 1000);
        const gspeedMs = (Number.isFinite(entity.gspeedKts) ? entity.gspeedKts : 0) * LIVE_TRAFFIC_KTS_TO_MS;
        const trackRad = (Number.isFinite(entity.trackDeg) ? entity.trackDeg : 0) * Math.PI / 180;
        const vspeedFps = (Number.isFinite(entity.vspeedFpm) ? entity.vspeedFpm : 0) * LIVE_TRAFFIC_FPM_TO_FPS;

        const dN = gspeedMs * Math.cos(trackRad) * elapsedS;
        const dE = gspeedMs * Math.sin(trackRad) * elapsedS;
        const cosLat = Math.max(0.001, Math.cos(entity.baseLat * Math.PI / 180));
        const predictedLat = entity.baseLat + dN / METERS_PER_DEG_LAT;
        const predictedLon = entity.baseLon + dE / (METERS_PER_DEG_LAT * cosLat);
        const predictedAltFt = entity.baseAltFt + vspeedFps * elapsedS;

        let lat = predictedLat;
        let lon = predictedLon;
        let altFt = predictedAltFt;

        if (entity.blendActive) {
            const blendElapsed = now - entity.blendStartMs;
            if (blendElapsed >= LIVE_TRAFFIC_BLEND_DURATION_MS) {
                entity.blendActive = false;
            } else {
                const t = blendElapsed / LIVE_TRAFFIC_BLEND_DURATION_MS;
                const ease = t * t * (3 - 2 * t);
                lat = entity.blendFromLat + (predictedLat - entity.blendFromLat) * ease;
                lon = entity.blendFromLon + (predictedLon - entity.blendFromLon) * ease;
                altFt = entity.blendFromAltFt + (predictedAltFt - entity.blendFromAltFt) * ease;
            }
        }

        entity.currentLat = lat;
        entity.currentLon = lon;
        entity.currentAltFt = altFt;

        const altM = altFt * FT_TO_M;
        let localPos: BABYLON.Vector3;
        try {
            localPos = this.scene._latLonToLocal(lat, lon, altM);
        } catch (err) {
            console.warn(`[LiveTraffic] _latLonToLocal failed for ${entity.fr24Id}:`, err);
            return;
        }
        entity.root.position.copyFrom(localPos);

        const yawRad = (180 - entity.trackDeg) * Math.PI / 180;
        const yawQ = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), yawRad);
        if (!entity.root.rotationQuaternion) {
            entity.root.rotationQuaternion = BABYLON.Quaternion.Identity();
        }
        entity.root.rotationQuaternion.copyFrom(yawQ);
    }

    private _disposeEntity(entity: LiveTrafficEntity): void {
        try { entity.labelMaterial?.dispose(); } catch (_) { /* ignore */ }
        try { entity.labelTexture?.dispose(); } catch (_) { /* ignore */ }
        try { entity.labelPlane?.dispose(); } catch (_) { /* ignore */ }
        if (entity.animationGroups.length) {
            entity.animationGroups.forEach((g) => { try { g.dispose(); } catch (_) { /* ignore */ } });
            entity.animationGroups = [];
        }
        for (const m of entity.meshes) {
            try { m.dispose(); } catch (_) { /* ignore */ }
        }
        entity.meshes.length = 0;
        try { entity.bodyMaterial?.dispose(); } catch (_) { /* ignore */ }
        if (entity.modelPivot) {
            try { entity.modelPivot.dispose(); } catch (_) { /* ignore */ }
            entity.modelPivot = null;
        }
        try { entity.root.dispose(); } catch (_) { /* ignore */ }
        entity.bodyMaterial = null;
        entity.labelMaterial = null;
        entity.labelTexture = null;
        entity.labelPlane = null;
    }
}
