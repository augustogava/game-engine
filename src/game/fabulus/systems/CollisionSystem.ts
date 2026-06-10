import type { FabulusScene } from '../FabulusScene.js';
import { ENEMY_STATE } from '../types/index.js';
import { ENEMY_COLLIDER_RADIUS, MAP_BORDER_MARGIN, MAP_HALF, PLAYER_COLLIDER_RADIUS } from '../constants/index.js';

const BOUND = MAP_HALF - MAP_BORDER_MARGIN;
const GRID_CELL_SIZE = Math.max(2, ENEMY_COLLIDER_RADIUS * 4);

export class CollisionSystem {
    private scene: FabulusScene;
    private grid: Map<number, number[]> = new Map();

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    private _cellKey(x: number, z: number): number {
        const cx = Math.floor((x + MAP_HALF) / GRID_CELL_SIZE);
        const cz = Math.floor((z + MAP_HALF) / GRID_CELL_SIZE);
        return cx * 4096 + cz;
    }

    update(_dt: number): void {
        const playerRoot = this.scene.playerRoot;
        if (playerRoot) {
            this._resolveStatics(playerRoot.position, PLAYER_COLLIDER_RADIUS);
            this._clampBounds(playerRoot.position, PLAYER_COLLIDER_RADIUS);
        }

        const alive = this.scene.enemies.filter(e => e.state !== ENEMY_STATE.DEAD && e.root);
        for (const enemy of alive) {
            this._resolveStatics(enemy.root.position, enemy.colliderRadius);
            this._clampBounds(enemy.root.position, enemy.colliderRadius);
        }

        if (playerRoot) {
            for (const enemy of alive) {
                this._separateCircles(playerRoot.position, PLAYER_COLLIDER_RADIUS, enemy.root.position, enemy.colliderRadius, 0.35);
            }
        }

        this.grid.clear();
        for (let i = 0; i < alive.length; i++) {
            const pos = alive[i].root.position;
            const key = this._cellKey(pos.x, pos.z);
            const bucket = this.grid.get(key);
            if (bucket) bucket.push(i);
            else this.grid.set(key, [i]);
        }

        const cellSpan = GRID_CELL_SIZE;
        for (let i = 0; i < alive.length; i++) {
            const pos = alive[i].root.position;
            for (let ox = -1; ox <= 1; ox++) {
                for (let oz = -1; oz <= 1; oz++) {
                    const key = this._cellKey(pos.x + ox * cellSpan, pos.z + oz * cellSpan);
                    const bucket = this.grid.get(key);
                    if (!bucket) continue;
                    for (const j of bucket) {
                        if (j <= i) continue;
                        this._separateCircles(alive[i].root.position, ENEMY_COLLIDER_RADIUS, alive[j].root.position, ENEMY_COLLIDER_RADIUS, 0.5);
                    }
                }
            }
        }
    }

    private _resolveStatics(pos: { x: number; z: number }, radius: number): void {
        for (const box of this.scene.staticColliders) {
            const closestX = Math.max(box.minX, Math.min(pos.x, box.maxX));
            const closestZ = Math.max(box.minZ, Math.min(pos.z, box.maxZ));
            const dx = pos.x - closestX;
            const dz = pos.z - closestZ;
            const distSq = dx * dx + dz * dz;
            if (distSq >= radius * radius) continue;
            const dist = Math.sqrt(distSq);
            if (dist > 0.0001) {
                const push = (radius - dist) / dist;
                pos.x += dx * push;
                pos.z += dz * push;
            } else {
                const leftPen = pos.x - box.minX + radius;
                const rightPen = box.maxX - pos.x + radius;
                const downPen = pos.z - box.minZ + radius;
                const upPen = box.maxZ - pos.z + radius;
                const minPen = Math.min(leftPen, rightPen, downPen, upPen);
                if (minPen === leftPen) pos.x = box.minX - radius;
                else if (minPen === rightPen) pos.x = box.maxX + radius;
                else if (minPen === downPen) pos.z = box.minZ - radius;
                else pos.z = box.maxZ + radius;
            }
        }
    }

    private _separateCircles(
        a: { x: number; z: number }, ra: number,
        b: { x: number; z: number }, rb: number,
        bShare: number,
    ): void {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const minDist = ra + rb;
        const distSq = dx * dx + dz * dz;
        if (distSq >= minDist * minDist || distSq < 0.000001) return;
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        const aShare = 1 - bShare;
        a.x -= nx * overlap * aShare;
        a.z -= nz * overlap * aShare;
        b.x += nx * overlap * bShare;
        b.z += nz * overlap * bShare;
    }

    private _clampBounds(pos: { x: number; z: number }, radius: number): void {
        const limit = BOUND - radius;
        if (pos.x > limit) pos.x = limit;
        else if (pos.x < -limit) pos.x = -limit;
        if (pos.z > limit) pos.z = limit;
        else if (pos.z < -limit) pos.z = -limit;
    }
}
