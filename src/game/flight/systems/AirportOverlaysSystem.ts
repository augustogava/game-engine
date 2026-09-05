import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    AIRPORT_OVERLAYS,
    AIRPORT_OVERLAY_DEFAULT_LOAD_RADIUS_M,
    AIRPORT_OVERLAY_DEFAULT_UNLOAD_RADIUS_M,
    AIRPORT_OVERLAY_FADE_DURATION_S,
    AIRPORT_OVERLAY_METADATA_RADIUS_KM,
    FT_TO_M,
    GROUND_Y,
    type AirportOverlayEntry,
} from '../constants/index.js';

interface AirportClipZone {
    centerVec: BABYLON.Vector3;
    clipRadiusM: number;
    clipMaxAltM: number;
}

interface OverlayRuntimeState {
    entry: AirportOverlayEntry;
    icaoUpper: string;
    metadataResolved: boolean;
    centerLat: number | null;
    centerLon: number | null;
    elevationM: number;
    loadedRoot: BABYLON.TransformNode | null;
    loadedMeshes: BABYLON.AbstractMesh[];
    loading: boolean;
    loadFailed: boolean;
    fadeT: number;
    clipZone: AirportClipZone | null;
    dryRoughness: Map<BABYLON.PBRMaterial, number>;
}

const WET_RUNWAY_PRECIP_TYPE_RAIN = 1;
const WET_RUNWAY_ROUGHNESS = 0.18;
const WET_RUNWAY_WETNESS_EPSILON = 0.02;

export class AirportOverlaysSystem {
    private readonly scene: any;
    private readonly _runtimes = new Map<string, OverlayRuntimeState>();
    private _initialized = false;
    private _metadataFetched = false;
    private _metadataFetchInFlight = false;
    private _lastWetness = -1;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    init(_babylonScene: BABYLON.Scene): void {
        if (this._initialized) return;
        this._initialized = true;
        if (!Array.isArray(AIRPORT_OVERLAYS) || AIRPORT_OVERLAYS.length === 0) {
            console.debug('[AirportOverlays] No overlays configured — system idle.');
            return;
        }
        if (!Array.isArray(this.scene._airportClipZones)) {
            this.scene._airportClipZones = [];
        }
        for (const entry of AIRPORT_OVERLAYS) {
            if (!entry || typeof entry.icao !== 'string' || !entry.icao || typeof entry.glbPath !== 'string' || !entry.glbPath) {
                console.warn('[AirportOverlays] Skipping invalid entry:', entry);
                continue;
            }
            const icaoUpper = entry.icao.toUpperCase();
            this._runtimes.set(icaoUpper, {
                entry,
                icaoUpper,
                metadataResolved: false,
                centerLat: null,
                centerLon: null,
                elevationM: 0,
                loadedRoot: null,
                loadedMeshes: [],
                loading: false,
                loadFailed: false,
                fadeT: 0,
                clipZone: null,
                dryRoughness: new Map(),
            });
        }
        console.log(`[AirportOverlays] Initialized with ${this._runtimes.size} configured overlay(s).`);
        this._fetchMetadataIfNeeded();
    }

