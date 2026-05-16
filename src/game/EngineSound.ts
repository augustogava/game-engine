const ENGINE_BASE_FREQUENCY_HZ = 100;
const ENGINE_RPM_TO_FREQ_DIVISOR = 15;
const ENGINE_MAX_GAIN = 0.10;
const ENGINE_FILTER_FREQ_HZ = 800;
const ENGINE_FILTER_Q = 1.5;

export class EngineSound {
    private _ctx: AudioContext | null = null;
    private _osc: OscillatorNode | null = null;
    private _gain: GainNode | null = null;
    private _filter: BiquadFilterNode | null = null;
    private _running = false;
    private _throttle = 0;
    private _rpm = 0;
    private _fadeStartMs = 0;
    private _fadeDurationMs = 0;
    private _fadeActive = false;
    private _baseGain = 0;
    private _disposed = false;

    public start(): void {
        if (this._running || this._disposed) return;
        try {
            const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
                ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) {
                console.warn('[EngineSound] AudioContext not available in this browser');
                return;
            }
            this._ctx = new Ctor();
            this._osc = this._ctx.createOscillator();
            this._gain = this._ctx.createGain();
            this._filter = this._ctx.createBiquadFilter();
            this._osc.type = 'triangle';
            this._osc.frequency.value = ENGINE_BASE_FREQUENCY_HZ;
            this._filter.type = 'lowpass';
            this._filter.frequency.value = ENGINE_FILTER_FREQ_HZ;
            this._filter.Q.value = ENGINE_FILTER_Q;
            this._gain.gain.value = 0;
            this._osc.connect(this._filter);
            this._filter.connect(this._gain);
            this._gain.connect(this._ctx.destination);
            this._osc.start();
            this._running = true;
            if (this._ctx.state === 'suspended') {
                this._ctx.resume().catch(err => console.warn('[EngineSound] Resume failed:', err));
            }
            console.log('[EngineSound] Started');
        } catch (err) {
            console.warn('[EngineSound] Start failed:', err);
            this._running = false;
        }
    }

    public stop(): void {
        if (!this._running) return;
        try {
            if (this._osc) this._osc.stop();
        } catch (err) {
            console.warn('[EngineSound] Stop osc failed:', err);
        }
        this._running = false;
    }

    public setThrottle(t: number): void {
        if (!Number.isFinite(t)) return;
        this._throttle = Math.max(0, Math.min(1, t));
    }

    public setRpm(rpm: number): void {
        if (!Number.isFinite(rpm)) return;
        this._rpm = Math.max(0, rpm);
    }

    public fadeIn(durationMs: number): void {
        if (!this._running) return;
        this._fadeActive = true;
        this._fadeStartMs = performance.now();
        this._fadeDurationMs = Math.max(1, durationMs);
        this._baseGain = 0;
    }

    public update(): void {
        if (!this._running || !this._osc || !this._gain) return;
        try {
            const targetFreq = ENGINE_BASE_FREQUENCY_HZ + this._rpm / ENGINE_RPM_TO_FREQ_DIVISOR;
            const currentFreq = this._osc.frequency.value;
            const newFreq = currentFreq + (targetFreq - currentFreq) * 0.1;
            this._osc.frequency.value = newFreq;

            let fadeMul = 1;
            if (this._fadeActive) {
                const elapsed = performance.now() - this._fadeStartMs;
                fadeMul = Math.max(0, Math.min(1, elapsed / this._fadeDurationMs));
                if (fadeMul >= 1) this._fadeActive = false;
            }
            const targetGain = ENGINE_MAX_GAIN * this._throttle * fadeMul;
            const currentGain = this._gain.gain.value;
            this._gain.gain.value = currentGain + (targetGain - currentGain) * 0.1;
        } catch (err) {
            console.warn('[EngineSound] Update failed:', err);
        }
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.stop();
        try {
            if (this._gain) this._gain.disconnect();
            if (this._filter) this._filter.disconnect();
            if (this._ctx && this._ctx.state !== 'closed') {
                this._ctx.close().catch(err => console.warn('[EngineSound] ctx close failed:', err));
            }
        } catch (err) {
            console.warn('[EngineSound] Dispose failed:', err);
        }
        this._osc = null;
        this._gain = null;
        this._filter = null;
        this._ctx = null;
    }
}
