import * as BABYLON from '@babylonjs/core';
import { TilesRenderer } from '3d-tiles-renderer/babylonjs';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    GROUND_Y,
    TILE_PBR_ROUGHNESS_FLOOR,
    TILE_FADE_DURATION_S,
    AERIAL_FOG_ALT_FADE_REF_M,
    AERIAL_FOG_ALT_FADE_MIN_MULT,
    AIRPORT_OVERLAY_CLIP_MIN_TILE_RADIUS_M,
} from '../constants/index.js';

declare const __GOOGLE_MAPS_API_KEY__: string;

const TILES_ERROR_TARGET_MOBILE = 12;
const TILES_ERROR_TARGET_DESKTOP = 6;
const TILES_LRU_MAX_SIZE_MOBILE = 800;
const TILES_LRU_MIN_SIZE_MOBILE = 300;
const TILES_LRU_MAX_SIZE_DESKTOP = 2000;
const TILES_LRU_MIN_SIZE_DESKTOP = 800;
const TILE_TEXTURE_ANISOTROPY = 8;

export class TerrainTilesSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    init3DTiles(scene: BABYLON.Scene): void {
        const params = new URLSearchParams(window.location.search);
        const apiKey: string = __GOOGLE_MAPS_API_KEY__ || '';
        if (!apiKey) {
            console.warn('[3DTiles] No GOOGLE_MAPS_API_KEY in .env — skipping.');
            return;
        }

        const hasPlan = this.scene._pendingFlightPlanLat != null;
        const hasMission = this.scene._pendingMissionLat != null;
        let lat: number, lon: number, alt: number;
        if (hasMission) {
            lat = this.scene._pendingMissionLat!;
            lon = this.scene._pendingMissionLon!;
            alt = (this.scene._pendingMissionAltM || 0) + GROUND_Y;
            const missionHdg = this.scene._pendingMissionHdg;
            this.scene.initialHeading = missionHdg != null && Number.isFinite(missionHdg) ? missionHdg : 0;
        } else if (hasPlan) {
            lat = this.scene._pendingFlightPlanLat!;
            lon = this.scene._pendingFlightPlanLon!;
            alt = this.scene._pendingFlightPlanAltM! + GROUND_Y;
            this.scene.initialHeading = this.scene._pendingFlightPlanHdg!;
        } else {
            lat = parseFloat(params.get('lat') || '-23.4341');
            lon = parseFloat(params.get('lng') || '-46.4825');
            alt = parseFloat(params.get('alt') || '750');
            this.scene.initialHeading = parseFloat(params.get('hdg') || '74');
        }
        const hasFlightPlanParam = params.has('flightPlanId');
        this.scene.spawnAirborne = this.scene._pendingMissionAirborne ? true : ((hasPlan || hasFlightPlanParam) ? false : params.has('lat'));
        if (hasPlan) console.log(`[FlightPlan] Ground spawn at runway lat=${lat} lon=${lon} hdg=${this.scene.initialHeading}`);
        if (hasMission) console.log(`[Mission] Spawn at lat=${lat} lon=${lon} hdg=${this.scene.initialHeading} airborne=${this.scene._pendingMissionAirborne}`);
        this.scene.originLat = lat;
        this.scene.originLon = lon;
        this.scene.mapApiKey = apiKey;

