/**
 * ParticleEmitter - Spawns, updates, and renders a pool of Particle instances.
 *
 * Features:
 *  - Continuous emission (rate particles/sec) and one-shot bursts
 *  - Emission area: point, rectangle, circle, line
 *  - Initial velocity cone with random spread
 *  - Per-particle color/size/alpha gradient over lifetime
 *  - Camera-aware culling
 *  - Object-pooled particles (zero GC)
 *  - Optional world-space or emitter-local-space particles
 */
import { Vector2 } from '../math/Vector2.js';
import { MathUtils } from '../math/MathUtils.js';
import { ObjectPool } from '../commons/ObjectPool.js';
import { Particle } from './Particle.js';
import { Camera2D } from '../camera/Camera2D.js';

// ─── Emission Area ────────────────────────────────────────────────────────

export type EmissionShape =
    | { type: 'point' }
    | { type: 'circle'; radius: number }
    | { type: 'rect'; width: number; height: number }
    | { type: 'line'; length: number; angle: number };

// ─── ParticleConfig ───────────────────────────────────────────────────────

export interface ParticleConfig {
    /** Particles emitted per second */
    emitRate: number;
    /** Maximum live particles (hard cap) */
    maxParticles: number;

    // ── Life
    lifeMin: number;
    lifeMax: number;

    // ── Velocity
    /** Direction in radians (0 = right) */
    emitAngle: number;
    /** Half-angle spread in radians */
    emitSpread: number;
    speedMin: number;
    speedMax: number;

    // ── Rotation
    angularVelocityMin: number;
    angularVelocityMax: number;

    // ── Size
    sizeMin: number;
    sizeMax: number;
    /** Multiplier for size at end of life */
    sizeEndFactor: number;

    // ── Color start (RGBA)
    colorStart: [number, number, number, number];
    colorStartVariance: number;
    // ── Color end
    colorEnd: [number, number, number, number];

    // ── Physics
    gravity: number;
    drag: number;

    // ── Rendering
    blendMode: GlobalCompositeOperation;
    shape: 'circle' | 'square' | 'line';

    // ── Emission area
    emissionShape: EmissionShape;
}

export const defaultParticleConfig: ParticleConfig = {
    emitRate: 30,
    maxParticles: 300,
    lifeMin: 0.5,
    lifeMax: 1.5,
    emitAngle: -Math.PI / 2,
    emitSpread: Math.PI / 8,
    speedMin: 50,
    speedMax: 150,
    angularVelocityMin: -1,
    angularVelocityMax: 1,
    sizeMin: 4,
    sizeMax: 8,
    sizeEndFactor: 0,
    colorStart: [255, 255, 255, 1],
    colorStartVariance: 0,
    colorEnd: [255, 255, 255, 0],
    gravity: 0,
    drag: 0,
    blendMode: 'source-over',
    shape: 'circle',
    emissionShape: { type: 'point' },
};

// ─── ParticleEmitter ──────────────────────────────────────────────────────

export class ParticleEmitter {
    position: Vector2;
    config: ParticleConfig;
    active: boolean = true;
    /** When true, emitter will deactivate after all particles die */
    oneShot: boolean = false;
    tag: string = '';

    private pool: ObjectPool<Particle>;
    private particles: Particle[] = [];
    private emitAccumulator: number = 0;
    private hasBurstPending: number = 0;

    constructor(x: number, y: number, config?: Partial<ParticleConfig>) {
        this.position = new Vector2(x, y);
        this.config = { ...defaultParticleConfig, ...config };
        this.pool = new ObjectPool<Particle>(
            () => new Particle(),
            (p) => p.reset(),
            Math.min(100, this.config.maxParticles),
            this.config.maxParticles,
        );
    }

    /** Immediately emit N particles */
    burst(count: number): void {
        this.hasBurstPending += count;
    }

    /** One-shot burst: spawn N and stop emitting */
    emitOnce(count: number): void {
        this.burst(count);
        this.active = false;
        this.oneShot = true;
    }

    // ─── Update ─────────────────────────────────────────────────────────────

    update(dt: number): void {
        // Update existing particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.pool.release(p);
                this.particles.splice(i, 1);
                continue;
            }
            const t = p.progress;

            // Physics
            if (p.drag > 0) {
                const dampFactor = Math.pow(1 - p.drag, dt);
                p.velocity.x *= dampFactor;
                p.velocity.y *= dampFactor;
            }
            p.velocity.y += p.gravity * dt;
            p.position.x += p.velocity.x * dt;
            p.position.y += p.velocity.y * dt;
            p.angle += p.angularVelocity * dt;

            // Color interpolation
            p.r = MathUtils.lerp(p.r, p.rEnd, dt / p.life);
            p.g = MathUtils.lerp(p.g, p.gEnd, dt / p.life);
            p.b = MathUtils.lerp(p.b, p.bEnd, dt / p.life);
            p.a = MathUtils.lerp(1 - t, p.aEnd, t * t);

