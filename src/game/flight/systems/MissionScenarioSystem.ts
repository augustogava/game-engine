import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import { haversineNm } from '../physics/NavMath.js';
import {
    TERRAIN_UNKNOWN_Y,
    MISSION_TYPE_SCHEDULED,
    SCENARIO_OBJECTIVE_PENDING,
    SCENARIO_OBJECTIVE_DONE,
    SCENARIO_OBJECTIVE_FAILED,
    SCENARIO_UPDATE_INTERVAL_S,
    SCENARIO_DISTANCE_COMPLETION_RATIO,
    SCENARIO_RETURN_RADIUS_NM,
    SCENARIO_LAND_AWAY_MIN_NM,
    SCENARIO_DEPARTURE_WINDOW_MS,
    SCENARIO_ON_TIME_TOLERANCE_FACTOR,
    SCENARIO_NIGHT_SUN_ELEVATION_MAX_DEG,
    SCENARIO_NIGHT_SOLAR_HOUR,
    SCENARIO_AUTOPILOT_MIN_RATIO,
    SCENARIO_AGL_BAND_MIN_RATIO,
    SCENARIO_ROLLOUT_STOP_SPEED_MS,
    SCENARIO_LANDING_CONFIRM_MS,
    SCENARIO_TAKEOFF_MIN_AGL_FT,
    SCENARIO_DIVERSION_SEARCH_RADIUS_KM,
    SCENARIO_DIVERSION_RADIUS_NM,
    SCENARIO_MAX_SEGMENT_NM,
    resolveMissionScenarioConfig,
    type MissionScenarioConfig,
} from '../constants/index.js';

const SCENARIO_PANEL_ID = 'mission-scenario-panel';
const SCENARIO_PANEL_Z_INDEX = '23';
const SCENARIO_TOAST_MS = 4000;
const METERS_TO_FEET = 3.28084;
const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 3600000;
const HOURS_PER_DAY = 24;
const DEGREES_PER_SOLAR_HOUR = 15;
const PERCENT = 100;
const COLOR_PENDING = 'rgba(255,255,255,.75)';
const COLOR_DONE = '#7df9c8';
const COLOR_FAILED = '#ff6060';

type ObjectiveId = 'distance' | 'returnToStart' | 'landAway' | 'night' | 'autopilot' | 'aglBand' | 'rollout'
    | 'engineFailure' | 'departWindow' | 'onTime' | 'cumulative' | 'land';

interface ScenarioObjective {
    id: ObjectiveId;
    status: number;
}

export class MissionScenarioSystem {
    private readonly scene: any;
    private _config: MissionScenarioConfig | null = null;
    private _missionId: number | null = null;
    private _userMissionId: number | null = null;
    private _missionType = '';
    private _missionTitle = '';
    private _targetDistanceNm = 0;
    private _estimatedDurationMin = 0;
    private _startedAtMs = 0;
    private _nightApplied = false;
    private _objectives: ScenarioObjective[] = [];
    private _accumS = 0;
    private _takeoffAtMs = 0;
    private _takeoffLat = Number.NaN;
    private _takeoffLon = Number.NaN;
    private _groundLat = Number.NaN;
    private _groundLon = Number.NaN;
    private _lastLat = Number.NaN;
    private _lastLon = Number.NaN;
    private _distanceNm = 0;
    private _airborneS = 0;
    private _autopilotS = 0;
    private _aglBandS = 0;
    private _engineFailed = false;
    private _diversionLat = Number.NaN;
    private _diversionLon = Number.NaN;
    private _diversionIcao = '';
    private _rolloutActive = false;
    private _rolloutM = 0;
    private _pendingLandingEval = false;
    private _landingTimer: number | null = null;
    private _priorProgressNm = 0;
    private _wasCrashed = false;
    private _panelEl: HTMLDivElement | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    isActive(): boolean {
        return this._config != null && this._userMissionId != null;
    }

