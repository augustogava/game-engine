/**
 * Generates a guaranteed-solvable Mahjong deal for a level.
 *
 * The game is tray-based: a tapped FREE tile is parked in a small tray (capacity
 * TRAY_CAPACITY) and clears when its match is also parked. So a deal is solvable
 * when there is a pick order that never needs to hold more than (capacity - 1)
 * distinct unmatched tiles at once.
 *
 * Board shapes are procedural mounds like the reference game: an irregular base
 * blob (optionally with a detached island and punched holes) topped by smaller
 * half-offset clusters. A shape is only accepted when a single-tile reverse
 * "peel" order exists (each tile free once the ones before it are gone); faces
 * are then assigned along that order keeping the open (held) set bounded below
 * the tray capacity, so the board is always solvable — there is always a next
 * free tile to play.
 */
import {
    BASE_MAX_COLS, BASE_MAX_ROWS, getCloseProbability, getHiddenFraction, getLevelLayout, getLevelShape,
} from '../constants/levelConstants.js';
import { buildPairFaceIds } from '../data/tileSet.js';
import { TRAY_CAPACITY } from '../constants/gameConstants.js';
import type { SlotPosition } from '../types/index.js';

const MAX_GENERATION_ATTEMPTS = 40;

/** Minimum tiles for a generated shape to be accepted. */
const MIN_TILES = 12;

/** Fraction of the target placed on the base layer. */
const BASE_LAYER_FRACTION = 0.5;

/** Each upper layer holds at most this fraction of the layer below. */
const UPPER_LAYER_FRACTION = 0.62;

/** Fraction of the base quota granted to a detached island. */
const ISLAND_QUOTA_FRACTION = 0.2;

/** Chance an upper-layer tile is grown next to an already placed one (clustered look). */
const UPPER_CLUSTER_BIAS = 0.8;

/** Max interior holes punched into the base blob. */
const MAX_BASE_HOLES = 2;

/** Max distinct tiles the intended solution holds at once (one below capacity so
 *  the planned path never overflows the tray). */
const MAX_OPEN = Math.max(1, TRAY_CAPACITY - 1);

