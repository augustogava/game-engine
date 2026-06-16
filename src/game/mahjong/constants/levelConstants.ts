/**
 * Pyramid difficulty scaling. Every level is a square pyramid that tapers with a
 * half-tile offset per layer up to a single tile at the apex (the classic turtle
 * look). Higher levels use a slightly larger base; boards stay small and
 * screen-friendly. Difficulty also comes from flush packing and high tile variety
 * (see gameConstants/tileSet), not only from size.
 */

/** Square base edge (in tiles) for the easiest level. */
export const PYRAMID_BASE_MIN = 5;

/** Largest square base edge (keeps the board small). */
export const PYRAMID_BASE_MAX = 7;

/** Levels between each base-size increase. */
export const LEVELS_PER_SIZE_UP = 3;

export interface LevelLayout {
    width: number;
    height: number;
    layers: number;
}

/**
 * Returns a square pyramid layout for the level: a `size` x `size` base with
 * `size` layers, so it always tapers to a single apex tile.
 */
export function getLevelLayout(level: number): LevelLayout {
    const extra = Math.max(0, level - 1);
    const size = Math.min(PYRAMID_BASE_MAX, PYRAMID_BASE_MIN + Math.floor(extra / LEVELS_PER_SIZE_UP));
    return { width: size, height: size, layers: size };
}
