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
    private _perfStartedAt: number = 0;
    private _perfSamples: number[] = [];
    private _perfBenchmarkDone: boolean = false;

    // Public stats
    fps: number = 0;

    constructor(config: GameCore3DConfig) {
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const antialias = isMobile ? false : (config.antialias ?? true);

        this.engine = new BABYLON.Engine(config.canvas, antialias, {
            preserveDrawingBuffer: true,
            stencil: true,
            disableWebGL2Support: false,
        });

        if (isMobile) {
            const maxDpr = 2;
            const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
            this.engine.setHardwareScalingLevel(1 / dpr);
            console.info(`[GameCore3D] Mobile detected — DPR capped at ${maxDpr}, effective hardware scaling = ${(1 / dpr).toFixed(3)}`);
        }

        this.input = new InputManager(config.canvas);

        window.addEventListener('resize', () => this.engine.resize());

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

            if (!this._perfBenchmarkDone && this._perfStartedAt > 0) {
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

    /** Stop the render loop and release everything */
    dispose(): void {
        if (this._visibilityHandler) {
            try { document.removeEventListener('visibilitychange', this._visibilityHandler); } catch (_) { /* ignore */ }
            this._visibilityHandler = null;
        }
        this.engine.stopRenderLoop();
        this._scene3D?.onDispose();
        this._babylonScene?.dispose();
        this.engine.dispose();
    }
}
