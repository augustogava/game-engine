/**
 * CollisionResolver - Impulse-based collision resolution.
 *
 * Applies:
 *  - Velocity impulse (restitution / bounciness)
 *  - Friction impulse (Coulomb model, static + kinetic)
 *  - Positional correction (Baumgarte stabilization) to prevent sinking
 *  - Per-contact resolution for multi-contact manifolds
 */
import { Vector2 } from '../math/Vector2.js';
import { RigidBody } from './RigidBody.js';
import { CollisionManifold, ContactPoint } from './CollisionManifold.js';

export interface ResolverConfig {
    /** Baumgarte stabilization factor [0..1] — how aggressively to correct penetration */
    baumgarte: number;
    /** Positional slop — small penetration allowed before correction kicks in */
    slop: number;
    /** Number of resolution iterations (higher = more stable, more expensive) */
    iterations: number;
}

export const DefaultResolverConfig: ResolverConfig = {
    baumgarte: 0.2,
    slop: 0.5,
    iterations: 1,
};

export class CollisionResolver {
    constructor(private config: ResolverConfig = DefaultResolverConfig) { }

    resolve(manifold: CollisionManifold, dt: number): void {
        const { bodyA, bodyB, normal, depth, contacts } = manifold;

        // Positional correction (Baumgarte)
        this.correctPositions(bodyA, bodyB, normal, depth);

        // Apply impulse per contact
        const impulseScale = 1 / contacts.length;
        for (const contact of contacts) {
            this.resolveContact(bodyA, bodyB, normal, contact, impulseScale, dt);
        }
    }

    private resolveContact(
        a: RigidBody, b: RigidBody,
        normal: Vector2,
        contact: ContactPoint,
        scale: number,
        _dt: number,
    ): void {
        const rA = contact.point.sub(a.position);
        const rB = contact.point.sub(b.position);

        // Relative velocity at contact point
        const vA = a.getVelocityAt(contact.point);
        const vB = b.getVelocityAt(contact.point);
        const relVel = vA.sub(vB);

        // Relative velocity along normal
        const velAlongNormal = relVel.dot(normal);

        // Don't resolve if separating
        if (velAlongNormal > 0) return;

        // Combined restitution (minimum = less bouncy)
        const e = Math.min(a.material.restitution, b.material.restitution);

        // Cross products for angular part
        const rACrossN = rA.cross(normal);
        const rBCrossN = rB.cross(normal);

        // Effective mass along normal
        const invMassSum = a.inverseMass + b.inverseMass
            + rACrossN * rACrossN * a.inverseInertia
            + rBCrossN * rBCrossN * b.inverseInertia;

        if (invMassSum < 1e-10) return;

        // Normal impulse magnitude
        let jN = -(1 + e) * velAlongNormal / invMassSum;
        jN *= scale;
        if (jN < 0) jN = 0;

        // Apply normal impulse
        const impulseN = normal.scale(jN);
        a.applyImpulseAt(impulseN, contact.point);
        b.applyImpulseAt(impulseN.negate(), contact.point);

        // ── Friction impulse ────────────────────────────────────────────────

        // Re-compute relative velocity after normal impulse
        const vA2 = a.getVelocityAt(contact.point);
        const vB2 = b.getVelocityAt(contact.point);
        const relVel2 = vA2.sub(vB2);

        // Tangent direction (remove normal component)
        const tangent = relVel2.sub(normal.scale(relVel2.dot(normal)));
        const tangentLen = tangent.magnitude();
        if (tangentLen < 1e-8) return;
        const tangentDir = tangent.scale(1 / tangentLen);

        // Effective mass along tangent
        const rACrossT = rA.cross(tangentDir);
        const rBCrossT = rB.cross(tangentDir);
        const invMassTan = a.inverseMass + b.inverseMass
            + rACrossT * rACrossT * a.inverseInertia
            + rBCrossT * rBCrossT * b.inverseInertia;

        if (invMassTan < 1e-10) return;

        const velAlongTangent = relVel2.dot(tangentDir);
        let jT = -velAlongTangent / invMassTan;
        jT *= scale;

        // Coulomb's law: static vs. kinetic friction
        const muS = (a.material.staticFriction + b.material.staticFriction) * 0.5;
        const muK = (a.material.kineticFriction + b.material.kineticFriction) * 0.5;

        let frictionImpulse: Vector2;
        if (Math.abs(jT) <= jN * muS) {
            frictionImpulse = tangentDir.scale(jT);
        } else {
            frictionImpulse = tangentDir.scale(-jN * muK);
        }

        a.applyImpulseAt(frictionImpulse, contact.point);
        b.applyImpulseAt(frictionImpulse.negate(), contact.point);
    }

    private correctPositions(a: RigidBody, b: RigidBody, normal: Vector2, depth: number): void {
        if (depth <= this.config.slop) return;
        const correction = Math.max(depth - this.config.slop, 0) * this.config.baumgarte;
        const totalInvMass = a.inverseMass + b.inverseMass;
        if (totalInvMass < 1e-10) return;
        const correctionPerInvMass = normal.scale(correction / totalInvMass);
        if (a.bodyType === 'dynamic') {
            a.position.x += correctionPerInvMass.x * a.inverseMass;
            a.position.y += correctionPerInvMass.y * a.inverseMass;
        }
        if (b.bodyType === 'dynamic') {
            b.position.x -= correctionPerInvMass.x * b.inverseMass;
            b.position.y -= correctionPerInvMass.y * b.inverseMass;
        }
    }
}
