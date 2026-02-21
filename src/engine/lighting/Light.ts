/**
 * Light - 2D light types for the engine lighting system.
 *
 * Types:
 *   PointLight       - Omnidirectional radial light
 *   DirectionalLight - Infinite parallel light (like sun)
 *   SpotLight        - Cone-shaped directional point light
 */
import { Vector2 } from '../math/Vector2.js';

// ─── Color helper ─────────────────────────────────────────────────────────

export interface LightColor {
    r: number; // 0-255
    g: number; // 0-255
    b: number; // 0-255
}

export function rgbToString(c: LightColor, a: number = 1): string {
    return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a.toFixed(3)})`;
}

export function lerpColor(a: LightColor, b: LightColor, t: number): LightColor {
    return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
    };
}

// ─── Light base ───────────────────────────────────────────────────────────

export type LightType = 'point' | 'directional' | 'spot';

export interface LightBase {
    type: LightType;
    color: LightColor;
    intensity: number;   // typically 0–2+
    enabled: boolean;
    /** Optional tag for grouping/filtering */
    tag?: string;
}

// ─── PointLight ───────────────────────────────────────────────────────────

export class PointLight implements LightBase {
    readonly type: LightType = 'point';
    enabled = true;
    tag?: string;

    constructor(
        public position: Vector2,
        public radius: number,
        public color: LightColor = { r: 255, g: 220, b: 160 },
        public intensity: number = 1.0,
        /** Inner radius where light is at full intensity (0 = hard point) */
        public innerRadius: number = 0,
        /** Falloff exponent: 1=linear, 2=quadratic (physically realistic) */
        public falloff: number = 2,
    ) { }

    clone(): PointLight {
        return new PointLight(
            this.position.clone(), this.radius,
            { ...this.color }, this.intensity,
            this.innerRadius, this.falloff
        );
    }
}

// ─── DirectionalLight ─────────────────────────────────────────────────────

export class DirectionalLight implements LightBase {
    readonly type: LightType = 'directional';
    enabled = true;
    tag?: string;

    constructor(
        /** Direction the light travels (normalized) */
        public direction: Vector2 = new Vector2(0, 1),
        public color: LightColor = { r: 255, g: 255, b: 230 },
        public intensity: number = 0.5,
    ) {
        this.direction = direction.normalize();
    }
}

// ─── SpotLight ────────────────────────────────────────────────────────────

export class SpotLight implements LightBase {
    readonly type: LightType = 'spot';
    enabled = true;
    tag?: string;

    constructor(
        public position: Vector2,
        /** Angle the spotlight points toward (radians) */
        public direction: number = 0,
        /** Outer half-angle of the cone (radians, e.g. Math.PI/6 = 30°) */
        public outerAngle: number = Math.PI / 6,
        /** Inner half-angle for hard center (< outerAngle) */
        public innerAngle: number = Math.PI / 12,
        public radius: number = 400,
        public color: LightColor = { r: 255, g: 255, b: 255 },
        public intensity: number = 1.0,
    ) { }
}

export type Light = PointLight | DirectionalLight | SpotLight;

// ─── Preset light colors ──────────────────────────────────────────────────

export const LightColors = {
    white: { r: 255, g: 255, b: 255 } as LightColor,
    warm: { r: 255, g: 210, b: 140 } as LightColor,
    cool: { r: 140, g: 190, b: 255 } as LightColor,
    fire: { r: 255, g: 120, b: 40 } as LightColor,
    moonlight: { r: 160, g: 180, b: 220 } as LightColor,
    electric: { r: 100, g: 160, b: 255 } as LightColor,
    toxic: { r: 80, g: 255, b: 80 } as LightColor,
    blood: { r: 255, g: 30, b: 30 } as LightColor,
    magic: { r: 200, g: 80, b: 255 } as LightColor,
    lava: { r: 255, g: 60, b: 10 } as LightColor,
    ice: { r: 180, g: 230, b: 255 } as LightColor,
    candle: { r: 255, g: 180, b: 60 } as LightColor,
    neon: { r: 0, g: 255, b: 180 } as LightColor,
} as const;
