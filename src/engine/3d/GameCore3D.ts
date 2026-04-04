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

export class GameCore3D {
    readonly engine: any; // BABYLON.Engine
    readonly input: InputManager;

    private _scene3D: Scene3D | null = null;
    private _babylonScene: any | null = null; // BABYLON.Scene
    private _lastTime: number = 0;

    // Public stats
    fps: number = 0;

    constructor(config: GameCore3DConfig) {
        this.engine = new BABYLON.Engine(config.canvas, config.antialias ?? true, {
            preserveDrawingBuffer: true,
            stencil: true,
            disableWebGL2Support: false,
        });

        this.input = new InputManager(config.canvas);

        // Keep canvas full-screen
        window.addEventListener('resize', () => this.engine.resize());
    }

    /**
     * Load a Scene3D, create the BabylonJS scene, and start the render loop.
     */
    start(scene: Scene3D): void {
        // Dispose previous if any
        if (this._babylonScene) {
            this._babylonScene.dispose();
        }

        const babylonScene = new BABYLON.Scene(this.engine);
        this._babylonScene = babylonScene;
        this._scene3D = scene;

        // Fire onCreate
        scene._init(babylonScene, this.input);

        this._lastTime = performance.now();

        // BabylonJS render loop
        this.engine.runRenderLoop(() => {
            const now = performance.now();
            const dt = Math.min((now - this._lastTime) / 1000, 0.1);
            this._lastTime = now;

            this.fps = Math.round(this.engine.getFps());

            if (this._scene3D) {
                this._scene3D.update(dt);
            }

            if (this._babylonScene && this._babylonScene.activeCamera) {
                this._babylonScene.render();
            }

            this.input.endFrame();
        });
    }

    /** Stop the render loop and release everything */
    dispose(): void {
        this.engine.stopRenderLoop();
        this._scene3D?.onDispose();
        this._babylonScene?.dispose();
        this.engine.dispose();
    }
}
