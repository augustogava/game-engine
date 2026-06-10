import type { ItemModifier } from './ItemModifier.js';

export interface SkillDef {
    id: number;
    class_id: number;
    name: string;
    description: string;
    icon_key: string;
    skill_type: number;
    unlock_level: number;
    mana_cost: number;
    cooldown_ms: number;
    damage_coeff: number;
    damage_coeff_per_rank: number;
    max_rank: number;
    range: number;
    radius: number | null;
    duration_ms: number | null;
    projectile_speed: number | null;
    anim_override: string | null;
    vfx_key: string;
    effects: ItemModifier[];
}
