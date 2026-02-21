/**
 * CollisionDetector - All shape-pair narrow-phase collision tests.
 *
 * Supported pairs (all symmetric):
 *   Circle  × Circle   → analytical
 *   Circle  × AABB     → closest-point
 *   Circle  × OBB      → SAT
 *   Circle  × Polygon  → SAT
 *   Circle  × Capsule  → segment closest-point
 *   AABB    × AABB     → overlap
 *   AABB    × OBB      → SAT
 *   OBB     × OBB      → SAT (Separating Axis Theorem)
 *   Polygon × Polygon  → SAT
 *   Polygon × OBB      → SAT
 *   Capsule × Capsule  → segment-segment closest
 *   Capsule × Circle   → symmetric
 *   Capsule × OBB/Polygon → SAT approximation via decomposition
 */
import { Vector2 } from '../math/Vector2.js';
import { RigidBody } from './RigidBody.js';
import {
    Shape, ShapeType,
    CircleShape, AABBShape, OBBShape, PolygonShape, CapsuleShape,
} from './Shape.js';
import { CollisionManifold, ContactPoint } from './CollisionManifold.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Project vertices onto axis and return [min, max] */
function projectVertices(verts: Vector2[], axis: Vector2): [number, number] {
    let min = Infinity, max = -Infinity;
    for (const v of verts) {
        const p = v.dot(axis);
        if (p < min) min = p;
        if (p > max) max = p;
    }
    return [min, max];
}

/** Closest point on line segment AB to point P */
function closestPointOnSegment(a: Vector2, b: Vector2, p: Vector2): Vector2 {
    const ab = b.sub(a);
    const abLenSq = ab.magnitudeSq();
    if (abLenSq < 1e-10) return a.clone();
    const t = Math.max(0, Math.min(1, p.sub(a).dot(ab) / abLenSq));
    return a.add(ab.scale(t));
}

/** Closest point on segment A to segment B (returns t for A and s for B) */
function segmentSegmentClosest(
    a0: Vector2, a1: Vector2,
    b0: Vector2, b1: Vector2
): { pA: Vector2; pB: Vector2 } {
    const d1 = a1.sub(a0), d2 = b1.sub(b0), r = a0.sub(b0);
    const a = d1.dot(d1), e = d2.dot(d2);
    let s: number, t: number;

    if (a < 1e-10 && e < 1e-10) { return { pA: a0.clone(), pB: b0.clone() }; }

    if (a < 1e-10) {
        s = 0; t = Math.max(0, Math.min(1, r.dot(d2) / e));
    } else {
        const c = d1.dot(r);
        if (e < 1e-10) {
            t = 0; s = Math.max(0, Math.min(1, -c / a));
        } else {
            const b = d1.dot(d2), denom = a * e - b * b;
            s = denom !== 0 ? Math.max(0, Math.min(1, (b * r.dot(d2) - c * e) / denom)) : 0;
            t = (b * s + r.dot(d2)) / e;
            if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
            else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
        }
    }
    return { pA: a0.add(d1.scale(s)), pB: b0.add(d2.scale(t)) };
}

// ─── SAT Engine ───────────────────────────────────────────────────────────

interface SATResult { depth: number; normal: Vector2; }

/** Generic SAT test given two sets of world-space vertices and test axes */
function satTest(
    vertsA: Vector2[], vertsB: Vector2[], axes: Vector2[]
): SATResult | null {
    let minDepth = Infinity;
    let minNormal = Vector2.zero();

    for (const axis of axes) {
        const lenSq = axis.magnitudeSq();
        if (lenSq < 1e-10) continue;
        const normAxis = lenSq !== 1 ? axis.scale(1 / Math.sqrt(lenSq)) : axis;
        const [minA, maxA] = projectVertices(vertsA, normAxis);
        const [minB, maxB] = projectVertices(vertsB, normAxis);
        const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
        if (overlap <= 0) return null; // Separating axis found
        if (overlap < minDepth) {
            minDepth = overlap;
            minNormal = normAxis.clone();
        }
    }
    return { depth: minDepth, normal: minNormal };
}

// ─── Contact point finders ────────────────────────────────────────────────