    start(mission: any, userMissionId: number | null): void {
        const missionId = Number(mission?.id ?? mission?.mission_id);
        const config = Number.isInteger(missionId) && missionId > 0 ? resolveMissionScenarioConfig(missionId, mission?.type) : null;
        if (!config || userMissionId == null) {
            if (this._config) this.stop('mission is not a scenario mission');
            return;
        }
        if (this._config && this._userMissionId === userMissionId) return;
        this._config = config;
        this._missionId = missionId;
        this._userMissionId = userMissionId;
        this._missionType = String(mission?.type ?? '').toLowerCase();
        this._missionTitle = String(mission?.title ?? '');
        const distance = Number(mission?.distance_nm);
        this._targetDistanceNm = Number.isFinite(distance) && distance > 0 ? distance : 0;
        const duration = Number(mission?.estimated_duration_min);
        this._estimatedDurationMin = Number.isFinite(duration) && duration > 0 ? duration : 0;
        this._startedAtMs = Date.now();
        this._nightApplied = false;
        this._priorProgressNm = 0;
        this._objectives = this.buildObjectives(config);
        this.resetFlightState();
        if (config.cumulative) void this.fetchProgress();
        console.log(`[Scenario] Started mission=${missionId} userMission=${userMissionId} type=${this._missionType} scenario=${config.scenario} targetNm=${this._targetDistanceNm} durationMin=${this._estimatedDurationMin}`);
        this.renderPanel();
    }

    stop(reason: string): void {
        if (!this._config) return;
        console.log(`[Scenario] Stopped mission=${this._missionId} reason=${reason}`);
        this.clearLandingTimer();
        this._config = null;
        this._missionId = null;
        this._userMissionId = null;
        this._objectives = [];
        if (this._panelEl) this._panelEl.style.display = 'none';
    }

    update(dt: number): void {
        if (!this._config) return;
        this._accumS += Number.isFinite(dt) ? Math.max(0, dt) : 0;
        if (this._accumS < SCENARIO_UPDATE_INTERVAL_S) return;
        const stepS = this._accumS;
        this._accumS = 0;
        try {
            this.tick(stepS);
        } catch (err) {
            console.warn('[Scenario] Update failed:', err);
        }
    }

    onTouchdown(): void {
        if (!this._config || this._takeoffAtMs <= 0 || this._pendingLandingEval) return;
        this._pendingLandingEval = true;
        this._rolloutActive = true;
        this._rolloutM = 0;
        if (this._config.maxRolloutM != null) {
            console.debug('[Scenario] Touchdown: measuring rollout until the aircraft stops');
            return;
        }
        this._landingTimer = this.scene._safeSetTimeout(() => {
            this._landingTimer = null;
            void this.evaluateLanding();
        }, SCENARIO_LANDING_CONFIRM_MS);
    }

