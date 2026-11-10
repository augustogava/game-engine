import type * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';

const ROTATE_OVERLAY_ID = 'rotate-overlay';
const ROTATE_DISMISS_ID = 'rotate-overlay-dismiss';
const ROTATE_PHONE_MAX_SHORT_SIDE_PX = 500;
const CONTEXT_LOST_OVERLAY_ID = 'context-lost-overlay';
const CONTEXT_LOST_ACTION_ID = 'context-lost-action';
const CONTEXT_LOST_SAVE_REASON = 'context-lost';
const PLATFORM_OVERLAY_Z_INDEX = '10050';
const WAKE_LOCK_RETRY_INTERVAL_MS = 10000;
const OVERLAY_CARD_STYLE = "max-width:320px;padding:22px 24px;background:rgba(0,20,15,.94);border:1px solid rgba(80,255,160,.4);border-radius:10px;box-shadow:0 0 24px rgba(0,255,128,.15);text-align:center;font-family:Inter,sans-serif;color:#e8fff4";
const OVERLAY_TITLE_STYLE = "font-family:'Orbitron',monospace;font-size:15px;letter-spacing:.14em;color:#40ffaa;margin-bottom:10px;text-transform:uppercase";
const OVERLAY_BODY_STYLE = 'font-size:13px;line-height:1.5;color:rgba(220,240,235,.85);margin-bottom:16px';
const OVERLAY_BUTTON_STYLE = 'display:block;width:100%;min-height:44px;padding:10px 14px;background:rgba(0,40,28,.75);border:1px solid rgba(80,255,160,.45);color:#7df9c8;border-radius:6px;font-family:Inter,sans-serif;font-size:13px;letter-spacing:.04em;cursor:pointer;touch-action:manipulation';

export class PlatformSystem {
    private readonly scene: any;
    private _rotateOverlay: HTMLDivElement | null = null;
    private _rotateDismissed = false;
    private _viewportHandler: (() => void) | null = null;
    private _visibilityHandler: (() => void) | null = null;
    private _wakeLock: WakeLockSentinel | null = null;
    private _wakeLockPending = false;
    private _wakeLockLastAttemptMs = 0;
    private _wakeLockUnsupportedLogged = false;
    private _engine: BABYLON.AbstractEngine | null = null;
    private _contextLostObserver: BABYLON.Observer<BABYLON.AbstractEngine> | null = null;
    private _contextLostOverlay: HTMLDivElement | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    init(babylonScene: BABYLON.Scene): void {
        const engine = babylonScene?.getEngine?.() ?? null;
        if (engine && !this._contextLostObserver) {
            this._engine = engine;
            this._contextLostObserver = engine.onContextLostObservable.add(() => this.handleContextLost());
        } else if (!engine) {
            console.warn('[Platform] Engine unavailable; WebGL context-loss recovery disabled');
        }
        if (this.scene.isMobile !== true) return;
        if (!this._viewportHandler) {
            this._viewportHandler = () => this.refreshRotateOverlay();
            window.addEventListener('resize', this._viewportHandler);
            window.addEventListener('orientationchange', this._viewportHandler);
        }
        if (!this._visibilityHandler) {
            this._visibilityHandler = () => {
                if (document.visibilityState === 'visible') this._wakeLockLastAttemptMs = 0;
            };
            document.addEventListener('visibilitychange', this._visibilityHandler);
        }
        this.refreshRotateOverlay();
    }

    update(): void {
        if (this.scene.isMobile !== true) return;
        const wantLock = this.scene.spawned === true
            && this.scene._paused !== true
            && document.visibilityState === 'visible';
        if (wantLock) this.acquireWakeLock();
        else this.releaseWakeLock();
    }

    private isPhoneLandscape(): boolean {
        const width = window.innerWidth;
        const height = window.innerHeight;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
        return width > height && Math.min(width, height) <= ROTATE_PHONE_MAX_SHORT_SIDE_PX;
    }

    private refreshRotateOverlay(): void {
        const show = !this._rotateDismissed && this.isPhoneLandscape();
        if (!show) {
            if (this._rotateOverlay) this._rotateOverlay.style.display = 'none';
            return;
        }
        if (!this._rotateOverlay) this._rotateOverlay = this.buildRotateOverlay();
        if (this._rotateOverlay.style.display !== 'flex') {
            this._rotateOverlay.style.display = 'flex';
            console.debug(`[Platform] Rotate prompt shown (${window.innerWidth}x${window.innerHeight})`);
        }
    }

