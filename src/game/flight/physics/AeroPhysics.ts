import * as BABYLON from '@babylonjs/core';
import { AeroSurface } from '../types/AeroSurface.js';
import {
    FLAP_TYPE_SLOTTED,
    FLAP_TYPE_FOWLER,
    FLAP_TYPE_SPLIT,
    ISA_DELTA_TEMP_K_MAX,
    ISA_DELTA_TEMP_K_MIN,
} from '../constants/index.js';

const ASPECT_RATIO_MIN = 0.1;
const OSWALD_EFFICIENCY_MIN = 0.05;

export function getAirDensity(altitudeM: number, deltaTempK: number = 0): number {
    const h = Math.max(0, altitudeM);
    const dT = Number.isFinite(deltaTempK)
        ? Math.max(ISA_DELTA_TEMP_K_MIN, Math.min(ISA_DELTA_TEMP_K_MAX, deltaTempK))
        : 0;
    if (h > 11000) {
        const T_isa = 216.65;
        const T = Math.max(150, T_isa + dT);
        const P = 22632 * Math.exp((-9.81 * (h - 11000)) / (287.058 * T_isa));
        return P / (287.058 * T);
    }
    const T_isa = 288.15 - 0.0065 * h;
    const T = Math.max(150, T_isa + dT);
    const P = 101325 * Math.pow(T_isa / 288.15, 5.2561);
    return P / (287.058 * T);
}

export function computeCoefficients(
    alpha: number, liftSlope: number, skinFriction: number,
    zeroLiftAoA: number, stallAlpha: number, aspectRatio: number,
    oswaldE: number, flapFraction: number, controlInput: number,
    groundEffectFactor: number, flapType: number,
): { cl: number; cd: number } {
    // Guard degenerate surface configs (AR/e = 0 or NaN) that would otherwise divide by zero and poison the state with NaN.
    if (!Number.isFinite(aspectRatio) || aspectRatio < ASPECT_RATIO_MIN) aspectRatio = ASPECT_RATIO_MIN;
    if (!Number.isFinite(oswaldE) || oswaldE < OSWALD_EFFICIENCY_MIN) oswaldE = OSWALD_EFFICIENCY_MIN;
    const corrSlope = liftSlope * aspectRatio /
        (aspectRatio + 2 * (aspectRatio + 4) / (aspectRatio + 2));
    const absAlpha = Math.abs(alpha);
    let cl: number, cd: number;

    if (absAlpha <= stallAlpha) {
        cl = corrSlope * (alpha - zeroLiftAoA);
        if (flapFraction > 0 && controlInput !== 0) {
            let flapEff = Math.sqrt(flapFraction) * 0.52;
            if (flapType === FLAP_TYPE_SLOTTED)  flapEff *= 1.25;
            else if (flapType === FLAP_TYPE_FOWLER) flapEff *= 1.45;
            else if (flapType === FLAP_TYPE_SPLIT)  flapEff *= 0.85;
            cl += flapEff * corrSlope * controlInput;
        }
        const cdInduced = (cl * cl) / (Math.PI * aspectRatio * oswaldE);
        cd = skinFriction + cdInduced * groundEffectFactor;
    } else {
        const sign    = alpha >= 0 ? 1 : -1;
        const clFlat  = 2 * sign * Math.sin(absAlpha) * Math.cos(absAlpha);
        const cdFlat  = 2 * Math.sin(absAlpha) * Math.sin(absAlpha);
        const clStall = corrSlope * (stallAlpha * sign - zeroLiftAoA);
        const cdInducedStall = (clStall * clStall) / (Math.PI * aspectRatio * oswaldE);
        const cdStall = skinFriction + cdInducedStall * groundEffectFactor;
        const t = Math.min(1, (absAlpha - stallAlpha) / 0.26);
        const s = t * t * (3 - 2 * t);
        cl = clStall * (1 - s) + clFlat * s;
        cd = cdStall * (1 - s) + cdFlat * s;
    }
    return { cl, cd };
}

const SURFACE_FORWARD_AXIS = new BABYLON.Vector3(0, 0, 1);
const SPAN_AXIS_MIN_LEN_SQ = 1e-6;

// Scratch buffers: computeSurfaceForces runs per surface per physics substep, so intermediates are reused
// instead of allocated. Only the three returned vectors are fresh allocations.
const _spanAxis = new BABYLON.Vector3();
const _chordPlaneVel = new BABYLON.Vector3();
const _dragDir = new BABYLON.Vector3();
const _cross1 = new BABYLON.Vector3();
const _liftDir = new BABYLON.Vector3();
const _dragVec = new BABYLON.Vector3();
const _pitchMoment = new BABYLON.Vector3();

export function computeSurfaceForces(
    surface: AeroSurface, bodyVelocity: BABYLON.Vector3, airDensity: number,
    groundEffectFactor: number, flapType: number, propwashSpeedBoost: number,
): { force: BABYLON.Vector3; torque: BABYLON.Vector3; liftVec: BABYLON.Vector3 } {
    BABYLON.Vector3.CrossToRef(surface.normal, SURFACE_FORWARD_AXIS, _spanAxis);
    const spanValid = _spanAxis.lengthSquared() > SPAN_AXIS_MIN_LEN_SQ;
    _chordPlaneVel.copyFrom(bodyVelocity);
    if (spanValid) {
        _spanAxis.normalize();
        const spanComponent = BABYLON.Vector3.Dot(bodyVelocity, _spanAxis);
        _chordPlaneVel.subtractInPlace(_spanAxis.scaleToRef(spanComponent, _dragDir));
    }

    const speed = _chordPlaneVel.length();
    if (speed < 1.0) return { force: BABYLON.Vector3.Zero(), torque: BABYLON.Vector3.Zero(), liftVec: BABYLON.Vector3.Zero() };

    _chordPlaneVel.scaleToRef(-1 / speed, _dragDir);
    BABYLON.Vector3.CrossToRef(_dragDir, surface.normal, _cross1);
    BABYLON.Vector3.CrossToRef(_cross1, _dragDir, _liftDir);
    if (_liftDir.lengthSquared() < 0.0001) return { force: BABYLON.Vector3.Zero(), torque: BABYLON.Vector3.Zero(), liftVec: BABYLON.Vector3.Zero() };
    _liftDir.normalize();

    const dot   = Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(_dragDir, surface.normal)));
    const alpha = Math.asin(dot);

    const { cl, cd } = computeCoefficients(
        alpha, surface.liftSlope, surface.skinFriction,
        surface.zeroLiftAoA, surface.stallAlpha, surface.aspectRatio,
        surface.oswaldE, surface.flapFraction, surface.controlInput,
        groundEffectFactor, flapType,
    );

    const effectiveSpeed = speed + propwashSpeedBoost;
    const q     = 0.5 * airDensity * effectiveSpeed * effectiveSpeed * surface.area;
    const liftVec = _liftDir.scale(cl * q);
    _dragDir.scaleToRef(cd * q, _dragVec);
    const force = liftVec.add(_dragVec);
    const torque = BABYLON.Vector3.Cross(surface.position, force);

    if (spanValid && surface.zeroLiftCm !== 0) {
        const pitchingMomentMag = surface.zeroLiftCm * q * surface.chord;
        torque.addInPlace(_spanAxis.scaleToRef(pitchingMomentMag, _pitchMoment));
    }

    return { force, torque, liftVec };
}
