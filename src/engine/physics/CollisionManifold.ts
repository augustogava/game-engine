/**
 * CollisionManifold - Result structure for a single collision test.
 *
 * Contains up to 2 contact points (for edge-edge contacts),
 * the collision normal, penetration depth, and references to the two bodies.
 */
import { Vector2 } from '../math/Vector2.js';
import { RigidBody } from './RigidBody.js';

export interface ContactPoint {
    /** World-space position of the contact */
    point: Vector2;
    /** Penetration depth at this contact */
    depth: number;
}

export interface CollisionManifold {
    bodyA: RigidBody;
    bodyB: RigidBody;
    /** Normal pointing FROM bodyB TO bodyA (away from bodyB) */
    normal: Vector2;
    /** Penetration depth (positive = overlapping) */
    depth: number;
    /** Up to 2 contact points */
    contacts: ContactPoint[];
}
