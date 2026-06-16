/** Core board geometry constants (world units). */

/** Size of one half-cell in world units. A tile spans 2 half-cells. */
export const HALF_CELL = 0.55;

/** Portrait tile face depth/width ratio (reference ~1.3:1). */
export const TILE_ASPECT_DEPTH = 1.3;

/** Visual tile footprint (slightly smaller than 2 half-cells for a gap). */
export const TILE_WIDTH = HALF_CELL * 2 * 0.76;
export const TILE_DEPTH = TILE_WIDTH * TILE_ASPECT_DEPTH;
export const TILE_THICKNESS = 0.26;

/** Vertical offset added per stacked layer. */
export const LAYER_HEIGHT = TILE_THICKNESS * 0.92;

/** Rounded tile corner radius as a fraction of TILE_WIDTH. */
export const TILE_CORNER_RADIUS = TILE_WIDTH * 0.16;

/** Gap fraction between neighbouring tiles. Small but enough to keep a thin tile's
 *  raised body from occluding the face of the tile behind it at the camera tilt. */
export const TILE_GAP = 0.1;

/** Per-axis half-cell world step so neighbouring tiles sit flush (a tile spans 2 half-cells). */
export const CELL_HALF_X = (TILE_WIDTH * (1 + TILE_GAP)) / 2;
export const CELL_HALF_Z = (TILE_DEPTH * (1 + TILE_GAP)) / 2;

/** Symbol plane size relative to the tile top face. */
export const SYMBOL_SCALE = 1.0;

/** Tile face texture resolution (pixels), portrait to match TILE_ASPECT_DEPTH. */
export const SYMBOL_TEXTURE_WIDTH = 224;
export const SYMBOL_TEXTURE_HEIGHT = 291;

/** Maximum distinct tile faces (see data/tileSet.ts). */
export const FACE_COUNT = 42;

/** Free hints granted per level (extra hints will be purchasable later). */
export const HINTS_PER_LEVEL = 1;

/** Maximum tiles the top tray can hold; reaching this many distinct tiles ends the game. */
export const TRAY_CAPACITY = 4;
