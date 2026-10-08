declare const __MISSION_SCENARIO_CONFIG_JSON__: string;

export const MISSION_SCENARIO_GENERIC = 0;
export const MISSION_SCENARIO_NIGHT_CIRCUIT = 1;
export const MISSION_SCENARIO_IFR_CROSS_COUNTRY = 2;
export const MISSION_SCENARIO_NAV_CROSS_COUNTRY = 3;
export const MISSION_SCENARIO_TERRAIN_FLOOR = 4;
export const MISSION_SCENARIO_SHORT_FIELD = 5;
export const MISSION_SCENARIO_ENGINE_FAILURE_DIVERSION = 6;
export const MISSION_SCENARIO_CIRCUIT_RETURN = 7;
export const MISSION_SCENARIO_CUMULATIVE_DISTANCE = 8;

export const MISSION_TYPE_SCHEDULED = 'scheduled';
export const MISSION_TYPE_CHALLENGE = 'challenge';
export const MISSION_TYPE_MILESTONE = 'milestone';
export const SCENARIO_MISSION_TYPES: readonly string[] = [MISSION_TYPE_SCHEDULED, MISSION_TYPE_CHALLENGE, MISSION_TYPE_MILESTONE];

export const SCENARIO_OBJECTIVE_PENDING = 0;
export const SCENARIO_OBJECTIVE_DONE = 1;
export const SCENARIO_OBJECTIVE_FAILED = 2;

export const SCENARIO_UPDATE_INTERVAL_S = 0.5;
export const SCENARIO_DISTANCE_COMPLETION_RATIO = 0.9;
export const SCENARIO_RETURN_RADIUS_NM = 2;
export const SCENARIO_LAND_AWAY_MIN_NM = 5;
export const SCENARIO_DEPARTURE_WINDOW_MS = 15 * 60 * 1000;
export const SCENARIO_ON_TIME_TOLERANCE_FACTOR = 1.2;
export const SCENARIO_NIGHT_SUN_ELEVATION_MAX_DEG = -6;
export const SCENARIO_NIGHT_SOLAR_HOUR = 22;
export const SCENARIO_AUTOPILOT_MIN_RATIO = 0.5;
export const SCENARIO_AGL_BAND_MIN_RATIO = 0.6;
export const SCENARIO_ROLLOUT_STOP_SPEED_MS = 1.5;
export const SCENARIO_LANDING_CONFIRM_MS = 3000;
export const SCENARIO_TAKEOFF_MIN_AGL_FT = 50;
export const SCENARIO_DIVERSION_SEARCH_RADIUS_KM = 50;
export const SCENARIO_DIVERSION_RADIUS_NM = 2;
export const SCENARIO_MAX_SEGMENT_NM = 5;

export interface MissionScenarioConfig {
    scenario: number;
    requireDistance?: boolean;
    returnToStart?: boolean;
    landAwayFromStart?: boolean;
    night?: boolean;
    requireAutopilot?: boolean;
    aglBandMinFt?: number;
    aglBandMaxFt?: number;
    maxRolloutM?: number;
    engineFailureAglFt?: number;
    cumulative?: boolean;
}

const DEFAULT_MISSION_SCENARIO_CONFIG: Record<number, MissionScenarioConfig> = {
    4: { scenario: MISSION_SCENARIO_NIGHT_CIRCUIT, night: true, returnToStart: true, requireDistance: true },
    6: { scenario: MISSION_SCENARIO_IFR_CROSS_COUNTRY, requireAutopilot: true, requireDistance: true, landAwayFromStart: true },
    1: { scenario: MISSION_SCENARIO_NAV_CROSS_COUNTRY, requireDistance: true, landAwayFromStart: true },
    3: { scenario: MISSION_SCENARIO_TERRAIN_FLOOR, aglBandMinFt: 500, aglBandMaxFt: 2500, requireDistance: true },
    7: { scenario: MISSION_SCENARIO_SHORT_FIELD, maxRolloutM: 300 },
    9: { scenario: MISSION_SCENARIO_ENGINE_FAILURE_DIVERSION, engineFailureAglFt: 1500 },
    5: { scenario: MISSION_SCENARIO_CIRCUIT_RETURN, returnToStart: true, requireDistance: true },
    10: { scenario: MISSION_SCENARIO_CUMULATIVE_DISTANCE, cumulative: true },
};

const GENERIC_SCENARIO_BY_TYPE: Record<string, MissionScenarioConfig> = {
    [MISSION_TYPE_SCHEDULED]: { scenario: MISSION_SCENARIO_GENERIC, requireDistance: true },
    [MISSION_TYPE_CHALLENGE]: { scenario: MISSION_SCENARIO_GENERIC, requireDistance: true },
    [MISSION_TYPE_MILESTONE]: { scenario: MISSION_SCENARIO_CUMULATIVE_DISTANCE, cumulative: true },
};

function loadEnvironmentOverrides(): Record<number, MissionScenarioConfig> {
    try {
        const raw = typeof __MISSION_SCENARIO_CONFIG_JSON__ !== 'undefined' ? __MISSION_SCENARIO_CONFIG_JSON__ : '';
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        const result: Record<number, MissionScenarioConfig> = {};
        for (const [key, value] of Object.entries(parsed)) {
            const missionId = Number(key);
            const scenario = Number((value as MissionScenarioConfig)?.scenario);
            if (!Number.isInteger(missionId) || missionId <= 0 || !Number.isInteger(scenario)) continue;
            result[missionId] = { ...(value as MissionScenarioConfig), scenario };
        }
        return result;
    } catch (err) {
        console.warn('[Scenario] Invalid MISSION_SCENARIO_CONFIG_JSON, using defaults:', err);
        return {};
    }
}

export const MISSION_SCENARIO_CONFIG: Record<number, MissionScenarioConfig> = {
    ...DEFAULT_MISSION_SCENARIO_CONFIG,
    ...loadEnvironmentOverrides(),
};

export function isScenarioMissionType(type: unknown): boolean {
    return SCENARIO_MISSION_TYPES.includes(String(type ?? '').toLowerCase());
}

export function resolveMissionScenarioConfig(missionId: number, type: unknown): MissionScenarioConfig | null {
    const normalizedType = String(type ?? '').toLowerCase();
    if (!isScenarioMissionType(normalizedType)) return null;
    return MISSION_SCENARIO_CONFIG[missionId] ?? GENERIC_SCENARIO_BY_TYPE[normalizedType] ?? null;
}
