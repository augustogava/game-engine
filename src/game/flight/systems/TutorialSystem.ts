import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import { InputBindings, type ActionId } from '../../InputBindings.js';
import {
    TUTORIAL_STORAGE_KEY, TUTORIAL_OVERLAY_ID, TUTORIAL_Z_INDEX,
    TUTORIAL_START_DELAY_MS, TUTORIAL_STEP_MIN_VISIBLE_MS, TUTORIAL_TARGET_POLL_MS,
    TUTORIAL_SPOTLIGHT_PADDING_PX, TUTORIAL_MOBILE_BREAKPOINT_PX,
    TUTORIAL_THROTTLE_DONE_RATIO, TUTORIAL_AIRBORNE_AGL_FT, TUTORIAL_TURN_HEADING_DELTA_DEG,
    TUTORIAL_APPROACH_SPEED_FACTOR, TUTORIAL_DESCENT_RATE_FPM,
    TUTORIAL_STEP_IDS, TUTORIAL_HOTKEY_CODE, type TutorialStepId,
    GEAR_STATE_UP, GEAR_STATE_RETRACTING, FT_TO_M, MS_TO_KT,
} from '../constants/index.js';

interface TutorialStepDef {
    id: TutorialStepId;
    desktopTargets: string[];
    mobileTargets: string[];
    isDone?: (sys: TutorialSystem) => boolean;
    onEnter?: (sys: TutorialSystem) => void;
}

const KEY_CODE_FRIENDLY: Record<string, string> = {
    ArrowUp: '\u2191', ArrowDown: '\u2193', ArrowLeft: '\u2190', ArrowRight: '\u2192',
    BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', Slash: '/', Backslash: '\\',
    PageUp: 'PgUp', PageDown: 'PgDn', Space: 'Space',
};

function friendlyKey(code: string): string {
    if (!code) return '?';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return KEY_CODE_FRIENDLY[code] ?? code;
}

function keyFor(action: ActionId): string {
    return friendlyKey(InputBindings.codeFor(action));
}

export class TutorialSystem {
    private readonly scene: any;
    private _overlay: HTMLElement | null = null;
    private _mask: HTMLElement | null = null;
    private _spot: HTMLElement | null = null;
    private _card: HTMLElement | null = null;
    private _title: HTMLElement | null = null;
    private _body: HTMLElement | null = null;
    private _progress: HTMLElement | null = null;
    private _btnPrev: HTMLButtonElement | null = null;
    private _btnNext: HTMLButtonElement | null = null;
    private _btnSkip: HTMLButtonElement | null = null;
    private _active = false;
    private _prompting = false;
    private _stepIndex = -1;
    private _stepEnteredMs = 0;
    private _lastTargetPollMs = 0;
    private _startTimer: number | null = null;
    private _startChecked = false;
    private _resizeHandler: (() => void) | null = null;
    private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    private _headingAtStepStart = 0;
    private _steps: TutorialStepDef[] = [];

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
        this._keydownHandler = (e: KeyboardEvent) => {
            if (e.code !== TUTORIAL_HOTKEY_CODE || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
            e.preventDefault();
            if (this._active) this.finish(false);
            else this.start();
        };
        window.addEventListener('keydown', this._keydownHandler);
    }

    private get isMobile(): boolean {
        return !!this.scene.isMobile || window.innerWidth <= TUTORIAL_MOBILE_BREAKPOINT_PX;
    }

    static hasCompleted(): boolean {
        try {
            return localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1';
        } catch (err) {
            console.warn('[Tutorial] localStorage read failed:', err);
            return true;
        }
    }

    private static markCompleted(): void {
        try {
            localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
        } catch (err) {
            console.warn('[Tutorial] localStorage write failed:', err);
        }
    }

