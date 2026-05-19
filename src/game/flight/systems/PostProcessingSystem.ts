import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { UiPreferences } from '../../UiPreferences.js';
import { InputBindings } from '../../InputBindings.js';

export class PostProcessingSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    setupPostProcessing(scene: BABYLON.Scene): void {
        const cam = scene.activeCamera;
        this.scene._pipeline = new BABYLON.DefaultRenderingPipeline('pp', true, scene, cam ? [cam] : []);
        this.scene._pipeline.samples        = 4;
        this.scene._pipeline.bloomEnabled   = true;
        this.scene._pipeline.bloomWeight    = 0.4;
        this.scene._pipeline.bloomKernel    = 128;
        this.scene._pipeline.bloomScale     = 0.5;
        this.scene._pipeline.bloomThreshold = 0.8;
        this.scene._pipeline.chromaticAberrationEnabled            = true;
        this.scene._pipeline.chromaticAberration.aberrationAmount   = 0.8;
        this.scene._pipeline.chromaticAberration.radialIntensity    = 1.0;
        this.scene._pipeline.sharpenEnabled        = true;
        this.scene._pipeline.sharpen.edgeAmount    = 0.2;
        this.scene._pipeline.imageProcessingEnabled                 = true;
        this.scene._pipeline.imageProcessing.toneMappingEnabled     = true;
        this.scene._pipeline.imageProcessing.toneMappingType        = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        this.scene._pipeline.imageProcessing.exposure               = 1.0;
        this.scene._pipeline.imageProcessing.contrast               = 1.08;
        this.scene._pipeline.imageProcessing.vignetteEnabled        = true;
        this.scene._pipeline.imageProcessing.vignetteWeight         = 2.2;
        this.scene._pipeline.imageProcessing.vignetteColor          = new BABYLON.Color4(0, 0, 0, 0);
        this.scene._pipeline.imageProcessing.vignetteBlendMode      = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

        this.scene._ssao = new BABYLON.SSAO2RenderingPipeline('ssao', scene, {
            ssaoRatio: 0.5,
            blurRatio: 0.5,
        });
        this.scene._ssao.radius = 3.0;
        this.scene._ssao.totalStrength = 1.2;
        this.scene._ssao.base = 0.1;
        this.scene._ssao.samples = 16;
        this.scene._ssao.maxZ = 250;
        this.scene._ssao.minZAspect = 0.5;
        if (cam) scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', cam);

        try {
            const prePass = scene.prePassRenderer;
            if (prePass) {
                if (this.scene._skyMaterial) prePass.excludedMaterials.push(this.scene._skyMaterial);
                for (const cm of (this.scene._cloudMats || [])) {
                    if (cm) prePass.excludedMaterials.push(cm);
                }
                if (this.scene._sunMeshMat) prePass.excludedMaterials.push(this.scene._sunMeshMat);
                if (this.scene._sunHaloMat) prePass.excludedMaterials.push(this.scene._sunHaloMat);
                if (this.scene._moonMat) prePass.excludedMaterials.push(this.scene._moonMat);
                if (this.scene._moonHaloMat) prePass.excludedMaterials.push(this.scene._moonHaloMat);
            }
        } catch (err) {
            console.warn('[PostProcessing] prePass exclusion failed:', err);
        }

        const sunEmitter = scene.getMeshByName('sunMesh') || scene.getLightByName('sun');
        if (sunEmitter) {
            const lfs = new BABYLON.LensFlareSystem('sunFlare', sunEmitter, scene);
            lfs.borderLimit = 600;
            ([[0.6, 0], [0.2, 0.4], [0.12, 0.7], [0.3, -0.2]] as [number, number][]).forEach(([size, pos]) => {
                new BABYLON.LensFlare(size, pos, new BABYLON.Color3(1, 0.95, 0.6),
                    'https://assets.babylonjs.com/textures/flare.png', lfs);
            });
            this.scene._lensFlareSystem = lfs;
        }

        this.scene._initGraphicsSettings(scene);
        this.scene._initAudioSettings();
        this.scene._initUxSettings();
        this.scene._initF12Screenshot();
        this.scene._installGamepadListeners();
        this.scene._buildChecklistOverlay();
        this.scene._buildFpsLatencyOverlay();
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
