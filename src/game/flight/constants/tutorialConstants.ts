export const TUTORIAL_STORAGE_KEY = 'flight_tutorial_v1';
export const TUTORIAL_OVERLAY_ID = 'tutorial-overlay';
export const TUTORIAL_Z_INDEX = 20000;
export const TUTORIAL_HOTKEY_CODE = 'F1';

export const TUTORIAL_START_DELAY_MS = 1500;
export const TUTORIAL_STEP_MIN_VISIBLE_MS = 1200;
export const TUTORIAL_TARGET_POLL_MS = 250;
export const TUTORIAL_SPOTLIGHT_PADDING_PX = 8;
export const TUTORIAL_MOBILE_BREAKPOINT_PX = 768;

export const TUTORIAL_THROTTLE_DONE_RATIO = 0.5;
export const TUTORIAL_AIRBORNE_AGL_FT = 100;
export const TUTORIAL_TURN_HEADING_DELTA_DEG = 30;
export const TUTORIAL_APPROACH_SPEED_FACTOR = 1.3;
export const TUTORIAL_DESCENT_RATE_FPM = -500;

export const TUTORIAL_STEP_IDS = [
    'welcome',
    'hud',
    'throttle',
    'rotate',
    'gear',
    'turn',
    'flapsBrake',
    'map',
    'autopilot',
    'panels',
    'landing',
    'done',
] as const;

export type TutorialStepId = typeof TUTORIAL_STEP_IDS[number];
