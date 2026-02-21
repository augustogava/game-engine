/**
 * InputManager - Keyboard, mouse, and wheel input tracking
 */
import { Vector2 } from '../math/Vector2.js';
import { EventEmitter } from '../commons/EventEmitter.js';

interface InputEvents {
    keydown: { key: string; code: string };
    keyup: { key: string; code: string };
    mousedown: { button: number; x: number; y: number };
    mouseup: { button: number; x: number; y: number };
    mousemove: { x: number; y: number; dx: number; dy: number };
    wheel: { delta: number; x: number; y: number };
}

export class InputManager extends EventEmitter<InputEvents> {
    private keysDown: Set<string> = new Set();
    private keysPressed: Set<string> = new Set(); // pressed this frame
    private keysReleased: Set<string> = new Set(); // released this frame
    private mouseButtons: Set<number> = new Set();
    private mousePos: Vector2 = new Vector2();
    private mouseDelta: Vector2 = new Vector2();
    private wheelDelta: number = 0;
    private canvas: HTMLElement;

    constructor(canvas: HTMLElement) {
        super();
        this.canvas = canvas;
        this.bindEvents();
    }

    private bindEvents(): void {
        window.addEventListener('keydown', (e) => {
            if (!this.keysDown.has(e.code)) {
                this.keysPressed.add(e.code);
            }
            this.keysDown.add(e.code);
            this.emit('keydown', { key: e.key, code: e.code });
        });

        window.addEventListener('keyup', (e) => {
            this.keysDown.delete(e.code);
            this.keysReleased.add(e.code);
            this.emit('keyup', { key: e.key, code: e.code });
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.mouseButtons.add(e.button);
            this.emit('mousedown', { button: e.button, x: e.clientX, y: e.clientY });
            e.preventDefault();
        });

        window.addEventListener('mouseup', (e) => {
            this.mouseButtons.delete(e.button);
            this.emit('mouseup', { button: e.button, x: e.clientX, y: e.clientY });
        });

        window.addEventListener('mousemove', (e) => {
            this.mouseDelta.set(e.movementX, e.movementY);
            this.mousePos.set(e.clientX, e.clientY);
            this.emit('mousemove', { x: e.clientX, y: e.clientY, dx: e.movementX, dy: e.movementY });
        });

        this.canvas.addEventListener('wheel', (e) => {
            this.wheelDelta += e.deltaY;
            this.emit('wheel', { delta: e.deltaY, x: e.clientX, y: e.clientY });
            e.preventDefault();
        }, { passive: false });
    }

    /** Call at end of each frame to reset single-frame state */
    endFrame(): void {
        this.keysPressed.clear();
        this.keysReleased.clear();
        this.mouseDelta.set(0, 0);
        this.wheelDelta = 0;
    }

    isKeyDown(code: string): boolean { return this.keysDown.has(code); }
    isKeyPressed(code: string): boolean { return this.keysPressed.has(code); }
    isKeyReleased(code: string): boolean { return this.keysReleased.has(code); }
    isMouseDown(button: number = 0): boolean { return this.mouseButtons.has(button); }

    getMousePosition(): Vector2 { return this.mousePos.clone(); }
    getMouseDelta(): Vector2 { return this.mouseDelta.clone(); }
    getWheelDelta(): number { return this.wheelDelta; }

    destroy(): void { this.removeAllListeners(); }
}
