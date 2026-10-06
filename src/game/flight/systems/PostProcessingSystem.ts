import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { UiPreferences } from '../../UiPreferences.js';
import { InputBindings } from '../../InputBindings.js';
import { GFX_SETTINGS_STORAGE_KEY, SSAO_SAMPLES_ULTRA, SSAO_SAMPLES_DEFAULT } from '../constants/index.js';

const POSTFX_FIRST_VISIT_MSAA_SAMPLES = 1;
const SSAO_PIPELINE_NAME = 'ssao';
const SSAO_RATIO = 0.5;
const SSAO_BLUR_RATIO = 0.35;
const SSAO_RADIUS = 3.0;
const SSAO_TOTAL_STRENGTH = 1.2;
const SSAO_BASE = 0.1;
const SSAO_MAX_Z = 250;
const SSAO_MIN_Z_ASPECT = 0.5;
const LENS_FLARE_TEXTURE_SIZE_PX = 128;

export class PostProcessingSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    private readSavedGraphicsSettings(): Record<string, any> | null {
        try {
            const raw = localStorage.getItem(GFX_SETTINGS_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (err) {
            console.warn('[PostFX] Failed to read saved graphics settings:', err);
            return null;
        }
    }

    private createLensFlareTexture(scene: BABYLON.Scene, index: number): BABYLON.DynamicTexture | null {
        try {
            const size = LENS_FLARE_TEXTURE_SIZE_PX;
            const tex = new BABYLON.DynamicTexture(`sunFlareTex_${index}`, { width: size, height: size }, scene, true);
            const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
            const half = size / 2;
            const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
            gradient.addColorStop(0, 'rgba(255,255,255,1)');
            gradient.addColorStop(0.25, 'rgba(255,255,255,0.6)');
            gradient.addColorStop(0.6, 'rgba(255,255,255,0.15)');
            gradient.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.clearRect(0, 0, size, size);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);
            tex.hasAlpha = true;
            tex.update();
            return tex;
        } catch (err) {
            console.warn('[LensFlare] Failed to build procedural flare texture:', err);
            return null;
        }
    }

    ensureSsaoPipeline(scene: BABYLON.Scene, samples: number): BABYLON.SSAO2RenderingPipeline | null {
        if (this.scene.isMobile === true || !scene) return null;
        if (!this.scene._ssao) {
            const ssao = new BABYLON.SSAO2RenderingPipeline(SSAO_PIPELINE_NAME, scene, {
                ssaoRatio: SSAO_RATIO,
                blurRatio: SSAO_BLUR_RATIO,
            });
            ssao.radius = SSAO_RADIUS;
            ssao.totalStrength = SSAO_TOTAL_STRENGTH;
            ssao.base = SSAO_BASE;
            ssao.maxZ = SSAO_MAX_Z;
            ssao.minZAspect = SSAO_MIN_Z_ASPECT;
            this.scene._ssao = ssao;
            this.scene._ssaoAttached = false;
            console.debug(`[SSAO] Pipeline created on demand (samples=${samples})`);
        }
        const safeSamples = Number.isFinite(samples) && samples > 0 ? Math.round(samples) : SSAO_SAMPLES_DEFAULT;
        if (this.scene._ssao.samples !== safeSamples) this.scene._ssao.samples = safeSamples;
        return this.scene._ssao;
    }

    disposeSsaoPipeline(scene: BABYLON.Scene): void {
        const ssao = this.scene._ssao as BABYLON.SSAO2RenderingPipeline | null;
        if (!ssao) return;
        try {
            const cam = scene?.activeCamera;
            if (cam && this.scene._ssaoAttached) scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(SSAO_PIPELINE_NAME, cam);
        } catch (err) {
            console.warn('[SSAO] Detach before dispose failed:', err);
        }
        try { ssao.dispose(true); } catch (err) { console.warn('[SSAO] Dispose failed:', err); }
        this.scene._ssao = null;
        this.scene._ssaoAttached = false;
        console.debug('[SSAO] Pipeline disposed (geometry buffer released)');
    }

