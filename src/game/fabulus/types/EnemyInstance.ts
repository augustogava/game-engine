import type { EnemyDef } from './EnemyDef.js';

export const ENEMY_STATE = {
    IDLE: 1,
    CHASE: 2,
    ATTACK: 3,
    RETURN: 4,
    DEAD: 5,
} as const;

export interface EnemyInstance {
    instanceId: number;
    def: EnemyDef;
    level: number;
    root: any;
    meshes: any[];
    anims: Record<string, any | null>;
    currentAnim: any | null;
    state: number;
    hp: number;
    maxHp: number;
    damageMin: number;
    damageMax: number;
    lastAttackAt: number;
    staggeredUntil: number;
    spawnPos: { x: number; z: number };
    wanderTarget: { x: number; z: number } | null;
    nextWanderAt: number;
    respawnAt: number;
    lungeStartedAt: number;
    hpBarPlane: any | null;
    hpBarTexture: any | null;
    colliderRadius: number;
    deathStartedAt: number;
    slowPct: number;
    slowUntil: number;
    isElite: boolean;
    xpMult: number;
    lootRollsBonus: number;
}
