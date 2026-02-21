/**
 * PhysicsWorld - Container for physics bodies with gravity attractors
 */
import { Vector2 } from '../math/Vector2.js';
import { PhysicsBody } from './PhysicsBody.js';

export interface GravityAttractor {
    position: Vector2;
    mass: number;
    softening: number; // Softening parameter to avoid singularity
}

export class PhysicsWorld {
    bodies: PhysicsBody[] = [];
    attractors: GravityAttractor[] = [];
    gravitationalConstant: number = 6.674e-3; // Scaled G for simulation
    maxForce: number = 5000;

    addBody(body: PhysicsBody): void {
        this.bodies.push(body);
    }

    removeBody(body: PhysicsBody): void {
        const idx = this.bodies.indexOf(body);
        if (idx !== -1) this.bodies.splice(idx, 1);
    }

    addAttractor(position: Vector2, mass: number, softening: number = 50): GravityAttractor {
        const attractor: GravityAttractor = { position: position.clone(), mass, softening };
        this.attractors.push(attractor);
        return attractor;
    }

    removeAttractor(attractor: GravityAttractor): void {
        const idx = this.attractors.indexOf(attractor);
        if (idx !== -1) this.attractors.splice(idx, 1);
    }

    update(dt: number): void {
        const G = this.gravitationalConstant;
        const maxF = this.maxForce;

        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            if (body.isStatic) continue;

            // Apply gravitational attraction from all attractors
            for (let j = 0; j < this.attractors.length; j++) {
                const attractor = this.attractors[j];
                const dx = attractor.position.x - body.position.x;
                const dy = attractor.position.y - body.position.y;
                const softSq = attractor.softening * attractor.softening;
                const distSq = dx * dx + dy * dy + softSq;
                const dist = Math.sqrt(distSq);

                // F = G * M * m / r^2
                let forceMag = (G * attractor.mass * body.mass) / distSq;
                if (forceMag > maxF) forceMag = maxF;

                body.acceleration.x += (dx / dist) * forceMag * body.inverseMass;
                body.acceleration.y += (dy / dist) * forceMag * body.inverseMass;
            }

            body.integrate(dt);
        }
    }

    clear(): void {
        this.bodies.length = 0;
        this.attractors.length = 0;
    }
}
