const AUDIO_BUS_DEFAULT_MASTER = 0.8;
const AUDIO_BUS_DEFAULT_ENGINE = 1.0;
const AUDIO_BUS_DEFAULT_WIND = 0.7;
const AUDIO_BUS_DEFAULT_ALERTS = 1.0;
const AUDIO_BUS_DEFAULT_ATC = 0.9;
const AUDIO_BUS_DEFAULT_MUSIC = 0.5;
const AUDIO_BUS_DEFAULT_CLICK = 0.6;

export const AUDIO_VOLUME_STORAGE_KEY = 'flight_audio_volumes_v1';

export interface AudioVolumes {
    master: number;
    engine: number;
    wind: number;
    alerts: number;
    atc: number;
    music: number;
    click: number;
}

const DEFAULT_VOLUMES: AudioVolumes = {
    master: AUDIO_BUS_DEFAULT_MASTER,
    engine: AUDIO_BUS_DEFAULT_ENGINE,
    wind: AUDIO_BUS_DEFAULT_WIND,
    alerts: AUDIO_BUS_DEFAULT_ALERTS,
    atc: AUDIO_BUS_DEFAULT_ATC,
    music: AUDIO_BUS_DEFAULT_MUSIC,
    click: AUDIO_BUS_DEFAULT_CLICK,
};

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

function loadVolumes(): AudioVolumes {
    try {
        const raw = localStorage.getItem(AUDIO_VOLUME_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_VOLUMES };
        const obj = JSON.parse(raw) as Partial<AudioVolumes>;
        return {
            master: clamp01(obj.master ?? DEFAULT_VOLUMES.master),
            engine: clamp01(obj.engine ?? DEFAULT_VOLUMES.engine),
            wind: clamp01(obj.wind ?? DEFAULT_VOLUMES.wind),
            alerts: clamp01(obj.alerts ?? DEFAULT_VOLUMES.alerts),
            atc: clamp01(obj.atc ?? DEFAULT_VOLUMES.atc),
            music: clamp01(obj.music ?? DEFAULT_VOLUMES.music),
            click: clamp01(obj.click ?? DEFAULT_VOLUMES.click),
        };
    } catch (err) {
        console.warn('[AudioCore] loadVolumes failed:', err);
        return { ...DEFAULT_VOLUMES };
    }
}

function saveVolumes(v: AudioVolumes): void {
    try {
        localStorage.setItem(AUDIO_VOLUME_STORAGE_KEY, JSON.stringify(v));
    } catch (err) {
        console.warn('[AudioCore] saveVolumes failed:', err);
    }
}

export class AudioCore {
    private static _ctx: AudioContext | null = null;
    private static _master: GainNode | null = null;
    private static _engine: GainNode | null = null;
    private static _wind: GainNode | null = null;
    private static _alerts: GainNode | null = null;
    private static _atc: GainNode | null = null;
    private static _music: GainNode | null = null;
    private static _click: GainNode | null = null;
    private static _resumeBound = false;
    private static _volumes: AudioVolumes = loadVolumes();

