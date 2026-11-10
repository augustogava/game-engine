import {
    AEROBATIC_MANEUVER_ROLL,
    AEROBATIC_MANEUVER_LOOP,
    AEROBATIC_MANEUVER_SPLIT_S,
} from '../constants/missionScenarioConstants.js';

export const MANEUVER_UPDATE_NONE = 0;
export const MANEUVER_UPDATE_COMPLETED = 1;
export const MANEUVER_UPDATE_ABORTED = 2;

export const MANEUVER_ABORT_NONE = 0;
export const MANEUVER_ABORT_PITCH_LIMIT = 1;
export const MANEUVER_ABORT_TIMEOUT = 2;
export const MANEUVER_ABORT_REVERSED = 3;
export const MANEUVER_ABORT_HEADING = 4;
export const MANEUVER_ABORT_ALTITUDE = 5;
export const MANEUVER_ABORT_STALLED = 6;
export const MANEUVER_ABORT_ROLLED_OUT = 7;

const DEG_PER_RAD = 180 / Math.PI;
const FULL_TURN_DEG = 360;
const HALF_TURN_DEG = 180;
const QUALITY_MAX = 100;
const QUALITY_HEADING_WEIGHT = 40;
const QUALITY_ALTITUDE_WEIGHT = 40;
const QUALITY_DURATION_WEIGHT = 20;

const UPRIGHT_MIN_UP_Y = 0.7;
const INVERTED_MAX_UP_Y = -0.7;
const LEVEL_PITCH_LIMIT_DEG = 30;
const HEADING_TOLERANCE_DEG = 30;

const ROLL_START_RATE_DEG_S = 20;
const ROLL_COMPLETE_DEG = 352;
const ROLL_MAX_DURATION_S = 8;
const ROLL_IDEAL_DURATION_S = 3;
const ROLL_REVERSAL_LIMIT_DEG = 15;
const ROLL_ALTITUDE_TOLERANCE_M = 100;

const LOOP_START_RATE_DEG_S = 8;
const LOOP_COMPLETE_DEG = 350;
const LOOP_MAX_DURATION_S = 40;
const LOOP_IDEAL_DURATION_S = 15;
const LOOP_REVERSAL_LIMIT_DEG = 20;
const LOOP_STALL_RATE_DEG_S = 2;
const LOOP_STALL_MAX_S = 3;
const LOOP_ALTITUDE_TOLERANCE_M = 300;

const SPLIT_S_ROLL_MIN_DEG = 140;
const SPLIT_S_ROLL_PITCH_LIMIT_DEG = 35;
const SPLIT_S_ROLL_MAX_DURATION_S = 10;
const SPLIT_S_INVERTED_MAX_UP_Y = -0.85;
const SPLIT_S_PULL_MIN_DEG = 150;
const SPLIT_S_EXIT_MIN_UP_Y = 0.8;
const SPLIT_S_EXTRA_ROLL_LIMIT_DEG = 100;
const SPLIT_S_MAX_DURATION_S = 30;
const SPLIT_S_IDEAL_DURATION_S = 12;

const PHASE_IDLE = 0;
const PHASE_PRIMARY = 1;
const PHASE_SECONDARY = 2;

export interface ManeuverSample {
    dtS: number;
    rollStepRad: number;
    pullStepRad: number;
    pitchDeg: number;
    upY: number;
    headingDeg: number;
    altitudeM: number;
}

export interface ManeuverResult {
    maneuver: number;
    quality: number;
    durationS: number;
    headingErrorDeg: number;
    altitudeErrorM: number;
}

