/**
 * AudioSynthesizer.ts
 * Procedural retro sound effects using the Web Audio API.
 */
export class AudioSynthesizer {
    private ctx: AudioContext | null = null;
    private enabled = false;
    private initAudioHandler: (() => void) | null = null;
    private disposed = false;

    constructor() {
        const initAudio = () => {
            if (this.disposed) return;
            try {
                if (!this.ctx) {
                    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    this.enabled = true;
                } else if (this.ctx.state === 'suspended') {
                    this.ctx.resume().catch((err) => console.warn('[AudioSynthesizer] resume failed:', err));
                }
            } catch (err) {
                console.warn('[AudioSynthesizer] initAudio failed:', err);
            }
            this.removeInitListeners();
        };
        this.initAudioHandler = initAudio;
        window.addEventListener('click', initAudio);
        window.addEventListener('keydown', initAudio);
    }

    private removeInitListeners() {
        if (!this.initAudioHandler) return;
        try { window.removeEventListener('click', this.initAudioHandler); } catch (_) { /* ignore */ }
        try { window.removeEventListener('keydown', this.initAudioHandler); } catch (_) { /* ignore */ }
        this.initAudioHandler = null;
    }

    public dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.removeInitListeners();
        try {
            if (this.ctx && this.ctx.state !== 'closed') {
                this.ctx.close().catch((err) => console.warn('[AudioSynthesizer] close failed:', err));
            }
        } catch (err) {
            console.warn('[AudioSynthesizer] dispose failed:', err);
        }
        this.ctx = null;
        this.enabled = false;
    }

    public playShoot() {
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(880, this.ctx.currentTime); // High pitch
        osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.15); // Drop rapidly

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    public playLaser() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    public playExplosion() {
        if (!this.enabled || !this.ctx) return;

        const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 seconds
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1; // White noise
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.5);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    public playJump() {
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(600, this.ctx.currentTime + 0.2); // Pitch goes up

        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    public playCoin() {
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, this.ctx.currentTime); // B5
        osc.frequency.setValueAtTime(1318.51, this.ctx.currentTime + 0.08); // E6

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime + 0.08);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    public playPowerup() {
        if (!this.enabled || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, this.ctx.currentTime + 0.1);
        osc.frequency.linearRampToValueAtTime(1760, this.ctx.currentTime + 0.2);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }
}