    private buildRotateOverlay(): HTMLDivElement {
        const overlay = document.createElement('div');
        overlay.id = ROTATE_OVERLAY_ID;
        overlay.style.cssText = `position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,8,6,.82);z-index:${PLATFORM_OVERLAY_Z_INDEX};pointer-events:auto`;
        const card = document.createElement('div');
        card.style.cssText = OVERLAY_CARD_STYLE;
        const icon = document.createElement('div');
        icon.textContent = '\u21BB';
        icon.style.cssText = 'font-size:34px;line-height:1;color:#40ffaa;margin-bottom:8px';
        const title = document.createElement('div');
        title.textContent = I18n.t('rotate.title');
        title.style.cssText = OVERLAY_TITLE_STYLE;
        const body = document.createElement('div');
        body.textContent = I18n.t('rotate.body');
        body.style.cssText = OVERLAY_BODY_STYLE;
        const dismiss = document.createElement('button');
        dismiss.id = ROTATE_DISMISS_ID;
        dismiss.type = 'button';
        dismiss.textContent = I18n.t('rotate.dismiss');
        dismiss.style.cssText = OVERLAY_BUTTON_STYLE;
        dismiss.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this._rotateDismissed = true;
            overlay.style.display = 'none';
            console.debug('[Platform] Rotate prompt dismissed by the player');
        });
        card.appendChild(icon);
        card.appendChild(title);
        card.appendChild(body);
        card.appendChild(dismiss);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        return overlay;
    }

    private acquireWakeLock(): void {
        if (this._wakeLock || this._wakeLockPending) return;
        const wakeLockApi = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
        if (!wakeLockApi || typeof wakeLockApi.request !== 'function') {
            if (!this._wakeLockUnsupportedLogged) {
                this._wakeLockUnsupportedLogged = true;
                console.debug('[Platform] Screen wake lock is not supported by this browser');
            }
            return;
        }
        const now = performance.now();
        if (this._wakeLockLastAttemptMs > 0 && now - this._wakeLockLastAttemptMs < WAKE_LOCK_RETRY_INTERVAL_MS) return;
        this._wakeLockLastAttemptMs = now;
        this._wakeLockPending = true;
        wakeLockApi.request('screen').then((sentinel) => {
            this._wakeLockPending = false;
            this._wakeLock = sentinel;
            sentinel.addEventListener('release', () => {
                if (this._wakeLock === sentinel) this._wakeLock = null;
                console.debug('[Platform] Screen wake lock released');
            });
            console.debug('[Platform] Screen wake lock acquired');
        }).catch((err: unknown) => {
            this._wakeLockPending = false;
            console.warn('[Platform] Screen wake lock request failed:', err);
        });
    }

    private releaseWakeLock(): void {
        const sentinel = this._wakeLock;
        if (!sentinel) return;
        this._wakeLock = null;
        this._wakeLockLastAttemptMs = 0;
        sentinel.release().catch((err: unknown) => {
            console.warn('[Platform] Screen wake lock release failed:', err);
        });
    }

    private handleContextLost(): void {
        if (this._contextLostOverlay) return;
        console.warn('[Platform] WebGL context lost; saving the flight and showing the recovery prompt');
        let saved = false;
        try {
            saved = this.scene._saveFreeFlight(CONTEXT_LOST_SAVE_REASON) === true;
        } catch (err) {
            console.warn('[Platform] Saving the flight after context loss failed:', err);
        }
        try {
            if (this.scene.spawned === true && this.scene._paused !== true) this.scene._togglePause();
        } catch (err) {
            console.warn('[Platform] Pausing after context loss failed:', err);
        }
        console.debug(`[Platform] Context-loss recovery prompt: resumable=${saved}`);
        this._contextLostOverlay = this.buildContextLostOverlay(saved);
    }

    private buildContextLostOverlay(canResume: boolean): HTMLDivElement {
        const overlay = document.createElement('div');
        overlay.id = CONTEXT_LOST_OVERLAY_ID;
        overlay.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,8,6,.9);z-index:${PLATFORM_OVERLAY_Z_INDEX};pointer-events:auto`;
        const card = document.createElement('div');
        card.style.cssText = OVERLAY_CARD_STYLE;
        const title = document.createElement('div');
        title.textContent = I18n.t('contextLost.title');
        title.style.cssText = OVERLAY_TITLE_STYLE;
        const body = document.createElement('div');
        body.textContent = I18n.t('contextLost.body');
        body.style.cssText = OVERLAY_BODY_STYLE;
        const action = document.createElement('button');
        action.id = CONTEXT_LOST_ACTION_ID;
        action.type = 'button';
        action.textContent = I18n.t(canResume ? 'contextLost.resume' : 'contextLost.reload');
        action.style.cssText = OVERLAY_BUTTON_STYLE;
        action.addEventListener('click', (ev) => {
            ev.stopPropagation();
            console.debug(`[Platform] Context-loss reload requested (resume=${canResume})`);
            try {
                if (canResume) this.scene._launchResumeSavedFlight();
                else window.location.reload();
            } catch (err) {
                console.error('[Platform] Reload after context loss failed:', err);
            }
        });
        card.appendChild(title);
        card.appendChild(body);
        card.appendChild(action);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        return overlay;
    }

    dispose(): void {
        if (this._viewportHandler) {
            window.removeEventListener('resize', this._viewportHandler);
            window.removeEventListener('orientationchange', this._viewportHandler);
            this._viewportHandler = null;
        }
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
        if (this._contextLostObserver && this._engine) {
            try { this._engine.onContextLostObservable.remove(this._contextLostObserver); } catch (err) { console.warn('[Platform] Context-loss observer removal failed:', err); }
        }
        this._contextLostObserver = null;
        this._engine = null;
        this.releaseWakeLock();
        this._rotateOverlay?.remove();
        this._rotateOverlay = null;
        this._contextLostOverlay?.remove();
        this._contextLostOverlay = null;
    }
}