    private isFreeFlight(): boolean {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.has('flightPlanId') || params.has('missionId') || params.has('mission_id')) return false;
        } catch (err) {
            console.warn('[Tutorial] URL params read failed:', err);
        }
        return !this.scene._activeMission && !this.scene._activeFlightPlanId && !this.scene._activeMissionId;
    }

    /** Called every frame by the scene; schedules the first-run prompt and drives step completion checks. */
    update(_dt: number): void {
        if (!this._startChecked) {
            const loadingGone = !document.getElementById('loading');
            if (this.scene.spawned && this.scene._worldReady && loadingGone) {
                this._startChecked = true;
                if (!TutorialSystem.hasCompleted() && this.isFreeFlight()) {
                    this._startTimer = window.setTimeout(() => {
                        this._startTimer = null;
                        this.showPrompt();
                    }, TUTORIAL_START_DELAY_MS);
                }
            }
            return;
        }
        if (!this._active || this._prompting) return;
        const step = this._steps[this._stepIndex];
        if (!step) return;

        const now = performance.now();
        if (now - this._lastTargetPollMs >= TUTORIAL_TARGET_POLL_MS) {
            this._lastTargetPollMs = now;
            this.positionSpotlight(step);
        }
        if (step.isDone && now - this._stepEnteredMs >= TUTORIAL_STEP_MIN_VISIBLE_MS) {
            let done = false;
            try { done = step.isDone(this); } catch (err) { console.warn(`[Tutorial] Step "${step.id}" check failed:`, err); }
            if (done) this.next();
        }
    }

    /** Opens the initial "take the tour?" card. */
    showPrompt(): void {
        this.ensureDom();
        this._active = true;
        this._prompting = true;
        this._stepIndex = -1;
        this.setMaskVisible(true);
        this.hideSpotlight();
        this.setText(I18n.t('tutorial.prompt.title'), I18n.t('tutorial.prompt.body'));
        if (this._btnPrev) this._btnPrev.style.display = 'none';
        if (this._btnNext) this._btnNext.textContent = I18n.t('tutorial.prompt.start');
        if (this._btnSkip) this._btnSkip.textContent = I18n.t('tutorial.prompt.skip');
        if (this._progress) this._progress.style.width = '0%';
        this.showOverlay();
        console.debug('[Tutorial] Prompt shown');
    }

    /** Starts (or restarts) the guided tour from the first step. */
    start(): void {
        this.ensureDom();
        this._steps = this.buildSteps();
        this._active = true;
        this._prompting = false;
        this._stepIndex = -1;
        if (this._btnSkip) this._btnSkip.textContent = I18n.t('tutorial.skip');
        this.showOverlay();
        this.goTo(0);
        console.debug('[Tutorial] Started');
    }

    next(): void {
        if (this._prompting) { this.start(); return; }
        if (this._stepIndex >= this._steps.length - 1) { this.finish(true); return; }
        this.goTo(this._stepIndex + 1);
    }

    prev(): void {
        if (this._prompting || this._stepIndex <= 0) return;
        this.goTo(this._stepIndex - 1);
    }

    /** Ends the tour; `completed` persists the flag so it does not auto-show again. */
    finish(completed: boolean): void {
        if (completed || this._prompting) TutorialSystem.markCompleted();
        this._active = false;
        this._prompting = false;
        this._stepIndex = -1;
        this.hideOverlay();
        console.debug(`[Tutorial] Finished completed=${completed}`);
    }

    isActive(): boolean {
        return this._active;
    }

    dispose(): void {
        if (this._startTimer !== null) {
            clearTimeout(this._startTimer);
            this._startTimer = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this._keydownHandler) {
            window.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
        this._overlay?.remove();
        this._overlay = null;
        this._active = false;
    }

    private goTo(index: number): void {
        const step = this._steps[index];
        if (!step) return;
        this._stepIndex = index;
        this._stepEnteredMs = performance.now();
        this._lastTargetPollMs = 0;
        this._headingAtStepStart = this.currentHeadingDeg();
        try { step.onEnter?.(this); } catch (err) { console.warn(`[Tutorial] Step "${step.id}" onEnter failed:`, err); }

        const title = I18n.t(`tutorial.${step.id}.title`);
        const body = this.interpolate(I18n.t(this.isMobile ? `tutorial.${step.id}.mobile` : `tutorial.${step.id}.desktop`, I18n.t(`tutorial.${step.id}.body`)));
        this.setText(title, body);

        const total = this._steps.length;
        if (this._progress) this._progress.style.width = `${Math.round(((index + 1) / total) * 100)}%`;
        if (this._btnPrev) this._btnPrev.style.display = index > 0 ? '' : 'none';
        if (this._btnNext) this._btnNext.textContent = index >= total - 1 ? I18n.t('tutorial.finish') : I18n.t('tutorial.next');
        this.setMaskVisible(true);
        this.positionSpotlight(step);
        console.debug(`[Tutorial] Step ${index + 1}/${total}: ${step.id}`);
    }

    private interpolate(text: string): string {
        return text.replace(/\{(\w+)\}/g, (_m, token: string) => {
            switch (token) {
                case 'thrUp': return keyFor('throttleUp');
                case 'thrDown': return keyFor('throttleDown');
                case 'pitchUp': return keyFor('pitchUp');
                case 'pitchDown': return keyFor('pitchDown');
                case 'rollLeft': return keyFor('rollLeft');
                case 'rollRight': return keyFor('rollRight');
                case 'yawLeft': return keyFor('yawLeft');
                case 'yawRight': return keyFor('yawRight');
                case 'gear': return keyFor('gearToggle');
                case 'flapUp': return keyFor('flapUp');
                case 'flapDown': return keyFor('flapDown');
                case 'brake': return keyFor('brakeToggle');
                case 'camera': return keyFor('cameraCycle');
                case 'respawn': return keyFor('respawn');
                case 'pause': return keyFor('pauseToggle');
                case 'easy': return keyFor('easyModeToggle');
                case 'vApp': return String(this.approachSpeedKts());
                default: return `{${token}}`;
            }
        });
    }

    private approachSpeedKts(): number {
        const stall = Number(this.scene.aircraftConfig?.stall_speed_kts);
        if (!Number.isFinite(stall) || stall <= 0) return 0;
        return Math.round(stall * TUTORIAL_APPROACH_SPEED_FACTOR);
    }

    private aglFt(): number {
        const root = this.scene.planeRoot;
        if (!root) return 0;
        const terrainY = Number.isFinite(this.scene.terrainY) && this.scene.terrainY > -1e8 ? this.scene.terrainY : 0;
        return Math.max(0, (root.position.y - terrainY) / FT_TO_M);
    }

    private currentHeadingDeg(): number {
        const root = this.scene.planeRoot;
        if (!root || !root.rotationQuaternion) return 0;
        const fwd = root.forward;
        const hdgRad = Math.atan2(fwd.x, -fwd.z);
        return ((hdgRad * 180 / Math.PI) + 360) % 360;
    }

    private headingDeltaDeg(): number {
        let d = Math.abs(this.currentHeadingDeg() - this._headingAtStepStart) % 360;
        if (d > 180) d = 360 - d;
        return d;
    }

    private verticalSpeedFpm(): number {
        const vel = this.scene.velocity;
        if (!vel) return 0;
        return (vel.y / FT_TO_M) * 60;
    }

    private speedKts(): number {
        const vel = this.scene.velocity;
        if (!vel) return 0;
        return vel.length() * MS_TO_KT;
    }

    private gearIsRetractable(): boolean {
        return this.scene.aircraftConfig?.gear_retractable !== false;
    }

    private buildSteps(): TutorialStepDef[] {
        const defs: Record<TutorialStepId, Omit<TutorialStepDef, 'id'>> = {
            welcome: { desktopTargets: [], mobileTargets: [] },
            hud: { desktopTargets: ['.hud-panel-left', '.hud-panel-right'], mobileTargets: ['.hud-panel-left', '.hud-panel-right'] },
            throttle: {
                desktopTargets: ['#bb-thr'],
                mobileTargets: ['#touch-throttle'],
                isDone: (s) => Number(s.scene.thrust) >= TUTORIAL_THROTTLE_DONE_RATIO,
            },
            rotate: {
                desktopTargets: ['#hud-spd-ticker'],
                mobileTargets: ['#hud-spd-ticker'],
                isDone: (s) => !s.scene.isOnGround && s.aglFt() >= TUTORIAL_AIRBORNE_AGL_FT,
            },
            gear: {
                desktopTargets: ['#hud-gear-row'],
                mobileTargets: ['#touch-gear'],
                isDone: (s) => !s.gearIsRetractable() || s.scene.gearState === GEAR_STATE_UP || s.scene.gearState === GEAR_STATE_RETRACTING,
            },
            turn: {
                desktopTargets: ['#hud-hdg-v'],
                mobileTargets: ['#hud-hdg-v'],
                isDone: (s) => s.headingDeltaDeg() >= TUTORIAL_TURN_HEADING_DELTA_DEG,
            },
            flapsBrake: { desktopTargets: ['#bb-flp', '#bb-brk'], mobileTargets: ['#touch-flap-btns'] },
            map: { desktopTargets: ['#gps-map'], mobileTargets: ['#gps-map'] },
            autopilot: { desktopTargets: ['#ap-toggle-btn'], mobileTargets: ['#ap-toggle-btn', '#instrument-dock'] },
            panels: { desktopTargets: ['#missions-btn', '#aircraft-btn', '#flight-plans-btn', '#logbook-btn', '#efb-btn'], mobileTargets: ['#missions-btn', '#aircraft-btn'] },
            landing: {
                desktopTargets: ['#hud-vs-v'],
                mobileTargets: ['#hud-vs-v'],
                isDone: (s) => s.verticalSpeedFpm() <= TUTORIAL_DESCENT_RATE_FPM && s.speedKts() > 0,
            },
            done: { desktopTargets: [], mobileTargets: [] },
        };
        return TUTORIAL_STEP_IDS.map((id) => ({ id, ...defs[id] }));
    }

    private ensureDom(): void {
        if (this._overlay && this._overlay.isConnected) return;
        document.getElementById(TUTORIAL_OVERLAY_ID)?.remove();

        const overlay = document.createElement('div');
        overlay.id = TUTORIAL_OVERLAY_ID;
        overlay.innerHTML = `
<style>
#${TUTORIAL_OVERLAY_ID}{position:fixed;inset:0;z-index:${TUTORIAL_Z_INDEX};pointer-events:none;font-family:'Inter',system-ui,sans-serif;display:none}
#${TUTORIAL_OVERLAY_ID}.visible{display:block}
#${TUTORIAL_OVERLAY_ID} .tut-mask{position:absolute;inset:0;background:rgba(0,6,12,.55);pointer-events:none;transition:opacity .25s}
#${TUTORIAL_OVERLAY_ID} .tut-spot{position:absolute;border:2px solid #40ffaa;border-radius:8px;box-shadow:0 0 0 9999px rgba(0,6,12,.55),0 0 22px rgba(64,255,170,.7);pointer-events:none;transition:left .25s,top .25s,width .25s,height .25s;display:none}
#${TUTORIAL_OVERLAY_ID} .tut-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 32px));background:rgba(2,10,20,.94);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.4);border-radius:10px;padding:16px 18px 14px;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.6);pointer-events:auto}
#${TUTORIAL_OVERLAY_ID} .tut-title{font-family:'Orbitron',monospace;font-size:13px;letter-spacing:.14em;color:#40ffaa;text-transform:uppercase;margin-bottom:8px}
#${TUTORIAL_OVERLAY_ID} .tut-body{font-size:13px;line-height:1.55;color:rgba(230,245,240,.9);white-space:pre-line}
#${TUTORIAL_OVERLAY_ID} .tut-body kbd{display:inline-block;min-width:18px;padding:1px 6px;border:1px solid rgba(80,255,160,.5);border-radius:4px;background:rgba(0,30,20,.6);font-family:'Orbitron',monospace;font-size:11px;color:#7df9c8;text-align:center}
#${TUTORIAL_OVERLAY_ID} .tut-progress{height:3px;background:rgba(80,255,160,.15);border-radius:2px;margin:12px 0 10px;overflow:hidden}
#${TUTORIAL_OVERLAY_ID} .tut-progress-fill{height:100%;width:0;background:#40ffaa;transition:width .3s}
#${TUTORIAL_OVERLAY_ID} .tut-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center}
#${TUTORIAL_OVERLAY_ID} .tut-actions button{font-family:'Orbitron',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:9px 14px;border-radius:6px;border:1px solid rgba(80,255,160,.4);background:rgba(0,20,15,.5);color:#7df9c8;cursor:pointer;touch-action:manipulation;min-height:36px}
#${TUTORIAL_OVERLAY_ID} .tut-actions button.tut-next{background:#40ffaa;color:#020810;font-weight:700}
#${TUTORIAL_OVERLAY_ID} .tut-actions button.tut-skip{margin-right:auto;border-color:rgba(255,255,255,.15);color:rgba(255,255,255,.6)}
@media(max-width:${TUTORIAL_MOBILE_BREAKPOINT_PX}px){
#${TUTORIAL_OVERLAY_ID} .tut-card{left:50%;top:auto;bottom:calc(72px + env(safe-area-inset-bottom));transform:translateX(-50%);width:calc(100vw - 24px);padding:12px 14px 10px}
#${TUTORIAL_OVERLAY_ID} .tut-body{font-size:12px}
}
</style>
<div class="tut-mask"></div>
<div class="tut-spot"></div>
<div class="tut-card" role="dialog" aria-live="polite">
  <div class="tut-title"></div>
  <div class="tut-body"></div>
  <div class="tut-progress"><div class="tut-progress-fill"></div></div>
  <div class="tut-actions">
    <button type="button" class="tut-skip"></button>
    <button type="button" class="tut-prev"></button>
    <button type="button" class="tut-next"></button>
  </div>
</div>`;
        document.body.appendChild(overlay);

        this._overlay = overlay;
        this._mask = overlay.querySelector('.tut-mask');
        this._spot = overlay.querySelector('.tut-spot');
        this._card = overlay.querySelector('.tut-card');
        this._title = overlay.querySelector('.tut-title');
        this._body = overlay.querySelector('.tut-body');
        this._progress = overlay.querySelector('.tut-progress-fill');
        this._btnPrev = overlay.querySelector('.tut-prev');
        this._btnNext = overlay.querySelector('.tut-next');
        this._btnSkip = overlay.querySelector('.tut-skip');

        if (this._btnPrev) {
            this._btnPrev.textContent = I18n.t('tutorial.prev');
            this._btnPrev.addEventListener('click', () => this.prev());
        }
        if (this._btnNext) this._btnNext.addEventListener('click', () => this.next());
        if (this._btnSkip) {
            this._btnSkip.textContent = I18n.t('tutorial.skip');
            this._btnSkip.addEventListener('click', () => this.finish(true));
        }

        this._resizeHandler = () => {
            const step = this._steps[this._stepIndex];
            if (this._active && !this._prompting && step) this.positionSpotlight(step);
        };
        window.addEventListener('resize', this._resizeHandler);
    }

    private setText(title: string, body: string): void {
        if (this._title) this._title.textContent = title;
        if (this._body) this._body.innerHTML = this.escapeHtml(body).replace(/\[\[([^\]]+)\]\]/g, '<kbd>$1</kbd>');
    }

    private escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    private showOverlay(): void {
        this._overlay?.classList.add('visible');
    }

    private hideOverlay(): void {
        this._overlay?.classList.remove('visible');
        this.hideSpotlight();
    }

    private setMaskVisible(visible: boolean): void {
        if (this._mask) this._mask.style.opacity = visible ? '1' : '0';
    }

    private hideSpotlight(): void {
        if (this._spot) this._spot.style.display = 'none';
        if (this._mask) this._mask.style.opacity = '1';
    }

    private positionSpotlight(step: TutorialStepDef): void {
        if (!this._spot) return;
        const selectors = this.isMobile ? step.mobileTargets : step.desktopTargets;
        let rect: DOMRect | null = null;
        for (const sel of selectors) {
            const el = document.querySelector<HTMLElement>(sel);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            rect = rect ? this.unionRect(rect, r) : r;
        }
        if (!rect) { this.hideSpotlight(); this.centerCard(); return; }

        const pad = TUTORIAL_SPOTLIGHT_PADDING_PX;
        this._spot.style.display = 'block';
        this._spot.style.left = `${Math.max(0, rect.left - pad)}px`;
        this._spot.style.top = `${Math.max(0, rect.top - pad)}px`;
        this._spot.style.width = `${rect.width + pad * 2}px`;
        this._spot.style.height = `${rect.height + pad * 2}px`;
        if (this._mask) this._mask.style.opacity = '0';
        this.placeCardNear(rect);
    }

    private unionRect(a: DOMRect, b: DOMRect): DOMRect {
        const left = Math.min(a.left, b.left);
        const top = Math.min(a.top, b.top);
        const right = Math.max(a.right, b.right);
        const bottom = Math.max(a.bottom, b.bottom);
        return new DOMRect(left, top, right - left, bottom - top);
    }

    private centerCard(): void {
        if (!this._card || this.isMobile) return;
        this._card.style.left = '50%';
        this._card.style.top = '50%';
        this._card.style.transform = 'translate(-50%,-50%)';
    }

    private placeCardNear(rect: DOMRect): void {
        if (!this._card || this.isMobile) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cw = this._card.offsetWidth || 420;
        const ch = this._card.offsetHeight || 200;
        const gap = 18;
        let left: number;
        let top: number;
        const spaceRight = vw - rect.right;
        const spaceLeft = rect.left;
        if (spaceRight >= cw + gap) {
            left = rect.right + gap;
            top = rect.top + rect.height / 2 - ch / 2;
        } else if (spaceLeft >= cw + gap) {
            left = rect.left - gap - cw;
            top = rect.top + rect.height / 2 - ch / 2;
        } else if (vh - rect.bottom >= ch + gap) {
            left = rect.left + rect.width / 2 - cw / 2;
            top = rect.bottom + gap;
        } else {
            left = rect.left + rect.width / 2 - cw / 2;
            top = rect.top - gap - ch;
        }
        left = Math.max(12, Math.min(vw - cw - 12, left));
        top = Math.max(12, Math.min(vh - ch - 12, top));
        this._card.style.left = `${left}px`;
        this._card.style.top = `${top}px`;
        this._card.style.transform = 'none';
    }
}
