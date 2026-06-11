export const FAB_SKY_SHADER_VERTEX_URL = 'src/game/shaders/fabSky.vertex.fx';
export const FAB_SKY_SHADER_FRAGMENT_URL = 'src/game/shaders/fabSky.fragment.fx';
export const FAB_WATER_SHADER_VERTEX_URL = 'src/game/shaders/fabWater.vertex.fx';
export const FAB_WATER_SHADER_FRAGMENT_URL = 'src/game/shaders/fabWater.fragment.fx';

export const GROUND_ULTRA_TEXTURE_SIZE = 2048;
export const GROUND_ULTRA_NORMAL_SIZE = 1024;
export const GROUND_ULTRA_CLEARCOAT = 0.35;

// FabTerrainMaterial (terrain shader fork)
export const FAB_TERRAIN_MACRO_SCALE = 0.035;
export const FAB_TERRAIN_MACRO_STRENGTH = 0.16;
export const FAB_TERRAIN_SPLAT_EDGE_LOW = 0.2;
export const FAB_TERRAIN_SPLAT_EDGE_HIGH = 0.8;
export const FAB_TERRAIN_TRIPLANAR_TILE = 0.07;

// GrassSystem (GPU blades, thin instances)
export const GRASS_COUNT_MEDIUM = 4000;
export const GRASS_COUNT_HIGH = 8000;
export const GRASS_COUNT_ULTRA = 12000;
export const GRASS_BLADE_HEIGHT = 0.65;
export const GRASS_BLADE_WIDTH = 0.55;
export const GRASS_TEXTURE_SIZE = 256;
export const GRASS_MAX_SLOPE = 0.45;
export const GRASS_PATH_MASK_LIMIT = 0.22;
export const GRASS_POND_MARGIN = 1.5;
export const GRASS_MIN_SCALE = 0.65;
export const GRASS_MAX_SCALE = 1.35;
export const GRASS_SINK = 0.04;
export const GRASS_WIND_AMPLITUDE = 0.12;
export const GRASS_WIND_SPEED = 1.6;

// Tree wind (vertex sway plugin on fab_tree_template)
export const TREE_WIND_AMPLITUDE = 0.1;
export const TREE_WIND_SPEED = 0.9;
export const TREE_WIND_HEIGHT_REF = 9;

// Post FX (gated by gfxAdvancedVfx / gfxColorGrading)
export const POSTFX_DOF_FSTOP = 8;
export const POSTFX_DOF_FOCAL_LENGTH = 50;
export const POSTFX_MOTION_BLUR_STRENGTH = 0.5;
export const POSTFX_MOTION_BLUR_SAMPLES = 16;
export const POSTFX_SSR_STRENGTH = 0.5;
export const POSTFX_SSR_MAX_DISTANCE = 30;
export const PP_EXPOSURE_KHR = 1.1;
export const PP_CONTRAST_KHR = 1.38;
export const PP_CONTRAST_KHR_ULTRA = 1.5;

export const SKY_BOX_SIZE = 4000;
export const SKY_CLOUD_COVER = 0.42;
export const SKY_CLOUD_INTENSITY = 0.85;
export const SKY_CLOUD_SPEED = 0.015;
export const SKY_CLOUD_SCALE = 1.5;
export const SKY_CLOUD_COLOR_R = 0.62;
export const SKY_CLOUD_COLOR_G = 0.58;
export const SKY_CLOUD_COLOR_B = 0.7;
export const SKY_DAY_FACTOR = 0.28;

export const FAB_HEIGHT_FOG_SHADER_URL = 'src/game/shaders/fabHeightFog.fragment.fx';

export const ATMO_LAKE_MIST_HEIGHT = 0.45;
export const ATMO_LAKE_MIST_ALPHA = 0.22;
export const ATMO_LAKE_MIST_RADIUS_FACTOR = 2.2;
export const ATMO_FIREFLY_CAPACITY = 36;
export const ATMO_FIREFLY_EMIT_RATE = 7;
export const ATMO_DUST_CAPACITY = 24;
export const ATMO_DUST_EMIT_RATE = 6;
export const ATMO_DUST_RADIUS = 2.2;

export const ATMO_GODRAYS_EXPOSURE = 0.18;
export const ATMO_GODRAYS_DECAY = 0.962;
export const ATMO_GODRAYS_DENSITY = 0.92;
export const ATMO_GODRAYS_WEIGHT = 0.42;
export const ATMO_MIST_SIZE = 240;
export const ATMO_MIST_HEIGHT = 1.2;
export const ATMO_MIST_SCROLL = 0.012;

export const WATER_LEVEL = -0.05;
export const WATER_POOL_COUNT = 3;
export const WATER_LAVA_CHANCE = 0.34;

export const WEATHER_RAIN_RATE = 1800;
export const WEATHER_DUST_RATE = 60;
export const WEATHER_EMBER_RATE = 40;
export const WEATHER_AREA = 60;