function headingDifferenceDeg(a: number, b: number): number {
    return Math.abs(((a - b + FULL_TURN_DEG + HALF_TURN_DEG) % FULL_TURN_DEG) - HALF_TURN_DEG);
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

export function isSupportedManeuver(maneuver: unknown): boolean {
    return maneuver === AEROBATIC_MANEUVER_ROLL || maneuver === AEROBATIC_MANEUVER_LOOP || maneuver === AEROBATIC_MANEUVER_SPLIT_S;
}

export class AerobaticManeuverDetector {
    readonly maneuver: number;
    private _phase = PHASE_IDLE;
    private _elapsedS = 0;
    private _phaseElapsedS = 0;
    private _rollDeg = 0;
    private _pullDeg = 0;
    private _extraRollDeg = 0;
    private _stallS = 0;
    private _direction = 0;
    private _invertedSeen = false;
    private _entryHeadingDeg = 0;
    private _entryAltitudeM = 0;
    private _lastResult: ManeuverResult | null = null;
    private _lastAbortReason = MANEUVER_ABORT_NONE;
    private _lastAbortProgress = 0;

    constructor(maneuver: number) {
        this.maneuver = maneuver;
    }

    get active(): boolean {
        return this._phase !== PHASE_IDLE;
    }

    get lastResult(): ManeuverResult | null {
        return this._lastResult;
    }

    get lastAbortReason(): number {
        return this._lastAbortReason;
    }

    get lastAbortProgress(): number {
        return this._lastAbortProgress;
    }

    get progress(): number {
        if (this._phase === PHASE_IDLE) return 0;
        if (this.maneuver === AEROBATIC_MANEUVER_ROLL) return clamp01(Math.abs(this._rollDeg) / ROLL_COMPLETE_DEG);
        if (this.maneuver === AEROBATIC_MANEUVER_LOOP) return clamp01(this._pullDeg / LOOP_COMPLETE_DEG);
        const rollPart = clamp01(Math.abs(this._rollDeg) / HALF_TURN_DEG);
        const pullPart = this._phase === PHASE_SECONDARY ? clamp01(this._pullDeg / HALF_TURN_DEG) : 0;
        return (rollPart + pullPart) / 2;
    }

    reset(): void {
        this._phase = PHASE_IDLE;
        this._elapsedS = 0;
        this._phaseElapsedS = 0;
        this._rollDeg = 0;
        this._pullDeg = 0;
        this._extraRollDeg = 0;
        this._stallS = 0;
        this._direction = 0;
        this._invertedSeen = false;
    }

    update(sample: ManeuverSample): number {
        if (!sample || !Number.isFinite(sample.dtS) || sample.dtS <= 0) return MANEUVER_UPDATE_NONE;
        if (!Number.isFinite(sample.rollStepRad) || !Number.isFinite(sample.pullStepRad)
            || !Number.isFinite(sample.pitchDeg) || !Number.isFinite(sample.upY)
            || !Number.isFinite(sample.headingDeg) || !Number.isFinite(sample.altitudeM)) {
            return MANEUVER_UPDATE_NONE;
        }
        if (this.maneuver === AEROBATIC_MANEUVER_ROLL) return this.updateRoll(sample);
        if (this.maneuver === AEROBATIC_MANEUVER_LOOP) return this.updateLoop(sample);
        if (this.maneuver === AEROBATIC_MANEUVER_SPLIT_S) return this.updateSplitS(sample);
        return MANEUVER_UPDATE_NONE;
    }

    private begin(sample: ManeuverSample): void {
        this.reset();
        this._phase = PHASE_PRIMARY;
        this._entryHeadingDeg = sample.headingDeg;
        this._entryAltitudeM = sample.altitudeM;
    }

    private abort(reason: number): number {
        this._lastAbortReason = reason;
        this._lastAbortProgress = this.progress;
        this.reset();
        return MANEUVER_UPDATE_ABORTED;
    }

    private complete(headingErrorDeg: number, altitudeErrorM: number, altitudeToleranceM: number, idealS: number, maxS: number): number {
        const headingPenalty = QUALITY_HEADING_WEIGHT * clamp01(headingErrorDeg / HEADING_TOLERANCE_DEG);
        const altitudePenalty = altitudeToleranceM > 0 ? QUALITY_ALTITUDE_WEIGHT * clamp01(altitudeErrorM / altitudeToleranceM) : 0;
        const durationPenalty = QUALITY_DURATION_WEIGHT * clamp01((this._elapsedS - idealS) / Math.max(1, maxS - idealS));
        const quality = Math.round(Math.max(0, Math.min(QUALITY_MAX, QUALITY_MAX - headingPenalty - altitudePenalty - durationPenalty)));
        this._lastResult = {
            maneuver: this.maneuver,
            quality,
            durationS: this._elapsedS,
            headingErrorDeg,
            altitudeErrorM,
        };
        this._lastAbortReason = MANEUVER_ABORT_NONE;
        this.reset();
        return MANEUVER_UPDATE_COMPLETED;
    }

    private isUprightAndLevel(sample: ManeuverSample): boolean {
        return sample.upY >= UPRIGHT_MIN_UP_Y && Math.abs(sample.pitchDeg) <= LEVEL_PITCH_LIMIT_DEG;
    }

    private updateRoll(sample: ManeuverSample): number {
        const stepDeg = sample.rollStepRad * DEG_PER_RAD;
        if (this._phase === PHASE_IDLE) {
            if (!this.isUprightAndLevel(sample) || Math.abs(stepDeg) / sample.dtS < ROLL_START_RATE_DEG_S) return MANEUVER_UPDATE_NONE;
            this.begin(sample);
        }
        if (this._direction === 0) this._direction = stepDeg < 0 ? -1 : 1;
        this._rollDeg += stepDeg;
        this._elapsedS += sample.dtS;
        if (Math.abs(sample.pitchDeg) > LEVEL_PITCH_LIMIT_DEG) return this.abort(MANEUVER_ABORT_PITCH_LIMIT);
        if (this._elapsedS > ROLL_MAX_DURATION_S) return this.abort(MANEUVER_ABORT_TIMEOUT);
        if (this._rollDeg * this._direction < -ROLL_REVERSAL_LIMIT_DEG) return this.abort(MANEUVER_ABORT_REVERSED);
        if (this._rollDeg * this._direction < ROLL_COMPLETE_DEG) return MANEUVER_UPDATE_NONE;
        const headingError = headingDifferenceDeg(sample.headingDeg, this._entryHeadingDeg);
        const altitudeError = Math.abs(sample.altitudeM - this._entryAltitudeM);
        return this.complete(headingError, altitudeError, ROLL_ALTITUDE_TOLERANCE_M, ROLL_IDEAL_DURATION_S, ROLL_MAX_DURATION_S);
    }

    private updateLoop(sample: ManeuverSample): number {
        const stepDeg = sample.pullStepRad * DEG_PER_RAD;
        const rateDegS = stepDeg / sample.dtS;
        if (this._phase === PHASE_IDLE) {
            if (!this.isUprightAndLevel(sample) || rateDegS < LOOP_START_RATE_DEG_S) return MANEUVER_UPDATE_NONE;
            this.begin(sample);
        }
        this._pullDeg += stepDeg;
        this._elapsedS += sample.dtS;
        if (sample.upY <= INVERTED_MAX_UP_Y) this._invertedSeen = true;
        this._stallS = rateDegS < LOOP_STALL_RATE_DEG_S ? this._stallS + sample.dtS : 0;
        if (this._elapsedS > LOOP_MAX_DURATION_S) return this.abort(MANEUVER_ABORT_TIMEOUT);
        if (this._pullDeg < -LOOP_REVERSAL_LIMIT_DEG) return this.abort(MANEUVER_ABORT_REVERSED);
        if (this._stallS > LOOP_STALL_MAX_S) return this.abort(MANEUVER_ABORT_STALLED);
        if (this._pullDeg < LOOP_COMPLETE_DEG || !this._invertedSeen || sample.upY < UPRIGHT_MIN_UP_Y) return MANEUVER_UPDATE_NONE;
        const headingError = headingDifferenceDeg(sample.headingDeg, this._entryHeadingDeg);
        if (headingError > HEADING_TOLERANCE_DEG) return this.abort(MANEUVER_ABORT_HEADING);
        const altitudeError = Math.abs(sample.altitudeM - this._entryAltitudeM);
        return this.complete(headingError, altitudeError, LOOP_ALTITUDE_TOLERANCE_M, LOOP_IDEAL_DURATION_S, LOOP_MAX_DURATION_S);
    }

    private updateSplitS(sample: ManeuverSample): number {
        const rollStepDeg = sample.rollStepRad * DEG_PER_RAD;
        const pullStepDeg = sample.pullStepRad * DEG_PER_RAD;
        if (this._phase === PHASE_IDLE) {
            if (!this.isUprightAndLevel(sample) || Math.abs(rollStepDeg) / sample.dtS < ROLL_START_RATE_DEG_S) return MANEUVER_UPDATE_NONE;
            this.begin(sample);
        }
        this._elapsedS += sample.dtS;
        this._phaseElapsedS += sample.dtS;
        if (this._elapsedS > SPLIT_S_MAX_DURATION_S) return this.abort(MANEUVER_ABORT_TIMEOUT);
        if (this._phase === PHASE_PRIMARY) {
            this._rollDeg += rollStepDeg;
            if (Math.abs(sample.pitchDeg) > SPLIT_S_ROLL_PITCH_LIMIT_DEG) return this.abort(MANEUVER_ABORT_PITCH_LIMIT);
            if (this._phaseElapsedS > SPLIT_S_ROLL_MAX_DURATION_S) return this.abort(MANEUVER_ABORT_TIMEOUT);
            if (sample.upY <= SPLIT_S_INVERTED_MAX_UP_Y && Math.abs(this._rollDeg) >= SPLIT_S_ROLL_MIN_DEG) {
                this._phase = PHASE_SECONDARY;
                this._phaseElapsedS = 0;
                this._pullDeg = 0;
                this._extraRollDeg = 0;
            }
            return MANEUVER_UPDATE_NONE;
        }
        this._pullDeg += pullStepDeg;
        this._extraRollDeg += Math.abs(rollStepDeg);
        if (this._pullDeg < -LOOP_REVERSAL_LIMIT_DEG) return this.abort(MANEUVER_ABORT_REVERSED);
        if (this._extraRollDeg > SPLIT_S_EXTRA_ROLL_LIMIT_DEG && this._pullDeg < SPLIT_S_PULL_MIN_DEG) return this.abort(MANEUVER_ABORT_ROLLED_OUT);
        if (this._pullDeg < SPLIT_S_PULL_MIN_DEG || sample.upY < SPLIT_S_EXIT_MIN_UP_Y || Math.abs(sample.pitchDeg) > LEVEL_PITCH_LIMIT_DEG) {
            return MANEUVER_UPDATE_NONE;
        }
        const reversedHeading = (this._entryHeadingDeg + HALF_TURN_DEG) % FULL_TURN_DEG;
        const headingError = headingDifferenceDeg(sample.headingDeg, reversedHeading);
        if (headingError > HEADING_TOLERANCE_DEG) return this.abort(MANEUVER_ABORT_HEADING);
        if (sample.altitudeM >= this._entryAltitudeM) return this.abort(MANEUVER_ABORT_ALTITUDE);
        return this.complete(headingError, 0, 0, SPLIT_S_IDEAL_DURATION_S, SPLIT_S_MAX_DURATION_S);
    }
}
