import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    RUNWAY_COLLIDER_RADIUS_KM,
    RUNWAY_DEFAULT_WIDTH_FT,
    FT_TO_M,
    METERS_PER_DEG_LAT,
    RUNWAY_COLLIDER_Y_BIAS_M,
    RUNWAY_RENDERING_GROUP_ID,
    RUNWAY_COLLIDER_DIFFUSE,
    RUNWAY_COLLIDER_ALPHA,
    SPAWN_TERRAIN_RAY_HEIGHT_M,
    SPAWN_TERRAIN_RAY_LENGTH_M,
    TERRAIN_UNKNOWN_Y,
} from '../constants/index.js';
import { fetchJsonWithTimeout } from '../api/fetchWithTimeout.js';

const RUNWAY_NEARBY_FETCH_TIMEOUT_MS = 15000;
const RUNWAY_TILE_ALIGN_LOG_DELTA_M = 1.0;
const RUNWAY_NEAR_ORIGIN_FALLBACK_M = 8000;
const RUNWAY_MAX_GRADIENT = 0.03;
const RUNWAY_DB_OFFSET_MAX_ABS_M = 120;
const RUNWAY_TILE_ABOVE_TOLERANCE_M = 0.5;
const RUNWAY_TILE_ABOVE_MAX_M = 8;
const RUNWAY_COLLIDER_FLOAT_TOLERANCE_M = 1.0;
const RUNWAY_COLLIDER_HOLE_GUARD_M = 5;
const RUNWAY_GROUND_SOURCE_LOG_INTERVAL_MS = 5000;
const RUNWAY_REALIGN_MIN_DELTA_M = 0.15;
const RUNWAY_REALIGN_MIN_INTERVAL_MS = 2000;
const RUNWAY_REALIGN_MAX_GROUND_SPEED_MS = 3;
const RUNWAY_FOOTPRINT_MARGIN_M = 30;
const RUNWAY_PROBE_SOURCE_CENTER = 'center';
const RUNWAY_PROBE_SOURCE_LE = 'LE';
const RUNWAY_PROBE_SOURCE_HE = 'HE';
const RUNWAY_PROBE_SOURCE_SCENE_TERRAIN = 'scene.terrainY';
const DEG_TO_RAD = Math.PI / 180;

interface RunwayProbePoint {
    source: string;
    x: number;
    z: number;
    toCenterM: number;
}

export class RunwayCollidersSystem {
    private readonly scene: any;
    private _tileAlignDeltasM: number[] = [];
    private _dbFallbackColliders: BABYLON.Mesh[] = [];
    private _lastPreferTile: boolean | null = null;
    private _lastGroundSourceLogMs = 0;
    private _realignRequested = false;
    private _lastRealignMs = 0;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    async buildNearbyRunwayColliders(centerLat: number, centerLon: number): Promise<void> {
        this._tileAlignDeltasM = [];
        this._dbFallbackColliders = [];
        try {
            const url = `/api/airports/nearby?lat=${centerLat}&lng=${centerLon}&radius_km=${RUNWAY_COLLIDER_RADIUS_KM}`;
            const result = await fetchJsonWithTimeout(url, {}, RUNWAY_NEARBY_FETCH_TIMEOUT_MS);
            if (!result.ok) {
                console.warn(`[Runway] /api/airports/nearby returned HTTP ${result.status}`);
                return;
            }
            const json = result.data;
            const airports: any[] = json?.data || [];
            let count = 0;
            for (const ap of airports) {
                const runways: any[] = ap?.runways || [];
                for (const r of runways) {
                    if (this.buildRunwayCollider(r, ap.icao_code || ap.iata_code || `id${ap.id}`)) count++;
                }
            }
            console.log(`[Runway] loaded ${count} collider(s) from ${airports.length} airport(s) near (${centerLat.toFixed(4)}, ${centerLon.toFixed(4)})`);
            this._applyDbFallbackOffset();
            try { this.scene._rebuildRunwayLights?.(); } catch (err) { console.warn('[Runway] runway lights rebuild failed:', err); }
            if (count > 0) this.requestRealign('colliders built');
        } catch (err) {
            console.warn('[Runway] failed to load nearby runways:', err);
        }
    }

