import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { FabulusPrefs, type FabulusPrefsData } from '../FabulusPrefs.js';
import {
    POSTFX_DOF_FSTOP, POSTFX_DOF_FOCAL_LENGTH,
    POSTFX_MOTION_BLUR_STRENGTH, POSTFX_MOTION_BLUR_SAMPLES,
    POSTFX_SSR_STRENGTH, POSTFX_SSR_MAX_DISTANCE,
    PP_EXPOSURE_KHR, PP_CONTRAST_KHR, PP_CONTRAST_KHR_ULTRA,
} from '../constants/graphicsConstants.js';

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
const CHROMATIC_ABERRATION_AMOUNT = 12;
const CHROMATIC_RADIAL_INTENSITY = 0.7;
const PP_CONTRAST_ULTRA = 1.42;
const VIGNETTE_WEIGHT_ULTRA = 2.0;

export class RenderSystem {
    private scene: FabulusScene;
    private pipeline: BABYLON.DefaultRenderingPipeline | null = null;
    private ssao: BABYLON.SSAO2RenderingPipeline | null = null;
    private ssaoAttached = false;
    private motionBlur: BABYLON.MotionBlurPostProcess | null = null;
    private ssr: BABYLON.SSRRenderingPipeline | null = null;
    private ssrAttached = false;
    private dofObserver: BABYLON.Nullable<BABYLON.Observer<BABYLON.Scene>> = null;
    private highlight: BABYLON.HighlightLayer | null = null;
    private colorCurves: BABYLON.ColorCurves | null = null;
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
        // Cinematic extras (gated on the Ultra-only flags in applyGraphicsSettings).
        pipeline.chromaticAberration.aberrationAmount = CHROMATIC_ABERRATION_AMOUNT;
        pipeline.chromaticAberration.radialIntensity = CHROMATIC_RADIAL_INTENSITY;
        pipeline.chromaticAberrationEnabled = false;
        // Subtle DOF (enabled by gfxAdvancedVfx): focus tracks the camera target distance.
        pipeline.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.Low;
        pipeline.depthOfFieldEnabled = false;
        this.pipeline = pipeline;

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

        // The Ultra-only feature flags also drive the stronger cinematic grade.
        const cinematic = prefs.gfxVolumetrics || prefs.gfxWeather;

        if (prefs.gfxColorGrading) {
            if (!this.colorCurves) {
                this.colorCurves = new BABYLON.ColorCurves();
                this.colorCurves.globalSaturation = GLOBAL_SATURATION;
            }
            // KHR PBR Neutral keeps hues truer than ACES (less washed-out colors);
            // contrast/exposure retuned because Neutral is flatter than ACES.
            pipeline.imageProcessing.toneMappingEnabled = true;
            pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
            pipeline.imageProcessing.contrast = cinematic ? PP_CONTRAST_KHR_ULTRA : PP_CONTRAST_KHR;
            pipeline.imageProcessing.exposure = PP_EXPOSURE_KHR;
            pipeline.imageProcessing.colorCurves = this.colorCurves;
            pipeline.imageProcessing.colorCurvesEnabled = true;
        } else {
            // ACES fallback: keep tone mapping active while bloom is on so HDR highlights stay compressed.
            pipeline.imageProcessing.toneMappingEnabled = prefs.gfxBloom;
            pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
            pipeline.imageProcessing.contrast = 1.0;
            pipeline.imageProcessing.exposure = 1.0;
            pipeline.imageProcessing.colorCurvesEnabled = false;
        }

        if (prefs.gfxVignette) {
            pipeline.imageProcessing.vignetteWeight = cinematic ? VIGNETTE_WEIGHT_ULTRA : VIGNETTE_WEIGHT;
        }
        pipeline.chromaticAberrationEnabled = !this._isMobile() && cinematic;

