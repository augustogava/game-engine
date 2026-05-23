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

import {
    BUILD_VERSION,
    ENGINE_TYPE_PISTON,
    ENGINE_TYPE_TURBOPROP,
    ENGINE_TYPE_TURBOJET,
    ENGINE_TYPE_TURBOFAN,
    ENGINE_TYPE_ELECTRIC,
    FLAP_TYPE_PLAIN,
    FLAP_TYPE_SPLIT,
    FLAP_TYPE_SLOTTED,
    FLAP_TYPE_FOWLER,
    MAGNETO_OFF,
    MAGNETO_LEFT,
    MAGNETO_RIGHT,
    MAGNETO_BOTH,
    BEST_POWER_MIX,
    MAGNETO_SINGLE_FACTOR,
    GEAR_MAX_TRAVEL_M,
    GEAR_STATE_DOWN,
    GEAR_STATE_RETRACTING,
    GEAR_STATE_UP,
    GEAR_STATE_EXTENDING,
    GEAR_INSTANT_TRANSITION_MS,
    SPAWN_SNAP_FRAMES,
    AIRBORNE_MISSION_MIN_OFFSET_M,
    TERRAIN_RAY_HEIGHT_M,
    TERRAIN_RAY_LENGTH_M,
    SPAWN_TERRAIN_RAY_HEIGHT_M,
    SPAWN_TERRAIN_RAY_LENGTH_M,
    TERRAIN_HIT_ABOVE_LIMIT_M,
    TERRAIN_UNKNOWN_Y,
    GROUND_TERRAIN_SMOOTH_TAU_S,
    GROUND_TERRAIN_SMOOTH_SNAP_DELTA_M,
    NAV_LIGHT_REFERENCE_HALF_SPAN_M,
    NAV_LIGHT_MIN_SCALE,
    NAV_LIGHT_MAX_SCALE,
    NAV_LIGHT_CORE_DIAMETER_M,
    NAV_LIGHT_KIND_STATIC,
    NAV_LIGHT_KIND_STROBE,
    NAV_LIGHT_KIND_BEACON,
    NAV_LIGHT_KIND_ANTICOL,
    NAV_LIGHT_KIND_LANDING,
    NAV_BEACON_PERIOD_S,
    NAV_BEACON_ON_FRAC,
    NAV_STROBE_PERIOD_S,
    NAV_STROBE_PULSE_FRAC,
    NAV_STROBE_DOUBLE_GAP_S,
    NAV_ANTICOL_PERIOD_S,
    NAV_ANTICOL_ON_FRAC,
    FT_TO_M,
    METERS_PER_DEG_LAT,
    MAGVAR_C0,
    MAGVAR_C_LON,
    MAGVAR_C_LAT,
    MAGVAR_C_LON2,
    MAGVAR_C_LAT2,
    MAGVAR_C_LONLAT,
    RUNWAY_DEFAULT_WIDTH_FT,
    RUNWAY_COLLIDER_RADIUS_KM,
    RUNWAY_COLLIDER_Y_BIAS_M,
    RUNWAY_RENDERING_GROUP_ID,
    RUNWAY_COLLIDER_ALPHA,
    RUNWAY_COLLIDER_DIFFUSE,
    CAMERA_RADIUS_LENGTH_FACTOR,
    CAMERA_RADIUS_MIN_M,
    CAMERA_RADIUS_MAX_M,
    CAMERA_LOWER_RADIUS_LIMIT_M,
    CAMERA_UPPER_RADIUS_LIMIT_M,
    CAMERA_LOWER_RADIUS_AIRCRAFT_FACTOR,
    CAMERA_LOWER_RADIUS_HEIGHT_FACTOR,
    CAMERA_LOWER_RADIUS_FALLBACK_M,
    CAMERA_GROUND_CLEARANCE_M,
    CAMERA_BETA_SAFETY_EPSILON,
    ON_GROUND_AGL_M,
    STALL_WARNING_MIN_AGL_M,
    BANK_COMP_MIN_SIN,
    BANK_COMP_PITCH_GAIN,
    BANK_COMP_MAX_PITCH,
    WORLD_READY_TIMEOUT_MS,
    WORLD_READY_PROBE_HEIGHT_M,
    WORLD_READY_PROBE_LENGTH_M,
    JET_THRUST_LAPSE_EXPONENT,
    JET_THRUST_MACH_LAPSE_COEF,
    JET_THRUST_MACH_MIN_FACTOR,
    MACH_DRAG_RISE_START,
    MACH_DRAG_RISE_COEF,
    SPECIFIC_HEAT_RATIO_AIR,
    GAS_CONSTANT_AIR_J_PER_KG_K,
    ISA_TROPOPAUSE_TEMP_K,
    ISA_SEA_LEVEL_TEMP_K,
    ISA_LAPSE_RATE_K_PER_M,
    ISA_TROPOPAUSE_M,
    CONTROL_Q_REFERENCE_PA,
    SEA_LEVEL_AIR_DENSITY_KG_PER_M3,
    WIND_DEFAULT_DIRECTION_DEG,
    WIND_DEFAULT_SPEED_KT,
    WIND_ALTITUDE_GAIN_KT_PER_1000FT,
    WIND_MAX_SPEED_KT,
    KT_TO_MS,
    MS_TO_KT,
    STALL_AOA_WARNING_FRACTION,
    SPOILER_DEFAULT_DRAG_CD,
    SPOILER_DEFAULT_LIFT_LOSS,
    SPOILER_DEPLOY_RATE_PER_S,
    SPOILER_RETRACT_RATE_PER_S,
    TURB_FULL_AGL_M,
    TURB_FADE_AGL_M,
    TURB_MAX_GUST_MS,
    TURB_TAU_S,
    SPOOL_TAU_PISTON_S,
    SPOOL_TAU_TURBOPROP_S,
    SPOOL_TAU_ELECTRIC_S,
    SPOOL_TAU_JET_S,
    VNE_FALLBACK_MULT_OF_STALL,
    OVERSPEED_CLACKER_INTERVAL_MS,
    AIRCRAFT_CATEGORY_LIGHT,
    AIRCRAFT_CATEGORY_TURBOPROP,
    AIRCRAFT_CATEGORY_JET,
    AIRCRAFT_CATEGORY_HEAVY_JET,
    AIRCRAFT_CATEGORY_MILITARY,
    MMO_FALLBACK_BY_CATEGORY,
    MMO_FALLBACK_DEFAULT,
    GPWS_CALLOUT_FT,
    GPWS_MIN_VS_FOR_CALLOUT_FPM,
    GPWS_SINK_RATE_VS_FPM,
    GPWS_PULL_UP_VS_FPM,
    GPWS_CALLOUT_REPEAT_MS,
    GPWS_ALERT_DURATION_MS,
    GPWS_ALERT_TYPE_CALLOUT,
    GPWS_ALERT_TYPE_SINK,
    GPWS_ALERT_TYPE_PULL_UP,
    VAPOR_CONE_MACH_MIN,
    VAPOR_CONE_MACH_MAX,
    VAPOR_CONE_MAX_RATE,
    HEAT_HAZE_MAX_RATE,
    FLARE_OCCLUSION_CHECK_INTERVAL_MS,
    FLARE_OCCLUSION_SUN_DISTANCE_M,
    MOTION_BLUR_TRIGGER_G,
    MOTION_BLUR_MAX_STRENGTH,
    MOTION_BLUR_SAMPLES,
    COLOR_GRADE_NIGHT_TINT_R,
    COLOR_GRADE_NIGHT_TINT_G,
    COLOR_GRADE_NIGHT_TINT_B,
    COLOR_GRADE_SUNSET_TINT_R,
    COLOR_GRADE_SUNSET_TINT_G,
    COLOR_GRADE_SUNSET_TINT_B,
    COLOR_GRADE_DAY_TINT_R,
    COLOR_GRADE_DAY_TINT_G,
    COLOR_GRADE_DAY_TINT_B,
    COLOR_GRADE_CONTRAST_NIGHT,
    COLOR_GRADE_CONTRAST_DAY,
    COLOR_GRADE_SATURATION_NIGHT,
    COLOR_GRADE_SATURATION_DAY,
    WATER_PLANE_SIZE_M,
    WATER_PLANE_Y_OFFSET_M,
    WATER_NORMAL_RES,
    WATER_BUMP_URL,
    WATER_WIND_FORCE,
    WATER_WAVE_HEIGHT_M,
    WATER_BUMP_HEIGHT,
    WATER_WAVE_LENGTH_M,
    WATER_COLOR_R,
    WATER_COLOR_G,
    WATER_COLOR_B,
    WATER_COLOR_BLEND,
    AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS,
} from './flight/constants/index.js';