/** Find contact points between two convex polygon vertex sets */
function findPolygonContacts(
    vertsA: Vector2[], vertsB: Vector2[], normal: Vector2, depth: number
): ContactPoint[] {
    // Use incident face approach: find face of B most anti-parallel to normal,
    // then clip against the reference face from A.
    // Simplified: just use penetrating vertices.
    const contacts: ContactPoint[] = [];
    const threshold = depth + 0.01;
    for (const v of vertsB) {
        // Project onto normal, check if vertex penetrates into A
        let inside = true;
        const n = vertsA.length;
        for (let i = 0; i < n; i++) {
            const edge = vertsA[(i + 1) % n].sub(vertsA[i]);
            const toV = v.sub(vertsA[i]);
            if (edge.cross(toV) > threshold) { inside = false; break; }
        }
        if (inside) contacts.push({ point: v.clone(), depth });
    }
    if (contacts.length === 0) {
        // Fallback: midpoint
        const cx = vertsB.reduce((s, v) => s + v.x, 0) / vertsB.length;
        const cy = vertsB.reduce((s, v) => s + v.y, 0) / vertsB.length;
        contacts.push({ point: new Vector2(cx, cy), depth });
    }
    return contacts.slice(0, 2);
}

// ─── CollisionDetector ────────────────────────────────────────────────────

type TestFn = (a: RigidBody, b: RigidBody) => CollisionManifold | null;

export class CollisionDetector {
    /** Dispatch table for all shape pair combinations */
    private static readonly tests: Partial<Record<ShapeType, Partial<Record<ShapeType, TestFn>>>> = {
        circle: {
            circle: (a, b) => CollisionDetector.circleCircle(a, b),
            aabb: (a, b) => CollisionDetector.circleAABB(a, b),
            obb: (a, b) => CollisionDetector.circleOBB(a, b),
            polygon: (a, b) => CollisionDetector.circlePolygon(a, b),
            capsule: (a, b) => CollisionDetector.circleCapsule(a, b),
        },
        aabb: {
            circle: (a, b) => CollisionDetector.flipManifold(CollisionDetector.circleAABB(b, a)),
            aabb: (a, b) => CollisionDetector.aabbAABB(a, b),
            obb: (a, b) => CollisionDetector.aabbOBB(a, b),
            polygon: (a, b) => CollisionDetector.aabbPolygon(a, b),
            capsule: (a, b) => CollisionDetector.flipManifold(CollisionDetector.capsuleAABB(b, a)),
        },
        obb: {
            circle: (a, b) => CollisionDetector.flipManifold(CollisionDetector.circleOBB(b, a)),
            aabb: (a, b) => CollisionDetector.flipManifold(CollisionDetector.aabbOBB(b, a)),
            obb: (a, b) => CollisionDetector.obbOBB(a, b),
            polygon: (a, b) => CollisionDetector.obbPolygon(a, b),
            capsule: (a, b) => CollisionDetector.flipManifold(CollisionDetector.capsuleOBB(b, a)),
        },
        polygon: {
            circle: (a, b) => CollisionDetector.flipManifold(CollisionDetector.circlePolygon(b, a)),
            aabb: (a, b) => CollisionDetector.flipManifold(CollisionDetector.aabbPolygon(b, a)),
            obb: (a, b) => CollisionDetector.flipManifold(CollisionDetector.obbPolygon(b, a)),
            polygon: (a, b) => CollisionDetector.polygonPolygon(a, b),
            capsule: (a, b) => CollisionDetector.flipManifold(CollisionDetector.capsulePolygon(b, a)),
        },
        capsule: {
            circle: (a, b) => CollisionDetector.flipManifold(CollisionDetector.circleCapsule(b, a)),
            aabb: (a, b) => CollisionDetector.capsuleAABB(a, b),
            obb: (a, b) => CollisionDetector.capsuleOBB(a, b),
            polygon: (a, b) => CollisionDetector.capsulePolygon(a, b),
            capsule: (a, b) => CollisionDetector.capsuleCapsule(a, b),
        },
    };

    static test(a: RigidBody, b: RigidBody): CollisionManifold | null {
        if (!a.shape || !b.shape) return null;
        const fn = CollisionDetector.tests[a.shape.type]?.[b.shape.type];
        if (!fn) return null;
        return fn(a, b);
    }

    private static flipManifold(m: CollisionManifold | null): CollisionManifold | null {
        if (!m) return null;
        return { ...m, bodyA: m.bodyB, bodyB: m.bodyA, normal: m.normal.negate() };
    }

