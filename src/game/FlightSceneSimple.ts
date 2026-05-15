declare const __GOOGLE_MAPS_API_KEY__: string;
import { Scene3D } from '../engine/3d/Scene3D.js';
import { InputManager } from '../engine/input/InputManager.js';
import { TilesRenderer } from '3d-tiles-renderer/babylonjs';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { SkyMaterial } from '@babylonjs/materials/sky';
import { MultiplayerClient, PlayerState } from './MultiplayerClient.js';

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
const CAMERA_RADIUS_LENGTH_FACTOR = 3;
const CAMERA_RADIUS_MIN_M = 15;
const CAMERA_RADIUS_MAX_M = 65;
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
}

const G_ACCEL          = 9.81;
const ANGULAR_DAMPING  = 0.5;
const GROUND_Y         = 6;
const CRASH_VS_THRESHOLD_MS = -12;
const CRASH_GROUND_SPEED_MS = 25.7;
const CRASH_GROUND_ATTITUDE_DEG = 45;

// ── ISA atmosphere ────────────────────────────────────────────────────────────
function getAirDensity(altitudeM: number): number {
    const h = Math.max(0, altitudeM);
    if (h > 11000) {
        const T = 216.65;
        const P = 22632 * Math.exp((-9.81 * (h - 11000)) / (287.058 * T));
        return P / (287.058 * T);
    }
    const T = 288.15 - 0.0065 * h;
    const P = 101325 * Math.pow(T / 288.15, 5.2561);
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
    private static readonly MAP_ZOOM = 13;
    private static readonly MAP_REQUEST_SIZE_PX = 256;
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
    private remotePlayers = new Map<string, RemotePlayer>();
    private hudOnline!: HTMLElement;
    private dbgMpStatus!: HTMLElement;
    private dbgMpCount!: HTMLElement;
    private dbgMpUserId!: HTMLElement;
    public onSpawned: (() => void) | null = null;

    private hudThrottle!: HTMLElement;
    private hudThrPct!: HTMLElement;
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
    private spdMarkEls: { el: HTMLElement; valEl: HTMLElement }[] = [];
    private altMarkEls: { el: HTMLElement; valEl: HTMLElement }[] = [];
    private lastSpdCenter = -1;
    private lastAltCenter = -1;

    private _tmpRotMatrix    = new BABYLON.Matrix();
    private _tmpInvRotMatrix = new BABYLON.Matrix();
    private _tmpFwd   = BABYLON.Vector3.Zero();
    private _tmpRight = BABYLON.Vector3.Zero();
    private _tmpUp    = new BABYLON.Vector3(0, 1, 0);
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

    private _navLights: { light: BABYLON.PointLight; mesh: BABYLON.Mesh; core: BABYLON.Mesh; strobe: boolean; maxIntensity: number }[] = [];
    private _navGlowLayer: BABYLON.GlowLayer | null = null;
    private _navGlowTex: BABYLON.DynamicTexture | null = null;
    private _navStrobeTimer = 0;

    private _hemiLight: BABYLON.HemisphericLight | null = null;
    private _sunLight: BABYLON.DirectionalLight | null = null;
    private _fillLight: BABYLON.DirectionalLight | null = null;
    private _sunMesh: BABYLON.Mesh | null = null;
    private _sunMeshMat: BABYLON.StandardMaterial | null = null;
    private _skyMaterial: SkyMaterial | null = null;
    private _skyboxMesh: BABYLON.Mesh | null = null;
    private _starRoot: BABYLON.TransformNode | null = null;
    private _starInstances: BABYLON.InstancedMesh[] = [];
    private _starPhases: number[] = [];
    private _starBaseScales: number[] = [];
    private _starTime = 0;
    private _moonMesh: BABYLON.Mesh | null = null;
    private _moonMat: BABYLON.StandardMaterial | null = null;
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
        this.aircraftConfig = cfg;
        this.FLAP_STEPS = cfg.flap_steps_json || DEFAULT_AIRCRAFT_CONFIG.flap_steps_json;
        this.baseZeroLiftAoA = cfg.base_zero_lift_aoa;
        this.fuelRemaining = cfg.fuel_capacity_kg;
        this.gearCompression = new Array(cfg.gear_positions.length).fill(0);
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

        this.velocity        = BABYLON.Vector3.Zero();
        this.angularVelocity = BABYLON.Vector3.Zero();

        this._applyAircraftConfig(DEFAULT_AIRCRAFT_CONFIG);
        const initialModelFile = DEFAULT_AIRCRAFT_CONFIG.model_file;

        fetchSelectedAircraftConfig().then((cfg) => {
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
        
        this.physicsAccumulator += dt;
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
        this._updateNavLights(dt);
        this._updateClouds();
        this._updatePropellerAnim();
        this._updateGearState();
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
        document.getElementById('flight-hud')?.remove();
        document.getElementById('dbg-panel')?.remove();
        
        document.getElementById('touch-overlay')?.remove();
        document.getElementById('aircraft-btn')?.remove();
        document.getElementById('aircraft-panel')?.remove();
        if (this.tiles) { this.tiles.dispose(); this.tiles = null; }
        this.mpClient?.dispose();
        this._disposeNavLights();
        if (this._pipeline) { this._pipeline.dispose(); this._pipeline = null; }
        if (this._ssao) { this._ssao.dispose(); this._ssao = null; }
        if (this._lensFlareSystem) { this._lensFlareSystem.dispose(); this._lensFlareSystem = null; }
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
        } else if (isRoute && mission.departure_lat != null && mission.departure_lon != null) {
            this._pendingMissionLat = Number(mission.departure_lat);
            this._pendingMissionLon = Number(mission.departure_lon);
            this._pendingMissionHdg = 0;
            this._pendingMissionAltM = 0;
            this._pendingMissionAirborne = false;
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
            }

            for (const [id, remote] of this.remotePlayers) {
                if (!activeIds.has(id)) {
                    remote.labelTexture?.dispose();
                    remote.labelPlane?.dispose();
                    remote.meshes.forEach(m => m.dispose());
                    remote.root.dispose();
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
        const remote: RemotePlayer = { root, meshes: [], prevState: null, nextState: null, lastUpdateTime: 0, aircraftCode, labelPlane: null, labelTexture: null, currentUsername: null, currentAvatarUrl: null };

        this._loadRemoteModel(id, root, remote, modelFile || DEFAULT_AIRCRAFT_CONFIG.model_file);

        return remote;
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
                console.log(`[Mission] All ${total} waypoints reached, calling /complete for userMissionId=${this._activeUserMissionId}`);
                this._completeActiveMission();
            }
        }
    }

    private async _completeActiveMission(): Promise<void> {
        const umId = this._activeUserMissionId;
        if (!umId || this._completedUserMissionIds.has(umId) || this._missionCompletionInFlight) return;
        this._missionCompletionInFlight = true;
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
            lat = parseFloat(params.get('lat') || '-23.4354');
            lon = parseFloat(params.get('lng') || '-46.4745');
            alt = parseFloat(params.get('alt') || '750');
            this.initialHeading = parseFloat(params.get('hdg') || '75');
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
        this._sunMesh = BABYLON.MeshBuilder.CreateSphere('sunMesh', { diameter: 800, segments: 16 }, scene);
        this._sunMesh.isPickable = false;
        this._sunMesh.infiniteDistance = true;

        this._sunMeshMat = new BABYLON.StandardMaterial('sunMeshMat', scene);
        this._sunMeshMat.emissiveColor = new BABYLON.Color3(1.0, 0.95, 0.7);
        this._sunMeshMat.disableLighting = true;
        this._sunMeshMat.backFaceCulling = false;
        this._sunMesh.material = this._sunMeshMat;
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
        this._starRoot.setEnabled(false);
    }

    private _buildMoon(scene: BABYLON.Scene): void {
        this._moonMesh = BABYLON.MeshBuilder.CreateSphere('moonMesh', { diameter: 300, segments: 16 }, scene);
        this._moonMesh.isPickable = false;
        this._moonMesh.infiniteDistance = true;
        this._moonMat = new BABYLON.StandardMaterial('moonMat', scene);
        this._moonMat.emissiveColor = new BABYLON.Color3(0.75, 0.78, 0.85);
        this._moonMat.diffuseColor = new BABYLON.Color3(0.2, 0.22, 0.28);
        this._moonMat.disableLighting = true;
        this._moonMat.backFaceCulling = false;
        this._moonMesh.material = this._moonMat;
        this._moonMesh.isVisible = false;
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

        if (this._sunMesh) {
            this._sunMesh.position = sunDir.scale(-10000);
            this._sunMesh.isVisible = elevation > -2;
        }

        if (this._lensFlareSystem) {
            this._lensFlareSystem.isEnabled = elevation > 1;
        }

        if (this._skyMaterial) {
            this._skyMaterial.sunPosition = new BABYLON.Vector3(sunPosX * 1000, sunPosY * 1000, sunPosZ * 1000);
            const lumT = Math.max(0, Math.min(1, (elevation + 5) / 20));
            this._skyMaterial.luminance = 0.01 + lumT * 1.19;
            const sunsetT = 1.0 - Math.max(0, Math.min(1, Math.abs(elevation) / 10));
            this._skyMaterial.turbidity = 8 + sunsetT * 6;
            this._skyMaterial.rayleigh = 1.5 + lumT * 1.5;
            this._skyMaterial.mieCoefficient = 0.005 + sunsetT * 0.015;
            this._skyMaterial.mieDirectionalG = 0.8;
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

        scene.clearColor.set(fogR * 0.5, fogG * 0.5, fogB * 0.6, 1);

        scene.environmentIntensity = 0.15 + t * 1.15;

        if (this._pipeline) {
            this._pipeline.imageProcessing.exposure = 0.7 + t * 1.1;
        }

        if (this._moonMesh) {
            const moonY = -sunPosY;
            this._moonMesh.position.set(-sunPosX * 10000, Math.max(moonY * 10000, 500), -sunPosZ * 10000);
            this._moonMesh.isVisible = elevation < 8 && moonY > -0.05;
            if (this._moonMat) {
                const moonBright = Math.max(0, Math.min(1, (8 - elevation) / 15));
                this._moonMat.emissiveColor.set(0.75 * moonBright, 0.78 * moonBright, 0.85 * moonBright);
            }
        }

        if (this._starRoot) {
            const starFade = Math.max(0, Math.min(1, (-elevation + 5) / 12));
            this._starRoot.setEnabled(starFade > 0.05);
        }
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

    private cloudInstances: { mesh: BABYLON.InstancedMesh; yBase: number; spread: number }[] = [];

    private _buildClouds(scene: BABYLON.Scene): void {
        const mat = new BABYLON.StandardMaterial('cloudMat', scene);
        const tex = new BABYLON.Texture('https://assets.babylonjs.com/textures/cloud.png', scene);
        tex.hasAlpha = true;
        mat.diffuseTexture             = tex;
        mat.backFaceCulling            = false;
        mat.useAlphaFromDiffuseTexture = true;
        mat.opacityTexture             = tex;
        mat.transparencyMode           = BABYLON.StandardMaterial.MATERIAL_ALPHABLEND;
        mat.alpha                      = 0.85;
        mat.emissiveColor              = new BABYLON.Color3(1.0, 1.0, 1.0);
        mat.disableLighting            = true;

        const layers = [
            { count: 40, yMin: 600,  yRange: 800,  spread: 15000, sizeBase: 700 },
            { count: 50, yMin: 1800, yRange: 1200, spread: 20000, sizeBase: 1000 },
            { count: 35, yMin: 4000, yRange: 2500, spread: 25000, sizeBase: 1500 },
        ];

        for (const layer of layers) {
            const tpl = BABYLON.MeshBuilder.CreatePlane(`cloudTpl_${layer.yMin}`, { size: layer.sizeBase }, scene);
            tpl.isVisible = false;
            tpl.isPickable = false;
            tpl.material = mat;

            for (let i = 0; i < layer.count; i++) {
                const ci = tpl.createInstance(`c_${layer.yMin}_${i}`);
                const ox = (Math.random() - 0.5) * layer.spread;
                const oz = (Math.random() - 0.5) * layer.spread;
                const oy = layer.yMin + Math.random() * layer.yRange;
                ci.position.set(ox, oy, oz);
                const s = 0.5 + Math.random() * 2.0;
                ci.scaling.set(s, s * 0.25, 1);
                ci.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
                ci.isPickable = false;
                this.cloudInstances.push({ mesh: ci, yBase: oy, spread: layer.spread });
            }
        }
    }

    private _updateClouds(): void {
        if (!this.spawned || this.cloudInstances.length === 0) return;
        const px = this.planeRoot.position.x;
        const pz = this.planeRoot.position.z;

        for (const c of this.cloudInstances) {
            const half = c.spread * 0.5;
            let dx = c.mesh.position.x - px;
            let dz = c.mesh.position.z - pz;
            if (dx >  half) c.mesh.position.x -= c.spread;
            if (dx < -half) c.mesh.position.x += c.spread;
            if (dz >  half) c.mesh.position.z -= c.spread;
            if (dz < -half) c.mesh.position.z += c.spread;
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
                if (myVersion !== this._modelLoadVersion) {
                    console.log(`[FlightSimple] Discarding stale model load (${cfg.code}) — newer load in progress.`);
                    meshes.forEach((m) => m.dispose());
                    if (animationGroups && animationGroups.length) {
                        animationGroups.forEach((g) => g.dispose());
                    }
                    return;
                }
                this._loadedModelMeshes = meshes;
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
                const staticGearComp = (sitMass * G_ACCEL) / (nGears * cfg.gear_spring_k);
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

                const bbW = (bb.max.x - bb.min.x) * scaleFactor;
                const bbH = (bb.max.y - bb.min.y) * scaleFactor;
                const bbD = (bb.max.z - bb.min.z) * scaleFactor;
                this._buildNavLights(scene, this.planeRoot, {
                    halfSpan: bbW / 2,
                    height: bbH,
                    halfLen: bbD / 2,
                });

                if (this.camera) {
                    const initialRadius = Math.max(
                        CAMERA_RADIUS_MIN_M,
                        Math.min(CAMERA_RADIUS_MAX_M, bbD * CAMERA_RADIUS_LENGTH_FACTOR),
                    );
                    this.camera.radius = initialRadius;
                    console.debug(`[Camera] Initial radius set to ${initialRadius.toFixed(1)}m for ${cfg.code} (length=${bbD.toFixed(1)}m)`);
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
        this.spawned = true;
        this._maybeFireSpawned();
    }

    private _buildNavLights(
        scene: BABYLON.Scene,
        parent: BABYLON.TransformNode,
        dims: { halfSpan: number; height: number; halfLen: number },
    ): void {
        const hs = dims.halfSpan * 0.97;
        const wingY = dims.height * 0.25;
        const wingZ = -dims.halfLen * 0.25;
        const tailZ = -dims.halfLen * 0.92;
        const tailY = dims.height * 0.85;

        const defs: { name: string; color: BABYLON.Color3; pos: BABYLON.Vector3; strobe: boolean; intensity: number; range: number; glowSize: number }[] = [
            { name: 'navPort',  color: new BABYLON.Color3(1, 0.05, 0.05), pos: new BABYLON.Vector3(-hs, wingY, wingZ),       strobe: false, intensity: 40, range: 200, glowSize: 3.5 },
            { name: 'navStbd',  color: new BABYLON.Color3(0.05, 1, 0.05), pos: new BABYLON.Vector3(hs, wingY, wingZ),        strobe: false, intensity: 40, range: 200, glowSize: 3.5 },
            { name: 'navTail',  color: new BABYLON.Color3(1, 1, 1),       pos: new BABYLON.Vector3(0, tailY, tailZ),          strobe: false, intensity: 30, range: 120, glowSize: 2.5 },
            { name: 'navBelly', color: new BABYLON.Color3(1, 0.1, 0.05),  pos: new BABYLON.Vector3(0, -0.3, 0),              strobe: true,  intensity: 50, range: 250, glowSize: 4.0 },
        ];

        this._disposeNavLights();

        const sizeScale = Math.max(
            NAV_LIGHT_MIN_SCALE,
            Math.min(NAV_LIGHT_MAX_SCALE, dims.halfSpan / NAV_LIGHT_REFERENCE_HALF_SPAN_M),
        );
        const coreDiameter = NAV_LIGHT_CORE_DIAMETER_M * sizeScale;
        console.debug(`[NavLights] halfSpan=${dims.halfSpan.toFixed(2)}m sizeScale=${sizeScale.toFixed(2)} coreDiameter=${coreDiameter.toFixed(3)}m`);

        const glowTex = new BABYLON.DynamicTexture('navGlowTex', 128, scene, false);
        this._navGlowTex = glowTex;
        const ctx = glowTex.getContext();
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.08, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.2, 'rgba(255,255,255,0.4)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        glowTex.update();
        glowTex.hasAlpha = true;

        for (const def of defs) {
            const light = new BABYLON.PointLight(def.name, def.pos.clone(), scene);
            light.parent = parent;
            light.intensity = def.intensity;
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

            const halo = BABYLON.MeshBuilder.CreatePlane(def.name + 'Halo', { size: def.glowSize * sizeScale }, scene);
            halo.parent = parent;
            halo.position = def.pos.clone();
            halo.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            halo.isPickable = false;
            const haloMat = new BABYLON.StandardMaterial(def.name + 'HaloMat', scene);
            haloMat.emissiveColor = def.color.clone();
            haloMat.opacityTexture = glowTex;
            haloMat.disableLighting = true;
            haloMat.backFaceCulling = false;
            haloMat.alphaMode = BABYLON.Constants.ALPHA_ADD;
            halo.material = haloMat;

            this._navLights.push({ light, mesh: halo, core, strobe: def.strobe, maxIntensity: def.intensity });
        }

        const gl = new BABYLON.GlowLayer('navGlow', scene, { blurKernelSize: 128 });
        gl.intensity = 2.0;
        this._navGlowLayer = gl;
        for (const nav of this._navLights) {
            gl.addIncludedOnlyMesh(nav.core as BABYLON.Mesh);
            gl.addIncludedOnlyMesh(nav.mesh as BABYLON.Mesh);
        }
    }

    private _disposeNavLights(): void {
        for (const nav of this._navLights) {
            nav.light.dispose();
            nav.mesh.dispose();
            nav.core.dispose();
        }
        this._navLights = [];
        if (this._navGlowLayer) { this._navGlowLayer.dispose(); this._navGlowLayer = null; }
        if (this._navGlowTex) { this._navGlowTex.dispose(); this._navGlowTex = null; }
    }

    private _updateNavLights(dt: number): void {
        if (this._navLights.length === 0) return;
        this._navStrobeTimer += dt;
        const strobeOn = (this._navStrobeTimer % 0.3) < 0.1;
        for (const nav of this._navLights) {
            const on = nav.strobe ? strobeOn : true;
            nav.light.intensity = on ? nav.maxIntensity : 0;
            nav.mesh.isVisible = on;
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
        this.camera.lowerRadiusLimit = 10;
        this.camera.upperRadiusLimit = 500;
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
    }

    private _initGraphicsSettings(scene: BABYLON.Scene): void {
        const saved = localStorage.getItem('gfx_settings');
        let cfg: Record<string, any> = {};
        if (saved) { try { cfg = JSON.parse(saved); } catch (_) { /* ignore */ } }

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
            s.preset = (document.getElementById('gfx-preset') as HTMLSelectElement)?.value || 'high';
            localStorage.setItem('gfx_settings', JSON.stringify(s));
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
                } catch (e) {
                    console.error('[GFX] applySettings error:', e);
                }
            });
        };

        const presets: Record<string, Record<string, any>> = {
            low:    { bloom: false, bloomWeight: 20, ssao: false, shadows: false, shadowQuality: '1024', fog: true, fogDensity: 30, aa: '1', vignette: false, chromatic: false, renderScale: 75, fpsLimit: '0' },
            medium: { bloom: true,  bloomWeight: 20, ssao: false, shadows: true,  shadowQuality: '2048', fog: true, fogDensity: 30, aa: '2', vignette: true,  chromatic: false, renderScale: 100, fpsLimit: '0' },
            high:   { bloom: true,  bloomWeight: 40, ssao: true,  shadows: true,  shadowQuality: '4096', fog: true, fogDensity: 30, aa: '4', vignette: true,  chromatic: true,  renderScale: 100, fpsLimit: '0' },
            ultra:  { bloom: true,  bloomWeight: 40, ssao: true,  shadows: true,  shadowQuality: '4096', fog: true, fogDensity: 30, aa: '8', vignette: true,  chromatic: true,  renderScale: 100, fpsLimit: '0' },
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
            if (cfg.preset) { const el = document.getElementById('gfx-preset') as HTMLSelectElement | null; if (el) el.value = cfg.preset; }
            setTimeout(() => applySettings(), 100);
        }

        const ids = ['gfx-bloom', 'gfx-bloom-weight', 'gfx-ssao', 'gfx-shadows', 'gfx-shadow-quality', 'gfx-fog', 'gfx-fog-density', 'gfx-aa', 'gfx-vignette', 'gfx-chromatic', 'gfx-render-scale', 'gfx-fps-limit'];
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

        const SMOOTHING_RATE = this.isMobile ? 0.9 : 1.2;
        const RETURN_RATE    = this.isMobile ? 0.7 : 0.9;
        const KEY_PITCH_MAGNITUDE = 0.75;
        const KEY_ROLL_MAGNITUDE  = 0.55;
        const KEY_YAW_MAGNITUDE   = 0.65;

        if (this.isMobile) {
            targetPitch = this.touchPitchInput * 0.7;
            targetRoll = this.touchRollInput * 0.18;
            targetYaw = 0;
            this.thrust = this.touchThrust;
        } else {
            const p = (code: string) => this.input.isKeyDown(code);

            if (p('KeyW')) this.thrust = Math.min(1, this.thrust + _dt * this.aircraftConfig.throttle_up_rate);
            if (p('KeyS')) this.thrust = Math.max(0, this.thrust - _dt * this.aircraftConfig.throttle_down_rate);

            targetPitch = (p('ArrowUp') ? -1 : p('ArrowDown') ? 1 : 0) * KEY_PITCH_MAGNITUDE;
            targetRoll  = (p('ArrowRight') ? -1 : p('ArrowLeft') ? 1 : 0) * KEY_ROLL_MAGNITUDE;
            targetYaw   = ((p('KeyQ') || p('KeyA')) ? 1 : (p('KeyE') || p('KeyD')) ? -1 : 0) * KEY_YAW_MAGNITUDE;

            if (p('Digit5') && !this.flapKeyLock5) {
                this.flapKeyLock5 = true;
                this.flapIndex = Math.max(0, this.flapIndex - 1);
            }
            if (!p('Digit5')) this.flapKeyLock5 = false;

            if (p('Digit6') && !this.flapKeyLock6) {
                this.flapKeyLock6 = true;
                this.flapIndex = Math.min(this.FLAP_STEPS.length - 1, this.flapIndex + 1);
            }
            if (!p('Digit6')) this.flapKeyLock6 = false;

            if (p('KeyR')) this._spawnPlane();

            if (p('KeyB') && !this.brakeKeyLock) {
                this.brakeKeyLock = true;
                this.brakesOn = !this.brakesOn;
            }
            if (!p('KeyB')) this.brakeKeyLock = false;

            const isJetAc = this.aircraftConfig.engine_type === ENGINE_TYPE_TURBOFAN
                         || this.aircraftConfig.engine_type === ENGINE_TYPE_TURBOJET;
            if (isJetAc && p('KeyG') && !this.gearKeyLockG) {
                this.gearKeyLockG = true;
                this._toggleGear();
            }
            if (!p('KeyG')) this.gearKeyLockG = false;

            // Trim: 7/8 = pitch trim nose down/up, 9/0 = yaw trim left/right
            if (p('Digit7') && !this.trimKeyLock7) { this.trimKeyLock7 = true; this.trimPitch = Math.max(-0.15, this.trimPitch - 0.005); }
            if (!p('Digit7')) this.trimKeyLock7 = false;
            if (p('Digit8') && !this.trimKeyLock8) { this.trimKeyLock8 = true; this.trimPitch = Math.min(0.15, this.trimPitch + 0.005); }
            if (!p('Digit8')) this.trimKeyLock8 = false;
            if (p('Digit9') && !this.trimKeyLock9) { this.trimKeyLock9 = true; this.trimYaw = Math.max(-0.1, this.trimYaw - 0.005); }
            if (!p('Digit9')) this.trimKeyLock9 = false;
            if (p('Digit0') && !this.trimKeyLock0) { this.trimKeyLock0 = true; this.trimYaw = Math.min(0.1, this.trimYaw + 0.005); }
            if (!p('Digit0')) this.trimKeyLock0 = false;

            // Mixture: Shift+Plus / Shift+Minus (piston only)
            if (this.aircraftConfig.engine_type === ENGINE_TYPE_PISTON) {
                if (p('Equal') && !this.mixtureKeyLockPlus) { this.mixtureKeyLockPlus = true; this.mixtureLevel = Math.min(1.0, this.mixtureLevel + 0.05); }
                if (!p('Equal')) this.mixtureKeyLockPlus = false;
                if (p('Minus') && !this.mixtureKeyLockMinus) { this.mixtureKeyLockMinus = true; this.mixtureLevel = Math.max(0, this.mixtureLevel - 0.05); }
                if (!p('Minus')) this.mixtureKeyLockMinus = false;

                if (p('KeyN') && !this.magnetoKeyLockN) {
                    this.magnetoKeyLockN = true;
                    this.magnetoSwitch = (this.magnetoSwitch + 1) % 4;
                }
                if (!p('KeyN')) this.magnetoKeyLockN = false;
            }
        }

        const lerpAxis = (current: number, target: number): number => {
            const rate = (Math.abs(target) < Math.abs(current)) ? RETURN_RATE : SMOOTHING_RATE;
            const t = 1 - Math.exp(-rate * _dt);
            return current + (target - current) * t;
        };

        if (this.isOnGround) {
            targetRoll = 0;
        }

        this.smoothedPitch = lerpAxis(this.smoothedPitch, targetPitch);
        this.smoothedRoll  = lerpAxis(this.smoothedRoll, targetRoll);
        this.smoothedYaw   = lerpAxis(this.smoothedYaw, targetYaw);

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
                const airDensityHere = getAirDensity(altitudeForQ);
                const dynamicPressure = 0.5 * airDensityHere * speedSq;
                if (dynamicPressure > CONTROL_Q_REFERENCE_PA) {
                    const qScale = Math.sqrt(CONTROL_Q_REFERENCE_PA / dynamicPressure);
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

        this._applyFlaps();
    }

    private _setupTouchControls(): void {
        const overlay = document.createElement('div');
        overlay.id = 'touch-overlay';
        overlay.innerHTML = `
<style>
#touch-overlay{position:fixed;inset:0;pointer-events:none;z-index:150}
#touch-joy{position:absolute;width:120px;height:120px;border-radius:50%;border:none;background:none;display:none;pointer-events:none}
#touch-joy-knob{position:absolute;top:50%;left:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(0,255,128,.25);border:1px solid rgba(0,255,128,.15)}
#touch-throttle{position:absolute;bottom:160px;left:10px;width:40px;height:150px;border-radius:20px;border:2px solid rgba(80,255,160,.35);background:rgba(0,20,15,.3);pointer-events:auto;touch-action:none}
#touch-thr-fill{position:absolute;bottom:0;left:0;right:0;height:70%;background:linear-gradient(0deg,rgba(0,255,128,.35),rgba(0,255,128,.1));border-radius:0 0 20px 20px}
#touch-thr-knob{position:absolute;left:50%;transform:translateX(-50%);width:36px;height:12px;border-radius:6px;background:rgba(0,255,128,.5);border:1px solid rgba(0,255,128,.7)}
#touch-flap-btns{position:absolute;bottom:340px;left:8px;display:flex;flex-direction:column;gap:6px;pointer-events:auto}
#touch-flap-btns button{width:52px;height:34px;border-radius:8px;border:1px solid rgba(80,255,160,.4);background:rgba(0,20,15,.5);color:#7df9c8;font-family:'Orbitron',monospace;font-size:11px;cursor:pointer;touch-action:manipulation;transition:transform .1s,background .1s}
#touch-flap-btns button:active{transform:scale(.92);background:rgba(0,40,25,.7)}
#touch-brk.active{background:rgba(255,40,40,.4);border-color:rgba(255,80,80,.6);color:#ff6060}
</style>
<div id="touch-joy"><div id="touch-joy-knob"></div></div>
<div id="touch-throttle"><div id="touch-thr-fill"></div><div id="touch-thr-knob"></div></div>
<div id="touch-flap-btns"><button id="touch-flap-up">F+</button><button id="touch-flap-dn">F\u2212</button><button id="touch-brk">BRK</button></div>`;
        document.body.appendChild(overlay);

        const joyEl = document.getElementById('touch-joy')!;
        const knob = document.getElementById('touch-joy-knob')!;
        const throttleEl = document.getElementById('touch-throttle')!;
        const thrFill = document.getElementById('touch-thr-fill')!;
        const thrKnob = document.getElementById('touch-thr-knob')!;
        const maxDrag = 80;

        const updateThrVisual = () => {
            const pct = this.touchThrust * 100;
            thrFill.style.height = `${pct}%`;
            thrKnob.style.bottom = `${pct}%`;
        };
        updateThrVisual();

        const isOnWidget = (t: Touch): boolean => {
            const el = document.elementFromPoint(t.clientX, t.clientY);
            if (!el) return false;
            return !!el.closest('#touch-throttle,#touch-flap-btns');
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

        canvas.addEventListener('touchstart', (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (isOnWidget(t)) continue;
                if (isInDeadZone(t.clientX, t.clientY)) continue;
                if (this.joystickTouchId !== null) continue;
                this.joystickTouchId = t.identifier;
                this.joystickOrigin = { x: t.clientX, y: t.clientY };
                joyEl.style.display = 'block';
                joyEl.style.left = `${t.clientX - 60}px`;
                joyEl.style.top = `${t.clientY - 60}px`;
                knob.style.left = '50%';
                knob.style.top = '50%';
                e.preventDefault();
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e: TouchEvent) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const t = e.changedTouches[i];
                if (t.identifier !== this.joystickTouchId) continue;
                const dx = t.clientX - this.joystickOrigin.x;
                const dy = t.clientY - this.joystickOrigin.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const clamped = Math.min(dist, maxDrag);
                const angle = Math.atan2(dy, dx);
                const nx = (clamped * Math.cos(angle)) / maxDrag;
                const ny = (clamped * Math.sin(angle)) / maxDrag;
                this.touchRollInput = -nx;
                this.touchPitchInput = ny;
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
    }

    private _triggerCrash(): void {
        this._crashed = true;
        this.velocity.setAll(0);
        this.angularVelocity.setAll(0);
        this.thrust = 0;
        if (this._crashOverlayEl) this._crashOverlayEl.style.display = 'block';
        console.log('[Crash] Ground impact detected — respawning in 3s');
        const RESPAWN_DELAY_MS = 3000;
        setTimeout(() => {
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
        const hit = this.scene.pickWithRay(this._worldReadyProbeRay, (mesh: BABYLON.AbstractMesh) =>
            mesh.isPickable && !mesh.isDescendantOf(this.planeRoot) && mesh.name !== 'ground',
        );

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
                this.planeRoot.position.y = this.terrainY + altOffset;
                console.debug(`[WorldReady] Airborne spawn snapped to terrainY=${this.terrainY.toFixed(1)}m + offset=${altOffset.toFixed(1)}m -> pos.y=${this.planeRoot.position.y.toFixed(1)}m`);
            } else {
                this.planeRoot.position.y = this.terrainY + gearHeight;
                this.velocity.set(0, 0, 0);
                this.angularVelocity.set(0, 0, 0);
                console.debug(`[WorldReady] Ground spawn snapped to terrainY=${this.terrainY.toFixed(1)}m + gearHeight=${gearHeight.toFixed(2)}m -> pos.y=${this.planeRoot.position.y.toFixed(1)}m`);
            }
        }
        this._spawnSnapFramesLeft = SPAWN_SNAP_FRAMES;
        this._maybeFireSpawned();
    }

    private _maybeFireSpawned(): void {
        if (this.spawned && this._worldReady && this.onSpawned) {
            const cb = this.onSpawned;
            this.onSpawned = null;
            cb();
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
                const line = document.createElement('div');
                line.className = 'hud-tape-mark-line';
                const valEl = document.createElement('span');
                valEl.className = 'hud-tape-mark-val';
                el.appendChild(line);
                el.appendChild(valEl);
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
        const spdStep = 20;
        const spdRange = 60;
        const spdCenter = Math.round(speedKts / spdStep) * spdStep;
        
        if (this.spdMarkEls.length > 0) {
            const centerChanged = spdCenter !== this.lastSpdCenter;
            this.lastSpdCenter = spdCenter;
            
            for (let i = 0; i < 7; i++) {
                const idx = 3 - i;
                const val = Math.max(0, spdCenter + idx * spdStep);
                const offset = ((speedKts - val) / spdRange) * 50;
                const mark = this.spdMarkEls[i];
                mark.el.style.transform = `translateY(${offset}px)`;
                if (centerChanged) mark.valEl.textContent = String(val);
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
            
            for (let i = 0; i < 7; i++) {
                const idx = 3 - i;
                const val = Math.max(0, altCenter + idx * altStep);
                const offset = ((altitudeFt - val) / altRange) * 50;
                const mark = this.altMarkEls[i];
                mark.el.style.transform = `translateY(${offset}px)`;
                if (centerChanged) mark.valEl.textContent = String(val);
            }
            
            if (this.hudAltTape) {
                const fillPct = Math.min(100, Math.max(5, (altitudeFt % 1000) / 1000 * 100));
                this.hudAltTape.style.height = `${fillPct}%`;
            }
        }
    }
    private _initFlapBar(): void {}
    private _updateFlapDisplay(): void {}

    private _applyFlaps(): void {
        if (!this.FLAP_STEPS || !this.FLAP_STEPS.length) return;
        if (this.flapIndex >= this.FLAP_STEPS.length) this.flapIndex = this.FLAP_STEPS.length - 1;
        const targetDeg = this.FLAP_STEPS[this.flapIndex];
        const rate = 5;
        if (this.currentFlapDeg < targetDeg) this.currentFlapDeg = Math.min(targetDeg, this.currentFlapDeg + rate * 0.016);
        if (this.currentFlapDeg > targetDeg) this.currentFlapDeg = Math.max(targetDeg, this.currentFlapDeg - rate * 0.016);

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
        const airDensity = getAirDensity(altitude);

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
            const hit = this.scene.pickWithRay(this._terrainRay, (mesh: BABYLON.AbstractMesh) =>
                mesh.isPickable && !mesh.isDescendantOf(this.planeRoot) && mesh.name !== 'ground',
            );
            const wasUnknown = this.terrainY === TERRAIN_UNKNOWN_Y;
            let resolvedTerrainY: number = TERRAIN_UNKNOWN_Y;
            if (hit?.hit && hit.pickedPoint) {
                const accept = inSpawnWindow || hit.pickedPoint.y <= pos.y + TERRAIN_HIT_ABOVE_LIMIT_M;
                if (accept) {
                    resolvedTerrainY = hit.pickedPoint.y;
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
                    const eqComp = Math.min(
                        GEAR_MAX_TRAVEL_M * 0.5,
                        (sitMassSnap * G_ACCEL) / (nGearsSnap * cfg.gear_spring_k),
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

        // ── Engine model ─────────────────────────────────────────────────────
        let effectiveThrust = this.thrust;
        if (isPiston) {
            const mapFraction = this.thrust * (airDensity / 1.225);
            const mixDelta = Math.abs(this.mixtureLevel - BEST_POWER_MIX);
            const mixEfficiency = Math.max(0, 1.0 - mixDelta * 2.5);
            let magFactor = 0;
            if (this.magnetoSwitch === MAGNETO_BOTH) magFactor = 1.0;
            else if (this.magnetoSwitch === MAGNETO_LEFT || this.magnetoSwitch === MAGNETO_RIGHT) magFactor = MAGNETO_SINGLE_FACTOR;
            this.enginePower = Math.max(0, Math.min(1, mapFraction * mixEfficiency * magFactor));
            this.engineRpm = (cfg.prop_rpm_max || 2700) * Math.sqrt(this.enginePower);
            effectiveThrust = this.enginePower;
        } else {
            const densityRatio = Math.max(0.0001, airDensity / SEA_LEVEL_AIR_DENSITY_KG_PER_M3);
            const thrustAltitudeLapse = Math.pow(densityRatio, JET_THRUST_LAPSE_EXPONENT);
            const tempKEng = altitude > ISA_TROPOPAUSE_M
                ? ISA_TROPOPAUSE_TEMP_K
                : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * Math.max(0, altitude);
            const speedOfSoundEng = Math.sqrt(SPECIFIC_HEAT_RATIO_AIR * GAS_CONSTANT_AIR_J_PER_KG_K * tempKEng);
            const machNow = this.velocity.length() / Math.max(1, speedOfSoundEng);
            const thrustMachLapse = Math.max(
                JET_THRUST_MACH_MIN_FACTOR,
                1.0 - JET_THRUST_MACH_LAPSE_COEF * machNow,
            );
            effectiveThrust = this.thrust * thrustAltitudeLapse * thrustMachLapse;
            this.enginePower = this.thrust;
            this.engineRpm = Math.round(1200 + this.thrust * 1500);
        }
        if (this.fuelRemaining <= 0 && cfg.fuel_capacity_kg > 0) {
            effectiveThrust = 0;
            this.enginePower = 0;
            this.engineRpm = 0;
        }

        // ── Fuel burn (after engine model so piston uses actual output) ──────
        if (this.fuelRemaining > 0 && cfg.fuel_capacity_kg > 0) {
            const burnFraction = isPiston ? this.enginePower : this.thrust;
            const burnRate = cfg.fuel_burn_rate_kg_per_s_idle +
                (cfg.fuel_burn_rate_kg_per_s_max - cfg.fuel_burn_rate_kg_per_s_idle) * burnFraction;
            this.fuelRemaining = Math.max(0, this.fuelRemaining - burnRate * dt);
        }
        const MASS = cfg.fuel_capacity_kg > 0
            ? cfg.mass_kg + this.fuelRemaining
            : cfg.mass_kg;
        const cIxx = cfg.inertia_xx;
        const cIyy = cfg.inertia_yy;
        const cIzz = cfg.inertia_zz;

        const thrustVec = this._tmpFwd;
        thrustVec.set(0, 0, effectiveThrust * cfg.max_thrust_n);

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

        const computeForces = (vel: BABYLON.Vector3, angVel: BABYLON.Vector3) => {
            const totalForce  = BABYLON.Vector3.Zero();
            const totalTorque = BABYLON.Vector3.Zero();

            totalForce.y -= MASS * G_ACCEL;

            totalForce.addInPlace(toWorld(thrustVec));

            const bodyVel = toBody(vel);
            for (let si = 0; si < this.surfaces.length; si++) {
                const surface = this.surfaces[si];
                const pointVel = bodyVel.add(BABYLON.Vector3.Cross(angVel, surface.position));
                const isTailSurface = si >= 2;
                const pwBoost = isTailSurface ? propwashBoost : 0;
                const { force, torque } = computeSurfaceForces(
                    surface, pointVel, airDensity, groundEffectFactor, cfg.flap_type, pwBoost,
                );
                totalForce.addInPlace(toWorld(force));
                totalTorque.addInPlace(torque);
            }

            // Fuselage parasite drag (+ gear drag when deployed)
            const spd = vel.length();
            if (spd >= 1.0) {
                const effectiveCd0 = cfg.fuselage_cd0 + (gearDeployed ? (cfg.gear_drag_cd ?? 0) : 0);
                const tempK = altitude > ISA_TROPOPAUSE_M
                    ? ISA_TROPOPAUSE_TEMP_K
                    : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * Math.max(0, altitude);
                const speedOfSound = Math.sqrt(SPECIFIC_HEAT_RATIO_AIR * GAS_CONSTANT_AIR_J_PER_KG_K * tempK);
                const machNumber = spd / Math.max(1, speedOfSound);
                const machExcess = Math.max(0, machNumber - MACH_DRAG_RISE_START);
                const machDragMult = 1.0 + machExcess * machExcess * MACH_DRAG_RISE_COEF;
                const qBody = 0.5 * airDensity * spd * spd * effectiveCd0 * cfg.fuselage_ref_area * machDragMult;
                totalForce.addInPlace(vel.normalizeToNew().scaleInPlace(-qBody));

                if (machExcess > 0) {
                    const wingAreaTotal = (cfg.surfaces[0]?.area ?? 0) + (cfg.surfaces[1]?.area ?? 0);
                    if (wingAreaTotal > 0) {
                        const wingWaveDrag = 0.5 * airDensity * spd * spd * cfg.skin_friction * wingAreaTotal * (machDragMult - 1.0);
                        totalForce.addInPlace(vel.normalizeToNew().scaleInPlace(-wingWaveDrag));
                    }
                }

                // Fuselage sideslip Cy/Cn
                const bodyVelNow = toBody(vel);
                const beta = Math.atan2(bodyVelNow.x, Math.max(1, Math.abs(bodyVelNow.z)));
                const qSide = 0.5 * airDensity * spd * spd * cfg.fuselage_side_area;
                const sideForce = -beta * qSide * 0.4;
                totalForce.addInPlace(toWorld(new BABYLON.Vector3(sideForce, 0, 0)));
                totalTorque.y += cfg.fuselage_cn_beta * beta * qSide * 5.0;
            }

            // P-factor (prop aircraft only)
            if (hasProp && effectiveThrust > 0) {
                const bodyVelNow = toBody(vel);
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

        this.camera.target.copyFrom(pos);

        const wm = this.planeRoot.getWorldMatrix();
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), wm, this._tmpFwd);
        const targetAlpha = Math.atan2(-this._tmpFwd.z, -this._tmpFwd.x);
        let da = targetAlpha - this.camera.alpha;
        da = ((da + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        this.camera.alpha += da * Math.min(1, 3 * dt);

        if (this.ground) {
            this.ground.position.x = pos.x;
            this.ground.position.z = pos.z;
        }
    }

    // ── HUD ───────────────────────────────────────────────────────────────────

    private _buildHUD(): void {
        const hud = document.createElement('div');
        hud.id = 'flight-hud';
        hud.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400&display=swap');
#flight-hud { position:fixed;inset:0;pointer-events:none;z-index:100;font-family:'Orbitron',monospace;color:#fff;opacity:0.85; }
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

.hud-tape-section{display:flex;align-items:stretch;overflow:hidden}
.hud-tape-wrapper{position:relative;display:flex;height:180px;overflow:hidden}
.hud-tape{position:relative;width:8px;height:100%;background:linear-gradient(to top,rgba(0,0,0,.7),rgba(0,0,0,.5));overflow:hidden}
.hud-tape-fill-spd{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,#c8a030,#e8c860);transition:height .15s}
.hud-tape-fill-alt{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,#3090c8,#50b0e8);transition:height .15s}
.hud-tape-marks{position:absolute;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:18px;pointer-events:none}
.hud-tape-marks-left{left:12px;align-items:flex-start}
.hud-tape-marks-right{right:12px;align-items:flex-end}
.hud-tape-mark{display:flex;align-items:center;gap:2px}
.hud-tape-mark-line{width:5px;height:1px;background:rgba(255,255,255,.5)}
.hud-tape-mark-val{font-size:10px;color:rgba(255,255,255,.85);font-family:'Inter',sans-serif;font-weight:500;min-width:24px}

.hud-value-row{display:flex;align-items:baseline;gap:2px;margin-top:3px}
.hud-value-main{font-size:24px;font-weight:700;color:#fff;font-family:'Orbitron',monospace;text-shadow:0 1px 4px rgba(0,0,0,.9)}
.hud-value-unit{font-size:9px;color:rgba(255,255,255,.4)}

.hud-sub-row{display:flex;align-items:center;gap:4px;margin-top:1px}
.hud-sub-label{font-size:8px;color:rgba(255,255,255,.5)}
.hud-sub-val{font-size:11px;color:#fff;font-family:'Orbitron',monospace}

/* Engine Section - Side by side */
.hud-engine-col{display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:4px}
.hud-engine-title{font-size:8px;letter-spacing:.08em;color:rgba(255,255,255,.4);margin-bottom:2px}
.hud-engine-content{display:flex;flex-direction:column;gap:4px}
.hud-rpm-gauge{position:relative;width:56px;height:56px}
.hud-rpm-bg{width:100%;height:100%;border-radius:50%;background:radial-gradient(circle,rgba(20,20,20,.9),rgba(10,10,10,.95));border:1px solid rgba(80,255,160,.25)}
.hud-rpm-needle{position:absolute;bottom:50%;left:50%;width:2px;height:22px;background:linear-gradient(to top,#50ff80,#80ffa0);transform-origin:bottom center;transform:rotate(-120deg);border-radius:1px;box-shadow:0 0 4px rgba(80,255,128,.5)}
.hud-rpm-center{position:absolute;top:50%;left:50%;width:6px;height:6px;background:#222;border:1px solid rgba(80,255,160,.3);border-radius:50%;transform:translate(-50%,-50%)}
.hud-rpm-label{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);font-size:7px;color:#50ff80;letter-spacing:.03em}
.hud-engine-vals{display:flex;flex-direction:column;gap:0}
.hud-engine-val{display:flex;align-items:baseline;gap:3px}
.hud-engine-val-num{font-size:11px;font-weight:600;color:#fff;font-family:'Orbitron',monospace;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.hud-engine-val-lbl{font-size:7px;color:rgba(255,255,255,.35)}

/* Right Panel - Instruments side by side */
.hud-instr-col{display:flex;flex-direction:column;justify-content:flex-end;gap:4px;padding-bottom:4px}
.hud-vs-row{display:flex;align-items:center;gap:4px}
.hud-vs-header{font-size:8px;color:rgba(255,255,255,.5)}
.hud-vs-val{font-size:14px;font-weight:600;color:#fff;font-family:'Orbitron',monospace;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.hud-vs-bar{width:20px;height:80px;background:rgba(0,0,0,.5);position:relative}
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
.hud-panel-left{left:6px!important;bottom:6px!important;transform:scale(.8);transform-origin:bottom left}
.hud-panel-right{right:6px!important;bottom:6px!important;transform:scale(.8);transform-origin:bottom right}
.hud-tape{height:140px!important}
.hud-value-main{font-size:18px!important}
.hud-engine-col{display:none!important}
#missions-btn{top:22px!important;right:10px!important}
#aircraft-btn{top:60px!important;right:10px!important}
#flight-plans-btn{top:98px!important;right:10px!important}
#missions-panel{top:16px!important;right:50px!important;width:260px!important;max-height:50vh!important}
#aircraft-panel{top:54px!important;right:50px!important;width:260px!important;max-height:50vh!important}
#flight-plans-panel{top:92px!important;right:50px!important;width:260px!important;max-height:50vh!important}
#nav-info{top:150px!important;left:2px!important;width:140px!important;font-size:9px!important}
}
@media(max-width:480px){
#hud-utc{font-size:7px!important;letter-spacing:.06em!important}
#flight-pfd{top:22%!important;width:200px!important;height:140px!important}
#gps-map{width:132px!important;height:132px!important;top:4px!important;left:2px!important}
.hud-panel-left{left:6px!important;bottom:4px!important;transform:scale(.65);transform-origin:bottom left}
.hud-panel-right{right:6px!important;bottom:4px!important;transform:scale(.65);transform-origin:bottom right}
.hud-tape{height:110px!important}
.hud-value-main{font-size:16px!important}
.hud-engine-col{display:none!important}
.hud-instr-col{display:none!important}
#h-online{display:none!important}
#missions-btn{top:6px!important;right:6px!important;width:28px!important;height:28px!important}
#aircraft-btn{top:40px!important;right:6px!important;width:28px!important;height:28px!important}
#missions-panel{top:4px!important;right:40px!important;width:200px!important;max-height:45vh!important;font-size:10px!important}
#aircraft-panel{top:38px!important;right:40px!important;width:200px!important;max-height:45vh!important;font-size:10px!important}
#flight-plans-btn{top:74px!important;right:6px!important;width:28px!important;height:28px!important}
#flight-plans-panel{top:72px!important;right:40px!important;width:200px!important;max-height:45vh!important;font-size:10px!important}
#nav-info{top:120px!important;left:2px!important;width:110px!important;font-size:8px!important}
}
@media(max-height:440px){
#flight-pfd{top:30%!important;width:220px!important;height:150px!important}
#gps-map{width:120px!important;height:120px!important;top:2px!important;left:2px!important}
#hud-utc{font-size:7px!important}
.hud-panel-left{left:6px!important;bottom:4px!important;transform:scale(.7);transform-origin:bottom left}
.hud-panel-right{right:6px!important;bottom:4px!important;transform:scale(.7);transform-origin:bottom right}
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
<div id="crash-overlay" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(180,0,0,.35);z-index:500;pointer-events:none">
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
    <div style="font-family:'Orbitron',monospace;font-size:36px;color:#ff2200;letter-spacing:.3em;text-shadow:0 0 30px rgba(255,0,0,.8);animation:stallPulse 0.8s ease-in-out infinite">CRASHED</div>
    <div style="font-family:'Inter',sans-serif;font-size:12px;color:rgba(255,255,255,.5);margin-top:12px;letter-spacing:.1em">Respawning...</div>
  </div>
</div>

<!-- Left Panel - Airspeed & Engine side by side -->
<div class="hud-panel-left">
  <div class="hud-tape-col">
    <div class="hud-header">AIRSPEED<span class="hud-header-sub">KTS</span></div>
    <div class="hud-tape-section">
      <div class="hud-tape-wrapper">
        <div class="hud-tape">
          <div class="hud-tape-fill-spd" id="hud-spd-tape" style="height:50%"></div>
        </div>
        <div class="hud-tape-marks hud-tape-marks-left" id="hud-spd-marks"></div>
      </div>
    </div>
    <div class="hud-value-row">
      <span class="hud-value-main" id="bb-spd-v">0</span>
    </div>
    <div class="hud-sub-row">
      <span class="hud-sub-label">TAS</span>
      <span class="hud-sub-val"><span id="hud-tas-v">0</span>KT</span>
    </div>
  </div>
  <div class="hud-engine-col">
    <div class="hud-engine-title">ENGINE #1</div>
    <div class="hud-engine-content">
      <div class="hud-rpm-gauge">
        <div class="hud-rpm-bg"></div>
        <div class="hud-rpm-needle" id="hud-rpm-needle"></div>
        <div class="hud-rpm-center"></div>
        <div class="hud-rpm-label">RPM</div>
      </div>
      <div class="hud-engine-vals">
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-rpm-v">0</span><span class="hud-engine-val-lbl">RPM</span></div>
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-fuel-v">100%</span><span class="hud-engine-val-lbl">FUEL</span></div>
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-aoa-v">0&deg;</span><span class="hud-engine-val-lbl">AOA</span></div>
      </div>
    </div>
  </div>
</div>

<!-- Right Panel - Altitude & Instruments side by side -->
<div class="hud-panel-right">
  <div class="hud-instr-col">
    <div class="hud-vs-row">
      <div class="hud-vs-bar">
        <div class="hud-vs-bar-zero"></div>
        <div class="hud-vs-bar-fill" id="hud-vs-bar" style="height:0;bottom:50%"></div>
      </div>
      <div>
        <div class="hud-vs-header">VS</div>
        <div class="hud-vs-val" id="hud-vs-v">0</div>
      </div>
    </div>
    <div class="hud-instr-group">
      <div class="hud-instr-item"><span class="hud-instr-val" id="bb-flp">OFF</span><span class="hud-instr-lbl">FLAPS</span></div>
      <div class="hud-instr-item"><span class="hud-instr-val" id="bb-brk">OFF</span><span class="hud-instr-lbl">BRK</span></div>
      <div class="hud-instr-item" id="hud-gear-row" style="display:none"><span class="hud-instr-val" id="hud-gear-state">DOWN</span><span class="hud-instr-lbl">GEAR</span></div>
      <div class="hud-instr-item"><span class="hud-instr-val" id="hud-trim-v">0</span><span class="hud-instr-lbl">TRIM</span></div>
      <div class="hud-instr-item"><span class="hud-instr-val" id="hud-thr-pct" style="min-width:22px">0%</span><div class="hud-instr-bar"><div class="hud-instr-bar-fill" id="bb-thr" style="width:0%"></div></div><span class="hud-instr-lbl">THR</span></div>
    </div>
    <div class="hud-bottom-row">
      <div class="hud-bottom-item"><span class="hud-bottom-val" id="hud-hdg-v">0&deg;</span><span class="hud-bottom-lbl">HDG</span></div>
      <div class="hud-bottom-item"><span class="hud-bottom-val" id="hud-baro-v">29.92</span><span class="hud-bottom-lbl">IN</span></div>
      <div class="hud-bottom-item"><span class="hud-bottom-val" id="bb-att">LEVEL</span><span class="hud-bottom-lbl">ATT</span></div>
    </div>
  </div>
  <div class="hud-tape-col">
    <div class="hud-header" style="text-align:right">ALTITUDE</div>
    <div class="hud-tape-section">
      <div class="hud-tape-wrapper">
        <div class="hud-tape-marks hud-tape-marks-right" id="hud-alt-marks" style="right:auto;left:-32px"></div>
        <div class="hud-tape">
          <div class="hud-tape-fill-alt" id="hud-alt-tape" style="height:50%"></div>
        </div>
      </div>
    </div>
    <div class="hud-value-row" style="justify-content:flex-end">
      <span class="hud-value-main" id="bb-alt-v">0</span>
    </div>
  </div>
</div>

<canvas id="flight-pfd" width="350" height="250" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);pointer-events:none"></canvas>
<div id="gps-map" style="position:absolute;top:4px;left:4px;width:216px;height:216px;border-radius:10px;overflow:hidden;box-shadow:0 0 20px rgba(0,255,128,.12);background:rgba(0,20,15,.6);pointer-events:auto;touch-action:none">
  <img id="gps-map-img" style="position:absolute;top:-50%;left:-50%;width:200%;height:200%;object-fit:cover;opacity:0.9;will-change:transform;pointer-events:none;user-select:none" draggable="false">
  <canvas id="gps-map-hdg" width="216" height="216" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
  <div id="gps-map-handle" title="Arrastar GPS" style="position:absolute;top:0;left:0;right:0;height:14px;background:linear-gradient(to bottom,rgba(80,255,160,.18),rgba(80,255,160,0));cursor:grab;display:flex;align-items:center;justify-content:center;font-size:8px;letter-spacing:.18em;color:rgba(100,240,180,.7);font-family:'Inter',sans-serif;text-shadow:0 0 4px rgba(0,0,0,.8);user-select:none">GPS &#x2022;&#x2022;&#x2022;</div>
  <div id="gps-coords" style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-size:8px;color:rgba(100,240,180,.6);font-family:'Inter',sans-serif;text-shadow:0 0 4px rgba(0,0,0,.8);white-space:nowrap;pointer-events:none"></div>
</div>

<div id="missions-btn" style="position:absolute;top:74px;right:14px;width:32px;height:32px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;transition:border-color .2s,box-shadow .2s" title="Missions">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#40ffaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="12,2 15,10 12,8 9,10"/><circle cx="12" cy="12" r="3"/></svg>
</div>

<div id="missions-panel" style="display:none;position:absolute;top:64px;right:54px;width:320px;max-height:400px;overflow-y:auto;background:rgba(2,10,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.3);border-radius:8px;padding:12px;pointer-events:auto;font-family:'Inter',sans-serif;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:300">
  <div style="font-family:'Orbitron',monospace;font-size:11px;color:#40ffaa;letter-spacing:.12em;margin-bottom:10px;border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:6px">MISSIONS</div>
  <div id="missions-list" style="font-size:11px;color:rgba(255,255,255,.7)">Loading...</div>
</div>

<div id="aircraft-btn" style="position:absolute;top:112px;right:14px;width:32px;height:32px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;transition:border-color .2s,box-shadow .2s" title="Aircraft">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#40ffaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l5-3v2h4l1-5h2l1 5h4v-2l5 3-5 3v-2h-4l-1 5h-2l-1-5H7v2z"/></svg>
</div>

<div id="aircraft-panel" style="display:none;position:absolute;top:102px;right:54px;width:320px;max-height:400px;overflow-y:auto;background:rgba(2,10,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.3);border-radius:8px;padding:12px;pointer-events:auto;font-family:'Inter',sans-serif;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:300">
  <div style="font-family:'Orbitron',monospace;font-size:11px;color:#40ffaa;letter-spacing:.12em;margin-bottom:10px;border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:6px">AIRCRAFT</div>
  <div id="aircraft-list" style="font-size:11px;color:rgba(255,255,255,.7)">Loading...</div>
</div>

<div id="flight-plans-btn" style="position:absolute;top:150px;right:14px;width:32px;height:32px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;transition:border-color .2s,box-shadow .2s" title="Flight Plans">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#40ffaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h4l3-4 4 4h7"/><path d="M3 17h4l3 4 4-4h7"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
</div>

<div id="flight-plans-panel" style="display:none;position:absolute;top:140px;right:54px;width:320px;max-height:400px;overflow-y:auto;background:rgba(2,10,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.3);border-radius:8px;padding:12px;pointer-events:auto;font-family:'Inter',sans-serif;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:300">
  <div style="font-family:'Orbitron',monospace;font-size:11px;color:#40ffaa;letter-spacing:.12em;margin-bottom:10px;border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:6px">FLIGHT PLANS</div>
  <div id="flight-plans-list" style="font-size:11px;color:rgba(255,255,255,.7)">Loading...</div>
</div>

<div id="nav-info" style="display:none;position:absolute;top:190px;left:4px;width:180px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:6px;padding:6px 8px;font-family:'Inter',sans-serif;color:#fff;font-size:10px;pointer-events:none;box-shadow:0 0 12px rgba(0,255,128,.1)">
  <div style="font-family:'Orbitron',monospace;font-size:8px;color:#40ffaa;letter-spacing:.15em;margin-bottom:3px">NAV</div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">DEST</span><span id="nav-dest" style="color:#fff">\u2014</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">DIST</span><span id="nav-dist" style="color:#40ffaa">\u2014 km</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">BRG</span><span id="nav-brg" style="color:#40ffaa">\u2014\u00B0</span></div>
</div>`;
        document.body.appendChild(hud);
        this.hudCanvas = document.getElementById('flight-pfd') as HTMLCanvasElement;
        this.hudCtx    = this.hudCanvas.getContext('2d')!;
        this.hudSpeedVal = document.getElementById('bb-spd-v')!;
        this.hudAltVal   = document.getElementById('bb-alt-v')!;
        this.hudThrottle = document.getElementById('bb-thr')!;
        this.hudThrPct   = document.getElementById('hud-thr-pct')!;
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

        this._navInfoEl = document.getElementById('nav-info');
        this._navDestEl = document.getElementById('nav-dest');
        this._navDistEl = document.getElementById('nav-dist');
        this._navBrgEl  = document.getElementById('nav-brg');

        this._initTapeMarks();
        this._initFlapBar();
        this._buildDebugPanel();
    }

    // ── Panel Management ────────────────────────────────────────────────────────

    private _closeAllPanels(except?: HTMLElement | null): void {
        const panels = [this._missionPanelEl, this._aircraftPanelEl, this._flightPlansPanelEl];
        const btns = [this._missionBtnEl, this._aircraftBtnEl, this._flightPlansBtnEl];
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (p && p !== except) {
                p.style.display = 'none';
                if (btns[i]) { btns[i]!.style.borderColor = 'rgba(80,255,160,.3)'; btns[i]!.style.boxShadow = 'none'; }
            }
        }
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

    private async _loadMissions(): Promise<void> {
        const listEl = document.getElementById('missions-list');
        if (!listEl) return;
        listEl.textContent = 'Loading...';

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

            if (!userMissions.length) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,.4)">No missions acquired</div>';
                this._activeMission = null;
                this._activeUserMissionId = null;
                this._activeMissionId = null;
                this._missionWaypoints = [];
                this._missionCurrentWpIndex = 0;
                return;
            }

            const sortedMissions = userMissions.slice().sort((a: any, b: any) => {
                const aInProg = a?.status === 'in_progress' ? 0 : 1;
                const bInProg = b?.status === 'in_progress' ? 0 : 1;
                if (aInProg !== bInProg) return aInProg - bInProg;
                return 0;
            });

            let html = '';
            for (const um of sortedMissions) {
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

            const activeFromList = sortedMissions.find((m: any) => m?.status === 'in_progress');
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
                const priceLabel = ac.price > 0 ? `${ac.price} pts` : 'FREE';
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
                el.addEventListener('click', async (e) => {
                    const aircraftId = Number((e.currentTarget as HTMLElement).getAttribute('data-acquire-aircraft'));
                    try {
                        const resp = await fetch(`/api/user-aircrafts/${aircraftId}/acquire`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ payment_method: 'points' }),
                        });
                        if (resp.ok) {
                            this._loadAircraftList();
                        } else {
                            const err = await resp.json();
                            console.error('[Aircraft] Acquire failed:', err.error);
                        }
                    } catch (err) {
                        console.error('[Aircraft] Acquire error:', err);
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

        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.shiftKey && e.code === 'KeyD') {
                panel.classList.toggle('hidden');
            }
        });

        document.getElementById('dbg-cr')!.addEventListener('input', (e: any) => {
            const v = parseFloat(e.target.value);
            if (this.camera) this.camera.radius = v;
            document.getElementById('dbg-crv')!.textContent = String(v);
        });

        document.getElementById('dbg-cb')!.addEventListener('input', (e: any) => {
            const v = parseFloat(e.target.value) / 100;
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
        const metersPerDegLon = 111320 * Math.cos(this.originLat * Math.PI / 180);
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

    private static readonly GPS_POS_STORAGE_KEY = 'gps-map-pos-v1';
    private static readonly GPS_DRAG_VIEWPORT_MARGIN_PX = 4;

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
                const pos = JSON.parse(saved) as { left?: number; top?: number };
                if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
                    gps.style.left = `${this._clampGpsX(pos.left as number, gps)}px`;
                    gps.style.top = `${this._clampGpsY(pos.top as number, gps)}px`;
                }
            }
        } catch (err) {
            console.warn('[GPS] Failed to read saved position:', err);
        }

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
            try {
                const rect = gps.getBoundingClientRect();
                localStorage.setItem(FlightSceneSimple.GPS_POS_STORAGE_KEY, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
            } catch (err) {
                console.warn('[GPS] Failed to save position:', err);
            }
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
        const onScreenPxPerDegLon = (256 * Math.pow(2, FlightSceneSimple.MAP_ZOOM) / 360)
            * (mapPxSize / FlightSceneSimple.MAP_REQUEST_SIZE_PX)
            * FlightSceneSimple.MAP_IMG_UPSCALE;
        const cosLat = Math.max(0.001, Math.cos(refLat * Math.PI / 180));
        const onScreenPxPerDegLat = onScreenPxPerDegLon / cosLat;
        const x = (lon - refLon) * onScreenPxPerDegLon;
        const y = -(lat - refLat) * onScreenPxPerDegLat;
        return { x, y, pxPerDegLon: onScreenPxPerDegLon, pxPerDegLat: onScreenPxPerDegLat };
    }

    private _updateMap(): void {
        if (!this.mapImg) return;
        const now = performance.now();
        const { lat, lon, hdg } = this._getCurrentLatLon();

        const cv = this.mapHeadingCanvas;
        const ctx = this._mapHdgCtx || (this._mapHdgCtx = cv.getContext('2d')!);
        if (!ctx) return;
        const cx = cv.width / 2;
        const cy = cv.height / 2;

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

        if (this.mapApiKey && needFetch) {
            this.mapLastUpdate = now;
            this._mapImgLat = lat;
            this._mapImgLon = lon;
            this._mapImgValid = true;
            this.mapImg.src = `https://maps.googleapis.com/maps/api/staticmap?center=${lat.toFixed(5)},${lon.toFixed(5)}&zoom=${FlightSceneSimple.MAP_ZOOM}&size=${FlightSceneSimple.MAP_REQUEST_SIZE_PX}x${FlightSceneSimple.MAP_REQUEST_SIZE_PX}&scale=1&maptype=satellite&key=${this.mapApiKey}`;
        }

        if (this._mapImgValid) {
            const drift = this._latLonToMapPx(lat, lon, this._mapImgLat, this._mapImgLon, cv.width);
            this.mapImg.style.transform = `translate(${(-drift.x).toFixed(2)}px, ${(-drift.y).toFixed(2)}px)`;
        }

        ctx.clearRect(0, 0, cv.width, cv.height);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(hdg * Math.PI / 180);

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
                const wpX = cx + p.x;
                const wpY = cy + p.y;

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
                const depX = cx + pDep.x;
                const depY = cy + pDep.y;
                const arrX = cx + pArr.x;
                const arrY = cy + pArr.y;

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
                const fpDepX = cx + pDep.x;
                const fpDepY = cy + pDep.y;
                const fpArrX = cx + pArr.x;
                const fpArrY = cy + pArr.y;

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

        const nav = this._activeFlightPlanNav ?? this._missionDestForNav();
        if (this._navInfoEl) {
            if (nav) {
                const distNm = this._haversineNm(lat, lon, nav.arrival_lat, nav.arrival_lon);
                const brgDeg = this._initialBearingDeg(lat, lon, nav.arrival_lat, nav.arrival_lon);
                if (this._navDestEl) this._navDestEl.textContent = nav.arrival_icao || '\u2014';
                if (this._navDistEl) this._navDistEl.textContent = `${Math.round(distNm * 1.852)} km`;
                if (this._navBrgEl)  this._navBrgEl.textContent  = `${Math.round(brgDeg)}\u00B0`;
                this._navInfoEl.style.display = 'block';
            } else {
                this._navInfoEl.style.display = 'none';
            }
        }

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

        const speedKmh = Math.round(this.velocity.length() * 3.6);
        const speedKts = Math.round(speedKmh * 0.539957);
        const pos = this.planeRoot.position;
        const altitudeM = Math.round(Math.max(0, pos.y));
        const altitudeFt = Math.round(altitudeM * 3.28084);
        const pct = Math.round(this.thrust * 100);

        const altitudeMslFt = Math.round(Math.max(0, this.refAlt + pos.y) * 3.28084);
        this.hudSpeedVal.textContent = String(speedKts);
        this.hudAltVal.textContent   = String(altitudeMslFt);
        this.hudThrottle.style.width = `${pct}%`;
        if (this.hudThrPct) this.hudThrPct.textContent = `${pct}%`;

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
        this.hudWarning.style.display =
            (this._spawnSnapFramesLeft <= 0 && speedKts < this.aircraftConfig.stall_speed_kts && aglM > STALL_WARNING_MIN_AGL_M) ? 'block' : 'none';

        this.hudFps.textContent =
            `${this.scene?.getEngine?.()?.getFps?.()?.toFixed(0) ?? '--'} FPS`;

        if (this.hudTasVal) this.hudTasVal.textContent = String(speedKts);

        if (this.hudRpmVal) this.hudRpmVal.textContent = String(Math.round(this.engineRpm));
        if (this.hudRpmNeedle) {
            const et = this.aircraftConfig.engine_type;
            const isProp = et === ENGINE_TYPE_PISTON || et === ENGINE_TYPE_TURBOPROP;
            const rpmMax = this.aircraftConfig.prop_rpm_max || 2700;
            const fraction = isProp
                ? (rpmMax > 0 ? this.engineRpm / rpmMax : 0)
                : this.enginePower;
            const clamped = Math.max(0, Math.min(1, fraction));
            const rpmAngle = -120 + clamped * 240;
            this.hudRpmNeedle.style.transform = `rotate(${rpmAngle}deg)`;
        }

        const fuelPct = this.aircraftConfig.fuel_capacity_kg > 0
            ? Math.round((this.fuelRemaining / this.aircraftConfig.fuel_capacity_kg) * 100)
            : 100;
        if (this.hudFuelVal) this.hudFuelVal.textContent = `${fuelPct}%`;

        const aoaDeg = Math.round(pitchDeg);
        if (this.hudAoaVal) this.hudAoaVal.textContent = `${aoaDeg}\u00B0`;

        const vsFpm = Math.round(this.velocity.y * 196.85);
        if (this.hudVsVal) this.hudVsVal.textContent = String(vsFpm);

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
            const hdgDeg = Math.round(((hdgRad * 180 / Math.PI) + 360) % 360);
            this.hudHdgVal.textContent = `${hdgDeg}\u00B0`;
        }

        this._updateTapeMarks(speedKts, altitudeFt);

        this._drawFlightHUD();
        this._updateMap();
        this._updateDebugReadouts();
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