    requestRealign(reason: string): void {
        if (!this._realignRequested) console.debug(`[Runway] Re-align to terrain requested (${reason})`);
        this._realignRequested = true;
    }

    isRealignRequested(): boolean {
        return this._realignRequested;
    }

    updateRealign(terrainSettled: boolean): void {
        if (!this._realignRequested || terrainSettled !== true) return;
        const nowMs = performance.now();
        if (nowMs - this._lastRealignMs < RUNWAY_REALIGN_MIN_INTERVAL_MS) return;
        this._lastRealignMs = nowMs;
        this._realignRequested = this.realignCollidersToTiles();
    }

    private realignCollidersToTiles(): boolean {
        const colliders: BABYLON.Mesh[] = Array.isArray(this.scene._runwayColliders) ? this.scene._runwayColliders : [];
        if (colliders.length === 0) return false;
        let moved = 0;
        let unchanged = 0;
        let deferred = 0;
        let unprobed = 0;
        for (const mesh of colliders) {
            if (!mesh || mesh.isDisposed()) continue;
            const points: RunwayProbePoint[] | undefined = mesh.metadata?.probePoints;
            if (!Array.isArray(points) || points.length === 0) {
                unprobed++;
                continue;
            }
            if (this._isAircraftRollingOn(mesh)) {
                deferred++;
                continue;
            }
            const probe = this._probeNearestFirst(points);
            if (!probe) {
                unprobed++;
                continue;
            }
            const centerY = probe.tileY + RUNWAY_COLLIDER_Y_BIAS_M + probe.point.toCenterM;
            const delta = centerY - mesh.position.y;
            if (!Number.isFinite(delta) || Math.abs(delta) < RUNWAY_REALIGN_MIN_DELTA_M) {
                unchanged++;
                continue;
            }
            const carriesParkedAircraft = this._isAircraftParkedOn(mesh);
            try {
                mesh.unfreezeWorldMatrix();
                mesh.position.y = centerY;
                mesh.computeWorldMatrix(true);
                mesh.freezeWorldMatrix();
                moved++;
                console.debug(`[Runway] ${mesh.name}: re-aligned to refined terrain via ${probe.point.source} (delta=${delta.toFixed(2)}m, y=${centerY.toFixed(2)}m)`);
            } catch (err) {
                console.warn(`[Runway] Failed to re-align ${mesh.name}:`, err);
                continue;
            }
            if (carriesParkedAircraft) this._shiftParkedAircraft(delta);
        }
        if (moved > 0) {
            try { this.scene._rebuildRunwayLights?.(); } catch (err) { console.warn('[Runway] runway lights rebuild after re-align failed:', err); }
        }
        console.debug(`[Runway] Re-align pass: moved=${moved} unchanged=${unchanged} deferred=${deferred} unprobed=${unprobed}`);
        return deferred > 0;
    }

    private _probeNearestFirst(points: RunwayProbePoint[]): { point: RunwayProbePoint; tileY: number } | null {
        const plane = this.scene.planeRoot?.position;
        const ordered = points.slice();
        if (plane && Number.isFinite(plane.x) && Number.isFinite(plane.z)) {
            ordered.sort((a, b) => Math.hypot(a.x - plane.x, a.z - plane.z) - Math.hypot(b.x - plane.x, b.z - plane.z));
        }
        for (const point of ordered) {
            const tileY = this._probeTilesYAt(point.x, point.z);
            if (tileY != null && Number.isFinite(tileY)) return { point, tileY };
        }
        return null;
    }

    private _isAircraftParkedOn(mesh: BABYLON.Mesh): boolean {
        if (this.scene.isOnGround !== true || !this.scene.planeRoot) return false;
        return this.scene._cachedTerrainHit?.pickedMesh === mesh;
    }

