import type { FabulusScene } from '../FabulusScene.js';
import { DROP_KIND, ENEMY_STATE } from '../types/index.js';
import { MAP_HALF } from '../constants/index.js';
import { FabulusPrefs } from '../FabulusPrefs.js';

const MINIMAP_SIZE = 180;
const UPDATE_INTERVAL_S = 0.1;
const PLAYER_ARROW_SIZE = 6;
const ENEMY_DOT_R = 2.5;
const ELITE_DOT_R = 3.5;
const DROP_DOT_R = 2;

export class MinimapSystem {
    private scene: FabulusScene;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private accum = 0;
    private _onPrefsChange = (): void => this._applyVisibility();

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        const canvas = document.createElement('canvas');
        canvas.id = 'fab-minimap';
        canvas.width = MINIMAP_SIZE;
        canvas.height = MINIMAP_SIZE;
        canvas.style.cssText = [
            'position:fixed', 'top:12px', 'right:12px', `width:${MINIMAP_SIZE}px`, `height:${MINIMAP_SIZE}px`,
            'border:1px solid rgba(160,130,80,0.55)', 'border-radius:50%',
            'background:rgba(10,8,6,0.72)', 'z-index:30', 'pointer-events:none',
            'box-shadow:0 0 12px rgba(0,0,0,0.6)',
        ].join(';');
        document.body.appendChild(canvas);
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this._applyVisibility();
        FabulusPrefs.onChange(this._onPrefsChange);
    }

    toggle(): void {
        FabulusPrefs.set({ showMinimap: !FabulusPrefs.get().showMinimap });
    }

    private _applyVisibility(): void {
        if (this.canvas) this.canvas.style.display = FabulusPrefs.get().showMinimap ? 'block' : 'none';
    }

    update(dt: number): void {
        if (!this.ctx || !this.canvas || this.canvas.style.display === 'none') return;
        this.accum += dt;
        if (this.accum < UPDATE_INTERVAL_S) return;
        this.accum = 0;
        this._draw();
    }

    private _draw(): void {
        const ctx = this.ctx!;
        const size = MINIMAP_SIZE;
        const half = size / 2;
        const scale = half / (MAP_HALF + 2);
        const toMap = (x: number, z: number) => ({ mx: half + x * scale, my: half - z * scale });

        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.beginPath();
        ctx.arc(half, half, half - 1, 0, Math.PI * 2);
        ctx.clip();

        ctx.fillStyle = 'rgba(34,30,22,0.85)';
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = 'rgba(90,80,60,0.8)';
        for (const box of this.scene.staticColliders) {
            const a = toMap(box.minX, box.maxZ);
            const w = (box.maxX - box.minX) * scale;
            const h = (box.maxZ - box.minZ) * scale;
            ctx.fillRect(a.mx, a.my, Math.max(2, w), Math.max(2, h));
        }

        for (const drop of this.scene.groundDrops) {
            const p = toMap(drop.root.position.x, drop.root.position.z);
            if (drop.kind === DROP_KIND.GOLD) {
                ctx.fillStyle = '#d9a93c';
            } else {
                const rarity = drop.itemDef ? this.scene.getRarity(drop.itemDef.rarity_id) : null;
                ctx.fillStyle = rarity ? rarity.color_hex : '#bfb6a4';
            }
            ctx.beginPath();
            ctx.arc(p.mx, p.my, DROP_DOT_R, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const enemy of this.scene.enemies) {
            if (enemy.state === ENEMY_STATE.DEAD || !enemy.root) continue;
            const p = toMap(enemy.root.position.x, enemy.root.position.z);
            ctx.fillStyle = enemy.isElite ? '#f0c860' : '#c83a32';
            ctx.beginPath();
            ctx.arc(p.mx, p.my, enemy.isElite ? ELITE_DOT_R : ENEMY_DOT_R, 0, Math.PI * 2);
            ctx.fill();
        }

        const root = this.scene.playerRoot;
        if (root) {
            const p = toMap(root.position.x, root.position.z);
            const heading = root.rotation.y;
            ctx.save();
            ctx.translate(p.mx, p.my);
            ctx.rotate(heading);
            ctx.fillStyle = '#e8e2d2';
            ctx.beginPath();
            ctx.moveTo(0, -PLAYER_ARROW_SIZE);
            ctx.lineTo(PLAYER_ARROW_SIZE * 0.65, PLAYER_ARROW_SIZE);
            ctx.lineTo(0, PLAYER_ARROW_SIZE * 0.55);
            ctx.lineTo(-PLAYER_ARROW_SIZE * 0.65, PLAYER_ARROW_SIZE);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
        ctx.strokeStyle = 'rgba(160,130,80,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(half, half, half - 1, 0, Math.PI * 2);
        ctx.stroke();
    }

    dispose(): void {
        FabulusPrefs.offChange(this._onPrefsChange);
        if (this.canvas) { this.canvas.remove(); this.canvas = null; this.ctx = null; }
    }
}
