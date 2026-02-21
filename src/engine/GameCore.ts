/**
 * GameCore - Central engine class with fixed-timestep game loop
 */
import { Renderer } from './renderer/Renderer.js';
import { InputManager } from './input/InputManager.js';
import { SceneManager } from './scene/SceneManager.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { Camera2D } from './camera/Camera2D.js';
import { Scene } from './scene/Scene.js';
import { EventEmitter } from './commons/EventEmitter.js';

export interface GameConfig {
    canvas: HTMLCanvasElement;
    fixedDt?: number;      // Fixed physics timestep in seconds (default: 1/60)
    maxDeltaTime?: number; // Maximum allowed dt to prevent spiral of death (default: 0.1)
}

interface GameCoreEvents {
    start: undefined;
    stop: undefined;
    update: { dt: number; fixedDt: number };
    render: { renderer: Renderer };
    resize: { width: number; height: number };
}

export class GameCore extends EventEmitter<GameCoreEvents> {
    readonly renderer: Renderer;
    readonly input: InputManager;
    readonly scenes: SceneManager;
    readonly physics: PhysicsWorld;
    readonly camera: Camera2D;

    private running: boolean = false;
    private rafId: number = 0;
    private lastTime: number = 0;
    private accumulator: number = 0;
    private readonly fixedDt: number;
    private readonly maxDeltaTime: number;

    // Stats
    fps: number = 0;
    frameTime: number = 0;
    private fpsAccumulator: number = 0;
    private fpsFrames: number = 0;

    constructor(config: GameConfig) {
        super();
        this.fixedDt = config.fixedDt ?? 1 / 60;
        this.maxDeltaTime = config.maxDeltaTime ?? 0.1;

        this.renderer = new Renderer(config.canvas);
        this.input = new InputManager(config.canvas);
        this.camera = new Camera2D(this.renderer.width, this.renderer.height);
        this.physics = new PhysicsWorld();
        this.scenes = new SceneManager();
        this.scenes.initialize({
            renderer: this.renderer,
            input: this.input,
            camera: this.camera,
            physics: this.physics,
        });

        window.addEventListener('resize', () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.camera.resize(w, h);
            this.scenes.onResize(w, h);
            this.emit('resize', { width: w, height: h });
        });
    }

    start(initialScene?: Scene): void {
        if (this.running) return;
        this.running = true;

        if (initialScene) {
            this.scenes.push(initialScene);
        }

        this.lastTime = performance.now();
        this.emit('start', undefined);
        this.loop(performance.now());
    }

    stop(): void {
        this.running = false;
        cancelAnimationFrame(this.rafId);
        this.emit('stop', undefined);
    }

    private loop = (timestamp: number): void => {
        if (!this.running) return;
        this.rafId = requestAnimationFrame(this.loop);

        let rawDt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // Clamp delta time
        if (rawDt > this.maxDeltaTime) rawDt = this.maxDeltaTime;
        this.frameTime = rawDt;

        // FPS counter
        this.fpsAccumulator += rawDt;
        this.fpsFrames++;
        if (this.fpsAccumulator >= 0.5) {
            this.fps = Math.round(this.fpsFrames / this.fpsAccumulator);
            this.fpsFrames = 0;
            this.fpsAccumulator = 0;
        }

        // Fixed timestep update
        this.accumulator += rawDt;
        while (this.accumulator >= this.fixedDt) {
            this.scenes.update(this.fixedDt);
            this.accumulator -= this.fixedDt;
        }
        this.emit('update', { dt: rawDt, fixedDt: this.fixedDt });

        // Render
        this.scenes.render(this.renderer);
        this.emit('render', { renderer: this.renderer });

        // Reset per-frame input state
        this.input.endFrame();
    };
}
