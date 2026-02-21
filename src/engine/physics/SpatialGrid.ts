/**
 * SpatialGrid - Uniform grid broad-phase collision detection.
 *
 * Partitions the world into fixed-size cells. For each pair of bodies
 * that share a cell, a narrow-phase test is warranted. This reduces
 * O(n^2) naive pair-testing to roughly O(n) for uniformly distributed bodies.
 *
 * Usage:
 *   grid.clear()
 *   bodies.forEach(b => grid.insert(b))
 *   const pairs = grid.getPotentialPairs()
 */
import { RigidBody } from './RigidBody.js';
import { AABB } from './Shape.js';

export class SpatialGrid {
    private cells: Map<number, RigidBody[]> = new Map();
    private cellSize: number;
    private invCellSize: number;

    constructor(cellSize: number = 128) {
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;
    }

    private cellKey(cx: number, cy: number): number {
        // Cantor pairing (works for reasonable world sizes, negative too)
        const x = cx >= 0 ? 2 * cx : -2 * cx - 1;
        const y = cy >= 0 ? 2 * cy : -2 * cy - 1;
        return ((x + y) * (x + y + 1)) / 2 + y;
    }

    clear(): void { this.cells.clear(); }

    insert(body: RigidBody): void {
        if (!body.shape) return;
        const aabb = body.shape.getAABB(body.position, body.angle);
        this.insertAABB(body, aabb);
    }

    private insertAABB(body: RigidBody, aabb: AABB): void {
        const minCX = Math.floor(aabb.minX * this.invCellSize);
        const minCY = Math.floor(aabb.minY * this.invCellSize);
        const maxCX = Math.floor(aabb.maxX * this.invCellSize);
        const maxCY = Math.floor(aabb.maxY * this.invCellSize);
        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cy = minCY; cy <= maxCY; cy++) {
                const key = this.cellKey(cx, cy);
                let cell = this.cells.get(key);
                if (!cell) { cell = []; this.cells.set(key, cell); }
                cell.push(body);
            }
        }
    }

    /**
     * Returns unique pairs of bodies that overlap in at least one cell.
     * Uses a Set<number> of encoded pair IDs to avoid duplicates.
     */
    getPotentialPairs(): [RigidBody, RigidBody][] {
        const pairs: [RigidBody, RigidBody][] = [];
        const seen = new Set<number>();
        for (const cell of this.cells.values()) {
            for (let i = 0; i < cell.length; i++) {
                for (let j = i + 1; j < cell.length; j++) {
                    const a = cell[i], b = cell[j];
                    // Skip if both are static/kinematic
                    if (a.bodyType !== 'dynamic' && b.bodyType !== 'dynamic') continue;
                    // Skip if both sleeping
                    if (a.isSleeping && b.isSleeping) continue;
                    // Encode pair (order-independent)
                    const lo = Math.min(a.id, b.id), hi = Math.max(a.id, b.id);
                    const pairId = lo * 100000 + hi;
                    if (!seen.has(pairId)) {
                        seen.add(pairId);
                        pairs.push([a, b]);
                    }
                }
            }
        }
        return pairs;
    }

    /** Quick AABB overlap check (for pre-filtering) */
    static aabbOverlap(a: AABB, b: AABB): boolean {
        return a.maxX > b.minX && a.minX < b.maxX &&
            a.maxY > b.minY && a.minY < b.maxY;
    }

    resize(cellSize: number): void {
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;
    }
}
