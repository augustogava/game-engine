import { AudioCore } from './AudioCore.js';

export const ENGINE_SOUND_TYPE_PISTON    = 0;
export const ENGINE_SOUND_TYPE_TURBOPROP = 1;
export const ENGINE_SOUND_TYPE_TURBOJET  = 2;
export const ENGINE_SOUND_TYPE_TURBOFAN  = 3;
export const ENGINE_SOUND_TYPE_ELECTRIC  = 4;

const ENGINE_GAIN_SMOOTHING = 0.08;
const ENGINE_FREQ_SMOOTHING = 0.06;
const ENGINE_NOISE_BUFFER_SECONDS = 2;

const PISTON_BASE_FREQ_HZ = 35;
const PISTON_RPM_TO_FREQ_DIV = 30;
const PISTON_DETUNE_CENTS = 12;
const PISTON_HARMONIC_MULT = 2.02;
const PISTON_HARMONIC_GAIN = 0.35;
const PISTON_RUMBLE_BASE_HZ = 80;
const PISTON_RUMBLE_Q = 6;
const PISTON_LOWPASS_BASE_HZ = 380;
const PISTON_LOWPASS_RPM_GAIN_HZ = 0.18;
const PISTON_LOWPASS_Q = 0.7;
const PISTON_MAX_GAIN = 0.06;
const PISTON_NOISE_MAX_GAIN = 0.025;

const TURBOPROP_BASE_FREQ_HZ = 60;
const TURBOPROP_RPM_TO_FREQ_DIV = 25;
const TURBOPROP_HARMONIC_MULT = 2.0;
const TURBOPROP_HARMONIC_GAIN = 0.25;
const TURBOPROP_WHINE_BASE_HZ = 700;
const TURBOPROP_WHINE_RPM_GAIN_HZ = 0.12;
const TURBOPROP_WHINE_GAIN = 0.04;
const TURBOPROP_LOWPASS_BASE_HZ = 600;
const TURBOPROP_LOWPASS_Q = 0.7;
const TURBOPROP_MAX_GAIN = 0.06;
const TURBOPROP_NOISE_MAX_GAIN = 0.018;
const TURBOPROP_RUMBLE_BASE_HZ = 120;
const TURBOPROP_RUMBLE_Q = 5;

const TURBOFAN_WHINE_BASE_HZ = 2200;
const TURBOFAN_WHINE_THROTTLE_GAIN_HZ = 3500;
const TURBOFAN_WHINE_GAIN = 0.05;
const TURBOFAN_ROAR_BASE_HZ = 160;
const TURBOFAN_ROAR_THROTTLE_GAIN_HZ = 80;
const TURBOFAN_ROAR_GAIN = 0.05;
const TURBOFAN_NOISE_MAX_GAIN = 0.06;
const TURBOFAN_NOISE_LOWPASS_BASE_HZ = 800;
const TURBOFAN_NOISE_LOWPASS_THROTTLE_GAIN_HZ = 2500;
const TURBOFAN_MAX_GAIN = 0.07;

const TURBOJET_ROAR_BASE_HZ = 110;
const TURBOJET_ROAR_THROTTLE_GAIN_HZ = 60;
const TURBOJET_ROAR_GAIN = 0.06;
const TURBOJET_NOISE_MAX_GAIN = 0.09;
const TURBOJET_NOISE_LOWPASS_BASE_HZ = 600;
const TURBOJET_NOISE_LOWPASS_THROTTLE_GAIN_HZ = 2200;
const TURBOJET_MAX_GAIN = 0.08;

const ELECTRIC_BASE_FREQ_HZ = 220;
const ELECTRIC_THROTTLE_FREQ_GAIN_HZ = 600;
const ELECTRIC_HARMONIC_MULT = 3.0;
const ELECTRIC_HARMONIC_GAIN = 0.18;
const ELECTRIC_MAX_GAIN = 0.045;

const PANNER_REF_DISTANCE_M = 30;
const PANNER_MAX_DISTANCE_M = 4000;
const PANNER_ROLLOFF = 1.6;

interface EngineSoundOptions {
    engineType: number;
    positional?: boolean;
    refDistanceM?: number;
}

export class EngineSound {
    private _engineType: number;
    private _positional: boolean;
    private _refDistanceM: number;

