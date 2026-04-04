/**
 * Scene3D — Abstract base class for BabylonJS 3D scenes.
 * Mirrors the 2D `Scene` interface but wraps a BABYLON.Scene lifecycle.
 *
 * Usage:
 *   class MyScene extends Scene3D {
 *     onCreate(scene: BABYLON.Scene, input: InputManager): void { ... }
 *     update(dt: number): void { ... }
 *   }
 */
import { InputManager } from '../input/InputManager.js';
import * as BABYLON from '@babylonjs/core';

export abstract class Scene3D {
    protected scene!: BABYLON.Scene;
    protected input!: InputManager;

    /**
     * Called once after the BabylonJS scene is created.
     * Set up meshes, lights, cameras, etc. here.
     */
    abstract onCreate(scene: any, input: InputManager): void;

    /**
     * Called every frame with the elapsed time in seconds.
     * Use for game logic, not rendering (Babylon handles rendering).
     */
    abstract update(dt: number): void;

    /**
     * Called when the scene is being torn down.
     */
    onDispose(): void { }

    /** @internal — called by GameCore3D */
    _init(scene: any, input: InputManager): void {
        this.scene = scene;
        this.input = input;
        this.onCreate(scene, input);
    }
}