export interface GeneratedLevel {
    slots: SlotPosition[];
    faceByIndex: number[];
    /** Tiles dealt face-down (green back, flip on tap to reveal). */
    hiddenByIndex: boolean[];
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

/** Classic square pyramid — fallback shape when dynamic generation fails. */
function buildPyramidSlots(level: number): SlotPosition[] {
    const { width, height, layers } = getLevelLayout(level);
    const slots: SlotPosition[] = [];
    for (let layer = 0; layer < layers; layer++) {
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
    if (slots.length % 2 !== 0) slots.shift();
    return slots;
}

/** Grows a 4-connected blob of base cells from a seed via a random frontier. */
function growCluster(
    cells: Set<string>,
    seedCol: number,
    seedRow: number,
    quota: number,
    rng: () => number,
    isAllowed: (col: number, row: number) => boolean,
): number {
    const frontier: Array<[number, number]> = [[seedCol, seedRow]];
    let added = 0;
    while (added < quota && frontier.length > 0) {
        const idx = Math.floor(rng() * frontier.length);
        const [col, row] = frontier.splice(idx, 1)[0];
        const key = `${col},${row}`;
        if (cells.has(key) || !isAllowed(col, row)) continue;
        cells.add(key);
        added++;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nc = col + dc;
            const nr = row + dr;
            if (nc >= 0 && nr >= 0 && nc < BASE_MAX_COLS && nr < BASE_MAX_ROWS && !cells.has(`${nc},${nr}`)) {
                frontier.push([nc, nr]);
            }
        }
    }
    return added;
}

/** Punches up to MAX_BASE_HOLES interior holes so the blob is not a solid slab. */
function punchHoles(cells: Set<string>, rng: () => number): void {
    const holes = Math.floor(rng() * (MAX_BASE_HOLES + 1));
    if (holes === 0) return;
    const interior = [...cells].filter((key) => {
        const [col, row] = key.split(',').map(Number);
        return cells.has(`${col + 1},${row}`) && cells.has(`${col - 1},${row}`) &&
            cells.has(`${col},${row + 1}`) && cells.has(`${col},${row - 1}`);
    });
    for (let i = 0; i < holes && interior.length > 0; i++) {
        const idx = Math.floor(rng() * interior.length);
        cells.delete(interior.splice(idx, 1)[0]);
    }
}

/** Builds the irregular base layer (tile grid, optionally with a detached island). */
function growBaseLayer(quota: number, islandChance: number, rng: () => number): SlotPosition[] {
    const capped = Math.min(quota, BASE_MAX_COLS * BASE_MAX_ROWS - 4);
    const cells = new Set<string>();

    const withIsland = rng() < islandChance && capped >= 16;
    const islandQuota = withIsland ? Math.max(4, Math.round(capped * ISLAND_QUOTA_FRACTION)) : 0;
    const mainQuota = capped - islandQuota;

    const seedCol = Math.floor(BASE_MAX_COLS / 2 + (rng() - 0.5) * 2);
    const seedRow = Math.floor(BASE_MAX_ROWS / 2 + (rng() - 0.5) * 2);
    growCluster(cells, seedCol, seedRow, mainQuota, rng, () => true);

    if (withIsland) {
        // Seed the island in the corner farthest from the main blob's centroid,
        // and keep a >= 2-cell gap so it reads as detached.
        let sumC = 0;
        let sumR = 0;
        for (const key of cells) {
            const [c, r] = key.split(',').map(Number);
            sumC += c; sumR += r;
        }
        const cC = sumC / Math.max(1, cells.size);
        const cR = sumR / Math.max(1, cells.size);
        const cornerCol = cC < BASE_MAX_COLS / 2 ? BASE_MAX_COLS - 1 : 0;
        const cornerRow = cR < BASE_MAX_ROWS / 2 ? BASE_MAX_ROWS - 1 : 0;
        const mainCells = new Set(cells);
        const farFromMain = (col: number, row: number): boolean => {
            for (const key of mainCells) {
                const [c, r] = key.split(',').map(Number);
                if (Math.abs(c - col) <= 1 && Math.abs(r - row) <= 1) return false;
            }
            return true;
        };
        growCluster(cells, cornerCol, cornerRow, islandQuota, rng, farFromMain);
    }

    punchHoles(cells, rng);

    const slots: SlotPosition[] = [];
    for (const key of cells) {
        const [col, row] = key.split(',').map(Number);
        slots.push({ gx: col * 2, gy: row * 2, layer: 0 });
    }
    return slots;
}

/**
 * Places up to `quota` tiles on `layer`, each fully supported by the layer
 * below (all 4 half-cells covered). Any half-cell offset is allowed, so upper
 * tiles straddle the ones beneath like the reference mounds.
 */
function growUpperLayer(below: SlotPosition[], layer: number, quota: number, rng: () => number): SlotPosition[] {
    const support = new Set<string>();
    let minGx = Infinity;
    let maxGx = -Infinity;
    let minGy = Infinity;
    let maxGy = -Infinity;
    for (const s of below) {
        for (const dx of [0, 1]) for (const dy of [0, 1]) support.add(`${s.gx + dx},${s.gy + dy}`);
        minGx = Math.min(minGx, s.gx); maxGx = Math.max(maxGx, s.gx);
        minGy = Math.min(minGy, s.gy); maxGy = Math.max(maxGy, s.gy);
    }
    const supported = (gx: number, gy: number): boolean =>
        support.has(`${gx},${gy}`) && support.has(`${gx + 1},${gy}`) &&
        support.has(`${gx},${gy + 1}`) && support.has(`${gx + 1},${gy + 1}`);

    const candidates: Array<[number, number]> = [];
    for (let gx = minGx; gx <= maxGx + 1; gx++) {
        for (let gy = minGy; gy <= maxGy + 1; gy++) {
            if (supported(gx, gy)) candidates.push([gx, gy]);
        }
    }

    const placed: SlotPosition[] = [];
    const overlapsPlaced = (gx: number, gy: number): boolean =>
        placed.some((p) => Math.abs(p.gx - gx) < 2 && Math.abs(p.gy - gy) < 2);
    const nearPlaced = (gx: number, gy: number): boolean =>
        placed.some((p) => Math.abs(p.gx - gx) <= 2 && Math.abs(p.gy - gy) <= 2);

    while (placed.length < quota && candidates.length > 0) {
        let pool = candidates;
        if (placed.length > 0 && rng() < UPPER_CLUSTER_BIAS) {
            const adjacent = candidates.filter(([gx, gy]) => nearPlaced(gx, gy) && !overlapsPlaced(gx, gy));
            if (adjacent.length > 0) pool = adjacent;
        }
        const pick = pool[Math.floor(rng() * pool.length)];
        candidates.splice(candidates.indexOf(pick), 1);
        if (overlapsPlaced(pick[0], pick[1])) continue;
        placed.push({ gx: pick[0], gy: pick[1], layer });
    }
    return placed;
}

/** Builds a full dynamic mound shape for the level (uneven counts are trimmed later). */
function buildDynamicSlots(level: number, rng: () => number): SlotPosition[] {
    const shape = getLevelShape(level);
    const baseQuota = Math.max(MIN_TILES / 2, Math.round(shape.tileTarget * BASE_LAYER_FRACTION));
    const slots = growBaseLayer(baseQuota, shape.islandChance, rng);

    let remaining = shape.tileTarget - slots.length;
    let below = slots.slice();
    for (let layer = 1; layer < shape.maxLayers && remaining > 0; layer++) {
        const quota = Math.min(remaining, Math.max(2, Math.round(below.length * UPPER_LAYER_FRACTION)));
        const placed = growUpperLayer(below, layer, quota, rng);
        if (placed.length === 0) break;
        slots.push(...placed);
        remaining -= placed.length;
        below = placed;
    }

    if (slots.length % 2 !== 0) {
        // Trim one tile from the topmost layer (never a supporting base tile).
        const topLayer = Math.max(...slots.map((s) => s.layer));
        const idx = slots.findIndex((s) => s.layer === topLayer);
        slots.splice(idx, 1);
    }
    return slots;
}

/**
 * Single-tile reverse peel: returns a removal order where `order[k]` is free once
 * `order[0..k-1]` are removed. Returns null when a stall leaves blocked tiles.
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
 * `initialOpenFaces` seeds the held set (used when reshuffling with tiles parked
 * in the tray, so those tiles keep valid partners on the board).
 */
function assignFaces(
    slots: SlotPosition[],
    order: number[],
    rng: () => number,
    closeProbability: number,
    initialOpenFaces: number[] = [],
): GeneratedLevel {
    const total = slots.length;
    const pairCount = Math.ceil((total - initialOpenFaces.length) / 2);
    const pairFaces = buildPairFaceIds(Math.max(1, pairCount), rng);
    const faceByIndex = new Array<number>(total).fill(-1);
    const openFaces: number[] = [...initialOpenFaces];
    const openSlots: number[] = initialOpenFaces.map(() => -1);
    const solution: Array<[number, number]> = [];
    let pairPtr = 0;

    for (let step = 0; step < order.length; step++) {
        const idx = order[step];
        const remaining = total - step;
        const open = openFaces.length;
        const canOpen = remaining - open >= 2 && open < MAX_OPEN && pairPtr < pairFaces.length;
        const mustClose = open === remaining;

        let close: boolean;
        if (open === 0) {
            close = false;
        } else if (mustClose || !canOpen) {
            close = true;
        } else {
            close = rng() < closeProbability;
        }

        if (close) {
            const pickAt = Math.floor(rng() * openFaces.length);
            const face = openFaces.splice(pickAt, 1)[0];
            const partner = openSlots.splice(pickAt, 1)[0];
            faceByIndex[idx] = face;
            if (partner >= 0) solution.push([partner, idx]);
        } else {
            const face = pairFaces[pairPtr++];
            faceByIndex[idx] = face;
            openFaces.push(face);
            openSlots.push(idx);
        }
    }
    return { slots, faceByIndex, hiddenByIndex: slots.map(() => false), solution };
}

/** Marks a level-scaled random fraction of tiles as face-down (flip tiles).
 *  Faces and pairs are untouched, so solvability is unaffected. */
function assignHiddenTiles(level: GeneratedLevel, hiddenFraction: number, rng: () => number): void {
    const total = level.slots.length;
    const count = Math.floor(total * hiddenFraction);
    if (count <= 0) return;
    const indices = level.slots.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let k = 0; k < count; k++) level.hiddenByIndex[indices[k]] = true;
}

