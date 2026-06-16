/** Pointer picking: a tapped free tile is sent to the top tray. */
import type { MahjongScene } from '../MahjongScene.js';
import { facesMatch } from '../data/tileSet.js';
import { GAME_STATE } from '../types/index.js';

const TAP_MOVE_PX = 14;
const TAP_MAX_MS = 500;

export class TileInputSystem {
    private game: MahjongScene;
    private canvas: HTMLCanvasElement | null = null;
    private pointerDownX = 0;
    private pointerDownY = 0;
    private pointerDownMs = 0;
    private activePointerId: number | null = null;

    private onPointerDown = (e: PointerEvent): void => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        this.activePointerId = e.pointerId;
        this.pointerDownX = e.clientX;
        this.pointerDownY = e.clientY;
        this.pointerDownMs = performance.now();
    };

    private onPointerUp = (e: PointerEvent): void => {
        if (this.activePointerId !== e.pointerId) return;
        this.activePointerId = null;
        if (this.game.state !== GAME_STATE.PLAYING) return;

        const dx = e.clientX - this.pointerDownX;
        const dy = e.clientY - this.pointerDownY;
        const elapsed = performance.now() - this.pointerDownMs;
        if (Math.hypot(dx, dy) > TAP_MOVE_PX || elapsed > TAP_MAX_MS) return;

        this.onTapAt(e.clientX, e.clientY);
    };

    private onPointerCancel = (e: PointerEvent): void => {
        if (this.activePointerId === e.pointerId) this.activePointerId = null;
    };

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        const canvas = this.game.bjs.getEngine().getRenderingCanvas() as HTMLCanvasElement | null;
        if (!canvas) {
            console.warn('[TileInputSystem] Rendering canvas not found');
            return;
        }
        this.canvas = canvas;
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointerup', this.onPointerUp);
        canvas.addEventListener('pointercancel', this.onPointerCancel);
    }

    private onTapAt(clientX: number, clientY: number): void {
        const board = this.game.board;
        const id = board.pickTileIdAt(clientX, clientY);
        if (id === null) return;

        if (!board.isFree(id)) {
            this.game.audio.error();
            return;
        }

        const faceId = board.takeTile(id);
        if (faceId === null) return;

        this.game.handleTrayAdd(faceId);
    }

    /** Finds a matchable pair among free tiles. */
    findHint(): [number, number] | null {
        const board = this.game.board;
        const freeTiles = [...board.freeIds].map(id => board.getTile(id)).filter(Boolean) as Array<{ id: number; faceId: number }>;
        for (let i = 0; i < freeTiles.length; i++) {
            for (let j = i + 1; j < freeTiles.length; j++) {
                if (facesMatch(freeTiles[i].faceId, freeTiles[j].faceId)) {
                    return [freeTiles[i].id, freeTiles[j].id];
                }
            }
        }
        return null;
    }

    hasAvailableMove(): boolean {
        return this.findHint() !== null;
    }

    hint(): void {
        const pair = this.findHint();
        if (pair) {
            this.game.board.flashHint(pair);
        } else {
            this.game.notify('Sem jogadas disponíveis');
        }
    }

    dispose(): void {
        if (!this.canvas) return;
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
        this.canvas = null;
    }
}
