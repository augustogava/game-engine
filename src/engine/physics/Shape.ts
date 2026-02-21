/**
 * Shape - Base class and all collider shape types for the physics engine.
 *
 * Supported shapes:
 *   CircleShape   - defined by radius
 *   AABBShape     - axis-aligned bounding box
 *   OBBShape      - oriented bounding box (rotates with body)
 *   PolygonShape  - convex polygon (local vertices, auto-computes normals)
 *   CapsuleShape  - two endpoint circle + rectangle hull
 */
import { Vector2 } from '../math/Vector2.js';
import { MathUtils } from '../math/MathUtils.js';

// ─── Shape type discriminator ─────────────────────────────────────────────

export type ShapeType = 'circle' | 'aabb' | 'obb' | 'polygon' | 'capsule';

// ─── AABB (Axis-Aligned Bounding Box) ────────────────────────────────────
// Used both as a standalone shape and for broad-phase culling.

export interface AABB {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

// ─── Base Shape ───────────────────────────────────────────────────────────

export abstract class Shape {
    abstract readonly type: ShapeType;

    /**
     * Compute the moment of inertia for a unit mass (divide by actual mass).
     * Called once when attached to a RigidBody.
     */
    abstract computeInertia(mass: number): number;

    /**
     * Return an AABB in world space given a body's position and rotation angle.
     */
    abstract getAABB(position: Vector2, angle: number): AABB;

    /**
     * Transform a local-space point to world-space given position + angle.
     */
    protected static localToWorld(local: Vector2, position: Vector2, angle: number): Vector2 {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vector2(
            position.x + local.x * cos - local.y * sin,
            position.y + local.x * sin + local.y * cos,
        );
    }
}

// ─── CircleShape ──────────────────────────────────────────────────────────

export class CircleShape extends Shape {
    readonly type: ShapeType = 'circle';
    /** Offset from body origin in local space */
    readonly offset: Vector2;

    constructor(public radius: number, offset: Vector2 = Vector2.zero()) {
        super();
        this.radius = Math.max(0.001, radius);
        this.offset = offset.clone();
    }

    computeInertia(mass: number): number {
        // I = 0.5 * m * r^2 (solid disk)
        return 0.5 * mass * this.radius * this.radius;
    }

    getAABB(position: Vector2, angle: number): AABB {
        const center = Shape.localToWorld(this.offset, position, angle);
        return {
            minX: center.x - this.radius,
            minY: center.y - this.radius,
            maxX: center.x + this.radius,
            maxY: center.y + this.radius,
        };
    }

    /** Get world-space center */
    getCenter(position: Vector2, angle: number): Vector2 {
        return Shape.localToWorld(this.offset, position, angle);
    }
}

// ─── AABBShape ────────────────────────────────────────────────────────────

export class AABBShape extends Shape {
    readonly type: ShapeType = 'aabb';
    readonly halfW: number;
    readonly halfH: number;

    constructor(width: number, height: number) {
        super();
        this.halfW = width * 0.5;
        this.halfH = height * 0.5;
    }

    get width(): number { return this.halfW * 2; }
    get height(): number { return this.halfH * 2; }

    computeInertia(mass: number): number {
        // I = (1/12) * m * (w^2 + h^2)
        const w = this.halfW * 2, h = this.halfH * 2;
        return (mass / 12) * (w * w + h * h);
    }

    getAABB(position: Vector2, _angle: number): AABB {
        // AABB ignores rotation — use OBB if rotation matters
        return {
            minX: position.x - this.halfW,
            minY: position.y - this.halfH,
            maxX: position.x + this.halfW,
            maxY: position.y + this.halfH,
        };
    }
}

// ─── OBBShape ─────────────────────────────────────────────────────────────

export class OBBShape extends Shape {
    readonly type: ShapeType = 'obb';
    readonly halfW: number;
    readonly halfH: number;
    readonly localAngle: number;

    constructor(width: number, height: number, localAngle: number = 0) {
        super();
        this.halfW = width * 0.5;
        this.halfH = height * 0.5;
        this.localAngle = localAngle;
    }

    get width(): number { return this.halfW * 2; }
    get height(): number { return this.halfH * 2; }

    computeInertia(mass: number): number {
        const w = this.halfW * 2, h = this.halfH * 2;
        return (mass / 12) * (w * w + h * h);
    }

    getAABB(position: Vector2, bodyAngle: number): AABB {
        const a = bodyAngle + this.localAngle;
        const cos = Math.abs(Math.cos(a));
        const sin = Math.abs(Math.sin(a));
        const ex = this.halfW * cos + this.halfH * sin;
        const ey = this.halfW * sin + this.halfH * cos;
        return {
            minX: position.x - ex,
            minY: position.y - ey,
            maxX: position.x + ex,
            maxY: position.y + ey,
        };
    }

    /** Return the 4 world-space corner vertices */
    getVertices(position: Vector2, bodyAngle: number): Vector2[] {
        const a = bodyAngle + this.localAngle;
        const cos = Math.cos(a), sin = Math.sin(a);
        const hw = this.halfW, hh = this.halfH;
        const corners: [number, number][] = [
            [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh],
        ];
        return corners.map(([lx, ly]) => new Vector2(
            position.x + lx * cos - ly * sin,
            position.y + lx * sin + ly * cos,
        ));
    }

