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

const TEXT_ENTRY_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'url', 'tel', 'number']);

interface BoundDomListener {
    target: EventTarget;
    type: string;
    handler: EventListener;
    options?: AddEventListenerOptions;
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
    private boundDomListeners: BoundDomListener[] = [];

    constructor(canvas: HTMLElement) {
        super();
        this.canvas = canvas;
        this.bindEvents();
    }

    private listen(target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions): void {
        target.addEventListener(type, handler, options);
        this.boundDomListeners.push({ target, type, handler, options });
    }

    private bindEvents(): void {
        this.listen(window, 'keydown', (ev) => {
            const e = ev as KeyboardEvent;
            if (InputManager.isEditableTarget(e.target)) return;
            if (!this.keysDown.has(e.code)) {
                this.keysPressed.add(e.code);
            }
            this.keysDown.add(e.code);
            this.emit('keydown', { key: e.key, code: e.code });
        });

        this.listen(window, 'keyup', (ev) => {
            const e = ev as KeyboardEvent;
            this.keysDown.delete(e.code);
            this.keysReleased.add(e.code);
            this.emit('keyup', { key: e.key, code: e.code });
        });

        this.listen(this.canvas, 'mousedown', (ev) => {
            const e = ev as MouseEvent;
            this.mouseButtons.add(e.button);
            this.emit('mousedown', { button: e.button, x: e.clientX, y: e.clientY });
            e.preventDefault();
        });

        this.listen(window, 'mouseup', (ev) => {
            const e = ev as MouseEvent;
            this.mouseButtons.delete(e.button);
            this.emit('mouseup', { button: e.button, x: e.clientX, y: e.clientY });
        });

        this.listen(window, 'mousemove', (ev) => {
            const e = ev as MouseEvent;
            this.mouseDelta.set(e.movementX, e.movementY);
            this.mousePos.set(e.clientX, e.clientY);
            this.emit('mousemove', { x: e.clientX, y: e.clientY, dx: e.movementX, dy: e.movementY });
        });

        this.listen(this.canvas, 'wheel', (ev) => {
            const e = ev as WheelEvent;
            this.wheelDelta += e.deltaY;
            this.emit('wheel', { delta: e.deltaY, x: e.clientX, y: e.clientY });
            e.preventDefault();
        }, { passive: false });

        this.listen(window, 'blur', () => this.releaseAllHeldInputs('window blur'));
        this.listen(document, 'visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.releaseAllHeldInputs('tab hidden');
        });
    }

    static isEditableTarget(target: EventTarget | null): boolean {
        if (!target || !(target instanceof HTMLElement)) return false;
        if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
        if (target.tagName !== 'INPUT') return false;
        return TEXT_ENTRY_INPUT_TYPES.has((target as HTMLInputElement).type || 'text');
    }

    private releaseAllHeldInputs(reason: string): void {
        if (this.keysDown.size === 0 && this.mouseButtons.size === 0) return;
        for (const code of this.keysDown) this.keysReleased.add(code);
        console.debug(`[InputManager] Released ${this.keysDown.size} held key(s) and ${this.mouseButtons.size} mouse button(s) on ${reason}`);
        this.keysDown.clear();
        this.mouseButtons.clear();
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

    destroy(): void {
        for (const { target, type, handler, options } of this.boundDomListeners) {
            try { target.removeEventListener(type, handler, options); } catch (err) { console.warn(`[InputManager] Failed to remove '${type}' listener:`, err); }
        }
        this.boundDomListeners = [];
        this.removeAllListeners();
    }
}
