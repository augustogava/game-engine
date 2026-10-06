import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    VOLUMETRIC_CLOUDS_SHADER_URL,
    VOLUMETRIC_CLOUDS_NOISE_URL,
    VOLUMETRIC_CLOUDS_BLUE_NOISE_URL,
    VOLUMETRIC_CLOUDS_DEFAULT_BASE_M,
    VOLUMETRIC_CLOUDS_DEFAULT_TOP_M,
    VOLUMETRIC_CLOUDS_MIN_BASE_M,
    VOLUMETRIC_CLOUDS_MAX_BASE_M,
    VOLUMETRIC_CLOUDS_STEPS_ULTRA,
    VOLUMETRIC_CLOUDS_LIGHT_STEPS_ULTRA,
    VOLUMETRIC_CLOUDS_STEPS_HIGH,
    VOLUMETRIC_CLOUDS_LIGHT_STEPS_HIGH,
    VOLUMETRIC_CLOUDS_STEPS_DEFAULT,
    VOLUMETRIC_CLOUDS_LIGHT_STEPS_DEFAULT,
} from '../constants/index.js';

const FEET_TO_METERS = 0.3048;
const VOLUMETRIC_AMBIENT_SCALE = 0.4;
const GFX_PRESET_SELECT_ID = 'gfx-preset';

export class VolumetricCloudsSystem {
    private readonly scene: any;
    private _toggleToken = 0;
    private readonly _tmpViewProj = new BABYLON.Matrix();
    private readonly _tmpInvViewProj = new BABYLON.Matrix();
    private readonly _tmpAmbient = new BABYLON.Color3();
    private readonly _fallbackSunDir = new BABYLON.Vector3(0, -1, 0.5).normalize();
    private readonly _fallbackSunColor = new BABYLON.Color3(1, 1, 1);
    private readonly _fallbackAmbient = new BABYLON.Color3(0.3, 0.4, 0.5);

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    private resolveCloudLayerAltitudes(): { baseM: number; topM: number } {
        const layerThicknessM = VOLUMETRIC_CLOUDS_DEFAULT_TOP_M - VOLUMETRIC_CLOUDS_DEFAULT_BASE_M;
        const metarBaseFt = Number(this.scene._metarCloudBaseFt);
        if (this.scene._metarApplied === true && Number.isFinite(metarBaseFt) && metarBaseFt > 0) {
            const baseM = Math.max(VOLUMETRIC_CLOUDS_MIN_BASE_M, Math.min(VOLUMETRIC_CLOUDS_MAX_BASE_M, metarBaseFt * FEET_TO_METERS));
            return { baseM, topM: baseM + layerThicknessM };
        }
        return { baseM: VOLUMETRIC_CLOUDS_DEFAULT_BASE_M, topM: VOLUMETRIC_CLOUDS_DEFAULT_TOP_M };
    }

    private resolveRaymarchDefines(): string {
        const presetEl = document.getElementById(GFX_PRESET_SELECT_ID) as HTMLSelectElement | null;
        const preset = presetEl?.value || '';
        const steps = preset === 'ultra' ? VOLUMETRIC_CLOUDS_STEPS_ULTRA
            : preset === 'high' ? VOLUMETRIC_CLOUDS_STEPS_HIGH
            : VOLUMETRIC_CLOUDS_STEPS_DEFAULT;
        const lightSteps = preset === 'ultra' ? VOLUMETRIC_CLOUDS_LIGHT_STEPS_ULTRA
            : preset === 'high' ? VOLUMETRIC_CLOUDS_LIGHT_STEPS_HIGH
            : VOLUMETRIC_CLOUDS_LIGHT_STEPS_DEFAULT;
        console.debug(`[VolumetricClouds] Raymarch quality preset="${preset || 'custom'}" steps=${steps} lightSteps=${lightSteps}`);
        return `#define MAX_STEPS ${steps}\n#define LIGHT_STEPS ${lightSteps}`;
    }

    async registerVolumetricShader(): Promise<boolean> {
        if (this.scene._volumetricShaderRegistered) return true;
        try {
            const res = await fetch(VOLUMETRIC_CLOUDS_SHADER_URL);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const code = await res.text();
            (BABYLON.Effect.ShadersStore as any)['volumetricCloudsFragmentShader'] = code;
            this.scene._volumetricShaderRegistered = true;
            console.debug('[VolumetricClouds] Shader registered in ShadersStore');
            return true;
        } catch (err) {
            console.warn('[VolumetricClouds] Failed to fetch shader file:', err);
            return false;
        }
    }

