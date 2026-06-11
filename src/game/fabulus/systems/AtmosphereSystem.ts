import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { FabulusPrefs } from '../FabulusPrefs.js';
import {
    ATMO_GODRAYS_EXPOSURE,
    ATMO_GODRAYS_DECAY,
    ATMO_GODRAYS_DENSITY,
    ATMO_GODRAYS_WEIGHT,
    ATMO_MIST_SIZE,
    ATMO_MIST_HEIGHT,
    ATMO_MIST_SCROLL,
    ATMO_LAKE_MIST_HEIGHT,
    ATMO_LAKE_MIST_ALPHA,
    ATMO_LAKE_MIST_RADIUS_FACTOR,
    ATMO_FIREFLY_CAPACITY,
    ATMO_FIREFLY_EMIT_RATE,
    ATMO_DUST_CAPACITY,
    ATMO_DUST_EMIT_RATE,
    ATMO_DUST_RADIUS,
    FAB_HEIGHT_FOG_SHADER_URL,
} from '../constants/index.js';

const GODRAYS_RATIO = 0.5;
const GODRAYS_SAMPLES = 80;
const SUN_DISTANCE = 900;
const MIST_NOISE_SIZE = 256;
const MIST_ALPHA = 0.16;
const SOFT_DOT_SIZE = 64;
const FIREFLY_FOREST_CAPACITY = 70;
const FIREFLY_FOREST_AREA = 38;
const FIREFLY_HOVER_MIN = 0.4;
const FIREFLY_HOVER_RANGE = 1.6;
const PARTICLE_NOISE_SIZE = 128;

