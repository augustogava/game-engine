/** Lightweight user preferences (sound) persisted in localStorage. */

const STORAGE_KEY = 'mahjong_prefs_v1';

export interface MahjongPrefsData {
    soundEnabled: boolean;
    volume: number;
}

const DEFAULTS: MahjongPrefsData = {
    soundEnabled: true,
    volume: 0.7,
};

class MahjongPrefsManager {
    private data: MahjongPrefsData = { ...DEFAULTS };

    load(): void {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.data = { ...DEFAULTS, ...parsed };
            }
        } catch (err) {
            console.warn('[MahjongPrefs] Failed to load preferences:', err);
        }
    }

    private save(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (err) {
            console.warn('[MahjongPrefs] Failed to save preferences:', err);
        }
    }

    get soundEnabled(): boolean { return this.data.soundEnabled; }
    set soundEnabled(value: boolean) { this.data.soundEnabled = value; this.save(); }

    get volume(): number { return this.data.volume; }
    set volume(value: number) { this.data.volume = Math.min(1, Math.max(0, value)); this.save(); }
}

export const MahjongPrefs = new MahjongPrefsManager();
