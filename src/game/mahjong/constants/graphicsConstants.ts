/** Rendering / effect tuning constants. */

export const TILE_BASE_COLOR = '#f3f6fa';
export const TILE_SIDE_COLOR = '#e3e9f0';
export const TILE_BLOCKED_TINT = 0.62;

/** Glass/gloss tuning for the tile body material. */
export const TILE_SPECULAR_POWER = 44;

/** Teal radial background gradient (matches the reference). */
export const BG_TEAL_CENTER = '#236050';
export const BG_TEAL_EDGE = '#06160f';

export const HOVER_HIGHLIGHT_COLOR = '#ffd97a';
export const SELECT_HIGHLIGHT_COLOR = '#ffae34';
export const HINT_HIGHLIGHT_COLOR = '#67e0a3';

export const GROUND_COLOR = '#0a201b';
export const GLOW_INTENSITY = 0.7;

export const BLOOM_THRESHOLD = 0.95;
export const BLOOM_WEIGHT = 0.45;
export const BLOOM_KERNEL = 48;
export const VIGNETTE_WEIGHT = 2.4;

export const MATCH_PARTICLE_COUNT = 60;
export const MATCH_PARTICLE_LIFETIME = 0.65;

/** Base URL for the generated decorative tile-face art (flowers / seasons). */
export const MAHJONG_FACE_ART_BASE_URL = 'src/game/assets/textures/mahjong/';

/** Cache-busting version for the face art PNGs (bump when the art changes;
 *  the server marks images as immutable so stale files stick otherwise). */
export const MAHJONG_FACE_ART_VERSION = 2;
