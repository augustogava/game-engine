import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';

const HEMI_INTENSITY = 0.2;
const SUN_INTENSITY = 0.85;
const FILL_INTENSITY = 0.18;
const SHADOW_MAP_SIZE_DESKTOP = 4096;
const SHADOW_MAP_SIZE_MOBILE = 2048;
const FOG_DENSITY = 0.0022;
const TORCH_ENABLED = true;
const TORCH_INTENSITY = 1.25;
const TORCH_RANGE = 12;
const TORCH_HEIGHT = 2.6;
const SHADOW_BIAS = 0.0008;
const SHADOW_NORMAL_BIAS = 0.04;

const FIRE_HEIGHT = 1.1;
const FIRE_INTENSITY = 2.4;
const FIRE_RANGE = 16;
const FIRE_POSITIONS: ReadonlyArray<readonly [number, number]> = [
    [-11, 14],
    [13, 12],
    [-2.5, 18.5],
    [2.5, 18.5],
    [0, -6],
];

interface FireLight {
    light: BABYLON.PointLight;
    base: number;
    phase: number;
    particles: BABYLON.ParticleSystem;
}

export class LightingSystem {
    private scene: FabulusScene;
    shadowGen: BABYLON.CascadedShadowGenerator | null = null;
    private sun: BABYLON.DirectionalLight | null = null;
    private torch: BABYLON.PointLight | null = null;
    private fires: FireLight[] = [];
    private flameTexture: BABYLON.DynamicTexture | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        const s = this.scene.bScene;
        s.shadowsEnabled = true;

        const hemi = new BABYLON.HemisphericLight('fab_hemi', new BABYLON.Vector3(0, 1, 0), s);
        hemi.intensity = HEMI_INTENSITY;
        hemi.diffuse = new BABYLON.Color3(0.92, 0.88, 0.82);
        hemi.groundColor = new BABYLON.Color3(0.18, 0.14, 0.11);
        hemi.specular = new BABYLON.Color3(0.15, 0.14, 0.12);

        const sun = new BABYLON.DirectionalLight(
            'fab_sun',
            new BABYLON.Vector3(-0.72, -0.48, -0.52).normalize(),
            s,
        );
        sun.position = new BABYLON.Vector3(40, 70, 35);
        sun.intensity = SUN_INTENSITY;
        sun.diffuse = new BABYLON.Color3(1.0, 0.94, 0.82);
        sun.specular = new BABYLON.Color3(0.85, 0.8, 0.65);
        sun.shadowEnabled = true;
        this.sun = sun;

        const isMobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
        const shadowMapSize = isMobile ? SHADOW_MAP_SIZE_MOBILE : SHADOW_MAP_SIZE_DESKTOP;
        const shadowGen = new BABYLON.CascadedShadowGenerator(shadowMapSize, sun);
        shadowGen.lambda = 0.82;
        shadowGen.autoCalcDepthBounds = true;
        shadowGen.stabilizeCascades = true;
        shadowGen.numCascades = isMobile ? 2 : 3;
        shadowGen.cascadeBlendPercentage = 0.08;
        shadowGen.penumbraDarkness = 0.65;
        shadowGen.usePercentageCloserFiltering = true;
        shadowGen.filteringQuality = isMobile ? BABYLON.ShadowGenerator.QUALITY_MEDIUM : BABYLON.ShadowGenerator.QUALITY_HIGH;
        shadowGen.bias = SHADOW_BIAS;
        shadowGen.normalBias = SHADOW_NORMAL_BIAS;
        shadowGen.transparencyShadow = true;
        this.shadowGen = shadowGen;

        const fill = new BABYLON.DirectionalLight(
            'fab_fill',
            new BABYLON.Vector3(0.35, -0.6, 0.55).normalize(),
            s,
        );
        fill.intensity = FILL_INTENSITY;
        fill.diffuse = new BABYLON.Color3(0.75, 0.78, 0.9);
        fill.specular = new BABYLON.Color3(0.05, 0.05, 0.06);

        s.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        s.fogDensity = FOG_DENSITY;
        s.fogColor = new BABYLON.Color3(0.05, 0.045, 0.06);

        if (TORCH_ENABLED) {
            const torch = new BABYLON.PointLight('fab_torch', new BABYLON.Vector3(0, TORCH_HEIGHT, 0), s);
            torch.diffuse = new BABYLON.Color3(1.0, 0.78, 0.48);
            torch.specular = new BABYLON.Color3(1.0, 0.85, 0.55);
            torch.intensity = TORCH_INTENSITY;
            torch.range = TORCH_RANGE;
            torch.falloffType = BABYLON.Light.FALLOFF_GLTF;
            this.torch = torch;
        }

