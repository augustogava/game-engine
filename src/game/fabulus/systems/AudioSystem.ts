import type { FabulusScene } from '../FabulusScene.js';
import { AudioCore } from '../../AudioCore.js';

const SFX_GAIN = 0.25;
const FOOTSTEP_WALK_INTERVAL_S = 0.45;
const FOOTSTEP_RUN_INTERVAL_S = 0.3;

const AMBIENCE_GAIN = 0.045;
const AMBIENCE_DRONE_GAIN = 0.02;

// Short attack ramp removes the click that an instant gain start would produce.
const ENVELOPE_ATTACK_S = 0.006;
const DEFAULT_REVERB_SEND = 0.18;
const DEFAULT_PAN_SPREAD = 0.35;
const REVERB_SECONDS = 1.8;
const REVERB_RETURN_GAIN = 0.5;

export class AudioSystem {
    private scene: FabulusScene;
    private footstepTimer = 0;
    private ambienceNodes: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode; lfoGain: GainNode } | null = null;
    private extraAmbience: AudioNode[] = [];
    private reverbInput: GainNode | null = null;
    private reverbBuilt = false;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        AudioCore.getCtx();
        this._startAmbience();
        console.debug('[Fabulus] Audio ready');
    }

    /** Lazily builds a shared dungeon reverb (synthesized impulse) on the SFX bus. */
    private _reverb(): GainNode | null {
        if (this.reverbBuilt) return this.reverbInput;
        this.reverbBuilt = true;
        const ctx = this._ctx();
        const bus = this._bus();
        if (!ctx || !bus) return null;
        try {
            const rate = ctx.sampleRate;
            const length = Math.floor(rate * REVERB_SECONDS);
            const impulse = ctx.createBuffer(2, length, rate);
            for (let ch = 0; ch < 2; ch++) {
                const data = impulse.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    const decay = Math.pow(1 - i / length, 2.6);
                    data[i] = (Math.random() * 2 - 1) * decay;
                }
            }
            const convolver = ctx.createConvolver();
            convolver.buffer = impulse;
            const damp = ctx.createBiquadFilter();
            damp.type = 'lowpass';
            damp.frequency.value = 2600;
            const input = ctx.createGain();
            const ret = ctx.createGain();
            ret.gain.value = REVERB_RETURN_GAIN;
            input.connect(convolver);
            convolver.connect(damp);
            damp.connect(ret);
            ret.connect(bus);
            this.reverbInput = input;
            return input;
        } catch (err) {
            console.warn('[Fabulus] reverb build failed:', err);
            this.reverbInput = null;
            return null;
        }
    }

    /** Routes a source's envelope output to the dry bus plus an optional reverb/pan send. */
    private _route(envelope: GainNode, pan: number, reverbSend: number): void {
        const ctx = this._ctx();
        const bus = this._bus();
        if (!ctx || !bus) return;
        let out: AudioNode = envelope;
        if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
            const panner = ctx.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, pan));
            envelope.connect(panner);
            out = panner;
        }
        out.connect(bus);
        if (reverbSend > 0) {
            const rev = this._reverb();
            if (rev) {
                const send = ctx.createGain();
                send.gain.value = reverbSend;
                out.connect(send);
                send.connect(rev);
            }
        }
    }

    private _randomPan(spread = DEFAULT_PAN_SPREAD): number {
        return (Math.random() * 2 - 1) * spread;
    }

    /** Subtle looping wind ambience (procedural filtered noise with a slow LFO). */
    private _startAmbience(): void {
        const ctx = this._ctx();
        const bus = this._bus();
        if (!ctx || !bus || this.ambienceNodes) return;
        try {
            const seconds = 4;
            const samples = Math.floor(ctx.sampleRate * seconds);
            const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            let last = 0;
            for (let i = 0; i < samples; i++) {
                // Brown-ish noise for a softer wind texture.
                const white = Math.random() * 2 - 1;
                last = (last + white * 0.04) / 1.04;
                data[i] = last * 3;
            }
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 420;
            const gain = ctx.createGain();
            gain.gain.value = AMBIENCE_GAIN;
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.07;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = AMBIENCE_GAIN * 0.5;
            lfo.connect(lfoGain);
            lfoGain.connect(gain.gain);
            src.connect(filter);
            filter.connect(gain);
            gain.connect(bus);
            src.start();
            lfo.start();
            this.ambienceNodes = { src, filter, gain, lfo, lfoGain };

            this._startDrone(ctx, bus);
        } catch (err) {
            console.warn('[Fabulus] ambience failed:', err);
        }
    }

    /** Low detuned drone pad under the wind for a heavier dungeon atmosphere. */
    private _startDrone(ctx: AudioContext, bus: GainNode): void {
        try {
            const droneGain = ctx.createGain();
            droneGain.gain.value = AMBIENCE_DRONE_GAIN;
            const droneFilter = ctx.createBiquadFilter();
            droneFilter.type = 'lowpass';
            droneFilter.frequency.value = 240;
            droneFilter.connect(droneGain);
            droneGain.connect(bus);

            const freqs = [55, 55.4, 82.5];
            for (const f of freqs) {
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.value = f;
                osc.connect(droneFilter);
                osc.start();
                this.extraAmbience.push(osc);
            }
            const swell = ctx.createOscillator();
            swell.type = 'sine';
            swell.frequency.value = 0.05;
            const swellGain = ctx.createGain();
            swellGain.gain.value = AMBIENCE_DRONE_GAIN * 0.6;
            swell.connect(swellGain);
            swellGain.connect(droneGain.gain);
            swell.start();
            this.extraAmbience.push(swell, swellGain, droneGain, droneFilter);
        } catch (err) {
            console.warn('[Fabulus] drone failed:', err);
        }
    }

    private _ctx(): AudioContext | null {
        return AudioCore.getCtx();
    }

    private _bus(): GainNode | null {
        return AudioCore.getSfxBus();
    }

    private _uiBus(): GainNode | null {
        return AudioCore.getClickBus();
    }

    private _tone(type: OscillatorType, startFreq: number, endFreq: number, durationS: number, gain = SFX_GAIN, reverbSend = DEFAULT_REVERB_SEND, pan = this._randomPan()): void {
        const ctx = this._ctx();
        const bus = this._bus();
        if (!ctx || !bus) return;
        try {
            const t = ctx.currentTime;
            const attack = Math.min(ENVELOPE_ATTACK_S, durationS * 0.4);
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(startFreq, t);
            if (endFreq !== startFreq) {
                osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + durationS);
            }
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(gain, t + attack);
            g.gain.exponentialRampToValueAtTime(0.001, t + durationS);
            osc.connect(g);
            this._route(g, pan, reverbSend);
            osc.start();
            osc.stop(t + durationS);
        } catch (err) {
            console.warn('[Fabulus] tone failed:', err);
        }
    }

    private _noise(durationS: number, filterFreq: number, gain = SFX_GAIN, reverbSend = DEFAULT_REVERB_SEND, pan = this._randomPan()): void {
        const ctx = this._ctx();
        const bus = this._bus();
        if (!ctx || !bus) return;
        try {
            const t = ctx.currentTime;
            const attack = Math.min(ENVELOPE_ATTACK_S, durationS * 0.4);
            const samples = Math.floor(ctx.sampleRate * durationS);
            const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(filterFreq, t);
            filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterFreq * 0.2), t + durationS);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(gain, t + attack);
            g.gain.exponentialRampToValueAtTime(0.001, t + durationS);
            src.connect(filter);
            filter.connect(g);
            this._route(g, pan, reverbSend);
            src.start();
        } catch (err) {
            console.warn('[Fabulus] noise failed:', err);
        }
    }

    /** Random pitch multiplier so repeated hits/swings don't sound identical. */
    private _vary(base: number, spreadPct = 0.16): number {
        return base * (1 + (Math.random() * 2 - 1) * spreadPct);
    }

    playSwing(): void {
        const pan = this._randomPan();
        this._noise(0.18, this._vary(1800), 0.18, 0.1, pan);
        // Low whoosh body so the swing has air behind the transient.
        this._tone('sine', this._vary(420), 160, 0.16, 0.07, 0.1, pan);
    }

    playHit(crit: boolean): void {
        const pan = this._randomPan();
        this._noise(crit ? 0.3 : 0.18, this._vary(crit ? 900 : 600), crit ? 0.32 : 0.22, 0.22, pan);
        // Low thump gives the impact weight.
        this._tone('sine', this._vary(crit ? 150 : 120), 50, crit ? 0.22 : 0.14, crit ? 0.28 : 0.18, 0.18, pan);
        if (crit) this._tone('square', this._vary(220), 80, 0.18, 0.15, 0.3, pan);
    }

    playPlayerHurt(): void {
        this._tone('sawtooth', 180, 70, 0.22, 0.18);
    }

    playPlayerDeath(): void {
        this._tone('sawtooth', 220, 40, 0.9, 0.25);
    }

    playEnemyGrowl(): void {
        this._tone('sawtooth', 110, 60, 0.3, 0.14);
    }

    playEnemyDeath(): void {
        this._tone('sawtooth', 150, 35, 0.5, 0.18);
        this._noise(0.35, 500, 0.15);
    }

    playLevelUp(): void {
        const ctx = this._ctx();
        if (!ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
            setTimeout(() => this._tone('triangle', freq, freq, 0.25, 0.22), i * 110);
        });
        // Closing chord + shimmer for extra impact.
        setTimeout(() => {
            this._tone('triangle', 1046.5, 1046.5, 0.6, 0.2);
            this._tone('triangle', 1318.51, 1318.51, 0.6, 0.16);
            this._tone('sine', 1567.98, 1567.98, 0.7, 0.12);
            this._noise(0.5, 4000, 0.06);
        }, notes.length * 110);
    }

    /** Element-aware cast sound (fire/ice/arcane/physical/holy). */
    playSkillCast(element?: string | null): void {
        switch (element) {
            case 'fire':
                this._noise(0.3, this._vary(1200), 0.2);
                this._tone('sawtooth', this._vary(180), 60, 0.28, 0.12);
                break;
            case 'ice':
                this._tone('sine', this._vary(1400), 2200, 0.22, 0.14);
                this._tone('triangle', this._vary(900), 1600, 0.3, 0.1);
                break;
            case 'arcane':
                this._tone('sine', this._vary(400), 1100, 0.3, 0.16);
                this._tone('sine', this._vary(800), 500, 0.22, 0.1);
                break;
            case 'holy':
                this._tone('sine', 392, 587, 0.35, 0.18);
                break;
            default:
                this._tone('sine', this._vary(500), 900, 0.15, 0.16);
        }
    }

    playProjectile(element?: string | null): void {
        if (element === 'fire') {
            this._noise(0.25, this._vary(900), 0.16);
        } else if (element === 'ice') {
            this._tone('triangle', this._vary(1200), 400, 0.2, 0.12);
        } else {
            this._tone('square', this._vary(700), 200, 0.2, 0.14);
        }
    }

    playPotionDrink(): void {
        this._tone('sine', 320, 520, 0.18, 0.16);
        this._noise(0.12, 800, 0.08);
    }

    playSellItem(): void {
        this._tone('sine', 987.77, 987.77, 0.08, 0.18);
        setTimeout(() => this._tone('sine', 1174.66, 1174.66, 0.16, 0.16), 60);
    }

    playHeal(): void {
        this._tone('sine', 392, 587, 0.35, 0.18);
    }

    playCoin(): void {
        this._tone('sine', 987.77, 987.77, 0.08, 0.2);
        setTimeout(() => this._tone('sine', 1318.51, 1318.51, 0.2, 0.18), 70);
    }

    playItemPickup(): void {
        this._tone('triangle', 440, 880, 0.22, 0.2);
    }

    playUiClick(): void {
        const ctx = this._ctx();
        const bus = this._uiBus();
        if (!ctx || !bus) return;
        try {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const t = ctx.currentTime;
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, t);
            osc.frequency.exponentialRampToValueAtTime(900, t + 0.05);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.1, t + 0.003);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
            osc.connect(g);
            g.connect(bus);
            osc.start();
            osc.stop(ctx.currentTime + 0.05);
        } catch (err) {
            console.warn('[Fabulus] ui click tone failed:', err);
        }
    }

    tickFootsteps(dt: number, running: boolean): void {
        this.footstepTimer -= dt;
        if (this.footstepTimer > 0) return;
        this.footstepTimer = running ? FOOTSTEP_RUN_INTERVAL_S : FOOTSTEP_WALK_INTERVAL_S;
        const pan = this._randomPan(0.2);
        const weight = running ? 1.25 : 1;
        // Low thud (footfall body) layered with a short dirt crunch.
        this._tone('sine', this._vary(95, 0.1), 55, 0.08, 0.08 * weight, 0.08, pan);
        this._noise(0.05, this._vary(420, 0.12), 0.06 * weight, 0.08, pan);
    }

    dispose(): void {
        if (this.ambienceNodes) {
            const { src, filter, gain, lfo, lfoGain } = this.ambienceNodes;
            try { src.stop(); } catch { /* already stopped */ }
            try { lfo.stop(); } catch { /* already stopped */ }
            try { src.disconnect(); } catch { /* already disconnected */ }
            try { filter.disconnect(); } catch { /* already disconnected */ }
            try { lfoGain.disconnect(); } catch { /* already disconnected */ }
            try { gain.disconnect(); } catch { /* already disconnected */ }
            this.ambienceNodes = null;
        }
        for (const node of this.extraAmbience) {
            try { (node as OscillatorNode).stop?.(); } catch { /* already stopped */ }
            try { node.disconnect(); } catch { /* already disconnected */ }
        }
        this.extraAmbience = [];
        if (this.reverbInput) {
            try { this.reverbInput.disconnect(); } catch { /* already disconnected */ }
            this.reverbInput = null;
        }
        this.reverbBuilt = false;
    }
}
