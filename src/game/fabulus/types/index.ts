export * from './ClassDef.js';
export * from './PlayerState.js';
export * from './EnemyDef.js';
export * from './EnemyInstance.js';
export * from './ItemDef.js';
export * from './ItemModifier.js';
export * from './SkillDef.js';
export * from './PlayerSkill.js';
export * from './LootTableEntry.js';
export * from './GroundDrop.js';
export * from './AffixDef.js';
export * from './NpcDef.js';
export * from './MapPropDef.js';

export interface Aabb {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export const ITEM_TYPE = {
    WEAPON: 1,
    HELMET: 2,
    CHEST: 3,
    BOOTS: 4,
    RING: 5,
    AMULET: 6,
    OFFHAND: 7,
    CONSUMABLE: 8,
} as const;

export const ATTRIBUTE_TYPE = {
    STRENGTH: 1,
    DEXTERITY: 2,
    INTELLIGENCE: 3,
    VITALITY: 4,
    MAX_HEALTH: 5,
    MAX_MANA: 6,
    ARMOR: 7,
    DAMAGE_PCT: 8,
    MOVE_SPEED_PCT: 9,
    CRIT_CHANCE_PCT: 10,
    CRIT_DAMAGE_PCT: 11,
    ATTACK_SPEED_PCT: 12,
    HP_REGEN: 13,
    MANA_REGEN: 14,
} as const;

export const VALUE_TYPE = {
    FLAT: 1,
    PERCENT: 2,
} as const;

export const SKILL_TYPE = {
    MELEE_STRIKE: 1,
    PROJECTILE: 2,
    AOE: 3,
    BUFF: 4,
    HEAL: 5,
} as const;

export const LOOT_TYPE = {
    GOLD: 1,
    ITEM: 2,
} as const;

export const RARITY = {
    COMMON: 1,
    MAGIC: 2,
    RARE: 3,
    EPIC: 4,
    LEGENDARY: 5,
} as const;

export const ATTRIBUTE_LABEL: Record<number, string> = {
    1: 'Strength',
    2: 'Dexterity',
    3: 'Intelligence',
    4: 'Vitality',
    5: 'Max Health',
    6: 'Max Mana',
    7: 'Armor',
    8: 'Damage %',
    9: 'Move Speed %',
    10: 'Crit Chance %',
    11: 'Crit Damage %',
    12: 'Attack Speed %',
    13: 'HP Regen',
    14: 'Mana Regen',
};

export const ITEM_TYPE_LABEL: Record<number, string> = {
    1: 'Weapon',
    2: 'Helmet',
    3: 'Chest',
    4: 'Boots',
    5: 'Ring',
    6: 'Amulet',
    7: 'Offhand',
    8: 'Consumable',
};
