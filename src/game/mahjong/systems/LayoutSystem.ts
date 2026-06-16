/**
 * Generates a guaranteed-solvable Mahjong deal for a level.
 *
 * Approach (reverse-removal): start with every slot filled, then repeatedly take
 * two currently-FREE slots, assign them a matching pair, and remove them. The
 * recorded removal order is itself a valid forward solution, so the resulting
 * full board is always solvable. Free-state logic here is reused at runtime.
 */
import { getLevelLayout } from '../constants/levelConstants.js';
import { buildPairFaceIds } from '../data/tileSet.js';
import type { SlotPosition } from '../types/index.js';

const MAX_GENERATION_ATTEMPTS = 40;

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

function attemptAssign(slots: SlotPosition[], rng: () => number): GeneratedLevel | null {
    const faceByIndex = new Array<number>(slots.length).fill(-1);
    const pairFaces = buildPairFaceIds(slots.length / 2, rng);
    const solution: Array<[number, number]> = [];

    const remaining = new Set<number>();
    for (let i = 0; i < slots.length; i++) remaining.add(i);
    const filled = new Set<string>();
    for (let i = 0; i < slots.length; i++) {
        for (const c of footprintCells(slots[i])) filled.add(c);
    }

    let pairPtr = 0;
    while (remaining.size > 0) {
        const freeList: number[] = [];
        for (const i of remaining) {
            if (isSlotFree(slots[i], filled)) freeList.push(i);
        }
        if (freeList.length < 2) return null;

        const ai = Math.floor(rng() * freeList.length);
        const a = freeList[ai];
        let bi = Math.floor(rng() * (freeList.length - 1));
        if (bi >= ai) bi++;
        const b = freeList[bi];

        const face = pairFaces[pairPtr++];
        faceByIndex[a] = face;
        faceByIndex[b] = face;
        solution.push([a, b]);

        for (const idx of [a, b]) {
            remaining.delete(idx);
            for (const c of footprintCells(slots[idx])) filled.delete(c);
        }
    }
    return { slots, faceByIndex, solution };
}

export class LayoutSystem {
    /** Generates a solvable level; retries with new randomization on rare stalls. */
    generate(level: number): GeneratedLevel {
        const slots = buildPyramidSlots(level);
        for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
            const result = attemptAssign(slots, Math.random);
            if (result) return result;
        }
        // Extremely unlikely fallback: assign sequential identical pairs.
        const faceByIndex = buildPairFaceIds(slots.length / 2, Math.random)
            .flatMap(f => [f, f]);
        const solution: Array<[number, number]> = [];
        for (let i = 0; i < slots.length; i += 2) solution.push([i, i + 1]);
        console.warn('[LayoutSystem] Solvable generation fell back after retries.');
        return { slots, faceByIndex, solution };
    }
}
