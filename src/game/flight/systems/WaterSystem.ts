import * as BABYLON from '@babylonjs/core';
import { WaterMaterial } from '@babylonjs/materials/water';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    WATER_PLANE_SIZE_M,
    WATER_PLANE_Y_OFFSET_M,
    WATER_NORMAL_RES,
    WATER_BUMP_URL,
    WATER_WIND_FORCE,
    WATER_WIND_KT_TO_FORCE,
    WATER_WAVE_HEIGHT_M,
    WATER_BUMP_HEIGHT,
    WATER_WAVE_LENGTH_M,
    WATER_COLOR_R,
    WATER_COLOR_G,
    WATER_COLOR_B,
    WATER_COLOR_BLEND,
    AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS,
} from '../constants/index.js';

export class WaterSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    buildWater(scene: BABYLON.Scene): void {
        try {
            const waterSize = WATER_PLANE_SIZE_M;
            const water = BABYLON.MeshBuilder.CreateGround('waterPlane', { width: waterSize, height: waterSize, subdivisions: 16 }, scene);
            water.position.y = WATER_PLANE_Y_OFFSET_M - this.scene.refAlt;
            water.isPickable = false;
            water.freezeWorldMatrix();
            const wm = new WaterMaterial('waterMat', scene, new BABYLON.Vector2(WATER_NORMAL_RES, WATER_NORMAL_RES));
            wm.backFaceCulling = true;
            wm.bumpTexture = new BABYLON.Texture(WATER_BUMP_URL, scene);
            wm.windForce = WATER_WIND_FORCE;
            wm.waveHeight = WATER_WAVE_HEIGHT_M;
            wm.bumpHeight = WATER_BUMP_HEIGHT;
            wm.waveLength = WATER_WAVE_LENGTH_M;
            wm.waterColor = new BABYLON.Color3(WATER_COLOR_R, WATER_COLOR_G, WATER_COLOR_B);
            wm.colorBlendFactor = WATER_COLOR_BLEND;
            wm.maxSimultaneousLights = AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS;
            if (this.scene._skyboxMesh) {
                try { wm.addToRenderList(this.scene._skyboxMesh); } catch (_) { /* ignore */ }
            }
            water.material = wm;
            const prePass = scene.prePassRenderer;
            if (prePass) { prePass.excludedMaterials.push(wm); }
            this.scene._waterMesh = water;
            this.scene._waterMaterial = wm;
            console.log('[Water] Sea-level plane created');
        } catch (err) {
            console.warn('[Water] Build failed:', err);
        }
    }

    disposeWater(): void {
        if (this.scene._waterMesh) { try { this.scene._waterMesh.dispose(); } catch (_) { /* ignore */ } this.scene._waterMesh = null; }
        if (this.scene._waterMaterial) { try { this.scene._waterMaterial.dispose(); } catch (_) { /* ignore */ } this.scene._waterMaterial = null; }
    }

    setWaterTilesReflection(enabled: boolean): void {
        if (!this.scene._waterMaterial || !this.scene.tiles) return;
        const wm = this.scene._waterMaterial as any;
        try {
            const list: any[] = wm.renderList || (wm.renderList = []);
            const groupIdx = list.indexOf(this.scene.tiles.group);
            if (groupIdx >= 0) list.splice(groupIdx, 1);
            const meshes: any[] = (this.scene.tiles.group as any).getChildMeshes
                ? (this.scene.tiles.group as any).getChildMeshes(false)
                : [];
            if (enabled) {
                let added = 0;
                for (const m of meshes) {
                    if (m && (m as any).getClassName && list.indexOf(m) < 0) {
                        list.push(m);
                        added++;
                    }
                }
                console.debug(`[Water] Added ${added} existing tile meshes to reflection render list`);
            } else {
                let removed = 0;
                for (const m of meshes) {
                    const idx = list.indexOf(m);
                    if (idx >= 0) { list.splice(idx, 1); removed++; }
                }
                console.debug(`[Water] Removed ${removed} tile meshes from reflection render list`);
            }
        } catch (err) {
            console.warn('[Water] Reflection list mutation failed:', err);
        }
    }

    updateWaterWind(dt: number): void {
        if (!this.scene._waterMaterial) return;
        this.scene._waterWindTimer += dt;
        if (this.scene._waterWindTimer < 1.0) return;
        this.scene._waterWindTimer = 0;
        try {
            const wind = this.scene._getWindAtAltitude(0);
            const dirRad = (wind.dirDeg * Math.PI) / 180;
            this.scene._waterWindDir.set(Math.sin(dirRad), Math.cos(dirRad));
            const wm = this.scene._waterMaterial as any;
            wm.windDirection = this.scene._waterWindDir;
            // Keep the sign convention of WATER_WIND_FORCE (negative = default wave travel direction) and only scale magnitude.
            const forceSign = WATER_WIND_FORCE < 0 ? -1 : 1;
            const speedKt = Number.isFinite(wind.speedKt) ? Math.max(0, wind.speedKt) : 0;
            wm.windForce = forceSign * Math.max(Math.abs(WATER_WIND_FORCE), speedKt * WATER_WIND_KT_TO_FORCE);
        } catch (_) { /* ignore */ }
    }
}
