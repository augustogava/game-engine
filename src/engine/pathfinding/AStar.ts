/**
 * AStar - Grid-based A* pathfinding algorithm.
 * 
 * Used for pedestrian navigation on sidewalks and general grid-based pathfinding.
 * Supports 4-directional and 8-directional movement.
 */
import { Vector2 } from '../math/Vector2.js';

interface GridNode {
    x: number;
    y: number;
    walkable: boolean;
    g: number;
    h: number;
    f: number;
    parent: GridNode | null;
}

export class AStar {
    private grid: GridNode[][];
    private width: number;
    private height: number;
    private allowDiagonal: boolean;

    constructor(width: number, height: number, allowDiagonal: boolean = false) {
        this.width = width;
        this.height = height;
        this.allowDiagonal = allowDiagonal;
        this.grid = [];

        for (let y = 0; y < height; y++) {
            this.grid[y] = [];
            for (let x = 0; x < width; x++) {
                this.grid[y][x] = {
                    x,
                    y,
                    walkable: true,
                    g: 0,
                    h: 0,
                    f: 0,
                    parent: null
                };
            }
        }
    }

    setWalkable(x: number, y: number, walkable: boolean): void {
        if (this.isInBounds(x, y)) {
            this.grid[y][x].walkable = walkable;
        }
    }

    isWalkable(x: number, y: number): boolean {
        if (!this.isInBounds(x, y)) return false;
        return this.grid[y][x].walkable;
    }

    private isInBounds(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    findPath(startX: number, startY: number, endX: number, endY: number): Vector2[] | null {
        if (!this.isInBounds(startX, startY) || !this.isInBounds(endX, endY)) {
            return null;
        }

        const startNode = this.grid[startY][startX];
        const endNode = this.grid[endY][endX];

        if (!startNode.walkable || !endNode.walkable) {
            return null;
        }

        this.resetGrid();

        const openSet: GridNode[] = [startNode];
        const closedSet = new Set<GridNode>();

        startNode.g = 0;
        startNode.h = this.heuristic(startNode, endNode);
        startNode.f = startNode.h;

        while (openSet.length > 0) {
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift()!;

            if (current === endNode) {
                return this.reconstructPath(current);
            }

            closedSet.add(current);

            const neighbors = this.getNeighbors(current);
            for (const neighbor of neighbors) {
                if (closedSet.has(neighbor) || !neighbor.walkable) {
                    continue;
                }

                const isDiagonal = neighbor.x !== current.x && neighbor.y !== current.y;
                const tentativeG = current.g + (isDiagonal ? 1.414 : 1);

                const inOpenSet = openSet.includes(neighbor);

                if (!inOpenSet || tentativeG < neighbor.g) {
                    neighbor.parent = current;
                    neighbor.g = tentativeG;
                    neighbor.h = this.heuristic(neighbor, endNode);
                    neighbor.f = neighbor.g + neighbor.h;

                    if (!inOpenSet) {
                        openSet.push(neighbor);
                    }
                }
            }
        }

        return null;
    }

    private resetGrid(): void {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const node = this.grid[y][x];
                node.g = 0;
                node.h = 0;
                node.f = 0;
                node.parent = null;
            }
        }
    }

    private heuristic(a: GridNode, b: GridNode): number {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    private getNeighbors(node: GridNode): GridNode[] {
        const neighbors: GridNode[] = [];
        const { x, y } = node;

        const dirs4 = [
            [0, -1], [1, 0], [0, 1], [-1, 0]
        ];

        const dirs8 = [
            [0, -1], [1, -1], [1, 0], [1, 1],
            [0, 1], [-1, 1], [-1, 0], [-1, -1]
        ];

        const dirs = this.allowDiagonal ? dirs8 : dirs4;

        for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.isInBounds(nx, ny)) {
                if (this.allowDiagonal && dx !== 0 && dy !== 0) {
                    if (!this.grid[y][nx].walkable || !this.grid[ny][x].walkable) {
                        continue;
                    }
                }
                neighbors.push(this.grid[ny][nx]);
            }
        }

        return neighbors;
    }

    private reconstructPath(endNode: GridNode): Vector2[] {
        const path: Vector2[] = [];
        let current: GridNode | null = endNode;

        while (current !== null) {
            path.unshift(new Vector2(current.x, current.y));
            current = current.parent;
        }

        return path;
    }

    getRandomWalkableTile(): Vector2 | null {
        const walkableTiles: Vector2[] = [];

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.grid[y][x].walkable) {
                    walkableTiles.push(new Vector2(x, y));
                }
            }
        }

        if (walkableTiles.length === 0) return null;
        return walkableTiles[Math.floor(Math.random() * walkableTiles.length)];
    }

    getWidth(): number {
        return this.width;
    }

    getHeight(): number {
        return this.height;
    }
}
