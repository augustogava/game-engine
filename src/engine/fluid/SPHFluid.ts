/**
 * SPHFluid - Smoothed Particle Hydrodynamics fluid simulation system.
 * 
 * Implements:
 * - Poly6 kernel for density estimation
 * - Spiky kernel gradient for pressure forces
 * - Viscosity kernel laplacian for viscous forces
 * - Configurable parameters for different fluid behaviors
 */
import { Vector2 } from '../math/Vector2.js';
import { ObjectPool } from '../commons/ObjectPool.js';
import { FluidParticle } from './FluidParticle.js';
import { SpatialHashGrid } from './SpatialHashGrid.js';

export interface SPHConfig {
    smoothingRadius: number;
    restDensity: number;
    stiffness: number;
    viscosity: number;
    gravity: number;
    surfaceTension: number;
    particleMass: number;
    visualRadius: number;
    collisionRadius: number;
    damping: number;
}

export const defaultSPHConfig: SPHConfig = {
    smoothingRadius: 30,
    restDensity: 1000,
    stiffness: 3,
    viscosity: 0.003,
    gravity: 980,
    surfaceTension: 0.0001,
    particleMass: 65,
    visualRadius: 12,
    collisionRadius: 10,
    damping: 0.999,
};

interface Boundary {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export class SPHFluid {
    config: SPHConfig;
    particles: FluidParticle[] = [];
    private pool: ObjectPool<FluidParticle>;
    private grid: SpatialHashGrid;
    private boundary: Boundary;

    private poly6Coeff: number = 0;
    private spikyGradCoeff: number = 0;
    private viscosityLapCoeff: number = 0;

    private nextId: number = 0;

    constructor(config?: Partial<SPHConfig>) {
        this.config = { ...defaultSPHConfig, ...config };
        this.pool = new ObjectPool<FluidParticle>(
            () => new FluidParticle(),
            (p) => p.reset(),
            500,
            5000
        );
        this.grid = new SpatialHashGrid(this.config.smoothingRadius);
        this.boundary = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
        this.computeKernelCoefficients();
    }

    private computeKernelCoefficients(): void {
        const h = this.config.smoothingRadius;
        this.poly6Coeff = 315.0 / (64.0 * Math.PI * Math.pow(h, 9));
        this.spikyGradCoeff = 45.0 / (Math.PI * Math.pow(h, 6));
        this.viscosityLapCoeff = 45.0 / (Math.PI * Math.pow(h, 6));
    }

    setBoundary(minX: number, minY: number, maxX: number, maxY: number): void {
        this.boundary = { minX, minY, maxX, maxY };
    }

    updateConfig(config: Partial<SPHConfig>): void {
        const oldH = this.config.smoothingRadius;
        Object.assign(this.config, config);
        
        if (config.smoothingRadius && config.smoothingRadius !== oldH) {
            this.grid.resize(config.smoothingRadius);
            this.computeKernelCoefficients();
        }

        for (const p of this.particles) {
            if (config.visualRadius !== undefined) p.visualRadius = config.visualRadius;
            if (config.collisionRadius !== undefined) p.collisionRadius = config.collisionRadius;
            if (config.particleMass !== undefined) p.mass = config.particleMass;
        }
    }

    spawnParticle(x: number, y: number, vx: number = 0, vy: number = 0): FluidParticle {
        const p = this.pool.acquire();
        p.position.set(x, y);
        p.velocity.set(vx, vy);
        p.mass = this.config.particleMass;
        p.visualRadius = this.config.visualRadius;
        p.collisionRadius = this.config.collisionRadius;
        p.active = true;
        p.id = this.nextId++;
        this.particles.push(p);
        return p;
    }

