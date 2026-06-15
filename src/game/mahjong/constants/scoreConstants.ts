/**
 * Points + IQ scoring model. Points accumulate across games; IQ is a reference
 * value derived from how fast (vs. par) the player cleared the board at a level.
 */

/** Par time budget granted per tile (seconds). */
export const SECONDS_PER_TILE = 2.8;

/** Base points awarded for clearing a level (multiplied by level and speed). */
export const BASE_POINTS_PER_LEVEL = 250;

/** Clamp on the speed ratio (par / actual). >1 = faster than par. */
export const SPEED_RATIO_MIN = 0.25;
export const SPEED_RATIO_MAX = 3;

/** IQ formula coefficients. */
export const IQ_BASE = 100;
export const IQ_LEVEL_WEIGHT = 3.5;
export const IQ_SPEED_WEIGHT = 22;
export const IQ_MIN = 60;
export const IQ_MAX = 200;

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

export function computeIq(level: number, tiles: number, timeMs: number): number {
    const speedRatio = computeSpeedRatio(tiles, timeMs);
    const raw = IQ_BASE + IQ_LEVEL_WEIGHT * (level - 1) + IQ_SPEED_WEIGHT * (speedRatio - 1);
    return Math.round(clamp(raw, IQ_MIN, IQ_MAX));
}
