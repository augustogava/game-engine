/**
 * QuadTree - Generic 2D spatial quadtree.
 *
 * Supports two modes:
 *   1. Point query / range query (collision broad-phase, spatial lookups)
 *   2. Barnes-Hut mode: stores center-of-mass for N-body gravity approximation
 *
 * Usage (spatial queries):
 *   const qt = new QuadTree(bounds, capacity);
 *   qt.insert({ x, y, data });
 *   const results = qt.queryRect(bounds);
 *   const results = qt.queryCircle(cx, cy, radius);
 *
 * Usage (Barnes-Hut, via BarnesHut class):
 *   qt.insert({ x, y, mass, data });
 *   // Each internal node accumulates mass and center-of-mass
 */

export interface QTBounds {
    x: number;  // center X
    y: number;  // center Y
    hw: number; // half-width
    hh: number; // half-height
}

export interface QTPoint<T = unknown> {
    x: number;
    y: number;
    mass?: number;
    data?: T;
}

// ─── QuadTree Node (internal) ─────────────────────────────────────────────

class QTNode<T> {
    points: QTPoint<T>[] = [];
    children: [QTNode<T>, QTNode<T>, QTNode<T>, QTNode<T>] | null = null;

    // Barnes-Hut aggregates
    totalMass: number = 0;
    cx: number = 0;  // center of mass X
    cy: number = 0;  // center of mass Y

    constructor(public bounds: QTBounds) { }

    get isLeaf(): boolean { return this.children === null; }
    get isEmpty(): boolean { return this.points.length === 0 && this.isLeaf; }

    contains(px: number, py: number): boolean {
        const { x, y, hw, hh } = this.bounds;
        return px >= x - hw && px <= x + hw && py >= y - hh && py <= y + hh;
    }

    intersectsRect(rx: number, ry: number, rw: number, rh: number): boolean {
        const { x, y, hw, hh } = this.bounds;
        return !(rx > x + hw || rx + rw < x - hw || ry > y + hh || ry + rh < y - hh);
    }

    intersectsCircle(cx: number, cy: number, r: number): boolean {
        const { x, y, hw, hh } = this.bounds;
        const nearX = Math.max(x - hw, Math.min(x + hw, cx));
        const nearY = Math.max(y - hh, Math.min(y + hh, cy));
        const dx = cx - nearX, dy = cy - nearY;
        return dx * dx + dy * dy <= r * r;
    }

    split(): void {
        const { x, y, hw, hh } = this.bounds;
        const qw = hw * 0.5, qh = hh * 0.5;
        this.children = [
            new QTNode<T>({ x: x - qw, y: y - qh, hw: qw, hh: qh }), // NW
            new QTNode<T>({ x: x + qw, y: y - qh, hw: qw, hh: qh }), // NE
            new QTNode<T>({ x: x - qw, y: y + qh, hw: qw, hh: qh }), // SW
            new QTNode<T>({ x: x + qw, y: y + qh, hw: qw, hh: qh }), // SE
        ];
    }

    getChildFor(px: number, py: number): QTNode<T> | null {
        if (!this.children) return null;
        for (const child of this.children) {
            if (child.contains(px, py)) return child;
        }
        return null;
    }
}

// ─── QuadTree ─────────────────────────────────────────────────────────────

export class QuadTree<T = unknown> {
    private root: QTNode<T>;
    private capacity: number;
    private maxDepth: number;
    private _size: number = 0;

    /**
     * @param bounds World-space bounds for the tree (center + half-extents)
     * @param capacity Max points per node before splitting (4–8 is typical)
     * @param maxDepth  Max tree depth (12–16 is typically safe)
     */
    constructor(bounds: QTBounds, capacity: number = 6, maxDepth: number = 12) {
        this.root = new QTNode<T>(bounds);
        this.capacity = capacity;
        this.maxDepth = maxDepth;
    }

