/**
 * GalaxyParticle - Extended physics body for galaxy simulation
 */
import { PhysicsBody } from '../engine/physics/PhysicsBody.js';

export type ParticleType = 'star' | 'dust' | 'nebula' | 'core';

export class GalaxyParticle extends PhysicsBody {
    r: number = 0;
    g: number = 0;
    b: number = 0;
    alpha: number = 1;
    size: number = 1;
    type: ParticleType = 'star';
    armIndex: number = 0;
    age: number = 0;
    orbitRadius: number = 0;
    active: boolean = false;
    colorPhase: number = 0;
    /** 3D height in galactic disc plane (world units) */
    z: number = 0;
    vz: number = 0; // Z velocity for 3D formation animation


    constructor() {
        super(0, 0, 1);
    }

    get cssColor(): string {
        return `rgba(${this.r | 0},${this.g | 0},${this.b | 0},${this.alpha.toFixed(3)})`;
    }

    override reset(): void {
        super.reset();
        this.r = 255; this.g = 255; this.b = 255; this.alpha = 1;
        this.size = 1;
        this.type = 'star';
        this.armIndex = 0;
        this.age = 0;
        this.orbitRadius = 0;
        this.active = false;
        this.colorPhase = 0;
    }
}

