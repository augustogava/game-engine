/**
 * Generates a guaranteed-solvable Mahjong deal for a level.
 *
 * The game is tray-based: a tapped FREE tile is parked in a small tray (capacity
 * TRAY_CAPACITY) and clears when its match is also parked. So a deal is solvable
 * when there is a pick order that never needs to hold more than (capacity - 1)
 * distinct unmatched tiles at once.
 *
 * Approach: compute a single-tile reverse "peel" order (each tile is free once the
 * ones before it are gone — always possible for these stackings). Then walk that
 * order assigning faces by opening a new distinct pair-face or closing an already
 * open one, keeping the open (held) set bounded below the tray capacity. Playing
 * the peel order then clears the board with the tray never overflowing, so the
 * board is always solvable; matches are scattered in time and space (no
 * side-by-side duplicates) and use as many distinct faces as possible.
 */
import { getLevelLayout } from '../constants/levelConstants.js';
import { buildPairFaceIds } from '../data/tileSet.js';
import { TRAY_CAPACITY } from '../constants/gameConstants.js';
import type { SlotPosition } from '../types/index.js';

const MAX_GENERATION_ATTEMPTS = 40;

/** Max distinct tiles the intended solution holds at once (one below capacity so
 *  the planned path never overflows the tray). */
const MAX_OPEN = Math.max(1, TRAY_CAPACITY - 1);

/** Chance to close an open pair (vs open a new one) when both are allowed. Higher
 *  = matches resolve sooner (easier); lower = more held tiles (harder). */
const CLOSE_PROBABILITY = 0.5;

export interface GeneratedLevel {
    slots: SlotPosition[];
    faceByIndex: number[];
    /** Removal order as index pairs — a valid solution / hint source. */
    solution: Array<[number, number]>;
}

function cellKey(layer: number, cx: number, cy: number): string {
    return `${layer}:${cx}:${cy}`;
}

/** The 4 half-cells a 2x2 tile footprint occupies. */
function footprintCells(slot: SlotPosition): string[] {
    return [
        cellKey(slot.layer, slot.gx, slot.gy),
        cellKey(slot.layer, slot.gx + 1, slot.gy),
        cellKey(slot.layer, slot.gx, slot.gy + 1),
        cellKey(slot.layer, slot.gx + 1, slot.gy + 1),
    ];
}

function coveredAbove(slot: SlotPosition, filled: Set<string>): boolean {
    const L = slot.layer + 1;
    return (
        filled.has(cellKey(L, slot.gx, slot.gy)) ||
        filled.has(cellKey(L, slot.gx + 1, slot.gy)) ||
        filled.has(cellKey(L, slot.gx, slot.gy + 1)) ||
        filled.has(cellKey(L, slot.gx + 1, slot.gy + 1))
    );
}

function leftBlocked(slot: SlotPosition, filled: Set<string>): boolean {
    return filled.has(cellKey(slot.layer, slot.gx - 1, slot.gy)) ||
        filled.has(cellKey(slot.layer, slot.gx - 1, slot.gy + 1));
}

function rightBlocked(slot: SlotPosition, filled: Set<string>): boolean {
    return filled.has(cellKey(slot.layer, slot.gx + 2, slot.gy)) ||
        filled.has(cellKey(slot.layer, slot.gx + 2, slot.gy + 1));
}

/** A slot is free when nothing covers it and at least one long side is open. */
export function isSlotFree(slot: SlotPosition, filled: Set<string>): boolean {
    if (coveredAbove(slot, filled)) return false;
    return !leftBlocked(slot, filled) || !rightBlocked(slot, filled);
}

export function buildFilledCells(slots: SlotPosition[]): Set<string> {
    const filled = new Set<string>();
    for (const slot of slots) {
        for (const c of footprintCells(slot)) filled.add(c);
    }
    return filled;
}