    private tick(stepS: number): void {
        const config = this._config;
        if (!config) return;
        const crashed = this.scene._crashed === true;
        if (crashed && !this._wasCrashed) {
            this._wasCrashed = true;
            if (this._takeoffAtMs > 0) this.fail('scenario.fail.crash');
            return;
        }
        if (!crashed && this._wasCrashed) {
            this._wasCrashed = false;
            this.resetFlightState(true);
        }
        if (crashed) return;

        if (config.night && !this._nightApplied) this.applyNightTime();

        const here = this.scene._apCurrentLatLon?.();
        if (!here || !Number.isFinite(here.lat) || !Number.isFinite(here.lon)) return;
        const onGround = this.scene.isOnGround === true;
        const aglFt = this.aglFt();
        const now = Date.now();

        if (this._takeoffAtMs <= 0) {
            if (onGround) {
                this._groundLat = here.lat;
                this._groundLon = here.lon;
            } else if (Number.isFinite(aglFt) && aglFt > SCENARIO_TAKEOFF_MIN_AGL_FT) {
                this.registerTakeoff(here.lat, here.lon, now);
            }
            this._lastLat = here.lat;
            this._lastLon = here.lon;
            this.renderPanel();
            return;
        }

        if (Number.isFinite(this._lastLat) && Number.isFinite(this._lastLon)) {
            const segmentNm = haversineNm(this._lastLat, this._lastLon, here.lat, here.lon);
            if (Number.isFinite(segmentNm) && segmentNm < SCENARIO_MAX_SEGMENT_NM) this._distanceNm += segmentNm;
        }
        this._lastLat = here.lat;
        this._lastLon = here.lon;

        if (!onGround) {
            this._airborneS += stepS;
            if (this.isAutopilotGuiding()) this._autopilotS += stepS;
            if (config.aglBandMinFt != null && config.aglBandMaxFt != null && Number.isFinite(aglFt)
                && aglFt >= config.aglBandMinFt && aglFt <= config.aglBandMaxFt) {
                this._aglBandS += stepS;
            }
            if (config.engineFailureAglFt != null && !this._engineFailed && Number.isFinite(aglFt) && aglFt >= config.engineFailureAglFt) {
                this.triggerEngineFailure(here.lat, here.lon);
            }
        }

        if (this._rolloutActive) {
            const groundSpeed = Number(this.scene.groundSpeed) || 0;
            this._rolloutM += groundSpeed * stepS;
            if (onGround && groundSpeed < SCENARIO_ROLLOUT_STOP_SPEED_MS) {
                this._rolloutActive = false;
                console.debug(`[Scenario] Rollout finished: ${this._rolloutM.toFixed(0)} m`);
                if (config.maxRolloutM != null && this._pendingLandingEval) void this.evaluateLanding();
            }
        }
        this.renderPanel();
    }

    private registerTakeoff(lat: number, lon: number, now: number): void {
        this.resetObjectiveStatuses();
        this._takeoffAtMs = now;
        this._takeoffLat = Number.isFinite(this._groundLat) ? this._groundLat : lat;
        this._takeoffLon = Number.isFinite(this._groundLon) ? this._groundLon : lon;
        const departOk = this._missionType !== MISSION_TYPE_SCHEDULED || now - this._startedAtMs <= SCENARIO_DEPARTURE_WINDOW_MS;
        this.setObjective('departWindow', departOk ? SCENARIO_OBJECTIVE_DONE : SCENARIO_OBJECTIVE_FAILED);
        console.log(`[Scenario] Takeoff registered at lat=${this._takeoffLat.toFixed(4)} lon=${this._takeoffLon.toFixed(4)} departureOnTime=${departOk}`);
        if (!departOk) this.fail('scenario.fail.lateDeparture');
    }