    /** Return outward-facing normals in world space */
    getAxes(bodyAngle: number): Vector2[] {
        const a = bodyAngle + this.localAngle;
        const cos = Math.cos(a), sin = Math.sin(a);
        return [
            new Vector2(cos, sin),   // X axis
            new Vector2(-sin, cos),  // Y axis
        ];
    }
}

// ─── PolygonShape ─────────────────────────────────────────────────────────

export class PolygonShape extends Shape {
    readonly type: ShapeType = 'polygon';
    /** Local-space vertices (must be convex, counter-clockwise winding) */
    readonly vertices: Vector2[];
    /** Precomputed local-space face normals */
    readonly normals: Vector2[];

    constructor(vertices: Vector2[]) {
        super();
        if (vertices.length < 3) throw new Error('PolygonShape needs at least 3 vertices');
        this.vertices = vertices.map(v => v.clone());
        this.normals = this.computeNormals();
    }

    private computeNormals(): Vector2[] {
        const n = this.vertices.length;
        const norms: Vector2[] = [];
        for (let i = 0; i < n; i++) {
            const a = this.vertices[i];
            const b = this.vertices[(i + 1) % n];
            const edge = b.sub(a);
            // Outward normal (right-hand perpendicular for CCW)
            norms.push(new Vector2(edge.y, -edge.x).normalize());
        }
        return norms;
    }

    computeInertia(mass: number): number {
        // Shoelace formula for polygon inertia
        let numer = 0, denom = 0;
        const verts = this.vertices;
        for (let i = 0; i < verts.length; i++) {
            const a = verts[i];
            const b = verts[(i + 1) % verts.length];
            const cross = Math.abs(a.cross(b));
            numer += cross * (a.dot(a) + a.dot(b) + b.dot(b));
            denom += cross;
        }
        return (mass / 6) * (numer / denom);
    }

    getAABB(position: Vector2, angle: number): AABB {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        for (const v of this.vertices) {
            const wx = position.x + v.x * cos - v.y * sin;
            const wy = position.y + v.x * sin + v.y * cos;
            if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
            if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
        }
        return { minX, minY, maxX, maxY };
    }

    getWorldVertices(position: Vector2, angle: number): Vector2[] {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return this.vertices.map(v => new Vector2(
            position.x + v.x * cos - v.y * sin,
            position.y + v.x * sin + v.y * cos,
        ));
    }

    getWorldNormals(angle: number): Vector2[] {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        return this.normals.map(n => new Vector2(
            n.x * cos - n.y * sin,
            n.x * sin + n.y * cos,
        ));
    }

    /** Factory: regular n-gon */
    static regular(sides: number, radius: number): PolygonShape {
        const verts: Vector2[] = [];
        for (let i = 0; i < sides; i++) {
            const a = (i / sides) * MathUtils.PI2 - Math.PI / 2;
            verts.push(new Vector2(Math.cos(a) * radius, Math.sin(a) * radius));
        }
        return new PolygonShape(verts);
    }

    /** Factory: box as polygon */
    static box(width: number, height: number): PolygonShape {
        const hw = width * 0.5, hh = height * 0.5;
        return new PolygonShape([
            new Vector2(-hw, -hh),
            new Vector2(hw, -hh),
            new Vector2(hw, hh),
            new Vector2(-hw, hh),
        ]);
    }
}

// ─── CapsuleShape ─────────────────────────────────────────────────────────
// A capsule is defined as two circles joined by a rectangle.
// Local-space: axis runs along Y.

export class CapsuleShape extends Shape {
    readonly type: ShapeType = 'capsule';

    constructor(
        public readonly radius: number,
        public readonly height: number,  // full height tip-to-tip
    ) {
        super();
        if (height < radius * 2) throw new Error('CapsuleShape: height < 2*radius');
    }

    get halfHeight(): number { return this.height * 0.5; }
    get halfAxisLength(): number { return this.halfHeight - this.radius; }

    computeInertia(mass: number): number {
        // Approximate: treat as cylinder + two hemispheres
        const r = this.radius, hl = this.halfAxisLength;
        const mRect = mass * (2 * hl) / this.height;
        const mCaps = mass - mRect;
        const iRect = mRect * ((2 * hl) ** 2 / 12 + r * r / 4);
        const iCaps = mCaps * (0.4 * r * r + hl * hl + 0.75 * r * hl);
        return iRect + iCaps;
    }

    getAABB(position: Vector2, angle: number): AABB {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const hl = this.halfAxisLength;
        const r = this.radius;
        // World-space endpoints of the capsule axis
        const ax = position.x - sin * hl, ay = position.y + cos * hl;
        const bx = position.x + sin * hl, by = position.y - cos * hl;
        return {
            minX: Math.min(ax, bx) - r,
            minY: Math.min(ay, by) - r,
            maxX: Math.max(ax, bx) + r,
            maxY: Math.max(ay, by) + r,
        };
    }

    /** World-space endpoints A (top) and B (bottom) */
    getEndpoints(position: Vector2, angle: number): [Vector2, Vector2] {
        const hl = this.halfAxisLength;
        const sin = Math.sin(angle), cos = Math.cos(angle);
        return [
            new Vector2(position.x - sin * hl, position.y + cos * hl),
            new Vector2(position.x + sin * hl, position.y - cos * hl),
        ];
    }
}
