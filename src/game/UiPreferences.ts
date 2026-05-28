export const UI_PREF_STORAGE_KEY = 'flight_ui_prefs_v1';

export const UNIT_SYSTEM_IMPERIAL = 'imperial';
export const UNIT_SYSTEM_METRIC = 'metric';
export type UnitSystem = typeof UNIT_SYSTEM_IMPERIAL | typeof UNIT_SYSTEM_METRIC;

export const LANGUAGE_PT = 'pt';
export const LANGUAGE_EN = 'en';
export type Language = typeof LANGUAGE_PT | typeof LANGUAGE_EN;

export const COLORBLIND_NONE = 'none';
export const COLORBLIND_PROTANOPIA = 'protanopia';
export const COLORBLIND_DEUTERANOPIA = 'deuteranopia';
export const COLORBLIND_TRITANOPIA = 'tritanopia';
export type ColorblindMode = typeof COLORBLIND_NONE | typeof COLORBLIND_PROTANOPIA | typeof COLORBLIND_DEUTERANOPIA | typeof COLORBLIND_TRITANOPIA;

export interface UiPreferencesData {
    unitSystem: UnitSystem;
    language: Language;
    mouseYoke: boolean;
    easyMode: boolean;
    autoThrottleTargetKts: number;
    desktopExpo: number;
    desktopDeadzone: number;
    desktopSensitivity: number;
    showChecklist: boolean;
    showFpsOverlay: boolean;
    showLatencyOverlay: boolean;
    colorblindMode: ColorblindMode;
    fontScale: number;
    contrastBoost: boolean;
    pauseTimeScale: number;
    gamepadEnabled: boolean;
    gpAxisAileron: number;
    gpAxisElevator: number;
    gpAxisRudder: number;
    gpAxisThrottle: number;
    gpThrottleInverted: boolean;
    gpInvertAileron: boolean;
    gpInvertElevator: boolean;
    gpInvertRudder: boolean;
    gpBtnGear: number;
    gpBtnBrake: number;
    gpBtnFlapDown: number;
    gpBtnFlapUp: number;
    gpBtnCamera: number;
    gpBtnRespawn: number;
    gpBtnPause: number;
}

const DEFAULT_PREFS: UiPreferencesData = {
    unitSystem: UNIT_SYSTEM_IMPERIAL,
    language: LANGUAGE_PT,
    mouseYoke: false,
    easyMode: false,
    autoThrottleTargetKts: 250,
    desktopExpo: 1.5,
    desktopDeadzone: 0.05,
    desktopSensitivity: 1.0,
    showChecklist: false,
    showFpsOverlay: true,
    showLatencyOverlay: true,
    colorblindMode: COLORBLIND_NONE,
    fontScale: 1.0,
    contrastBoost: false,
    pauseTimeScale: 1.0,
    gamepadEnabled: true,
    gpAxisAileron: 0,
    gpAxisElevator: 1,
    gpAxisRudder: 2,
    gpAxisThrottle: 3,
    gpThrottleInverted: true,
    gpInvertAileron: false,
    gpInvertElevator: false,
    gpInvertRudder: false,
    gpBtnGear: 0,
    gpBtnBrake: 1,
    gpBtnFlapDown: 2,
    gpBtnFlapUp: 3,
    gpBtnCamera: 4,
    gpBtnRespawn: 5,
    gpBtnPause: 9,
};

const PREF_GP_AXIS_MAX = 15;
const PREF_GP_BTN_MAX = 31;

const PREF_FONT_SCALE_MIN = 0.7;
const PREF_FONT_SCALE_MAX = 1.6;
const PREF_DEADZONE_MAX = 0.4;
const PREF_EXPO_MIN = 1.0;
const PREF_EXPO_MAX = 4.0;
const PREF_SENS_MIN = 0.3;
const PREF_SENS_MAX = 3.0;
const PREF_TIME_SCALE_MIN = 0.25;
const PREF_TIME_SCALE_MAX = 8.0;
const PREF_AUTO_THR_KTS_MIN = 60;
const PREF_AUTO_THR_KTS_MAX = 600;

