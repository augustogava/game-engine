/**
 * SpatialHashGrid - Spatial hashing for efficient neighbor queries in SPH.
 * 
 * Partitions space into cells of size equal to the smoothing radius.
 * Neighbor queries check only the 9 surrounding cells (2D).
 * O(1) average lookup vs O(n) brute force.
 */
import { FluidParticle } from './FluidParticle.js';

export class SpatialHashGrid {
    private cells: Map<number, FluidParticle[]> = new Map();
    private cellSize: number;
    private invCellSize: number;

    constructor(cellSize: number = 16) {
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;
    }

    private hash(cx: number, cy: number): number {
        const x = cx >= 0 ? 2 * cx : -2 * cx - 1;
        const y = cy >= 0 ? 2 * cy : -2 * cy - 1;
        return ((x + y) * (x + y + 1)) / 2 + y;
    }

    private getCellCoords(x: number, y: number): [number, number] {
        return [
            Math.floor(x * this.invCellSize),
            Math.floor(y * this.invCellSize)
        ];
    }

    clear(): void {
        this.cells.clear();
    }

    insert(particle: FluidParticle): void {
        const [cx, cy] = this.getCellCoords(particle.position.x, particle.position.y);
        const key = this.hash(cx, cy);
        let cell = this.cells.get(key);
        if (!cell) {
            cell = [];
            this.cells.set(key, cell);
        }
        cell.push(particle);
    }

    insertAll(particles: FluidParticle[]): void {
        for (let i = 0; i < particles.length; i++) {
            if (particles[i].active) {
                this.insert(particles[i]);
            }
        }
    }

    getNeighbors(particle: FluidParticle, radius: number): FluidParticle[] {
        const neighbors: FluidParticle[] = [];
        const [cx, cy] = this.getCellCoords(particle.position.x, particle.position.y);
        const radiusSq = radius * radius;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = this.hash(cx + dx, cy + dy);
                const cell = this.cells.get(key);
                if (!cell) continue;

                for (let i = 0; i < cell.length; i++) {
                    const other = cell[i];
                    if (other === particle) continue;
                    
                    const diffX = other.position.x - particle.position.x;
                    const diffY = other.position.y - particle.position.y;
                    const distSq = diffX * diffX + diffY * diffY;
                    
                    if (distSq < radiusSq) {
                        neighbors.push(other);
                    }
                }
            }
        }

        return neighbors;
    }

    getNeighborsWithSelf(particle: FluidParticle, radius: number): FluidParticle[] {
        const neighbors: FluidParticle[] = [];
        const [cx, cy] = this.getCellCoords(particle.position.x, particle.position.y);
        const radiusSq = radius * radius;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = this.hash(cx + dx, cy + dy);
                const cell = this.cells.get(key);
                if (!cell) continue;

                for (let i = 0; i < cell.length; i++) {
                    const other = cell[i];
                    const diffX = other.position.x - particle.position.x;
                    const diffY = other.position.y - particle.position.y;
                    const distSq = diffX * diffX + diffY * diffY;
                    
                    if (distSq < radiusSq) {
                        neighbors.push(other);
                    }
                }
            }
        }

        return neighbors;
    }

    resize(cellSize: number): void {
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;
    }

    get size(): number {
        return this.cells.size;
    }
}
