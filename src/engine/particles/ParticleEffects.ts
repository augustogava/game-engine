/**
 * ParticleEffects - Predefined particle emitter factory functions.
 *
 * Each function returns a configured ParticleEmitter ready to use.
 * All are tuned to look good with 'screen' or 'lighter' blend compositing.
 *
 * Available presets:
 *   fire, softFire, smoke, sparks, explosion, embers, rain, snow,
 *   magic, electricArc, blood, dust, waterSplash, portal, leavesFloat
 */
import { ParticleEmitter } from './ParticleEmitter.js';
import { MathUtils } from '../math/MathUtils.js';

// Convenience shorthand
type PE = ParticleEmitter;

// ─── 🔥 Fire ─────────────────────────────────────────────────────────────

/** Classic upward flame — use screen blend for best look */
export function fire(x: number, y: number, scale: number = 1): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 60 * scale,
        maxParticles: Math.ceil(300 * scale),
        lifeMin: 0.4,
        lifeMax: 1.0,
        emitAngle: -Math.PI / 2,
        emitSpread: Math.PI / 5,
        speedMin: 80 * scale,
        speedMax: 200 * scale,
        angularVelocityMin: -0.5,
        angularVelocityMax: 0.5,
        sizeMin: 8 * scale,
        sizeMax: 24 * scale,
        sizeEndFactor: 0.1,
        colorStart: [255, 180, 40, 1],
        colorStartVariance: 30,
        colorEnd: [255, 30, 0, 0],
        gravity: -40 * scale,
        drag: 0.6,
        blendMode: 'screen',
        shape: 'circle',
        emissionShape: { type: 'rect', width: 30 * scale, height: 4 * scale },
    });
}

/** Softer, more ambient fire */
export function softFire(x: number, y: number, scale: number = 1): PE {
    const e = fire(x, y, scale);
    e.config.emitRate = 30 * scale;
    e.config.sizeMax = 40 * scale;
    e.config.colorStart = [255, 120, 20, 0.6];
    e.config.colorEnd = [200, 20, 0, 0];
    e.config.drag = 0.8;
    return e;
}

// ─── 💨 Smoke ─────────────────────────────────────────────────────────────

export function smoke(x: number, y: number, scale: number = 1): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 15 * scale,
        maxParticles: 100,
        lifeMin: 2.0,
        lifeMax: 4.0,
        emitAngle: -Math.PI / 2,
        emitSpread: Math.PI / 6,
        speedMin: 20 * scale,
        speedMax: 60 * scale,
        angularVelocityMin: -0.3,
        angularVelocityMax: 0.3,
        sizeMin: 20 * scale,
        sizeMax: 50 * scale,
        sizeEndFactor: 2.5,
        colorStart: [80, 80, 80, 0.5],
        colorStartVariance: 20,
        colorEnd: [60, 60, 60, 0],
        gravity: -10,
        drag: 0.7,
        blendMode: 'source-over',
        shape: 'circle',
        emissionShape: { type: 'circle', radius: 10 * scale },
    });
}

/** Dense black smoke, e.g. burning wreckage */
export function blackSmoke(x: number, y: number, scale: number = 1): PE {
    const e = smoke(x, y, scale);
    e.config.colorStart = [20, 20, 20, 0.7];
    e.config.colorEnd = [10, 10, 10, 0];
    e.config.emitRate = 20 * scale;
    e.config.sizeEndFactor = 3.5;
    return e;
}

// ─── ✨ Sparks ─────────────────────────────────────────────────────────────

export function sparks(x: number, y: number, scale: number = 1): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 40 * scale,
        maxParticles: 200,
        lifeMin: 0.3,
        lifeMax: 0.8,
        emitAngle: 0,
        emitSpread: Math.PI,
        speedMin: 120 * scale,
        speedMax: 350 * scale,
        angularVelocityMin: 0,
        angularVelocityMax: 0,
        sizeMin: 1,
        sizeMax: 3,
        sizeEndFactor: 0,
        colorStart: [255, 240, 120, 1],
        colorStartVariance: 30,
        colorEnd: [255, 80, 20, 0],
        gravity: 300,
        drag: 0.15,
        blendMode: 'screen',
        shape: 'line',
        emissionShape: { type: 'point' },
    });
}

