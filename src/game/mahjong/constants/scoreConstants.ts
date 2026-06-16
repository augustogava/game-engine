/**
 * Points + IQ scoring model. Points accumulate across games (awarded on win).
 * IQ is a live, per-game value that starts at 0 and grows with every matched
 * pair, scaled by the current level, how fast the player acted, and the combo.
 */

/** Par time budget granted per tile (seconds). */
export const SECONDS_PER_TILE = 2.8;

/** Base points awarded for clearing a level (multiplied by level and speed). */
export const BASE_POINTS_PER_LEVEL = 250;

/** Clamp on the speed ratio (par / actual). >1 = faster than par. */
export const SPEED_RATIO_MIN = 0.25;
export const SPEED_RATIO_MAX = 3;

/** Live IQ per-match gain coefficients. */
export const IQ_PER_MATCH_BASE = 2.5;
export const IQ_LEVEL_FACTOR = 0.02;
export const IQ_COMBO_FACTOR = 0.01;
export const IQ_SPEED_REF_MS = 1400;
export const IQ_SPEED_FLOOR_MS = 350;
export const IQ_SPEED_FACTOR_MIN = 0.6;
export const IQ_SPEED_FACTOR_MAX = 2;

/** Bounds for the final per-game IQ value (kept in sync with the server clamps). */
export const IQ_MIN = 40;
export const IQ_MAX = 250;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function computeSpeedRatio(tiles: number, timeMs: number): number {
    const parSeconds = tiles * SECONDS_PER_TILE;
    const actualSeconds = Math.max(1, timeMs / 1000);
    return clamp(parSeconds / actualSeconds, SPEED_RATIO_MIN, SPEED_RATIO_MAX);
}

export function computePoints(level: number, tiles: number, timeMs: number): number {
    const speedRatio = computeSpeedRatio(tiles, timeMs);
    return Math.round(BASE_POINTS_PER_LEVEL * level * speedRatio);
}

/**
 * IQ gained for a single matched pair. Faster matches, higher levels and longer
 * combos all increase the gain. Returned value is added to the live game IQ.
 */
export function computeIqGain(level: number, msSinceLastMatch: number, combo: number): number {
    const levelFactor = 1 + Math.max(0, level - 1) * IQ_LEVEL_FACTOR;
    const elapsed = Math.max(IQ_SPEED_FLOOR_MS, msSinceLastMatch);
    const speedFactor = clamp(IQ_SPEED_REF_MS / elapsed, IQ_SPEED_FACTOR_MIN, IQ_SPEED_FACTOR_MAX);
    const comboFactor = 1 + Math.max(0, combo) * IQ_COMBO_FACTOR;
    return IQ_PER_MATCH_BASE * levelFactor * speedFactor * comboFactor;
}

/** Clamps a final per-game IQ into the storable range and rounds to one decimal. */
export function finalizeIq(iq: number): number {
    return Math.round(clamp(iq, IQ_MIN, IQ_MAX) * 10) / 10;
}
