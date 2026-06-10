export const FABULUS_PREFS_STORAGE_KEY = 'fabulus_prefs_v1';
export const FABULUS_KEYBINDS_STORAGE_KEY = 'fabulus_keybinds_v1';

export interface FabulusPrefsData {
    masterVolume: number;
    sfxVolume: number;
    runByDefault: boolean;
}

const DEFAULT_PREFS: FabulusPrefsData = {
    masterVolume: 0.8,
    sfxVolume: 0.7,
    runByDefault: false,
};

export type FabulusActionId =
    | 'skill1' | 'skill2' | 'skill3' | 'skill4'
    | 'character' | 'inventory' | 'skills' | 'attackNearest';

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
};

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

export class FabulusPrefs {
    private static _data: FabulusPrefsData = FabulusPrefs._load();
    private static _binds: FabulusKeyBinds = FabulusPrefs._loadBinds();

    private static _load(): FabulusPrefsData {
        try {
            const raw = localStorage.getItem(FABULUS_PREFS_STORAGE_KEY);
            if (!raw) return { ...DEFAULT_PREFS };
            const obj = JSON.parse(raw) as Partial<FabulusPrefsData>;
            return {
                masterVolume: clamp01(Number(obj.masterVolume ?? DEFAULT_PREFS.masterVolume)),
                sfxVolume: clamp01(Number(obj.sfxVolume ?? DEFAULT_PREFS.sfxVolume)),
                runByDefault: typeof obj.runByDefault === 'boolean' ? obj.runByDefault : DEFAULT_PREFS.runByDefault,
            };
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
        this._data = {
            masterVolume: clamp01(Number(partial.masterVolume ?? this._data.masterVolume)),
            sfxVolume: clamp01(Number(partial.sfxVolume ?? this._data.sfxVolume)),
            runByDefault: typeof partial.runByDefault === 'boolean' ? partial.runByDefault : this._data.runByDefault,
        };
        try {
            localStorage.setItem(FABULUS_PREFS_STORAGE_KEY, JSON.stringify(this._data));
        } catch (err) {
            console.warn('[FabulusPrefs] save failed:', err);
        }
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