// ─── 💥 Explosion ────────────────────────────────────────────────────────

/** One-shot explosion burst */
export function explosion(x: number, y: number, scale: number = 1): PE {
    const e = new ParticleEmitter(x, y, {
        emitRate: 0,
        maxParticles: Math.ceil(120 * scale),
        lifeMin: 0.4,
        lifeMax: 1.2,
        emitAngle: 0,
        emitSpread: Math.PI,
        speedMin: 200 * scale,
        speedMax: 700 * scale,
        angularVelocityMin: -3,
        angularVelocityMax: 3,
        sizeMin: 6 * scale,
        sizeMax: 22 * scale,
        sizeEndFactor: 0.05,
        colorStart: [255, 220, 60, 1],
        colorStartVariance: 40,
        colorEnd: [180, 30, 0, 0],
        gravity: 80,
        drag: 0.4,
        blendMode: 'screen',
        shape: 'circle',
        emissionShape: { type: 'circle', radius: 20 * scale },
    });
    e.emitOnce(Math.ceil(80 * scale));
    return e;
}

/** Debris shards from explosion */
export function explosionDebris(x: number, y: number, scale: number = 1): PE {
    const e = new ParticleEmitter(x, y, {
        emitRate: 0,
        maxParticles: 60,
        lifeMin: 0.8,
        lifeMax: 2.0,
        emitAngle: 0,
        emitSpread: Math.PI,
        speedMin: 100 * scale,
        speedMax: 400 * scale,
        angularVelocityMin: -5,
        angularVelocityMax: 5,
        sizeMin: 3 * scale,
        sizeMax: 10 * scale,
        sizeEndFactor: 1,
        colorStart: [120, 80, 50, 1],
        colorStartVariance: 30,
        colorEnd: [60, 40, 20, 0],
        gravity: 400,
        drag: 0.1,
        blendMode: 'source-over',
        shape: 'square',
        emissionShape: { type: 'circle', radius: 10 * scale },
    });
    e.emitOnce(40);
    return e;
}

// ─── 🔴 Embers ────────────────────────────────────────────────────────────

export function embers(x: number, y: number, scale: number = 1): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 20 * scale,
        maxParticles: 80,
        lifeMin: 1.5,
        lifeMax: 3.0,
        emitAngle: -Math.PI / 2,
        emitSpread: Math.PI / 3,
        speedMin: 30 * scale,
        speedMax: 100 * scale,
        angularVelocityMin: -2,
        angularVelocityMax: 2,
        sizeMin: 1.5,
        sizeMax: 3.5,
        sizeEndFactor: 0,
        colorStart: [255, 160, 40, 1],
        colorStartVariance: 40,
        colorEnd: [200, 60, 10, 0],
        gravity: -20,
        drag: 0.4,
        blendMode: 'screen',
        shape: 'circle',
        emissionShape: { type: 'rect', width: 20 * scale, height: 4 },
    });
}

// ─── 🌧 Rain ─────────────────────────────────────────────────────────────

/** Falling rain streaks — attach emitter at top of screen */
export function rain(x: number, y: number, intensity: number = 1): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 80 * intensity,
        maxParticles: 400,
        lifeMin: 0.6,
        lifeMax: 1.2,
        emitAngle: Math.PI / 2 + 0.1,  // slightly angled
        emitSpread: 0.05,
        speedMin: 600,
        speedMax: 900,
        angularVelocityMin: 0,
        angularVelocityMax: 0,
        sizeMin: 1,
        sizeMax: 2,
        sizeEndFactor: 1,
        colorStart: [180, 210, 255, 0.6],
        colorStartVariance: 0,
        colorEnd: [180, 210, 255, 0],
        gravity: 0,
        drag: 0,
        blendMode: 'source-over',
        shape: 'line',
        emissionShape: { type: 'rect', width: 1200, height: 0 },
    });
}

// ─── ❄ Snow ──────────────────────────────────────────────────────────────

