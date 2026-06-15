/**
 * Infinite difficulty scaling. Level 1 is small and easy; every level widens the
 * footprint and (periodically) adds a stacked layer, growing without bound.
 */

export const BASE_WIDTH = 6;
export const BASE_HEIGHT = 5;
export const BASE_LAYERS = 1;

/** Footprint growth per level beyond level 1. */
export const WIDTH_GROWTH_PER_LEVEL = 0.8;
export const HEIGHT_GROWTH_PER_LEVEL = 0.6;

/** A new stacked layer is added every N levels. */
export const LEVELS_PER_NEW_LAYER = 3;

/** Hard ceilings to keep a single level renderable/playable. */
export const MAX_WIDTH = 40;
export const MAX_HEIGHT = 30;
export const MAX_LAYERS = 8;

export interface LevelLayout {
    width: number;
    height: number;
    layers: number;
}

/** Computes the pyramid dimensions for a given level (1-based). */
export function getLevelLayout(level: number): LevelLayout {
    const extra = Math.max(0, level - 1);
    const width = Math.min(MAX_WIDTH, BASE_WIDTH + Math.ceil(extra * WIDTH_GROWTH_PER_LEVEL));
    const height = Math.min(MAX_HEIGHT, BASE_HEIGHT + Math.floor(extra * HEIGHT_GROWTH_PER_LEVEL));
    const layerCap = Math.max(1, Math.floor(Math.min(width, height) / 2));
    const layers = Math.min(MAX_LAYERS, layerCap, BASE_LAYERS + Math.floor(extra / LEVELS_PER_NEW_LAYER));
    return { width, height, layers };
}
