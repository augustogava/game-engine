export const VAPOR_CONE_MACH_MIN = 0.95;
export const VAPOR_CONE_MACH_MAX = 1.05;
export const VAPOR_CONE_MAX_RATE = 400;
export const HEAT_HAZE_MAX_RATE  = 60;
export const FLARE_OCCLUSION_CHECK_INTERVAL_MS = 100;
export const FLARE_OCCLUSION_SUN_DISTANCE_M = 5000;
export const MOTION_BLUR_TRIGGER_G = 2.0;
export const MOTION_BLUR_MAX_STRENGTH = 1.0;
export const MOTION_BLUR_SAMPLES = 16;
export const DOF_COCKPIT_FOCUS_DISTANCE_MM = 60000;
export const DOF_COCKPIT_FSTOP = 5.6;
export const DOF_COCKPIT_FOCAL_LENGTH_MM = 50;

export const PRECIP_TYPE_RAIN = 1;
export const LIGHTNING_MIN_RAIN_INTENSITY = 0.8;
export const LIGHTNING_MIN_INTERVAL_S = 6;
export const LIGHTNING_MAX_INTERVAL_S = 20;
export const LIGHTNING_FLASH_DURATION_S = 0.45;
export const LIGHTNING_EXPOSURE_BOOST = 1.6;
export const LIGHTNING_DOUBLE_FLASH_GAP_START = 0.55;
export const LIGHTNING_DOUBLE_FLASH_GAP_END = 0.7;
export const COLOR_GRADE_NIGHT_TINT_R = 0.85;
export const COLOR_GRADE_NIGHT_TINT_G = 0.92;
export const COLOR_GRADE_NIGHT_TINT_B = 1.05;
export const COLOR_GRADE_SUNSET_TINT_R = 1.10;
export const COLOR_GRADE_SUNSET_TINT_G = 0.96;
export const COLOR_GRADE_SUNSET_TINT_B = 0.82;
export const COLOR_GRADE_DAY_TINT_R = 1.0;
export const COLOR_GRADE_DAY_TINT_G = 1.0;
export const COLOR_GRADE_DAY_TINT_B = 1.0;
export const COLOR_GRADE_CONTRAST_NIGHT = 1.15;
export const COLOR_GRADE_CONTRAST_DAY   = 1.08;
export const COLOR_GRADE_SATURATION_NIGHT = 0.85;
export const COLOR_GRADE_SATURATION_DAY   = 1.05;

export const COLOR_LUT_URL = 'src/game/assets/luts/cinematic_warm.png';

// Contrail render mode (ribbon shader vs legacy particles)
export const CONTRAIL_MODE_RIBBON = 'ribbon';
export const CONTRAIL_MODE_PARTICLES = 'particles';
export const CONTRAIL_MODE_DEFAULT = CONTRAIL_MODE_RIBBON;

// Contrail (high-altitude condensation trail) tuning
export const CONTRAIL_TEXTURE_URL = 'src/game/assets/textures/contrail_puff.png';
export const CONTRAIL_PARTICLE_CAPACITY = 20000;
export const CONTRAIL_EMIT_RATE_MAX = 650;
export const CONTRAIL_MIN_LIFETIME_S = 35;
export const CONTRAIL_MAX_LIFETIME_S = 65;
export const CONTRAIL_MIN_SIZE_INITIAL_M = 2.5;
export const CONTRAIL_MAX_SIZE_INITIAL_M = 4.0;
export const CONTRAIL_FINAL_SIZE_MULTIPLIER = 9.0;
export const CONTRAIL_INITIAL_ALPHA = 1.00;
export const CONTRAIL_MIN_DRIFT_MS = 0.4;
export const CONTRAIL_MAX_DRIFT_MS = 1.2;
export const CONTRAIL_LATERAL_SPREAD = 0.08;
export const CONTRAIL_VERTICAL_SPREAD = 0.04;
export const CONTRAIL_ENABLE_MIN_ALTITUDE_M = 7500;
export const CONTRAIL_ENABLE_MIN_SPEED_MS = 60;
export const CONTRAIL_ENABLE_MAX_TEMP_C = -35;
export const CONTRAIL_ENABLE_MIN_ENGINE_POWER = 0.15;
export const CONTRAIL_EMIT_LERP_RATE = 0.08;
export const CONTRAIL_WAKE_SINK_RATE_MS = 0.05;
export const CONTRAIL_NOISE_STRENGTH_LATERAL = 0.15;
export const CONTRAIL_NOISE_STRENGTH_VERTICAL = 0.08;
export const CONTRAIL_NOISE_ANIMATION_SPEED = 0.15;
export const CONTRAIL_NOISE_TEXTURE_SIZE = 128;
