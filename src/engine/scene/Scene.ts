/**
 * Scene - Abstract base class for all game scenes
 */
import { Renderer } from '../renderer/Renderer.js';
import { InputManager } from '../input/InputManager.js';
import { Camera2D } from '../camera/Camera2D.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';

export interface SceneContext {
    renderer: Renderer;
    input: InputManager;
    camera: Camera2D;
    physics: PhysicsWorld;
}

export abstract class Scene {
    protected ctx!: SceneContext;

    /** Called when the scene is entered */
    onEnter(_ctx: SceneContext): void { this.ctx = _ctx; }

    /** Called when the scene is exited */
    onExit(): void { }

    /** Called each update tick */
    abstract update(dt: number): void;

    /** Called each render frame */
    abstract render(renderer: Renderer): void;

    /** Optional: handle resize events */
    onResize(_width: number, _height: number): void { }
}
