import { UiPreferences } from './UiPreferences';

const GAMEPAD_DEFAULT_DEADZONE = 0.08;

export interface GamepadAxes {
    aileron: number;
    elevator: number;
    rudder: number;
    throttle: number;
    connected: boolean;
}

export interface GamepadEdges {
    gear: boolean;
    brake: boolean;
    flapDown: boolean;
    flapUp: boolean;
    camera: boolean;
    respawn: boolean;
    pause: boolean;
}

export class GamepadInput {
    private _prevButtons: boolean[] = [];
    private _connected = false;
    private _onConnect: ((info: string) => void) | null = null;
    private _onDisconnect: ((info: string) => void) | null = null;

    public onConnect(cb: (info: string) => void): void { this._onConnect = cb; }
    public onDisconnect(cb: (info: string) => void): void { this._onDisconnect = cb; }

    private _applyDeadzone(v: number, dz: number): number {
        if (!Number.isFinite(v)) return 0;
        if (Math.abs(v) < dz) return 0;
        const sign = v < 0 ? -1 : 1;
        const scaled = (Math.abs(v) - dz) / Math.max(0.0001, 1 - dz);
        return sign * Math.max(0, Math.min(1, scaled));
    }

    private _applyExpo(v: number, expo: number): number {
        if (!Number.isFinite(v)) return 0;
        const e = Math.max(1, expo);
        const sign = v < 0 ? -1 : 1;
        const a = Math.abs(v);
        return sign * Math.pow(a, e);
    }

    public read(deadzone: number = GAMEPAD_DEFAULT_DEADZONE, expo: number = 1.0, sensitivity: number = 1.0): GamepadAxes {
        const empty: GamepadAxes = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, connected: false };
        try {
            if (typeof navigator === 'undefined' || !navigator.getGamepads) return empty;
            const pads = navigator.getGamepads();
            if (!pads || !pads.length) {
                if (this._connected) {
                    this._connected = false;
                    if (this._onDisconnect) this._onDisconnect('none');
                }
                return empty;
            }
            let pad: Gamepad | null = null;
            for (const p of pads) { if (p && p.connected) { pad = p; break; } }
            if (!pad) {
                if (this._connected) {
                    this._connected = false;
                    if (this._onDisconnect) this._onDisconnect('none');
                }
                return empty;
            }
            if (!this._connected) {
                this._connected = true;
                if (this._onConnect) this._onConnect(pad.id);
                console.log(`[Gamepad] Connected: ${pad.id}`);
            }
            const prefs = UiPreferences.get();
            const axes = pad.axes;
            const aileron = this._applyExpo(this._applyDeadzone(axes[prefs.gpAxisAileron] ?? 0, deadzone), expo) * sensitivity * (prefs.gpInvertAileron ? -1 : 1);
            const elevator = this._applyExpo(this._applyDeadzone(axes[prefs.gpAxisElevator] ?? 0, deadzone), expo) * sensitivity * (prefs.gpInvertElevator ? -1 : 1);
            const rudder = this._applyExpo(this._applyDeadzone(axes[prefs.gpAxisRudder] ?? 0, deadzone), expo) * sensitivity * (prefs.gpInvertRudder ? -1 : 1);
            let thrRaw = axes[prefs.gpAxisThrottle] ?? 0;
            if (prefs.gpThrottleInverted) thrRaw = -thrRaw;
            const throttle = Math.max(0, Math.min(1, (thrRaw + 1) * 0.5));
            return {
                aileron: Math.max(-1, Math.min(1, aileron)),
                elevator: Math.max(-1, Math.min(1, elevator)),
                rudder: Math.max(-1, Math.min(1, rudder)),
                throttle,
                connected: true,
            };
        } catch (err) {
            console.warn('[Gamepad] read failed:', err);
            return empty;
        }
    }

    public readEdges(): GamepadEdges {
        const empty: GamepadEdges = { gear: false, brake: false, flapDown: false, flapUp: false, camera: false, respawn: false, pause: false };
        try {
            if (typeof navigator === 'undefined' || !navigator.getGamepads) return empty;
            const pads = navigator.getGamepads();
            if (!pads || !pads.length) return empty;
            let pad: Gamepad | null = null;
            for (const p of pads) { if (p && p.connected) { pad = p; break; } }
            if (!pad) return empty;
            const buttons = pad.buttons.map((b) => !!(b && b.pressed));
            const edge = (idx: number) => {
                const cur = !!buttons[idx];
                const prev = !!this._prevButtons[idx];
                return cur && !prev;
            };
            const prefs = UiPreferences.get();
            const result: GamepadEdges = {
                gear: edge(prefs.gpBtnGear),
                brake: edge(prefs.gpBtnBrake),
                flapDown: edge(prefs.gpBtnFlapDown),
                flapUp: edge(prefs.gpBtnFlapUp),
                camera: edge(prefs.gpBtnCamera),
                respawn: edge(prefs.gpBtnRespawn),
                pause: edge(prefs.gpBtnPause),
            };
            this._prevButtons = buttons;
            return result;
        } catch (err) {
            console.warn('[Gamepad] readEdges failed:', err);
            return empty;
        }
    }
}
