const ENGINE_BASE_FREQUENCY_HZ = 45;
const ENGINE_RPM_TO_FREQ_DIVISOR = 35;
const ENGINE_DETUNE_CENTS = 12;
const ENGINE_HARMONIC_MULTIPLIER = 2.02;
const ENGINE_HARMONIC_GAIN = 0.35;
const ENGINE_RUMBLE_BASE_HZ = 80;
const ENGINE_RUMBLE_FILTER_Q = 6;
const ENGINE_MAX_GAIN = 0.06;
const ENGINE_NOISE_MAX_GAIN = 0.025;
const ENGINE_LOWPASS_BASE_HZ = 380;
const ENGINE_LOWPASS_RPM_GAIN_HZ = 0.18;
const ENGINE_LOWPASS_Q = 0.7;
const ENGINE_NOISE_BUFFER_SECONDS = 2;
const ENGINE_GAIN_SMOOTHING = 0.08;
const ENGINE_FREQ_SMOOTHING = 0.06;

export class EngineSound {
    private _ctx: AudioContext | null = null;
    private _oscPrimary: OscillatorNode | null = null;
    private _oscDetuned: OscillatorNode | null = null;
    private _oscHarmonic: OscillatorNode | null = null;
    private _oscGain: GainNode | null = null;
    private _harmonicGain: GainNode | null = null;
    private _noiseSrc: AudioBufferSourceNode | null = null;
    private _noiseGain: GainNode | null = null;
    private _noiseFilter: BiquadFilterNode | null = null;
    private _masterFilter: BiquadFilterNode | null = null;
    private _masterGain: GainNode | null = null;
    private _running = false;
    private _throttle = 0;
    private _rpm = 0;
    private _fadeStartMs = 0;
    private _fadeDurationMs = 0;
    private _fadeActive = false;
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
            const ctx = this._ctx;

            this._masterGain = ctx.createGain();
            this._masterGain.gain.value = 0;
            this._masterGain.connect(ctx.destination);

            this._masterFilter = ctx.createBiquadFilter();
            this._masterFilter.type = 'lowpass';
            this._masterFilter.frequency.value = ENGINE_LOWPASS_BASE_HZ;
            this._masterFilter.Q.value = ENGINE_LOWPASS_Q;
            this._masterFilter.connect(this._masterGain);

            this._oscGain = ctx.createGain();
            this._oscGain.gain.value = 1;
            this._oscGain.connect(this._masterFilter);

            this._oscPrimary = ctx.createOscillator();
            this._oscPrimary.type = 'sawtooth';
            this._oscPrimary.frequency.value = ENGINE_BASE_FREQUENCY_HZ;
            this._oscPrimary.connect(this._oscGain);

            this._oscDetuned = ctx.createOscillator();
            this._oscDetuned.type = 'sawtooth';
            this._oscDetuned.frequency.value = ENGINE_BASE_FREQUENCY_HZ;
            this._oscDetuned.detune.value = ENGINE_DETUNE_CENTS;
            this._oscDetuned.connect(this._oscGain);

            this._harmonicGain = ctx.createGain();
            this._harmonicGain.gain.value = ENGINE_HARMONIC_GAIN;
            this._harmonicGain.connect(this._masterFilter);

            this._oscHarmonic = ctx.createOscillator();
            this._oscHarmonic.type = 'triangle';
            this._oscHarmonic.frequency.value = ENGINE_BASE_FREQUENCY_HZ * ENGINE_HARMONIC_MULTIPLIER;
            this._oscHarmonic.connect(this._harmonicGain);

            const noiseLen = Math.floor(ctx.sampleRate * ENGINE_NOISE_BUFFER_SECONDS);
            const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
            const data = noiseBuf.getChannelData(0);
            for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
            this._noiseSrc = ctx.createBufferSource();
            this._noiseSrc.buffer = noiseBuf;
            this._noiseSrc.loop = true;

            this._noiseFilter = ctx.createBiquadFilter();
            this._noiseFilter.type = 'bandpass';
            this._noiseFilter.frequency.value = ENGINE_RUMBLE_BASE_HZ;
            this._noiseFilter.Q.value = ENGINE_RUMBLE_FILTER_Q;