export class LayoutSystem {
    /** Generates a solvable (tray-clearable) level with a dynamic mound shape. */
    generate(level: number): GeneratedLevel {
        const closeProbability = getCloseProbability(level);
        for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
            const slots = buildDynamicSlots(level, Math.random);
            if (slots.length < MIN_TILES) continue;
            const order = peelOrder(slots, Math.random);
            if (order) {
                const generated = assignFaces(slots, order, Math.random, closeProbability);
                assignHiddenTiles(generated, getHiddenFraction(level), Math.random);
                return generated;
            }
        }

        console.warn('[LayoutSystem] Dynamic generation failed, falling back to pyramid.');
        const slots = buildPyramidSlots(level);
        let order: number[] | null = null;
        for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS && !order; attempt++) {
            order = peelOrder(slots, Math.random);
        }
        if (!order) order = slots.map((_, i) => i);
        const generated = assignFaces(slots, order, Math.random, closeProbability);
        assignHiddenTiles(generated, getHiddenFraction(level), Math.random);
        return generated;
    }

    /**
     * Reassigns faces for the tiles still on the board so the deal stays
     * solvable, honoring faces currently parked in the tray (they get partners
     * on the board). Returns the new face per slot index, or null on failure.
     */
    reshuffleFaces(slots: SlotPosition[], trayFaces: number[], level: number): number[] | null {
        if (slots.length === 0) return null;
        const closeProbability = getCloseProbability(level);
        for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
            const order = peelOrder(slots, Math.random);
            if (!order) continue;
            const generated = assignFaces(slots, order, Math.random, closeProbability, trayFaces);
            return generated.faceByIndex;
        }
        return null;
    }
}
