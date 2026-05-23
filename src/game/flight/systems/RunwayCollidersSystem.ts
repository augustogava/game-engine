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
} from '../constants/index.js';

const RUNWAY_TILE_ALIGN_LOG_DELTA_M = 1.0;

export class RunwayCollidersSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    async buildNearbyRunwayColliders(centerLat: number, centerLon: number): Promise<void> {
        try {
            const url = `/api/airports/nearby?lat=${centerLat}&lng=${centerLon}&radius_km=${RUNWAY_COLLIDER_RADIUS_KM}`;
            const resp = await fetch(url);
            if (!resp.ok) {
                console.warn(`[Runway] /api/airports/nearby returned HTTP ${resp.status}`);
                return;
            }
            const json = await resp.json();
            const airports: any[] = json?.data || [];
            let count = 0;
            for (const ap of airports) {
                const runways: any[] = ap?.runways || [];
                for (const r of runways) {
                    if (this.buildRunwayCollider(r, ap.icao_code || ap.iata_code || `id${ap.id}`)) count++;
                }
            }
            console.log(`[Runway] loaded ${count} collider(s) from ${airports.length} airport(s) near (${centerLat.toFixed(4)}, ${centerLon.toFixed(4)})`);
        } catch (err) {
            console.warn('[Runway] failed to load nearby runways:', err);
        }
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

        const cosOriginLat = Math.cos(this.scene.originLat * Math.PI / 180);
        const eastM = (centerLon - this.scene.originLon) * METERS_PER_DEG_LAT * Math.max(cosOriginLat, 0.01);
        const northM = (centerLat - this.scene.originLat) * METERS_PER_DEG_LAT;
        const sceneX = eastM;
        const sceneZ = -northM;
        const dbSceneY = (elevationFt * FT_TO_M - this.scene.refAlt) + RUNWAY_COLLIDER_Y_BIAS_M;
        const tileY = this._probeTilesYAt(sceneX, sceneZ);
        let sceneY: number;
        if (tileY != null && Number.isFinite(tileY)) {
            sceneY = tileY + RUNWAY_COLLIDER_Y_BIAS_M;
            const delta = sceneY - dbSceneY;
            if (Math.abs(delta) >= RUNWAY_TILE_ALIGN_LOG_DELTA_M) {
                console.debug(`[Runway] ${icao} ${r.le_ident || ''}/${r.he_ident || ''}: aligned to tile terrain y=${sceneY.toFixed(2)}m (db-derived=${dbSceneY.toFixed(2)}m, delta=${delta.toFixed(2)}m)`);
            }
        } else {
            sceneY = dbSceneY;
            console.debug(`[Runway] ${icao} ${r.le_ident || ''}/${r.he_ident || ''}: tile probe missed at scene(${sceneX.toFixed(1)},${sceneZ.toFixed(1)}) — using db elevation y=${sceneY.toFixed(2)}m`);
        }

        const name = `runway-collider-${icao}-${r.le_ident || ''}-${r.he_ident || ''}`;
        const babylonScene: BABYLON.Scene = this.scene.scene;
        const mesh = BABYLON.MeshBuilder.CreatePlane(name, {
            width: widthM,
            height: lengthM,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE,
        }, babylonScene);
        mesh.position.set(sceneX, sceneY, sceneZ);
        mesh.rotation.x = Math.PI / 2;
        mesh.rotation.y = (180 - Number(r.le_heading_deg_true)) * Math.PI / 180;
        mesh.isVisible = false;
        mesh.isPickable = true;
        mesh.checkCollisions = false;
        mesh.receiveShadows = false;
        mesh.metadata = { type: 'runway-collider', icao, leIdent: r.le_ident, heIdent: r.he_ident };
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
        return true;
    }

    disposeRunwayColliders(): void {
        for (const m of this.scene._runwayColliders) {
            try { m.dispose(); } catch { /* ignore */ }
        }
        this.scene._runwayColliders = [];
        this.scene._runwayCollidersLoaded = false;
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
            const hit = babylonScene.pickWithRay(ray, predicate);
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
        const hits = babylonScene.multiPickWithRay(ray, predicate);
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
        return bestRunway || bestOther;
    }
}