import { patchPbrMaxSimultaneousLightsProto } from './flight/physics/PbrPatch.js';

import {
    AP_HDG_MAX_BANK_DEG,
    AP_HDG_BANK_GAIN,
    AP_HDG_ROLL_RATE_GAIN,
    AP_ALT_PITCH_GAIN,
    AP_ALT_PITCH_MAX,
    AP_ALT_VS_DAMP_GAIN,
    AP_VS_PITCH_GAIN,
    AP_VS_PITCH_MAX,
    AP_VS_DEFAULT_FPM,
    AP_NAV_XTE_DEG_PER_NM,
    AP_NAV_MAX_INTERCEPT_DEG,
    AP_APR_GLIDESLOPE_DEG,
    AP_APR_MIN_ALT_FT,
    AP_INPUT_DISENGAGE_THRESHOLD,
    AUTOTRIM_RATE_PER_S,
    AUTOTRIM_MAX,
    AUTOTRIM_DEADBAND,
    CAMERA_MODE_CHASE,
    CAMERA_MODE_COCKPIT,
    CAMERA_MODE_EXTERNAL_FIXED,
    CAMERA_MODE_FLYBY,
    CAMERA_MODE_TOWER,
    CAMERA_MODE_COUNT,
    TOWER_CAMERA_HEIGHT_M,
    TOWER_CAMERA_MIN_RADIUS_M,
    TOWER_CAMERA_BETA_RAD,
    OVER_G_THRESHOLD,
    G_FORCE_SMOOTHING,
    HAPTIC_MIN_INTERVAL_MS,
    CINEMATIC_DURATION_MS,
    CINEMATIC_INITIAL_RADIUS_M,
    HUD_FADE_IN_MS,
    ENGINE_SOUND_FADE_IN_MS,
    MISSION_TOAST_VISIBLE_MS,
    MISSION_TOAST_FADE_MS,
    JOYSTICK_DEFAULT_RADIUS_PX,
    JOYSTICK_DEFAULT_DEADZONE_NORM,
    JOYSTICK_DEFAULT_EXPO,
    JOYSTICK_MAX_RADIUS_PX,
    JOYSTICK_MIN_RADIUS_PX,
    JOYSTICK_MAX_DEADZONE_NORM,
    JOYSTICK_MAX_EXPO,
    JOYSTICK_MIN_EXPO,
    PINCH_THROTTLE_PX_TO_DELTA,
    TWO_FINGER_SWIPE_MIN_PX,
    TWO_FINGER_DISTANCE_TOLERANCE_RATIO,
    CAMERA_CYCLE_COOLDOWN_MS,
    MIN_GS_FOR_ETE_MS,
    HDG_DELTA_GREEN_DEG,
    HDG_DELTA_AMBER_DEG,
    ALT_BAND_GREEN_FT,
    ALT_BAND_AMBER_FT,
    XTE_INDICATOR_MAX_NM,
    SUN_TEXTURE_PATH,
    MOON_TEXTURE_PATH,
    SUN_DIAMETER,
    SUN_HALO_SIZE,
    SUN_DISTANCE,
    SUN_ROTATION_RAD_PER_S,
    SUN_FADE_START_ELEV_DEG,
    SUN_FADE_END_ELEV_DEG,
    MOON_DIAMETER,
    MOON_HALO_SIZE,
    MOON_DISTANCE,
    MOON_FADE_ELEV_DEG,
    MOON_HALO_FADE_BAND_DEG,
    MOON_HALO_FADE_OFFSET_DEG,
    SUN_HALO_TEX_SIZE,
    MOON_HALO_TEX_SIZE,
    SKY_LUMINANCE_MAX,
    SKY_MIE_G_LOW_HORIZON,
    SKY_MIE_G_HIGH_SUN,
    SKY_MIE_G_TRANSITION_DEG,
    NIGHT_HORIZON_GLOW_R,
    NIGHT_HORIZON_GLOW_G,
    NIGHT_HORIZON_GLOW_B,
    NIGHT_HORIZON_GLOW_FADE_BAND_DEG,
    NIGHT_HORIZON_GLOW_OFFSET_DEG,
    CLOUD_TEXTURE_URL,
    CLOUD_WIND_HIGH_ELEV_DEG,
    CLOUD_KT_TO_MS,
    CLOUD_DAY_COLOR_R,
    CLOUD_DAY_COLOR_G,
    CLOUD_DAY_COLOR_B,
    CLOUD_SUNSET_COLOR_R,
    CLOUD_SUNSET_COLOR_G,
    CLOUD_SUNSET_COLOR_B,
    CLOUD_NIGHT_COLOR_R,
    CLOUD_NIGHT_COLOR_G,
    CLOUD_NIGHT_COLOR_B,
    CLOUD_SUNSET_FADE_BAND_DEG,
    CLOUD_NIGHT_FADE_BAND_DEG,
    CLOUD_NIGHT_FADE_OFFSET_DEG,
    CLOUD_ALPHA_MIN,
    CLOUD_ALPHA_MAX,
    CLOUD_DENSITY_MULT_LOW,
    CLOUD_DENSITY_MULT_MEDIUM,
    CLOUD_DENSITY_MULT_HIGH,
    CLOUD_DENSITY_MULT_ULTRA,
    CLOUD_VOLUMETRIC_PUFFS_PER_CLUSTER,
    CLOUD_VOLUMETRIC_PUFF_JITTER,
    CLOUD_VARIANT_COUNT,
    CLOUD_ASPECT_Y_JITTER_MIN,
    CLOUD_ASPECT_Y_JITTER_MAX,
    CLOUD_FLIP_X_PROBABILITY,
    OVERCAST_DECK_Y_M,
    OVERCAST_DECK_SIZE_M,
    OVERCAST_DECK_ALPHA,
    OVERCAST_TEXTURE_SIZE,
    OVERCAST_TEXTURE_TILES,
    OVERCAST_NOISE_FREQ,
    CLOUD_ALPHA_INDEX,
    OVERCAST_ALPHA_INDEX,
    TILE_PBR_ROUGHNESS_FLOOR,
    TILE_FADE_DURATION_S,
    AERIAL_FOG_ALT_FADE_REF_M,
    AERIAL_FOG_ALT_FADE_MIN_MULT,
    CLOUD_NEAR_FADE_NEAR_M,
    CLOUD_NEAR_FADE_FAR_M,
    CLOUD_WRAP_FADE_S,
    VEGETATION_GRID_HALF_M,
    VEGETATION_CELL_M,
    VEGETATION_MAX_INSTANCES,
    VEGETATION_FADE_BAND_M,
    VEGETATION_FADE_RANGE_M,
    VEGETATION_RESEED_DIST_M,
    VEGETATION_TREE_HEIGHT_M,
    VEGETATION_TREE_HALF_WIDTH_M,
    VOLUMETRIC_CLOUDS_NOISE_URL,
    VOLUMETRIC_CLOUDS_BLUE_NOISE_URL,
    VOLUMETRIC_CLOUDS_SHADER_URL,
    COLOR_LUT_URL,
    TREES_TEXTURE_BASE_URL,
    MILKY_WAY_BAND_COUNT,
    MILKY_WAY_BAND_DIST,
    MILKY_WAY_BAND_HALF_WIDTH_DEG,
    MILKY_WAY_BAND_TILT_DEG,
    BRIGHT_STAR_COUNT,
    BRIGHT_STAR_BASE_SIZE,
    BRIGHT_STAR_SIZE_RANDOM,
    BRIGHT_STAR_TWINKLE_AMOUNT,
} from './flight/constants/index.js';

