import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { FabulusPrefs } from '../FabulusPrefs.js';
import {
    FAB_WATER_SHADER_VERTEX_URL,
    FAB_WATER_SHADER_FRAGMENT_URL,
    WATER_LAVA_CHANCE,
} from '../constants/index.js';

const TIME_CLAMP = 0.25;
const WATER_FBM_OCTAVES_HIGH = 4;
const WATER_FBM_OCTAVES_LOW = 2;
const WATER_BASE = new BABYLON.Color3(0.02, 0.08, 0.13);
const WATER_TINT = new BABYLON.Color3(0.18, 0.34, 0.4);
const LAVA_BASE = new BABYLON.Color3(0.12, 0.02, 0.0);
const LAVA_TINT = new BABYLON.Color3(0.55, 0.18, 0.04);
const MIRROR_TEXTURE_SIZE = 256;
const MIRROR_RENDER_LIST_REFRESH_S = 3;

interface WaterPool {
    mesh: BABYLON.Mesh;
    material: BABYLON.ShaderMaterial;
    lava: boolean;
    mirror: BABYLON.MirrorTexture | null;
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
    private mirrorRefreshAccum = 0;
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
            this._setMirrorsActive(true);
            this._refreshMirrorRenderLists();
            this.enabled = true;
            return;
        }
        const ok = await this._registerShaders();
        if (!ok) return;
        const s = this.scene.bScene;
        if (s.isDisposed) return;

        // Pools live in the flat basins carved into the terrain heightfield.
        const rand = mulberry32(1337);
        const basins = this.scene.mapSystem.getPondBasins();
        for (let i = 0; i < basins.length; i++) {
            const basin = basins[i];
            const lava = rand() < WATER_LAVA_CHANCE;
            this._createPool(s, basin.x, basin.z, basin.radius, basin.waterY, lava, i);
        }
        this._refreshMirrorRenderLists();
        this.enabled = true;
        console.debug(`[Fabulus] Water ready (${this.pools.length} pools)`);
    }

    private _createPool(s: BABYLON.Scene, x: number, z: number, radius: number, waterY: number, lava: boolean, i: number): void {
        const disc = BABYLON.MeshBuilder.CreateDisc(`fab_water_${i}`, { radius, tessellation: 48 }, s);
        disc.rotation.x = Math.PI / 2;
        disc.position.set(x, waterY, z);
        disc.isPickable = false;
        disc.applyFog = true;
        disc.receiveShadows = true;

        // Planar mirrors re-render the whole scene per pool — use env cube instead.
        const useMirror = false;
        const envTex = s.environmentTexture;
        const reflective = !lava && !!envTex;
        const samplers: string[] = [];
        const defines: string[] = [];
        if (useMirror) { samplers.push('mirrorSampler'); defines.push('#define MIRROR'); }
        if (reflective) { samplers.push('reflectionSampler'); defines.push('#define REFLECTION'); }
        const mat = new BABYLON.ShaderMaterial(`fab_water_mat_${i}`, s, { vertex: 'fabWater', fragment: 'fabWater' }, {
            attributes: ['position', 'uv'],
            uniforms: ['world', 'worldViewProjection', 'time', 'lava', 'cameraPosition', 'sunDir', 'baseColor', 'tintColor', 'octaves'],
            samplers,
            defines,
            needAlphaBlending: true,
        });
        mat.backFaceCulling = false;
        // Transparent surface: blend and avoid depth fighting with the ground at the same level.
        mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        mat.zOffset = -2;
        mat.setColor3('baseColor', lava ? LAVA_BASE : WATER_BASE);
        mat.setColor3('tintColor', lava ? LAVA_TINT : WATER_TINT);
        mat.setFloat('lava', lava ? 1 : 0);

        let mirror: BABYLON.MirrorTexture | null = null;
        if (useMirror) {
            mirror = new BABYLON.MirrorTexture(`fab_water_mirror_${i}`, MIRROR_TEXTURE_SIZE, s, true);
            mirror.mirrorPlane = new BABYLON.Plane(0, -1, 0, waterY);
            mirror.renderList = [];
            s.customRenderTargets.push(mirror);
            mat.setTexture('mirrorSampler', mirror);
        } else if (reflective && envTex) {
            mat.setTexture('reflectionSampler', envTex);
        }
        disc.material = mat;

        this.pools.push({ mesh: disc, material: mat, lava, mirror });
    }

    // The mirror render list stays minimal (ground, trees, sky dome) and is
    // refreshed periodically because the forest loads asynchronously.
    private _refreshMirrorRenderLists(): void {
        const s = this.scene.bScene;
        const list: BABYLON.AbstractMesh[] = [];
        if (this.scene.groundMesh) list.push(this.scene.groundMesh);
        const sky = s.getMeshByName('fab_sky_dome');
        if (sky && sky.isEnabled()) list.push(sky);
        const treeTemplate = s.getMeshByName('fab_tree_template');
        if (treeTemplate instanceof BABYLON.Mesh && treeTemplate.isEnabled()) {
            list.push(treeTemplate, ...treeTemplate.instances);
        }
        for (const p of this.pools) {
            if (p.mirror) p.mirror.renderList = list;
        }
    }

    private _setMirrorsActive(active: boolean): void {
        const s = this.scene.bScene;
        for (const p of this.pools) {
            if (!p.mirror) continue;
            const idx = s.customRenderTargets.indexOf(p.mirror);
            if (active && idx < 0) s.customRenderTargets.push(p.mirror);
            else if (!active && idx >= 0) s.customRenderTargets.splice(idx, 1);
        }
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!this.initialized) return;
        if (enabled) {
            this._build().catch(err => console.warn('[Fabulus] Water enable failed:', err));
        } else {
            for (const p of this.pools) p.mesh.setEnabled(false);
            this._setMirrorsActive(false);
        }
    }

    update(dt: number): void {
        if (!this.enabled || this.pools.length === 0) return;
        const dtClamp = Math.max(0, Math.min(TIME_CLAMP, dt));
        this.timeAccum += dtClamp;

        this.mirrorRefreshAccum += dtClamp;
        if (this.mirrorRefreshAccum >= MIRROR_RENDER_LIST_REFRESH_S) {
            this.mirrorRefreshAccum = 0;
            this._refreshMirrorRenderLists();
        }

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
        this._setMirrorsActive(false);
        for (const p of this.pools) {
            try { p.mirror?.dispose(); } catch { /* disposed */ }
            try { p.material.dispose(true, true); } catch { /* disposed */ }
            try { p.mesh.dispose(); } catch { /* disposed */ }
        }
        this.pools = [];
    }
}
