import * as BABYLON from '@babylonjs/core';
import { AeroSurface } from '../types/AeroSurface.js';
import {
    FLAP_TYPE_SLOTTED,
    FLAP_TYPE_FOWLER,
    FLAP_TYPE_SPLIT,
    ISA_DELTA_TEMP_K_MAX,
    ISA_DELTA_TEMP_K_MIN,
} from '../constants/index.js';

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

export function computeSurfaceForces(
    surface: AeroSurface, bodyVelocity: BABYLON.Vector3, airDensity: number,
    groundEffectFactor: number, flapType: number, propwashSpeedBoost: number,
): { force: BABYLON.Vector3; torque: BABYLON.Vector3; liftVec: BABYLON.Vector3 } {
    const speed = bodyVelocity.length();
    const zero  = { force: BABYLON.Vector3.Zero(), torque: BABYLON.Vector3.Zero(), liftVec: BABYLON.Vector3.Zero() };
    if (speed < 1.0) return zero;

    const dragDir = bodyVelocity.normalizeToNew().scaleInPlace(-1);
    const cross1  = BABYLON.Vector3.Cross(dragDir, surface.normal);
    const liftDir = BABYLON.Vector3.Cross(cross1, dragDir);
    if (liftDir.lengthSquared() < 0.0001) return zero;
    liftDir.normalize();

    const dot   = Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(dragDir, surface.normal)));
    const alpha = Math.asin(dot);

    const { cl, cd } = computeCoefficients(
        alpha, surface.liftSlope, surface.skinFriction,
        surface.zeroLiftAoA, surface.stallAlpha, surface.aspectRatio,
        surface.oswaldE, surface.flapFraction, surface.controlInput,
        groundEffectFactor, flapType,
    );

    const effectiveSpeed = speed + propwashSpeedBoost;
    const q     = 0.5 * airDensity * effectiveSpeed * effectiveSpeed * surface.area;
    const liftVec = liftDir.scale(cl * q);
    const dragVec = dragDir.scale(cd * q);
    const force = liftVec.add(dragVec);
    const torque = BABYLON.Vector3.Cross(surface.position, force);
    return { force, torque, liftVec };
}