    private _ctx: AudioContext | null = null;
    private _bus: GainNode | null = null;
    private _output: GainNode | null = null;
    private _panner: PannerNode | null = null;

    private _running = false;
    private _disposed = false;
    private _throttle = 0;
    private _rpm = 0;

    private _fadeStartMs = 0;
    private _fadeDurationMs = 0;
    private _fadeActive = false;

    private _nodes: { osc?: OscillatorNode[]; src?: AudioBufferSourceNode[]; filter?: BiquadFilterNode[]; gain?: GainNode[] } = {};
    private _state: Record<string, OscillatorNode | BiquadFilterNode | GainNode | AudioBufferSourceNode> = {};

    constructor(opts: EngineSoundOptions) {
        this._engineType = Number.isFinite(opts.engineType) ? opts.engineType : ENGINE_SOUND_TYPE_TURBOFAN;
        this._positional = !!opts.positional;
        this._refDistanceM = opts.refDistanceM ?? PANNER_REF_DISTANCE_M;
    }

    public start(): void {
        if (this._running || this._disposed) return;
        try {
            const ctx = AudioCore.getCtx();
            const engineBus = AudioCore.getEngineBus();
            if (!ctx || !engineBus) {
                console.warn('[EngineSound] AudioCore not available');
                return;
            }
            this._ctx = ctx;
            this._bus = engineBus;

            const output = ctx.createGain();
            output.gain.value = 0;
            this._output = output;

            if (this._positional) {
                const panner = ctx.createPanner();
                panner.panningModel = 'HRTF';
                panner.distanceModel = 'inverse';
                panner.refDistance = this._refDistanceM;
                panner.maxDistance = PANNER_MAX_DISTANCE_M;
                panner.rolloffFactor = PANNER_ROLLOFF;
                output.connect(panner);
                panner.connect(engineBus);
                this._panner = panner;
            } else {
                output.connect(engineBus);
            }

            this._buildSynth(ctx, output);

            this._running = true;
            console.log(`[EngineSound] Started type=${this._engineType} positional=${this._positional}`);
        } catch (err) {
            console.warn('[EngineSound] Start failed:', err);
            this._running = false;
        }
    }

    private _buildSynth(ctx: AudioContext, dest: AudioNode): void {
        switch (this._engineType) {
            case ENGINE_SOUND_TYPE_PISTON:    this._buildPiston(ctx, dest); return;
            case ENGINE_SOUND_TYPE_TURBOPROP: this._buildTurboprop(ctx, dest); return;
            case ENGINE_SOUND_TYPE_TURBOJET:  this._buildTurbojet(ctx, dest); return;
            case ENGINE_SOUND_TYPE_ELECTRIC:  this._buildElectric(ctx, dest); return;
            case ENGINE_SOUND_TYPE_TURBOFAN:
            default:
                this._buildTurbofan(ctx, dest); return;
        }
    }

