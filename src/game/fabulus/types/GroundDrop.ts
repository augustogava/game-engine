import type { ItemDef } from './ItemDef.js';

export const DROP_KIND = {
    GOLD: 1,
    ITEM: 2,
} as const;

export interface GroundDrop {
    kind: number;
    amount: number;
    itemDef: ItemDef | null;
    root: any;
    beam: any | null;
    label: any | null;
    velocity: { x: number; y: number; z: number };
    bounces: number;
    resting: boolean;
    restY: number;
    spawnedAt: number;
    expiresAt: number;
}