    // ─── Circle × Circle ───────────────────────────────────────────────────

    private static circleCircle(a: RigidBody, b: RigidBody): CollisionManifold | null {
        const sa = a.shape as CircleShape, sb = b.shape as CircleShape;
        const ca = sa.getCenter(a.position, a.angle);
        const cb = sb.getCenter(b.position, b.angle);
        const diff = ca.sub(cb);
        const distSq = diff.magnitudeSq();
        const radSum = sa.radius + sb.radius;
        if (distSq >= radSum * radSum) return null;
        const dist = Math.sqrt(distSq);
        const normal = dist > 1e-8 ? diff.scale(1 / dist) : new Vector2(1, 0);
        const depth = radSum - dist;
        const contact = cb.add(normal.scale(sb.radius));
        return { bodyA: a, bodyB: b, normal, depth, contacts: [{ point: contact, depth }] };
    }

    // ─── Circle × AABB ─────────────────────────────────────────────────────

    private static circleAABB(circleBody: RigidBody, aabbBody: RigidBody): CollisionManifold | null {
        const sc = circleBody.shape as CircleShape;
        const sa = aabbBody.shape as AABBShape;
        const center = sc.getCenter(circleBody.position, circleBody.angle);
        const ap = aabbBody.position;
        // Clamp center to AABB
        const cx = Math.max(ap.x - sa.halfW, Math.min(ap.x + sa.halfW, center.x));
        const cy = Math.max(ap.y - sa.halfH, Math.min(ap.y + sa.halfH, center.y));
        const closest = new Vector2(cx, cy);
        const diff = center.sub(closest);
        const distSq = diff.magnitudeSq();
        if (distSq >= sc.radius * sc.radius) return null;
        const dist = Math.sqrt(distSq);
        const normal = dist > 1e-8 ? diff.scale(1 / dist) : new Vector2(0, -1);
        const depth = sc.radius - dist;
        return { bodyA: circleBody, bodyB: aabbBody, normal, depth, contacts: [{ point: closest.clone(), depth }] };
    }

    // ─── Circle × OBB ──────────────────────────────────────────────────────

    private static circleOBB(circleBody: RigidBody, obbBody: RigidBody): CollisionManifold | null {
        const sc = circleBody.shape as CircleShape;
        const so = obbBody.shape as OBBShape;
        const worldCenter = sc.getCenter(circleBody.position, circleBody.angle);
        // Transform circle center to OBB local space
        const oa = obbBody.angle + so.localAngle;
        const cosA = Math.cos(-oa), sinA = Math.sin(-oa);
        const rel = worldCenter.sub(obbBody.position);
        const localCircle = new Vector2(
            rel.x * cosA - rel.y * sinA,
            rel.x * sinA + rel.y * cosA,
        );
        // Clamp to half-extents
        const clamped = new Vector2(
            Math.max(-so.halfW, Math.min(so.halfW, localCircle.x)),
            Math.max(-so.halfH, Math.min(so.halfH, localCircle.y)),
        );
        const diff = localCircle.sub(clamped);
        const distSq = diff.magnitudeSq();
        if (distSq >= sc.radius * sc.radius) return null;
        const dist = Math.sqrt(distSq);
        const localNormal = dist > 1e-8 ? diff.scale(1 / dist) : new Vector2(0, -1);
        // Transform back to world space
        const cosW = Math.cos(oa), sinW = Math.sin(oa);
        const normal = new Vector2(
            localNormal.x * cosW - localNormal.y * sinW,
            localNormal.x * sinW + localNormal.y * cosW,
        );
        const depth = sc.radius - dist;
        const worldClosest = obbBody.position.add(new Vector2(
            clamped.x * cosW - clamped.y * sinW,
            clamped.x * sinW + clamped.y * cosW,
        ));
        return { bodyA: circleBody, bodyB: obbBody, normal, depth, contacts: [{ point: worldClosest, depth }] };
    }

    // ─── Circle × Polygon ──────────────────────────────────────────────────