export class AtmosphereSystem {
    private scene: FabulusScene;
    private godrays: BABYLON.VolumetricLightScatteringPostProcess | null = null;
    private sunMesh: BABYLON.Mesh | null = null;
    private mistMesh: BABYLON.Mesh | null = null;
    private mistTexture: BABYLON.Texture | null = null;
    private lakeMists: BABYLON.Mesh[] = [];
    private lakeMistMaterial: BABYLON.StandardMaterial | null = null;
    private heightFog: BABYLON.PostProcess | null = null;
    private heightFogShaderReady = false;
    private fogTime = 0;
    private ambientParticles: BABYLON.ParticleSystem[] = [];
    private softDotTexture: BABYLON.DynamicTexture | null = null;
    private particleNoise: BABYLON.NoiseProceduralTexture | null = null;
    private wantAmbientParticles = false;
    private enabled = false;
    private initialized = false;
    private scroll = 0;
    private baseFogDensity: number | null = null;
    private readonly tmpDir = new BABYLON.Vector3();
    private readonly tmpSunPos = new BABYLON.Vector3();
    private readonly tmpCamForward = new BABYLON.Vector3();
    private readonly tmpCamRight = new BABYLON.Vector3();
    private readonly tmpCamUp = new BABYLON.Vector3();

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        this.initialized = true;
        this.wantAmbientParticles = this.wantAmbientParticles || FabulusPrefs.get().gfxAdvancedVfx === true;
        if (this.wantAmbientParticles) this._buildAmbientParticles();
        if (FabulusPrefs.get().gfxVolumetrics !== true) return;
        this._build();
    }

    private _build(): void {
        const s = this.scene.bScene;
        const camera = s.activeCamera;
        if (!camera || s.isDisposed) {
            console.warn('[Fabulus] Atmosphere: no active camera');
            return;
        }
        if (this.godrays) {
            this._setVisible(true);
            this.enabled = true;
            void this._buildHeightFog(s);
            return;
        }

        try {
            const godrays = new BABYLON.VolumetricLightScatteringPostProcess(
                'fab_godrays', GODRAYS_RATIO, camera, undefined, GODRAYS_SAMPLES,
                BABYLON.Texture.BILINEAR_SAMPLINGMODE, s.getEngine(), false,
            );
            const sunMesh = godrays.mesh;
            sunMesh.name = 'fab_godrays_sun';
            const sunMat = sunMesh.material as BABYLON.StandardMaterial;
            if (sunMat) {
                sunMat.emissiveColor = new BABYLON.Color3(0.95, 0.86, 0.72);
                sunMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            }
            sunMesh.scaling.setAll(60);
            godrays.exposure = ATMO_GODRAYS_EXPOSURE;
            godrays.decay = ATMO_GODRAYS_DECAY;
            godrays.density = ATMO_GODRAYS_DENSITY;
            godrays.weight = ATMO_GODRAYS_WEIGHT;
            godrays.useCustomMeshPosition = true;
            this.godrays = godrays;
            this.sunMesh = sunMesh;
        } catch (err) {
            console.warn('[Fabulus] God rays unavailable:', err);
        }

        this._buildMist(s);
        this._buildLakeMist(s);
        void this._buildHeightFog(s);
        this.enabled = true;
        console.debug('[Fabulus] Atmosphere ready');
    }

    // ── Height fog post-process ───────────────────────────────────────────────

    private async _buildHeightFog(s: BABYLON.Scene): Promise<void> {
        const camera = s.activeCamera;
        if (!camera || this.heightFog) return;
        if (!this.heightFogShaderReady) {
            try {
                const resp = await fetch(FAB_HEIGHT_FOG_SHADER_URL);
                if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching height fog shader`);
                (BABYLON.Effect.ShadersStore as Record<string, string>)['fabHeightFogFragmentShader'] = await resp.text();
                this.heightFogShaderReady = true;
            } catch (err) {
                console.warn('[Fabulus] Height fog shader fetch failed:', err);
                return;
            }
        }
        if (s.isDisposed || !this.enabled) return;

        try {
            const depthRenderer = s.enableDepthRenderer(camera);
            const fog = new BABYLON.PostProcess(
                'fab_height_fog', 'fabHeightFog',
                ['camPos', 'camForward', 'camRight', 'camUp', 'camTan', 'camDepth', 'time', 'fogColor'],
                ['depthSampler'],
                1.0, camera,
            );
            fog.onApply = (effect) => {
                const cam = s.activeCamera;
                if (!cam) return;
                const engine = s.getEngine();
                const wm = cam.getWorldMatrix();
                BABYLON.Vector3.TransformNormalToRef(BABYLON.Vector3.Forward(), wm, this.tmpCamForward);
                BABYLON.Vector3.TransformNormalToRef(BABYLON.Vector3.Right(), wm, this.tmpCamRight);
                BABYLON.Vector3.TransformNormalToRef(BABYLON.Vector3.Up(), wm, this.tmpCamUp);
                const tanY = Math.tan(cam.fov / 2);
                const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
                effect.setTexture('depthSampler', depthRenderer.getDepthMap());
                effect.setVector3('camPos', cam.globalPosition);
                effect.setVector3('camForward', this.tmpCamForward);
                effect.setVector3('camRight', this.tmpCamRight);
                effect.setVector3('camUp', this.tmpCamUp);
                effect.setFloat2('camTan', tanY * aspect, tanY);
                effect.setFloat2('camDepth', cam.minZ, cam.maxZ);
                effect.setFloat('time', this.fogTime);
                effect.setColor3('fogColor', s.fogColor);
            };
            this.heightFog = fog;
            console.debug('[Fabulus] Height fog post-process ready');
        } catch (err) {
            console.warn('[Fabulus] Height fog unavailable:', err);
        }
    }

    private _disableHeightFog(): void {
        if (!this.heightFog) return;
        try {
            const cam = this.scene.bScene.activeCamera;
            if (cam) this.heightFog.dispose(cam);
        } catch (err) {
            console.warn('[Fabulus] Height fog disable failed:', err);
        }
        this.heightFog = null;
    }

    private _buildMist(s: BABYLON.Scene): void {
        const tex = new BABYLON.DynamicTexture('fab_mist_tex', MIST_NOISE_SIZE, s, true);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const img = ctx.createImageData(MIST_NOISE_SIZE, MIST_NOISE_SIZE);
        for (let y = 0; y < MIST_NOISE_SIZE; y++) {
            for (let x = 0; x < MIST_NOISE_SIZE; x++) {
                const idx = (y * MIST_NOISE_SIZE + x) * 4;
                const v = Math.floor(120 + Math.random() * 135);
                img.data[idx] = v; img.data[idx + 1] = v; img.data[idx + 2] = v; img.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        tex.update();
        tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        tex.uScale = 3;
        tex.vScale = 3;
        this.mistTexture = tex;

        const mat = new BABYLON.StandardMaterial('fab_mist_mat', s);
        mat.emissiveColor = new BABYLON.Color3(0.16, 0.16, 0.2);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.opacityTexture = tex;
        mat.alpha = MIST_ALPHA;
        mat.disableLighting = true;
        mat.backFaceCulling = false;

        const plane = BABYLON.MeshBuilder.CreateGround('fab_mist', { width: ATMO_MIST_SIZE, height: ATMO_MIST_SIZE, subdivisions: 1 }, s);
        plane.position.y = ATMO_MIST_HEIGHT;
        plane.material = mat;
        plane.isPickable = false;
        plane.applyFog = false;
        plane.renderingGroupId = 0;
        this.mistMesh = plane;
    }

    // Low mist patches hovering over each pond basin, reusing the scrolled noise.
    private _buildLakeMist(s: BABYLON.Scene): void {
        if (this.lakeMists.length || !this.mistTexture) return;
        const basins = this.scene.mapSystem.getPondBasins();
        if (!basins.length) return;

        const mat = new BABYLON.StandardMaterial('fab_lake_mist_mat', s);
        mat.emissiveColor = new BABYLON.Color3(0.18, 0.2, 0.26);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.opacityTexture = this.mistTexture;
        mat.alpha = ATMO_LAKE_MIST_ALPHA;
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        this.lakeMistMaterial = mat;

        for (let i = 0; i < basins.length; i++) {
            const b = basins[i];
            const size = b.radius * ATMO_LAKE_MIST_RADIUS_FACTOR;
            const plane = BABYLON.MeshBuilder.CreateGround(`fab_lake_mist_${i}`, { width: size, height: size, subdivisions: 1 }, s);
            plane.position.set(b.x, b.waterY + ATMO_LAKE_MIST_HEIGHT, b.z);
            plane.material = mat;
            plane.isPickable = false;
            plane.applyFog = false;
            this.lakeMists.push(plane);
        }
        console.debug(`[Fabulus] Lake mist ready (${this.lakeMists.length} patches)`);
    }

    // ── Ambient particles (fireflies near lakes/forest, dust near campfires) ──

    setAmbientParticles(enabled: boolean): void {
        this.wantAmbientParticles = enabled;
        if (!this.initialized) return;
        if (enabled) {
            this._buildAmbientParticles();
            for (const ps of this.ambientParticles) {
                if (!ps.isStarted()) ps.start();
            }
        } else {
            for (const ps of this.ambientParticles) {
                if (ps.isStarted()) ps.stop();
            }
        }
    }

    private _buildAmbientParticles(): void {
        if (this.ambientParticles.length) return;
        const s = this.scene.bScene;
        if (s.isDisposed) return;

        this.softDotTexture = this._buildSoftDotTexture(s);
        this.particleNoise = new BABYLON.NoiseProceduralTexture('fab_ambient_noise', PARTICLE_NOISE_SIZE, s);
        this.particleNoise.animationSpeedFactor = 3;
        this.particleNoise.brightness = 0.5;
        this.particleNoise.octaves = 3;

        const basins = this.scene.mapSystem.getPondBasins();
        for (let i = 0; i < basins.length; i++) {
            const b = basins[i];
            this.ambientParticles.push(this._buildFireflies(
                s, `fab_fireflies_${i}`, ATMO_FIREFLY_CAPACITY,
                new BABYLON.Vector3(b.x, b.waterY + 1, b.z), b.radius * 1.4,
            ));
        }
        this.ambientParticles.push(this._buildForestFireflies(s));

        const fires = this.scene.lightingSystem.getFirePositions();
        for (let i = 0; i < fires.length; i++) {
            const [x, z] = fires[i];
            const y = this.scene.mapSystem.getHeightAt(x, z);
            this.ambientParticles.push(this._buildFireDust(s, i, new BABYLON.Vector3(x, y + 0.7, z)));
        }
        console.debug(`[Fabulus] Ambient particles ready (${this.ambientParticles.length} systems)`);
    }

    private _buildFireflies(s: BABYLON.Scene, name: string, capacity: number, center: BABYLON.Vector3, spread: number): BABYLON.ParticleSystem {
        const ps = new BABYLON.ParticleSystem(name, capacity, s);
        ps.particleTexture = this.softDotTexture;
        ps.emitter = center.clone();
        ps.minEmitBox = new BABYLON.Vector3(-spread, -0.2, -spread);
        ps.maxEmitBox = new BABYLON.Vector3(spread, 1.4, spread);
        ps.color1 = new BABYLON.Color4(1.0, 0.92, 0.42, 0.9);
        ps.color2 = new BABYLON.Color4(0.62, 1.0, 0.42, 0.8);
        ps.colorDead = new BABYLON.Color4(0.4, 0.6, 0.2, 0);
        ps.minSize = 0.05;
        ps.maxSize = 0.16;
        ps.minLifeTime = 2.5;
        ps.maxLifeTime = 6;
        ps.emitRate = ATMO_FIREFLY_EMIT_RATE;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        ps.direction1 = new BABYLON.Vector3(-0.25, -0.08, -0.25);
        ps.direction2 = new BABYLON.Vector3(0.25, 0.18, 0.25);
        ps.minEmitPower = 0.4;
        ps.maxEmitPower = 1;
        ps.gravity = BABYLON.Vector3.Zero();
        if (this.particleNoise) {
            ps.noiseTexture = this.particleNoise;
            ps.noiseStrength = new BABYLON.Vector3(1.4, 0.5, 1.4);
        }
        ps.start();
        return ps;
    }

    // Forest fireflies sample the terrain height so they hover just above ground.
    private _buildForestFireflies(s: BABYLON.Scene): BABYLON.ParticleSystem {
        const ps = this._buildFireflies(
            s, 'fab_fireflies_forest', FIREFLY_FOREST_CAPACITY,
            new BABYLON.Vector3(0, 0, 0), FIREFLY_FOREST_AREA,
        );
        ps.startPositionFunction = (_world, position, particle) => {
            const x = (Math.random() * 2 - 1) * FIREFLY_FOREST_AREA;
            const z = (Math.random() * 2 - 1) * FIREFLY_FOREST_AREA;
            position.set(x, this.scene.mapSystem.getHeightAt(x, z) + FIREFLY_HOVER_MIN + Math.random() * FIREFLY_HOVER_RANGE, z);
            void particle;
        };
        return ps;
    }

    private _buildFireDust(s: BABYLON.Scene, i: number, origin: BABYLON.Vector3): BABYLON.ParticleSystem {
        const ps = new BABYLON.ParticleSystem(`fab_fire_dust_${i}`, ATMO_DUST_CAPACITY, s);
        ps.particleTexture = this.softDotTexture;
        ps.emitter = origin.clone();
        ps.minEmitBox = new BABYLON.Vector3(-ATMO_DUST_RADIUS, -0.3, -ATMO_DUST_RADIUS);
        ps.maxEmitBox = new BABYLON.Vector3(ATMO_DUST_RADIUS, 1.2, ATMO_DUST_RADIUS);
        ps.color1 = new BABYLON.Color4(0.65, 0.55, 0.42, 0.12);
        ps.color2 = new BABYLON.Color4(0.5, 0.45, 0.38, 0.08);
        ps.colorDead = new BABYLON.Color4(0.4, 0.36, 0.3, 0);
        ps.minSize = 0.04;
        ps.maxSize = 0.12;
        ps.minLifeTime = 3;
        ps.maxLifeTime = 7;
        ps.emitRate = ATMO_DUST_EMIT_RATE;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        ps.direction1 = new BABYLON.Vector3(-0.12, 0.05, -0.12);
        ps.direction2 = new BABYLON.Vector3(0.12, 0.25, 0.12);
        ps.minEmitPower = 0.15;
        ps.maxEmitPower = 0.5;
        ps.gravity = BABYLON.Vector3.Zero();
        if (this.particleNoise) {
            ps.noiseTexture = this.particleNoise;
            ps.noiseStrength = new BABYLON.Vector3(0.6, 0.25, 0.6);
        }
        ps.start();
        return ps;
    }

    private _buildSoftDotTexture(s: BABYLON.Scene): BABYLON.DynamicTexture {
        const tex = new BABYLON.DynamicTexture('fab_soft_dot', SOFT_DOT_SIZE, s, false);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const half = SOFT_DOT_SIZE / 2;
        const g = ctx.createRadialGradient(half, half, 0, half, half, half);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.clearRect(0, 0, SOFT_DOT_SIZE, SOFT_DOT_SIZE);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, SOFT_DOT_SIZE, SOFT_DOT_SIZE);
        tex.update();
        tex.hasAlpha = true;
        return tex;
    }

    private _setVisible(visible: boolean): void {
        if (this.sunMesh) this.sunMesh.setEnabled(visible);
        if (this.mistMesh) this.mistMesh.setEnabled(visible);
        for (const m of this.lakeMists) m.setEnabled(visible);
    }

    /** Fully detaches and frees the god-rays post-process so it stops costing GPU when disabled. */
    private _disableGodrays(): void {
        if (!this.godrays) return;
        try {
            const cam = this.scene.bScene.activeCamera;
            if (cam) this.godrays.dispose(cam);
        } catch (err) {
            console.warn('[Fabulus] God rays disable failed:', err);
        }
        this.godrays = null;
        this.sunMesh = null;
    }

    /** Thickens scene fog for rain/fog weather without touching the base density permanently. */
    setFogBoost(boost: boolean): void {
        const s = this.scene.bScene;
        if (s.isDisposed) return;
        if (this.baseFogDensity == null) this.baseFogDensity = s.fogDensity;
        s.fogDensity = this.baseFogDensity * (boost ? 2.4 : 1);
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!this.initialized) return;
        if (enabled) {
            this._build();
        } else {
            this._disableGodrays();
            this._disableHeightFog();
            this._setVisible(false);
            this.setFogBoost(false);
        }
    }

    update(dt: number): void {
        if (!this.enabled) return;
        this.fogTime += dt;

        const sun = this.scene.lightingSystem.getSun();
        const root = this.scene.playerRoot;
        if (this.godrays && sun) {
            sun.direction.normalizeToRef(this.tmpDir);
            const cx = root ? root.position.x : 0;
            const cy = root ? root.position.y : 0;
            const cz = root ? root.position.z : 0;
            this.tmpSunPos.set(
                cx - this.tmpDir.x * SUN_DISTANCE,
                cy - this.tmpDir.y * SUN_DISTANCE,
                cz - this.tmpDir.z * SUN_DISTANCE,
            );
            this.godrays.setCustomMeshPosition(this.tmpSunPos);
            if (this.sunMesh) this.sunMesh.position.copyFrom(this.tmpSunPos);
        }

        if (this.mistMesh && this.mistTexture && root) {
            this.mistMesh.position.x = root.position.x;
            this.mistMesh.position.z = root.position.z;
            this.mistMesh.position.y = root.position.y + ATMO_MIST_HEIGHT;
            this.scroll += dt * ATMO_MIST_SCROLL;
            this.mistTexture.uOffset = this.scroll;
            this.mistTexture.vOffset = this.scroll * 0.6;
        }
    }

    dispose(): void {
        try {
            if (this.godrays) {
                const cam = this.scene.bScene.activeCamera;
                if (cam) this.godrays.dispose(cam);
                this.godrays = null;
            }
            this._disableHeightFog();
            for (const ps of this.ambientParticles) {
                try { ps.dispose(); } catch { /* already disposed */ }
            }
            this.ambientParticles = [];
            for (const m of this.lakeMists) {
                try { m.dispose(); } catch { /* already disposed */ }
            }
            this.lakeMists = [];
            if (this.lakeMistMaterial) { this.lakeMistMaterial.dispose(); this.lakeMistMaterial = null; }
            if (this.softDotTexture) { this.softDotTexture.dispose(); this.softDotTexture = null; }
            if (this.particleNoise) { this.particleNoise.dispose(); this.particleNoise = null; }
            if (this.mistMesh) { this.mistMesh.dispose(); this.mistMesh = null; }
            if (this.mistTexture) { this.mistTexture.dispose(); this.mistTexture = null; }
            this.sunMesh = null;
        } catch (err) {
            console.warn('[Fabulus] Atmosphere dispose failed:', err);
        }
    }
}
