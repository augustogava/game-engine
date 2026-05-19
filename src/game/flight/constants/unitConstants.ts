export const FT_TO_M = 0.3048;
export const METERS_PER_DEG_LAT = 111320;

// Magnetic variation polynomial approximation (Bowditch-like, ~ ±2 deg accuracy)
// East-positive: trueHdg = magHdg + magVar
export const MAGVAR_C0 = -1.3;
export const MAGVAR_C_LON  = 0.10;
export const MAGVAR_C_LAT  = 0.04;
export const MAGVAR_C_LON2 = -0.0008;
export const MAGVAR_C_LAT2 = -0.0004;
export const MAGVAR_C_LONLAT = 0.0005;
