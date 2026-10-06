import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import * as CONST from '../constants/index.js';

const { CAMERA_MODE_COCKPIT, PRECIP_TYPE_RAIN, MS_TO_KT } = CONST as any;

const RAIN_CANVAS_ID = 'windshield-rain';
const RAIN_CANVAS_SCALE = 0.5;
const RAIN_CANVAS_Z_INDEX = '5';
const RAIN_MAX_DROPS = 180;
const RAIN_SPAWN_PER_S_AT_FULL = 90;
const RAIN_MIN_RADIUS_PX = 2;
const RAIN_MAX_RADIUS_PX = 7;
const RAIN_MIN_LIFE_S = 3;
const RAIN_MAX_LIFE_S = 7;
const RAIN_SLIDE_SPEED_PX_S = 20;
const RAIN_STREAK_START_KT = 60;
const RAIN_STREAK_FULL_KT = 160;
const RAIN_STREAK_MAX_SPEED_PX_S = 700;
const RAIN_STREAK_LATERAL_FACTOR = 0.35;
const RAIN_DRAW_INTERVAL_MS = 33;
const RAIN_MAX_STEP_S = 0.1;
const RAIN_FILL_COLOR = 'rgba(190,210,235,0.28)';
const RAIN_HIGHLIGHT_COLOR = 'rgba(255,255,255,0.55)';
const RAIN_STREAK_COLOR = 'rgba(200,220,245,0.35)';

interface RainDrop {
    x: number;
    y: number;
    r: number;
    age: number;
    life: number;
}

export class WindshieldRainSystem {
    private readonly scene: any;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _drops: RainDrop[] = [];
    private _spawnAccum = 0;
    private _lastDrawMs = 0;
    private _visible = false;
    private _resizeHandler: (() => void) | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    private ensureCanvas(): boolean {
        if (this._canvas && this._ctx) return true;
        try {
            const canvas = document.createElement('canvas');
            canvas.id = RAIN_CANVAS_ID;
            canvas.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:${RAIN_CANVAS_Z_INDEX};display:none`;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.warn('[WindshieldRain] 2D context unavailable');
                return false;
            }
            document.body.appendChild(canvas);
            this._canvas = canvas;
            this._ctx = ctx;
            this.resize();
            this._resizeHandler = () => this.resize();
            window.addEventListener('resize', this._resizeHandler);
            console.debug('[WindshieldRain] Overlay created');
            return true;
        } catch (err) {
            console.warn('[WindshieldRain] Failed to create overlay:', err);
            return false;
        }
    }

    private resize(): void {
        if (!this._canvas) return;
        this._canvas.width = Math.max(1, Math.round(window.innerWidth * RAIN_CANVAS_SCALE));
        this._canvas.height = Math.max(1, Math.round(window.innerHeight * RAIN_CANVAS_SCALE));
    }

    private setVisible(visible: boolean): void {
        if (visible === this._visible) return;
        this._visible = visible;
        if (this._canvas) this._canvas.style.display = visible ? 'block' : 'none';
        if (!visible) {
            this._drops.length = 0;
            this._spawnAccum = 0;
        }
    }

    private currentIntensity(): number {
        if (this.scene._cameraMode !== CAMERA_MODE_COCKPIT) return 0;
        if (Number(this.scene._precipitationType) !== PRECIP_TYPE_RAIN) return 0;
        const value = Number(this.scene._precipitationIntensity) || 0;
        return Math.max(0, Math.min(1, value));
    }

    update(dt: number): void {
        const intensity = this.currentIntensity();
        if (intensity <= 0) {
            this.setVisible(false);
            return;
        }
        if (!this.ensureCanvas() || !this._canvas || !this._ctx) return;
        this.setVisible(true);

        const step = Number.isFinite(dt) ? Math.max(0, Math.min(RAIN_MAX_STEP_S, dt)) : 0;
        const width = this._canvas.width;
        const height = this._canvas.height;
        const tasMs = Number.isFinite(this.scene._lastTasMs) ? this.scene._lastTasMs : (this.scene.velocity?.length?.() ?? 0);
        const speedKt = tasMs * MS_TO_KT;
        const streak = Math.max(0, Math.min(1, (speedKt - RAIN_STREAK_START_KT) / (RAIN_STREAK_FULL_KT - RAIN_STREAK_START_KT)));

        if (this.scene._paused !== true) {
            this._spawnAccum += RAIN_SPAWN_PER_S_AT_FULL * intensity * step;
            while (this._spawnAccum >= 1 && this._drops.length < RAIN_MAX_DROPS) {
                this._spawnAccum -= 1;
                this._drops.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    r: RAIN_MIN_RADIUS_PX + Math.random() * (RAIN_MAX_RADIUS_PX - RAIN_MIN_RADIUS_PX),
                    age: 0,
                    life: RAIN_MIN_LIFE_S + Math.random() * (RAIN_MAX_LIFE_S - RAIN_MIN_LIFE_S),
                });
            }
            if (this._spawnAccum > 1) this._spawnAccum = 1;

            const centerX = width / 2;
            const streakSpeed = RAIN_STREAK_MAX_SPEED_PX_S * streak;
            let write = 0;
            for (let i = 0; i < this._drops.length; i++) {
                const d = this._drops[i];
                d.age += step;
                d.y += (RAIN_SLIDE_SPEED_PX_S * (1 - streak) - streakSpeed) * step;
                d.x += (d.x - centerX) / Math.max(1, centerX) * streakSpeed * RAIN_STREAK_LATERAL_FACTOR * step;
                const alive = d.age < d.life && d.y > -d.r * 4 && d.y < height + d.r * 4 && d.x > -d.r * 4 && d.x < width + d.r * 4;
                if (alive) this._drops[write++] = d;
            }
            this._drops.length = write;
        }

        const now = performance.now();
        if (now - this._lastDrawMs < RAIN_DRAW_INTERVAL_MS) return;
        this._lastDrawMs = now;
        this.draw(streak);
    }

    private draw(streak: number): void {
        const ctx = this._ctx;
        const canvas = this._canvas;
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (streak > 0.05) {
            ctx.strokeStyle = RAIN_STREAK_COLOR;
            ctx.lineCap = 'round';
            const centerX = canvas.width / 2;
            for (const d of this._drops) {
                const len = d.r * (2 + streak * 10);
                const dirX = (d.x - centerX) / Math.max(1, centerX) * RAIN_STREAK_LATERAL_FACTOR;
                ctx.lineWidth = Math.max(1, d.r * 0.6);
                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - dirX * len, d.y + len);
                ctx.stroke();
            }
            return;
        }
        for (const d of this._drops) {
            ctx.fillStyle = RAIN_FILL_COLOR;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = RAIN_HIGHLIGHT_COLOR;
            ctx.beginPath();
            ctx.arc(d.x - d.r * 0.35, d.y - d.r * 0.35, Math.max(0.6, d.r * 0.3), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    dispose(): void {
        if (this._resizeHandler) {
            try { window.removeEventListener('resize', this._resizeHandler); } catch (_) { /* ignore */ }
            this._resizeHandler = null;
        }
        this._canvas?.remove();
        this._canvas = null;
        this._ctx = null;
        this._drops = [];
        this._visible = false;
    }
}
