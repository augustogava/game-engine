import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { FabulusPrefs } from '../FabulusPrefs.js';
import {
    FAB_SKY_SHADER_VERTEX_URL,
    FAB_SKY_SHADER_FRAGMENT_URL,
    SKY_BOX_SIZE,
    SKY_CLOUD_COVER,
    SKY_CLOUD_INTENSITY,
    SKY_CLOUD_SPEED,
    SKY_CLOUD_SCALE,
    SKY_CLOUD_COLOR_R,
    SKY_CLOUD_COLOR_G,
    SKY_CLOUD_COLOR_B,
    SKY_DAY_FACTOR,
} from '../constants/index.js';

const ZENITH_COLOR = new BABYLON.Color3(0.035, 0.045, 0.075);
const HORIZON_COLOR = new BABYLON.Color3(0.12, 0.09, 0.085);
const TIME_CLAMP = 0.25;

export class SkySystem {
    private scene: FabulusScene;
    private mesh: BABYLON.Mesh | null = null;
    private material: BABYLON.ShaderMaterial | null = null;
    private enabled = false;
    private initialized = false;
    private shadersRegistered = false;
    private shadersRegistering: Promise<boolean> | null = null;
    private timeAccum = 0;
    private readonly cloudColor = new BABYLON.Color3(SKY_CLOUD_COLOR_R, SKY_CLOUD_COLOR_G, SKY_CLOUD_COLOR_B);
    private savedClearColor: BABYLON.Color4 | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    async init(): Promise<void> {
        this.initialized = true;
        if (FabulusPrefs.get().gfxSky !== true) return;
        await this._build();
    }

    private async _registerShaders(): Promise<boolean> {
        if (this.shadersRegistered) return true;
        if (this.shadersRegistering) return this.shadersRegistering;
        this.shadersRegistering = (async () => {
            try {
                const [vsResp, fsResp] = await Promise.all([
                    fetch(FAB_SKY_SHADER_VERTEX_URL),
                    fetch(FAB_SKY_SHADER_FRAGMENT_URL),
                ]);
                if (!vsResp.ok || !fsResp.ok) {
                    throw new Error(`HTTP ${vsResp.status}/${fsResp.status} fetching sky shaders`);
                }
                const store = BABYLON.Effect.ShadersStore as Record<string, string>;
                store['fabSkyVertexShader'] = await vsResp.text();
                store['fabSkyFragmentShader'] = await fsResp.text();
                this.shadersRegistered = true;
                console.debug('[Fabulus] Sky shaders registered');
                return true;
            } catch (err) {
                console.warn('[Fabulus] Sky shader fetch failed:', err);
                return false;
            } finally {
                this.shadersRegistering = null;
            }
        })();
        return this.shadersRegistering;
    }

    private async _build(): Promise<void> {
        if (this.mesh) {
            this.mesh.setEnabled(true);
            this.enabled = true;
            return;
        }
        const ok = await this._registerShaders();
        if (!ok) return;
        const s = this.scene.bScene;
        if (s.isDisposed) return;

        const box = BABYLON.MeshBuilder.CreateBox('fab_sky_dome', { size: SKY_BOX_SIZE }, s);
        box.infiniteDistance = true;
        box.ignoreCameraMaxZ = true;
        box.isPickable = false;
        box.applyFog = false;
        box.renderingGroupId = 0;

        const mat = new BABYLON.ShaderMaterial('fab_sky_mat', s, { vertex: 'fabSky', fragment: 'fabSky' }, {
            attributes: ['position'],
            uniforms: [
                'worldViewProjection', 'time', 'cover', 'intensity', 'speed', 'scale',
                'dayFactor', 'cloudColor', 'sunDir', 'sunColor', 'zenithColor', 'horizonColor',
            ],
        });
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        box.material = mat;

        this.mesh = box;
        this.material = mat;
        this.enabled = true;

        if (!this.savedClearColor) this.savedClearColor = s.clearColor.clone();
        console.debug('[Fabulus] Sky dome created');
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!this.initialized) return;
        if (enabled) {
            this._build().catch(err => console.warn('[Fabulus] Sky enable failed:', err));
        } else if (this.mesh) {
            this.mesh.setEnabled(false);
        }
    }

    update(dt: number): void {
        if (!this.enabled || !this.mesh || !this.material) return;
        const dtClamp = Math.max(0, Math.min(TIME_CLAMP, dt));
        this.timeAccum += dtClamp;

        const sun = this.scene.lightingSystem.getSun();
        const sunDir = sun ? sun.direction : new BABYLON.Vector3(-0.72, -0.48, -0.52).normalize();
        const sunColor = sun ? sun.diffuse : new BABYLON.Color3(0.78, 0.8, 0.92);

        this.material.setFloat('time', this.timeAccum);
        this.material.setFloat('cover', SKY_CLOUD_COVER);
        this.material.setFloat('intensity', SKY_CLOUD_INTENSITY);
        this.material.setFloat('speed', SKY_CLOUD_SPEED);
        this.material.setFloat('scale', SKY_CLOUD_SCALE);
        this.material.setFloat('dayFactor', SKY_DAY_FACTOR);
        this.material.setColor3('cloudColor', this.cloudColor);
        this.material.setVector3('sunDir', sunDir);
        this.material.setColor3('sunColor', sunColor);
        this.material.setColor3('zenithColor', ZENITH_COLOR);
        this.material.setColor3('horizonColor', HORIZON_COLOR);
    }

    dispose(): void {
        try {
            if (this.material) { this.material.dispose(true, true); this.material = null; }
            if (this.mesh) { this.mesh.dispose(); this.mesh = null; }
        } catch (err) {
            console.warn('[Fabulus] Sky dispose failed:', err);
        }
    }
}
