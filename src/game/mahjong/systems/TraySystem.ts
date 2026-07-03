/**
 * Top tray: collects tiles tapped from the board. A tapped tile flies from its
 * board position into the tray (DOM clone animation); when two tiles in the
 * tray match they clear. If the tray fills with TRAY_CAPACITY distinct
 * (non-matching) tiles, the game is over.
 */
import type { MahjongScene } from '../MahjongScene.js';
import type { TakenTileScreenInfo } from './BoardSystem.js';
import { facesMatch } from '../data/tileSet.js';
import { drawTileFace } from '../data/faceRenderer.js';
import { TRAY_CAPACITY, TILE_ASPECT_DEPTH } from '../constants/gameConstants.js';

const TILE_TEXTURE_WIDTH = 100;
const TILE_TEXTURE_HEIGHT = Math.round(TILE_TEXTURE_WIDTH * TILE_ASPECT_DEPTH);
const CLEAR_ANIM_MS = 240;
const FLY_ANIM_MS = 330;
const FLY_EASING = 'cubic-bezier(0.3, 0.7, 0.3, 1)';

export type TrayAddResult = 'match' | 'added' | 'overflow';

interface TrayEntry {
    faceId: number;
    el: HTMLElement;
}

export class TraySystem {
    private game: MahjongScene;
    private container: HTMLElement | null = null;
    private slots: HTMLElement[] = [];
    private entries: TrayEntry[] = [];
    private flyingClones: Set<HTMLElement> = new Set();
    /** Bumped on clear() so stale flight callbacks from a previous level are ignored. */
    private generation = 0;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        this.container = document.getElementById('mj-tray');
        if (!this.container) {
            console.warn('[TraySystem] Tray container #mj-tray not found');
            return;
        }
        for (let i = 0; i < TRAY_CAPACITY; i++) {
            const slot = document.createElement('div');
            slot.className = 'mj-tray-slot';
            this.container.appendChild(slot);
            this.slots.push(slot);
        }
    }

    /**
     * Adds a tile to the tray. If it matches one already there, both clear
     * (returns 'match'). Otherwise it is parked; if that fills the tray with
     * TRAY_CAPACITY distinct tiles, returns 'overflow' (game over).
     * When `origin` is given the tile visually flies from that screen position
     * into its tray slot; `onSettled` fires once the flight (if any) lands.
     */
    add(faceId: number, origin?: TakenTileScreenInfo | null, onSettled?: (result: TrayAddResult) => void): TrayAddResult {
        const entry: TrayEntry = { faceId, el: this.createTileEl(faceId) };
        const slotIndex = Math.min(this.entries.length, this.slots.length - 1);
        this.entries.push(entry);
        const slot = this.slots[slotIndex];
        if (slot) slot.appendChild(entry.el);
        else if (this.container) this.container.appendChild(entry.el);

        const matchIndex = this.entries.findIndex((e) => e !== entry && facesMatch(e.faceId, faceId));
        let result: TrayAddResult;
        let matched: TrayEntry | null = null;
        if (matchIndex >= 0) {
            matched = this.entries[matchIndex];
            this.entries.splice(this.entries.indexOf(matched), 1);
            this.entries.splice(this.entries.indexOf(entry), 1);
            result = 'match';
        } else if (this.entries.length >= TRAY_CAPACITY) {
            result = 'overflow';
        } else {
            result = 'added';
        }

        const settle = (): void => {
            if (matched) this.playClear(matched, entry);
            this.layout();
            if (onSettled) onSettled(result);
        };

        if (origin && this.container) {
            this.flyIn(entry, origin, settle);
        } else {
            entry.el.classList.add('mj-tray-pop');
            // Defer so the caller finishes preparing presentation state (combo, IQ gain).
            window.setTimeout(settle, 0);
        }
        return result;
    }

    /** Removes and returns the most recently parked faceId (undo), or null. */
    removeLast(): number | null {
        const entry = this.entries.pop();
        if (!entry) return null;
        entry.el.classList.add('mj-tray-clear');
        window.setTimeout(() => { try { entry.el.remove(); } catch (_) { /* ignore */ } }, CLEAR_ANIM_MS);
        this.updateDanger();
        return entry.faceId;
    }

    /** Compacts parked tiles into the leftmost slots and refreshes the danger pulse. */
    private layout(): void {
        for (let i = 0; i < this.entries.length; i++) {
            const slot = this.slots[i];
            const el = this.entries[i].el;
            if (slot && el.parentElement !== slot) slot.appendChild(el);
        }
        this.updateDanger();
    }

    /** Red pulsing warning when only one free slot remains. */
    private updateDanger(): void {
        if (!this.container) return;
        this.container.classList.toggle('mj-tray-danger', this.entries.length >= TRAY_CAPACITY - 1);
    }

    /** Face ids currently parked in the tray. */
    faces(): number[] {
        return this.entries.map((e) => e.faceId);
    }

    isEmpty(): boolean {
        return this.entries.length === 0;
    }

    count(): number {
        return this.entries.length;
    }

    clear(): void {
        this.generation++;
        for (const entry of this.entries) {
            try { entry.el.remove(); } catch (_) { /* ignore */ }
        }
        this.entries = [];
        for (const clone of this.flyingClones) {
            try { clone.remove(); } catch (_) { /* ignore */ }
        }
        this.flyingClones.clear();
        this.updateDanger();
    }

    dispose(): void {
        this.clear();
        for (const slot of this.slots) {
            try { slot.remove(); } catch (_) { /* ignore */ }
        }
        this.slots = [];
    }

    /** Animates a fixed-position clone from the board position into the docked slot. */
    private flyIn(entry: TrayEntry, origin: TakenTileScreenInfo, onLand: () => void): void {
        const gen = this.generation;
        const target = entry.el.getBoundingClientRect();
        if (target.width <= 0 || target.height <= 0) {
            entry.el.classList.add('mj-tray-pop');
            onLand();
            return;
        }
        entry.el.style.visibility = 'hidden';

        const clone = this.createTileEl(entry.faceId);
        clone.classList.add('mj-tray-fly');
        clone.style.width = `${origin.widthPx}px`;
        clone.style.height = `${origin.heightPx}px`;
        clone.style.left = `${origin.x - origin.widthPx / 2}px`;
        clone.style.top = `${origin.y - origin.heightPx / 2}px`;
        document.body.appendChild(clone);
        this.flyingClones.add(clone);

        const dx = (target.left + target.width / 2) - origin.x;
        const dy = (target.top + target.height / 2) - origin.y;
        const scaleX = target.width / origin.widthPx;
        const scaleY = target.height / origin.heightPx;

        const finish = (): void => {
            this.flyingClones.delete(clone);
            try { clone.remove(); } catch (_) { /* ignore */ }
            if (gen !== this.generation) return;
            entry.el.style.visibility = '';
            entry.el.classList.add('mj-tray-pop');
            onLand();
        };

        try {
            const anim = clone.animate([
                { transform: 'translate(0px, 0px) scale(1)' },
                { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})` },
            ], { duration: FLY_ANIM_MS, easing: FLY_EASING, fill: 'forwards' });
            anim.onfinish = finish;
            anim.oncancel = finish;
        } catch (err) {
            console.warn('[TraySystem] Fly animation failed, docking instantly:', err);
            finish();
        }
    }

    /** Plays the clear animation on a matched pair already removed from `entries`. */
    private playClear(a: TrayEntry, b: TrayEntry): void {
        for (const entry of [a, b]) {
            entry.el.style.visibility = '';
            entry.el.classList.add('mj-tray-clear');
            window.setTimeout(() => { try { entry.el.remove(); } catch (_) { /* ignore */ } }, CLEAR_ANIM_MS);
        }
    }

    private createTileEl(faceId: number): HTMLElement {
        const slot = document.createElement('div');
        slot.className = 'mj-tray-tile';
        const canvas = document.createElement('canvas');
        canvas.width = TILE_TEXTURE_WIDTH;
        canvas.height = TILE_TEXTURE_HEIGHT;
        const ctx = canvas.getContext('2d');
        if (ctx) drawTileFace(ctx, faceId, TILE_TEXTURE_WIDTH, TILE_TEXTURE_HEIGHT);
        slot.appendChild(canvas);
        return slot;
    }
}
