import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { FabulusPrefs } from '../FabulusPrefs.js';
import {
    ATMO_GODRAYS_EXPOSURE,
    ATMO_GODRAYS_DECAY,
    ATMO_GODRAYS_DENSITY,
    ATMO_GODRAYS_WEIGHT,
    ATMO_MIST_SIZE,
    ATMO_MIST_HEIGHT,
    ATMO_MIST_SCROLL,
} from '../constants/index.js';

const GODRAYS_RATIO = 0.5;
const GODRAYS_SAMPLES = 80;
const SUN_DISTANCE = 900;
const MIST_NOISE_SIZE = 256;
const MIST_ALPHA = 0.16;

export class AtmosphereSystem {
    private scene: FabulusScene;
    private godrays: BABYLON.VolumetricLightScatteringPostProcess | null = null;
    private sunMesh: BABYLON.Mesh | null = null;
    private mistMesh: BABYLON.Mesh | null = null;
    private mistTexture: BABYLON.Texture | null = null;
    private enabled = false;
    private initialized = false;
    private scroll = 0;
    private baseFogDensity: number | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        this.initialized = true;
        if (FabulusPrefs.get().gfxVolumetrics !== true) return;
        this._build();
    }

    private _build(): void {
        const s = this.scene.bScene;
        const camera = s.activeCamera;
        if (!camera || s.isDisposed) {
            console.warn('[Fabulus] Atmosphere: no active camera');
            return;
        }
        if (this.godrays) {
            this._setVisible(true);
            this.enabled = true;
            return;
        }

        try {
            const godrays = new BABYLON.VolumetricLightScatteringPostProcess(
                'fab_godrays', GODRAYS_RATIO, camera, undefined, GODRAYS_SAMPLES,
                BABYLON.Texture.BILINEAR_SAMPLINGMODE, s.getEngine(), false,
            );
            const sunMesh = godrays.mesh;
            sunMesh.name = 'fab_godrays_sun';
            const sunMat = sunMesh.material as BABYLON.StandardMaterial;
            if (sunMat) {
                sunMat.emissiveColor = new BABYLON.Color3(0.95, 0.86, 0.72);
                sunMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            }
            sunMesh.scaling.setAll(60);
            godrays.exposure = ATMO_GODRAYS_EXPOSURE;
            godrays.decay = ATMO_GODRAYS_DECAY;
            godrays.density = ATMO_GODRAYS_DENSITY;
            godrays.weight = ATMO_GODRAYS_WEIGHT;
            godrays.useCustomMeshPosition = true;
            this.godrays = godrays;
            this.sunMesh = sunMesh;
        } catch (err) {
            console.warn('[Fabulus] God rays unavailable:', err);
        }

        this._buildMist(s);
        this.enabled = true;
        console.debug('[Fabulus] Atmosphere ready');
    }

    private _buildMist(s: BABYLON.Scene): void {
        const tex = new BABYLON.DynamicTexture('fab_mist_tex', MIST_NOISE_SIZE, s, true);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const img = ctx.createImageData(MIST_NOISE_SIZE, MIST_NOISE_SIZE);
        for (let y = 0; y < MIST_NOISE_SIZE; y++) {
            for (let x = 0; x < MIST_NOISE_SIZE; x++) {
                const idx = (y * MIST_NOISE_SIZE + x) * 4;
                const v = Math.floor(120 + Math.random() * 135);
                img.data[idx] = v; img.data[idx + 1] = v; img.data[idx + 2] = v; img.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.update();
        tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        tex.uScale = 3;
        tex.vScale = 3;
        this.mistTexture = tex;

        const mat = new BABYLON.StandardMaterial('fab_mist_mat', s);
        mat.emissiveColor = new BABYLON.Color3(0.16, 0.16, 0.2);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.opacityTexture = tex;
        mat.alpha = MIST_ALPHA;
        mat.disableLighting = true;
        mat.backFaceCulling = false;

        const plane = BABYLON.MeshBuilder.CreateGround('fab_mist', { width: ATMO_MIST_SIZE, height: ATMO_MIST_SIZE, subdivisions: 1 }, s);
        plane.position.y = ATMO_MIST_HEIGHT;
        plane.material = mat;
        plane.isPickable = false;
        plane.applyFog = false;
        plane.renderingGroupId = 0;
        this.mistMesh = plane;
    }

    private _setVisible(visible: boolean): void {
        if (this.sunMesh) this.sunMesh.setEnabled(visible);
        if (this.mistMesh) this.mistMesh.setEnabled(visible);
    }

    /** Thickens scene fog for rain/fog weather without touching the base density permanently. */
    setFogBoost(boost: boolean): void {
        const s = this.scene.bScene;
        if (s.isDisposed) return;
        if (this.baseFogDensity == null) this.baseFogDensity = s.fogDensity;
        s.fogDensity = this.baseFogDensity * (boost ? 2.4 : 1);
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!this.initialized) return;
        if (enabled) {
            this._build();
        } else {
            this._setVisible(false);
        }
    }

    update(dt: number): void {
        if (!this.enabled) return;

        const sun = this.scene.lightingSystem.getSun();
        const root = this.scene.playerRoot;
        if (this.godrays && sun) {
            const dir = sun.direction.clone().normalize();
            const center = root ? root.position : BABYLON.Vector3.Zero();
            const sunPos = center.subtract(dir.scale(SUN_DISTANCE));
            this.godrays.setCustomMeshPosition(sunPos);
            if (this.sunMesh) this.sunMesh.position.copyFrom(sunPos);
        }

        if (this.mistMesh && this.mistTexture && root) {
            this.mistMesh.position.x = root.position.x;
            this.mistMesh.position.z = root.position.z;
            this.scroll += dt * ATMO_MIST_SCROLL;
            this.mistTexture.uOffset = this.scroll;
            this.mistTexture.vOffset = this.scroll * 0.6;
        }
    }

    dispose(): void {
        try {
            if (this.godrays) {
                const cam = this.scene.bScene.activeCamera;
                if (cam) this.godrays.dispose(cam);
                this.godrays = null;
            }
            if (this.mistMesh) { this.mistMesh.dispose(); this.mistMesh = null; }
            if (this.mistTexture) { this.mistTexture.dispose(); this.mistTexture = null; }
            this.sunMesh = null;
        } catch (err) {
            console.warn('[Fabulus] Atmosphere dispose failed:', err);
        }
    }
}
