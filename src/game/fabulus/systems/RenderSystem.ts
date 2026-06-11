import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { FabulusPrefs, type FabulusPrefsData } from '../FabulusPrefs.js';

const ENV_URL_LOCAL = 'models/rpg/env/environmentSpecular.env';
const ENV_URL_CDN = 'https://assets.babylonjs.com/environments/environmentSpecular.env';
const PBR_MAX_SIMULTANEOUS_LIGHTS = 8;
const PIPELINE_SAMPLES_MOBILE = 1;
const SSAO_RATIO = 0.75;
const GRAIN_INTENSITY = 7;
const ENVIRONMENT_INTENSITY = 0.4;

// Diablo-like grade: dark desaturated world with high contrast and a strong vignette.
const PP_EXPOSURE = 1.0;
const PP_CONTRAST = 1.3;
const VIGNETTE_WEIGHT = 1.6;
const GLOBAL_SATURATION = -25;

export class RenderSystem {
    private scene: FabulusScene;
    private pipeline: BABYLON.DefaultRenderingPipeline | null = null;
    private ssao: BABYLON.SSAO2RenderingPipeline | null = null;
    private ssaoAttached = false;
    private highlight: BABYLON.HighlightLayer | null = null;
    private envReady = false;
    private _onPrefsChange = (prefs: FabulusPrefsData): void => this.applyGraphicsSettings(prefs);

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        const s = this.scene.bScene;
        const isMobile = this._isMobile();

        s.clearColor = new BABYLON.Color4(0.02, 0.022, 0.032, 1);
        s.ambientColor = new BABYLON.Color3(0.02, 0.018, 0.016);
        s.environmentIntensity = ENVIRONMENT_INTENSITY;

        this._loadEnvironment(s);

        const camera = s.activeCamera;
        if (!camera) {
            console.warn('[Fabulus] RenderSystem: no active camera for pipeline');
            return;
        }

        const pipeline = new BABYLON.DefaultRenderingPipeline('fab_pp', true, s, [camera]);
        pipeline.samples = PIPELINE_SAMPLES_MOBILE;
        pipeline.imageProcessingEnabled = true;
        pipeline.imageProcessing.toneMappingEnabled = true;
        pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        pipeline.imageProcessing.exposure = PP_EXPOSURE;
        pipeline.imageProcessing.contrast = PP_CONTRAST;
        pipeline.imageProcessing.vignetteEnabled = !isMobile;
        pipeline.imageProcessing.vignetteWeight = VIGNETTE_WEIGHT;
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
                this.ssaoAttached = true;
            } catch (err) {
                console.warn('[Fabulus] SSAO unavailable:', err);
            }
        }

        const highlight = new BABYLON.HighlightLayer('fab_highlight', s, { blurHorizontalSize: 0.6, blurVerticalSize: 0.6 });
        highlight.innerGlow = false;
        this.highlight = highlight;

        this.applyGraphicsSettings(FabulusPrefs.get());
        FabulusPrefs.onChange(this._onPrefsChange);

        console.debug('[Fabulus] Render pipeline ready');
    }

    /** Applies the gfx_* settings to the live pipeline (runtime, no reload required). */
    applyGraphicsSettings(prefs: FabulusPrefsData): void {
        const s = this.scene.bScene;
        const pipeline = this.pipeline;
        if (!pipeline || s.isDisposed) return;

        pipeline.fxaaEnabled = prefs.gfxAntialiasing === 'fxaa';
        pipeline.samples = prefs.gfxAntialiasing === 'msaa4' ? 4 : prefs.gfxAntialiasing === 'msaa2' ? 2 : 1;

        const scale = Math.max(0.5, Math.min(1.5, prefs.gfxRenderScale));
        s.getEngine().setHardwareScalingLevel(1 / scale);

        pipeline.bloomEnabled = prefs.gfxBloom;
        pipeline.sharpenEnabled = prefs.gfxSharpen;
        pipeline.imageProcessing.vignetteEnabled = prefs.gfxVignette;

        if (prefs.gfxColorGrading) {
            pipeline.imageProcessing.toneMappingEnabled = true;
            pipeline.imageProcessing.contrast = PP_CONTRAST;
            pipeline.imageProcessing.exposure = PP_EXPOSURE;
            const curves = new BABYLON.ColorCurves();
            curves.globalSaturation = GLOBAL_SATURATION;
            pipeline.imageProcessing.colorCurves = curves;
            pipeline.imageProcessing.colorCurvesEnabled = true;
        } else {
            pipeline.imageProcessing.toneMappingEnabled = false;
            pipeline.imageProcessing.contrast = 1.0;
            pipeline.imageProcessing.exposure = 1.0;
            pipeline.imageProcessing.colorCurvesEnabled = false;
        }

        const camera = s.activeCamera;
        if (this.ssao && camera) {
            const wantSsao = prefs.gfxSsao !== 'off';
            if (wantSsao && !this.ssaoAttached) {
                s.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('fab_ssao', camera);
                this.ssaoAttached = true;
            } else if (!wantSsao && this.ssaoAttached) {
                s.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('fab_ssao', camera);
                this.ssaoAttached = false;
            }
            this.ssao.totalStrength = prefs.gfxSsao === 'high' ? 1.25 : 0.9;
        }

        this.scene.lightingSystem.applyShadowQuality(prefs.gfxShadowQuality);
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

    /** All renderable meshes under a loaded GLB root (nested children included). */
    collectModelMeshes(modelRoot: BABYLON.Node): BABYLON.AbstractMesh[] {
        const meshes = modelRoot.getChildMeshes(true);
        if (meshes.length > 0) return meshes;
        if (modelRoot instanceof BABYLON.AbstractMesh && modelRoot.getTotalVertices() > 0) {
            return [modelRoot];
        }
        return [];
    }

    prepareMeshes(meshes: BABYLON.AbstractMesh[], options?: { castShadow?: boolean; receiveShadow?: boolean }): void {
        const castShadow = options?.castShadow !== false;
        const receiveShadow = options?.receiveShadow !== false;
        const seenMats = new Set<BABYLON.Material>();

        for (const mesh of meshes) {
            if (!mesh || mesh.getTotalVertices() <= 0) continue;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.refreshBoundingInfo(true, false);
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
                s.environmentIntensity = ENVIRONMENT_INTENSITY;
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

    dispose(): void {
        FabulusPrefs.offChange(this._onPrefsChange);
    }
}
