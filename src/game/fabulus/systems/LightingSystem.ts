import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';

const HEMI_INTENSITY = 0.55;
const SUN_INTENSITY = 1.85;
const FILL_INTENSITY = 0.35;
const SHADOW_MAP_SIZE_DESKTOP = 4096;
const SHADOW_MAP_SIZE_MOBILE = 2048;
const FOG_DENSITY = 0.0012;
const TORCH_ENABLED = true;
const TORCH_INTENSITY = 1.1;
const TORCH_RANGE = 11;
const TORCH_HEIGHT = 2.6;
const SHADOW_BIAS = 0.0008;
const SHADOW_NORMAL_BIAS = 0.04;

export class LightingSystem {
    private scene: FabulusScene;
    shadowGen: BABYLON.CascadedShadowGenerator | null = null;
    private sun: BABYLON.DirectionalLight | null = null;
    private torch: BABYLON.PointLight | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        const s = this.scene.bScene;
        s.shadowsEnabled = true;

        const hemi = new BABYLON.HemisphericLight('fab_hemi', new BABYLON.Vector3(0, 1, 0), s);
        hemi.intensity = HEMI_INTENSITY;
        hemi.diffuse = new BABYLON.Color3(0.92, 0.88, 0.82);
        hemi.groundColor = new BABYLON.Color3(0.18, 0.14, 0.11);
        hemi.specular = new BABYLON.Color3(0.15, 0.14, 0.12);

        const sun = new BABYLON.DirectionalLight(
            'fab_sun',
            new BABYLON.Vector3(-0.72, -0.48, -0.52).normalize(),
            s,
        );
        sun.position = new BABYLON.Vector3(40, 70, 35);
        sun.intensity = SUN_INTENSITY;
        sun.diffuse = new BABYLON.Color3(1.0, 0.94, 0.82);
        sun.specular = new BABYLON.Color3(0.85, 0.8, 0.65);
        sun.shadowEnabled = true;
        this.sun = sun;

        const isMobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
        const shadowMapSize = isMobile ? SHADOW_MAP_SIZE_MOBILE : SHADOW_MAP_SIZE_DESKTOP;
        const shadowGen = new BABYLON.CascadedShadowGenerator(shadowMapSize, sun);
        shadowGen.lambda = 0.82;
        shadowGen.autoCalcDepthBounds = true;
        shadowGen.stabilizeCascades = true;
        shadowGen.numCascades = isMobile ? 2 : 3;
        shadowGen.cascadeBlendPercentage = 0.08;
        shadowGen.penumbraDarkness = 0.65;
        shadowGen.usePercentageCloserFiltering = true;
        shadowGen.filteringQuality = isMobile ? BABYLON.ShadowGenerator.QUALITY_MEDIUM : BABYLON.ShadowGenerator.QUALITY_HIGH;
        shadowGen.bias = SHADOW_BIAS;
        shadowGen.normalBias = SHADOW_NORMAL_BIAS;
        shadowGen.transparencyShadow = true;
        this.shadowGen = shadowGen;

        const fill = new BABYLON.DirectionalLight(
            'fab_fill',
            new BABYLON.Vector3(0.35, -0.6, 0.55).normalize(),
            s,
        );
        fill.intensity = FILL_INTENSITY;
        fill.diffuse = new BABYLON.Color3(0.75, 0.78, 0.9);
        fill.specular = new BABYLON.Color3(0.05, 0.05, 0.06);

        s.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        s.fogDensity = FOG_DENSITY;
        s.fogColor = new BABYLON.Color3(0.1, 0.095, 0.12);

        if (TORCH_ENABLED) {
            const torch = new BABYLON.PointLight('fab_torch', new BABYLON.Vector3(0, TORCH_HEIGHT, 0), s);
            torch.diffuse = new BABYLON.Color3(1.0, 0.78, 0.48);
            torch.specular = new BABYLON.Color3(1.0, 0.85, 0.55);
            torch.intensity = TORCH_INTENSITY;
            torch.range = TORCH_RANGE;
            torch.falloffType = BABYLON.Light.FALLOFF_GLTF;
            this.torch = torch;
        }
        console.debug('[Fabulus] Lighting ready');
    }

    addShadowCaster(mesh: BABYLON.AbstractMesh): void {
        if (!this.shadowGen || !mesh || mesh.getTotalVertices() <= 0) return;
        try {
            this.shadowGen.addShadowCaster(mesh, true);
        } catch (err) {
            console.warn('[Fabulus] addShadowCaster failed:', err);
        }
    }

    followPlayer(): void {
        const root = this.scene.playerRoot;
        if (!root) return;

        if (this.torch) {
            this.torch.position.set(root.position.x, TORCH_HEIGHT, root.position.z);
        }

        if (this.sun) {
            this.sun.position.set(
                root.position.x + 40,
                70,
                root.position.z + 35,
            );
        }
    }
}
