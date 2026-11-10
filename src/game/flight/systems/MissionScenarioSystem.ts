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
    SCENARIO_RANKING_PERIOD_ALL_TIME,
    MISSION_SCENARIO_GATE_TIME_TRIAL,
    MISSION_SCENARIO_AEROBATICS,
    MISSION_SCENARIO_HOLD_SLOT,
    HOLD_SLOT_MODE_REFUEL,
    resolveMissionScenarioConfig,
    scenarioResultOrder,
    type MissionScenarioConfig,
    type ScenarioHoldSlotConfig,
} from '../constants/index.js';
import type { SlotEvaluation } from '../physics/HoldSlotMath.js';
import { AerobaticManeuverDetector, isSupportedManeuver, MANEUVER_UPDATE_COMPLETED, MANEUVER_UPDATE_ABORTED } from '../physics/AerobaticManeuverDetector.js';
import { fetchMissionRanking, fetchStoredUserMissionScore, submitUserMissionScore, formatScenarioResult, formatScenarioTimeMs, isBetterScenarioResult } from '../api/ScenarioRankingApi.js';
import { GATE_EVENT_PASSED, GATE_EVENT_MISSED, GATE_EVENT_FINISHED, GATE_EVENT_RESET } from './GateCourseSystem.js';

const SCENARIO_PANEL_ID = 'mission-scenario-panel';
const SCENARIO_PANEL_Z_INDEX = '23';
const SCENARIO_TOAST_MS = 4000;
const SCENARIO_RESULT_TOAST_MS = 7000;
const SCENARIO_RANKED_TIME_SCALE = 1;
const SCORE_SUBMIT_MAX_ATTEMPTS = 3;
const SCORE_SUBMIT_RETRY_MS = 1500;
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
    | 'engineFailure' | 'departWindow' | 'onTime' | 'cumulative' | 'land' | 'gates' | 'maneuver' | 'minAgl' | 'holdSlot';

interface ScenarioObjective {
    id: ObjectiveId;
    status: number;
    index?: number;
}

interface LiveRow {
    el: HTMLDivElement;
    objective: ScenarioObjective;
    text: string;
}