import type { AircraftSurfaceConfig, AircraftConfig, RemotePlayer } from './flight/types/index.js';
import { DEFAULT_AIRCRAFT_CONFIG } from './flight/types/AircraftConfig.js';
import { fetchAircraftConfig, fetchSelectedAircraftConfig } from './flight/api/AircraftConfigApi.js';

import {
    G_ACCEL,
    GEAR_SPRING_K_MIN_N_PER_M,
    ANGULAR_DAMPING,
    GROUND_Y,
    CRASH_VS_THRESHOLD_MS,
    CRASH_GROUND_SPEED_MS,
    CRASH_GROUND_ATTITUDE_DEG,
    CRASH_METERS_TO_FEET,
    CRASH_MPS_TO_FPM,
    ISA_DELTA_TEMP_K_MAX,
    ISA_DELTA_TEMP_K_MIN,
} from './flight/constants/index.js';

import type { AeroSurface } from './flight/types/index.js';
import { getAirDensity, computeSurfaceForces } from './flight/physics/AeroPhysics.js';
import { getSunPosition } from './flight/physics/SolarPosition.js';
import * as NavMath from './flight/physics/NavMath.js';
import { WaterSystem } from './flight/systems/WaterSystem.js';
import { VegetationSystem } from './flight/systems/VegetationSystem.js';
import { NavLightsSystem } from './flight/systems/NavLightsSystem.js';
import { RunwayCollidersSystem } from './flight/systems/RunwayCollidersSystem.js';
import { VolumetricCloudsSystem } from './flight/systems/VolumetricCloudsSystem.js';
import { CameraSystem } from './flight/systems/CameraSystem.js';
import { PostProcessingSystem } from './flight/systems/PostProcessingSystem.js';
import { LightingSystem } from './flight/systems/LightingSystem.js';
import { CloudsSystem } from './flight/systems/CloudsSystem.js';
import { TerrainTilesSystem } from './flight/systems/TerrainTilesSystem.js';
import { AirportOverlaysSystem } from './flight/systems/AirportOverlaysSystem.js';
import { VfxSystem } from './flight/systems/VfxSystem.js';
import { AircraftConfigSystem } from './flight/systems/AircraftConfigSystem.js';
import { AircraftModelSystem } from './flight/systems/AircraftModelSystem.js';
import { SpawnSystem } from './flight/systems/SpawnSystem.js';
import { GpwsSystem } from './flight/systems/GpwsSystem.js';
import { AutopilotSystem } from './flight/systems/AutopilotSystem.js';
import { MultiplayerSystem } from './flight/systems/MultiplayerSystem.js';
import { MissionSystem } from './flight/systems/MissionSystem.js';
import { FlightPhysicsSystem } from './flight/systems/FlightPhysicsSystem.js';
import { MiniMapSystem } from './flight/systems/MiniMapSystem.js';
import { DebugPanelSystem } from './flight/systems/DebugPanelSystem.js';
import { InputSystem } from './flight/systems/InputSystem.js';
import { HudSystem } from './flight/systems/HudSystem.js';

// ── FlightSceneSimple ─────────────────────────────────────────────────────────
export class FlightSceneSimple extends Scene3D {
    /** @internal */ private readonly _waterSystem = new WaterSystem(this);
    /** @internal */ private readonly _vegetationSystem = new VegetationSystem(this);
    /** @internal */ private readonly _navLightsSystem = new NavLightsSystem(this);
    /** @internal */ private readonly _runwayCollidersSystem = new RunwayCollidersSystem(this);
    /** @internal */ private readonly _volumetricCloudsSystem = new VolumetricCloudsSystem(this);
    /** @internal */ private readonly _cameraSystem = new CameraSystem(this);
    /** @internal */ private readonly _postProcessingSystem = new PostProcessingSystem(this);
    /** @internal */ private readonly _lightingSystem = new LightingSystem(this);
    /** @internal */ private readonly _cloudsSystem = new CloudsSystem(this);
    /** @internal */ private readonly _terrainTilesSystem = new TerrainTilesSystem(this);
    /** @internal */ private readonly _airportOverlaysSystem = new AirportOverlaysSystem(this);
    /** @internal */ private _airportClipZones: { centerVec: BABYLON.Vector3; clipRadiusM: number; clipMaxAltM: number }[] = [];
    /** @internal */ private readonly _vfxSystem = new VfxSystem(this);
    /** @internal */ private readonly _aircraftConfigSystem = new AircraftConfigSystem(this);
    /** @internal */ private readonly _aircraftModelSystem = new AircraftModelSystem(this);
    /** @internal */ private readonly _spawnSystem = new SpawnSystem(this);
    /** @internal */ private readonly _gpwsSystem = new GpwsSystem(this);
    /** @internal */ private readonly _autopilotSystem = new AutopilotSystem(this);
    /** @internal */ private readonly _multiplayerSystem = new MultiplayerSystem(this);
    /** @internal */ private readonly _missionSystem = new MissionSystem(this);
    /** @internal */ private readonly _flightPhysicsSystem = new FlightPhysicsSystem(this);
    /** @internal */ private readonly _miniMapSystem = new MiniMapSystem(this);
    /** @internal */ private readonly _debugPanelSystem = new DebugPanelSystem(this);
    /** @internal */ private readonly _inputSystem = new InputSystem(this);
    /** @internal */ private readonly _hudSystem = new HudSystem(this);
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
    private hudEngine3Col: HTMLElement | null = null;
    private hudEngine4Col: HTMLElement | null = null;
    private hudRpmVal2:    HTMLElement | null = null;
    private hudRpmVal3:    HTMLElement | null = null;
    private hudRpmVal4:    HTMLElement | null = null;
    private hudRpmNeedle2: HTMLElement | null = null;
    private hudRpmNeedle3: HTMLElement | null = null;
    private hudRpmNeedle4: HTMLElement | null = null;
    private hudEng1Pct:    HTMLElement | null = null;
    private hudEng2Pct:    HTMLElement | null = null;
    private hudEng3Pct:    HTMLElement | null = null;
    private hudEng4Pct:    HTMLElement | null = null;
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
    private _apEditingField: 'hdg' | 'alt' | 'vs' | null = null;
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
    private _frameTick: number = 0;
    private _terrainPickFrameTick: number = -1;
    private _cachedTerrainHit: BABYLON.PickingInfo | null = null;
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
    private _pbrCapPluginObserver: BABYLON.Observer<any> | null = null;
    private _pbrCapPluginCompleteObservers: BABYLON.Observer<any>[] = [];
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
    /** @internal */ _ssaoAttached = true;
    private _shadowGen: BABYLON.CascadedShadowGenerator | null = null;

