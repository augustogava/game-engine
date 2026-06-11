export const MODELS_BASE_PATH = 'models/rpg/';
export const CURSOR_KNIGHT_URL = 'models/rpg/ui/cursor-knight.png';
export const CURSOR_ATTACK_URL = 'models/rpg/ui/cursor-attack.png';
export const CURSOR_HOTSPOT_X = 16;
export const CURSOR_HOTSPOT_Y = 16;
export const MAP_MODEL_FILE = '';

export const MAP_SIZE = 200;
export const MAP_HALF = MAP_SIZE / 2;
export const MAP_BORDER_MARGIN = 1.0;
export const OBSTACLE_COUNT = 60;
export const OBSTACLE_SEED = 1337;

export const PLAYER_HEIGHT_UNITS = 2.6;
export const PLAYER_COLLIDER_RADIUS = 0.55;
export const ENEMY_COLLIDER_RADIUS = 0.5;
export const ARRIVAL_THRESHOLD = 0.3;
export const PLAYER_TURN_LERP = 12;

export const ENEMY_SPAWN_COUNT = 8;
export const ENEMY_SPAWN_MIN_DIST = 12;
export const ENEMY_WANDER_RADIUS = 4;
export const ENEMY_WANDER_INTERVAL_MS = 3500;
export const ENEMY_HEIGHT_UNITS = 2.2;

export const STATE_SAVE_THROTTLE_MS = 5000;

export const CLASS_STORAGE_KEY = 'fabulus_class_id';

export const NPC_INTERACT_RANGE = 3.4;
export const NPC_LABEL_OFFSET_Y = 0.45;
export const NPC_INTERACT_STUCK_MS = 700;
export const NPC_INTERACT_MAX_RANGE = 5.5;

export interface PropCatalogEntry {
    model_path: string;
    label: string;
    default_scale: number;
    collidable: boolean;
}

/** Prop models available in the map editor (paths relative to MODELS_BASE_PATH). */
export const PROP_CATALOG: PropCatalogEntry[] = [
    { model_path: 'basket.glb', label: 'Basket', default_scale: 0.9, collidable: false },
    { model_path: 'chair.glb', label: 'Chair', default_scale: 1.4, collidable: true },
    { model_path: 'chest.glb', label: 'Chest', default_scale: 1.2, collidable: true },
    { model_path: 'fountain.glb', label: 'Fountain', default_scale: 3, collidable: true },
    { model_path: 'house.glb', label: 'House', default_scale: 8, collidable: true },
    { model_path: 'house_2.glb', label: 'House 2', default_scale: 7, collidable: true },
    { model_path: 'stone_sentinel.glb', label: 'Stone Sentinel', default_scale: 3.5, collidable: true },
    { model_path: 'templte.glb', label: 'Temple', default_scale: 8, collidable: true },
    { model_path: 'throne.glb', label: 'Throne', default_scale: 2.6, collidable: true },
    { model_path: 'tree_pin.glb', label: 'Pine Tree', default_scale: 9, collidable: true },
];

export const EDITOR_ROTATE_STEP_RAD = Math.PI / 8;
export const EDITOR_SCALE_STEP_PCT = 10;
export const EDITOR_MIN_SCALE = 0.2;
export const EDITOR_MAX_SCALE = 30;
export const EDITOR_SAVE_DEBOUNCE_MS = 600;