    private static circlePolygon(circleBody: RigidBody, polyBody: RigidBody): CollisionManifold | null {
        const sc = circleBody.shape as CircleShape;
        const sp = polyBody.shape as PolygonShape;
        const center = sc.getCenter(circleBody.position, circleBody.angle);
        const verts = sp.getWorldVertices(polyBody.position, polyBody.angle);
        let minDepth = Infinity, bestNormal = Vector2.zero();
        // Test each face normal
        for (let i = 0; i < verts.length; i++) {
            const a = verts[i], b = verts[(i + 1) % verts.length];
            const edge = b.sub(a);
            const normal = new Vector2(edge.y, -edge.x).normalizeSelf();
            const d = center.sub(a).dot(normal);
            const dist = d - sc.radius;
            if (dist > 0) return null; // Separating axis
            if (dist < minDepth) { minDepth = dist; bestNormal = normal; }
        }
        // Closest vertex / face
        const depth = -minDepth;
        return { bodyA: circleBody, bodyB: polyBody, normal: bestNormal.negate(), depth, contacts: [{ point: center.sub(bestNormal.scale(sc.radius)), depth }] };
    }

    // ─── Circle × Capsule ──────────────────────────────────────────────────

    private static circleCapsule(circleBody: RigidBody, capsuleBody: RigidBody): CollisionManifold | null {
        const sc = circleBody.shape as CircleShape;
        const sk = capsuleBody.shape as CapsuleShape;
        const center = sc.getCenter(circleBody.position, circleBody.angle);
        const [a, b] = sk.getEndpoints(capsuleBody.position, capsuleBody.angle);
        const closest = closestPointOnSegment(a, b, center);
        const diff = center.sub(closest);
        const distSq = diff.magnitudeSq();
        const radSum = sc.radius + sk.radius;
        if (distSq >= radSum * radSum) return null;
        const dist = Math.sqrt(distSq);
        const normal = dist > 1e-8 ? diff.scale(1 / dist) : new Vector2(1, 0);
        const depth = radSum - dist;
        return { bodyA: circleBody, bodyB: capsuleBody, normal, depth, contacts: [{ point: closest.clone(), depth }] };
    }

    // ─── AABB × AABB ───────────────────────────────────────────────────────

    private static aabbAABB(a: RigidBody, b: RigidBody): CollisionManifold | null {
        const sa = a.shape as AABBShape, sb = b.shape as AABBShape;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const ox = sa.halfW + sb.halfW - Math.abs(dx);
        const oy = sa.halfH + sb.halfH - Math.abs(dy);
        if (ox <= 0 || oy <= 0) return null;
        let normal: Vector2; let depth: number;
        if (ox < oy) {
            depth = ox; normal = new Vector2(dx < 0 ? -1 : 1, 0);
        } else {
            depth = oy; normal = new Vector2(0, dy < 0 ? -1 : 1);
        }
        const contact = new Vector2(
            a.position.x + (dx > 0 ? sa.halfW : -sa.halfW),
            a.position.y + (dy > 0 ? sa.halfH : -sa.halfH),
        );
        return { bodyA: a, bodyB: b, normal, depth, contacts: [{ point: contact, depth }] };
    }

    // ─── AABB × OBB ────────────────────────────────────────────────────────

    private static aabbOBB(aabbBody: RigidBody, obbBody: RigidBody): CollisionManifold | null {
        const sa = aabbBody.shape as AABBShape;
        const so = obbBody.shape as OBBShape;
        const vertsA = [
            new Vector2(aabbBody.position.x - sa.halfW, aabbBody.position.y - sa.halfH),
            new Vector2(aabbBody.position.x + sa.halfW, aabbBody.position.y - sa.halfH),
            new Vector2(aabbBody.position.x + sa.halfW, aabbBody.position.y + sa.halfH),
            new Vector2(aabbBody.position.x - sa.halfW, aabbBody.position.y + sa.halfH),
        ];
        const vertsB = so.getVertices(obbBody.position, obbBody.angle);
        const axes = [
            new Vector2(1, 0), new Vector2(0, 1),
            ...so.getAxes(obbBody.angle),
        ];
        const result = satTest(vertsA, vertsB, axes);
        if (!result) return null;
        const { depth, normal } = result;
        const dir = obbBody.position.sub(aabbBody.position);
        const corrNormal = dir.dot(normal) < 0 ? normal.negate() : normal;
        const contacts = findPolygonContacts(vertsA, vertsB, corrNormal, depth);
        return { bodyA: aabbBody, bodyB: obbBody, normal: corrNormal, depth, contacts };
    }