export function snow(x: number, y: number, intensity: number = 1): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 20 * intensity,
        maxParticles: 300,
        lifeMin: 4.0,
        lifeMax: 8.0,
        emitAngle: Math.PI / 2,
        emitSpread: Math.PI / 12,
        speedMin: 20,
        speedMax: 80,
        angularVelocityMin: -0.5,
        angularVelocityMax: 0.5,
        sizeMin: 2,
        sizeMax: 6,
        sizeEndFactor: 0.8,
        colorStart: [220, 235, 255, 0.9],
        colorStartVariance: 10,
        colorEnd: [200, 220, 255, 0],
        gravity: 10,
        drag: 0.3,
        blendMode: 'source-over',
        shape: 'circle',
        emissionShape: { type: 'rect', width: 1200, height: 0 },
    });
}

// ─── 🔮 Magic ─────────────────────────────────────────────────────────────

export function magic(x: number, y: number, scale: number = 1): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 50 * scale,
        maxParticles: 250,
        lifeMin: 0.5,
        lifeMax: 1.5,
        emitAngle: -Math.PI / 2,
        emitSpread: Math.PI,
        speedMin: 20 * scale,
        speedMax: 120 * scale,
        angularVelocityMin: -3,
        angularVelocityMax: 3,
        sizeMin: 2,
        sizeMax: 8,
        sizeEndFactor: 0,
        colorStart: [200, 80, 255, 1],
        colorStartVariance: 60,
        colorEnd: [80, 20, 200, 0],
        gravity: -30,
        drag: 0.5,
        blendMode: 'screen',
        shape: 'circle',
        emissionShape: { type: 'circle', radius: 20 * scale },
    });
}

export function magicBurst(x: number, y: number): PE {
    const e = new ParticleEmitter(x, y, {
        emitRate: 0,
        maxParticles: 100,
        lifeMin: 0.6,
        lifeMax: 1.8,
        emitAngle: 0,
        emitSpread: Math.PI,
        speedMin: 80,
        speedMax: 300,
        angularVelocityMin: -4,
        angularVelocityMax: 4,
        sizeMin: 3,
        sizeMax: 10,
        sizeEndFactor: 0,
        colorStart: [255, 200, 80, 1],
        colorStartVariance: 80,
        colorEnd: [200, 50, 255, 0],
        gravity: 0,
        drag: 0.6,
        blendMode: 'screen',
        shape: 'circle',
        emissionShape: { type: 'circle', radius: 5 },
    });
    e.emitOnce(80);
    return e;
}

// ─── ⚡ Electric Arc ──────────────────────────────────────────────────────

export function electricArc(x: number, y: number): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 80,
        maxParticles: 200,
        lifeMin: 0.05,
        lifeMax: 0.2,
        emitAngle: 0,
        emitSpread: Math.PI,
        speedMin: 50,
        speedMax: 200,
        angularVelocityMin: -10,
        angularVelocityMax: 10,
        sizeMin: 1,
        sizeMax: 3,
        sizeEndFactor: 0,
        colorStart: [200, 220, 255, 1],
        colorStartVariance: 20,
        colorEnd: [100, 150, 255, 0],
        gravity: 0,
        drag: 0.9,
        blendMode: 'screen',
        shape: 'line',
        emissionShape: { type: 'circle', radius: 5 },
    });
}

// ─── 🩸 Blood ────────────────────────────────────────────────────────────

export function blood(x: number, y: number, direction: number = -Math.PI / 2): PE {
    const e = new ParticleEmitter(x, y, {
        emitRate: 0,
        maxParticles: 80,
        lifeMin: 0.5,
        lifeMax: 1.5,
        emitAngle: direction,
        emitSpread: Math.PI / 3,
        speedMin: 80,
        speedMax: 300,
        angularVelocityMin: -2,
        angularVelocityMax: 2,
        sizeMin: 2,
        sizeMax: 7,
        sizeEndFactor: 0.5,
        colorStart: [200, 10, 20, 1],
        colorStartVariance: 20,
        colorEnd: [80, 0, 0, 0.8],
        gravity: 500,
        drag: 0.1,
        blendMode: 'source-over',
        shape: 'circle',
        emissionShape: { type: 'point' },
    });
    e.emitOnce(40);
    return e;
}