    spawnBlock(x: number, y: number, cols: number, rows: number, spacing?: number): void {
        const sp = spacing ?? this.config.collisionRadius * 2;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                this.spawnParticle(
                    x + col * sp + (row % 2) * sp * 0.5,
                    y + row * sp * 0.866
                );
            }
        }
    }

    clear(): void {
        for (const p of this.particles) {
            this.pool.release(p);
        }
        this.particles.length = 0;
        this.nextId = 0;
    }

    private poly6(rSq: number, h: number): number {
        const hSq = h * h;
        if (rSq >= hSq) return 0;
        const diff = hSq - rSq;
        return this.poly6Coeff * diff * diff * diff;
    }

    private spikyGrad(r: number, h: number): number {
        if (r >= h || r < 0.0001) return 0;
        const diff = h - r;
        return this.spikyGradCoeff * diff * diff;
    }

    private viscosityLap(r: number, h: number): number {
        if (r >= h) return 0;
        return this.viscosityLapCoeff * (h - r);
    }

    update(dt: number): void {
        if (this.particles.length === 0) return;

        const cfg = this.config;
        const h = cfg.smoothingRadius;
        const hSq = h * h;
        const mass = cfg.particleMass;

        const subDt = Math.min(dt, 0.004);

        this.grid.clear();
        this.grid.insertAll(this.particles);

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (!p.active) continue;

            p.density = mass * this.poly6(0, h);

            const neighbors = this.grid.getNeighbors(p, h);
            for (let j = 0; j < neighbors.length; j++) {
                const n = neighbors[j];
                const dx = n.position.x - p.position.x;
                const dy = n.position.y - p.position.y;
                const rSq = dx * dx + dy * dy;
                if (rSq < hSq) {
                    p.density += mass * this.poly6(rSq, h);
                }
            }

            p.pressure = cfg.stiffness * (p.density - cfg.restDensity);
        }

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (!p.active) continue;

            p.force.set(0, cfg.gravity * mass);

            const neighbors = this.grid.getNeighbors(p, h);
            
            for (let j = 0; j < neighbors.length; j++) {
                const n = neighbors[j];
                const dx = n.position.x - p.position.x;
                const dy = n.position.y - p.position.y;
                const rSq = dx * dx + dy * dy;
                
                if (rSq < 0.0001 || rSq >= hSq) continue;
                
                const r = Math.sqrt(rSq);
                const nx = dx / r;
                const ny = dy / r;

                const avgPressure = (p.pressure + n.pressure) / 2;
                const pFactor = mass * avgPressure / n.density;
                const pGrad = this.spikyGrad(r, h);
                p.force.x -= pFactor * pGrad * nx;
                p.force.y -= pFactor * pGrad * ny;

                const vFactor = cfg.viscosity * mass / n.density * this.viscosityLap(r, h);
                p.force.x += vFactor * (n.velocity.x - p.velocity.x);
                p.force.y += vFactor * (n.velocity.y - p.velocity.y);
            }
        }

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (!p.active) continue;

            p.velocity.x += (p.force.x / mass) * subDt;
            p.velocity.y += (p.force.y / mass) * subDt;

            p.velocity.x *= cfg.damping;
            p.velocity.y *= cfg.damping;

            const maxVel = 500;
            const velSq = p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y;
            if (velSq > maxVel * maxVel) {
                const scale = maxVel / Math.sqrt(velSq);
                p.velocity.x *= scale;
                p.velocity.y *= scale;
            }

            p.position.x += p.velocity.x * subDt;
            p.position.y += p.velocity.y * subDt;

            this.enforceBoundary(p);
        }
    }

    private enforceBoundary(p: FluidParticle): void {
        const r = p.collisionRadius;
        const bounce = 0.3;
        const friction = 0.98;

        if (p.position.x < this.boundary.minX + r) {
            p.position.x = this.boundary.minX + r;
            p.velocity.x *= -bounce;
            p.velocity.y *= friction;
        }
        if (p.position.x > this.boundary.maxX - r) {
            p.position.x = this.boundary.maxX - r;
            p.velocity.x *= -bounce;
            p.velocity.y *= friction;
        }
        if (p.position.y < this.boundary.minY + r) {
            p.position.y = this.boundary.minY + r;
            p.velocity.y *= -bounce;
            p.velocity.x *= friction;
        }
        if (p.position.y > this.boundary.maxY - r) {
            p.position.y = this.boundary.maxY - r;
            p.velocity.y *= -bounce;
            p.velocity.x *= friction;
        }
    }

    applyForceAt(x: number, y: number, radius: number, strength: number): void {
        const r2 = radius * radius;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const dx = p.position.x - x;
            const dy = p.position.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < r2 && d2 > 0.1) {
                const d = Math.sqrt(d2);
                const factor = strength * (1 - d / radius);
                p.velocity.x += (dx / d) * factor;
                p.velocity.y += (dy / d) * factor;
            }
        }
    }

    applyAttractAt(x: number, y: number, radius: number, strength: number): void {
        const r2 = radius * radius;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const dx = x - p.position.x;
            const dy = y - p.position.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < r2 && d2 > 0.1) {
                const d = Math.sqrt(d2);
                const factor = strength * (1 - d / radius);
                p.velocity.x += (dx / d) * factor;
                p.velocity.y += (dy / d) * factor;
            }
        }
    }

    get particleCount(): number {
        return this.particles.length;
    }
}
