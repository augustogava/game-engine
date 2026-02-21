/**
 * RigidBody - Full rigid body with position, rotation, angular velocity, and torque.
 * Replaces the simple PhysicsBody when full physics simulation is needed.
 *
 * Supports:
 *  - Linear and angular motion
 *  - Force, impulse, torque accumulation
 *  - Multiple material properties (restitution, friction)
 *  - Static, kinematic, and dynamic modes
 *  - Attached Shape for collision detection
 */
import { Vector2 } from '../math/Vector2.js';
import { Shape } from './Shape.js';

export type BodyType = 'dynamic' | 'static' | 'kinematic';

export interface RigidBodyMaterial {
    /** Coefficient of restitution (0 = perfectly inelastic, 1 = perfectly elastic) */
    restitution: number;
    /** Coefficient of static friction */
    staticFriction: number;
    /** Coefficient of kinetic (dynamic) friction */
    kineticFriction: number;
    /** Linear velocity damping per second (0.0 = no damping) */
    linearDamping: number;
    /** Angular velocity damping per second */
    angularDamping: number;
}

export const DefaultMaterial: RigidBodyMaterial = {
    restitution: 0.3,
    staticFriction: 0.5,
    kineticFriction: 0.3,
    linearDamping: 0.0,
    angularDamping: 0.0,
};

export class RigidBody {
    // ── Identity ────────────────────────────────────────────────────────────
    id: number;
    private static _nextId = 0;
    tag: string = '';
    userData: unknown = null;

    // ── Transform ───────────────────────────────────────────────────────────
    position: Vector2;
    /** Rotation angle in radians */
    angle: number;

    // ── Linear motion ───────────────────────────────────────────────────────
    velocity: Vector2;
    private _forceAccum: Vector2;
    mass: number;
    inverseMass: number;

    // ── Angular motion ──────────────────────────────────────────────────────
    angularVelocity: number;     // radians / sec
    private _torqueAccum: number;
    inertia: number;             // moment of inertia
    inverseInertia: number;

    // ── Material ─────────────────────────────────────────────────────────────
    material: RigidBodyMaterial;

    // ── Mode ─────────────────────────────────────────────────────────────────
    bodyType: BodyType;

    // ── Shape ────────────────────────────────────────────────────────────────
    shape: Shape | null = null;

    // ── Sleep ────────────────────────────────────────────────────────────────
    isSleeping: boolean = false;
    private _sleepTimer: number = 0;
    static SLEEP_VELOCITY_SQ: number = 0.01;
    static SLEEP_ANGULAR: number = 0.01;
    static SLEEP_TIME: number = 0.5;

    constructor(
        x: number = 0,
        y: number = 0,
        mass: number = 1,
        bodyType: BodyType = 'dynamic',
    ) {
        this.id = RigidBody._nextId++;
        this.position = new Vector2(x, y);
        this.angle = 0;
        this.velocity = Vector2.zero();
        this._forceAccum = Vector2.zero();
        this.angularVelocity = 0;
        this._torqueAccum = 0;
        this.bodyType = bodyType;
        this.material = { ...DefaultMaterial };

        this.mass = bodyType === 'dynamic' ? Math.max(0.0001, mass) : 0;
        this.inverseMass = this.mass > 0 ? 1 / this.mass : 0;
        this.inertia = 0;
        this.inverseInertia = 0;
    }

    // ─── Shape attachment ────────────────────────────────────────────────────

    /** Attach a Shape and compute inertia automatically */
    setShape(shape: Shape): this {
        this.shape = shape;
        if (this.mass > 0) {
            this.inertia = shape.computeInertia(this.mass);
            this.inverseInertia = this.inertia > 0 ? 1 / this.inertia : 0;
        }
        return this;
    }

    /** Lock rotation (set inverseInertia to 0) */
    lockRotation(): this {
        this.inverseInertia = 0;
        return this;
    }

    // ─── Force / torque ─────────────────────────────────────────────────────

    applyForce(force: Vector2): void {
        if (this.bodyType !== 'dynamic') return;
        this._forceAccum.x += force.x;
        this._forceAccum.y += force.y;
    }

    /** Apply force at a specific world-space point (generates torque) */
    applyForceAt(force: Vector2, worldPoint: Vector2): void {
        if (this.bodyType !== 'dynamic') return;
        this._forceAccum.x += force.x;
        this._forceAccum.y += force.y;
        const r = worldPoint.sub(this.position);
        this._torqueAccum += r.cross(force);
    }

    applyTorque(torque: number): void {
        if (this.bodyType !== 'dynamic') return;
        this._torqueAccum += torque;
    }

    /** Apply an instantaneous linear impulse */
    applyImpulse(impulse: Vector2): void {
        if (this.bodyType !== 'dynamic') return;
        this.velocity.x += impulse.x * this.inverseMass;
        this.velocity.y += impulse.y * this.inverseMass;
        this.isSleeping = false;
    }

    /** Apply impulse at a world-space point (generates angular impulse) */
    applyImpulseAt(impulse: Vector2, worldPoint: Vector2): void {
        if (this.bodyType !== 'dynamic') return;
        this.velocity.x += impulse.x * this.inverseMass;
        this.velocity.y += impulse.y * this.inverseMass;
        const r = worldPoint.sub(this.position);
        this.angularVelocity += this.inverseInertia * r.cross(impulse);
        this.isSleeping = false;
    }

    // ─── Integration ─────────────────────────────────────────────────────────

    /** Symplectic Euler integration */
    integrate(dt: number): void {
        if (this.bodyType !== 'dynamic') return;
        if (this.isSleeping) return;

        // Linear
        this.velocity.x += this._forceAccum.x * this.inverseMass * dt;
        this.velocity.y += this._forceAccum.y * this.inverseMass * dt;
        this._forceAccum.x = 0;
        this._forceAccum.y = 0;

        // Damping
        const ld = Math.max(0, 1 - this.material.linearDamping * dt);
        const ad = Math.max(0, 1 - this.material.angularDamping * dt);
        this.velocity.x *= ld;
        this.velocity.y *= ld;

        this.position.x += this.velocity.x * dt;
        this.position.y += this.velocity.y * dt;

        // Angular
        this.angularVelocity += this._torqueAccum * this.inverseInertia * dt;
        this._torqueAccum = 0;
        this.angularVelocity *= ad;
        this.angle += this.angularVelocity * dt;

        // Normalize angle
        if (this.angle > Math.PI * 100 || this.angle < -Math.PI * 100) {
            this.angle = this.angle % (Math.PI * 2);
        }

        // Sleep check
        this.updateSleep(dt);
    }

    private updateSleep(dt: number): void {
        const vSq = this.velocity.magnitudeSq();
        const avSq = this.angularVelocity * this.angularVelocity;
        if (vSq < RigidBody.SLEEP_VELOCITY_SQ && avSq < RigidBody.SLEEP_ANGULAR) {
            this._sleepTimer += dt;
            if (this._sleepTimer > RigidBody.SLEEP_TIME) {
                this.isSleeping = true;
                this.velocity.set(0, 0);
                this.angularVelocity = 0;
            }
        } else {
            this._sleepTimer = 0;
        }
    }

    wakeUp(): void {
        this.isSleeping = false;
        this._sleepTimer = 0;
    }

    // ─── Velocity at a point ─────────────────────────────────────────────────

    /** Velocity at a specific world-space point on the body */
    getVelocityAt(worldPoint: Vector2): Vector2 {
        const r = worldPoint.sub(this.position);
        return new Vector2(
            this.velocity.x - this.angularVelocity * r.y,
            this.velocity.y + this.angularVelocity * r.x,
        );
    }
}
