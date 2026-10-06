export const FLIGHT_SCHOOL_LANDING_COMPLETE_NM = 2.0;
export const FLIGHT_SCHOOL_LANDING_CONFIRM_MS = 3000;
export const FLIGHT_SCHOOL_APPROACH_SPEED_KT = 65;
export const FLIGHT_SCHOOL_VAPP_STALL_FACTOR = 1.3;
export const FLIGHT_SCHOOL_GLIDESLOPE_DEG = 3;
export const FLIGHT_SCHOOL_APPROACH_FLAP_DEG = 20;
export const FLIGHT_SCHOOL_APPROACH_THRUST = 0.4;
export const FLIGHT_SCHOOL_APPROACH_TRIM_PITCH = 0.02;
export const FLIGHT_SCHOOL_APPROACH_MIN_AGL_M = 60;
export const FLIGHT_SCHOOL_FLARE_AGL_FT = 20;
export const FLIGHT_SCHOOL_COACH_UPDATE_INTERVAL_S = 0.2;
export const FLIGHT_SCHOOL_SPEED_TOLERANCE_KT = 5;
export const FLIGHT_SCHOOL_SINK_WARN_FPM = 1000;
export const FLIGHT_SCHOOL_COACH_MAX_AGL_FT = 3000;

export function resolveFlightSchoolVappKt(stallSpeedKt: unknown): number {
    const stallKt = Number(stallSpeedKt);
    const stallBasedKt = Number.isFinite(stallKt) && stallKt > 0 ? stallKt * FLIGHT_SCHOOL_VAPP_STALL_FACTOR : 0;
    return Math.max(FLIGHT_SCHOOL_APPROACH_SPEED_KT, stallBasedKt);
}
