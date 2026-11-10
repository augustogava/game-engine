import {
    HOLD_SLOT_MODE_CHASE,
    type ScenarioHoldSlotConfig,
} from '../constants/missionScenarioConstants.js';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EPSILON_M = 1e-6;

export const CHASE_MIN_RANGE_DEFAULT_M = 100;
export const CHASE_MAX_RANGE_DEFAULT_M = 600;
export const CHASE_CONE_HALF_ANGLE_DEFAULT_DEG = 35;
export const CHASE_TRACKING_ANGLE_DEFAULT_DEG = 20;
export const SLOT_RADIUS_DEFAULT_M = 40;

export interface SlotGeometry {
    npcX: number;
    npcY: number;
    npcZ: number;
    npcHeadingDeg: number;
    playerX: number;
    playerY: number;
    playerZ: number;
    playerHeadingDeg: number;
    playerForwardX: number;
    playerForwardY: number;
    playerForwardZ: number;
}

export interface SlotEvaluation {
    inSlot: boolean;
    rangeM: number;
    guideAheadM: number;
    guideRightM: number;
    guideUpM: number;
    slotX: number;
    slotY: number;
    slotZ: number;
}

function positiveOr(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function finiteOr(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function angleBetweenDeg(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    const la = Math.hypot(ax, ay, az);
    const lb = Math.hypot(bx, by, bz);
    if (la < EPSILON_M || lb < EPSILON_M) return 0;
    const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb)));
    return Math.acos(cos) * RAD_TO_DEG;
}

export function evaluateHoldSlot(slot: ScenarioHoldSlotConfig, g: SlotGeometry): SlotEvaluation | null {
    const values = [g.npcX, g.npcY, g.npcZ, g.npcHeadingDeg, g.playerX, g.playerY, g.playerZ, g.playerHeadingDeg, g.playerForwardX, g.playerForwardY, g.playerForwardZ];
    if (!slot || values.some((v) => !Number.isFinite(v))) return null;
    const npcHeadingRad = g.npcHeadingDeg * DEG_TO_RAD;
    const npcForwardX = Math.sin(npcHeadingRad);
    const npcForwardZ = -Math.cos(npcHeadingRad);
    const npcRightX = Math.cos(npcHeadingRad);
    const npcRightZ = Math.sin(npcHeadingRad);
    const toPlayerX = g.playerX - g.npcX;
    const toPlayerY = g.playerY - g.npcY;
    const toPlayerZ = g.playerZ - g.npcZ;
    const rangeM = Math.hypot(toPlayerX, toPlayerY, toPlayerZ);

    let slotX: number;
    let slotY: number;
    let slotZ: number;
    let inSlot: boolean;
    if (slot.mode === HOLD_SLOT_MODE_CHASE) {
        const minRange = positiveOr(slot.minRangeM, CHASE_MIN_RANGE_DEFAULT_M);
        const maxRange = Math.max(minRange, positiveOr(slot.maxRangeM, CHASE_MAX_RANGE_DEFAULT_M));
        const coneHalf = positiveOr(slot.coneHalfAngleDeg, CHASE_CONE_HALF_ANGLE_DEFAULT_DEG);
        const tracking = positiveOr(slot.trackingAngleDeg, CHASE_TRACKING_ANGLE_DEFAULT_DEG);
        const behindAngle = angleBetweenDeg(toPlayerX, toPlayerY, toPlayerZ, -npcForwardX, 0, -npcForwardZ);
        const noseAngle = angleBetweenDeg(g.playerForwardX, g.playerForwardY, g.playerForwardZ, -toPlayerX, -toPlayerY, -toPlayerZ);
        inSlot = rangeM >= minRange && rangeM <= maxRange && behindAngle <= coneHalf && noseAngle <= tracking;
        const midRange = (minRange + maxRange) / 2;
        slotX = g.npcX - npcForwardX * midRange;
        slotY = g.npcY;
        slotZ = g.npcZ - npcForwardZ * midRange;
    } else {
        const offsetRight = finiteOr(slot.offsetRightM, 0);
        const offsetUp = finiteOr(slot.offsetUpM, 0);
        const offsetBack = finiteOr(slot.offsetBackM, 0);
        const radius = positiveOr(slot.radiusM, SLOT_RADIUS_DEFAULT_M);
        slotX = g.npcX + npcRightX * offsetRight - npcForwardX * offsetBack;
        slotY = g.npcY + offsetUp;
        slotZ = g.npcZ + npcRightZ * offsetRight - npcForwardZ * offsetBack;
        inSlot = Math.hypot(g.playerX - slotX, g.playerY - slotY, g.playerZ - slotZ) <= radius;
    }

    const playerHeadingRad = g.playerHeadingDeg * DEG_TO_RAD;
    const playerForwardX = Math.sin(playerHeadingRad);
    const playerForwardZ = -Math.cos(playerHeadingRad);
    const playerRightX = Math.cos(playerHeadingRad);
    const playerRightZ = Math.sin(playerHeadingRad);
    const toSlotX = slotX - g.playerX;
    const toSlotZ = slotZ - g.playerZ;
    return {
        inSlot,
        rangeM,
        guideAheadM: toSlotX * playerForwardX + toSlotZ * playerForwardZ,
        guideRightM: toSlotX * playerRightX + toSlotZ * playerRightZ,
        guideUpM: slotY - g.playerY,
        slotX,
        slotY,
        slotZ,
    };
}
