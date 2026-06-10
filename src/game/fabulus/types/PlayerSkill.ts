export interface PlayerSkill {
    skill_id: number;
    rank: number;
    bar_slot: number | null;
}

export interface ActiveBuff {
    skillId: number;
    name: string;
    iconKey: string;
    effects: { attribute_type: number; value: number; value_type: number }[];
    expiresAt: number;
}
