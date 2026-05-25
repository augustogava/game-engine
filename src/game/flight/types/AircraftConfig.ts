import {
    ENGINE_TYPE_TURBOFAN,
    FLAP_TYPE_SLOTTED,
} from '../constants/index.js';

export interface AircraftSurfaceConfig {
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

export interface AircraftConfig {
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
    gear_retractable?: boolean | null;
}

export const DEFAULT_AIRCRAFT_CONFIG: AircraftConfig = {
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
    gear_retractable: true,
};
