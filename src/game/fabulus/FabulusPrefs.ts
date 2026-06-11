import { FabulusApi } from './api/FabulusApi.js';

export const FABULUS_PREFS_STORAGE_KEY = 'fabulus_prefs_v1';
export const FABULUS_KEYBINDS_STORAGE_KEY = 'fabulus_keybinds_v1';

const SETTINGS_API_DEBOUNCE_MS = 1500;

export type GfxAntialiasing = 'off' | 'fxaa' | 'msaa2' | 'msaa4';
export type GfxShadowQuality = 'off' | 'low' | 'medium' | 'high';
export type GfxSsao = 'off' | 'low' | 'high';
export type GfxLevel = 'low' | 'medium' | 'high';
export type GfxPreset = 'low' | 'medium' | 'high' | 'ultra';
export type WeatherMode = 'ambient' | 'clear' | 'rain' | 'fog' | 'ember' | 'dust';

export interface FabulusPrefsData {
    masterVolume: number;
    sfxVolume: number;
    muted: boolean;
    runByDefault: boolean;
    showDropLabels: boolean;
    showEnemyHpBars: boolean;
    showMinimap: boolean;
    showFps: boolean;
    gfxAntialiasing: GfxAntialiasing;
    gfxRenderScale: number;
    gfxShadowQuality: GfxShadowQuality;
    gfxSsao: GfxSsao;
    gfxBloom: boolean;
    gfxVignette: boolean;
    gfxColorGrading: boolean;
    gfxSharpen: boolean;
    gfxParticleQuality: GfxLevel;
    gfxDetailLevel: GfxLevel;
    gfxSky: boolean;
    gfxVolumetrics: boolean;
    gfxGroundUltra: boolean;
    gfxWater: boolean;
    gfxWeather: boolean;
    gfxAdvancedVfx: boolean;
    weatherMode: WeatherMode;
}

const DEFAULT_PREFS: FabulusPrefsData = {
    masterVolume: 0.8,
    sfxVolume: 0.7,
    muted: false,
    runByDefault: false,
    showDropLabels: true,
    showEnemyHpBars: true,
    showMinimap: true,
    showFps: false,
    gfxAntialiasing: 'msaa4',
    gfxRenderScale: 1.0,
    gfxShadowQuality: 'high',
    gfxSsao: 'low',
    gfxBloom: true,
    gfxVignette: true,
    gfxColorGrading: true,
    gfxSharpen: true,
    gfxParticleQuality: 'high',
    gfxDetailLevel: 'medium',
    gfxSky: true,
    gfxVolumetrics: false,
    gfxGroundUltra: true,
    gfxWater: false,
    gfxWeather: false,
    gfxAdvancedVfx: false,
    weatherMode: 'ambient',
};

export const GFX_PRESETS: Record<GfxPreset, Partial<FabulusPrefsData>> = {
    low: {
        gfxAntialiasing: 'off', gfxRenderScale: 0.75, gfxShadowQuality: 'off', gfxSsao: 'off',
        gfxBloom: false, gfxVignette: false, gfxColorGrading: false, gfxSharpen: false,
        gfxParticleQuality: 'low', gfxDetailLevel: 'low',
        gfxSky: false, gfxVolumetrics: false, gfxGroundUltra: false, gfxWater: false,
        gfxWeather: false, gfxAdvancedVfx: false, weatherMode: 'clear',
    },
    medium: {
        gfxAntialiasing: 'fxaa', gfxRenderScale: 1.0, gfxShadowQuality: 'medium', gfxSsao: 'off',
        gfxBloom: true, gfxVignette: true, gfxColorGrading: true, gfxSharpen: false,
        gfxParticleQuality: 'medium', gfxDetailLevel: 'medium',
        gfxSky: false, gfxVolumetrics: false, gfxGroundUltra: false, gfxWater: false,
        gfxWeather: false, gfxAdvancedVfx: false, weatherMode: 'clear',
    },
    high: {
        gfxAntialiasing: 'msaa4', gfxRenderScale: 1.0, gfxShadowQuality: 'high', gfxSsao: 'low',
        gfxBloom: true, gfxVignette: true, gfxColorGrading: true, gfxSharpen: true,
        gfxParticleQuality: 'high', gfxDetailLevel: 'high',
        gfxSky: true, gfxVolumetrics: false, gfxGroundUltra: true, gfxWater: false,
        gfxWeather: false, gfxAdvancedVfx: false, weatherMode: 'clear',
    },
    ultra: {
        gfxAntialiasing: 'msaa4', gfxRenderScale: 1.25, gfxShadowQuality: 'high', gfxSsao: 'high',
        gfxBloom: true, gfxVignette: true, gfxColorGrading: true, gfxSharpen: true,
        gfxParticleQuality: 'high', gfxDetailLevel: 'high',
        gfxSky: true, gfxVolumetrics: true, gfxGroundUltra: true, gfxWater: true,
        gfxWeather: true, gfxAdvancedVfx: true, weatherMode: 'ambient',
    },
};

