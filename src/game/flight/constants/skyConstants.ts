export const SUN_TEXTURE_PATH = 'src/game/assets/sun.png';
export const MOON_TEXTURE_PATH = 'src/game/assets/moon.png';
export const SUN_DIAMETER = 260;
export const SUN_HALO_SIZE = 2400;
export const SUN_DISTANCE = 10000;
export const SUN_ROTATION_RAD_PER_S = 0.02;
export const SUN_FADE_START_ELEV_DEG = 0;
export const SUN_FADE_END_ELEV_DEG = -5;
export const MOON_DIAMETER = 350;
export const MOON_HALO_SIZE = 800;
export const MOON_DISTANCE = 10000;
export const MOON_FADE_ELEV_DEG = 8;
export const MOON_HALO_FADE_BAND_DEG = 10;
export const MOON_HALO_FADE_OFFSET_DEG = 2;
export const SUN_HALO_TEX_SIZE = 256;
export const MOON_HALO_TEX_SIZE = 256;

export const SKY_LUMINANCE_MAX = 1.0;
export const SKY_MIE_G_LOW_HORIZON = 0.92;
export const SKY_MIE_G_HIGH_SUN = 0.78;
export const SKY_MIE_G_TRANSITION_DEG = 25;
export const NIGHT_HORIZON_GLOW_R = 0.03;
export const NIGHT_HORIZON_GLOW_G = 0.05;
export const NIGHT_HORIZON_GLOW_B = 0.12;
export const NIGHT_HORIZON_GLOW_FADE_BAND_DEG = 12;
export const NIGHT_HORIZON_GLOW_OFFSET_DEG = -5;

export const BRIGHT_STAR_COUNT = 25;
export const BRIGHT_STAR_BASE_SIZE = 110;
export const BRIGHT_STAR_SIZE_RANDOM = 70;
export const BRIGHT_STAR_TWINKLE_AMOUNT = 0.45;

export const HDR_ENV_NONE = 'none';
export const HDR_ENV_AUTO = 'auto';
export const HDR_ASSETS_PATH = 'src/game/assets/hdr/';
export const HDR_CUBE_SIZE = 256;
export const HDR_DEFAULT_ENV_URL = 'https://assets.babylonjs.com/environments/environmentSpecular.env';
export const HDR_ENV_DEFAULT = 'kloofendal_48d_partly_cloudy_puresky_4k.hdr';
export const HDR_SKYBOX_SIZE = 600_000;
export const HDR_SKYBOX_LEVEL = 0.8;

export const SEASCAPE_SKY_SHADER_VERTEX_URL = 'src/game/shaders/seascapeSky.vertex.fx';
export const SEASCAPE_SKY_SHADER_FRAGMENT_URL = 'src/game/shaders/seascapeSky.fragment.fx';
export const SEASCAPE_SKY_BOX_SIZE = 600_000;
export const SEASCAPE_SKY_DEFAULT_ENABLED = false;
export const SEASCAPE_SKY_DEFAULT_COVER = 0.35;
export const SEASCAPE_SKY_DEFAULT_INTENSITY = 1.0;
export const SEASCAPE_SKY_DEFAULT_SPEED = 0.06;
export const SEASCAPE_SKY_DEFAULT_SCALE = 3.02;
export const SEASCAPE_SKY_DEFAULT_COLOR_R = 0.94;
export const SEASCAPE_SKY_DEFAULT_COLOR_G = 0.80;
export const SEASCAPE_SKY_DEFAULT_COLOR_B = 0.48;
export const SEASCAPE_SKY_DEFAULT_COLOR_HEX = '#f0cb7a';
export const SEASCAPE_SKY_NIGHT_ZENITH_R = 0.02;
export const SEASCAPE_SKY_NIGHT_ZENITH_G = 0.03;
export const SEASCAPE_SKY_NIGHT_ZENITH_B = 0.08;
export const SEASCAPE_SKY_DAYFACTOR_OFFSET_DEG = 6;
export const SEASCAPE_SKY_DAYFACTOR_RANGE_DEG = 30;

export const HDR_AUTO_DAY_FILE   = 'drakensberg_solitary_mountain_puresky_4k.hdr';
export const HDR_AUTO_NIGHT_FILE = 'qwantani_moon_noon_puresky_4k.hdr';
export const HDR_AUTO_NIGHT_ELEVATION_DEG = -3;
export const HDR_AUTO_HYSTERESIS_DEG = 1.5;

export interface HdrOption {
    value: string;
    label: string;
}

export const HDR_OPTIONS: HdrOption[] = [
    { value: HDR_ENV_AUTO,                                   label: 'Auto (Day / Night)' },
    { value: HDR_ENV_NONE,                                   label: 'Procedural' },
    { value: 'kloofendal_48d_partly_cloudy_puresky_4k.hdr',  label: 'Kloofendal - Partly Cloudy' },
    { value: 'qwantani_dawn_puresky_4k.hdr',                 label: 'Qwantani - Dawn' },
    { value: 'qwantani_dusk_1_puresky_4k.hdr',               label: 'Qwantani - Dusk' },
    { value: 'hilly_terrain_01_puresky_4k.hdr',              label: 'Hilly Terrain' },
    { value: 'rosendal_park_sunset_puresky_4k.hdr',          label: 'Rosendal Park - Sunset' },
    { value: 'drakensberg_solitary_mountain_puresky_4k.hdr', label: 'Drakensberg - Solitary Mountain' },
    { value: 'qwantani_moonrise_puresky_4k.hdr',             label: 'Qwantani - Moonrise (Night)' },
    { value: 'qwantani_moon_noon_puresky_4k.hdr',            label: 'Qwantani - Moon Noon (Night)' },
    { value: 'rogland_clear_night_4k.hdr',                   label: 'Rogland - Clear Night' },
    { value: 'moonless_golf_4k.hdr',                         label: 'Moonless Golf (Night)' },
];
