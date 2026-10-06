import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    TREES_TEXTURE_BASE_URL,
    VEGETATION_TREE_HALF_WIDTH_M,
    VEGETATION_TREE_HEIGHT_M,
    VEGETATION_GRID_HALF_M,
    VEGETATION_CELL_M,
    VEGETATION_MAX_INSTANCES,
    VEGETATION_FADE_BAND_M,
    VEGETATION_FADE_RANGE_M,
    VEGETATION_RESEED_DIST_M,
    VEGETATION_RESEED_BATCH_PER_FRAME,
    GROUND_Y,
    TERRAIN_UNKNOWN_Y,
    AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS,
} from '../constants/index.js';

const VEGETATION_PROBE_HEIGHT_M = 400;
const VEGETATION_PROBE_LENGTH_M = 1200;
const VEGETATION_ADAPTIVE_REDUCTION_PER_STEP = 0.2;
const VEGETATION_ADAPTIVE_MIN_RATIO = 0.2;

interface VegetationPlacement {
    templateIndex: number;
    x: number;
    z: number;
    scale: number;
    name: string;
}

export class VegetationSystem {
    private readonly scene: any;
    private readonly _probeRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, -1, 0), VEGETATION_PROBE_LENGTH_M);
    private _pendingPlacements: VegetationPlacement[] = [];
    private _pendingIndex = 0;
    private _pendingBaseGroundY = GROUND_Y;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    /** Terrain height under (x, z); falls back to the last known terrain level, then GROUND_Y, when tiles are not loaded. */
    private groundYAt(x: number, z: number, fallbackY: number): number {
        if (typeof this.scene._pickTerrainPreferRunway !== 'function' || !this.scene.tiles) return fallbackY;
        try {
            this._probeRay.origin.set(x, fallbackY + VEGETATION_PROBE_HEIGHT_M, z);
            this._probeRay.length = VEGETATION_PROBE_LENGTH_M;
            const hit = this.scene._pickTerrainPreferRunway(this._probeRay);
            if (hit?.hit && hit.pickedPoint && Number.isFinite(hit.pickedPoint.y)) return hit.pickedPoint.y;
        } catch (err) {
            console.warn('[Vegetation] terrain probe failed:', err);
        }
        return fallbackY;
    }

    setVegetation(scene: BABYLON.Scene, enabled: boolean): void {
        if (enabled) {
            if (!this.scene._vegetationBuilt) this.buildVegetation(scene);
            this.seedVegetation();
            for (const tpl of this.scene._vegetationTemplates) tpl.setEnabled(true);
            console.debug(`[Vegetation] Enabled (${this._pendingPlacements.length} placements seeding progressively)`);
        } else {
            this.clearVegetationInstances();
            for (const tpl of this.scene._vegetationTemplates) tpl.setEnabled(false);
            this.scene._vegetationSeeded = false;
            console.debug('[Vegetation] Disabled');
        }
    }

    buildVegetation(scene: BABYLON.Scene): void {
        if (this.scene._vegetationBuilt) return;
        const species = ['oak', 'pine', 'palm', 'shrub'];
        for (const name of species) {
            try {
                const tex = new BABYLON.Texture(
                    `${TREES_TEXTURE_BASE_URL}${name}.png`,
                    scene,
                    true,
                    false,
                    BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
                );
                tex.hasAlpha = true;
                const mat = new BABYLON.PBRMaterial(`vegMat_${name}`, scene);
                mat.albedoTexture = tex;
                mat.useAlphaFromAlbedoTexture = true;
                mat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST;
                mat.alphaCutOff = 0.5;
                mat.backFaceCulling = false;
                mat.metallic = 0;
                mat.roughness = 0.9;
                mat.maxSimultaneousLights = AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS;
                this.scene._vegetationMaterials.push(mat);

                const tpl = BABYLON.MeshBuilder.CreatePlane(`vegTpl_${name}`, {
                    width: VEGETATION_TREE_HALF_WIDTH_M * 2,
                    height: VEGETATION_TREE_HEIGHT_M,
                    sideOrientation: BABYLON.Mesh.DOUBLESIDE,
                }, scene);
                tpl.material = mat;
                tpl.isPickable = false;
                tpl.receiveShadows = false;
                tpl.isVisible = false;
                tpl.setEnabled(false);
                this.scene._vegetationTemplates.push(tpl);
            } catch (err) {
                console.warn(`[Vegetation] Failed to build template for "${name}":`, err);
            }
        }
        this.scene._vegetationBuilt = this.scene._vegetationTemplates.length > 0;
    }

    clearVegetationInstances(): void {
        for (const inst of this.scene._vegetationInstances) {
            try { inst.dispose(); } catch (_) { /* ignore */ }
        }
        this.scene._vegetationInstances = [];
        this._pendingPlacements = [];
        this._pendingIndex = 0;
    }

    seedVegetation(): void {
        if (!this.scene.planeRoot || this.scene._vegetationTemplates.length === 0) return;

        const cx = this.scene.planeRoot.position.x;
        const cz = this.scene.planeRoot.position.z;
        const knownTerrainY = Number(this.scene.terrainY);
        const baseGroundY = Number.isFinite(knownTerrainY) && knownTerrainY !== TERRAIN_UNKNOWN_Y ? knownTerrainY : GROUND_Y;
        this.scene._vegetationGridCenter.set(cx, baseGroundY, cz);

        const half = VEGETATION_GRID_HALF_M;
        const cellM = VEGETATION_CELL_M;
        const cellsPerSide = Math.floor((half * 2) / cellM);
        const speciesCount = this.scene._vegetationTemplates.length;
        const startX = cx - half;
        const startZ = cz - half;

        const placements: VegetationPlacement[] = [];
        for (let iz = 0; iz < cellsPerSide && placements.length < VEGETATION_MAX_INSTANCES; iz++) {
            for (let ix = 0; ix < cellsPerSide && placements.length < VEGETATION_MAX_INSTANCES; ix++) {
                const cellSeed = (((ix + 1024) * 73856093) ^ ((iz + 1024) * 19349663)) >>> 0;
                const r1 = (cellSeed % 10000) / 10000;
                if (r1 > 0.5) continue;
                const r2 = ((Math.imul(cellSeed, 17) >>> 0) % 10000) / 10000;
                const r3 = ((Math.imul(cellSeed, 31) >>> 0) % 10000) / 10000;
                const r4 = ((Math.imul(cellSeed, 53) >>> 0) % 10000) / 10000;
                const r5 = ((Math.imul(cellSeed, 97) >>> 0) % 10000) / 10000;

                placements.push({
                    templateIndex: Math.min(speciesCount - 1, Math.floor(r4 * speciesCount)),
                    x: startX + ix * cellM + (r2 - 0.5) * cellM,
                    z: startZ + iz * cellM + (r3 - 0.5) * cellM,
                    scale: 0.6 + r5 * 0.6,
                    name: `veg_${ix}_${iz}`,
                });
            }
        }
        this._pendingPlacements = placements;
        this._pendingIndex = 0;
        this._pendingBaseGroundY = baseGroundY;
        this.scene._vegetationSeeded = true;
        this._lastAdaptiveStep = -1;
        console.debug(`[Vegetation] Reseed scheduled: ${placements.length} placements at (${cx.toFixed(0)},${cz.toFixed(0)}), ${VEGETATION_RESEED_BATCH_PER_FRAME} per frame`);
        this.processPendingPlacements();
    }

    private processPendingPlacements(): void {
        if (this._pendingPlacements.length === 0) return;
        const instances: BABYLON.InstancedMesh[] = this.scene._vegetationInstances;
        const total = this._pendingPlacements.length;
        const end = Math.min(total, this._pendingIndex + VEGETATION_RESEED_BATCH_PER_FRAME);
        const visibility = Number.isFinite(this.scene._vegetationVisibility) ? this.scene._vegetationVisibility : 1;
        for (let i = this._pendingIndex; i < end; i++) {
            const p = this._pendingPlacements[i];
            const tpl = this.scene._vegetationTemplates[p.templateIndex];
            if (!tpl) continue;
            try {
                let inst = instances[i];
                if (!inst || inst.sourceMesh !== tpl) {
                    if (inst) inst.dispose();
                    inst = tpl.createInstance(p.name);
                    inst.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
                    inst.isPickable = false;
                    instances[i] = inst;
                }
                const wy = this.groundYAt(p.x, p.z, this._pendingBaseGroundY) + VEGETATION_TREE_HEIGHT_M * 0.5 * p.scale;
                inst.position.set(p.x, wy, p.z);
                inst.scaling.setAll(p.scale);
                inst.visibility = visibility;
            } catch (err) {
                console.warn('[Vegetation] Failed to place instance:', err);
            }
        }
        this._pendingIndex = end;
        if (end < total) return;

        for (let i = instances.length - 1; i >= total; i--) {
            try { instances[i].dispose(); } catch (_) { /* ignore */ }
        }
        instances.length = Math.min(instances.length, total);
        this._pendingPlacements = [];
        this._pendingIndex = 0;
        this._lastAdaptiveStep = -1;
        console.debug(`[Vegetation] Seeded ${instances.length} instances`);
    }

    updateVegetation(): void {
        if (!this.scene._premium.vegetation || !this.scene._vegetationSeeded || !this.scene.planeRoot) return;
        this.processPendingPlacements();
        const px = this.scene.planeRoot.position.x;
        const py = this.scene.planeRoot.position.y;
        const pz = this.scene.planeRoot.position.z;
        const dx = px - this.scene._vegetationGridCenter.x;
        const dz = pz - this.scene._vegetationGridCenter.z;
        if (this._pendingPlacements.length === 0 && (dx * dx + dz * dz) > VEGETATION_RESEED_DIST_M * VEGETATION_RESEED_DIST_M) {
            this.seedVegetation();
            return;
        }
        this.applyAdaptiveBudget();
        const aglM = Math.max(0, py - this.scene._vegetationGridCenter.y);
        const fadeStart = VEGETATION_FADE_BAND_M;
        const fadeEnd   = VEGETATION_FADE_BAND_M + VEGETATION_FADE_RANGE_M;
        let vis = 1;
        if (aglM >= fadeEnd) vis = 0;
        else if (aglM > fadeStart) vis = 1 - (aglM - fadeStart) / (fadeEnd - fadeStart);
        if (Math.abs(vis - this.scene._vegetationVisibility) < 0.01) return;
        this.scene._vegetationVisibility = vis;
        for (const inst of this.scene._vegetationInstances) inst.visibility = vis;
    }

    private _lastAdaptiveStep = -1;

    /** Mirrors TerrainTilesSystem adaptive steps: each step hides a slice of the instance budget. */
    private applyAdaptiveBudget(): void {
        const step = Math.max(0, Number(this.scene._adaptiveQualityStep) || 0);
        if (step === this._lastAdaptiveStep) return;
        this._lastAdaptiveStep = step;
        const instances: BABYLON.InstancedMesh[] = this.scene._vegetationInstances;
        const keepRatio = Math.max(VEGETATION_ADAPTIVE_MIN_RATIO, 1 - step * VEGETATION_ADAPTIVE_REDUCTION_PER_STEP);
        const limit = Math.floor(instances.length * keepRatio);
        for (let i = 0; i < instances.length; i++) {
            const shouldEnable = i < limit;
            if (instances[i].isEnabled() !== shouldEnable) instances[i].setEnabled(shouldEnable);
        }
    }
}