export type FabulusActionId =
    | 'skill1' | 'skill2' | 'skill3' | 'skill4'
    | 'character' | 'inventory' | 'skills' | 'attackNearest'
    | 'potion1' | 'potion2' | 'minimap' | 'editor';

export type FabulusKeyBinds = Record<FabulusActionId, string>;

export const DEFAULT_FABULUS_KEYBINDS: FabulusKeyBinds = {
    skill1: 'Digit1',
    skill2: 'Digit2',
    skill3: 'Digit3',
    skill4: 'Digit4',
    character: 'KeyC',
    inventory: 'KeyI',
    skills: 'KeyK',
    attackNearest: 'Space',
    potion1: 'KeyQ',
    potion2: 'KeyE',
    minimap: 'KeyM',
    editor: 'F2',
};

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

function sanitize(partial: Partial<FabulusPrefsData>, base: FabulusPrefsData): FabulusPrefsData {
    const pickBool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;
    const pickEnum = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
        typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : fallback;
    const scale = Number(partial.gfxRenderScale ?? base.gfxRenderScale);
    return {
        masterVolume: clamp01(Number(partial.masterVolume ?? base.masterVolume)),
        sfxVolume: clamp01(Number(partial.sfxVolume ?? base.sfxVolume)),
        muted: pickBool(partial.muted, base.muted),
        runByDefault: pickBool(partial.runByDefault, base.runByDefault),
        showDropLabels: pickBool(partial.showDropLabels, base.showDropLabels),
        showEnemyHpBars: pickBool(partial.showEnemyHpBars, base.showEnemyHpBars),
        showMinimap: pickBool(partial.showMinimap, base.showMinimap),
        showFps: pickBool(partial.showFps, base.showFps),
        gfxAntialiasing: pickEnum(partial.gfxAntialiasing, ['off', 'fxaa', 'msaa2', 'msaa4'] as const, base.gfxAntialiasing),
        gfxRenderScale: Number.isFinite(scale) ? Math.max(0.5, Math.min(1.5, scale)) : base.gfxRenderScale,
        gfxShadowQuality: pickEnum(partial.gfxShadowQuality, ['off', 'low', 'medium', 'high'] as const, base.gfxShadowQuality),
        gfxSsao: pickEnum(partial.gfxSsao, ['off', 'low', 'high'] as const, base.gfxSsao),
        gfxBloom: pickBool(partial.gfxBloom, base.gfxBloom),
        gfxVignette: pickBool(partial.gfxVignette, base.gfxVignette),
        gfxColorGrading: pickBool(partial.gfxColorGrading, base.gfxColorGrading),
        gfxSharpen: pickBool(partial.gfxSharpen, base.gfxSharpen),
        gfxParticleQuality: pickEnum(partial.gfxParticleQuality, ['low', 'medium', 'high'] as const, base.gfxParticleQuality),
        gfxDetailLevel: pickEnum(partial.gfxDetailLevel, ['low', 'medium', 'high'] as const, base.gfxDetailLevel),
        gfxSky: pickBool(partial.gfxSky, base.gfxSky),
        gfxVolumetrics: pickBool(partial.gfxVolumetrics, base.gfxVolumetrics),
        gfxGroundUltra: pickBool(partial.gfxGroundUltra, base.gfxGroundUltra),
        gfxWater: pickBool(partial.gfxWater, base.gfxWater),
        gfxWeather: pickBool(partial.gfxWeather, base.gfxWeather),
        gfxAdvancedVfx: pickBool(partial.gfxAdvancedVfx, base.gfxAdvancedVfx),
        weatherMode: pickEnum(partial.weatherMode, ['ambient', 'clear', 'rain', 'fog', 'ember', 'dust'] as const, base.weatherMode),
    };
}

export type PrefsListener = (prefs: FabulusPrefsData, changedKeys: (keyof FabulusPrefsData)[]) => void;

export class FabulusPrefs {
    private static _data: FabulusPrefsData = FabulusPrefs._load();
    private static _binds: FabulusKeyBinds = FabulusPrefs._loadBinds();
    private static _listeners: PrefsListener[] = [];
    private static _apiSaveTimer: number | undefined;
    private static _apiDirtyKeys = new Set<keyof FabulusPrefsData>();