    get size(): number { return this._size; }

    /** Remove all points and reset the tree */
    clear(): void {
        this.root = new QTNode<T>(this.root.bounds);
        this._size = 0;
    }

    /** Resize the tree bounds (rebuilds root) */
    resize(bounds: QTBounds): void {
        this.root = new QTNode<T>(bounds);
        this._size = 0;
    }

    // ─── Insert ─────────────────────────────────────────────────────────────

    insert(point: QTPoint<T>): boolean {
        if (!this.root.contains(point.x, point.y)) return false;
        this.insertInto(this.root, point, 0);
        this._size++;
        return true;
    }

    private insertInto(node: QTNode<T>, point: QTPoint<T>, depth: number): void {
        // Update Barnes-Hut aggregates
        const m = point.mass ?? 1;
        const total = node.totalMass + m;
        node.cx = (node.cx * node.totalMass + point.x * m) / total;
        node.cy = (node.cy * node.totalMass + point.y * m) / total;
        node.totalMass = total;

        // Leaf: can fit
        if (node.isLeaf && node.points.length < this.capacity) {
            node.points.push(point);
            return;
        }

        // Split if leaf at capacity and not at max depth
        if (node.isLeaf && depth < this.maxDepth) {
            node.split();
            // Re-insert existing points into children
            for (const p of node.points) {
                const child = node.getChildFor(p.x, p.y);
                if (child) this.insertInto(child, p, depth + 1);
            }
            node.points.length = 0;
        }

        // Insert into appropriate child
        if (node.children) {
            const child = node.getChildFor(point.x, point.y);
            if (child) {
                this.insertInto(child, point, depth + 1);
            } else {
                // Shouldn't happen — point is on boundary, insert in first matching
                node.points.push(point);
            }
        } else {
            // At max depth, store here
            node.points.push(point);
        }
    }

    // ─── Query: rectangle ───────────────────────────────────────────────────

    queryRect(x: number, y: number, w: number, h: number, results: QTPoint<T>[] = []): QTPoint<T>[] {
        this.queryRectNode(this.root, x, y, w, h, results);
        return results;
    }

    private queryRectNode(node: QTNode<T>, rx: number, ry: number, rw: number, rh: number, results: QTPoint<T>[]): void {
        if (!node.intersectsRect(rx, ry, rw, rh)) return;
        for (const p of node.points) {
            if (p.x >= rx && p.x <= rx + rw && p.y >= ry && p.y <= ry + rh) {
                results.push(p);
            }
        }
        if (node.children) {
            for (const child of node.children) {
                this.queryRectNode(child, rx, ry, rw, rh, results);
            }
        }
    }

    // ─── Query: circle ──────────────────────────────────────────────────────

    queryCircle(cx: number, cy: number, radius: number, results: QTPoint<T>[] = []): QTPoint<T>[] {
        this.queryCircleNode(this.root, cx, cy, radius, radius * radius, results);
        return results;
    }

    private queryCircleNode(
        node: QTNode<T>, cx: number, cy: number, r: number, rSq: number, results: QTPoint<T>[]
    ): void {
        if (!node.intersectsCircle(cx, cy, r)) return;
        for (const p of node.points) {
            const dx = p.x - cx, dy = p.y - cy;
            if (dx * dx + dy * dy <= rSq) results.push(p);
        }
        if (node.children) {
            for (const child of node.children) {
                this.queryCircleNode(child, cx, cy, r, rSq, results);
            }
        }
    }

    // ─── Query: nearest neighbor (approximate) ──────────────────────────────

    nearest(px: number, py: number): QTPoint<T> | null {
        let best: QTPoint<T> | null = null;
        let bestDSq = Infinity;
        this.nearestNode(this.root, px, py, { best, bestDSq });
        return best;
    }

