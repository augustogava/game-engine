/** Core board geometry constants (world units). */

/** Size of one half-cell in world units. A tile spans 2 half-cells. */
export const HALF_CELL = 0.55;

/** Visual tile footprint (slightly smaller than 2 half-cells for a gap). */
export const TILE_WIDTH = HALF_CELL * 2 * 0.94;
export const TILE_DEPTH = HALF_CELL * 2 * 0.94;
export const TILE_THICKNESS = 0.42;

/** Vertical offset added per stacked layer. */
export const LAYER_HEIGHT = TILE_THICKNESS * 0.92;

/** Symbol plane size relative to the tile top face. */
export const SYMBOL_SCALE = 0.82;

/** Tile face texture resolution (pixels). */
export const SYMBOL_TEXTURE_SIZE = 256;

/** Maximum distinct tile faces (see data/tileSet.ts). */
export const FACE_COUNT = 42;

/** Free hints granted per level (extra hints will be purchasable later). */
export const HINTS_PER_LEVEL = 1;