            this._noiseGain = ctx.createGain();
            this._noiseGain.gain.value = 0;

            this._noiseSrc.connect(this._noiseFilter);
            this._noiseFilter.connect(this._noiseGain);
            this._noiseGain.connect(this._masterFilter);

            this._oscPrimary.start();
            this._oscDetuned.start();
            this._oscHarmonic.start();
            this._noiseSrc.start();

            this._running = true;
            if (ctx.state === 'suspended') {
                ctx.resume().catch(err => console.warn('[EngineSound] Resume failed:', err));
            }
            console.log('[EngineSound] Started (sawtooth + harmonic + rumble noise)');
        } catch (err) {
            console.warn('[EngineSound] Start failed:', err);
            this._running = false;
        }
    }

    public stop(): void {
        if (!this._running) return;
        try { if (this._oscPrimary) this._oscPrimary.stop(); } catch (_) { /* ignore */ }
        try { if (this._oscDetuned) this._oscDetuned.stop(); } catch (_) { /* ignore */ }
        try { if (this._oscHarmonic) this._oscHarmonic.stop(); } catch (_) { /* ignore */ }
        try { if (this._noiseSrc) this._noiseSrc.stop(); } catch (_) { /* ignore */ }
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
    }

    public update(): void {
        if (!this._running || !this._oscPrimary || !this._oscDetuned || !this._oscHarmonic || !this._masterGain || !this._noiseGain || !this._masterFilter) return;
        try {
            const targetFreq = ENGINE_BASE_FREQUENCY_HZ + this._rpm / ENGINE_RPM_TO_FREQ_DIVISOR;
            const currentFreq = this._oscPrimary.frequency.value;
            const newFreq = currentFreq + (targetFreq - currentFreq) * ENGINE_FREQ_SMOOTHING;
            this._oscPrimary.frequency.value = newFreq;
            this._oscDetuned.frequency.value = newFreq;
            this._oscHarmonic.frequency.value = newFreq * ENGINE_HARMONIC_MULTIPLIER;

            const lpTarget = ENGINE_LOWPASS_BASE_HZ + this._rpm * ENGINE_LOWPASS_RPM_GAIN_HZ;
            const lpCurrent = this._masterFilter.frequency.value;
            this._masterFilter.frequency.value = lpCurrent + (lpTarget - lpCurrent) * ENGINE_FREQ_SMOOTHING;

            let fadeMul = 1;
            if (this._fadeActive) {
                const elapsed = performance.now() - this._fadeStartMs;
                fadeMul = Math.max(0, Math.min(1, elapsed / this._fadeDurationMs));
                if (fadeMul >= 1) this._fadeActive = false;
            }
            const targetMaster = ENGINE_MAX_GAIN * (0.4 + 0.6 * this._throttle) * fadeMul;
            const currentMaster = this._masterGain.gain.value;
            this._masterGain.gain.value = currentMaster + (targetMaster - currentMaster) * ENGINE_GAIN_SMOOTHING;

            const targetNoise = ENGINE_NOISE_MAX_GAIN * (0.3 + 0.7 * this._throttle) * fadeMul;
            const currentNoise = this._noiseGain.gain.value;
            this._noiseGain.gain.value = currentNoise + (targetNoise - currentNoise) * ENGINE_GAIN_SMOOTHING;
        } catch (err) {
            console.warn('[EngineSound] Update failed:', err);
        }
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.stop();
        try {
            this._masterGain?.disconnect();
            this._masterFilter?.disconnect();
            this._oscGain?.disconnect();
            this._harmonicGain?.disconnect();
            this._noiseGain?.disconnect();
            this._noiseFilter?.disconnect();
            if (this._ctx && this._ctx.state !== 'closed') {
                this._ctx.close().catch(err => console.warn('[EngineSound] ctx close failed:', err));
            }
        } catch (err) {
            console.warn('[EngineSound] Dispose failed:', err);
        }
        this._oscPrimary = null;
        this._oscDetuned = null;
        this._oscHarmonic = null;
        this._oscGain = null;
        this._harmonicGain = null;
        this._noiseSrc = null;
        this._noiseGain = null;
        this._noiseFilter = null;
        this._masterFilter = null;
        this._masterGain = null;
        this._ctx = null;
    }
}
