/** Procedural sound effects via the Web Audio API (no asset files). */
import type { MahjongScene } from '../MahjongScene.js';
import { MahjongPrefs } from '../MahjongPrefs.js';

export class AudioSystem {
    private game: MahjongScene;
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        const unlock = () => this.ensureContext();
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
    }

    private ensureContext(): void {
        if (this.ctx) return;
        try {
            const Ctor = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new Ctor();
            this.master = this.ctx.createGain();
            this.master.gain.value = MahjongPrefs.volume;
            this.master.connect(this.ctx.destination);
        } catch (err) {
            console.warn('[AudioSystem] Web Audio unavailable:', err);
        }
    }

    private tone(freq: number, durationMs: number, type: OscillatorType, gain: number, delayMs = 0): void {
        if (!MahjongPrefs.soundEnabled) return;
        this.ensureContext();
        if (!this.ctx || !this.master) return;
        this.master.gain.value = MahjongPrefs.volume;
        const start = this.ctx.currentTime + delayMs / 1000;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
        osc.connect(g);
        g.connect(this.master);
        osc.start(start);
        osc.stop(start + durationMs / 1000 + 0.02);
    }

    select(): void { this.tone(520, 90, 'triangle', 0.18); }
    error(): void { this.tone(150, 160, 'sawtooth', 0.16); }

    match(): void {
        this.tone(660, 110, 'triangle', 0.2);
        this.tone(880, 130, 'triangle', 0.16, 70);
    }

    win(): void {
        const notes = [523, 659, 784, 1047];
        notes.forEach((n, i) => this.tone(n, 220, 'triangle', 0.22, i * 120));
    }

    dispose(): void {
        try { this.ctx?.close(); } catch (_) { /* ignore */ }
        this.ctx = null;
        this.master = null;
    }
}
