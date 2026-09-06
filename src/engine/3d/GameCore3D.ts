/**
 * GameCore3D — BabylonJS-powered game core.
 *
 * Responsibilities:
 *   - Creates and owns a BABYLON.Engine on the provided canvas.
 *   - Manages a single active Scene3D (push/pop model identical to 2D GameCore).
 *   - Runs Babylon's render loop and drives Scene3D.update(dt) each frame.
 *   - Reuses the existing InputManager so 3D scenes share the same input API.
 *
 * BabylonJS is expected to be available as `window.BABYLON` (loaded via CDN
 * importmap in the HTML before this script runs).
 */
import { InputManager } from '../input/InputManager.js';
import * as BABYLON from '@babylonjs/core';
import { Scene3D } from './Scene3D.js';

export interface GameCore3DConfig {
    canvas: HTMLCanvasElement;
    antialias?: boolean;
}

const PERF_BENCHMARK_DURATION_MS = 5000;
const PERF_BENCHMARK_WARMUP_MS = 1500;
const PERF_PRESET_LOW_FPS = 25;
const PERF_PRESET_MED_FPS = 45;
const PERF_DETECTED_PRESET_KEY = 'perf_detected_preset_v1';

export class GameCore3D {
    readonly engine: any; // BABYLON.Engine
    readonly input: InputManager;

    private _scene3D: Scene3D | null = null;
    private _babylonScene: any | null = null; // BABYLON.Scene
    private _lastTime: number = 0;
    private _renderPaused: boolean = false;
    private _visibilityHandler: (() => void) | null = null;
    private _contextLostHandler: ((e: Event) => void) | null = null;
    private _contextRestoredHandler: (() => void) | null = null;
    private _canvasEl: HTMLCanvasElement | null = null;
    private _perfStartedAt: number = 0;
    private _perfSamples: number[] = [];
    private _perfBenchmarkDone: boolean = false;
    private _skipPerfBenchmark: boolean = false;

    // Public stats
    fps: number = 0;

    constructor(config: GameCore3DConfig) {
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isChromeMobile = isMobile && /Chrome|CriOS/i.test(navigator.userAgent || '');
        if (isChromeMobile) {
            this._skipPerfBenchmark = true;
            this._perfBenchmarkDone = true;
            console.debug('[GameCore3D] Chrome mobile: skipping FPS benchmark');
        }
        const antialias = config.antialias ?? true;

        this.engine = new BABYLON.Engine(config.canvas, antialias, {
            preserveDrawingBuffer: !isMobile,
            stencil: true,
            disableWebGL2Support: false,
        });

        if (isMobile) {
            console.debug('[GameCore3D] Mobile detected — hardware scaling deferred to graphics render-scale setting');
        }

        this._registerContextLossHandlers(config.canvas);

        this.input = new InputManager(config.canvas);

        const onViewportResize = () => { try { this.engine.resize(); } catch (err) { console.warn('[GameCore3D] Engine resize failed:', err); } };
        window.addEventListener('resize', onViewportResize);
        // iOS Safari toolbar/keyboard changes only fire visualViewport resize, not window resize.
        window.addEventListener('orientationchange', onViewportResize);
        window.visualViewport?.addEventListener('resize', onViewportResize);

        this._visibilityHandler = () => {
            this._renderPaused = document.visibilityState === 'hidden';
            if (this._renderPaused) {
                console.debug('[GameCore3D] Tab hidden: pausing render loop');
            } else {
                this._lastTime = performance.now();
                console.debug('[GameCore3D] Tab visible: resuming render loop');
            }
        };
        try { document.addEventListener('visibilitychange', this._visibilityHandler); } catch (_) { /* ignore */ }
    }

