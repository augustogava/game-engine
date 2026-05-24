import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    HIGH_CLOUDS_SHADER_VERTEX_URL,
    HIGH_CLOUDS_SHADER_FRAGMENT_URL,
    HIGH_CLOUDS_ALTITUDE_M,
    HIGH_CLOUDS_PLANE_SIZE_M,
    HIGH_CLOUDS_ALPHA_INDEX,
    HIGH_CLOUDS_NOISE_UV_SCALE,
    HIGH_CLOUDS_SHADOW_SAMPLE_MIN_SUN_Y,
    HIGH_CLOUDS_DEFAULT_ENABLED,
    HIGH_CLOUDS_DEFAULT_COVER,
    HIGH_CLOUDS_DEFAULT_SPEED,
    HIGH_CLOUDS_DEFAULT_SCALE,
    HIGH_CLOUDS_DEFAULT_COLOR_R,
    HIGH_CLOUDS_DEFAULT_COLOR_G,
    HIGH_CLOUDS_DEFAULT_COLOR_B,
    HIGH_CLOUDS_DEFAULT_ALPHA,
    HIGH_CLOUDS_DEFAULT_REFLECT,
    CLOUD_DAY_COLOR_R,
    CLOUD_DAY_COLOR_G,
    CLOUD_DAY_COLOR_B,
    CLOUD_SUNSET_COLOR_R,
    CLOUD_SUNSET_COLOR_G,
    CLOUD_SUNSET_COLOR_B,
    CLOUD_NIGHT_COLOR_R,
    CLOUD_NIGHT_COLOR_G,
    CLOUD_NIGHT_COLOR_B,
    CLOUD_SUNSET_FADE_BAND_DEG,
    CLOUD_NIGHT_FADE_BAND_DEG,
    CLOUD_NIGHT_FADE_OFFSET_DEG,
} from '../constants/index.js';

const SUN_INTENSITY_EPSILON = 0.002;
const TINT_EPSILON = 0.003;

export class HighCloudsSystem {
    private readonly scene: any;
    private _shadersRegistered = false;
    private _shadersRegistering: Promise<boolean> | null = null;
    private _mesh: BABYLON.Mesh | null = null;
    private _material: BABYLON.ShaderMaterial | null = null;
    private _enabled: boolean = HIGH_CLOUDS_DEFAULT_ENABLED;
    private _cover: number = HIGH_CLOUDS_DEFAULT_COVER;
    private _speed: number = HIGH_CLOUDS_DEFAULT_SPEED;
    private _scale: number = HIGH_CLOUDS_DEFAULT_SCALE;
    private _color: BABYLON.Color3 = new BABYLON.Color3(
        HIGH_CLOUDS_DEFAULT_COLOR_R,
        HIGH_CLOUDS_DEFAULT_COLOR_G,
        HIGH_CLOUDS_DEFAULT_COLOR_B,
    );
    private _alpha: number = HIGH_CLOUDS_DEFAULT_ALPHA;
    private _reflect: number = HIGH_CLOUDS_DEFAULT_REFLECT;
    private _timeAccum = 0;
    private _lastAppliedSunIntensity = Number.NaN;
    private _sceneRef: BABYLON.Scene | null = null;
    private _autoTintEnabled = true;
    private _lastTintR = Number.NaN;
    private _lastTintG = Number.NaN;
    private _lastTintB = Number.NaN;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    private async registerShaders(): Promise<boolean> {
        if (this._shadersRegistered) return true;
        if (this._shadersRegistering) return this._shadersRegistering;
        this._shadersRegistering = (async () => {
            try {
                const [vsResp, fsResp] = await Promise.all([
                    fetch(HIGH_CLOUDS_SHADER_VERTEX_URL),
                    fetch(HIGH_CLOUDS_SHADER_FRAGMENT_URL),
                ]);
                if (!vsResp.ok || !fsResp.ok) {
                    throw new Error(`HTTP ${vsResp.status}/${fsResp.status} fetching high cloud shaders`);
                }
                const vsCode = await vsResp.text();
                const fsCode = await fsResp.text();
                (BABYLON.Effect.ShadersStore as any)['highCloudsVertexShader'] = vsCode;
                (BABYLON.Effect.ShadersStore as any)['highCloudsFragmentShader'] = fsCode;
                this._shadersRegistered = true;
                console.debug('[HighClouds] Shaders registered');
                return true;
            } catch (err) {
                console.warn('[HighClouds] Failed to fetch shaders:', err);
                return false;
            } finally {
                this._shadersRegistering = null;
            }
        })();
        return this._shadersRegistering;
    }