    private async evaluateLanding(): Promise<void> {
        const config = this._config;
        const userMissionId = this._userMissionId;
        this._pendingLandingEval = false;
        if (!config || userMissionId == null) return;
        if (this.scene._crashed === true) {
            console.log('[Scenario] Landing evaluation skipped: aircraft crashed');
            return;
        }
        const here = this.scene._apCurrentLatLon?.();
        if (!here || !Number.isFinite(here.lat) || !Number.isFinite(here.lon)) {
            console.warn('[Scenario] Landing evaluation skipped: current position unavailable');
            return;
        }
        const distFromStartNm = Number.isFinite(this._takeoffLat)
            ? haversineNm(here.lat, here.lon, this._takeoffLat, this._takeoffLon)
            : Number.NaN;
        const requiredDistanceNm = this._targetDistanceNm * SCENARIO_DISTANCE_COMPLETION_RATIO;
        const elapsedMs = Date.now() - this._takeoffAtMs;

        const results: Partial<Record<ObjectiveId, boolean>> = { land: true };
        if (config.requireDistance && !config.cumulative) results.distance = this._targetDistanceNm <= 0 || this._distanceNm >= requiredDistanceNm;
        if (config.returnToStart) results.returnToStart = Number.isFinite(distFromStartNm) && distFromStartNm <= SCENARIO_RETURN_RADIUS_NM;
        if (config.landAwayFromStart) results.landAway = Number.isFinite(distFromStartNm) && distFromStartNm >= SCENARIO_LAND_AWAY_MIN_NM;
        if (config.night) results.night = Number(this.scene._sunElevation) <= SCENARIO_NIGHT_SUN_ELEVATION_MAX_DEG;
        if (config.requireAutopilot) results.autopilot = this.ratio(this._autopilotS) >= SCENARIO_AUTOPILOT_MIN_RATIO;
        if (config.aglBandMinFt != null && config.aglBandMaxFt != null) results.aglBand = this.ratio(this._aglBandS) >= SCENARIO_AGL_BAND_MIN_RATIO;
        if (config.maxRolloutM != null) results.rollout = this._rolloutM <= config.maxRolloutM;
        if (config.engineFailureAglFt != null) {
            const diversionKnown = Number.isFinite(this._diversionLat) && Number.isFinite(this._diversionLon);
            results.engineFailure = this._engineFailed
                && (!diversionKnown || haversineNm(here.lat, here.lon, this._diversionLat, this._diversionLon) <= SCENARIO_DIVERSION_RADIUS_NM);
        }
        if (this._missionType === MISSION_TYPE_SCHEDULED) {
            results.departWindow = this.getObjective('departWindow') !== SCENARIO_OBJECTIVE_FAILED;
            if (this._estimatedDurationMin > 0) {
                results.onTime = elapsedMs <= this._estimatedDurationMin * MS_PER_MINUTE * SCENARIO_ON_TIME_TOLERANCE_FACTOR;
            }
        }
        if (config.cumulative) {
            const serverNm = await this.fetchProgress();
            const totalNm = Math.max(serverNm ?? 0, this._priorProgressNm + this._distanceNm);
            this._priorProgressNm = totalNm;
            results.cumulative = this._targetDistanceNm <= 0 || totalNm >= this._targetDistanceNm;
        }

        for (const [id, ok] of Object.entries(results)) {
            this.setObjective(id as ObjectiveId, ok ? SCENARIO_OBJECTIVE_DONE : SCENARIO_OBJECTIVE_FAILED);
        }
        const failed = Object.entries(results).filter(([, ok]) => !ok).map(([id]) => id);
        console.log(`[Scenario] Landing evaluated mission=${this._missionId} distNm=${this._distanceNm.toFixed(1)} fromStartNm=${Number.isFinite(distFromStartNm) ? distFromStartNm.toFixed(1) : 'n/a'} rolloutM=${this._rolloutM.toFixed(0)} apRatio=${this.ratio(this._autopilotS).toFixed(2)} bandRatio=${this.ratio(this._aglBandS).toFixed(2)} failed=[${failed.join(',')}]`);
        this.renderPanel();

        if (failed.length === 0) {
            this.showToast(I18n.t('scenario.success'));
            await this.scene._missionSystem?.completeActiveMission?.();
            this.stop('completed');
            return;
        }
        if (config.cumulative && failed.length === 1 && failed[0] === 'cumulative') {
            this.showToast(I18n.format('scenario.progress', { current: Math.round(this._priorProgressNm), target: Math.round(this._targetDistanceNm) }));
            this.resetFlightState(true);
            return;
        }
        this.fail(`scenario.fail.${failed[0]}`);
        this.resetFlightState(true);
    }

    private fail(key: string): void {
        console.log(`[Scenario] Mission ${this._missionId} attempt failed: ${key}`);
        this.showToast(`${I18n.t('scenario.failed')}: ${I18n.t(key)}`);
        this.renderPanel();
        this.clearLandingTimer();
        this._pendingLandingEval = false;
        this._rolloutActive = false;
    }