    // ─── AABB × Polygon ────────────────────────────────────────────────────

    private static aabbPolygon(aabbBody: RigidBody, polyBody: RigidBody): CollisionManifold | null {
        const sa = aabbBody.shape as AABBShape;
        const sp = polyBody.shape as PolygonShape;
        const vertsA = [
            new Vector2(aabbBody.position.x - sa.halfW, aabbBody.position.y - sa.halfH),
            new Vector2(aabbBody.position.x + sa.halfW, aabbBody.position.y - sa.halfH),
            new Vector2(aabbBody.position.x + sa.halfW, aabbBody.position.y + sa.halfH),
            new Vector2(aabbBody.position.x - sa.halfW, aabbBody.position.y + sa.halfH),
        ];
        const vertsB = sp.getWorldVertices(polyBody.position, polyBody.angle);
        const axesA = [new Vector2(1, 0), new Vector2(0, 1)];
        const axesB = sp.getWorldNormals(polyBody.angle);
        const result = satTest(vertsA, vertsB, [...axesA, ...axesB]);
        if (!result) return null;
        const { depth, normal } = result;
        const dir = polyBody.position.sub(aabbBody.position);
        const corrNormal = dir.dot(normal) < 0 ? normal.negate() : normal;
        return { bodyA: aabbBody, bodyB: polyBody, normal: corrNormal, depth, contacts: findPolygonContacts(vertsA, vertsB, corrNormal, depth) };
    }

    // ─── OBB × OBB ─────────────────────────────────────────────────────────

    private static obbOBB(a: RigidBody, b: RigidBody): CollisionManifold | null {
        const sa = a.shape as OBBShape, sb = b.shape as OBBShape;
        const vertsA = sa.getVertices(a.position, a.angle);
        const vertsB = sb.getVertices(b.position, b.angle);
        const axes = [...sa.getAxes(a.angle), ...sb.getAxes(b.angle)];
        const result = satTest(vertsA, vertsB, axes);
        if (!result) return null;
        const { depth, normal } = result;
        const dir = b.position.sub(a.position);
        const corrNormal = dir.dot(normal) < 0 ? normal.negate() : normal;
        return { bodyA: a, bodyB: b, normal: corrNormal, depth, contacts: findPolygonContacts(vertsA, vertsB, corrNormal, depth) };
    }

    // ─── OBB × Polygon ─────────────────────────────────────────────────────

    private static obbPolygon(obbBody: RigidBody, polyBody: RigidBody): CollisionManifold | null {
        const so = obbBody.shape as OBBShape;
        const sp = polyBody.shape as PolygonShape;
        const vertsA = so.getVertices(obbBody.position, obbBody.angle);
        const vertsB = sp.getWorldVertices(polyBody.position, polyBody.angle);
        const axes = [...so.getAxes(obbBody.angle), ...sp.getWorldNormals(polyBody.angle)];
        const result = satTest(vertsA, vertsB, axes);
        if (!result) return null;
        const { depth, normal } = result;
        const dir = polyBody.position.sub(obbBody.position);
        const corrNormal = dir.dot(normal) < 0 ? normal.negate() : normal;
        return { bodyA: obbBody, bodyB: polyBody, normal: corrNormal, depth, contacts: findPolygonContacts(vertsA, vertsB, corrNormal, depth) };
    }

    // ─── Polygon × Polygon ─────────────────────────────────────────────────

    private static polygonPolygon(a: RigidBody, b: RigidBody): CollisionManifold | null {
        const sa = a.shape as PolygonShape, sb = b.shape as PolygonShape;
        const vertsA = sa.getWorldVertices(a.position, a.angle);
        const vertsB = sb.getWorldVertices(b.position, b.angle);
        const axes = [...sa.getWorldNormals(a.angle), ...sb.getWorldNormals(b.angle)];
        const result = satTest(vertsA, vertsB, axes);
        if (!result) return null;
        const { depth, normal } = result;
        const dir = b.position.sub(a.position);
        const corrNormal = dir.dot(normal) < 0 ? normal.negate() : normal;
        return { bodyA: a, bodyB: b, normal: corrNormal, depth, contacts: findPolygonContacts(vertsA, vertsB, corrNormal, depth) };
    }