// ─── 💧 Water Splash ─────────────────────────────────────────────────────

export function waterSplash(x: number, y: number, scale: number = 1): PE {
    const e = new ParticleEmitter(x, y, {
        emitRate: 0,
        maxParticles: 60,
        lifeMin: 0.4,
        lifeMax: 1.0,
        emitAngle: -Math.PI / 2,
        emitSpread: Math.PI / 2.5,
        speedMin: 100 * scale,
        speedMax: 350 * scale,
        angularVelocityMin: -1,
        angularVelocityMax: 1,
        sizeMin: 2 * scale,
        sizeMax: 7 * scale,
        sizeEndFactor: 0.2,
        colorStart: [160, 210, 255, 0.9],
        colorStartVariance: 20,
        colorEnd: [200, 230, 255, 0],
        gravity: 600,
        drag: 0.05,
        blendMode: 'screen',
        shape: 'circle',
        emissionShape: { type: 'circle', radius: 5 * scale },
    });
    e.emitOnce(30);
    return e;
}

// ─── 🌀 Portal ────────────────────────────────────────────────────────────

export function portal(x: number, y: number, radius: number = 60): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 40,
        maxParticles: 150,
        lifeMin: 0.8,
        lifeMax: 2.0,
        emitAngle: -Math.PI / 2,
        emitSpread: 0.2,
        speedMin: 20,
        speedMax: 60,
        angularVelocityMin: 2,
        angularVelocityMax: 4,
        sizeMin: 2,
        sizeMax: 6,
        sizeEndFactor: 0,
        colorStart: [60, 255, 200, 0.9],
        colorStartVariance: 60,
        colorEnd: [20, 100, 255, 0],
        gravity: 0,
        drag: 0.4,
        blendMode: 'screen',
        shape: 'circle',
        emissionShape: { type: 'circle', radius },
    });
}

// ─── 🍂 Floating Leaves ──────────────────────────────────────────────────

export function leavesFloat(x: number, y: number): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 3,
        maxParticles: 40,
        lifeMin: 4.0,
        lifeMax: 8.0,
        emitAngle: Math.PI / 2,
        emitSpread: Math.PI / 4,
        speedMin: 20,
        speedMax: 60,
        angularVelocityMin: -1.5,
        angularVelocityMax: 1.5,
        sizeMin: 4,
        sizeMax: 9,
        sizeEndFactor: 0.5,
        colorStart: [180, 100, 20, 1],
        colorStartVariance: 40,
        colorEnd: [100, 60, 10, 0],
        gravity: 15,
        drag: 0.5,
        blendMode: 'source-over',
        shape: 'square',
        emissionShape: { type: 'rect', width: 200, height: 0 },
    });
}

// ─── 💫 Dust ────────────────────────────────────────────────────────────

export function dust(x: number, y: number, scale: number = 1): PE {
    return new ParticleEmitter(x, y, {
        emitRate: 8 * scale,
        maxParticles: 60,
        lifeMin: 1.0,
        lifeMax: 3.0,
        emitAngle: 0,
        emitSpread: Math.PI,
        speedMin: 10 * scale,
        speedMax: 40 * scale,
        angularVelocityMin: -0.5,
        angularVelocityMax: 0.5,
        sizeMin: 4 * scale,
        sizeMax: 14 * scale,
        sizeEndFactor: 2,
        colorStart: [200, 190, 170, 0.3],
        colorStartVariance: 20,
        colorEnd: [180, 170, 150, 0],
        gravity: -5,
        drag: 0.8,
        blendMode: 'source-over',
        shape: 'circle',
        emissionShape: { type: 'circle', radius: 20 * scale },
    });
}

// ─── ParticleEffects registry ──────────────────────────────────────────────────

export const ParticleEffects = {
    fire,
    softFire,
    smoke,
    blackSmoke,
    sparks,
    explosion,
    explosionDebris,
    embers,
    rain,
    snow,
    magic,
    magicBurst,
    electricArc,
    blood,
    waterSplash,
    portal,
    leavesFloat,
    dust,
} as const;

export type ParticleEffectName = keyof typeof ParticleEffects;