    private _premium = {
        tileShadows: false,
        aerialFog: false,
        tileFade: false,
        godRays: false,
        colorLut: false,
        cloudCameraFade: false,
        waterTilesRefl: false,
        fxaaFallback: false,
        vegetation: false,
        volumetricClouds: false,
    };
    private _fogColorBase: BABYLON.Color3 = new BABYLON.Color3(0.55, 0.7, 0.95);
    private _fogDensityBase: number = 0.000008;
    private _tileFadeEntries: Map<string, { meshes: BABYLON.AbstractMesh[]; t: number }> = new Map();
    private _vegetationTemplates: BABYLON.Mesh[] = [];
    private _vegetationMaterials: BABYLON.PBRMaterial[] = [];
    private _vegetationInstances: BABYLON.InstancedMesh[] = [];
    private _vegetationGridCenter: BABYLON.Vector3 = new BABYLON.Vector3(0, 0, 0);
    private _vegetationSeeded = false;
    private _vegetationVisibility = 1;
    private _vegetationBuilt = false;
    private _godRays: BABYLON.VolumetricLightScatteringPostProcess | null = null;
    private _colorLutTexture: BABYLON.BaseTexture | null = null;
    private _volumetricCloudsPost: BABYLON.PostProcess | null = null;
    private _volumetricNoiseTexture: BABYLON.Texture | null = null;
    private _volumetricBlueNoiseTexture: BABYLON.Texture | null = null;
    private _volumetricShaderRegistered = false;
    private _cloudWindOffset: { x: number; z: number } = { x: 0, z: 0 };

    private hudUtc!: HTMLElement;

    private _applyAircraftConfig(cfg: AircraftConfig): void {
        this._aircraftConfigSystem.applyAircraftConfig(cfg);
    }

    private _mapEngineType(et: number): number {
        return this._aircraftConfigSystem.mapEngineType(et);
    }

    private _updateEngineColumnsVisibility(): void {
        this._hudSystem.updateEngineColumnsVisibility();
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
        this._fogColorBase.copyFrom(scene.fogColor);
        this._fogDensityBase = scene.fogDensity;

        try {
            patchPbrMaxSimultaneousLightsProto();
        } catch (err) {
            console.warn('[FlightSimple] patchPbrMaxSimultaneousLightsProto failed:', err);
        }

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

        try {
            this._pbrCapPluginObserver = BABYLON.SceneLoader.OnPluginActivatedObservable.add((plugin: any) => {
                if (this._disposed) return;
                const obs = plugin?.onCompleteObservable;
                if (!obs || typeof obs.add !== 'function') return;
                const completeObs = obs.add(() => {
                    if (this._disposed || !this.scene) return;
                    try {
                        let cappedCount = 0;
                        for (const m of this.scene.materials) {
                            if (m instanceof BABYLON.PBRBaseMaterial) {
                                const pbr = m as BABYLON.PBRMaterial;
                                if (pbr.maxSimultaneousLights > AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS) {
                                    pbr.maxSimultaneousLights = AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS;
                                    cappedCount++;
                                }
                            }
                        }
                        if (cappedCount > 0) {
                            console.debug(`[FlightSimple] Re-capped maxSimultaneousLights=${AIRCRAFT_PBR_MAX_SIMULTANEOUS_LIGHTS} on ${cappedCount} PBR material(s) after GLB load`);
                        }
                    } catch (err) {
                        console.warn('[FlightSimple] Failed to re-cap PBR materials after GLB load:', err);
                    }
                });
                if (completeObs) this._pbrCapPluginCompleteObservers.push(completeObs);
            });
        } catch (err) {
            console.warn('[FlightSimple] Failed to register SceneLoader plugin activation observer:', err);
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
        this._airportOverlaysSystem.init(scene);
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
            this._fogColorBase.copyFrom(scene.fogColor);
            this._fogDensityBase = scene.fogDensity;
            this._buildWater(scene);
        }

    }

    update(dt: number): void {
        if (!this.spawned) return;
        this._frameTick++;
        if (this.tiles) this.tiles.update();
        if (this._premium.tileFade) this._updateTileFade(dt);
        this._airportOverlaysSystem.update(dt);
        if (this._premium.aerialFog && this.scene) this._applyAerialFogDensity(this.scene);
        if (this._premium.waterTilesRefl) this._updateWaterWind(dt);
        if (this._premium.vegetation) this._updateVegetation();
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
        this._aircraftModelSystem.updatePropellerAnim();
    }

    private _cockpitClick(freqHz?: number): void {
        this._inputSystem.cockpitClick(freqHz);
    }

    private _togglePause(): void {
        this._inputSystem.togglePause();
    }

    private _adjustTimeScale(direction: number): void {
        this._inputSystem.adjustTimeScale(direction);
    }

    private _showHudWarningOverlay(text: string, visible: boolean): void {
        this._hudSystem.showHudWarningOverlay(text, visible);
    }

    private _easyModeAssistEnabled(): boolean {
        return this._flightPhysicsSystem.easyModeAssistEnabled();
    }

    private _easyModeStabilization(): { pitch: number; roll: number } {
        return this._flightPhysicsSystem.easyModeStabilization();
    }

    private _easyModeAutoThrottle(dt: number): void {
        this._flightPhysicsSystem.easyModeAutoThrottle(dt);
    }

    private _toggleMouseYoke(): void {
        this._inputSystem.toggleMouseYoke();
    }

    private _setMouseYoke(active: boolean): void {
        this._inputSystem.setMouseYoke(active);
    }

    private _captureTowerCameraPosition(): void {
        this._cameraSystem.captureTowerCameraPosition();
    }

    private _toggleReplay(): void {
        this._inputSystem.toggleReplay();
    }

    private _convertSpeedKts(kts: number): { value: number; unit: string } {
        return this._hudSystem.convertSpeedKts(kts);
    }

    private _convertAltitudeFt(ft: number): { value: number; unit: string } {
        return this._hudSystem.convertAltitudeFt(ft);
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
        this._flightPhysicsSystem.toggleGear();
    }

    private _updateGearState(): void {
        this._flightPhysicsSystem.updateGearState();
    }

