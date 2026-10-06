import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import {
    TERRAIN_UNKNOWN_Y,
    MS_TO_KT,
    resolveFlightSchoolVappKt,
    FLIGHT_SCHOOL_FLARE_AGL_FT,
    FLIGHT_SCHOOL_COACH_UPDATE_INTERVAL_S,
    FLIGHT_SCHOOL_SPEED_TOLERANCE_KT,
    FLIGHT_SCHOOL_SINK_WARN_FPM,
    FLIGHT_SCHOOL_COACH_MAX_AGL_FT,
} from '../constants/index.js';

const COACH_PANEL_ID = 'flight-school-coach';
const COACH_Z_INDEX = '24';
const METERS_TO_FEET = 3.28084;
const MS_TO_FPM = 196.850394;
const COACH_COLOR_OK = '#7df9c8';
const COACH_COLOR_WARN = '#ffcc00';
const COACH_COLOR_ALERT = '#ff4040';

export class FlightSchoolCoachSystem {
    private readonly scene: any;
    private _accumS = 0;
    private _panelEl: HTMLDivElement | null = null;
    private _titleEl: HTMLDivElement | null = null;
    private _speedEl: HTMLDivElement | null = null;
    private _vsEl: HTMLDivElement | null = null;
    private _aglEl: HTMLDivElement | null = null;
    private _flareEl: HTMLDivElement | null = null;
    private _flareShown = false;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    update(dt: number): void {
        this._accumS += Number.isFinite(dt) ? Math.max(0, dt) : 0;
        if (this._accumS < FLIGHT_SCHOOL_COACH_UPDATE_INTERVAL_S) return;
        this._accumS = 0;
        try {
            this.render();
        } catch (err) {
            console.warn('[FlightSchool] Coach update failed:', err);
        }
    }

    private render(): void {
        const lessonActive = this.scene._missionSystem?.isTrainingLessonActive?.() === true;
        const aglFt = this.aglFt();
        const visible = lessonActive
            && this.scene.planeRoot
            && this.scene._crashed !== true
            && this.scene.isOnGround !== true
            && Number.isFinite(aglFt)
            && aglFt <= FLIGHT_SCHOOL_COACH_MAX_AGL_FT;
        if (!visible) {
            if (this._panelEl) this._panelEl.style.display = 'none';
            this._flareShown = false;
            return;
        }
        this.ensurePanel();
        if (!this._panelEl || !this._titleEl || !this._speedEl || !this._vsEl || !this._aglEl || !this._flareEl) return;

        const targetKt = resolveFlightSchoolVappKt(this.scene.aircraftConfig?.stall_speed_kts);
        const iasMs = Number(this.scene._lastIasMs);
        const iasKt = Number.isFinite(iasMs) ? iasMs * MS_TO_KT : Number.NaN;
        const vsFpm = (Number(this.scene.velocity?.y) || 0) * MS_TO_FPM;
        const speedDelta = Number.isFinite(iasKt) ? iasKt - targetKt : Number.NaN;

        this._titleEl.textContent = I18n.format('flightSchool.coachTitle', { n: String(this.scene._activeTrainingOrder ?? '') });
        this._speedEl.textContent = `${I18n.t('flightSchool.targetSpeed')} ${Math.round(targetKt)} kt · ${I18n.t('flightSchool.ias')} ${Number.isFinite(iasKt) ? Math.round(iasKt) : '--'} kt`;
        this._speedEl.style.color = !Number.isFinite(speedDelta)
            ? COACH_COLOR_WARN
            : Math.abs(speedDelta) <= FLIGHT_SCHOOL_SPEED_TOLERANCE_KT ? COACH_COLOR_OK : COACH_COLOR_WARN;
        this._vsEl.textContent = `${I18n.t('flightSchool.vs')} ${vsFpm >= 0 ? '+' : ''}${Math.round(vsFpm)} fpm${vsFpm < -FLIGHT_SCHOOL_SINK_WARN_FPM ? ` · ${I18n.t('flightSchool.sinkHigh')}` : ''}`;
        this._vsEl.style.color = vsFpm < -FLIGHT_SCHOOL_SINK_WARN_FPM ? COACH_COLOR_ALERT : COACH_COLOR_OK;
        this._aglEl.textContent = `${I18n.t('flightSchool.agl')} ${Math.round(aglFt)} ft`;

        const flare = aglFt <= FLIGHT_SCHOOL_FLARE_AGL_FT && vsFpm < 0;
        this._flareEl.style.display = flare ? 'block' : 'none';
        if (flare && !this._flareShown) console.debug(`[FlightSchool] Flare cue shown at ${Math.round(aglFt)} ft AGL`);
        this._flareShown = flare;
        this._panelEl.style.display = 'block';
    }

    private aglFt(): number {
        const py = Number(this.scene.planeRoot?.position?.y);
        const terrainY = Number(this.scene.terrainY);
        if (!Number.isFinite(py) || !Number.isFinite(terrainY) || terrainY === TERRAIN_UNKNOWN_Y) return Number.NaN;
        return Math.max(0, (py - terrainY) * METERS_TO_FEET);
    }

    private ensurePanel(): void {
        if (this._panelEl || typeof document === 'undefined' || !document.body) return;
        const panel = document.createElement('div');
        panel.id = COACH_PANEL_ID;
        panel.style.cssText = `position:fixed;bottom:22%;left:50%;transform:translateX(-50%);min-width:240px;padding:8px 14px;background:rgba(0,0,0,.55);border:1px solid rgba(80,255,160,.45);border-radius:6px;font-family:'Inter',sans-serif;font-size:13px;text-align:center;pointer-events:none;z-index:${COACH_Z_INDEX};display:none`;
        const title = document.createElement('div');
        title.style.cssText = `font-family:'Orbitron',monospace;font-size:11px;letter-spacing:.2em;color:${COACH_COLOR_OK};margin-bottom:4px`;
        const speed = document.createElement('div');
        const vs = document.createElement('div');
        const agl = document.createElement('div');
        agl.style.color = COACH_COLOR_OK;
        const flare = document.createElement('div');
        flare.style.cssText = `display:none;margin-top:6px;font-family:'Orbitron',monospace;font-size:20px;font-weight:700;letter-spacing:.15em;color:${COACH_COLOR_WARN}`;
        flare.textContent = I18n.t('flightSchool.flareNow');
        panel.append(title, speed, vs, agl, flare);
        document.body.appendChild(panel);
        this._panelEl = panel;
        this._titleEl = title;
        this._speedEl = speed;
        this._vsEl = vs;
        this._aglEl = agl;
        this._flareEl = flare;
    }

    dispose(): void {
        this._panelEl?.remove();
        this._panelEl = null;
        this._titleEl = null;
        this._speedEl = null;
        this._vsEl = null;
        this._aglEl = null;
        this._flareEl = null;
    }
}
