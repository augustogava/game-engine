/** Core board geometry constants (world units). */

/** Size of one half-cell in world units. A tile spans 2 half-cells. */
export const HALF_CELL = 0.55;

/** Portrait tile face depth/width ratio (reference ~1.3:1). */
export const TILE_ASPECT_DEPTH = 1.3;

/** Visual tile footprint (slightly smaller than 2 half-cells for a gap). */
export const TILE_WIDTH = HALF_CELL * 2 * 0.76;
export const TILE_DEPTH = TILE_WIDTH * TILE_ASPECT_DEPTH;

/** Chunky body like the reference: thickness about one third of the width. */
export const TILE_THICKNESS = TILE_WIDTH * 0.34;

/** Vertical offset added per stacked layer (upper tiles rest exactly on top). */
export const LAYER_HEIGHT = TILE_THICKNESS;

/** Rounded tile corner radius as a fraction of TILE_WIDTH. */
export const TILE_CORNER_RADIUS = TILE_WIDTH * 0.18;

/** Gap fraction between neighbouring tiles. Near-zero so tiles pack flush like
 *  the reference game. */
export const TILE_GAP = 0.02;

/** Per-axis half-cell world step so neighbouring tiles sit flush (a tile spans 2 half-cells). */
export const CELL_HALF_X = (TILE_WIDTH * (1 + TILE_GAP)) / 2;
export const CELL_HALF_Z = (TILE_DEPTH * (1 + TILE_GAP)) / 2;

/** Symbol plane size relative to the tile top face. */
export const SYMBOL_SCALE = 1.0;

/** Tile face texture resolution (pixels), portrait to match TILE_ASPECT_DEPTH. */
export const SYMBOL_TEXTURE_WIDTH = 256;
export const SYMBOL_TEXTURE_HEIGHT = Math.round(SYMBOL_TEXTURE_WIDTH * TILE_ASPECT_DEPTH);

/** Maximum distinct tile faces (see data/tileSet.ts). */
export const FACE_COUNT = 42;

/** Free hints granted per level (extra hints will be purchasable later). */
export const HINTS_PER_LEVEL = 1;

/** Free shuffles granted per level (reassigns remaining faces, stays solvable). */
export const SHUFFLES_PER_LEVEL = 2;

/** Free undos granted per level (returns the last unmatched tray tile to the board). */
export const UNDOS_PER_LEVEL = 3;

/** Maximum tiles the top tray can hold; reaching this many distinct tiles ends the game. */
export const TRAY_CAPACITY = 4;