    onDispose(): void {
        this._disposed = true;
        this._clearAllPendingTimeouts();
        if (this._pbrCapPluginObserver) {
            try { BABYLON.SceneLoader.OnPluginActivatedObservable.remove(this._pbrCapPluginObserver); } catch (_) { /* ignore */ }
            this._pbrCapPluginObserver = null;
        }
        this._pbrCapPluginCompleteObservers = [];
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
        try { this._airportOverlaysSystem.dispose(); } catch (err) { console.warn('[FlightSimple] AirportOverlays dispose failed:', err); }
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
        for (const t of this._cloudTemplates) { try { t.dispose(); } catch (_) { /* ignore */ } }
        this._cloudTemplates = [];
        for (const mat of this._cloudMats) { try { mat.dispose(true, true); } catch (_) { /* ignore */ } }
        this._cloudMats = [];
        if (this._overcastMat) { try { this._overcastMat.dispose(true, true); } catch (_) { /* ignore */ } this._overcastMat = null; }
        if (this._overcastMesh) { try { this._overcastMesh.dispose(); } catch (_) { /* ignore */ } this._overcastMesh = null; }
        if (this._milkyWayRoot) { try { this._milkyWayRoot.dispose(); } catch (_) { /* ignore */ } this._milkyWayRoot = null; }
        if (this._shadowGen) { this._shadowGen.dispose(); this._shadowGen = null; }
        if (this.camera) this.camera.detachControl();
    }

    setFlightPlanSpawn(plan: any): void {
        this._missionSystem.setFlightPlanSpawn(plan);
    }

    setMissionSpawn(mission: any, userMissionId: number | null): void {
        this._missionSystem.setMissionSpawn(mission, userMissionId);
    }

    initMultiplayer(token: string, onAuthFailure?: () => void, onNoFlightHours?: () => void): void {
        this._multiplayerSystem.initMultiplayer(token, onAuthFailure, onNoFlightHours);
    }

    private _createRemotePlayer(id: string, modelFile?: string): RemotePlayer {
        return this._multiplayerSystem.createRemotePlayer(id, modelFile);
    }

    private _resolveRemoteEngineType(remote: RemotePlayer, aircraftId: number | undefined): void {
        this._multiplayerSystem.resolveRemoteEngineType(remote, aircraftId);
    }

    private _loadRemoteModel(id: string, root: BABYLON.TransformNode, remote: RemotePlayer, modelFile: string): void {
        this._multiplayerSystem.loadRemoteModel(id, root, remote, modelFile);
    }

    private _buildRemoteFallback(id: string, root: BABYLON.TransformNode, remote: RemotePlayer): void {
        this._multiplayerSystem.buildRemoteFallback(id, root, remote);
    }

    private static readonly LABEL_TEX_W = 256;
    private static readonly LABEL_TEX_H = 80;
    private static readonly LABEL_AVATAR_SIZE = 48;
    private static readonly LABEL_PLANE_WIDTH = 18;
    private static readonly LABEL_PLANE_HEIGHT = 5.6;
    private static readonly LABEL_Y_OFFSET = 10;

    private _createPlayerLabel(remote: RemotePlayer, username: string, avatarUrl: string | null): void {
        this._multiplayerSystem.createPlayerLabel(remote, username, avatarUrl);
    }

    private _drawPlayerLabel(tex: BABYLON.DynamicTexture, username: string, avatarImg: HTMLImageElement | null): void {
        this._multiplayerSystem.drawPlayerLabel(tex, username, avatarImg);
    }

    private _loadAvatarAndRedraw(tex: BABYLON.DynamicTexture, username: string, avatarUrl: string): void {
        this._multiplayerSystem.loadAvatarAndRedraw(tex, username, avatarUrl);
    }

    private _updatePlayerLabel(remote: RemotePlayer, state: PlayerState): void {
        this._multiplayerSystem.updatePlayerLabel(remote, state);
    }

    private _latLonToLocal(lat: number, lon: number, alt: number): BABYLON.Vector3 {
        const metersPerDegLat = 111320;
        const metersPerDegLon = 111320 * Math.cos(this.originLat * Math.PI / 180);
        const x = (lon - this.originLon) * metersPerDegLon;
        const z = -(lat - this.originLat) * metersPerDegLat;
        return new BABYLON.Vector3(x, alt - this.refAlt, z);
    }

    private _updateRemotePlayers(): void {
        this._multiplayerSystem.updateRemotePlayers();
    }

    private _sendOwnState(): void {
        this._multiplayerSystem.sendOwnState();
    }

    private _checkWaypointProgress(lat: number, lon: number): void {
        this._missionSystem.checkWaypointProgress(lat, lon);
    }

    private _completeActiveMission(): Promise<void> {
        return this._missionSystem.completeActiveMission();
    }

    private _showMissionCompleteToast(missionTitle: string): void {
        this._missionSystem.showMissionCompleteToast(missionTitle);
    }

    // ── 3D Tiles (Step 1: just load, no coord changes) ────────────────────────

    private _init3DTiles(scene: BABYLON.Scene): void {
        this._terrainTilesSystem.init3DTiles(scene);
    }

    private _attachTilesVisualHandlers(): void {
        this._terrainTilesSystem.attachTilesVisualHandlers();
    }

    private _updateTileFade(dt: number): void {
        this._terrainTilesSystem.updateTileFade(dt);
    }

    private _applyAerialFogDensity(scene: BABYLON.Scene): void {
        this._terrainTilesSystem.applyAerialFogDensity(scene);
    }

    // ── Lighting ─────────────────────────────────────────────────────────────

    private _setupLighting(scene: BABYLON.Scene): void {
        this._lightingSystem.setupLighting(scene);
    }

    private _buildSunMesh(scene: BABYLON.Scene): void {
        this._lightingSystem.buildSunMesh(scene);
    }

    private _buildSunHalo(scene: BABYLON.Scene): void {
        this._lightingSystem.buildSunHalo(scene);
    }

    private _buildStars(scene: BABYLON.Scene): void {
        this._lightingSystem.buildStars(scene);
    }

    private _buildMoon(scene: BABYLON.Scene): void {
        this._lightingSystem.buildMoon(scene);
    }

    private _buildMoonHalo(scene: BABYLON.Scene): void {
        this._lightingSystem.buildMoonHalo(scene);
    }

    private _updateStarTwinkle(dt: number): void {
        this._lightingSystem.updateStarTwinkle(dt);
    }

    private _getSimDate(): Date {
        return this._lightingSystem.getSimDate();
    }

    private _applyDayNightCycle(scene: BABYLON.Scene): void {
        this._lightingSystem.applyDayNightCycle(scene);
    }

    private _buildSkybox(scene: BABYLON.Scene): void {
        this._lightingSystem.buildSkybox(scene);
    }

    private _applyHdrEnvironment(scene: BABYLON.Scene, hdrName: string): void {
        this._lightingSystem.applyHdrEnvironment(scene, hdrName);
    }

    // ── Clouds ─────────────────────────────────────────────────────────────────

    private cloudInstances: { mesh: BABYLON.InstancedMesh; yBase: number; spread: number; windMult: number; wrapFade: number; baseScaleX: number; baseScaleY: number }[] = [];
    private _cloudMats: BABYLON.StandardMaterial[] = [];
    private _cloudTemplates: BABYLON.Mesh[] = [];

    private _buildClouds(scene: BABYLON.Scene): void {
        this._cloudsSystem.buildClouds(scene);
    }

    private _rebuildClouds(scene: BABYLON.Scene): void {
        this._cloudsSystem.rebuildClouds(scene);
    }

    private _buildOvercastTexture(scene: BABYLON.Scene): BABYLON.DynamicTexture {
        return this._cloudsSystem.buildOvercastTexture(scene);
    }

    private _setOvercast(scene: BABYLON.Scene, enabled: boolean): void {
        this._cloudsSystem.setOvercast(scene, enabled);
    }

    private _setMilkyWay(scene: BABYLON.Scene, enabled: boolean): void {
        this._cloudsSystem.setMilkyWay(scene, enabled);
    }