    // ─── Capsule × Capsule ─────────────────────────────────────────────────

    private static capsuleCapsule(a: RigidBody, b: RigidBody): CollisionManifold | null {
        const sa = a.shape as CapsuleShape, sb = b.shape as CapsuleShape;
        const [a0, a1] = sa.getEndpoints(a.position, a.angle);
        const [b0, b1] = sb.getEndpoints(b.position, b.angle);
        const { pA, pB } = segmentSegmentClosest(a0, a1, b0, b1);
        const diff = pA.sub(pB);
        const distSq = diff.magnitudeSq();
        const radSum = sa.radius + sb.radius;
        if (distSq >= radSum * radSum) return null;
        const dist = Math.sqrt(distSq);
        const normal = dist > 1e-8 ? diff.scale(1 / dist) : new Vector2(1, 0);
        const depth = radSum - dist;
        return { bodyA: a, bodyB: b, normal, depth, contacts: [{ point: pB.add(normal.scale(sb.radius)), depth }] };
    }

    // ─── Capsule × AABB ────────────────────────────────────────────────────

    // Decompose capsule into 3 circles + rectangles, use the best contact
    private static capsuleAABB(capsuleBody: RigidBody, aabbBody: RigidBody): CollisionManifold | null {
        const sc = capsuleBody.shape as CapsuleShape;
        const sa = aabbBody.shape as AABBShape;
        const [ep0, ep1] = sc.getEndpoints(capsuleBody.position, capsuleBody.angle);
        const mid = ep0.add(ep1).scale(0.5);
        // Test 3 key points as circles
        let best: CollisionManifold | null = null;
        for (const pt of [ep0, ep1, mid]) {
            const ap = aabbBody.position;
            const cx = Math.max(ap.x - sa.halfW, Math.min(ap.x + sa.halfW, pt.x));
            const cy = Math.max(ap.y - sa.halfH, Math.min(ap.y + sa.halfH, pt.y));
            const closest = new Vector2(cx, cy);
            const diff = pt.sub(closest);
            const distSq = diff.magnitudeSq();
            if (distSq < sc.radius * sc.radius) {
                const dist = Math.sqrt(distSq);
                const normal = dist > 1e-8 ? diff.scale(1 / dist) : new Vector2(0, -1);
                const depth = sc.radius - dist;
                if (!best || depth > best.depth) {
                    best = { bodyA: capsuleBody, bodyB: aabbBody, normal, depth, contacts: [{ point: closest.clone(), depth }] };
                }
            }
        }
        return best;
    }

    // ─── Capsule × OBB / Polygon ───────────────────────────────────────────
    // Approximate by testing capsule endpoints + midpoint as spheres vs shape

    private static capsuleOBB(capsuleBody: RigidBody, obbBody: RigidBody): CollisionManifold | null {
        const sc = capsuleBody.shape as CapsuleShape;
        const [ep0, ep1] = sc.getEndpoints(capsuleBody.position, capsuleBody.angle);
        const mid = ep0.add(ep1).scale(0.5);
        let best: CollisionManifold | null = null;
        for (const pt of [ep0, ep1, mid]) {
            const fakebody = { ...capsuleBody, position: pt, angle: 0, shape: new CircleShape(sc.radius) } as unknown as RigidBody;
            const m = CollisionDetector.circleOBB(fakebody, obbBody);
            if (m && (!best || m.depth > best.depth)) best = { ...m, bodyA: capsuleBody };
        }
        return best;
    }

    private static capsulePolygon(capsuleBody: RigidBody, polyBody: RigidBody): CollisionManifold | null {
        const sc = capsuleBody.shape as CapsuleShape;
        const [ep0, ep1] = sc.getEndpoints(capsuleBody.position, capsuleBody.angle);
        const mid = ep0.add(ep1).scale(0.5);
        let best: CollisionManifold | null = null;
        for (const pt of [ep0, ep1, mid]) {
            const fakebody = { ...capsuleBody, position: pt, angle: 0, shape: new CircleShape(sc.radius) } as unknown as RigidBody;
            const m = CollisionDetector.circlePolygon(fakebody, polyBody);
            if (m && (!best || m.depth > best.depth)) best = { ...m, bodyA: capsuleBody };
        }
        return best;
    }
}
