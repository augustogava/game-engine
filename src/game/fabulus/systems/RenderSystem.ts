import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';

const ENV_URL_LOCAL = 'models/rpg/env/environmentSpecular.env';
const ENV_URL_CDN = 'https://assets.babylonjs.com/environments/environmentSpecular.env';
const PBR_MAX_SIMULTANEOUS_LIGHTS = 8;
const PIPELINE_SAMPLES_DESKTOP = 4;
const PIPELINE_SAMPLES_MOBILE = 1;
const SSAO_RATIO = 0.75;
const GRAIN_INTENSITY = 7;

export class RenderSystem {
    private scene: FabulusScene;
    private pipeline: BABYLON.DefaultRenderingPipeline | null = null;
    private ssao: BABYLON.SSAO2RenderingPipeline | null = null;
    private highlight: BABYLON.HighlightLayer | null = null;
    private envReady = false;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        const s = this.scene.bScene;
        const isMobile = this._isMobile();

        s.clearColor = new BABYLON.Color4(0.07, 0.075, 0.1, 1);
        s.ambientColor = new BABYLON.Color3(0.08, 0.07, 0.06);
        s.environmentIntensity = 1.35;

        this._loadEnvironment(s);

        const camera = s.activeCamera;
        if (!camera) {
            console.warn('[Fabulus] RenderSystem: no active camera for pipeline');
            return;
        }

        const pipeline = new BABYLON.DefaultRenderingPipeline('fab_pp', true, s, [camera]);
        pipeline.samples = isMobile ? PIPELINE_SAMPLES_MOBILE : PIPELINE_SAMPLES_DESKTOP;
        pipeline.imageProcessingEnabled = true;
        pipeline.imageProcessing.toneMappingEnabled = true;
        pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        pipeline.imageProcessing.exposure = 1.15;
        pipeline.imageProcessing.contrast = 1.12;
        pipeline.imageProcessing.vignetteEnabled = !isMobile;
        pipeline.imageProcessing.vignetteWeight = 1.0;
        pipeline.imageProcessing.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
        pipeline.bloomEnabled = !isMobile;
        pipeline.bloomThreshold = 0.82;
        pipeline.bloomWeight = 0.28;
        pipeline.bloomKernel = 96;
        pipeline.bloomScale = 0.45;
        pipeline.sharpenEnabled = !isMobile;
        pipeline.sharpen.edgeAmount = 0.18;
        pipeline.grainEnabled = !isMobile;
        pipeline.grain.intensity = GRAIN_INTENSITY;
        pipeline.grain.animated = true;
        this.pipeline = pipeline;

        if (!isMobile) {
            try {
                const ssao = new BABYLON.SSAO2RenderingPipeline('fab_ssao', s, SSAO_RATIO, [camera]);
                ssao.totalStrength = 0.9;
                ssao.radius = 1.6;
                ssao.samples = 12;
                this.ssao = ssao;
            } catch (err) {
                console.warn('[Fabulus] SSAO unavailable:', err);
            }
        }

        const highlight = new BABYLON.HighlightLayer('fab_highlight', s, { blurHorizontalSize: 0.6, blurVerticalSize: 0.6 });
        highlight.innerGlow = false;
        this.highlight = highlight;

        console.debug('[Fabulus] Render pipeline ready');
    }

    getHighlightLayer(): BABYLON.HighlightLayer | null {
        return this.highlight;
    }

    isMobileDevice(): boolean {
        return this._isMobile();
    }

    normalizeModelHeight(modelRoot: BABYLON.TransformNode, meshes: BABYLON.AbstractMesh[], targetHeight: number): number {
        let minY = Infinity;
        let maxY = -Infinity;
        for (const m of meshes) {
            if (!m.getTotalVertices()) continue;
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            minY = Math.min(minY, bb.minimumWorld.y);
            maxY = Math.max(maxY, bb.maximumWorld.y);
        }
        const height = maxY - minY;
        if (height <= 0.01) return 1;
        const scale = targetHeight / height;
        modelRoot.scaling.scaleInPlace(scale);
        modelRoot.position.y -= minY * scale;
        return scale;
    }

    prepareMeshes(meshes: BABYLON.AbstractMesh[], options?: { castShadow?: boolean; receiveShadow?: boolean }): void {
        const castShadow = options?.castShadow !== false;
        const receiveShadow = options?.receiveShadow !== false;
        const seenMats = new Set<BABYLON.Material>();

        for (const mesh of meshes) {
            if (!mesh || mesh.getTotalVertices() <= 0) continue;
            mesh.alwaysSelectAsActiveMesh = true;
            if (receiveShadow) mesh.receiveShadows = true;
            if (castShadow) this.scene.lightingSystem.addShadowCaster(mesh);

            const mat = mesh.material;
            if (!mat || seenMats.has(mat)) continue;
            seenMats.add(mat);
            this._tuneMaterial(mat);
        }
    }

    private _tuneMaterial(mat: BABYLON.Material): void {
        if (mat instanceof BABYLON.PBRMaterial) {
            const pbr = mat;
            pbr.maxSimultaneousLights = PBR_MAX_SIMULTANEOUS_LIGHTS;
            if (pbr.metallic == null || pbr.metallic < 0.01) pbr.metallic = 0.05;
            if (pbr.roughness == null || pbr.roughness > 0.98) pbr.roughness = Math.min(0.92, pbr.roughness || 0.75);
            pbr.environmentIntensity = this.scene.bScene.environmentIntensity;
            pbr.usePhysicalLightFalloff = true;
            pbr.backFaceCulling = true;
            if (!pbr.albedoTexture && pbr.albedoColor) {
                const lum = pbr.albedoColor.r * 0.299 + pbr.albedoColor.g * 0.587 + pbr.albedoColor.b * 0.114;
                if (lum < 0.12) pbr.albedoColor = pbr.albedoColor.scale(1.25);
                if (lum > 0.72) pbr.albedoColor = pbr.albedoColor.scale(0.82);
            }
            return;
        }
        if (mat instanceof BABYLON.StandardMaterial) {
            const std = mat;
            std.maxSimultaneousLights = PBR_MAX_SIMULTANEOUS_LIGHTS;
            if (std.diffuseColor) {
                const lum = std.diffuseColor.r * 0.299 + std.diffuseColor.g * 0.587 + std.diffuseColor.b * 0.114;
                if (lum < 0.15) std.diffuseColor = std.diffuseColor.scale(1.25);
            }
        }
    }

    private _loadEnvironment(s: BABYLON.Scene): void {
        fetch(ENV_URL_LOCAL, { method: 'HEAD' })
            .then(res => this._applyEnvironment(s, res.ok ? ENV_URL_LOCAL : ENV_URL_CDN))
            .catch(() => this._applyEnvironment(s, ENV_URL_CDN));
    }

    private _applyEnvironment(s: BABYLON.Scene, url: string): void {
        if (s.isDisposed) return;
        try {
            const envTex = BABYLON.CubeTexture.CreateFromPrefilteredData(url, s);
            s.environmentTexture = envTex;
            envTex.onLoadObservable.add(() => {
                if (this.scene.bScene.isDisposed) return;
                s.environmentIntensity = 1.35;
                this.envReady = true;
                console.debug('[Fabulus] Environment map loaded:', url);
            });
        } catch (err) {
            console.warn('[Fabulus] Environment map load failed:', err);
        }
    }

    private _isMobile(): boolean {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
}