    async build(scene: BABYLON.Scene): Promise<void> {
        if (this._mesh) return;
        this._sceneRef = scene;
        const ok = await this.registerShaders();
        if (!ok) return;
        if (this._mesh) return;

        const plane = BABYLON.MeshBuilder.CreateGround('highCloudsLayer', {
            width: HIGH_CLOUDS_PLANE_SIZE_M,
            height: HIGH_CLOUDS_PLANE_SIZE_M,
            subdivisions: 1,
        }, scene);
        plane.position.y = HIGH_CLOUDS_ALTITUDE_M;
        plane.isPickable = false;
        plane.alphaIndex = HIGH_CLOUDS_ALPHA_INDEX;
        plane.applyFog = false;
        plane.renderingGroupId = 0;

        const mat = new BABYLON.ShaderMaterial(
            'highCloudsMat',
            scene,
            { vertex: 'highClouds', fragment: 'highClouds' },
            {
                attributes: ['position'],
                uniforms: [
                    'world', 'worldViewProjection',
                    'time', 'cover', 'speed', 'scale', 'noiseUvScale', 'alpha', 'reflectAmount',
                    'cloudColor', 'sunDir', 'sunColor', 'cameraPos', 'horizonColor',
                ],
            },
        );
        mat.backFaceCulling = false;
        mat.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
        mat.needAlphaBlending = () => true;
        mat.needDepthPrePass = false;
        plane.material = mat;

        this._mesh = plane;
        this._material = mat;
        this._mesh.setEnabled(this._enabled);
        console.debug('[HighClouds] Plane created at altitude ' + HIGH_CLOUDS_ALTITUDE_M + 'm');
    }

    update(dt: number): void {
        if (!this._mesh || !this._material) return;
        if (!this._enabled) return;

        const dtClamp = Math.max(0, Math.min(0.25, dt));
        this._timeAccum += dtClamp;

        const cam: BABYLON.Camera | null = this.scene.scene?.activeCamera ?? null;
        const camPos = cam ? cam.globalPosition : (this.scene.planeRoot?.position ?? BABYLON.Vector3.Zero());
        this._mesh.position.x = camPos.x;
        this._mesh.position.z = camPos.z;

        const sun = this.scene._sunLight;
        const sunDir = sun ? sun.direction : new BABYLON.Vector3(0, -1, 0.5).normalize();
        const sunColor = sun ? sun.diffuse : new BABYLON.Color3(1.0, 0.95, 0.8);
        const horizonColor = this._sceneRef?.fogColor ?? new BABYLON.Color3(0.6, 0.7, 0.85);

        this._material.setFloat('time', this._timeAccum);
        this._material.setFloat('cover', this._cover);
        this._material.setFloat('speed', this._speed);
        this._material.setFloat('scale', this._scale);
        this._material.setFloat('noiseUvScale', HIGH_CLOUDS_NOISE_UV_SCALE);
        this._material.setFloat('alpha', this._alpha);
        this._material.setFloat('reflectAmount', this._reflect);
        this._material.setColor3('cloudColor', this._color);
        this._material.setVector3('sunDir', sunDir);
        this._material.setColor3('sunColor', sunColor);
        this._material.setVector3('cameraPos', camPos);
        this._material.setColor3('horizonColor', horizonColor);

        this.applyCloudShadow();
    }

    private applyCloudShadow(): void {
        const sun = this.scene._sunLight;
        const planeRoot = this.scene.planeRoot;
        const lightingSys = this.scene._lightingSystem;
        if (!sun || !planeRoot || !lightingSys) return;

        const baseIntensity: number = typeof lightingSys.getLastDayNightSunIntensity === 'function'
            ? lightingSys.getLastDayNightSunIntensity()
            : sun.intensity;

        const sd = sun.direction;
        if (-sd.y < HIGH_CLOUDS_SHADOW_SAMPLE_MIN_SUN_Y) {
            this.restoreSunIntensity(baseIntensity);
            return;
        }

        const dy = HIGH_CLOUDS_ALTITUDE_M - planeRoot.position.y;
        if (dy <= 0) {
            this.restoreSunIntensity(baseIntensity);
            return;
        }
        const t = dy / -sd.y;
        if (!Number.isFinite(t) || t < 0) {
            this.restoreSunIntensity(baseIntensity);
            return;
        }
        const sx = planeRoot.position.x - sd.x * t;
        const sz = planeRoot.position.z - sd.z * t;

        const uvScale = HIGH_CLOUDS_NOISE_UV_SCALE * this._scale;
        const ux = sx * uvScale + this._timeAccum * this._speed;
        const uz = sz * uvScale + this._timeAccum * this._speed * 0.5;
        const cl = fbm9(ux, uz);
        const dl = smoothstep01(-0.2 + 0.4 * this._cover, 0.6, cl);
        const shade = 1.0 - this._reflect * dl;
        const target = baseIntensity * shade;

        if (!Number.isFinite(this._lastAppliedSunIntensity)
            || Math.abs(target - this._lastAppliedSunIntensity) > SUN_INTENSITY_EPSILON) {
            sun.intensity = target;
            this._lastAppliedSunIntensity = target;
        }
    }

    private restoreSunIntensity(baseIntensity: number): void {
        const sun = this.scene._sunLight;
        if (!sun) return;
        if (!Number.isFinite(this._lastAppliedSunIntensity)
            || Math.abs(sun.intensity - baseIntensity) > SUN_INTENSITY_EPSILON) {
            sun.intensity = baseIntensity;
            this._lastAppliedSunIntensity = baseIntensity;
        }
    }