    private _makeNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
        const len = Math.floor(ctx.sampleRate * ENGINE_NOISE_BUFFER_SECONDS);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        return src;
    }

    private _buildPiston(ctx: AudioContext, dest: AudioNode): void {
        const masterFilter = ctx.createBiquadFilter();
        masterFilter.type = 'lowpass';
        masterFilter.frequency.value = PISTON_LOWPASS_BASE_HZ;
        masterFilter.Q.value = PISTON_LOWPASS_Q;
        masterFilter.connect(dest);

        const oscGain = ctx.createGain();
        oscGain.gain.value = 1;
        oscGain.connect(masterFilter);

        const oscPrimary = ctx.createOscillator();
        oscPrimary.type = 'sawtooth';
        oscPrimary.frequency.value = PISTON_BASE_FREQ_HZ;
        oscPrimary.connect(oscGain);

        const oscDetuned = ctx.createOscillator();
        oscDetuned.type = 'sawtooth';
        oscDetuned.frequency.value = PISTON_BASE_FREQ_HZ;
        oscDetuned.detune.value = PISTON_DETUNE_CENTS;
        oscDetuned.connect(oscGain);

        const harmonicGain = ctx.createGain();
        harmonicGain.gain.value = PISTON_HARMONIC_GAIN;
        harmonicGain.connect(masterFilter);

        const oscHarmonic = ctx.createOscillator();
        oscHarmonic.type = 'triangle';
        oscHarmonic.frequency.value = PISTON_BASE_FREQ_HZ * PISTON_HARMONIC_MULT;
        oscHarmonic.connect(harmonicGain);

        const noiseSrc = this._makeNoiseSource(ctx);
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = PISTON_RUMBLE_BASE_HZ;
        noiseFilter.Q.value = PISTON_RUMBLE_Q;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0;
        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterFilter);

        oscPrimary.start();
        oscDetuned.start();
        oscHarmonic.start();
        noiseSrc.start();

        this._state.masterFilter = masterFilter;
        this._state.oscPrimary = oscPrimary;
        this._state.oscDetuned = oscDetuned;
        this._state.oscHarmonic = oscHarmonic;
        this._state.noiseGain = noiseGain;
    }

    private _buildTurboprop(ctx: AudioContext, dest: AudioNode): void {
        const masterFilter = ctx.createBiquadFilter();
        masterFilter.type = 'lowpass';
        masterFilter.frequency.value = TURBOPROP_LOWPASS_BASE_HZ;
        masterFilter.Q.value = TURBOPROP_LOWPASS_Q;
        masterFilter.connect(dest);

        const propGain = ctx.createGain();
        propGain.gain.value = 1;
        propGain.connect(masterFilter);

        const oscPrimary = ctx.createOscillator();
        oscPrimary.type = 'sawtooth';
        oscPrimary.frequency.value = TURBOPROP_BASE_FREQ_HZ;
        oscPrimary.connect(propGain);

        const harmonicGain = ctx.createGain();
        harmonicGain.gain.value = TURBOPROP_HARMONIC_GAIN;
        harmonicGain.connect(masterFilter);

        const oscHarmonic = ctx.createOscillator();
        oscHarmonic.type = 'triangle';
        oscHarmonic.frequency.value = TURBOPROP_BASE_FREQ_HZ * TURBOPROP_HARMONIC_MULT;
        oscHarmonic.connect(harmonicGain);

        const whineGain = ctx.createGain();
        whineGain.gain.value = TURBOPROP_WHINE_GAIN;
        whineGain.connect(dest);

        const oscWhine = ctx.createOscillator();
        oscWhine.type = 'sine';
        oscWhine.frequency.value = TURBOPROP_WHINE_BASE_HZ;
        oscWhine.connect(whineGain);

        const noiseSrc = this._makeNoiseSource(ctx);
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = TURBOPROP_RUMBLE_BASE_HZ;
        noiseFilter.Q.value = TURBOPROP_RUMBLE_Q;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0;
        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterFilter);

        oscPrimary.start();
        oscHarmonic.start();
        oscWhine.start();
        noiseSrc.start();

        this._state.masterFilter = masterFilter;
        this._state.oscPrimary = oscPrimary;
        this._state.oscHarmonic = oscHarmonic;
        this._state.oscWhine = oscWhine;
        this._state.whineGain = whineGain;
        this._state.noiseGain = noiseGain;
    }

    private _buildTurbofan(ctx: AudioContext, dest: AudioNode): void {
        const noiseSrc = this._makeNoiseSource(ctx);
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = TURBOFAN_NOISE_LOWPASS_BASE_HZ;
        noiseFilter.Q.value = 0.5;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0;
        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(dest);

        const whineGain = ctx.createGain();
        whineGain.gain.value = TURBOFAN_WHINE_GAIN;
        whineGain.connect(dest);
        const oscWhine = ctx.createOscillator();
        oscWhine.type = 'sine';
        oscWhine.frequency.value = TURBOFAN_WHINE_BASE_HZ;
        oscWhine.connect(whineGain);

        const roarGain = ctx.createGain();
        roarGain.gain.value = TURBOFAN_ROAR_GAIN;
        roarGain.connect(dest);
        const oscRoar = ctx.createOscillator();
        oscRoar.type = 'sawtooth';
        oscRoar.frequency.value = TURBOFAN_ROAR_BASE_HZ;
        oscRoar.connect(roarGain);

        oscWhine.start();
        oscRoar.start();
        noiseSrc.start();

        this._state.noiseFilter = noiseFilter;
        this._state.noiseGain = noiseGain;
        this._state.oscWhine = oscWhine;
        this._state.whineGain = whineGain;
        this._state.oscRoar = oscRoar;
        this._state.roarGain = roarGain;
    }

    private _buildTurbojet(ctx: AudioContext, dest: AudioNode): void {
        const noiseSrc = this._makeNoiseSource(ctx);
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = TURBOJET_NOISE_LOWPASS_BASE_HZ;
        noiseFilter.Q.value = 0.5;
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0;
        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(dest);

        const roarGain = ctx.createGain();
        roarGain.gain.value = TURBOJET_ROAR_GAIN;
        roarGain.connect(dest);
        const oscRoar = ctx.createOscillator();
        oscRoar.type = 'sawtooth';
        oscRoar.frequency.value = TURBOJET_ROAR_BASE_HZ;
        oscRoar.connect(roarGain);

        oscRoar.start();
        noiseSrc.start();

        this._state.noiseFilter = noiseFilter;
        this._state.noiseGain = noiseGain;
        this._state.oscRoar = oscRoar;
        this._state.roarGain = roarGain;
    }

    private _buildElectric(ctx: AudioContext, dest: AudioNode): void {
        const oscPrimary = ctx.createOscillator();
        oscPrimary.type = 'triangle';
        oscPrimary.frequency.value = ELECTRIC_BASE_FREQ_HZ;
        oscPrimary.connect(dest);

        const harmonicGain = ctx.createGain();
        harmonicGain.gain.value = ELECTRIC_HARMONIC_GAIN;
        harmonicGain.connect(dest);
        const oscHarmonic = ctx.createOscillator();
        oscHarmonic.type = 'sine';
        oscHarmonic.frequency.value = ELECTRIC_BASE_FREQ_HZ * ELECTRIC_HARMONIC_MULT;
        oscHarmonic.connect(harmonicGain);

        oscPrimary.start();
        oscHarmonic.start();

        this._state.oscPrimary = oscPrimary;
        this._state.oscHarmonic = oscHarmonic;
    }

    public stop(): void {
        if (!this._running) return;
        this._running = false;
        for (const k of Object.keys(this._state)) {
            const node = this._state[k];
            if (node instanceof OscillatorNode || node instanceof AudioBufferSourceNode) {
                try { node.stop(); } catch (_) { /* ignore */ }
            }
        }
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.stop();
        try { this._output?.disconnect(); } catch (_) { /* ignore */ }
        try { this._panner?.disconnect(); } catch (_) { /* ignore */ }
        for (const k of Object.keys(this._state)) {
            const node = this._state[k];
            try {
                if ('disconnect' in node) (node as { disconnect: () => void }).disconnect();
            } catch (_) { /* ignore */ }
        }
        this._state = {};
        this._panner = null;
        this._output = null;
        this._bus = null;
        this._ctx = null;
    }

    public setEngineType(engineType: number): void {
        if (engineType === this._engineType) return;
        const wasRunning = this._running;
        if (wasRunning) {
            this.stop();
            try { this._output?.disconnect(); } catch (_) { /* ignore */ }
            for (const k of Object.keys(this._state)) {
                const node = this._state[k];
                try {
                    if ('disconnect' in node) (node as { disconnect: () => void }).disconnect();
                } catch (_) { /* ignore */ }
            }
            this._state = {};
        }
        this._engineType = engineType;
        if (wasRunning) {
            this._running = false;
            this._output = null;
            this._panner = null;
            this.start();
        }
    }

    public setThrottle(t: number): void {
        if (!Number.isFinite(t)) return;
        this._throttle = Math.max(0, Math.min(1.5, t));
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

    public setPosition(x: number, y: number, z: number): void {
        if (!this._panner || !this._ctx) return;
        try {
            const t = this._ctx.currentTime;
            if (this._panner.positionX) {
                this._panner.positionX.setValueAtTime(x, t);
                this._panner.positionY.setValueAtTime(y, t);
                this._panner.positionZ.setValueAtTime(z, t);
            } else {
                (this._panner as unknown as { setPosition?: (x: number, y: number, z: number) => void })
                    .setPosition?.(x, y, z);
            }
        } catch (err) {
            console.warn('[EngineSound] setPosition failed:', err);
        }
    }

    public update(): void {
        if (!this._running || !this._output) return;
        try {
            let fadeMul = 1;
            if (this._fadeActive) {
                const elapsed = performance.now() - this._fadeStartMs;
                fadeMul = Math.max(0, Math.min(1, elapsed / this._fadeDurationMs));
                if (fadeMul >= 1) this._fadeActive = false;
            }

            switch (this._engineType) {
                case ENGINE_SOUND_TYPE_PISTON:    this._updatePiston(fadeMul); break;
                case ENGINE_SOUND_TYPE_TURBOPROP: this._updateTurboprop(fadeMul); break;
                case ENGINE_SOUND_TYPE_TURBOJET:  this._updateTurbojet(fadeMul); break;
                case ENGINE_SOUND_TYPE_ELECTRIC:  this._updateElectric(fadeMul); break;
                case ENGINE_SOUND_TYPE_TURBOFAN:
                default:
                    this._updateTurbofan(fadeMul); break;
            }
        } catch (err) {
            console.warn('[EngineSound] Update failed:', err);
        }
    }

    private _smoothFreq(node: OscillatorNode | BiquadFilterNode, target: number): void {
        const cur = node.frequency.value;
        node.frequency.value = cur + (target - cur) * ENGINE_FREQ_SMOOTHING;
    }

    private _smoothGain(node: GainNode, target: number): void {
        const cur = node.gain.value;
        node.gain.value = cur + (target - cur) * ENGINE_GAIN_SMOOTHING;
    }

    private _updatePiston(fadeMul: number): void {
        if (!this._output) return;
        const oscPrimary = this._state.oscPrimary as OscillatorNode | undefined;
        const oscDetuned = this._state.oscDetuned as OscillatorNode | undefined;
        const oscHarmonic = this._state.oscHarmonic as OscillatorNode | undefined;
        const masterFilter = this._state.masterFilter as BiquadFilterNode | undefined;
        const noiseGain = this._state.noiseGain as GainNode | undefined;
        if (!oscPrimary || !oscDetuned || !oscHarmonic || !masterFilter || !noiseGain) return;

        const targetFreq = PISTON_BASE_FREQ_HZ + this._rpm / PISTON_RPM_TO_FREQ_DIV;
        const cur = oscPrimary.frequency.value;
        const newFreq = cur + (targetFreq - cur) * ENGINE_FREQ_SMOOTHING;
        oscPrimary.frequency.value = newFreq;
        oscDetuned.frequency.value = newFreq;
        oscHarmonic.frequency.value = newFreq * PISTON_HARMONIC_MULT;

        this._smoothFreq(masterFilter, PISTON_LOWPASS_BASE_HZ + this._rpm * PISTON_LOWPASS_RPM_GAIN_HZ);
        this._smoothGain(this._output, PISTON_MAX_GAIN * (0.4 + 0.6 * this._throttle) * fadeMul);
        this._smoothGain(noiseGain, PISTON_NOISE_MAX_GAIN * (0.3 + 0.7 * this._throttle) * fadeMul);
    }

    private _updateTurboprop(fadeMul: number): void {
        if (!this._output) return;
        const oscPrimary = this._state.oscPrimary as OscillatorNode | undefined;
        const oscHarmonic = this._state.oscHarmonic as OscillatorNode | undefined;
        const oscWhine = this._state.oscWhine as OscillatorNode | undefined;
        const whineGain = this._state.whineGain as GainNode | undefined;
        const masterFilter = this._state.masterFilter as BiquadFilterNode | undefined;
        const noiseGain = this._state.noiseGain as GainNode | undefined;
        if (!oscPrimary || !oscHarmonic || !oscWhine || !whineGain || !masterFilter || !noiseGain) return;

        const targetFreq = TURBOPROP_BASE_FREQ_HZ + this._rpm / TURBOPROP_RPM_TO_FREQ_DIV;
        const cur = oscPrimary.frequency.value;
        const newFreq = cur + (targetFreq - cur) * ENGINE_FREQ_SMOOTHING;
        oscPrimary.frequency.value = newFreq;
        oscHarmonic.frequency.value = newFreq * TURBOPROP_HARMONIC_MULT;

        this._smoothFreq(oscWhine, TURBOPROP_WHINE_BASE_HZ + this._rpm * TURBOPROP_WHINE_RPM_GAIN_HZ);
        this._smoothGain(whineGain, TURBOPROP_WHINE_GAIN * (0.5 + 0.5 * this._throttle) * fadeMul);

        this._smoothGain(this._output, TURBOPROP_MAX_GAIN * (0.4 + 0.6 * this._throttle) * fadeMul);
        this._smoothGain(noiseGain, TURBOPROP_NOISE_MAX_GAIN * (0.3 + 0.7 * this._throttle) * fadeMul);
    }

    private _updateTurbofan(fadeMul: number): void {
        if (!this._output) return;
        const noiseFilter = this._state.noiseFilter as BiquadFilterNode | undefined;
        const noiseGain = this._state.noiseGain as GainNode | undefined;
        const oscWhine = this._state.oscWhine as OscillatorNode | undefined;
        const whineGain = this._state.whineGain as GainNode | undefined;
        const oscRoar = this._state.oscRoar as OscillatorNode | undefined;
        const roarGain = this._state.roarGain as GainNode | undefined;
        if (!noiseFilter || !noiseGain || !oscWhine || !whineGain || !oscRoar || !roarGain) return;

        const t = this._throttle;
        this._smoothFreq(oscWhine, TURBOFAN_WHINE_BASE_HZ + t * TURBOFAN_WHINE_THROTTLE_GAIN_HZ);
        this._smoothGain(whineGain, TURBOFAN_WHINE_GAIN * (0.4 + 0.6 * t) * fadeMul);

        this._smoothFreq(oscRoar, TURBOFAN_ROAR_BASE_HZ + t * TURBOFAN_ROAR_THROTTLE_GAIN_HZ);
        this._smoothGain(roarGain, TURBOFAN_ROAR_GAIN * (0.3 + 0.7 * t) * fadeMul);

        this._smoothFreq(noiseFilter, TURBOFAN_NOISE_LOWPASS_BASE_HZ + t * TURBOFAN_NOISE_LOWPASS_THROTTLE_GAIN_HZ);
        this._smoothGain(noiseGain, TURBOFAN_NOISE_MAX_GAIN * (0.3 + 0.7 * t) * fadeMul);

        this._smoothGain(this._output, TURBOFAN_MAX_GAIN * fadeMul);
    }

    private _updateTurbojet(fadeMul: number): void {
        if (!this._output) return;
        const noiseFilter = this._state.noiseFilter as BiquadFilterNode | undefined;
        const noiseGain = this._state.noiseGain as GainNode | undefined;
        const oscRoar = this._state.oscRoar as OscillatorNode | undefined;
        const roarGain = this._state.roarGain as GainNode | undefined;
        if (!noiseFilter || !noiseGain || !oscRoar || !roarGain) return;

        const t = this._throttle;
        this._smoothFreq(oscRoar, TURBOJET_ROAR_BASE_HZ + t * TURBOJET_ROAR_THROTTLE_GAIN_HZ);
        this._smoothGain(roarGain, TURBOJET_ROAR_GAIN * (0.3 + 0.7 * t) * fadeMul);

        this._smoothFreq(noiseFilter, TURBOJET_NOISE_LOWPASS_BASE_HZ + t * TURBOJET_NOISE_LOWPASS_THROTTLE_GAIN_HZ);
        this._smoothGain(noiseGain, TURBOJET_NOISE_MAX_GAIN * (0.3 + 0.7 * t) * fadeMul);

        this._smoothGain(this._output, TURBOJET_MAX_GAIN * fadeMul);
    }

    private _updateElectric(fadeMul: number): void {
        if (!this._output) return;
        const oscPrimary = this._state.oscPrimary as OscillatorNode | undefined;
        const oscHarmonic = this._state.oscHarmonic as OscillatorNode | undefined;
        if (!oscPrimary || !oscHarmonic) return;

        const targetFreq = ELECTRIC_BASE_FREQ_HZ + this._throttle * ELECTRIC_THROTTLE_FREQ_GAIN_HZ;
        this._smoothFreq(oscPrimary, targetFreq);
        const cur = oscPrimary.frequency.value;
        oscHarmonic.frequency.value = cur * ELECTRIC_HARMONIC_MULT;

        this._smoothGain(this._output, ELECTRIC_MAX_GAIN * (0.2 + 0.8 * this._throttle) * fadeMul);
    }
}