    private nearestNode(node: QTNode<T>, px: number, py: number, state: { best: QTPoint<T> | null; bestDSq: number }): void {
        for (const p of node.points) {
            const dx = p.x - px, dy = p.y - py;
            const dSq = dx * dx + dy * dy;
            if (dSq < state.bestDSq) { state.bestDSq = dSq; state.best = p; }
        }
        if (node.children) {
            // Sort children by proximity to point (visit closest first)
            const sorted = [...node.children].sort((a, b) => {
                const dA = (a.bounds.x - px) ** 2 + (a.bounds.y - py) ** 2;
                const dB = (b.bounds.x - px) ** 2 + (b.bounds.y - py) ** 2;
                return dA - dB;
            });
            for (const child of sorted) {
                // Prune: if the child's AABB is farther than best distance, skip
                const { x, y, hw, hh } = child.bounds;
                const nearX = Math.max(x - hw, Math.min(x + hw, px));
                const nearY = Math.max(y - hh, Math.min(y + hh, py));
                const minDSq = (nearX - px) ** 2 + (nearY - py) ** 2;
                if (minDSq > state.bestDSq) continue;
                this.nearestNode(child, px, py, state);
            }
        }
    }

    // ─── Barnes-Hut traversal ────────────────────────────────────────────────

    /**
     * Compute gravitational acceleration at (px, py) using Barnes-Hut approximation.
     * @param px     Query point X
     * @param py     Query point Y  
     * @param G      Gravitational constant
     * @param theta  Accuracy parameter (0.5-0.9, lower=more accurate)
     * @param softening  Softening length to avoid singularity
     */
    barnesHutForce(
        px: number, py: number,
        G: number = 1, theta: number = 0.7, softening: number = 10
    ): [number, number] {
        let ax = 0, ay = 0;
        this.bhForceNode(this.root, px, py, G, theta, softening * softening, ax, ay, (fx, fy) => {
            ax += fx; ay += fy;
        });
        return [ax, ay];
    }

    private bhForceNode(
        node: QTNode<T>, px: number, py: number,
        G: number, theta: number, softSq: number,
        _ax: number, _ay: number,
        accumulate: (fx: number, fy: number) => void
    ): void {
        if (node.totalMass === 0) return;

        const dx = node.cx - px;
        const dy = node.cy - py;
        const distSq = dx * dx + dy * dy + softSq;

        if (distSq < 0.01) return; // same point, skip

        const nodeSize = node.bounds.hw * 2;
        const dist = Math.sqrt(distSq);

        // Barnes-Hut criterion: s/d < theta  →  treat as single mass
        if (node.isLeaf || (nodeSize / dist) < theta) {
            const forceMag = G * node.totalMass / distSq;
            accumulate((dx / dist) * forceMag, (dy / dist) * forceMag);
            return;
        }

        // Recurse into children
        if (node.children) {
            for (const child of node.children) {
                this.bhForceNode(child, px, py, G, theta, softSq, _ax, _ay, accumulate);
            }
        }
        // Also handle any points stored at this internal node (overflow)
        for (const p of node.points) {
            const pdx = p.x - px, pdy = p.y - py;
            const pdistSq = pdx * pdx + pdy * pdy + softSq;
            const pdist = Math.sqrt(pdistSq);
            const forceMag = G * (p.mass ?? 1) / pdistSq;
            accumulate((pdx / pdist) * forceMag, (pdy / pdist) * forceMag);
        }
    }

    // ─── Diagnostics ─────────────────────────────────────────────────────────

    getDepth(): number { return this.nodeDepth(this.root); }
    private nodeDepth(node: QTNode<T>): number {
        if (!node.children) return 1;
        return 1 + Math.max(...node.children.map(c => this.nodeDepth(c)));
    }

    getNodeCount(): number { return this.countNodes(this.root); }
    private countNodes(node: QTNode<T>): number {
        if (!node.children) return 1;
        return 1 + node.children.reduce((s, c) => s + this.countNodes(c), 0);
    }
}
