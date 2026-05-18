declare const __GOOGLE_MAPS_API_KEY__: string;
import { Scene3D } from '../engine/3d/Scene3D.js';
import { InputManager } from '../engine/input/InputManager.js';
import { TilesRenderer } from '3d-tiles-renderer/babylonjs';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { SkyMaterial } from '@babylonjs/materials/sky';
import { WaterMaterial } from '@babylonjs/materials/water';
import { MultiplayerClient, PlayerState } from './MultiplayerClient.js';
import {
    EngineSound,
    ENGINE_SOUND_TYPE_PISTON,
    ENGINE_SOUND_TYPE_TURBOPROP,
    ENGINE_SOUND_TYPE_TURBOJET,
    ENGINE_SOUND_TYPE_TURBOFAN,
    ENGINE_SOUND_TYPE_ELECTRIC,
} from './EngineSound.js';
import { FlightAudio } from './FlightAudio.js';
import { AudioCore } from './AudioCore.js';
import { UiPreferences, UNIT_SYSTEM_METRIC, UNIT_SYSTEM_IMPERIAL, COLORBLIND_NONE } from './UiPreferences.js';
import { I18n } from './I18n.js';
import { InputBindings, ACTION_LABELS, DEFAULT_KEY_BINDINGS, ActionId } from './InputBindings.js';
import { GamepadInput } from './GamepadInput.js';
import { ReplayBuffer } from './ReplayBuffer.js';

const BUILD_VERSION = 8;

const ENGINE_TYPE_PISTON    = 0;
const ENGINE_TYPE_TURBOPROP = 1;
const ENGINE_TYPE_TURBOJET  = 2;
const ENGINE_TYPE_TURBOFAN  = 3;
const ENGINE_TYPE_ELECTRIC  = 4;

const FLAP_TYPE_PLAIN   = 0;
const FLAP_TYPE_SPLIT   = 1;
const FLAP_TYPE_SLOTTED = 2;
const FLAP_TYPE_FOWLER  = 3;

const MAGNETO_OFF   = 0;
const MAGNETO_LEFT  = 1;
const MAGNETO_RIGHT = 2;
const MAGNETO_BOTH  = 3;

const BEST_POWER_MIX        = 0.7;
const MAGNETO_SINGLE_FACTOR = 0.96;
const GEAR_MAX_TRAVEL_M     = 1.5;

const GEAR_STATE_DOWN       = 0;
const GEAR_STATE_RETRACTING = 1;
const GEAR_STATE_UP         = 2;
const GEAR_STATE_EXTENDING  = 3;
const GEAR_INSTANT_TRANSITION_MS = 1500;
const SPAWN_SNAP_FRAMES = 600;
const AIRBORNE_MISSION_MIN_OFFSET_M = 300;
const TERRAIN_RAY_HEIGHT_M = 200;
const TERRAIN_RAY_LENGTH_M = 1000;
const SPAWN_TERRAIN_RAY_HEIGHT_M = 5000;
const SPAWN_TERRAIN_RAY_LENGTH_M = 10000;
const TERRAIN_HIT_ABOVE_LIMIT_M = 10;
const TERRAIN_UNKNOWN_Y = -1e9;
const NAV_LIGHT_REFERENCE_HALF_SPAN_M = 22;
const NAV_LIGHT_MIN_SCALE = 0.5;
const NAV_LIGHT_MAX_SCALE = 1.5;
const NAV_LIGHT_CORE_DIAMETER_M = 0.4;
const NAV_LIGHT_KIND_STATIC      = 0;
const NAV_LIGHT_KIND_STROBE      = 1;
const NAV_LIGHT_KIND_BEACON      = 2;
const NAV_LIGHT_KIND_ANTICOL     = 3;
const NAV_LIGHT_KIND_LANDING     = 4;
const NAV_BEACON_PERIOD_S        = 1.0;
const NAV_BEACON_ON_FRAC         = 0.15;
const NAV_STROBE_PERIOD_S        = 1.5;
const NAV_STROBE_PULSE_FRAC      = 0.05;
const NAV_STROBE_DOUBLE_GAP_S    = 0.10;
const NAV_ANTICOL_PERIOD_S       = 0.7;
const NAV_ANTICOL_ON_FRAC        = 0.10;
const FT_TO_M = 0.3048;
const METERS_PER_DEG_LAT = 111320;

// Magnetic variation polynomial approximation (Bowditch-like, ~ ±2 deg accuracy)
// East-positive: trueHdg = magHdg + magVar
const MAGVAR_C0 = -1.3;
const MAGVAR_C_LON  = 0.10;
const MAGVAR_C_LAT  = 0.04;
const MAGVAR_C_LON2 = -0.0008;
const MAGVAR_C_LAT2 = -0.0004;
const MAGVAR_C_LONLAT = 0.0005;
const RUNWAY_DEFAULT_WIDTH_FT = 148;
const RUNWAY_COLLIDER_RADIUS_KM = 10;
const RUNWAY_COLLIDER_Y_BIAS_M = 0.5;
const RUNWAY_RENDERING_GROUP_ID = 1;
const RUNWAY_COLLIDER_ALPHA = 0.85;
const RUNWAY_COLLIDER_DIFFUSE = { r: 0.12, g: 0.12, b: 0.13 };
const CAMERA_RADIUS_LENGTH_FACTOR = 3;
const CAMERA_RADIUS_MIN_M = 15;
const CAMERA_RADIUS_MAX_M = 65;
const CAMERA_LOWER_RADIUS_LIMIT_M = 8;
const CAMERA_UPPER_RADIUS_LIMIT_M = 500;
const CAMERA_LOWER_RADIUS_AIRCRAFT_FACTOR = 0.55;
const CAMERA_LOWER_RADIUS_HEIGHT_FACTOR = 0.8;
const CAMERA_LOWER_RADIUS_FALLBACK_M = 8;
const CAMERA_GROUND_CLEARANCE_M = 1.0;
const CAMERA_BETA_SAFETY_EPSILON = 0.001;
const ON_GROUND_AGL_M = 5;
const STALL_WARNING_MIN_AGL_M = 20;
const BANK_COMP_MIN_SIN = 0.174;
const BANK_COMP_PITCH_GAIN = 0.5;
const BANK_COMP_MAX_PITCH = 0.6;
const WORLD_READY_TIMEOUT_MS = 15000;
const WORLD_READY_PROBE_HEIGHT_M = 5000;
const WORLD_READY_PROBE_LENGTH_M = 10000;
const JET_THRUST_LAPSE_EXPONENT = 0.7;
const JET_THRUST_MACH_LAPSE_COEF = 0.6;
const JET_THRUST_MACH_MIN_FACTOR = 0.4;
const MACH_DRAG_RISE_START = 0.78;
const MACH_DRAG_RISE_COEF = 18;
const SPECIFIC_HEAT_RATIO_AIR = 1.4;
const GAS_CONSTANT_AIR_J_PER_KG_K = 287.058;
const ISA_TROPOPAUSE_TEMP_K = 216.65;
const ISA_SEA_LEVEL_TEMP_K = 288.15;
const ISA_LAPSE_RATE_K_PER_M = 0.0065;
const ISA_TROPOPAUSE_M = 11000;
const CONTROL_Q_REFERENCE_PA = 5000;
const SEA_LEVEL_AIR_DENSITY_KG_PER_M3 = 1.225;

// ── Wind model (P2) ─────────────────────────────────────────────────────────
const WIND_DEFAULT_DIRECTION_DEG = 270;
const WIND_DEFAULT_SPEED_KT = 8;
const WIND_ALTITUDE_GAIN_KT_PER_1000FT = 0.5;
const WIND_MAX_SPEED_KT = 80;
const KT_TO_MS = 0.514444;
const MS_TO_KT = 1.943844;
const STALL_AOA_WARNING_FRACTION = 0.9;

// Spoilers / speedbrakes
const SPOILER_DEFAULT_DRAG_CD = 0.06;
const SPOILER_DEFAULT_LIFT_LOSS = 0.35;
const SPOILER_DEPLOY_RATE_PER_S = 1.5;
const SPOILER_RETRACT_RATE_PER_S = 2.5;

// Wind turbulence (Dryden-lite, altitude-faded)
const TURB_FULL_AGL_M = 200;
const TURB_FADE_AGL_M = 3000;
const TURB_MAX_GUST_MS = 3.0;
const TURB_TAU_S = 2.0;

// Engine spool-up time constants (seconds)
const SPOOL_TAU_PISTON_S = 0.4;
const SPOOL_TAU_TURBOPROP_S = 0.8;
const SPOOL_TAU_ELECTRIC_S = 0.1;
const SPOOL_TAU_JET_S = 4.0;

// Vne / overspeed
const VNE_FALLBACK_MULT_OF_STALL = 4.0;
const OVERSPEED_CLACKER_INTERVAL_MS = 250;
const AIRCRAFT_CATEGORY_LIGHT = 0;
const AIRCRAFT_CATEGORY_TURBOPROP = 1;
const AIRCRAFT_CATEGORY_JET = 2;
const AIRCRAFT_CATEGORY_HEAVY_JET = 3;
const AIRCRAFT_CATEGORY_MILITARY = 4;
const MMO_FALLBACK_BY_CATEGORY: Record<number, number> = {
    [AIRCRAFT_CATEGORY_LIGHT]: 0.32,
    [AIRCRAFT_CATEGORY_TURBOPROP]: 0.55,
    [AIRCRAFT_CATEGORY_JET]: 0.82,
    [AIRCRAFT_CATEGORY_HEAVY_JET]: 0.86,
    [AIRCRAFT_CATEGORY_MILITARY]: 0.92,
};
const MMO_FALLBACK_DEFAULT = 0.85;

// GPWS callouts (descending only, in ft)
const GPWS_CALLOUT_FT = [500, 200, 100, 50, 40, 30, 20, 10];
const GPWS_MIN_VS_FOR_CALLOUT_FPM = -200;
const GPWS_SINK_RATE_VS_FPM = -1500;
const GPWS_PULL_UP_VS_FPM = -3000;
const GPWS_CALLOUT_REPEAT_MS = 2500;
const GPWS_ALERT_DURATION_MS = 1500;
const GPWS_ALERT_TYPE_CALLOUT = 1;
const GPWS_ALERT_TYPE_SINK = 2;
const GPWS_ALERT_TYPE_PULL_UP = 3;

// Vapor cone / heat haze / motion blur / lens flare occlusion
const VAPOR_CONE_MACH_MIN = 0.95;
const VAPOR_CONE_MACH_MAX = 1.05;
const VAPOR_CONE_MAX_RATE = 400;
const HEAT_HAZE_MAX_RATE  = 60;
const FLARE_OCCLUSION_CHECK_INTERVAL_MS = 100;
const FLARE_OCCLUSION_SUN_DISTANCE_M = 5000;
const MOTION_BLUR_TRIGGER_G = 2.0;
const MOTION_BLUR_MAX_STRENGTH = 1.0;
const MOTION_BLUR_SAMPLES = 16;
const COLOR_GRADE_NIGHT_TINT_R = 0.85;
const COLOR_GRADE_NIGHT_TINT_G = 0.92;
const COLOR_GRADE_NIGHT_TINT_B = 1.05;
const COLOR_GRADE_SUNSET_TINT_R = 1.10;
const COLOR_GRADE_SUNSET_TINT_G = 0.96;
const COLOR_GRADE_SUNSET_TINT_B = 0.82;
const COLOR_GRADE_DAY_TINT_R = 1.0;
const COLOR_GRADE_DAY_TINT_G = 1.0;
const COLOR_GRADE_DAY_TINT_B = 1.0;
const COLOR_GRADE_CONTRAST_NIGHT = 1.15;
const COLOR_GRADE_CONTRAST_DAY   = 1.08;
const COLOR_GRADE_SATURATION_NIGHT = 0.85;
const COLOR_GRADE_SATURATION_DAY   = 1.05;

// Water
const WATER_PLANE_SIZE_M = 200_000;
const WATER_PLANE_Y_OFFSET_M = 0;
const WATER_NORMAL_RES = 512;
const WATER_BUMP_URL = 'https://assets.babylonjs.com/textures/waterbump.png';
const WATER_WIND_FORCE = -5;
const WATER_WAVE_HEIGHT_M = 0.4;
const WATER_BUMP_HEIGHT = 0.4;
const WATER_WAVE_LENGTH_M = 1.0;
const WATER_COLOR_R = 0.10;
const WATER_COLOR_G = 0.20;
const WATER_COLOR_B = 0.32;
const WATER_COLOR_BLEND = 0.4;

const AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS = 4;

// Autopilot
const AP_HDG_MAX_BANK_DEG = 25;
const AP_HDG_BANK_GAIN = 0.06;
const AP_HDG_ROLL_RATE_GAIN = 0.6;
const AP_ALT_PITCH_GAIN = 0.0009;
const AP_ALT_PITCH_MAX = 0.18;
const AP_ALT_VS_DAMP_GAIN = 0.00015;
const AP_VS_PITCH_GAIN = 0.0006;
const AP_VS_PITCH_MAX = 0.18;
const AP_VS_DEFAULT_FPM = 500;
const AP_NAV_XTE_DEG_PER_NM = 6;
const AP_NAV_MAX_INTERCEPT_DEG = 45;
const AP_APR_GLIDESLOPE_DEG = 3;
const AP_APR_MIN_ALT_FT = 0;
const AP_INPUT_DISENGAGE_THRESHOLD = 0.25;
const AUTOTRIM_RATE_PER_S = 0.04;
const AUTOTRIM_MAX = 0.15;
const AUTOTRIM_DEADBAND = 0.01;

// ── Camera modes (P3) ───────────────────────────────────────────────────────
const CAMERA_MODE_CHASE = 0;
const CAMERA_MODE_COCKPIT = 1;
const CAMERA_MODE_EXTERNAL_FIXED = 2;
const CAMERA_MODE_FLYBY = 3;
const CAMERA_MODE_TOWER = 4;
const CAMERA_MODE_COUNT = 5;
const TOWER_CAMERA_HEIGHT_M = 30;
const TOWER_CAMERA_MIN_RADIUS_M = 80;
const TOWER_CAMERA_BETA_RAD = 1.3;

// ── Over-G (P4) ─────────────────────────────────────────────────────────────
const OVER_G_THRESHOLD = 4.0;
const G_FORCE_SMOOTHING = 0.15;
const HAPTIC_MIN_INTERVAL_MS = 2000;

// ── Cinematic spawn (F14) ───────────────────────────────────────────────────
const CINEMATIC_DURATION_MS = 3000;
const CINEMATIC_INITIAL_RADIUS_M = 120;
const HUD_FADE_IN_MS = 1000;
const ENGINE_SOUND_FADE_IN_MS = 3000;

// ── Mission-complete toast ──────────────────────────────────────────────────
const MISSION_TOAST_VISIBLE_MS = 5000;
const MISSION_TOAST_FADE_MS = 400;

// ── Joystick / mobile controls (F8/F9/F10) ─────────────────────────────────
const JOYSTICK_DEFAULT_RADIUS_PX = 80;
const JOYSTICK_DEFAULT_DEADZONE_NORM = 0.08;
const JOYSTICK_DEFAULT_EXPO = 1.0;
const JOYSTICK_MAX_RADIUS_PX = 160;
const JOYSTICK_MIN_RADIUS_PX = 50;
const JOYSTICK_MAX_DEADZONE_NORM = 0.30;
const JOYSTICK_MAX_EXPO = 3.0;
const JOYSTICK_MIN_EXPO = 1.0;

// ── Multi-touch gestures (F11/F12) ─────────────────────────────────────────
const PINCH_THROTTLE_PX_TO_DELTA = 0.005;
const TWO_FINGER_SWIPE_MIN_PX = 50;
const TWO_FINGER_DISTANCE_TOLERANCE_RATIO = 0.20;
const CAMERA_CYCLE_COOLDOWN_MS = 600;

// ── NAV HUD constants (F1-F6) ───────────────────────────────────────────────
const MIN_GS_FOR_ETE_MS = 5;
const HDG_DELTA_GREEN_DEG = 5;
const HDG_DELTA_AMBER_DEG = 15;
const ALT_BAND_GREEN_FT = 500;
const ALT_BAND_AMBER_FT = 1000;
const XTE_INDICATOR_MAX_NM = 2.0;

// ── Sky objects (sun / moon visual) ─────────────────────────────────────────
const SUN_TEXTURE_PATH = 'src/game/assets/sun.png';
const MOON_TEXTURE_PATH = 'src/game/assets/moon.png';
const SUN_DIAMETER = 600;
const SUN_HALO_SIZE = 2400;
const SUN_DISTANCE = 10000;
const SUN_ROTATION_RAD_PER_S = 0.02;
const SUN_FADE_START_ELEV_DEG = 0;
const SUN_FADE_END_ELEV_DEG = -5;
const MOON_DIAMETER = 350;
const MOON_HALO_SIZE = 800;
const MOON_DISTANCE = 10000;
const MOON_FADE_ELEV_DEG = 8;
const MOON_HALO_FADE_BAND_DEG = 10;
const MOON_HALO_FADE_OFFSET_DEG = 2;
const SUN_HALO_TEX_SIZE = 256;
const MOON_HALO_TEX_SIZE = 256;

// ── Sky polish ──────────────────────────────────────────────────────────────
const SKY_LUMINANCE_MAX = 1.0;
const SKY_MIE_G_LOW_HORIZON = 0.92;
const SKY_MIE_G_HIGH_SUN = 0.78;
const SKY_MIE_G_TRANSITION_DEG = 25;
const NIGHT_HORIZON_GLOW_R = 0.03;
const NIGHT_HORIZON_GLOW_G = 0.05;
const NIGHT_HORIZON_GLOW_B = 0.12;
const NIGHT_HORIZON_GLOW_FADE_BAND_DEG = 12;
const NIGHT_HORIZON_GLOW_OFFSET_DEG = -5;

// ── Clouds ──────────────────────────────────────────────────────────────────
const CLOUD_TEXTURE_URL = 'https://assets.babylonjs.com/textures/cloud.png';
const CLOUD_WIND_HIGH_ELEV_DEG = 25;
const CLOUD_KT_TO_MS = 0.514444;
const CLOUD_DAY_COLOR_R = 1.00;
const CLOUD_DAY_COLOR_G = 1.00;
const CLOUD_DAY_COLOR_B = 1.00;
const CLOUD_SUNSET_COLOR_R = 1.00;
const CLOUD_SUNSET_COLOR_G = 0.65;
const CLOUD_SUNSET_COLOR_B = 0.45;
const CLOUD_NIGHT_COLOR_R = 0.22;
const CLOUD_NIGHT_COLOR_G = 0.26;
const CLOUD_NIGHT_COLOR_B = 0.38;
const CLOUD_SUNSET_FADE_BAND_DEG = 25;
const CLOUD_NIGHT_FADE_BAND_DEG = 10;
const CLOUD_NIGHT_FADE_OFFSET_DEG = 0;
const CLOUD_ALPHA_MIN = 0.55;
const CLOUD_ALPHA_MAX = 0.92;
const CLOUD_DENSITY_MULT_LOW = 0.5;
const CLOUD_DENSITY_MULT_MEDIUM = 1.0;
const CLOUD_DENSITY_MULT_HIGH = 2.0;
const CLOUD_DENSITY_MULT_ULTRA = 3.0;
const CLOUD_VOLUMETRIC_PUFFS_PER_CLUSTER = 5;
const CLOUD_VOLUMETRIC_PUFF_JITTER = 0.35;
const OVERCAST_DECK_Y_M = 7500;
const OVERCAST_DECK_SIZE_M = 60000;
const OVERCAST_DECK_ALPHA = 0.55;
const MILKY_WAY_BAND_COUNT = 120;
const MILKY_WAY_BAND_DIST = 50000;
const MILKY_WAY_BAND_HALF_WIDTH_DEG = 7;
const MILKY_WAY_BAND_TILT_DEG = 60;

// ── Bright stars / planets ──────────────────────────────────────────────────
const BRIGHT_STAR_COUNT = 25;
const BRIGHT_STAR_BASE_SIZE = 110;
const BRIGHT_STAR_SIZE_RANDOM = 70;
const BRIGHT_STAR_TWINKLE_AMOUNT = 0.45;

interface AircraftSurfaceConfig {
    surface_index: number;
    label: string;
    pos_x: number; pos_y: number; pos_z: number;
    normal_x: number; normal_y: number; normal_z: number;
    area: number;
    chord: number;
    aspect_ratio: number;
    zero_lift_aoa: number;
    flap_fraction: number;
}

interface AircraftConfig {
    id: number;
    code: string;
    name: string;
    category: number;
    model_file: string;
    model_target_size: number;
    model_rotation_y: number;
    mass_kg: number;
    max_thrust_n: number;
    inertia_xx: number;
    inertia_yy: number;
    inertia_zz: number;
    lift_slope: number;
    skin_friction: number;
    stall_alpha_rad: number;
    oswald_efficiency: number;
    fuselage_cd0: number;
    fuselage_ref_area: number;
    stall_speed_kts: number;
    base_zero_lift_aoa: number;
    flap_steps_json: number[];
    default_flap_index_ground: number;
    default_flap_index_air: number;
    throttle_up_rate: number;
    throttle_down_rate: number;
    rolling_friction: number;
    brake_friction: number;
    idle_friction: number;
    spawn_alt_offset_m: number;
    spawn_airborne_thrust: number;
    spawn_airborne_speed_ms: number;
    surfaces: AircraftSurfaceConfig[];
    engine_type: number;
    engine_count: number;
    prop_diameter_m: number | null;
    prop_rotation_dir: number | null;
    prop_inertia_kgm2: number | null;
    prop_rpm_max: number | null;
    fuel_capacity_kg: number;
    fuel_burn_rate_kg_per_s_max: number;
    fuel_burn_rate_kg_per_s_idle: number;
    flap_type: number;
    gear_spring_k: number;
    gear_damping_c: number;
    gear_positions: { x: number; y: number; z: number }[];
    fuselage_side_area: number;
    fuselage_cn_beta: number;
    gear_drag_cd?: number;
    afterburner_thrust_mult?: number;
    afterburner_fuel_mult?: number;
    wave_drag_coef?: number;
    wave_drag_peak_mach?: number | null;
    wave_drag_decay_k?: number;
    mach_lapse_coef?: number;
    mach_lapse_floor?: number;
    transonic_cd0_factor?: number;
    control_q_reference_pa?: number | null;
    control_input_magnitude?: number | null;
    control_smoothing_rate?: number | null;
    vne_kts?: number | null;
    mmo?: number | null;
    spoiler_drag_cd?: number | null;
    spoiler_lift_loss?: number | null;
    ground_spoilers_auto?: boolean | null;
}

const DEFAULT_AIRCRAFT_CONFIG: AircraftConfig = {
    id: 0, code: 'dc8', name: 'Douglas DC-8', category: 2,
    model_file: 'models/DC8_AFRC_AIR_0824.glb',
    model_target_size: 40, model_rotation_y: Math.PI,
    mass_kg: 10000, max_thrust_n: 50000,
    inertia_xx: 211333, inertia_yy: 256608, inertia_zz: 48531,
    lift_slope: 5.5, skin_friction: 0.02, stall_alpha_rad: 0.26,
    oswald_efficiency: 0.8, fuselage_cd0: 0.04, fuselage_ref_area: 45,
    stall_speed_kts: 25, base_zero_lift_aoa: -0.035,
    flap_steps_json: [0, 5, 15, 25, 30, 40],
    default_flap_index_ground: 2, default_flap_index_air: 0,
    throttle_up_rate: 0.55, throttle_down_rate: 0.4,
    rolling_friction: 0.3, brake_friction: 8.0, idle_friction: 1.5,
    spawn_alt_offset_m: 600, spawn_airborne_thrust: 0.7, spawn_airborne_speed_ms: 100,
    surfaces: [
        { surface_index: 0, label: 'left_wing',  pos_x: -3, pos_y: 0, pos_z: -0.5, normal_x: 0, normal_y: 1, normal_z: 0, area: 38, chord: 2.5, aspect_ratio: 7.5, zero_lift_aoa: -0.035, flap_fraction: 0.15 },
        { surface_index: 1, label: 'right_wing', pos_x:  3, pos_y: 0, pos_z: -0.5, normal_x: 0, normal_y: 1, normal_z: 0, area: 38, chord: 2.5, aspect_ratio: 7.5, zero_lift_aoa: -0.035, flap_fraction: 0.15 },
        { surface_index: 2, label: 'h_stab',     pos_x:  0, pos_y: 0, pos_z: -7,   normal_x: 0, normal_y: 1, normal_z: 0, area: 7.2, chord: 1.8, aspect_ratio: 2.2, zero_lift_aoa: 0, flap_fraction: 0.35 },
        { surface_index: 3, label: 'v_stab',     pos_x:  0, pos_y: 1.5, pos_z: -7, normal_x: 1, normal_y: 0, normal_z: 0, area: 7.0, chord: 2.0, aspect_ratio: 1.75, zero_lift_aoa: 0, flap_fraction: 0.35 },
    ],
    engine_type: ENGINE_TYPE_TURBOFAN, engine_count: 4,
    prop_diameter_m: null, prop_rotation_dir: null, prop_inertia_kgm2: null, prop_rpm_max: null,
    fuel_capacity_kg: 23000, fuel_burn_rate_kg_per_s_max: 2.15, fuel_burn_rate_kg_per_s_idle: 0.18,
    flap_type: FLAP_TYPE_SLOTTED,
    gear_spring_k: 200000, gear_damping_c: 50000,
    gear_positions: [
        { x: 0, y: -1.5, z: 4 },
        { x: -3, y: -1.5, z: -0.5 },
        { x: 3, y: -1.5, z: -0.5 },
    ],
    fuselage_side_area: 80, fuselage_cn_beta: -0.1, gear_drag_cd: 0,
};

async function fetchAircraftConfig(aircraftId: number): Promise<AircraftConfig> {
    try {
        const token = localStorage.getItem('auth_token') || '';
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resp = await fetch(`/api/aircrafts/${aircraftId}`, { headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        console.debug('[Aircraft] fetchAircraftConfig raw response:', JSON.stringify(data));
        if (typeof data.flap_steps_json === 'string') {
            data.flap_steps_json = JSON.parse(data.flap_steps_json);
        }
        if (!Array.isArray(data.surfaces)) data.surfaces = [];
        return data as AircraftConfig;
    } catch (err) {
        console.error('[Aircraft] Failed to fetch config, using default:', err);
        return DEFAULT_AIRCRAFT_CONFIG;
    }
}

async function fetchSelectedAircraftConfig(): Promise<AircraftConfig> {
    try {
        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            console.warn('[Aircraft] No auth token, using DEFAULT_AIRCRAFT_CONFIG (id=0). Flight logs will NOT be saved.');
            return DEFAULT_AIRCRAFT_CONFIG;
        }
        const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
        const resp = await fetch('/api/user-aircrafts', { headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        console.debug('[Aircraft] fetchSelectedAircraftConfig raw response:', JSON.stringify(data));
        const list: any[] = Array.isArray(data.data) ? data.data : [];
        const selected = list.find((ua: any) => ua.is_selected === 1) || list.find((ua: any) => ua.aircraft);
        if (selected?.aircraft) {
            const cfg = selected.aircraft as AircraftConfig;
            console.debug('[Aircraft] selected aircraft config:', JSON.stringify(cfg));
            console.log(`[Aircraft] Using ${selected.is_selected === 1 ? 'SELECTED' : 'FALLBACK (first owned)'} aircraft: id=${cfg.id} code=${cfg.code} name=${cfg.name}`);
            if (typeof cfg.flap_steps_json === 'string') {
                cfg.flap_steps_json = JSON.parse(cfg.flap_steps_json as unknown as string);
            }
            if (!Array.isArray(cfg.surfaces)) cfg.surfaces = [];
            return cfg;
        }
        console.warn('[Aircraft] No owned aircraft found for user, using DEFAULT_AIRCRAFT_CONFIG (id=0). Flight logs will NOT be saved.');
        return DEFAULT_AIRCRAFT_CONFIG;
    } catch (err) {
        console.error('[Aircraft] Failed to fetch selected aircraft, using default:', err);
        return DEFAULT_AIRCRAFT_CONFIG;
    }
}

interface RemotePlayer {
    root: BABYLON.TransformNode;
    meshes: BABYLON.Mesh[];
    prevState: PlayerState | null;
    nextState: PlayerState | null;
    lastUpdateTime: number;
    aircraftCode: string | null;
    labelPlane: BABYLON.Mesh | null;
    labelTexture: BABYLON.DynamicTexture | null;
    currentUsername: string | null;
    currentAvatarUrl: string | null;
    engineSound: EngineSound | null;
    engineTypeResolved: boolean;
}

const G_ACCEL          = 9.81;
const GEAR_SPRING_K_MIN_N_PER_M = 1000;
const ANGULAR_DAMPING  = 0.5;
const GROUND_Y         = 6;
const CRASH_VS_THRESHOLD_MS = -12;
const CRASH_GROUND_SPEED_MS = 25.7;
const CRASH_GROUND_ATTITUDE_DEG = 45;

// ── ISA atmosphere (with optional ISA + dT density altitude) ─────────────────
const ISA_DELTA_TEMP_K_MAX = 50;
const ISA_DELTA_TEMP_K_MIN = -50;

function getAirDensity(altitudeM: number, deltaTempK: number = 0): number {
    const h = Math.max(0, altitudeM);
    const dT = Number.isFinite(deltaTempK)
        ? Math.max(ISA_DELTA_TEMP_K_MIN, Math.min(ISA_DELTA_TEMP_K_MAX, deltaTempK))
        : 0;
    if (h > 11000) {
        const T_isa = 216.65;
        const T = Math.max(150, T_isa + dT);
        const P = 22632 * Math.exp((-9.81 * (h - 11000)) / (287.058 * T_isa));
        return P / (287.058 * T);
    }
    const T_isa = 288.15 - 0.0065 * h;
    const T = Math.max(150, T_isa + dT);
    const P = 101325 * Math.pow(T_isa / 288.15, 5.2561);
    return P / (287.058 * T);
}

// ── Aerodynamic surface model ─────────────────────────────────────────────────
interface AeroSurface {
    position:     BABYLON.Vector3;
    normal:       BABYLON.Vector3;
    area:         number;
    chord:        number;
    aspectRatio:  number;
    liftSlope:    number;
    skinFriction: number;
    stallAlpha:   number;
    zeroLiftAoA:  number;
    oswaldE:      number;
    flapFraction: number;
    controlInput: number;
}

function computeCoefficients(
    alpha: number, liftSlope: number, skinFriction: number,
    zeroLiftAoA: number, stallAlpha: number, aspectRatio: number,
    oswaldE: number, flapFraction: number, controlInput: number,
    groundEffectFactor: number, flapType: number,
): { cl: number; cd: number } {
    const corrSlope = liftSlope * aspectRatio /
        (aspectRatio + 2 * (aspectRatio + 4) / (aspectRatio + 2));
    const absAlpha = Math.abs(alpha);
    let cl: number, cd: number;

    if (absAlpha <= stallAlpha) {
        cl = corrSlope * (alpha - zeroLiftAoA);
        if (flapFraction > 0 && controlInput !== 0) {
            let flapEff = Math.sqrt(flapFraction) * 0.52;
            if (flapType === FLAP_TYPE_SLOTTED)  flapEff *= 1.25;
            else if (flapType === FLAP_TYPE_FOWLER) flapEff *= 1.45;
            else if (flapType === FLAP_TYPE_SPLIT)  flapEff *= 0.85;
            cl += flapEff * corrSlope * controlInput;
        }
        const cdInduced = (cl * cl) / (Math.PI * aspectRatio * oswaldE);
        cd = skinFriction + cdInduced * groundEffectFactor;
    } else {
        const sign    = alpha >= 0 ? 1 : -1;
        const clFlat  = 2 * sign * Math.sin(absAlpha) * Math.cos(absAlpha);
        const cdFlat  = 2 * Math.sin(absAlpha) * Math.sin(absAlpha);
        const clStall = corrSlope * (stallAlpha * sign - zeroLiftAoA);
        const cdInducedStall = (clStall * clStall) / (Math.PI * aspectRatio * oswaldE);
        const cdStall = skinFriction + cdInducedStall * groundEffectFactor;
        const t = Math.min(1, (absAlpha - stallAlpha) / 0.26);
        const s = t * t * (3 - 2 * t);
        cl = clStall * (1 - s) + clFlat * s;
        cd = cdStall * (1 - s) + cdFlat * s;
    }
    return { cl, cd };
}

function computeSurfaceForces(
    surface: AeroSurface, bodyVelocity: BABYLON.Vector3, airDensity: number,
    groundEffectFactor: number, flapType: number, propwashSpeedBoost: number,
): { force: BABYLON.Vector3; torque: BABYLON.Vector3 } {
    const speed = bodyVelocity.length();
    const zero  = { force: BABYLON.Vector3.Zero(), torque: BABYLON.Vector3.Zero() };
    if (speed < 1.0) return zero;

    const dragDir = bodyVelocity.normalizeToNew().scaleInPlace(-1);
    const cross1  = BABYLON.Vector3.Cross(dragDir, surface.normal);
    const liftDir = BABYLON.Vector3.Cross(cross1, dragDir);
    if (liftDir.lengthSquared() < 0.0001) return zero;
    liftDir.normalize();

    const dot   = Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(dragDir, surface.normal)));
    const alpha = Math.asin(dot);

    const { cl, cd } = computeCoefficients(
        alpha, surface.liftSlope, surface.skinFriction,
        surface.zeroLiftAoA, surface.stallAlpha, surface.aspectRatio,
        surface.oswaldE, surface.flapFraction, surface.controlInput,
        groundEffectFactor, flapType,
    );

    const effectiveSpeed = speed + propwashSpeedBoost;
    const q     = 0.5 * airDensity * effectiveSpeed * effectiveSpeed * surface.area;
    const force = liftDir.scale(cl * q).addInPlace(dragDir.scale(cd * q));
    const torque = BABYLON.Vector3.Cross(surface.position, force);
    return { force, torque };
}

// ── Solar position ───────────────────────────────────────────────────────────
function getSunPosition(lat: number, lon: number, date: Date): { elevation: number; azimuth: number } {
    const rad = Math.PI / 180;
    const jd = Math.floor(365.25 * (date.getUTCFullYear() + 4716))
             + Math.floor(30.6001 * ((date.getUTCMonth() + 1 < 3 ? date.getUTCMonth() + 13 : date.getUTCMonth() + 1 + 1)))
             + date.getUTCDate() + (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24
             - 1524.5;
    const n = jd - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * rad;
    const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
    const eps = 23.439 * rad - 3.56e-7 * rad * n;
    const sinDec = Math.sin(eps) * Math.sin(lambda);
    const dec = Math.asin(sinDec);
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
    const gmst = (280.46061837 + 360.98564736629 * n) % 360;
    const lmst = (gmst + lon) * rad;
    const ha = lmst - ra;
    const latR = lat * rad;
    const sinElev = Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha);
    const elevation = Math.asin(sinElev) / rad;
    const cosAz = (Math.sin(dec) - Math.sin(elevation * rad) * Math.sin(latR))
                / (Math.cos(elevation * rad) * Math.cos(latR));
    let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) / rad;
    if (Math.sin(ha) > 0) azimuth = 360 - azimuth;
    return { elevation, azimuth };
}

// ── FlightSceneSimple ─────────────────────────────────────────────────────────
export class FlightSceneSimple extends Scene3D {
    private planeRoot!: BABYLON.TransformNode;
    private velocity        = BABYLON.Vector3.Zero();
    private angularVelocity = BABYLON.Vector3.Zero();
    private thrust   = 0.0;
    private spawned  = false;
    public groundSpeed: number = 0;
    private _gForce: number = 1;
    private _cameraMode: number = CAMERA_MODE_CHASE;
    private _cameraModeKeyLock = false;
    private _cinematicActive = false;
    private _cinematicStartMs = 0;
    private _hudFadeStartMs = 0;
    private _hudFadeActive = false;
    private _lastHapticMs = 0;
    private _lastStallState = false;
    private _lastOverGState = false;
    private _userGestureSeen = false;
    private _userGestureListener: (() => void) | null = null;
    private _disposed = false;
    private _pendingTimeouts = new Set<number>();
    private _dbgKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
    private _mapImgLoadHandler: (() => void) | null = null;
    private _mapImgErrorHandler: ((ev: Event) => void) | null = null;
    private _lastCameraCycleMs = 0;
    private camera!: BABYLON.ArcRotateCamera;
    private surfaces: AeroSurface[] = [];
    private ground!: BABYLON.Mesh;
    private tiles: TilesRenderer | null = null;
    private initialHeading = 0;
    private terrainY = GROUND_Y;
    private isOnGround = false;
    private brakesOn = false;
    private brakeKeyLock = false;
    private aircraftConfig: AircraftConfig = DEFAULT_AIRCRAFT_CONFIG;
    private _lastSentAircraftId: number | undefined = undefined;
    private FLAP_STEPS: number[] = DEFAULT_AIRCRAFT_CONFIG.flap_steps_json;
    private flapIndex = 2;
    private flapKeyLock5 = false;
    private flapKeyLock6 = false;
    private baseZeroLiftAoA = -0.035;
    private currentFlapDeg = 15;
    private readonly FIXED_DT = 1 / 120;
    private physicsAccumulator = 0;
    private originLat = -23.4354;
    private originLon = -46.4745;
    private refAlt = 0;
    private mapApiKey = '';
    private mapImg!: HTMLImageElement;
    private mapHeadingCanvas!: HTMLCanvasElement;
    private mapLastUpdate = 0;
    private _mapImgLat = 0;
    private _mapImgLon = 0;
    private _mapImgValid = false;
    private _mapImgPendingLat = 0;
    private _mapImgPendingLon = 0;
    private _mapImgPending = false;
    private _mapImgListenersAttached = false;
    private static readonly MAP_ZOOM_DEFAULT = 12;
    private static readonly MAP_ZOOM_MIN = 9;
    private static readonly MAP_ZOOM_MAX = 17;
    private _mapZoom = FlightSceneSimple.MAP_ZOOM_DEFAULT;
    private _mapHeadingUp = true;
    private static readonly MAP_REQUEST_SIZE_PX = 256;
    private static readonly MAP_REQUEST_SCALE = 2;
    private static readonly MAP_REFETCH_DRIFT_RATIO = 0.25;
    private static readonly MAP_REFETCH_INTERVAL_MS = 5000;
    private static readonly MAP_IMG_UPSCALE = 2.0;
    private spawnAirborne = false;
    private isMobile = false;
    private touchPitchInput = 0;
    private touchRollInput = 0;
    private touchThrust = 0.7;
    private joystickTouchId: number | null = null;
    private joystickOrigin = { x: 0, y: 0 };
    private throttleTouchId: number | null = null;
    private _controlSettings = {
        radius: JOYSTICK_DEFAULT_RADIUS_PX,
        deadzone: JOYSTICK_DEFAULT_DEADZONE_NORM,
        expo: JOYSTICK_DEFAULT_EXPO,
        pitchInvert: false,
    };
    private _twoFingerActive = false;
    private _twoFingerInitialDist = 0;
    private _twoFingerLastDist = 0;
    private _twoFingerStartMidX = 0;
    private _twoFingerStartMidY = 0;
    private _twoFingerStartMs = 0;
    private _twoFingerFiredCamera = false;

    private smoothedPitch = 0;
    private smoothedRoll = 0;
    private smoothedYaw = 0;

    private fuelRemaining = 0;
    private trimPitch = 0;
    private trimYaw = 0;
    private mixtureLevel = 0.7;
    private magnetoSwitch = MAGNETO_BOTH;
    private engineRpm = 0;
    private enginePower = 0;
    private wingSpan = 30;
    private gearCompression: number[] = [0, 0, 0];
    private trimKeyLock7 = false;
    private trimKeyLock8 = false;
    private trimKeyLock9 = false;
    private trimKeyLock0 = false;
    private mixtureKeyLockPlus = false;
    private mixtureKeyLockMinus = false;
    private magnetoKeyLockN = false;
    private _gearUpAnimGroup: BABYLON.AnimationGroup | null = null;
    private _gearDownAnimGroup: BABYLON.AnimationGroup | null = null;
    private gearState: number = GEAR_STATE_DOWN;
    private gearKeyLockG = false;
    private _gearTransitionStartMs = 0;
    private _spawnSnapFramesLeft = 0;
    private _lastKnownSpawnTerrainY: number = TERRAIN_UNKNOWN_Y;
    private _worldReady = false;
    private _worldReadyStartMs = 0;
    private _worldReadyProbeRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, -1, 0), WORLD_READY_PROBE_LENGTH_M);
    private _pendingAirborneGearRetract = false;

    private mpClient: MultiplayerClient | null = null;
    private _engineSound: EngineSound = new EngineSound({ engineType: ENGINE_SOUND_TYPE_TURBOFAN, positional: false });
    private _flightAudio: FlightAudio = new FlightAudio({ enableTts: true });
    private _lastFlapAnimating = false;
    private _lastGearTransitioning = false;
    private _gamepad: GamepadInput = new GamepadInput();
    private _replayBuffer: ReplayBuffer = new ReplayBuffer();
    private _paused: boolean = false;
    private _timeScale: number = 1.0;
    private _gamepadAxes = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, connected: false };
    private _mouseYokeActive: boolean = false;
    private _mouseYokeAileron: number = 0;
    private _mouseYokeElevator: number = 0;
    private _mouseYokePointerLockBound: boolean = false;
    private _towerCameraSet: boolean = false;
    private _towerCameraPos: BABYLON.Vector3 = new BABYLON.Vector3(0, TOWER_CAMERA_HEIGHT_M, 0);
    private _checklistEl: HTMLElement | null = null;
    private _checklistPhase: string = '';
    private _ovrFpsLatencyEl: HTMLElement | null = null;
    private _replayActive: boolean = false;
    private _keysHelperHandled: boolean = false;
    private _pauseKeyLock = false;
    private _timeScaleUpKeyLock = false;
    private _timeScaleDownKeyLock = false;
    private _easyModeKeyLock = false;
    private _mouseYokeKeyLock = false;
    private _towerCamKeyLock = false;
    private _replayKeyLock = false;
    private _screenshotKeyLock = false;
    private _gamepadConnectedToastEl: HTMLElement | null = null;
    private _prefsUnsubscribe: (() => void) | null = null;
    private _bindingsUnsubscribe: (() => void) | null = null;
    private _mouseYokeMoveHandler: ((ev: MouseEvent) => void) | null = null;
    private _mouseYokeLockHandler: (() => void) | null = null;
    private _f12KeydownHandler: ((ev: KeyboardEvent) => void) | null = null;
    private remotePlayers = new Map<string, RemotePlayer>();
    private hudOnline!: HTMLElement;
    private dbgMpStatus!: HTMLElement;
    private dbgMpCount!: HTMLElement;
    private dbgMpUserId!: HTMLElement;
    public onSpawned: (() => void) | null = null;

    private hudThrottle!: HTMLElement;
    private hudThrPct!: HTMLElement;
    private hudAbTag: HTMLElement | null = null;
    private hudAttitude!: HTMLElement;
    private hudWarning!:  HTMLElement;
    private hudFps!:      HTMLElement;

    private dbgPlanePos!:  HTMLElement;
    private dbgPlaneRot!:  HTMLElement;
    private dbgPlaneVel!:  HTMLElement;
    private dbgCamPos!:    HTMLElement;
    private dbgCamOrbit!:  HTMLElement;
    private dbgPanel!:     HTMLElement;
    private dbgTerrainY!:  HTMLElement;
    private dbgGroundLvl!: HTMLElement;
    private dbgOnGround!:  HTMLElement;
    private dbgVertRate!:  HTMLElement;
    private dbgAltMsl!:    HTMLElement;
    private dbgLatLon!:    HTMLElement;
    private dbgTilesInfo!: HTMLElement;
    private dbgEngineType!: HTMLElement;
    private dbgEnginePerf!: HTMLElement;
    private dbgFuelDbg!:    HTMLElement;
    private dbgMixture!:    HTMLElement;
    private dbgMagneto!:    HTMLElement;
    private dbgGearComp!:   HTMLElement;
    private dbgGearState!:  HTMLElement;
    private hudCanvas!:    HTMLCanvasElement;
    private hudCtx!:       CanvasRenderingContext2D;
    private hudFlapVal!:   HTMLElement;
    private hudFlapBar!:   HTMLElement;
    private hudBrakeVal!:  HTMLElement;
    private hudGearRow!:   HTMLElement;
    private hudGearState!: HTMLElement;
    private hudSpeedVal!:  HTMLElement;
    private hudAltVal!:    HTMLElement;
    private hudTasVal!:    HTMLElement;
    private hudGsVal:      HTMLElement | null = null;
    private hudIasVal:     HTMLElement | null = null;
    private hudApState:    HTMLElement | null = null;
    private hudSpoilerState: HTMLElement | null = null;
    private hudEngsState:    HTMLElement | null = null;
    private hudRpmVal!:    HTMLElement;
    private hudRpmNeedle!: HTMLElement;
    private hudFuelVal!:   HTMLElement;
    private hudAoaVal!:    HTMLElement;
    private hudVsVal!:     HTMLElement;
    private hudTrimVal!:   HTMLElement;
    private hudBaroVal!:   HTMLElement;
    private hudHdgVal!:    HTMLElement;
    private hudAltTape!:   HTMLElement;
    private hudSpdTape!:   HTMLElement;
    private hudSpdMarks!:  HTMLElement;
    private hudAltMarks!:  HTMLElement;
    private hudVsBar!:     HTMLElement;
    private hudSpdH:    HTMLElement | null = null;
    private hudSpdT:    HTMLElement | null = null;
    private hudSpdUInner: HTMLElement | null = null;
    private hudAltH:    HTMLElement | null = null;
    private hudAltT:    HTMLElement | null = null;
    private hudAltU:    HTMLElement | null = null;
    private hudAltTens: HTMLElement | null = null;
    private hudAltUnitsInner: HTMLElement | null = null;
    private hudAltSel:  HTMLElement | null = null;
    private hudVsPointer: HTMLElement | null = null;
    private hudEngine2Col: HTMLElement | null = null;
    private hudRpmVal2:    HTMLElement | null = null;
    private hudRpmNeedle2: HTMLElement | null = null;
    private hudEng1Pct:    HTMLElement | null = null;
    private hudEng2Pct:    HTMLElement | null = null;
    private spdMarkEls: { el: HTMLElement; valEl: HTMLElement }[] = [];
    private altMarkEls: { el: HTMLElement; valEl: HTMLElement }[] = [];
    private lastSpdCenter = -1;
    private lastAltCenter = -1;

    private _tmpRotMatrix    = new BABYLON.Matrix();
    private _tmpInvRotMatrix = new BABYLON.Matrix();
    private _tmpFwd   = BABYLON.Vector3.Zero();
    private _tmpRight = BABYLON.Vector3.Zero();
    private _tmpUp    = new BABYLON.Vector3(0, 1, 0);
    private _tmpWindWorld = BABYLON.Vector3.Zero();
    private _tmpAirVel    = BABYLON.Vector3.Zero();
    private _lastAoaRad: number = 0;
    private _lastTasMs:  number = 0;
    private _lastIasMs:  number = 0;
    private _isaDeltaTempK: number = 0;
    private _turbVec = BABYLON.Vector3.Zero();
    private _turbTime = 0;
    private _engineN1: number = 0;
    private _gpwsLastCalloutFt: number = -1;
    private _gpwsLastCalloutMs: number = 0;
    private _gpwsActiveAlert: number = 0;
    private _gpwsAlertUntilMs: number = 0;
    private _overspeedActive: boolean = false;
    private _overspeedLastTickMs: number = 0;
    private _autopilotMaster: boolean = false;
    private _autopilotHdgHold: boolean = false;
    private _autopilotAltHold: boolean = false;
    private _autopilotVsHold:  boolean = false;
    private _autopilotNavHold: boolean = false;
    private _autopilotAprHold: boolean = false;
    private _autopilotTargetHdgDeg: number = 0;
    private _autopilotTargetAltFt: number = 0;
    private _autopilotTargetVsFpm:  number = 0;
    private _apKeyLockMaster = false;
    private _apKeyLockHdg = false;
    private _apKeyLockAlt = false;
    private _apKeyLockVs  = false;
    private _apKeyLockNav = false;
    private _apKeyLockApr = false;
    private _spoilerTarget: number = 0;
    private _spoilerDeflection: number = 0;
    private _spoilerKeyLock = false;
    private _spoilerArmed = false;
    private _engineAlive: boolean[] = [];
    private _killEngineKeyLock: boolean[] = [false, false, false, false];
    private _trimWheelTarget: number = 0;
    private _trimKeyLockPgUp = false;
    private _trimKeyLockPgDn = false;
    private _terrainRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, -1, 0), 1000);
    private _mapHdgCtx: CanvasRenderingContext2D | null = null;
    private _missionPanelEl: HTMLElement | null = null;
    private _missionBtnEl: HTMLElement | null = null;
    private _aircraftPanelEl: HTMLElement | null = null;
    private _aircraftBtnEl: HTMLElement | null = null;
    private _flightPlansPanelEl: HTMLElement | null = null;
    private _flightPlansBtnEl: HTMLElement | null = null;
    private _pendingFlightPlanLat: number | null = null;
    private _pendingFlightPlanLon: number | null = null;
    private _pendingFlightPlanHdg: number | null = null;
    private _pendingFlightPlanAltM: number | null = null;
    private _activeFlightPlanId: number | null = null;
    private _activeFlightPlanArrivalAirportId: number | null = null;
    private _simTimeOffsetMs = 0;
    private _activeFlightPlanNav: { departure_lat: number; departure_lon: number; arrival_lat: number; arrival_lon: number; departure_icao: string; arrival_icao: string; name: string } | null = null;
    private _navInfoEl: HTMLElement | null = null;
    private _navDestEl: HTMLElement | null = null;
    private _navDistEl: HTMLElement | null = null;
    private _navBrgEl:  HTMLElement | null = null;
    private _crashed = false;
    private _crashOverlayEl: HTMLElement | null = null;
    private _safetyFloorSnapActive = false;
    private _activeMission: { departure_lat: number; departure_lon: number; arrival_lat: number; arrival_lon: number; departure_icao: string; arrival_icao: string; mission_title: string } | null = null;
    private _activeMissionId: number | null = null;
    private _activeUserMissionId: number | null = null;
    private _pendingMissionLat: number | null = null;
    private _pendingMissionLon: number | null = null;
    private _pendingMissionHdg: number | null = null;
    private _pendingMissionAltM: number | null = null;
    private _pendingMissionAirborne = false;
    private _missionWaypoints: Array<{ id: number; order_index: number; name: string | null; latitude: number; longitude: number; altitude_ft: number | null }> = [];
    private _missionCurrentWpIndex = 0;
    private _completedUserMissionIds: Set<number> = new Set();
    private _missionCompletionInFlight = false;
    private static readonly WAYPOINT_REACH_NM = 0.3;

    private _navLights: {
        light: BABYLON.PointLight | BABYLON.SpotLight;
        core: BABYLON.Mesh;
        kind: number;
        phase: number;
        maxIntensity: number;
    }[] = [];
    private _navGlowLayer: BABYLON.GlowLayer | null = null;
    private _navStrobeTimer = 0;
    private _landingLightsOn = false;
    private _landingKeyLock = false;
    private _surfaceAilLeftNodes:  BABYLON.TransformNode[] = [];
    private _surfaceAilRightNodes: BABYLON.TransformNode[] = [];
    private _surfaceElevatorNodes: BABYLON.TransformNode[] = [];
    private _surfaceRudderNodes:   BABYLON.TransformNode[] = [];
    private _surfaceFlapNodes:     BABYLON.TransformNode[] = [];
    private _contrailPSLeft:  BABYLON.ParticleSystem | null = null;
    private _contrailPSRight: BABYLON.ParticleSystem | null = null;
    private _contrailEmitterLeft:  BABYLON.TransformNode | null = null;
    private _contrailEmitterRight: BABYLON.TransformNode | null = null;
    private _contrailHalfSpan: number = 8;
    private _lastMach: number = 0;
    private _vaporConePS: BABYLON.ParticleSystem | null = null;
    private _vaporConeEmitter: BABYLON.TransformNode | null = null;
    private _heatHazePS: BABYLON.ParticleSystem | null = null;
    private _heatHazeEmitter: BABYLON.TransformNode | null = null;
    private _flareOccluded: boolean = false;
    private _flareCheckTimerMs: number = 0;
    private _motionBlurPP: BABYLON.MotionBlurPostProcess | null = null;
    private _dofEnabledInCockpit: boolean = false;
    private _runwayColliders: BABYLON.Mesh[] = [];
    private _runwayCollidersLoaded = false;

    private _hemiLight: BABYLON.HemisphericLight | null = null;
    private _sunLight: BABYLON.DirectionalLight | null = null;
    private _fillLight: BABYLON.DirectionalLight | null = null;
    private _sunMesh: BABYLON.Mesh | null = null;
    private _sunMeshMat: BABYLON.StandardMaterial | null = null;
    private _sunHaloMesh: BABYLON.Mesh | null = null;
    private _sunHaloMat: BABYLON.StandardMaterial | null = null;
    private _skyMaterial: SkyMaterial | null = null;
    private _waterMesh: BABYLON.Mesh | null = null;
    private _waterMaterial: WaterMaterial | null = null;
    private _skyboxMesh: BABYLON.Mesh | null = null;
    private _starRoot: BABYLON.TransformNode | null = null;
    private _starInstances: BABYLON.InstancedMesh[] = [];
    private _starPhases: number[] = [];
    private _starBaseScales: number[] = [];
    private _starTime = 0;
    private _moonMesh: BABYLON.Mesh | null = null;
    private _moonMat: BABYLON.StandardMaterial | null = null;
    private _moonHaloMesh: BABYLON.Mesh | null = null;
    private _moonHaloMat: BABYLON.StandardMaterial | null = null;
    private _overcastMesh: BABYLON.Mesh | null = null;
    private _overcastMat: BABYLON.StandardMaterial | null = null;
    private _milkyWayRoot: BABYLON.TransformNode | null = null;
    private _cloudDensityMult = CLOUD_DENSITY_MULT_MEDIUM;
    private _cloudVolumetric = false;
    private _lensFlareSystem: BABYLON.LensFlareSystem | null = null;
    private _sunUpdateTimer = 0;
    private _sunElevation = 45;
    private _pipeline: BABYLON.DefaultRenderingPipeline | null = null;
    private _ssao: BABYLON.SSAO2RenderingPipeline | null = null;
    private _shadowGen: BABYLON.CascadedShadowGenerator | null = null;
    private hudUtc!: HTMLElement;

    private _applyAircraftConfig(cfg: AircraftConfig): void {
        if (cfg.engine_type == null) cfg.engine_type = DEFAULT_AIRCRAFT_CONFIG.engine_type;
        if (cfg.engine_count == null) cfg.engine_count = DEFAULT_AIRCRAFT_CONFIG.engine_count;
        if (cfg.fuel_capacity_kg == null) cfg.fuel_capacity_kg = DEFAULT_AIRCRAFT_CONFIG.fuel_capacity_kg;
        if (cfg.fuel_burn_rate_kg_per_s_max == null) cfg.fuel_burn_rate_kg_per_s_max = DEFAULT_AIRCRAFT_CONFIG.fuel_burn_rate_kg_per_s_max;
        if (cfg.fuel_burn_rate_kg_per_s_idle == null) cfg.fuel_burn_rate_kg_per_s_idle = DEFAULT_AIRCRAFT_CONFIG.fuel_burn_rate_kg_per_s_idle;
        if (cfg.flap_type == null) cfg.flap_type = DEFAULT_AIRCRAFT_CONFIG.flap_type;
        if (cfg.gear_spring_k == null) cfg.gear_spring_k = DEFAULT_AIRCRAFT_CONFIG.gear_spring_k;
        if (cfg.gear_damping_c == null) cfg.gear_damping_c = DEFAULT_AIRCRAFT_CONFIG.gear_damping_c;
        if (!cfg.gear_positions || !cfg.gear_positions.length) cfg.gear_positions = DEFAULT_AIRCRAFT_CONFIG.gear_positions;
        if (cfg.fuselage_side_area == null) cfg.fuselage_side_area = DEFAULT_AIRCRAFT_CONFIG.fuselage_side_area;
        if (cfg.fuselage_cn_beta == null) cfg.fuselage_cn_beta = DEFAULT_AIRCRAFT_CONFIG.fuselage_cn_beta;
        if (cfg.afterburner_thrust_mult == null) cfg.afterburner_thrust_mult = 1.0;
        if (cfg.afterburner_fuel_mult   == null) cfg.afterburner_fuel_mult   = 1.0;
        if (cfg.wave_drag_coef          == null) cfg.wave_drag_coef          = MACH_DRAG_RISE_COEF;
        if (cfg.wave_drag_decay_k       == null) cfg.wave_drag_decay_k       = 0.0;
        if (cfg.mach_lapse_coef         == null) cfg.mach_lapse_coef         = JET_THRUST_MACH_LAPSE_COEF;
        if (cfg.mach_lapse_floor        == null) cfg.mach_lapse_floor        = JET_THRUST_MACH_MIN_FACTOR;
        if (cfg.transonic_cd0_factor    == null) cfg.transonic_cd0_factor    = 1.0;
        this.aircraftConfig = cfg;
        this.FLAP_STEPS = cfg.flap_steps_json || DEFAULT_AIRCRAFT_CONFIG.flap_steps_json;
        this.baseZeroLiftAoA = cfg.base_zero_lift_aoa;
        this.fuelRemaining = cfg.fuel_capacity_kg;
        this.gearCompression = new Array(cfg.gear_positions.length).fill(0);
        this._updateEngineColumnsVisibility();
        try {
            this._engineSound.setEngineType(this._mapEngineType(cfg.engine_type));
        } catch (err) {
            console.warn('[EngineSound] setEngineType failed:', err);
        }
    }

    private _mapEngineType(et: number): number {
        switch (et) {
            case ENGINE_TYPE_PISTON:    return ENGINE_SOUND_TYPE_PISTON;
            case ENGINE_TYPE_TURBOPROP: return ENGINE_SOUND_TYPE_TURBOPROP;
            case ENGINE_TYPE_TURBOJET:  return ENGINE_SOUND_TYPE_TURBOJET;
            case ENGINE_TYPE_ELECTRIC:  return ENGINE_SOUND_TYPE_ELECTRIC;
            case ENGINE_TYPE_TURBOFAN:
            default:
                return ENGINE_SOUND_TYPE_TURBOFAN;
        }
    }

    private _updateEngineColumnsVisibility(): void {
        if (!this.hudEngine2Col) return;
        const engineCount = this.aircraftConfig?.engine_count ?? 1;
        this.hudEngine2Col.style.display = engineCount >= 2 ? '' : 'none';
    }

    onCreate(scene: any, _input: InputManager): void {
        this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        scene.useRightHandedSystem = true;
        scene.clearColor = new BABYLON.Color4(0.0, 0.0, 0.02, 1);
        scene.autoClear = true;
        scene.skipPointerMovePicking = true;
        scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
        scene.fogColor   = new BABYLON.Color3(0.55, 0.7, 0.95);
        scene.fogDensity = 0.000008;

        try {
            scene.onNewMaterialAddedObservable.add((mat: BABYLON.Material) => {
                if (!mat) return;
                if (mat instanceof BABYLON.PBRBaseMaterial) {
                    try {
                        (mat as BABYLON.PBRMaterial).maxSimultaneousLights = AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS;
                    } catch (err) {
                        console.warn('[FlightSimple] Failed to cap maxSimultaneousLights on PBR material:', mat?.name, err);
                    }
                }
            });
        } catch (err) {
            console.warn('[FlightSimple] Failed to register PBR maxSimultaneousLights observer:', err);
        }

        this.velocity        = BABYLON.Vector3.Zero();
        this.angularVelocity = BABYLON.Vector3.Zero();

        this._applyAircraftConfig(DEFAULT_AIRCRAFT_CONFIG);
        const initialModelFile = DEFAULT_AIRCRAFT_CONFIG.model_file;

        fetchSelectedAircraftConfig().then((cfg) => {
            if (this._disposed || !this.scene) {
                console.debug('[Aircraft] Discarding async config fetch — scene disposed');
                return;
            }
            this._applyAircraftConfig(cfg);
            this._initSurfaces();
            if (cfg.model_file !== initialModelFile && this.planeRoot) {
                console.log(`[Aircraft] Initial fetch returned ${cfg.code}; reloading model (was ${initialModelFile}).`);
                this._loadedModelMeshes.forEach((m) => m.dispose());
                this._loadedModelMeshes = [];
                this._loadedAnimGroups.forEach((g) => g.dispose());
                this._loadedAnimGroups = [];
                this._propellerAnimGroup = null;
                this._gearUpAnimGroup = null;
                this._gearDownAnimGroup = null;
                const pivot = this.planeRoot.getChildTransformNodes(true).find((n) => n.name === 'modelPivot');
                if (pivot) pivot.dispose();
                this._loadAircraftModel(scene);
            }
            if (this.planeRoot) {
                const modelStillLoading = !this._gearUpAnimGroup && !this._gearDownAnimGroup;
                this._spawnPlane();
                if (this._pendingMissionAirborne && modelStillLoading) {
                    this._pendingAirborneGearRetract = true;
                }
                console.log(`[FlightSimple] Initial spawn re-applied with active config (${cfg.code}) after async fetch`);
            }
            console.log(`[Aircraft] Loaded: ${cfg.name} (${cfg.code})`);
        }).catch((err) => {
            console.warn('[Aircraft] fetchSelectedAircraftConfig failed:', err);
        });

        this._initSurfaces();
        this._init3DTiles(scene);
        this._setupLighting(scene);
        this._buildSkybox(scene);
        this._buildClouds(scene);
        this._buildGround(scene);
        this._buildPlane(scene);
        this._buildCamera(scene);
        this._setupPostProcessing(scene);
        this._buildHUD();
        if (this.isMobile) this._setupTouchControls();
        if (this.tiles) {
            this.ground.isVisible = false;
            scene.fogColor   = new BABYLON.Color3(0.65, 0.75, 0.90);
            scene.fogDensity = 0.0000025;
            this._buildWater(scene);
        }

    }

    update(dt: number): void {
        if (!this.spawned) return;
        if (this.tiles) this.tiles.update();
        if (this._crashed) return;

        if (!this._worldReady) {
            this._tickWorldReadyProbe();
            return;
        }

        this._handleInput(dt);

        const replayFrame = this._replayActive ? this._replayBuffer.sampleAtNow() : null;
        if (replayFrame && this.planeRoot && this.planeRoot.rotationQuaternion) {
            this.planeRoot.position.set(replayFrame.px, replayFrame.py, replayFrame.pz);
            this.planeRoot.rotationQuaternion.set(replayFrame.qx, replayFrame.qy, replayFrame.qz, replayFrame.qw);
            this.thrust = replayFrame.throttle;
            if (!this._replayBuffer.isPlaying()) {
                this._replayActive = false;
                console.log('[Replay] Finished');
            }
        }

        const physicsActive = !this._paused && !this._replayActive;
        if (physicsActive) {
            const scaledDt = dt * Math.max(0.05, Math.min(8, this._timeScale));
            this.physicsAccumulator += scaledDt;
            const maxSteps = 8;
            let steps = 0;
            while (this.physicsAccumulator >= this.FIXED_DT && steps < maxSteps) {
                this._applyPhysics(this.FIXED_DT);
                this.physicsAccumulator -= this.FIXED_DT;
                steps++;
            }
            if (this.physicsAccumulator > this.FIXED_DT * maxSteps) {
                this.physicsAccumulator = 0;
            }
        }

        if (physicsActive && this.planeRoot && this.planeRoot.rotationQuaternion) {
            const q = this.planeRoot.rotationQuaternion;
            const p = this.planeRoot.position;
            this._replayBuffer.record({
                px: p.x, py: p.y, pz: p.z,
                qx: q.x, qy: q.y, qz: q.z, qw: q.w,
                throttle: this.thrust,
            });
        }
        
        this._sunUpdateTimer += dt;
        if (this._sunUpdateTimer >= 2.0) {
            this._sunUpdateTimer = 0;
            const scene = this.planeRoot.getScene();
            if (scene) this._applyDayNightCycle(scene);
        }
        if (this._skyMaterial && this.camera) {
            this._skyMaterial.cameraOffset.y = this.camera.position.y;
        }
        this._updateStarTwinkle(dt);
        const aglForTurb = this.planeRoot
            ? Math.max(0, this.planeRoot.position.y - (this.tiles ? this.terrainY : GROUND_Y))
            : 0;
        this._updateTurbulence(dt, aglForTurb);
        this._updateNavLights(dt);
        this._updateClouds(dt);
        this._updatePropellerAnim();
        this._updateControlSurfaceAnim();
        this._updateGearState();
        this._updateContrails(dt);
        this._updateVaporCone();
        this._updateHeatHaze();
        this._updateLensFlareOcclusion(dt * 1000);
        this._updateMotionBlurAndDof();
        this._updateHUD();
        this._sendOwnState();
        this._updateRemotePlayers();
    }

    private _updatePropellerAnim(): void {
        const group = this._propellerAnimGroup;
        if (!group) return;
        const throttle = Math.max(0, Math.min(1, this.thrust));
        if (throttle <= 0.001) {
            if (group.isPlaying) group.pause();
            return;
        }
        const PROP_MIN_SPEED = 0.5;
        const PROP_MAX_SPEED = 6.0;
        const speedRatio = PROP_MIN_SPEED + (PROP_MAX_SPEED - PROP_MIN_SPEED) * throttle;
        group.speedRatio = speedRatio;
        if (!group.isPlaying) {
            group.play(true);
        }
    }

    private _cockpitClick(freqHz?: number): void {
        try {
            this._flightAudio.playClick(freqHz);
        } catch (_) { /* ignore */ }
    }

    private _togglePause(): void {
        this._paused = !this._paused;
        const lbl = this._paused ? I18n.t('hud.paused') : '';
        this._showHudWarningOverlay(lbl, this._paused);
        console.log(`[Pause] ${this._paused ? 'paused' : 'resumed'} timeScale=${this._timeScale.toFixed(2)}`);
        this._cockpitClick();
    }

    private _adjustTimeScale(direction: number): void {
        const steps = [0.25, 0.5, 1.0, 2.0, 4.0, 8.0];
        let idx = steps.findIndex((s) => Math.abs(s - this._timeScale) < 1e-3);
        if (idx < 0) idx = 2;
        idx = Math.max(0, Math.min(steps.length - 1, idx + (direction > 0 ? 1 : -1)));
        this._timeScale = steps[idx];
        UiPreferences.set({ pauseTimeScale: this._timeScale });
        console.log(`[TimeScale] ${this._timeScale.toFixed(2)}x`);
        this._cockpitClick(2400);
    }

    private _showHudWarningOverlay(text: string, visible: boolean): void {
        if (!this.hudWarning) return;
        if (visible) {
            this.hudWarning.textContent = text;
            this.hudWarning.style.display = 'block';
        } else if (this.hudWarning.textContent === text) {
            this.hudWarning.style.display = 'none';
        }
    }

    private _easyModeAssistEnabled(): boolean {
        return UiPreferences.get().easyMode && !this.isOnGround;
    }

    private _easyModeStabilization(): { pitch: number; roll: number } {
        if (!this.planeRoot || !this.planeRoot.rotationQuaternion) return { pitch: 0, roll: 0 };
        BABYLON.Matrix.FromQuaternionToRef(this.planeRoot.rotationQuaternion, this._tmpRotMatrix);
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), this._tmpRotMatrix, this._tmpFwd);
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(1, 0, 0), this._tmpRotMatrix, this._tmpRight);
        const pitchAngle = Math.asin(Math.max(-1, Math.min(1, this._tmpFwd.y)));
        const bankSin = Math.max(-1, Math.min(1, this._tmpRight.y));
        const desiredPitch = 0.05;
        const pitchError = desiredPitch - pitchAngle;
        const rollError = -bankSin;
        const k = 0.6;
        return {
            pitch: Math.max(-0.6, Math.min(0.6, -pitchError * k)),
            roll:  Math.max(-0.5, Math.min(0.5, rollError * k)),
        };
    }

    private _easyModeAutoThrottle(dt: number): void {
        const tasKts = (Number.isFinite(this._lastTasMs) ? this._lastTasMs : this.velocity.length()) * MS_TO_KT;
        const targetKts = UiPreferences.get().autoThrottleTargetKts;
        const errorKts = targetKts - tasKts;
        const k = 0.005;
        const delta = Math.max(-0.5, Math.min(0.5, errorKts * k));
        const rate = (delta > 0 ? this.aircraftConfig.throttle_up_rate : this.aircraftConfig.throttle_down_rate) || 0.4;
        this.thrust = Math.max(0, Math.min(this.aircraftConfig.afterburner_thrust_mult ?? 1.0, this.thrust + delta * rate * dt));
    }

    private _toggleMouseYoke(): void {
        const next = !this._mouseYokeActive;
        UiPreferences.set({ mouseYoke: next });
        this._setMouseYoke(next);
    }

    private _setMouseYoke(active: boolean): void {
        this._mouseYokeActive = active;
        const canvas = this.scene?.getEngine?.()?.getRenderingCanvas?.();
        if (!canvas) return;
        if (active) {
            if (!this._mouseYokeMoveHandler) {
                this._mouseYokeMoveHandler = (ev: MouseEvent) => {
                    if (!this._mouseYokeActive) return;
                    const rect = (canvas as HTMLCanvasElement).getBoundingClientRect();
                    if (document.pointerLockElement === canvas) {
                        this._mouseYokeAileron  = Math.max(-1, Math.min(1, this._mouseYokeAileron  + ev.movementX * 0.005));
                        this._mouseYokeElevator = Math.max(-1, Math.min(1, this._mouseYokeElevator + ev.movementY * 0.005));
                    } else {
                        const cx = ev.clientX - rect.left;
                        const cy = ev.clientY - rect.top;
                        const nx = (cx / rect.width) * 2 - 1;
                        const ny = (cy / rect.height) * 2 - 1;
                        this._mouseYokeAileron = Math.max(-1, Math.min(1, nx));
                        this._mouseYokeElevator = Math.max(-1, Math.min(1, ny));
                    }
                };
                canvas.addEventListener('mousemove', this._mouseYokeMoveHandler);
            }
            console.log('[MouseYoke] Enabled');
            this._cockpitClick();
        } else {
            this._mouseYokeAileron = 0;
            this._mouseYokeElevator = 0;
            if (this._mouseYokeMoveHandler) {
                canvas.removeEventListener('mousemove', this._mouseYokeMoveHandler);
                this._mouseYokeMoveHandler = null;
            }
            try { document.exitPointerLock?.(); } catch (_) { /* ignore */ }
            console.log('[MouseYoke] Disabled');
        }
    }

    private _captureTowerCameraPosition(): void {
        if (!this.planeRoot) return;
        const groundY = this.tiles ? this.terrainY : GROUND_Y;
        const lockedY = (Number.isFinite(groundY) && groundY > -1e8 ? groundY : GROUND_Y) + TOWER_CAMERA_HEIGHT_M;
        this._towerCameraPos.set(0, lockedY, 0);
        this._towerCameraSet = true;
    }

    private _toggleReplay(): void {
        if (this._replayActive) {
            this._replayActive = false;
            this._replayBuffer.stopPlayback();
            console.log('[Replay] Stopped by user');
        } else {
            const ok = this._replayBuffer.startPlayback(1.0);
            if (ok) {
                this._replayActive = true;
                console.log('[Replay] Started');
            } else {
                console.warn('[Replay] No data to play');
            }
        }
    }

    private _convertSpeedKts(kts: number): { value: number; unit: string } {
        const units = UiPreferences.get().unitSystem;
        if (units === UNIT_SYSTEM_METRIC) {
            return { value: Math.round(kts * 1.852), unit: I18n.t('units.kmh') };
        }
        return { value: Math.round(kts), unit: I18n.t('units.kts') };
    }

    private _convertAltitudeFt(ft: number): { value: number; unit: string } {
        const units = UiPreferences.get().unitSystem;
        if (units === UNIT_SYSTEM_METRIC) {
            return { value: Math.round(ft * 0.3048), unit: I18n.t('units.m') };
        }
        return { value: Math.round(ft), unit: I18n.t('units.ft') };
    }

    private _convertDistanceNm(nm: number): { value: number; unit: string } {
        const units = UiPreferences.get().unitSystem;
        if (units === UNIT_SYSTEM_METRIC) {
            return { value: nm * 1.852, unit: I18n.t('units.km') };
        }
        return { value: nm, unit: I18n.t('units.nm') };
    }

    private _convertVsFpm(fpm: number): { value: number; unit: string } {
        const units = UiPreferences.get().unitSystem;
        if (units === UNIT_SYSTEM_METRIC) {
            return { value: Math.round(fpm * 0.00508 * 100) / 100, unit: I18n.t('units.mps') };
        }
        return { value: Math.round(fpm), unit: I18n.t('units.fpm') };
    }

    private _toggleGear(): void {
        if (this.gearState === GEAR_STATE_RETRACTING || this.gearState === GEAR_STATE_EXTENDING) return;
        if (this.gearState === GEAR_STATE_DOWN) {
            if (this.isOnGround) {
                console.warn('[Gear] Cannot retract gear while on ground.');
                return;
            }
            this.gearState = GEAR_STATE_RETRACTING;
            this._gearTransitionStartMs = performance.now();
            if (this._gearUpAnimGroup) {
                this._gearUpAnimGroup.start(false, 1.0, this._gearUpAnimGroup.from, this._gearUpAnimGroup.to);
            }
            console.log('[Gear] Retracting...');
        } else if (this.gearState === GEAR_STATE_UP) {
            this.gearState = GEAR_STATE_EXTENDING;
            this._gearTransitionStartMs = performance.now();
            if (this._gearDownAnimGroup) {
                this._gearDownAnimGroup.start(false, 1.0, this._gearDownAnimGroup.from, this._gearDownAnimGroup.to);
            }
            console.log('[Gear] Extending...');
        }
    }

    private _updateGearState(): void {
        const now = performance.now();
        const transitioning = this.gearState === GEAR_STATE_RETRACTING || this.gearState === GEAR_STATE_EXTENDING;
        if (transitioning !== this._lastGearTransitioning) {
            this._lastGearTransitioning = transitioning;
            try { this._flightAudio.setGearTransitioning(transitioning); } catch (_) { /* ignore */ }
        }
        if (this.gearState === GEAR_STATE_RETRACTING) {
            const animDone = this._gearUpAnimGroup ? !this._gearUpAnimGroup.isPlaying : false;
            const timerDone = (now - this._gearTransitionStartMs) > GEAR_INSTANT_TRANSITION_MS;
            if (animDone || (!this._gearUpAnimGroup && timerDone)) {
                this.gearState = GEAR_STATE_UP;
                console.log('[Gear] UP.');
            }
        } else if (this.gearState === GEAR_STATE_EXTENDING) {
            const animDone = this._gearDownAnimGroup ? !this._gearDownAnimGroup.isPlaying : false;
            const timerDone = (now - this._gearTransitionStartMs) > GEAR_INSTANT_TRANSITION_MS;
            if (animDone || (!this._gearDownAnimGroup && timerDone)) {
                this.gearState = GEAR_STATE_DOWN;
                console.log('[Gear] DOWN.');
            }
        }
    }

    onDispose(): void {
        this._disposed = true;
        this._clearAllPendingTimeouts();
        if (this._dbgKeydownHandler) {
            try { window.removeEventListener('keydown', this._dbgKeydownHandler); } catch (_) { /* ignore */ }
            this._dbgKeydownHandler = null;
        }
        this._removeMapImgListeners();
        document.getElementById('flight-hud')?.remove();
        document.getElementById('dbg-panel')?.remove();
        
        document.getElementById('touch-overlay')?.remove();
        document.getElementById('aircraft-btn')?.remove();
        document.getElementById('aircraft-panel')?.remove();
        if (this.tiles) { this.tiles.dispose(); this.tiles = null; }
        this.mpClient?.dispose();
        this._removeUserGestureListener();
        this._engineSound.dispose();
        this._flightAudio.dispose();
        if (this._prefsUnsubscribe) { try { this._prefsUnsubscribe(); } catch (_) { /* ignore */ } this._prefsUnsubscribe = null; }
        if (this._bindingsUnsubscribe) { try { this._bindingsUnsubscribe(); } catch (_) { /* ignore */ } this._bindingsUnsubscribe = null; }
        if (this._f12KeydownHandler) {
            try { window.removeEventListener('keydown', this._f12KeydownHandler, true); } catch (_) { /* ignore */ }
            this._f12KeydownHandler = null;
        }
        if (this._mouseYokeMoveHandler) {
            try {
                const canvas = this.scene?.getEngine?.()?.getRenderingCanvas?.();
                if (canvas) canvas.removeEventListener('mousemove', this._mouseYokeMoveHandler);
            } catch (_) { /* ignore */ }
            this._mouseYokeMoveHandler = null;
        }
        document.getElementById('ux-checklist')?.remove();
        document.getElementById('ux-fps-latency')?.remove();
        document.getElementById('ux-toast')?.remove();
        this._disposeNavLights();
        this._disposeRunwayColliders();
        this._disposeContrails();
        this._disposeVaporCone();
        this._disposeHeatHaze();
        this._disposeWater();
        this._ensureMotionBlur(false);
        if (this._pipeline) { this._pipeline.dispose(); this._pipeline = null; }
        if (this._ssao) { this._ssao.dispose(); this._ssao = null; }
        if (this._lensFlareSystem) { this._lensFlareSystem.dispose(); this._lensFlareSystem = null; }
        if (this._sunHaloMat) { try { this._sunHaloMat.dispose(true, true); } catch (_) { /* ignore */ } this._sunHaloMat = null; }
        if (this._sunHaloMesh) { try { this._sunHaloMesh.dispose(); } catch (_) { /* ignore */ } this._sunHaloMesh = null; }
        if (this._moonHaloMat) { try { this._moonHaloMat.dispose(true, true); } catch (_) { /* ignore */ } this._moonHaloMat = null; }
        if (this._moonHaloMesh) { try { this._moonHaloMesh.dispose(); } catch (_) { /* ignore */ } this._moonHaloMesh = null; }
        for (const mat of this._cloudMats) { try { mat.dispose(true, true); } catch (_) { /* ignore */ } }
        this._cloudMats = [];
        if (this._overcastMat) { try { this._overcastMat.dispose(true, true); } catch (_) { /* ignore */ } this._overcastMat = null; }
        if (this._overcastMesh) { try { this._overcastMesh.dispose(); } catch (_) { /* ignore */ } this._overcastMesh = null; }
        if (this._milkyWayRoot) { try { this._milkyWayRoot.dispose(); } catch (_) { /* ignore */ } this._milkyWayRoot = null; }
        if (this._shadowGen) { this._shadowGen.dispose(); this._shadowGen = null; }
        if (this.camera) this.camera.detachControl();
    }

    setFlightPlanSpawn(plan: any): void {
        const hasRunway = plan?.dep_rwy_latitude != null && plan?.dep_rwy_longitude != null && plan?.dep_rwy_heading != null;
        const hasAirportCenter = plan?.dep_latitude != null && plan?.dep_longitude != null;

        if (!hasRunway && !hasAirportCenter) {
            console.warn('[FlightPlan] Plan missing both runway and airport coordinates — skipping spawn override');
            return;
        }

        const spawnLat = hasRunway ? Number(plan.dep_rwy_latitude) : Number(plan.dep_latitude);
        const spawnLon = hasRunway ? Number(plan.dep_rwy_longitude) : Number(plan.dep_longitude);
        const spawnHdg = hasRunway ? Number(plan.dep_rwy_heading) : Number(plan.dep_rwy_heading ?? 0);

        if (!hasRunway) {
            console.debug('[FlightPlan] Runway data unavailable, using airport center as spawn position');
        }

        this._activeFlightPlanId = Number(plan.id);
        this._activeFlightPlanArrivalAirportId = plan.arrival_airport_id != null ? Number(plan.arrival_airport_id) : null;
        this._patchFlightPlanStatus(this._activeFlightPlanId, 'in_progress');
        this._pendingFlightPlanLat = spawnLat;
        this._pendingFlightPlanLon = spawnLon;
        this._pendingFlightPlanHdg = spawnHdg;
        if (plan.scheduled_departure_at) {
            const scheduled = new Date(plan.scheduled_departure_at).getTime();
            if (!isNaN(scheduled)) {
                this._simTimeOffsetMs = scheduled - Date.now();
                console.log(`[FlightPlan] Sim time offset: ${Math.round(this._simTimeOffsetMs / 60000)} min`);
            }
        }
        const elevFt = plan.dep_rwy_elevation_ft ?? plan.dep_elevation_ft ?? 0;
        this._pendingFlightPlanAltM = Number(elevFt) * 0.3048;
        const arrLat = plan.arr_rwy_latitude ?? plan.arr_latitude;
        const arrLon = plan.arr_rwy_longitude ?? plan.arr_longitude;
        if (arrLat != null && arrLon != null) {
            this._activeFlightPlanNav = {
                departure_lat: spawnLat,
                departure_lon: spawnLon,
                arrival_lat: Number(arrLat),
                arrival_lon: Number(arrLon),
                departure_icao: plan.departure_icao || '',
                arrival_icao: plan.arrival_icao || '',
                name: plan.name || '',
            };
        }

        if (Array.isArray(plan.waypoints) && plan.waypoints.length > 0) {
            this._missionWaypoints = plan.waypoints
                .map((wp: any, i: number) => ({
                    id: Number(wp.id ?? i),
                    order_index: Number(wp.order_index ?? i + 1),
                    name: wp.name ?? null,
                    latitude: Number(wp.latitude ?? wp.lat),
                    longitude: Number(wp.longitude ?? wp.lon),
                    altitude_ft: wp.altitude_ft != null ? Number(wp.altitude_ft) : null,
                }))
                .filter((wp: { latitude: number; longitude: number }) => Number.isFinite(wp.latitude) && Number.isFinite(wp.longitude))
                .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index);
            this._missionCurrentWpIndex = 0;
            console.log(`[FlightPlan] Loaded ${this._missionWaypoints.length} waypoints for plan ${this._activeFlightPlanId}`);
        }

        console.log(`[FlightPlan] Active plan id=${this._activeFlightPlanId}, spawn lat=${spawnLat} lon=${spawnLon} hdg=${spawnHdg} (runway=${hasRunway})`);
    }

    setMissionSpawn(mission: any, userMissionId: number | null): void {
        this._activeMissionId = Number(mission.id);
        this._activeUserMissionId = userMissionId;

        const isDiscovery = mission.type === 'discovery';
        const isRoute = mission.type === 'route';

        if (isDiscovery && mission.spawn_latitude != null && mission.spawn_longitude != null) {
            this._pendingMissionLat = Number(mission.spawn_latitude);
            this._pendingMissionLon = Number(mission.spawn_longitude);
            this._pendingMissionAltM = mission.spawn_altitude_ft != null ? Number(mission.spawn_altitude_ft) * 0.3048 : 1000;
            this._pendingMissionHdg = 0;
            this._pendingMissionAirborne = true;
        } else if (isRoute && mission.dep_rwy_latitude != null && mission.dep_rwy_longitude != null) {
            this._pendingMissionLat = Number(mission.dep_rwy_latitude);
            this._pendingMissionLon = Number(mission.dep_rwy_longitude);
            this._pendingMissionHdg = mission.dep_rwy_heading != null ? Number(mission.dep_rwy_heading) : 0;
            this._pendingMissionAltM = mission.dep_rwy_elevation_ft != null ? Number(mission.dep_rwy_elevation_ft) * 0.3048 : 0;
            this._pendingMissionAirborne = false;
            console.log(`[Mission] Spawning at runway centerline lat=${this._pendingMissionLat} lon=${this._pendingMissionLon} hdg=${this._pendingMissionHdg}`);
        } else if (isRoute && mission.departure_lat != null && mission.departure_lon != null) {
            this._pendingMissionLat = Number(mission.departure_lat);
            this._pendingMissionLon = Number(mission.departure_lon);
            this._pendingMissionHdg = 0;
            this._pendingMissionAltM = 0;
            this._pendingMissionAirborne = false;
            console.warn('[Mission] Route mission has no runway centerline — falling back to airport center');
        } else {
            console.warn(`[Mission] Mission ${mission.id} has no spawn coordinates — skipping spawn override`);
            return;
        }

        if (mission.arrival_lat != null && mission.arrival_lon != null) {
            this._activeMission = {
                departure_lat: this._pendingMissionLat,
                departure_lon: this._pendingMissionLon,
                arrival_lat: Number(mission.arrival_lat),
                arrival_lon: Number(mission.arrival_lon),
                departure_icao: mission.departure_icao || '',
                arrival_icao: mission.arrival_icao || '',
                mission_title: mission.title || '',
            };
        }

        this._missionWaypoints = Array.isArray(mission.waypoints) ? mission.waypoints : [];
        this._missionCurrentWpIndex = 0;

        console.log(`[Mission] Active mission id=${this._activeMissionId}, type=${mission.type}, spawn lat=${this._pendingMissionLat} lon=${this._pendingMissionLon} airborne=${this._pendingMissionAirborne} waypoints=${this._missionWaypoints.length}`);
    }

    initMultiplayer(token: string, onAuthFailure?: () => void, onNoFlightHours?: () => void): void {
        this.mpClient = new MultiplayerClient(token);

        this.mpClient.onPlayersUpdate((players) => {
            const now = performance.now();
            const activeIds = new Set<string>();

            for (const p of players) {
                activeIds.add(p.userId);
                let remote = this.remotePlayers.get(p.userId);
                const remoteModelFile = p.aircraftModelFile || null;
                if (!remote) {
                    remote = this._createRemotePlayer(p.userId, remoteModelFile || undefined);
                    this.remotePlayers.set(p.userId, remote);
                } else if (remoteModelFile && remote.aircraftCode !== remoteModelFile) {
                    remote.meshes.forEach((m) => m.dispose());
                    remote.meshes = [];
                    const pivot = remote.root.getChildTransformNodes(true).find((n) => n.name.startsWith('remotePivot_'));
                    if (pivot) pivot.dispose();
                    remote.aircraftCode = remoteModelFile;
                    this._loadRemoteModel(p.userId, remote.root, remote, remoteModelFile);
                }
                remote.prevState = remote.nextState;
                remote.nextState = p;
                remote.lastUpdateTime = now;
                this._updatePlayerLabel(remote, p);
                if (!remote.engineTypeResolved && p.aircraftId) {
                    this._resolveRemoteEngineType(remote, p.aircraftId);
                }
            }

            for (const [id, remote] of this.remotePlayers) {
                if (!activeIds.has(id)) {
                    remote.labelTexture?.dispose();
                    remote.labelPlane?.dispose();
                    remote.meshes.forEach(m => m.dispose());
                    remote.root.dispose();
                    try { remote.engineSound?.dispose(); } catch (_) { /* ignore */ }
                    this.remotePlayers.delete(id);
                }
            }
        });

        this.mpClient.onPlayerCountChange((count) => {
            if (this.hudOnline) this.hudOnline.textContent = `${count} ONLINE`;
            if (this.dbgMpCount) this.dbgMpCount.textContent = String(count);
            if (this.dbgMpUserId && this.mpClient) {
                this.dbgMpUserId.textContent = String(this.mpClient.userId);
            }
        });

        this.mpClient.onConnectionChange((connected) => {
            if (this.dbgMpStatus) {
                this.dbgMpStatus.textContent = connected ? 'CONNECTED' : 'DISCONNECTED';
                this.dbgMpStatus.style.color = connected ? '#40ffaa' : '#ff5555';
            }
        });

        if (onAuthFailure) this.mpClient.onAuthFailure(onAuthFailure);
        if (onNoFlightHours) this.mpClient.onNoFlightHours(onNoFlightHours);

        this.mpClient.onFlightLogEnded((msg) => {
            if (!this._activeFlightPlanId) return;
            if (msg.status === 'landed') {
                const arrivedAtDest = this._activeFlightPlanArrivalAirportId != null
                    && msg.arrivalAirportId === this._activeFlightPlanArrivalAirportId;
                this._patchFlightPlanStatus(this._activeFlightPlanId, arrivedAtDest ? 'completed' : 'cancelled');
            } else if (msg.status === 'crashed' || msg.status === 'cancelled') {
                this._patchFlightPlanStatus(this._activeFlightPlanId, 'cancelled');
            }
            this._activeFlightPlanId = null;
            this._activeFlightPlanArrivalAirportId = null;
        });

        if (this.dbgMpUserId) this.dbgMpUserId.textContent = '…';
        this.mpClient.connect();
    }

    private _createRemotePlayer(id: string, modelFile?: string): RemotePlayer {
        const scene = this.scene;
        const root = new BABYLON.TransformNode(`remote_${id}`, scene);
        root.rotationQuaternion = BABYLON.Quaternion.Identity();

        const aircraftCode = modelFile || null;
        const remote: RemotePlayer = {
            root, meshes: [], prevState: null, nextState: null, lastUpdateTime: 0,
            aircraftCode, labelPlane: null, labelTexture: null,
            currentUsername: null, currentAvatarUrl: null,
            engineSound: null, engineTypeResolved: false,
        };

        this._loadRemoteModel(id, root, remote, modelFile || DEFAULT_AIRCRAFT_CONFIG.model_file);

        try {
            const engineSound = new EngineSound({ engineType: ENGINE_SOUND_TYPE_TURBOFAN, positional: true });
            engineSound.start();
            engineSound.fadeIn(800);
            remote.engineSound = engineSound;
        } catch (err) {
            console.warn('[Remote] EngineSound init failed:', err);
        }

        return remote;
    }

    private _resolveRemoteEngineType(remote: RemotePlayer, aircraftId: number | undefined): void {
        if (remote.engineTypeResolved || !aircraftId || aircraftId <= 0) return;
        remote.engineTypeResolved = true;
        fetchAircraftConfig(aircraftId).then((cfg) => {
            try {
                remote.engineSound?.setEngineType(this._mapEngineType(cfg.engine_type));
            } catch (err) {
                console.warn('[Remote] setEngineType failed:', err);
            }
        }).catch((err) => {
            console.warn('[Remote] fetch engine type failed:', err);
        });
    }

    private _loadRemoteModel(id: string, root: BABYLON.TransformNode, remote: RemotePlayer, modelFile: string): void {
        const scene = this.scene;
        const lastSlash = modelFile.lastIndexOf('/');
        const folder = lastSlash >= 0 ? modelFile.substring(0, lastSlash + 1) : '';
        const file = lastSlash >= 0 ? modelFile.substring(lastSlash + 1) : modelFile;

        BABYLON.SceneLoader.ImportMesh(
            '', folder, file, scene,
            (meshes: BABYLON.AbstractMesh[]) => {
                if (!meshes.length) return;
                const glbRoot = meshes[0];
                const bb = glbRoot.getHierarchyBoundingVectors(true);
                const center = bb.min.add(bb.max).scale(0.5);
                const size = bb.max.subtract(bb.min).length();

                const pivot = new BABYLON.TransformNode(`remotePivot_${id}`, scene);
                pivot.parent = root;

                glbRoot.parent = pivot;
                const offset = center.negate();
                offset.y = -bb.min.y;
                glbRoot.position = offset;
                glbRoot.rotationQuaternion = null;
                glbRoot.rotation = BABYLON.Vector3.Zero();

                const targetSize = 40;
                const scaleFactor = targetSize / Math.max(size, 0.1);
                pivot.scaling.setAll(scaleFactor);
                pivot.rotation = new BABYLON.Vector3(0, Math.PI, 0);

                meshes.forEach((m) => {
                    m.isPickable = false;
                    remote.meshes.push(m as BABYLON.Mesh);
                });
            },
            null,
            () => {
                this._buildRemoteFallback(id, root, remote);
            },
        );
    }

    private _buildRemoteFallback(id: string, root: BABYLON.TransformNode, remote: RemotePlayer): void {
        const scene = this.scene;
        const mat = new BABYLON.PBRMaterial(`remoteMat_${id}`, scene);
        mat.albedoColor = new BABYLON.Color3(1.0, 0.45, 0.15);
        mat.metallic = 0.6;
        mat.roughness = 0.3;

        const body = BABYLON.MeshBuilder.CreateBox(`rb_${id}`, { width: 2.2, height: 0.65, depth: 7 }, scene);
        const wing = BABYLON.MeshBuilder.CreateBox(`rw_${id}`, { width: 16, height: 0.22, depth: 2.5 }, scene);
        const tail = BABYLON.MeshBuilder.CreateBox(`rt_${id}`, { width: 6, height: 0.18, depth: 1.8 }, scene);
        tail.position.set(0, 0.4, -3.0);
        const finV = BABYLON.MeshBuilder.CreateBox(`rf_${id}`, { width: 0.18, height: 2.8, depth: 2.0 }, scene);
        finV.position.set(0, 1.4, -3.0);
        const nose = BABYLON.MeshBuilder.CreateCylinder(`rn_${id}`, {
            height: 2.5, diameterTop: 0, diameterBottom: 1.5, tessellation: 8,
        }, scene);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, 4.5);

        [body, wing, tail, finV, nose].forEach((m) => {
            m.material = mat;
            m.parent = root;
            m.isPickable = false;
            remote.meshes.push(m);
        });
    }

    private static readonly LABEL_TEX_W = 256;
    private static readonly LABEL_TEX_H = 80;
    private static readonly LABEL_AVATAR_SIZE = 48;
    private static readonly LABEL_PLANE_WIDTH = 18;
    private static readonly LABEL_PLANE_HEIGHT = 5.6;
    private static readonly LABEL_Y_OFFSET = 10;

    private _createPlayerLabel(remote: RemotePlayer, username: string, avatarUrl: string | null): void {
        const scene = this.scene;
        const texW = FlightSceneSimple.LABEL_TEX_W;
        const texH = FlightSceneSimple.LABEL_TEX_H;

        const tex = new BABYLON.DynamicTexture(`playerLabel_${remote.root.name}`, { width: texW, height: texH }, scene, false);
        tex.hasAlpha = true;

        const plane = BABYLON.MeshBuilder.CreatePlane(`playerLabelPlane_${remote.root.name}`, {
            width: FlightSceneSimple.LABEL_PLANE_WIDTH,
            height: FlightSceneSimple.LABEL_PLANE_HEIGHT,
        }, scene);
        plane.parent = remote.root;
        plane.position.y = FlightSceneSimple.LABEL_Y_OFFSET;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;

        const mat = new BABYLON.StandardMaterial(`playerLabelMat_${remote.root.name}`, scene);
        mat.diffuseTexture = tex;
        mat.useAlphaFromDiffuseTexture = true;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        plane.material = mat;

        remote.labelPlane = plane;
        remote.labelTexture = tex;
        remote.currentUsername = username;
        remote.currentAvatarUrl = avatarUrl ?? null;

        this._drawPlayerLabel(tex, username, null);

        if (avatarUrl) {
            this._loadAvatarAndRedraw(tex, username, avatarUrl);
        }
    }

    private _drawPlayerLabel(tex: BABYLON.DynamicTexture, username: string, avatarImg: HTMLImageElement | null): void {
        const texW = FlightSceneSimple.LABEL_TEX_W;
        const texH = FlightSceneSimple.LABEL_TEX_H;
        const avatarSz = FlightSceneSimple.LABEL_AVATAR_SIZE;
        const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

        ctx.clearRect(0, 0, texW, texH);

        const radius = 12;
        const pad = 6;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(0, 0, texW, texH, radius);
        } else {
            ctx.rect(0, 0, texW, texH);
        }
        ctx.fill();

        ctx.strokeStyle = 'rgba(64, 255, 170, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(0, 0, texW, texH, radius);
        } else {
            ctx.rect(0, 0, texW, texH);
        }
        ctx.stroke();

        const cx = pad + avatarSz / 2;
        const cy = texH / 2;
        const r = avatarSz / 2 - 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        if (avatarImg) {
            ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
        } else {
            ctx.fillStyle = '#2a6e4e';
            ctx.fill();
            const initials = username.substring(0, 2).toUpperCase();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(initials, cx, cy + 1);
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(64, 255, 170, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        const textX = pad + avatarSz + 8;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const maxTextW = texW - textX - pad;
        ctx.fillText(username, textX, cy, maxTextW);

        tex.update();
    }

    private _loadAvatarAndRedraw(tex: BABYLON.DynamicTexture, username: string, avatarUrl: string): void {
        const img = new Image();
        img.onload = () => this._drawPlayerLabel(tex, username, img);
        img.onerror = () => this._drawPlayerLabel(tex, username, null);
        img.src = avatarUrl;
    }

    private _updatePlayerLabel(remote: RemotePlayer, state: PlayerState): void {
        const username = state.username || `Pilot ${state.userId.slice(-4)}`;
        if (!username) return;

        const avatarUrl = state.avatarUrl ?? null;
        const nameChanged = remote.currentUsername !== username;
        const avatarChanged = remote.currentAvatarUrl !== avatarUrl;

        if (!remote.labelPlane) {
            this._createPlayerLabel(remote, username, avatarUrl);
            return;
        }

        if (!nameChanged && !avatarChanged) return;

        remote.currentUsername = username;
        remote.currentAvatarUrl = avatarUrl;

        if (avatarUrl) {
            this._loadAvatarAndRedraw(remote.labelTexture!, username, avatarUrl);
        } else {
            this._drawPlayerLabel(remote.labelTexture!, username, null);
        }
    }

    private _latLonToLocal(lat: number, lon: number, alt: number): BABYLON.Vector3 {
        const metersPerDegLat = 111320;
        const metersPerDegLon = 111320 * Math.cos(this.originLat * Math.PI / 180);
        const x = (lon - this.originLon) * metersPerDegLon;
        const z = -(lat - this.originLat) * metersPerDegLat;
        return new BABYLON.Vector3(x, alt - this.refAlt, z);
    }

    private _updateRemotePlayers(): void {
        const now = performance.now();

        try {
            if (this.camera) {
                const camPos = this.camera.position;
                AudioCore.setListenerPosition(camPos.x, camPos.y, camPos.z);
                const target = this.camera.getTarget();
                const fx = target.x - camPos.x;
                const fy = target.y - camPos.y;
                const fz = target.z - camPos.z;
                const fLen = Math.max(1e-6, Math.sqrt(fx * fx + fy * fy + fz * fz));
                AudioCore.setListenerOrientation(fx / fLen, fy / fLen, fz / fLen, 0, 1, 0);
            }
        } catch (_) { /* ignore */ }

        for (const [, remote] of this.remotePlayers) {
            if (!remote.nextState) continue;

            const ns = remote.nextState;
            const targetPos = this._latLonToLocal(ns.lat, ns.lon, ns.alt);

            if (remote.prevState) {
                const elapsed = now - remote.lastUpdateTime;
                const t = Math.min(1, elapsed / 60);
                const ps = remote.prevState;
                const prevPos = this._latLonToLocal(ps.lat, ps.lon, ps.alt);
                remote.root.position = BABYLON.Vector3.Lerp(prevPos, targetPos, t);
            } else {
                remote.root.position.copyFrom(targetPos);
            }

            const yawRad = (180 - ns.heading) * Math.PI / 180;
            const pitchRad = -ns.pitch * Math.PI / 180;
            const rollRad = ns.roll * Math.PI / 180;

            const yawQ = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), yawRad);
            const pitchQ = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Right(), pitchRad);
            const rollQ = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Forward(), rollRad);
            const targetQ = yawQ.multiply(pitchQ).multiply(rollQ);

            BABYLON.Quaternion.SlerpToRef(
                remote.root.rotationQuaternion!,
                targetQ,
                0.15,
                remote.root.rotationQuaternion!,
            );

            const es = remote.engineSound;
            if (es) {
                try {
                    const pos = remote.root.position;
                    es.setPosition(pos.x, pos.y, pos.z);
                    const tt = Number.isFinite(ns.throttle) ? Math.max(0, Math.min(1.5, ns.throttle)) : 0;
                    es.setThrottle(tt);
                    const estimatedRpm = 600 + tt * 2000;
                    es.setRpm(estimatedRpm);
                    es.update();
                } catch (_) { /* ignore */ }
            }
        }
    }

    private _sendOwnState(): void {
        if (!this.mpClient || !this.spawned) return;
        const { lat, lon, hdg } = this._getCurrentLatLon();
        const pos = this.planeRoot.position;

        const wm = this.planeRoot.getWorldMatrix();
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), wm, this._tmpFwd);
        this._tmpFwd.normalize();
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(1, 0, 0), wm, this._tmpRight);
        this._tmpRight.normalize();
        this._tmpUp.set(0, 1, 0);
        const pitchDeg = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(this._tmpFwd, this._tmpUp)))) * 180 / Math.PI;
        const rollDeg = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(this._tmpRight, this._tmpUp)))) * 180 / Math.PI;

        const aircraftIdToSend = this.aircraftConfig.id && this.aircraftConfig.id > 0
            ? this.aircraftConfig.id
            : undefined;

        if (aircraftIdToSend !== this._lastSentAircraftId) {
            if (aircraftIdToSend) {
                console.log(`[Flight] sendUpdate now sending aircraftId=${aircraftIdToSend} code=${this.aircraftConfig.code} -- flight log persistence ENABLED`);
            } else {
                console.warn(`[Flight] sendUpdate sending aircraftId=undefined (aircraftConfig.id=${this.aircraftConfig.id}) -- flight log persistence DISABLED on server`);
            }
            this._lastSentAircraftId = aircraftIdToSend;
        }

        this.mpClient.sendUpdate({
            lat, lon,
            alt: this.refAlt + pos.y,
            airspeed: this.velocity.length() * 3.6,
            throttle: this.thrust,
            heading: hdg,
            pitch: pitchDeg,
            roll: rollDeg,
            onGround: this.isOnGround,
            aircraftId: aircraftIdToSend,
            aircraftCode: this.aircraftConfig.code || undefined,
            aircraftModelFile: this.aircraftConfig.model_file || undefined,
            flightPlanId: this._activeFlightPlanId ?? undefined,
            missionId: this._activeMissionId ?? undefined,
        });

        this._checkWaypointProgress(lat, lon);
    }

    private _checkWaypointProgress(lat: number, lon: number): void {
        if (!this._missionWaypoints.length) return;
        if (this._missionCurrentWpIndex >= this._missionWaypoints.length) return;
        const total = this._missionWaypoints.length;
        const idx = this._missionCurrentWpIndex;
        const wp = this._missionWaypoints[idx];
        const wpLat = Number(wp.latitude);
        const wpLon = Number(wp.longitude);
        if (!Number.isFinite(wpLat) || !Number.isFinite(wpLon)) {
            console.warn(`[Mission] Skipping invalid waypoint idx=${idx} order=${wp.order_index} lat=${wp.latitude} lon=${wp.longitude}`);
            this._missionCurrentWpIndex++;
            return;
        }
        const dist = this._haversineNm(lat, lon, wpLat, wpLon);
        if (dist <= FlightSceneSimple.WAYPOINT_REACH_NM) {
            const reachedNum = idx + 1;
            console.log(`[Mission] WP ${reachedNum}/${total} reached: order=${wp.order_index} name="${wp.name ?? 'unnamed'}" dist=${dist.toFixed(3)}nm reach=${FlightSceneSimple.WAYPOINT_REACH_NM}nm`);
            this._missionCurrentWpIndex++;
            if (this._missionCurrentWpIndex >= total) {
                if (this._activeUserMissionId) {
                    console.log(`[Mission] All ${total} waypoints reached, calling /complete for userMissionId=${this._activeUserMissionId}`);
                    this._completeActiveMission();
                } else if (this._activeFlightPlanId) {
                    console.log(`[FlightPlan] All ${total} waypoints reached, marking plan ${this._activeFlightPlanId} as completed`);
                    this._patchFlightPlanStatus(this._activeFlightPlanId, 'completed');
                    this._activeFlightPlanId = null;
                    this._missionWaypoints = [];
                    this._missionCurrentWpIndex = 0;
                }
            }
        }
    }

    private async _completeActiveMission(): Promise<void> {
        const umId = this._activeUserMissionId;
        if (!umId || this._completedUserMissionIds.has(umId) || this._missionCompletionInFlight) return;
        this._missionCompletionInFlight = true;
        const completedTitle = this._activeMission?.mission_title || '';
        try {
            const token = localStorage.getItem('auth_token') || '';
            const res = await fetch(`/api/user-missions/${umId}/complete`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                console.log(`[Mission] Completed userMissionId=${umId}`);
                this._completedUserMissionIds.add(umId);
                this._activeMissionId = null;
                this._activeUserMissionId = null;
                this._activeMission = null;
                this._missionWaypoints = [];
                this._showMissionCompleteToast(completedTitle);
                this._loadMissions();
            } else {
                console.warn(`[Mission] Complete failed: HTTP ${res.status}`);
            }
        } catch (err) {
            console.error('[Mission] Complete error:', err);
        } finally {
            this._missionCompletionInFlight = false;
        }
    }

    private _showMissionCompleteToast(missionTitle: string): void {
        try {
            if (typeof document === 'undefined' || !document.body) {
                console.warn('[Mission] Toast skipped: document or body unavailable');
                return;
            }
            const existing = document.getElementById('mission-complete-toast');
            if (existing && existing.parentElement) existing.parentElement.removeChild(existing);

            const toast = document.createElement('div');
            toast.id = 'mission-complete-toast';
            const safeTitle = String(missionTitle ?? '').replace(/[<>&"']/g, (ch) => ({
                '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\'': '&#39;',
            } as Record<string, string>)[ch] || ch);
            toast.innerHTML = `
                <div class="mct-card">
                    <div class="mct-title">MISSÃO CONCLUÍDA</div>
                    ${safeTitle ? `<div class="mct-sub">${safeTitle}</div>` : ''}
                </div>
            `;
            toast.style.cssText = [
                'position:fixed',
                'top:80px',
                'left:50%',
                'transform:translateX(-50%) translateY(-12px)',
                'z-index:10000',
                'pointer-events:none',
                'opacity:0',
                `transition:opacity ${MISSION_TOAST_FADE_MS}ms ease, transform ${MISSION_TOAST_FADE_MS}ms ease`,
                'font-family:Orbitron,monospace',
            ].join(';');

            const style = document.createElement('style');
            style.textContent = `
                #mission-complete-toast .mct-card {
                    background: linear-gradient(180deg, rgba(0,40,20,0.92), rgba(0,20,10,0.92));
                    border: 1px solid rgba(0,255,128,0.7);
                    border-radius: 8px;
                    padding: 14px 28px;
                    color: #79ffaa;
                    text-align: center;
                    box-shadow: 0 4px 24px rgba(0,255,128,0.25), 0 0 40px rgba(0,255,128,0.15);
                    min-width: 240px;
                }
                #mission-complete-toast .mct-title {
                    font-size: 18px;
                    font-weight: 700;
                    letter-spacing: 0.18em;
                    text-shadow: 0 0 10px rgba(0,255,128,0.6);
                }
                #mission-complete-toast .mct-sub {
                    font-family: Inter, sans-serif;
                    font-size: 12px;
                    color: rgba(255,255,255,0.85);
                    margin-top: 6px;
                    letter-spacing: 0.04em;
                }
            `;
            toast.appendChild(style);
            document.body.appendChild(toast);

            requestAnimationFrame(() => {
                if (this._disposed || !toast.isConnected) return;
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(-50%) translateY(0)';
            });

            this._safeSetTimeout(() => {
                if (!toast.isConnected) return;
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(-12px)';
                this._safeSetTimeout(() => {
                    if (toast.parentElement) toast.parentElement.removeChild(toast);
                }, MISSION_TOAST_FADE_MS);
            }, MISSION_TOAST_VISIBLE_MS);

            try { this._doHaptic([60, 60, 120]); } catch { /* ignore */ }
        } catch (err) {
            console.warn('[Mission] Failed to show completion toast:', err);
        }
    }

    // ── 3D Tiles (Step 1: just load, no coord changes) ────────────────────────

    private _init3DTiles(scene: BABYLON.Scene): void {
        const params = new URLSearchParams(window.location.search);
        const apiKey: string = __GOOGLE_MAPS_API_KEY__ || '';
        if (!apiKey) {
            console.warn('[3DTiles] No GOOGLE_MAPS_API_KEY in .env — skipping.');
            return;
        }

        const hasPlan = this._pendingFlightPlanLat != null;
        const hasMission = this._pendingMissionLat != null;
        let lat: number, lon: number, alt: number;
        if (hasPlan) {
            lat = this._pendingFlightPlanLat!;
            lon = this._pendingFlightPlanLon!;
            alt = this._pendingFlightPlanAltM! + GROUND_Y;
            this.initialHeading = this._pendingFlightPlanHdg!;
        } else if (hasMission) {
            lat = this._pendingMissionLat!;
            lon = this._pendingMissionLon!;
            alt = (this._pendingMissionAltM || 0) + GROUND_Y;
            this.initialHeading = this._pendingMissionHdg || 0;
        } else {
            lat = parseFloat(params.get('lat') || '-23.4341');
            lon = parseFloat(params.get('lng') || '-46.4825');
            alt = parseFloat(params.get('alt') || '750');
            this.initialHeading = parseFloat(params.get('hdg') || '74');
        }
        const hasFlightPlanParam = params.has('flightPlanId');
        this.spawnAirborne = this._pendingMissionAirborne ? true : ((hasPlan || hasFlightPlanParam) ? false : params.has('lat'));
        if (hasPlan) console.log(`[FlightPlan] Ground spawn at runway lat=${lat} lon=${lon} hdg=${this.initialHeading}`);
        if (hasMission) console.log(`[Mission] Spawn at lat=${lat} lon=${lon} hdg=${this.initialHeading} airborne=${this._pendingMissionAirborne}`);
        this.originLat = lat;
        this.originLon = lon;
        this.mapApiKey = apiKey;

        const url = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`;
        this.tiles = new TilesRenderer(url, scene);
        this.tiles.errorTarget = 6;
        (this.tiles as any).maxDepth = 100;
        (this.tiles as any).errorThreshold = 60;
        this.tiles.lruCache.maxSize = 2000;
        this.tiles.lruCache.minSize = 800;
        try {
            this.tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
        } catch (e) { console.warn('[3DTiles] Auth plugin failed:', e); }

        const latRad = lat * Math.PI / 180;
        const lonRad = lon * Math.PI / 180;
        const sinLat = Math.sin(latRad);
        const cosLat = Math.cos(latRad);
        const sinLon = Math.sin(lonRad);
        const cosLon = Math.cos(lonRad);

        const WGS84_A  = 6378137.0;
        const WGS84_E2 = 0.00669437999014;
        const refAlt = alt - GROUND_Y;
        this.refAlt = refAlt;
        const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
        const px = (N + refAlt) * cosLat * cosLon;
        const py = (N + refAlt) * cosLat * sinLon;
        const pz = (N * (1 - WGS84_E2) + refAlt) * sinLat;

        const east  = new BABYLON.Vector3(-sinLon, cosLon, 0);
        const up    = new BABYLON.Vector3(cosLat * cosLon, cosLat * sinLon, sinLat);
        const south = new BABYLON.Vector3(sinLat * cosLon, sinLat * sinLon, -cosLat);

        const T = BABYLON.Matrix.Translation(-px, -py, -pz);
        const R = new BABYLON.Matrix();
        BABYLON.Matrix.FromXYZAxesToRef(east, up, south, R);
        R.transposeToRef(R);
        const M = T.multiply(R);

        this.tiles.group.rotationQuaternion = BABYLON.Quaternion.Identity();
        M.decompose(
            this.tiles.group.scaling,
            this.tiles.group.rotationQuaternion,
            this.tiles.group.position,
        );

        console.info(`[3DTiles] ENU transform at (${lat}, ${lon}, alt=${alt}). Group pos: ${this.tiles.group.position}`);
    }

    // ── Lighting ─────────────────────────────────────────────────────────────

    private _setupLighting(scene: BABYLON.Scene): void {
        this._hemiLight = new BABYLON.HemisphericLight('sky', new BABYLON.Vector3(0, 1, 0), scene);
        this._hemiLight.intensity = 0.5;
        this._hemiLight.diffuse = new BABYLON.Color3(0.6, 0.75, 1.0);
        this._hemiLight.groundColor = new BABYLON.Color3(0.25, 0.35, 0.18);

        this._sunLight = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.4, -0.9, -0.3).normalize(), scene);
        this._sunLight.position = new BABYLON.Vector3(800, 1200, 800);
        this._sunLight.intensity = 3.0;
        this._sunLight.diffuse = new BABYLON.Color3(1.0, 0.92, 0.75);
        this._sunLight.specular = new BABYLON.Color3(1.0, 0.9, 0.6);

        this._fillLight = new BABYLON.DirectionalLight('fill', new BABYLON.Vector3(0.4, -0.3, 0.3).normalize(), scene);
        this._fillLight.intensity = 0.6;
        this._fillLight.diffuse = new BABYLON.Color3(0.6, 0.7, 0.9);
        this._fillLight.specular = BABYLON.Color3.Black();

        this._shadowGen = new BABYLON.CascadedShadowGenerator(4096, this._sunLight);
        this._shadowGen.lambda                 = 0.75;
        this._shadowGen.cascadeBlendPercentage = 0.1;
        this._shadowGen.depthClamp             = true;
        this._shadowGen.autoCalcDepthBounds    = true;
        this._shadowGen.stabilizeCascades      = true;
        this._shadowGen.numCascades            = 4;
        this._shadowGen.penumbraDarkness       = 0.6;
        this._shadowGen.usePercentageCloserFiltering = true;
        (this._shadowGen as any).filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
        (this as any)._shadow = this._shadowGen;

        scene.environmentIntensity = 1.3;

        this._buildSunMesh(scene);
        this._buildStars(scene);
        this._buildMoon(scene);
        this._applyDayNightCycle(scene);
    }

    private _buildSunMesh(scene: BABYLON.Scene): void {
        this._sunMesh = BABYLON.MeshBuilder.CreateSphere('sunMesh', { diameter: SUN_DIAMETER, segments: 32 }, scene);
        this._sunMesh.isPickable = false;
        this._sunMesh.infiniteDistance = true;
        this._sunMesh.applyFog = false;
        this._sunMesh.renderingGroupId = 0;

        this._sunMeshMat = new BABYLON.StandardMaterial('sunMeshMat', scene);
        try {
            const tex = new BABYLON.Texture(SUN_TEXTURE_PATH, scene);
            tex.hasAlpha = false;
            this._sunMeshMat.emissiveTexture = tex;
            this._sunMeshMat.diffuseTexture = tex;
        } catch (err) {
            console.warn('[Sky] Failed to load sun texture, falling back to plain emissive', err);
        }
        this._sunMeshMat.emissiveColor = new BABYLON.Color3(1.0, 0.95, 0.85);
        this._sunMeshMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        this._sunMeshMat.specularColor = new BABYLON.Color3(0, 0, 0);
        this._sunMeshMat.disableLighting = true;
        this._sunMeshMat.backFaceCulling = true;
        this._sunMesh.material = this._sunMeshMat;

        this._buildSunHalo(scene);
    }

    private _buildSunHalo(scene: BABYLON.Scene): void {
        const halo = BABYLON.MeshBuilder.CreatePlane('sunHalo', { size: SUN_HALO_SIZE }, scene);
        halo.isPickable = false;
        halo.infiniteDistance = true;
        halo.applyFog = false;
        halo.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        halo.renderingGroupId = 0;

        const haloTex = new BABYLON.DynamicTexture('sunHaloTex', { width: SUN_HALO_TEX_SIZE, height: SUN_HALO_TEX_SIZE }, scene, true);
        const ctx = haloTex.getContext() as CanvasRenderingContext2D;
        const cx = SUN_HALO_TEX_SIZE / 2;
        const cy = SUN_HALO_TEX_SIZE / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
        grad.addColorStop(0.00, 'rgba(255, 240, 200, 1.00)');
        grad.addColorStop(0.18, 'rgba(255, 215, 140, 0.65)');
        grad.addColorStop(0.45, 'rgba(255, 180, 120, 0.22)');
        grad.addColorStop(1.00, 'rgba(255, 160,  90, 0.00)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SUN_HALO_TEX_SIZE, SUN_HALO_TEX_SIZE);
        haloTex.hasAlpha = true;
        haloTex.update();

        const mat = new BABYLON.StandardMaterial('sunHaloMat', scene);
        mat.emissiveTexture = haloTex;
        mat.opacityTexture = haloTex;
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        halo.material = mat;

        this._sunHaloMesh = halo;
        this._sunHaloMat = mat;
    }

    private _buildStars(scene: BABYLON.Scene): void {
        this._starRoot = new BABYLON.TransformNode('starRoot', scene);
        this._starInstances = [];
        this._starPhases = [];
        this._starBaseScales = [];

        const starColors = [
            new BABYLON.Color3(1.0, 0.85, 0.7),
            new BABYLON.Color3(1.0, 0.95, 0.9),
            new BABYLON.Color3(1.0, 1.0, 1.0),
            new BABYLON.Color3(0.85, 0.9, 1.0),
            new BABYLON.Color3(0.7, 0.8, 1.0),
        ];

        const starMats = starColors.map((c, i) => {
            const mat = new BABYLON.StandardMaterial(`starMat${i}`, scene);
            mat.emissiveColor = c;
            mat.disableLighting = true;
            return mat;
        });

        const baseStar = BABYLON.MeshBuilder.CreatePlane('starBase', { size: 1 }, scene);
        baseStar.material = starMats[2];
        baseStar.isVisible = false;
        baseStar.parent = this._starRoot;

        const starDist = 50000;
        const STAR_COUNT = 800;
        const baseStars: BABYLON.Mesh[] = [baseStar];
        for (let m = 0; m < starMats.length; m++) {
            if (m === 2) continue;
            const bs = BABYLON.MeshBuilder.CreatePlane(`starBase${m}`, { size: 1 }, scene);
            bs.material = starMats[m];
            bs.isVisible = false;
            bs.parent = this._starRoot;
            baseStars[m] = bs;
        }
        baseStars[2] = baseStar;

        for (let i = 0; i < STAR_COUNT; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const cosP = Math.abs(Math.cos(phi));
            if (cosP < 0.03) continue;
            const x = starDist * Math.sin(phi) * Math.cos(theta);
            const y = starDist * cosP;
            const z = starDist * Math.sin(phi) * Math.sin(theta);
            const matIdx = Math.floor(Math.random() * starMats.length);
            const inst = baseStars[matIdx].createInstance('star_' + i);
            inst.position.set(x, y, z);
            const magnitude = Math.random();
            const sz = 8 + magnitude * 50;
            inst.scaling.setAll(sz);
            inst.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            inst.isPickable = false;

            this._starInstances.push(inst);
            this._starPhases.push(Math.random() * Math.PI * 2);
            this._starBaseScales.push(sz);
        }

        const brightColors = [
            new BABYLON.Color3(1.00, 0.98, 0.95),
            new BABYLON.Color3(1.00, 0.85, 0.55),
            new BABYLON.Color3(0.80, 0.90, 1.00),
            new BABYLON.Color3(1.00, 0.55, 0.40),
            new BABYLON.Color3(1.00, 1.00, 0.75),
        ];
        const brightMats = brightColors.map((c, i) => {
            const m = new BABYLON.StandardMaterial(`brightStarMat${i}`, scene);
            m.emissiveColor = c;
            m.disableLighting = true;
            m.diffuseColor = new BABYLON.Color3(0, 0, 0);
            m.specularColor = new BABYLON.Color3(0, 0, 0);
            return m;
        });
        const brightBases: BABYLON.Mesh[] = brightMats.map((mat, i) => {
            const b = BABYLON.MeshBuilder.CreatePlane(`brightStarBase${i}`, { size: 1 }, scene);
            b.material = mat;
            b.isVisible = false;
            b.parent = this._starRoot;
            return b;
        });

        for (let i = 0; i < BRIGHT_STAR_COUNT; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const cosP = Math.abs(Math.cos(phi));
            if (cosP < 0.05) continue;
            const x = starDist * Math.sin(phi) * Math.cos(theta);
            const y = starDist * cosP;
            const z = starDist * Math.sin(phi) * Math.sin(theta);
            const matIdx = Math.floor(Math.random() * brightBases.length);
            const inst = brightBases[matIdx].createInstance('brightStar_' + i);
            inst.position.set(x, y, z);
            const sz = BRIGHT_STAR_BASE_SIZE + Math.random() * BRIGHT_STAR_SIZE_RANDOM;
            inst.scaling.setAll(sz);
            inst.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            inst.isPickable = false;
            this._starInstances.push(inst);
            this._starPhases.push(Math.random() * Math.PI * 2);
            this._starBaseScales.push(sz);
        }

        this._starRoot.setEnabled(false);
    }

    private _buildMoon(scene: BABYLON.Scene): void {
        this._moonMesh = BABYLON.MeshBuilder.CreateSphere('moonMesh', { diameter: MOON_DIAMETER, segments: 32 }, scene);
        this._moonMesh.isPickable = false;
        this._moonMesh.infiniteDistance = true;
        this._moonMesh.applyFog = false;
        this._moonMesh.renderingGroupId = 0;

        this._moonMat = new BABYLON.StandardMaterial('moonMat', scene);
        try {
            const tex = new BABYLON.Texture(MOON_TEXTURE_PATH, scene);
            tex.hasAlpha = false;
            this._moonMat.diffuseTexture = tex;
            this._moonMat.emissiveTexture = tex;
        } catch (err) {
            console.warn('[Sky] Failed to load moon texture, falling back to plain emissive', err);
        }
        this._moonMat.emissiveColor = new BABYLON.Color3(0.75, 0.78, 0.85);
        this._moonMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.08);
        this._moonMat.specularColor = new BABYLON.Color3(0, 0, 0);
        this._moonMat.disableLighting = true;
        this._moonMat.backFaceCulling = true;
        this._moonMesh.material = this._moonMat;
        this._moonMesh.isVisible = false;

        this._buildMoonHalo(scene);
    }

    private _buildMoonHalo(scene: BABYLON.Scene): void {
        const halo = BABYLON.MeshBuilder.CreatePlane('moonHalo', { size: MOON_HALO_SIZE }, scene);
        halo.isPickable = false;
        halo.infiniteDistance = true;
        halo.applyFog = false;
        halo.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        halo.renderingGroupId = 0;

        const haloTex = new BABYLON.DynamicTexture('moonHaloTex', { width: MOON_HALO_TEX_SIZE, height: MOON_HALO_TEX_SIZE }, scene, true);
        const ctx = haloTex.getContext() as CanvasRenderingContext2D;
        const cx = MOON_HALO_TEX_SIZE / 2;
        const cy = MOON_HALO_TEX_SIZE / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
        grad.addColorStop(0.00, 'rgba(190, 210, 235, 0.70)');
        grad.addColorStop(0.30, 'rgba(140, 170, 220, 0.25)');
        grad.addColorStop(1.00, 'rgba( 80, 100, 160, 0.00)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, MOON_HALO_TEX_SIZE, MOON_HALO_TEX_SIZE);
        haloTex.hasAlpha = true;
        haloTex.update();

        const mat = new BABYLON.StandardMaterial('moonHaloMat', scene);
        mat.emissiveTexture = haloTex;
        mat.opacityTexture = haloTex;
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        halo.material = mat;
        halo.isVisible = false;

        this._moonHaloMesh = halo;
        this._moonHaloMat = mat;
    }

    private _updateStarTwinkle(dt: number): void {
        if (!this._starRoot || !this._starRoot.isEnabled()) return;
        this._starTime += dt;
        if (this._starTime > 10000) this._starTime -= 10000;
        for (let i = 0; i < this._starInstances.length; i++) {
            const phase = this._starPhases[i];
            const base = this._starBaseScales[i];
            const flicker = 0.7 + 0.3 * Math.sin(this._starTime * (1.5 + phase) + phase * 6.28);
            this._starInstances[i].scaling.setAll(base * flicker);
        }
    }

    private _getSimDate(): Date {
        return new Date(Date.now() + this._simTimeOffsetMs);
    }

    private _applyDayNightCycle(scene: BABYLON.Scene): void {
        const { elevation, azimuth } = getSunPosition(this.originLat, this.originLon, this._getSimDate());
        this._sunElevation = elevation;
        const rad = Math.PI / 180;
        const elevR = elevation * rad;
        const azR = azimuth * rad;

        const sunDirX = -Math.sin(azR) * Math.cos(elevR);
        const sunDirY = -Math.sin(elevR);
        const sunDirZ = -Math.cos(azR) * Math.cos(elevR);
        const sunDir = new BABYLON.Vector3(sunDirX, sunDirY, sunDirZ).normalize();

        const sunPosX = Math.sin(azR) * Math.cos(elevR);
        const sunPosY = Math.sin(elevR);
        const sunPosZ = Math.cos(azR) * Math.cos(elevR);

        if (this._sunLight) {
            this._sunLight.direction = sunDir;
            this._sunLight.position = sunDir.scale(-1200);
        }

        const sunWorldPos = sunDir.scale(-SUN_DISTANCE);
        if (this._sunMesh) {
            this._sunMesh.position = sunWorldPos;
            const fadeRange = (SUN_FADE_START_ELEV_DEG - SUN_FADE_END_ELEV_DEG) || 1;
            const sunVisFade = Math.max(0, Math.min(1, (elevation - SUN_FADE_END_ELEV_DEG) / fadeRange));
            this._sunMesh.visibility = sunVisFade;
            this._sunMesh.isVisible = sunVisFade > 0.01;
        }

        if (this._sunHaloMesh && this._sunHaloMat) {
            this._sunHaloMesh.position = sunWorldPos.clone();
            const horizonT = 1.0 - Math.max(0, Math.min(1, elevation / 30));
            const baseFade = Math.max(0, Math.min(1, (elevation + 4) / 10));
            const haloAlpha = baseFade * (0.55 + horizonT * 0.40);
            this._sunHaloMat.alpha = haloAlpha;
            const haloR = 1.0;
            const haloG = 0.95 - horizonT * 0.45;
            const haloB = 0.85 - horizonT * 0.65;
            this._sunHaloMat.emissiveColor.set(haloR, Math.max(haloG, 0.2), Math.max(haloB, 0.1));
            this._sunHaloMesh.isVisible = haloAlpha > 0.02;
        }

        if (this._lensFlareSystem) {
            this._lensFlareSystem.isEnabled = elevation > 1 && !this._flareOccluded;
        }
        this._updateColorGrading(elevation);

        if (this._skyMaterial) {
            this._skyMaterial.sunPosition = new BABYLON.Vector3(sunPosX * 1000, sunPosY * 1000, sunPosZ * 1000);
            const lumT = Math.max(0, Math.min(1, (elevation + 5) / 20));
            this._skyMaterial.luminance = Math.min(SKY_LUMINANCE_MAX, 0.01 + lumT * 1.19);
            const sunsetT = 1.0 - Math.max(0, Math.min(1, Math.abs(elevation) / 10));
            this._skyMaterial.turbidity = 8 + sunsetT * 6;
            this._skyMaterial.rayleigh = 1.5 + lumT * 1.5;
            this._skyMaterial.mieCoefficient = 0.005 + sunsetT * 0.015;
            const elevForG = Math.max(0, Math.min(SKY_MIE_G_TRANSITION_DEG, elevation));
            const gT = elevForG / SKY_MIE_G_TRANSITION_DEG;
            this._skyMaterial.mieDirectionalG = SKY_MIE_G_LOW_HORIZON + (SKY_MIE_G_HIGH_SUN - SKY_MIE_G_LOW_HORIZON) * gT;
        }

        const t = Math.max(0, Math.min(1, (elevation + 6) / 30));

        if (this._sunLight) {
            this._sunLight.intensity = 0.1 + t * 2.9;
            const r = 0.3 + t * 0.7;
            const g = 0.25 + t * 0.67;
            const b = 0.2 + t * 0.55;
            this._sunLight.diffuse.set(r, g, b);
            this._sunLight.specular.set(r, g * 0.98, b * 0.8);
        }

        if (this._hemiLight) {
            this._hemiLight.intensity = 0.03 + t * 0.47;
            this._hemiLight.diffuse.set(0.1 + t * 0.5, 0.12 + t * 0.63, 0.2 + t * 0.8);
            this._hemiLight.groundColor.set(0.02 + t * 0.23, 0.03 + t * 0.32, 0.04 + t * 0.14);
        }

        if (this._fillLight) {
            this._fillLight.intensity = 0.05 + t * 0.55;
        }

        if (this._sunMeshMat) {
            const warmth = Math.max(0, Math.min(1, elevation / 15));
            this._sunMeshMat.emissiveColor.set(1.0, 0.7 + warmth * 0.25, 0.3 + warmth * 0.4);
        }

        const fogR = 0.02 + t * 0.53;
        const fogG = 0.02 + t * 0.68;
        const fogB = 0.06 + t * 0.89;
        scene.fogColor.set(fogR, fogG, fogB);

        const nightGlowT = Math.max(0, Math.min(1, (NIGHT_HORIZON_GLOW_OFFSET_DEG - elevation) / NIGHT_HORIZON_GLOW_FADE_BAND_DEG));
        const clearR = fogR * 0.5 + NIGHT_HORIZON_GLOW_R * nightGlowT;
        const clearG = fogG * 0.5 + NIGHT_HORIZON_GLOW_G * nightGlowT;
        const clearB = fogB * 0.6 + NIGHT_HORIZON_GLOW_B * nightGlowT;
        scene.clearColor.set(clearR, clearG, clearB, 1);

        scene.environmentIntensity = 0.15 + t * 1.15;

        if (this._pipeline) {
            this._pipeline.imageProcessing.exposure = 0.7 + t * 1.1;
        }

        if (this._moonMesh) {
            const moonY = -sunPosY;
            const moonPosX = -sunPosX * MOON_DISTANCE;
            const moonPosY = Math.max(moonY * MOON_DISTANCE, 500);
            const moonPosZ = -sunPosZ * MOON_DISTANCE;
            this._moonMesh.position.set(moonPosX, moonPosY, moonPosZ);
            const moonVisible = elevation < MOON_FADE_ELEV_DEG && moonY > -0.05;
            this._moonMesh.isVisible = moonVisible;
            if (this._moonMat) {
                const moonBright = Math.max(0, Math.min(1, (MOON_FADE_ELEV_DEG - elevation) / 15));
                this._moonMat.emissiveColor.set(0.75 * moonBright, 0.78 * moonBright, 0.85 * moonBright);
            }
            if (this._moonHaloMesh && this._moonHaloMat) {
                this._moonHaloMesh.position.set(moonPosX, moonPosY, moonPosZ);
                const haloAlpha = Math.max(0, Math.min(1, (-elevation - MOON_HALO_FADE_OFFSET_DEG) / MOON_HALO_FADE_BAND_DEG)) * 0.7;
                this._moonHaloMat.alpha = haloAlpha;
                this._moonHaloMesh.isVisible = moonVisible && haloAlpha > 0.02;
            }
        }

        if (this._starRoot) {
            const starFade = Math.max(0, Math.min(1, (-elevation + 5) / 12));
            const starsActive = starFade > 0.05;
            this._starRoot.setEnabled(starsActive);
            if (this._milkyWayRoot) this._milkyWayRoot.setEnabled(starsActive);
        }

        this._applyCloudTint(elevation);
    }

    // ── Skybox ────────────────────────────────────────────────────────────────

    private _buildSkybox(scene: BABYLON.Scene): void {
        const envTex = BABYLON.CubeTexture.CreateFromPrefilteredData(
            'https://assets.babylonjs.com/environments/environmentSpecular.env', scene,
        );
        scene.environmentTexture = envTex;

        this._skyMaterial = new SkyMaterial('skyMat', scene);
        this._skyMaterial.backFaceCulling = false;
        this._skyMaterial.useSunPosition = true;
        this._skyMaterial.sunPosition = new BABYLON.Vector3(0, 100, 0);
        this._skyMaterial.turbidity = 10;
        this._skyMaterial.rayleigh = 2;
        this._skyMaterial.mieCoefficient = 0.005;
        this._skyMaterial.mieDirectionalG = 0.8;
        this._skyMaterial.luminance = 1.0;

        this._skyboxMesh = BABYLON.MeshBuilder.CreateBox('skyBox', { size: 10_000_000 }, scene);
        this._skyboxMesh.material = this._skyMaterial;
        this._skyboxMesh.infiniteDistance = true;
        this._skyboxMesh.isPickable = false;
        this._skyboxMesh.applyFog = false;
        this._skyboxMesh.renderingGroupId = 0;
        this._skyboxMesh.freezeWorldMatrix();
    }

    // ── Clouds ─────────────────────────────────────────────────────────────────

    private cloudInstances: { mesh: BABYLON.InstancedMesh; yBase: number; spread: number; windMult: number }[] = [];
    private _cloudMats: BABYLON.StandardMaterial[] = [];

    private _buildClouds(scene: BABYLON.Scene): void {
        const tex = new BABYLON.Texture(CLOUD_TEXTURE_URL, scene);
        tex.hasAlpha = true;

        const layers: { count: number; yMin: number; yRange: number; spread: number; sizeBase: number; aspectY: number; windMult: number }[] = [
            { count: 40, yMin: 600,  yRange: 800,  spread: 15000, sizeBase: 700,  aspectY: 0.60, windMult: 1.0 },
            { count: 50, yMin: 1800, yRange: 1200, spread: 20000, sizeBase: 1000, aspectY: 0.50, windMult: 1.6 },
            { count: 35, yMin: 4000, yRange: 2500, spread: 25000, sizeBase: 1500, aspectY: 0.25, windMult: 3.0 },
        ];

        for (const layer of layers) {
            const mat = new BABYLON.StandardMaterial(`cloudMat_${layer.yMin}`, scene);
            mat.diffuseTexture             = tex;
            mat.backFaceCulling            = false;
            mat.useAlphaFromDiffuseTexture = true;
            mat.opacityTexture             = tex;
            mat.transparencyMode           = BABYLON.StandardMaterial.MATERIAL_ALPHABLEND;
            mat.alpha                      = 0.85;
            mat.emissiveColor              = new BABYLON.Color3(CLOUD_DAY_COLOR_R, CLOUD_DAY_COLOR_G, CLOUD_DAY_COLOR_B);
            mat.diffuseColor               = new BABYLON.Color3(0, 0, 0);
            mat.specularColor              = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting            = true;
            this._cloudMats.push(mat);

            const tpl = BABYLON.MeshBuilder.CreatePlane(`cloudTpl_${layer.yMin}`, { size: layer.sizeBase }, scene);
            tpl.isVisible = false;
            tpl.isPickable = false;
            tpl.material = mat;

            const effectiveCount = Math.max(1, Math.round(layer.count * this._cloudDensityMult));
            const puffPerCluster = this._cloudVolumetric ? CLOUD_VOLUMETRIC_PUFFS_PER_CLUSTER : 1;
            for (let i = 0; i < effectiveCount; i++) {
                const ox = (Math.random() - 0.5) * layer.spread;
                const oz = (Math.random() - 0.5) * layer.spread;
                const oy = layer.yMin + Math.random() * layer.yRange;
                const clusterScale = 0.5 + Math.random() * 2.0;
                for (let j = 0; j < puffPerCluster; j++) {
                    const ci = tpl.createInstance(`c_${layer.yMin}_${i}_${j}`);
                    const jitter = this._cloudVolumetric ? layer.sizeBase * CLOUD_VOLUMETRIC_PUFF_JITTER : 0;
                    const jx = (Math.random() - 0.5) * jitter * 2;
                    const jy = (Math.random() - 0.5) * jitter * layer.aspectY;
                    const jz = (Math.random() - 0.5) * jitter * 2;
                    ci.position.set(ox + jx, oy + jy, oz + jz);
                    const subScale = this._cloudVolumetric
                        ? clusterScale * (0.6 + Math.random() * 0.7)
                        : clusterScale;
                    ci.scaling.set(subScale, subScale * layer.aspectY, 1);
                    ci.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
                    ci.isPickable = false;
                    this.cloudInstances.push({ mesh: ci, yBase: oy + jy, spread: layer.spread, windMult: layer.windMult });
                }
            }
        }
    }

    private _rebuildClouds(scene: BABYLON.Scene): void {
        for (const c of this.cloudInstances) { try { c.mesh.dispose(); } catch (_) { /* ignore */ } }
        this.cloudInstances = [];
        for (const m of this._cloudMats) { try { m.dispose(true, true); } catch (_) { /* ignore */ } }
        this._cloudMats = [];
        this._buildClouds(scene);
    }

    private _setOvercast(scene: BABYLON.Scene, enabled: boolean): void {
        if (enabled) {
            if (this._overcastMesh) {
                this._overcastMesh.isVisible = true;
                return;
            }
            const deck = BABYLON.MeshBuilder.CreateGround('overcastDeck', { width: OVERCAST_DECK_SIZE_M, height: OVERCAST_DECK_SIZE_M, subdivisions: 1 }, scene);
            deck.position.y = OVERCAST_DECK_Y_M;
            deck.isPickable = false;
            deck.applyFog = true;

            const mat = new BABYLON.StandardMaterial('overcastMat', scene);
            const tex = new BABYLON.Texture(CLOUD_TEXTURE_URL, scene);
            tex.hasAlpha = true;
            tex.uScale = 30;
            tex.vScale = 30;
            mat.diffuseTexture = tex;
            mat.opacityTexture = tex;
            mat.useAlphaFromDiffuseTexture = true;
            mat.emissiveColor = new BABYLON.Color3(0.85, 0.85, 0.9);
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.specularColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            mat.backFaceCulling = false;
            mat.alpha = OVERCAST_DECK_ALPHA;
            mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
            deck.material = mat;

            this._overcastMesh = deck;
            this._overcastMat = mat;
        } else {
            if (this._overcastMesh) { try { this._overcastMesh.dispose(); } catch (_) { /* ignore */ } this._overcastMesh = null; }
            if (this._overcastMat) { try { this._overcastMat.dispose(true, true); } catch (_) { /* ignore */ } this._overcastMat = null; }
        }
    }

    private _setMilkyWay(scene: BABYLON.Scene, enabled: boolean): void {
        if (enabled) {
            if (this._milkyWayRoot) {
                this._milkyWayRoot.setEnabled(true);
                return;
            }
            const root = new BABYLON.TransformNode('milkyWayRoot', scene);

            const mat = new BABYLON.StandardMaterial('milkyWayMat', scene);
            mat.emissiveColor = new BABYLON.Color3(0.55, 0.55, 0.75);
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.specularColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            mat.backFaceCulling = false;
            mat.alpha = 0.18;
            mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
            mat.disableDepthWrite = true;

            const tilt = (MILKY_WAY_BAND_TILT_DEG * Math.PI) / 180;
            const halfWidthRad = (MILKY_WAY_BAND_HALF_WIDTH_DEG * Math.PI) / 180;
            for (let i = 0; i < MILKY_WAY_BAND_COUNT; i++) {
                const theta = (i / MILKY_WAY_BAND_COUNT) * Math.PI * 2;
                const lat = (Math.random() - 0.5) * 2 * halfWidthRad;
                const cosLat = Math.cos(lat);
                const x0 = Math.cos(theta) * cosLat;
                const y0 = Math.sin(lat);
                const z0 = Math.sin(theta) * cosLat;
                const ct = Math.cos(tilt);
                const st = Math.sin(tilt);
                const yT = y0 * ct - z0 * st;
                const zT = y0 * st + z0 * ct;
                if (yT < 0) continue;
                const quad = BABYLON.MeshBuilder.CreatePlane(`mw_${i}`, { size: 1500 + Math.random() * 1200 }, scene);
                quad.position.set(x0 * MILKY_WAY_BAND_DIST, yT * MILKY_WAY_BAND_DIST, zT * MILKY_WAY_BAND_DIST);
                quad.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
                quad.isPickable = false;
                quad.infiniteDistance = true;
                quad.applyFog = false;
                quad.material = mat;
                quad.parent = root;
            }
            this._milkyWayRoot = root;
        } else {
            if (this._milkyWayRoot) {
                this._milkyWayRoot.setEnabled(false);
            }
        }
    }

    private _updateClouds(dt: number): void {
        if (!this.spawned || this.cloudInstances.length === 0) return;
        const px = this.planeRoot.position.x;
        const pz = this.planeRoot.position.z;

        const windRefFt = 5000;
        const windRef = this._getWindAtAltitude(windRefFt);
        const dirRad = (windRef.dirDeg * Math.PI) / 180;
        const baseVx = -Math.sin(dirRad) * windRef.speedKt * CLOUD_KT_TO_MS;
        const baseVz = -Math.cos(dirRad) * windRef.speedKt * CLOUD_KT_TO_MS;
        const dtClamp = Math.max(0, Math.min(0.1, dt));

        for (const c of this.cloudInstances) {
            c.mesh.position.x += baseVx * c.windMult * dtClamp;
            c.mesh.position.z += baseVz * c.windMult * dtClamp;

            const half = c.spread * 0.5;
            const dx = c.mesh.position.x - px;
            const dz = c.mesh.position.z - pz;
            if (dx >  half) c.mesh.position.x -= c.spread;
            if (dx < -half) c.mesh.position.x += c.spread;
            if (dz >  half) c.mesh.position.z -= c.spread;
            if (dz < -half) c.mesh.position.z += c.spread;
        }
    }

    private _applyCloudTint(elevation: number): void {
        if (this._cloudMats.length === 0) return;
        const sunsetT = 1.0 - Math.max(0, Math.min(1, elevation / CLOUD_SUNSET_FADE_BAND_DEG));
        const nightT = Math.max(0, Math.min(1, (CLOUD_NIGHT_FADE_OFFSET_DEG - elevation) / CLOUD_NIGHT_FADE_BAND_DEG));

        const dayR = CLOUD_DAY_COLOR_R + (CLOUD_SUNSET_COLOR_R - CLOUD_DAY_COLOR_R) * sunsetT;
        const dayG = CLOUD_DAY_COLOR_G + (CLOUD_SUNSET_COLOR_G - CLOUD_DAY_COLOR_G) * sunsetT;
        const dayB = CLOUD_DAY_COLOR_B + (CLOUD_SUNSET_COLOR_B - CLOUD_DAY_COLOR_B) * sunsetT;

        const r = dayR + (CLOUD_NIGHT_COLOR_R - dayR) * nightT;
        const g = dayG + (CLOUD_NIGHT_COLOR_G - dayG) * nightT;
        const b = dayB + (CLOUD_NIGHT_COLOR_B - dayB) * nightT;

        for (const mat of this._cloudMats) {
            mat.emissiveColor.set(r, g, b);
        }
    }

    // ── Ground ────────────────────────────────────────────────────────────────

    private _buildGround(scene: BABYLON.Scene): void {
        this.ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 20000, height: 20000 }, scene);
        this.ground.position.y = GROUND_Y - 2;
        const mat = new BABYLON.PBRMaterial('groundMat', scene);
        mat.albedoColor = new BABYLON.Color3(0.15, 0.35, 0.12);
        mat.metallic = 0;
        mat.roughness = 0.95;
        this.ground.material = mat;
        this.ground.receiveShadows = true;
        this.ground.freezeWorldMatrix();
    }

    private _buildWater(scene: BABYLON.Scene): void {
        try {
            const waterSize = WATER_PLANE_SIZE_M;
            const water = BABYLON.MeshBuilder.CreateGround('waterPlane', { width: waterSize, height: waterSize, subdivisions: 16 }, scene);
            water.position.y = WATER_PLANE_Y_OFFSET_M - this.refAlt;
            water.isPickable = false;
            water.alwaysSelectAsActiveMesh = true;
            const wm = new WaterMaterial('waterMat', scene, new BABYLON.Vector2(WATER_NORMAL_RES, WATER_NORMAL_RES));
            wm.backFaceCulling = true;
            wm.bumpTexture = new BABYLON.Texture(WATER_BUMP_URL, scene);
            wm.windForce = WATER_WIND_FORCE;
            wm.waveHeight = WATER_WAVE_HEIGHT_M;
            wm.bumpHeight = WATER_BUMP_HEIGHT;
            wm.waveLength = WATER_WAVE_LENGTH_M;
            wm.waterColor = new BABYLON.Color3(WATER_COLOR_R, WATER_COLOR_G, WATER_COLOR_B);
            wm.colorBlendFactor = WATER_COLOR_BLEND;
            wm.maxSimultaneousLights = AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS;
            if (this._skyboxMesh) {
                try { wm.addToRenderList(this._skyboxMesh); } catch (_) { /* ignore */ }
            }
            water.material = wm;
            const prePass = scene.prePassRenderer;
            if (prePass) { prePass.excludedMaterials.push(wm); }
            this._waterMesh = water;
            this._waterMaterial = wm;
            console.log('[Water] Sea-level plane created');
        } catch (err) {
            console.warn('[Water] Build failed:', err);
        }
    }

    private _disposeWater(): void {
        if (this._waterMesh) { try { this._waterMesh.dispose(); } catch (_) { /* ignore */ } this._waterMesh = null; }
        if (this._waterMaterial) { try { this._waterMaterial.dispose(); } catch (_) { /* ignore */ } this._waterMaterial = null; }
    }

    // ── Airplane ──────────────────────────────────────────────────────────────

    private _buildPlane(scene: BABYLON.Scene): void {
        const cfg = this.aircraftConfig;
        this.planeRoot = new BABYLON.TransformNode('planeRoot', scene);
        const yawRad = (180 - this.initialHeading) * Math.PI / 180;
        this.planeRoot.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), yawRad);
        this.angularVelocity.set(0, 0, 0);
        this.gearCompression = new Array(cfg.gear_positions.length).fill(0);
        const gearHeight = cfg.gear_positions.length > 0
            ? Math.abs(Math.min(...cfg.gear_positions.map((g: { y: number }) => g.y)))
            : 0;
        if (this.spawnAirborne) {
            const isAirborneMission = this._pendingMissionAirborne === true;
            const minOffset = isAirborneMission ? AIRBORNE_MISSION_MIN_OFFSET_M : 100;
            const altOffset = Math.max(minOffset, cfg.spawn_alt_offset_m);
            this.planeRoot.position.set(0, GROUND_Y + altOffset, 0);
            this.thrust = cfg.spawn_airborne_thrust || 0.7;
            this.flapIndex = cfg.default_flap_index_air;
            this.currentFlapDeg = this.FLAP_STEPS[this.flapIndex] || 0;
            const rotMatrix = new BABYLON.Matrix();
            BABYLON.Matrix.FromQuaternionToRef(this.planeRoot.rotationQuaternion, rotMatrix);
            const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), rotMatrix);
            this.velocity = fwd.scale(cfg.spawn_airborne_speed_ms || 80);
            if (isAirborneMission) {
                this._spawnSnapFramesLeft = 0;
                this._pendingAirborneGearRetract = true;
                const missionAlt = this._pendingMissionAltM ?? 0;
                console.debug(`[FlightSimple] Airborne mission spawn: mission_alt=${missionAlt.toFixed(1)}m refAlt=${this.refAlt.toFixed(1)}m posY=${this.planeRoot.position.y.toFixed(1)}m altOffset=${altOffset.toFixed(1)}m snapDisabled pendingGearRetract terrainY=${this.terrainY.toFixed(1)}m`);
            }
        } else {
            this.planeRoot.position.set(0, GROUND_Y + gearHeight, 0);
            this.thrust = 0;
            this.flapIndex = cfg.default_flap_index_ground;
            this.currentFlapDeg = this.FLAP_STEPS[this.flapIndex] || 15;
            this.velocity = BABYLON.Vector3.Zero();
            this._spawnSnapFramesLeft = SPAWN_SNAP_FRAMES;
            this._pendingAirborneGearRetract = false;
            console.debug(`[FlightSimple] Initial ground spawn: snap window armed for ${SPAWN_SNAP_FRAMES} frames, gearHeight=${gearHeight.toFixed(3)}`);
        }

        this._loadAircraftModel(scene);
    }

    private _loadedModelMeshes: BABYLON.AbstractMesh[] = [];
    private _loadedAnimGroups: BABYLON.AnimationGroup[] = [];
    private _propellerAnimGroup: BABYLON.AnimationGroup | null = null;
    private _modelLoadVersion = 0;

    private _loadAircraftModel(scene: BABYLON.Scene): void {
        const cfg = this.aircraftConfig;
        const modelPath = cfg.model_file;
        const lastSlash = modelPath.lastIndexOf('/');
        const folder = lastSlash >= 0 ? modelPath.substring(0, lastSlash + 1) : '';
        const file = lastSlash >= 0 ? modelPath.substring(lastSlash + 1) : modelPath;
        const myVersion = ++this._modelLoadVersion;

        BABYLON.SceneLoader.ImportMesh(
            '', folder, file, scene,
            (meshes: BABYLON.AbstractMesh[], _ps: BABYLON.IParticleSystem[], _sk: BABYLON.Skeleton[], animationGroups: BABYLON.AnimationGroup[]) => {
                if (!meshes.length) return;
                if (this._disposed || !this.scene || !this.planeRoot) {
                    console.log(`[FlightSimple] Discarding model load (${cfg.code}) — scene disposed.`);
                    meshes.forEach((m) => { try { m.dispose(); } catch (_) { /* ignore */ } });
                    if (animationGroups && animationGroups.length) {
                        animationGroups.forEach((g) => { try { g.dispose(); } catch (_) { /* ignore */ } });
                    }
                    return;
                }
                if (myVersion !== this._modelLoadVersion) {
                    console.log(`[FlightSimple] Discarding stale model load (${cfg.code}) — newer load in progress.`);
                    meshes.forEach((m) => m.dispose());
                    if (animationGroups && animationGroups.length) {
                        animationGroups.forEach((g) => g.dispose());
                    }
                    return;
                }
                this._loadedModelMeshes = meshes;
                try {
                    const seenMats = new Set<BABYLON.Material>();
                    let cappedCount = 0;
                    for (const m of meshes) {
                        const mat = m.material;
                        if (!mat || seenMats.has(mat)) continue;
                        seenMats.add(mat);
                        if (mat instanceof BABYLON.PBRBaseMaterial) {
                            (mat as BABYLON.PBRMaterial).maxSimultaneousLights = AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS;
                            cappedCount++;
                        }
                    }
                    if (cappedCount > 0) {
                        console.debug(`[FlightSimple] Capped maxSimultaneousLights=${AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS} on ${cappedCount} PBR material(s) of ${cfg.code}`);
                    }
                } catch (err) {
                    console.warn('[FlightSimple] Failed to cap maxSimultaneousLights on aircraft PBR materials:', err);
                }
                this._loadedAnimGroups = animationGroups || [];
                this._propellerAnimGroup = null;
                this._gearUpAnimGroup = null;
                this._gearDownAnimGroup = null;
                if (this._loadedAnimGroups.length) {
                    this._loadedAnimGroups.forEach((g) => g.stop());
                    const hasProp = cfg.engine_type === ENGINE_TYPE_PISTON || cfg.engine_type === ENGINE_TYPE_TURBOPROP;
                    if (hasProp) {
                        const propGroup = this._loadedAnimGroups.find((g) =>
                            /propell?er|prop\b|engine[_\s\-.]?start|engine[_\s\-.]?run|spin/i.test(g.name)
                        );
                        if (propGroup) {
                            this._propellerAnimGroup = propGroup;
                            propGroup.loopAnimation = true;
                            console.log(`[FlightSimple] Propeller animation found: "${propGroup.name}" (${propGroup.from}-${propGroup.to})`);
                        } else {
                            console.warn(`[FlightSimple] Aircraft ${cfg.code} is a prop engine but no "propeller" animation found in GLB. Available: ${this._loadedAnimGroups.map((g) => g.name).join(', ') || '(none)'}`);
                        }
                    }
                    const isJet = cfg.engine_type === ENGINE_TYPE_TURBOFAN || cfg.engine_type === ENGINE_TYPE_TURBOJET;
                    if (isJet) {
                        this._gearUpAnimGroup = this._loadedAnimGroups.find((g) => /gear[_\s]?up|gear[_\s]?retract/i.test(g.name)) ?? null;
                        this._gearDownAnimGroup = this._loadedAnimGroups.find((g) => /gear[_\s]?down|gear[_\s]?extend/i.test(g.name)) ?? null;
                        if (this._gearUpAnimGroup) this._gearUpAnimGroup.loopAnimation = false;
                        if (this._gearDownAnimGroup) this._gearDownAnimGroup.loopAnimation = false;
                        if (!this._gearUpAnimGroup && !this._gearDownAnimGroup) {
                            console.log(`[FlightSimple] ${cfg.code}: jet without gear animations — instant transition will be used (G key still works).`);
                        } else {
                            console.log(`[FlightSimple] Gear animations found: up="${this._gearUpAnimGroup?.name ?? 'none'}", down="${this._gearDownAnimGroup?.name ?? 'none'}"`);
                        }
                    }
                }
                if (this._pendingAirborneGearRetract) {
                    if (this._gearUpAnimGroup) {
                        this.gearState = GEAR_STATE_UP;
                        this._gearUpAnimGroup.start(false, 100.0, this._gearUpAnimGroup.from, this._gearUpAnimGroup.to);
                        console.debug(`[FlightSimple] Airborne mission: retracting gear (${cfg.code})`);
                    } else {
                        console.debug(`[FlightSimple] Airborne mission: ${cfg.code} has no gear retract animation, gear stays DOWN`);
                    }
                    this._pendingAirborneGearRetract = false;
                }
                const root = meshes[0];

                const bb = root.getHierarchyBoundingVectors(true);
                const center = bb.min.add(bb.max).scale(0.5);
                const size = bb.max.subtract(bb.min).length();

                const modelPivot = new BABYLON.TransformNode('modelPivot', scene);
                modelPivot.parent = this.planeRoot;

                root.parent = modelPivot;
                const scaleFactor = cfg.model_target_size / Math.max(size, 0.1);
                // Align the visual bottom of the model with the COMPRESSED gear
                // position (gear_y + static spring deflection). This way when the
                // aircraft sits in equilibrium on its struts, the visual wheels
                // touch the ground instead of floating (DC-8 would sink ~0.5m
                // and C172 would sit a few cm above without this offset).
                const gearMinY = cfg.gear_positions.length > 0
                    ? Math.min(...cfg.gear_positions.map((g) => g.y))
                    : 0;
                const nGears = Math.max(1, cfg.gear_positions.length);
                const sitMass = cfg.mass_kg + (cfg.fuel_capacity_kg || 0);
                const safeSpringK = Math.max(GEAR_SPRING_K_MIN_N_PER_M, Number.isFinite(cfg.gear_spring_k) ? cfg.gear_spring_k : 0);
                const staticGearComp = (sitMass * G_ACCEL) / (nGears * safeSpringK);
                const offset = center.negate();
                offset.y = -bb.min.y + (gearMinY + staticGearComp) / scaleFactor;
                root.position = offset;
                root.rotationQuaternion = null;
                root.rotation = BABYLON.Vector3.Zero();

                modelPivot.scaling.setAll(scaleFactor);
                modelPivot.rotation = new BABYLON.Vector3(0, cfg.model_rotation_y, 0);

                const shadow = (this as any)._shadow;
                meshes.forEach((m: BABYLON.AbstractMesh) => {
                    if (shadow) shadow.addShadowCaster(m, true);
                });

                const savedPlaneQuat = this.planeRoot.rotationQuaternion?.clone() || null;
                const savedPlaneRot = this.planeRoot.rotation.clone();
                this.planeRoot.rotationQuaternion = BABYLON.Quaternion.Identity();
                this.planeRoot.rotation = BABYLON.Vector3.Zero();
                this.planeRoot.computeWorldMatrix(true);
                modelPivot.computeWorldMatrix(true);
                root.computeWorldMatrix(true);
                meshes.forEach((m) => m.computeWorldMatrix(true));

                const worldBB = root.getHierarchyBoundingVectors(true);
                const planePos = this.planeRoot.position;
                const localMin = new BABYLON.Vector3(
                    worldBB.min.x - planePos.x,
                    worldBB.min.y - planePos.y,
                    worldBB.min.z - planePos.z,
                );
                const localMax = new BABYLON.Vector3(
                    worldBB.max.x - planePos.x,
                    worldBB.max.y - planePos.y,
                    worldBB.max.z - planePos.z,
                );

                if (savedPlaneQuat) {
                    this.planeRoot.rotationQuaternion = savedPlaneQuat;
                } else {
                    this.planeRoot.rotationQuaternion = null;
                    this.planeRoot.rotation = savedPlaneRot;
                }
                this.planeRoot.computeWorldMatrix(true);
                modelPivot.computeWorldMatrix(true);
                root.computeWorldMatrix(true);
                meshes.forEach((m) => m.computeWorldMatrix(true));

                const localCenter = localMin.add(localMax).scale(0.5);
                const bbW = Math.abs(localMax.x - localMin.x);
                const bbH = Math.abs(localMax.y - localMin.y);
                const bbD = Math.abs(localMax.z - localMin.z);
                console.debug(`[NavLights] ${cfg.code}: planeRoot-local bbox W=${bbW.toFixed(2)}m H=${bbH.toFixed(2)}m D=${bbD.toFixed(2)}m center=(${localCenter.x.toFixed(2)},${localCenter.y.toFixed(2)},${localCenter.z.toFixed(2)}) rotY=${cfg.model_rotation_y.toFixed(3)}`);
                this._buildNavLights(scene, this.planeRoot, {
                    halfSpan: bbW / 2,
                    height: bbH,
                    halfLen: bbD / 2,
                    center: localCenter,
                });
                this._detectControlSurfaceNodes(meshes);
                this._buildContrails(scene, bbW / 2);
                this._buildVaporCone(scene);
                this._buildHeatHaze(scene);

                if (this.camera) {
                    const initialRadius = Math.max(
                        CAMERA_RADIUS_MIN_M,
                        Math.min(CAMERA_RADIUS_MAX_M, bbD * CAMERA_RADIUS_LENGTH_FACTOR),
                    );
                    this.camera.radius = initialRadius;

                    const safeW = Number.isFinite(bbW) && bbW > 0 ? bbW : 0;
                    const safeH = Number.isFinite(bbH) && bbH > 0 ? bbH : 0;
                    const safeD = Number.isFinite(bbD) && bbD > 0 ? bbD : 0;
                    const aircraftMinRadius = Math.max(
                        safeW * CAMERA_LOWER_RADIUS_AIRCRAFT_FACTOR,
                        safeD * CAMERA_LOWER_RADIUS_AIRCRAFT_FACTOR,
                        safeH * CAMERA_LOWER_RADIUS_HEIGHT_FACTOR,
                        CAMERA_LOWER_RADIUS_FALLBACK_M,
                    );
                    this.camera.lowerRadiusLimit = aircraftMinRadius;
                    if (this.camera.radius < aircraftMinRadius) {
                        this.camera.radius = aircraftMinRadius;
                    }
                    console.debug(`[Camera] Initial radius set to ${initialRadius.toFixed(1)}m, lowerRadiusLimit=${aircraftMinRadius.toFixed(1)}m for ${cfg.code} (W=${safeW.toFixed(1)}m, H=${safeH.toFixed(1)}m, L=${safeD.toFixed(1)}m)`);
                }

                this.spawned = true;
                this._maybeFireSpawned();
                console.log(`[FlightSimple] Model loaded: ${cfg.code}, scale: ${scaleFactor.toFixed(2)}, dims: ${bbW.toFixed(1)},${bbH.toFixed(1)},${bbD.toFixed(1)}`);
            },
            null,
            (_scene: BABYLON.Scene, _msg: string, ex?: any) => {
                console.warn('[FlightSimple] GLB load failed, building fallback', ex);
                this._buildFallbackMesh(scene);
            },
        );
    }

    private _buildFallbackMesh(scene: BABYLON.Scene): void {
        const mat = new BABYLON.PBRMaterial('planePBR', scene);
        mat.albedoColor = new BABYLON.Color3(0.85, 0.88, 0.92);
        mat.metallic = 0.7;
        mat.roughness = 0.25;

        const body = BABYLON.MeshBuilder.CreateBox('body', { width: 2.2, height: 0.65, depth: 7 }, scene);
        const wing = BABYLON.MeshBuilder.CreateBox('wing', { width: 16, height: 0.22, depth: 2.5 }, scene);
        const tail = BABYLON.MeshBuilder.CreateBox('tail', { width: 6, height: 0.18, depth: 1.8 }, scene);
        tail.position.set(0, 0.4, -3.0);
        const finV = BABYLON.MeshBuilder.CreateBox('finV', { width: 0.18, height: 2.8, depth: 2.0 }, scene);
        finV.position.set(0, 1.4, -3.0);
        const nose = BABYLON.MeshBuilder.CreateCylinder('nose', {
            height: 2.5, diameterTop: 0, diameterBottom: 1.5, tessellation: 8,
        }, scene);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0, 4.5);

        [body, wing, tail, finV, nose].forEach((m) => {
            m.material = mat;
            m.parent = this.planeRoot;
        });
        this._buildNavLights(scene, this.planeRoot, {
            halfSpan: 8,
            height: 2.8,
            halfLen: 5.5,
        });
        this._buildContrails(scene, 8);
        this._buildVaporCone(scene);
        this._buildHeatHaze(scene);
        this.spawned = true;
        this._maybeFireSpawned();
    }

    private _buildNavLights(
        scene: BABYLON.Scene,
        parent: BABYLON.TransformNode,
        dims: { halfSpan: number; height: number; halfLen: number; center?: BABYLON.Vector3 },
    ): void {
        const hs = dims.halfSpan * 0.97;
        const cx = dims.center?.x ?? 0;
        const cy = dims.center?.y ?? 0;
        const cz = dims.center?.z ?? 0;
        const halfH = dims.height * 0.5;
        const wingY = cy - halfH * 0.5;
        const wingZ = cz - dims.halfLen * 0.25;
        const topY  = cy + halfH * 0.85;
        const botY  = cy - halfH * 0.85;
        const tailZ = cz - dims.halfLen * 0.95;
        const noseZ = cz + dims.halfLen * 0.90;

        const RED   = new BABYLON.Color3(1, 0.05, 0.05);
        const GREEN = new BABYLON.Color3(0.05, 1, 0.05);
        const WHITE = new BABYLON.Color3(1.0, 1.0, 0.95);

        const defs: { name: string; color: BABYLON.Color3; pos: BABYLON.Vector3; kind: number; intensity: number; range: number; phase: number; spot?: { dirZ: number; angleRad: number; exponent: number } }[] = [
            { name: 'navPort',     color: RED,   pos: new BABYLON.Vector3(cx - hs, wingY, wingZ), kind: NAV_LIGHT_KIND_STATIC,  intensity: 40, range: 200, phase: 0 },
            { name: 'navStbd',     color: GREEN, pos: new BABYLON.Vector3(cx + hs, wingY, wingZ), kind: NAV_LIGHT_KIND_STATIC,  intensity: 40, range: 200, phase: 0 },
            { name: 'beaconTop',   color: RED,   pos: new BABYLON.Vector3(cx, topY, cz),          kind: NAV_LIGHT_KIND_BEACON,  intensity: 80, range: 300, phase: 0 },
            { name: 'beaconBot',   color: RED,   pos: new BABYLON.Vector3(cx, botY, cz),          kind: NAV_LIGHT_KIND_BEACON,  intensity: 80, range: 300, phase: 0.5 },
            { name: 'strobePort',  color: WHITE, pos: new BABYLON.Vector3(cx - hs, wingY, wingZ - 0.5), kind: NAV_LIGHT_KIND_STROBE, intensity: 200, range: 600, phase: 0 },
            { name: 'strobeStbd',  color: WHITE, pos: new BABYLON.Vector3(cx + hs, wingY, wingZ - 0.5), kind: NAV_LIGHT_KIND_STROBE, intensity: 200, range: 600, phase: 0.5 },
            { name: 'antiColTail', color: RED,   pos: new BABYLON.Vector3(cx, topY, tailZ),       kind: NAV_LIGHT_KIND_ANTICOL, intensity: 120, range: 400, phase: 0 },
            { name: 'landLeft',    color: WHITE, pos: new BABYLON.Vector3(cx - hs * 0.6, wingY * 0.5, noseZ), kind: NAV_LIGHT_KIND_LANDING, intensity: 600, range: 1500, phase: 0, spot: { dirZ: 1, angleRad: Math.PI / 5, exponent: 2 } },
            { name: 'landRight',   color: WHITE, pos: new BABYLON.Vector3(cx + hs * 0.6, wingY * 0.5, noseZ), kind: NAV_LIGHT_KIND_LANDING, intensity: 600, range: 1500, phase: 0, spot: { dirZ: 1, angleRad: Math.PI / 5, exponent: 2 } },
        ];

        this._disposeNavLights();

        const sizeScale = Math.max(
            NAV_LIGHT_MIN_SCALE,
            Math.min(NAV_LIGHT_MAX_SCALE, dims.halfSpan / NAV_LIGHT_REFERENCE_HALF_SPAN_M),
        );
        const coreDiameter = NAV_LIGHT_CORE_DIAMETER_M * sizeScale;
        console.debug(`[NavLights] halfSpan=${dims.halfSpan.toFixed(2)}m sizeScale=${sizeScale.toFixed(2)} coreDiameter=${coreDiameter.toFixed(3)}m`);

        for (const def of defs) {
            let light: BABYLON.PointLight | BABYLON.SpotLight;
            if (def.kind === NAV_LIGHT_KIND_LANDING && def.spot) {
                const dirVec = new BABYLON.Vector3(0, 0, def.spot.dirZ);
                light = new BABYLON.SpotLight(def.name, def.pos.clone(), dirVec, def.spot.angleRad, def.spot.exponent, scene);
            } else {
                light = new BABYLON.PointLight(def.name, def.pos.clone(), scene);
            }
            light.parent = parent;
            light.intensity = 0;
            light.range = def.range;
            light.diffuse = def.color.clone();
            light.specular = def.color.clone();

            const core = BABYLON.MeshBuilder.CreateSphere(def.name + 'Core', { diameter: coreDiameter }, scene);
            core.parent = parent;
            core.position = def.pos.clone();
            core.isPickable = false;
            const coreMat = new BABYLON.StandardMaterial(def.name + 'CoreMat', scene);
            coreMat.emissiveColor = def.color.scale(3);
            coreMat.disableLighting = true;
            core.material = coreMat;
            core.isVisible = false;

            this._navLights.push({ light, core, kind: def.kind, phase: def.phase, maxIntensity: def.intensity });
        }

        const gl = new BABYLON.GlowLayer('navGlow', scene, { blurKernelSize: 128 });
        gl.intensity = 2.0;
        this._navGlowLayer = gl;
        for (const nav of this._navLights) {
            gl.addIncludedOnlyMesh(nav.core);
        }
    }

    private _disposeNavLights(): void {
        for (const nav of this._navLights) {
            nav.light.dispose();
            nav.core.dispose();
        }
        this._navLights = [];
        if (this._navGlowLayer) { this._navGlowLayer.dispose(); this._navGlowLayer = null; }
    }

    private async _buildNearbyRunwayColliders(centerLat: number, centerLon: number): Promise<void> {
        try {
            const url = `/api/airports/nearby?lat=${centerLat}&lng=${centerLon}&radius_km=${RUNWAY_COLLIDER_RADIUS_KM}`;
            const resp = await fetch(url);
            if (!resp.ok) {
                console.warn(`[Runway] /api/airports/nearby returned HTTP ${resp.status}`);
                return;
            }
            const json = await resp.json();
            const airports: any[] = json?.data || [];
            let count = 0;
            for (const ap of airports) {
                const runways: any[] = ap?.runways || [];
                for (const r of runways) {
                    if (this._buildRunwayCollider(r, ap.icao_code || ap.iata_code || `id${ap.id}`)) count++;
                }
            }
            console.log(`[Runway] loaded ${count} collider(s) from ${airports.length} airport(s) near (${centerLat.toFixed(4)}, ${centerLon.toFixed(4)})`);
        } catch (err) {
            console.warn('[Runway] failed to load nearby runways:', err);
        }
    }

    private _buildRunwayCollider(r: any, icao: string): boolean {
        if (!r || r.le_latitude_deg == null || r.le_longitude_deg == null
            || r.le_heading_deg_true == null || !r.length_ft || r.length_ft <= 0) {
            return false;
        }
        const widthFt = (r.width_ft && r.width_ft > 0) ? r.width_ft : RUNWAY_DEFAULT_WIDTH_FT;
        const widthM = widthFt * FT_TO_M;
        const lengthM = r.length_ft * FT_TO_M;

        const hasHE = r.he_latitude_deg != null && r.he_longitude_deg != null;
        const centerLat = hasHE ? (Number(r.le_latitude_deg) + Number(r.he_latitude_deg)) / 2 : Number(r.le_latitude_deg);
        const centerLon = hasHE ? (Number(r.le_longitude_deg) + Number(r.he_longitude_deg)) / 2 : Number(r.le_longitude_deg);

        const leElevFt = r.le_elevation_ft != null ? Number(r.le_elevation_ft) : null;
        const heElevFt = r.he_elevation_ft != null ? Number(r.he_elevation_ft) : null;
        const elevationFt = (leElevFt != null && heElevFt != null) ? (leElevFt + heElevFt) / 2
            : (leElevFt != null) ? leElevFt
            : (heElevFt != null) ? heElevFt
            : 0;

        const cosOriginLat = Math.cos(this.originLat * Math.PI / 180);
        const eastM = (centerLon - this.originLon) * METERS_PER_DEG_LAT * Math.max(cosOriginLat, 0.01);
        const northM = (centerLat - this.originLat) * METERS_PER_DEG_LAT;
        const sceneX = eastM;
        const sceneZ = -northM;
        const sceneY = (elevationFt * FT_TO_M - this.refAlt) + RUNWAY_COLLIDER_Y_BIAS_M;

        const name = `runway-collider-${icao}-${r.le_ident || ''}-${r.he_ident || ''}`;
        const mesh = BABYLON.MeshBuilder.CreatePlane(name, {
            width: widthM,
            height: lengthM,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE,
        }, this.scene);
        mesh.position.set(sceneX, sceneY, sceneZ);
        mesh.rotation.x = Math.PI / 2;
        mesh.rotation.y = (180 - Number(r.le_heading_deg_true)) * Math.PI / 180;
        mesh.isVisible = false;
        mesh.isPickable = true;
        mesh.checkCollisions = false;
        mesh.receiveShadows = false;
        mesh.metadata = { type: 'runway-collider', icao, leIdent: r.le_ident, heIdent: r.he_ident };
        mesh.renderingGroupId = RUNWAY_RENDERING_GROUP_ID;

        const mat = new BABYLON.StandardMaterial(name + 'Mat', this.scene);
        mat.diffuseColor = new BABYLON.Color3(RUNWAY_COLLIDER_DIFFUSE.r, RUNWAY_COLLIDER_DIFFUSE.g, RUNWAY_COLLIDER_DIFFUSE.b);
        mat.specularColor = BABYLON.Color3.Black();
        mat.emissiveColor = BABYLON.Color3.Black();
        mat.alpha = RUNWAY_COLLIDER_ALPHA;
        mat.backFaceCulling = false;
        mat.freeze();
        mesh.material = mat;

        mesh.computeWorldMatrix(true);
        mesh.freezeWorldMatrix();

        this._runwayColliders.push(mesh);
        return true;
    }

    private _disposeRunwayColliders(): void {
        for (const m of this._runwayColliders) {
            try { m.dispose(); } catch { /* ignore */ }
        }
        this._runwayColliders = [];
        this._runwayCollidersLoaded = false;
    }

    private _pickTerrainPreferRunway(ray: BABYLON.Ray): BABYLON.PickingInfo | null {
        const predicate = (mesh: BABYLON.AbstractMesh) =>
            mesh.isPickable && !mesh.isDescendantOf(this.planeRoot) && mesh.name !== 'ground';
        const hits = this.scene.multiPickWithRay(ray, predicate);
        if (!hits || hits.length === 0) return null;
        let bestRunway: BABYLON.PickingInfo | null = null;
        let bestOther: BABYLON.PickingInfo | null = null;
        for (const h of hits) {
            if (!h?.hit || !h.pickedPoint) continue;
            const isRunway = h.pickedMesh?.metadata?.type === 'runway-collider';
            if (isRunway) {
                if (!bestRunway || h.pickedPoint.y > bestRunway.pickedPoint!.y) bestRunway = h;
            } else {
                if (!bestOther || h.pickedPoint.y > bestOther.pickedPoint!.y) bestOther = h;
            }
        }
        return bestRunway || bestOther;
    }

    private _detectControlSurfaceNodes(meshes: BABYLON.AbstractMesh[]): void {
        this._surfaceAilLeftNodes = [];
        this._surfaceAilRightNodes = [];
        this._surfaceElevatorNodes = [];
        this._surfaceRudderNodes = [];
        this._surfaceFlapNodes = [];
        const visited = new Set<BABYLON.Node>();
        const candidates: BABYLON.Node[] = [];
        for (const m of meshes) {
            const walk = (n: BABYLON.Node) => {
                if (!n || visited.has(n)) return;
                visited.add(n);
                candidates.push(n);
                const children = n.getChildren ? n.getChildren() : [];
                for (const c of children) walk(c);
            };
            walk(m);
        }
        const rxLeft  = /(\b|_)l(eft)?(\b|_)|port|_l\d|\.l\d|_left/i;
        const rxRight = /(\b|_)r(ight)?(\b|_)|stbd|_r\d|\.r\d|_right/i;
        for (const node of candidates) {
            const name = node.name || '';
            if (/flap/i.test(name)) {
                this._surfaceFlapNodes.push(node as BABYLON.TransformNode);
                continue;
            }
            if (/aileron/i.test(name)) {
                if (rxLeft.test(name)) this._surfaceAilLeftNodes.push(node as BABYLON.TransformNode);
                else if (rxRight.test(name)) this._surfaceAilRightNodes.push(node as BABYLON.TransformNode);
                else this._surfaceAilRightNodes.push(node as BABYLON.TransformNode);
                continue;
            }
            if (/elevator|stab[_\s-]?h|h[_\s-]?stab/i.test(name)) {
                this._surfaceElevatorNodes.push(node as BABYLON.TransformNode);
                continue;
            }
            if (/rudder|stab[_\s-]?v|v[_\s-]?stab/i.test(name)) {
                this._surfaceRudderNodes.push(node as BABYLON.TransformNode);
                continue;
            }
        }
        const total = this._surfaceAilLeftNodes.length + this._surfaceAilRightNodes.length
                    + this._surfaceElevatorNodes.length + this._surfaceRudderNodes.length
                    + this._surfaceFlapNodes.length;
        if (total > 0) {
            console.debug(`[Surfaces] detected ail=${this._surfaceAilLeftNodes.length}+${this._surfaceAilRightNodes.length} elev=${this._surfaceElevatorNodes.length} rud=${this._surfaceRudderNodes.length} flap=${this._surfaceFlapNodes.length}`);
        }
    }

    private _setNodeRotationX(nodes: BABYLON.TransformNode[], rad: number): void {
        for (const n of nodes) {
            if (!n) continue;
            if (n.rotationQuaternion) {
                n.rotationQuaternion = null;
                n.rotation.set(rad, 0, 0);
            } else {
                n.rotation.x = rad;
            }
        }
    }

    private _setNodeRotationY(nodes: BABYLON.TransformNode[], rad: number): void {
        for (const n of nodes) {
            if (!n) continue;
            if (n.rotationQuaternion) {
                n.rotationQuaternion = null;
                n.rotation.set(0, rad, 0);
            } else {
                n.rotation.y = rad;
            }
        }
    }

    private _updateControlSurfaceAnim(): void {
        if (!this.surfaces || this.surfaces.length < 4) return;
        const SURF_MAX_DEFLECT_RAD = 0.35;
        const ailL = (this.surfaces[0]?.controlInput ?? 0) * SURF_MAX_DEFLECT_RAD;
        const ailR = (this.surfaces[1]?.controlInput ?? 0) * SURF_MAX_DEFLECT_RAD;
        const elev = (this.surfaces[2]?.controlInput ?? 0) * SURF_MAX_DEFLECT_RAD;
        const rud  = (this.surfaces[3]?.controlInput ?? 0) * SURF_MAX_DEFLECT_RAD;
        if (this._surfaceAilLeftNodes.length)  this._setNodeRotationX(this._surfaceAilLeftNodes,  ailL);
        if (this._surfaceAilRightNodes.length) this._setNodeRotationX(this._surfaceAilRightNodes, ailR);
        if (this._surfaceElevatorNodes.length) this._setNodeRotationX(this._surfaceElevatorNodes, elev);
        if (this._surfaceRudderNodes.length)   this._setNodeRotationY(this._surfaceRudderNodes,   rud);
        if (this._surfaceFlapNodes.length) {
            const flapRad = (this.currentFlapDeg || 0) * Math.PI / 180;
            this._setNodeRotationX(this._surfaceFlapNodes, flapRad);
        }
    }

    private _buildContrails(scene: BABYLON.Scene, halfSpan: number): void {
        this._disposeContrails();
        this._contrailHalfSpan = Math.max(2, halfSpan);
        const makeEmitter = (name: string, x: number) => {
            const em = new BABYLON.TransformNode(name, scene);
            em.parent = this.planeRoot;
            em.position.set(x, 0, -this._contrailHalfSpan * 0.2);
            return em;
        };
        const buildPs = (name: string, emitter: BABYLON.TransformNode) => {
            const ps = new BABYLON.ParticleSystem(name, 800, scene);
            try {
                ps.particleTexture = new BABYLON.Texture(CLOUD_TEXTURE_URL, scene);
            } catch (_) { /* offline; use plain */ }
            ps.emitter = emitter as unknown as BABYLON.AbstractMesh;
            ps.minEmitBox = new BABYLON.Vector3(0, 0, 0);
            ps.maxEmitBox = new BABYLON.Vector3(0, 0, 0);
            ps.color1 = new BABYLON.Color4(1, 1, 1, 0.55);
            ps.color2 = new BABYLON.Color4(0.9, 0.95, 1, 0.40);
            ps.colorDead = new BABYLON.Color4(0.8, 0.85, 0.9, 0);
            ps.minSize = 1.0;
            ps.maxSize = 2.5;
            ps.minLifeTime = 6.0;
            ps.maxLifeTime = 12.0;
            ps.emitRate = 0;
            ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            ps.gravity = new BABYLON.Vector3(0, 0, 0);
            ps.direction1 = new BABYLON.Vector3(0, 0, -1);
            ps.direction2 = new BABYLON.Vector3(0, 0, -1);
            ps.minEmitPower = 0.3;
            ps.maxEmitPower = 0.8;
            ps.updateSpeed = 0.02;
            ps.start();
            return ps;
        };
        this._contrailEmitterLeft  = makeEmitter('contrailEmL', -this._contrailHalfSpan * 0.92);
        this._contrailEmitterRight = makeEmitter('contrailEmR',  this._contrailHalfSpan * 0.92);
        this._contrailPSLeft  = buildPs('contrailPSL', this._contrailEmitterLeft);
        this._contrailPSRight = buildPs('contrailPSR', this._contrailEmitterRight);
    }

    private _disposeContrails(): void {
        if (this._contrailPSLeft)  { try { this._contrailPSLeft.dispose();  } catch (_) { /* ignore */ } }
        if (this._contrailPSRight) { try { this._contrailPSRight.dispose(); } catch (_) { /* ignore */ } }
        if (this._contrailEmitterLeft)  { try { this._contrailEmitterLeft.dispose();  } catch (_) { /* ignore */ } }
        if (this._contrailEmitterRight) { try { this._contrailEmitterRight.dispose(); } catch (_) { /* ignore */ } }
        this._contrailPSLeft = null;
        this._contrailPSRight = null;
        this._contrailEmitterLeft = null;
        this._contrailEmitterRight = null;
    }

    private _buildVaporCone(scene: BABYLON.Scene): void {
        this._disposeVaporCone();
        try {
            const em = new BABYLON.TransformNode('vaporConeEm', scene);
            em.parent = this.planeRoot;
            em.position.set(0, 0, -1.5);
            this._vaporConeEmitter = em;
            const ps = new BABYLON.ParticleSystem('vaporCone', 600, scene);
            try { ps.particleTexture = new BABYLON.Texture(CLOUD_TEXTURE_URL, scene); } catch (_) { /* ignore */ }
            ps.emitter = em as unknown as BABYLON.AbstractMesh;
            const r = Math.max(2, this._contrailHalfSpan * 0.35);
            ps.createCylinderEmitter(r, 0.6, 1, 0);
            ps.color1 = new BABYLON.Color4(1, 1, 1, 0.85);
            ps.color2 = new BABYLON.Color4(0.95, 0.97, 1, 0.55);
            ps.colorDead = new BABYLON.Color4(0.9, 0.92, 1, 0);
            ps.minSize = 0.8;
            ps.maxSize = 2.5;
            ps.minLifeTime = 0.10;
            ps.maxLifeTime = 0.35;
            ps.emitRate = 0;
            ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            ps.gravity = new BABYLON.Vector3(0, 0, 0);
            ps.minEmitPower = 0;
            ps.maxEmitPower = 0;
            ps.updateSpeed = 0.01;
            ps.start();
            this._vaporConePS = ps;
        } catch (err) {
            console.warn('[VaporCone] build failed:', err);
        }
    }

    private _disposeVaporCone(): void {
        if (this._vaporConePS)     { try { this._vaporConePS.dispose();     } catch (_) { /* ignore */ } this._vaporConePS = null; }
        if (this._vaporConeEmitter){ try { this._vaporConeEmitter.dispose();} catch (_) { /* ignore */ } this._vaporConeEmitter = null; }
    }

    private _updateVaporCone(): void {
        if (!this._vaporConePS) return;
        const mach = Number.isFinite(this._lastMach) ? this._lastMach : 0;
        const target = (mach > VAPOR_CONE_MACH_MIN && mach < VAPOR_CONE_MACH_MAX)
            ? VAPOR_CONE_MAX_RATE * (1 - Math.abs(mach - 1.0) / Math.max(0.01, VAPOR_CONE_MACH_MAX - 1.0))
            : 0;
        const cur = this._vaporConePS.emitRate || 0;
        this._vaporConePS.emitRate = cur + (target - cur) * 0.2;
    }

    private _buildHeatHaze(scene: BABYLON.Scene): void {
        this._disposeHeatHaze();
        const cfg = this.aircraftConfig;
        const isJet = cfg.engine_type === ENGINE_TYPE_TURBOFAN || cfg.engine_type === ENGINE_TYPE_TURBOJET;
        if (!isJet) return;
        try {
            const em = new BABYLON.TransformNode('heatHazeEm', scene);
            em.parent = this.planeRoot;
            em.position.set(0, 0, -this._contrailHalfSpan * 0.6);
            this._heatHazeEmitter = em;
            const ps = new BABYLON.ParticleSystem('heatHaze', 200, scene);
            try { ps.particleTexture = new BABYLON.Texture(CLOUD_TEXTURE_URL, scene); } catch (_) { /* ignore */ }
            ps.emitter = em as unknown as BABYLON.AbstractMesh;
            ps.minEmitBox = new BABYLON.Vector3(-0.5, -0.3, -0.2);
            ps.maxEmitBox = new BABYLON.Vector3( 0.5,  0.3,  0.2);
            ps.color1 = new BABYLON.Color4(1, 1, 1, 0.05);
            ps.color2 = new BABYLON.Color4(1, 1, 1, 0.08);
            ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
            ps.minSize = 0.4;
            ps.maxSize = 1.2;
            ps.minLifeTime = 0.3;
            ps.maxLifeTime = 0.9;
            ps.emitRate = 0;
            ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            ps.gravity = new BABYLON.Vector3(0, 0, 0);
            ps.direction1 = new BABYLON.Vector3(0, 0, -1);
            ps.direction2 = new BABYLON.Vector3(0, 0, -1);
            ps.minEmitPower = 2;
            ps.maxEmitPower = 5;
            ps.updateSpeed = 0.015;
            ps.start();
            this._heatHazePS = ps;
        } catch (err) {
            console.warn('[HeatHaze] build failed:', err);
        }
    }

    private _disposeHeatHaze(): void {
        if (this._heatHazePS)     { try { this._heatHazePS.dispose();     } catch (_) { /* ignore */ } this._heatHazePS = null; }
        if (this._heatHazeEmitter){ try { this._heatHazeEmitter.dispose();} catch (_) { /* ignore */ } this._heatHazeEmitter = null; }
    }

    private _updateHeatHaze(): void {
        if (!this._heatHazePS) return;
        const n1 = Math.max(0, Math.min(1.5, this._engineN1));
        const tasMs = Number.isFinite(this._lastTasMs) ? this._lastTasMs : 0;
        const speedScale = Math.max(0, 1 - tasMs / 120);
        const target = HEAT_HAZE_MAX_RATE * n1 * speedScale;
        const cur = this._heatHazePS.emitRate || 0;
        this._heatHazePS.emitRate = cur + (target - cur) * 0.1;
    }

    private _updateLensFlareOcclusion(dtMs: number): void {
        if (!this._lensFlareSystem || !this.scene || !this.camera) return;
        this._flareCheckTimerMs += dtMs;
        if (this._flareCheckTimerMs < FLARE_OCCLUSION_CHECK_INTERVAL_MS) return;
        this._flareCheckTimerMs = 0;
        const sunMesh = this.scene.getMeshByName('sunMesh');
        const sunLight = this.scene.getLightByName('sun') as BABYLON.DirectionalLight | null;
        let sunWorld: BABYLON.Vector3 | null = null;
        if (sunMesh) sunWorld = sunMesh.getAbsolutePosition();
        else if (sunLight) {
            const dir = sunLight.direction;
            const dirN = dir.normalizeToNew().scaleInPlace(-FLARE_OCCLUSION_SUN_DISTANCE_M);
            sunWorld = this.camera.position.add(dirN);
        }
        if (!sunWorld) return;
        const camPos = this.camera.position;
        const toSun = sunWorld.subtract(camPos);
        const distToSun = toSun.length();
        if (distToSun < 1) return;
        const dir = toSun.scale(1 / distToSun);
        const ray = new BABYLON.Ray(camPos, dir, distToSun);
        const planeRoot = this.planeRoot;
        const pick = this.scene.pickWithRay(ray, (m) => {
            if (!m || !m.isEnabled() || !m.isVisible || m.isPickable === false) return false;
            if (m.name === 'sunMesh' || m.name === 'sunHalo' || m.name === 'moonMesh' || m.name === 'moonHalo') return false;
            if (m.name === 'skyBox') return false;
            if (planeRoot && m.isDescendantOf(planeRoot)) return true;
            return true;
        });
        const occluded = !!(pick && pick.hit);
        this._flareOccluded = occluded;
    }

    private _updateColorGrading(elevationDeg: number): void {
        if (!this._pipeline) return;
        const ip = this._pipeline.imageProcessing;
        if (!ip) return;
        const dayT = Math.max(0, Math.min(1, (elevationDeg + 6) / 30));
        const sunsetT = Math.max(0, Math.min(1, 1.0 - Math.abs(elevationDeg) / 10));
        const nightT = Math.max(0, Math.min(1, -elevationDeg / 10));
        let r = COLOR_GRADE_DAY_TINT_R * dayT
              + COLOR_GRADE_SUNSET_TINT_R * sunsetT
              + COLOR_GRADE_NIGHT_TINT_R * nightT;
        let g = COLOR_GRADE_DAY_TINT_G * dayT
              + COLOR_GRADE_SUNSET_TINT_G * sunsetT
              + COLOR_GRADE_NIGHT_TINT_G * nightT;
        let b = COLOR_GRADE_DAY_TINT_B * dayT
              + COLOR_GRADE_SUNSET_TINT_B * sunsetT
              + COLOR_GRADE_NIGHT_TINT_B * nightT;
        const norm = Math.max(0.001, dayT + sunsetT + nightT);
        r /= norm; g /= norm; b /= norm;
        ip.colorCurvesEnabled = true;
        if (!ip.colorCurves) ip.colorCurves = new BABYLON.ColorCurves();
        const cc = ip.colorCurves;
        const tintH = ((Math.atan2(g - b, r - g) * 180 / Math.PI) + 360) % 360;
        const tintAmp = Math.min(40, Math.abs((r - 1.0) + (b - 1.0)) * 60);
        cc.globalHue = tintH;
        cc.globalDensity = tintAmp;
        ip.contrast = COLOR_GRADE_CONTRAST_DAY * dayT + COLOR_GRADE_CONTRAST_NIGHT * (sunsetT + nightT) / Math.max(0.001, sunsetT + nightT + dayT);
        ip.colorGradingEnabled = false;
    }

    private _ensureMotionBlur(active: boolean): void {
        if (!this.scene || !this.camera) return;
        if (active) {
            if (this._motionBlurPP) return;
            try {
                const cam = this.camera;
                const mb = new BABYLON.MotionBlurPostProcess('motionBlur', this.scene, 1.0, cam);
                mb.motionStrength = MOTION_BLUR_MAX_STRENGTH;
                mb.motionBlurSamples = MOTION_BLUR_SAMPLES;
                this._motionBlurPP = mb;
            } catch (err) {
                console.warn('[MotionBlur] init failed:', err);
            }
            return;
        }
        if (this._motionBlurPP) {
            try { this._motionBlurPP.dispose(this.camera); } catch (_) { /* ignore */ }
            this._motionBlurPP = null;
        }
    }

    private _updateMotionBlurAndDof(): void {
        if (this.isMobile) {
            if (this._motionBlurPP) this._ensureMotionBlur(false);
            if (this._dofEnabledInCockpit && this._pipeline) {
                try { this._pipeline.depthOfFieldEnabled = false; } catch (_) { /* ignore */ }
                this._dofEnabledInCockpit = false;
            }
            return;
        }
        const gAbs = Math.abs(Number.isFinite(this._gForce) ? this._gForce : 1);
        const wantMb = gAbs > MOTION_BLUR_TRIGGER_G;
        this._ensureMotionBlur(wantMb);
        if (this._pipeline) {
            const isCockpit = this._cameraMode === CAMERA_MODE_COCKPIT;
            if (isCockpit !== this._dofEnabledInCockpit) {
                this._dofEnabledInCockpit = isCockpit;
                try {
                    this._pipeline.depthOfFieldEnabled = isCockpit;
                    if (isCockpit) {
                        this._pipeline.depthOfField.focalLength = 50;
                        this._pipeline.depthOfField.fStop = 1.8;
                        this._pipeline.depthOfField.focusDistance = 800;
                    }
                } catch (err) {
                    console.warn('[DOF] toggle failed:', err);
                }
            }
        }
    }

    private _updateContrails(_dt: number): void {
        if (!this._contrailPSLeft || !this._contrailPSRight) return;
        const altM = this.planeRoot ? Math.max(0, this.refAlt + this.planeRoot.position.y) : 0;
        const tempK = altM > ISA_TROPOPAUSE_M
            ? ISA_TROPOPAUSE_TEMP_K
            : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * Math.max(0, altM);
        const tempC = tempK - 273.15;
        const speedMs = Number.isFinite(this._lastTasMs) ? this._lastTasMs : this.velocity.length();
        const enabled = altM > 8000 && tempC < -40 && speedMs > 60 && this.enginePower > 0.2;
        const targetRate = enabled ? 80 : 0;
        const curL = this._contrailPSLeft.emitRate || 0;
        const curR = this._contrailPSRight.emitRate || 0;
        this._contrailPSLeft.emitRate  = curL + (targetRate - curL) * 0.05;
        this._contrailPSRight.emitRate = curR + (targetRate - curR) * 0.05;
    }

    private _playAlertBeep(freq: number, durationMs: number, type: OscillatorType = 'sine', gain: number = 0.18): void {
        try {
            const ctx = AudioCore.getCtx();
            const bus = AudioCore.getAlertsBus();
            if (!ctx || !bus) return;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const now = ctx.currentTime;
            const durS = Math.max(0.02, durationMs / 1000);
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);
            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(gain, now + 0.01);
            g.gain.setValueAtTime(gain, now + Math.max(0.02, durS - 0.04));
            g.gain.exponentialRampToValueAtTime(0.001, now + durS);
            osc.connect(g);
            g.connect(bus);
            osc.start(now);
            osc.stop(now + durS + 0.05);
        } catch (err) {
            console.warn('[Alert] beep failed:', err);
        }
    }

    private _resolveMmo(): number {
        const cfg = this.aircraftConfig;
        if (cfg.mmo != null && Number.isFinite(cfg.mmo) && cfg.mmo > 0) return cfg.mmo;
        const fromCategory = MMO_FALLBACK_BY_CATEGORY[cfg.category];
        return (fromCategory != null && fromCategory > 0) ? fromCategory : MMO_FALLBACK_DEFAULT;
    }

    private _updateOverspeed(speedKtsIas: number, mach: number): void {
        const cfg = this.aircraftConfig;
        const vne = (cfg.vne_kts && cfg.vne_kts > 0)
            ? cfg.vne_kts
            : Math.max(1, cfg.stall_speed_kts) * VNE_FALLBACK_MULT_OF_STALL;
        const mmo = this._resolveMmo();
        const overByIas = Number.isFinite(speedKtsIas) && speedKtsIas > vne;
        const overByMach = Number.isFinite(mach) && mach > mmo;
        const active = overByIas || overByMach;
        this._overspeedActive = active;
        if (!active) return;
        const nowMs = performance.now();
        if (nowMs - this._overspeedLastTickMs >= OVERSPEED_CLACKER_INTERVAL_MS) {
            this._overspeedLastTickMs = nowMs;
            this._playAlertBeep(2200, 80, 'square', 0.22);
        }
    }

    private _updateGPWS(aglFt: number, vsFpm: number): void {
        const nowMs = performance.now();
        const onGround = aglFt < 8;
        if (onGround) {
            this._gpwsLastCalloutFt = -1;
            this._gpwsActiveAlert = 0;
            return;
        }
        if (vsFpm < GPWS_PULL_UP_VS_FPM && aglFt < 1500) {
            if (this._gpwsActiveAlert !== GPWS_ALERT_TYPE_PULL_UP || nowMs > this._gpwsAlertUntilMs) {
                this._gpwsActiveAlert = GPWS_ALERT_TYPE_PULL_UP;
                this._gpwsAlertUntilMs = nowMs + GPWS_ALERT_DURATION_MS;
                this._playAlertBeep(880, 200, 'square', 0.30);
                this._playAlertBeep(660, 200, 'square', 0.30);
            }
            return;
        }
        if (vsFpm < GPWS_SINK_RATE_VS_FPM && aglFt < 2500) {
            if (this._gpwsActiveAlert !== GPWS_ALERT_TYPE_SINK || nowMs > this._gpwsAlertUntilMs) {
                this._gpwsActiveAlert = GPWS_ALERT_TYPE_SINK;
                this._gpwsAlertUntilMs = nowMs + GPWS_ALERT_DURATION_MS;
                this._playAlertBeep(440, 250, 'sine', 0.20);
            }
            return;
        }
        if (vsFpm > GPWS_MIN_VS_FOR_CALLOUT_FPM) {
            return;
        }
        for (const ft of GPWS_CALLOUT_FT) {
            const crossed = aglFt <= ft && (this._gpwsLastCalloutFt > ft || this._gpwsLastCalloutFt < 0);
            const expired = (nowMs - this._gpwsLastCalloutMs) > GPWS_CALLOUT_REPEAT_MS;
            if (crossed && expired) {
                this._gpwsLastCalloutFt = ft;
                this._gpwsLastCalloutMs = nowMs;
                this._gpwsActiveAlert = GPWS_ALERT_TYPE_CALLOUT;
                this._gpwsAlertUntilMs = nowMs + 500;
                const freq = 600 + Math.max(0, 500 - ft) * 2;
                this._playAlertBeep(freq, 140, 'triangle', 0.18);
                break;
            }
        }
    }

    private _apCurrentNavTarget(): { lat: number; lon: number } | null {
        const wpts = this._missionWaypoints;
        const wpIdx = this._missionCurrentWpIndex;
        if (wpts && wpts.length > 0 && wpIdx >= 0 && wpIdx < wpts.length) {
            const wp = wpts[wpIdx];
            if (Number.isFinite(Number(wp.latitude)) && Number.isFinite(Number(wp.longitude))) {
                return { lat: Number(wp.latitude), lon: Number(wp.longitude) };
            }
        }
        const fp = this._activeFlightPlanNav ?? this._missionDestForNav();
        if (fp && Number.isFinite(fp.arrival_lat) && Number.isFinite(fp.arrival_lon)) {
            return { lat: fp.arrival_lat, lon: fp.arrival_lon };
        }
        return null;
    }

    private _magneticVariationDeg(lat: number, lon: number): number {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 0;
        const safeLat = Math.max(-85, Math.min(85, lat));
        let lonAdj = lon;
        while (lonAdj > 180) lonAdj -= 360;
        while (lonAdj < -180) lonAdj += 360;
        const variation = MAGVAR_C0
            + MAGVAR_C_LON  * lonAdj
            + MAGVAR_C_LAT  * safeLat
            + MAGVAR_C_LON2 * lonAdj * lonAdj
            + MAGVAR_C_LAT2 * safeLat * safeLat
            + MAGVAR_C_LONLAT * lonAdj * safeLat;
        return Math.max(-30, Math.min(30, variation));
    }

    private _apCurrentLatLon(): { lat: number; lon: number } | null {
        if (!this.planeRoot) return null;
        const cosOriginLat = Math.cos(this.originLat * Math.PI / 180);
        const eastM = this.planeRoot.position.x;
        const northM = -this.planeRoot.position.z;
        const lat = this.originLat + (northM / METERS_PER_DEG_LAT);
        const lon = this.originLon + (eastM / (METERS_PER_DEG_LAT * Math.max(cosOriginLat, 0.01)));
        return { lat, lon };
    }

    private _updateAutopilot(dt: number): void {
        if (!this._autopilotMaster || !this.planeRoot || !this.planeRoot.rotationQuaternion) return;
        const stepDt = Math.max(0.001, Math.min(0.1, dt));
        const wm = this.planeRoot.getWorldMatrix();
        const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm);
        const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm);
        const curHdgDeg = ((Math.atan2(fwd.x, fwd.z) * 180 / Math.PI) + 360) % 360;

        if ((this._autopilotNavHold || this._autopilotAprHold) && this.surfaces.length >= 4) {
            const target = this._apCurrentNavTarget();
            const here = this._apCurrentLatLon();
            if (target && here) {
                const desiredBrg = this._initialBearingDeg(here.lat, here.lon, target.lat, target.lon);
                const trackDeg = (this.groundSpeed > MIN_GS_FOR_ETE_MS
                    && Number.isFinite(this.velocity.x) && Number.isFinite(this.velocity.z))
                    ? ((Math.atan2(this.velocity.x, this.velocity.z) * 180 / Math.PI) + 360) % 360
                    : curHdgDeg;
                const trackErrDeg = ((desiredBrg - trackDeg + 540) % 360) - 180;
                const distNm = this._haversineNm(here.lat, here.lon, target.lat, target.lon);
                const xteNm = Math.sin(trackErrDeg * Math.PI / 180) * Math.max(0.1, distNm);
                const intercept = Math.max(
                    -AP_NAV_MAX_INTERCEPT_DEG,
                    Math.min(AP_NAV_MAX_INTERCEPT_DEG, xteNm * AP_NAV_XTE_DEG_PER_NM + trackErrDeg * 0.5),
                );
                this._autopilotTargetHdgDeg = ((desiredBrg + intercept) + 360) % 360;
            }
        }

        if ((this._autopilotHdgHold || this._autopilotNavHold || this._autopilotAprHold) && this.surfaces.length >= 2) {
            const delta = ((this._autopilotTargetHdgDeg - curHdgDeg + 540) % 360) - 180;
            const targetBank = Math.max(-AP_HDG_MAX_BANK_DEG, Math.min(AP_HDG_MAX_BANK_DEG, delta * AP_HDG_BANK_GAIN * AP_HDG_MAX_BANK_DEG));
            const sinBank = Math.max(-1, Math.min(1, right.y));
            const curBankDeg = -Math.asin(sinBank) * 180 / Math.PI;
            const rollErr = targetBank - curBankDeg;
            const rollCmd = Math.max(-0.7, Math.min(0.7, rollErr * AP_HDG_ROLL_RATE_GAIN / AP_HDG_MAX_BANK_DEG));
            this.surfaces[0].controlInput =  rollCmd;
            this.surfaces[1].controlInput = -rollCmd;
        }

        if (this._autopilotAprHold && this.surfaces.length >= 3) {
            const target = this._apCurrentNavTarget();
            const here = this._apCurrentLatLon();
            if (target && here) {
                const distNm = this._haversineNm(here.lat, here.lon, target.lat, target.lon);
                const distFt = distNm * 6076.12;
                const glideAltFt = Math.max(AP_APR_MIN_ALT_FT, distFt * Math.tan(AP_APR_GLIDESLOPE_DEG * Math.PI / 180));
                const altMslFt = Math.max(0, (this.refAlt + this.planeRoot.position.y)) * 3.28084;
                const errFt = glideAltFt - altMslFt;
                const vsFpm = this.velocity.y * 196.85;
                const pitchCmd = Math.max(-AP_ALT_PITCH_MAX, Math.min(AP_ALT_PITCH_MAX,
                    errFt * AP_ALT_PITCH_GAIN - vsFpm * AP_ALT_VS_DAMP_GAIN));
                this.surfaces[2].controlInput = -pitchCmd;
            }
        } else if (this._autopilotVsHold && this.surfaces.length >= 3) {
            const vsFpm = this.velocity.y * 196.85;
            const errFpm = this._autopilotTargetVsFpm - vsFpm;
            const pitchCmd = Math.max(-AP_VS_PITCH_MAX, Math.min(AP_VS_PITCH_MAX, errFpm * AP_VS_PITCH_GAIN));
            this.surfaces[2].controlInput = -pitchCmd;
        } else if (this._autopilotAltHold && this.surfaces.length >= 3) {
            const altMslFt = Math.max(0, (this.refAlt + this.planeRoot.position.y)) * 3.28084;
            const errFt = this._autopilotTargetAltFt - altMslFt;
            const vsFpm = this.velocity.y * 196.85;
            const pitchCmd = Math.max(-AP_ALT_PITCH_MAX, Math.min(AP_ALT_PITCH_MAX,
                errFt * AP_ALT_PITCH_GAIN - vsFpm * AP_ALT_VS_DAMP_GAIN));
            this.surfaces[2].controlInput = -pitchCmd;
        }

        if ((this._autopilotAltHold || this._autopilotVsHold || this._autopilotAprHold) && this.surfaces.length >= 3) {
            const elevatorCmd = this.surfaces[2].controlInput;
            if (Math.abs(elevatorCmd) > AUTOTRIM_DEADBAND) {
                const trimDir = -Math.sign(elevatorCmd);
                this.trimPitch = Math.max(-AUTOTRIM_MAX, Math.min(AUTOTRIM_MAX,
                    this.trimPitch + trimDir * AUTOTRIM_RATE_PER_S * stepDt));
            }
        }
    }

    private _engageAutopilotMaster(): void {
        this._autopilotMaster = !this._autopilotMaster;
        if (this._autopilotMaster) {
            if (!this._autopilotHdgHold) this._engageAutopilotHdgHold(true);
            if (!this._autopilotAltHold) this._engageAutopilotAltHold(true);
            console.log('[AP] Master ON');
        } else {
            this._autopilotHdgHold = false;
            this._autopilotAltHold = false;
            this._autopilotVsHold = false;
            this._autopilotNavHold = false;
            this._autopilotAprHold = false;
            console.log('[AP] Master OFF');
        }
    }

    private _engageAutopilotHdgHold(forceOn: boolean = false): void {
        const newState = forceOn ? true : !this._autopilotHdgHold;
        this._autopilotHdgHold = newState;
        if (newState) {
            this._autopilotNavHold = false;
            this._autopilotAprHold = false;
            if (this.planeRoot) {
                const wm = this.planeRoot.getWorldMatrix();
                const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm);
                this._autopilotTargetHdgDeg = ((Math.atan2(fwd.x, fwd.z) * 180 / Math.PI) + 360) % 360;
            }
        }
    }

    private _engageAutopilotAltHold(forceOn: boolean = false): void {
        const newState = forceOn ? true : !this._autopilotAltHold;
        this._autopilotAltHold = newState;
        if (newState) {
            this._autopilotVsHold = false;
            this._autopilotAprHold = false;
            if (this.planeRoot) {
                this._autopilotTargetAltFt = Math.max(0, (this.refAlt + this.planeRoot.position.y)) * 3.28084;
            }
        }
    }

    private _engageAutopilotVsHold(forceOn: boolean = false): void {
        const newState = forceOn ? true : !this._autopilotVsHold;
        this._autopilotVsHold = newState;
        if (newState) {
            this._autopilotAltHold = false;
            this._autopilotAprHold = false;
            const vsFpm = this.velocity.y * 196.85;
            this._autopilotTargetVsFpm = Math.round(vsFpm / 100) * 100;
            if (Math.abs(this._autopilotTargetVsFpm) < 50) {
                this._autopilotTargetVsFpm = vsFpm >= 0 ? AP_VS_DEFAULT_FPM : -AP_VS_DEFAULT_FPM;
            }
        }
    }

    private _engageAutopilotNavHold(forceOn: boolean = false): void {
        const newState = forceOn ? true : !this._autopilotNavHold;
        if (newState && !this._apCurrentNavTarget()) {
            console.warn('[AP] NAV armed but no waypoint/destination available');
            return;
        }
        this._autopilotNavHold = newState;
        if (newState) {
            this._autopilotHdgHold = false;
            this._autopilotAprHold = false;
        }
    }

    private _engageAutopilotAprHold(forceOn: boolean = false): void {
        const newState = forceOn ? true : !this._autopilotAprHold;
        if (newState && !this._apCurrentNavTarget()) {
            console.warn('[AP] APR armed but no destination available');
            return;
        }
        this._autopilotAprHold = newState;
        if (newState) {
            this._autopilotHdgHold = false;
            this._autopilotAltHold = false;
            this._autopilotVsHold = false;
            this._autopilotNavHold = false;
        }
    }

    private _adjustAutopilotVsTarget(deltaFpm: number): void {
        this._autopilotTargetVsFpm = Math.max(-3000, Math.min(3000, this._autopilotTargetVsFpm + deltaFpm));
    }

    private _adjustAutopilotAltTarget(deltaFt: number): void {
        this._autopilotTargetAltFt = Math.max(0, Math.min(50000, this._autopilotTargetAltFt + deltaFt));
    }

    private _adjustAutopilotHdgTarget(deltaDeg: number): void {
        this._autopilotTargetHdgDeg = (this._autopilotTargetHdgDeg + deltaDeg + 360) % 360;
    }

    private _wireAutopilotPanel(): void {
        const wire = (id: string, fn: () => void) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fn();
                this._cockpitClick();
            });
        };
        wire('ap-btn-ap',  () => this._engageAutopilotMaster());
        wire('ap-btn-hdg', () => { if (!this._autopilotMaster) this._engageAutopilotMaster(); this._engageAutopilotHdgHold(); });
        wire('ap-btn-alt', () => { if (!this._autopilotMaster) this._engageAutopilotMaster(); this._engageAutopilotAltHold(); });
        wire('ap-btn-vs',  () => { if (!this._autopilotMaster) this._engageAutopilotMaster(); this._engageAutopilotVsHold(); });
        wire('ap-btn-nav', () => { if (!this._autopilotMaster) this._engageAutopilotMaster(); this._engageAutopilotNavHold(); });
        wire('ap-btn-apr', () => { if (!this._autopilotMaster) this._engageAutopilotMaster(); this._engageAutopilotAprHold(); });
    }

    private _updateAutopilotPanel(): void {
        const setBtn = (id: string, active: boolean) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.background = active ? '#1a4830' : '#222';
            el.style.color      = active ? '#40ff80' : '#aaa';
            el.style.borderColor = active ? '#40ff80' : '#555';
        };
        setBtn('ap-btn-ap',  this._autopilotMaster);
        setBtn('ap-btn-hdg', this._autopilotHdgHold);
        setBtn('ap-btn-alt', this._autopilotAltHold);
        setBtn('ap-btn-vs',  this._autopilotVsHold);
        setBtn('ap-btn-nav', this._autopilotNavHold);
        setBtn('ap-btn-apr', this._autopilotAprHold);
        const hdgEl = document.getElementById('ap-tgt-hdg');
        const altEl = document.getElementById('ap-tgt-alt');
        const vsEl  = document.getElementById('ap-tgt-vs');
        if (hdgEl) hdgEl.textContent = String(Math.round(this._autopilotTargetHdgDeg)).padStart(3, '0');
        if (altEl) altEl.textContent = String(Math.round(this._autopilotTargetAltFt)).padStart(5, '0');
        if (vsEl)  vsEl.textContent  = `${this._autopilotTargetVsFpm >= 0 ? '+' : ''}${Math.round(this._autopilotTargetVsFpm)}`;
    }

    private _maybeDisengageAutopilotByInput(): void {
        if (!this._autopilotMaster) return;
        const stick = Math.max(
            Math.abs(this.smoothedPitch),
            Math.abs(this.smoothedRoll),
            Math.abs(this.smoothedYaw),
        );
        if (stick > AP_INPUT_DISENGAGE_THRESHOLD) {
            this._autopilotMaster = false;
            this._autopilotHdgHold = false;
            this._autopilotAltHold = false;
            this._autopilotVsHold = false;
            this._autopilotNavHold = false;
            this._autopilotAprHold = false;
            console.log('[AP] Disengaged by stick input');
        }
    }

    private _updateNavLights(dt: number): void {
        if (this._navLights.length === 0) return;
        this._navStrobeTimer += dt;
        const t = this._navStrobeTimer;
        const gearDown = this.gearState === GEAR_STATE_DOWN || this.gearState === GEAR_STATE_EXTENDING;
        const landingOn = this._landingLightsOn || gearDown;
        for (const nav of this._navLights) {
            let on = true;
            switch (nav.kind) {
                case NAV_LIGHT_KIND_BEACON: {
                    const phaseT = ((t + nav.phase * NAV_BEACON_PERIOD_S) % NAV_BEACON_PERIOD_S) / NAV_BEACON_PERIOD_S;
                    on = phaseT < NAV_BEACON_ON_FRAC;
                    break;
                }
                case NAV_LIGHT_KIND_STROBE: {
                    const phaseT = (t + nav.phase * NAV_STROBE_PERIOD_S) % NAV_STROBE_PERIOD_S;
                    on = (phaseT < NAV_STROBE_PERIOD_S * NAV_STROBE_PULSE_FRAC)
                        || (phaseT > NAV_STROBE_DOUBLE_GAP_S && phaseT < NAV_STROBE_DOUBLE_GAP_S + NAV_STROBE_PERIOD_S * NAV_STROBE_PULSE_FRAC);
                    break;
                }
                case NAV_LIGHT_KIND_ANTICOL: {
                    const phaseT = ((t + nav.phase * NAV_ANTICOL_PERIOD_S) % NAV_ANTICOL_PERIOD_S) / NAV_ANTICOL_PERIOD_S;
                    on = phaseT < NAV_ANTICOL_ON_FRAC;
                    break;
                }
                case NAV_LIGHT_KIND_LANDING:
                    on = landingOn;
                    break;
                default:
                    on = true;
            }
            nav.light.intensity = on ? nav.maxIntensity : 0;
            nav.core.isVisible = on;
        }
    }

    // ── Camera ────────────────────────────────────────────────────────────────

    private _buildCamera(scene: BABYLON.Scene): void {
        const canvas = scene.getEngine().getRenderingCanvas();

        this.camera = new BABYLON.ArcRotateCamera(
            'flightCam',
            -Math.PI / 2,
            1.50,
            65,
            this.planeRoot.position.clone(),
            scene,
        );

        this.camera.minZ = 0.5;
        this.camera.maxZ = this.tiles ? 100000 : 60000;
        this.camera.lowerRadiusLimit = CAMERA_LOWER_RADIUS_LIMIT_M;
        this.camera.upperRadiusLimit = CAMERA_UPPER_RADIUS_LIMIT_M;
        this.camera.inertia = 0.8;
        this.camera.panningSensibility = 0;
        this.camera.wheelPrecision = 10;

        this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

        if (canvas) this.camera.attachControl(canvas, true);

        if (this.isMobile) {
            this.camera.inputs.removeByType('ArcRotateCameraPointersInput');
        }

        scene.activeCamera = this.camera;
    }

    // ── Post-Processing ───────────────────────────────────────────────────────

    private _setupPostProcessing(scene: BABYLON.Scene): void {
        const cam = scene.activeCamera;
        this._pipeline = new BABYLON.DefaultRenderingPipeline('pp', true, scene, cam ? [cam] : []);
        this._pipeline.samples        = 4;
        this._pipeline.bloomEnabled   = true;
        this._pipeline.bloomWeight    = 0.4;
        this._pipeline.bloomKernel    = 128;
        this._pipeline.bloomScale     = 0.5;
        this._pipeline.bloomThreshold = 0.8;
        this._pipeline.chromaticAberrationEnabled            = true;
        this._pipeline.chromaticAberration.aberrationAmount   = 0.8;
        this._pipeline.chromaticAberration.radialIntensity    = 1.0;
        this._pipeline.sharpenEnabled        = true;
        this._pipeline.sharpen.edgeAmount    = 0.2;
        this._pipeline.imageProcessingEnabled                 = true;
        this._pipeline.imageProcessing.toneMappingEnabled     = true;
        this._pipeline.imageProcessing.toneMappingType        = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        this._pipeline.imageProcessing.exposure               = 1.0;
        this._pipeline.imageProcessing.contrast               = 1.08;
        this._pipeline.imageProcessing.vignetteEnabled        = true;
        this._pipeline.imageProcessing.vignetteWeight         = 2.2;
        this._pipeline.imageProcessing.vignetteColor          = new BABYLON.Color4(0, 0, 0, 0);
        this._pipeline.imageProcessing.vignetteBlendMode      = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

        this._ssao = new BABYLON.SSAO2RenderingPipeline('ssao', scene, {
            ssaoRatio: 0.5,
            blurRatio: 0.5,
        });
        this._ssao.radius = 3.0;
        this._ssao.totalStrength = 1.2;
        this._ssao.base = 0.1;
        this._ssao.samples = 16;
        this._ssao.maxZ = 250;
        this._ssao.minZAspect = 0.5;
        if (cam) scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', cam);

        const sunEmitter = scene.getMeshByName('sunMesh') || scene.getLightByName('sun');
        if (sunEmitter) {
            const lfs = new BABYLON.LensFlareSystem('sunFlare', sunEmitter, scene);
            lfs.borderLimit = 600;
            ([[0.6, 0], [0.2, 0.4], [0.12, 0.7], [0.3, -0.2]] as [number, number][]).forEach(([size, pos]) => {
                new BABYLON.LensFlare(size, pos, new BABYLON.Color3(1, 0.95, 0.6),
                    'https://assets.babylonjs.com/textures/flare.png', lfs);
            });
            this._lensFlareSystem = lfs;
        }

        this._initGraphicsSettings(scene);
        this._initAudioSettings();
        this._initUxSettings();
        this._initF12Screenshot();
        this._installGamepadListeners();
        this._buildChecklistOverlay();
        this._buildFpsLatencyOverlay();
        this._applyAccessibility();
        this._mouseYokeKeyLock = false;
        this._setMouseYoke(UiPreferences.get().mouseYoke);
        this._timeScale = UiPreferences.get().pauseTimeScale;
        this._prefsUnsubscribe = UiPreferences.onChange(() => {
            this._applyAccessibility();
            this._refreshKeysHelper();
        });
        this._bindingsUnsubscribe = InputBindings.onChange(() => {
            this._refreshKeysHelper();
        });
        this._refreshKeysHelper();
    }

    private _initUxSettings(): void {
        const prefs = UiPreferences.get();
        const setVal = (id: string, val: string | number) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = String(val); };
        const setSel = (id: string, val: string) => { const el = document.getElementById(id) as HTMLSelectElement | null; if (el) el.value = val; };
        const setCheck = (id: string, val: boolean) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.checked = val; };
        setSel('ux-units', prefs.unitSystem);
        setSel('ux-language', prefs.language);
        setCheck('ux-mouse-yoke', prefs.mouseYoke);
        setCheck('ux-easy-mode', prefs.easyMode);
        setVal('ux-auto-thr', prefs.autoThrottleTargetKts);
        setVal('ux-expo', Math.round(prefs.desktopExpo * 100) / 100);
        setVal('ux-deadzone', Math.round(prefs.desktopDeadzone * 100));
        setVal('ux-sensitivity', Math.round(prefs.desktopSensitivity * 100));
        setCheck('ux-gamepad', prefs.gamepadEnabled);
        setCheck('ux-checklist', prefs.showChecklist);
        setCheck('ux-fps-overlay', prefs.showFpsOverlay);
        setCheck('ux-latency-overlay', prefs.showLatencyOverlay);
        setSel('ux-colorblind', prefs.colorblindMode);
        setVal('ux-font-scale', Math.round(prefs.fontScale * 100));
        setCheck('ux-contrast', prefs.contrastBoost);

        const updTextLabel = (id: string, label: string) => { const el = document.getElementById(id); if (el) el.textContent = label; };
        const handleNumber = (id: string, key: keyof ReturnType<typeof UiPreferences.get>, scale: number, suffix: string) => {
            const el = document.getElementById(id) as HTMLInputElement | null;
            const valEl = document.getElementById(`${id}-val`);
            if (!el) return;
            const update = () => {
                const v = (parseFloat(el.value) || 0) * scale;
                if (valEl) valEl.textContent = `${el.value}${suffix}`;
                UiPreferences.set({ [key]: v } as Partial<ReturnType<typeof UiPreferences.get>>);
            };
            el.addEventListener('input', update);
            const init = (parseFloat(el.value) || 0);
            updTextLabel(`${id}-val`, `${init}${suffix}`);
        };
        handleNumber('ux-expo', 'desktopExpo', 1, 'x');
        handleNumber('ux-deadzone', 'desktopDeadzone', 0.01, '%');
        handleNumber('ux-sensitivity', 'desktopSensitivity', 0.01, '%');
        handleNumber('ux-font-scale', 'fontScale', 0.01, '%');

        const autoThrEl = document.getElementById('ux-auto-thr') as HTMLInputElement | null;
        if (autoThrEl) {
            autoThrEl.addEventListener('input', () => {
                UiPreferences.set({ autoThrottleTargetKts: parseInt(autoThrEl.value, 10) || 250 });
            });
        }

        const handleCheck = (id: string, key: keyof ReturnType<typeof UiPreferences.get>) => {
            const el = document.getElementById(id) as HTMLInputElement | null;
            if (!el) return;
            el.addEventListener('change', () => {
                UiPreferences.set({ [key]: el.checked } as Partial<ReturnType<typeof UiPreferences.get>>);
            });
        };
        handleCheck('ux-mouse-yoke', 'mouseYoke');
        handleCheck('ux-easy-mode', 'easyMode');
        handleCheck('ux-gamepad', 'gamepadEnabled');
        handleCheck('ux-checklist', 'showChecklist');
        handleCheck('ux-fps-overlay', 'showFpsOverlay');
        handleCheck('ux-latency-overlay', 'showLatencyOverlay');
        handleCheck('ux-contrast', 'contrastBoost');

        const handleSelect = (id: string, key: keyof ReturnType<typeof UiPreferences.get>) => {
            const el = document.getElementById(id) as HTMLSelectElement | null;
            if (!el) return;
            el.addEventListener('change', () => {
                UiPreferences.set({ [key]: el.value } as Partial<ReturnType<typeof UiPreferences.get>>);
            });
        };
        handleSelect('ux-units', 'unitSystem');
        handleSelect('ux-language', 'language');
        handleSelect('ux-colorblind', 'colorblindMode');

        UiPreferences.onChange((p) => {
            this._setMouseYoke(p.mouseYoke);
        });

        const replayBtn = document.getElementById('ux-replay-btn');
        if (replayBtn) replayBtn.addEventListener('click', () => this._toggleReplay());
        const towerBtn = document.getElementById('ux-tower-btn');
        if (towerBtn) towerBtn.addEventListener('click', () => {
            this._setCameraMode(CAMERA_MODE_TOWER);
            this._captureTowerCameraPosition();
        });
        const screenshotBtn = document.getElementById('ux-screenshot-btn');
        if (screenshotBtn) screenshotBtn.addEventListener('click', () => this._takeScreenshot());
        const resetKeysBtn = document.getElementById('ux-keys-reset');
        if (resetKeysBtn) resetKeysBtn.addEventListener('click', () => InputBindings.reset());

        this._buildKeymapList();

        const uxHeader = document.getElementById('ux-header');
        const uxBody = document.getElementById('ux-settings');
        if (uxHeader && uxBody) {
            uxHeader.addEventListener('click', () => {
                const visible = uxBody.style.display !== 'none';
                uxBody.style.display = visible ? 'none' : '';
                const h3 = uxHeader.querySelector('h3');
                if (h3) h3.textContent = visible ? 'UX \u25B8' : 'UX \u25BE';
            });
        }
    }

    private _buildKeymapList(): void {
        const container = document.getElementById('ux-keymap-list');
        if (!container) return;
        const bindings = InputBindings.get();
        const actions = Object.keys(DEFAULT_KEY_BINDINGS) as ActionId[];
        container.innerHTML = '';
        for (const action of actions) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:space-between;font-size:10px;padding:2px 0';
            const lbl = document.createElement('span');
            lbl.textContent = ACTION_LABELS[action];
            lbl.style.cssText = 'flex:1;color:rgba(200,255,230,.7)';
            const btn = document.createElement('button');
            btn.textContent = bindings[action];
            btn.style.cssText = 'background:rgba(0,30,20,.6);border:1px solid rgba(80,255,160,.3);color:#40ffaa;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:10px;cursor:pointer;min-width:80px';
            btn.addEventListener('click', () => {
                btn.textContent = I18n.t('settings.keymap.waitKey');
                btn.style.color = '#ffcc00';
                const handler = (ev: KeyboardEvent) => {
                    ev.preventDefault();
                    if (ev.code === 'Escape') {
                        btn.textContent = InputBindings.codeFor(action);
                        btn.style.color = '#40ffaa';
                    } else {
                        InputBindings.setBinding(action, ev.code);
                        btn.textContent = ev.code;
                        btn.style.color = '#40ffaa';
                    }
                    window.removeEventListener('keydown', handler, true);
                };
                window.addEventListener('keydown', handler, true);
            });
            row.appendChild(lbl);
            row.appendChild(btn);
            container.appendChild(row);
        }
        InputBindings.onChange((b) => {
            const buttons = container.querySelectorAll('button');
            const actionsList = Object.keys(DEFAULT_KEY_BINDINGS) as ActionId[];
            buttons.forEach((btn, idx) => {
                if (actionsList[idx]) btn.textContent = b[actionsList[idx]];
            });
        });
    }

    private _initF12Screenshot(): void {
        if (this._f12KeydownHandler) return;
        const handler = (ev: KeyboardEvent) => {
            const screenshotCode = InputBindings.codeFor('screenshot');
            if (ev.code === screenshotCode) {
                ev.preventDefault();
                if (!this._screenshotKeyLock) {
                    this._screenshotKeyLock = true;
                    this._takeScreenshot();
                    setTimeout(() => { this._screenshotKeyLock = false; }, 500);
                }
            }
        };
        this._f12KeydownHandler = handler;
        window.addEventListener('keydown', handler, true);
    }

    private _takeScreenshot(): void {
        try {
            const canvas = this.scene?.getEngine?.()?.getRenderingCanvas?.();
            if (!canvas) return;
            const dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png');
            const a = document.createElement('a');
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const { lat, lon } = this._getCurrentLatLon();
            const altFt = Math.round((this.refAlt + (this.planeRoot?.position.y ?? 0)) * 3.28084);
            const speedKts = Math.round((Number.isFinite(this._lastTasMs) ? this._lastTasMs : this.velocity.length()) * MS_TO_KT);
            const meta = `lat${lat.toFixed(3)}_lon${lon.toFixed(3)}_alt${altFt}ft_kts${speedKts}`;
            a.download = `flightsim_${ts}_${meta}.png`;
            a.href = dataUrl;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            console.log(`[Screenshot] Saved: ${a.download}`);
            this._showToast(I18n.t('screenshot.taken'));
        } catch (err) {
            console.warn('[Screenshot] failed:', err);
        }
    }

    private _showToast(message: string, durationMs: number = 2200): void {
        try {
            let toast = document.getElementById('ux-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'ux-toast';
                toast.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(0,30,20,.85);border:1px solid rgba(80,255,160,.4);color:#40ffaa;padding:10px 20px;border-radius:8px;font-family:Inter,sans-serif;font-size:12px;pointer-events:none;backdrop-filter:blur(8px);transition:opacity .3s';
                document.body.appendChild(toast);
            }
            toast.textContent = message;
            toast.style.opacity = '1';
            setTimeout(() => { if (toast) toast.style.opacity = '0'; }, durationMs);
        } catch (err) {
            console.warn('[Toast] failed:', err);
        }
    }

    private _installGamepadListeners(): void {
        this._gamepad.onConnect((id) => {
            console.log(`[Gamepad] Connected: ${id}`);
            this._showToast(I18n.t('gamepad.connected'));
        });
        this._gamepad.onDisconnect(() => {
            console.log('[Gamepad] Disconnected');
            this._showToast(I18n.t('gamepad.disconnected'));
        });
    }

    private _buildChecklistOverlay(): void {
        if (this._checklistEl) return;
        const el = document.createElement('div');
        el.id = 'ux-checklist';
        el.style.cssText = 'position:fixed;top:90px;right:10px;z-index:120;background:rgba(0,30,20,.7);border:1px solid rgba(80,255,160,.25);border-radius:8px;padding:10px 14px;font-family:Inter,sans-serif;color:#7df9c8;font-size:11px;backdrop-filter:blur(6px);min-width:180px;display:none;pointer-events:none';
        document.body.appendChild(el);
        this._checklistEl = el;
    }

    private _buildFpsLatencyOverlay(): void {
        if (this._ovrFpsLatencyEl) return;
        const el = document.createElement('div');
        el.id = 'ux-fps-latency';
        el.style.cssText = 'position:fixed;top:10px;right:10px;z-index:121;background:rgba(0,20,15,.65);border:1px solid rgba(80,255,160,.2);border-radius:6px;padding:4px 8px;font-family:monospace;color:#40ffaa;font-size:10px;backdrop-filter:blur(4px);pointer-events:none;display:none';
        document.body.appendChild(el);
        this._ovrFpsLatencyEl = el;
    }

    private _applyAccessibility(): void {
        const prefs = UiPreferences.get();
        const root = document.documentElement;
        root.style.setProperty('--font-scale', String(prefs.fontScale));
        document.body.classList.toggle('a11y-contrast', prefs.contrastBoost);
        document.body.classList.toggle('a11y-cb-protan', prefs.colorblindMode === 'protanopia');
        document.body.classList.toggle('a11y-cb-deutan', prefs.colorblindMode === 'deuteranopia');
        document.body.classList.toggle('a11y-cb-tritan', prefs.colorblindMode === 'tritanopia');
        document.body.classList.toggle('a11y-no-cb', prefs.colorblindMode === COLORBLIND_NONE);
    }

    private _makeDraggable(el: HTMLElement): void {
        let startX = 0, startY = 0, elX = 0, elY = 0, dragging = false;
        el.style.pointerEvents = 'auto';
        el.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button !== 0) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            elX = rect.left;
            elY = rect.top;
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e: MouseEvent) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            el.style.position = 'fixed';
            el.style.left = `${elX + dx}px`;
            el.style.top = `${elY + dy}px`;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.transform = 'none';
        });
        window.addEventListener('mouseup', () => { dragging = false; });
    }

    private _refreshKeysHelper(): void {
        const helper = document.getElementById('keys-helper');
        if (!helper) return;
        const b = InputBindings.get();
        const groups: Array<[string, string[]]> = [
            ['Throttle', [b.throttleUp, b.throttleDown]],
            ['Pitch', [b.pitchUp, b.pitchDown]],
            ['Roll', [b.rollLeft, b.rollRight]],
            ['Yaw', [b.yawLeft, b.yawRight]],
            ['Flaps', [b.flapDown, b.flapUp]],
            ['Spoilers', ['Backslash']],
            ['Trim Pitch', [b.trimPitchDown, b.trimPitchUp]],
            ['Trim Yaw', [b.trimYawLeft, b.trimYawRight]],
            ['Trim Wheel', ['PageUp', 'PageDown']],
            ['Brake', [b.brakeToggle]],
            ['Gear', [b.gearToggle]],
            ['Lights', ['KeyL']],
            ['Camera', [b.cameraCycle]],
            ['Tower', [b.towerCamera]],
            ['Pause', [b.pauseToggle]],
            ['TimeScale', [b.timeScaleDown, b.timeScaleUp]],
            ['Easy', [b.easyModeToggle]],
            ['Yoke', [b.mouseYokeToggle]],
            ['Replay', [b.replayToggle]],
            ['Screenshot', [b.screenshot]],
            ['Respawn', [b.respawn]],
            ['AP Master', ['KeyZ']],
            ['AP HDG', ['KeyF']],
            ['AP ALT', ['KeyJ']],
            ['AP VS',  ['KeyK']],
            ['AP NAV', ['KeyU']],
            ['AP APR', ['KeyI']],
            ['Kill Eng', ['Digit1', 'Digit2', 'Digit3', 'Digit4']],
            ['Helper', ['KeyH', 'Slash']],
        ];
        const friendly = (code: string): string => {
            if (code.startsWith('Key')) return code.slice(3);
            if (code.startsWith('Digit')) return code.slice(5);
            if (code.startsWith('Arrow')) {
                if (code === 'ArrowUp') return '\u2191';
                if (code === 'ArrowDown') return '\u2193';
                if (code === 'ArrowLeft') return '\u2190';
                if (code === 'ArrowRight') return '\u2192';
            }
            if (code === 'BracketLeft') return '[';
            if (code === 'BracketRight') return ']';
            if (code === 'Equal') return '=';
            if (code === 'Minus') return '-';
            if (code === 'Slash') return '/';
            if (code === 'Backslash') return '\\';
            if (code === 'PageUp') return 'PgUp';
            if (code === 'PageDown') return 'PgDn';
            return code;
        };
        helper.innerHTML = groups.map(([label, codes]) =>
            `<div class="kh-group"><span class="kh-label">${label}</span>${codes.map(c => `<kbd>${friendly(c)}</kbd>`).join('')}</div>`
        ).join('');
    }

    private _updateChecklistOverlay(speedKts: number, aglFt: number, vsFpm: number, gearDown: boolean, flapsDown: boolean): void {
        const el = this._checklistEl;
        if (!el) return;
        const prefs = UiPreferences.get();
        if (!prefs.showChecklist) {
            if (el.style.display !== 'none') el.style.display = 'none';
            return;
        }
        let phaseKey = '';
        let items: Array<[string, boolean]> = [];
        if (this.isOnGround && speedKts < 30) {
            phaseKey = 'checklist.preTakeoff';
            items = [
                [I18n.t('checklist.preTakeoff.flaps'), flapsDown],
                [I18n.t('checklist.preTakeoff.brakes'), this.brakesOn],
                [I18n.t('checklist.preTakeoff.gear'), gearDown],
                [I18n.t('checklist.preTakeoff.mixture'), this.aircraftConfig.engine_type !== ENGINE_TYPE_PISTON || this.mixtureLevel >= 0.6],
            ];
        } else if (this.isOnGround && speedKts >= 30) {
            phaseKey = 'checklist.takeoff';
            items = [
                [I18n.t('checklist.takeoff.throttle'), this.thrust >= 0.85],
                [I18n.t('checklist.takeoff.rotate'), false],
            ];
        } else if (vsFpm > 200 && aglFt < 5000) {
            phaseKey = 'checklist.climb';
            items = [
                [I18n.t('checklist.climb.gear'), !gearDown],
                [I18n.t('checklist.climb.flaps'), !flapsDown],
            ];
        } else if (vsFpm < -200 && aglFt > 1500) {
            phaseKey = 'checklist.descent';
            items = [[I18n.t('checklist.descent.throttle'), this.thrust < 0.5]];
        } else if (aglFt < 1500 && aglFt > 50 && !this.isOnGround) {
            phaseKey = 'checklist.approach';
            items = [
                [I18n.t('checklist.approach.flaps'), flapsDown],
                [I18n.t('checklist.approach.gear'), gearDown],
            ];
        } else if (aglFt <= 50 && !this.isOnGround) {
            phaseKey = 'checklist.landing';
            items = [[I18n.t('checklist.landing.flare'), this.thrust < 0.3]];
        } else {
            phaseKey = 'checklist.cruise';
            items = [[I18n.t('checklist.cruise.altitude'), Math.abs(vsFpm) < 200]];
        }
        if (phaseKey !== this._checklistPhase) this._checklistPhase = phaseKey;
        const title = `<div style="font-family:Orbitron,monospace;font-size:10px;color:#40ffaa;letter-spacing:.12em;border-bottom:1px solid rgba(80,255,160,.2);padding-bottom:3px;margin-bottom:4px">${I18n.t(phaseKey)}</div>`;
        const list = items.map(([txt, ok]) =>
            `<div style="display:flex;gap:6px;align-items:center"><span style="color:${ok ? '#40ffaa' : '#888'}">${ok ? '\u2713' : '\u25CB'}</span><span style="${ok ? '' : 'color:rgba(200,255,230,.4)'}">${txt}</span></div>`
        ).join('');
        el.innerHTML = title + list;
        el.style.display = '';
    }

    private _updateFpsLatencyOverlay(): void {
        const el = this._ovrFpsLatencyEl;
        if (!el) return;
        const prefs = UiPreferences.get();
        if (!prefs.showFpsOverlay && !prefs.showLatencyOverlay) {
            if (el.style.display !== 'none') el.style.display = 'none';
            return;
        }
        const fps = this.scene?.getEngine?.()?.getFps?.()?.toFixed(0) ?? '--';
        const parts: string[] = [];
        if (prefs.showFpsOverlay) parts.push(`${fps} ${I18n.t('hud.fps')}`);
        if (prefs.showLatencyOverlay && this.mpClient) {
            const ageMs = this.mpClient.getLastMessageAgeMs();
            const rate = this.mpClient.getRecentMessageRateHz();
            const malformed = this.mpClient.getMalformedCount();
            if (ageMs >= 0) {
                parts.push(`WS ${ageMs.toFixed(0)}ms`);
                parts.push(`${rate.toFixed(1)}Hz`);
                if (malformed > 0) parts.push(`drop=${malformed}`);
            }
        }
        if (this._paused) parts.push(I18n.t('hud.paused'));
        else if (Math.abs(this._timeScale - 1) > 0.01) parts.push(`${this._timeScale.toFixed(2)}${I18n.t('hud.timeScale')}`);
        if (this._gamepadAxes.connected) parts.push('GP');
        if (UiPreferences.get().easyMode) parts.push('EASY');
        if (this._mouseYokeActive) parts.push('YOKE');
        if (this._replayActive) parts.push(I18n.t('replay.playing'));
        el.textContent = parts.join('  |  ');
        el.style.display = '';
    }

    private _initAudioSettings(): void {
        const stored = AudioCore.getVolumes();
        const ids: Array<keyof typeof stored> = ['master', 'engine', 'wind', 'alerts', 'atc', 'music', 'click'];
        for (const key of ids) {
            const slider = document.getElementById(`aud-${key}`) as HTMLInputElement | null;
            const valEl = document.getElementById(`aud-${key}-val`);
            if (!slider) continue;
            const pct = Math.round(stored[key] * 100);
            slider.value = String(pct);
            if (valEl) valEl.textContent = `${pct}%`;
            slider.addEventListener('input', () => {
                const v = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0)) / 100;
                if (valEl) valEl.textContent = `${Math.round(v * 100)}%`;
                AudioCore.setVolumes({ [key]: v } as Partial<typeof stored>);
            });
        }

        const audHeader = document.getElementById('audio-header');
        const audSettings = document.getElementById('audio-settings');
        if (audHeader && audSettings) {
            audHeader.addEventListener('click', () => {
                const visible = audSettings.style.display !== 'none';
                audSettings.style.display = visible ? 'none' : '';
                const h3 = audHeader.querySelector('h3');
                if (h3) h3.textContent = visible ? 'AUDIO \u25B8' : 'AUDIO \u25BE';
            });
        }
    }

    private _initGraphicsSettings(scene: BABYLON.Scene): void {
        const saved = localStorage.getItem('gfx_settings');
        let cfg: Record<string, any> = {};
        if (saved) { try { cfg = JSON.parse(saved); } catch (_) { /* ignore */ } }
        if (typeof cfg.cloudDensity === 'string' && cfg.cloudDensity === 'ultra') {
            this._cloudVolumetric = true;
        }

        const saveSettings = () => {
            const s: Record<string, any> = {};
            s.bloom = (document.getElementById('gfx-bloom') as HTMLInputElement)?.checked ?? true;
            s.bloomWeight = parseInt((document.getElementById('gfx-bloom-weight') as HTMLInputElement)?.value || '40') / 100;
            s.ssao = (document.getElementById('gfx-ssao') as HTMLInputElement)?.checked ?? true;
            s.shadows = (document.getElementById('gfx-shadows') as HTMLInputElement)?.checked ?? true;
            s.shadowQuality = parseInt((document.getElementById('gfx-shadow-quality') as HTMLSelectElement)?.value || '4096');
            s.fog = (document.getElementById('gfx-fog') as HTMLInputElement)?.checked ?? true;
            s.fogDensity = parseInt((document.getElementById('gfx-fog-density') as HTMLInputElement)?.value || '30') / 100;
            s.aa = parseInt((document.getElementById('gfx-aa') as HTMLSelectElement)?.value || '8');
            s.vignette = (document.getElementById('gfx-vignette') as HTMLInputElement)?.checked ?? true;
            s.chromatic = (document.getElementById('gfx-chromatic') as HTMLInputElement)?.checked ?? true;
            s.renderScale = parseInt((document.getElementById('gfx-render-scale') as HTMLInputElement)?.value || '100') / 100;
            s.fpsLimit = parseInt((document.getElementById('gfx-fps-limit') as HTMLSelectElement)?.value || '0');
            s.cloudDensity = (document.getElementById('gfx-cloud-density') as HTMLSelectElement)?.value || 'medium';
            s.overcast = (document.getElementById('gfx-overcast') as HTMLInputElement)?.checked ?? false;
            s.milkyway = (document.getElementById('gfx-milkyway') as HTMLInputElement)?.checked ?? false;
            s.preset = (document.getElementById('gfx-preset') as HTMLSelectElement)?.value || 'high';
            localStorage.setItem('gfx_settings', JSON.stringify(s));
        };

        const cloudDensityFromLabel = (label: string): number => {
            switch (label) {
                case 'low': return CLOUD_DENSITY_MULT_LOW;
                case 'high': return CLOUD_DENSITY_MULT_HIGH;
                case 'ultra': return CLOUD_DENSITY_MULT_ULTRA;
                case 'medium':
                default: return CLOUD_DENSITY_MULT_MEDIUM;
            }
        };

        const applySettings = () => {
            saveSettings();
            requestAnimationFrame(() => {
                try {
                    const p = this._pipeline;
                    const ssao = this._ssao;
                    const engine = this.scene?.getEngine();
                    if (!p || !engine) return;

                    const bloomEl = document.getElementById('gfx-bloom') as HTMLInputElement | null;
                    const bloomWEl = document.getElementById('gfx-bloom-weight') as HTMLInputElement | null;
                    const ssaoEl = document.getElementById('gfx-ssao') as HTMLInputElement | null;
                    const shadowsEl = document.getElementById('gfx-shadows') as HTMLInputElement | null;
                    const shadowQEl = document.getElementById('gfx-shadow-quality') as HTMLSelectElement | null;
                    const fogEl = document.getElementById('gfx-fog') as HTMLInputElement | null;
                    const fogDEl = document.getElementById('gfx-fog-density') as HTMLInputElement | null;
                    const aaEl = document.getElementById('gfx-aa') as HTMLSelectElement | null;
                    const vigEl = document.getElementById('gfx-vignette') as HTMLInputElement | null;
                    const chrEl = document.getElementById('gfx-chromatic') as HTMLInputElement | null;
                    const scaleEl = document.getElementById('gfx-render-scale') as HTMLInputElement | null;
                    const scaleLbl = document.getElementById('gfx-render-scale-val');
                    const fpsEl = document.getElementById('gfx-fps-limit') as HTMLSelectElement | null;

                    if (bloomEl) p.bloomEnabled = bloomEl.checked;
                    if (bloomWEl) p.bloomWeight = parseInt(bloomWEl.value) / 100;
                    if (ssaoEl && ssao) {
                        ssao.totalStrength = ssaoEl.checked ? 1.2 : 0;
                    }
                    if (shadowsEl && this._shadowGen) {
                        if (!shadowsEl.checked) {
                            this._shadowGen.setDarkness(1);
                        } else {
                            this._shadowGen.setDarkness(0);
                            if (shadowQEl) {
                                const sz = parseInt(shadowQEl.value);
                                if (sz !== this._shadowGen.mapSize) {
                                    this._shadowGen.mapSize = sz;
                                }
                            }
                        }
                    }
                    if (fogEl) {
                        scene.fogMode = fogEl.checked ? BABYLON.Scene.FOGMODE_EXP2 : BABYLON.Scene.FOGMODE_NONE;
                    }
                    if (fogDEl) {
                        scene.fogDensity = 0.000002 + (parseInt(fogDEl.value) / 100) * 0.000025;
                    }
                    if (aaEl) p.samples = parseInt(aaEl.value);
                    if (vigEl) p.imageProcessing.vignetteEnabled = vigEl.checked;
                    if (chrEl) p.chromaticAberrationEnabled = chrEl.checked;
                    if (scaleEl) {
                        const scale = parseInt(scaleEl.value) / 100;
                        engine.setHardwareScalingLevel(1 / scale);
                        if (scaleLbl) scaleLbl.textContent = scale.toFixed(1) + 'x';
                    }
                    if (fpsEl) {
                        const limit = parseInt(fpsEl.value);
                        const MAX_FPS_CAP = 144;
                        (engine as any).maxFPS = limit > 0 ? limit : MAX_FPS_CAP;
                    }

                    const cloudDensityEl = document.getElementById('gfx-cloud-density') as HTMLSelectElement | null;
                    if (cloudDensityEl) {
                        const newMult = cloudDensityFromLabel(cloudDensityEl.value);
                        const newVolumetric = cloudDensityEl.value === 'ultra';
                        if (newMult !== this._cloudDensityMult || newVolumetric !== this._cloudVolumetric) {
                            this._cloudDensityMult = newMult;
                            this._cloudVolumetric = newVolumetric;
                            this._rebuildClouds(scene);
                        }
                    }
                    const overcastEl = document.getElementById('gfx-overcast') as HTMLInputElement | null;
                    if (overcastEl) {
                        this._setOvercast(scene, overcastEl.checked);
                    }
                    const milkywayEl = document.getElementById('gfx-milkyway') as HTMLInputElement | null;
                    if (milkywayEl) {
                        this._setMilkyWay(scene, milkywayEl.checked);
                    }
                } catch (e) {
                    console.error('[GFX] applySettings error:', e);
                }
            });
        };

        const presets: Record<string, Record<string, any>> = {
            low:    { bloom: false, bloomWeight: 20, ssao: false, shadows: false, shadowQuality: '1024', fog: true, fogDensity: 30, aa: '1', vignette: false, chromatic: false, renderScale: 75, fpsLimit: '0',  cloudDensity: 'low',    overcast: false, milkyway: false },
            medium: { bloom: true,  bloomWeight: 20, ssao: false, shadows: true,  shadowQuality: '2048', fog: true, fogDensity: 30, aa: '2', vignette: true,  chromatic: false, renderScale: 100, fpsLimit: '0', cloudDensity: 'medium', overcast: false, milkyway: false },
            high:   { bloom: true,  bloomWeight: 40, ssao: true,  shadows: true,  shadowQuality: '4096', fog: true, fogDensity: 30, aa: '4', vignette: true,  chromatic: true,  renderScale: 100, fpsLimit: '0', cloudDensity: 'medium', overcast: false, milkyway: false },
            ultra:  { bloom: true,  bloomWeight: 40, ssao: true,  shadows: true,  shadowQuality: '4096', fog: true, fogDensity: 30, aa: '8', vignette: true,  chromatic: true,  renderScale: 100, fpsLimit: '0', cloudDensity: 'high',   overcast: false, milkyway: true  },
        };

        const applyPreset = (name: string) => {
            const p = presets[name];
            if (!p) return;
            const setCheck = (id: string, val: boolean) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.checked = val; };
            const setVal = (id: string, val: any) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = String(val); };
            setCheck('gfx-bloom', p.bloom); setVal('gfx-bloom-weight', p.bloomWeight);
            setCheck('gfx-ssao', p.ssao); setCheck('gfx-shadows', p.shadows);
            setVal('gfx-shadow-quality', p.shadowQuality); setCheck('gfx-fog', p.fog);
            setVal('gfx-fog-density', p.fogDensity); setVal('gfx-aa', p.aa);
            setCheck('gfx-vignette', p.vignette); setCheck('gfx-chromatic', p.chromatic);
            setVal('gfx-render-scale', p.renderScale); setVal('gfx-fps-limit', p.fpsLimit);
            setVal('gfx-cloud-density', p.cloudDensity);
            setCheck('gfx-overcast', p.overcast);
            setCheck('gfx-milkyway', p.milkyway);
            applySettings();
        };

        if (Object.keys(cfg).length > 0) {
            const setCheck = (id: string, val: boolean | undefined) => { if (val !== undefined) { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.checked = val; } };
            const setVal = (id: string, val: any) => { if (val !== undefined) { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = String(val); } };
            setCheck('gfx-bloom', cfg.bloom);
            if (cfg.bloomWeight !== undefined) setVal('gfx-bloom-weight', Math.round(cfg.bloomWeight * 100));
            setCheck('gfx-ssao', cfg.ssao); setCheck('gfx-shadows', cfg.shadows);
            setVal('gfx-shadow-quality', cfg.shadowQuality); setCheck('gfx-fog', cfg.fog);
            if (cfg.fogDensity !== undefined) setVal('gfx-fog-density', Math.round(cfg.fogDensity * 100));
            setVal('gfx-aa', cfg.aa);
            setCheck('gfx-vignette', cfg.vignette); setCheck('gfx-chromatic', cfg.chromatic);
            if (cfg.renderScale !== undefined) setVal('gfx-render-scale', Math.round(cfg.renderScale * 100));
            setVal('gfx-fps-limit', cfg.fpsLimit);
            if (cfg.cloudDensity !== undefined) setVal('gfx-cloud-density', cfg.cloudDensity);
            setCheck('gfx-overcast', cfg.overcast);
            setCheck('gfx-milkyway', cfg.milkyway);
            if (cfg.preset) { const el = document.getElementById('gfx-preset') as HTMLSelectElement | null; if (el) el.value = cfg.preset; }
            this._safeSetTimeout(() => applySettings(), 100);
        }

        const ids = ['gfx-bloom', 'gfx-bloom-weight', 'gfx-ssao', 'gfx-shadows', 'gfx-shadow-quality', 'gfx-fog', 'gfx-fog-density', 'gfx-aa', 'gfx-vignette', 'gfx-chromatic', 'gfx-render-scale', 'gfx-fps-limit', 'gfx-cloud-density', 'gfx-overcast', 'gfx-milkyway'];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => applySettings());
        }

        const presetEl = document.getElementById('gfx-preset');
        if (presetEl) {
            presetEl.addEventListener('change', () => {
                applyPreset((presetEl as HTMLSelectElement).value);
            });
        }
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    private _handleInput(_dt: number): void {
        let targetPitch: number;
        let targetRoll: number;
        let targetYaw: number;

        const LATERAL_SMOOTHING_RATE = this.isMobile ? 0.9 : 1.2;
        const LATERAL_RETURN_RATE    = this.isMobile ? 0.7 : 0.9;
        const cfgSmoothing = this.aircraftConfig.control_smoothing_rate;
        const PITCH_SMOOTHING_RATE = (cfgSmoothing != null && cfgSmoothing > 0)
            ? cfgSmoothing
            : LATERAL_SMOOTHING_RATE;
        const PITCH_RETURN_RATE    = (cfgSmoothing != null && cfgSmoothing > 0)
            ? cfgSmoothing * 0.75
            : LATERAL_RETURN_RATE;
        const cfgInputMag = this.aircraftConfig.control_input_magnitude;
        const KEY_PITCH_MAGNITUDE = (cfgInputMag != null && cfgInputMag > 0) ? cfgInputMag : 0.75;
        const KEY_ROLL_MAGNITUDE  = 0.55;
        const KEY_YAW_MAGNITUDE   = 0.65;

        const prefs = UiPreferences.get();
        const bind = (action: ActionId): string => InputBindings.codeFor(action);
        const gpDeadzone = Math.max(0, Math.min(0.4, prefs.desktopDeadzone));
        const gpExpo = Math.max(1, Math.min(4, prefs.desktopExpo));
        const gpSens = Math.max(0.3, Math.min(3, prefs.desktopSensitivity));
        const gpAxes = prefs.gamepadEnabled ? this._gamepad.read(gpDeadzone, gpExpo, gpSens) : { aileron: 0, elevator: 0, rudder: 0, throttle: 0, connected: false };
        this._gamepadAxes = gpAxes;
        const gpEdges = prefs.gamepadEnabled ? this._gamepad.readEdges() : { gear: false, brake: false, flapDown: false, flapUp: false, camera: false, respawn: false, pause: false };

        if (this.isMobile) {
            targetPitch = this.touchPitchInput * 0.7;
            targetRoll = this.touchRollInput * 0.18;
            targetYaw = 0;
            this.thrust = this.touchThrust;
        } else {
            const p = (code: string) => this.input.isKeyDown(code);

            if (p(bind('throttleUp'))) this.thrust = Math.min(this.aircraftConfig.afterburner_thrust_mult ?? 1.0, this.thrust + _dt * this.aircraftConfig.throttle_up_rate);
            if (p(bind('throttleDown'))) this.thrust = Math.max(0, this.thrust - _dt * this.aircraftConfig.throttle_down_rate);

            const applyAxisShape = (raw: number): number => {
                const dz = gpDeadzone;
                const a = Math.abs(raw);
                if (a < dz) return 0;
                const sign = raw < 0 ? -1 : 1;
                const norm = (a - dz) / Math.max(0.0001, 1 - dz);
                return sign * Math.pow(Math.max(0, Math.min(1, norm)), gpExpo) * gpSens;
            };
            const keyPitchRaw = (p(bind('pitchUp')) ? -1 : p(bind('pitchDown')) ? 1 : 0);
            const keyRollRaw  = (p(bind('rollRight')) ? -1 : p(bind('rollLeft')) ? 1 : 0);
            const keyYawRaw   = ((p(bind('yawLeft')) || p('KeyA')) ? 1 : (p(bind('yawRight')) || p('KeyD')) ? -1 : 0);
            targetPitch = applyAxisShape(keyPitchRaw) * KEY_PITCH_MAGNITUDE;
            targetRoll  = applyAxisShape(keyRollRaw)  * KEY_ROLL_MAGNITUDE;
            targetYaw   = applyAxisShape(keyYawRaw)   * KEY_YAW_MAGNITUDE;

            if (gpAxes.connected) {
                if (Math.abs(gpAxes.elevator) > 0.001) targetPitch = -gpAxes.elevator * KEY_PITCH_MAGNITUDE;
                if (Math.abs(gpAxes.aileron)  > 0.001) targetRoll  = -gpAxes.aileron  * KEY_ROLL_MAGNITUDE;
                if (Math.abs(gpAxes.rudder)   > 0.001) targetYaw   =  gpAxes.rudder   * KEY_YAW_MAGNITUDE;
                this.thrust = Math.max(0, Math.min(this.aircraftConfig.afterburner_thrust_mult ?? 1.0, gpAxes.throttle * (this.aircraftConfig.afterburner_thrust_mult ?? 1.0)));
            }

            if (this._mouseYokeActive) {
                targetPitch = this._mouseYokeElevator * KEY_PITCH_MAGNITUDE;
                targetRoll  = this._mouseYokeAileron  * KEY_ROLL_MAGNITUDE;
            }

            const flapDnCode = bind('flapDown');
            if (p(flapDnCode) && !this.flapKeyLock5) {
                this.flapKeyLock5 = true;
                this.flapIndex = Math.max(0, this.flapIndex - 1);
                this._cockpitClick();
            }
            if (!p(flapDnCode)) this.flapKeyLock5 = false;

            const flapUpCode = bind('flapUp');
            if (p(flapUpCode) && !this.flapKeyLock6) {
                this.flapKeyLock6 = true;
                this.flapIndex = Math.min(this.FLAP_STEPS.length - 1, this.flapIndex + 1);
                this._cockpitClick();
            }
            if (!p(flapUpCode)) this.flapKeyLock6 = false;
            if (gpEdges.flapDown) this.flapIndex = Math.max(0, this.flapIndex - 1);
            if (gpEdges.flapUp)   this.flapIndex = Math.min(this.FLAP_STEPS.length - 1, this.flapIndex + 1);

            if (p(bind('respawn')) || gpEdges.respawn) this._spawnPlane();

            const brakeCode = bind('brakeToggle');
            if ((p(brakeCode) && !this.brakeKeyLock) || gpEdges.brake) {
                this.brakeKeyLock = true;
                this.brakesOn = !this.brakesOn;
                this._cockpitClick();
            }
            if (!p(brakeCode)) this.brakeKeyLock = false;

            const camCode = bind('cameraCycle');
            if ((p(camCode) && !this._cameraModeKeyLock) || gpEdges.camera) {
                this._cameraModeKeyLock = true;
                this._cycleCameraMode();
                this._cockpitClick();
            }
            if (!p(camCode)) this._cameraModeKeyLock = false;

            if (p('KeyL') && !this._landingKeyLock) {
                this._landingKeyLock = true;
                this._landingLightsOn = !this._landingLightsOn;
                this._cockpitClick();
            }
            if (!p('KeyL')) this._landingKeyLock = false;

            if (p('KeyZ') && !this._apKeyLockMaster) {
                this._apKeyLockMaster = true;
                this._engageAutopilotMaster();
                this._cockpitClick();
            }
            if (!p('KeyZ')) this._apKeyLockMaster = false;
            if (p('KeyF') && !this._apKeyLockHdg) {
                this._apKeyLockHdg = true;
                this._engageAutopilotHdgHold();
                this._cockpitClick();
            }
            if (!p('KeyF')) this._apKeyLockHdg = false;
            if (p('KeyJ') && !this._apKeyLockAlt) {
                this._apKeyLockAlt = true;
                this._engageAutopilotAltHold();
                this._cockpitClick();
            }
            if (!p('KeyJ')) this._apKeyLockAlt = false;
            if (p('KeyK') && !this._apKeyLockVs) {
                this._apKeyLockVs = true;
                this._engageAutopilotVsHold();
                this._cockpitClick();
            }
            if (!p('KeyK')) this._apKeyLockVs = false;
            if (p('KeyU') && !this._apKeyLockNav) {
                this._apKeyLockNav = true;
                this._engageAutopilotNavHold();
                this._cockpitClick();
            }
            if (!p('KeyU')) this._apKeyLockNav = false;
            if (p('KeyI') && !this._apKeyLockApr) {
                this._apKeyLockApr = true;
                this._engageAutopilotAprHold();
                this._cockpitClick();
            }
            if (!p('KeyI')) this._apKeyLockApr = false;

            if (p('Backslash') && !this._spoilerKeyLock) {
                this._spoilerKeyLock = true;
                if (p('ShiftLeft') || p('ShiftRight')) this._armGroundSpoilers();
                else this._toggleSpoilers();
                this._cockpitClick();
            }
            if (!p('Backslash')) this._spoilerKeyLock = false;

            for (let i = 0; i < 4; i++) {
                const code = `Digit${i + 1}`;
                if (p(code) && !this._killEngineKeyLock[i]) {
                    this._killEngineKeyLock[i] = true;
                    this._killEngine(i);
                    this._cockpitClick();
                }
                if (!p(code)) this._killEngineKeyLock[i] = false;
            }

            if (p('PageUp') && !this._trimKeyLockPgUp) {
                this._trimKeyLockPgUp = true;
                this.trimPitch = Math.min(0.15, this.trimPitch + 0.01);
                this._cockpitClick(2200);
            }
            if (!p('PageUp')) this._trimKeyLockPgUp = false;
            if (p('PageDown') && !this._trimKeyLockPgDn) {
                this._trimKeyLockPgDn = true;
                this.trimPitch = Math.max(-0.15, this.trimPitch - 0.01);
                this._cockpitClick(2200);
            }
            if (!p('PageDown')) this._trimKeyLockPgDn = false;

            const isJetAc = this.aircraftConfig.engine_type === ENGINE_TYPE_TURBOFAN
                         || this.aircraftConfig.engine_type === ENGINE_TYPE_TURBOJET;
            const gearCode = bind('gearToggle');
            if (isJetAc && ((p(gearCode) && !this.gearKeyLockG) || gpEdges.gear)) {
                this.gearKeyLockG = true;
                this._toggleGear();
                this._cockpitClick();
            }
            if (!p(gearCode)) this.gearKeyLockG = false;

            const trimPDownCode = bind('trimPitchDown');
            if (p(trimPDownCode) && !this.trimKeyLock7) { this.trimKeyLock7 = true; this.trimPitch = Math.max(-0.15, this.trimPitch - 0.005); this._cockpitClick(2200); }
            if (!p(trimPDownCode)) this.trimKeyLock7 = false;
            const trimPUpCode = bind('trimPitchUp');
            if (p(trimPUpCode) && !this.trimKeyLock8) { this.trimKeyLock8 = true; this.trimPitch = Math.min(0.15, this.trimPitch + 0.005); this._cockpitClick(2200); }
            if (!p(trimPUpCode)) this.trimKeyLock8 = false;
            const trimYLeftCode = bind('trimYawLeft');
            if (p(trimYLeftCode) && !this.trimKeyLock9) { this.trimKeyLock9 = true; this.trimYaw = Math.max(-0.1, this.trimYaw - 0.005); this._cockpitClick(2200); }
            if (!p(trimYLeftCode)) this.trimKeyLock9 = false;
            const trimYRightCode = bind('trimYawRight');
            if (p(trimYRightCode) && !this.trimKeyLock0) { this.trimKeyLock0 = true; this.trimYaw = Math.min(0.1, this.trimYaw + 0.005); this._cockpitClick(2200); }
            if (!p(trimYRightCode)) this.trimKeyLock0 = false;

            if (this.aircraftConfig.engine_type === ENGINE_TYPE_PISTON) {
                const mixUpCode = bind('mixtureUp');
                if (p(mixUpCode) && !this.mixtureKeyLockPlus) { this.mixtureKeyLockPlus = true; this.mixtureLevel = Math.min(1.0, this.mixtureLevel + 0.05); this._cockpitClick(); }
                if (!p(mixUpCode)) this.mixtureKeyLockPlus = false;
                const mixDnCode = bind('mixtureDown');
                if (p(mixDnCode) && !this.mixtureKeyLockMinus) { this.mixtureKeyLockMinus = true; this.mixtureLevel = Math.max(0, this.mixtureLevel - 0.05); this._cockpitClick(); }
                if (!p(mixDnCode)) this.mixtureKeyLockMinus = false;

                const magCode = bind('magnetoCycle');
                if (p(magCode) && !this.magnetoKeyLockN) {
                    this.magnetoKeyLockN = true;
                    this.magnetoSwitch = (this.magnetoSwitch + 1) % 4;
                    this._cockpitClick();
                }
                if (!p(magCode)) this.magnetoKeyLockN = false;
            }

            const pauseCode = bind('pauseToggle');
            if ((p(pauseCode) && !this._pauseKeyLock) || gpEdges.pause) {
                this._pauseKeyLock = true;
                this._togglePause();
            }
            if (!p(pauseCode)) this._pauseKeyLock = false;

            const tsUpCode = bind('timeScaleUp');
            if (p(tsUpCode) && !this._timeScaleUpKeyLock) {
                this._timeScaleUpKeyLock = true;
                this._adjustTimeScale(+1);
            }
            if (!p(tsUpCode)) this._timeScaleUpKeyLock = false;
            const tsDnCode = bind('timeScaleDown');
            if (p(tsDnCode) && !this._timeScaleDownKeyLock) {
                this._timeScaleDownKeyLock = true;
                this._adjustTimeScale(-1);
            }
            if (!p(tsDnCode)) this._timeScaleDownKeyLock = false;

            const easyCode = bind('easyModeToggle');
            if (p(easyCode) && !this._easyModeKeyLock) {
                this._easyModeKeyLock = true;
                UiPreferences.set({ easyMode: !UiPreferences.get().easyMode });
            }
            if (!p(easyCode)) this._easyModeKeyLock = false;

            const yokeCode = bind('mouseYokeToggle');
            if (p(yokeCode) && !this._mouseYokeKeyLock) {
                this._mouseYokeKeyLock = true;
                this._toggleMouseYoke();
            }
            if (!p(yokeCode)) this._mouseYokeKeyLock = false;

            const towerCode = bind('towerCamera');
            if (p(towerCode) && !this._towerCamKeyLock) {
                this._towerCamKeyLock = true;
                this._setCameraMode(CAMERA_MODE_TOWER);
                this._captureTowerCameraPosition();
                this._cockpitClick();
            }
            if (!p(towerCode)) this._towerCamKeyLock = false;

            const replayCode = bind('replayToggle');
            if (p(replayCode) && !this._replayKeyLock) {
                this._replayKeyLock = true;
                this._toggleReplay();
            }
            if (!p(replayCode)) this._replayKeyLock = false;
        }

        if (this._easyModeAssistEnabled()) {
            const stabilization = this._easyModeStabilization();
            targetPitch += stabilization.pitch;
            targetRoll  += stabilization.roll;
            targetPitch = Math.max(-1, Math.min(1, targetPitch));
            targetRoll  = Math.max(-1, Math.min(1, targetRoll));
            this._easyModeAutoThrottle(_dt);
        }

        const lerpAxis = (current: number, target: number, smoothRate: number, retRate: number): number => {
            const rate = (Math.abs(target) < Math.abs(current)) ? retRate : smoothRate;
            const t = 1 - Math.exp(-rate * _dt);
            return current + (target - current) * t;
        };

        if (this.isOnGround) {
            targetRoll = 0;
        }

        this.smoothedPitch = lerpAxis(this.smoothedPitch, targetPitch, PITCH_SMOOTHING_RATE, PITCH_RETURN_RATE);
        this.smoothedRoll  = lerpAxis(this.smoothedRoll, targetRoll, LATERAL_SMOOTHING_RATE, LATERAL_RETURN_RATE);
        this.smoothedYaw   = lerpAxis(this.smoothedYaw, targetYaw, LATERAL_SMOOTHING_RATE, LATERAL_RETURN_RATE);

        this.surfaces[0].controlInput =  this.smoothedRoll;
        this.surfaces[1].controlInput = -this.smoothedRoll;
        this.surfaces[2].controlInput = -this.smoothedPitch;
        this.surfaces[3].controlInput = -this.smoothedYaw;

        if (!this.isOnGround && this.surfaces[2] && this.planeRoot && this.planeRoot.rotationQuaternion) {
            BABYLON.Matrix.FromQuaternionToRef(this.planeRoot.rotationQuaternion, this._tmpRotMatrix);
            BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(1, 0, 0), this._tmpRotMatrix, this._tmpRight);
            const sinBank = Math.max(-1, Math.min(1, this._tmpRight.y));
            const absSinBank = Math.abs(sinBank);
            if (absSinBank > BANK_COMP_MIN_SIN) {
                const cosBank = Math.sqrt(Math.max(0.001, 1 - sinBank * sinBank));
                const loadComp = (1.0 / cosBank) - 1.0;
                const pitchBias = Math.min(BANK_COMP_MAX_PITCH, loadComp * BANK_COMP_PITCH_GAIN);
                this.surfaces[2].controlInput -= pitchBias;
            }
        }

        if (!this.isOnGround && this.planeRoot) {
            const speedSq = this.velocity.lengthSquared();
            if (speedSq > 1) {
                const altitudeForQ = this.planeRoot.position.y;
                const airDensityHere = getAirDensity(altitudeForQ, this._isaDeltaTempK);
                const dynamicPressure = 0.5 * airDensityHere * speedSq;
                const qRef = (this.aircraftConfig.control_q_reference_pa != null && this.aircraftConfig.control_q_reference_pa > 0)
                    ? this.aircraftConfig.control_q_reference_pa
                    : CONTROL_Q_REFERENCE_PA;
                if (dynamicPressure > qRef) {
                    const qScale = Math.sqrt(qRef / dynamicPressure);
                    this.surfaces[0].controlInput *= qScale;
                    this.surfaces[1].controlInput *= qScale;
                    this.surfaces[2].controlInput *= qScale;
                    this.surfaces[3].controlInput *= qScale;
                }
            }
        }

        // Trim tabs: bias the zeroLiftAoA on the relevant surfaces
        if (this.surfaces.length >= 4) {
            this.surfaces[2].zeroLiftAoA = (this.aircraftConfig.surfaces[2]?.zero_lift_aoa ?? 0) + this.trimPitch;
            this.surfaces[3].zeroLiftAoA = (this.aircraftConfig.surfaces[3]?.zero_lift_aoa ?? 0) + this.trimYaw;
        }

        this._maybeDisengageAutopilotByInput();
        this._updateAutopilot(_dt);

        this._applyFlaps(_dt);
        this._applySpoilers(_dt, this.isOnGround);
    }

    private _setupTouchControls(): void {
        this._loadControlSettings();

        const overlay = document.createElement('div');
        overlay.id = 'touch-overlay';
        overlay.innerHTML = `
<style>
#touch-overlay{position:fixed;inset:0;pointer-events:none;z-index:150}
#touch-joy{position:absolute;width:120px;height:120px;border-radius:50%;border:none;background:none;display:none;pointer-events:none}
#touch-joy-deadzone{position:absolute;top:50%;left:50%;border-radius:50%;border:2px dashed rgba(80,255,160,.0);pointer-events:none;transition:border-color .12s}
#touch-joy-knob{position:absolute;top:50%;left:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(0,255,128,.25);border:1px solid rgba(0,255,128,.15)}
#touch-throttle{position:absolute;bottom:160px;left:10px;width:40px;height:150px;border-radius:20px;border:2px solid rgba(80,255,160,.35);background:rgba(0,20,15,.3);pointer-events:auto;touch-action:none}
#touch-thr-fill{position:absolute;bottom:0;left:0;right:0;height:70%;background:linear-gradient(0deg,rgba(0,255,128,.35),rgba(0,255,128,.1));border-radius:0 0 20px 20px}
#touch-thr-knob{position:absolute;left:50%;transform:translateX(-50%);width:36px;height:12px;border-radius:6px;background:rgba(0,255,128,.5);border:1px solid rgba(0,255,128,.7)}
#touch-flap-btns{position:absolute;bottom:340px;left:6px;display:grid;grid-template-columns:repeat(2,38px);grid-auto-rows:26px;gap:4px;pointer-events:auto}
#touch-flap-btns button{width:38px;height:26px;padding:0;border-radius:5px;border:1px solid rgba(80,255,160,.22);background:rgba(0,20,15,.32);color:rgba(125,249,200,.78);font-family:'Orbitron',monospace;font-size:9px;letter-spacing:.04em;cursor:pointer;touch-action:manipulation;transition:transform .1s,background .1s,border-color .1s;backdrop-filter:blur(2px)}
#touch-flap-btns button:active{transform:scale(.92);background:rgba(0,40,25,.55);border-color:rgba(80,255,160,.45)}
#touch-brk.active{background:rgba(255,40,40,.32);border-color:rgba(255,80,80,.5);color:#ff6060}
#touch-spl.active{background:rgba(80,255,160,.32);border-color:rgba(80,255,160,.6);color:#80ffa0}
#touch-spl.armed{background:rgba(255,204,0,.28);border-color:rgba(255,204,0,.6);color:#ffcc55}
#touch-lgt.active{background:rgba(255,240,160,.32);border-color:rgba(255,240,160,.6);color:#fff080}
#touch-gear.up{color:#bbbbbb;border-color:rgba(180,180,180,.32)}
#touch-gear.down{color:rgba(125,249,200,.85);border-color:rgba(80,255,160,.32)}
#touch-gear.transit{color:#ffcc00;border-color:rgba(255,204,0,.45)}
#touch-controls-btn{position:absolute;top:136px;right:10px;width:32px;height:32px;border-radius:6px;border:1px solid rgba(80,255,160,.32);background:rgba(0,20,15,.45);color:rgba(125,249,200,.85);font-family:'Orbitron',monospace;font-size:11px;cursor:pointer;pointer-events:auto;touch-action:manipulation}
#touch-controls-panel{display:none;position:absolute;top:172px;right:6px;width:240px;padding:10px 12px;border-radius:8px;border:1px solid rgba(80,255,160,.32);background:rgba(2,10,20,.92);color:#fff;font-family:'Inter',sans-serif;font-size:11px;pointer-events:auto;backdrop-filter:blur(8px);box-shadow:0 8px 32px rgba(0,0,0,.6)}
#touch-controls-panel label{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
#touch-controls-panel input[type=range]{width:120px}
@media(max-width:480px){
#touch-controls-btn{top:108px!important;right:6px!important;width:28px!important;height:28px!important}
#touch-controls-panel{top:142px!important;right:6px!important;width:200px!important}
}
</style>
<div id="touch-joy"><div id="touch-joy-deadzone"></div><div id="touch-joy-knob"></div></div>
<div id="touch-throttle"><div id="touch-thr-fill"></div><div id="touch-thr-knob"></div></div>
<div id="touch-flap-btns"><button id="touch-flap-up">F+</button><button id="touch-flap-dn">F\u2212</button><button id="touch-gear" class="down" title="Trem de pouso">GR\u25BC</button><button id="touch-brk">BRK</button><button id="touch-spl" title="Spoilers (toque longo: arma)">SPL</button><button id="touch-lgt" title="Luzes de pouso">LGT</button></div>
<button id="touch-controls-btn" title="Controles">\u2699</button>
<div id="touch-controls-panel">
  <div style="font-family:'Orbitron',monospace;font-size:10px;color:#40ffaa;letter-spacing:.12em;margin-bottom:8px;border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:4px">CONTROLES</div>
  <label>Raio<input id="ctl-radius" type="range" min="${JOYSTICK_MIN_RADIUS_PX}" max="${JOYSTICK_MAX_RADIUS_PX}" step="5"><span id="ctl-radius-v">\u2014</span></label>
  <label>Zona morta<input id="ctl-deadzone" type="range" min="0" max="${JOYSTICK_MAX_DEADZONE_NORM}" step="0.01"><span id="ctl-deadzone-v">\u2014</span></label>
  <label>Curva (expo)<input id="ctl-expo" type="range" min="${JOYSTICK_MIN_EXPO}" max="${JOYSTICK_MAX_EXPO}" step="0.1"><span id="ctl-expo-v">\u2014</span></label>
  <label>Inverter pitch<input id="ctl-invert" type="checkbox"></label>
</div>`;
        document.body.appendChild(overlay);

        const joyEl = document.getElementById('touch-joy')!;
        const knob = document.getElementById('touch-joy-knob')!;
        const dzEl = document.getElementById('touch-joy-deadzone')!;
        const throttleEl = document.getElementById('touch-throttle')!;
        const thrFill = document.getElementById('touch-thr-fill')!;
        const thrKnob = document.getElementById('touch-thr-knob')!;
        const ctlBtn = document.getElementById('touch-controls-btn');
        const ctlPanel = document.getElementById('touch-controls-panel');
        const ctlRadius = document.getElementById('ctl-radius') as HTMLInputElement | null;
        const ctlDz = document.getElementById('ctl-deadzone') as HTMLInputElement | null;
        const ctlExpo = document.getElementById('ctl-expo') as HTMLInputElement | null;
        const ctlInvert = document.getElementById('ctl-invert') as HTMLInputElement | null;
        const ctlRadiusV = document.getElementById('ctl-radius-v');
        const ctlDzV = document.getElementById('ctl-deadzone-v');
        const ctlExpoV = document.getElementById('ctl-expo-v');

        const updateDeadzoneVisual = () => {
            const radius = this._controlSettings.radius;
            const dz = this._controlSettings.deadzone;
            const dzPx = 2 * dz * radius;
            joyEl.style.width = `${radius * 1.5}px`;
            joyEl.style.height = `${radius * 1.5}px`;
            dzEl.style.width = `${dzPx}px`;
            dzEl.style.height = `${dzPx}px`;
            dzEl.style.marginLeft = `-${dzPx / 2}px`;
            dzEl.style.marginTop = `-${dzPx / 2}px`;
        };

        const refreshCtlInputs = () => {
            if (ctlRadius) ctlRadius.value = String(this._controlSettings.radius);
            if (ctlDz) ctlDz.value = String(this._controlSettings.deadzone);
            if (ctlExpo) ctlExpo.value = String(this._controlSettings.expo);
            if (ctlInvert) ctlInvert.checked = this._controlSettings.pitchInvert;
            if (ctlRadiusV) ctlRadiusV.textContent = `${this._controlSettings.radius}px`;
            if (ctlDzV) ctlDzV.textContent = `${(this._controlSettings.deadzone * 100).toFixed(0)}%`;
            if (ctlExpoV) ctlExpoV.textContent = this._controlSettings.expo.toFixed(1);
        };
        refreshCtlInputs();
        updateDeadzoneVisual();

        if (ctlBtn && ctlPanel) {
            ctlBtn.addEventListener('click', () => {
                ctlPanel.style.display = ctlPanel.style.display === 'none' || !ctlPanel.style.display ? 'block' : 'none';
            });
        }
        const onCtlChange = () => {
            if (ctlRadius) this._controlSettings.radius = Math.max(JOYSTICK_MIN_RADIUS_PX, Math.min(JOYSTICK_MAX_RADIUS_PX, Number(ctlRadius.value)));
            if (ctlDz) this._controlSettings.deadzone = Math.max(0, Math.min(JOYSTICK_MAX_DEADZONE_NORM, Number(ctlDz.value)));
            if (ctlExpo) this._controlSettings.expo = Math.max(JOYSTICK_MIN_EXPO, Math.min(JOYSTICK_MAX_EXPO, Number(ctlExpo.value)));
            if (ctlInvert) this._controlSettings.pitchInvert = ctlInvert.checked;
            this._persistControlSettings();
            refreshCtlInputs();
            updateDeadzoneVisual();
        };
        ctlRadius?.addEventListener('input', onCtlChange);
        ctlDz?.addEventListener('input', onCtlChange);
        ctlExpo?.addEventListener('input', onCtlChange);
        ctlInvert?.addEventListener('change', onCtlChange);

        const updateThrVisual = () => {
            const pct = this.touchThrust * 100;
            thrFill.style.height = `${pct}%`;
            thrKnob.style.bottom = `${pct}%`;
        };
        updateThrVisual();

        const isOnWidget = (t: Touch): boolean => {
            const el = document.elementFromPoint(t.clientX, t.clientY);
            if (!el) return false;
            return !!el.closest('#touch-throttle,#touch-flap-btns,#ap-panel,#missions-btn,#aircraft-btn,#flight-plans-btn,#missions-panel,#aircraft-panel,#flight-plans-panel,#touch-controls-btn,#touch-controls-panel,#gps-zoom-controls');
        };

        const canvas = this.scene?.getEngine()?.getRenderingCanvas();
        if (!canvas) return;
        canvas.style.touchAction = 'none';

        const isInDeadZone = (x: number, y: number): boolean => {
            const gps = document.getElementById('gps-map');
            if (gps) {
                const r = gps.getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
            }
            const pfd = document.getElementById('flight-pfd');
            if (pfd) {
                const r = pfd.getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
            }
            return false;
        };

        const applyExpoCurve = (input: number, expoFactor: number): number => {
            if (!Number.isFinite(input)) return 0;
            const sign = Math.sign(input);
            const abs = Math.min(1, Math.abs(input));
            return sign * Math.pow(abs, expoFactor);
        };

        const collectFreeTouches = (touchList: TouchList): Touch[] => {
            const arr: Touch[] = [];
            for (let i = 0; i < touchList.length; i++) {
                const t = touchList[i];
                if (isOnWidget(t)) continue;
                if (isInDeadZone(t.clientX, t.clientY)) continue;
                arr.push(t);
            }
            return arr;
        };

        const startTwoFinger = (touches: Touch[]): void => {
            const a = touches[0], b = touches[1];
            const dx = b.clientX - a.clientX;
            const dy = b.clientY - a.clientY;
            const dist = Math.hypot(dx, dy);
            this._twoFingerActive = true;
            this._twoFingerInitialDist = dist;
            this._twoFingerLastDist = dist;
            this._twoFingerStartMidX = (a.clientX + b.clientX) * 0.5;
            this._twoFingerStartMidY = (a.clientY + b.clientY) * 0.5;
            this._twoFingerStartMs = performance.now();
            this._twoFingerFiredCamera = false;
            if (this.joystickTouchId !== null) {
                this.joystickTouchId = null;
                this.touchPitchInput = 0;
                this.touchRollInput = 0;
                joyEl.style.display = 'none';
            }
        };

        const endTwoFinger = (): void => {
            this._twoFingerActive = false;
            this._twoFingerInitialDist = 0;
            this._twoFingerLastDist = 0;
            this._twoFingerFiredCamera = false;
        };

        canvas.addEventListener('touchstart', (e: TouchEvent) => {
            const free = collectFreeTouches(e.touches);
            if (free.length >= 2 && !this._twoFingerActive) {
                startTwoFinger(free);
                e.preventDefault();
                return;
            }
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (isOnWidget(t)) continue;
                if (isInDeadZone(t.clientX, t.clientY)) continue;
                if (this._twoFingerActive) continue;
                if (this.joystickTouchId !== null) continue;
                this.joystickTouchId = t.identifier;
                this.joystickOrigin = { x: t.clientX, y: t.clientY };
                joyEl.style.display = 'block';
                joyEl.style.left = `${t.clientX - this._controlSettings.radius * 0.75}px`;
                joyEl.style.top = `${t.clientY - this._controlSettings.radius * 0.75}px`;
                knob.style.left = '50%';
                knob.style.top = '50%';
                dzEl.style.borderColor = 'rgba(80,255,160,.4)';
                e.preventDefault();
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e: TouchEvent) => {
            if (this._twoFingerActive && e.touches.length >= 2) {
                const free = collectFreeTouches(e.touches);
                if (free.length >= 2) {
                    const a = free[0], b = free[1];
                    const dx = b.clientX - a.clientX;
                    const dy = b.clientY - a.clientY;
                    const dist = Math.hypot(dx, dy);
                    const distDelta = dist - this._twoFingerLastDist;
                    this.touchThrust = Math.max(0, Math.min(1, this.touchThrust + distDelta * PINCH_THROTTLE_PX_TO_DELTA));
                    this._twoFingerLastDist = dist;
                    updateThrVisual();

                    const midX = (a.clientX + b.clientX) * 0.5;
                    const midY = (a.clientY + b.clientY) * 0.5;
                    const swipeX = midX - this._twoFingerStartMidX;
                    const swipeY = midY - this._twoFingerStartMidY;
                    const swipeMag = Math.hypot(swipeX, swipeY);
                    const distChangeRatio = Math.abs(dist - this._twoFingerInitialDist) / Math.max(1, this._twoFingerInitialDist);
                    if (!this._twoFingerFiredCamera && swipeMag > TWO_FINGER_SWIPE_MIN_PX && distChangeRatio < TWO_FINGER_DISTANCE_TOLERANCE_RATIO) {
                        this._twoFingerFiredCamera = true;
                        this._cycleCameraMode();
                    }
                    e.preventDefault();
                    return;
                }
            }
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier !== this.joystickTouchId) continue;
                const radius = this._controlSettings.radius;
                const dx = t.clientX - this.joystickOrigin.x;
                const dy = t.clientY - this.joystickOrigin.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const clamped = Math.min(dist, radius);
                const angle = Math.atan2(dy, dx);
                let nx = (clamped * Math.cos(angle)) / radius;
                let ny = (clamped * Math.sin(angle)) / radius;
                const magnitude = Math.hypot(nx, ny);
                const dz = this._controlSettings.deadzone;
                if (magnitude < dz) {
                    nx = 0;
                    ny = 0;
                    dzEl.style.borderColor = 'rgba(255,204,85,.7)';
                } else {
                    const remap = (magnitude - dz) / (1 - dz);
                    const k = remap / magnitude;
                    nx *= k;
                    ny *= k;
                    dzEl.style.borderColor = 'rgba(80,255,160,.4)';
                }
                const expoNx = applyExpoCurve(nx, this._controlSettings.expo);
                const expoNy = applyExpoCurve(ny, this._controlSettings.expo);
                this.touchRollInput = -expoNx;
                const pitchSign = this._controlSettings.pitchInvert ? -1 : 1;
                this.touchPitchInput = pitchSign * expoNy;
                knob.style.left = `${50 + nx * 35}%`;
                knob.style.top = `${50 + ny * 35}%`;
            }
            e.preventDefault();
        }, { passive: false });

        const resetJoy = (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.joystickTouchId) {
                    this.joystickTouchId = null;
                    this.touchPitchInput = 0;
                    this.touchRollInput = 0;
                    joyEl.style.display = 'none';
                    knob.style.left = '50%';
                    knob.style.top = '50%';
                }
            }
            if (this._twoFingerActive && e.touches.length < 2) {
                endTwoFinger();
            }
        };
        canvas.addEventListener('touchend', resetJoy);
        canvas.addEventListener('touchcancel', resetJoy);

        throttleEl.addEventListener('touchstart', (e: TouchEvent) => {
            if (this.throttleTouchId !== null) return;
            this.throttleTouchId = e.changedTouches[0].identifier;
            e.preventDefault();
        }, { passive: false });

        throttleEl.addEventListener('touchmove', (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier !== this.throttleTouchId) continue;
                const rect = throttleEl.getBoundingClientRect();
                const pct = 1 - Math.max(0, Math.min(1, (t.clientY - rect.top) / rect.height));
                this.touchThrust = pct;
                updateThrVisual();
            }
            e.preventDefault();
        }, { passive: false });

        const resetThr = (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.throttleTouchId) {
                    this.throttleTouchId = null;
                }
            }
        };
        throttleEl.addEventListener('touchend', resetThr);
        throttleEl.addEventListener('touchcancel', resetThr);

        document.getElementById('touch-flap-up')!.addEventListener('touchstart', () => {
            this.flapIndex = Math.min(this.FLAP_STEPS.length - 1, this.flapIndex + 1);
        });
        document.getElementById('touch-flap-dn')!.addEventListener('touchstart', () => {
            this.flapIndex = Math.max(0, this.flapIndex - 1);
        });
        const brkBtn = document.getElementById('touch-brk')!;
        brkBtn.addEventListener('touchstart', () => {
            this.brakesOn = !this.brakesOn;
            brkBtn.classList.toggle('active', this.brakesOn);
        });
        const gearBtn = document.getElementById('touch-gear');
        if (gearBtn) {
            gearBtn.addEventListener('touchstart', (ev: TouchEvent) => {
                ev.preventDefault();
                this._toggleGear();
            }, { passive: false });
        } else {
            console.warn('[Touch] #touch-gear element not found');
        }
        const splBtn = document.getElementById('touch-spl');
        if (splBtn) {
            const SPOILER_LONG_PRESS_MS = 500;
            let splPressStart = 0;
            let splLongPressFired = false;
            let splTimer: ReturnType<typeof setTimeout> | null = null;
            splBtn.addEventListener('touchstart', (ev: TouchEvent) => {
                ev.preventDefault();
                splPressStart = Date.now();
                splLongPressFired = false;
                if (splTimer) { clearTimeout(splTimer); }
                splTimer = setTimeout(() => {
                    splLongPressFired = true;
                    this._armGroundSpoilers();
                }, SPOILER_LONG_PRESS_MS);
            }, { passive: false });
            const splRelease = (ev: TouchEvent) => {
                ev.preventDefault();
                if (splTimer) { clearTimeout(splTimer); splTimer = null; }
                if (!splLongPressFired && Date.now() - splPressStart < SPOILER_LONG_PRESS_MS) {
                    this._toggleSpoilers();
                }
            };
            splBtn.addEventListener('touchend', splRelease, { passive: false });
            splBtn.addEventListener('touchcancel', splRelease, { passive: false });
        } else {
            console.warn('[Touch] #touch-spl element not found');
        }
        const lgtBtn = document.getElementById('touch-lgt');
        if (lgtBtn) {
            lgtBtn.addEventListener('touchstart', (ev: TouchEvent) => {
                ev.preventDefault();
                this._landingLightsOn = !this._landingLightsOn;
                lgtBtn.classList.toggle('active', this._landingLightsOn);
            }, { passive: false });
        } else {
            console.warn('[Touch] #touch-lgt element not found');
        }
    }

    private _triggerCrash(): void {
        this._crashed = true;
        this.velocity.setAll(0);
        this.angularVelocity.setAll(0);
        this.thrust = 0;
        if (this._crashOverlayEl) this._crashOverlayEl.style.display = 'block';
        console.log('[Crash] Ground impact detected — respawning in 3s');
        const RESPAWN_DELAY_MS = 3000;
        this._safeSetTimeout(() => {
            if (!this.planeRoot) return;
            if (this._crashOverlayEl) this._crashOverlayEl.style.display = 'none';
            this._crashed = false;
            this._spawnPlane();
        }, RESPAWN_DELAY_MS);
    }

    private _tickWorldReadyProbe(): void {
        if (this._worldReady) return;
        if (this._worldReadyStartMs === 0) {
            this._worldReadyStartMs = performance.now();
            console.debug('[WorldReady] Probe started; waiting for terrain at spawn position');
        }

        const elapsed = performance.now() - this._worldReadyStartMs;

        if (!this.tiles || !this.planeRoot) {
            this._worldReady = true;
            console.warn('[WorldReady] No tiles or planeRoot; activating physics immediately');
            this._onWorldReady();
            return;
        }

        const pos = this.planeRoot.position;
        this._worldReadyProbeRay.origin.set(pos.x, pos.y + WORLD_READY_PROBE_HEIGHT_M, pos.z);
        this._worldReadyProbeRay.length = WORLD_READY_PROBE_LENGTH_M;
        const hit = this._pickTerrainPreferRunway(this._worldReadyProbeRay);

        if (hit?.hit && hit.pickedPoint) {
            this.terrainY = hit.pickedPoint.y;
            this._lastKnownSpawnTerrainY = hit.pickedPoint.y;
            this._worldReady = true;
            console.debug(`[WorldReady] Terrain detected at y=${hit.pickedPoint.y.toFixed(1)}m after ${elapsed.toFixed(0)}ms`);
            this._onWorldReady();
            return;
        }

        if (elapsed >= WORLD_READY_TIMEOUT_MS) {
            this._worldReady = true;
            console.warn(`[WorldReady] Timeout after ${elapsed.toFixed(0)}ms; activating physics without terrain`);
            this._onWorldReady();
            return;
        }
    }

    private _onWorldReady(): void {
        if (this.planeRoot && this.terrainY !== TERRAIN_UNKNOWN_Y) {
            const cfg = this.aircraftConfig;
            const gearHeight = cfg.gear_positions.length > 0
                ? Math.abs(Math.min(...cfg.gear_positions.map((g: { y: number }) => g.y)))
                : 0;
            if (this.spawnAirborne) {
                const isAirborneMission = this._pendingMissionAirborne === true;
                const minOffset = isAirborneMission ? AIRBORNE_MISSION_MIN_OFFSET_M : 100;
                const altOffset = Math.max(minOffset, cfg.spawn_alt_offset_m);
                const desiredY = this.terrainY + altOffset;
                const minSafeY = this.terrainY + altOffset;
                if (this.planeRoot.position.y < minSafeY) {
                    console.warn(`[Spawn] Clamped pos.y from ${this.planeRoot.position.y.toFixed(1)}m to ${minSafeY.toFixed(1)}m (below terrain+offset)`);
                }
                this.planeRoot.position.y = desiredY;
                console.debug(`[WorldReady] Airborne spawn snapped to terrainY=${this.terrainY.toFixed(1)}m + offset=${altOffset.toFixed(1)}m -> pos.y=${this.planeRoot.position.y.toFixed(1)}m`);
            } else {
                const desiredY = this.terrainY + gearHeight;
                if (this.planeRoot.position.y < desiredY) {
                    console.warn(`[Spawn] Clamped ground pos.y from ${this.planeRoot.position.y.toFixed(1)}m to ${desiredY.toFixed(1)}m (below terrain+gear)`);
                }
                this.planeRoot.position.y = desiredY;
                this.velocity.set(0, 0, 0);
                this.angularVelocity.set(0, 0, 0);
                console.debug(`[WorldReady] Ground spawn snapped to terrainY=${this.terrainY.toFixed(1)}m + gearHeight=${gearHeight.toFixed(2)}m -> pos.y=${this.planeRoot.position.y.toFixed(1)}m`);
            }
        }
        this._spawnSnapFramesLeft = SPAWN_SNAP_FRAMES;
        if (!this._runwayCollidersLoaded && Number.isFinite(this.originLat) && Number.isFinite(this.originLon)) {
            this._runwayCollidersLoaded = true;
            this._buildNearbyRunwayColliders(this.originLat, this.originLon).catch((err) => {
                console.warn('[Runway] background load failed:', err);
            });
        }
        this._maybeFireSpawned();
    }

    private _maybeFireSpawned(): void {
        if (this.spawned && this._worldReady && this.onSpawned) {
            const cb = this.onSpawned;
            this.onSpawned = null;
            this._cinematicActive = true;
            this._cinematicStartMs = performance.now();
            console.log('[Cinematic] Starting spawn fly-in');
            try {
                this._engineSound.start();
                this._engineSound.fadeIn(ENGINE_SOUND_FADE_IN_MS);
                this._flightAudio.startWind();
            } catch (err) {
                console.warn('[EngineSound] Init failed:', err);
            }
            const hudEl = document.getElementById('flight-hud');
            if (hudEl) {
                hudEl.style.opacity = '0';
                hudEl.style.transition = `opacity ${HUD_FADE_IN_MS}ms ease`;
            }
            try {
                cb();
            } catch (err) {
                console.warn('[Cinematic] onSpawned callback failed:', err);
            }
            this._safeSetTimeout(() => {
                this._cinematicActive = false;
                this._setCameraMode(CAMERA_MODE_CHASE);
                this._hudFadeStartMs = performance.now();
                this._hudFadeActive = true;
                const liveHudEl = document.getElementById('flight-hud');
                if (liveHudEl) liveHudEl.style.opacity = '0.85';
                console.log('[Cinematic] Completed, HUD fade-in started');
            }, CINEMATIC_DURATION_MS);
        }
    }

    private _spawnPlane(forceGround: boolean = false): void {
        if (!this.planeRoot) return;
        const cfg = this.aircraftConfig;
        const yawRad = (180 - this.initialHeading) * Math.PI / 180;
        BABYLON.Quaternion.RotationAxisToRef(BABYLON.Vector3.Up(), yawRad, this.planeRoot.rotationQuaternion!);
        this.angularVelocity.set(0, 0, 0);
        this.terrainY = GROUND_Y;
        this._lastKnownSpawnTerrainY = TERRAIN_UNKNOWN_Y;
        this.fuelRemaining = cfg.fuel_capacity_kg;
        this.trimPitch = 0;
        this.trimYaw = 0;
        this.gearCompression = new Array(cfg.gear_positions.length).fill(0);
        this.gearState = GEAR_STATE_DOWN;
        this._gearTransitionStartMs = 0;
        this._spawnSnapFramesLeft = SPAWN_SNAP_FRAMES;
        if (this._gearUpAnimGroup) this._gearUpAnimGroup.stop();
        if (this._gearDownAnimGroup) this._gearDownAnimGroup.stop();
        if (cfg.engine_type === ENGINE_TYPE_PISTON) {
            this.mixtureLevel = 0.7;
            this.magnetoSwitch = MAGNETO_BOTH;
        }
        const gearHeight = cfg.gear_positions.length > 0
            ? Math.abs(Math.min(...cfg.gear_positions.map(g => g.y)))
            : 0;
        const useAirborne = this.spawnAirborne && !forceGround;
        if (useAirborne) {
            const isAirborneMission = this._pendingMissionAirborne === true;
            const minOffset = isAirborneMission ? AIRBORNE_MISSION_MIN_OFFSET_M : 100;
            const altOffset = Math.max(minOffset, cfg.spawn_alt_offset_m);
            this.planeRoot.position.set(0, GROUND_Y + altOffset, 0);
            this.thrust = cfg.spawn_airborne_thrust || 0.7;
            this.flapIndex = cfg.default_flap_index_air;
            this.currentFlapDeg = this.FLAP_STEPS[this.flapIndex] || 0;
            const rotMat = new BABYLON.Matrix();
            BABYLON.Matrix.FromQuaternionToRef(this.planeRoot.rotationQuaternion!, rotMat);
            const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), rotMat);
            this.velocity = fwd.scale(cfg.spawn_airborne_speed_ms || 80);
            if (isAirborneMission) {
                this._spawnSnapFramesLeft = 0;
                if (this._gearUpAnimGroup) {
                    this.gearState = GEAR_STATE_UP;
                    this._gearUpAnimGroup.start(false, 100.0, this._gearUpAnimGroup.from, this._gearUpAnimGroup.to);
                }
                this._pendingAirborneGearRetract = false;
                const missionAlt = this._pendingMissionAltM ?? 0;
                const gearLabel = this._gearUpAnimGroup ? 'UP' : 'DOWN(fixed)';
                console.debug(`[FlightSimple] Airborne mission respawn: mission_alt=${missionAlt.toFixed(1)}m refAlt=${this.refAlt.toFixed(1)}m posY=${this.planeRoot.position.y.toFixed(1)}m altOffset=${altOffset.toFixed(1)}m snapDisabled gear=${gearLabel} terrainY=${this.terrainY.toFixed(1)}m`);
            }
        } else {
            this.planeRoot.position.set(0, GROUND_Y + gearHeight, 0);
            this.velocity.set(0, 0, 0);
            this.thrust = 0;
            this.flapIndex = cfg.default_flap_index_ground;
            this.currentFlapDeg = this.FLAP_STEPS[this.flapIndex] || 15;
        }
    }

    private _initTapeMarks(): void {
        if (this.hudSpdMarks && this.spdMarkEls.length === 0) {
            for (let i = 0; i < 7; i++) {
                const el = document.createElement('div');
                el.className = 'hud-tape-mark';
                const valEl = document.createElement('span');
                valEl.className = 'hud-tape-mark-val';
                const line = document.createElement('div');
                line.className = 'hud-tape-mark-line';
                el.appendChild(valEl);
                el.appendChild(line);
                this.hudSpdMarks.appendChild(el);
                this.spdMarkEls.push({ el, valEl });
            }
        }
        if (this.hudAltMarks && this.altMarkEls.length === 0) {
            for (let i = 0; i < 7; i++) {
                const el = document.createElement('div');
                el.className = 'hud-tape-mark';
                const valEl = document.createElement('span');
                valEl.className = 'hud-tape-mark-val';
                const line = document.createElement('div');
                line.className = 'hud-tape-mark-line';
                el.appendChild(valEl);
                el.appendChild(line);
                this.hudAltMarks.appendChild(el);
                this.altMarkEls.push({ el, valEl });
            }
        }
    }

    private _updateTapeMarks(speedKts: number, altitudeFt: number): void {
        const TICKER_HALF_HEIGHT_PX = 20;
        const MARK_SPACING_PX = 30;
        const MARK_HALF_HEIGHT_PX = 7;

        const spdStep = 20;
        const spdRange = 60;
        const spdCenter = Math.round(speedKts / spdStep) * spdStep;
        
        if (this.spdMarkEls.length > 0) {
            const centerChanged = spdCenter !== this.lastSpdCenter;
            this.lastSpdCenter = spdCenter;
            const spdHalfWrapper = (this.hudSpdMarks?.offsetHeight ?? 180) / 2;
            const spdMaxAbsY = spdHalfWrapper - MARK_HALF_HEIGHT_PX;
            
            for (let i = 0; i < 7; i++) {
                const idx = 3 - i;
                const val = Math.max(0, spdCenter + idx * spdStep);
                const offset = ((speedKts - val) / spdRange) * 50;
                const mark = this.spdMarkEls[i];
                mark.el.style.transform = `translateY(${offset}px)`;
                if (centerChanged) mark.valEl.textContent = String(val);
                const naturalY = (i - 3) * MARK_SPACING_PX;
                const visualY = naturalY + offset;
                const inTickerZone = Math.abs(visualY) < TICKER_HALF_HEIGHT_PX;
                const outsideWrapper = Math.abs(visualY) > spdMaxAbsY;
                const desiredOpacity = (inTickerZone || outsideWrapper) ? '0' : '1';
                if (mark.el.style.opacity !== desiredOpacity) mark.el.style.opacity = desiredOpacity;
            }
            
            if (this.hudSpdTape) {
                const fillPct = 50 + ((speedKts % spdStep) / spdStep - 0.5) * 15;
                this.hudSpdTape.style.height = `${Math.max(5, Math.min(95, fillPct))}%`;
            }
        }
        
        const altStep = 200;
        const altRange = 600;
        const altCenter = Math.round(altitudeFt / altStep) * altStep;
        
        if (this.altMarkEls.length > 0) {
            const centerChanged = altCenter !== this.lastAltCenter;
            this.lastAltCenter = altCenter;
            const altHalfWrapper = (this.hudAltMarks?.offsetHeight ?? 180) / 2;
            const altMaxAbsY = altHalfWrapper - MARK_HALF_HEIGHT_PX;
            
            for (let i = 0; i < 7; i++) {
                const idx = 3 - i;
                const val = Math.max(0, altCenter + idx * altStep);
                const offset = ((altitudeFt - val) / altRange) * 50;
                const mark = this.altMarkEls[i];
                mark.el.style.transform = `translateY(${offset}px)`;
                if (centerChanged) mark.valEl.textContent = String(val);
                const naturalY = (i - 3) * MARK_SPACING_PX;
                const visualY = naturalY + offset;
                const inTickerZone = Math.abs(visualY) < TICKER_HALF_HEIGHT_PX;
                const outsideWrapper = Math.abs(visualY) > altMaxAbsY;
                const desiredOpacity = (inTickerZone || outsideWrapper) ? '0' : '1';
                if (mark.el.style.opacity !== desiredOpacity) mark.el.style.opacity = desiredOpacity;
            }
            
            if (this.hudAltTape) {
                const fillPct = Math.min(100, Math.max(5, (altitudeFt % 1000) / 1000 * 100));
                this.hudAltTape.style.height = `${fillPct}%`;
            }
        }
    }
    private _initFlapBar(): void {}
    private _updateFlapDisplay(): void {}

    private _applySpoilers(dt: number, gearOnGround: boolean): void {
        const cfg = this.aircraftConfig;
        if (cfg.ground_spoilers_auto && this._spoilerArmed && gearOnGround && this._spoilerTarget < 1) {
            this._spoilerTarget = 1;
        }
        const stepDt = Number.isFinite(dt) && dt > 0 ? dt : this.FIXED_DT;
        if (this._spoilerDeflection < this._spoilerTarget) {
            this._spoilerDeflection = Math.min(this._spoilerTarget, this._spoilerDeflection + SPOILER_DEPLOY_RATE_PER_S * stepDt);
        } else if (this._spoilerDeflection > this._spoilerTarget) {
            this._spoilerDeflection = Math.max(this._spoilerTarget, this._spoilerDeflection - SPOILER_RETRACT_RATE_PER_S * stepDt);
        }
    }

    private _toggleSpoilers(): void {
        if (this._spoilerTarget > 0) {
            this._spoilerTarget = 0;
            this._spoilerArmed = false;
        } else {
            this._spoilerTarget = 1;
        }
    }

    private _armGroundSpoilers(): void {
        this._spoilerArmed = !this._spoilerArmed;
    }

    private _killEngine(engineIdx: number): void {
        if (!Array.isArray(this._engineAlive) || engineIdx < 0 || engineIdx >= this._engineAlive.length) return;
        this._engineAlive[engineIdx] = !this._engineAlive[engineIdx];
        const aliveCount = this._engineAlive.filter(Boolean).length;
        console.log(`[Engine] Toggled #${engineIdx + 1} -> ${this._engineAlive[engineIdx] ? 'ALIVE' : 'DEAD'} (alive ${aliveCount}/${this._engineAlive.length})`);
    }

    private _resetEngines(): void {
        const cnt = Math.max(1, this.aircraftConfig?.engine_count ?? 1);
        this._engineAlive = new Array(cnt).fill(true);
    }

    private _applyFlaps(dt: number): void {
        if (!this.FLAP_STEPS || !this.FLAP_STEPS.length) return;
        if (this.flapIndex >= this.FLAP_STEPS.length) this.flapIndex = this.FLAP_STEPS.length - 1;
        const targetDeg = this.FLAP_STEPS[this.flapIndex];
        const rate = 5;
        const stepDt = Number.isFinite(dt) && dt > 0 ? dt : this.FIXED_DT;
        const animatingBefore = Math.abs(this.currentFlapDeg - targetDeg) > 0.05;
        if (this.currentFlapDeg < targetDeg) this.currentFlapDeg = Math.min(targetDeg, this.currentFlapDeg + rate * stepDt);
        if (this.currentFlapDeg > targetDeg) this.currentFlapDeg = Math.max(targetDeg, this.currentFlapDeg - rate * stepDt);
        const animatingAfter = Math.abs(this.currentFlapDeg - targetDeg) > 0.05;
        const flapAnimating = animatingBefore || animatingAfter;
        if (flapAnimating !== this._lastFlapAnimating) {
            this._lastFlapAnimating = flapAnimating;
            try { this._flightAudio.setFlapsAnimating(flapAnimating); } catch (_) { /* ignore */ }
        }

        const flapRad = this.currentFlapDeg * Math.PI / 180;
        const ft = this.aircraftConfig.flap_type;

        let zeroLiftShift: number;
        let extraFriction: number;
        let stallBoost: number;
        let areaScale = 1.0;

        if (ft === FLAP_TYPE_FOWLER) {
            zeroLiftShift = -flapRad * 0.06;
            extraFriction = this.currentFlapDeg * 0.0006;
            stallBoost = this.currentFlapDeg * 0.0014;
            areaScale = 1.0 + this.currentFlapDeg * 0.004;
        } else if (ft === FLAP_TYPE_SLOTTED) {
            zeroLiftShift = -flapRad * 0.05;
            extraFriction = this.currentFlapDeg * 0.0007;
            stallBoost = this.currentFlapDeg * 0.0012;
        } else if (ft === FLAP_TYPE_SPLIT) {
            zeroLiftShift = -flapRad * 0.035;
            extraFriction = this.currentFlapDeg * 0.0015;
            stallBoost = this.currentFlapDeg * 0.0005;
        } else {
            zeroLiftShift = -flapRad * 0.04;
            extraFriction = this.currentFlapDeg * 0.0008;
            stallBoost = this.currentFlapDeg * 0.0008;
        }

        for (let i = 0; i < 2; i++) {
            if (!this.surfaces[i]) continue;
            this.surfaces[i].zeroLiftAoA  = this.baseZeroLiftAoA + zeroLiftShift;
            this.surfaces[i].skinFriction = this.aircraftConfig.skin_friction + extraFriction;
            this.surfaces[i].stallAlpha   = this.aircraftConfig.stall_alpha_rad + stallBoost;
            if (ft === FLAP_TYPE_FOWLER) {
                const baseCfg = this.aircraftConfig.surfaces[i];
                if (baseCfg) this.surfaces[i].area = baseCfg.area * areaScale;
            }
        }
    }

    // ── Aerodynamic surfaces ────────────────────────────────────────────────────

    private _initSurfaces(): void {
        const cfg = this.aircraftConfig;
        this.surfaces = cfg.surfaces.map((s) => ({
            position:     new BABYLON.Vector3(s.pos_x, s.pos_y, s.pos_z),
            normal:       new BABYLON.Vector3(s.normal_x, s.normal_y, s.normal_z),
            area: s.area, chord: s.chord, aspectRatio: s.aspect_ratio,
            liftSlope: cfg.lift_slope, skinFriction: cfg.skin_friction,
            stallAlpha: cfg.stall_alpha_rad, zeroLiftAoA: s.zero_lift_aoa,
            oswaldE: cfg.oswald_efficiency, flapFraction: s.flap_fraction, controlInput: 0,
        }));
        const leftWing = cfg.surfaces.find(s => s.label === 'left_wing');
        if (leftWing) {
            this.wingSpan = 2 * Math.sqrt(leftWing.area * leftWing.aspect_ratio);
        }
    }

    // ── Physics (component-based aero with substep) ───────────────────────────

    private _applyPhysics(dt: number): void {
        const orientation = this.planeRoot.rotationQuaternion!;
        const pos         = this.planeRoot.position;

        const altitude = pos.y;
        const airDensity = getAirDensity(altitude, this._isaDeltaTempK);

        const rotMatrix = this._tmpRotMatrix;
        BABYLON.Matrix.FromQuaternionToRef(orientation, rotMatrix);
        const invRotMatrix = this._tmpInvRotMatrix;
        rotMatrix.invertToRef(invRotMatrix);

        const toWorld = (v: BABYLON.Vector3) => BABYLON.Vector3.TransformNormal(v, rotMatrix);
        const toBody  = (v: BABYLON.Vector3) => BABYLON.Vector3.TransformNormal(v, invRotMatrix);

        const cfg = this.aircraftConfig;

        // ── Terrain ray (runs FIRST so gear uses fresh terrainY this tick) ───
        if (this.tiles) {
            const inSpawnWindow = this._spawnSnapFramesLeft > 0;
            const rayHeight = inSpawnWindow ? SPAWN_TERRAIN_RAY_HEIGHT_M : TERRAIN_RAY_HEIGHT_M;
            const rayLength = inSpawnWindow ? SPAWN_TERRAIN_RAY_LENGTH_M : TERRAIN_RAY_LENGTH_M;
            this._terrainRay.origin.set(pos.x, pos.y + rayHeight, pos.z);
            this._terrainRay.length = rayLength;
            const hit = this._pickTerrainPreferRunway(this._terrainRay);
            const wasUnknown = this.terrainY === TERRAIN_UNKNOWN_Y;
            let resolvedTerrainY: number = TERRAIN_UNKNOWN_Y;
            if (hit?.hit && hit.pickedPoint) {
                const accept = inSpawnWindow || hit.pickedPoint.y <= pos.y + TERRAIN_HIT_ABOVE_LIMIT_M;
                if (accept) {
                    resolvedTerrainY = hit.pickedPoint.y;
                } else if (!inSpawnWindow) {
                    const buryDepth = hit.pickedPoint.y - pos.y;
                    console.warn(`[Crash] Terrain tunneling detected: pos.y=${pos.y.toFixed(1)}m terrainHit=${hit.pickedPoint.y.toFixed(1)}m bury=${buryDepth.toFixed(1)}m speed=${(this.velocity.length() * 1.94384).toFixed(0)}kt`);
                    this._triggerCrash();
                    return;
                }
            }
            if (resolvedTerrainY !== TERRAIN_UNKNOWN_Y) {
                this.terrainY = resolvedTerrainY;
                this._lastKnownSpawnTerrainY = resolvedTerrainY;
            } else if (inSpawnWindow && this._lastKnownSpawnTerrainY !== TERRAIN_UNKNOWN_Y) {
                this.terrainY = this._lastKnownSpawnTerrainY;
            } else {
                this.terrainY = TERRAIN_UNKNOWN_Y;
            }
            const isUnknown = this.terrainY === TERRAIN_UNKNOWN_Y;
            if (wasUnknown !== isUnknown) {
                if (isUnknown) {
                    const hitInfo = hit?.hit && hit.pickedPoint
                        ? `rejected hit at y=${hit.pickedPoint.y.toFixed(1)}m (above pos.y+${TERRAIN_HIT_ABOVE_LIMIT_M}m)`
                        : `ray miss (origin.y=${(pos.y + rayHeight).toFixed(1)}m len=${rayLength}m)`;
                    console.debug(`[Terrain] terrainY -> UNKNOWN at pos.y=${pos.y.toFixed(1)}m, ${hitInfo}`);
                } else {
                    console.debug(`[Terrain] terrainY re-acquired at pos.y=${pos.y.toFixed(1)}m, terrainY=${this.terrainY.toFixed(1)}m`);
                }
            }
        }

        const gearDeployed = this.gearState === GEAR_STATE_DOWN || this.gearState === GEAR_STATE_EXTENDING;

        // ── Spawn safety snap (ONLY during initial spawn settle window) ───
        // This handles the case where the physics terrain ray returns a
        // higher altitude than the spawn position (airport elevation > 0).
        // After the spawn window, in-flight terrain interactions are handled
        // purely by oleo compression + crash detection, so the snap never
        // fires during flight and never resets user input/angular velocity.
        if (this._spawnSnapFramesLeft > 0) {
            this._spawnSnapFramesLeft--;
            if (gearDeployed) {
                const groundLevelNow = this.tiles ? this.terrainY : GROUND_Y;
                let maxBury = 0;
                for (let gi = 0; gi < cfg.gear_positions.length; gi++) {
                    const gp = cfg.gear_positions[gi];
                    const wheelY = pos.y + toWorld(new BABYLON.Vector3(gp.x, gp.y, gp.z)).y;
                    const bury = groundLevelNow - wheelY;
                    if (bury > maxBury) maxBury = bury;
                }
                if (maxBury > GEAR_MAX_TRAVEL_M) {
                    const nGearsSnap = Math.max(1, cfg.gear_positions.length);
                    const sitMassSnap = cfg.mass_kg + (this.fuelRemaining || 0);
                    const safeSpringKSnap = Math.max(GEAR_SPRING_K_MIN_N_PER_M, Number.isFinite(cfg.gear_spring_k) ? cfg.gear_spring_k : 0);
                    const eqComp = Math.min(
                        GEAR_MAX_TRAVEL_M * 0.5,
                        (sitMassSnap * G_ACCEL) / (nGearsSnap * safeSpringKSnap),
                    );
                    pos.y += (maxBury - eqComp);
                    if (this.velocity.y < 0) this.velocity.y = 0;
                    this.angularVelocity.set(0, 0, 0);
                    console.warn(`[Gear/spawn] Terrain rose ${maxBury.toFixed(2)}m below plane; snapped pos.y +${(maxBury - eqComp).toFixed(2)}m (target comp ${eqComp.toFixed(3)}m)`);
                } else if (maxBury > 0) {
                    const SPAWN_SETTLE_ANG_DAMP = 0.25;
                    this.angularVelocity.scaleInPlace(SPAWN_SETTLE_ANG_DAMP);
                }
            }
        }
        const hasProp = cfg.engine_type === ENGINE_TYPE_PISTON || cfg.engine_type === ENGINE_TYPE_TURBOPROP;
        const isPiston = cfg.engine_type === ENGINE_TYPE_PISTON;
        const isTurboprop = cfg.engine_type === ENGINE_TYPE_TURBOPROP;
        const isElectric = cfg.engine_type === ENGINE_TYPE_ELECTRIC;

        // ── Engine spool-up (N1 lags throttle) ───────────────────────────────
        const spoolTauS = isPiston ? SPOOL_TAU_PISTON_S
            : isTurboprop ? SPOOL_TAU_TURBOPROP_S
            : isElectric ? SPOOL_TAU_ELECTRIC_S
            : SPOOL_TAU_JET_S;
        const spoolAlpha = Math.max(0, Math.min(1, dt / Math.max(0.01, spoolTauS)));
        const throttleTarget = Number.isFinite(this.thrust) ? this.thrust : 0;
        this._engineN1 = this._engineN1 + (throttleTarget - this._engineN1) * spoolAlpha;
        const n1 = Math.max(0, this._engineN1);

        // ── Engine model ─────────────────────────────────────────────────────
        let effectiveThrust = n1;
        if (isPiston || isTurboprop) {
            const densityRatio = Math.max(0, airDensity / SEA_LEVEL_AIR_DENSITY_KG_PER_M3);
            const mapFraction = n1 * densityRatio;
            let mixEfficiency = 1.0;
            let magFactor = 1.0;
            if (isPiston) {
                const mixDelta = Math.abs(this.mixtureLevel - BEST_POWER_MIX);
                mixEfficiency = Math.max(0, 1.0 - mixDelta * 2.5);
                magFactor = 0;
                if (this.magnetoSwitch === MAGNETO_BOTH) magFactor = 1.0;
                else if (this.magnetoSwitch === MAGNETO_LEFT || this.magnetoSwitch === MAGNETO_RIGHT) magFactor = MAGNETO_SINGLE_FACTOR;
            }
            this.enginePower = Math.max(0, Math.min(1, mapFraction * mixEfficiency * magFactor));
            this.engineRpm = (cfg.prop_rpm_max || 2700) * Math.sqrt(this.enginePower);
            effectiveThrust = this.enginePower;
        } else {
            const densityRatio = Math.max(0.0001, airDensity / SEA_LEVEL_AIR_DENSITY_KG_PER_M3);
            const thrustAltitudeLapse = Math.pow(densityRatio, JET_THRUST_LAPSE_EXPONENT);
            let thrustMachLapse = 1.0;
            if (!isElectric) {
                const tempKEng = altitude > ISA_TROPOPAUSE_M
                    ? ISA_TROPOPAUSE_TEMP_K
                    : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * Math.max(0, altitude);
                const speedOfSoundEng = Math.sqrt(SPECIFIC_HEAT_RATIO_AIR * GAS_CONSTANT_AIR_J_PER_KG_K * tempKEng);
                const machNow = this.velocity.length() / Math.max(1, speedOfSoundEng);
                const machLapseFloor = cfg.mach_lapse_floor ?? JET_THRUST_MACH_MIN_FACTOR;
                const machLapseCoef = cfg.mach_lapse_coef ?? JET_THRUST_MACH_LAPSE_COEF;
                thrustMachLapse = Math.max(
                    machLapseFloor,
                    1.0 - machLapseCoef * machNow,
                );
            }
            const altitudeLapseEffective = isElectric ? 1.0 : thrustAltitudeLapse;
            effectiveThrust = n1 * altitudeLapseEffective * thrustMachLapse;
            this.enginePower = n1;
            this.engineRpm = Math.round(1200 + n1 * 1500);
        }
        if (this.fuelRemaining <= 0 && cfg.fuel_capacity_kg > 0) {
            effectiveThrust = 0;
            this.enginePower = 0;
            this.engineRpm = 0;
        }

        // ── Fuel burn (after engine model so piston uses actual output) ──────
        const engineCountForBurn = Math.max(1, cfg.engine_count ?? 1);
        const aliveForBurnRatio = Array.isArray(this._engineAlive)
            ? this._engineAlive.filter(Boolean).length / engineCountForBurn
            : 1;
        if (this.fuelRemaining > 0 && cfg.fuel_capacity_kg > 0 && aliveForBurnRatio > 0) {
            const burnFraction = (isPiston ? this.enginePower : n1) * aliveForBurnRatio;
            const burnIdle = cfg.fuel_burn_rate_kg_per_s_idle;
            const burnMax  = cfg.fuel_burn_rate_kg_per_s_max;
            let burnRate: number;
            if (burnFraction <= 1.0) {
                burnRate = burnIdle + (burnMax - burnIdle) * burnFraction;
            } else {
                const abMaxThr = cfg.afterburner_thrust_mult ?? 1.0;
                const abFuelMult = cfg.afterburner_fuel_mult ?? 1.0;
                const span = Math.max(1e-3, abMaxThr - 1.0);
                const t = Math.min(1.0, (burnFraction - 1.0) / span);
                burnRate = burnMax + burnMax * (abFuelMult - 1.0) * t;
            }
            this.fuelRemaining = Math.max(0, this.fuelRemaining - burnRate * dt);
        }
        const MASS = cfg.fuel_capacity_kg > 0
            ? cfg.mass_kg + this.fuelRemaining
            : cfg.mass_kg;
        const cIxx = cfg.inertia_xx;
        const cIyy = cfg.inertia_yy;
        const cIzz = cfg.inertia_zz;

        const engineCountTotal = Math.max(1, cfg.engine_count ?? 1);
        if (!Array.isArray(this._engineAlive) || this._engineAlive.length !== engineCountTotal) {
            this._engineAlive = new Array(engineCountTotal).fill(true);
        }
        let aliveCount = 0;
        for (let e = 0; e < engineCountTotal; e++) if (this._engineAlive[e]) aliveCount++;
        const thrustVec = this._tmpFwd;
        thrustVec.set(0, 0, effectiveThrust * cfg.max_thrust_n * aliveCount);

        let asymYawTorqueBody = 0;
        if (aliveCount > 0 && aliveCount < engineCountTotal) {
            const halfSpanForEngines = (this.wingSpan || 16) * 0.5;
            const enginePositions: number[] = [];
            if (engineCountTotal === 2)      enginePositions.push(-halfSpanForEngines * 0.45,  halfSpanForEngines * 0.45);
            else if (engineCountTotal === 3) enginePositions.push(-halfSpanForEngines * 0.55, 0, halfSpanForEngines * 0.55);
            else if (engineCountTotal === 4) enginePositions.push(-halfSpanForEngines * 0.70, -halfSpanForEngines * 0.30, halfSpanForEngines * 0.30, halfSpanForEngines * 0.70);
            else enginePositions.push(0);
            const thrustPerEngine = effectiveThrust * cfg.max_thrust_n;
            for (let e = 0; e < engineCountTotal && e < enginePositions.length; e++) {
                if (!this._engineAlive[e]) continue;
                asymYawTorqueBody += enginePositions[e] * thrustPerEngine;
            }
        }

        // ── Ground effect ────────────────────────────────────────────────────
        const groundLevel = this.tiles ? this.terrainY : GROUND_Y;
        const agl = Math.max(0.1, pos.y - groundLevel);
        const hb = agl / Math.max(1, this.wingSpan);
        const hb15 = Math.pow(hb, 1.5);
        const groundEffectFactor = (33 * hb15) / (1 + 33 * hb15);

        // ── Propwash speed boost on tail surfaces ────────────────────────────
        let propwashBoost = 0;
        if (hasProp && effectiveThrust > 0 && cfg.prop_diameter_m) {
            const discArea = Math.PI * (cfg.prop_diameter_m * 0.5) * (cfg.prop_diameter_m * 0.5);
            const thr = effectiveThrust * cfg.max_thrust_n;
            propwashBoost = Math.sqrt(Math.max(0, thr / (0.5 * Math.max(0.01, airDensity) * discArea)));
        }

        // ── Gear oleo forces (position-dependent, computed once per substep) ─
        const gearForce  = BABYLON.Vector3.Zero();
        const gearTorque = BABYLON.Vector3.Zero();
        let anyGearOnGround = false;
        if (gearDeployed) {
            for (let gi = 0; gi < cfg.gear_positions.length; gi++) {
                const gp = cfg.gear_positions[gi];
                const bodyPos = new BABYLON.Vector3(gp.x, gp.y, gp.z);
                const worldOffset = toWorld(bodyPos);
                const wheelY = pos.y + worldOffset.y;
                const compression = Math.max(0, groundLevel - wheelY);
                this.gearCompression[gi] = compression;

                if (compression > 0) {
                    anyGearOnGround = true;
                    const gearBodyVel = toBody(this.velocity).add(
                        BABYLON.Vector3.Cross(this.angularVelocity, bodyPos),
                    );
                    const gearWorldVelY = toWorld(gearBodyVel).y;
                    const compressionRate = -gearWorldVelY;
                    const springF = Math.max(0, cfg.gear_spring_k * compression + cfg.gear_damping_c * compressionRate);
                    gearForce.y += springF;
                    gearTorque.addInPlace(BABYLON.Vector3.Cross(bodyPos, toBody(new BABYLON.Vector3(0, springF, 0))));
                }
            }
        } else {
            this.gearCompression.fill(0);
        }

        const altMslFtForWind = (this.refAlt + pos.y) * 3.28084;
        this._getWindVectorWorldRef(altMslFtForWind, this._tmpWindWorld);
        const windWorld = this._tmpWindWorld;

        const computeForces = (vel: BABYLON.Vector3, angVel: BABYLON.Vector3) => {
            const totalForce  = BABYLON.Vector3.Zero();
            const totalTorque = BABYLON.Vector3.Zero();

            totalForce.y -= MASS * G_ACCEL;

            totalForce.addInPlace(toWorld(thrustVec));

            const airVelWorld = vel.subtract(windWorld);
            const bodyVel = toBody(airVelWorld);
            let primaryAlpha = 0;
            for (let si = 0; si < this.surfaces.length; si++) {
                const surface = this.surfaces[si];
                const pointVel = bodyVel.add(BABYLON.Vector3.Cross(angVel, surface.position));
                const isTailSurface = si >= 2;
                const pwBoost = isTailSurface ? propwashBoost : 0;
                const { force, torque } = computeSurfaceForces(
                    surface, pointVel, airDensity, groundEffectFactor, cfg.flap_type, pwBoost,
                );
                if ((si === 0 || si === 1) && this._spoilerDeflection > 0) {
                    const liftLoss = (cfg.spoiler_lift_loss ?? SPOILER_DEFAULT_LIFT_LOSS) * this._spoilerDeflection;
                    const scale = Math.max(0, 1.0 - liftLoss);
                    force.scaleInPlace(scale);
                    torque.scaleInPlace(scale);
                }
                totalForce.addInPlace(toWorld(force));
                totalTorque.addInPlace(torque);
                if (si === 0 && pointVel.lengthSquared() > 1.0) {
                    const dragDirP = pointVel.normalizeToNew().scaleInPlace(-1);
                    const dotP = Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(dragDirP, surface.normal)));
                    primaryAlpha = Math.asin(dotP);
                }
            }
            this._lastAoaRad = primaryAlpha;

            // Fuselage parasite drag (+ gear drag when deployed, + spoilers) — air-relative
            const spd = airVelWorld.length();
            if (spd >= 1.0) {
                const spoilerCd = (cfg.spoiler_drag_cd ?? SPOILER_DEFAULT_DRAG_CD) * this._spoilerDeflection;
                const baseCd0 = cfg.fuselage_cd0 + (gearDeployed ? (cfg.gear_drag_cd ?? 0) : 0) + spoilerCd;
                const tempK = altitude > ISA_TROPOPAUSE_M
                    ? ISA_TROPOPAUSE_TEMP_K
                    : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * Math.max(0, altitude);
                const speedOfSound = Math.sqrt(SPECIFIC_HEAT_RATIO_AIR * GAS_CONSTANT_AIR_J_PER_KG_K * tempK);
                const machNumber = spd / Math.max(1, speedOfSound);
                const machExcess = Math.max(0, machNumber - MACH_DRAG_RISE_START);
                const waveCoef = cfg.wave_drag_coef ?? MACH_DRAG_RISE_COEF;
                const wavePeak = cfg.wave_drag_peak_mach ?? null;
                const waveDecayK = cfg.wave_drag_decay_k ?? 0;
                let machDragMult: number;
                if (wavePeak != null && machNumber > wavePeak) {
                    const peakExcess = Math.max(0, wavePeak - MACH_DRAG_RISE_START);
                    const peakDragMult = 1.0 + peakExcess * peakExcess * waveCoef;
                    machDragMult = 1.0 + (peakDragMult - 1.0) * Math.exp(-waveDecayK * (machNumber - wavePeak));
                } else {
                    machDragMult = 1.0 + machExcess * machExcess * waveCoef;
                }
                const transFactor = cfg.transonic_cd0_factor ?? 1.0;
                const effectiveCd0 = baseCd0 * (machExcess > 0 ? transFactor : 1.0);
                const qBody = 0.5 * airDensity * spd * spd * effectiveCd0 * cfg.fuselage_ref_area * machDragMult;
                totalForce.addInPlace(airVelWorld.normalizeToNew().scaleInPlace(-qBody));

                if (machExcess > 0) {
                    const wingAreaTotal = (cfg.surfaces[0]?.area ?? 0) + (cfg.surfaces[1]?.area ?? 0);
                    if (wingAreaTotal > 0) {
                        const wingWaveDrag = 0.5 * airDensity * spd * spd * cfg.skin_friction * wingAreaTotal * (machDragMult - 1.0);
                        totalForce.addInPlace(airVelWorld.normalizeToNew().scaleInPlace(-wingWaveDrag));
                    }
                }

                // Fuselage sideslip Cy/Cn (air-relative)
                const bodyVelNow = toBody(airVelWorld);
                const beta = Math.atan2(bodyVelNow.x, Math.max(1, Math.abs(bodyVelNow.z)));
                const qSide = 0.5 * airDensity * spd * spd * cfg.fuselage_side_area;
                const sideForce = -beta * qSide * 0.4;
                totalForce.addInPlace(toWorld(new BABYLON.Vector3(sideForce, 0, 0)));
                totalTorque.y += cfg.fuselage_cn_beta * beta * qSide * 5.0;
            }

            // P-factor (prop aircraft only) — air-relative
            if (hasProp && effectiveThrust > 0) {
                const bodyVelNow = toBody(airVelWorld);
                const alphaBody = Math.atan2(-bodyVelNow.y, Math.max(1, Math.abs(bodyVelNow.z)));
                const propDir = cfg.prop_rotation_dir === 0 ? 1 : -1;
                totalTorque.y += effectiveThrust * cfg.max_thrust_n * Math.sin(alphaBody) * 0.04 * propDir;

                // Reaction torque
                totalTorque.x += effectiveThrust * cfg.max_thrust_n * 0.015 * -propDir;
            }

            // Propeller gyroscopic precession
            if (hasProp && cfg.prop_inertia_kgm2 && cfg.prop_rpm_max) {
                const omegaProp = (this.engineRpm / 60) * 2 * Math.PI;
                const propDir = cfg.prop_rotation_dir === 0 ? 1 : -1;
                const Hprop = cfg.prop_inertia_kgm2 * omegaProp * propDir;
                totalTorque.x += angVel.y * Hprop;
                totalTorque.y -= angVel.x * Hprop;
            }

            // Gear oleo
            totalForce.addInPlace(gearForce);
            totalTorque.addInPlace(gearTorque);
            totalTorque.y += asymYawTorqueBody;

            return { force: totalForce, torque: totalTorque };
        };

        // ── Heun integrator ──────────────────────────────────────────────────
        const f1 = computeForces(this.velocity, this.angularVelocity);

        const halfDt  = dt * 0.5;
        const predVel = this.velocity.add(f1.force.scale(halfDt / MASS));

        const Iw1   = new BABYLON.Vector3(cIxx * this.angularVelocity.x, cIyy * this.angularVelocity.y, cIzz * this.angularVelocity.z);
        const gyro1 = BABYLON.Vector3.Cross(this.angularVelocity, Iw1);
        const angAcc1 = new BABYLON.Vector3(
            (f1.torque.x - gyro1.x) / cIxx,
            (f1.torque.y - gyro1.y) / cIyy,
            (f1.torque.z - gyro1.z) / cIzz,
        );
        const predAngVel = this.angularVelocity.add(angAcc1.scale(halfDt));

        const f2 = computeForces(predVel, predAngVel);

        const avgForce  = f1.force.add(f2.force).scaleInPlace(0.5);
        const avgTorque = f1.torque.add(f2.torque).scaleInPlace(0.5);

        this.velocity.addInPlace(avgForce.scale(dt / MASS));
        pos.addInPlace(this.velocity.scale(dt));

        this.groundSpeed = Math.hypot(this.velocity.x, this.velocity.z);

        this._tmpAirVel.copyFrom(this.velocity).subtractInPlace(windWorld);
        this._lastTasMs = this._tmpAirVel.length();
        const qDyn = 0.5 * Math.max(0, airDensity) * this._lastTasMs * this._lastTasMs;
        this._lastIasMs = Math.sqrt(Math.max(0, 2 * qDyn / SEA_LEVEL_AIR_DENSITY_KG_PER_M3));

        const gravityAccel = 9.81;
        const verticalAccel = avgForce.y / MASS;
        const verticalGNow = (verticalAccel + gravityAccel) / gravityAccel;
        const totalGNow = Math.max(0, Math.hypot(avgForce.x, avgForce.y + MASS * gravityAccel, avgForce.z) / (MASS * gravityAccel));
        const gMeasured = Number.isFinite(totalGNow) && totalGNow > 0 ? totalGNow : Math.abs(verticalGNow);
        this._gForce = this._gForce + (gMeasured - this._gForce) * G_FORCE_SMOOTHING;

        const Iw2   = new BABYLON.Vector3(cIxx * this.angularVelocity.x, cIyy * this.angularVelocity.y, cIzz * this.angularVelocity.z);
        const gyro2 = BABYLON.Vector3.Cross(this.angularVelocity, Iw2);
        const angAcc = new BABYLON.Vector3(
            (avgTorque.x - gyro2.x) / cIxx,
            (avgTorque.y - gyro2.y) / cIyy,
            (avgTorque.z - gyro2.z) / cIzz,
        );
        this.angularVelocity.addInPlace(angAcc.scale(dt));
        this.angularVelocity.scaleInPlace(Math.max(0, 1 - ANGULAR_DAMPING * dt));

        const omegaQuat = new BABYLON.Quaternion(
            this.angularVelocity.x,
            this.angularVelocity.y,
            this.angularVelocity.z,
            0,
        );
        const qDot = orientation.multiply(omegaQuat);
        orientation.x += qDot.x * 0.5 * dt;
        orientation.y += qDot.y * 0.5 * dt;
        orientation.z += qDot.z * 0.5 * dt;
        orientation.w += qDot.w * 0.5 * dt;
        orientation.normalize();

        // ── Ground contact ───────────────────────────────────────────────────
        this.isOnGround = anyGearOnGround;

        // Hard floor safety + crash detection
        const safetyFloor = groundLevel - 0.5;
        if (pos.y < safetyFloor) {
            if (this.velocity.y < CRASH_VS_THRESHOLD_MS) {
                this._triggerCrash();
                return;
            }
            if (!this._safetyFloorSnapActive) {
                this._safetyFloorSnapActive = true;
                console.warn(`[Terrain] Safety-floor snap start: pos.y=${pos.y.toFixed(1)}m -> ${safetyFloor.toFixed(1)}m, terrainY=${this.terrainY.toFixed(1)}m, vy=${this.velocity.y.toFixed(2)}m/s`);
            }
            pos.y = safetyFloor;
            if (this.velocity.y < 0) this.velocity.y = 0;
        } else if (this._safetyFloorSnapActive) {
            this._safetyFloorSnapActive = false;
            console.debug(`[Terrain] Safety-floor snap ended at pos.y=${pos.y.toFixed(1)}m, terrainY=${this.terrainY.toFixed(1)}m`);
        }

        if (anyGearOnGround) {
            const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            if (speed > 0.5) {
                const rollingFriction = cfg.rolling_friction;
                const brakeFriction = this.brakesOn ? cfg.brake_friction : (this.thrust < 0.05 ? cfg.idle_friction : 0);
                const frictionDecel = (rollingFriction + brakeFriction) * dt;
                const newSpeed = Math.max(0, speed - frictionDecel);
                const scale = newSpeed / speed;
                this.velocity.x *= scale;
                this.velocity.z *= scale;
            } else if (speed > 0 && speed <= 0.5 && this.thrust < 0.1) {
                this.velocity.x *= 0.95;
                this.velocity.z *= 0.95;
                if (speed < 0.05) {
                    this.velocity.x = 0;
                    this.velocity.z = 0;
                }
            }

            const wm = this.planeRoot.getWorldMatrix();
            const bodyRight = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();
            const worldUp = new BABYLON.Vector3(0, 1, 0);
            const rollAngle = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(bodyRight, worldUp))));
            const horizSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            if (horizSpeed > CRASH_GROUND_SPEED_MS) {
                const bodyFwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
                const pitchAngle = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(bodyFwd, worldUp))));
                const pitchAbsDeg = Math.abs(pitchAngle) * 180 / Math.PI;
                const rollAbsDeg = Math.abs(rollAngle) * 180 / Math.PI;
                if (pitchAbsDeg > CRASH_GROUND_ATTITUDE_DEG || rollAbsDeg > CRASH_GROUND_ATTITUDE_DEG) {
                    console.warn(`[Crash] Ground attitude crash: speed=${(horizSpeed * 1.94384).toFixed(1)}kt pitch=${pitchAbsDeg.toFixed(1)}deg roll=${rollAbsDeg.toFixed(1)}deg`);
                    this._triggerCrash();
                    return;
                }
            }
            const GROUND_ROLL_CORRECTION_RATE = 8.0;
            const correction = BABYLON.Quaternion.RotationAxis(
                BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize(),
                -rollAngle * Math.min(1, GROUND_ROLL_CORRECTION_RATE * dt),
            );
            orientation.copyFrom(correction.multiply(orientation));
            orientation.normalize();

            this.angularVelocity.z *= 0.05;

            // Pitch damping at taxi speed: prevents the asymmetric tricycle-gear
            // torque (nose arm >> main arm) from accumulating into a nose-up
            // flip when the plane is parked/taxiing. Above takeoff roll speed
            // the elevator is free so rotation works normally.
            const taxiSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            if (taxiSpeed < 20) {
                this.angularVelocity.x *= 0.4;
            }

            const GROUND_YAW_RATE = 1.2;
            const yawInput = this.smoothedYaw;
            if (Math.abs(yawInput) > 0.01) {
                const steerAngle = yawInput * GROUND_YAW_RATE * dt;
                const yawCorrection = BABYLON.Quaternion.RotationAxis(worldUp, steerAngle);
                orientation.copyFrom(yawCorrection.multiply(orientation));
                orientation.normalize();

                const groundSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
                if (groundSpeed > 0.5) {
                    const wm2 = this.planeRoot.getWorldMatrix();
                    const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm2).normalize();
                    const fwdHorizLen = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
                    if (fwdHorizLen > 0.01) {
                        this.velocity.x = (fwd.x / fwdHorizLen) * groundSpeed;
                        this.velocity.z = (fwd.z / fwdHorizLen) * groundSpeed;
                    }
                }
            }
        }

        if (this._cinematicActive) {
            const elapsed = performance.now() - this._cinematicStartMs;
            const t = Math.max(0, Math.min(1, elapsed / CINEMATIC_DURATION_MS));
            this.camera.target.copyFrom(pos);
            this.camera.alpha = -Math.PI / 2 + t * Math.PI * 2;
            const targetRadius = Math.max(CAMERA_RADIUS_MIN_M, Math.min(CAMERA_RADIUS_MAX_M, this.camera.radius || 35));
            this.camera.radius = CINEMATIC_INITIAL_RADIUS_M + (targetRadius - CINEMATIC_INITIAL_RADIUS_M) * t;
            this.camera.beta = 1.20 + (1.50 - 1.20) * t;
        } else if (this._cameraMode === CAMERA_MODE_CHASE) {
            this.camera.target.copyFrom(pos);

            const wm = this.planeRoot.getWorldMatrix();
            BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), wm, this._tmpFwd);
            const targetAlpha = Math.atan2(-this._tmpFwd.z, -this._tmpFwd.x);
            let da = targetAlpha - this.camera.alpha;
            da = ((da + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
            this.camera.alpha += da * Math.min(1, 3 * dt);
        } else if (this._cameraMode === CAMERA_MODE_COCKPIT) {
            const wm = this.planeRoot.getWorldMatrix();
            const cockpitOffset = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, 0.8, 0.5), wm);
            this.camera.target.copyFrom(cockpitOffset);
            BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), wm, this._tmpFwd);
            const targetAlpha = Math.atan2(-this._tmpFwd.z, -this._tmpFwd.x);
            this.camera.alpha = targetAlpha;
        } else if (this._cameraMode === CAMERA_MODE_FLYBY) {
            this.camera.target.copyFrom(pos);
        } else if (this._cameraMode === CAMERA_MODE_TOWER) {
            if (!this._towerCameraSet) this._captureTowerCameraPosition();
            this.camera.target.copyFrom(pos);
            const dx = pos.x - this._towerCameraPos.x;
            const dz = pos.z - this._towerCameraPos.z;
            const horizDist = Math.sqrt(dx * dx + dz * dz);
            const dy = pos.y - this._towerCameraPos.y;
            const targetAlpha = Math.atan2(-dz, -dx);
            const targetRadius = Math.max(TOWER_CAMERA_MIN_RADIUS_M, Math.sqrt(horizDist * horizDist + dy * dy));
            const beta = TOWER_CAMERA_BETA_RAD;
            let da = targetAlpha - this.camera.alpha;
            da = ((da + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
            this.camera.alpha += da * Math.min(1, 6 * dt);
            this.camera.beta = beta;
            this.camera.radius += (targetRadius - this.camera.radius) * Math.min(1, 4 * dt);
        }

        this._clampCameraAboveGround();

        if (this.ground) {
            this.ground.position.x = pos.x;
            this.ground.position.z = pos.z;
        }
    }

    private _clampCameraAboveGround(): void {
        if (!this.camera) return;
        try {
            const groundLevel = this.tiles ? this.terrainY : GROUND_Y;
            if (!Number.isFinite(groundLevel)) return;
            const minCameraY = groundLevel + CAMERA_GROUND_CLEARANCE_M;
            const radius = this.camera.radius;
            if (!(radius > 0)) return;
            const dy = this.camera.target.y - minCameraY;
            let upperBeta: number;
            const ratio = -dy / radius;
            if (ratio <= -1) {
                upperBeta = Math.PI - CAMERA_BETA_SAFETY_EPSILON;
            } else if (ratio >= 1) {
                upperBeta = CAMERA_BETA_SAFETY_EPSILON;
            } else {
                upperBeta = Math.acos(ratio);
            }
            this.camera.upperBetaLimit = upperBeta;
            if (this.camera.beta > upperBeta) {
                this.camera.beta = upperBeta;
            }
        } catch (err) {
            console.warn('[Camera] Ground clamp failed:', err);
        }
    }

    // ── HUD ───────────────────────────────────────────────────────────────────

    private _buildHUD(): void {
        const hud = document.createElement('div');
        hud.id = 'flight-hud';
        hud.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400&display=swap');
#flight-hud { position:fixed;inset:0;pointer-events:none;z-index:100;font-family:'Orbitron',monospace;color:#fff;opacity:0;transition:opacity 1s ease; }
.hp{position:absolute}
#hfps{font-size:10px;color:rgba(100,240,180,.4);font-family:'Inter',sans-serif}
#hw{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,30,0,.12);border:1px solid rgba(255,60,0,.7);border-radius:10px;color:#ff5500;font-size:20px;letter-spacing:.2em;text-align:center;padding:16px 36px;display:none;animation:stallPulse 1s ease-in-out infinite}
@keyframes stallPulse{0%,100%{opacity:1}50%{opacity:.3}}

/* Left Panel - Airspeed */
.hud-panel-left{position:absolute;left:12px;bottom:12px;font-family:'Inter',sans-serif;display:flex;align-items:flex-end;gap:8px}
.hud-panel-right{position:absolute;right:12px;bottom:12px;font-family:'Inter',sans-serif;display:flex;align-items:flex-end;gap:8px}

.hud-tape-col{display:flex;flex-direction:column}
.hud-header{font-size:9px;letter-spacing:.1em;color:#fff;margin-bottom:2px;font-weight:400;opacity:.8}
.hud-header-sub{font-size:7px;color:rgba(255,255,255,.4);margin-left:2px}
.hud-cyan{color:#79e7ff!important}
.hud-alt-sel{font-size:14px;font-weight:700;color:#79e7ff;font-family:'Orbitron',monospace;letter-spacing:.05em;text-align:right;margin-bottom:2px;text-shadow:0 1px 3px rgba(0,0,0,.8)}

.hud-tape-section{display:flex;align-items:stretch;overflow:visible;position:relative}
.hud-tape-wrapper{position:relative;display:block;height:180px;overflow:visible;width:64px;background:linear-gradient(to right,rgba(0,0,0,.55),rgba(0,0,0,.35));border:1px solid rgba(255,255,255,.12)}
.hud-tape{position:absolute;right:0;top:0;bottom:0;width:6px;background:linear-gradient(to top,rgba(0,0,0,.7),rgba(0,0,0,.5));overflow:hidden}
.hud-tape-fill-spd{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,#c8a030,#e8c860);transition:height .15s}
.hud-tape-fill-alt{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,#3090c8,#50b0e8);transition:height .15s}
.hud-tape-marks{position:absolute;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:18px;pointer-events:none;left:0;right:8px;align-items:flex-end;overflow:visible}
.hud-tape-marks-left,.hud-tape-marks-right{left:0;right:8px;align-items:flex-end}
.hud-tape-mark{display:flex;align-items:center;gap:3px;justify-content:flex-end;white-space:nowrap}
.hud-tape-mark-line{width:5px;height:1px;background:rgba(255,255,255,.65);flex-shrink:0}
.hud-tape-mark-val{font-size:10px;color:rgba(255,255,255,.9);font-family:'Inter',sans-serif;font-weight:500;min-width:34px;text-align:right;letter-spacing:.5px}

.hud-ticker-box{position:absolute;left:-6px;right:-6px;top:50%;transform:translateY(-50%);height:30px;background:rgba(0,0,0,.92);border:1px solid rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;font-family:'Orbitron',monospace;font-weight:700;font-size:18px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.95);letter-spacing:0;pointer-events:none;z-index:5;box-shadow:0 0 6px rgba(0,0,0,.6);line-height:1;padding:0 3px;white-space:nowrap;overflow:visible;font-variant-numeric:tabular-nums}
.hud-ticker-static{display:inline-block;line-height:1;width:.62em;text-align:center}
.hud-ticker-static:empty{display:none}
.hud-ticker-rolling{position:relative;display:inline-block;height:1em;width:.62em;vertical-align:top;clip-path:inset(0 -100px 0 -100px)}
.hud-ticker-rolling-inner{position:absolute;left:0;top:0;display:flex;flex-direction:column;line-height:1;transition:transform .12s linear}
.hud-ticker-rolling-inner span{display:block;height:1em;text-align:center;width:.62em}
.hud-ticker-small{font-size:.7em;opacity:.9;margin-left:2px;display:inline-flex;align-items:baseline}

.hud-value-row{display:flex;align-items:baseline;gap:2px;margin-top:3px}
.hud-value-main{font-size:24px;font-weight:700;color:#fff;font-family:'Orbitron',monospace;text-shadow:0 1px 4px rgba(0,0,0,.9)}
.hud-value-unit{font-size:9px;color:rgba(255,255,255,.4)}

.hud-sub-row{display:flex;align-items:center;gap:4px;margin-top:1px}
.hud-sub-label{font-size:8px;color:rgba(255,255,255,.5)}
.hud-sub-val{font-size:11px;color:#79e7ff;font-family:'Orbitron',monospace;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.8)}

/* Engine Section - Side by side */
.hud-engine-col{display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:4px}
.hud-engine-title{font-size:8px;letter-spacing:.08em;color:#fff;margin-bottom:2px;font-weight:600}
.hud-engine-content{display:flex;flex-direction:column;gap:4px}
.hud-rpm-gauge{position:relative;width:56px;height:56px}
.hud-rpm-bg{width:100%;height:100%;border-radius:50%;background:radial-gradient(circle,rgba(20,20,20,.9),rgba(10,10,10,.95));border:1px solid rgba(80,255,160,.25)}
.hud-rpm-needle{position:absolute;bottom:50%;left:50%;width:2px;height:22px;background:linear-gradient(to top,#50ff80,#80ffa0);transform-origin:bottom center;transform:rotate(-120deg);border-radius:1px;box-shadow:0 0 4px rgba(80,255,128,.5)}
.hud-rpm-center{position:absolute;top:50%;left:50%;width:6px;height:6px;background:#222;border:1px solid rgba(80,255,160,.3);border-radius:50%;transform:translate(-50%,-50%)}
.hud-rpm-label{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);font-size:7px;color:#79e7ff;letter-spacing:.04em;font-weight:700;line-height:1;text-align:center;white-space:nowrap}
.hud-rpm-end{position:absolute;font-size:6px;color:rgba(255,255,255,.55);font-family:'Inter',sans-serif}
.hud-rpm-end-min{bottom:6px;left:4px}
.hud-rpm-end-max{bottom:6px;right:4px}
.hud-engine-thr{font-size:11px;font-weight:700;color:#fff;font-family:'Orbitron',monospace;text-align:center;margin:1px 0;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.hud-engine-vals{display:flex;flex-direction:column;gap:0}
.hud-engine-val{display:flex;align-items:baseline;gap:3px}
.hud-engine-val-num{font-size:11px;font-weight:600;color:#fff;font-family:'Orbitron',monospace;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.hud-engine-val-lbl{font-size:7px;color:rgba(255,255,255,.35)}

/* Right Panel - Instruments side by side */
.hud-instr-col{display:flex;flex-direction:column;justify-content:flex-end;gap:4px;padding-bottom:4px}
.hud-vs-row{display:flex;align-items:center;gap:4px}
.hud-vs-header{font-size:8px;color:#fff;font-weight:600;letter-spacing:.05em}
.hud-vs-val{font-size:12px;font-weight:700;color:#79e7ff;font-family:'Orbitron',monospace;text-shadow:0 1px 3px rgba(0,0,0,.8);min-width:34px;text-align:right;line-height:1}

/* VS strip with numeric scale - aligned so its zero-line matches the altitude ticker center */
.hud-vs-col{display:flex;flex-direction:column;align-items:flex-start;padding-bottom:12px}
.hud-vs-col-top{display:flex;align-items:center;justify-content:space-between;gap:4px;font-family:'Inter',sans-serif;height:14px;width:100%;margin-bottom:2px;padding-left:10px}
.hud-vs-col-top .hud-vs-header{font-size:9px}
.hud-vs-strip{position:relative;display:flex;align-items:stretch;height:180px;width:36px}
.hud-vs-strip-bg{position:absolute;left:6px;top:0;bottom:0;width:1px;background:rgba(255,255,255,.25)}
.hud-vs-strip-zero{position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,.55);z-index:1}
.hud-vs-scale{position:relative;flex:1;display:flex;flex-direction:column;justify-content:space-between;font-size:9px;color:rgba(255,255,255,.65);font-family:'Inter',sans-serif;padding:0 2px 0 12px;line-height:1}
.hud-vs-scale span{display:block}
.hud-vs-pointer{position:absolute;left:-2px;top:50%;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:9px solid #79e7ff;transform:translateY(-50%);transition:top .12s linear;filter:drop-shadow(0 0 2px rgba(0,0,0,.7));z-index:3}

.hud-vs-bar{width:20px;height:80px;background:rgba(0,0,0,.5);position:relative;display:none}
.hud-vs-bar-fill{position:absolute;left:2px;right:2px;background:linear-gradient(to top,#50c878,#80ee90);transition:height .12s,bottom .12s,background .3s}
.hud-vs-bar-zero{position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,.25)}
.hud-vs-bar-marks{position:absolute;right:-10px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:space-between;font-size:7px;color:rgba(255,255,255,.4)}

.hud-instr-group{display:flex;flex-direction:column;gap:2px}
.hud-instr-item{display:flex;align-items:center;gap:4px}
.hud-instr-val{font-size:11px;font-weight:600;color:#fff;font-family:'Orbitron',monospace;min-width:28px;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.hud-instr-lbl{font-size:8px;color:rgba(255,255,255,.4);letter-spacing:.04em}
.hud-instr-bar{width:28px;height:4px;background:rgba(0,0,0,.4);overflow:hidden;border-radius:2px}
.hud-instr-bar-fill{height:100%;background:linear-gradient(90deg,#50c878,#80ee90);border-radius:2px}

.hud-bottom-row{display:flex;gap:6px;margin-top:3px;padding-top:2px;border-top:1px solid rgba(255,255,255,.08)}
.hud-bottom-item{display:flex;flex-direction:column;align-items:center}
.hud-bottom-val{font-size:9px;color:#fff;font-family:'Orbitron',monospace;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.hud-bottom-lbl{font-size:7px;color:rgba(255,255,255,.25)}

@media(max-width:768px){
#hfps{display:none}
#hud-utc{font-size:8px!important;letter-spacing:.08em!important}
#flight-pfd{top:28%!important;transform:translate(-50%,-50%)!important;width:260px;height:185px}
#gps-map{width:168px!important;height:168px!important;top:2px!important;left:2px!important}
.hud-panel-left{left:6px!important;bottom:6px!important;transform:scale(.7);transform-origin:bottom left}
.hud-panel-right{right:6px!important;bottom:6px!important;transform:scale(.7);transform-origin:bottom right}
.hud-tape-wrapper{height:140px!important;width:60px!important}
.hud-vs-strip{height:140px!important}
.hud-ticker-box{height:26px!important;font-size:15px!important;left:-6px!important;right:-6px!important}
.hud-value-main{font-size:18px!important}
.hud-rpm-gauge{width:48px!important;height:48px!important}
.hud-rpm-needle{height:18px!important}
.hud-vs-scale{font-size:8px!important}
#missions-btn{top:22px!important;right:10px!important}
#aircraft-btn{top:60px!important;right:10px!important}
#flight-plans-btn{top:98px!important;right:10px!important}
#missions-panel{top:16px!important;right:50px!important;width:260px!important;max-height:50vh!important}
#aircraft-panel{top:54px!important;right:50px!important;width:260px!important;max-height:50vh!important}
#flight-plans-panel{top:92px!important;right:50px!important;width:260px!important;max-height:50vh!important}
#nav-info{top:150px!important;left:2px!important;width:140px!important;font-size:9px!important}
#ap-panel{top:auto!important;bottom:6px!important;right:50%!important;transform:translateX(50%)!important;font-size:9px!important;padding:3px 4px!important;gap:2px!important}
#ap-panel button{padding:2px 4px!important;font-size:9px!important}
#ap-panel>div:nth-child(2){font-size:8px!important;gap:4px!important}
}
@media(max-width:480px){
#hud-utc{font-size:7px!important;letter-spacing:.06em!important}
#flight-pfd{top:22%!important;width:200px!important;height:140px!important}
#gps-map{width:132px!important;height:132px!important;top:4px!important;left:2px!important}
.hud-panel-left{left:6px!important;bottom:4px!important;transform:scale(.55);transform-origin:bottom left}
.hud-panel-right{right:6px!important;bottom:4px!important;transform:scale(.55);transform-origin:bottom right}
.hud-tape-wrapper{height:110px!important;width:56px!important}
.hud-vs-strip{height:110px!important;width:30px!important}
.hud-ticker-box{height:22px!important;font-size:13px!important;left:-4px!important;right:-4px!important}
.hud-value-main{font-size:16px!important}
.hud-vs-scale span:not(.hud-vs-scale-zero){visibility:hidden}
#h-online{display:none!important}
#missions-btn{top:6px!important;right:6px!important;width:28px!important;height:28px!important}
#aircraft-btn{top:40px!important;right:6px!important;width:28px!important;height:28px!important}
#missions-panel{top:4px!important;right:40px!important;width:200px!important;max-height:45vh!important;font-size:10px!important}
#aircraft-panel{top:38px!important;right:40px!important;width:200px!important;max-height:45vh!important;font-size:10px!important}
#flight-plans-btn{top:74px!important;right:6px!important;width:28px!important;height:28px!important}
#flight-plans-panel{top:72px!important;right:40px!important;width:200px!important;max-height:45vh!important;font-size:10px!important}
#nav-info{top:120px!important;left:2px!important;width:110px!important;font-size:8px!important}
#ap-panel{top:auto!important;bottom:6px!important;right:50%!important;transform:translateX(50%)!important;font-size:8px!important;padding:2px 3px!important;gap:1px!important;max-width:96vw!important}
#ap-panel button{padding:2px 3px!important;font-size:8px!important;letter-spacing:.02em!important}
#ap-panel>div:nth-child(2){font-size:7px!important;gap:3px!important}
}
@media(max-height:440px){
#flight-pfd{top:30%!important;width:220px!important;height:150px!important}
#gps-map{width:120px!important;height:120px!important;top:2px!important;left:2px!important}
#hud-utc{font-size:7px!important}
.hud-panel-left{left:6px!important;bottom:4px!important;transform:scale(.6);transform-origin:bottom left}
.hud-panel-right{right:6px!important;bottom:4px!important;transform:scale(.6);transform-origin:bottom right}
}

</style>
<div class="hp" id="hl"></div>
<div class="hp" id="hr"></div>
<div style="position:absolute;top:4px;right:6px;display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:10px;font-family:'Inter',sans-serif;padding:4px 6px">
  <div id="hfps" style="color:rgba(100,240,180,.4)"></div>
  <div id="h-online" style="color:rgba(100,240,180,.4)">0 ONLINE</div>
</div>
<div id="hud-utc" style="position:absolute;top:2px;left:50%;transform:translateX(-50%);font-size:11px;font-family:'Orbitron',monospace;color:rgba(100,240,180,.7);letter-spacing:.12em;text-shadow:0 0 6px rgba(0,0,0,.8)"></div>
<div class="hp" id="hw">&#9888; STALL &#9888;</div>
<div id="ap-panel" style="position:absolute;top:38px;right:54px;display:flex;flex-direction:column;gap:3px;font-family:'Orbitron',monospace;font-size:10px;color:#aac;background:rgba(0,8,16,.55);padding:4px 5px;border:1px solid rgba(80,180,255,.25);border-radius:4px;z-index:50;pointer-events:auto">
  <div style="display:flex;gap:3px;justify-content:center">
    <button id="ap-btn-ap"  type="button" class="ap-btn" style="background:#222;color:#aaa;border:1px solid #555;border-radius:3px;padding:2px 6px;font:inherit;cursor:pointer;letter-spacing:.06em">AP</button>
    <button id="ap-btn-hdg" type="button" class="ap-btn" style="background:#222;color:#aaa;border:1px solid #555;border-radius:3px;padding:2px 6px;font:inherit;cursor:pointer;letter-spacing:.06em">HDG</button>
    <button id="ap-btn-alt" type="button" class="ap-btn" style="background:#222;color:#aaa;border:1px solid #555;border-radius:3px;padding:2px 6px;font:inherit;cursor:pointer;letter-spacing:.06em">ALT</button>
    <button id="ap-btn-vs"  type="button" class="ap-btn" style="background:#222;color:#aaa;border:1px solid #555;border-radius:3px;padding:2px 6px;font:inherit;cursor:pointer;letter-spacing:.06em">VS</button>
    <button id="ap-btn-nav" type="button" class="ap-btn" style="background:#222;color:#aaa;border:1px solid #555;border-radius:3px;padding:2px 6px;font:inherit;cursor:pointer;letter-spacing:.06em">NAV</button>
    <button id="ap-btn-apr" type="button" class="ap-btn" style="background:#222;color:#aaa;border:1px solid #555;border-radius:3px;padding:2px 6px;font:inherit;cursor:pointer;letter-spacing:.06em">APR</button>
  </div>
  <div style="display:flex;gap:6px;justify-content:space-between;font-size:9px;color:#9cf;padding:0 2px">
    <span>HDG <span id="ap-tgt-hdg">---</span></span>
    <span>ALT <span id="ap-tgt-alt">-----</span></span>
    <span>VS <span id="ap-tgt-vs">----</span></span>
  </div>
</div>
<div id="crash-overlay" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(180,0,0,.35);z-index:500;pointer-events:none">
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
    <div style="font-family:'Orbitron',monospace;font-size:36px;color:#ff2200;letter-spacing:.3em;text-shadow:0 0 30px rgba(255,0,0,.8);animation:stallPulse 0.8s ease-in-out infinite">CRASHED</div>
    <div style="font-family:'Inter',sans-serif;font-size:12px;color:rgba(255,255,255,.5);margin-top:12px;letter-spacing:.1em">Respawning...</div>
  </div>
</div>

<!-- Left Panel - Airspeed & Engine side by side -->
<div class="hud-panel-left">
  <div class="hud-tape-col">
    <div class="hud-header hud-cyan">IRSPD<span class="hud-header-sub hud-cyan" style="opacity:.85">KTS</span></div>
    <div class="hud-tape-section">
      <div class="hud-tape-wrapper">
        <div class="hud-tape">
          <div class="hud-tape-fill-spd" id="hud-spd-tape" style="height:50%"></div>
        </div>
        <div class="hud-tape-marks hud-tape-marks-left" id="hud-spd-marks"></div>
        <div class="hud-ticker-box" id="hud-spd-ticker">
          <span class="hud-ticker-static" id="hud-spd-h">0</span><span class="hud-ticker-static" id="hud-spd-t">0</span><span class="hud-ticker-rolling"><span class="hud-ticker-rolling-inner" id="hud-spd-u-inner"><span>0</span><span>1</span></span></span>
        </div>
      </div>
    </div>
    <div class="hud-value-row" style="display:none">
      <span class="hud-value-main" id="bb-spd-v">0</span>
    </div>
    <div class="hud-sub-row">
      <span class="hud-sub-label">IAS</span>
      <span class="hud-sub-val"><span id="hud-ias-v">0</span>KT</span>
    </div>
    <div class="hud-sub-row">
      <span class="hud-sub-label">TAS</span>
      <span class="hud-sub-val"><span id="hud-tas-v">0</span>KT</span>
    </div>
    <div class="hud-sub-row">
      <span class="hud-sub-label">GS</span>
      <span class="hud-sub-val"><span id="hud-gs-v">0</span>KT</span>
    </div>
  </div>
  <div class="hud-engine-col" id="hud-engine1-col">
    <div class="hud-engine-title">ENGINE #1</div>
    <div class="hud-engine-content">
      <div class="hud-rpm-gauge">
        <div class="hud-rpm-bg"></div>
        <div class="hud-rpm-needle" id="hud-rpm-needle"></div>
        <div class="hud-rpm-center"></div>
        <div class="hud-rpm-label">LVR<br>A/THR</div>
        <div class="hud-rpm-end hud-rpm-end-min">0</div>
        <div class="hud-rpm-end hud-rpm-end-max">110</div>
      </div>
      <div class="hud-engine-thr" id="hud-eng1-pct">0%</div>
      <div class="hud-engine-vals">
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-rpm-v">0</span><span class="hud-engine-val-lbl">RPM</span></div>
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-fuel-v">100%</span><span class="hud-engine-val-lbl">FUEL</span></div>
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-aoa-v">0&deg;</span><span class="hud-engine-val-lbl">AOA</span></div>
      </div>
    </div>
  </div>
  <div class="hud-engine-col" id="hud-engine2-col" style="display:none">
    <div class="hud-engine-title">ENGINE #2</div>
    <div class="hud-engine-content">
      <div class="hud-rpm-gauge">
        <div class="hud-rpm-bg"></div>
        <div class="hud-rpm-needle" id="hud-rpm-needle2"></div>
        <div class="hud-rpm-center"></div>
        <div class="hud-rpm-label">LVR<br>A/THR</div>
        <div class="hud-rpm-end hud-rpm-end-min">0</div>
        <div class="hud-rpm-end hud-rpm-end-max">110</div>
      </div>
      <div class="hud-engine-thr" id="hud-eng2-pct">0%</div>
      <div class="hud-engine-vals">
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-rpm2-v">0</span><span class="hud-engine-val-lbl">RPM</span></div>
      </div>
    </div>
  </div>
</div>

<!-- Right Panel - Altitude & Instruments side by side -->
<div class="hud-panel-right">
  <div class="hud-instr-col">
    <div class="hud-instr-group">
      <div class="hud-instr-item"><span class="hud-instr-val" id="bb-flp">OFF</span><span class="hud-instr-lbl">FLAPS</span></div>
      <div class="hud-instr-item"><span class="hud-instr-val" id="bb-brk">OFF</span><span class="hud-instr-lbl">BRK</span></div>
      <div class="hud-instr-item" id="hud-gear-row" style="display:none"><span class="hud-instr-val" id="hud-gear-state">DOWN</span><span class="hud-instr-lbl">GEAR</span></div>
      <div class="hud-instr-item"><span class="hud-instr-val" id="hud-trim-v">0</span><span class="hud-instr-lbl">TRIM</span></div>
      <div class="hud-instr-item"><span class="hud-instr-val" id="hud-thr-pct" style="min-width:22px">0%</span><div class="hud-instr-bar"><div class="hud-instr-bar-fill" id="bb-thr" style="width:0%"></div></div><span class="hud-instr-lbl">THR</span><span class="hud-instr-ab" id="hud-ab-tag" style="display:none;margin-left:4px;padding:1px 4px;border:1px solid #ff5a00;color:#ff5a00;font-weight:bold;border-radius:3px;font-size:.85em">AB</span></div>
      <div class="hud-instr-item" id="hud-ap-row"><span class="hud-instr-val" id="hud-ap-state" style="color:#888">OFF</span><span class="hud-instr-lbl">AP</span></div>
      <div class="hud-instr-item" id="hud-spoiler-row"><span class="hud-instr-val" id="hud-spoiler-state" style="color:#888">--</span><span class="hud-instr-lbl">SPL</span></div>
      <div class="hud-instr-item" id="hud-engs-row"><span class="hud-instr-val" id="hud-engs-state" style="color:#40ff80">OK</span><span class="hud-instr-lbl">ENG</span></div>
    </div>
    <div class="hud-bottom-row">
      <div class="hud-bottom-item"><span class="hud-bottom-val" id="hud-hdg-v">0&deg;</span><span class="hud-bottom-lbl">HDG</span></div>
      <div class="hud-bottom-item"><span class="hud-bottom-val" id="bb-att">LEVEL</span><span class="hud-bottom-lbl">ATT</span></div>
    </div>
  </div>
  <div class="hud-tape-col">
    <div class="hud-header hud-cyan" style="text-align:right">ALTITUDE</div>
    <div class="hud-alt-sel" id="hud-alt-sel">5000</div>
    <div class="hud-tape-section">
      <div class="hud-tape-wrapper">
        <div class="hud-tape">
          <div class="hud-tape-fill-alt" id="hud-alt-tape" style="height:50%"></div>
        </div>
        <div class="hud-tape-marks hud-tape-marks-right" id="hud-alt-marks"></div>
        <div class="hud-ticker-box" id="hud-alt-ticker">
          <span class="hud-ticker-static" id="hud-alt-h">0</span><span class="hud-ticker-static" id="hud-alt-t">0</span><span class="hud-ticker-static" id="hud-alt-u">0</span><span class="hud-ticker-small"><span class="hud-ticker-static" id="hud-alt-tens">0</span><span class="hud-ticker-rolling"><span class="hud-ticker-rolling-inner" id="hud-alt-units-inner"><span>0</span><span>1</span></span></span></span>
        </div>
      </div>
    </div>
    <div class="hud-sub-row" style="justify-content:flex-end">
      <span class="hud-sub-val"><span id="hud-baro-v">29.92</span> IN</span>
    </div>
    <div class="hud-value-row" style="justify-content:flex-end;display:none">
      <span class="hud-value-main" id="bb-alt-v">0</span>
    </div>
  </div>
  <div class="hud-vs-col">
    <div class="hud-vs-col-top">
      <span class="hud-vs-header">VS</span>
      <span class="hud-vs-val" id="hud-vs-v">0</span>
    </div>
    <div class="hud-vs-strip">
      <div class="hud-vs-strip-bg"></div>
      <div class="hud-vs-strip-zero"></div>
      <div class="hud-vs-pointer" id="hud-vs-pointer"></div>
      <div class="hud-vs-scale">
        <span>6</span>
        <span>4</span>
        <span>2</span>
        <span class="hud-vs-scale-zero" style="visibility:hidden">0</span>
        <span>-2</span>
        <span>-4</span>
        <span>-6</span>
      </div>
      <div class="hud-vs-bar" style="display:none"><div class="hud-vs-bar-fill" id="hud-vs-bar" style="height:0;bottom:50%"></div></div>
    </div>
  </div>
</div>

<canvas id="flight-pfd" width="350" height="250" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);pointer-events:none"></canvas>
<div id="gps-map" style="position:absolute;top:4px;left:4px;width:216px;height:216px;border-radius:10px;overflow:hidden;box-shadow:0 0 20px rgba(0,255,128,.12);background:rgba(0,20,15,.6);pointer-events:auto;touch-action:none">
  <img id="gps-map-img" style="position:absolute;top:-50%;left:-50%;width:200%;height:200%;object-fit:cover;opacity:0.9;will-change:transform;pointer-events:none;user-select:none" draggable="false">
  <canvas id="gps-map-hdg" width="216" height="216" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
  <div id="gps-map-handle" title="Arrastar GPS" style="position:absolute;top:0;left:0;right:0;height:14px;background:linear-gradient(to bottom,rgba(80,255,160,.18),rgba(80,255,160,0));cursor:grab;display:flex;align-items:center;justify-content:center;font-size:8px;letter-spacing:.18em;color:rgba(100,240,180,.7);font-family:'Inter',sans-serif;text-shadow:0 0 4px rgba(0,0,0,.8);user-select:none">GPS &#x2022;&#x2022;&#x2022;</div>
  <div id="gps-zoom-controls" style="position:absolute;top:18px;right:4px;display:flex;flex-direction:column;gap:2px;z-index:2">
    <button id="gps-zoom-in" title="Aumentar zoom" type="button" style="width:18px;height:18px;padding:0;border:1px solid rgba(80,255,160,.45);background:rgba(2,10,20,.75);color:rgba(100,240,180,.95);font-family:'Orbitron',monospace;font-size:14px;line-height:1;cursor:pointer;border-radius:3px;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:none">+</button>
    <button id="gps-zoom-out" title="Diminuir zoom" type="button" style="width:18px;height:18px;padding:0;border:1px solid rgba(80,255,160,.45);background:rgba(2,10,20,.75);color:rgba(100,240,180,.95);font-family:'Orbitron',monospace;font-size:14px;line-height:1;cursor:pointer;border-radius:3px;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:none">&#8722;</button>
    <div id="gps-zoom-val" style="width:18px;text-align:center;font-size:8px;color:rgba(100,240,180,.7);font-family:'Inter',sans-serif;text-shadow:0 0 4px rgba(0,0,0,.8);user-select:none;pointer-events:none">12</div>
    <button id="gps-mode-toggle" title="Alternar modo do mapa (Norte/Heading)" type="button" style="width:18px;height:18px;padding:0;margin-top:4px;border:1px solid rgba(80,255,160,.45);background:rgba(2,10,20,.75);color:rgba(100,240,180,.95);font-family:'Orbitron',monospace;font-size:9px;line-height:1;cursor:pointer;border-radius:3px;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:none">N</button>
  </div>
  <div id="gps-coords" style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-size:8px;color:rgba(100,240,180,.6);font-family:'Inter',sans-serif;text-shadow:0 0 4px rgba(0,0,0,.8);white-space:nowrap;pointer-events:none"></div>
</div>

<div id="missions-btn" style="position:absolute;top:74px;right:14px;width:32px;height:32px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;transition:border-color .2s,box-shadow .2s" title="Missions">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#40ffaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="12,2 15,10 12,8 9,10"/><circle cx="12" cy="12" r="3"/></svg>
</div>

<div id="missions-panel" class="game-panel" style="display:none;position:absolute;top:64px;right:54px;width:320px;height:400px;background:rgba(2,10,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.3);border-radius:8px;pointer-events:auto;font-family:'Inter',sans-serif;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:300">
  <div class="panel-handle" id="missions-panel-handle" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;cursor:grab;border-bottom:1px solid rgba(80,255,160,.15);user-select:none;touch-action:none">
    <span class="panel-title" style="font-family:'Orbitron',monospace;font-size:11px;color:#40ffaa;letter-spacing:.12em">MISSIONS</span>
    <div style="display:flex;gap:4px">
      <button class="panel-pin" data-panel="missions-panel" title="Fixar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u25CB</button>
      <button class="panel-min" data-panel="missions-panel" title="Minimizar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">_</button>
      <button class="panel-close" data-panel="missions-panel" data-btn="missions-btn" title="Fechar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u00D7</button>
    </div>
  </div>
  <div class="panel-toolbar" style="display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid rgba(80,255,160,.08)">
    <input id="missions-search" type="text" placeholder="Buscar..." style="flex:1;min-width:0;padding:3px 6px;font-size:10px;background:rgba(0,20,15,.5);border:1px solid rgba(80,255,160,.25);border-radius:3px;color:#fff;outline:none">
    <select id="missions-sort" style="padding:3px 4px;font-size:10px;background:rgba(0,20,15,.5);border:1px solid rgba(80,255,160,.25);border-radius:3px;color:#fff;outline:none">
      <option value="status">Status</option>
      <option value="title">Nome</option>
      <option value="difficulty">Dificuldade</option>
      <option value="distance">Dist\u00E2ncia</option>
    </select>
  </div>
  <div class="panel-body" style="overflow-y:auto;padding:10px;height:calc(100% - 78px)">
    <div id="missions-list" style="font-size:11px;color:rgba(255,255,255,.7)">Loading...</div>
  </div>
  <div class="panel-resize" data-panel="missions-panel" style="position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,rgba(80,255,160,.5) 50%,rgba(80,255,160,.5) 60%,transparent 60%,transparent 70%,rgba(80,255,160,.5) 70%,rgba(80,255,160,.5) 80%,transparent 80%);touch-action:none"></div>
</div>

<div id="aircraft-btn" style="position:absolute;top:112px;right:14px;width:32px;height:32px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;transition:border-color .2s,box-shadow .2s" title="Aircraft">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#40ffaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l5-3v2h4l1-5h2l1 5h4v-2l5 3-5 3v-2h-4l-1 5h-2l-1-5H7v2z"/></svg>
</div>

<div id="aircraft-panel" class="game-panel" style="display:none;position:absolute;top:102px;right:54px;width:320px;height:400px;background:rgba(2,10,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.3);border-radius:8px;pointer-events:auto;font-family:'Inter',sans-serif;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:300">
  <div class="panel-handle" id="aircraft-panel-handle" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;cursor:grab;border-bottom:1px solid rgba(80,255,160,.15);user-select:none;touch-action:none">
    <span class="panel-title" style="font-family:'Orbitron',monospace;font-size:11px;color:#40ffaa;letter-spacing:.12em">AIRCRAFT</span>
    <div style="display:flex;gap:4px">
      <button class="panel-pin" data-panel="aircraft-panel" title="Fixar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u25CB</button>
      <button class="panel-min" data-panel="aircraft-panel" title="Minimizar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">_</button>
      <button class="panel-close" data-panel="aircraft-panel" data-btn="aircraft-btn" title="Fechar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u00D7</button>
    </div>
  </div>
  <div class="panel-body" style="overflow-y:auto;padding:10px;height:calc(100% - 36px)">
    <div id="aircraft-list" style="font-size:11px;color:rgba(255,255,255,.7)">Loading...</div>
  </div>
  <div class="panel-resize" data-panel="aircraft-panel" style="position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,rgba(80,255,160,.5) 50%,rgba(80,255,160,.5) 60%,transparent 60%,transparent 70%,rgba(80,255,160,.5) 70%,rgba(80,255,160,.5) 80%,transparent 80%);touch-action:none"></div>
</div>

<div id="flight-plans-btn" style="position:absolute;top:150px;right:14px;width:32px;height:32px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;transition:border-color .2s,box-shadow .2s" title="Flight Plans">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#40ffaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h4l3-4 4 4h7"/><path d="M3 17h4l3 4 4-4h7"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
</div>

<div id="flight-plans-panel" class="game-panel" style="display:none;position:absolute;top:140px;right:54px;width:320px;height:400px;background:rgba(2,10,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.3);border-radius:8px;pointer-events:auto;font-family:'Inter',sans-serif;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:300">
  <div class="panel-handle" id="flight-plans-panel-handle" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;cursor:grab;border-bottom:1px solid rgba(80,255,160,.15);user-select:none;touch-action:none">
    <span class="panel-title" style="font-family:'Orbitron',monospace;font-size:11px;color:#40ffaa;letter-spacing:.12em">FLIGHT PLANS</span>
    <div style="display:flex;gap:4px">
      <button class="panel-pin" data-panel="flight-plans-panel" title="Fixar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u25CB</button>
      <button class="panel-min" data-panel="flight-plans-panel" title="Minimizar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">_</button>
      <button class="panel-close" data-panel="flight-plans-panel" data-btn="flight-plans-btn" title="Fechar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u00D7</button>
    </div>
  </div>
  <div class="panel-body" style="overflow-y:auto;padding:10px;height:calc(100% - 36px)">
    <div id="flight-plans-list" style="font-size:11px;color:rgba(255,255,255,.7)">Loading...</div>
  </div>
  <div class="panel-resize" data-panel="flight-plans-panel" style="position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,rgba(80,255,160,.5) 50%,rgba(80,255,160,.5) 60%,transparent 60%,transparent 70%,rgba(80,255,160,.5) 70%,rgba(80,255,160,.5) 80%,transparent 80%);touch-action:none"></div>
</div>

<div id="nav-info" style="display:none;position:absolute;top:190px;left:4px;width:210px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:6px;padding:6px 8px;font-family:'Inter',sans-serif;color:#fff;font-size:10px;pointer-events:none;box-shadow:0 0 12px rgba(0,255,128,.1)">
  <div style="font-family:'Orbitron',monospace;font-size:8px;color:#40ffaa;letter-spacing:.15em;margin-bottom:3px">NAV</div>
  <div id="nav-leg-block" style="display:none;border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:3px;margin-bottom:3px">
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">WPT</span><span id="nav-wpt-name" style="color:#fff">\u2014</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">LEG</span><span id="nav-leg-idx" style="color:#fff">\u2014</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">DIST</span><span id="nav-leg-dist" style="color:#40ffaa">\u2014 nm</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">BRG</span><span id="nav-leg-brg" style="color:#40ffaa">\u2014\u00B0</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">HDG\u0394</span><span id="nav-hdg-delta" style="color:#40ffaa">\u2014</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">XTE</span><span id="nav-xte-val" style="color:#40ffaa">\u2014</span></div>
    <div id="nav-xte-bar-wrap" style="position:relative;height:5px;background:rgba(255,255,255,.08);border-radius:2px;margin:2px 0">
      <div id="nav-xte-bar-mid" style="position:absolute;left:50%;top:-1px;width:1px;height:7px;background:rgba(255,255,255,.5)"></div>
      <div id="nav-xte-bar-dot" style="position:absolute;left:50%;top:0;width:5px;height:5px;background:#40ffaa;border-radius:50%;transform:translateX(-2.5px);transition:left .15s linear"></div>
    </div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">TGT</span><span id="nav-tgt-alt" style="color:#fff">\u2014</span></div>
    <div id="nav-alt-band-wrap" style="display:none;position:relative;height:5px;background:rgba(255,255,255,.08);border-radius:2px;margin:2px 0">
      <div id="nav-alt-band-mid" style="position:absolute;left:50%;top:-1px;width:1px;height:7px;background:rgba(255,255,255,.5)"></div>
      <div id="nav-alt-band-dot" style="position:absolute;left:50%;top:0;width:5px;height:5px;background:#40ffaa;border-radius:50%;transform:translateX(-2.5px);transition:left .15s linear"></div>
    </div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">ETE</span><span id="nav-ete" style="color:#fff">\u2014</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">ETA</span><span id="nav-eta" style="color:#fff">\u2014</span></div>
  </div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">DEST</span><span id="nav-dest" style="color:#fff">\u2014</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">DIST</span><span id="nav-dist" style="color:#40ffaa">\u2014 km</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">BRG</span><span id="nav-brg" style="color:#40ffaa">\u2014\u00B0</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">TOTAL</span><span id="nav-total-dist" style="color:#40ffaa">\u2014</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">WIND</span><span id="nav-wind" style="color:#40ffaa">\u2014</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">GS</span><span id="nav-gs" style="color:#40ffaa">\u2014 kt</span></div>
</div>`;
        document.body.appendChild(hud);
        const panelLeft = hud.querySelector<HTMLElement>('.hud-panel-left');
        const panelRight = hud.querySelector<HTMLElement>('.hud-panel-right');
        const apPanel = hud.querySelector<HTMLElement>('#ap-panel');
        if (panelLeft) this._makeDraggable(panelLeft);
        if (panelRight) this._makeDraggable(panelRight);
        if (apPanel) this._makeDraggable(apPanel);
        this.hudCanvas = document.getElementById('flight-pfd') as HTMLCanvasElement;
        this.hudCtx    = this.hudCanvas.getContext('2d')!;
        this.hudSpeedVal = document.getElementById('bb-spd-v')!;
        this.hudAltVal   = document.getElementById('bb-alt-v')!;
        this.hudThrottle = document.getElementById('bb-thr')!;
        this.hudThrPct   = document.getElementById('hud-thr-pct')!;
        this.hudAbTag    = document.getElementById('hud-ab-tag');
        this.hudAttitude = document.getElementById('bb-att')!;
        this.hudWarning  = document.getElementById('hw')!;
        this._crashOverlayEl = document.getElementById('crash-overlay');
        this.hudFps      = document.getElementById('hfps')!;
        this.hudOnline   = document.getElementById('h-online')!;
        this.hudFlapVal  = document.getElementById('bb-flp')!;
        this.hudFlapBar  = document.getElementById('bb-flp')!;
        this.hudBrakeVal = document.getElementById('bb-brk')!;
        this.hudGearRow  = document.getElementById('hud-gear-row')!;
        this.hudGearState = document.getElementById('hud-gear-state')!;
        this.hudTasVal   = document.getElementById('hud-tas-v')!;
        this.hudGsVal    = document.getElementById('hud-gs-v');
        this.hudIasVal   = document.getElementById('hud-ias-v');
        this.hudApState  = document.getElementById('hud-ap-state');
        this.hudSpoilerState = document.getElementById('hud-spoiler-state');
        this.hudEngsState    = document.getElementById('hud-engs-state');
        this._wireAutopilotPanel();
        this.hudRpmVal   = document.getElementById('hud-rpm-v')!;
        this.hudRpmNeedle = document.getElementById('hud-rpm-needle')!;
        this.hudFuelVal  = document.getElementById('hud-fuel-v')!;
        this.hudAoaVal   = document.getElementById('hud-aoa-v')!;
        this.hudVsVal    = document.getElementById('hud-vs-v')!;
        this.hudTrimVal  = document.getElementById('hud-trim-v')!;
        this.hudBaroVal  = document.getElementById('hud-baro-v')!;
        this.hudHdgVal   = document.getElementById('hud-hdg-v')!;
        this.hudAltTape  = document.getElementById('hud-alt-tape')!;
        this.hudSpdTape  = document.getElementById('hud-spd-tape')!;
        this.hudSpdMarks = document.getElementById('hud-spd-marks')!;
        this.hudAltMarks = document.getElementById('hud-alt-marks')!;
        this.hudVsBar    = document.getElementById('hud-vs-bar')!;
        this.hudSpdH        = document.getElementById('hud-spd-h');
        this.hudSpdT        = document.getElementById('hud-spd-t');
        this.hudSpdUInner   = document.getElementById('hud-spd-u-inner');
        this.hudAltH        = document.getElementById('hud-alt-h');
        this.hudAltT        = document.getElementById('hud-alt-t');
        this.hudAltU        = document.getElementById('hud-alt-u');
        this.hudAltTens     = document.getElementById('hud-alt-tens');
        this.hudAltUnitsInner = document.getElementById('hud-alt-units-inner');
        this.hudAltSel      = document.getElementById('hud-alt-sel');
        this.hudVsPointer   = document.getElementById('hud-vs-pointer');
        this.hudEngine2Col  = document.getElementById('hud-engine2-col');
        this.hudRpmVal2     = document.getElementById('hud-rpm2-v');
        this.hudRpmNeedle2  = document.getElementById('hud-rpm-needle2');
        this.hudEng1Pct     = document.getElementById('hud-eng1-pct');
        this.hudEng2Pct     = document.getElementById('hud-eng2-pct');
        this._updateEngineColumnsVisibility();
        this.hudUtc      = document.getElementById('hud-utc')!;
        this.mapImg      = document.getElementById('gps-map-img') as HTMLImageElement;
        this.mapHeadingCanvas = document.getElementById('gps-map-hdg') as HTMLCanvasElement;
        this._mapHdgCtx  = this.mapHeadingCanvas.getContext('2d');
        this._setupMinimapDrag();

        this._missionBtnEl = document.getElementById('missions-btn');
        this._missionPanelEl = document.getElementById('missions-panel');
        this._setupMissionsBtn();

        this._aircraftBtnEl = document.getElementById('aircraft-btn');
        this._aircraftPanelEl = document.getElementById('aircraft-panel');
        this._setupAircraftBtn();

        this._flightPlansBtnEl = document.getElementById('flight-plans-btn');
        this._flightPlansPanelEl = document.getElementById('flight-plans-panel');
        this._setupFlightPlansBtn();

        this._setupPanelControls();

        this._navInfoEl = document.getElementById('nav-info');
        this._navDestEl = document.getElementById('nav-dest');
        this._navDistEl = document.getElementById('nav-dist');
        this._navBrgEl  = document.getElementById('nav-brg');

        this._initTapeMarks();
        this._initFlapBar();
        this._buildDebugPanel();
    }

    // ── Panel Management ────────────────────────────────────────────────────────

    private _pinnedPanels = new Set<string>();
    private _minimizedPanels = new Set<string>();
    private _panelDragState: { panel: HTMLElement; offsetX: number; offsetY: number; pointerId: number } | null = null;
    private _panelResizeState: { panel: HTMLElement; startW: number; startH: number; startX: number; startY: number; pointerId: number } | null = null;
    private static readonly PANEL_STATE_STORAGE_KEY = 'flight_panels_v1';

    private _closeAllPanels(except?: HTMLElement | null): void {
        const panels = [this._missionPanelEl, this._aircraftPanelEl, this._flightPlansPanelEl];
        const btns = [this._missionBtnEl, this._aircraftBtnEl, this._flightPlansBtnEl];
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (!p || p === except) continue;
            if (p.id && this._pinnedPanels.has(p.id)) continue;
            p.style.display = 'none';
            if (btns[i]) { btns[i]!.style.borderColor = 'rgba(80,255,160,.3)'; btns[i]!.style.boxShadow = 'none'; }
        }
    }

    private _persistPanelState(): void {
        try {
            const ids = ['missions-panel', 'aircraft-panel', 'flight-plans-panel'];
            const state: Record<string, { x?: number; y?: number; w?: number; h?: number; minimized: boolean; pinned: boolean }> = {};
            for (const id of ids) {
                const el = document.getElementById(id);
                if (!el) continue;
                const entry: { x?: number; y?: number; w?: number; h?: number; minimized: boolean; pinned: boolean } = {
                    minimized: this._minimizedPanels.has(id),
                    pinned: this._pinnedPanels.has(id),
                };
                if (el.style.left) entry.x = parseInt(el.style.left, 10);
                if (el.style.top) entry.y = parseInt(el.style.top, 10);
                if (el.style.width) entry.w = parseInt(el.style.width, 10);
                if (el.style.height && el.style.height !== 'auto') entry.h = parseInt(el.style.height, 10);
                state[id] = entry;
            }
            localStorage.setItem(FlightSceneSimple.PANEL_STATE_STORAGE_KEY, JSON.stringify(state));
        } catch (err) {
            console.warn('[Panels] Failed to persist state:', err);
        }
    }

    private _restorePanelState(): void {
        try {
            const raw = localStorage.getItem(FlightSceneSimple.PANEL_STATE_STORAGE_KEY);
            if (!raw) return;
            const state = JSON.parse(raw);
            if (!state || typeof state !== 'object') return;
            for (const id of Object.keys(state)) {
                const el = document.getElementById(id);
                const cfg = state[id];
                if (!el || !cfg) continue;
                const vw = window.innerWidth, vh = window.innerHeight;
                if (Number.isFinite(cfg.x) && Number.isFinite(cfg.y)) {
                    const x = Math.max(0, Math.min(vw - 100, Number(cfg.x)));
                    const y = Math.max(0, Math.min(vh - 50, Number(cfg.y)));
                    el.style.left = `${x}px`;
                    el.style.top = `${y}px`;
                    el.style.right = 'auto';
                }
                if (Number.isFinite(cfg.w) && Number.isFinite(cfg.h)) {
                    el.style.width = `${Math.max(220, Number(cfg.w))}px`;
                    el.style.height = `${Math.max(120, Number(cfg.h))}px`;
                }
                if (cfg.pinned) {
                    this._pinnedPanels.add(id);
                    const pinBtn = el.querySelector<HTMLButtonElement>('.panel-pin');
                    if (pinBtn) { pinBtn.textContent = '\u25CF'; pinBtn.style.color = '#ffcc55'; }
                }
                if (cfg.minimized) {
                    this._minimizedPanels.add(id);
                    const body = el.querySelector<HTMLElement>('.panel-body');
                    const tools = el.querySelector<HTMLElement>('.panel-toolbar');
                    if (body) body.style.display = 'none';
                    if (tools) tools.style.display = 'none';
                    el.style.height = 'auto';
                }
            }
        } catch (err) {
            console.warn('[Panels] Failed to restore state:', err);
        }
    }

    private _setupPanelControls(): void {
        const panels = ['missions-panel', 'aircraft-panel', 'flight-plans-panel'];
        for (const id of panels) {
            const panel = document.getElementById(id);
            if (!panel) continue;
            const handle = panel.querySelector<HTMLElement>('.panel-handle');
            if (handle) this._wirePanelDrag(panel, handle);
            const resize = panel.querySelector<HTMLElement>('.panel-resize');
            if (resize) this._wirePanelResize(panel, resize);
            const minBtn = panel.querySelector<HTMLButtonElement>('.panel-min');
            if (minBtn) {
                minBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    this._togglePanelMinimize(id);
                });
            }
            const pinBtn = panel.querySelector<HTMLButtonElement>('.panel-pin');
            if (pinBtn) {
                pinBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    this._togglePanelPin(id);
                });
            }
            const closeBtn = panel.querySelector<HTMLButtonElement>('.panel-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    panel.style.display = 'none';
                    const btnId = closeBtn.getAttribute('data-btn');
                    if (btnId) {
                        const btn = document.getElementById(btnId);
                        if (btn) {
                            btn.style.borderColor = 'rgba(80,255,160,.3)';
                            btn.style.boxShadow = 'none';
                        }
                    }
                });
            }
        }
        this._restorePanelState();
    }

    private _wirePanelDrag(panel: HTMLElement, handle: HTMLElement): void {
        handle.addEventListener('pointerdown', (ev: PointerEvent) => {
            const target = ev.target as HTMLElement;
            if (target && target.tagName === 'BUTTON') return;
            ev.preventDefault();
            const rect = panel.getBoundingClientRect();
            this._panelDragState = {
                panel,
                offsetX: ev.clientX - rect.left,
                offsetY: ev.clientY - rect.top,
                pointerId: ev.pointerId,
            };
            handle.setPointerCapture(ev.pointerId);
            handle.style.cursor = 'grabbing';
        });
        handle.addEventListener('pointermove', (ev: PointerEvent) => {
            const st = this._panelDragState;
            if (!st || st.pointerId !== ev.pointerId) return;
            const vw = window.innerWidth, vh = window.innerHeight;
            const newX = Math.max(0, Math.min(vw - 60, ev.clientX - st.offsetX));
            const newY = Math.max(0, Math.min(vh - 30, ev.clientY - st.offsetY));
            panel.style.left = `${newX}px`;
            panel.style.top = `${newY}px`;
            panel.style.right = 'auto';
        });
        const endDrag = (ev: PointerEvent) => {
            const st = this._panelDragState;
            if (!st || st.pointerId !== ev.pointerId) return;
            this._panelDragState = null;
            try { handle.releasePointerCapture(ev.pointerId); } catch (_e) { /* ignore */ }
            handle.style.cursor = 'grab';
            this._persistPanelState();
        };
        handle.addEventListener('pointerup', endDrag);
        handle.addEventListener('pointercancel', endDrag);
    }

    private _wirePanelResize(panel: HTMLElement, handle: HTMLElement): void {
        handle.addEventListener('pointerdown', (ev: PointerEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            const rect = panel.getBoundingClientRect();
            this._panelResizeState = {
                panel,
                startW: rect.width,
                startH: rect.height,
                startX: ev.clientX,
                startY: ev.clientY,
                pointerId: ev.pointerId,
            };
            handle.setPointerCapture(ev.pointerId);
        });
        handle.addEventListener('pointermove', (ev: PointerEvent) => {
            const st = this._panelResizeState;
            if (!st || st.pointerId !== ev.pointerId) return;
            const dx = ev.clientX - st.startX;
            const dy = ev.clientY - st.startY;
            panel.style.width = `${Math.max(220, st.startW + dx)}px`;
            panel.style.height = `${Math.max(120, st.startH + dy)}px`;
        });
        const endResize = (ev: PointerEvent) => {
            const st = this._panelResizeState;
            if (!st || st.pointerId !== ev.pointerId) return;
            this._panelResizeState = null;
            try { handle.releasePointerCapture(ev.pointerId); } catch (_e) { /* ignore */ }
            this._persistPanelState();
        };
        handle.addEventListener('pointerup', endResize);
        handle.addEventListener('pointercancel', endResize);
    }

    private _togglePanelMinimize(id: string): void {
        const panel = document.getElementById(id);
        if (!panel) return;
        const body = panel.querySelector<HTMLElement>('.panel-body');
        const tools = panel.querySelector<HTMLElement>('.panel-toolbar');
        const resize = panel.querySelector<HTMLElement>('.panel-resize');
        const minBtn = panel.querySelector<HTMLButtonElement>('.panel-min');
        if (this._minimizedPanels.has(id)) {
            this._minimizedPanels.delete(id);
            if (body) body.style.display = '';
            if (tools) tools.style.display = '';
            if (resize) resize.style.display = '';
            if (minBtn) minBtn.textContent = '_';
            panel.style.height = '400px';
        } else {
            this._minimizedPanels.add(id);
            if (body) body.style.display = 'none';
            if (tools) tools.style.display = 'none';
            if (resize) resize.style.display = 'none';
            if (minBtn) minBtn.textContent = '\u25A1';
            panel.style.height = 'auto';
        }
        this._persistPanelState();
    }

    private _togglePanelPin(id: string): void {
        const panel = document.getElementById(id);
        if (!panel) return;
        const pinBtn = panel.querySelector<HTMLButtonElement>('.panel-pin');
        if (this._pinnedPanels.has(id)) {
            this._pinnedPanels.delete(id);
            if (pinBtn) { pinBtn.textContent = '\u25CB'; pinBtn.style.color = '#40ffaa'; }
        } else {
            this._pinnedPanels.add(id);
            if (pinBtn) { pinBtn.textContent = '\u25CF'; pinBtn.style.color = '#ffcc55'; }
        }
        this._persistPanelState();
    }

    // ── Missions Button ─────────────────────────────────────────────────────────

    private _setupMissionsBtn(): void {
        if (!this._missionBtnEl || !this._missionPanelEl) return;
        const btn = this._missionBtnEl;
        const panel = this._missionPanelEl;

        btn.addEventListener('mouseenter', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.7)'; btn.style.boxShadow = '0 0 8px rgba(0,255,128,.2)'; } });
        btn.addEventListener('mouseleave', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none'; } });

        btn.addEventListener('click', () => {
            const visible = panel.style.display !== 'none';
            this._closeAllPanels(visible ? null : panel);
            if (visible) {
                panel.style.display = 'none';
                btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none';
            } else {
                panel.style.display = 'block';
                btn.style.borderColor = 'rgba(80,255,160,.9)'; btn.style.boxShadow = '0 0 12px rgba(0,255,128,.35)';
                this._loadMissions();
            }
        });
    }

    private _missionsCache: any[] = [];
    private _missionsSearchWired = false;

    private _wireMissionsToolbar(): void {
        if (this._missionsSearchWired) return;
        const search = document.getElementById('missions-search') as HTMLInputElement | null;
        const sort = document.getElementById('missions-sort') as HTMLSelectElement | null;
        if (search) {
            search.addEventListener('input', () => this._renderMissionsList());
        }
        if (sort) {
            sort.addEventListener('change', () => this._renderMissionsList());
        }
        this._missionsSearchWired = true;
    }

    private async _loadMissions(): Promise<void> {
        const listEl = document.getElementById('missions-list');
        if (!listEl) return;
        listEl.textContent = 'Loading...';

        this._wireMissionsToolbar();

        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Login required</div>';
            return;
        }

        try {
            const res = await fetch('/api/user-missions?status=started,in_progress', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) {
                console.warn(`[FlightScene] User-missions fetch failed: HTTP ${res.status}`);
                listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Failed to load missions</div>';
                return;
            }
            const json = await res.json();
            const userMissions = Array.isArray(json?.data) ? json.data : [];

            this._missionsCache = userMissions;

            if (!userMissions.length) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,.4)">No missions acquired</div>';
                this._activeMission = null;
                this._activeUserMissionId = null;
                this._activeMissionId = null;
                this._missionWaypoints = [];
                this._missionCurrentWpIndex = 0;
                return;
            }

            this._renderMissionsList();

            const activeFromList = userMissions.find((m: any) => m?.status === 'in_progress');
            if (activeFromList && activeFromList.departure_lat != null && activeFromList.arrival_lat != null) {
                this._activeMission = {
                    departure_lat: Number(activeFromList.departure_lat),
                    departure_lon: Number(activeFromList.departure_lon),
                    arrival_lat: Number(activeFromList.arrival_lat),
                    arrival_lon: Number(activeFromList.arrival_lon),
                    departure_icao: activeFromList.departure_icao || '',
                    arrival_icao: activeFromList.arrival_icao || '',
                    mission_title: activeFromList.mission_title || '',
                };
                this._activeUserMissionId = activeFromList.id ?? null;
                this._activeMissionId = activeFromList.mission_id ?? null;
                const ami = activeFromList.mission || {};
                this._missionWaypoints = Array.isArray(ami.waypoints) ? ami.waypoints : [];
                this._missionCurrentWpIndex = 0;
            } else {
                this._activeMission = null;
                this._activeUserMissionId = null;
                this._activeMissionId = null;
                this._missionWaypoints = [];
                this._missionCurrentWpIndex = 0;
            }
        } catch (err) {
            console.warn('[FlightScene] Missions panel load error:', err);
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Connection error</div>';
        }
    }

    private _renderMissionsList(): void {
        const listEl = document.getElementById('missions-list');
        if (!listEl) return;
        const search = (document.getElementById('missions-search') as HTMLInputElement | null)?.value?.trim().toLowerCase() ?? '';
        const sortKey = (document.getElementById('missions-sort') as HTMLSelectElement | null)?.value ?? 'status';

        try {
            let visible = this._missionsCache.slice();
            if (search) {
                visible = visible.filter((um: any) => {
                    const title = (um.mission_title || um.mission?.title || '').toLowerCase();
                    const dep = (um.departure_icao || um.mission?.departure_icao || '').toLowerCase();
                    const arr = (um.arrival_icao || um.mission?.arrival_icao || '').toLowerCase();
                    const type = (um.mission_type || um.mission?.type || '').toLowerCase();
                    return title.includes(search) || dep.includes(search) || arr.includes(search) || type.includes(search);
                });
            }
            visible.sort((a: any, b: any) => {
                if (sortKey === 'title') {
                    return (a.mission_title || a.mission?.title || '').localeCompare(b.mission_title || b.mission?.title || '');
                }
                if (sortKey === 'difficulty') {
                    return Number(a.mission_difficulty ?? a.mission?.difficulty ?? 0) - Number(b.mission_difficulty ?? b.mission?.difficulty ?? 0);
                }
                if (sortKey === 'distance') {
                    return Number(a.mission_distance_nm ?? a.mission?.distance_nm ?? 0) - Number(b.mission_distance_nm ?? b.mission?.distance_nm ?? 0);
                }
                const aInProg = a?.status === 'in_progress' ? 0 : 1;
                const bInProg = b?.status === 'in_progress' ? 0 : 1;
                if (aInProg !== bInProg) return aInProg - bInProg;
                return 0;
            });

            if (!visible.length) {
                listEl.innerHTML = `<div style="color:rgba(255,255,255,.4)">${search ? 'Nenhuma miss\u00e3o encontrada' : 'No missions acquired'}</div>`;
                return;
            }

            let html = '';
            for (const um of visible) {
                const mid = Number(um?.mission_id);
                if (!Number.isFinite(mid) || mid <= 0) continue;
                const mi = um.mission || {};
                const isInProgress = um.status === 'in_progress';
                const borderColor = isInProgress ? 'rgba(80,255,160,.5)' : 'rgba(255,200,80,.35)';
                const mType = um.mission_type || mi.type || '';
                const depIcao = um.departure_icao || mi.departure_icao || '';
                const arrIcao = um.arrival_icao || mi.arrival_icao || '';
                const depName = um.departure_airport_name || mi.departure_airport_name || '';
                const arrName = um.arrival_airport_name || mi.arrival_airport_name || '';
                const isRoute = depIcao && arrIcao;
                let routeHtml = '';
                if (isRoute) {
                    routeHtml = `<div style="font-size:10px;color:rgba(255,255,255,.5)">${depIcao} <span style="color:#40ffaa">\u2708</span> ${arrIcao}</div>
                        <div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:2px">${depName} \u2192 ${arrName}</div>`;
                } else if (mType === 'discovery') {
                    routeHtml = `<div style="font-size:10px;color:rgba(255,255,255,.5)"><span style="color:#40ffaa">\u2708</span> Discovery Flight</div>`;
                } else {
                    routeHtml = `<div style="font-size:10px;color:rgba(255,255,255,.5)">${mType || 'Free Flight'}</div>`;
                }

                let actionHtml = '';
                if (isInProgress) {
                    actionHtml = `<div style="font-size:9px;color:#40ffaa;letter-spacing:.08em;margin-top:6px">IN PROGRESS</div>`;
                } else {
                    const umId = Number(um?.id);
                    if (!Number.isFinite(umId) || umId <= 0) {
                        console.warn(`[FlightScene] Skipping START button for mission ${mid}: invalid user-mission id`);
                        actionHtml = `<div style="font-size:9px;color:#ff8080;letter-spacing:.08em;margin-top:6px">INICIADA (ID INVÁLIDO)</div>`;
                    } else {
                        actionHtml = `<div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                            <span style="font-size:9px;color:#ffcc55;letter-spacing:.08em">INICIADA</span>
                            <button class="mission-start-btn" data-mission-id="${mid}" data-user-mission-id="${umId}" style="padding:4px 10px;background:rgba(0,80,40,.6);border:1px solid rgba(80,255,160,.5);border-radius:4px;color:#40ffaa;font-size:10px;font-family:'Orbitron',monospace;letter-spacing:.08em;cursor:pointer;pointer-events:auto">INICIAR JOGO</button>
                        </div>`;
                    }
                }

                html += `<div style="border:1px solid ${borderColor};border-radius:6px;padding:8px;margin-bottom:6px;background:rgba(0,20,15,.4)">
                    <div style="font-weight:600;color:#fff;margin-bottom:4px">${um.mission_title || mi.title || 'Mission'}</div>
                    ${routeHtml}
                    ${actionHtml}
                </div>`;
            }
            listEl.innerHTML = html;

            const startButtons = listEl.querySelectorAll<HTMLButtonElement>('.mission-start-btn');
            startButtons.forEach((btn) => {
                btn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const target = ev.currentTarget as HTMLButtonElement;
                    const mid = target.dataset.missionId;
                    const umIdStr = target.dataset.userMissionId;
                    if (!mid) {
                        console.warn('[FlightScene] Mission START button clicked without mission id');
                        return;
                    }
                    const startMissionId = Number(mid);
                    if (!Number.isFinite(startMissionId) || startMissionId <= 0) {
                        console.warn(`[FlightScene] Invalid mission id on START button: ${mid}`);
                        return;
                    }
                    const startUserMissionId = Number(umIdStr);
                    if (!Number.isFinite(startUserMissionId) || startUserMissionId <= 0) {
                        console.warn(`[FlightScene] Invalid user-mission id on START button: ${umIdStr}`);
                        return;
                    }
                    target.disabled = true;
                    target.textContent = 'CARREGANDO...';
                    const tk = localStorage.getItem('auth_token') || '';
                    if (!tk) {
                        console.warn('[FlightScene] Cannot promote mission: no auth token');
                        target.disabled = false;
                        target.textContent = 'INICIAR JOGO';
                        return;
                    }
                    try {
                        const promoteRes = await fetch(`/api/user-missions/${startUserMissionId}/start`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${tk}` },
                        });
                        if (!promoteRes.ok && promoteRes.status !== 409) {
                            console.warn(`[FlightScene] Failed to start user-mission ${startUserMissionId}: HTTP ${promoteRes.status}`);
                            target.disabled = false;
                            target.textContent = 'INICIAR JOGO';
                            return;
                        }
                        if (promoteRes.status === 409) {
                            console.log(`[FlightScene] user-mission ${startUserMissionId} already in_progress (409 idempotent), launching mission ${startMissionId}`);
                        } else {
                            console.log(`[FlightScene] Started user-mission ${startUserMissionId} (in_progress), launching mission ${startMissionId}`);
                        }
                    } catch (err) {
                        console.warn(`[FlightScene] Start user-mission ${startUserMissionId} error:`, err);
                        target.disabled = false;
                        target.textContent = 'INICIAR JOGO';
                        return;
                    }
                    window.location.href = `flight.html?mission_id=${encodeURIComponent(String(startMissionId))}`;
                });
            });
        } catch (err) {
            console.warn('[FlightScene] Render missions list error:', err);
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Render error</div>';
        }
    }

    // ── Flight Plans Button ────────────────────────────────────────────────────

    private _setupFlightPlansBtn(): void {
        if (!this._flightPlansBtnEl || !this._flightPlansPanelEl) return;
        const btn = this._flightPlansBtnEl;
        const panel = this._flightPlansPanelEl;

        btn.addEventListener('mouseenter', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.7)'; btn.style.boxShadow = '0 0 8px rgba(0,255,128,.2)'; } });
        btn.addEventListener('mouseleave', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none'; } });

        btn.addEventListener('click', () => {
            const visible = panel.style.display !== 'none';
            this._closeAllPanels(visible ? null : panel);
            if (visible) {
                panel.style.display = 'none';
                btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none';
            } else {
                panel.style.display = 'block';
                btn.style.borderColor = 'rgba(80,255,160,.9)'; btn.style.boxShadow = '0 0 12px rgba(0,255,128,.35)';
                this._loadFlightPlans();
            }
        });
    }

    private async _loadFlightPlans(): Promise<void> {
        const listEl = document.getElementById('flight-plans-list');
        if (!listEl) return;
        listEl.textContent = 'Loading...';

        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Login required</div>';
            return;
        }

        try {
            const res = await fetch('/api/flight-plans', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Failed to load flight plans</div>';
                return;
            }
            const json = await res.json();
            const plans = json.data || [];

            if (!plans.length) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,.4)">No flight plans</div>';
                return;
            }

            let html = '';
            for (const p of plans) {
                const name = p.name || 'Unnamed plan';
                const depIcao = p.departure_icao || '???';
                const arrIcao = p.arrival_icao || '???';
                const depRwy = p.dep_rwy_ident ? ` RWY ${p.dep_rwy_ident}` : '';
                const arrRwy = p.arr_rwy_ident ? ` RWY ${p.arr_rwy_ident}` : '';
                const scheduled = p.scheduled_departure_at ? new Date(p.scheduled_departure_at).toLocaleString() : '';
                html += `<div style="border:1px solid rgba(80,255,160,.25);border-radius:6px;padding:8px;margin-bottom:6px;background:rgba(0,20,15,.4)">
                    <div style="font-weight:600;color:#fff;margin-bottom:4px">${name}</div>
                    <div style="font-size:10px;color:rgba(255,255,255,.6)">
                        ${depIcao}${depRwy} <span style="color:#40ffaa">\u2708</span> ${arrIcao}${arrRwy}
                    </div>
                    <div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:2px">${p.departure_airport_name || ''} \u2192 ${p.arrival_airport_name || ''}</div>
                    ${scheduled ? `<div style="font-size:9px;color:rgba(255,200,0,.6);margin-top:3px">\u{1F552} ${scheduled}</div>` : ''}
                    <button data-start-plan="${p.id}" style="margin-top:6px;background:rgba(0,255,128,.15);border:1px solid rgba(80,255,160,.4);color:#40ffaa;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:9px;font-family:inherit;letter-spacing:.06em">START</button>
                </div>`;
            }
            listEl.innerHTML = html;

            listEl.querySelectorAll('[data-start-plan]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    const planId = (e.currentTarget as HTMLElement).getAttribute('data-start-plan');
                    if (planId) {
                        window.location.search = `?flightPlanId=${planId}`;
                    }
                });
            });
        } catch (err) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Connection error</div>';
        }
    }

    private async _patchFlightPlanStatus(planId: number, status: string): Promise<void> {
        const token = localStorage.getItem('auth_token') || '';
        if (!token) return;
        try {
            const res = await fetch(`/api/flight-plans/${planId}/status`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) console.warn(`[FlightPlan] PATCH status=${status} failed: ${res.status}`);
            else console.log(`[FlightPlan] Plan ${planId} status -> ${status}`);
        } catch (err) {
            console.error('[FlightPlan] PATCH status error:', err);
        }
    }

    // ── Aircraft Button ──────────────────────────────────────────────────────────

    private _setupAircraftBtn(): void {
        if (!this._aircraftBtnEl || !this._aircraftPanelEl) return;
        const btn = this._aircraftBtnEl;
        const panel = this._aircraftPanelEl;

        btn.addEventListener('mouseenter', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.7)'; btn.style.boxShadow = '0 0 8px rgba(0,255,128,.2)'; } });
        btn.addEventListener('mouseleave', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none'; } });

        btn.addEventListener('click', () => {
            const visible = panel.style.display !== 'none';
            this._closeAllPanels(visible ? null : panel);
            if (visible) {
                panel.style.display = 'none';
                btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none';
            } else {
                panel.style.display = 'block';
                btn.style.borderColor = 'rgba(80,255,160,.9)'; btn.style.boxShadow = '0 0 12px rgba(0,255,128,.35)';
                this._loadAircraftList();
            }
        });
    }

    private async _loadAircraftList(): Promise<void> {
        const listEl = document.getElementById('aircraft-list');
        if (!listEl) return;
        listEl.textContent = 'Loading...';

        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Login required</div>';
            return;
        }

        try {
            const [ownedRes, allRes] = await Promise.all([
                fetch('/api/user-aircrafts', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/aircrafts'),
            ]);

            const ownedData = ownedRes.ok ? await ownedRes.json() : { data: [] };
            const allData = allRes.ok ? await allRes.json() : { data: [] };

            const ownedIds = new Set((ownedData.data || []).map((ua: any) => ua.aircraft_id));
            const selectedId = (ownedData.data || []).find((ua: any) => ua.is_selected === 1)?.aircraft_id;
            const aircrafts: any[] = allData.data || [];

            if (!aircrafts.length) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,.4)">No aircraft available</div>';
                return;
            }

            const categories = ['LIGHT', 'TURBOPROP', 'JET', 'HEAVY JET', 'MILITARY'];
            let html = '';
            for (const ac of aircrafts) {
                const owned = ownedIds.has(ac.id);
                const selected = ac.id === selectedId;
                const borderColor = selected ? 'rgba(80,255,160,.6)' : owned ? 'rgba(80,255,160,.25)' : 'rgba(255,255,255,.1)';
                const bg = selected ? 'rgba(0,40,30,.6)' : 'rgba(0,20,15,.4)';
                const catLabel = categories[ac.category] || 'UNKNOWN';
                const priceLabel = ac.price > 0 ? `$${ac.price}` : 'FREE';
                const actionBtn = selected
                    ? '<span style="color:#40ffaa;font-size:9px;letter-spacing:.1em">SELECTED</span>'
                    : owned
                        ? `<button data-select-aircraft="${ac.id}" style="background:rgba(0,255,128,.15);border:1px solid rgba(80,255,160,.4);color:#40ffaa;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:9px;font-family:inherit">SELECT</button>`
                        : `<button data-acquire-aircraft="${ac.id}" style="background:rgba(255,200,0,.15);border:1px solid rgba(255,200,0,.4);color:#ffcc00;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:9px;font-family:inherit">${priceLabel}</button>`;

                html += `<div style="border:1px solid ${borderColor};border-radius:6px;padding:8px;margin-bottom:6px;background:${bg};display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="font-weight:600;color:#fff;margin-bottom:2px">${ac.name}</div>
                        <div style="font-size:9px;color:rgba(100,240,180,.5);letter-spacing:.08em">${catLabel}</div>
                    </div>
                    <div>${actionBtn}</div>
                </div>`;
            }
            listEl.innerHTML = html;

            listEl.querySelectorAll('[data-select-aircraft]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    const aircraftId = Number((e.currentTarget as HTMLElement).getAttribute('data-select-aircraft'));
                    this._switchAircraft(aircraftId);
                });
            });

            listEl.querySelectorAll('[data-acquire-aircraft]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        window.open('https://simflightpro.com/aircrafts', '_blank', 'noopener,noreferrer');
                    } catch (err) {
                        console.error('[Aircraft] Failed to open store URL', err);
                    }
                });
            });
        } catch (err) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Connection error</div>';
        }
    }

    private async _switchAircraft(aircraftId: number): Promise<void> {
        const token = localStorage.getItem('auth_token') || '';
        if (!token) return;

        try {
            const selectResp = await fetch(`/api/user-aircrafts/${aircraftId}/select`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            if (!selectResp.ok) {
                console.error('[Aircraft] Select failed');
                return;
            }

            const cfg = await fetchAircraftConfig(aircraftId);
            this._applyAircraftConfig(cfg);
            this._initSurfaces();

            this._loadedModelMeshes.forEach((m) => m.dispose());
            this._loadedModelMeshes = [];
            this._loadedAnimGroups.forEach((g) => g.dispose());
            this._loadedAnimGroups = [];
            this._propellerAnimGroup = null;
            this._gearUpAnimGroup = null;
            this._gearDownAnimGroup = null;
            const pivot = this.planeRoot.getChildTransformNodes(true).find((n) => n.name === 'modelPivot');
            if (pivot) pivot.dispose();

            this._loadAircraftModel(this.scene);
            this._spawnPlane(true);

            if (this._aircraftPanelEl) this._aircraftPanelEl.style.display = 'none';
            console.log(`[Aircraft] Switched to: ${cfg.name} (${cfg.code}) — reset to airport ground`);
            this._loadAircraftList();
        } catch (err) {
            console.error('[Aircraft] Switch error:', err);
        }
    }

    // ── Debug Panel ───────────────────────────────────────────────────────────

    private _buildDebugPanel(): void {
        const panel = document.createElement('div');
        panel.id = 'dbg-panel';
        panel.innerHTML = `
<style>
#dbg-panel{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:200;
  font-family:'Inter',monospace;color:#7df9c8;pointer-events:auto;
  background:linear-gradient(135deg,rgba(0,20,15,.82),rgba(0,30,20,.65));
  border:1px solid rgba(80,255,160,.25);border-radius:10px;padding:10px 16px;
  backdrop-filter:blur(12px);box-shadow:0 0 24px rgba(0,255,128,.08);
  display:flex;gap:20px;font-size:10px;max-width:95vw;overflow-x:auto;}
#dbg-panel.hidden{display:none}
.dbg-section{display:flex;flex-direction:column;gap:3px;min-width:200px}
.dbg-title{font-family:'Orbitron',monospace;font-size:9px;letter-spacing:.15em;color:rgba(100,240,180,.6);border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:3px;margin-bottom:2px}
.dbg-row{display:flex;justify-content:space-between;gap:8px}
.dbg-lbl{color:rgba(200,255,230,.5);white-space:nowrap}
.dbg-val{color:#40ffaa;font-family:monospace;text-align:right;white-space:nowrap}
.dbg-ctrl{display:flex;flex-direction:column;gap:4px;min-width:180px}
.dbg-slider-row{display:flex;align-items:center;gap:6px}
.dbg-slider-row label{color:rgba(200,255,230,.5);font-size:9px;min-width:55px}
.dbg-slider-row input[type=range]{flex:1;height:4px;accent-color:#40ffaa;cursor:pointer}
.dbg-slider-row .dbg-sv{color:#40ffaa;font-family:monospace;font-size:9px;min-width:40px;text-align:right}
</style>
<div class="dbg-section">
  <div class="dbg-title">FLIGHT STATE</div>
  <div class="dbg-row"><span class="dbg-lbl">terrainY</span><span class="dbg-val" id="dbg-terrainY">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">groundLevel</span><span class="dbg-val" id="dbg-groundlvl">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">isOnGround</span><span class="dbg-val" id="dbg-onground">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">vert rate (m/s)</span><span class="dbg-val" id="dbg-vertrate">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">alt MSL (m)</span><span class="dbg-val" id="dbg-altmsl">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">lat / lon</span><span class="dbg-val" id="dbg-latlon">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">tiles</span><span class="dbg-val" id="dbg-tilesinfo">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">build</span><span class="dbg-val" id="dbg-buildver" style="color:#ffcc00">\u2014</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">POWERTRAIN</div>
  <div class="dbg-row"><span class="dbg-lbl">engine_type</span><span class="dbg-val" id="dbg-engtype">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">power / rpm</span><span class="dbg-val" id="dbg-engperf">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">fuel kg / %</span><span class="dbg-val" id="dbg-fueldbg">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">mixture</span><span class="dbg-val" id="dbg-mixture">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">magneto</span><span class="dbg-val" id="dbg-magneto">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">gear comp</span><span class="dbg-val" id="dbg-gearcomp">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">gear state</span><span class="dbg-val" id="dbg-gearstate">\u2014</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">AIRPLANE</div>
  <div class="dbg-row"><span class="dbg-lbl">POS (x,y,z)</span><span class="dbg-val" id="dbg-ppos">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">ROT (H,P,R)</span><span class="dbg-val" id="dbg-prot">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">VEL (km/h)</span><span class="dbg-val" id="dbg-pvel">\u2014</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">CAMERA</div>
  <div class="dbg-row"><span class="dbg-lbl">POS (x,y,z)</span><span class="dbg-val" id="dbg-cpos">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">\u03B1 / \u03B2 / R</span><span class="dbg-val" id="dbg-corbit">\u2014</span></div>
</div>
<div class="dbg-ctrl">
  <div class="dbg-title">CAMERA CTRL</div>
  <div class="dbg-slider-row"><label>Radius</label><input type="range" id="dbg-cr" min="10" max="500" value="65"><span class="dbg-sv" id="dbg-crv">65</span></div>
  <div class="dbg-slider-row"><label>Height \u03B2</label><input type="range" id="dbg-cb" min="0" max="314" value="150"><span class="dbg-sv" id="dbg-cbv">1.50</span></div>
</div>
<div class="dbg-ctrl">
  <div class="dbg-title">AIRPLANE CTRL</div>
  <div class="dbg-slider-row"><label>Heading</label><input type="range" id="dbg-ph" min="0" max="360" value="0"><span class="dbg-sv" id="dbg-phv">0\u00B0</span></div>
  <div class="dbg-slider-row"><label>Pitch</label><input type="range" id="dbg-pp" min="-180" max="180" value="0"><span class="dbg-sv" id="dbg-ppv">0\u00B0</span></div>
  <div class="dbg-slider-row"><label>Roll</label><input type="range" id="dbg-pr" min="-180" max="180" value="0"><span class="dbg-sv" id="dbg-prv">0\u00B0</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">MULTIPLAYER</div>
  <div class="dbg-row"><span class="dbg-lbl">Status</span><span class="dbg-val" id="dbg-mp-status">DISCONNECTED</span></div>
  <div class="dbg-row"><span class="dbg-lbl">Online</span><span class="dbg-val" id="dbg-mp-count">0</span></div>
  <div class="dbg-row"><span class="dbg-lbl">User ID</span><span class="dbg-val" id="dbg-mp-uid">\u2014</span></div>
</div>`;
        document.body.appendChild(panel);
        this.dbgPanel    = panel;
        this.dbgPlanePos = document.getElementById('dbg-ppos')!;
        this.dbgPlaneRot = document.getElementById('dbg-prot')!;
        this.dbgPlaneVel = document.getElementById('dbg-pvel')!;
        this.dbgCamPos   = document.getElementById('dbg-cpos')!;
        this.dbgCamOrbit = document.getElementById('dbg-corbit')!;
        this.dbgMpStatus = document.getElementById('dbg-mp-status')!;
        this.dbgMpCount  = document.getElementById('dbg-mp-count')!;
        this.dbgMpUserId = document.getElementById('dbg-mp-uid')!;
        this.dbgTerrainY  = document.getElementById('dbg-terrainY')!;
        this.dbgGroundLvl = document.getElementById('dbg-groundlvl')!;
        this.dbgOnGround  = document.getElementById('dbg-onground')!;
        this.dbgVertRate  = document.getElementById('dbg-vertrate')!;
        this.dbgAltMsl    = document.getElementById('dbg-altmsl')!;
        this.dbgLatLon    = document.getElementById('dbg-latlon')!;
        this.dbgTilesInfo = document.getElementById('dbg-tilesinfo')!;
        this.dbgEngineType = document.getElementById('dbg-engtype')!;
        this.dbgEnginePerf = document.getElementById('dbg-engperf')!;
        this.dbgFuelDbg    = document.getElementById('dbg-fueldbg')!;
        this.dbgMixture    = document.getElementById('dbg-mixture')!;
        this.dbgMagneto    = document.getElementById('dbg-magneto')!;
        this.dbgGearComp   = document.getElementById('dbg-gearcomp')!;
        this.dbgGearState  = document.getElementById('dbg-gearstate')!;

        const buildVerEl = document.getElementById('dbg-buildver');
        if (buildVerEl) buildVerEl.textContent = `v${BUILD_VERSION}`;

        panel.classList.add('hidden');

        if (!this._dbgKeydownHandler) {
            this._dbgKeydownHandler = (e: KeyboardEvent) => {
                if (this._disposed) return;
                if (e.shiftKey && e.code === 'KeyD') {
                    panel.classList.toggle('hidden');
                }
            };
            window.addEventListener('keydown', this._dbgKeydownHandler);
        }

        document.getElementById('dbg-cr')!.addEventListener('input', (e: any) => {
            const v = parseFloat(e.target.value);
            if (!Number.isFinite(v)) {
                console.warn('[Debug] dbg-cr ignored: non-finite value');
                return;
            }
            if (this.camera) this.camera.radius = v;
            document.getElementById('dbg-crv')!.textContent = String(v);
        });

        document.getElementById('dbg-cb')!.addEventListener('input', (e: any) => {
            const raw = parseFloat(e.target.value);
            if (!Number.isFinite(raw)) {
                console.warn('[Debug] dbg-cb ignored: non-finite value');
                return;
            }
            const v = raw / 100;
            if (this.camera) this.camera.beta = v;
            document.getElementById('dbg-cbv')!.textContent = v.toFixed(2);
        });

        const rotHandler = () => this._applyDebugRotation();

        document.getElementById('dbg-ph')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-phv')!.textContent = `${e.target.value}\u00B0`;
            rotHandler();
        });
        document.getElementById('dbg-pp')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-ppv')!.textContent = `${e.target.value}\u00B0`;
            rotHandler();
        });
        document.getElementById('dbg-pr')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-prv')!.textContent = `${e.target.value}\u00B0`;
            rotHandler();
        });
    }

    private _applyDebugRotation(): void {
        const hDeg = parseFloat((document.getElementById('dbg-ph') as HTMLInputElement).value);
        const pDeg = parseFloat((document.getElementById('dbg-pp') as HTMLInputElement).value);
        const rDeg = parseFloat((document.getElementById('dbg-pr') as HTMLInputElement).value);

        this.planeRoot.rotationQuaternion!.set(0, 0, 0, 1);

        const hq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 1, 0), (hDeg * Math.PI) / 180);
        const pq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1, 0, 0), (pDeg * Math.PI) / 180);
        const rq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 0, 1), (rDeg * Math.PI) / 180);

        this.planeRoot.rotationQuaternion = this.planeRoot.rotationQuaternion!
            .multiply(hq)
            .multiply(pq)
            .multiply(rq);

        this.angularVelocity.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
    }

    // ── GPS Minimap ─────────────────────────────────────────────────────────────

    private _getCurrentLatLon(): { lat: number; lon: number; hdg: number } {
        const pos = this.planeRoot.position;
        const metersPerDegLat = 111320;
        const cosLatClamped = Math.max(0.001, Math.abs(Math.cos(this.originLat * Math.PI / 180)));
        const metersPerDegLon = 111320 * cosLatClamped;
        const lat = this.originLat - pos.z / metersPerDegLat;
        const lon = this.originLon + pos.x / metersPerDegLon;

        const wm = this.planeRoot.getWorldMatrix();
        const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm);
        const hdg = ((Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI) + 360) % 360;
        return { lat, lon, hdg };
    }

    private _missionDestForNav(): typeof this._activeFlightPlanNav | null {
        const m = this._activeMission;
        if (!m || m.arrival_lat == null || m.arrival_lon == null) return null;
        return { departure_lat: m.departure_lat, departure_lon: m.departure_lon, arrival_lat: m.arrival_lat, arrival_lon: m.arrival_lon, departure_icao: m.departure_icao, arrival_icao: m.arrival_icao, name: m.mission_title };
    }

    private _formatEteMin(eteMin: number): string {
        if (!Number.isFinite(eteMin) || eteMin <= 0) return '--:--';
        if (eteMin > 999) return '>999';
        const h = Math.floor(eteMin / 60);
        const m = Math.floor(eteMin % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
        const s = Math.floor((eteMin - m) * 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    private _formatEtaUtc(simTimeMs: number, eteMin: number): string {
        if (!Number.isFinite(eteMin) || eteMin <= 0) return '--:--';
        const eta = new Date(simTimeMs + eteMin * 60000);
        const hh = String(eta.getUTCHours()).padStart(2, '0');
        const mm = String(eta.getUTCMinutes()).padStart(2, '0');
        return `${hh}:${mm}Z`;
    }

    private _setText(id: string, text: string): void {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    private _setHtml(id: string, html: string): void {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    private _setStyle(id: string, prop: string, value: string): void {
        const el = document.getElementById(id);
        if (el) (el.style as unknown as Record<string, string>)[prop] = value;
    }

    private _updateNavInfo(lat: number, lon: number): void {
        if (!this._navInfoEl) return;

        const nav = this._activeFlightPlanNav ?? this._missionDestForNav();
        if (!nav) {
            this._navInfoEl.style.display = 'none';
            return;
        }

        this._navInfoEl.style.display = 'block';

        const totalDistNm = this._haversineNm(lat, lon, nav.arrival_lat, nav.arrival_lon);
        const totalBrgDeg = this._initialBearingDeg(lat, lon, nav.arrival_lat, nav.arrival_lon);
        const magVarHere = this._magneticVariationDeg(lat, lon);
        const totalBrgMag = ((totalBrgDeg - magVarHere) + 360) % 360;
        if (this._navDestEl) this._navDestEl.textContent = nav.arrival_icao || '\u2014';
        if (this._navDistEl) this._navDistEl.textContent = `${Math.round(totalDistNm * 1.852)} km`;
        if (this._navBrgEl) this._navBrgEl.textContent = `${Math.round(totalBrgMag)}\u00B0M`;
        this._setText('nav-total-dist', `${totalDistNm.toFixed(1)} nm`);

        const gsKt = this.groundSpeed * 1.944;
        this._setText('nav-gs', `${Math.round(gsKt)} kt`);

        const altMslFt = this.planeRoot ? Math.max(0, (this.refAlt + this.planeRoot.position.y) * 3.28084) : 0;
        const wind = this._getWindAtAltitude(altMslFt);

        const trackDeg = this.groundSpeed > MIN_GS_FOR_ETE_MS && Number.isFinite(this.velocity.x) && Number.isFinite(this.velocity.z)
            ? ((Math.atan2(this.velocity.x, this.velocity.z) * 180 / Math.PI) + 360) % 360
            : totalBrgDeg;
        const windAngleRad = (wind.dirDeg - trackDeg) * Math.PI / 180;
        const headComp = -wind.speedKt * Math.cos(windAngleRad);
        const crossComp = wind.speedKt * Math.sin(windAngleRad);
        const headSign = headComp >= 0 ? 'H+' : 'H-';
        const crossSign = crossComp >= 0 ? 'X+' : 'X-';
        this._setText('nav-wind', `${String(Math.round(wind.dirDeg)).padStart(3, '0')}/${Math.round(wind.speedKt).toString().padStart(2, '0')} ${headSign}${Math.abs(headComp).toFixed(0)} ${crossSign}${Math.abs(crossComp).toFixed(0)}`);

        const wpts = this._missionWaypoints;
        const idx = this._missionCurrentWpIndex;
        const legBlock = document.getElementById('nav-leg-block');
        if (wpts.length > 0 && idx < wpts.length) {
            if (legBlock) legBlock.style.display = 'block';
            const wp = wpts[idx];
            const wpLat = Number(wp.latitude);
            const wpLon = Number(wp.longitude);
            const legDistNm = this._haversineNm(lat, lon, wpLat, wpLon);
            const legBrgDeg = this._initialBearingDeg(lat, lon, wpLat, wpLon);
            this._setText('nav-wpt-name', wp.name || `WP ${wp.order_index}`);
            this._setText('nav-leg-idx', `${idx + 1}/${wpts.length}`);
            this._setText('nav-leg-dist', `${legDistNm.toFixed(1)} nm`);
            const legBrgMag = ((legBrgDeg - magVarHere) + 360) % 360;
            this._setText('nav-leg-brg', `${Math.round(legBrgMag)}\u00B0M`);

            const wm = this.planeRoot ? this.planeRoot.getWorldMatrix() : null;
            const fwd = wm ? BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm) : null;
            const currentHdgDeg = fwd ? (((Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI) + 360) % 360) : 0;
            const delta = ((legBrgDeg - currentHdgDeg + 540) % 360) - 180;
            const absD = Math.abs(delta);
            const arrow = delta > 1 ? '\u25B6' : delta < -1 ? '\u25C0' : '\u25B2';
            const deltaColor = absD < HDG_DELTA_GREEN_DEG ? '#40ffaa' : absD < HDG_DELTA_AMBER_DEG ? '#ffcc55' : '#ff5566';
            this._setHtml('nav-hdg-delta', `<span style="color:${deltaColor}">${arrow} ${Math.round(absD)}\u00B0</span>`);

            let prevLat: number, prevLon: number;
            if (idx === 0) {
                prevLat = nav.departure_lat;
                prevLon = nav.departure_lon;
            } else {
                prevLat = Number(wpts[idx - 1].latitude);
                prevLon = Number(wpts[idx - 1].longitude);
            }
            const xteNm = this._computeXteNm(prevLat, prevLon, wpLat, wpLon, lat, lon);
            const xteSide = xteNm >= 0 ? 'R' : 'L';
            const xteAbs = Math.abs(xteNm);
            const xteColor = xteAbs < 0.2 ? '#40ffaa' : xteAbs < 0.5 ? '#ffcc55' : '#ff5566';
            this._setHtml('nav-xte-val', `<span style="color:${xteColor}">${xteAbs.toFixed(2)} nm ${xteSide}</span>`);
            const xteFrac = Math.max(-1, Math.min(1, xteNm / XTE_INDICATOR_MAX_NM));
            const xteLeftPct = 50 + xteFrac * 50;
            this._setStyle('nav-xte-bar-dot', 'left', `${xteLeftPct}%`);

            if (wp.altitude_ft != null) {
                const tgtAlt = Number(wp.altitude_ft);
                this._setText('nav-tgt-alt', `${tgtAlt} ft`);
                const altDelta = altMslFt - tgtAlt;
                const altAbs = Math.abs(altDelta);
                const altColor = altAbs < ALT_BAND_GREEN_FT ? '#40ffaa' : altAbs < ALT_BAND_AMBER_FT ? '#ffcc55' : '#ff5566';
                this._setStyle('nav-alt-band-wrap', 'display', 'block');
                const altFrac = Math.max(-1, Math.min(1, altDelta / ALT_BAND_AMBER_FT));
                const altLeftPct = 50 + altFrac * 50;
                this._setStyle('nav-alt-band-dot', 'left', `${altLeftPct}%`);
                this._setStyle('nav-alt-band-dot', 'background', altColor);
            } else {
                this._setText('nav-tgt-alt', '\u2014');
                this._setStyle('nav-alt-band-wrap', 'display', 'none');
            }

            if (this.groundSpeed > MIN_GS_FOR_ETE_MS) {
                const eteMin = (legDistNm / gsKt) * 60;
                this._setText('nav-ete', this._formatEteMin(eteMin));
                const simTimeMs = Date.now() + (this._simTimeOffsetMs || 0);
                this._setText('nav-eta', this._formatEtaUtc(simTimeMs, eteMin));
            } else {
                this._setText('nav-ete', '--:--');
                this._setText('nav-eta', '--:--');
            }
        } else {
            if (legBlock) legBlock.style.display = 'none';
        }
    }

    private _haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R_NM = 3440.065;
        const toRad = Math.PI / 180;
        const dLat = (lat2 - lat1) * toRad;
        const dLon = (lon2 - lon1) * toRad;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
        return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    private _initialBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const toRad = Math.PI / 180;
        const phi1 = lat1 * toRad, phi2 = lat2 * toRad;
        const dLon = (lon2 - lon1) * toRad;
        const y = Math.sin(dLon) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
        return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
    }

    private _getWindAtAltitude(altFt: number): { speedKt: number; dirDeg: number } {
        const altSafe = Number.isFinite(altFt) && altFt > 0 ? altFt : 0;
        const altGain = (altSafe / 1000) * WIND_ALTITUDE_GAIN_KT_PER_1000FT;
        const speed = Math.min(WIND_MAX_SPEED_KT, WIND_DEFAULT_SPEED_KT + altGain);
        return { speedKt: speed, dirDeg: WIND_DEFAULT_DIRECTION_DEG };
    }

    private _getWindVectorWorldRef(altMslFt: number, out: BABYLON.Vector3): void {
        const wind = this._getWindAtAltitude(altMslFt);
        if (Number.isFinite(wind.speedKt) && wind.speedKt > 0) {
            const speedMs = wind.speedKt * KT_TO_MS;
            const dirRad = (wind.dirDeg * Math.PI) / 180;
            out.set(-Math.sin(dirRad) * speedMs, 0, -Math.cos(dirRad) * speedMs);
        } else {
            out.set(0, 0, 0);
        }
        out.x += this._turbVec.x;
        out.y += this._turbVec.y;
        out.z += this._turbVec.z;
    }

    private _updateTurbulence(dt: number, aglM: number): void {
        const safeAgl = Number.isFinite(aglM) && aglM > 0 ? aglM : 0;
        let intensity: number;
        if (safeAgl >= TURB_FADE_AGL_M) {
            intensity = 0;
        } else if (safeAgl <= TURB_FULL_AGL_M) {
            intensity = 1.0;
        } else {
            intensity = 1.0 - (safeAgl - TURB_FULL_AGL_M) / (TURB_FADE_AGL_M - TURB_FULL_AGL_M);
        }
        const targetMag = TURB_MAX_GUST_MS * intensity;
        const stepDt = Number.isFinite(dt) && dt > 0 ? Math.min(0.2, dt) : 0.016;
        const alpha = Math.max(0, Math.min(1, stepDt / TURB_TAU_S));
        const r1 = (Math.random() + Math.random() + Math.random() - 1.5) * 0.67;
        const r2 = (Math.random() + Math.random() + Math.random() - 1.5) * 0.67;
        const r3 = (Math.random() + Math.random() + Math.random() - 1.5) * 0.67;
        this._turbVec.x += (r1 * targetMag - this._turbVec.x) * alpha;
        this._turbVec.y += (r2 * targetMag * 0.5 - this._turbVec.y) * alpha;
        this._turbVec.z += (r3 * targetMag - this._turbVec.z) * alpha;
        this._turbTime += stepDt;
    }

    private _computeXteNm(prevLat: number, prevLon: number, nextLat: number, nextLon: number, curLat: number, curLon: number): number {
        const R_NM = 3440.065;
        const toRad = Math.PI / 180;
        const d13 = this._haversineNm(prevLat, prevLon, curLat, curLon) / R_NM;
        if (d13 < 1e-9) return 0;
        const theta13 = this._initialBearingDeg(prevLat, prevLon, curLat, curLon) * toRad;
        const theta12 = this._initialBearingDeg(prevLat, prevLon, nextLat, nextLon) * toRad;
        const xte = Math.asin(Math.sin(d13) * Math.sin(theta13 - theta12)) * R_NM;
        return xte;
    }

    private _setCameraMode(mode: number): void {
        if (!this.camera || !this.planeRoot) return;
        const safeMode = ((mode % CAMERA_MODE_COUNT) + CAMERA_MODE_COUNT) % CAMERA_MODE_COUNT;
        this._cameraMode = safeMode;
        const target = this.planeRoot.position.clone();
        try {
            switch (safeMode) {
                case CAMERA_MODE_CHASE:
                    this.camera.beta = 1.50;
                    this.camera.radius = Math.max(CAMERA_RADIUS_MIN_M, Math.min(CAMERA_RADIUS_MAX_M, this.camera.radius || 35));
                    this.camera.target.copyFrom(target);
                    break;
                case CAMERA_MODE_COCKPIT:
                    this.camera.beta = Math.PI / 2;
                    this.camera.radius = 0.5;
                    this.camera.target.copyFrom(target);
                    break;
                case CAMERA_MODE_EXTERNAL_FIXED:
                    this.camera.beta = 1.20;
                    this.camera.radius = 50;
                    break;
                case CAMERA_MODE_FLYBY:
                    this.camera.beta = 1.40;
                    this.camera.radius = 80;
                    break;
                case CAMERA_MODE_TOWER:
                    this.camera.beta = TOWER_CAMERA_BETA_RAD;
                    this.camera.radius = TOWER_CAMERA_MIN_RADIUS_M;
                    this._captureTowerCameraPosition();
                    break;
            }
            if (safeMode !== CAMERA_MODE_TOWER) this._towerCameraSet = false;
            console.log(`[Camera] Mode changed to ${safeMode}`);
        } catch (err) {
            console.warn('[Camera] Failed to set mode:', err);
        }
    }

    private _cycleCameraMode(): void {
        const now = performance.now();
        if (now - this._lastCameraCycleMs < CAMERA_CYCLE_COOLDOWN_MS) return;
        this._lastCameraCycleMs = now;
        this._setCameraMode((this._cameraMode + 1) % CAMERA_MODE_COUNT);
    }

    private static readonly CONTROL_SETTINGS_STORAGE_KEY = 'flight_controls_v1';

    private _loadControlSettings(): void {
        try {
            const raw = localStorage.getItem(FlightSceneSimple.CONTROL_SETTINGS_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            if (Number.isFinite(parsed.radius)) {
                this._controlSettings.radius = Math.max(JOYSTICK_MIN_RADIUS_PX, Math.min(JOYSTICK_MAX_RADIUS_PX, Number(parsed.radius)));
            }
            if (Number.isFinite(parsed.deadzone)) {
                this._controlSettings.deadzone = Math.max(0, Math.min(JOYSTICK_MAX_DEADZONE_NORM, Number(parsed.deadzone)));
            }
            if (Number.isFinite(parsed.expo)) {
                this._controlSettings.expo = Math.max(JOYSTICK_MIN_EXPO, Math.min(JOYSTICK_MAX_EXPO, Number(parsed.expo)));
            }
            if (typeof parsed.pitchInvert === 'boolean') {
                this._controlSettings.pitchInvert = parsed.pitchInvert;
            }
            console.log('[Controls] Loaded settings:', this._controlSettings);
        } catch (err) {
            console.warn('[Controls] Failed to load settings:', err);
        }
    }

    private _persistControlSettings(): void {
        try {
            localStorage.setItem(FlightSceneSimple.CONTROL_SETTINGS_STORAGE_KEY, JSON.stringify(this._controlSettings));
        } catch (err) {
            console.warn('[Controls] Failed to persist settings:', err);
        }
    }

    private _doHaptic(pattern: number | number[]): void {
        if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
        if (!this._userGestureSeen) {
            this._installUserGestureListener();
            return;
        }
        const now = performance.now();
        if (now - this._lastHapticMs < HAPTIC_MIN_INTERVAL_MS) return;
        this._lastHapticMs = now;
        try {
            (navigator as Navigator).vibrate(pattern);
        } catch (err) {
            console.warn('[Haptic] vibrate failed:', err);
        }
    }

    private _installUserGestureListener(): void {
        if (this._userGestureSeen || this._userGestureListener) return;
        const events: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
        const listener = () => {
            this._userGestureSeen = true;
            this._removeUserGestureListener();
            console.debug('[Haptic] User gesture detected; haptics enabled');
        };
        this._userGestureListener = listener;
        for (const ev of events) {
            try {
                document.addEventListener(ev, listener, { once: false, capture: true, passive: true });
            } catch (err) {
                console.warn('[Haptic] addEventListener failed for', ev, err);
            }
        }
    }

    private _removeUserGestureListener(): void {
        const listener = this._userGestureListener;
        if (!listener) return;
        const events: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
        for (const ev of events) {
            try { document.removeEventListener(ev, listener, true); } catch (_) { /* ignore */ }
        }
        this._userGestureListener = null;
    }

    private _safeSetTimeout(cb: () => void, ms: number): number {
        if (this._disposed) return 0;
        const id = window.setTimeout(() => {
            this._pendingTimeouts.delete(id);
            if (this._disposed) return;
            try {
                cb();
            } catch (err) {
                console.warn('[Timer] Scheduled callback failed:', err);
            }
        }, ms);
        this._pendingTimeouts.add(id);
        return id;
    }

    private _clearAllPendingTimeouts(): void {
        for (const id of this._pendingTimeouts) {
            try { window.clearTimeout(id); } catch (_) { /* ignore */ }
        }
        this._pendingTimeouts.clear();
    }

    private static readonly GPS_POS_STORAGE_KEY = 'gps-map-pos-v1';
    private static readonly GPS_DRAG_VIEWPORT_MARGIN_PX = 4;

    private _persistGpsState(gps: HTMLElement): void {
        try {
            const rect = gps.getBoundingClientRect();
            localStorage.setItem(FlightSceneSimple.GPS_POS_STORAGE_KEY, JSON.stringify({
                left: Math.round(rect.left),
                top: Math.round(rect.top),
                zoom: this._mapZoom,
                headingUp: this._mapHeadingUp,
            }));
        } catch (err) {
            console.warn('[GPS] Failed to save state:', err);
        }
    }

    private _updateZoomIndicator(): void {
        const valEl = document.getElementById('gps-zoom-val');
        if (valEl) valEl.textContent = String(this._mapZoom);
        const inBtn = document.getElementById('gps-zoom-in') as HTMLButtonElement | null;
        const outBtn = document.getElementById('gps-zoom-out') as HTMLButtonElement | null;
        if (inBtn) inBtn.disabled = this._mapZoom >= FlightSceneSimple.MAP_ZOOM_MAX;
        if (outBtn) outBtn.disabled = this._mapZoom <= FlightSceneSimple.MAP_ZOOM_MIN;
        if (inBtn) inBtn.style.opacity = inBtn.disabled ? '0.4' : '1';
        if (outBtn) outBtn.style.opacity = outBtn.disabled ? '0.4' : '1';
    }

    private _updateMapModeIndicator(): void {
        const btn = document.getElementById('gps-mode-toggle') as HTMLButtonElement | null;
        if (!btn) return;
        btn.textContent = this._mapHeadingUp ? 'H' : 'N';
        btn.title = this._mapHeadingUp ? 'Modo: Heading-Up (clique para Norte)' : 'Modo: Norte-Up (clique para Heading)';
    }

    private _toggleMapHeadingUp(gps: HTMLElement): void {
        this._mapHeadingUp = !this._mapHeadingUp;
        console.log(`[GPS] Heading-up mode ${this._mapHeadingUp ? 'enabled' : 'disabled'}`);
        if (this.mapImg) this.mapImg.style.transform = 'translate(0px, 0px)';
        this._updateMapModeIndicator();
        this._persistGpsState(gps);
    }

    private _changeMapZoom(delta: number, gps: HTMLElement): void {
        const next = Math.min(FlightSceneSimple.MAP_ZOOM_MAX, Math.max(FlightSceneSimple.MAP_ZOOM_MIN, this._mapZoom + delta));
        if (next === this._mapZoom) return;
        this._mapZoom = next;
        this._mapImgValid = false;
        this._mapImgPending = false;
        this.mapLastUpdate = 0;
        if (this.mapImg) this.mapImg.style.transform = 'translate(0px, 0px)';
        console.log(`[GPS] Zoom set to ${this._mapZoom}`);
        this._updateZoomIndicator();
        this._persistGpsState(gps);
    }

    private _setupMinimapDrag(): void {
        const gps = document.getElementById('gps-map') as HTMLDivElement | null;
        const handle = document.getElementById('gps-map-handle') as HTMLDivElement | null;
        if (!gps || !handle) {
            console.warn('[GPS] _setupMinimapDrag: missing #gps-map or #gps-map-handle');
            return;
        }

        try {
            const saved = localStorage.getItem(FlightSceneSimple.GPS_POS_STORAGE_KEY);
            if (saved) {
                const pos = JSON.parse(saved) as { left?: number; top?: number; zoom?: number; headingUp?: boolean };
                if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
                    gps.style.left = `${this._clampGpsX(pos.left as number, gps)}px`;
                    gps.style.top = `${this._clampGpsY(pos.top as number, gps)}px`;
                }
                if (pos && Number.isFinite(pos.zoom)) {
                    const z = Number(pos.zoom);
                    this._mapZoom = Math.min(FlightSceneSimple.MAP_ZOOM_MAX, Math.max(FlightSceneSimple.MAP_ZOOM_MIN, z));
                }
            }
        } catch (err) {
            console.warn('[GPS] Failed to read saved state:', err);
        }

        const zoomInBtn = document.getElementById('gps-zoom-in') as HTMLButtonElement | null;
        const zoomOutBtn = document.getElementById('gps-zoom-out') as HTMLButtonElement | null;
        const modeBtn = document.getElementById('gps-mode-toggle') as HTMLButtonElement | null;
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this._changeMapZoom(+1, gps); });
            zoomInBtn.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this._changeMapZoom(-1, gps); });
            zoomOutBtn.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
        }
        if (modeBtn) {
            modeBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this._toggleMapHeadingUp(gps); });
            modeBtn.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
        }
        this._updateZoomIndicator();
        this._updateMapModeIndicator();

        let dragging = false;
        let pointerId = -1;
        let startClientX = 0;
        let startClientY = 0;
        let startLeft = 0;
        let startTop = 0;

        const onPointerDown = (ev: PointerEvent) => {
            if (dragging) return;
            if (ev.button !== undefined && ev.button !== 0) return;
            dragging = true;
            pointerId = ev.pointerId;
            const rect = gps.getBoundingClientRect();
            startClientX = ev.clientX;
            startClientY = ev.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            handle.style.cursor = 'grabbing';
            try { handle.setPointerCapture(pointerId); } catch { /* ignore */ }
            ev.preventDefault();
            ev.stopPropagation();
        };

        const onPointerMove = (ev: PointerEvent) => {
            if (!dragging || ev.pointerId !== pointerId) return;
            const dx = ev.clientX - startClientX;
            const dy = ev.clientY - startClientY;
            const newLeft = this._clampGpsX(startLeft + dx, gps);
            const newTop = this._clampGpsY(startTop + dy, gps);
            gps.style.left = `${newLeft}px`;
            gps.style.top = `${newTop}px`;
            ev.preventDefault();
        };

        const onPointerUp = (ev: PointerEvent) => {
            if (!dragging || ev.pointerId !== pointerId) return;
            dragging = false;
            handle.style.cursor = 'grab';
            try { handle.releasePointerCapture(pointerId); } catch { /* ignore */ }
            this._persistGpsState(gps);
            pointerId = -1;
        };

        handle.addEventListener('pointerdown', onPointerDown);
        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);
    }

    private _clampGpsX(x: number, gps: HTMLElement): number {
        const m = FlightSceneSimple.GPS_DRAG_VIEWPORT_MARGIN_PX;
        const w = gps.offsetWidth || 216;
        const max = Math.max(m, window.innerWidth - w - m);
        return Math.min(max, Math.max(m, x));
    }

    private _clampGpsY(y: number, gps: HTMLElement): number {
        const m = FlightSceneSimple.GPS_DRAG_VIEWPORT_MARGIN_PX;
        const h = gps.offsetHeight || 216;
        const max = Math.max(m, window.innerHeight - h - m);
        return Math.min(max, Math.max(m, y));
    }

    private _latLonToMapPx(lat: number, lon: number, refLat: number, refLon: number, mapPxSize: number): { x: number; y: number; pxPerDegLon: number; pxPerDegLat: number } {
        const onScreenPxPerDegLon = (256 * Math.pow(2, this._mapZoom) / 360)
            * (mapPxSize / FlightSceneSimple.MAP_REQUEST_SIZE_PX)
            * FlightSceneSimple.MAP_IMG_UPSCALE;
        const cosLat = Math.max(0.001, Math.cos(refLat * Math.PI / 180));
        const onScreenPxPerDegLat = onScreenPxPerDegLon / cosLat;
        const x = (lon - refLon) * onScreenPxPerDegLon;
        const y = -(lat - refLat) * onScreenPxPerDegLat;
        return { x, y, pxPerDegLon: onScreenPxPerDegLon, pxPerDegLat: onScreenPxPerDegLat };
    }

    private _ensureMapImgListeners(): void {
        if (this._mapImgListenersAttached || !this.mapImg) return;
        this._mapImgListenersAttached = true;
        try {
            this._mapImgLoadHandler = () => {
                if (this._disposed) return;
                if (!this._mapImgPending) return;
                this._mapImgLat = this._mapImgPendingLat;
                this._mapImgLon = this._mapImgPendingLon;
                this._mapImgValid = true;
                this._mapImgPending = false;
            };
            this._mapImgErrorHandler = (ev: Event) => {
                if (this._disposed) return;
                if (!this._mapImgPending) return;
                this._mapImgPending = false;
                this.mapLastUpdate = 0;
                console.warn('[GPS] Map tile load failed; will retry on next update', ev);
            };
            this.mapImg.addEventListener('load', this._mapImgLoadHandler);
            this.mapImg.addEventListener('error', this._mapImgErrorHandler);
        } catch (err) {
            console.warn('[GPS] Failed to attach map image listeners:', err);
        }
    }

    private _removeMapImgListeners(): void {
        try {
            if (this.mapImg && this._mapImgLoadHandler) {
                this.mapImg.removeEventListener('load', this._mapImgLoadHandler);
            }
            if (this.mapImg && this._mapImgErrorHandler) {
                this.mapImg.removeEventListener('error', this._mapImgErrorHandler);
            }
        } catch (err) {
            console.warn('[GPS] Failed to remove map image listeners:', err);
        }
        this._mapImgLoadHandler = null;
        this._mapImgErrorHandler = null;
        this._mapImgListenersAttached = false;
    }

    private _updateMap(): void {
        if (!this.mapImg) return;
        this._ensureMapImgListeners();
        const now = performance.now();
        const { lat, lon, hdg } = this._getCurrentLatLon();

        const cv = this.mapHeadingCanvas;
        const ctx = this._mapHdgCtx || (this._mapHdgCtx = cv.getContext('2d')!);
        if (!ctx) return;
        const cx = cv.width / 2;
        const cy = cv.height / 2;

        const hdgRad = (Number.isFinite(hdg) ? hdg : 0) * Math.PI / 180;
        const headingUp = this._mapHeadingUp;
        const cosH = headingUp ? Math.cos(hdgRad) : 1;
        const sinH = headingUp ? Math.sin(hdgRad) : 0;
        const rotXY = (px: number, py: number): { x: number; y: number } => headingUp
            ? { x: cx + cosH * px + sinH * py, y: cy + -sinH * px + cosH * py }
            : { x: cx + px, y: cy + py };

        let driftPx = 0;
        if (this._mapImgValid) {
            const drift = this._latLonToMapPx(lat, lon, this._mapImgLat, this._mapImgLon, cv.width);
            driftPx = Math.hypot(drift.x, drift.y);
        }
        const driftLimitPx = cv.width * FlightSceneSimple.MAP_REFETCH_DRIFT_RATIO;
        const timeSinceFetch = now - this.mapLastUpdate;
        const needFetch = !this._mapImgValid
            || driftPx > driftLimitPx
            || timeSinceFetch > FlightSceneSimple.MAP_REFETCH_INTERVAL_MS;

        if (this.mapApiKey && needFetch && !this._mapImgPending) {
            this.mapLastUpdate = now;
            this._mapImgPending = true;
            this._mapImgPendingLat = lat;
            this._mapImgPendingLon = lon;
            this.mapImg.src = `https://maps.googleapis.com/maps/api/staticmap?center=${lat.toFixed(5)},${lon.toFixed(5)}&zoom=${this._mapZoom}&size=${FlightSceneSimple.MAP_REQUEST_SIZE_PX}x${FlightSceneSimple.MAP_REQUEST_SIZE_PX}&scale=${FlightSceneSimple.MAP_REQUEST_SCALE}&maptype=satellite&key=${this.mapApiKey}`;
        }

        if (this._mapImgValid) {
            const drift = this._latLonToMapPx(lat, lon, this._mapImgLat, this._mapImgLon, cv.width);
            if (headingUp) {
                const rDx = cosH * drift.x + sinH * drift.y;
                const rDy = -sinH * drift.x + cosH * drift.y;
                this.mapImg.style.transform = `translate(${(-rDx).toFixed(2)}px, ${(-rDy).toFixed(2)}px) rotate(${(-hdg).toFixed(2)}deg)`;
            } else {
                this.mapImg.style.transform = `translate(${(-drift.x).toFixed(2)}px, ${(-drift.y).toFixed(2)}px)`;
            }
        }

        ctx.clearRect(0, 0, cv.width, cv.height);

        ctx.save();
        ctx.translate(cx, cy);
        if (!headingUp) ctx.rotate(hdg * Math.PI / 180);

        ctx.fillStyle = 'rgba(0,255,128,0.9)';
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(-2, -4);
        ctx.lineTo(-9, 2);
        ctx.lineTo(-9, 4);
        ctx.lineTo(-2, 1);
        ctx.lineTo(-2, 7);
        ctx.lineTo(-4, 9);
        ctx.lineTo(-4, 10);
        ctx.lineTo(0, 8.5);
        ctx.lineTo(4, 10);
        ctx.lineTo(4, 9);
        ctx.lineTo(2, 7);
        ctx.lineTo(2, 1);
        ctx.lineTo(9, 4);
        ctx.lineTo(9, 2);
        ctx.lineTo(2, -4);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(0,255,128,0.6)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.restore();

        if (this._activeMissionId != null && this._missionWaypoints.length > 0) {
            ctx.save();
            for (let i = 0; i < this._missionWaypoints.length; i++) {
                const wp = this._missionWaypoints[i];
                const wpLat = Number(wp.latitude);
                const wpLon = Number(wp.longitude);
                if (!Number.isFinite(wpLat) || !Number.isFinite(wpLon)) continue;
                const p = this._latLonToMapPx(wpLat, wpLon, lat, lon, cv.width);
                const wpScreen = rotXY(p.x, p.y);
                const wpX = wpScreen.x;
                const wpY = wpScreen.y;

                if (i < this._missionCurrentWpIndex) {
                    ctx.fillStyle = 'rgba(120,120,120,0.5)';
                    ctx.beginPath();
                    ctx.arc(wpX, wpY, 2, 0, Math.PI * 2);
                    ctx.fill();
                } else if (i === this._missionCurrentWpIndex) {
                    ctx.setLineDash([4, 3]);
                    ctx.strokeStyle = 'rgba(0,220,255,0.8)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(wpX, wpY);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.fillStyle = 'rgba(0,220,255,0.9)';
                    ctx.beginPath();
                    ctx.arc(wpX, wpY, 5, 0, Math.PI * 2);
                    ctx.fill();

                    const label = wp.name || `WP ${wp.order_index}`;
                    ctx.font = '7px Inter, sans-serif';
                    ctx.fillStyle = 'rgba(0,220,255,0.9)';
                    ctx.fillText(label, wpX + 7, wpY - 3);
                } else {
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.beginPath();
                    ctx.arc(wpX, wpY, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.restore();
        } else if (this._activeMission) {
            const m = this._activeMission;
            if (Number.isFinite(m.departure_lat) && Number.isFinite(m.departure_lon) && Number.isFinite(m.arrival_lat) && Number.isFinite(m.arrival_lon)) {
                const pDep = this._latLonToMapPx(m.departure_lat, m.departure_lon, lat, lon, cv.width);
                const pArr = this._latLonToMapPx(m.arrival_lat, m.arrival_lon, lat, lon, cv.width);
                const depScreen = rotXY(pDep.x, pDep.y);
                const arrScreen = rotXY(pArr.x, pArr.y);
                const depX = depScreen.x;
                const depY = depScreen.y;
                const arrX = arrScreen.x;
                const arrY = arrScreen.y;

                ctx.save();
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = 'rgba(255,200,0,0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(depX, depY);
                ctx.lineTo(arrX, arrY);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = 'rgba(0,200,255,0.9)';
                ctx.beginPath();
                ctx.arc(depX, depY, 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(255,80,80,0.9)';
                ctx.beginPath();
                ctx.arc(arrX, arrY, 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.font = '7px Inter, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillText(m.departure_icao, depX + 6, depY - 2);
                ctx.fillText(m.arrival_icao, arrX + 6, arrY - 2);
                ctx.restore();
            }
        }

        if (this._activeFlightPlanNav) {
            const fp = this._activeFlightPlanNav;
            if (Number.isFinite(fp.departure_lat) && Number.isFinite(fp.departure_lon) && Number.isFinite(fp.arrival_lat) && Number.isFinite(fp.arrival_lon)) {
                const pDep = this._latLonToMapPx(fp.departure_lat, fp.departure_lon, lat, lon, cv.width);
                const pArr = this._latLonToMapPx(fp.arrival_lat, fp.arrival_lon, lat, lon, cv.width);
                const fpDepScreen = rotXY(pDep.x, pDep.y);
                const fpArrScreen = rotXY(pArr.x, pArr.y);
                const fpDepX = fpDepScreen.x;
                const fpDepY = fpDepScreen.y;
                const fpArrX = fpArrScreen.x;
                const fpArrY = fpArrScreen.y;

                ctx.save();
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = 'rgba(80,255,160,0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(fpDepX, fpDepY);
                ctx.lineTo(fpArrX, fpArrY);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = 'rgba(0,200,255,0.9)';
                ctx.beginPath();
                ctx.arc(fpDepX, fpDepY, 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(255,80,80,0.9)';
                ctx.beginPath();
                ctx.arc(fpArrX, fpArrY, 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.font = '7px Inter, sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.fillText(fp.departure_icao, fpDepX + 6, fpDepY - 2);
                ctx.fillText(fp.arrival_icao, fpArrX + 6, fpArrY - 2);
                ctx.restore();
            }
        }

        this._updateNavInfo(lat, lon);

        const coordsEl = document.getElementById('gps-coords');
        if (coordsEl) coordsEl.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }

    // ── HUD Update ────────────────────────────────────────────────────────────

    private _updateHUD(): void {
        const now = this._getSimDate();
        const hh = String(now.getUTCHours()).padStart(2, '0');
        const mm = String(now.getUTCMinutes()).padStart(2, '0');
        const ss = String(now.getUTCSeconds()).padStart(2, '0');
        const dd = String(now.getUTCDate()).padStart(2, '0');
        const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
        this.hudUtc.textContent = `${dd}/${mo}/${now.getUTCFullYear()} ${hh}:${mm}:${ss} UTC`;

        const tasMs = Number.isFinite(this._lastTasMs) ? this._lastTasMs : this.velocity.length();
        const iasMs = Number.isFinite(this._lastIasMs) ? this._lastIasMs : tasMs;
        const gsMs  = Number.isFinite(this.groundSpeed) ? this.groundSpeed : 0;
        const speedKtsIas = Math.max(0, Math.round(iasMs * MS_TO_KT));
        const speedKtsTas = Math.max(0, Math.round(tasMs * MS_TO_KT));
        const speedKtsGs  = Math.max(0, Math.round(gsMs  * MS_TO_KT));
        const speedKts = speedKtsIas;
        const pos = this.planeRoot.position;
        const altitudeM = Math.round(Math.max(0, pos.y));
        const altitudeFt = Math.round(altitudeM * 3.28084);
        const pct = Math.round(this.thrust * 100);

        const altitudeMslFt = Math.round(Math.max(0, this.refAlt + pos.y) * 3.28084);
        const speedDisp = this._convertSpeedKts(speedKts);
        const altDisp = this._convertAltitudeFt(altitudeMslFt);
        this.hudSpeedVal.textContent = String(speedDisp.value);
        this.hudAltVal.textContent   = String(altDisp.value);
        if (this.hudSpeedVal.parentElement) {
            const u = this.hudSpeedVal.parentElement.querySelector('.hud-unit');
            if (u) u.textContent = speedDisp.unit;
        }
        if (this.hudAltVal.parentElement) {
            const u = this.hudAltVal.parentElement.querySelector('.hud-unit');
            if (u) u.textContent = altDisp.unit;
        }
        const barPct = Math.min(100, pct);
        this.hudThrottle.style.width = `${barPct}%`;
        if (this.hudThrPct) this.hudThrPct.textContent = `${pct}%`;
        if (this.hudEng1Pct) this.hudEng1Pct.textContent = `${pct}%`;
        if (this.hudEng2Pct) this.hudEng2Pct.textContent = `${pct}%`;
        if (this.hudAbTag) {
            this.hudAbTag.style.display = this.thrust > 1.0 ? '' : 'none';
        }

        const spdAbs = Math.max(0, Number.isFinite(speedKts) ? speedKts : 0);
        const spdHund = Math.floor(spdAbs / 100) % 10;
        const spdTen  = Math.floor(spdAbs / 10) % 10;
        const spdOne  = spdAbs % 10;
        if (this.hudSpdH) this.hudSpdH.textContent = spdAbs >= 100 ? String(spdHund) : '';
        if (this.hudSpdT) this.hudSpdT.textContent = spdAbs >= 10  ? String(spdTen)  : '0';
        if (this.hudSpdUInner) {
            const nextOne = (spdOne + 1) % 10;
            const inner = this.hudSpdUInner;
            if (inner.dataset.cur !== String(spdOne)) {
                inner.innerHTML = `<span>${spdOne}</span><span>${nextOne}</span>`;
                inner.dataset.cur = String(spdOne);
            }
        }

        const altAbs = Math.max(0, Number.isFinite(altitudeMslFt) ? altitudeMslFt : 0);
        const altDH    = Math.floor(altAbs / 10000) % 10;
        const altDT    = Math.floor(altAbs / 1000)  % 10;
        const altDU    = Math.floor(altAbs / 100)   % 10;
        const altDTens = Math.floor(altAbs / 10)    % 10;
        const altDOne  = altAbs % 10;
        if (this.hudAltH) this.hudAltH.textContent = altAbs >= 10000 ? String(altDH) : '';
        if (this.hudAltT) this.hudAltT.textContent = altAbs >= 1000  ? String(altDT) : '';
        if (this.hudAltU) this.hudAltU.textContent = String(altDU);
        if (this.hudAltTens) this.hudAltTens.textContent = String(altDTens);
        if (this.hudAltUnitsInner) {
            const nextOne = (altDOne + 1) % 10;
            const inner = this.hudAltUnitsInner;
            if (inner.dataset.cur !== String(altDOne)) {
                inner.innerHTML = `<span>${altDOne}</span><span>${nextOne}</span>`;
                inner.dataset.cur = String(altDOne);
            }
        }

        if (this.hudAltSel) {
            const presetFt = this._pendingMissionAltM != null && Number.isFinite(this._pendingMissionAltM)
                ? Math.max(0, Math.round((this._pendingMissionAltM as number) * 3.28084 / 100) * 100)
                : 5000;
            const presetText = String(presetFt);
            if (this.hudAltSel.textContent !== presetText) this.hudAltSel.textContent = presetText;
        }

        const flapDeg = this.FLAP_STEPS[this.flapIndex];
        this.hudFlapVal.textContent = flapDeg > 0 ? `${flapDeg}\u00B0` : 'OFF';
        this.hudBrakeVal.textContent = this.brakesOn ? 'ON' : 'OFF';
        this.hudBrakeVal.style.color = this.brakesOn ? '#ff4040' : '';

        if (this.hudGearRow) {
            this.hudGearRow.style.display = '';
            const gs = this.gearState;
            const label = gs === GEAR_STATE_DOWN ? 'DOWN'
                : gs === GEAR_STATE_UP ? 'UP'
                : gs === GEAR_STATE_RETRACTING ? 'RET...'
                : 'EXT...';
            const color = gs === GEAR_STATE_DOWN ? '#50ff80'
                : gs === GEAR_STATE_UP ? '#888'
                : '#ffcc00';
            this.hudGearState.textContent = label;
            this.hudGearState.style.color = color;
            if (this.isMobile) {
                const gearBtn = document.getElementById('touch-gear');
                if (gearBtn) {
                    const btnLabel = gs === GEAR_STATE_DOWN ? 'GR\u25BC'
                        : gs === GEAR_STATE_UP ? 'GR\u25B2'
                        : gs === GEAR_STATE_RETRACTING ? 'GR\u2191'
                        : 'GR\u2193';
                    if (gearBtn.textContent !== btnLabel) gearBtn.textContent = btnLabel;
                    const stateClass = (gs === GEAR_STATE_RETRACTING || gs === GEAR_STATE_EXTENDING)
                        ? 'transit'
                        : (gs === GEAR_STATE_UP ? 'up' : 'down');
                    if (!gearBtn.classList.contains(stateClass)) {
                        gearBtn.classList.remove('up', 'down', 'transit');
                        gearBtn.classList.add(stateClass);
                    }
                }
            }
        }

        const wm = this.planeRoot.getWorldMatrix();
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), wm, this._tmpFwd);
        this._tmpFwd.normalize();
        this._tmpUp.set(0, 1, 0);
        const pitchAngle = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(this._tmpFwd, this._tmpUp))));
        const pitchDeg = Math.round(pitchAngle * 180 / Math.PI);

        const groundY = this.tiles ? this.terrainY : GROUND_Y;
        const aglM = Math.max(0, pos.y - groundY);
        const isOnGround = aglM < ON_GROUND_AGL_M;

        this.hudAttitude.textContent =
            isOnGround         ? 'GROUND'   :
            pitchAngle > 0.08  ? 'CLIMB' :
            pitchAngle < -0.08 ? 'DESC'   : 'LEVEL';
        try {
            this._engineSound.setThrottle(this.thrust);
            this._engineSound.setRpm(this.engineRpm);
            this._engineSound.update();
        } catch (err) {
            // EngineSound errors should not break HUD
        }

        try {
            this._flightAudio.setAirspeed(speedKtsIas);
            this._flightAudio.update();
        } catch (_) { /* ignore */ }

        const stallAlpha = this.aircraftConfig.stall_alpha_rad;
        const aoaAbs = Math.abs(Number.isFinite(this._lastAoaRad) ? this._lastAoaRad : 0);
        const stallByAoa = Number.isFinite(stallAlpha) && stallAlpha > 0
            && aoaAbs > STALL_AOA_WARNING_FRACTION * stallAlpha;
        const stallByIas = speedKtsIas < this.aircraftConfig.stall_speed_kts;
        const stallActive = this._spawnSnapFramesLeft <= 0
            && aglM > STALL_WARNING_MIN_AGL_M
            && (stallByIas || stallByAoa);

        let currentMach = 0;
        try {
            const altForMach = Math.max(0, pos.y);
            const tempK = altForMach > ISA_TROPOPAUSE_M
                ? ISA_TROPOPAUSE_TEMP_K
                : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * altForMach;
            const speedOfSound = Math.sqrt(SPECIFIC_HEAT_RATIO_AIR * GAS_CONSTANT_AIR_J_PER_KG_K * tempK);
            currentMach = speedOfSound > 0 ? tasMs / speedOfSound : 0;
            this._lastMach = currentMach;
        } catch (err) {
            console.warn('[Physics] Mach computation failed:', err);
        }

        this._updateOverspeed(speedKtsIas, currentMach);
        const aglFtForGpws = aglM * 3.28084;
        const vsFpmForGpws = Math.round(this.velocity.y * 196.85);
        this._updateGPWS(aglFtForGpws, vsFpmForGpws);
        const anyWarn = stallActive || this._overspeedActive;
        this.hudWarning.style.display = anyWarn ? 'block' : 'none';
        if (anyWarn && this.hudWarning) {
            const label = this._overspeedActive ? 'OVERSPEED' : 'STALL';
            this.hudWarning.innerHTML = `\u26A0 ${label} \u26A0`;
        }
        if (stallActive && !this._lastStallState) {
            this._doHaptic([100, 50, 100]);
        }
        if (stallActive !== this._lastStallState) {
            try { this._flightAudio.setStallActive(stallActive); } catch (_) { /* ignore */ }
        }
        this._lastStallState = stallActive;

        try {
            const mmoForAudio = this._resolveMmo();
            this._flightAudio.maybeOverspeedFromMach(currentMach, mmoForAudio);
        } catch (err) {
            console.warn('[Audio] Mach overspeed update failed:', err);
        }

        try {
            const vsFpm = this.velocity.y * 196.85;
            const gearDown = this.gearState === GEAR_STATE_DOWN || this.gearState === GEAR_STATE_EXTENDING;
            const aglFt = aglM * 3.28084;
            this._flightAudio.updateGpws(aglFt, vsFpm, isOnGround, gearDown);
        } catch (_) { /* ignore */ }
        const overGActive = this._gForce > OVER_G_THRESHOLD;
        if (overGActive && !this._lastOverGState) {
            this._doHaptic([200, 100, 200, 100, 200]);
            console.warn(`[Physics] Over-G detected: ${this._gForce.toFixed(2)}g`);
        }
        this._lastOverGState = overGActive;

        this.hudFps.textContent =
            `${this.scene?.getEngine?.()?.getFps?.()?.toFixed(0) ?? '--'} FPS`;

        if (this.hudTasVal) this.hudTasVal.textContent = String(speedKtsTas);
        if (this.hudGsVal)  this.hudGsVal.textContent  = String(speedKtsGs);
        if (this.hudIasVal) this.hudIasVal.textContent = String(speedKtsIas);

        if (this.hudApState) {
            if (this._autopilotMaster) {
                const parts: string[] = [];
                if (this._autopilotNavHold) parts.push('NAV');
                else if (this._autopilotHdgHold) parts.push(`HDG ${Math.round(this._autopilotTargetHdgDeg).toString().padStart(3, '0')}`);
                if (this._autopilotAprHold) parts.push('APR');
                else if (this._autopilotVsHold) parts.push(`VS ${this._autopilotTargetVsFpm >= 0 ? '+' : ''}${Math.round(this._autopilotTargetVsFpm)}`);
                else if (this._autopilotAltHold) parts.push(`ALT ${Math.round(this._autopilotTargetAltFt)}`);
                this.hudApState.textContent = parts.length ? parts.join(' / ') : 'ON';
                this.hudApState.style.color = '#40ff80';
            } else {
                this.hudApState.textContent = 'OFF';
                this.hudApState.style.color = '#888';
            }
        }
        this._updateAutopilotPanel();

        if (this.hudSpoilerState) {
            const pct = Math.round(this._spoilerDeflection * 100);
            if (this._spoilerArmed && pct === 0) {
                this.hudSpoilerState.textContent = 'ARM';
                this.hudSpoilerState.style.color = '#ffcc55';
            } else if (pct > 0) {
                this.hudSpoilerState.textContent = `${pct}%`;
                this.hudSpoilerState.style.color = '#40ff80';
            } else {
                this.hudSpoilerState.textContent = '--';
                this.hudSpoilerState.style.color = '#888';
            }
            if (this.isMobile) {
                const splBtn = document.getElementById('touch-spl');
                if (splBtn) {
                    splBtn.classList.toggle('active', this._spoilerDeflection > 0.01);
                    splBtn.classList.toggle('armed', this._spoilerArmed && this._spoilerDeflection <= 0.01);
                }
            }
        }
        if (this.hudEngsState) {
            const total = Math.max(1, this.aircraftConfig.engine_count ?? 1);
            const alive = Array.isArray(this._engineAlive) ? this._engineAlive.filter(Boolean).length : total;
            if (alive === total) {
                this.hudEngsState.textContent = 'OK';
                this.hudEngsState.style.color = '#40ff80';
            } else if (alive === 0) {
                this.hudEngsState.textContent = 'OUT';
                this.hudEngsState.style.color = '#ff4040';
            } else {
                this.hudEngsState.textContent = `${alive}/${total}`;
                this.hudEngsState.style.color = '#ffcc55';
            }
        }

        if (this.hudRpmVal) this.hudRpmVal.textContent = String(Math.round(this.engineRpm));
        const _engineEt = this.aircraftConfig.engine_type;
        const _engineIsProp = _engineEt === ENGINE_TYPE_PISTON || _engineEt === ENGINE_TYPE_TURBOPROP;
        const _engineRpmMax = this.aircraftConfig.prop_rpm_max || 2700;
        const _engineFrac = _engineIsProp
            ? (_engineRpmMax > 0 ? this.engineRpm / _engineRpmMax : 0)
            : this.enginePower;
        const _engineClamped = Math.max(0, Math.min(1, Number.isFinite(_engineFrac) ? _engineFrac : 0));
        const _engineRpmAngle = -120 + _engineClamped * 240;
        if (this.hudRpmNeedle) {
            this.hudRpmNeedle.style.transform = `rotate(${_engineRpmAngle}deg)`;
        }
        if (this.hudEngine2Col && (this.aircraftConfig?.engine_count ?? 1) >= 2) {
            if (this.hudRpmVal2) this.hudRpmVal2.textContent = String(Math.round(this.engineRpm));
            if (this.hudRpmNeedle2) this.hudRpmNeedle2.style.transform = `rotate(${_engineRpmAngle}deg)`;
        }

        const fuelPct = this.aircraftConfig.fuel_capacity_kg > 0
            ? Math.round((this.fuelRemaining / this.aircraftConfig.fuel_capacity_kg) * 100)
            : 100;
        if (this.hudFuelVal) this.hudFuelVal.textContent = `${fuelPct}%`;

        const aoaSource = Number.isFinite(this._lastAoaRad) ? this._lastAoaRad : 0;
        const aoaDeg = Math.round(aoaSource * 180 / Math.PI);
        if (this.hudAoaVal) this.hudAoaVal.textContent = `${aoaDeg}\u00B0`;

        const vsFpm = Math.round(this.velocity.y * 196.85);
        if (this.hudVsVal) this.hudVsVal.textContent = String(vsFpm);

        if (this.hudVsPointer) {
            const vsForPointer = Number.isFinite(vsFpm) ? vsFpm : 0;
            const vsRangeFpm = 6000;
            const vsClamped = Math.max(-vsRangeFpm, Math.min(vsRangeFpm, vsForPointer));
            const vsTopPct = 50 - (vsClamped / vsRangeFpm) * 50;
            this.hudVsPointer.style.top = `${vsTopPct}%`;
        }
        if (this.hudVsBar) {
            const vsClamp = Math.max(-1000, Math.min(1000, vsFpm));
            const vsHeight = Math.abs(vsClamp) / 1000 * 50;
            this.hudVsBar.style.height = `${vsHeight}%`;
            this.hudVsBar.style.bottom = vsFpm >= 0 ? '50%' : `${50 - vsHeight}%`;
            this.hudVsBar.style.background = vsFpm >= 0 
                ? 'linear-gradient(to top,rgba(50,200,100,.8),rgba(100,255,150,.6))'
                : 'linear-gradient(to bottom,rgba(200,100,50,.8),rgba(255,150,100,.6))';
        }

        if (this.hudTrimVal) this.hudTrimVal.textContent = String(Math.round(this.trimPitch * 1000));
        if (this.hudBaroVal) this.hudBaroVal.textContent = '29.92';

        if (this.hudHdgVal) {
            const fwdFlat = this._tmpFwd.subtract(this._tmpUp.scale(BABYLON.Vector3.Dot(this._tmpFwd, this._tmpUp)));
            if (fwdFlat.lengthSquared() > 0.0001) fwdFlat.normalize();
            const hdgRad = Math.atan2(
                BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(1, 0, 0)),
                BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(0, 0, 1)),
            );
            const hdgTrueDeg = ((hdgRad * 180 / Math.PI) + 360) % 360;
            const here = this._apCurrentLatLon();
            const magVar = here ? this._magneticVariationDeg(here.lat, here.lon) : 0;
            const hdgMagDeg = Math.round(((hdgTrueDeg - magVar) + 360) % 360);
            this.hudHdgVal.textContent = `${hdgMagDeg}\u00B0M`;
        }

        this._updateTapeMarks(speedKts, altitudeFt);

        this._drawFlightHUD();
        this._updateMap();
        this._updateDebugReadouts();

        try {
            const flapsDown = this.flapIndex > 0;
            const gearDownNow = this.gearState === GEAR_STATE_DOWN;
            this._updateChecklistOverlay(speedKtsIas, aglM * 3.28084, vsFpm, gearDownNow, flapsDown);
        } catch (err) {
            console.warn('[Checklist] update failed:', err);
        }
        try {
            this._updateFpsLatencyOverlay();
        } catch (err) {
            console.warn('[FpsLatency] update failed:', err);
        }
    }

    private _drawFlightHUD(): void {
        const ctx = this.hudCtx;
        if (!ctx) return;
        const W = this.hudCanvas.width;
        const H = this.hudCanvas.height;
        const cx = W / 2;
        const cy = H / 2;
        ctx.clearRect(0, 0, W, H);

        const wm = this.planeRoot.getWorldMatrix();
        const fwd   = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
        const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();
        const up    = new BABYLON.Vector3(0, 1, 0);

        const pitchRad = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(fwd, up))));
        const rollRad  = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(right, up))));
        const pitchDeg = pitchRad * 180 / Math.PI;
        const rollDeg  = rollRad * 180 / Math.PI;

        const fwdFlat = fwd.subtract(up.scale(BABYLON.Vector3.Dot(fwd, up)));
        if (fwdFlat.lengthSquared() > 0.0001) fwdFlat.normalize();
        const hdgRad = Math.atan2(
            BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(1, 0, 0)),
            BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(0, 0, 1)),
        );
        const hdgDeg = ((hdgRad * 180 / Math.PI) + 360) % 360;

        const speed    = Math.round(this.velocity.length() * 3.6 * 0.539957);
        const pPos = this.planeRoot.position;
        const altitude = Math.round(Math.max(0, this.refAlt + pPos.y) * 3.28084);
        const ppd = 4;

        ctx.save();
        ctx.translate(cx, cy);

        const horizonY = pitchDeg * ppd;
        const attR = 100;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, attR, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = 'rgba(30,120,220,0.12)';
        ctx.fillRect(-attR, -attR, attR * 2, horizonY + attR);
        ctx.fillStyle = 'rgba(120,80,30,0.10)';
        ctx.fillRect(-attR, horizonY, attR * 2, attR * 2);
        ctx.restore();

        ctx.strokeStyle = 'rgba(0,255,100,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-120, horizonY);
        ctx.lineTo(-20, horizonY);
        ctx.moveTo(20, horizonY);
        ctx.lineTo(120, horizonY);
        ctx.stroke();

        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(0,255,100,0.6)';
        ctx.lineWidth = 1;
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(0,255,100,0.7)';
        ctx.textAlign = 'center';

        for (let deg = -45; deg <= 90; deg += 5) {
            if (deg === 0) continue;
            const yOff = (pitchDeg - deg) * ppd;
            if (Math.abs(yOff) > cy - 20) continue;

            const halfW = deg % 10 === 0 ? 55 : 30;
            const isDashed = deg < 0;

            ctx.beginPath();
            if (isDashed) {
                for (let x = -halfW; x < halfW; x += 12) {
                    ctx.moveTo(x, yOff);
                    ctx.lineTo(Math.min(x + 7, halfW), yOff);
                }
            } else {
                ctx.moveTo(-halfW, yOff);
                ctx.lineTo(halfW, yOff);
            }

            if (deg % 10 === 0) {
                const tickH = deg < 0 ? -5 : 5;
                ctx.moveTo(-halfW, yOff);
                ctx.lineTo(-halfW, yOff + tickH);
                ctx.moveTo(halfW, yOff);
                ctx.lineTo(halfW, yOff + tickH);
            }
            ctx.stroke();

            if (deg % 10 === 0) {
                ctx.fillText(`${deg}`, -halfW - 16, yOff + 3);
                ctx.fillText(`${deg}`, halfW + 16, yOff + 3);
            }
        }

        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rollRad);
        ctx.strokeStyle = 'rgba(0,255,100,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-80, 0);
        ctx.lineTo(-15, 0);
        ctx.lineTo(-15, 6);
        ctx.moveTo(15, 0);
        ctx.lineTo(80, 0);
        ctx.moveTo(15, 0);
        ctx.lineTo(15, 6);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.moveTo(0, -5);
        ctx.lineTo(0, -2);
        ctx.stroke();
        ctx.restore();

        const bankR = 80;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(0,255,100,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, bankR, Math.PI + 0.35, -0.35);
        ctx.stroke();
        for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
            const rad = (-90 + a) * Math.PI / 180;
            const inner = a % 30 === 0 ? bankR - 10 : bankR - 6;
            ctx.beginPath();
            ctx.moveTo(Math.cos(rad) * inner, Math.sin(rad) * inner);
            ctx.lineTo(Math.cos(rad) * bankR, Math.sin(rad) * bankR);
            ctx.stroke();
        }
        const bankPtr = (-90 - rollDeg) * Math.PI / 180;
        ctx.fillStyle = 'rgba(0,255,100,0.8)';
        ctx.beginPath();
        ctx.moveTo(Math.cos(bankPtr) * (bankR + 2), Math.sin(bankPtr) * (bankR + 2));
        ctx.lineTo(Math.cos(bankPtr - 0.06) * (bankR + 10), Math.sin(bankPtr - 0.06) * (bankR + 10));
        ctx.lineTo(Math.cos(bankPtr + 0.06) * (bankR + 10), Math.sin(bankPtr + 0.06) * (bankR + 10));
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = 'rgba(0,255,100,0.85)';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';

        const hdgY = 18;
        ctx.strokeStyle = 'rgba(0,255,100,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 100, hdgY + 6);
        ctx.lineTo(cx + 100, hdgY + 6);
        ctx.stroke();

        const hdgLabels = ['N', '30', '60', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];
        for (let d = -60; d <= 60; d += 10) {
            const showDeg = (Math.round(hdgDeg / 10) * 10 + d + 360) % 360;
            const xOff = cx + (d - (hdgDeg % 10 - (hdgDeg % 10 > 5 ? 10 : 0))) * 2.5;
            if (xOff < cx - 100 || xOff > cx + 100) continue;

            ctx.beginPath();
            ctx.moveTo(xOff, hdgY);
            ctx.lineTo(xOff, hdgY + 6);
            ctx.stroke();

            if (showDeg % 30 === 0) {
                const idx = showDeg / 30;
                ctx.fillText(hdgLabels[idx] || `${showDeg}`, xOff, hdgY - 2);
            }
        }

        ctx.fillStyle = 'rgba(0,255,100,0.9)';
        ctx.beginPath();
        ctx.moveTo(cx, hdgY + 8);
        ctx.lineTo(cx - 4, hdgY + 14);
        ctx.lineTo(cx + 4, hdgY + 14);
        ctx.fill();
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`${Math.round(hdgDeg)}\u00B0`, cx, hdgY + 26);

        ctx.fillStyle = 'rgba(0,10,5,0.5)';
        ctx.fillRect(8, cy - 30, 52, 26);
        ctx.fillRect(W - 60, cy - 30, 52, 26);
        ctx.strokeStyle = 'rgba(0,255,100,0.5)';
        ctx.strokeRect(8, cy - 30, 52, 26);
        ctx.strokeRect(W - 60, cy - 30, 52, 26);

        ctx.fillStyle = 'rgba(0,255,100,0.95)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${speed}`, 54, cy - 12);
        ctx.textAlign = 'left';
        ctx.fillText(`${altitude}`, W - 54, cy - 12);

        ctx.fillStyle = 'rgba(0,255,100,0.4)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('kts', 54, cy - 2);
        ctx.textAlign = 'left';
        ctx.fillText('ft', W - 54, cy - 2);

        ctx.strokeStyle = 'rgba(0,255,100,0.3)';
        ctx.lineWidth = 1;
        for (let i = -5; i <= 5; i++) {
            const spdMark = Math.round(speed / 10) * 10 + i * 10;
            if (spdMark < 0) continue;
            const yOff = cy - 17 + (speed - spdMark) * 1.5;
            if (yOff < cy - 80 || yOff > cy + 50) continue;
            ctx.beginPath();
            ctx.moveTo(60, yOff);
            ctx.lineTo(66, yOff);
            ctx.stroke();
            if (spdMark % 20 === 0) {
                ctx.fillStyle = 'rgba(0,255,100,0.5)';
                ctx.textAlign = 'right';
                ctx.fillText(`${spdMark}`, 58, yOff + 3);
            }
        }

        for (let i = -5; i <= 5; i++) {
            const altMark = Math.round(altitude / 200) * 200 + i * 200;
            if (altMark < 0) continue;
            const yOff = cy - 17 + (altitude - altMark) * 0.18;
            if (yOff < cy - 80 || yOff > cy + 50) continue;
            ctx.beginPath();
            ctx.moveTo(W - 66, yOff);
            ctx.lineTo(W - 60, yOff);
            ctx.stroke();
            if (altMark % 500 === 0) {
                ctx.fillStyle = 'rgba(0,255,100,0.5)';
                ctx.textAlign = 'left';
                ctx.fillText(`${altMark}`, W - 58, yOff + 3);
            }
        }
    }

    private _updateDebugReadouts(): void {
        if (!this.dbgPlanePos) return;

        const pos = this.planeRoot.position;
        this.dbgPlanePos.textContent = `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;

        const q = this.planeRoot.rotationQuaternion;
        if (q) {
            const surfaceUp = new BABYLON.Vector3(0, 1, 0);
            const wm = this.planeRoot.getWorldMatrix();
            const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
            const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();

            const pitch = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(fwd, surfaceUp))));
            const roll  = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(right, surfaceUp))));

            const fwdFlat = fwd.subtract(surfaceUp.scale(BABYLON.Vector3.Dot(fwd, surfaceUp)));
            if (fwdFlat.lengthSquared() > 0.0001) fwdFlat.normalize();
            const north = new BABYLON.Vector3(0, 0, 1);
            const east  = new BABYLON.Vector3(1, 0, 0);
            const headingRad = Math.atan2(BABYLON.Vector3.Dot(fwdFlat, east), BABYLON.Vector3.Dot(fwdFlat, north));
            const hDeg = ((headingRad * 180 / Math.PI) + 360) % 360;

            const pDeg = (pitch * 180 / Math.PI);
            const rDeg = (roll * 180 / Math.PI);
            this.dbgPlaneRot.textContent = `H:${hDeg.toFixed(1)}\u00B0 P:${pDeg.toFixed(1)}\u00B0 R:${rDeg.toFixed(1)}\u00B0`;
        }

        const vel = this.velocity;
        this.dbgPlaneVel.textContent = `${(vel.length() * 3.6).toFixed(1)} (${(vel.x * 3.6).toFixed(1)}, ${(vel.y * 3.6).toFixed(1)}, ${(vel.z * 3.6).toFixed(1)})`;

        if (this.camera) {
            const cp = this.camera.position;
            this.dbgCamPos.textContent = `${cp.x.toFixed(0)}, ${cp.y.toFixed(0)}, ${cp.z.toFixed(0)}`;
            this.dbgCamOrbit.textContent = `${(this.camera.alpha * 180 / Math.PI).toFixed(1)}\u00B0 / ${(this.camera.beta * 180 / Math.PI).toFixed(1)}\u00B0 / ${this.camera.radius.toFixed(1)}`;
        }

        const groundLevel = this.tiles ? this.terrainY : GROUND_Y;
        this.dbgTerrainY.textContent = this.terrainY.toFixed(2);
        this.dbgGroundLvl.textContent = groundLevel.toFixed(2);
        this.dbgOnGround.textContent = this.isOnGround ? 'YES' : 'NO';
        this.dbgOnGround.style.color = this.isOnGround ? '#ff6060' : '#40ffaa';
        this.dbgVertRate.textContent = vel.y.toFixed(2);
        this.dbgAltMsl.textContent = (this.refAlt + pos.y).toFixed(1);

        const { lat, lon } = this._getCurrentLatLon();
        this.dbgLatLon.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

        this.dbgTilesInfo.textContent = this.tiles ? 'loaded' : 'none';

        const fuelPct = this.aircraftConfig.fuel_capacity_kg > 0
            ? (this.fuelRemaining / this.aircraftConfig.fuel_capacity_kg) * 100
            : 100;
        const gearCompText = this.gearCompression.length > 0
            ? this.gearCompression.map((g) => g.toFixed(2)).join(', ')
            : 'n/a';
        this.dbgEngineType.textContent = String(this.aircraftConfig.engine_type);
        this.dbgEnginePerf.textContent = `${Math.round(this.enginePower * 100)}% / ${Math.round(this.engineRpm)}`;
        this.dbgFuelDbg.textContent = `${this.fuelRemaining.toFixed(1)} / ${fuelPct.toFixed(1)}%`;
        this.dbgMixture.textContent = this.aircraftConfig.engine_type === ENGINE_TYPE_PISTON
            ? this.mixtureLevel.toFixed(2)
            : 'n/a';
        this.dbgMagneto.textContent = this.aircraftConfig.engine_type === ENGINE_TYPE_PISTON
            ? String(this.magnetoSwitch)
            : 'n/a';
        this.dbgGearComp.textContent = gearCompText;

        const gsLabels = ['DOWN', 'RETRACTING', 'UP', 'EXTENDING'];
        const gsColors = ['#40ffaa', '#ffcc00', '#888888', '#ffcc00'];
        this.dbgGearState.textContent = gsLabels[this.gearState] || '??';
        this.dbgGearState.style.color = gsColors[this.gearState] || '#fff';
    }
}