    /**
     * Load a Scene3D, create the BabylonJS scene, and start the render loop.
     */
    start(scene: Scene3D): void {
        if (this._scene3D) {
            try { this._scene3D.onDispose(); } catch (err) { console.warn('[GameCore3D] previous scene onDispose failed:', err); }
            this._scene3D = null;
        }
        if (this._babylonScene) {
            this._babylonScene.dispose();
        }

        const babylonScene = new BABYLON.Scene(this.engine);
        this._babylonScene = babylonScene;
        this._scene3D = scene;

        // Fire onCreate
        scene._init(babylonScene, this.input);

        this._lastTime = performance.now();
        this._perfStartedAt = performance.now();
        this._perfSamples = [];
        this._perfBenchmarkDone = false;

        // BabylonJS render loop
        this.engine.runRenderLoop(() => {
            if (this._renderPaused) return;
            const now = performance.now();
            const dt = Math.min((now - this._lastTime) / 1000, 0.1);
            this._lastTime = now;

            this.fps = Math.round(this.engine.getFps());

            if (!this._skipPerfBenchmark && !this._perfBenchmarkDone && this._perfStartedAt > 0) {
                const elapsed = now - this._perfStartedAt;
                if (elapsed > PERF_BENCHMARK_WARMUP_MS && elapsed < PERF_BENCHMARK_DURATION_MS) {
                    this._perfSamples.push(this.fps);
                } else if (elapsed >= PERF_BENCHMARK_DURATION_MS) {
                    this._finishPerfBenchmark();
                }
            }

            if (this._scene3D) {
                this._scene3D.update(dt);
            }

            if (this._babylonScene && this._babylonScene.activeCamera) {
                this._babylonScene.render();
            }

            this.input.endFrame();
        });
    }

    private _finishPerfBenchmark(): void {
        this._perfBenchmarkDone = true;
        if (this._perfSamples.length === 0) return;
        const sorted = [...this._perfSamples].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        let preset: 'low' | 'medium' | 'high';
        if (median < PERF_PRESET_LOW_FPS) preset = 'low';
        else if (median < PERF_PRESET_MED_FPS) preset = 'medium';
        else preset = 'high';
        console.log(`[Perf] Benchmark complete: ${this._perfSamples.length} samples, median=${median}fps, recommended preset=${preset}`);
        try {
            localStorage.setItem(PERF_DETECTED_PRESET_KEY, JSON.stringify({ preset, medianFps: median, samples: this._perfSamples.length, ts: Date.now() }));
        } catch (err) {
            console.warn('[Perf] Failed to persist detected preset:', err);
        }
    }

    private _registerContextLossHandlers(canvas: HTMLCanvasElement): void {
        this._canvasEl = canvas;
        this._contextLostHandler = (e: Event) => {
            try { e.preventDefault(); } catch (_) { /* ignore */ }
            this._renderPaused = true;
            console.warn('[GameCore3D] WebGL context lost — render loop paused');
        };
        this._contextRestoredHandler = () => {
            this._renderPaused = document.visibilityState === 'hidden';
            this._lastTime = performance.now();
            console.warn('[GameCore3D] WebGL context restored — render loop resumed');
        };
        try {
            canvas.addEventListener('webglcontextlost', this._contextLostHandler, false);
            canvas.addEventListener('webglcontextrestored', this._contextRestoredHandler, false);
        } catch (err) {
            console.warn('[GameCore3D] Failed to register WebGL context-loss handlers:', err);
        }
    }

    /** Stop the render loop and release everything */
    dispose(): void {
        if (this._visibilityHandler) {
            try { document.removeEventListener('visibilitychange', this._visibilityHandler); } catch (_) { /* ignore */ }
            this._visibilityHandler = null;
        }
        if (this._canvasEl) {
            if (this._contextLostHandler) {
                try { this._canvasEl.removeEventListener('webglcontextlost', this._contextLostHandler); } catch (_) { /* ignore */ }
                this._contextLostHandler = null;
            }
            if (this._contextRestoredHandler) {
                try { this._canvasEl.removeEventListener('webglcontextrestored', this._contextRestoredHandler); } catch (_) { /* ignore */ }
                this._contextRestoredHandler = null;
            }
            this._canvasEl = null;
        }
        this.engine.stopRenderLoop();
        this._scene3D?.onDispose();
        this._babylonScene?.dispose();
        this.engine.dispose();
    }
}