    private _fetchMetadataIfNeeded(): void {
        if (this._metadataFetched || this._metadataFetchInFlight) return;
        if (this._runtimes.size === 0) return;
        const centerLat = this.scene.originLat;
        const centerLon = this.scene.originLon;
        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
            console.warn('[AirportOverlays] originLat/originLon not yet available — metadata fetch deferred.');
            return;
        }
        this._metadataFetchInFlight = true;
        const url = `/api/airports/nearby?lat=${centerLat}&lng=${centerLon}&radius_km=${AIRPORT_OVERLAY_METADATA_RADIUS_KM}`;
        fetch(url)
            .then((resp) => {
                if (!resp.ok) {
                    console.warn(`[AirportOverlays] /api/airports/nearby returned HTTP ${resp.status}`);
                    return null;
                }
                return resp.json();
            })
            .then((json) => {
                this._metadataFetchInFlight = false;
                if (!json) return;
                const airports: any[] = Array.isArray(json?.data) ? json.data : [];
                let resolved = 0;
                for (const ap of airports) {
                    const icao = (ap?.icao_code || ap?.iata_code || '').toString().toUpperCase();
                    if (!icao) continue;
                    const rt = this._runtimes.get(icao);
                    if (!rt) continue;
                    const aLat = Number(ap?.latitude);
                    const aLon = Number(ap?.longitude);
                    if (!Number.isFinite(aLat) || !Number.isFinite(aLon)) {
                        console.warn(`[AirportOverlays] ${icao}: invalid latitude/longitude in API response.`);
                        continue;
                    }
                    const elevFt = Number(ap?.elevation_ft);
                    rt.centerLat = aLat;
                    rt.centerLon = aLon;
                    rt.elevationM = Number.isFinite(elevFt) ? elevFt * FT_TO_M : 0;
                    rt.metadataResolved = true;
                    resolved++;
                }
                this._metadataFetched = true;
                const missing: string[] = [];
                for (const [icao, rt] of this._runtimes) {
                    if (!rt.metadataResolved) missing.push(icao);
                }
                if (missing.length) {
                    console.warn(`[AirportOverlays] Metadata not resolved for: ${missing.join(', ')} (outside ${AIRPORT_OVERLAY_METADATA_RADIUS_KM}km of spawn or not in DB).`);
                }
                console.log(`[AirportOverlays] Metadata resolved for ${resolved}/${this._runtimes.size} configured airports.`);
            })
            .catch((err) => {
                this._metadataFetchInFlight = false;
                console.warn('[AirportOverlays] Metadata fetch error:', err);
            });
    }

    update(dt: number): void {
        if (!this._initialized || this._runtimes.size === 0) return;
        if (!this._metadataFetched && !this._metadataFetchInFlight) {
            this._fetchMetadataIfNeeded();
        }
        const plane = this.scene.planeRoot as BABYLON.TransformNode | null;
        if (!plane) return;
        const planeX = plane.position.x;
        const planeZ = plane.position.z;
        const fadeStep = dt / AIRPORT_OVERLAY_FADE_DURATION_S;
        for (const rt of this._runtimes.values()) {
            if (!rt.metadataResolved) continue;
            const localPos = this._latLonToLocal(rt.centerLat!, rt.centerLon!, rt.elevationM);
            const dx = planeX - localPos.x;
            const dz = planeZ - localPos.z;
            const distSq = dx * dx + dz * dz;
            const loadRadius = rt.entry.loadRadiusM ?? AIRPORT_OVERLAY_DEFAULT_LOAD_RADIUS_M;
            const unloadRadius = rt.entry.unloadRadiusM ?? AIRPORT_OVERLAY_DEFAULT_UNLOAD_RADIUS_M;
            const loadRadiusSq = loadRadius * loadRadius;
            const unloadRadiusSq = unloadRadius * unloadRadius;
            const isLoaded = !!rt.loadedRoot;
            if (!isLoaded && !rt.loading && !rt.loadFailed && distSq <= loadRadiusSq) {
                this._loadOverlay(rt, localPos);
            } else if (isLoaded && distSq > unloadRadiusSq) {
                this._unloadOverlay(rt);
            } else if (isLoaded && rt.fadeT < 1) {
                rt.fadeT = Math.min(1, rt.fadeT + fadeStep);
                for (const mesh of rt.loadedMeshes) {
                    try { mesh.visibility = rt.fadeT; } catch (_) { /* ignore */ }
                }
            }
        }
        this._updateWetSurfaces();
    }

    /** Rain lowers the PBR roughness of loaded airport surfaces toward a wet, reflective look. */
    private _updateWetSurfaces(): void {
        const precipType = Number(this.scene._precipitationType) || 0;
        const intensity = Number.isFinite(this.scene._precipitationIntensity) ? this.scene._precipitationIntensity : 0;
        const wetness = precipType === WET_RUNWAY_PRECIP_TYPE_RAIN ? Math.max(0, Math.min(1, intensity)) : 0;
        if (Math.abs(wetness - this._lastWetness) < WET_RUNWAY_WETNESS_EPSILON) return;
        this._lastWetness = wetness;
        for (const rt of this._runtimes.values()) {
            if (!rt.loadedRoot) continue;
            for (const [mat, dry] of rt.dryRoughness) {
                try {
                    mat.roughness = dry + (Math.min(dry, WET_RUNWAY_ROUGHNESS) - dry) * wetness;
                } catch (err) {
                    console.warn(`[AirportOverlays] ${rt.icaoUpper}: wet roughness apply failed:`, err);
                }
            }
        }
    }

    private _captureDryRoughness(rt: OverlayRuntimeState, meshes: BABYLON.AbstractMesh[]): void {
        rt.dryRoughness.clear();
        for (const mesh of meshes) {
            const mat = mesh.material;
            if (!(mat instanceof BABYLON.PBRMaterial) || rt.dryRoughness.has(mat)) continue;
            const roughness = typeof mat.roughness === 'number' && Number.isFinite(mat.roughness) ? mat.roughness : 1;
            rt.dryRoughness.set(mat, roughness);
        }
        this._lastWetness = -1;
    }

    private _latLonToLocal(lat: number, lon: number, altM: number): BABYLON.Vector3 {
        const metersPerDegLat = 111320;
        const metersPerDegLon = 111320 * Math.cos(this.scene.originLat * Math.PI / 180);
        const x = (lon - this.scene.originLon) * metersPerDegLon;
        const z = -(lat - this.scene.originLat) * metersPerDegLat;
        const refAlt = Number.isFinite(this.scene.refAlt) ? this.scene.refAlt : 0;
        const y = GROUND_Y + (altM - refAlt);
        return new BABYLON.Vector3(x, y, z);
    }

    private _loadOverlay(rt: OverlayRuntimeState, localPos: BABYLON.Vector3): void {
        const babylonScene: BABYLON.Scene | null = this.scene.scene || (this.scene.planeRoot?.getScene?.() ?? null);
        if (!babylonScene) {
            console.warn(`[AirportOverlays] ${rt.icaoUpper}: no Babylon scene available for load.`);
            return;
        }
        const glbPath = rt.entry.glbPath;
        const lastSlash = glbPath.lastIndexOf('/');
        const folder = lastSlash >= 0 ? glbPath.substring(0, lastSlash + 1) : '';
        const file = lastSlash >= 0 ? glbPath.substring(lastSlash + 1) : glbPath;
        rt.loading = true;
        const altOffset = rt.entry.altOffsetM ?? 0;
        const headingOffset = rt.entry.headingOffsetDeg ?? 0;
        const positionedAt = new BABYLON.Vector3(localPos.x, localPos.y + altOffset, localPos.z);
        BABYLON.SceneLoader.ImportMesh(
            '', folder, file, babylonScene,
            (meshes: BABYLON.AbstractMesh[]) => {
                rt.loading = false;
                if (this.scene._disposed) {
                    for (const m of meshes) { try { m.dispose(); } catch (_) { /* ignore */ } }
                    return;
                }
                if (!meshes || meshes.length === 0) {
                    console.warn(`[AirportOverlays] ${rt.icaoUpper}: load returned no meshes.`);
                    rt.loadFailed = true;
                    return;
                }
                const rootNode = new BABYLON.TransformNode(`airportOverlay_${rt.icaoUpper}`, babylonScene);
                rootNode.position.copyFrom(positionedAt);
                if (headingOffset !== 0) {
                    rootNode.rotationQuaternion = BABYLON.Quaternion.RotationAxis(
                        BABYLON.Vector3.Up(),
                        headingOffset * Math.PI / 180,
                    );
                }
                const importedRoot = meshes[0];
                importedRoot.parent = rootNode;
                for (const m of meshes) {
                    try { m.visibility = 0; } catch (_) { /* ignore */ }
                }
                rt.loadedRoot = rootNode;
                rt.loadedMeshes = meshes;
                rt.fadeT = 0;
                this._captureDryRoughness(rt, meshes);
                const clipZone: AirportClipZone = {
                    centerVec: positionedAt.clone(),
                    clipRadiusM: rt.entry.clipRadiusM,
                    clipMaxAltM: positionedAt.y + rt.entry.clipMaxAltM,
                };
                rt.clipZone = clipZone;
                const zones = this.scene._airportClipZones as AirportClipZone[];
                zones.push(clipZone);
                try {
                    if (this.scene._terrainTilesSystem && typeof this.scene._terrainTilesSystem.reEvaluateClipForLoadedTiles === 'function') {
                        this.scene._terrainTilesSystem.reEvaluateClipForLoadedTiles();
                    }
                } catch (reErr) {
                    console.warn(`[AirportOverlays] ${rt.icaoUpper}: re-evaluate clip failed:`, reErr);
                }
                console.log(`[AirportOverlays] Loaded ${rt.icaoUpper} at (${positionedAt.x.toFixed(1)}, ${positionedAt.y.toFixed(1)}, ${positionedAt.z.toFixed(1)}) clipRadius=${rt.entry.clipRadiusM}m maxAltY=${clipZone.clipMaxAltM.toFixed(1)} meshes=${meshes.length}`);
            },
            undefined,
            (_scene: BABYLON.Scene, message: string, exception?: any) => {
                rt.loading = false;
                rt.loadFailed = true;
                console.warn(`[AirportOverlays] ${rt.icaoUpper}: load failed (${glbPath}): ${message}`, exception);
            },
        );
    }

    private _unloadOverlay(rt: OverlayRuntimeState): void {
        if (rt.clipZone) {
            const zones = this.scene._airportClipZones as AirportClipZone[];
            if (Array.isArray(zones)) {
                const idx = zones.indexOf(rt.clipZone);
                if (idx >= 0) zones.splice(idx, 1);
            }
            rt.clipZone = null;
        }
        for (const mesh of rt.loadedMeshes) {
            try { mesh.dispose(); } catch (_) { /* ignore */ }
        }
        rt.loadedMeshes = [];
        rt.dryRoughness.clear();
        if (rt.loadedRoot) {
            try { rt.loadedRoot.dispose(); } catch (_) { /* ignore */ }
            rt.loadedRoot = null;
        }
        rt.fadeT = 0;
        try {
            if (this.scene._terrainTilesSystem && typeof this.scene._terrainTilesSystem.reEvaluateClipForLoadedTiles === 'function') {
                this.scene._terrainTilesSystem.reEvaluateClipForLoadedTiles();
            }
        } catch (reErr) {
            console.warn(`[AirportOverlays] ${rt.icaoUpper}: re-evaluate clip on unload failed:`, reErr);
        }
        console.log(`[AirportOverlays] Unloaded ${rt.icaoUpper}`);
    }

    dispose(): void {
        for (const rt of this._runtimes.values()) {
            if (rt.loadedRoot || rt.loadedMeshes.length) {
                this._unloadOverlay(rt);
            }
        }
        this._runtimes.clear();
        if (Array.isArray(this.scene._airportClipZones)) {
            this.scene._airportClipZones.length = 0;
        }
        this._initialized = false;
        this._metadataFetched = false;
        this._metadataFetchInFlight = false;
    }
}