            // Size
            const startSize = this.config.sizeMin + (p.size - this.config.sizeMin);
            p.size = MathUtils.lerp(startSize, p.sizeEnd, t);
        }

        if (!this.active && this.hasBurstPending === 0) return;

        // Emit continuous particles
        if (this.active) {
            this.emitAccumulator += dt * this.config.emitRate;
        }

        // Emit burst
        this.emitAccumulator += this.hasBurstPending;
        this.hasBurstPending = 0;

        while (this.emitAccumulator >= 1 && this.particles.length < this.config.maxParticles) {
            this.spawnOne();
            this.emitAccumulator -= 1;
        }
        if (this.emitAccumulator > this.config.maxParticles) {
            this.emitAccumulator = 0;
        }
    }

    private spawnOne(): void {
        const p = this.pool.acquire();
        const cfg = this.config;

        // Position (emission area)
        const offset = this.sampleEmissionShape();
        p.position.set(this.position.x + offset.x, this.position.y + offset.y);

        // Life
        p.maxLife = p.life = MathUtils.randomRange(cfg.lifeMin, cfg.lifeMax);

        // Velocity
        const angle = cfg.emitAngle + MathUtils.randomRange(-cfg.emitSpread, cfg.emitSpread);
        const speed = MathUtils.randomRange(cfg.speedMin, cfg.speedMax);
        p.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed);

        // Angular
        p.angle = Math.random() * MathUtils.PI2;
        p.angularVelocity = MathUtils.randomRange(cfg.angularVelocityMin, cfg.angularVelocityMax);

        // Color start + variance
        const v = cfg.colorStartVariance;
        const cs = cfg.colorStart;
        p.r = MathUtils.clamp(cs[0] + MathUtils.randomRange(-v, v), 0, 255);
        p.g = MathUtils.clamp(cs[1] + MathUtils.randomRange(-v, v), 0, 255);
        p.b = MathUtils.clamp(cs[2] + MathUtils.randomRange(-v, v), 0, 255);
        p.a = cs[3];

        // Color end
        [p.rEnd, p.gEnd, p.bEnd, p.aEnd] = cfg.colorEnd;

        // Size
        const startSize = MathUtils.randomRange(cfg.sizeMin, cfg.sizeMax);
        p.size = startSize;
        p.sizeEnd = startSize * cfg.sizeEndFactor;

        // Physics
        p.gravity = cfg.gravity;
        p.drag = cfg.drag;

        // Render
        p.blendMode = cfg.blendMode;
        p.shape = cfg.shape;
        p.active = true;

        this.particles.push(p);
    }

    private sampleEmissionShape(): Vector2 {
        const shape = this.config.emissionShape;
        switch (shape.type) {
            case 'point': return Vector2.zero();
            case 'circle': {
                const r = shape.radius * Math.sqrt(Math.random());
                const a = Math.random() * MathUtils.PI2;
                return new Vector2(Math.cos(a) * r, Math.sin(a) * r);
            }
            case 'rect': {
                return new Vector2(
                    MathUtils.randomRange(-shape.width * 0.5, shape.width * 0.5),
                    MathUtils.randomRange(-shape.height * 0.5, shape.height * 0.5),
                );
            }
            case 'line': {
                const t = MathUtils.randomRange(-0.5, 0.5) * shape.length;
                return new Vector2(
                    Math.cos(shape.angle) * t,
                    Math.sin(shape.angle) * t,
                );
            }
        }
    }

    // ─── Render ─────────────────────────────────────────────────────────────

    render(ctx: CanvasRenderingContext2D, camera?: Camera2D): void {
        if (this.particles.length === 0) return;

        for (const p of this.particles) {
            if (p.size <= 0.1 || p.a <= 0.01) continue;

            // Camera culling
            if (camera && !camera.isPointVisible(p.position, p.size * 2)) continue;

            ctx.globalAlpha = Math.max(0, Math.min(1, p.a));
            ctx.globalCompositeOperation = p.blendMode;

            const x = p.position.x, y = p.position.y;

            switch (p.shape) {
                case 'circle': {
                    ctx.beginPath();
                    ctx.arc(x, y, p.size, 0, MathUtils.PI2);
                    ctx.fillStyle = `rgb(${p.r | 0},${p.g | 0},${p.b | 0})`;
                    ctx.fill();
                    break;
                }
                case 'square': {
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(p.angle);
                    ctx.fillStyle = `rgb(${p.r | 0},${p.g | 0},${p.b | 0})`;
                    ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size);
                    ctx.restore();
                    break;
                }
                case 'line': {
                    const len = p.size * 3;
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(Math.atan2(p.velocity.y, p.velocity.x));
                    ctx.beginPath();
                    ctx.moveTo(-len * 0.5, 0);
                    ctx.lineTo(len * 0.5, 0);
                    ctx.strokeStyle = `rgb(${p.r | 0},${p.g | 0},${p.b | 0})`;
                    ctx.lineWidth = p.size * 0.4;
                    ctx.stroke();
                    ctx.restore();
                    break;
                }
            }
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    get aliveCount(): number { return this.particles.length; }
    get isDead(): boolean { return this.oneShot && this.particles.length === 0 && !this.active; }

    destroy(): void {
        for (const p of this.particles) this.pool.release(p);
        this.particles.length = 0;
    }
}
