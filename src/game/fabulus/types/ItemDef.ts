import type { ItemModifier } from './ItemModifier.js';
import type { RolledAffix } from './AffixDef.js';

export interface ItemDef {
    id: number;
    name: string;
    description: string;
    item_type: number;
    main_stat: number | null;
    model_path: string | null;
    icon_path: string | null;
    rarity_id: number;
    required_level: number;
    damage_min: number | null;
    damage_max: number | null;
    attack_speed: number | null;
    armor: number | null;
    anim_attack_override: string | null;
    sell_value: number | null;
    restore_health: number | null;
    restore_mana: number | null;
    use_cooldown_ms: number | null;
    max_stack: number | null;
    modifiers: ItemModifier[];
}

export interface RarityDef {
    id: number;
    name: string;
    color_hex: string;
    max_modifiers: number;
    stat_multiplier: number;
    drop_weight: number;
}

export interface PlayerItem {
    id: number;
    player_id: number;
    item_id: number;
    is_equipped: number;
    slot: number | null;
    quantity: number;
    affixes: RolledAffix[] | null;
}
