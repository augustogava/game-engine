/**
 * FluidParticle - Single particle for SPH fluid simulation.
 * Optimized for pool-friendly allocation with separate visual/collision radii.
 */
import { Vector2 } from '../math/Vector2.js';

export class FluidParticle {
    position: Vector2 = Vector2.zero();
    velocity: Vector2 = Vector2.zero();
    force: Vector2 = Vector2.zero();

    density: number = 0;
    pressure: number = 0;
    mass: number = 1;

    visualRadius: number = 12;
    collisionRadius: number = 6;

    r: number = 30;
    g: number = 144;
    b: number = 255;
    a: number = 0.7;

    active: boolean = false;
    id: number = 0;

    reset(): void {
        this.position.set(0, 0);
        this.velocity.set(0, 0);
        this.force.set(0, 0);
        this.density = 0;
        this.pressure = 0;
        this.mass = 1;
        this.visualRadius = 12;
        this.collisionRadius = 6;
        this.r = 30;
        this.g = 144;
        this.b = 255;
        this.a = 0.7;
        this.active = false;
        this.id = 0;
    }
}
