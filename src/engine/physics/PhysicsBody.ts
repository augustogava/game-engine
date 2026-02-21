/**
 * PhysicsBody - A point-mass rigid body
 */
import { Vector2 } from '../math/Vector2.js';

export class PhysicsBody {
    position: Vector2;
    velocity: Vector2;
    acceleration: Vector2;
    mass: number;
    inverseMass: number;
    damping: number;
    isStatic: boolean;

    constructor(x: number = 0, y: number = 0, mass: number = 1) {
        this.position = new Vector2(x, y);
        this.velocity = Vector2.zero();
        this.acceleration = Vector2.zero();
        this.mass = mass;
        this.inverseMass = mass > 0 ? 1 / mass : 0;
        this.damping = 0.9999;
        this.isStatic = mass <= 0;
    }

    applyForce(force: Vector2): void {
        if (this.isStatic) return;
        // F = ma => a = F/m
        this.acceleration.x += force.x * this.inverseMass;
        this.acceleration.y += force.y * this.inverseMass;
    }

    applyImpulse(impulse: Vector2): void {
        if (this.isStatic) return;
        this.velocity.x += impulse.x * this.inverseMass;
        this.velocity.y += impulse.y * this.inverseMass;
    }

    integrate(dt: number): void {
        if (this.isStatic) return;

        // Symplectic Euler integration
        this.velocity.x += this.acceleration.x * dt;
        this.velocity.y += this.acceleration.y * dt;

        // Apply damping
        this.velocity.x *= Math.pow(this.damping, dt);
        this.velocity.y *= Math.pow(this.damping, dt);

        this.position.x += this.velocity.x * dt;
        this.position.y += this.velocity.y * dt;

        // Reset acceleration
        this.acceleration.x = 0;
        this.acceleration.y = 0;
    }

    get speed(): number { return this.velocity.magnitude(); }

    reset(): void {
        this.position.set(0, 0);
        this.velocity.set(0, 0);
        this.acceleration.set(0, 0);
        this.mass = 1;
        this.inverseMass = 1;
        this.damping = 0.9999;
        this.isStatic = false;
    }
}
