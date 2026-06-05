import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    SEASCAPE_SKY_SHADER_VERTEX_URL,
    SEASCAPE_SKY_SHADER_FRAGMENT_URL,
    SEASCAPE_SKY_BOX_SIZE,
    SEASCAPE_SKY_DEFAULT_ENABLED,
    SEASCAPE_SKY_DEFAULT_COVER,
    SEASCAPE_SKY_DEFAULT_INTENSITY,
    SEASCAPE_SKY_DEFAULT_SPEED,
    SEASCAPE_SKY_DEFAULT_SCALE,
    SEASCAPE_SKY_DEFAULT_COLOR_R,
    SEASCAPE_SKY_DEFAULT_COLOR_G,
    SEASCAPE_SKY_DEFAULT_COLOR_B,
    SEASCAPE_SKY_NIGHT_ZENITH_R,
    SEASCAPE_SKY_NIGHT_ZENITH_G,
    SEASCAPE_SKY_NIGHT_ZENITH_B,
    SEASCAPE_SKY_DAYFACTOR_OFFSET_DEG,
    SEASCAPE_SKY_DAYFACTOR_RANGE_DEG,
    HDR_ENV_NONE,
} from '../constants/index.js';

export class SeascapeSkySystem {
    private readonly scene: any;
    private _shadersRegistered = false;
    private _shadersRegistering: Promise<boolean> | null = null;
    private _mesh: BABYLON.Mesh | null = null;
    private _material: BABYLON.ShaderMaterial | null = null;
    private _enabled: boolean = SEASCAPE_SKY_DEFAULT_ENABLED;
    private _cover: number = SEASCAPE_SKY_DEFAULT_COVER;
    private _intensity: number = SEASCAPE_SKY_DEFAULT_INTENSITY;
    private _speed: number = SEASCAPE_SKY_DEFAULT_SPEED;
    private _scale: number = SEASCAPE_SKY_DEFAULT_SCALE;
    private _color: BABYLON.Color3 = new BABYLON.Color3(
        SEASCAPE_SKY_DEFAULT_COLOR_R,
        SEASCAPE_SKY_DEFAULT_COLOR_G,
        SEASCAPE_SKY_DEFAULT_COLOR_B,
    );
    private readonly _nightZenith: BABYLON.Color3 = new BABYLON.Color3(
        SEASCAPE_SKY_NIGHT_ZENITH_R,
        SEASCAPE_SKY_NIGHT_ZENITH_G,
        SEASCAPE_SKY_NIGHT_ZENITH_B,
    );
    private _timeAccum = 0;
    private _sceneRef: BABYLON.Scene | null = null;
    private _savedHdrChoice: string | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    private async registerShaders(): Promise<boolean> {
        if (this._shadersRegistered) return true;
        if (this._shadersRegistering) return this._shadersRegistering;
        this._shadersRegistering = (async () => {
            try {
                const [vsResp, fsResp] = await Promise.all([
                    fetch(SEASCAPE_SKY_SHADER_VERTEX_URL),
                    fetch(SEASCAPE_SKY_SHADER_FRAGMENT_URL),
                ]);
                if (!vsResp.ok || !fsResp.ok) {
                    throw new Error(`HTTP ${vsResp.status}/${fsResp.status} fetching seascape sky shaders`);
                }
                const vsCode = await vsResp.text();
                const fsCode = await fsResp.text();
                (BABYLON.Effect.ShadersStore as any)['seascapeSkyVertexShader'] = vsCode;
                (BABYLON.Effect.ShadersStore as any)['seascapeSkyFragmentShader'] = fsCode;
                this._shadersRegistered = true;
                console.debug('[SeascapeSky] Shaders registered');
                return true;
            } catch (err) {
                console.warn('[SeascapeSky] Failed to fetch shaders:', err);
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
        if (this.scene._disposed) {
            console.debug('[SeascapeSky] Build aborted: scene disposed during shader load');
            return;
        }

        const box = BABYLON.MeshBuilder.CreateBox('seascapeSkyDome', { size: SEASCAPE_SKY_BOX_SIZE }, scene);
        box.infiniteDistance = true;
        box.ignoreCameraMaxZ = true;
        box.isPickable = false;
        box.applyFog = false;
        box.renderingGroupId = 0;

        const mat = new BABYLON.ShaderMaterial(
            'seascapeSkyMat',
            scene,
            { vertex: 'seascapeSky', fragment: 'seascapeSky' },
            {
                attributes: ['position'],
                uniforms: [
                    'worldViewProjection',
                    'time', 'cover', 'intensity', 'speed', 'scale', 'dayFactor',
                    'cloudColor', 'sunDir', 'sunColor', 'horizonColor', 'nightZenithColor',
                ],
            },
        );
        mat.backFaceCulling = false;
        box.material = mat;

        this._mesh = box;
        this._material = mat;
        this._mesh.setEnabled(this._enabled);
        if (this._enabled) this.applyHdrSuppression();
        console.debug('[SeascapeSky] Dome created (size ' + SEASCAPE_SKY_BOX_SIZE + ')');
    }

    update(dt: number): void {
        if (!this._mesh || !this._material) return;
        if (!this._enabled) return;

        const dtClamp = Math.max(0, Math.min(0.25, dt));
        this._timeAccum += dtClamp;

        const sun = this.scene._sunLight;
        const sunDir = sun ? sun.direction : new BABYLON.Vector3(0, -1, 0.5).normalize();
        const sunColor = sun ? sun.diffuse : new BABYLON.Color3(1.0, 0.95, 0.8);
        const horizonColor = this._sceneRef?.fogColor ?? new BABYLON.Color3(0.6, 0.7, 0.85);

        const elevation: number = typeof this.scene._sunElevation === 'number' ? this.scene._sunElevation : 45;
        const dayFactor = Math.max(0, Math.min(1,
            (elevation + SEASCAPE_SKY_DAYFACTOR_OFFSET_DEG) / SEASCAPE_SKY_DAYFACTOR_RANGE_DEG));

        this._material.setFloat('time', this._timeAccum);
        this._material.setFloat('cover', this._cover);
        this._material.setFloat('intensity', this._intensity);
        this._material.setFloat('speed', this._speed);
        this._material.setFloat('scale', this._scale);
        this._material.setFloat('dayFactor', dayFactor);
        this._material.setColor3('cloudColor', this._color);
        this._material.setVector3('sunDir', sunDir);
        this._material.setColor3('sunColor', sunColor);
        this._material.setColor3('horizonColor', horizonColor);
        this._material.setColor3('nightZenithColor', this._nightZenith);
    }

    private applyHdrSuppression(): void {
        const scene: BABYLON.Scene | null = this._sceneRef;
        const lightingSys = this.scene._lightingSystem;
        if (!scene || !lightingSys || typeof lightingSys.applyHdrEnvironment !== 'function') {
            console.warn('[SeascapeSky] Cannot suppress HDR: lighting system unavailable');
            return;
        }
        try {
            if (this._savedHdrChoice === null && typeof lightingSys.getUserHdrChoice === 'function') {
                this._savedHdrChoice = lightingSys.getUserHdrChoice();
            }
            lightingSys.applyHdrEnvironment(scene, HDR_ENV_NONE);
            const skyboxMesh = this.scene._skyboxMesh as BABYLON.Mesh | null;
            if (skyboxMesh) {
                skyboxMesh.setEnabled(false);
                skyboxMesh.isVisible = false;
            }
            console.debug('[SeascapeSky] HDR suppressed, procedural skybox hidden (saved: "' + this._savedHdrChoice + '")');
        } catch (err) {
            console.warn('[SeascapeSky] Failed to suppress HDR:', err);
        }
    }

    private restoreHdr(): void {
        const scene: BABYLON.Scene | null = this._sceneRef;
        const lightingSys = this.scene._lightingSystem;
        if (!scene || !lightingSys || typeof lightingSys.applyHdrEnvironment !== 'function') return;
        try {
            const choice = this._savedHdrChoice !== null ? this._savedHdrChoice : HDR_ENV_NONE;
            lightingSys.applyHdrEnvironment(scene, choice);
            console.debug('[SeascapeSky] HDR restored to "' + choice + '"');
        } catch (err) {
            console.warn('[SeascapeSky] Failed to restore HDR:', err);
        } finally {
            this._savedHdrChoice = null;
        }
    }

    setEnabled(enabled: boolean): void {
        if (this._enabled === enabled) return;
        this._enabled = enabled;
        if (this._mesh) this._mesh.setEnabled(enabled);
        if (enabled) {
            this.applyHdrSuppression();
        } else {
            this.restoreHdr();
        }
    }

    setCover(value: number): void { this._cover = clamp01(value); }
    setIntensity(value: number): void { this._intensity = Math.max(0, Math.min(1.5, value)); }
    setSpeed(value: number): void { this._speed = Math.max(0, Math.min(1.5, value)); }
    setScale(value: number): void { this._scale = Math.max(0.2, Math.min(4, value)); }
    setColor(r: number, g: number, b: number): void {
        this._color.set(clamp01(r), clamp01(g), clamp01(b));
    }
    setColorHex(hex: string): void {
        const rgb = hexToRgb(hex);
        if (rgb) this.setColor(rgb.r, rgb.g, rgb.b);
    }

    isEnabled(): boolean { return this._enabled; }
    getCover(): number { return this._cover; }
    getIntensity(): number { return this._intensity; }
    getSpeed(): number { return this._speed; }
    getScale(): number { return this._scale; }
    getColorHex(): string { return rgbToHex(this._color.r, this._color.g, this._color.b); }

    dispose(): void {
        try {
            if (this._mesh) { this._mesh.dispose(); this._mesh = null; }
            if (this._material) { this._material.dispose(true, true); this._material = null; }
            this._sceneRef = null;
            console.debug('[SeascapeSky] Disposed');
        } catch (err) {
            console.warn('[SeascapeSky] Dispose failed:', err);
        }
    }
}

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
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