    private _updateClouds(dt: number): void {
        this._cloudsSystem.updateClouds(dt);
    }

    private _applyCloudTint(elevation: number): void {
        this._cloudsSystem.applyCloudTint(elevation);
    }

    // ── Ground ────────────────────────────────────────────────────────────────

    private _buildGround(scene: BABYLON.Scene): void {
        this._terrainTilesSystem.buildGround(scene);
    }

    private _buildWater(scene: BABYLON.Scene): void {
        this._waterSystem.buildWater(scene);
    }

    private _disposeWater(): void {
        this._waterSystem.disposeWater();
    }

    // ── Airplane ──────────────────────────────────────────────────────────────

    private _buildPlane(scene: BABYLON.Scene): void {
        this._aircraftModelSystem.buildPlane(scene);
    }

    private _loadedModelMeshes: BABYLON.AbstractMesh[] = [];
    private _loadedAnimGroups: BABYLON.AnimationGroup[] = [];
    private _propellerAnimGroup: BABYLON.AnimationGroup | null = null;
    private _modelLoadVersion = 0;

    private _loadAircraftModel(scene: BABYLON.Scene): void {
        this._aircraftModelSystem.loadAircraftModel(scene);
    }

    private _buildFallbackMesh(scene: BABYLON.Scene): void {
        this._aircraftModelSystem.buildFallbackMesh(scene);
    }

    private _buildNavLights(
        scene: BABYLON.Scene,
        parent: BABYLON.TransformNode,
        dims: { halfSpan: number; height: number; halfLen: number; center?: BABYLON.Vector3; wingY?: number },
    ): void {
        this._navLightsSystem.buildNavLights(scene, parent, dims);
    }

    private _disposeNavLights(): void {
        this._navLightsSystem.disposeNavLights();
    }

    private async _buildNearbyRunwayColliders(centerLat: number, centerLon: number): Promise<void> {
        return this._runwayCollidersSystem.buildNearbyRunwayColliders(centerLat, centerLon);
    }

    private _buildRunwayCollider(r: any, icao: string): boolean {
        return this._runwayCollidersSystem.buildRunwayCollider(r, icao);
    }

    private _disposeRunwayColliders(): void {
        this._runwayCollidersSystem.disposeRunwayColliders();
    }

    private _pickTerrainPreferRunway(ray: BABYLON.Ray): BABYLON.PickingInfo | null {
        return this._runwayCollidersSystem.pickTerrainPreferRunway(ray);
    }

    private _detectControlSurfaceNodes(meshes: BABYLON.AbstractMesh[]): void {
        this._aircraftModelSystem.detectControlSurfaceNodes(meshes);
    }

    private _setNodeRotationX(nodes: BABYLON.TransformNode[], rad: number): void {
        this._aircraftModelSystem.setNodeRotationX(nodes, rad);
    }

    private _setNodeRotationY(nodes: BABYLON.TransformNode[], rad: number): void {
        this._aircraftModelSystem.setNodeRotationY(nodes, rad);
    }

    private _updateControlSurfaceAnim(): void {
        this._aircraftModelSystem.updateControlSurfaceAnim();
    }

    private _buildContrails(scene: BABYLON.Scene, halfSpan: number): void {
        this._vfxSystem.buildContrails(scene, halfSpan);
    }

    private _disposeContrails(): void {
        this._vfxSystem.disposeContrails();
    }

    private _buildVaporCone(scene: BABYLON.Scene): void {
        this._vfxSystem.buildVaporCone(scene);
    }

    private _disposeVaporCone(): void {
        this._vfxSystem.disposeVaporCone();
    }

    private _updateVaporCone(): void {
        this._vfxSystem.updateVaporCone();
    }

    private _buildHeatHaze(scene: BABYLON.Scene): void {
        this._vfxSystem.buildHeatHaze(scene);
    }

    private _disposeHeatHaze(): void {
        this._vfxSystem.disposeHeatHaze();
    }

    private _updateHeatHaze(): void {
        this._vfxSystem.updateHeatHaze();
    }

    private _updateLensFlareOcclusion(dtMs: number): void {
        this._vfxSystem.updateLensFlareOcclusion(dtMs);
    }

    private _updateColorGrading(elevationDeg: number): void {
        this._vfxSystem.updateColorGrading(elevationDeg);
    }

    private _ensureMotionBlur(active: boolean): void {
        this._vfxSystem.ensureMotionBlur(active);
    }

    private _updateMotionBlurAndDof(): void {
        this._vfxSystem.updateMotionBlurAndDof();
    }

    private _updateContrails(_dt: number): void {
        this._vfxSystem.updateContrails(_dt);
    }

    private _playAlertBeep(freq: number, durationMs: number, type: OscillatorType = 'sine', gain: number = 0.18): void {
        this._gpwsSystem.playAlertBeep(freq, durationMs, type, gain);
    }

    private _resolveMmo(): number {
        return this._gpwsSystem.resolveMmo();
    }

    private _updateOverspeed(speedKtsIas: number, mach: number): void {
        this._gpwsSystem.updateOverspeed(speedKtsIas, mach);
    }

    private _updateGPWS(aglFt: number, vsFpm: number): void {
        this._gpwsSystem.updateGPWS(aglFt, vsFpm);
    }

    private _apCurrentNavTarget(): { lat: number; lon: number } | null {
        return this._autopilotSystem.apCurrentNavTarget();
    }

    private _magneticVariationDeg(lat: number, lon: number): number {
        return this._autopilotSystem.magneticVariationDeg(lat, lon);
    }

    private _apCurrentLatLon(): { lat: number; lon: number } | null {
        return this._autopilotSystem.apCurrentLatLon();
    }

    private _updateAutopilot(dt: number): void {
        this._autopilotSystem.updateAutopilot(dt);
    }

    private _engageAutopilotMaster(): void {
        this._autopilotSystem.engageAutopilotMaster();
    }

    private _engageAutopilotHdgHold(forceOn: boolean = false): void {
        this._autopilotSystem.engageAutopilotHdgHold(forceOn);
    }

    private _engageAutopilotAltHold(forceOn: boolean = false): void {
        this._autopilotSystem.engageAutopilotAltHold(forceOn);
    }

    private _engageAutopilotVsHold(forceOn: boolean = false): void {
        this._autopilotSystem.engageAutopilotVsHold(forceOn);
    }

    private _engageAutopilotNavHold(forceOn: boolean = false): void {
        this._autopilotSystem.engageAutopilotNavHold(forceOn);
    }

    private _engageAutopilotAprHold(forceOn: boolean = false): void {
        this._autopilotSystem.engageAutopilotAprHold(forceOn);
    }

    private _adjustAutopilotVsTarget(deltaFpm: number): void {
        this._autopilotSystem.adjustAutopilotVsTarget(deltaFpm);
    }

    private _adjustAutopilotAltTarget(deltaFt: number): void {
        this._autopilotSystem.adjustAutopilotAltTarget(deltaFt);
    }

    private _adjustAutopilotHdgTarget(deltaDeg: number): void {
        this._autopilotSystem.adjustAutopilotHdgTarget(deltaDeg);
    }

    private _wireAutopilotPanel(): void {
        this._autopilotSystem.wireAutopilotPanel();
    }

    private _wireApKnob(knobId: string, field: 'hdg' | 'alt' | 'vs'): void {
        this._autopilotSystem.wireApKnob(knobId, field);
    }

