import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import { InputManager } from '../../../engine/input/InputManager.js';
import { END_REASON_PILOT_QUIT } from '../constants/index.js';

const PAUSE_MENU_ID = 'pause-menu';
const PAUSE_MENU_Z_INDEX = '9000';
const PAUSE_MENU_ESCAPE_CODE = 'Escape';
const SETTINGS_TOGGLE_ID = 'debug-toggle';
const DASHBOARD_URL = 'https://simflightpro.com/dashboard';
const PAUSE_BUTTON_STYLE = 'display:block;width:100%;margin:6px 0;padding:10px 14px;background:rgba(0,40,28,.75);border:1px solid rgba(80,255,160,.45);color:#7df9c8;border-radius:6px;font-family:Inter,sans-serif;font-size:13px;letter-spacing:.04em;cursor:pointer;touch-action:manipulation';

type PauseAction = 'resume' | 'settings' | 'restart' | 'photo' | 'quit';

export class PauseMenuSystem {
    private readonly scene: any;
    private _root: HTMLDivElement | null = null;
    private _titleEl: HTMLDivElement | null = null;
    private readonly _buttons = new Map<PauseAction, HTMLButtonElement>();
    private _shown = false;
    private _suppressedUntilResume = false;
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
        this._keyHandler = (e: KeyboardEvent) => {
            if (e.code !== PAUSE_MENU_ESCAPE_CODE || e.repeat) return;
            if (InputManager.isEditableTarget(e.target)) return;
            if (this.scene._photoModeActive === true || this.scene.spawned !== true) return;
            e.preventDefault();
            this.scene._togglePause();
        };
        window.addEventListener('keydown', this._keyHandler);
    }

    private build(): void {
        if (this._root) return;
        const root = document.createElement('div');
        root.id = PAUSE_MENU_ID;
        root.style.cssText = `position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,8,6,.45);z-index:${PAUSE_MENU_Z_INDEX};pointer-events:auto`;
        const card = document.createElement('div');
        card.style.cssText = 'min-width:240px;max-width:86vw;padding:18px 20px;background:rgba(0,20,15,.92);border:1px solid rgba(80,255,160,.4);border-radius:10px;box-shadow:0 0 24px rgba(0,255,128,.15)';
        const title = document.createElement('div');
        title.style.cssText = "font-family:'Orbitron',monospace;font-size:15px;letter-spacing:.2em;color:#40ffaa;text-align:center;margin-bottom:10px";
        card.appendChild(title);
        this._titleEl = title;

        const actions: PauseAction[] = ['resume', 'settings', 'restart', 'photo', 'quit'];
        for (const action of actions) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = PAUSE_BUTTON_STYLE;
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this.handleAction(action);
            });
            card.appendChild(btn);
            this._buttons.set(action, btn);
        }
        root.appendChild(card);
        document.body.appendChild(root);
        this._root = root;
    }

    private refreshTexts(): void {
        if (this._titleEl) this._titleEl.textContent = I18n.t('pause.title');
        this._buttons.get('resume')!.textContent = I18n.t('pause.resume');
        this._buttons.get('settings')!.textContent = I18n.t('pause.settings');
        this._buttons.get('restart')!.textContent = I18n.t('pause.restart');
        this._buttons.get('photo')!.textContent = I18n.t('pause.photo');
        this._buttons.get('quit')!.textContent = I18n.t('pause.quit');
    }

    private handleAction(action: PauseAction): void {
        console.debug(`[PauseMenu] Action: ${action}`);
        try {
            switch (action) {
                case 'resume':
                    if (this.scene._paused) this.scene._togglePause();
                    break;
                case 'settings':
                    this._suppressedUntilResume = true;
                    this.setShown(false);
                    document.getElementById(SETTINGS_TOGGLE_ID)?.click();
                    break;
                case 'restart':
                    if (this.scene._crashed === true && this.scene._missionSystem?.isTrainingLessonActive?.() === true) {
                        this.scene._missionSystem.resetLessonProgress();
                        this.scene._flightPhysicsSystem.respawnAfterCrash();
                    } else {
                        if (this.scene._missionSystem?.isTrainingLessonActive?.() === true) this.scene._missionSystem.resetLessonProgress();
                        this.scene._spawnPlane();
                    }
                    if (this.scene._paused) this.scene._togglePause();
                    break;
                case 'photo':
                    this.scene._togglePhotoMode();
                    break;
                case 'quit':
                    try { this.scene.mpClient?.endFlight(END_REASON_PILOT_QUIT); } catch (err) { console.warn('[PauseMenu] endFlight failed:', err); }
                    window.location.href = DASHBOARD_URL;
                    break;
            }
        } catch (err) {
            console.warn(`[PauseMenu] Action "${action}" failed:`, err);
        }
    }

    private setShown(shown: boolean): void {
        if (shown === this._shown) return;
        this._shown = shown;
        if (shown) {
            this.build();
            this.refreshTexts();
        }
        if (this._root) this._root.style.display = shown ? 'flex' : 'none';
    }

    update(): void {
        const paused = this.scene._paused === true;
        if (!paused) this._suppressedUntilResume = false;
        const shouldShow = paused
            && !this._suppressedUntilResume
            && this.scene._photoModeActive !== true
            && this.scene._replayActive !== true;
        this.setShown(shouldShow);
    }

    dispose(): void {
        if (this._keyHandler) {
            try { window.removeEventListener('keydown', this._keyHandler); } catch (_) { /* ignore */ }
            this._keyHandler = null;
        }
        this._root?.remove();
        this._root = null;
        this._titleEl = null;
        this._buttons.clear();
        this._shown = false;
    }
}