    setupPostProcessing(scene: BABYLON.Scene): void {
        const cam = scene.activeCamera;
        const isMobile = this.scene.isMobile === true;
        const saved = this.readSavedGraphicsSettings();
        const savedSamples = Number(saved?.aa);

        this.scene._pipeline = new BABYLON.DefaultRenderingPipeline('pp', true, scene, cam ? [cam] : []);
        this.scene._pipeline.samples        = isMobile ? 1 : (Number.isFinite(savedSamples) && savedSamples > 0 ? savedSamples : POSTFX_FIRST_VISIT_MSAA_SAMPLES);
        this.scene._pipeline.bloomEnabled   = !isMobile && (saved ? saved.bloom !== false : true);
        this.scene._pipeline.bloomWeight    = 0.4;
        this.scene._pipeline.bloomKernel    = 128;
        this.scene._pipeline.bloomScale     = 0.5;
        this.scene._pipeline.bloomThreshold = 0.8;
        this.scene._pipeline.chromaticAberrationEnabled            = !isMobile && saved?.chromatic === true;
        this.scene._pipeline.chromaticAberration.aberrationAmount   = 0.8;
        this.scene._pipeline.chromaticAberration.radialIntensity    = 1.0;
        this.scene._pipeline.sharpenEnabled        = !isMobile;
        this.scene._pipeline.sharpen.edgeAmount    = 0.2;
        this.scene._pipeline.imageProcessingEnabled                 = true;
        this.scene._pipeline.imageProcessing.toneMappingEnabled     = true;
        this.scene._pipeline.imageProcessing.toneMappingType        = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        this.scene._pipeline.imageProcessing.exposure               = 1.0;
        this.scene._pipeline.imageProcessing.contrast               = 1.08;
        this.scene._pipeline.imageProcessing.vignetteEnabled        = !isMobile && (saved ? saved.vignette !== false : true);
        this.scene._pipeline.imageProcessing.vignetteWeight         = 2.2;
        this.scene._pipeline.imageProcessing.vignetteColor          = new BABYLON.Color4(0, 0, 0, 0);
        this.scene._pipeline.imageProcessing.vignetteBlendMode      = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

        this.scene._ssaoAttached = false;
        if (!isMobile && saved?.ssao === true) {
            const ssao = this.ensureSsaoPipeline(scene, saved.preset === 'ultra' ? SSAO_SAMPLES_ULTRA : SSAO_SAMPLES_DEFAULT);
            if (ssao && cam) {
                scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(SSAO_PIPELINE_NAME, cam);
                this.scene._ssaoAttached = true;
            }
        }

        const sunEmitter = scene.getMeshByName('sunMesh') || scene.getLightByName('sun');
        if (sunEmitter && this.scene.isMobile !== true) {
            const lfs = new BABYLON.LensFlareSystem('sunFlare', sunEmitter, scene);
            lfs.borderLimit = 600;
            ([[0.6, 0], [0.2, 0.4], [0.12, 0.7], [0.3, -0.2]] as [number, number][]).forEach(([size, pos], index) => {
                const flare = new BABYLON.LensFlare(size, pos, new BABYLON.Color3(1, 0.95, 0.6), '', lfs);
                flare.texture = this.createLensFlareTexture(scene, index);
            });
            this.scene._lensFlareSystem = lfs;
        } else if (this.scene.isMobile === true) {
            console.info('[LensFlare] Skipped on mobile (light effect disabled for performance)');
        }

        this.scene._initGraphicsSettings(scene);
        this.scene._initAudioSettings();
        this.scene._initUxSettings();
        this.scene._initF12Screenshot();
        this.scene._installGamepadListeners();
        this.scene._buildChecklistOverlay();
        this.scene._buildFpsLatencyOverlay();
        this.scene._buildGEffectsOverlay();
        this.scene._applyAccessibility();
        this.scene._mouseYokeKeyLock = false;
        this.scene._setMouseYoke(UiPreferences.get().mouseYoke);
        this.scene._timeScale = UiPreferences.get().pauseTimeScale;
        this.scene._prefsUnsubscribe = UiPreferences.onChange(() => {
            this.scene._applyAccessibility();
            this.scene._refreshKeysHelper();
        });
        this.scene._bindingsUnsubscribe = InputBindings.onChange(() => {
            this.scene._refreshKeysHelper();
        });
        this.scene._refreshKeysHelper();
    }
}
