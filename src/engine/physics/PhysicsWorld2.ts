/**
 * PhysicsWorld2 - Full rigid-body physics world with broad+narrow phase,
 * collision resolution, gravity attractors, and global gravity.
 *
 * This is the robust counterpart to the simple PhysicsWorld.
 * Use this when you need shapes, rotation, and real collision response.
 *
 * Usage:
 *   const world = new PhysicsWorld2();
 *   const body = new RigidBody(0, 0, 1.0);
 *   body.setShape(new CircleShape(20));
 *   world.addBody(body);
 *   // In game loop:
 *   world.step(dt);
 *   // Listen for collisions:
 *   world.on('collision', (manifold) => { ... });
 */
import { RigidBody } from './RigidBody.js';
import { CollisionDetector } from './CollisionDetector.js';
import { CollisionResolver, ResolverConfig, DefaultResolverConfig } from './CollisionResolver.js';
import { CollisionManifold } from './CollisionManifold.js';
import { SpatialGrid } from './SpatialGrid.js';
import { Vector2 } from '../math/Vector2.js';
import { EventEmitter } from '../commons/EventEmitter.js';

export interface GravityAttractor2 {
    position: Vector2;
    mass: number;
    softening: number;
}

interface PhysicsWorld2Events {
    collision: CollisionManifold;
    'body-added': RigidBody;
    'body-removed': RigidBody;
}

export class PhysicsWorld2 extends EventEmitter<PhysicsWorld2Events> {
    bodies: RigidBody[] = [];
    attractors: GravityAttractor2[] = [];

    /** World gravity (standard downward default) */
    gravity: Vector2 = new Vector2(0, 980); // pixels/sec^2 (like Earth in screen space)
    /** Set to false to disable global gravity */
    useGravity: boolean = true;
    /** Scaled gravitational constant for point attractors */
    gravitationalConstant: number = 6.674e-3;

    private grid: SpatialGrid;
    private resolver: CollisionResolver;
    private resolverConfig: ResolverConfig;

    constructor(cellSize: number = 128, resolverConfig?: Partial<ResolverConfig>) {
        super();
        this.grid = new SpatialGrid(cellSize);
        this.resolverConfig = { ...DefaultResolverConfig, ...resolverConfig };
        this.resolver = new CollisionResolver(this.resolverConfig);
    }

    // ─── Body management ─────────────────────────────────────────────────────

    addBody(body: RigidBody): RigidBody {
        this.bodies.push(body);
        this.emit('body-added', body);
        return body;
    }

    removeBody(body: RigidBody): void {
        const idx = this.bodies.indexOf(body);
        if (idx !== -1) {
            this.bodies.splice(idx, 1);
            this.emit('body-removed', body);
        }
    }

    addAttractor(position: Vector2, mass: number, softening: number = 50): GravityAttractor2 {
        const a: GravityAttractor2 = { position: position.clone(), mass, softening };
        this.attractors.push(a);
        return a;
    }

    removeAttractor(a: GravityAttractor2): void {
        const idx = this.attractors.indexOf(a);
        if (idx !== -1) this.attractors.splice(idx, 1);
    }

    clear(): void {
        this.bodies.length = 0;
        this.attractors.length = 0;
        this.grid.clear();
    }

    // ─── Step ────────────────────────────────────────────────────────────────

    step(dt: number): void {
        // 1. Apply forces (gravity)
        this.applyGravity(dt);

        // 2. Integrate all bodies
        for (const body of this.bodies) {
            body.integrate(dt);
        }

        // 3. Broad phase
        this.grid.clear();
        for (const body of this.bodies) {
            if (body.bodyType !== 'static' && !body.isSleeping) {
                this.grid.insert(body);
            } else if (body.bodyType === 'static') {
                this.grid.insert(body); // statics participate in detection but not response
            }
        }

        // 4. Narrow phase + resolution
        const pairs = this.grid.getPotentialPairs();
        for (const [a, b] of pairs) {
            if (!a.shape || !b.shape) continue;
            // AABB quick reject
            const aaBB = a.shape.getAABB(a.position, a.angle);
            const bbB = b.shape.getAABB(b.position, b.angle);
            if (!SpatialGrid.aabbOverlap(aaBB, bbB)) continue;

            const manifold = CollisionDetector.test(a, b);
            if (manifold) {
                // Resolve
                for (let i = 0; i < this.resolverConfig.iterations; i++) {
                    this.resolver.resolve(manifold, dt);
                }
                // Wake up sleepers
                if (a.isSleeping) a.wakeUp();
                if (b.isSleeping) b.wakeUp();
                this.emit('collision', manifold);
            }
        }
    }

    private applyGravity(dt: number): void {
        const G = this.gravitationalConstant;
        for (const body of this.bodies) {
            if (body.bodyType !== 'dynamic' || body.isSleeping) continue;

            // Global gravity
            if (this.useGravity) {
                body.applyForce(this.gravity.scale(body.mass));
            }

            // Point attractors
            for (const attractor of this.attractors) {
                const dx = attractor.position.x - body.position.x;
                const dy = attractor.position.y - body.position.y;
                const softSq = attractor.softening * attractor.softening;
                const distSq = dx * dx + dy * dy + softSq;
                const dist = Math.sqrt(distSq);
                const forceMag = Math.min((G * attractor.mass * body.mass) / distSq, 50000);
                body.applyForce(new Vector2((dx / dist) * forceMag, (dy / dist) * forceMag));
            }
        }
    }

    // ─── Queries ─────────────────────────────────────────────────────────────

    /** Get all bodies whose AABB overlaps a world-space point */
    queryPoint(point: Vector2): RigidBody[] {
        return this.bodies.filter(body => {
            if (!body.shape) return false;
            const aabb = body.shape.getAABB(body.position, body.angle);
            return point.x >= aabb.minX && point.x <= aabb.maxX &&
                point.y >= aabb.minY && point.y <= aabb.maxY;
        });
    }

    /** Get all bodies whose AABBs overlap a Rectangle */
    queryRect(x: number, y: number, w: number, h: number): RigidBody[] {
        const rect = { minX: x, minY: y, maxX: x + w, maxY: y + h };
        return this.bodies.filter(body => {
            if (!body.shape) return false;
            return SpatialGrid.aabbOverlap(body.shape.getAABB(body.position, body.angle), rect);
        });
    }
}