    private triggerEngineFailure(lat: number, lon: number): void {
        this._engineFailed = true;
        const alive = Array.isArray(this.scene._engineAlive) ? this.scene._engineAlive : [];
        if (alive[0] === true) {
            try { this.scene._killEngine(0); } catch (err) { console.warn('[Scenario] Engine failure trigger failed:', err); }
        }
        console.log(`[Scenario] Engine failure triggered at lat=${lat.toFixed(4)} lon=${lon.toFixed(4)}`);
        this.showToast(I18n.t('scenario.engineFailure'));
        void this.findDiversionAirport(lat, lon);
    }

    private async findDiversionAirport(lat: number, lon: number): Promise<void> {
        try {
            const resp = await fetch(`/api/airports/nearby?lat=${lat}&lng=${lon}&radius_km=${SCENARIO_DIVERSION_SEARCH_RADIUS_KM}`);
            if (!resp.ok) {
                console.warn(`[Scenario] Diversion airport lookup failed: HTTP ${resp.status}`);
                return;
            }
            const json = await resp.json();
            const list: any[] = Array.isArray(json?.data) ? json.data : [];
            const target = list.find((a) => Array.isArray(a?.runways) && a.runways.length > 0
                && Number.isFinite(Number(a.latitude)) && Number.isFinite(Number(a.longitude)));
            if (!target || !this._config) {
                console.warn('[Scenario] No diversion airport with runways found nearby');
                return;
            }
            this._diversionLat = Number(target.latitude);
            this._diversionLon = Number(target.longitude);
            this._diversionIcao = String(target.icao_code || target.iata_code || target.name || '');
            this.scene._activeMission = {
                departure_lat: this._takeoffLat,
                departure_lon: this._takeoffLon,
                arrival_lat: this._diversionLat,
                arrival_lon: this._diversionLon,
                departure_icao: '',
                arrival_icao: this._diversionIcao,
                mission_title: this._missionTitle,
                arr_elevation_ft: Number.isFinite(Number(target.elevation_ft)) ? Number(target.elevation_ft) : null,
            };
            const distNm = haversineNm(lat, lon, this._diversionLat, this._diversionLon);
            console.log(`[Scenario] Diversion target ${this._diversionIcao} at ${distNm.toFixed(1)} nm`);
            this.showToast(I18n.format('scenario.diversionTarget', { airport: this._diversionIcao, distance: distNm.toFixed(1) }));
            this.renderPanel();
        } catch (err) {
            console.warn('[Scenario] Diversion airport lookup error:', err);
        }
    }

    private async fetchProgress(): Promise<number | null> {
        const userMissionId = this._userMissionId;
        if (userMissionId == null) return null;
        try {
            const token = localStorage.getItem('auth_token') || '';
            if (!token) return null;
            const resp = await fetch(`/api/user-missions/${userMissionId}/progress`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) {
                console.warn(`[Scenario] Progress fetch failed: HTTP ${resp.status}`);
                return null;
            }
            const json = await resp.json();
            const nm = Number(json?.distance_nm);
            if (!Number.isFinite(nm)) return null;
            if (this._userMissionId === userMissionId) this._priorProgressNm = Math.max(this._priorProgressNm, nm);
            this.renderPanel();
            return nm;
        } catch (err) {
            console.warn('[Scenario] Progress fetch error:', err);
            return null;
        }
    }

    private applyNightTime(): void {
        const lon = Number(this.scene.originLon);
        if (!Number.isFinite(lon)) return;
        const utcHour = ((SCENARIO_NIGHT_SOLAR_HOUR - lon / DEGREES_PER_SOLAR_HOUR) % HOURS_PER_DAY + HOURS_PER_DAY) % HOURS_PER_DAY;
        const day = new Date();
        day.setUTCHours(0, 0, 0, 0);
        const iso = new Date(day.getTime() + utcHour * MS_PER_HOUR).toISOString();
        try {
            this.scene.setSimTimeOffsetFromIso(iso);
            this._nightApplied = true;
            console.debug(`[Scenario] Night time applied: ${iso} (solar hour ${SCENARIO_NIGHT_SOLAR_HOUR}, lon=${lon.toFixed(2)})`);
        } catch (err) {
            console.warn('[Scenario] Failed to apply night time:', err);
        }
    }

