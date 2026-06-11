import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { FabulusPrefs } from '../FabulusPrefs.js';
import {
    FAB_WATER_SHADER_VERTEX_URL,
    FAB_WATER_SHADER_FRAGMENT_URL,
    WATER_LEVEL,
    WATER_POOL_COUNT,
    WATER_LAVA_CHANCE,
    MAP_HALF,
} from '../constants/index.js';

const TIME_CLAMP = 0.25;
const WATER_FBM_OCTAVES_HIGH = 4;
const WATER_FBM_OCTAVES_LOW = 2;
const POOL_MIN_RADIUS = 4;
const POOL_MAX_RADIUS = 8;
const POOL_MIN_DIST_FROM_CENTER = 12;
const WATER_BASE = new BABYLON.Color3(0.02, 0.08, 0.13);
const WATER_TINT = new BABYLON.Color3(0.18, 0.34, 0.4);
const LAVA_BASE = new BABYLON.Color3(0.12, 0.02, 0.0);
const LAVA_TINT = new BABYLON.Color3(0.55, 0.18, 0.04);

interface WaterPool {
    mesh: BABYLON.Mesh;
    material: BABYLON.ShaderMaterial;
    lava: boolean;
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a += 0x6D2B79F5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class WaterSystem {
    private scene: FabulusScene;
    private pools: WaterPool[] = [];
    private enabled = false;
    private initialized = false;
    private timeAccum = 0;
    private shadersRegistered = false;
    private shadersRegistering: Promise<boolean> | null = null;
    private readonly fallbackSunDir = new BABYLON.Vector3(-0.72, -0.48, -0.52).normalize();
    private readonly zeroCamPos = BABYLON.Vector3.Zero();

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    async init(): Promise<void> {
        this.initialized = true;
        if (FabulusPrefs.get().gfxWater !== true) return;
        await this._build();
    }

    private async _registerShaders(): Promise<boolean> {
        if (this.shadersRegistered) return true;
        if (this.shadersRegistering) return this.shadersRegistering;
        this.shadersRegistering = (async () => {
            try {
                const [vsResp, fsResp] = await Promise.all([
                    fetch(FAB_WATER_SHADER_VERTEX_URL),
                    fetch(FAB_WATER_SHADER_FRAGMENT_URL),
                ]);
                if (!vsResp.ok || !fsResp.ok) {
                    throw new Error(`HTTP ${vsResp.status}/${fsResp.status} fetching water shaders`);
                }
                const store = BABYLON.Effect.ShadersStore as Record<string, string>;
                store['fabWaterVertexShader'] = await vsResp.text();
                store['fabWaterFragmentShader'] = await fsResp.text();
                this.shadersRegistered = true;
                console.debug('[Fabulus] Water shaders registered');
                return true;
            } catch (err) {
                console.warn('[Fabulus] Water shader fetch failed:', err);
                return false;
            } finally {
                this.shadersRegistering = null;
            }
        })();
        return this.shadersRegistering;
    }

    private async _build(): Promise<void> {
        if (this.pools.length > 0) {
            for (const p of this.pools) p.mesh.setEnabled(true);
            this.enabled = true;
            return;
        }
        const ok = await this._registerShaders();
        if (!ok) return;
        const s = this.scene.bScene;
        if (s.isDisposed) return;

        const rand = mulberry32(1337);
        for (let i = 0; i < WATER_POOL_COUNT; i++) {
            const x = (rand() * 2 - 1) * (MAP_HALF - POOL_MAX_RADIUS - 4);
            const z = (rand() * 2 - 1) * (MAP_HALF - POOL_MAX_RADIUS - 4);
            if (Math.hypot(x, z) < POOL_MIN_DIST_FROM_CENTER) continue;
            const radius = POOL_MIN_RADIUS + rand() * (POOL_MAX_RADIUS - POOL_MIN_RADIUS);
            const lava = rand() < WATER_LAVA_CHANCE;
            this._createPool(s, x, z, radius, lava, i);
        }
        this.enabled = true;
        console.debug(`[Fabulus] Water ready (${this.pools.length} pools)`);
    }

    private _createPool(s: BABYLON.Scene, x: number, z: number, radius: number, lava: boolean, i: number): void {
        const disc = BABYLON.MeshBuilder.CreateDisc(`fab_water_${i}`, { radius, tessellation: 48 }, s);
        disc.rotation.x = Math.PI / 2;
        disc.position.set(x, WATER_LEVEL, z);
        disc.isPickable = false;
        disc.applyFog = true;
        disc.receiveShadows = true;

        // Bind the scene environment cube as a reflection source when it is already available.
        const envTex = s.environmentTexture;
        const reflective = !lava && !!envTex;
        const mat = new BABYLON.ShaderMaterial(`fab_water_mat_${i}`, s, { vertex: 'fabWater', fragment: 'fabWater' }, {
            attributes: ['position', 'uv'],
            uniforms: ['world', 'worldViewProjection', 'time', 'lava', 'cameraPosition', 'sunDir', 'baseColor', 'tintColor', 'octaves'],
            samplers: reflective ? ['reflectionSampler'] : [],
            defines: reflective ? ['#define REFLECTION'] : [],
            needAlphaBlending: true,
        });
        mat.backFaceCulling = false;
        // Transparent surface: blend and avoid depth fighting with the ground at the same level.
        mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        mat.zOffset = -2;
        mat.setColor3('baseColor', lava ? LAVA_BASE : WATER_BASE);
        mat.setColor3('tintColor', lava ? LAVA_TINT : WATER_TINT);
        mat.setFloat('lava', lava ? 1 : 0);
        if (reflective && envTex) mat.setTexture('reflectionSampler', envTex);
        disc.material = mat;

        this.pools.push({ mesh: disc, material: mat, lava });
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!this.initialized) return;
        if (enabled) {
            this._build().catch(err => console.warn('[Fabulus] Water enable failed:', err));
        } else {
            for (const p of this.pools) p.mesh.setEnabled(false);
        }
    }

    update(dt: number): void {
        if (!this.enabled || this.pools.length === 0) return;
        const dtClamp = Math.max(0, Math.min(TIME_CLAMP, dt));
        this.timeAccum += dtClamp;

        const sun = this.scene.lightingSystem.getSun();
        const sunDir = sun ? sun.direction : this.fallbackSunDir;
        const camPos = this.scene.bScene.activeCamera ? this.scene.bScene.activeCamera.globalPosition : this.zeroCamPos;

        const lowDetail = this.scene.renderSystem.isMobileDevice() || FabulusPrefs.get().gfxDetailLevel === 'low';
        const octaves = lowDetail ? WATER_FBM_OCTAVES_LOW : WATER_FBM_OCTAVES_HIGH;
        for (const p of this.pools) {
            p.material.setFloat('time', this.timeAccum);
            p.material.setVector3('sunDir', sunDir);
            p.material.setVector3('cameraPosition', camPos);
            p.material.setFloat('octaves', octaves);
        }
    }

    dispose(): void {
        for (const p of this.pools) {
            try { p.material.dispose(true, true); } catch { /* disposed */ }
            try { p.mesh.dispose(); } catch { /* disposed */ }
        }
        this.pools = [];
    }
}
