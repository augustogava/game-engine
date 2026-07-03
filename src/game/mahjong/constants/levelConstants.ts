/**
 * Dynamic board difficulty scaling. Every level is a procedurally grown mound:
 * an irregular base blob (optionally with a detached island) topped by smaller
 * half-offset clusters, like the reference game. Difficulty grows with tile
 * count, stack depth and scarcer early matches (see getCloseProbability).
 */

/** Approximate tiles on the easiest level. */
export const TILES_MIN = 36;

/** Extra tiles added per level. */
export const TILES_PER_LEVEL = 8;

/** Hard cap on tiles per board (keeps mobile boards readable). */
export const TILES_MAX = 144;

/** Stacked layer count range. */
export const LAYERS_MIN = 3;
export const LAYERS_MAX = 6;

/** Base blob bounds, in tiles (columns x rows). Wider than tall like the reference. */
export const BASE_MAX_COLS = 8;
export const BASE_MAX_ROWS = 7;

/** Chance to close an open pair vs opening a new one while assigning faces.
 *  Lower = matches resolve later = harder. Scales down with level. */
export const CLOSE_PROBABILITY_BASE = 0.55;
export const CLOSE_PROBABILITY_STEP = 0.015;
export const CLOSE_PROBABILITY_MIN = 0.35;

/** Detached-island chance range for the base layer. */
export const ISLAND_CHANCE_BASE = 0.15;
export const ISLAND_CHANCE_STEP = 0.05;
export const ISLAND_CHANCE_MAX = 0.6;

export interface LevelShape {
    /** Approximate total tiles (always evened by the generator). */
    tileTarget: number;
    /** Maximum stacked layers. */
    maxLayers: number;
    /** Probability the base layer grows a detached island. */
    islandChance: number;
}

export function getLevelShape(level: number): LevelShape {
    const extra = Math.max(0, level - 1);
    let tileTarget = Math.min(TILES_MAX, TILES_MIN + extra * TILES_PER_LEVEL);
    if (tileTarget % 2 !== 0) tileTarget--;
    const maxLayers = Math.min(LAYERS_MAX, LAYERS_MIN + Math.floor(extra / 2));
    const islandChance = Math.min(ISLAND_CHANCE_MAX, ISLAND_CHANCE_BASE + level * ISLAND_CHANCE_STEP);
    return { tileTarget, maxLayers, islandChance };
}

/** Pair-close probability for the level (lower on higher levels = harder). */
export function getCloseProbability(level: number): number {
    return Math.max(CLOSE_PROBABILITY_MIN, CLOSE_PROBABILITY_BASE - Math.max(0, level - 1) * CLOSE_PROBABILITY_STEP);
}

/** Face-down (flip-to-reveal) tile fraction range. */
export const HIDDEN_FRACTION_BASE = 0.08;
export const HIDDEN_FRACTION_STEP = 0.02;
export const HIDDEN_FRACTION_MAX = 0.3;

/** Fraction of tiles dealt face-down for the level (flip on tap to reveal). */
export function getHiddenFraction(level: number): number {
    return Math.min(HIDDEN_FRACTION_MAX, HIDDEN_FRACTION_BASE + Math.max(0, level - 1) * HIDDEN_FRACTION_STEP);
}

/** Square base edge (in tiles) for the fallback pyramid. */
export const PYRAMID_BASE_MIN = 5;
export const PYRAMID_BASE_MAX = 7;
export const LEVELS_PER_SIZE_UP = 3;

export interface LevelLayout {
    width: number;
    height: number;
    layers: number;
}

/**
 * Returns a square pyramid layout for the level (fallback shape when dynamic
 * generation cannot produce a peelable board).
 */
export function getLevelLayout(level: number): LevelLayout {
    const extra = Math.max(0, level - 1);
    const size = Math.min(PYRAMID_BASE_MAX, PYRAMID_BASE_MIN + Math.floor(extra / LEVELS_PER_SIZE_UP));
    return { width: size, height: size, layers: size };
}