    private _shiftParkedAircraft(deltaM: number): void {
        const root = this.scene.planeRoot;
        if (!root || !Number.isFinite(deltaM)) return;
        root.position.y += deltaM;
        for (const key of ['terrainY', '_lastValidTerrainY', '_lastKnownSpawnTerrainY']) {
            const value = this.scene[key];
            if (typeof value === 'number' && Number.isFinite(value) && value !== TERRAIN_UNKNOWN_Y) this.scene[key] = value + deltaM;
        }
        console.debug(`[Runway] Parked aircraft moved ${deltaM.toFixed(2)}m with its runway collider (pos.y=${root.position.y.toFixed(2)}m)`);
    }

    private _isAircraftRollingOn(mesh: BABYLON.Mesh): boolean {
        const plane = this.scene.planeRoot?.position;
        if (!plane || this.scene.isOnGround !== true) return false;
        const velocity = this.scene.velocity;
        const groundSpeedMs = velocity ? Math.hypot(Number(velocity.x) || 0, Number(velocity.z) || 0) : 0;
        if (groundSpeedMs <= RUNWAY_REALIGN_MAX_GROUND_SPEED_MS) return false;
        const lengthM = Number(mesh.metadata?.lengthM);
        const widthM = Number(mesh.metadata?.widthM);
        const headingRad = Number(mesh.metadata?.headingDeg) * DEG_TO_RAD;
        if (!Number.isFinite(lengthM) || !Number.isFinite(widthM) || !Number.isFinite(headingRad)) return false;
        const dx = plane.x - mesh.position.x;
        const dz = plane.z - mesh.position.z;
        const along = dx * Math.sin(headingRad) - dz * Math.cos(headingRad);
        const lateral = dx * Math.cos(headingRad) + dz * Math.sin(headingRad);
        return Math.abs(along) <= lengthM / 2 + RUNWAY_FOOTPRINT_MARGIN_M
            && Math.abs(lateral) <= widthM / 2 + RUNWAY_FOOTPRINT_MARGIN_M;
    }