    setEnabled(enabled: boolean): void {
        if (this._enabled === enabled) return;
        this._enabled = enabled;
        if (this._mesh) this._mesh.setEnabled(enabled);
        if (!enabled) {
            const lightingSys = this.scene._lightingSystem;
            const base: number = lightingSys && typeof lightingSys.getLastDayNightSunIntensity === 'function'
                ? lightingSys.getLastDayNightSunIntensity()
                : (this.scene._sunLight?.intensity ?? 3.0);
            this.restoreSunIntensity(base);
        }
    }

    setCover(value: number): void { this._cover = clamp01(value); }
    setSpeed(value: number): void { this._speed = Math.max(0, Math.min(2, value)); }
    setScale(value: number): void { this._scale = Math.max(0.1, Math.min(10, value)); }
    setAlpha(value: number): void { this._alpha = clamp01(value); }
    setReflect(value: number): void { this._reflect = clamp01(value); }
    setColor(r: number, g: number, b: number): void {
        this._color.set(clamp01(r), clamp01(g), clamp01(b));
        this._autoTintEnabled = false;
        this._lastTintR = Number.NaN;
    }
    setColorHex(hex: string): void {
        const rgb = hexToRgb(hex);
        if (rgb) this.setColor(rgb.r, rgb.g, rgb.b);
    }
    setAutoTint(enabled: boolean): void {
        this._autoTintEnabled = enabled;
        if (enabled) this._lastTintR = Number.NaN;
    }

    applyTint(elevation: number): void {
        if (!this._autoTintEnabled) return;
        const sunsetT = 1.0 - Math.max(0, Math.min(1, elevation / CLOUD_SUNSET_FADE_BAND_DEG));
        const nightT  = Math.max(0, Math.min(1, (CLOUD_NIGHT_FADE_OFFSET_DEG - elevation) / CLOUD_NIGHT_FADE_BAND_DEG));

        const dayR = CLOUD_DAY_COLOR_R + (CLOUD_SUNSET_COLOR_R - CLOUD_DAY_COLOR_R) * sunsetT;
        const dayG = CLOUD_DAY_COLOR_G + (CLOUD_SUNSET_COLOR_G - CLOUD_DAY_COLOR_G) * sunsetT;
        const dayB = CLOUD_DAY_COLOR_B + (CLOUD_SUNSET_COLOR_B - CLOUD_DAY_COLOR_B) * sunsetT;

        const r = dayR + (CLOUD_NIGHT_COLOR_R - dayR) * nightT;
        const g = dayG + (CLOUD_NIGHT_COLOR_G - dayG) * nightT;
        const b = dayB + (CLOUD_NIGHT_COLOR_B - dayB) * nightT;

        if (Number.isFinite(this._lastTintR)
            && Math.abs(r - this._lastTintR) < TINT_EPSILON
            && Math.abs(g - this._lastTintG) < TINT_EPSILON
            && Math.abs(b - this._lastTintB) < TINT_EPSILON) {
            return;
        }
        this._lastTintR = r;
        this._lastTintG = g;
        this._lastTintB = b;
        this._color.set(r, g, b);
    }

    isEnabled(): boolean { return this._enabled; }
    getCover(): number { return this._cover; }
    getSpeed(): number { return this._speed; }
    getScale(): number { return this._scale; }
    getAlpha(): number { return this._alpha; }
    getReflect(): number { return this._reflect; }
    getColorHex(): string { return rgbToHex(this._color.r, this._color.g, this._color.b); }
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

function smoothstep01(a: number, b: number, x: number): number {
    if (b <= a) return x >= b ? 1 : 0;
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

function hash1(px: number, py: number): number {
    const k = 0.3183099;
    let x = 50.0 * frac(px * k);
    let y = 50.0 * frac(py * k);
    return frac(x * y * (x + y));
}

function frac(x: number): number {
    return x - Math.floor(x);
}

function noise2(px: number, py: number): number {
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = hash1(ix, iy);
    const b = hash1(ix + 1, iy);
    const c = hash1(ix, iy + 1);
    const d = hash1(ix + 1, iy + 1);
    const v = a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    return -1 + 2 * v;
}

function fbm9(px: number, py: number): number {
    const f = 1.9;
    const s = 0.55;
    const m00 = 0.80, m01 = 0.60, m10 = -0.60, m11 = 0.80;
    let a = 0;
    let b = 0.5;
    let x = px;
    let y = py;
    for (let i = 0; i < 9; i++) {
        a += b * noise2(x, y);
        b *= s;
        const nx = f * (m00 * x + m01 * y);
        const ny = f * (m10 * x + m11 * y);
        x = nx;
        y = ny;
    }
    return a;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const clean = hex.replace('#', '').trim();
    if (clean.length !== 6) return null;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
    const c = (v: number) => {
        const n = Math.max(0, Math.min(255, Math.round(v * 255)));
        return n.toString(16).padStart(2, '0');
    };
    return `#${c(r)}${c(g)}${c(b)}`;
}
