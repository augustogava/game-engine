import { AudioCore } from './AudioCore.js';

const PINK_NOISE_BUFFER_SECONDS = 4;
const WIND_LOWPASS_MIN_HZ = 200;
const WIND_LOWPASS_MAX_HZ = 6000;
const WIND_GAIN_MAX = 0.18;
const WIND_REFERENCE_IAS_KTS = 350;
const WIND_GAIN_SMOOTHING = 0.05;
const WIND_FILTER_SMOOTHING = 0.05;

const STALL_HORN_FREQ_HZ = 800;
const STALL_HORN_PULSE_HZ = 4;
const STALL_HORN_DUTY = 0.5;
const STALL_HORN_GAIN = 0.18;

const OVERSPEED_CLACKER_PULSE_HZ = 4;
const OVERSPEED_CLACKER_DURATION_MS = 25;
const OVERSPEED_CLACKER_FREQ_HZ = 1500;
const OVERSPEED_CLACKER_GAIN = 0.32;

const GPWS_TTS_RATE = 1.05;
const GPWS_TTS_PITCH = 0.95;
const GPWS_TTS_VOLUME = 1.0;

const ATC_TTS_RATE = 1.0;
const ATC_TTS_PITCH = 1.0;
const ATC_TTS_VOLUME = 1.0;

const GEAR_WHIRR_FREQ_BASE_HZ = 220;
const GEAR_WHIRR_GAIN = 0.04;
const FLAP_WHIRR_FREQ_BASE_HZ = 180;
const FLAP_WHIRR_GAIN = 0.035;

const CLICK_FREQ_HZ = 1800;
const CLICK_GAIN = 0.25;
const CLICK_DURATION_MS = 30;

const GPWS_AGL_THRESHOLDS_FT = [2500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10];
const GPWS_AGL_PHRASES: Record<number, string> = {
    2500: 'two thousand five hundred',
    1000: 'one thousand',
    500:  'five hundred',
    400:  'four hundred',
    300:  'three hundred',
    200:  'two hundred',
    100:  'one hundred',
    50:   'fifty',
    40:   'forty',
    30:   'thirty',
    20:   'twenty',
    10:   'ten',
};
const GPWS_PULL_UP_AGL_FT = 50;
const GPWS_PULL_UP_VS_FPM_THRESHOLD = -2000;
const GPWS_SINK_RATE_AGL_FT = 1500;
const GPWS_SINK_RATE_VS_FPM_THRESHOLD = -2500;
const GPWS_SAY_INTERVAL_MS = 4000;

const FLIGHT_AUDIO_VNE_FALLBACK_MACH = 0.95;

interface FlightAudioOptions {
    enableTts?: boolean;
}

export class FlightAudio {
    private _ttsEnabled: boolean;

    private _ctx: AudioContext | null = null;

    private _windNoise: AudioBufferSourceNode | null = null;
    private _windFilter: BiquadFilterNode | null = null;
    private _windGain: GainNode | null = null;
    private _windRunning = false;
    private _targetWindGain = 0;
    private _targetWindFilter = WIND_LOWPASS_MIN_HZ;

    private _stallOsc: OscillatorNode | null = null;
    private _stallGain: GainNode | null = null;
    private _stallActive = false;

    private _overspeedActive = false;
    private _overspeedTimer: ReturnType<typeof setInterval> | null = null;

    private _gearWhirrOsc: OscillatorNode | null = null;
    private _gearWhirrGain: GainNode | null = null;
    private _gearWhirrFilter: BiquadFilterNode | null = null;
    private _gearWhirrActive = false;

    private _flapWhirrOsc: OscillatorNode | null = null;
    private _flapWhirrGain: GainNode | null = null;
    private _flapWhirrFilter: BiquadFilterNode | null = null;
    private _flapWhirrActive = false;

    private _gpwsLastPhrase = '';
    private _gpwsLastSayMs = 0;
    private _gpwsLastAglBucket = -1;

    private _menuMusicOsc: OscillatorNode | null = null;
    private _menuMusicGain: GainNode | null = null;
    private _menuMusicTimer: ReturnType<typeof setInterval> | null = null;

    private _disposed = false;