        const url = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`;
        this.scene.tiles = new TilesRenderer(url, scene);
        const isMobile = this.scene.isMobile === true;
        this.scene.tiles.errorTarget = isMobile ? TILES_ERROR_TARGET_MOBILE : TILES_ERROR_TARGET_DESKTOP;
        (this.scene.tiles as any).maxDepth = 100;
        (this.scene.tiles as any).errorThreshold = 60;
        this.scene.tiles.lruCache.maxSize = isMobile ? TILES_LRU_MAX_SIZE_MOBILE : TILES_LRU_MAX_SIZE_DESKTOP;
        this.scene.tiles.lruCache.minSize = isMobile ? TILES_LRU_MIN_SIZE_MOBILE : TILES_LRU_MIN_SIZE_DESKTOP;
        console.info(`[3DTiles] errorTarget=${this.scene.tiles.errorTarget} lruMax=${this.scene.tiles.lruCache.maxSize} (mobile=${isMobile})`);
        try {
            this.scene.tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
        } catch (e) { console.warn('[3DTiles] Auth plugin failed:', e); }

        this.attachTilesVisualHandlers();

        const latRad = lat * Math.PI / 180;
        const lonRad = lon * Math.PI / 180;
        const sinLat = Math.sin(latRad);
        const cosLat = Math.cos(latRad);
        const sinLon = Math.sin(lonRad);
        const cosLon = Math.cos(lonRad);

        const WGS84_A  = 6378137.0;
        const WGS84_E2 = 0.00669437999014;
        const refAlt = alt - GROUND_Y;
        this.scene.refAlt = refAlt;
        const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
        const px = (N + refAlt) * cosLat * cosLon;
        const py = (N + refAlt) * cosLat * sinLon;
        const pz = (N * (1 - WGS84_E2) + refAlt) * sinLat;

        const east  = new BABYLON.Vector3(-sinLon, cosLon, 0);
        const up    = new BABYLON.Vector3(cosLat * cosLon, cosLat * sinLon, sinLat);
        const south = new BABYLON.Vector3(sinLat * cosLon, sinLat * sinLon, -cosLat);

        const T = BABYLON.Matrix.Translation(-px, -py, -pz);
        const R = new BABYLON.Matrix();
        BABYLON.Matrix.FromXYZAxesToRef(east, up, south, R);
        R.transposeToRef(R);
        const M = T.multiply(R);

        this.scene.tiles.group.rotationQuaternion = BABYLON.Quaternion.Identity();
        M.decompose(
            this.scene.tiles.group.scaling,
            this.scene.tiles.group.rotationQuaternion,
            this.scene.tiles.group.position,
        );

        console.info(`[3DTiles] ENU transform at (${lat}, ${lon}, alt=${alt}). Group pos: ${this.scene.tiles.group.position}`);
    }

    attachTilesVisualHandlers(): void {
        if (!this.scene.tiles) return;
        const tiles: any = this.scene.tiles;
        try {
            tiles.addEventListener('load-model', (event: any) => {
                try {
                    const tileScene: BABYLON.TransformNode | null = event && event.scene ? event.scene : null;
                    if (!tileScene) return;
                    const meshes = (tileScene as any).getChildMeshes
                        ? (tileScene as any).getChildMeshes(false)
                        : [];
                    const wantShadows = !!this.scene._premium.tileShadows;
                    let maxAniso = 1;
                    try {
                        const caps = this.scene.scene?.getEngine()?.getCaps();
                        if (caps && Number.isFinite(caps.maxAnisotropy)) maxAniso = caps.maxAnisotropy;
                    } catch (_) { /* ignore */ }
                    const targetAniso = Math.max(1, Math.min(TILE_TEXTURE_ANISOTROPY, maxAniso));
                    const seenMats = new Set<BABYLON.Material>();
                    const clipZones = this.scene._airportClipZones as
                        | { centerVec: BABYLON.Vector3; clipRadiusM: number; clipMaxAltM: number }[]
                        | undefined;
                    const hasClipZones = !!(clipZones && clipZones.length);
                    for (const mesh of meshes) {
                        try {
                            if (wantShadows && mesh.receiveShadows !== true) {
                                mesh.receiveShadows = true;
                            }
                            if (hasClipZones) {
                                try {
                                    if (this.isMeshInsideAnyClipZone(mesh, clipZones!)) {
                                        mesh.setEnabled(false);
                                    }
                                } catch (clipErr) {
                                    console.warn('[3DTiles] Clip-zone check failed for tile mesh:', clipErr);
                                }
                            }
                            const mat = mesh.material;
                            if (!mat || seenMats.has(mat)) continue;
                            seenMats.add(mat);
                            if (mat instanceof BABYLON.PBRBaseMaterial) {
                                const pbr = mat as BABYLON.PBRMaterial;
                                if (pbr.roughness !== null && pbr.roughness !== undefined && pbr.roughness < TILE_PBR_ROUGHNESS_FLOOR) {
                                    pbr.roughness = TILE_PBR_ROUGHNESS_FLOOR;
                                }
                            }
                            try {
                                const texs = (mat as any).getActiveTextures ? (mat as any).getActiveTextures() : [];
                                for (const tex of texs) {
                                    if (tex && typeof tex.anisotropicFilteringLevel === 'number' && tex.anisotropicFilteringLevel < targetAniso) {
                                        tex.anisotropicFilteringLevel = targetAniso;
                                    }
                                }
                            } catch (anisoErr) {
                                console.warn('[3DTiles] Anisotropic filtering set failed:', anisoErr);
                            }
                        } catch (innerErr) {
                            console.warn('[3DTiles] Failed to polish tile mesh:', innerErr);
                        }
                    }
                    if (this.scene._premium.tileFade) {
                        try {
                            const tileKey = (event.tile && event.tile.__h) ? String(event.tile.__h) : (tileScene as any).uniqueId + '_' + Date.now();
                            (event.tile && (event.tile.__h = tileKey));
                            for (const mesh of meshes) {
                                mesh.visibility = 0;
                            }
                            this.scene._tileFadeEntries.set(tileKey, { meshes, t: 0 });
                        } catch (fadeErr) {
                            console.warn('[3DTiles] Tile fade setup failed:', fadeErr);
                        }
                    }
                    if (this.scene._premium.waterTilesRefl && this.scene._waterMaterial) {
                        try {
                            const wm: any = this.scene._waterMaterial;
                            const list: any[] = wm.renderList || (wm.renderList = []);
                            for (const mesh of meshes) {
                                if (mesh && list.indexOf(mesh) < 0) {
                                    list.push(mesh);
                                }
                            }
                        } catch (reflErr) {
                            console.warn('[3DTiles] Water reflection add failed:', reflErr);
                        }
                    }
                } catch (err) {
                    console.warn('[3DTiles] load-model handler failed:', err);
                }
            });
            tiles.addEventListener('dispose-model', (event: any) => {
                try {
                    const key = event && event.tile && event.tile.__h ? String(event.tile.__h) : null;
                    if (key) this.scene._tileFadeEntries.delete(key);
                    if (this.scene._waterMaterial) {
                        try {
                            const tileScene: BABYLON.TransformNode | null = event && event.scene ? event.scene : null;
                            const meshes: any[] = tileScene && (tileScene as any).getChildMeshes
                                ? (tileScene as any).getChildMeshes(false)
                                : [];
                            const wm: any = this.scene._waterMaterial;
                            const list: any[] = wm.renderList || [];
                            for (const mesh of meshes) {
                                const idx = list.indexOf(mesh);
                                if (idx >= 0) list.splice(idx, 1);
                            }
                        } catch (reflErr) {
                            console.warn('[3DTiles] Water reflection remove failed:', reflErr);
                        }
                    }
                } catch (err) {
                    console.warn('[3DTiles] dispose-model handler failed:', err);
                }
            });
            console.debug('[3DTiles] Visual handlers attached (shadow receivers + PBR polish + fade hook)');
        } catch (err) {
            console.warn('[3DTiles] Failed to attach visual handlers:', err);
        }
    }

    updateTileFade(dt: number): void {
        if (this.scene._tileFadeEntries.size === 0) return;
        const step = dt / TILE_FADE_DURATION_S;
        const done: string[] = [];
        for (const [key, entry] of this.scene._tileFadeEntries) {
            entry.t = Math.min(1, entry.t + step);
            for (const mesh of entry.meshes) {
                try { mesh.visibility = entry.t; } catch (_) { /* ignore */ }
            }
            if (entry.t >= 1) done.push(key);
        }
        for (const k of done) this.scene._tileFadeEntries.delete(k);
    }

    private isMeshInsideAnyClipZone(
        mesh: any,
        zones: { centerVec: BABYLON.Vector3; clipRadiusM: number; clipMaxAltM: number }[],
    ): boolean {
        if (!mesh || !mesh.getBoundingInfo) return false;
        const bi = mesh.getBoundingInfo();
        if (!bi || !bi.boundingSphere) return false;
        const bs = bi.boundingSphere;
        const radiusWorld: number = typeof bs.radiusWorld === 'number' ? bs.radiusWorld : 0;
        if (radiusWorld < AIRPORT_OVERLAY_CLIP_MIN_TILE_RADIUS_M) return false;
        const c: BABYLON.Vector3 = bs.centerWorld;
        if (!c) return false;
        for (const z of zones) {
            const dx = c.x - z.centerVec.x;
            const dz = c.z - z.centerVec.z;
            if (dx * dx + dz * dz <= z.clipRadiusM * z.clipRadiusM && c.y <= z.clipMaxAltM) {
                return true;
            }
        }
        return false;
    }

    reEvaluateClipForLoadedTiles(): void {
        if (!this.scene.tiles || !this.scene.tiles.group) return;
        const zones = this.scene._airportClipZones as
            | { centerVec: BABYLON.Vector3; clipRadiusM: number; clipMaxAltM: number }[]
            | undefined;
        const hasZones = !!(zones && zones.length);
        try {
            const meshes: any[] = (this.scene.tiles.group as any).getChildMeshes
                ? (this.scene.tiles.group as any).getChildMeshes(false)
                : [];
            let disabled = 0;
            let enabled = 0;
            for (const mesh of meshes) {
                try {
                    if (hasZones && this.isMeshInsideAnyClipZone(mesh, zones!)) {
                        if (mesh.isEnabled && mesh.isEnabled()) {
                            mesh.setEnabled(false);
                            disabled++;
                        }
                    } else {
                        if (mesh.isEnabled && !mesh.isEnabled()) {
                            mesh.setEnabled(true);
                            enabled++;
                        }
                    }
                } catch (meshErr) {
                    console.warn('[3DTiles] Re-evaluate clip mesh failed:', meshErr);
                }
            }
            console.debug(`[3DTiles] Clip re-evaluation: disabled=${disabled} re-enabled=${enabled} zones=${zones ? zones.length : 0}`);
        } catch (err) {
            console.warn('[3DTiles] reEvaluateClipForLoadedTiles failed:', err);
        }
    }

    applyAerialFogDensity(scene: BABYLON.Scene): void {
        if (!this.scene.planeRoot) return;
        const altM = Math.max(0, this.scene.planeRoot.position.y);
        const altT = Math.max(0, Math.min(1, altM / AERIAL_FOG_ALT_FADE_REF_M));
        const mult = 1.0 - (1.0 - AERIAL_FOG_ALT_FADE_MIN_MULT) * altT;
        scene.fogDensity = this.scene._fogDensityBase * mult;
    }

    buildGround(scene: BABYLON.Scene): void {
        this.scene.ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 20000, height: 20000 }, scene);
        this.scene.ground.position.y = GROUND_Y - 2;
        const mat = new BABYLON.PBRMaterial('groundMat', scene);
        mat.albedoColor = new BABYLON.Color3(0.15, 0.35, 0.12);
        mat.metallic = 0;
        mat.roughness = 0.95;
        this.scene.ground.material = mat;
        this.scene.ground.receiveShadows = true;
        this.scene.ground.freezeWorldMatrix();
    }
}