const LIVE_OBJECTIVE_IDS: readonly ObjectiveId[] = ['gates', 'maneuver', 'minAgl', 'holdSlot'];
const SLOT_HOLD_DEFAULT_S = 30;
const SLOT_FUEL_RATE_DEFAULT_KG_S = 15;
const SLOT_FUEL_TARGET_DEFAULT_KG = 200;
const SLOT_START_FUEL_FRACTION_DEFAULT = 0.4;
const SLOT_FUEL_FULL_MARGIN_KG = 0.5;
const SLOT_TELEPORT_DISTANCE_M = 600;
const SLOT_GUIDE_STEP_M = 10;
const SLOT_GUIDE_MIN_M = 10;
const SLOT_FEEDBACK_MIN_INTERVAL_MS = 1500;
const MS_PER_SECOND = 1000;
const PANEL_PHONE_MAX_WIDTH_PX = 768;
const PANEL_SMALL_PHONE_MAX_WIDTH_PX = 480;
const PANEL_PHONE_GAP_PX = 6;
const PANEL_PHONE_FALLBACK_TOP_RATIO = 0.32;
const PANEL_PHONE_RIGHT_PX = 48;
const PANEL_SMALL_PHONE_RIGHT_PX = 40;
const PANEL_PHONE_MAX_PANEL_WIDTH_PX = 142;
const PANEL_DESKTOP_RIGHT_PX = 56;
const PANEL_COMPACT_MAX_HEIGHT_PX = 720;
const MANEUVER_ABORT_TOAST_MIN_PROGRESS = 0.25;
const ATTITUDE_DISCONTINUITY_LIMIT = 0.5;
const AGL_DISPLAY_STEP_FT = 50;
const DEGREES_PER_RADIAN = 180 / Math.PI;
const FULL_CIRCLE_DEG = 360;

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
    private _finishing = false;
    private _resultValue: number | null = null;
    private _timeScaleLockNotified = false;
    private _gatesStarted = false;
    private _liveRows: LiveRow[] = [];
    private _maneuvers: number[] = [];
    private _maneuverIndex = 0;
    private _maneuverScores: number[] = [];
    private _detector: AerobaticManeuverDetector | null = null;
    private _hasPrevAttitude = false;
    private _prevFwdX = 0;
    private _prevFwdY = 0;
    private _prevFwdZ = 0;
    private _prevUpX = 0;
    private _prevUpY = 0;
    private _prevUpZ = 0;
    private _floorArmed = false;
    private _slotStarted = false;
    private _slotRepositionPending = false;
    private _slotInvalid = false;
    private _slotSpawnStamp = 0;
    private _slotEntered = false;
    private _slotInNow = false;
    private _slotInS = 0;
    private _slotElapsedMs = 0;
    private _slotFeedbackAtMs = -SLOT_FEEDBACK_MIN_INTERVAL_MS;
    private _slotFuelKg = 0;
    private _slotFuelPrepared = false;
    private _slotGuide: SlotEvaluation | null = null;
    private _slotHasPrevPos = false;
    private _slotPrevX = 0;
    private _slotPrevY = 0;
    private _slotPrevZ = 0;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    isActive(): boolean {
        return this._config != null && this._userMissionId != null;
    }

    start(mission: any, userMissionId: number | null): void {
        const missionId = Number(mission?.id ?? mission?.mission_id);
        const config = Number.isInteger(missionId) && missionId > 0 ? resolveMissionScenarioConfig(missionId, mission?.type, mission?.scenario_config) : null;
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
        this._finishing = false;
        this._resultValue = null;
        this._timeScaleLockNotified = false;
        this._gatesStarted = false;
        try { this.scene._gateCourseSystem?.stop?.(); } catch (err) { console.warn('[Scenario] Gate course stop failed:', err); }
        this._slotStarted = false;
        try { this.scene._npcAircraftSystem?.stop?.(); } catch (err) { console.warn('[Scenario] Scripted aircraft stop failed:', err); }
        this._maneuvers = config.scenario === MISSION_SCENARIO_AEROBATICS && Array.isArray(config.maneuvers)
            ? config.maneuvers.map((m) => Number(m)).filter((m) => isSupportedManeuver(m))
            : [];
        if (config.scenario === MISSION_SCENARIO_AEROBATICS && this._maneuvers.length === 0) {
            console.warn(`[Scenario] Mission ${missionId} is an aerobatic scenario without a valid maneuver list`);
        }
        this._slotInvalid = false;
        if (config.scenario === MISSION_SCENARIO_HOLD_SLOT && !config.slot) {
            console.warn(`[Scenario] Mission ${missionId} is a scripted-aircraft scenario without slot settings`);
        }
        this._objectives = this.buildObjectives(config);
        this.resetFlightState();
        if (config.cumulative) void this.fetchProgress();
        console.log(`[Scenario] Started mission=${missionId} userMission=${userMissionId} type=${this._missionType} scenario=${config.scenario} completeInAir=${config.completeInAir === true} targetNm=${this._targetDistanceNm} durationMin=${this._estimatedDurationMin}`);
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
        this._finishing = false;
        this._resultValue = null;
        this._gatesStarted = false;
        this._liveRows = [];
        this._maneuvers = [];
        this._maneuverScores = [];
        this._maneuverIndex = 0;
        this._detector = null;
        this._hasPrevAttitude = false;
        this._floorArmed = false;
        this._slotStarted = false;
        this._slotGuide = null;
        try { this.scene._gateCourseSystem?.stop?.(); } catch (err) { console.warn('[Scenario] Gate course stop failed:', err); }
        try { this.scene._npcAircraftSystem?.stop?.(); } catch (err) { console.warn('[Scenario] Scripted aircraft stop failed:', err); }
        if (this._panelEl) this._panelEl.style.display = 'none';
    }

    update(dt: number): void {
        if (!this._config) return;
        const frameDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        try {
            this.updateFrame(frameDt);
        } catch (err) {
            console.warn('[Scenario] Frame update failed:', err);
        }
        if (!this._config) return;
        this._accumS += frameDt;
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
        if (this._config.completeInAir === true) {
            console.debug('[Scenario] Touchdown ignored: this mission completes in the air');
            return;
        }
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

    private updateFrame(dt: number): void {
        const config = this._config;
        if (!config || this._finishing) return;
        this.trackCrash(config);
        if (scenarioResultOrder(config) !== null) this.enforceRankedTimeScale();
        if (config.scenario === MISSION_SCENARIO_GATE_TIME_TRIAL) this.updateGateCourse(dt);
        if (config.scenario === MISSION_SCENARIO_AEROBATICS) this.updateAerobatics(dt);
        if (config.scenario === MISSION_SCENARIO_HOLD_SLOT) this.updateHoldSlot(dt);
        this.refreshLiveRow();
        if (config.completeInAir === true) this.maybeCompleteInAir();
    }

    private trackCrash(config: MissionScenarioConfig): void {
        const crashed = this.scene._crashed === true;
        if (crashed && !this._wasCrashed) {
            this._wasCrashed = true;
            console.debug(`[Scenario] Crash registered for mission ${this._missionId}; airborne=${this._takeoffAtMs > 0}`);
            if (this._takeoffAtMs > 0) this.fail('scenario.fail.crash');
        } else if (!crashed && this._wasCrashed) {
            this._wasCrashed = false;
            this.resetFlightState(config.completeInAir !== true);
            this.renderPanel();
        }
    }

    private updateGateCourse(dt: number): void {
        const gates = this.scene._gateCourseSystem;
        if (!gates) return;
        if (!this._gatesStarted) {
            this._gatesStarted = true;
            const built = gates.start(this.scene._missionWaypoints, this._config?.gateRadiusM) === true;
            if (!built) console.warn(`[Scenario] Mission ${this._missionId} has no usable gate course`);
            this.renderPanel();
            return;
        }
        if (!gates.isActive() || this.scene._crashed === true) return;
        const event = gates.update(dt);
        this.scene._missionCurrentWpIndex = gates.nextIndex;
        if (event === GATE_EVENT_PASSED) {
            try { this.scene._cockpitClick(); } catch (err) { console.warn('[Scenario] Gate click failed:', err); }
        } else if (event === GATE_EVENT_MISSED) {
            this.showToast(I18n.format('scenario.gate.missed', { gate: gates.nextIndex + 1 }));
        } else if (event === GATE_EVENT_RESET) {
            this.setObjective('gates', SCENARIO_OBJECTIVE_PENDING);
            this._resultValue = null;
            this.renderPanel();
        } else if (event === GATE_EVENT_FINISHED) {
            this._resultValue = Math.round(gates.elapsedMs);
            this.setObjective('gates', SCENARIO_OBJECTIVE_DONE);
            this.renderPanel();
        }
    }

    private refreshLiveRow(): void {
        for (const live of this._liveRows) {
            const text = this.objectiveRowText(live.objective);
            if (text === live.text) continue;
            live.text = text;
            live.el.textContent = text;
        }
    }

    private updateAerobatics(dt: number): void {
        const config = this._config;
        const root = this.scene.planeRoot;
        const q = root?.rotationQuaternion;
        if (!config || !q || dt <= 0) return;
        if (this._maneuvers.length === 0 || this._maneuverIndex >= this._maneuvers.length) return;
        if (this.scene._crashed === true || this.scene.isOnGround === true) {
            this._hasPrevAttitude = false;
            this._detector?.reset();
            return;
        }
        const fwdX = 2 * (q.x * q.z + q.w * q.y);
        const fwdY = 2 * (q.y * q.z - q.w * q.x);
        const fwdZ = 1 - 2 * (q.x * q.x + q.y * q.y);
        const upX = 2 * (q.x * q.y - q.w * q.z);
        const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
        const upZ = 2 * (q.y * q.z + q.w * q.x);
        const dFwdX = fwdX - this._prevFwdX;
        const dFwdY = fwdY - this._prevFwdY;
        const dFwdZ = fwdZ - this._prevFwdZ;
        const dUpX = upX - this._prevUpX;
        const dUpY = upY - this._prevUpY;
        const dUpZ = upZ - this._prevUpZ;
        const hadPrev = this._hasPrevAttitude;
        const jump = Math.hypot(dFwdX, dFwdY, dFwdZ) > ATTITUDE_DISCONTINUITY_LIMIT || Math.hypot(dUpX, dUpY, dUpZ) > ATTITUDE_DISCONTINUITY_LIMIT;
        const pullStepRad = dFwdX * this._prevUpX + dFwdY * this._prevUpY + dFwdZ * this._prevUpZ;
        const rightX = this._prevUpY * this._prevFwdZ - this._prevUpZ * this._prevFwdY;
        const rightY = this._prevUpZ * this._prevFwdX - this._prevUpX * this._prevFwdZ;
        const rightZ = this._prevUpX * this._prevFwdY - this._prevUpY * this._prevFwdX;
        const rollStepRad = dUpX * rightX + dUpY * rightY + dUpZ * rightZ;
        this._prevFwdX = fwdX;
        this._prevFwdY = fwdY;
        this._prevFwdZ = fwdZ;
        this._prevUpX = upX;
        this._prevUpY = upY;
        this._prevUpZ = upZ;
        this._hasPrevAttitude = true;
        if (!hadPrev) return;
        if (jump) {
            this._detector?.reset();
            return;
        }
        if (this.checkMinimumHeight(config)) return;
        if (!this._detector) this._detector = new AerobaticManeuverDetector(this._maneuvers[this._maneuverIndex]);
        const altitudeM = (Number.isFinite(this.scene.refAlt) ? this.scene.refAlt : 0) + root.position.y;
        const headingDeg = ((Math.atan2(fwdX, -fwdZ) * DEGREES_PER_RADIAN) + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG;
        const outcome = this._detector.update({
            dtS: dt,
            rollStepRad,
            pullStepRad,
            pitchDeg: Math.asin(Math.max(-1, Math.min(1, fwdY))) * DEGREES_PER_RADIAN,
            upY,
            headingDeg,
            altitudeM,
        });
        if (outcome === MANEUVER_UPDATE_COMPLETED) this.onManeuverCompleted();
        else if (outcome === MANEUVER_UPDATE_ABORTED) this.onManeuverAborted();
    }

    private checkMinimumHeight(config: MissionScenarioConfig): boolean {
        const minAglFt = Number(config.minAglFt);
        if (!Number.isFinite(minAglFt) || minAglFt <= 0) return false;
        const aglFt = this.aglFt();
        if (!Number.isFinite(aglFt)) return false;
        if (!this._floorArmed) {
            if (aglFt >= minAglFt) {
                this._floorArmed = true;
                console.debug(`[Scenario] Minimum height armed at ${aglFt.toFixed(0)} ft AGL (floor ${minAglFt} ft)`);
            }
            return false;
        }
        if (aglFt >= minAglFt) return false;
        const sequenceStarted = this._maneuverIndex > 0 || this._detector?.active === true;
        if (!sequenceStarted) return false;
        console.log(`[Scenario] Minimum height violated: ${aglFt.toFixed(0)} ft AGL below ${minAglFt} ft after ${this._maneuverIndex} maneuver(s)`);
        this.fail('scenario.fail.minAgl');
        this.resetAerobaticProgress();
        this._floorArmed = false;
        this.renderPanel();
        return true;
    }

    private onManeuverCompleted(): void {
        const result = this._detector?.lastResult;
        const index = this._maneuverIndex;
        if (!result) return;
        this._maneuverScores[index] = result.quality;
        const objective = this._objectives.find((o) => o.id === 'maneuver' && o.index === index);
        if (objective) objective.status = SCENARIO_OBJECTIVE_DONE;
        console.log(`[Scenario] Maneuver ${index + 1}/${this._maneuvers.length} type=${result.maneuver} quality=${result.quality} durationS=${result.durationS.toFixed(1)} headingErrDeg=${result.headingErrorDeg.toFixed(1)} altitudeErrM=${result.altitudeErrorM.toFixed(0)}`);
        this.showToast(I18n.format('scenario.maneuver.done', { name: I18n.t(`scenario.obj.maneuver.${result.maneuver}`), score: result.quality }));
        this._maneuverIndex = index + 1;
        this._detector = null;
        if (this._maneuverIndex >= this._maneuvers.length) {
            this._resultValue = this._maneuverScores.reduce((sum, score) => sum + (Number.isFinite(score) ? score : 0), 0);
        }
        this.renderPanel();
    }

    private onManeuverAborted(): void {
        const detector = this._detector;
        if (!detector) return;
        console.debug(`[Scenario] Maneuver type=${detector.maneuver} aborted reason=${detector.lastAbortReason} progress=${(detector.lastAbortProgress * 100).toFixed(0)}%`);
        if (detector.lastAbortProgress < MANEUVER_ABORT_TOAST_MIN_PROGRESS) return;
        this.showToast(I18n.format('scenario.maneuver.aborted', {
            name: I18n.t(`scenario.obj.maneuver.${detector.maneuver}`),
            reason: I18n.t(`scenario.maneuver.abort.${detector.lastAbortReason}`),
        }));
    }

    private updateHoldSlot(dt: number): void {
        const slot = this._config?.slot;
        const npc = this.scene._npcAircraftSystem;
        const root = this.scene.planeRoot;
        if (!slot || !npc || !root) return;
        if (this.scene.spawned !== true || this.scene._worldReady !== true || this.scene._crashed === true) {
            if (this._slotStarted) this._slotRepositionPending = true;
            return;
        }
        const spawnStamp = Number(this.scene._worldReadyStartMs) || 0;
        if (!this._slotStarted) {
            this._slotStarted = true;
            this._slotRepositionPending = false;
            this._slotSpawnStamp = spawnStamp;
            const started = npc.start(slot, I18n.t(`scenario.npc.${slot.mode}`)) === true;
            this._slotInvalid = !started;
            if (!started) console.warn(`[Scenario] Mission ${this._missionId} has no usable scripted aircraft settings`);
            this.renderPanel();
            return;
        }
        if (spawnStamp !== this._slotSpawnStamp) {
            this._slotSpawnStamp = spawnStamp;
            this._slotRepositionPending = true;
        }
        if (!npc.isReady()) return;
        const pos = root.position;
        const teleported = this._slotHasPrevPos && Math.hypot(pos.x - this._slotPrevX, pos.y - this._slotPrevY, pos.z - this._slotPrevZ) > SLOT_TELEPORT_DISTANCE_M;
        if (this._slotRepositionPending || teleported) {
            this._slotRepositionPending = false;
            console.debug('[Scenario] Player repositioned; scripted aircraft and slot progress reset');
            npc.repositionAheadOfPlayer();
            this.resetHoldSlotProgress();
            this.setObjective('holdSlot', SCENARIO_OBJECTIVE_PENDING);
            this.renderPanel();
        }
        this._slotPrevX = pos.x;
        this._slotPrevY = pos.y;
        this._slotPrevZ = pos.z;
        this._slotHasPrevPos = true;
        npc.update(dt);
        if (slot.mode === HOLD_SLOT_MODE_REFUEL && !this._slotFuelPrepared) this.prepareRefuelFuel(slot);
        const evaluation: SlotEvaluation | null = npc.evaluate();
        this._slotGuide = evaluation;
        if (!evaluation || this.getObjective('holdSlot') === SCENARIO_OBJECTIVE_DONE) return;
        const inSlot = evaluation.inSlot && this.scene.isOnGround !== true;
        this._slotElapsedMs += dt * MS_PER_SECOND;
        if (inSlot && !this._slotEntered) {
            this._slotEntered = true;
            console.log(`[Scenario] Slot first reached at range ${evaluation.rangeM.toFixed(0)} m, ${(this._slotElapsedMs / MS_PER_SECOND).toFixed(1)} s after the scripted aircraft appeared`);
        }
        if (inSlot !== this._slotInNow) {
            this._slotInNow = inSlot;
            if (this._slotElapsedMs - this._slotFeedbackAtMs >= SLOT_FEEDBACK_MIN_INTERVAL_MS) {
                this._slotFeedbackAtMs = this._slotElapsedMs;
                console.debug(`[Scenario] Slot ${inSlot ? 'entered' : 'left'} at range ${evaluation.rangeM.toFixed(0)} m, held ${this._slotInS.toFixed(1)} s`);
                try { this.scene._cockpitClick(); } catch (err) { console.warn('[Scenario] Slot click failed:', err); }
            }
        }
        if (inSlot) {
            this._slotInS += dt;
            if (slot.mode === HOLD_SLOT_MODE_REFUEL) this.transferFuel(slot, dt);
        } else if (slot.continuous === true) {
            this._slotInS = 0;
        }
        const done = slot.mode === HOLD_SLOT_MODE_REFUEL
            ? this._slotFuelKg >= this.refuelTargetKg(slot) - SLOT_FUEL_FULL_MARGIN_KG
            : this._slotInS >= this.slotHoldSeconds(slot);
        if (!done) return;
        this._resultValue = Math.round(this._slotElapsedMs);
        this.setObjective('holdSlot', SCENARIO_OBJECTIVE_DONE);
        console.log(`[Scenario] Slot objective complete mode=${slot.mode} elapsedMs=${this._resultValue} heldS=${this._slotInS.toFixed(1)} fuelKg=${this._slotFuelKg.toFixed(0)}`);
        this.renderPanel();
    }

    private slotHoldSeconds(slot: ScenarioHoldSlotConfig): number {
        const seconds = Number(slot.holdSeconds);
        return Number.isFinite(seconds) && seconds > 0 ? seconds : SLOT_HOLD_DEFAULT_S;
    }

    private fuelCapacityKg(): number {
        const capacity = Number(this.scene.aircraftConfig?.fuel_capacity_kg);
        return Number.isFinite(capacity) && capacity > 0 ? capacity : 0;
    }

    private refuelTargetKg(slot: ScenarioHoldSlotConfig): number {
        const requested = Number(slot.fuelTargetKg);
        const target = Number.isFinite(requested) && requested > 0 ? requested : SLOT_FUEL_TARGET_DEFAULT_KG;
        const fractionRaw = Number(slot.startFuelFraction);
        const fraction = Number.isFinite(fractionRaw) && fractionRaw >= 0 && fractionRaw < 1 ? fractionRaw : SLOT_START_FUEL_FRACTION_DEFAULT;
        const room = this.fuelCapacityKg() * (1 - fraction);
        return room > 0 ? Math.min(target, room) : target;
    }

    private prepareRefuelFuel(slot: ScenarioHoldSlotConfig): void {
        this._slotFuelPrepared = true;
        const capacity = this.fuelCapacityKg();
        if (capacity <= 0) {
            console.warn('[Scenario] Refuelling: aircraft fuel capacity unknown; tanks left unchanged');
            return;
        }
        const fractionRaw = Number(slot.startFuelFraction);
        const fraction = Number.isFinite(fractionRaw) && fractionRaw >= 0 && fractionRaw < 1 ? fractionRaw : SLOT_START_FUEL_FRACTION_DEFAULT;
        this.scene.fuelRemaining = capacity * fraction;
        console.debug(`[Scenario] Refuelling: tanks set to ${(fraction * PERCENT).toFixed(0)}% (${this.scene.fuelRemaining.toFixed(0)} kg of ${capacity.toFixed(0)} kg)`);
    }

    private transferFuel(slot: ScenarioHoldSlotConfig, dt: number): void {
        const capacity = this.fuelCapacityKg();
        const current = Number(this.scene.fuelRemaining);
        if (capacity <= 0 || !Number.isFinite(current)) return;
        const rateRaw = Number(slot.fuelRateKgPerS);
        const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : SLOT_FUEL_RATE_DEFAULT_KG_S;
        const added = Math.max(0, Math.min(rate * dt, capacity - current));
        this.scene.fuelRemaining = current + added;
        this._slotFuelKg += added;
        if (added <= 0 && capacity - current <= SLOT_FUEL_FULL_MARGIN_KG) this._slotFuelKg = Math.max(this._slotFuelKg, this.refuelTargetKg(slot));
    }

    private resetHoldSlotProgress(): void {
        this._slotEntered = false;
        this._slotInNow = false;
        this._slotInS = 0;
        this._slotElapsedMs = 0;
        this._slotFeedbackAtMs = -SLOT_FEEDBACK_MIN_INTERVAL_MS;
        this._slotFuelKg = 0;
        this._slotFuelPrepared = false;
        this._slotHasPrevPos = false;
        this._resultValue = null;
    }

    private slotGuideText(): string {
        const guide = this._slotGuide;
        const npc = this.scene._npcAircraftSystem;
        if (!npc || !this._slotStarted) return '';
        if (this._slotInvalid) return I18n.t('scenario.slot.invalid');
        if (!npc.isReady() || !guide) return I18n.t('scenario.slot.loading');
        if (guide.inSlot) return I18n.t('scenario.slot.inPosition');
        const parts: string[] = [];
        const add = (value: number, positiveKey: string, negativeKey: string) => {
            const rounded = Math.round(Math.abs(value) / SLOT_GUIDE_STEP_M) * SLOT_GUIDE_STEP_M;
            if (rounded < SLOT_GUIDE_MIN_M) return;
            parts.push(I18n.format(value >= 0 ? positiveKey : negativeKey, { m: rounded }));
        };
        add(guide.guideAheadM, 'scenario.slot.ahead', 'scenario.slot.behind');
        add(guide.guideRightM, 'scenario.slot.right', 'scenario.slot.left');
        add(guide.guideUpM, 'scenario.slot.above', 'scenario.slot.below');
        return parts.length > 0 ? I18n.format('scenario.slot.guide', { guide: parts.join(', ') }) : I18n.t('scenario.slot.inPosition');
    }

    private holdSlotObjectiveText(): string {
        const slot = this._config?.slot;
        if (!slot) return I18n.t('scenario.slot.invalid');
        const time = formatScenarioTimeMs(this._slotElapsedMs);
        const main = slot.mode === HOLD_SLOT_MODE_REFUEL
            ? I18n.format('scenario.obj.slot.3', { current: Math.round(this._slotFuelKg), target: Math.round(this.refuelTargetKg(slot)), time })
            : I18n.format(`scenario.obj.slot.${slot.mode}`, { current: Math.floor(this._slotInS), target: Math.round(this.slotHoldSeconds(slot)), time });
        const guide = this.getObjective('holdSlot') === SCENARIO_OBJECTIVE_DONE ? '' : this.slotGuideText();
        return guide ? `${main} · ${guide}` : main;
    }

    private resetAerobaticProgress(): void {
        this._maneuverIndex = 0;
        this._maneuverScores = [];
        this._detector = null;
        this._hasPrevAttitude = false;
        this._resultValue = null;
        for (const objective of this._objectives) {
            if (objective.id === 'maneuver') objective.status = SCENARIO_OBJECTIVE_PENDING;
        }
    }

    private enforceRankedTimeScale(): void {
        if (this.scene._timeScale === SCENARIO_RANKED_TIME_SCALE) return;
        console.debug(`[Scenario] Time scale ${this.scene._timeScale} forced back to ${SCENARIO_RANKED_TIME_SCALE}x during a ranked mission`);
        this.scene._timeScale = SCENARIO_RANKED_TIME_SCALE;
        if (!this._timeScaleLockNotified) {
            this._timeScaleLockNotified = true;
            this.showToast(I18n.t('scenario.timeScaleLocked'));
        }
    }

    private maybeCompleteInAir(): void {
        if (this._finishing || this._objectives.length === 0 || this.scene._crashed === true) return;
        const satisfied = (objective: ScenarioObjective) => objective.status === SCENARIO_OBJECTIVE_DONE
            || (objective.id === 'minAgl' && objective.status !== SCENARIO_OBJECTIVE_FAILED);
        if (!this._objectives.some((objective) => objective.id !== 'minAgl') || !this._objectives.every(satisfied)) return;
        this._finishing = true;
        void this.finishInAir();
    }

    private async finishInAir(): Promise<void> {
        const config = this._config;
        const missionId = this._missionId;
        const userMissionId = this._userMissionId;
        if (!config || missionId == null || userMissionId == null) {
            this._finishing = false;
            return;
        }
        const result = this._resultValue;
        const order = scenarioResultOrder(config);
        console.log(`[Scenario] In-air completion mission=${missionId} userMission=${userMissionId} result=${result ?? 'none'} order=${order ?? 'none'}`);
        this.renderPanel();
        try {
            if (result != null && order !== null) {
                const token = localStorage.getItem('auth_token') || '';
                const ranking = await fetchMissionRanking(missionId, SCENARIO_RANKING_PERIOD_ALL_TIME, token, order);
                const previousBest = ranking?.me?.score ?? null;
                const storedScore = await fetchStoredUserMissionScore(userMissionId, token);
                const beatsStored = isBetterScenarioResult(result, storedScore, order);
                if (!beatsStored) console.debug(`[Scenario] Result ${result} does not beat the stored value ${storedScore}; keeping the stored value`);
                const accepted = beatsStored ? await this.submitResult(userMissionId, result, token) : result;
                this.showResultToast(accepted ?? result, previousBest, order, accepted != null);
            } else {
                this.showToast(I18n.t('scenario.success'));
            }
            await this.scene._missionSystem?.completeActiveMission?.();
        } catch (err) {
            console.warn('[Scenario] In-air completion failed:', err);
        }
        this.stop('completed');
    }

    private async submitResult(userMissionId: number, result: number, token: string): Promise<number | null> {
        for (let attempt = 1; attempt <= SCORE_SUBMIT_MAX_ATTEMPTS; attempt++) {
            const accepted = await submitUserMissionScore(userMissionId, result, token);
            if (accepted != null) return accepted;
            if (attempt < SCORE_SUBMIT_MAX_ATTEMPTS) {
                console.debug(`[Scenario] Score submit attempt ${attempt}/${SCORE_SUBMIT_MAX_ATTEMPTS} failed; retrying in ${SCORE_SUBMIT_RETRY_MS}ms`);
                await new Promise<void>((resolve) => { setTimeout(resolve, SCORE_SUBMIT_RETRY_MS); });
            }
        }
        console.warn(`[Scenario] Score for user mission ${userMissionId} could not be stored after ${SCORE_SUBMIT_MAX_ATTEMPTS} attempts`);
        return null;
    }

    private showResultToast(result: number, previousBest: number | null, order: number, saved: boolean): void {
        const pointsText = (points: number) => I18n.format('scenario.points', { points });
        const resultText = formatScenarioResult(result, order, pointsText);
        let message: string;
        if (!saved) {
            message = `${I18n.format('scenario.result', { result: resultText })} · ${I18n.t('scenario.result.notSaved')}`;
        } else if (isBetterScenarioResult(result, previousBest, order)) {
            message = I18n.format('scenario.result.newBest', { result: resultText });
        } else {
            message = I18n.format('scenario.result.best', { result: resultText, best: formatScenarioResult(previousBest as number, order, pointsText) });
        }
        try {
            this.scene._showToast(message, SCENARIO_RESULT_TOAST_MS);
        } catch (err) {
            console.warn('[Scenario] Result toast failed:', err);
        }
    }

    private tick(stepS: number): void {
        const config = this._config;
        if (!config) return;
        if (this.scene._crashed === true) return;

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
            } else if (config.completeInAir === true || (Number.isFinite(aglFt) && aglFt > SCENARIO_TAKEOFF_MIN_AGL_FT)) {
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
        if (config.completeInAir === true && config.requireDistance && !config.cumulative
            && (this._targetDistanceNm <= 0 || this._distanceNm >= this._targetDistanceNm * SCENARIO_DISTANCE_COMPLETION_RATIO)) {
            this.setObjective('distance', SCENARIO_OBJECTIVE_DONE);
        }

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
        this._resultValue = null;
        try { this.scene._gateCourseSystem?.resetProgress?.(); } catch (err) { console.warn('[Scenario] Gate course reset failed:', err); }
        this.resetAerobaticProgress();
        this._floorArmed = false;
        this.resetHoldSlotProgress();
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
        if (config.scenario === MISSION_SCENARIO_GATE_TIME_TRIAL) ids.push('gates');
        const objectives: ScenarioObjective[] = ids.map((id) => ({ id, status: SCENARIO_OBJECTIVE_PENDING }));
        if (config.scenario === MISSION_SCENARIO_AEROBATICS) {
            this._maneuvers.forEach((_, index) => objectives.push({ id: 'maneuver', status: SCENARIO_OBJECTIVE_PENDING, index }));
            const minAglFt = Number(config.minAglFt);
            if (Number.isFinite(minAglFt) && minAglFt > 0) objectives.push({ id: 'minAgl', status: SCENARIO_OBJECTIVE_PENDING });
        }
        if (config.scenario === MISSION_SCENARIO_HOLD_SLOT) objectives.push({ id: 'holdSlot', status: SCENARIO_OBJECTIVE_PENDING });
        if (config.completeInAir !== true) objectives.push({ id: 'land', status: SCENARIO_OBJECTIVE_PENDING });
        return objectives;
    }

    private setObjective(id: ObjectiveId, status: number): void {
        const objective = this._objectives.find((o) => o.id === id);
        if (objective) objective.status = status;
    }

    private getObjective(id: ObjectiveId): number {
        return this._objectives.find((o) => o.id === id)?.status ?? SCENARIO_OBJECTIVE_PENDING;
    }

    private maneuverObjectiveText(index: number): string {
        const maneuver = this._maneuvers[index];
        const name = I18n.t(`scenario.obj.maneuver.${maneuver}`);
        const score = this._maneuverScores[index];
        if (index < this._maneuverIndex && Number.isFinite(score)) return I18n.format('scenario.obj.maneuverScore', { name, score });
        if (index === this._maneuverIndex && this._detector?.active === true) {
            return I18n.format('scenario.obj.maneuverProgress', { name, percent: Math.round(this._detector.progress * PERCENT) });
        }
        return name;
    }

    private minAglObjectiveText(): string {
        const min = Number(this._config?.minAglFt) || 0;
        const aglFt = this.aglFt();
        if (!Number.isFinite(aglFt)) return I18n.format('scenario.obj.minAgl', { min });
        return I18n.format('scenario.obj.minAglNow', { min, current: Math.round(aglFt / AGL_DISPLAY_STEP_FT) * AGL_DISPLAY_STEP_FT });
    }

    private objectiveText(objective: ScenarioObjective): string {
        const config = this._config;
        const id = objective.id;
        switch (id) {
            case 'maneuver':
                return this._maneuvers.length > 0 ? this.maneuverObjectiveText(objective.index ?? 0) : I18n.t('scenario.obj.maneuversInvalid');
            case 'minAgl':
                return this.minAglObjectiveText();
            case 'holdSlot':
                return this.holdSlotObjectiveText();
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
            case 'gates': {
                const gates = this.scene._gateCourseSystem;
                if (!gates || !gates.isActive()) return I18n.t('scenario.obj.gatesInvalid');
                if (!gates.isRunning && !gates.isFinished) return I18n.format('scenario.obj.gatesStart', { total: gates.total });
                return I18n.format('scenario.obj.gates', { current: gates.nextIndex, total: gates.total, time: formatScenarioTimeMs(gates.elapsedMs) });
            }
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
            panel.style.cssText = `position:fixed;top:30%;right:${PANEL_DESKTOP_RIGHT_PX}px;max-width:280px;padding:8px 12px;background:rgba(0,0,0,.55);border:1px solid rgba(80,255,160,.35);border-radius:6px;font-family:'Inter',sans-serif;font-size:12px;line-height:1.5;pointer-events:none;z-index:${SCENARIO_PANEL_Z_INDEX}`;
            document.body.appendChild(panel);
            this._panelEl = panel;
        }
        const panel = this._panelEl;
        const compact = this.applyPanelLayout(panel);
        panel.replaceChildren();
        const title = document.createElement('div');
        title.style.cssText = `font-family:'Orbitron',monospace;font-size:11px;letter-spacing:.15em;color:${COLOR_DONE};margin-bottom:4px`;
        title.textContent = this._missionTitle || I18n.t('scenario.title');
        if (!compact) panel.appendChild(title);
        this._liveRows = [];
        for (const objective of this._objectives) {
            const row = document.createElement('div');
            row.style.color = objective.status === SCENARIO_OBJECTIVE_DONE ? COLOR_DONE : objective.status === SCENARIO_OBJECTIVE_FAILED ? COLOR_FAILED : COLOR_PENDING;
            const text = this.objectiveRowText(objective);
            row.textContent = text;
            panel.appendChild(row);
            if (LIVE_OBJECTIVE_IDS.includes(objective.id)) this._liveRows.push({ el: row, objective, text });
        }
        panel.style.display = 'block';
    }

    private applyPanelLayout(panel: HTMLDivElement): boolean {
        const phone = this.scene.isMobile === true && window.innerWidth <= PANEL_PHONE_MAX_WIDTH_PX;
        if (!phone) return false;
        const pfdRect = document.getElementById('flight-pfd')?.getBoundingClientRect() ?? null;
        const topPx = pfdRect && pfdRect.height > 0
            ? Math.round(pfdRect.bottom + PANEL_PHONE_GAP_PX)
            : Math.round(window.innerHeight * PANEL_PHONE_FALLBACK_TOP_RATIO);
        const rightPx = window.innerWidth <= PANEL_SMALL_PHONE_MAX_WIDTH_PX ? PANEL_SMALL_PHONE_RIGHT_PX : PANEL_PHONE_RIGHT_PX;
        panel.style.top = `${topPx}px`;
        panel.style.right = `calc(${rightPx}px + var(--safe-right))`;
        panel.style.left = 'auto';
        panel.style.maxWidth = `${PANEL_PHONE_MAX_PANEL_WIDTH_PX}px`;
        panel.style.fontSize = '10px';
        panel.style.lineHeight = '1.35';
        panel.style.padding = '5px 7px';
        return window.innerHeight < PANEL_COMPACT_MAX_HEIGHT_PX;
    }

    private objectiveRowText(objective: ScenarioObjective): string {
        const mark = objective.status === SCENARIO_OBJECTIVE_DONE ? '✓' : objective.status === SCENARIO_OBJECTIVE_FAILED ? '✗' : '•';
        return `${mark} ${this.objectiveText(objective)}`;
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
