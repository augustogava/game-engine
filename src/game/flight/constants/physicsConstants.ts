export const G_ACCEL          = 9.81;
export const GEAR_SPRING_K_MIN_N_PER_M = 1000;
export const ANGULAR_DAMPING  = 0.5;
export const GROUND_Y         = 6;
export const CRASH_VS_THRESHOLD_MS = -12;
export const CRASH_GROUND_SPEED_MS = 25.7;
export const CRASH_GROUND_ATTITUDE_DEG = 45;
export const CRASH_METERS_TO_FEET = 3.28084;
export const CRASH_MPS_TO_FPM = 196.85;

export const ISA_DELTA_TEMP_K_MAX = 50;
export const ISA_DELTA_TEMP_K_MIN = -50;

export const SPECIFIC_HEAT_RATIO_AIR = 1.4;
export const GAS_CONSTANT_AIR_J_PER_KG_K = 287.058;
export const ISA_TROPOPAUSE_TEMP_K = 216.65;
export const ISA_SEA_LEVEL_TEMP_K = 288.15;
export const ISA_LAPSE_RATE_K_PER_M = 0.0065;
export const ISA_TROPOPAUSE_M = 11000;
export const CONTROL_Q_REFERENCE_PA = 5000;
export const SEA_LEVEL_AIR_DENSITY_KG_PER_M3 = 1.225;

export const JET_THRUST_LAPSE_EXPONENT = 0.7;
export const JET_THRUST_MACH_LAPSE_COEF = 0.6;
export const JET_THRUST_MACH_MIN_FACTOR = 0.4;
export const MACH_DRAG_RISE_START = 0.78;
export const MACH_DRAG_RISE_COEF = 18;

export const STALL_AOA_WARNING_FRACTION = 0.9;

export const SPOILER_DEFAULT_DRAG_CD = 0.06;
export const SPOILER_DEFAULT_LIFT_LOSS = 0.35;
export const SPOILER_DEPLOY_RATE_PER_S = 1.5;
export const SPOILER_RETRACT_RATE_PER_S = 2.5;

export const SPOOL_TAU_PISTON_S = 0.4;
export const SPOOL_TAU_TURBOPROP_S = 0.8;
export const SPOOL_TAU_ELECTRIC_S = 0.1;
export const SPOOL_TAU_JET_S = 4.0;

export const ASYM_YAW_TORQUE_SCALE = 0.33;
export const YAW_RATE_DAMP_COEF = 2.0;

export const G_LIMIT_POSITIVE_DEFAULT = 8.0;
export const G_LIMIT_NEGATIVE_DEFAULT = -3.0;
export const G_LIMITER_MARGIN_G = 0.5;