    private _wireApTargetEdit(spanId: string, field: 'hdg' | 'alt' | 'vs'): void {
        this._autopilotSystem.wireApTargetEdit(spanId, field);
    }

    private _beginApTargetEdit(span: HTMLElement, field: 'hdg' | 'alt' | 'vs'): void {
        this._autopilotSystem.beginApTargetEdit(span, field);
    }

    private _updateAutopilotPanel(): void {
        this._autopilotSystem.updateAutopilotPanel();
    }

    private _maybeDisengageAutopilotByInput(): void {
        this._autopilotSystem.maybeDisengageAutopilotByInput();
    }

    private _updateNavLights(dt: number): void {
        this._navLightsSystem.updateNavLights(dt);
    }

    // ── Camera ────────────────────────────────────────────────────────────────

    private _buildCamera(scene: BABYLON.Scene): void {
        this._cameraSystem.buildCamera(scene);
    }

    // ── Post-Processing ───────────────────────────────────────────────────────

    private _setupPostProcessing(scene: BABYLON.Scene): void {
        this._postProcessingSystem.setupPostProcessing(scene);
    }

    // ── Premium Visual Helpers ────────────────────────────────────────────────

    private _setGodRays(scene: BABYLON.Scene, enabled: boolean): void {
        this._vfxSystem.setGodRays(scene, enabled);
    }

    private _setWaterTilesReflection(enabled: boolean): void {
        this._waterSystem.setWaterTilesReflection(enabled);
    }

    private _waterWindTimer = 0;
    private _waterWindDir: BABYLON.Vector2 = new BABYLON.Vector2(0, 1);
    private _updateWaterWind(dt: number): void {
        this._waterSystem.updateWaterWind(dt);
    }

    private _setFxaaFallback(enabled: boolean): void {
        this._vfxSystem.setFxaaFallback(enabled);
    }

    private _setVegetation(scene: BABYLON.Scene, enabled: boolean): void {
        this._vegetationSystem.setVegetation(scene, enabled);
    }

    private _buildVegetation(scene: BABYLON.Scene): void {
        this._vegetationSystem.buildVegetation(scene);
    }

    private _clearVegetationInstances(): void {
        this._vegetationSystem.clearVegetationInstances();
    }

    private _seedVegetation(): void {
        this._vegetationSystem.seedVegetation();
    }

    private _updateVegetation(): void {
        this._vegetationSystem.updateVegetation();
    }

    private async _registerVolumetricShader(): Promise<boolean> {
        return this._volumetricCloudsSystem.registerVolumetricShader();
    }

    private _setVolumetricClouds(scene: BABYLON.Scene, enabled: boolean): void {
        this._volumetricCloudsSystem.setVolumetricClouds(scene, enabled);
    }

    private _setColorLut(scene: BABYLON.Scene, enabled: boolean): void {
        this._vfxSystem.setColorLut(scene, enabled);
    }

    private _initUxSettings(): void {
        this._hudSystem.initUxSettings();
    }

    private _buildKeymapList(): void {
        this._hudSystem.buildKeymapList();
    }

    private _initF12Screenshot(): void {
        this._inputSystem.initF12Screenshot();
    }

    private _takeScreenshot(): void {
        this._hudSystem.takeScreenshot();
    }

    private _showToast(message: string, durationMs: number = 2200): void {
        this._hudSystem.showToast(message, durationMs);
    }

    private _installGamepadListeners(): void {
        this._inputSystem.installGamepadListeners();
    }

    private _buildChecklistOverlay(): void {
        this._hudSystem.buildChecklistOverlay();
    }

    private _buildFpsLatencyOverlay(): void {
        this._hudSystem.buildFpsLatencyOverlay();
    }

    private _applyAccessibility(): void {
        this._hudSystem.applyAccessibility();
    }

    private _makeDraggable(el: HTMLElement): void {
        this._debugPanelSystem.makeDraggable(el);
    }

    private _refreshKeysHelper(): void {
        this._hudSystem.refreshKeysHelper();
    }

    private _updateChecklistOverlay(speedKts: number, aglFt: number, vsFpm: number, gearDown: boolean, flapsDown: boolean): void {
        this._hudSystem.updateChecklistOverlay(speedKts, aglFt, vsFpm, gearDown, flapsDown);
    }

    private _updateFpsLatencyOverlay(): void {
        this._hudSystem.updateFpsLatencyOverlay();
    }

    private _initAudioSettings(): void {
        this._hudSystem.initAudioSettings();
    }

