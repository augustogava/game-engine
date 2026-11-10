import type { ScenarioNpcLeg } from '../constants/missionScenarioConstants.js';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const FULL_CIRCLE_DEG = 360;
const GRAVITY_MS2 = 9.81;
const STRAIGHT_LEG_DEFAULT_S = 30;
const BANK_DEFAULT_DEG = 20;
const BANK_MIN_DEG = 5;
const BANK_MAX_DEG = 60;
const BANK_CAPTURE_MIN_DEG = 3;
const BANK_CAPTURE_GAIN = 1.5;
const BANK_SLEW_DEG_PER_S = 15;
const TURN_DONE_TOLERANCE_DEG = 0.3;
const CLIMB_SLEW_MS2 = 2;
const CLIMB_MAX_FRACTION_OF_SPEED = 0.5;
const SPEED_MIN_MS = 10;
const STEP_MAX_S = 0.25;

function normalizeHeading(deg: number): number {
    return ((deg % FULL_CIRCLE_DEG) + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG;
}

function approach(current: number, target: number, maxStep: number): number {
    if (current < target) return Math.min(target, current + maxStep);
    return Math.max(target, current - maxStep);
}

export class NpcFlightPath {
    private readonly _legs: ScenarioNpcLeg[];
    private readonly _speedMs: number;
    private _x = 0;
    private _y = 0;
    private _z = 0;
    private _headingDeg = 0;
    private _bankDeg = 0;
    private _verticalSpeedMs = 0;
    private _legIndex = 0;
    private _legElapsedS = 0;
    private _turnDirection = 0;
    private _turnRemainingDeg = 0;
    private _turnTargetHeadingDeg = 0;
    private _legPrepared = false;
    private _legIsTurn = false;

    constructor(legs: ScenarioNpcLeg[] | null | undefined, speedMs: number) {
        this._legs = Array.isArray(legs) ? legs.filter((leg) => leg && typeof leg === 'object') : [];
        this._speedMs = Number.isFinite(speedMs) && speedMs > SPEED_MIN_MS ? speedMs : SPEED_MIN_MS;
    }

    get x(): number { return this._x; }
    get y(): number { return this._y; }
    get z(): number { return this._z; }
    get headingDeg(): number { return this._headingDeg; }
    get bankDeg(): number { return this._bankDeg; }
    get speedMs(): number { return this._speedMs; }
    get verticalSpeedMs(): number { return this._verticalSpeedMs; }
    get legIndex(): number { return this._legIndex; }

    get pitchDeg(): number {
        const ratio = Math.max(-1, Math.min(1, this._verticalSpeedMs / this._speedMs));
        return Math.asin(ratio) * RAD_TO_DEG;
    }

    reset(x: number, y: number, z: number, headingDeg: number): void {
        this._x = Number.isFinite(x) ? x : 0;
        this._y = Number.isFinite(y) ? y : 0;
        this._z = Number.isFinite(z) ? z : 0;
        this._headingDeg = normalizeHeading(Number.isFinite(headingDeg) ? headingDeg : 0);
        this._bankDeg = 0;
        this._verticalSpeedMs = 0;
        this._legIndex = 0;
        this._legElapsedS = 0;
        this._legPrepared = false;
        this._legIsTurn = false;
        this._turnDirection = 0;
        this._turnRemainingDeg = 0;
    }

    step(dt: number): void {
        if (!Number.isFinite(dt) || dt <= 0) return;
        const stepS = Math.min(STEP_MAX_S, dt);
        const leg = this._legs.length > 0 ? this._legs[this._legIndex % this._legs.length] : null;
        if (leg && !this._legPrepared) this.prepareLeg(leg);

        let desiredBankDeg = 0;
        if (leg && this._turnDirection !== 0) {
            const bankLimit = Math.max(BANK_MIN_DEG, Math.min(BANK_MAX_DEG, Math.abs(Number(leg.bankDeg)) || BANK_DEFAULT_DEG));
            const capture = Math.max(BANK_CAPTURE_MIN_DEG, this._turnRemainingDeg * BANK_CAPTURE_GAIN);
            desiredBankDeg = this._turnDirection * Math.min(bankLimit, capture);
        }
        this._bankDeg = approach(this._bankDeg, desiredBankDeg, BANK_SLEW_DEG_PER_S * stepS);

        const turnRateDegS = (GRAVITY_MS2 * Math.tan(this._bankDeg * DEG_TO_RAD) / this._speedMs) * RAD_TO_DEG;
        let headingStepDeg = turnRateDegS * stepS;
        if (leg && this._turnDirection !== 0 && Math.sign(headingStepDeg) === this._turnDirection) {
            const magnitude = Math.min(Math.abs(headingStepDeg), this._turnRemainingDeg);
            headingStepDeg = this._turnDirection * magnitude;
            this._turnRemainingDeg -= magnitude;
        }
        this._headingDeg = normalizeHeading(this._headingDeg + headingStepDeg);

        const climbLimit = this._speedMs * CLIMB_MAX_FRACTION_OF_SPEED;
        const targetClimb = leg ? Math.max(-climbLimit, Math.min(climbLimit, Number(leg.climbRateMs) || 0)) : 0;
        this._verticalSpeedMs = approach(this._verticalSpeedMs, targetClimb, CLIMB_SLEW_MS2 * stepS);

        const horizontalSpeed = Math.sqrt(Math.max(0, this._speedMs * this._speedMs - this._verticalSpeedMs * this._verticalSpeedMs));
        const headingRad = this._headingDeg * DEG_TO_RAD;
        this._x += Math.sin(headingRad) * horizontalSpeed * stepS;
        this._z -= Math.cos(headingRad) * horizontalSpeed * stepS;
        this._y += this._verticalSpeedMs * stepS;

        if (!leg) return;
        this._legElapsedS += stepS;
        const durationS = Number(leg.durationS);
        const timedOut = Number.isFinite(durationS) && durationS > 0 && this._legElapsedS >= durationS;
        const turnDone = this._legIsTurn && this._turnRemainingDeg <= TURN_DONE_TOLERANCE_DEG;
        const straightDone = !this._legIsTurn && this._legElapsedS >= (Number.isFinite(durationS) && durationS > 0 ? durationS : STRAIGHT_LEG_DEFAULT_S);
        if (turnDone && this._turnDirection !== 0) this._headingDeg = this._turnTargetHeadingDeg;
        if (turnDone || straightDone || (this._legIsTurn && timedOut)) {
            this._legIndex = (this._legIndex + 1) % this._legs.length;
            this._legElapsedS = 0;
            this._legPrepared = false;
        }
    }

    private prepareLeg(leg: ScenarioNpcLeg): void {
        this._legPrepared = true;
        this._turnDirection = 0;
        this._turnRemainingDeg = 0;
        const turnBy = Number(leg.turnByDeg);
        const turnTo = Number(leg.turnToHeadingDeg);
        const bankSign = Math.sign(Number(leg.bankDeg) || 0);
        this._legIsTurn = (Number.isFinite(turnBy) && turnBy !== 0) || (leg.turnToHeadingDeg != null && Number.isFinite(turnTo));
        if (Number.isFinite(turnBy) && turnBy !== 0) {
            this._turnDirection = turnBy > 0 ? 1 : -1;
            this._turnRemainingDeg = Math.abs(turnBy);
            this._turnTargetHeadingDeg = normalizeHeading(this._headingDeg + turnBy);
            return;
        }
        if (leg.turnToHeadingDeg != null && Number.isFinite(turnTo)) {
            const target = normalizeHeading(turnTo);
            const clockwise = normalizeHeading(target - this._headingDeg);
            if (clockwise < TURN_DONE_TOLERANCE_DEG || FULL_CIRCLE_DEG - clockwise < TURN_DONE_TOLERANCE_DEG) return;
            const direction = bankSign !== 0 ? bankSign : (clockwise <= FULL_CIRCLE_DEG / 2 ? 1 : -1);
            this._turnDirection = direction;
            this._turnRemainingDeg = direction > 0 ? clockwise : FULL_CIRCLE_DEG - clockwise;
            this._turnTargetHeadingDeg = target;
        }
    }
}
