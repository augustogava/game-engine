export const AFFIX_TYPE = {
    PREFIX: 1,
    SUFFIX: 2,
} as const;

export interface AffixDef {
    id: number;
    name: string;
    affix_type: number;
    attribute_type: number;
    value_type: number;
    min_roll: number;
    max_roll: number;
    min_rarity: number;
    weight: number;
}

export interface RolledAffix {
    affix_id: number;
    name: string;
    affix_type: number;
    attribute_type: number;
    value_type: number;
    value: number;
}