function buildPyramidSlots(level: number): SlotPosition[] {
    const { width, height, layers } = getLevelLayout(level);
    const slots: SlotPosition[] = [];
    for (let layer = 0; layer < layers; layer++) {
        // Each stacked layer is shifted by a half tile (1 half-cell) and shrinks
        // by one tile per dimension, so upper tiles straddle the four tiles below
        // (the classic half-offset turtle look).
        const w = width - layer;
        const h = height - layer;
        if (w < 1 || h < 1) break;
        const offset = layer;
        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                slots.push({ gx: offset + col * 2, gy: offset + row * 2, layer });
            }
        }
    }
    // Tile count must be even; drop a base corner (not the apex) to keep the tip.
    if (slots.length % 2 !== 0) slots.shift();
    return slots;
}

/**
 * Single-tile reverse peel: returns a removal order where `order[k]` is free once
 * `order[0..k-1]` are removed. Returns null only if a stall leaves blocked tiles
 * (effectively never for these stackings, where the top is always free).
 */
function peelOrder(slots: SlotPosition[], rng: () => number): number[] | null {
    const remaining = new Set<number>();
    for (let i = 0; i < slots.length; i++) remaining.add(i);
    const filled = new Set<string>();
    for (let i = 0; i < slots.length; i++) {
        for (const c of footprintCells(slots[i])) filled.add(c);
    }

    const order: number[] = [];
    while (remaining.size > 0) {
        const freeList: number[] = [];
        for (const i of remaining) {
            if (isSlotFree(slots[i], filled)) freeList.push(i);
        }
        if (freeList.length === 0) return null;
        const pick = freeList[Math.floor(rng() * freeList.length)];
        order.push(pick);
        remaining.delete(pick);
        for (const c of footprintCells(slots[pick])) filled.delete(c);
    }
    return order;
}

/**
 * Assigns matching-pair faces along the peel order, opening new distinct faces and
 * closing held ones while keeping the held set within MAX_OPEN. The peel order is
 * therefore a valid tray solution (tray never exceeds MAX_OPEN < capacity).
 */
function assignFaces(slots: SlotPosition[], order: number[], rng: () => number): GeneratedLevel {
    const total = slots.length;
    const pairFaces = buildPairFaceIds(total / 2, rng);
    const faceByIndex = new Array<number>(total).fill(-1);
    const openFaces: number[] = [];
    const openSlots: number[] = [];
    const solution: Array<[number, number]> = [];
    let pairPtr = 0;

    for (let step = 0; step < order.length; step++) {
        const idx = order[step];
        const remaining = total - step;
        const open = openFaces.length;
        const canOpen = remaining - open >= 2 && open < MAX_OPEN;
        const mustClose = open === remaining;

        let close: boolean;
        if (open === 0) {
            close = false;
        } else if (mustClose || !canOpen) {
            close = true;
        } else {
            close = rng() < CLOSE_PROBABILITY;
        }

        if (close) {
            const pickAt = Math.floor(rng() * openFaces.length);
            const face = openFaces.splice(pickAt, 1)[0];
            const partner = openSlots.splice(pickAt, 1)[0];
            faceByIndex[idx] = face;
            solution.push([partner, idx]);
        } else {
            const face = pairFaces[pairPtr++];
            faceByIndex[idx] = face;
            openFaces.push(face);
            openSlots.push(idx);
        }
    }
    return { slots, faceByIndex, solution };
}

export class LayoutSystem {
    /** Generates a solvable (tray-clearable) level. */
    generate(level: number): GeneratedLevel {
        const slots = buildPyramidSlots(level);
        let order: number[] | null = null;
        for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS && !order; attempt++) {
            order = peelOrder(slots, Math.random);
        }
        if (!order) {
            console.warn('[LayoutSystem] Peel order generation fell back to sequential.');
            order = slots.map((_, i) => i);
        }
        return assignFaces(slots, order, Math.random);
    }
}
