import type { FabulusScene } from '../FabulusScene.js';
import { AudioCore } from '../../AudioCore.js';

const SFX_GAIN = 0.25;
const FOOTSTEP_WALK_INTERVAL_S = 0.45;
const FOOTSTEP_RUN_INTERVAL_S = 0.3;

export class AudioSystem {
    private scene: FabulusScene;
    private footstepTimer = 0;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        AudioCore.getCtx();
        console.debug('[Fabulus] Audio ready');
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

    playSwing(): void {
        this._noise(0.18, 1800, 0.18);
    }

    playHit(crit: boolean): void {
        this._noise(crit ? 0.3 : 0.18, crit ? 900 : 600, crit ? 0.32 : 0.22);
        if (crit) this._tone('square', 220, 80, 0.18, 0.15);
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
    }

    playSkillCast(): void {
        this._tone('sine', 500, 900, 0.15, 0.16);
    }

    playProjectile(): void {
        this._tone('square', 700, 200, 0.2, 0.14);
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
        // AudioCore is a shared singleton; nothing owned here.
    }
}