    buildRunwayCollider(r: any, icao: string): boolean {
        if (!r || r.le_latitude_deg == null || r.le_longitude_deg == null
            || r.le_heading_deg_true == null || !r.length_ft || r.length_ft <= 0) {
            return false;
        }
        const widthFt = (r.width_ft && r.width_ft > 0) ? r.width_ft : RUNWAY_DEFAULT_WIDTH_FT;
        const widthM = widthFt * FT_TO_M;
        const lengthM = r.length_ft * FT_TO_M;

        const hasHE = r.he_latitude_deg != null && r.he_longitude_deg != null;
        const centerLat = hasHE ? (Number(r.le_latitude_deg) + Number(r.he_latitude_deg)) / 2 : Number(r.le_latitude_deg);
        const centerLon = hasHE ? (Number(r.le_longitude_deg) + Number(r.he_longitude_deg)) / 2 : Number(r.le_longitude_deg);

        const leElevFt = r.le_elevation_ft != null ? Number(r.le_elevation_ft) : null;
        const heElevFt = r.he_elevation_ft != null ? Number(r.he_elevation_ft) : null;
        const elevationFt = (leElevFt != null && heElevFt != null) ? (leElevFt + heElevFt) / 2
            : (leElevFt != null) ? leElevFt
            : (heElevFt != null) ? heElevFt
            : 0;
        const rawElevationDiffM = (leElevFt != null && heElevFt != null && Number.isFinite(leElevFt) && Number.isFinite(heElevFt))
            ? (heElevFt - leElevFt) * FT_TO_M
            : 0;
        const elevationDiffM = Math.abs(rawElevationDiffM) <= lengthM * RUNWAY_MAX_GRADIENT ? rawElevationDiffM : 0;
        if (elevationDiffM !== rawElevationDiffM) {
            console.warn(`[Runway] ${icao} ${r.le_ident || ''}/${r.he_ident || ''}: ignoring implausible end elevation difference ${rawElevationDiffM.toFixed(1)}m over ${lengthM.toFixed(0)}m`);
        }

        const cosOriginLat = Math.cos(this.scene.originLat * Math.PI / 180);
        const eastM = (centerLon - this.scene.originLon) * METERS_PER_DEG_LAT * Math.max(cosOriginLat, 0.01);
        const northM = (centerLat - this.scene.originLat) * METERS_PER_DEG_LAT;
        const sceneX = eastM;
        const sceneZ = -northM;
        const dbSceneY = (elevationFt * FT_TO_M - this.scene.refAlt) + RUNWAY_COLLIDER_Y_BIAS_M;
        const lonScaleM = METERS_PER_DEG_LAT * Math.max(cosOriginLat, 0.01);
        const probePoints: RunwayProbePoint[] = [
            { source: RUNWAY_PROBE_SOURCE_CENTER, x: sceneX, z: sceneZ, toCenterM: 0 },
            {
                source: RUNWAY_PROBE_SOURCE_LE,
                x: (Number(r.le_longitude_deg) - this.scene.originLon) * lonScaleM,
                z: -(Number(r.le_latitude_deg) - this.scene.originLat) * METERS_PER_DEG_LAT,
                toCenterM: elevationDiffM / 2,
            },
        ];
        if (hasHE) {
            probePoints.push({
                source: RUNWAY_PROBE_SOURCE_HE,
                x: (Number(r.he_longitude_deg) - this.scene.originLon) * lonScaleM,
                z: -(Number(r.he_latitude_deg) - this.scene.originLat) * METERS_PER_DEG_LAT,
                toCenterM: -elevationDiffM / 2,
            });
        }
        const probe = this._probeNearestFirst(probePoints);
        let tileY: number | null = probe ? probe.tileY : null;
        let probeSource = probe ? probe.point.source : RUNWAY_PROBE_SOURCE_CENTER;
        let probeToCenterM = probe ? probe.point.toCenterM : 0;
        if (tileY == null
            && Number.isFinite(this.scene.terrainY)
            && this.scene.terrainY !== TERRAIN_UNKNOWN_Y
            && Math.hypot(sceneX, sceneZ) < RUNWAY_NEAR_ORIGIN_FALLBACK_M) {
            tileY = this.scene.terrainY - RUNWAY_COLLIDER_Y_BIAS_M;
            probeSource = RUNWAY_PROBE_SOURCE_SCENE_TERRAIN;
            probeToCenterM = 0;
        }
        let sceneY: number;
        let usedDbElevation = false;
        if (tileY != null && Number.isFinite(tileY)) {
            sceneY = tileY + RUNWAY_COLLIDER_Y_BIAS_M + probeToCenterM;
            const delta = sceneY - dbSceneY;
            if (probeSource !== RUNWAY_PROBE_SOURCE_SCENE_TERRAIN && Number.isFinite(delta)) this._tileAlignDeltasM.push(delta);
            if (Math.abs(delta) >= RUNWAY_TILE_ALIGN_LOG_DELTA_M) {
                console.log(`[Runway] ${icao} ${r.le_ident || ''}/${r.he_ident || ''}: aligned to tile terrain y=${sceneY.toFixed(2)}m via ${probeSource} (db-derived=${dbSceneY.toFixed(2)}m, delta=${delta.toFixed(2)}m)`);
            }
        } else {
            sceneY = dbSceneY;
            usedDbElevation = true;
            console.warn(`[Runway] ${icao} ${r.le_ident || ''}/${r.he_ident || ''}: tile probe missed at center/LE/HE — using db elevation y=${sceneY.toFixed(2)}m (risk: plane may fall through if this is the spawn runway)`);
        }

        const name = `runway-collider-${icao}-${r.le_ident || ''}-${r.he_ident || ''}`;
        const babylonScene: BABYLON.Scene = this.scene.scene;
        const mesh = BABYLON.MeshBuilder.CreatePlane(name, {
            width: widthM,
            height: lengthM,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE,
        }, babylonScene);
        mesh.position.set(sceneX, sceneY, sceneZ);
        mesh.rotation.x = Math.PI / 2 - Math.asin(elevationDiffM / lengthM);
        mesh.rotation.y = (180 - Number(r.le_heading_deg_true)) * Math.PI / 180;
        mesh.isVisible = false;
        mesh.isPickable = true;
        mesh.checkCollisions = false;
        mesh.receiveShadows = false;
        mesh.metadata = {
            type: 'runway-collider',
            icao,
            leIdent: r.le_ident,
            heIdent: r.he_ident,
            lengthM,
            widthM,
            headingDeg: Number(r.le_heading_deg_true),
            elevationDiffM,
            probePoints,
        };
        mesh.renderingGroupId = RUNWAY_RENDERING_GROUP_ID;

        const mat = new BABYLON.StandardMaterial(name + 'Mat', babylonScene);
        mat.diffuseColor = new BABYLON.Color3(RUNWAY_COLLIDER_DIFFUSE.r, RUNWAY_COLLIDER_DIFFUSE.g, RUNWAY_COLLIDER_DIFFUSE.b);
        mat.specularColor = BABYLON.Color3.Black();
        mat.emissiveColor = BABYLON.Color3.Black();
        mat.alpha = RUNWAY_COLLIDER_ALPHA;
        mat.backFaceCulling = false;
        mat.freeze();
        mesh.material = mat;

        mesh.computeWorldMatrix(true);
        mesh.freezeWorldMatrix();

        this.scene._runwayColliders.push(mesh);
        if (usedDbElevation) this._dbFallbackColliders.push(mesh);
        return true;
    }

