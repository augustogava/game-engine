import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import { InputBindings } from '../../InputBindings.js';
import { InputManager } from '../../../engine/input/InputManager.js';

const PHOTO_MODE_BODY_CLASS = 'photo-mode';
const PHOTO_MODE_STYLE_ID = 'photo-mode-style';
const PHOTO_MODE_BAR_ID = 'photo-mode-bar';
const PHOTO_MODE_GAME_CANVAS_ID = 'game-canvas';
const PHOTO_MODE_EXIT_CODE = 'Escape';
const PHOTO_MODE_BAR_Z_INDEX = '9500';
const PHOTO_MODE_BUTTON_STYLE = 'margin-left:10px;padding:5px 12px;background:rgba(0,40,28,.75);border:1px solid rgba(80,255,160,.45);color:#7df9c8;border-radius:5px;font-family:Inter,sans-serif;font-size:11px;cursor:pointer;touch-action:manipulation';

export class PhotoModeSystem {
    private readonly scene: any;
    private _active = false;
    private _pausedByPhotoMode = false;
    private _bar: HTMLDivElement | null = null;
    private _hintEl: HTMLSpanElement | null = null;
    private _captureBtn: HTMLButtonElement | null = null;
    private _exitBtn: HTMLButtonElement | null = null;
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
        this._keyHandler = (e: KeyboardEvent) => {
            if (e.repeat || InputManager.isEditableTarget(e.target)) return;
            const toggleCode = InputBindings.codeFor('photoMode');
            if (e.code === toggleCode) {
                e.preventDefault();
                this.toggle();
            } else if (this._active && e.code === PHOTO_MODE_EXIT_CODE) {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.exit();
            }
        };
        window.addEventListener('keydown', this._keyHandler, true);
    }

    isActive(): boolean {
        return this._active;
    }

    toggle(): void {
        if (this._active) this.exit();
        else this.enter();
    }

    private ensureStyle(): void {
        if (document.getElementById(PHOTO_MODE_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = PHOTO_MODE_STYLE_ID;
        style.textContent = `body.${PHOTO_MODE_BODY_CLASS} > *:not(#${PHOTO_MODE_GAME_CANVAS_ID}):not(#${PHOTO_MODE_BAR_ID}) { visibility: hidden !important; }`;
        document.head.appendChild(style);
    }

    private ensureBar(): void {
        if (this._bar) return;
        const bar = document.createElement('div');
        bar.id = PHOTO_MODE_BAR_ID;
        bar.style.cssText = `position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:none;align-items:center;padding:6px 12px;background:rgba(0,16,12,.6);border:1px solid rgba(80,255,160,.3);border-radius:8px;color:rgba(232,255,244,.85);font-family:Inter,sans-serif;font-size:11px;letter-spacing:.06em;z-index:${PHOTO_MODE_BAR_Z_INDEX}`;
        const hint = document.createElement('span');
        const captureBtn = document.createElement('button');
        captureBtn.type = 'button';
        captureBtn.style.cssText = PHOTO_MODE_BUTTON_STYLE;
        captureBtn.addEventListener('click', () => this.capture());
        const exitBtn = document.createElement('button');
        exitBtn.type = 'button';
        exitBtn.style.cssText = PHOTO_MODE_BUTTON_STYLE;
        exitBtn.addEventListener('click', () => this.exit());
        bar.appendChild(hint);
        bar.appendChild(captureBtn);
        bar.appendChild(exitBtn);
        document.body.appendChild(bar);
        this._bar = bar;
        this._hintEl = hint;
        this._captureBtn = captureBtn;
        this._exitBtn = exitBtn;
    }

    private enter(): void {
        if (this._active || this.scene.spawned !== true) return;
        this.ensureStyle();
        this.ensureBar();
        this._pausedByPhotoMode = this.scene._paused !== true;
        if (this._pausedByPhotoMode) this.scene._togglePause();
        this._active = true;
        this.scene._photoModeActive = true;
        document.body.classList.add(PHOTO_MODE_BODY_CLASS);
        if (this._hintEl) {
            this._hintEl.textContent = I18n.format('photo.hint', {
                exit: InputBindings.codeFor('photoMode'),
                shot: InputBindings.codeFor('screenshot'),
            });
        }
        if (this._captureBtn) this._captureBtn.textContent = I18n.t('photo.capture');
        if (this._exitBtn) this._exitBtn.textContent = I18n.t('photo.exit');
        if (this._bar) this._bar.style.display = 'flex';
        console.debug('[PhotoMode] Entered');
    }

    private exit(): void {
        if (!this._active) return;
        this._active = false;
        this.scene._photoModeActive = false;
        document.body.classList.remove(PHOTO_MODE_BODY_CLASS);
        if (this._bar) this._bar.style.display = 'none';
        if (this._pausedByPhotoMode && this.scene._paused === true) this.scene._togglePause();
        this._pausedByPhotoMode = false;
        console.debug('[PhotoMode] Exited');
    }

    private capture(): void {
        if (!this._bar) return;
        const previousDisplay = this._bar.style.display;
        this._bar.style.display = 'none';
        try {
            this.scene._takeScreenshot();
            console.debug('[PhotoMode] Screenshot captured');
        } catch (err) {
            console.warn('[PhotoMode] Screenshot failed:', err);
        } finally {
            this._bar.style.display = previousDisplay;
        }
    }

    dispose(): void {
        if (this._keyHandler) {
            try { window.removeEventListener('keydown', this._keyHandler, true); } catch (_) { /* ignore */ }
            this._keyHandler = null;
        }
        document.body.classList.remove(PHOTO_MODE_BODY_CLASS);
        document.getElementById(PHOTO_MODE_STYLE_ID)?.remove();
        this._bar?.remove();
        this._bar = null;
        this._hintEl = null;
        this._captureBtn = null;
        this._exitBtn = null;
        this._active = false;
        this.scene._photoModeActive = false;
    }
}