    public static getCtx(): AudioContext | null {
        if (this._ctx) return this._ctx;
        try {
            const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
                ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) {
                console.warn('[AudioCore] AudioContext not available in this browser');
                return null;
            }
            const ctx = new Ctor();
            this._ctx = ctx;

            const master = ctx.createGain();
            master.gain.value = this._volumes.master;
            master.connect(ctx.destination);
            this._master = master;

            this._engine = this._makeBus(ctx, master, this._volumes.engine);
            this._wind   = this._makeBus(ctx, master, this._volumes.wind);
            this._alerts = this._makeBus(ctx, master, this._volumes.alerts);
            this._atc    = this._makeBus(ctx, master, this._volumes.atc);
            this._music  = this._makeBus(ctx, master, this._volumes.music);
            this._click  = this._makeBus(ctx, master, this._volumes.click);

            if (ctx.state === 'suspended') {
                ctx.resume().catch(err => console.warn('[AudioCore] Resume failed:', err));
                this._installResumeOnGesture();
            }

            console.log('[AudioCore] Initialized');
            return ctx;
        } catch (err) {
            console.warn('[AudioCore] init failed:', err);
            return null;
        }
    }

    private static _makeBus(ctx: AudioContext, dest: AudioNode, initialGain: number): GainNode {
        const g = ctx.createGain();
        g.gain.value = initialGain;
        g.connect(dest);
        return g;
    }

    public static getEngineBus(): GainNode | null { this.getCtx(); return this._engine; }
    public static getWindBus(): GainNode | null { this.getCtx(); return this._wind; }
    public static getAlertsBus(): GainNode | null { this.getCtx(); return this._alerts; }
    public static getAtcBus(): GainNode | null { this.getCtx(); return this._atc; }
    public static getMusicBus(): GainNode | null { this.getCtx(); return this._music; }
    public static getClickBus(): GainNode | null { this.getCtx(); return this._click; }

    public static getVolumes(): AudioVolumes {
        return { ...this._volumes };
    }

    public static setVolumes(partial: Partial<AudioVolumes>): void {
        const merged: AudioVolumes = {
            master: partial.master !== undefined ? clamp01(partial.master) : this._volumes.master,
            engine: partial.engine !== undefined ? clamp01(partial.engine) : this._volumes.engine,
            wind: partial.wind !== undefined ? clamp01(partial.wind) : this._volumes.wind,
            alerts: partial.alerts !== undefined ? clamp01(partial.alerts) : this._volumes.alerts,
            atc: partial.atc !== undefined ? clamp01(partial.atc) : this._volumes.atc,
            music: partial.music !== undefined ? clamp01(partial.music) : this._volumes.music,
            click: partial.click !== undefined ? clamp01(partial.click) : this._volumes.click,
        };
        this._volumes = merged;
        saveVolumes(merged);
        try {
            if (this._master) this._master.gain.value = merged.master;
            if (this._engine) this._engine.gain.value = merged.engine;
            if (this._wind)   this._wind.gain.value   = merged.wind;
            if (this._alerts) this._alerts.gain.value = merged.alerts;
            if (this._atc)    this._atc.gain.value    = merged.atc;
            if (this._music)  this._music.gain.value  = merged.music;
            if (this._click)  this._click.gain.value  = merged.click;
        } catch (err) {
            console.warn('[AudioCore] setVolumes apply failed:', err);
        }
    }

    public static setListenerPosition(x: number, y: number, z: number): void {
        const ctx = this.getCtx();
        if (!ctx) return;
        try {
            const listener = ctx.listener;
            const t = ctx.currentTime;
            if (listener.positionX) {
                listener.positionX.setValueAtTime(x, t);
                listener.positionY.setValueAtTime(y, t);
                listener.positionZ.setValueAtTime(z, t);
            } else {
                (listener as unknown as { setPosition?: (x: number, y: number, z: number) => void })
                    .setPosition?.(x, y, z);
            }
        } catch (err) {
            console.warn('[AudioCore] setListenerPosition failed:', err);
        }
    }

    public static setListenerOrientation(
        forwardX: number, forwardY: number, forwardZ: number,
        upX: number, upY: number, upZ: number,
    ): void {
        const ctx = this.getCtx();
        if (!ctx) return;
        try {
            const listener = ctx.listener;
            const t = ctx.currentTime;
            if (listener.forwardX) {
                listener.forwardX.setValueAtTime(forwardX, t);
                listener.forwardY.setValueAtTime(forwardY, t);
                listener.forwardZ.setValueAtTime(forwardZ, t);
                listener.upX.setValueAtTime(upX, t);
                listener.upY.setValueAtTime(upY, t);
                listener.upZ.setValueAtTime(upZ, t);
            } else {
                (listener as unknown as { setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void })
                    .setOrientation?.(forwardX, forwardY, forwardZ, upX, upY, upZ);
            }
        } catch (err) {
            console.warn('[AudioCore] setListenerOrientation failed:', err);
        }
    }

    private static _installResumeOnGesture(): void {
        if (this._resumeBound) return;
        this._resumeBound = true;
        const events: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'touchstart', 'mousedown'];
        const listener = () => {
            try {
                const ctx = this._ctx;
                if (!ctx) return;
                if (ctx.state === 'suspended') {
                    ctx.resume()
                        .then(() => console.log('[AudioCore] resumed by user gesture'))
                        .catch(err => console.warn('[AudioCore] resume on gesture failed:', err));
                }
            } catch (err) {
                console.warn('[AudioCore] resume listener failed:', err);
            } finally {
                for (const ev of events) {
                    try { document.removeEventListener(ev, listener, true); } catch (_) { /* ignore */ }
                }
            }
        };
        for (const ev of events) {
            try {
                document.addEventListener(ev, listener, { once: false, capture: true, passive: true });
            } catch (err) {
                console.warn('[AudioCore] addEventListener failed for', ev, err);
            }
        }
    }
}