    private _initGraphicsSettings(scene: BABYLON.Scene): void {
        this._hudSystem.initGraphicsSettings(scene);
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    private _handleInput(_dt: number): void {
        this._inputSystem.handleInput(_dt);
    }

    private _setupTouchControls(): void {
        this._inputSystem.setupTouchControls();
    }

    private _triggerCrash(reason: string = 'unknown'): void {
        this._flightPhysicsSystem.triggerCrash(reason);
    }

    private _tickWorldReadyProbe(): void {
        this._spawnSystem.tickWorldReadyProbe();
    }

    private _onWorldReady(): void {
        this._spawnSystem.onWorldReady();
    }

    private _maybeFireSpawned(): void {
        this._spawnSystem.maybeFireSpawned();
    }

    private _spawnPlane(forceGround: boolean = false): void {
        this._spawnSystem.spawnPlane(forceGround);
    }

    private _initTapeMarks(): void {
        this._hudSystem.initTapeMarks();
    }

    private _updateTapeMarks(speedKts: number, altitudeFt: number): void {
        this._hudSystem.updateTapeMarks(speedKts, altitudeFt);
    }
    private _initFlapBar(): void {}
    private _updateFlapDisplay(): void {}

    private _applySpoilers(dt: number, gearOnGround: boolean): void {
        this._flightPhysicsSystem.applySpoilers(dt, gearOnGround);
    }

    private _toggleSpoilers(): void {
        this._flightPhysicsSystem.toggleSpoilers();
    }

    private _armGroundSpoilers(): void {
        this._flightPhysicsSystem.armGroundSpoilers();
    }

    private _killEngine(engineIdx: number): void {
        this._flightPhysicsSystem.killEngine(engineIdx);
    }

    private _resetEngines(): void {
        this._flightPhysicsSystem.resetEngines();
    }

    private _applyFlaps(dt: number): void {
        this._flightPhysicsSystem.applyFlaps(dt);
    }

    // ── Aerodynamic surfaces ────────────────────────────────────────────────────

    private _initSurfaces(): void {
        this._aircraftConfigSystem.initSurfaces();
    }

    // ── Physics (component-based aero with substep) ───────────────────────────

    private _applyPhysics(dt: number): void {
        this._flightPhysicsSystem.applyPhysics(dt);
    }

    private _clampCameraAboveGround(): void {
        this._cameraSystem.clampCameraAboveGround();
    }

    // ── HUD ───────────────────────────────────────────────────────────────────

    private _buildHUD(): void {
        this._hudSystem.buildHUD();
    }

    // ── Panel Management ────────────────────────────────────────────────────────

    private _pinnedPanels = new Set<string>();
    private _minimizedPanels = new Set<string>();
    private _panelDragState: { panel: HTMLElement; offsetX: number; offsetY: number; pointerId: number } | null = null;
    private _panelResizeState: { panel: HTMLElement; startW: number; startH: number; startX: number; startY: number; pointerId: number } | null = null;
    private static readonly PANEL_STATE_STORAGE_KEY = 'flight_panels_v1';

    private _closeAllPanels(except?: HTMLElement | null): void {
        this._debugPanelSystem.closeAllPanels(except);
    }

    private _persistPanelState(): void {
        this._debugPanelSystem.persistPanelState();
    }

    private _restorePanelState(): void {
        this._debugPanelSystem.restorePanelState();
    }

    private _setupPanelControls(): void {
        this._debugPanelSystem.setupPanelControls();
    }

    private _wirePanelDrag(panel: HTMLElement, handle: HTMLElement): void {
        this._debugPanelSystem.wirePanelDrag(panel, handle);
    }

    private _wirePanelResize(panel: HTMLElement, handle: HTMLElement): void {
        this._debugPanelSystem.wirePanelResize(panel, handle);
    }

    private _togglePanelMinimize(id: string): void {
        this._debugPanelSystem.togglePanelMinimize(id);
    }

    private _togglePanelPin(id: string): void {
        this._debugPanelSystem.togglePanelPin(id);
    }

    // ── Missions Button ─────────────────────────────────────────────────────────

    private _setupMissionsBtn(): void {
        this._missionSystem.setupMissionsBtn();
    }

    /** @internal */ _missionsCache: any[] = [];
    /** @internal */ _missionsSearchWired = false;

    private _wireMissionsToolbar(): void {
        this._missionSystem.wireMissionsToolbar();
    }

    private _loadMissions(): Promise<void> {
        return this._missionSystem.loadMissions();
    }

    private _renderMissionsList(): void {
        this._missionSystem.renderMissionsList();
    }

    // ── Flight Plans Button ────────────────────────────────────────────────────

    private _setupFlightPlansBtn(): void {
        this._missionSystem.setupFlightPlansBtn();
    }

    private _loadFlightPlans(): Promise<void> {
        return this._missionSystem.loadFlightPlans();
    }

    private _patchFlightPlanStatus(planId: number, status: string): Promise<void> {
        return this._missionSystem.patchFlightPlanStatus(planId, status);
    }

    // ── Aircraft Button ──────────────────────────────────────────────────────────

    private _setupAircraftBtn(): void {
        this._aircraftConfigSystem.setupAircraftBtn();
    }

    private _loadAircraftList(): Promise<void> {
        return this._aircraftConfigSystem.loadAircraftList();
    }

    private _switchAircraft(aircraftId: number): Promise<void> {
        return this._aircraftConfigSystem.switchAircraft(aircraftId);
    }

    // ── Debug Panel ───────────────────────────────────────────────────────────

    private _buildDebugPanel(): void {
        this._debugPanelSystem.buildDebugPanel();
    }

    private _applyDebugRotation(): void {
        this._debugPanelSystem.applyDebugRotation();
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
        return NavMath.formatEteMin(eteMin);
    }

    private _formatEtaUtc(simTimeMs: number, eteMin: number): string {
        return NavMath.formatEtaUtc(simTimeMs, eteMin);
    }

    private _setText(id: string, text: string): void {
        this._hudSystem.setText(id, text);
    }

    private _setHtml(id: string, html: string): void {
        this._hudSystem.setHtml(id, html);
    }

    private _setStyle(id: string, prop: string, value: string): void {
        this._hudSystem.setStyle(id, prop, value);
    }

    private _updateNavInfo(lat: number, lon: number): void {
        this._hudSystem.updateNavInfo(lat, lon);
    }

    private _haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
        return NavMath.haversineNm(lat1, lon1, lat2, lon2);
    }

    private _initialBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
        return NavMath.initialBearingDeg(lat1, lon1, lat2, lon2);
    }

    private _getWindAtAltitude(altFt: number): { speedKt: number; dirDeg: number } {
        return this._flightPhysicsSystem.getWindAtAltitude(altFt);
    }

    private _getWindVectorWorldRef(altMslFt: number, out: BABYLON.Vector3): void {
        this._flightPhysicsSystem.getWindVectorWorldRef(altMslFt, out);
    }

    private _updateTurbulence(dt: number, aglM: number): void {
        this._flightPhysicsSystem.updateTurbulence(dt, aglM);
    }

    private _computeXteNm(prevLat: number, prevLon: number, nextLat: number, nextLon: number, curLat: number, curLon: number): number {
        return NavMath.computeXteNm(prevLat, prevLon, nextLat, nextLon, curLat, curLon);
    }

    private _setCameraMode(mode: number): void {
        this._cameraSystem.setCameraMode(mode);
    }

    private _cycleCameraMode(): void {
        this._cameraSystem.cycleCameraMode();
    }

    private static readonly CONTROL_SETTINGS_STORAGE_KEY = 'flight_controls_v1';

    private _loadControlSettings(): void {
        this._inputSystem.loadControlSettings();
    }

    private _persistControlSettings(): void {
        this._inputSystem.persistControlSettings();
    }

    private _doHaptic(pattern: number | number[]): void {
        this._inputSystem.doHaptic(pattern);
    }

    private _installUserGestureListener(): void {
        this._inputSystem.installUserGestureListener();
    }

    private _removeUserGestureListener(): void {
        this._inputSystem.removeUserGestureListener();
    }

    private _safeSetTimeout(cb: () => void, ms: number): number {
        return this._inputSystem.safeSetTimeout(cb, ms);
    }

    private _clearAllPendingTimeouts(): void {
        this._inputSystem.clearAllPendingTimeouts();
    }

    private static readonly GPS_POS_STORAGE_KEY = 'gps-map-pos-v1';
    private static readonly GPS_DRAG_VIEWPORT_MARGIN_PX = 4;

    private _persistGpsState(gps: HTMLElement): void {
        this._miniMapSystem.persistGpsState(gps);
    }

    private _updateZoomIndicator(): void {
        this._miniMapSystem.updateZoomIndicator();
    }

    private _updateMapModeIndicator(): void {
        this._miniMapSystem.updateMapModeIndicator();
    }

    private _toggleMapHeadingUp(gps: HTMLElement): void {
        this._miniMapSystem.toggleMapHeadingUp(gps);
    }

    private _changeMapZoom(delta: number, gps: HTMLElement): void {
        this._miniMapSystem.changeMapZoom(delta, gps);
    }

    private _setupMinimapDrag(): void {
        this._miniMapSystem.setupMinimapDrag();
    }

    private _clampGpsX(x: number, gps: HTMLElement): number {
        return this._miniMapSystem.clampGpsX(x, gps);
    }

    private _clampGpsY(y: number, gps: HTMLElement): number {
        return this._miniMapSystem.clampGpsY(y, gps);
    }

    private _latLonToMapPx(lat: number, lon: number, refLat: number, refLon: number, mapPxSize: number): { x: number; y: number; pxPerDegLon: number; pxPerDegLat: number } {
        return this._miniMapSystem.latLonToMapPx(lat, lon, refLat, refLon, mapPxSize);
    }

    private _ensureMapImgListeners(): void {
        this._miniMapSystem.ensureMapImgListeners();
    }

    private _removeMapImgListeners(): void {
        this._miniMapSystem.removeMapImgListeners();
    }

    private _updateMap(): void {
        this._miniMapSystem.updateMap();
    }

    // ── HUD Update ────────────────────────────────────────────────────────────

    private _updateHUD(): void {
        this._hudSystem.updateHUD();
    }

    private _drawFlightHUD(): void {
        this._hudSystem.drawFlightHUD();
    }

    private _updateDebugReadouts(): void {
        this._debugPanelSystem.updateDebugReadouts();
    }
}
