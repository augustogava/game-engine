import type { FabulusScene } from '../FabulusScene.js';
import { AudioCore } from '../../AudioCore.js';

const SFX_GAIN = 0.25;
const FOOTSTEP_WALK_INTERVAL_S = 0.45;
const FOOTSTEP_RUN_INTERVAL_S = 0.3;

const AMBIENCE_GAIN = 0.045;

export class AudioSystem {
    private scene: FabulusScene;
    private footstepTimer = 0;
    private ambienceNodes: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode; lfoGain: GainNode } | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        AudioCore.getCtx();
        this._startAmbience();
        console.debug('[Fabulus] Audio ready');
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
        } catch (err) {
            console.warn('[Fabulus] ambience failed:', err);
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

    private _tone(type: OscillatorType, startFreq: number, endFreq: number, durationS: number, gain = SFX_GAIN): void {
        const ctx = this._ctx();
        const bus = this._bus();
        if (!ctx || !bus) return;
        try {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
            if (endFreq !== startFreq) {
                osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), ctx.currentTime + durationS);
            }
            g.gain.setValueAtTime(gain, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationS);
            osc.connect(g);
            g.connect(bus);
            osc.start();
            osc.stop(ctx.currentTime + durationS);
        } catch (err) {
            console.warn('[Fabulus] tone failed:', err);
        }
    }

    private _noise(durationS: number, filterFreq: number, gain = SFX_GAIN): void {
        const ctx = this._ctx();
        const bus = this._bus();
        if (!ctx || !bus) return;
        try {
            const samples = Math.floor(ctx.sampleRate * durationS);
            const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterFreq * 0.2), ctx.currentTime + durationS);
            const g = ctx.createGain();
            g.gain.setValueAtTime(gain, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationS);
            src.connect(filter);
            filter.connect(g);
            g.connect(bus);
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
        this._noise(0.18, this._vary(1800), 0.18);
    }

    playHit(crit: boolean): void {
        this._noise(crit ? 0.3 : 0.18, this._vary(crit ? 900 : 600), crit ? 0.32 : 0.22);
        if (crit) this._tone('square', this._vary(220), 80, 0.18, 0.15);
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
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.05);
            g.gain.setValueAtTime(0.1, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
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
        this._noise(0.06, 300, 0.07);
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
    }
}
