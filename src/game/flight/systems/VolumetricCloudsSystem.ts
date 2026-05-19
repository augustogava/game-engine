import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    VOLUMETRIC_CLOUDS_SHADER_URL,
    VOLUMETRIC_CLOUDS_NOISE_URL,
    VOLUMETRIC_CLOUDS_BLUE_NOISE_URL,
} from '../constants/index.js';

export class VolumetricCloudsSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
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
        if (enabled === !!this.scene._volumetricCloudsPost) return;
        const cam = scene.activeCamera;
        if (enabled) {
            if (!cam) {
                console.warn('[VolumetricClouds] No active camera');
                return;
            }
            this.registerVolumetricShader().then((ok) => {
                if (!ok || this.scene._volumetricCloudsPost) return;
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
                    );
                    post.onApply = (effect) => {
                        const camera = scene.activeCamera;
                        if (!camera) return;
                        const vp = camera.getProjectionMatrix().multiply(camera.getViewMatrix());
                        const inv = BABYLON.Matrix.Invert(vp);
                        effect.setMatrix('invViewProj', inv);
                        effect.setVector3('cameraPos', camera.globalPosition);
                        const sd = this.scene._sunLight ? this.scene._sunLight.direction : new BABYLON.Vector3(0, -1, 0.5).normalize();
                        effect.setVector3('sunDir', sd);
                        const sCol = this.scene._sunLight ? this.scene._sunLight.diffuse : new BABYLON.Color3(1, 1, 1);
                        effect.setColor3('sunColor', sCol);
                        const aCol = this.scene._hemiLight ? this.scene._hemiLight.diffuse.scale(0.4) : new BABYLON.Color3(0.3, 0.4, 0.5);
                        effect.setColor3('ambientColor', aCol);
                        effect.setFloat('time', performance.now() * 0.001);
                        effect.setFloat('cloudBaseAlt', 800);
                        effect.setFloat('cloudTopAlt', 5500);
                        effect.setFloat('cloudCoverage', 0.45);
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
            console.debug('[VolumetricClouds] PostProcess disposed; sprite clouds restored');
        }
    }
}
