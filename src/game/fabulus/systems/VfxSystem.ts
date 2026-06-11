import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { AOE_RING_LIFETIME_MS, HIT_FLASH_MS } from '../constants/index.js';
import { FabulusPrefs } from '../FabulusPrefs.js';

const MARKER_LIFETIME_MS = 500;
const LEVELUP_RING_LIFETIME_MS = 900;
const AURA_LIFETIME_MS = 700;
const BLOOD_POOL_LIFETIME_MS = 6500;

interface TimedMesh {
    mesh: BABYLON.Mesh;
    bornAt: number;
    lifetimeMs: number;
    growTo: number;
    poolKey: string | null;
    baseAlpha: number;
    matPool?: BABYLON.Material[];
}

const FLARE_TEX_SIZE = 64;
const TEX_SIZE = 64;

const BLOOD_POOL_BASE_ALPHA = 0.82;
const HIT_FLASH_COLOR = new BABYLON.Color3(0.28, 0.03, 0.03);

const BLOOD_POOL_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec3 vWorldPos;
varying vec2 vLocal;
void main(void) {
    vLocal = position.xy;
    vWorldPos = (world * vec4(position, 1.0)).xyz;
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const BLOOD_POOL_FRAGMENT_SHADER = `
#ifdef GL_ES
precision highp float;
#endif

varying vec3 vWorldPos;
varying vec2 vLocal;

uniform vec3 cameraPosition;
uniform float time;
uniform float uAlpha;
uniform float uRadius;

const int   BLOOD_OCTAVES       = 3;
const float BLOOD_FREQ          = 0.9;
const float BLOOD_AMP           = 0.08;
const float BLOOD_CHOPPY        = 3.0;
const float BLOOD_FLOW_SPEED    = 0.18;
const float BLOOD_NORMAL_EPS    = 0.12;
const float BLOOD_SHININESS     = 90.0;
const float BLOOD_SPEC_STRENGTH = 0.9;
const float BLOOD_REFLECT       = 0.5;
const float BLOOD_EDGE_START    = 0.62;
const vec3  BLOOD_DEEP_COLOR    = vec3(0.16, 0.010, 0.008);
const vec3  BLOOD_SUBSURFACE    = vec3(0.42, 0.025, 0.016);
const vec3  BLOOD_SPEC_COLOR    = vec3(1.0, 0.85, 0.82);
const vec3  BLOOD_REFLECT_COLOR = vec3(0.40, 0.42, 0.48);
const vec3  BLOOD_LIGHT_DIR     = vec3(0.3, 1.0, 0.25);
const mat2  BLOOD_OCTAVE_M      = mat2(1.6, 1.2, -1.2, 1.6);

float bloodHash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

float bloodNoise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return -1.0 + 2.0 * mix(mix(bloodHash(i + vec2(0.0, 0.0)), bloodHash(i + vec2(1.0, 0.0)), u.x),
                            mix(bloodHash(i + vec2(0.0, 1.0)), bloodHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float bloodSeaOctave(vec2 uv, float choppy) {
    uv += bloodNoise(uv);
    vec2 wv = 1.0 - abs(sin(uv));
    vec2 swv = abs(cos(uv));
    wv = mix(wv, swv, wv);
    return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);
}

float bloodHeight(vec2 p) {
    float freq = BLOOD_FREQ;
    float amp = BLOOD_AMP;
    float choppy = BLOOD_CHOPPY;
    float t = 1.0 + time * BLOOD_FLOW_SPEED;
    float h = 0.0;
    for (int i = 0; i < BLOOD_OCTAVES; i++) {
        float d = bloodSeaOctave((p + t) * freq, choppy);
        d += bloodSeaOctave((p - t) * freq, choppy);
        h += d * amp;
        p *= BLOOD_OCTAVE_M; freq *= 1.9; amp *= 0.22;
        choppy = mix(choppy, 1.0, 0.2);
    }
    return h;
}

vec3 bloodNormal(vec2 p) {
    float eps = BLOOD_NORMAL_EPS;
    float h = bloodHeight(p);
    float hx = bloodHeight(p + vec2(eps, 0.0));
    float hz = bloodHeight(p + vec2(0.0, eps));
    return normalize(vec3(h - hx, eps, h - hz));
}

void main(void) {
    vec2 sp = vWorldPos.xz;
    float r = length(vLocal) / max(uRadius, 1e-3);
    r += bloodNoise(sp * 6.0) * 0.05;
    if (r > 1.0) discard;

    vec3 n = bloodNormal(sp);
    vec3 v = normalize(cameraPosition - vWorldPos);
    vec3 l = normalize(BLOOD_LIGHT_DIR);

    float fres = clamp(1.0 - dot(n, v), 0.0, 1.0);
    fres = pow(fres, 3.0) * BLOOD_REFLECT;

    float ndl = max(dot(n, l), 0.0);
    float thin = smoothstep(BLOOD_EDGE_START, 1.0, r);
    vec3 deep = mix(BLOOD_DEEP_COLOR, BLOOD_SUBSURFACE, thin * 0.6);
    deep *= 0.45 + 0.55 * ndl;

    vec3 refl = reflect(-l, n);
    float spec = pow(max(dot(refl, v), 0.0), BLOOD_SHININESS) * BLOOD_SPEC_STRENGTH;

    vec3 color = mix(deep, BLOOD_REFLECT_COLOR, fres);
    color += BLOOD_SPEC_COLOR * spec;

    float edge = 1.0 - smoothstep(BLOOD_EDGE_START, 1.0, r);
    float alpha = clamp(uAlpha, 0.0, 1.0) * edge;

    gl_FragColor = vec4(color, alpha);
}
`;

/** Particle quality multiplier applied to capacity/emit rate. */
const QUALITY_MULT: Record<string, number> = { low: 0.35, medium: 0.65, high: 1 };

type BurstKind = 'blood' | 'bloodBig' | 'fire' | 'smoke' | 'frost' | 'frostMist' | 'spark' | 'dust' | 'addBurst';

interface BurstConfig {
    capacity: number;
    texture: 'flare' | 'flame' | 'smoke' | 'blood' | 'frost';
    blendMode: number;
    minSize: number;
    maxSize: number;
    minLife: number;
    maxLife: number;
    emitRate: number;
    dir1: BABYLON.Vector3;
    dir2: BABYLON.Vector3;
    minPower: number;
    maxPower: number;
    gravity: BABYLON.Vector3;
    stopAfter: number;
    sizeGradient?: { t: number; size: number }[];
}

export class VfxSystem {
    private scene: FabulusScene;
    private timedMeshes: TimedMesh[] = [];
    private flareTexture: BABYLON.DynamicTexture | null = null;
    private flameTexture: BABYLON.DynamicTexture | null = null;
    private smokeTexture: BABYLON.DynamicTexture | null = null;
    private bloodTexture: BABYLON.DynamicTexture | null = null;
    private frostTexture: BABYLON.DynamicTexture | null = null;
    private ringPools: Map<string, BABYLON.Mesh[]> = new Map();
    private slashMatPool: BABYLON.Material[] = [];
    private decalMatPool: BABYLON.Material[] = [];
    private bloodMatPool: BABYLON.Material[] = [];
    private burstPools: Map<BurstKind, BABYLON.ParticleSystem[]> = new Map();
    private activeBursts: Set<BABYLON.ParticleSystem> = new Set();
    private pendingTimeouts: Set<number> = new Set();
    private static _bloodPoolShaderReady = false;
    private advancedFx = FabulusPrefs.get().gfxAdvancedVfx;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    /** Toggles the heavier element-impact embers/shockwaves (Ultra preset / gfxAdvancedVfx). */
    setAdvancedEnabled(enabled: boolean): void {
        this.advancedFx = enabled;
    }

    init(): void {
        this._registerBloodPoolShaders();
        this._buildFlareTexture();
        this.flameTexture = this._buildGradientTexture('fab_flame_tex', [
            { stop: 0, color: 'rgba(255,250,210,1)' },
            { stop: 0.25, color: 'rgba(255,200,80,0.95)' },
            { stop: 0.55, color: 'rgba(235,110,20,0.7)' },
            { stop: 0.8, color: 'rgba(160,40,8,0.35)' },
            { stop: 1, color: 'rgba(60,10,0,0)' },
        ], true);
        this.smokeTexture = this._buildGradientTexture('fab_smoke_tex', [
            { stop: 0, color: 'rgba(120,115,110,0.85)' },
            { stop: 0.5, color: 'rgba(80,76,72,0.5)' },
            { stop: 1, color: 'rgba(40,38,36,0)' },
        ], true);
        this.bloodTexture = this._buildGradientTexture('fab_blood_tex', [
            { stop: 0, color: 'rgba(150,12,8,0.95)' },
            { stop: 0.45, color: 'rgba(110,8,6,0.8)' },
            { stop: 1, color: 'rgba(50,2,2,0)' },
        ], true);
        this.frostTexture = this._buildFrostTexture();
    }

    private _buildFlareTexture(): void {
        const tex = new BABYLON.DynamicTexture('fab_flare_tex', { width: FLARE_TEX_SIZE, height: FLARE_TEX_SIZE }, this.scene.bScene, true);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const c = FLARE_TEX_SIZE / 2;
        const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.clearRect(0, 0, FLARE_TEX_SIZE, FLARE_TEX_SIZE);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, FLARE_TEX_SIZE, FLARE_TEX_SIZE);
        tex.update();
        tex.hasAlpha = true;
        this.flareTexture = tex;
    }

    /** Radial gradient sprite with optional mottling for organic look (flame/smoke/blood). */
    private _buildGradientTexture(name: string, stops: { stop: number; color: string }[], mottled: boolean): BABYLON.DynamicTexture {
        const tex = new BABYLON.DynamicTexture(name, { width: TEX_SIZE, height: TEX_SIZE }, this.scene.bScene, true);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const c = TEX_SIZE / 2;
        ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
        for (const s of stops) gradient.addColorStop(s.stop, s.color);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        if (mottled) {
            ctx.globalCompositeOperation = 'destination-out';
            for (let i = 0; i < 10; i++) {
                const x = Math.random() * TEX_SIZE;
                const y = Math.random() * TEX_SIZE;
                const r = 2 + Math.random() * 5;
                const hole = ctx.createRadialGradient(x, y, 0, x, y, r);
                hole.addColorStop(0, 'rgba(0,0,0,0.35)');
                hole.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = hole;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
        }
        tex.update();
        tex.hasAlpha = true;
        return tex;
    }

    /** Star-shaped icy shard sprite. */
    private _buildFrostTexture(): BABYLON.DynamicTexture {
        const tex = new BABYLON.DynamicTexture('fab_frost_tex', { width: TEX_SIZE, height: TEX_SIZE }, this.scene.bScene, true);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const c = TEX_SIZE / 2;
        ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
        const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
        glow.addColorStop(0, 'rgba(210,240,255,0.9)');
        glow.addColorStop(0.4, 'rgba(140,200,255,0.4)');
        glow.addColorStop(1, 'rgba(80,140,230,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        ctx.strokeStyle = 'rgba(230,248,255,0.95)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(c, c);
            ctx.lineTo(c + Math.cos(angle) * (c - 4), c + Math.sin(angle) * (c - 4));
            ctx.stroke();
        }
        tex.update();
        tex.hasAlpha = true;
        return tex;
    }

    private _registerBloodPoolShaders(): void {
        if (VfxSystem._bloodPoolShaderReady) return;
        try {
            const store = BABYLON.Effect.ShadersStore as Record<string, string>;
            store['fabBloodPoolVertexShader'] = BLOOD_POOL_VERTEX_SHADER;
            store['fabBloodPoolFragmentShader'] = BLOOD_POOL_FRAGMENT_SHADER;
            VfxSystem._bloodPoolShaderReady = true;
            console.debug('[Vfx] Blood pool shader registered');
        } catch (err) {
            console.warn('[Vfx] Failed to register blood pool shader:', err);
        }
    }

    getFlareTexture(): BABYLON.DynamicTexture | null {
        return this.flareTexture;
    }

    private _qualityMult(): number {
        return QUALITY_MULT[FabulusPrefs.get().gfxParticleQuality] ?? 1;
    }

    private _textureFor(key: BurstConfig['texture']): BABYLON.DynamicTexture | null {
        switch (key) {
            case 'flame': return this.flameTexture;
            case 'smoke': return this.smokeTexture;
            case 'blood': return this.bloodTexture;
            case 'frost': return this.frostTexture;
            default: return this.flareTexture;
        }
    }

    private _burstConfig(kind: BurstKind): BurstConfig {
        switch (kind) {
            case 'blood': return {
                capacity: 50, texture: 'blood', blendMode: BABYLON.ParticleSystem.BLENDMODE_STANDARD,
                minSize: 0.1, maxSize: 0.28, minLife: 0.25, maxLife: 0.55, emitRate: 420,
                dir1: new BABYLON.Vector3(-1, 0.6, -1), dir2: new BABYLON.Vector3(1, 1.8, 1),
                minPower: 1.5, maxPower: 3.5, gravity: new BABYLON.Vector3(0, -14, 0), stopAfter: 0.12,
            };
            case 'bloodBig': return {
                capacity: 110, texture: 'blood', blendMode: BABYLON.ParticleSystem.BLENDMODE_STANDARD,
                minSize: 0.14, maxSize: 0.4, minLife: 0.35, maxLife: 0.8, emitRate: 700,
                dir1: new BABYLON.Vector3(-1.2, 0.5, -1.2), dir2: new BABYLON.Vector3(1.2, 2.4, 1.2),
                minPower: 2, maxPower: 5, gravity: new BABYLON.Vector3(0, -14, 0), stopAfter: 0.16,
            };
            case 'fire': return {
                capacity: 90, texture: 'flame', blendMode: BABYLON.ParticleSystem.BLENDMODE_ADD,
                minSize: 0.2, maxSize: 0.55, minLife: 0.25, maxLife: 0.6, emitRate: 520,
                dir1: new BABYLON.Vector3(-0.8, 0.8, -0.8), dir2: new BABYLON.Vector3(0.8, 2.6, 0.8),
                minPower: 1, maxPower: 3, gravity: new BABYLON.Vector3(0, 1.5, 0), stopAfter: 0.18,
                sizeGradient: [{ t: 0, size: 0.5 }, { t: 0.35, size: 1 }, { t: 1, size: 0.15 }],
            };
            case 'smoke': return {
                capacity: 35, texture: 'smoke', blendMode: BABYLON.ParticleSystem.BLENDMODE_STANDARD,
                minSize: 0.4, maxSize: 0.9, minLife: 0.9, maxLife: 1.8, emitRate: 60,
                dir1: new BABYLON.Vector3(-0.25, 0.8, -0.25), dir2: new BABYLON.Vector3(0.25, 1.6, 0.25),
                minPower: 0.4, maxPower: 1.0, gravity: new BABYLON.Vector3(0, 0.6, 0), stopAfter: 0.35,
                sizeGradient: [{ t: 0, size: 0.4 }, { t: 1, size: 1.6 }],
            };
            case 'frost': return {
                capacity: 70, texture: 'frost', blendMode: BABYLON.ParticleSystem.BLENDMODE_ADD,
                minSize: 0.12, maxSize: 0.34, minLife: 0.3, maxLife: 0.7, emitRate: 460,
                dir1: new BABYLON.Vector3(-1.4, 0.4, -1.4), dir2: new BABYLON.Vector3(1.4, 1.8, 1.4),
                minPower: 1.6, maxPower: 4, gravity: new BABYLON.Vector3(0, -8, 0), stopAfter: 0.14,
            };
            case 'frostMist': return {
                capacity: 30, texture: 'smoke', blendMode: BABYLON.ParticleSystem.BLENDMODE_STANDARD,
                minSize: 0.5, maxSize: 1.1, minLife: 0.7, maxLife: 1.4, emitRate: 70,
                dir1: new BABYLON.Vector3(-0.6, 0.05, -0.6), dir2: new BABYLON.Vector3(0.6, 0.35, 0.6),
                minPower: 0.3, maxPower: 0.9, gravity: new BABYLON.Vector3(0, 0.15, 0), stopAfter: 0.3,
                sizeGradient: [{ t: 0, size: 0.5 }, { t: 1, size: 1.5 }],
            };
            case 'spark': return {
                capacity: 45, texture: 'flare', blendMode: BABYLON.ParticleSystem.BLENDMODE_ADD,
                minSize: 0.05, maxSize: 0.14, minLife: 0.15, maxLife: 0.4, emitRate: 420,
                dir1: new BABYLON.Vector3(-1.2, 0.6, -1.2), dir2: new BABYLON.Vector3(1.2, 2.2, 1.2),
                minPower: 2, maxPower: 5, gravity: new BABYLON.Vector3(0, -10, 0), stopAfter: 0.1,
            };
            case 'dust': return {
                capacity: 30, texture: 'smoke', blendMode: BABYLON.ParticleSystem.BLENDMODE_STANDARD,
                minSize: 0.25, maxSize: 0.6, minLife: 0.4, maxLife: 0.9, emitRate: 140,
                dir1: new BABYLON.Vector3(-1, 0.1, -1), dir2: new BABYLON.Vector3(1, 0.6, 1),
                minPower: 0.6, maxPower: 1.6, gravity: new BABYLON.Vector3(0, -0.5, 0), stopAfter: 0.15,
                sizeGradient: [{ t: 0, size: 0.5 }, { t: 1, size: 1.4 }],
            };
            default: return {
                capacity: 60, texture: 'flare', blendMode: BABYLON.ParticleSystem.BLENDMODE_ADD,
                minSize: 0.08, maxSize: 0.2, minLife: 0.3, maxLife: 0.7, emitRate: 300,
                dir1: new BABYLON.Vector3(-1, 1, -1), dir2: new BABYLON.Vector3(1, 2, 1),
                minPower: 1.5, maxPower: 3.5, gravity: new BABYLON.Vector3(0, -6, 0), stopAfter: 0.25,
            };
        }
    }

    /** Pooled fire-and-forget burst; emitters are reused instead of created/disposed per cast. */
    private _burst(kind: BurstKind, position: BABYLON.Vector3, color1?: BABYLON.Color4, color2?: BABYLON.Color4): void {
        const quality = this._qualityMult();
        const pool = this.burstPools.get(kind) ?? [];
        this.burstPools.set(kind, pool);
        const cfg = this._burstConfig(kind);
        const desiredCapacity = Math.max(8, Math.round(cfg.capacity * quality));
        let ps = pool.pop();
        if (ps && ps.getCapacity() !== desiredCapacity) {
            // Particle quality changed since this system was pooled: rebuild it.
            try { ps.dispose(false); } catch { /* already disposed */ }
            ps = undefined;
        }
        if (!ps) {
            ps = new BABYLON.ParticleSystem(`fab_burst_${kind}`, desiredCapacity, this.scene.bScene);
            ps.particleTexture = this._textureFor(cfg.texture);
            ps.blendMode = cfg.blendMode;
            ps.minSize = cfg.minSize;
            ps.maxSize = cfg.maxSize;
            ps.minLifeTime = cfg.minLife;
            ps.maxLifeTime = cfg.maxLife;
            ps.direction1 = cfg.dir1;
            ps.direction2 = cfg.dir2;
            ps.minEmitPower = cfg.minPower;
            ps.maxEmitPower = cfg.maxPower;
            ps.gravity = cfg.gravity;
            ps.minAngularSpeed = -2;
            ps.maxAngularSpeed = 2;
            if (cfg.sizeGradient) {
                for (const g of cfg.sizeGradient) ps.addSizeGradient(g.t, g.size * ((cfg.minSize + cfg.maxSize) / 2));
            }
        }
        ps.emitter = position.clone();
        ps.emitRate = Math.max(20, Math.round(cfg.emitRate * quality));
        if (color1) {
            ps.color1 = color1;
            ps.color2 = color2 ?? color1;
        } else {
            ps.color1 = new BABYLON.Color4(1, 1, 1, 1);
            ps.color2 = new BABYLON.Color4(1, 1, 1, 1);
        }
        ps.targetStopDuration = cfg.stopAfter;
        this.activeBursts.add(ps);
        const release = () => {
            const handle = window.setTimeout(() => {
                this.pendingTimeouts.delete(handle);
                if (!ps) return;
                this.activeBursts.delete(ps);
                if (this.scene.bScene.isDisposed) return;
                const p = this.burstPools.get(kind);
                if (p) p.push(ps);
            }, Math.ceil(cfg.maxLife * 1000) + 50);
            this.pendingTimeouts.add(handle);
        };
        ps.onStoppedObservable.addOnce(release);
        ps.reset();
        ps.start();
    }

    // ── Blood / gore ─────────────────────────────────────────────────────────

    bloodSplatter(position: BABYLON.Vector3, big = false): void {
        const pos = position.clone();
        pos.y += big ? 0.8 : 1.1;
        this._burst(big ? 'bloodBig' : 'blood', pos);
        if (big) this.bloodPool(position.x, position.z, 0.7 + Math.random() * 0.4);
    }

    /** Temporary blood pool decal that slowly fades away. */
    bloodPool(x: number, z: number, radius: number): void {
        const s = this.scene.bScene;
        const disc = BABYLON.MeshBuilder.CreateDisc('fab_blood_pool', { radius, tessellation: 18 }, s);
        disc.rotation.x = Math.PI / 2;
        disc.rotation.y = Math.random() * Math.PI * 2;
        const bx = x + (Math.random() - 0.5) * 0.3;
        const bz = z + (Math.random() - 0.5) * 0.3;
        disc.position.set(bx, this.scene.mapSystem.getHeightAt(bx, bz) + 0.025, bz);
        disc.isPickable = false;
        disc.material = this._acquireBloodPoolMaterial(s, radius);
        this.timedMeshes.push({ mesh: disc, bornAt: this.scene.now(), lifetimeMs: BLOOD_POOL_LIFETIME_MS, growTo: 1.25, poolKey: null, baseAlpha: BLOOD_POOL_BASE_ALPHA, matPool: this.bloodMatPool });
    }

    private _acquireBloodPoolMaterial(s: BABYLON.Scene, radius: number): BABYLON.Material {
        const recycled = this.bloodMatPool.pop();
        if (recycled) {
            if (recycled instanceof BABYLON.ShaderMaterial) {
                recycled.setFloat('uRadius', Math.max(radius, 1e-3));
                recycled.setFloat('uAlpha', BLOOD_POOL_BASE_ALPHA);
                recycled.setFloat('time', this.scene.now() / 1000);
            } else {
                (recycled as BABYLON.StandardMaterial).alpha = BLOOD_POOL_BASE_ALPHA;
            }
            return recycled;
        }
        return this._buildBloodPoolMaterial(s, radius);
    }

    private _buildBloodPoolMaterial(s: BABYLON.Scene, radius: number): BABYLON.Material {
        if (VfxSystem._bloodPoolShaderReady) {
            try {
                const mat = new BABYLON.ShaderMaterial(
                    'fab_blood_pool_mat',
                    s,
                    { vertex: 'fabBloodPool', fragment: 'fabBloodPool' },
                    {
                        attributes: ['position'],
                        uniforms: ['world', 'worldViewProjection', 'cameraPosition', 'time', 'uAlpha', 'uRadius'],
                    },
                );
                mat.backFaceCulling = false;
                mat.alpha = 0.99;
                mat.alphaMode = BABYLON.Constants.ALPHA_COMBINE;
                mat.setFloat('uRadius', Math.max(radius, 1e-3));
                mat.setFloat('uAlpha', BLOOD_POOL_BASE_ALPHA);
                mat.setFloat('time', this.scene.now() / 1000);
                return mat;
            } catch (err) {
                console.warn('[Vfx] Blood pool shader material failed, using fallback:', err);
            }
        }
        const fallback = new BABYLON.StandardMaterial('fab_blood_pool_mat', s);
        fallback.diffuseColor = new BABYLON.Color3(0.22, 0.015, 0.01);
        fallback.specularColor = new BABYLON.Color3(0.25, 0.05, 0.04);
        fallback.emissiveColor = new BABYLON.Color3(0.05, 0.005, 0.004);
        fallback.alpha = BLOOD_POOL_BASE_ALPHA;
        return fallback;
    }

    // ── Element impacts (data-driven via rpg_skills.vfx_element) ─────────────

    elementImpact(position: BABYLON.Vector3, element: string | null | undefined): void {
        const pos = position.clone();
        pos.y += 1.0;
        switch (element) {
            case 'fire': {
                this._burst('fire', pos);
                const smokePos = pos.clone();
                smokePos.y += 0.4;
                this._burst('smoke', smokePos);
                break;
            }
            case 'ice': {
                this._burst('frost', pos);
                const mistPos = position.clone();
                mistPos.y += 0.25;
                this._burst('frostMist', mistPos);
                break;
            }
            case 'arcane':
                this._burst('addBurst', pos, new BABYLON.Color4(0.75, 0.45, 1.0, 0.95), new BABYLON.Color4(0.45, 0.2, 0.8, 0.6));
                break;
            case 'holy':
                this._burst('addBurst', pos, new BABYLON.Color4(0.5, 1.0, 0.6, 0.95), new BABYLON.Color4(0.9, 1.0, 0.7, 0.6));
                break;
            default:
                this._burst('dust', position.clone());
                this._burst('spark', pos, new BABYLON.Color4(1.0, 0.85, 0.5, 0.9), new BABYLON.Color4(0.9, 0.6, 0.3, 0.5));
        }
        if (this.advancedFx) {
            this._burst('spark', pos, new BABYLON.Color4(1.0, 0.9, 0.7, 0.9), new BABYLON.Color4(0.9, 0.7, 0.4, 0.5));
            const ringColor = element === 'fire' ? new BABYLON.Color3(1.0, 0.5, 0.2)
                : element === 'ice' ? new BABYLON.Color3(0.6, 0.85, 1.0)
                : element === 'arcane' ? new BABYLON.Color3(0.7, 0.45, 1.0)
                : element === 'holy' ? new BABYLON.Color3(0.9, 1.0, 0.7)
                : new BABYLON.Color3(1.0, 0.8, 0.5);
            this._spawnRing(0.6, 0.06, ringColor, 0.85, position.x, 0.06, position.z, 320, 4.5);
        }
    }

    meleeImpact(position: BABYLON.Vector3): void {
        this._burst('dust', position.clone());
        this._burst('spark', position.clone().add(new BABYLON.Vector3(0, 1.0, 0)),
            new BABYLON.Color4(1.0, 0.85, 0.5, 0.85), new BABYLON.Color4(0.85, 0.55, 0.25, 0.5));
        if (this.advancedFx) {
            this._spawnRing(0.5, 0.05, new BABYLON.Color3(1.0, 0.92, 0.7), 0.7, position.x, 0.06, position.z, 240, 3.2);
        }
    }

    // ── Rings / markers (mesh based) ─────────────────────────────────────────

    private _acquireRing(diameter: number, thickness: number, color: BABYLON.Color3, alpha: number): BABYLON.Mesh {
        const key = `${diameter.toFixed(2)}_${thickness.toFixed(2)}`;
        const pool = this.ringPools.get(key) ?? [];
        let ring = pool.pop();
        if (!ring) {
            ring = BABYLON.MeshBuilder.CreateTorus(`fab_ring_${key}`, { diameter, thickness, tessellation: 32 }, this.scene.bScene);
            ring.isPickable = false;
            const mat = new BABYLON.StandardMaterial(`fab_ring_mat_${key}`, this.scene.bScene);
            mat.disableLighting = true;
            ring.material = mat;
        }
        const mat = ring.material as BABYLON.StandardMaterial;
        mat.emissiveColor = color;
        mat.alpha = alpha;
        ring.scaling.set(1, 1, 1);
        ring.setEnabled(true);
        this.ringPools.set(key, pool);
        return ring;
    }

    private _releaseRing(tm: TimedMesh): void {
        if (tm.poolKey) {
            tm.mesh.setEnabled(false);
            const pool = this.ringPools.get(tm.poolKey) ?? [];
            pool.push(tm.mesh);
            this.ringPools.set(tm.poolKey, pool);
            return;
        }
        if (tm.matPool) {
            // Recycle the material; the disc geometry is cheap and disposed without its material.
            const mat = tm.mesh.material;
            tm.mesh.dispose(false, false);
            if (mat) tm.matPool.push(mat);
            return;
        }
        tm.mesh.dispose(false, true);
    }

    private _acquireStdMat(pool: BABYLON.Material[], name: string): BABYLON.StandardMaterial {
        const recycled = pool.pop();
        if (recycled instanceof BABYLON.StandardMaterial) return recycled;
        const mat = new BABYLON.StandardMaterial(name, this.scene.bScene);
        mat.disableLighting = true;
        return mat;
    }

    /** `y` is an offset above the terrain surface at (x, z). */
    private _spawnRing(diameter: number, thickness: number, color: BABYLON.Color3, alpha: number, x: number, y: number, z: number, lifetimeMs: number, growTo: number): void {
        const ring = this._acquireRing(diameter, thickness, color, alpha);
        ring.position.set(x, this.scene.mapSystem.getHeightAt(x, z) + y, z);
        this.timedMeshes.push({
            mesh: ring, bornAt: this.scene.now(), lifetimeMs, growTo,
            poolKey: `${diameter.toFixed(2)}_${thickness.toFixed(2)}`, baseAlpha: alpha,
        });
    }

    moveMarker(x: number, z: number): void {
        this._spawnRing(0.5, 0.06, new BABYLON.Color3(0.4, 0.9, 0.5), 0.7, x, 0.04, z, MARKER_LIFETIME_MS, 1.6);
    }

    aoeRing(x: number, z: number, radius: number, color: BABYLON.Color3, element?: string | null): void {
        this._spawnRing(radius * 0.4, 0.12, color, 0.6, x, 0.06, z, AOE_RING_LIFETIME_MS, radius / (radius * 0.4));
        this.elementImpact(new BABYLON.Vector3(x, this.scene.mapSystem.getHeightAt(x, z), z), element);
    }

    levelUpBurst(): void {
        const root = this.scene.playerRoot;
        if (!root) return;
        this._spawnRing(0.6, 0.15, new BABYLON.Color3(1.0, 0.85, 0.3), 0.8, root.position.x, 0.08, root.position.z, LEVELUP_RING_LIFETIME_MS, 6);
        this._burst('addBurst', root.position.clone().add(new BABYLON.Vector3(0, 1, 0)),
            new BABYLON.Color4(1, 0.85, 0.3, 1), new BABYLON.Color4(1, 0.95, 0.6, 0.7));
    }

    buffAura(color: BABYLON.Color3): void {
        const root = this.scene.playerRoot;
        if (!root) return;
        this._spawnRing(0.8, 0.1, color, 0.5, root.position.x, 0.06, root.position.z, AURA_LIFETIME_MS, 2.2);
    }

    healSparkle(): void {
        const root = this.scene.playerRoot;
        if (!root) return;
        this._burst('addBurst', root.position.clone().add(new BABYLON.Vector3(0, 1, 0)),
            new BABYLON.Color4(0.4, 1.0, 0.5, 1), new BABYLON.Color4(0.7, 1.0, 0.7, 0.6));
    }

    slashArc(x: number, z: number, yaw: number, color: BABYLON.Color3): void {
        const s = this.scene.bScene;
        const disc = BABYLON.MeshBuilder.CreateDisc('fab_slash', { radius: 1.4, arc: 0.4, tessellation: 24, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, s);
        disc.rotation.x = Math.PI / 2;
        disc.rotation.y = yaw - Math.PI * 0.4;
        disc.position.set(x, this.scene.mapSystem.getHeightAt(x, z) + 1.0, z);
        disc.isPickable = false;
        const mat = this._acquireStdMat(this.slashMatPool, 'fab_slash_mat');
        mat.emissiveColor = color;
        mat.alpha = 0.65;
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        disc.material = mat;
        this.timedMeshes.push({ mesh: disc, bornAt: this.scene.now(), lifetimeMs: 180, growTo: 1.5, poolKey: null, baseAlpha: 0.65, matPool: this.slashMatPool });
    }

    deathBurst(position: BABYLON.Vector3): void {
        this.bloodSplatter(position, true);
        const smokePos = position.clone();
        smokePos.y += 0.6;
        this._burst('smoke', smokePos);
    }

    goldSparkle(position: BABYLON.Vector3): void {
        this._burst('addBurst', position.clone().add(new BABYLON.Vector3(0, 1, 0)),
            new BABYLON.Color4(1.0, 0.85, 0.3, 1), new BABYLON.Color4(1.0, 0.95, 0.55, 0.6));
    }

    impactDecal(x: number, z: number, radius: number): void {
        const s = this.scene.bScene;
        const disc = BABYLON.MeshBuilder.CreateDisc('fab_decal', { radius, tessellation: 20 }, s);
        disc.rotation.x = Math.PI / 2;
        disc.position.set(x, this.scene.mapSystem.getHeightAt(x, z) + 0.02, z);
        disc.isPickable = false;
        const mat = this._acquireStdMat(this.decalMatPool, 'fab_decal_mat');
        mat.diffuseColor = new BABYLON.Color3(0.08, 0.03, 0.02);
        mat.emissiveColor = new BABYLON.Color3(0.12, 0.02, 0.01);
        mat.alpha = 0.55;
        mat.disableLighting = true;
        disc.material = mat;
        this.timedMeshes.push({ mesh: disc, bornAt: this.scene.now(), lifetimeMs: 2600, growTo: 1.15, poolKey: null, baseAlpha: 0.55, matPool: this.decalMatPool });
    }

    attachProjectileTrail(mesh: BABYLON.Mesh, color: BABYLON.Color3, element?: string | null): BABYLON.ParticleSystem | null {
        if (!this.flareTexture) return null;
        const s = this.scene.bScene;
        const quality = this._qualityMult();
        const isFire = element === 'fire';
        const ps = new BABYLON.ParticleSystem('fab_trail', Math.max(20, Math.round(80 * quality)), s);
        ps.particleTexture = isFire && this.flameTexture ? this.flameTexture : this.flareTexture;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        ps.emitter = mesh;
        ps.color1 = new BABYLON.Color4(color.r, color.g, color.b, 0.9);
        ps.color2 = new BABYLON.Color4(color.r * 0.6, color.g * 0.6, color.b * 0.6, 0.5);
        ps.colorDead = new BABYLON.Color4(color.r * 0.2, color.g * 0.2, color.b * 0.2, 0);
        ps.minSize = isFire ? 0.18 : 0.12;
        ps.maxSize = isFire ? 0.42 : 0.3;
        ps.minLifeTime = 0.15;
        ps.maxLifeTime = 0.35;
        ps.emitRate = Math.max(40, Math.round(120 * quality));
        ps.direction1 = new BABYLON.Vector3(-0.2, -0.2, -0.2);
        ps.direction2 = new BABYLON.Vector3(0.2, 0.2, 0.2);
        ps.minEmitPower = 0.05;
        ps.maxEmitPower = 0.25;
        ps.gravity = isFire ? new BABYLON.Vector3(0, 0.8, 0) : BABYLON.Vector3.Zero();
        ps.start();
        return ps;
    }

    hitFlash(meshes: BABYLON.AbstractMesh[]): void {
        const flashed: { mesh: BABYLON.AbstractMesh; baseMat: BABYLON.Material; flashMat: BABYLON.Material }[] = [];
        for (const m of meshes) {
            const meta = (m.metadata ?? (m.metadata = {})) as { __fabHitFlash?: boolean };
            if (meta.__fabHitFlash) continue;
            const mat = m.material as BABYLON.StandardMaterial | BABYLON.PBRMaterial | null;
            if (!mat || (mat as any).emissiveColor === undefined || typeof (mat as any).clone !== 'function') continue;
            const flashMat = (mat as any).clone(`${mat.name}__flash`) as BABYLON.Material | null;
            if (!flashMat) continue;
            meta.__fabHitFlash = true;
            (flashMat as any).emissiveColor = HIT_FLASH_COLOR;
            m.material = flashMat;
            flashed.push({ mesh: m, baseMat: mat, flashMat });
        }
        if (!flashed.length) return;
        const handle = window.setTimeout(() => {
            this.pendingTimeouts.delete(handle);
            for (const f of flashed) {
                f.mesh.material = f.baseMat;
                try { f.flashMat.dispose(); } catch { /* already disposed */ }
                const meta = f.mesh.metadata as { __fabHitFlash?: boolean } | null;
                if (meta) meta.__fabHitFlash = false;
            }
        }, HIT_FLASH_MS);
        this.pendingTimeouts.add(handle);
    }

    update(_dt: number): void {
        const now = this.scene.now();
        for (let i = this.timedMeshes.length - 1; i >= 0; i--) {
            const tm = this.timedMeshes[i];
            const t = (now - tm.bornAt) / tm.lifetimeMs;
            if (t >= 1) {
                this._releaseRing(tm);
                this.timedMeshes.splice(i, 1);
                continue;
            }
            const scale = 1 + (tm.growTo - 1) * t;
            tm.mesh.scaling.set(scale, 1, scale);
            const fade = Math.max(0, tm.baseAlpha * (1 - t));
            const mat = tm.mesh.material as BABYLON.Material | null;
            if (mat instanceof BABYLON.ShaderMaterial) {
                mat.setFloat('time', now / 1000);
                mat.setFloat('uAlpha', fade);
            } else if (mat) {
                (mat as BABYLON.StandardMaterial).alpha = fade;
            }
        }
    }

    dispose(): void {
        for (const tm of this.timedMeshes) {
            try { tm.mesh.dispose(false, true); } catch { /* already disposed */ }
        }
        this.timedMeshes = [];
        for (const pool of this.ringPools.values()) {
            for (const ring of pool) {
                try { ring.dispose(false, true); } catch { /* already disposed */ }
            }
        }
        this.ringPools.clear();
        for (const pool of [this.slashMatPool, this.decalMatPool, this.bloodMatPool]) {
            for (const mat of pool) {
                try { mat.dispose(); } catch { /* already disposed */ }
            }
            pool.length = 0;
        }
        for (const handle of this.pendingTimeouts) clearTimeout(handle);
        this.pendingTimeouts.clear();
        for (const ps of this.activeBursts) {
            try { ps.dispose(false); } catch { /* already disposed */ }
        }
        this.activeBursts.clear();
        for (const pool of this.burstPools.values()) {
            for (const ps of pool) {
                try { ps.dispose(false); } catch { /* already disposed */ }
            }
        }
        this.burstPools.clear();
        for (const tex of [this.flareTexture, this.flameTexture, this.smokeTexture, this.bloodTexture, this.frostTexture]) {
            try { tex?.dispose(); } catch { /* already disposed */ }
        }
        this.flareTexture = null;
        this.flameTexture = null;
        this.smokeTexture = null;
        this.bloodTexture = null;
        this.frostTexture = null;
    }
}