    setVolumetricClouds(scene: BABYLON.Scene, enabled: boolean): void {
        const myToken = ++this._toggleToken;
        if (enabled === !!this.scene._volumetricCloudsPost) return;
        const cam = scene.activeCamera;
        if (enabled) {
            if (!cam) {
                console.warn('[VolumetricClouds] No active camera');
                return;
            }
            this.registerVolumetricShader().then((ok) => {
                if (!ok || this.scene._volumetricCloudsPost) return;
                if (this.scene._disposed || myToken !== this._toggleToken) {
                    console.debug('[VolumetricClouds] Enable aborted: feature toggled off or scene disposed during shader load');
                    return;
                }
                try {
                    for (const c of this.scene.cloudInstances) c.mesh.isVisible = false;
                    if (this.scene._overcastMesh) this.scene._overcastMesh.isVisible = false;

                    let depthRenderer: BABYLON.DepthRenderer | null = null;
                    try {
                        depthRenderer = scene.enableDepthRenderer(cam, false);
                    } catch (depthErr) {
                        console.warn('[VolumetricClouds] enableDepthRenderer failed:', depthErr);
                    }
                    const depthMap = depthRenderer ? depthRenderer.getDepthMap() : null;

                    if (!this.scene._volumetricNoiseTexture) {
                        this.scene._volumetricNoiseTexture = new BABYLON.Texture(
                            VOLUMETRIC_CLOUDS_NOISE_URL, scene, false, false,
                            BABYLON.Texture.BILINEAR_SAMPLINGMODE,
                        );
                        this.scene._volumetricNoiseTexture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
                        this.scene._volumetricNoiseTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
                    }
                    if (!this.scene._volumetricBlueNoiseTexture) {
                        this.scene._volumetricBlueNoiseTexture = new BABYLON.Texture(
                            VOLUMETRIC_CLOUDS_BLUE_NOISE_URL, scene, false, false,
                            BABYLON.Texture.NEAREST_SAMPLINGMODE,
                        );
                        this.scene._volumetricBlueNoiseTexture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
                        this.scene._volumetricBlueNoiseTexture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
                    }

                    const post = new BABYLON.PostProcess(
                        'volumetricClouds',
                        'volumetricClouds',
                        ['invViewProj', 'cameraPos', 'sunDir', 'sunColor', 'ambientColor',
                         'time', 'cloudBaseAlt', 'cloudTopAlt', 'cloudCoverage', 'cloudDensity',
                         'farClipZ', 'windOffset', 'screenSize'],
                        ['depthSampler', 'noiseSampler', 'blueNoiseSampler'],
                        0.5,
                        cam,
                        BABYLON.Texture.BILINEAR_SAMPLINGMODE,
                        scene.getEngine(),
                        false,
                        this.resolveRaymarchDefines(),
                    );
                    post.onApply = (effect) => {
                        const camera = scene.activeCamera;
                        if (!camera) return;
                        camera.getProjectionMatrix().multiplyToRef(camera.getViewMatrix(), this._tmpViewProj);
                        this._tmpViewProj.invertToRef(this._tmpInvViewProj);
                        effect.setMatrix('invViewProj', this._tmpInvViewProj);
                        effect.setVector3('cameraPos', camera.globalPosition);
                        const sd = this.scene._sunLight ? this.scene._sunLight.direction : this._fallbackSunDir;
                        effect.setVector3('sunDir', sd);
                        const sCol = this.scene._sunLight ? this.scene._sunLight.diffuse : this._fallbackSunColor;
                        effect.setColor3('sunColor', sCol);
                        const aCol = this.scene._hemiLight
                            ? this.scene._hemiLight.diffuse.scaleToRef(VOLUMETRIC_AMBIENT_SCALE, this._tmpAmbient)
                            : this._fallbackAmbient;
                        effect.setColor3('ambientColor', aCol);
                        effect.setFloat('time', performance.now() * 0.001);
                        const layer = this.resolveCloudLayerAltitudes();
                        effect.setFloat('cloudBaseAlt', layer.baseM);
                        effect.setFloat('cloudTopAlt', layer.topM);
                        const metarCov = Number(this.scene._currentCloudCoverage);
                        const coverage = Number.isFinite(metarCov) && metarCov > 0
                            ? Math.max(0.1, Math.min(1, metarCov))
                            : 0.45;
                        effect.setFloat('cloudCoverage', coverage);
                        effect.setFloat('cloudDensity', 1.2);
                        effect.setFloat('farClipZ', camera.maxZ);
                        effect.setFloat2('windOffset', this.scene._cloudWindOffset.x, this.scene._cloudWindOffset.z);
                        const eng = scene.getEngine();
                        effect.setFloat2('screenSize', eng.getRenderWidth(), eng.getRenderHeight());
                        if (depthMap && this.scene._volumetricNoiseTexture && this.scene._volumetricBlueNoiseTexture) {
                            effect.setTexture('depthSampler', depthMap);
                            effect.setTexture('noiseSampler', this.scene._volumetricNoiseTexture);
                            effect.setTexture('blueNoiseSampler', this.scene._volumetricBlueNoiseTexture);
                        }
                    };
                    this.scene._volumetricCloudsPost = post;
                    console.debug('[VolumetricClouds] PostProcess attached at half-res');
                } catch (err) {
                    console.warn('[VolumetricClouds] Failed to create PostProcess:', err);
                    this.scene._volumetricCloudsPost = null;
                }
            });
        } else if (this.scene._volumetricCloudsPost) {
            try {
                if (cam) this.scene._volumetricCloudsPost.dispose(cam);
                else (this.scene._volumetricCloudsPost as any).dispose();
            } catch (_) { /* ignore */ }
            this.scene._volumetricCloudsPost = null;
            for (const c of this.scene.cloudInstances) c.mesh.isVisible = true;
            try {
                if (cam) scene.disableDepthRenderer(cam);
                else scene.disableDepthRenderer();
            } catch (depthErr) {
                console.warn('[VolumetricClouds] disableDepthRenderer failed:', depthErr);
            }
            console.debug('[VolumetricClouds] PostProcess + DepthRenderer disposed; sprite clouds restored');
        }
    }
}