        const camera = s.activeCamera;
        const wantSsao = prefs.gfxSsao !== 'off';
        if (camera) {
            if (wantSsao && !this.ssao) this._createSsao(camera);
            if (this.ssao) {
                if (wantSsao && !this.ssaoAttached) {
                    s.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('fab_ssao', camera);
                    this.ssaoAttached = true;
                } else if (!wantSsao && this.ssaoAttached) {
                    s.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('fab_ssao', camera);
                    this.ssaoAttached = false;
                }
                this.ssao.totalStrength = prefs.gfxSsao === 'high' ? 1.25 : 0.9;
            }
        }

        this._applyAdvancedPostFx(prefs, camera ?? null);

        this.scene.lightingSystem.applyShadowQuality(prefs.gfxShadowQuality);

        // Toggle the optional Ultra systems live (they may not exist yet during init).
        this.scene.skySystem?.setEnabled(prefs.gfxSky);
        this.scene.atmosphereSystem?.setEnabled(prefs.gfxVolumetrics);
        this.scene.waterSystem?.setEnabled(prefs.gfxWater);
        this.scene.weatherSystem?.setEnabled(prefs.gfxWeather);
        this.scene.atmosphereSystem?.setAmbientParticles(prefs.gfxAdvancedVfx);
        this.scene.vfxSystem.setAdvancedEnabled(prefs.gfxAdvancedVfx);
        this.scene.lightingSystem.setAdvancedFx(prefs.gfxAdvancedVfx);
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
        // Bounds are in world space: subtract the parent's world Y so entity roots
        // placed at terrain height don't get their offset cancelled (feet stay at root Y).
        const parent = modelRoot.parent as BABYLON.TransformNode | null;
        const baseY = parent ? parent.getAbsolutePosition().y : 0;
        modelRoot.scaling.scaleInPlace(scale);
        modelRoot.position.y -= (minY - baseY) * scale;
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

    /** Lazily builds the SSAO2 pipeline on first request so it also works on touch devices. */
    private _createSsao(camera: BABYLON.Camera): void {
        try {
            const ssao = new BABYLON.SSAO2RenderingPipeline('fab_ssao', this.scene.bScene, SSAO_RATIO, [camera]);
            ssao.totalStrength = 0.9;
            ssao.radius = 1.6;
            ssao.samples = 12;
            this.ssao = ssao;
            this.ssaoAttached = true;
        } catch (err) {
            console.warn('[Fabulus] SSAO unavailable:', err);
            this.ssao = null;
            this.ssaoAttached = false;
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

    /** DOF / motion blur / SSR disabled — too heavy for isometric + caused blur at 1 FPS. */
    private _applyAdvancedPostFx(prefs: FabulusPrefsData, camera: BABYLON.Camera | null): void {
        const s = this.scene.bScene;
        const pipeline = this.pipeline;
        if (!pipeline || s.isDisposed) return;

        pipeline.depthOfFieldEnabled = false;
        if (this.dofObserver) {
            s.onBeforeRenderObservable.remove(this.dofObserver);
            this.dofObserver = null;
        }

        if (this.motionBlur) {
            try { this.motionBlur.dispose(camera ?? undefined); } catch { /* already disposed */ }
            this.motionBlur = null;
        }

        if (this.ssr) {
            if (this.ssrAttached && camera) {
                s.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('fab_ssr', camera);
            }
            try { this.ssr.dispose(); } catch { /* already disposed */ }
            this.ssr = null;
            this.ssrAttached = false;
        }
        void prefs;
    }

    dispose(): void {
        FabulusPrefs.offChange(this._onPrefsChange);
        const s = this.scene.bScene;
        const camera = s.activeCamera;
        if (this.dofObserver) {
            s.onBeforeRenderObservable.remove(this.dofObserver);
            this.dofObserver = null;
        }
        if (this.motionBlur) {
            try { this.motionBlur.dispose(camera ?? undefined); } catch { /* already disposed */ }
            this.motionBlur = null;
        }
        if (this.ssr) {
            if (this.ssrAttached && camera) {
                s.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('fab_ssr', camera);
            }
            try { this.ssr.dispose(); } catch { /* already disposed */ }
            this.ssr = null;
            this.ssrAttached = false;
        }
    }
}