    private _applyDbFallbackOffset(): void {
        const fallbacks = this._dbFallbackColliders;
        const deltas = this._tileAlignDeltasM.filter((d) => Number.isFinite(d));
        this._dbFallbackColliders = [];
        this._tileAlignDeltasM = [];
        if (fallbacks.length === 0) return;
        if (deltas.length === 0) {
            console.warn(`[Runway] ${fallbacks.length} collider(s) kept at db elevation: no tile-aligned runway available to calibrate the db/tile offset`);
            return;
        }
        const sorted = [...deltas].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const offsetM = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        if (!Number.isFinite(offsetM) || Math.abs(offsetM) > RUNWAY_DB_OFFSET_MAX_ABS_M) {
            console.warn(`[Runway] Skipping db/tile offset ${offsetM}m (outside ±${RUNWAY_DB_OFFSET_MAX_ABS_M}m) for ${fallbacks.length} collider(s)`);
            return;
        }
        let applied = 0;
        for (const mesh of fallbacks) {
            if (!mesh || mesh.isDisposed()) continue;
            try {
                mesh.unfreezeWorldMatrix();
                mesh.position.y += offsetM;
                mesh.computeWorldMatrix(true);
                mesh.freezeWorldMatrix();
                applied++;
            } catch (err) {
                console.warn(`[Runway] Failed to apply db/tile offset to ${mesh.name}:`, err);
            }
        }
        console.log(`[Runway] Applied db/tile offset ${offsetM.toFixed(2)}m (median of ${deltas.length} tile-aligned runway(s)) to ${applied} db-elevation collider(s)`);
    }

    disposeRunwayColliders(): void {
        try { this.scene._disposeRunwayLights?.(); } catch (err) { console.warn('[Runway] runway lights dispose failed:', err); }
        for (const m of this.scene._runwayColliders) {
            try { m.dispose(); } catch { /* ignore */ }
        }
        this.scene._runwayColliders = [];
        this.scene._runwayCollidersLoaded = false;
        this._realignRequested = false;
    }