        this._addFireLights();
        console.debug('[Fabulus] Lighting ready');
    }

    /** Builds a radial-gradient flame sprite without relying on external assets. */
    private _buildFlameTexture(): BABYLON.DynamicTexture {
        if (this.flameTexture) return this.flameTexture;
        const size = 128;
        const tex = new BABYLON.DynamicTexture('fab_flame_tex', size, this.scene.bScene, false);
        tex.hasAlpha = true;
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.35, 'rgba(255,210,130,0.9)');
        grad.addColorStop(0.7, 'rgba(255,120,40,0.45)');
        grad.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        tex.update();
        this.flameTexture = tex;
        return tex;
    }

    private _addFireLights(): void {
        const s = this.scene.bScene;
        const flameTex = this._buildFlameTexture();
        for (let i = 0; i < FIRE_POSITIONS.length; i++) {
            const [x, z] = FIRE_POSITIONS[i];
            const origin = new BABYLON.Vector3(x, FIRE_HEIGHT, z);

            const light = new BABYLON.PointLight(`fab_fire_${i}`, origin.clone(), s);
            light.diffuse = new BABYLON.Color3(1.0, 0.55, 0.22);
            light.specular = new BABYLON.Color3(1.0, 0.6, 0.28);
            light.intensity = FIRE_INTENSITY;
            light.range = FIRE_RANGE;
            light.falloffType = BABYLON.Light.FALLOFF_GLTF;

            const ps = new BABYLON.ParticleSystem(`fab_fire_ps_${i}`, 220, s);
            ps.particleTexture = flameTex;
            ps.emitter = origin.clone();
            ps.minEmitBox = new BABYLON.Vector3(-0.22, 0, -0.22);
            ps.maxEmitBox = new BABYLON.Vector3(0.22, 0.15, 0.22);
            ps.color1 = new BABYLON.Color4(1.0, 0.78, 0.35, 1.0);
            ps.color2 = new BABYLON.Color4(1.0, 0.42, 0.12, 1.0);
            ps.colorDead = new BABYLON.Color4(0.25, 0.06, 0.02, 0.0);
            ps.minSize = 0.35;
            ps.maxSize = 0.95;
            ps.minLifeTime = 0.25;
            ps.maxLifeTime = 0.6;
            ps.emitRate = 110;
            ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
            ps.gravity = new BABYLON.Vector3(0, 2.2, 0);
            ps.direction1 = new BABYLON.Vector3(-0.25, 1.6, -0.25);
            ps.direction2 = new BABYLON.Vector3(0.25, 2.4, 0.25);
            ps.minEmitPower = 0.6;
            ps.maxEmitPower = 1.4;
            ps.updateSpeed = 0.012;
            ps.start();

            this.fires.push({ light, base: FIRE_INTENSITY, phase: i * 1.7, particles: ps });
        }
    }

    /** Runtime shadow quality switch driven by the settings panel. */
    applyShadowQuality(quality: 'off' | 'low' | 'medium' | 'high'): void {
        const s = this.scene.bScene;
        if (!this.sun || s.isDisposed) return;
        if (quality === 'off') {
            s.shadowsEnabled = false;
            return;
        }
        s.shadowsEnabled = true;
        if (!this.shadowGen) return;
        const size = quality === 'low' ? 1024 : quality === 'medium' ? 2048 : 4096;
        const map = this.shadowGen.getShadowMap();
        if (map && map.getRenderSize() !== size) {
            try { map.resize(size); } catch (err) { console.warn('[Fabulus] shadow map resize failed:', err); }
        }
        this.shadowGen.filteringQuality = quality === 'high'
            ? BABYLON.ShadowGenerator.QUALITY_HIGH
            : quality === 'medium'
                ? BABYLON.ShadowGenerator.QUALITY_MEDIUM
                : BABYLON.ShadowGenerator.QUALITY_LOW;
    }

    addShadowCaster(mesh: BABYLON.AbstractMesh): void {
        if (!this.shadowGen || !mesh || mesh.getTotalVertices() <= 0) return;
        try {
            this.shadowGen.addShadowCaster(mesh, true);
        } catch (err) {
            console.warn('[Fabulus] addShadowCaster failed:', err);
        }
    }

    followPlayer(): void {
        const root = this.scene.playerRoot;
        if (!root) return;

        if (this.torch) {
            this.torch.position.set(root.position.x, TORCH_HEIGHT, root.position.z);
        }

        if (this.sun) {
            this.sun.position.set(
                root.position.x + 40,
                70,
                root.position.z + 35,
            );
        }

        if (this.fires.length > 0) {
            const t = this.scene.now() * 0.001;
            for (const fire of this.fires) {
                const flicker = 0.78
                    + 0.16 * Math.sin(t * 11 + fire.phase)
                    + 0.06 * Math.sin(t * 27 + fire.phase * 2);
                fire.light.intensity = fire.base * flicker;
            }
        }
    }

    dispose(): void {
        for (const fire of this.fires) {
            try { fire.particles.dispose(); } catch { /* already disposed */ }
            try { fire.light.dispose(); } catch { /* already disposed */ }
        }
        this.fires = [];
        if (this.flameTexture) {
            try { this.flameTexture.dispose(); } catch { /* already disposed */ }
            this.flameTexture = null;
        }
    }
}