    private resetFlightState(keepStatuses = false): void {
        this.clearLandingTimer();
        this._takeoffAtMs = 0;
        this._takeoffLat = Number.NaN;
        this._takeoffLon = Number.NaN;
        this._groundLat = Number.NaN;
        this._groundLon = Number.NaN;
        this._lastLat = Number.NaN;
        this._lastLon = Number.NaN;
        this._distanceNm = 0;
        this._airborneS = 0;
        this._autopilotS = 0;
        this._aglBandS = 0;
        this._engineFailed = false;
        this._diversionLat = Number.NaN;
        this._diversionLon = Number.NaN;
        this._diversionIcao = '';
        this._rolloutActive = false;
        this._rolloutM = 0;
        this._pendingLandingEval = false;
        if (!keepStatuses) this.resetObjectiveStatuses();
    }

    private resetObjectiveStatuses(): void {
        for (const objective of this._objectives) objective.status = SCENARIO_OBJECTIVE_PENDING;
    }

    private clearLandingTimer(): void {
        if (this._landingTimer == null) return;
        clearTimeout(this._landingTimer);
        this.scene._pendingTimeouts?.delete?.(this._landingTimer);
        this._landingTimer = null;
    }

    private buildObjectives(config: MissionScenarioConfig): ScenarioObjective[] {
        const ids: ObjectiveId[] = [];
        if (this._missionType === MISSION_TYPE_SCHEDULED) ids.push('departWindow');
        if (config.requireDistance && !config.cumulative) ids.push('distance');
        if (config.night) ids.push('night');
        if (config.requireAutopilot) ids.push('autopilot');
        if (config.aglBandMinFt != null && config.aglBandMaxFt != null) ids.push('aglBand');
        if (config.engineFailureAglFt != null) ids.push('engineFailure');
        if (config.cumulative) ids.push('cumulative');
        if (config.returnToStart) ids.push('returnToStart');
        if (config.landAwayFromStart) ids.push('landAway');
        if (config.maxRolloutM != null) ids.push('rollout');
        if (this._missionType === MISSION_TYPE_SCHEDULED && this._estimatedDurationMin > 0) ids.push('onTime');
        ids.push('land');
        return ids.map((id) => ({ id, status: SCENARIO_OBJECTIVE_PENDING }));
    }

    private setObjective(id: ObjectiveId, status: number): void {
        const objective = this._objectives.find((o) => o.id === id);
        if (objective) objective.status = status;
    }

    private getObjective(id: ObjectiveId): number {
        return this._objectives.find((o) => o.id === id)?.status ?? SCENARIO_OBJECTIVE_PENDING;
    }