    private static _load(): FabulusPrefsData {
        try {
            const raw = localStorage.getItem(FABULUS_PREFS_STORAGE_KEY);
            if (!raw) return { ...DEFAULT_PREFS };
            const obj = JSON.parse(raw) as Partial<FabulusPrefsData>;
            return sanitize(obj, DEFAULT_PREFS);
        } catch (err) {
            console.warn('[FabulusPrefs] load failed:', err);
            return { ...DEFAULT_PREFS };
        }
    }

    private static _loadBinds(): FabulusKeyBinds {
        try {
            const raw = localStorage.getItem(FABULUS_KEYBINDS_STORAGE_KEY);
            if (!raw) return { ...DEFAULT_FABULUS_KEYBINDS };
            const obj = JSON.parse(raw) as Partial<FabulusKeyBinds>;
            const merged: FabulusKeyBinds = { ...DEFAULT_FABULUS_KEYBINDS };
            for (const k of Object.keys(DEFAULT_FABULUS_KEYBINDS) as FabulusActionId[]) {
                const v = obj[k];
                if (typeof v === 'string' && v.length > 0) merged[k] = v;
            }
            return merged;
        } catch (err) {
            console.warn('[FabulusPrefs] keybinds load failed:', err);
            return { ...DEFAULT_FABULUS_KEYBINDS };
        }
    }

    static get(): FabulusPrefsData {
        return { ...this._data };
    }

    static set(partial: Partial<FabulusPrefsData>): void {
        const next = sanitize(partial, this._data);
        const changed: (keyof FabulusPrefsData)[] = [];
        for (const key of Object.keys(next) as (keyof FabulusPrefsData)[]) {
            if (next[key] !== this._data[key]) changed.push(key);
        }
        this._data = next;
        try {
            localStorage.setItem(FABULUS_PREFS_STORAGE_KEY, JSON.stringify(this._data));
        } catch (err) {
            console.warn('[FabulusPrefs] save failed:', err);
        }
        if (changed.length) {
            for (const key of changed) this._apiDirtyKeys.add(key);
            this._scheduleApiSave();
            for (const fn of this._listeners) {
                try { fn(this.get(), changed); } catch (err) { console.warn('[FabulusPrefs] listener failed:', err); }
            }
        }
    }

    static applyPreset(preset: GfxPreset): void {
        this.set(GFX_PRESETS[preset]);
    }

    static onChange(fn: PrefsListener): void {
        this._listeners.push(fn);
    }

    static offChange(fn: PrefsListener): void {
        const idx = this._listeners.indexOf(fn);
        if (idx >= 0) this._listeners.splice(idx, 1);
    }

    /** Loads persisted settings from the API and merges them in (localStorage stays a cache). */
    static async syncFromApi(): Promise<void> {
        try {
            const remote = await FabulusApi.fetchSettings();
            if (!remote || !Object.keys(remote).length) return;
            const partial: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(remote)) {
                if (!(key in DEFAULT_PREFS)) continue;
                const defVal = DEFAULT_PREFS[key as keyof FabulusPrefsData];
                if (typeof defVal === 'boolean') partial[key] = value === 'true';
                else if (typeof defVal === 'number') partial[key] = Number(value);
                else partial[key] = value;
            }
            this._data = sanitize(partial as Partial<FabulusPrefsData>, this._data);
            try {
                localStorage.setItem(FABULUS_PREFS_STORAGE_KEY, JSON.stringify(this._data));
            } catch { /* cache only */ }
            console.debug('[FabulusPrefs] synced from API');
        } catch (err) {
            console.warn('[FabulusPrefs] syncFromApi failed:', err);
        }
    }

    private static _scheduleApiSave(): void {
        if (this._apiSaveTimer) clearTimeout(this._apiSaveTimer);
        this._apiSaveTimer = window.setTimeout(() => {
            const payload: Record<string, string> = {};
            for (const key of this._apiDirtyKeys) {
                payload[key] = String(this._data[key]);
            }
            this._apiDirtyKeys.clear();
            if (!Object.keys(payload).length) return;
            FabulusApi.saveSettings(payload).catch(err => console.warn('[FabulusPrefs] api save failed:', err));
        }, SETTINGS_API_DEBOUNCE_MS);
    }

    static getBinds(): FabulusKeyBinds {
        return { ...this._binds };
    }

    static codeFor(action: FabulusActionId): string {
        return this._binds[action];
    }

    static setBinding(action: FabulusActionId, code: string): void {
        if (!action || !code) return;
        this._binds[action] = code;
        try {
            localStorage.setItem(FABULUS_KEYBINDS_STORAGE_KEY, JSON.stringify(this._binds));
        } catch (err) {
            console.warn('[FabulusPrefs] keybinds save failed:', err);
        }
    }
}