function clamp(v: number, lo: number, hi: number): number {
    if (!Number.isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
}

function isUnitSystem(v: unknown): v is UnitSystem {
    return v === UNIT_SYSTEM_IMPERIAL || v === UNIT_SYSTEM_METRIC;
}
function isLanguage(v: unknown): v is Language {
    return v === LANGUAGE_PT || v === LANGUAGE_EN;
}
function isColorblind(v: unknown): v is ColorblindMode {
    return v === COLORBLIND_NONE || v === COLORBLIND_PROTANOPIA || v === COLORBLIND_DEUTERANOPIA || v === COLORBLIND_TRITANOPIA;
}

type PrefChangeHandler = (prefs: UiPreferencesData) => void;

export class UiPreferences {
    private static _data: UiPreferencesData = UiPreferences._load();
    private static _listeners: PrefChangeHandler[] = [];

    private static _load(): UiPreferencesData {
        try {
            const raw = localStorage.getItem(UI_PREF_STORAGE_KEY);
            if (!raw) return { ...DEFAULT_PREFS };
            const obj = JSON.parse(raw) as Partial<UiPreferencesData>;
            return UiPreferences._sanitize(obj);
        } catch (err) {
            console.warn('[UiPreferences] load failed:', err);
            return { ...DEFAULT_PREFS };
        }
    }

    private static _sanitize(input: Partial<UiPreferencesData>): UiPreferencesData {
        return {
            unitSystem: isUnitSystem(input.unitSystem) ? input.unitSystem : DEFAULT_PREFS.unitSystem,
            language: isLanguage(input.language) ? input.language : DEFAULT_PREFS.language,
            mouseYoke: typeof input.mouseYoke === 'boolean' ? input.mouseYoke : DEFAULT_PREFS.mouseYoke,
            easyMode: typeof input.easyMode === 'boolean' ? input.easyMode : DEFAULT_PREFS.easyMode,
            autoThrottleTargetKts: clamp(Number(input.autoThrottleTargetKts ?? DEFAULT_PREFS.autoThrottleTargetKts), PREF_AUTO_THR_KTS_MIN, PREF_AUTO_THR_KTS_MAX),
            desktopExpo: clamp(Number(input.desktopExpo ?? DEFAULT_PREFS.desktopExpo), PREF_EXPO_MIN, PREF_EXPO_MAX),
            desktopDeadzone: clamp(Number(input.desktopDeadzone ?? DEFAULT_PREFS.desktopDeadzone), 0, PREF_DEADZONE_MAX),
            desktopSensitivity: clamp(Number(input.desktopSensitivity ?? DEFAULT_PREFS.desktopSensitivity), PREF_SENS_MIN, PREF_SENS_MAX),
            showChecklist: typeof input.showChecklist === 'boolean' ? input.showChecklist : DEFAULT_PREFS.showChecklist,
            showFpsOverlay: typeof input.showFpsOverlay === 'boolean' ? input.showFpsOverlay : DEFAULT_PREFS.showFpsOverlay,
            showLatencyOverlay: typeof input.showLatencyOverlay === 'boolean' ? input.showLatencyOverlay : DEFAULT_PREFS.showLatencyOverlay,
            colorblindMode: isColorblind(input.colorblindMode) ? input.colorblindMode : DEFAULT_PREFS.colorblindMode,
            fontScale: clamp(Number(input.fontScale ?? DEFAULT_PREFS.fontScale), PREF_FONT_SCALE_MIN, PREF_FONT_SCALE_MAX),
            contrastBoost: typeof input.contrastBoost === 'boolean' ? input.contrastBoost : DEFAULT_PREFS.contrastBoost,
            pauseTimeScale: clamp(Number(input.pauseTimeScale ?? DEFAULT_PREFS.pauseTimeScale), PREF_TIME_SCALE_MIN, PREF_TIME_SCALE_MAX),
            gamepadEnabled: typeof input.gamepadEnabled === 'boolean' ? input.gamepadEnabled : DEFAULT_PREFS.gamepadEnabled,
            gpAxisAileron: clamp(Math.round(Number(input.gpAxisAileron ?? DEFAULT_PREFS.gpAxisAileron)), 0, PREF_GP_AXIS_MAX),
            gpAxisElevator: clamp(Math.round(Number(input.gpAxisElevator ?? DEFAULT_PREFS.gpAxisElevator)), 0, PREF_GP_AXIS_MAX),
            gpAxisRudder: clamp(Math.round(Number(input.gpAxisRudder ?? DEFAULT_PREFS.gpAxisRudder)), 0, PREF_GP_AXIS_MAX),
            gpAxisThrottle: clamp(Math.round(Number(input.gpAxisThrottle ?? DEFAULT_PREFS.gpAxisThrottle)), 0, PREF_GP_AXIS_MAX),
            gpThrottleInverted: typeof input.gpThrottleInverted === 'boolean' ? input.gpThrottleInverted : DEFAULT_PREFS.gpThrottleInverted,
            gpInvertAileron: typeof input.gpInvertAileron === 'boolean' ? input.gpInvertAileron : DEFAULT_PREFS.gpInvertAileron,
            gpInvertElevator: typeof input.gpInvertElevator === 'boolean' ? input.gpInvertElevator : DEFAULT_PREFS.gpInvertElevator,
            gpInvertRudder: typeof input.gpInvertRudder === 'boolean' ? input.gpInvertRudder : DEFAULT_PREFS.gpInvertRudder,
            gpBtnGear: clamp(Math.round(Number(input.gpBtnGear ?? DEFAULT_PREFS.gpBtnGear)), 0, PREF_GP_BTN_MAX),
            gpBtnBrake: clamp(Math.round(Number(input.gpBtnBrake ?? DEFAULT_PREFS.gpBtnBrake)), 0, PREF_GP_BTN_MAX),
            gpBtnFlapDown: clamp(Math.round(Number(input.gpBtnFlapDown ?? DEFAULT_PREFS.gpBtnFlapDown)), 0, PREF_GP_BTN_MAX),
            gpBtnFlapUp: clamp(Math.round(Number(input.gpBtnFlapUp ?? DEFAULT_PREFS.gpBtnFlapUp)), 0, PREF_GP_BTN_MAX),
            gpBtnCamera: clamp(Math.round(Number(input.gpBtnCamera ?? DEFAULT_PREFS.gpBtnCamera)), 0, PREF_GP_BTN_MAX),
            gpBtnRespawn: clamp(Math.round(Number(input.gpBtnRespawn ?? DEFAULT_PREFS.gpBtnRespawn)), 0, PREF_GP_BTN_MAX),
            gpBtnPause: clamp(Math.round(Number(input.gpBtnPause ?? DEFAULT_PREFS.gpBtnPause)), 0, PREF_GP_BTN_MAX),
        };
    }

    private static _save(): void {
        try {
            localStorage.setItem(UI_PREF_STORAGE_KEY, JSON.stringify(this._data));
        } catch (err) {
            console.warn('[UiPreferences] save failed:', err);
        }
    }

    public static get(): UiPreferencesData {
        return { ...this._data };
    }

    public static set(partial: Partial<UiPreferencesData>): void {
        this._data = this._sanitize({ ...this._data, ...partial });
        this._save();
        for (const cb of this._listeners) {
            try { cb({ ...this._data }); } catch (err) { console.warn('[UiPreferences] listener failed:', err); }
        }
    }

    public static onChange(cb: PrefChangeHandler): () => void {
        this._listeners.push(cb);
        return () => {
            const idx = this._listeners.indexOf(cb);
            if (idx >= 0) this._listeners.splice(idx, 1);
        };
    }

    public static reset(): void {
        this._data = { ...DEFAULT_PREFS };
        this._save();
    }
}