    constructor(opts: FlightAudioOptions = {}) {
        this._ttsEnabled = opts.enableTts !== false;
    }

    private _ensureCtx(): AudioContext | null {
        if (this._disposed) return null;
        if (this._ctx) return this._ctx;
        const ctx = AudioCore.getCtx();
        if (!ctx) return null;
        this._ctx = ctx;
        return ctx;
    }

    private _makePinkNoiseBuffer(ctx: AudioContext): AudioBuffer {
        const len = Math.floor(ctx.sampleRate * PINK_NOISE_BUFFER_SECONDS);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;
            data[i] = pink * 0.11;
        }
        return buf;
    }

    public startWind(): void {
        if (this._windRunning) return;
        const ctx = this._ensureCtx();
        const bus = AudioCore.getWindBus();
        if (!ctx || !bus) return;
        try {
            const src = ctx.createBufferSource();
            src.buffer = this._makePinkNoiseBuffer(ctx);
            src.loop = true;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = WIND_LOWPASS_MIN_HZ;
            filter.Q.value = 0.5;

            const gain = ctx.createGain();
            gain.gain.value = 0;

            src.connect(filter);
            filter.connect(gain);
            gain.connect(bus);
            src.start();

            this._windNoise = src;
            this._windFilter = filter;
            this._windGain = gain;
            this._windRunning = true;
        } catch (err) {
            console.warn('[FlightAudio] startWind failed:', err);
        }
    }

    public stopWind(): void {
        if (!this._windRunning) return;
        try { this._windNoise?.stop(); } catch (_) { /* ignore */ }
        try { this._windNoise?.disconnect(); } catch (_) { /* ignore */ }
        try { this._windFilter?.disconnect(); } catch (_) { /* ignore */ }
        try { this._windGain?.disconnect(); } catch (_) { /* ignore */ }
        this._windNoise = null;
        this._windFilter = null;
        this._windGain = null;
        this._windRunning = false;
    }

    public setAirspeed(iasKts: number): void {
        if (!this._windRunning) return;
        const safeIas = Number.isFinite(iasKts) ? Math.max(0, iasKts) : 0;
        const ratio = safeIas / WIND_REFERENCE_IAS_KTS;
        const sq = Math.min(1.6, ratio * ratio);
        this._targetWindGain = WIND_GAIN_MAX * sq;
        this._targetWindFilter = WIND_LOWPASS_MIN_HZ + (WIND_LOWPASS_MAX_HZ - WIND_LOWPASS_MIN_HZ) * Math.min(1, ratio);
    }

    public setStallActive(active: boolean): void {
        if (active === this._stallActive) return;
        this._stallActive = active;
        if (active) this._startStallHorn();
        else this._stopStallHorn();
    }

    private _startStallHorn(): void {
        const ctx = this._ensureCtx();
        const bus = AudioCore.getAlertsBus();
        if (!ctx || !bus) return;
        try {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = STALL_HORN_FREQ_HZ;

            const gain = ctx.createGain();
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(bus);
            osc.start();

            this._stallOsc = osc;
            this._stallGain = gain;
            this._scheduleStallPulses();
        } catch (err) {
            console.warn('[FlightAudio] startStallHorn failed:', err);
        }
    }

    private _scheduleStallPulses(): void {
        if (!this._stallGain || !this._ctx) return;
        const ctx = this._ctx;
        const gain = this._stallGain;
        const period = 1.0 / STALL_HORN_PULSE_HZ;
        const onTime = period * STALL_HORN_DUTY;
        const startAt = ctx.currentTime + 0.02;
        const cycles = Math.ceil(STALL_HORN_PULSE_HZ * 60);
        try {
            gain.gain.cancelScheduledValues(0);
            for (let i = 0; i < cycles; i++) {
                const t0 = startAt + i * period;
                gain.gain.setValueAtTime(STALL_HORN_GAIN, t0);
                gain.gain.setValueAtTime(0, t0 + onTime);
            }
        } catch (err) {
            console.warn('[FlightAudio] scheduleStallPulses failed:', err);
        }
    }

    private _stopStallHorn(): void {
        try { this._stallGain?.gain.cancelScheduledValues(0); } catch (_) { /* ignore */ }
        try { this._stallGain?.gain.setValueAtTime(0, this._ctx?.currentTime ?? 0); } catch (_) { /* ignore */ }
        try { this._stallOsc?.stop(); } catch (_) { /* ignore */ }
        try { this._stallOsc?.disconnect(); } catch (_) { /* ignore */ }
        try { this._stallGain?.disconnect(); } catch (_) { /* ignore */ }
        this._stallOsc = null;
        this._stallGain = null;
    }

    public setOverspeedActive(active: boolean): void {
        if (active === this._overspeedActive) return;
        this._overspeedActive = active;
        if (active) {
            const intervalMs = 1000 / OVERSPEED_CLACKER_PULSE_HZ;
            this._overspeedTimer = setInterval(() => this._playClack(), intervalMs);
        } else if (this._overspeedTimer) {
            clearInterval(this._overspeedTimer);
            this._overspeedTimer = null;
        }
    }

    private _playClack(): void {
        const ctx = this._ensureCtx();
        const bus = AudioCore.getAlertsBus();
        if (!ctx || !bus) return;
        try {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = OVERSPEED_CLACKER_FREQ_HZ;

            const gain = ctx.createGain();
            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(OVERSPEED_CLACKER_GAIN, now + 0.001);
            gain.gain.linearRampToValueAtTime(0, now + OVERSPEED_CLACKER_DURATION_MS / 1000);

            osc.connect(gain);
            gain.connect(bus);
            osc.start(now);
            osc.stop(now + OVERSPEED_CLACKER_DURATION_MS / 1000 + 0.02);
        } catch (err) {
            console.warn('[FlightAudio] playClack failed:', err);
        }
    }

    public maybeOverspeedFromMach(mach: number, vneMach?: number | null): void {
        const limit = (vneMach != null && Number.isFinite(vneMach) && vneMach > 0)
            ? vneMach
            : FLIGHT_AUDIO_VNE_FALLBACK_MACH;
        const safeMach = Number.isFinite(mach) ? mach : 0;
        this.setOverspeedActive(safeMach > limit);
    }

    public updateGpws(aglFt: number, vsFpm: number, isOnGround: boolean, gearDown: boolean): void {
        if (isOnGround) {
            this._gpwsLastAglBucket = -1;
            return;
        }
        const now = performance.now();

        if (aglFt < GPWS_PULL_UP_AGL_FT && vsFpm < GPWS_PULL_UP_VS_FPM_THRESHOLD) {
            if (now - this._gpwsLastSayMs > GPWS_SAY_INTERVAL_MS) {
                this.speakGpws('pull up');
                this._gpwsLastSayMs = now;
                this._gpwsLastPhrase = 'pull up';
            }
            return;
        }
        if (aglFt < GPWS_SINK_RATE_AGL_FT && vsFpm < GPWS_SINK_RATE_VS_FPM_THRESHOLD) {
            if (now - this._gpwsLastSayMs > GPWS_SAY_INTERVAL_MS) {
                this.speakGpws('sink rate');
                this._gpwsLastSayMs = now;
                this._gpwsLastPhrase = 'sink rate';
            }
            return;
        }

        if (vsFpm > 100 || !gearDown) {
            this._gpwsLastAglBucket = -1;
            return;
        }

        let bucket = -1;
        for (const t of GPWS_AGL_THRESHOLDS_FT) {
            if (aglFt <= t && aglFt > t - this._aglBucketWidth(t)) {
                bucket = t;
                break;
            }
        }
        if (bucket > 0 && bucket !== this._gpwsLastAglBucket) {
            const phrase = GPWS_AGL_PHRASES[bucket];
            if (phrase) {
                this.speakGpws(phrase);
                this._gpwsLastSayMs = now;
                this._gpwsLastPhrase = phrase;
            }
            this._gpwsLastAglBucket = bucket;
        }
    }

    private _aglBucketWidth(threshold: number): number {
        if (threshold >= 2000) return 200;
        if (threshold >= 500) return 100;
        if (threshold >= 100) return 50;
        return 8;
    }

    public speakGpws(phrase: string): void {
        if (!this._ttsEnabled) return;
        try {
            const synth = (window as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
            if (!synth) return;
            const u = new SpeechSynthesisUtterance(phrase);
            u.rate = GPWS_TTS_RATE;
            u.pitch = GPWS_TTS_PITCH;
            u.volume = GPWS_TTS_VOLUME * AudioCore.getVolumes().alerts * AudioCore.getVolumes().master;
            try { synth.cancel(); } catch (_) { /* ignore */ }
            synth.speak(u);
        } catch (err) {
            console.warn('[FlightAudio] speakGpws failed:', err);
        }
    }

    public speakAtc(phrase: string): void {
        if (!this._ttsEnabled || !phrase) return;
        try {
            const synth = (window as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
            if (!synth) return;
            const u = new SpeechSynthesisUtterance(phrase);
            u.rate = ATC_TTS_RATE;
            u.pitch = ATC_TTS_PITCH;
            u.volume = ATC_TTS_VOLUME * AudioCore.getVolumes().atc * AudioCore.getVolumes().master;
            synth.speak(u);
        } catch (err) {
            console.warn('[FlightAudio] speakAtc failed:', err);
        }
    }

    public setGearTransitioning(active: boolean): void {
        if (active === this._gearWhirrActive) return;
        this._gearWhirrActive = active;
        if (active) this._startGearWhirr();
        else this._stopGearWhirr();
    }

    private _startGearWhirr(): void {
        const ctx = this._ensureCtx();
        const bus = AudioCore.getEngineBus();
        if (!ctx || !bus) return;
        try {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = GEAR_WHIRR_FREQ_BASE_HZ;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1200;
            const gain = ctx.createGain();
            gain.gain.value = 0;
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(bus);
            osc.start();
            const now = ctx.currentTime;
            gain.gain.linearRampToValueAtTime(GEAR_WHIRR_GAIN, now + 0.05);
            this._gearWhirrOsc = osc;
            this._gearWhirrFilter = filter;
            this._gearWhirrGain = gain;
        } catch (err) {
            console.warn('[FlightAudio] startGearWhirr failed:', err);
        }
    }

    private _stopGearWhirr(): void {
        const ctx = this._ctx;
        if (this._gearWhirrGain && ctx) {
            try {
                const now = ctx.currentTime;
                this._gearWhirrGain.gain.cancelScheduledValues(now);
                this._gearWhirrGain.gain.setValueAtTime(this._gearWhirrGain.gain.value, now);
                this._gearWhirrGain.gain.linearRampToValueAtTime(0, now + 0.05);
            } catch (_) { /* ignore */ }
        }
        try { this._gearWhirrOsc?.stop((ctx?.currentTime ?? 0) + 0.08); } catch (_) { /* ignore */ }
        try { this._gearWhirrFilter?.disconnect(); } catch (_) { /* ignore */ }
        this._gearWhirrOsc = null;
        this._gearWhirrFilter = null;
        this._gearWhirrGain = null;
    }

    public setFlapsAnimating(active: boolean): void {
        if (active === this._flapWhirrActive) return;
        this._flapWhirrActive = active;
        if (active) this._startFlapWhirr();
        else this._stopFlapWhirr();
    }

    private _startFlapWhirr(): void {
        const ctx = this._ensureCtx();
        const bus = AudioCore.getEngineBus();
        if (!ctx || !bus) return;
        try {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = FLAP_WHIRR_FREQ_BASE_HZ;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 900;
            const gain = ctx.createGain();
            gain.gain.value = 0;
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(bus);
            osc.start();
            const now = ctx.currentTime;
            gain.gain.linearRampToValueAtTime(FLAP_WHIRR_GAIN, now + 0.05);
            this._flapWhirrOsc = osc;
            this._flapWhirrFilter = filter;
            this._flapWhirrGain = gain;
        } catch (err) {
            console.warn('[FlightAudio] startFlapWhirr failed:', err);
        }
    }

    private _stopFlapWhirr(): void {
        const ctx = this._ctx;
        if (this._flapWhirrGain && ctx) {
            try {
                const now = ctx.currentTime;
                this._flapWhirrGain.gain.cancelScheduledValues(now);
                this._flapWhirrGain.gain.setValueAtTime(this._flapWhirrGain.gain.value, now);
                this._flapWhirrGain.gain.linearRampToValueAtTime(0, now + 0.05);
            } catch (_) { /* ignore */ }
        }
        try { this._flapWhirrOsc?.stop((ctx?.currentTime ?? 0) + 0.08); } catch (_) { /* ignore */ }
        try { this._flapWhirrFilter?.disconnect(); } catch (_) { /* ignore */ }
        this._flapWhirrOsc = null;
        this._flapWhirrFilter = null;
        this._flapWhirrGain = null;
    }

    public playClick(freq: number = CLICK_FREQ_HZ): void {
        const ctx = this._ensureCtx();
        const bus = AudioCore.getClickBus();
        if (!ctx || !bus) return;
        try {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = freq;
            const gain = ctx.createGain();
            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(CLICK_GAIN, now + 0.001);
            gain.gain.exponentialRampToValueAtTime(0.001, now + CLICK_DURATION_MS / 1000);
            osc.connect(gain);
            gain.connect(bus);
            osc.start(now);
            osc.stop(now + CLICK_DURATION_MS / 1000 + 0.02);
        } catch (err) {
            console.warn('[FlightAudio] playClick failed:', err);
        }
    }

    public update(): void {
        if (!this._windRunning || !this._windGain || !this._windFilter) return;
        try {
            const curG = this._windGain.gain.value;
            this._windGain.gain.value = curG + (this._targetWindGain - curG) * WIND_GAIN_SMOOTHING;
            const curF = this._windFilter.frequency.value;
            this._windFilter.frequency.value = curF + (this._targetWindFilter - curF) * WIND_FILTER_SMOOTHING;
        } catch (err) {
            console.warn('[FlightAudio] update failed:', err);
        }
    }

    public startMenuMusic(): void {
        if (this._menuMusicOsc) return;
        const ctx = this._ensureCtx();
        const bus = AudioCore.getMusicBus();
        if (!ctx || !bus) return;
        try {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 220;
            const gain = ctx.createGain();
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(bus);
            osc.start();
            const now = ctx.currentTime;
            gain.gain.linearRampToValueAtTime(0.06, now + 1.0);
            this._menuMusicOsc = osc;
            this._menuMusicGain = gain;
            const notes = [220, 277.18, 329.63, 392, 329.63, 277.18];
            let idx = 0;
            this._menuMusicTimer = setInterval(() => {
                if (!this._menuMusicOsc) return;
                idx = (idx + 1) % notes.length;
                try {
                    this._menuMusicOsc.frequency.linearRampToValueAtTime(notes[idx], (this._ctx?.currentTime ?? 0) + 0.4);
                } catch (_) { /* ignore */ }
            }, 800);
        } catch (err) {
            console.warn('[FlightAudio] startMenuMusic failed:', err);
        }
    }

    public stopMenuMusic(): void {
        if (this._menuMusicTimer) {
            clearInterval(this._menuMusicTimer);
            this._menuMusicTimer = null;
        }
        const ctx = this._ctx;
        const gain = this._menuMusicGain;
        if (gain && ctx) {
            try {
                const now = ctx.currentTime;
                gain.gain.cancelScheduledValues(now);
                gain.gain.linearRampToValueAtTime(0, now + 0.5);
            } catch (_) { /* ignore */ }
        }
        try { this._menuMusicOsc?.stop((ctx?.currentTime ?? 0) + 0.6); } catch (_) { /* ignore */ }
        try { this._menuMusicOsc?.disconnect(); } catch (_) { /* ignore */ }
        try { this._menuMusicGain?.disconnect(); } catch (_) { /* ignore */ }
        this._menuMusicOsc = null;
        this._menuMusicGain = null;
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.stopWind();
        this._stopStallHorn();
        if (this._overspeedTimer) {
            clearInterval(this._overspeedTimer);
            this._overspeedTimer = null;
        }
        this._stopGearWhirr();
        this._stopFlapWhirr();
        this.stopMenuMusic();
        try {
            const synth = (window as unknown as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
            synth?.cancel();
        } catch (_) { /* ignore */ }
        this._ctx = null;
    }
}