    private objectiveText(id: ObjectiveId): string {
        const config = this._config;
        switch (id) {
            case 'distance':
                return I18n.format('scenario.obj.distance', { current: Math.round(this._distanceNm), target: Math.round(this._targetDistanceNm * SCENARIO_DISTANCE_COMPLETION_RATIO) });
            case 'returnToStart':
                return I18n.format('scenario.obj.returnToStart', { radius: SCENARIO_RETURN_RADIUS_NM });
            case 'landAway':
                return I18n.format('scenario.obj.landAway', { distance: SCENARIO_LAND_AWAY_MIN_NM });
            case 'night':
                return I18n.t('scenario.obj.night');
            case 'autopilot':
                return I18n.format('scenario.obj.autopilot', { current: Math.round(this.ratio(this._autopilotS) * PERCENT), target: Math.round(SCENARIO_AUTOPILOT_MIN_RATIO * PERCENT) });
            case 'aglBand':
                return I18n.format('scenario.obj.aglBand', { min: config?.aglBandMinFt ?? 0, max: config?.aglBandMaxFt ?? 0, current: Math.round(this.ratio(this._aglBandS) * PERCENT) });
            case 'rollout':
                return I18n.format('scenario.obj.rollout', { max: config?.maxRolloutM ?? 0, current: Math.round(this._rolloutM) });
            case 'engineFailure':
                return this._diversionIcao
                    ? I18n.format('scenario.obj.diversion', { airport: this._diversionIcao })
                    : I18n.format('scenario.obj.engineFailure', { agl: config?.engineFailureAglFt ?? 0 });
            case 'departWindow':
                return I18n.format('scenario.obj.departWindow', { minutes: Math.round(SCENARIO_DEPARTURE_WINDOW_MS / MS_PER_MINUTE) });
            case 'onTime':
                return I18n.format('scenario.obj.onTime', { minutes: Math.round(this._estimatedDurationMin * SCENARIO_ON_TIME_TOLERANCE_FACTOR) });
            case 'cumulative':
                return I18n.format('scenario.obj.cumulative', { current: Math.round(this._priorProgressNm + this._distanceNm), target: Math.round(this._targetDistanceNm) });
            case 'land':
            default:
                return I18n.t('scenario.obj.land');
        }
    }

    private renderPanel(): void {
        if (!this._config || typeof document === 'undefined' || !document.body) return;
        if (!this._panelEl) {
            const panel = document.createElement('div');
            panel.id = SCENARIO_PANEL_ID;
            panel.style.cssText = `position:fixed;top:30%;right:12px;max-width:280px;padding:8px 12px;background:rgba(0,0,0,.55);border:1px solid rgba(80,255,160,.35);border-radius:6px;font-family:'Inter',sans-serif;font-size:12px;line-height:1.5;pointer-events:none;z-index:${SCENARIO_PANEL_Z_INDEX}`;
            document.body.appendChild(panel);
            this._panelEl = panel;
        }
        const panel = this._panelEl;
        panel.replaceChildren();
        const title = document.createElement('div');
        title.style.cssText = `font-family:'Orbitron',monospace;font-size:11px;letter-spacing:.15em;color:${COLOR_DONE};margin-bottom:4px`;
        title.textContent = this._missionTitle || I18n.t('scenario.title');
        panel.appendChild(title);
        for (const objective of this._objectives) {
            const row = document.createElement('div');
            const mark = objective.status === SCENARIO_OBJECTIVE_DONE ? '✓' : objective.status === SCENARIO_OBJECTIVE_FAILED ? '✗' : '•';
            row.style.color = objective.status === SCENARIO_OBJECTIVE_DONE ? COLOR_DONE : objective.status === SCENARIO_OBJECTIVE_FAILED ? COLOR_FAILED : COLOR_PENDING;
            row.textContent = `${mark} ${this.objectiveText(objective.id)}`;
            panel.appendChild(row);
        }
        panel.style.display = 'block';
    }

    private showToast(message: string): void {
        try { this.scene._showToast(message, SCENARIO_TOAST_MS); } catch (err) { console.warn('[Scenario] Toast failed:', err); }
    }

    private isAutopilotGuiding(): boolean {
        return this.scene._autopilotMaster === true
            && (this.scene._autopilotAltHold === true || this.scene._autopilotNavHold === true);
    }

    private ratio(seconds: number): number {
        return this._airborneS > 0 ? seconds / this._airborneS : 0;
    }

    private aglFt(): number {
        const py = Number(this.scene.planeRoot?.position?.y);
        const terrainY = Number(this.scene.terrainY);
        if (!Number.isFinite(py) || !Number.isFinite(terrainY) || terrainY === TERRAIN_UNKNOWN_Y) return Number.NaN;
        return Math.max(0, (py - terrainY) * METERS_TO_FEET);
    }

    dispose(): void {
        this.clearLandingTimer();
        this._panelEl?.remove();
        this._panelEl = null;
        this._config = null;
    }
}
