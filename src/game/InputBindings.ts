export const KEY_BINDINGS_STORAGE_KEY = 'flight_keybindings_v1';

export type ActionId =
    | 'throttleUp'
    | 'throttleDown'
    | 'pitchUp'
    | 'pitchDown'
    | 'rollLeft'
    | 'rollRight'
    | 'yawLeft'
    | 'yawRight'
    | 'flapDown'
    | 'flapUp'
    | 'brakeToggle'
    | 'gearToggle'
    | 'cameraCycle'
    | 'respawn'
    | 'mixtureUp'
    | 'mixtureDown'
    | 'magnetoCycle'
    | 'trimPitchDown'
    | 'trimPitchUp'
    | 'trimYawLeft'
    | 'trimYawRight'
    | 'pauseToggle'
    | 'timeScaleUp'
    | 'timeScaleDown'
    | 'easyModeToggle'
    | 'mouseYokeToggle'
    | 'screenshot'
    | 'towerCamera'
    | 'replayToggle'
    | 'autothrottleToggle';

export type KeyBindings = Record<ActionId, string>;

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
    throttleUp: 'KeyW',
    throttleDown: 'KeyS',
    pitchUp: 'ArrowUp',
    pitchDown: 'ArrowDown',
    rollLeft: 'ArrowLeft',
    rollRight: 'ArrowRight',
    yawLeft: 'KeyQ',
    yawRight: 'KeyE',
    flapDown: 'Digit5',
    flapUp: 'Digit6',
    brakeToggle: 'KeyB',
    gearToggle: 'KeyG',
    cameraCycle: 'KeyC',
    respawn: 'KeyR',
    mixtureUp: 'Equal',
    mixtureDown: 'Minus',
    magnetoCycle: 'KeyN',
    trimPitchDown: 'Digit7',
    trimPitchUp: 'Digit8',
    trimYawLeft: 'Digit9',
    trimYawRight: 'Digit0',
    pauseToggle: 'KeyP',
    timeScaleUp: 'BracketRight',
    timeScaleDown: 'BracketLeft',
    easyModeToggle: 'KeyM',
    mouseYokeToggle: 'KeyY',
    screenshot: 'F12',
    towerCamera: 'KeyT',
    replayToggle: 'KeyV',
    autothrottleToggle: 'KeyH',
};

export const ACTION_LABELS: Record<ActionId, string> = {
    throttleUp: 'Throttle +',
    throttleDown: 'Throttle -',
    pitchUp: 'Pitch Up',
    pitchDown: 'Pitch Down',
    rollLeft: 'Roll Left',
    rollRight: 'Roll Right',
    yawLeft: 'Yaw Left',
    yawRight: 'Yaw Right',
    flapDown: 'Flap -',
    flapUp: 'Flap +',
    brakeToggle: 'Brake',
    gearToggle: 'Gear',
    cameraCycle: 'Camera Cycle',
    respawn: 'Respawn',
    mixtureUp: 'Mixture +',
    mixtureDown: 'Mixture -',
    magnetoCycle: 'Magneto',
    trimPitchDown: 'Trim Pitch -',
    trimPitchUp: 'Trim Pitch +',
    trimYawLeft: 'Trim Yaw L',
    trimYawRight: 'Trim Yaw R',
    pauseToggle: 'Pause',
    timeScaleUp: 'Time Scale +',
    timeScaleDown: 'Time Scale -',
    easyModeToggle: 'Easy Mode',
    mouseYokeToggle: 'Mouse Yoke',
    screenshot: 'Screenshot',
    towerCamera: 'Tower Cam',
    replayToggle: 'Replay',
    autothrottleToggle: 'Autothrottle',
};

type Listener = (bindings: KeyBindings) => void;

export class InputBindings {
    private static _bindings: KeyBindings = InputBindings._load();
    private static _listeners: Listener[] = [];

    private static _load(): KeyBindings {
        try {
            const raw = localStorage.getItem(KEY_BINDINGS_STORAGE_KEY);
            if (!raw) return { ...DEFAULT_KEY_BINDINGS };
            const obj = JSON.parse(raw) as Partial<KeyBindings>;
            const merged: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
            for (const k of Object.keys(DEFAULT_KEY_BINDINGS) as ActionId[]) {
                const v = obj[k];
                if (typeof v === 'string' && v.length > 0) merged[k] = v;
            }
            return merged;
        } catch (err) {
            console.warn('[InputBindings] load failed:', err);
            return { ...DEFAULT_KEY_BINDINGS };
        }
    }

    private static _save(): void {
        try {
            localStorage.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(this._bindings));
        } catch (err) {
            console.warn('[InputBindings] save failed:', err);
        }
    }

    public static get(): KeyBindings {
        return { ...this._bindings };
    }

    public static codeFor(action: ActionId): string {
        return this._bindings[action];
    }

    public static setBinding(action: ActionId, code: string): void {
        if (!action || !code) return;
        this._bindings[action] = code;
        this._save();
        for (const l of this._listeners) {
            try { l({ ...this._bindings }); } catch (err) { console.warn('[InputBindings] listener failed:', err); }
        }
    }

    public static reset(): void {
        this._bindings = { ...DEFAULT_KEY_BINDINGS };
        this._save();
        for (const l of this._listeners) {
            try { l({ ...this._bindings }); } catch (err) { console.warn('[InputBindings] listener failed:', err); }
        }
    }

    public static onChange(cb: Listener): () => void {
        this._listeners.push(cb);
        return () => {
            const idx = this._listeners.indexOf(cb);
            if (idx >= 0) this._listeners.splice(idx, 1);
        };
    }
}
