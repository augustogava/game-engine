/**
 * Top tray: collects tiles tapped from the board. A tapped tile flies here; when
 * two tiles in the tray match they clear instantly. If the tray fills with
 * TRAY_CAPACITY distinct (non-matching) tiles, the game is over.
 */
import type { MahjongScene } from '../MahjongScene.js';
import { facesMatch } from '../data/tileSet.js';
import { drawTileFace } from '../data/faceRenderer.js';
import { TRAY_CAPACITY, TILE_ASPECT_DEPTH } from '../constants/gameConstants.js';

const TILE_TEXTURE_WIDTH = 100;
const TILE_TEXTURE_HEIGHT = Math.round(TILE_TEXTURE_WIDTH * TILE_ASPECT_DEPTH);
const CLEAR_ANIM_MS = 240;

export type TrayAddResult = 'match' | 'added' | 'overflow';

interface TrayEntry {
    faceId: number;
    el: HTMLElement;
}

export class TraySystem {
    private game: MahjongScene;
    private container: HTMLElement | null = null;
    private entries: TrayEntry[] = [];

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        this.container = document.getElementById('mj-tray');
        if (!this.container) {
            console.warn('[TraySystem] Tray container #mj-tray not found');
        }
    }

    /**
     * Adds a tile to the tray. If it matches one already there, both clear
     * (returns 'match'). Otherwise it is parked; if that fills the tray with
     * TRAY_CAPACITY distinct tiles, returns 'overflow' (game over).
     */
    add(faceId: number): TrayAddResult {
        const entry: TrayEntry = { faceId, el: this.createTileEl(faceId) };
        this.entries.push(entry);
        if (this.container) this.container.appendChild(entry.el);

        const matchIndex = this.entries.findIndex((e) => e !== entry && facesMatch(e.faceId, faceId));
        if (matchIndex >= 0) {
            const matched = this.entries[matchIndex];
            this.removeEntry(matched);
            this.removeEntry(entry);
            return 'match';
        }

        if (this.entries.length >= TRAY_CAPACITY) {
            return 'overflow';
        }
        return 'added';
    }

    isEmpty(): boolean {
        return this.entries.length === 0;
    }

    count(): number {
        return this.entries.length;
    }

    clear(): void {
        for (const entry of this.entries) {
            try { entry.el.remove(); } catch (_) { /* ignore */ }
        }
        this.entries = [];
    }

    dispose(): void {
        this.clear();
    }

    private removeEntry(entry: TrayEntry): void {
        const idx = this.entries.indexOf(entry);
        if (idx >= 0) this.entries.splice(idx, 1);
        entry.el.classList.add('mj-tray-clear');
        window.setTimeout(() => {
            try { entry.el.remove(); } catch (_) { /* ignore */ }
        }, CLEAR_ANIM_MS);
    }

    private createTileEl(faceId: number): HTMLElement {
        const slot = document.createElement('div');
        slot.className = 'mj-tray-tile mj-tray-pop';
        const canvas = document.createElement('canvas');
        canvas.width = TILE_TEXTURE_WIDTH;
        canvas.height = TILE_TEXTURE_HEIGHT;
        const ctx = canvas.getContext('2d');
        if (ctx) drawTileFace(ctx, faceId, TILE_TEXTURE_WIDTH, TILE_TEXTURE_HEIGHT);
        slot.appendChild(canvas);
        return slot;
    }
}
