const REPLAY_BUFFER_SECONDS = 60;
const REPLAY_TARGET_HZ = 30;
export const REPLAY_BUFFER_CAPACITY = REPLAY_BUFFER_SECONDS * REPLAY_TARGET_HZ;
const REPLAY_RECORD_INTERVAL_MS = 1000 / REPLAY_TARGET_HZ;
export const REPLAY_DEFAULT_PLAYBACK_RATE = 1.0;

export interface ReplayFrame {
    t: number;
    px: number;
    py: number;
    pz: number;
    qx: number;
    qy: number;
    qz: number;
    qw: number;
    throttle: number;
}

export class ReplayBuffer {
    private _frames: ReplayFrame[] = [];
    private _lastRecordMs = 0;
    private _playing = false;
    private _playStartMs = 0;
    private _playRate = REPLAY_DEFAULT_PLAYBACK_RATE;
    private _playFrameIndex = 0;
    private _baseTime = 0;

    public clear(): void {
        this._frames = [];
        this._lastRecordMs = 0;
    }

    public record(frame: Omit<ReplayFrame, 't'>): void {
        if (this._playing) return;
        const now = performance.now();
        if (now - this._lastRecordMs < REPLAY_RECORD_INTERVAL_MS) return;
        this._lastRecordMs = now;
        if (this._frames.length >= REPLAY_BUFFER_CAPACITY) {
            this._frames.shift();
        }
        this._frames.push({ t: now, ...frame });
    }

    public hasReplay(): boolean {
        return this._frames.length >= 4;
    }

    public startPlayback(rate: number = REPLAY_DEFAULT_PLAYBACK_RATE): boolean {
        if (!this.hasReplay()) {
            console.warn('[Replay] Buffer empty');
            return false;
        }
        this._playing = true;
        this._playStartMs = performance.now();
        this._playRate = Math.max(0.1, Math.min(4, rate));
        this._playFrameIndex = 0;
        this._baseTime = this._frames[0].t;
        console.log(`[Replay] Playback start frames=${this._frames.length} rate=${this._playRate}`);
        return true;
    }

    public stopPlayback(): void {
        if (!this._playing) return;
        this._playing = false;
        console.log('[Replay] Playback stopped');
    }

    public isPlaying(): boolean {
        return this._playing;
    }

    public sampleAtNow(): ReplayFrame | null {
        if (!this._playing || this._frames.length === 0) return null;
        const elapsed = (performance.now() - this._playStartMs) * this._playRate;
        const target = this._baseTime + elapsed;
        while (this._playFrameIndex < this._frames.length - 1
            && this._frames[this._playFrameIndex + 1].t <= target) {
            this._playFrameIndex++;
        }
        const a = this._frames[this._playFrameIndex];
        const b = this._frames[Math.min(this._playFrameIndex + 1, this._frames.length - 1)];
        if (!a) return null;
        if (!b || a === b) return a;
        const span = Math.max(1, b.t - a.t);
        const u = Math.max(0, Math.min(1, (target - a.t) / span));
        const inv = 1 - u;
        const dot = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw;
        const sign = dot < 0 ? -1 : 1;
        const out: ReplayFrame = {
            t: target,
            px: a.px * inv + b.px * u,
            py: a.py * inv + b.py * u,
            pz: a.pz * inv + b.pz * u,
            qx: a.qx * inv + b.qx * u * sign,
            qy: a.qy * inv + b.qy * u * sign,
            qz: a.qz * inv + b.qz * u * sign,
            qw: a.qw * inv + b.qw * u * sign,
            throttle: a.throttle * inv + b.throttle * u,
        };
        const qLen = Math.sqrt(out.qx * out.qx + out.qy * out.qy + out.qz * out.qz + out.qw * out.qw) || 1;
        out.qx /= qLen; out.qy /= qLen; out.qz /= qLen; out.qw /= qLen;
        if (this._playFrameIndex >= this._frames.length - 1 && u >= 1) {
            this.stopPlayback();
        }
        return out;
    }
}