    private _probeTilesYAt(x: number, z: number): number | null {
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            console.warn(`[Runway] _probeTilesYAt invalid coords x=${x} z=${z}`);
            return null;
        }
        const babylonScene: BABYLON.Scene | null = this.scene.scene || null;
        if (!babylonScene) return null;
        if (!this.scene.tiles) return null;
        try {
            const ray = new BABYLON.Ray(
                new BABYLON.Vector3(x, SPAWN_TERRAIN_RAY_HEIGHT_M, z),
                new BABYLON.Vector3(0, -1, 0),
                SPAWN_TERRAIN_RAY_LENGTH_M,
            );
            const planeRoot = this.scene.planeRoot;
            const predicate = (mesh: BABYLON.AbstractMesh) => {
                if (!mesh.isPickable) return false;
                if (mesh.name === 'ground') return false;
                if (mesh.metadata && mesh.metadata.type === 'runway-collider') return false;
                if (planeRoot && mesh.isDescendantOf(planeRoot)) return false;
                return true;
            };
            const spike = this.scene._frameSpikeMonitor;
            const pickStartMs = spike ? performance.now() : 0;
            const hit = babylonScene.pickWithRay(ray, predicate);
            if (spike) spike.recordPick(performance.now() - pickStartMs);
            if (hit?.hit && hit.pickedPoint && Number.isFinite(hit.pickedPoint.y)) {
                return hit.pickedPoint.y;
            }
        } catch (err) {
            console.warn('[Runway] _probeTilesYAt failed:', err);
        }
        return null;
    }

    pickTerrainPreferRunway(ray: BABYLON.Ray): BABYLON.PickingInfo | null {
        const planeRoot = this.scene.planeRoot;
        const originX = ray.origin.x;
        const originY = ray.origin.y;
        const originZ = ray.origin.z;
        const rayEndY = originY - ray.length;
        const predicate = (mesh: BABYLON.AbstractMesh) => {
            if (!mesh.isPickable) return false;
            if (mesh.name === 'ground') return false;
            if (mesh.isDescendantOf(planeRoot)) return false;
            const bb = mesh.getBoundingInfo().boundingBox;
            const minW = bb.minimumWorld;
            const maxW = bb.maximumWorld;
            if (minW.y > originY) return false;
            if (maxW.y < rayEndY) return false;
            if (maxW.x < originX || minW.x > originX) return false;
            if (maxW.z < originZ || minW.z > originZ) return false;
            return true;
        };
        const babylonScene: BABYLON.Scene = this.scene.scene;
        const spike = this.scene._frameSpikeMonitor;
        const pickStartMs = spike ? performance.now() : 0;
        const hits = babylonScene.multiPickWithRay(ray, predicate);
        if (spike) spike.recordPick(performance.now() - pickStartMs);
        if (!hits || hits.length === 0) return null;
        let bestRunway: BABYLON.PickingInfo | null = null;
        let bestOther: BABYLON.PickingInfo | null = null;
        for (const h of hits) {
            if (!h?.hit || !h.pickedPoint) continue;
            const isRunway = h.pickedMesh?.metadata?.type === 'runway-collider';
            if (isRunway) {
                if (!bestRunway || h.pickedPoint.y > bestRunway.pickedPoint!.y) bestRunway = h;
            } else {
                if (!bestOther || h.pickedPoint.y > bestOther.pickedPoint!.y) bestOther = h;
            }
        }
        if (!bestRunway || !bestOther) return bestRunway || bestOther;
        const tileAboveColliderM = bestOther.pickedPoint!.y - bestRunway.pickedPoint!.y;
        const colliderAboveTileM = -tileAboveColliderM;
        const preferTile = (tileAboveColliderM > RUNWAY_TILE_ABOVE_TOLERANCE_M && tileAboveColliderM <= RUNWAY_TILE_ABOVE_MAX_M)
            || (colliderAboveTileM > RUNWAY_COLLIDER_FLOAT_TOLERANCE_M && colliderAboveTileM <= RUNWAY_COLLIDER_HOLE_GUARD_M);
        const now = Date.now();
        if (preferTile !== this._lastPreferTile && now - this._lastGroundSourceLogMs >= RUNWAY_GROUND_SOURCE_LOG_INTERVAL_MS) {
            this._lastPreferTile = preferTile;
            this._lastGroundSourceLogMs = now;
            console.debug(`[Runway] Ground source -> ${preferTile ? 'tiles' : 'runway collider'} (tile-collider=${tileAboveColliderM.toFixed(2)}m, collider=${bestRunway.pickedMesh?.name ?? 'unknown'})`);
        }
        return preferTile ? bestOther : bestRunway;
    }
}
