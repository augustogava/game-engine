/**
 * Difficulty scaling for the tray mechanic. Boards stay small and roughly
 * constant in tile count (~36-72 tiles); difficulty comes from layout shape and
 * stacked layers (vertical pressure) rather than an ever-growing footprint.
 */

export const BASE_WIDTH = 6;
export const BASE_HEIGHT = 6;
export const BASE_LAYERS = 1;

/** Footprint growth per level beyond level 1 (slow, to keep boards screen-sized). */
export const WIDTH_GROWTH_PER_LEVEL = 0.12;
export const HEIGHT_GROWTH_PER_LEVEL = 0.06;

/** A new stacked layer is added every N levels (raises difficulty without widening). */
export const LEVELS_PER_NEW_LAYER = 4;

/** Hard ceilings to keep boards small and screen-friendly (~36-68 tiles). */
export const MAX_WIDTH = 7;
export const MAX_HEIGHT = 6;
export const MAX_LAYERS = 3;

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
