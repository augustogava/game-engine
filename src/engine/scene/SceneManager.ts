/**
 * SceneManager - Manages a stack of scenes
 */
import { Scene, SceneContext } from './Scene.js';
import { Renderer } from '../renderer/Renderer.js';

export class SceneManager {
    private stack: Scene[] = [];
    private ctx!: SceneContext;

    initialize(ctx: SceneContext): void {
        this.ctx = ctx;
    }

    push(scene: Scene): void {
        scene.onEnter(this.ctx);
        this.stack.push(scene);
    }

    pop(): Scene | undefined {
        const scene = this.stack.pop();
        scene?.onExit();
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].onEnter(this.ctx);
        }
        return scene;
    }

    replace(scene: Scene): void {
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].onExit();
            this.stack.pop();
        }
        scene.onEnter(this.ctx);
        this.stack.push(scene);
    }

    get current(): Scene | undefined {
        return this.stack[this.stack.length - 1];
    }

    update(dt: number): void {
        this.current?.update(dt);
    }

    render(renderer: Renderer): void {
        // Render all scenes (bottom to top, so top is on top)
        for (const scene of this.stack) {
            scene.render(renderer);
        }
    }

    onResize(width: number, height: number): void {
        for (const scene of this.stack) {
            scene.onResize(width, height);
        }
    }
}
