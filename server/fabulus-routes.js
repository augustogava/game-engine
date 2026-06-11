/**
 * Fabulus RPG backend routes (/api/fabulus/*).
 * DB mode (default): serves from MySQL (DATABASE_RPG_URL pool injected via setDbPool()).
 * Mock mode (FABULUS_USE_MOCK=true): serves in-memory data shaped exactly like
 * the rpg_* tables (see db/fabulus_schema.sql).
 */
const USE_MOCK = process.env.FABULUS_USE_MOCK === 'true';

const API_PREFIX = '/api/fabulus';
const MAX_BODY_BYTES = 64 * 1024;

let dbPool = null;

function setDbPool(pool) {
    dbPool = pool;
}

// ── Mock data (mirrors db/fabulus_seed.sql) ─────────────────────────────────

const XP_CURVE_BASE = 100;
const XP_CURVE_EXPONENT = 1.5;
const MAX_LEVEL_ROWS = 50;

const mockClasses = [
    {
        id: 1, name: 'Knight', description: 'A heavily armored melee fighter. Strength fuels his blade.',
        model_path: 'classes/Meshy_AI_Emerald_Knight_of_the_biped_Meshy_AI_Meshy_Merged_Animations.glb', icon_path: 'models/rpg/icons/classes/knight.png',
        max_level: 50, starting_gold: 100, main_stat: 1,
        base_health: 120, base_mana: 40, base_strength: 12, base_dexterity: 8, base_intelligence: 5, base_vitality: 10,
        health_per_level: 12, mana_per_level: 4, health_regen: 0.8, mana_regen: 0.8, attribute_points_per_level: 3, skill_points_per_level: 1,
        walk_speed: 2.4, run_speed: 5.0,
        anim_idle: 'Idle_02', anim_walk: 'Walking', anim_run: 'Running', anim_attack: 'Attack', anim_hit: null, anim_death: null,
    },
    {
        id: 2, name: 'Wizard', description: 'A master of the arcane. Intelligence empowers every spell.',
        model_path: 'classes/Meshy_AI_Frostbound_Sage_biped_Meshy_AI_Meshy_Merged_Animations.glb', icon_path: 'models/rpg/icons/classes/wizard.png',
        max_level: 50, starting_gold: 100, main_stat: 3,
        base_health: 80, base_mana: 90, base_strength: 5, base_dexterity: 9, base_intelligence: 14, base_vitality: 7,
        health_per_level: 8, mana_per_level: 9, health_regen: 0.4, mana_regen: 1.6, attribute_points_per_level: 3, skill_points_per_level: 1,
        walk_speed: 2.4, run_speed: 4.8,
        anim_idle: 'Idle_12', anim_walk: 'Walking', anim_run: 'Running', anim_attack: 'Attack', anim_hit: null, anim_death: null,
    },
];

const ELITE_DEFAULTS = {
    elite_chance: 8, elite_hp_mult: 2.5, elite_dmg_mult: 1.5, elite_xp_mult: 3, elite_loot_rolls: 1,
};

const mockEnemies = [
    {
        id: 1, name: 'Goblin', model_path: 'enemies/goblin_Merged_Animations.glb', level: 1,
        max_health: 40, damage_min: 3, damage_max: 6, armor: 5,
        walk_speed: 1.6, run_speed: 3.4, aggro_range: 9, attack_range: 1.6, leash_range: 18,
        attack_cooldown_ms: 1600, experience_reward: 28, gold_min: 2, gold_max: 6,
        health_scale_pct: 18, damage_scale_pct: 12, ...ELITE_DEFAULTS,
        anim_idle: null, anim_walk: 'Walking', anim_run: 'Running', anim_attack: null, anim_hit: null, anim_death: null,
    },
    {
        id: 2, name: 'Goblin Brute', model_path: 'enemies/goblin_Merged_Animations.glb', level: 3,
        max_health: 90, damage_min: 6, damage_max: 11, armor: 9,
        walk_speed: 1.3, run_speed: 2.8, aggro_range: 8, attack_range: 1.8, leash_range: 18,
        attack_cooldown_ms: 2000, experience_reward: 70, gold_min: 5, gold_max: 12,
        health_scale_pct: 20, damage_scale_pct: 14, ...ELITE_DEFAULTS,
        anim_idle: null, anim_walk: 'Walking', anim_run: 'Running', anim_attack: null, anim_hit: null, anim_death: null,
    },
    {
        id: 3, name: 'Goblin Shaman', model_path: 'enemies/goblin_Merged_Animations.glb', level: 2,
        max_health: 30, damage_min: 5, damage_max: 9, armor: 2,
        walk_speed: 1.5, run_speed: 3.0, aggro_range: 11, attack_range: 1.6, leash_range: 20,
        attack_cooldown_ms: 1900, experience_reward: 48, gold_min: 3, gold_max: 9,
        health_scale_pct: 16, damage_scale_pct: 12, ...ELITE_DEFAULTS,
        anim_idle: null, anim_walk: 'Walking', anim_run: 'Running', anim_attack: null, anim_hit: null, anim_death: null,
    },
    {
        id: 4, name: 'Rotwalker', model_path: 'enemies/Meshy_AI_Rotwalker_biped_Meshy_AI_Meshy_Merged_Animations.glb', level: 4,
        max_health: 110, damage_min: 8, damage_max: 14, armor: 12,
        walk_speed: 1.4, run_speed: 3.0, aggro_range: 10, attack_range: 1.8, leash_range: 20,
        attack_cooldown_ms: 2100, experience_reward: 95, gold_min: 6, gold_max: 14,
        health_scale_pct: 20, damage_scale_pct: 14, ...ELITE_DEFAULTS,
        anim_idle: 'Idle_02', anim_walk: 'Walking', anim_run: 'Running', anim_attack: 'Attack', anim_hit: null, anim_death: null,
    },
];

const mockRarities = [
    { id: 1, name: 'Common', color_hex: '#c8c2b4', max_modifiers: 1, stat_multiplier: 1.0, drop_weight: 100 },
    { id: 2, name: 'Magic', color_hex: '#5e8fd9', max_modifiers: 2, stat_multiplier: 1.1, drop_weight: 40 },
    { id: 3, name: 'Rare', color_hex: '#e3c54e', max_modifiers: 3, stat_multiplier: 1.2, drop_weight: 15 },
    { id: 4, name: 'Epic', color_hex: '#9b59d0', max_modifiers: 4, stat_multiplier: 1.3, drop_weight: 5 },
    { id: 5, name: 'Legendary', color_hex: '#e08a2e', max_modifiers: 5, stat_multiplier: 1.4, drop_weight: 1 },
];

const ITEM_DEFAULTS = {
    sell_value: null, restore_health: null, restore_mana: null, use_cooldown_ms: null, max_stack: null,
};

const mockItems = [
    {
        id: 1, name: 'Rusty Sword', description: 'A worn blade that has seen better days.',
        item_type: 1, main_stat: 1, model_path: null, icon_path: 'models/rpg/icons/items/rusty-sword.png',
        rarity_id: 1, required_level: 1,
        damage_min: 4, damage_max: 7, attack_speed: 1.0, armor: null, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 5,
        modifiers: [],
    },
    {
        id: 2, name: 'Iron Helmet', description: 'Solid iron protection for the head.',
        item_type: 2, main_stat: null, model_path: null, icon_path: 'models/rpg/icons/items/iron-helmet.png',
        rarity_id: 1, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: 3, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 8,
        modifiers: [{ attribute_type: 4, value: 2, value_type: 1 }],
    },
    {
        id: 3, name: 'Leather Boots', description: 'Light boots favored by scouts.',
        item_type: 4, main_stat: 2, model_path: null, icon_path: 'models/rpg/icons/items/leather-boots.png',
        rarity_id: 2, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: 2, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 12,
        modifiers: [{ attribute_type: 9, value: 8, value_type: 1 }],
    },
    {
        id: 4, name: 'Apprentice Ring', description: 'A simple band humming with arcane energy.',
        item_type: 5, main_stat: 3, model_path: null, icon_path: 'models/rpg/icons/items/apprentice-ring.png',
        rarity_id: 2, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: null, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 15,
        modifiers: [
            { attribute_type: 3, value: 3, value_type: 1 },
            { attribute_type: 6, value: 10, value_type: 1 },
        ],
    },
    {
        id: 5, name: 'Padded Tunic', description: 'A quilted tunic offering modest protection.',
        item_type: 3, main_stat: null, model_path: null, icon_path: 'models/rpg/icons/items/padded-tunic.png',
        rarity_id: 1, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: 4, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 10,
        modifiers: [{ attribute_type: 4, value: 3, value_type: 1 }],
    },
    {
        id: 6, name: "Knight's Cuirass", description: 'Forged steel chest plate of the royal guard.',
        item_type: 3, main_stat: 1, model_path: null, icon_path: 'models/rpg/icons/items/knights-cuirass.png',
        rarity_id: 3, required_level: 4,
        damage_min: null, damage_max: null, attack_speed: null, armor: 8, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 40,
        modifiers: [
            { attribute_type: 1, value: 5, value_type: 1 },
            { attribute_type: 5, value: 20, value_type: 1 },
        ],
    },
    {
        id: 7, name: 'Bone Amulet', description: 'A carved talisman thrumming with spirit energy.',
        item_type: 6, main_stat: 3, model_path: null, icon_path: 'models/rpg/icons/items/bone-amulet.png',
        rarity_id: 2, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: null, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 18,
        modifiers: [
            { attribute_type: 6, value: 12, value_type: 1 },
            { attribute_type: 3, value: 2, value_type: 1 },
        ],
    },
    {
        id: 8, name: 'Talisman of Vigor', description: 'An ancient charm that quickens the blood.',
        item_type: 6, main_stat: 4, model_path: null, icon_path: 'models/rpg/icons/items/talisman-of-vigor.png',
        rarity_id: 3, required_level: 5,
        damage_min: null, damage_max: null, attack_speed: null, armor: null, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 45,
        modifiers: [
            { attribute_type: 5, value: 30, value_type: 1 },
            { attribute_type: 13, value: 1.5, value_type: 1 },
        ],
    },
    {
        id: 9, name: 'Wooden Buckler', description: 'A small round shield of hardened oak.',
        item_type: 7, main_stat: null, model_path: null, icon_path: 'models/rpg/icons/items/wooden-buckler.png',
        rarity_id: 1, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: 5, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 8,
        modifiers: [],
    },
    {
        id: 10, name: 'Runed Shield', description: 'Etched with wards that turn aside steel and spell.',
        item_type: 7, main_stat: 4, model_path: null, icon_path: 'models/rpg/icons/items/runed-shield.png',
        rarity_id: 3, required_level: 4,
        damage_min: null, damage_max: null, attack_speed: null, armor: 10, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 42,
        modifiers: [{ attribute_type: 4, value: 4, value_type: 1 }],
    },
    {
        id: 11, name: 'Minor Health Potion', description: 'A small vial of crimson liquid. Restores health.',
        item_type: 8, main_stat: null, model_path: null, icon_path: 'models/rpg/icons/items/minor-health-potion.png',
        rarity_id: 1, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: null, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 3, restore_health: 50, use_cooldown_ms: 5000, max_stack: 10,
        modifiers: [],
    },
    {
        id: 12, name: 'Greater Health Potion', description: 'A hearty draught that mends deep wounds.',
        item_type: 8, main_stat: null, model_path: null, icon_path: 'models/rpg/icons/items/greater-health-potion.png',
        rarity_id: 2, required_level: 3,
        damage_min: null, damage_max: null, attack_speed: null, armor: null, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 10, restore_health: 150, use_cooldown_ms: 5000, max_stack: 10,
        modifiers: [],
    },
    {
        id: 13, name: 'Minor Mana Potion', description: 'Azure essence that replenishes arcane reserves.',
        item_type: 8, main_stat: null, model_path: null, icon_path: 'models/rpg/icons/items/minor-mana-potion.png',
        rarity_id: 1, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: null, anim_attack_override: null,
        ...ITEM_DEFAULTS, sell_value: 3, restore_mana: 40, use_cooldown_ms: 5000, max_stack: 10,
        modifiers: [],
    },
];

const mockAffixes = [
    { id: 1, name: 'Sharp', affix_type: 1, attribute_type: 8, value_type: 2, min_roll: 4, max_roll: 8, min_rarity: 1, weight: 100 },
    { id: 2, name: "Bear's", affix_type: 1, attribute_type: 1, value_type: 1, min_roll: 2, max_roll: 5, min_rarity: 1, weight: 80 },
    { id: 3, name: "Hawk's", affix_type: 1, attribute_type: 2, value_type: 1, min_roll: 2, max_roll: 5, min_rarity: 1, weight: 80 },
    { id: 4, name: "Sage's", affix_type: 1, attribute_type: 3, value_type: 1, min_roll: 2, max_roll: 5, min_rarity: 1, weight: 80 },
    { id: 5, name: 'Stalwart', affix_type: 1, attribute_type: 4, value_type: 1, min_roll: 2, max_roll: 5, min_rarity: 1, weight: 80 },
    { id: 6, name: 'Keen', affix_type: 1, attribute_type: 10, value_type: 1, min_roll: 2, max_roll: 4, min_rarity: 2, weight: 40 },
    { id: 7, name: 'of Haste', affix_type: 2, attribute_type: 12, value_type: 2, min_roll: 4, max_roll: 8, min_rarity: 2, weight: 50 },
    { id: 8, name: 'of the Wind', affix_type: 2, attribute_type: 9, value_type: 1, min_roll: 4, max_roll: 8, min_rarity: 1, weight: 70 },
    { id: 9, name: 'of Blood', affix_type: 2, attribute_type: 5, value_type: 1, min_roll: 10, max_roll: 25, min_rarity: 1, weight: 90 },
    { id: 10, name: 'of Spirit', affix_type: 2, attribute_type: 6, value_type: 1, min_roll: 10, max_roll: 25, min_rarity: 1, weight: 90 },
    { id: 11, name: 'of Renewal', affix_type: 2, attribute_type: 13, value_type: 1, min_roll: 1, max_roll: 2, min_rarity: 2, weight: 40 },
    { id: 12, name: 'of Ruin', affix_type: 2, attribute_type: 11, value_type: 1, min_roll: 10, max_roll: 20, min_rarity: 3, weight: 25 },
];

const mockSkills = [
    {
        id: 1, class_id: 1, name: 'Power Strike', description: 'A mighty blow dealing heavy weapon damage.',
        icon_key: 'power-strike', icon_path: 'models/rpg/icons/skills/power-strike.png', skill_type: 1, unlock_level: 1, mana_cost: 6, cooldown_ms: 3000,
        damage_coeff: 150, damage_coeff_per_rank: 20, max_rank: 5, range: 2.4, radius: null,
        duration_ms: null, projectile_speed: null, anim_override: null, vfx_key: 'strike', vfx_element: 'physical', effects: [],
    },
    {
        id: 2, class_id: 1, name: 'Shield Bash', description: 'Bash the enemy, dealing damage and staggering it briefly.',
        icon_key: 'shield-bash', icon_path: 'models/rpg/icons/skills/shield-bash.png', skill_type: 1, unlock_level: 2, mana_cost: 8, cooldown_ms: 5000,
        damage_coeff: 120, damage_coeff_per_rank: 15, max_rank: 5, range: 2.2, radius: null,
        duration_ms: 1000, projectile_speed: null, anim_override: null, vfx_key: 'bash', vfx_element: 'physical', effects: [],
    },
    {
        id: 3, class_id: 1, name: 'Whirlwind', description: 'Spin in place, striking all enemies around you.',
        icon_key: 'whirlwind', icon_path: 'models/rpg/icons/skills/whirlwind.png', skill_type: 3, unlock_level: 4, mana_cost: 14, cooldown_ms: 7000,
        damage_coeff: 100, damage_coeff_per_rank: 12, max_rank: 5, range: 0, radius: 3.2,
        duration_ms: null, projectile_speed: null, anim_override: null, vfx_key: 'whirl', vfx_element: 'physical', effects: [],
    },
    {
        id: 4, class_id: 1, name: 'Battle Shout', description: 'A war cry that increases your damage for a short time.',
        icon_key: 'battle-shout', icon_path: 'models/rpg/icons/skills/battle-shout.png', skill_type: 4, unlock_level: 6, mana_cost: 12, cooldown_ms: 16000,
        damage_coeff: 0, damage_coeff_per_rank: 0, max_rank: 5, range: 0, radius: null,
        duration_ms: 10000, projectile_speed: null, anim_override: null, vfx_key: 'shout', vfx_element: 'physical',
        effects: [{ attribute_type: 8, value: 20, value_type: 2 }],
    },
    {
        id: 5, class_id: 1, name: 'Second Wind', description: 'Recover a portion of your maximum health.',
        icon_key: 'second-wind', icon_path: 'models/rpg/icons/skills/second-wind.png', skill_type: 5, unlock_level: 8, mana_cost: 18, cooldown_ms: 20000,
        damage_coeff: 25, damage_coeff_per_rank: 5, max_rank: 5, range: 0, radius: null,
        duration_ms: null, projectile_speed: null, anim_override: null, vfx_key: 'heal', vfx_element: 'holy', effects: [],
    },
    {
        id: 6, class_id: 2, name: 'Fire Bolt', description: 'Hurl a bolt of fire at your target.',
        icon_key: 'fire-bolt', icon_path: 'models/rpg/icons/skills/fire-bolt.png', skill_type: 2, unlock_level: 1, mana_cost: 7, cooldown_ms: 2500,
        damage_coeff: 130, damage_coeff_per_rank: 18, max_rank: 5, range: 16, radius: null,
        duration_ms: null, projectile_speed: 14, anim_override: null, vfx_key: 'fire', vfx_element: 'fire', effects: [],
    },
    {
        id: 7, class_id: 2, name: 'Frost Nova', description: 'A burst of frost damaging everything nearby.',
        icon_key: 'frost-nova', icon_path: 'models/rpg/icons/skills/frost-nova.png', skill_type: 3, unlock_level: 2, mana_cost: 13, cooldown_ms: 8000,
        damage_coeff: 80, damage_coeff_per_rank: 10, max_rank: 5, range: 0, radius: 3.5,
        duration_ms: null, projectile_speed: null, anim_override: null, vfx_key: 'frost', vfx_element: 'ice', effects: [],
    },
    {
        id: 8, class_id: 2, name: 'Arcane Orb', description: 'A slow but devastating sphere of arcane power.',
        icon_key: 'arcane-orb', icon_path: 'models/rpg/icons/skills/arcane-orb.png', skill_type: 2, unlock_level: 4, mana_cost: 16, cooldown_ms: 6000,
        damage_coeff: 180, damage_coeff_per_rank: 22, max_rank: 5, range: 16, radius: null,
        duration_ms: null, projectile_speed: 8, anim_override: null, vfx_key: 'arcane', vfx_element: 'arcane', effects: [],
    },
    {
        id: 9, class_id: 2, name: 'Mage Armor', description: 'Arcane shielding hardens your defenses.',
        icon_key: 'mage-armor', icon_path: 'models/rpg/icons/skills/mage-armor.png', skill_type: 4, unlock_level: 6, mana_cost: 15, cooldown_ms: 18000,
        damage_coeff: 0, damage_coeff_per_rank: 0, max_rank: 5, range: 0, radius: null,
        duration_ms: 15000, projectile_speed: null, anim_override: null, vfx_key: 'ward', vfx_element: 'arcane',
        effects: [{ attribute_type: 7, value: 30, value_type: 1 }],
    },
    {
        id: 10, class_id: 2, name: 'Mend', description: 'Soothing magic restores your health.',
        icon_key: 'mend', icon_path: 'models/rpg/icons/skills/mend.png', skill_type: 5, unlock_level: 8, mana_cost: 20, cooldown_ms: 20000,
        damage_coeff: 30, damage_coeff_per_rank: 5, max_rank: 5, range: 0, radius: null,
        duration_ms: null, projectile_speed: null, anim_override: null, vfx_key: 'heal', vfx_element: 'holy', effects: [],
    },
];

const mockLootTables = [
    { id: 1, enemy_id: 1, loot_type: 1, drop_chance_pct: 80, gold_min: 2, gold_max: 6, item_id: null },
    { id: 2, enemy_id: 1, loot_type: 2, drop_chance_pct: 5, gold_min: null, gold_max: null, item_id: 3 },
    { id: 3, enemy_id: 1, loot_type: 2, drop_chance_pct: 3, gold_min: null, gold_max: null, item_id: 4 },
    { id: 4, enemy_id: 1, loot_type: 2, drop_chance_pct: 4, gold_min: null, gold_max: null, item_id: null },
    { id: 5, enemy_id: 2, loot_type: 1, drop_chance_pct: 90, gold_min: 5, gold_max: 12, item_id: null },
    { id: 6, enemy_id: 2, loot_type: 2, drop_chance_pct: 6, gold_min: null, gold_max: null, item_id: 2 },
    { id: 7, enemy_id: 2, loot_type: 2, drop_chance_pct: 6, gold_min: null, gold_max: null, item_id: null },
    { id: 8, enemy_id: 3, loot_type: 1, drop_chance_pct: 80, gold_min: 3, gold_max: 9, item_id: null },
    { id: 9, enemy_id: 3, loot_type: 2, drop_chance_pct: 6, gold_min: null, gold_max: null, item_id: 4 },
    { id: 10, enemy_id: 3, loot_type: 2, drop_chance_pct: 5, gold_min: null, gold_max: null, item_id: null },
    { id: 11, enemy_id: 1, loot_type: 2, drop_chance_pct: 10, gold_min: null, gold_max: null, item_id: 11 },
    { id: 12, enemy_id: 1, loot_type: 2, drop_chance_pct: 3, gold_min: null, gold_max: null, item_id: 9 },
    { id: 13, enemy_id: 2, loot_type: 2, drop_chance_pct: 3, gold_min: null, gold_max: null, item_id: 6 },
    { id: 14, enemy_id: 2, loot_type: 2, drop_chance_pct: 6, gold_min: null, gold_max: null, item_id: 12 },
    { id: 15, enemy_id: 2, loot_type: 2, drop_chance_pct: 5, gold_min: null, gold_max: null, item_id: 5 },
    { id: 16, enemy_id: 3, loot_type: 2, drop_chance_pct: 10, gold_min: null, gold_max: null, item_id: 13 },
    { id: 17, enemy_id: 3, loot_type: 2, drop_chance_pct: 4, gold_min: null, gold_max: null, item_id: 7 },
    { id: 18, enemy_id: 3, loot_type: 2, drop_chance_pct: 2, gold_min: null, gold_max: null, item_id: 8 },
    { id: 19, enemy_id: 2, loot_type: 2, drop_chance_pct: 2, gold_min: null, gold_max: null, item_id: 10 },
    { id: 20, enemy_id: 4, loot_type: 1, drop_chance_pct: 90, gold_min: 6, gold_max: 14, item_id: null },
    { id: 21, enemy_id: 4, loot_type: 2, drop_chance_pct: 8, gold_min: null, gold_max: null, item_id: 12 },
    { id: 22, enemy_id: 4, loot_type: 2, drop_chance_pct: 5, gold_min: null, gold_max: null, item_id: 6 },
    { id: 23, enemy_id: 4, loot_type: 2, drop_chance_pct: 3, gold_min: null, gold_max: null, item_id: 10 },
];

const mockLevels = (() => {
    const rows = [];
    for (let lvl = 1; lvl <= MAX_LEVEL_ROWS; lvl++) {
        rows.push({ level: lvl, experience_required: Math.floor(XP_CURVE_BASE * Math.pow(lvl, XP_CURVE_EXPONENT)) });
    }
    return rows;
})();

const ITEM_TYPE_CONSUMABLE = 8;

const mockState = {
    player: {
        id: 1, user_id: 0, class_id: 1, name: 'Fabulus',
        level: 1, experience: 0,
        strength: 12, dexterity: 8, intelligence: 5, vitality: 10,
        unspent_points: 0, skill_points: 0,
        current_health: 120, current_mana: 40,
        gold: 100, pos_x: 0, pos_z: 0,
    },
    playerItems: [
        { id: 1, player_id: 1, item_id: 1, is_equipped: 1, slot: 1, quantity: 1, affixes: null },
        { id: 2, player_id: 1, item_id: 2, is_equipped: 0, slot: null, quantity: 1, affixes: null },
    ],
    playerSkills: [
        { skill_id: 1, rank: 1, bar_slot: 1 },
    ],
    playerSettings: {},
    nextPlayerItemId: 3,
};

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function sendJson(res, status, data) {
    const payload = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('Body too large'));
                req.destroy();
                return;
            }
            body += chunk;
        });
        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

function sanitizeAffixes(raw) {
    if (!Array.isArray(raw)) return null;
    const out = [];
    for (const a of raw.slice(0, 4)) {
        const def = mockAffixes.find(x => x.id === Number(a.affix_id));
        if (!def) continue;
        const value = Number(a.value);
        if (!Number.isFinite(value)) continue;
        out.push({
            affix_id: def.id,
            name: def.name,
            affix_type: def.affix_type,
            attribute_type: def.attribute_type,
            value_type: def.value_type,
            value: Math.max(def.min_roll, Math.min(def.max_roll, value)),
        });
    }
    return out.length ? out : null;
}

// ── DB-backed implementation ─────────────────────────────────────────────────

let cachedPlayerId = null;

async function dbGetPlayerId() {
    if (cachedPlayerId != null) return cachedPlayerId;
    const [rows] = await dbPool.query('SELECT id FROM rpg_players ORDER BY id LIMIT 1');
    if (rows.length) {
        cachedPlayerId = rows[0].id;
        return cachedPlayerId;
    }
    const [classes] = await dbPool.query('SELECT * FROM rpg_classes ORDER BY id LIMIT 1');
    if (!classes.length) throw new Error('rpg_classes is empty - run db/fabulus_schema.sql + db/fabulus_seed.sql');
    const c = classes[0];
    const [ins] = await dbPool.query(
        `INSERT INTO rpg_players
            (user_id, class_id, name, level, experience, strength, dexterity, intelligence, vitality,
             unspent_points, skill_points, current_health, current_mana, gold, pos_x, pos_z)
         VALUES (UUID(), ?, 'Fabulus', 1, 0, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0, 0)`,
        [c.id, c.base_strength, c.base_dexterity, c.base_intelligence, c.base_vitality,
         c.base_health, c.base_mana, c.starting_gold]);
    cachedPlayerId = ins.insertId;
    return cachedPlayerId;
}

function parseAffixesColumn(value) {
    if (value == null) return null;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return null; }
    }
    return value;
}

function mapPlayerItemRow(row) {
    return {
        id: row.id, player_id: row.player_id, item_id: row.item_id,
        is_equipped: row.is_equipped, slot: row.slot,
        quantity: row.quantity, affixes: parseAffixesColumn(row.affixes),
    };
}

function parseJsonColumn(value) {
    if (value == null) return null;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return null; }
    }
    return value;
}

const MAX_MODEL_PATH_LENGTH = 255;

function sanitizeMapPropBody(body) {
    const numeric = {};
    for (const key of ['pos_x', 'pos_y', 'pos_z', 'rot_y', 'scale']) {
        if (body[key] !== undefined) {
            const value = Number(body[key]);
            if (!Number.isFinite(value)) return { error: `Invalid ${key}` };
            numeric[key] = value;
        }
    }
    if (numeric.scale !== undefined && numeric.scale <= 0) return { error: 'Invalid scale' };
    const out = { ...numeric };
    if (body.model_path !== undefined) {
        if (typeof body.model_path !== 'string' || !body.model_path || body.model_path.length > MAX_MODEL_PATH_LENGTH) {
            return { error: 'Invalid model_path' };
        }
        out.model_path = body.model_path;
    }
    if (body.collidable !== undefined) {
        out.collidable = body.collidable ? 1 : 0;
    }
    return { fields: out };
}

async function dbSanitizeAffixes(raw) {
    if (!Array.isArray(raw) || !raw.length) return null;
    const [defs] = await dbPool.query('SELECT * FROM rpg_affixes');
    const out = [];
    for (const a of raw.slice(0, 4)) {
        const def = defs.find(x => x.id === Number(a.affix_id));
        if (!def) continue;
        const value = Number(a.value);
        if (!Number.isFinite(value)) continue;
        out.push({
            affix_id: def.id,
            name: def.name,
            affix_type: def.affix_type,
            attribute_type: def.attribute_type,
            value_type: def.value_type,
            value: Math.max(def.min_roll, Math.min(def.max_roll, value)),
        });
    }
    return out.length ? out : null;
}

async function handleDbRoutes(req, res, route, method) {
    if (method === 'GET') {
        switch (route) {
            case '/classes': {
                const [rows] = await dbPool.query('SELECT * FROM rpg_classes ORDER BY id');
                sendJson(res, 200, rows);
                return true;
            }
            case '/player': {
                const playerId = await dbGetPlayerId();
                const [rows] = await dbPool.query('SELECT * FROM rpg_players WHERE id = ?', [playerId]);
                sendJson(res, 200, rows[0]);
                return true;
            }
            case '/enemies': {
                const [rows] = await dbPool.query('SELECT * FROM rpg_enemies ORDER BY id');
                sendJson(res, 200, rows);
                return true;
            }
            case '/items': {
                const [items] = await dbPool.query('SELECT * FROM rpg_items ORDER BY id');
                const [mods] = await dbPool.query('SELECT item_id, attribute_type, value, value_type FROM rpg_item_modifiers ORDER BY id');
                const byItem = new Map();
                for (const m of mods) {
                    if (!byItem.has(m.item_id)) byItem.set(m.item_id, []);
                    byItem.get(m.item_id).push({ attribute_type: m.attribute_type, value: m.value, value_type: m.value_type });
                }
                for (const item of items) item.modifiers = byItem.get(item.id) || [];
                sendJson(res, 200, items);
                return true;
            }
            case '/rarities': {
                const [rows] = await dbPool.query('SELECT * FROM rpg_rarities ORDER BY id');
                sendJson(res, 200, rows);
                return true;
            }
            case '/affixes': {
                const [rows] = await dbPool.query('SELECT * FROM rpg_affixes ORDER BY id');
                sendJson(res, 200, rows);
                return true;
            }
            case '/levels': {
                const [rows] = await dbPool.query('SELECT * FROM rpg_levels ORDER BY level');
                sendJson(res, 200, rows);
                return true;
            }
            case '/loot-tables': {
                const [rows] = await dbPool.query('SELECT * FROM rpg_loot_tables ORDER BY id');
                sendJson(res, 200, rows);
                return true;
            }
            case '/npcs': {
                const [rows] = await dbPool.query('SELECT * FROM rpg_npcs ORDER BY id');
                for (const row of rows) row.dialog = parseJsonColumn(row.dialog);
                sendJson(res, 200, rows);
                return true;
            }
            case '/map-props': {
                const [rows] = await dbPool.query('SELECT * FROM rpg_map_props ORDER BY id');
                sendJson(res, 200, rows);
                return true;
            }
            case '/player/items': {
                const playerId = await dbGetPlayerId();
                const [rows] = await dbPool.query('SELECT * FROM rpg_player_items WHERE player_id = ? ORDER BY id', [playerId]);
                sendJson(res, 200, rows.map(mapPlayerItemRow));
                return true;
            }
            case '/player/skills': {
                const playerId = await dbGetPlayerId();
                const [rows] = await dbPool.query('SELECT skill_id, `rank`, bar_slot FROM rpg_player_skills WHERE player_id = ? ORDER BY id', [playerId]);
                sendJson(res, 200, rows);
                return true;
            }
            case '/player/settings': {
                const playerId = await dbGetPlayerId();
                const [rows] = await dbPool.query('SELECT setting_key, setting_value FROM rpg_player_settings WHERE player_id = ?', [playerId]);
                const out = {};
                for (const row of rows) out[row.setting_key] = row.setting_value;
                sendJson(res, 200, out);
                return true;
            }
            case '/skills': {
                const query = new URL(req.url, 'http://localhost').searchParams;
                const classId = Number(query.get('class_id'));
                const where = Number.isFinite(classId) && classId > 0 ? 'WHERE class_id = ?' : '';
                const [skills] = await dbPool.query(`SELECT * FROM rpg_skills ${where} ORDER BY id`, where ? [classId] : []);
                const [effects] = await dbPool.query('SELECT skill_id, attribute_type, value, value_type FROM rpg_skill_effects ORDER BY id');
                const bySkill = new Map();
                for (const e of effects) {
                    if (!bySkill.has(e.skill_id)) bySkill.set(e.skill_id, []);
                    bySkill.get(e.skill_id).push({ attribute_type: e.attribute_type, value: e.value, value_type: e.value_type });
                }
                for (const s of skills) s.effects = bySkill.get(s.id) || [];
                sendJson(res, 200, skills);
                return true;
            }
        }
    }

    if (method === 'PUT' && route === '/player/settings') {
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            sendJson(res, 400, { error: 'Invalid settings payload' });
            return true;
        }
        const playerId = await dbGetPlayerId();
        let written = 0;
        for (const [key, value] of Object.entries(body)) {
            if (typeof key !== 'string' || key.length > 60) continue;
            const str = String(value);
            if (str.length > 255) continue;
            await dbPool.query(
                `INSERT INTO rpg_player_settings (player_id, setting_key, setting_value) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
                [playerId, key, str]);
            written++;
        }
        sendJson(res, 200, { ok: true, written });
        return true;
    }

    if (method === 'PUT' && route === '/player/state') {
        const body = await readBody(req);
        const allowed = ['level', 'experience', 'strength', 'dexterity', 'intelligence', 'vitality', 'current_health', 'current_mana', 'gold', 'unspent_points', 'skill_points', 'pos_x', 'pos_z'];
        const sets = [];
        const params = [];
        for (const key of allowed) {
            if (body[key] !== undefined && Number.isFinite(Number(body[key]))) {
                sets.push(`${key} = ?`);
                params.push(Number(body[key]));
            }
        }
        if (sets.length) {
            const playerId = await dbGetPlayerId();
            params.push(playerId);
            await dbPool.query(`UPDATE rpg_players SET ${sets.join(', ')} WHERE id = ?`, params);
        }
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (method === 'PUT' && route === '/player/class') {
        const body = await readBody(req);
        const classId = Number(body.class_id);
        const [classRows] = await dbPool.query('SELECT * FROM rpg_classes WHERE id = ?', [classId]);
        if (!classRows.length) {
            sendJson(res, 400, { error: 'Unknown class_id' });
            return true;
        }
        const c = classRows[0];
        const playerId = await dbGetPlayerId();
        await dbPool.query(
            `UPDATE rpg_players SET class_id = ?, level = 1, experience = 0,
                strength = ?, dexterity = ?, intelligence = ?, vitality = ?,
                unspent_points = 0, skill_points = 0,
                current_health = ?, current_mana = ?, gold = ?, pos_x = 0, pos_z = 0
             WHERE id = ?`,
            [classId, c.base_strength, c.base_dexterity, c.base_intelligence, c.base_vitality,
             c.base_health, c.base_mana, c.starting_gold, playerId]);
        await dbPool.query('DELETE FROM rpg_player_items WHERE player_id = ?', [playerId]);
        await dbPool.query(
            'INSERT INTO rpg_player_items (player_id, item_id, is_equipped, slot, quantity, affixes) VALUES (?, 1, 1, 1, 1, NULL), (?, 2, 0, NULL, 1, NULL)',
            [playerId, playerId]);
        await dbPool.query('DELETE FROM rpg_player_skills WHERE player_id = ?', [playerId]);
        const [firstSkills] = await dbPool.query(
            'SELECT id FROM rpg_skills WHERE class_id = ? AND unlock_level <= 1 ORDER BY id LIMIT 1', [classId]);
        if (firstSkills.length) {
            await dbPool.query(
                'INSERT INTO rpg_player_skills (player_id, skill_id, `rank`, bar_slot) VALUES (?, ?, 1, 1)',
                [playerId, firstSkills[0].id]);
        }
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (method === 'PUT' && route === '/player/attributes') {
        const body = await readBody(req);
        const attr = Number(body.attribute_type);
        const fieldByAttr = { 1: 'strength', 2: 'dexterity', 3: 'intelligence', 4: 'vitality' };
        const field = fieldByAttr[attr];
        if (!field) {
            sendJson(res, 400, { error: 'Invalid attribute_type' });
            return true;
        }
        const playerId = await dbGetPlayerId();
        const [result] = await dbPool.query(
            `UPDATE rpg_players SET ${field} = ${field} + 1, unspent_points = unspent_points - 1
             WHERE id = ? AND unspent_points > 0`, [playerId]);
        if (!result.affectedRows) {
            sendJson(res, 400, { error: 'No unspent points' });
            return true;
        }
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (method === 'POST' && route === '/player/items') {
        const body = await readBody(req);
        const itemId = Number(body.item_id);
        const [defRows] = await dbPool.query('SELECT * FROM rpg_items WHERE id = ?', [itemId]);
        if (!defRows.length) {
            sendJson(res, 400, { error: 'Unknown item_id' });
            return true;
        }
        const def = defRows[0];
        const playerId = await dbGetPlayerId();
        const affixes = await dbSanitizeAffixes(body.affixes);
        if (def.item_type === ITEM_TYPE_CONSUMABLE && !affixes) {
            const [stackRows] = await dbPool.query(
                `SELECT * FROM rpg_player_items
                 WHERE player_id = ? AND item_id = ? AND is_equipped = 0 AND affixes IS NULL
                   AND (? IS NULL OR quantity < ?)
                 ORDER BY id LIMIT 1`,
                [playerId, itemId, def.max_stack, def.max_stack]);
            if (stackRows.length) {
                await dbPool.query('UPDATE rpg_player_items SET quantity = quantity + 1 WHERE id = ?', [stackRows[0].id]);
                const [updated] = await dbPool.query('SELECT * FROM rpg_player_items WHERE id = ?', [stackRows[0].id]);
                sendJson(res, 200, mapPlayerItemRow(updated[0]));
                return true;
            }
        }
        const [ins] = await dbPool.query(
            'INSERT INTO rpg_player_items (player_id, item_id, is_equipped, slot, quantity, affixes) VALUES (?, ?, 0, NULL, 1, ?)',
            [playerId, itemId, affixes ? JSON.stringify(affixes) : null]);
        sendJson(res, 200, {
            id: ins.insertId, player_id: playerId, item_id: itemId,
            is_equipped: 0, slot: null, quantity: 1, affixes,
        });
        return true;
    }

    const deleteMatch = route.match(/^\/player\/items\/(\d+)$/);
    if (method === 'DELETE' && deleteMatch) {
        const playerId = await dbGetPlayerId();
        const [result] = await dbPool.query(
            'DELETE FROM rpg_player_items WHERE id = ? AND player_id = ?',
            [Number(deleteMatch[1]), playerId]);
        if (!result.affectedRows) {
            sendJson(res, 404, { error: 'Player item not found' });
            return true;
        }
        sendJson(res, 200, { ok: true });
        return true;
    }

    const sellMatch = route.match(/^\/player\/items\/(\d+)\/sell$/);
    if (method === 'POST' && sellMatch) {
        const playerItemId = Number(sellMatch[1]);
        const playerId = await dbGetPlayerId();
        const [rows] = await dbPool.query(
            `SELECT pi.*, i.sell_value, i.required_level, r.stat_multiplier
               FROM rpg_player_items pi
               JOIN rpg_items i ON i.id = pi.item_id
               JOIN rpg_rarities r ON r.id = i.rarity_id
              WHERE pi.id = ? AND pi.player_id = ?`,
            [playerItemId, playerId]);
        if (!rows.length) {
            sendJson(res, 404, { error: 'Player item not found' });
            return true;
        }
        const row = rows[0];
        // Fallback formula when sell_value is missing: 5 * rarity multiplier * required level.
        const unitValue = row.sell_value != null
            ? row.sell_value
            : Math.max(1, Math.round(5 * (row.stat_multiplier || 1) * (row.required_level || 1)));
        const total = unitValue * Math.max(1, row.quantity);
        const conn = await dbPool.getConnection();
        try {
            await conn.beginTransaction();
            const [del] = await conn.query('DELETE FROM rpg_player_items WHERE id = ? AND player_id = ?', [playerItemId, playerId]);
            if (!del.affectedRows) throw new Error('Player item vanished mid-sell');
            await conn.query('UPDATE rpg_players SET gold = gold + ? WHERE id = ?', [total, playerId]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
        const [goldRows] = await dbPool.query('SELECT gold FROM rpg_players WHERE id = ?', [playerId]);
        sendJson(res, 200, { gold: goldRows[0].gold, sold_value: total });
        return true;
    }

    const consumeMatch = route.match(/^\/player\/items\/(\d+)\/consume$/);
    if (method === 'POST' && consumeMatch) {
        const playerItemId = Number(consumeMatch[1]);
        const playerId = await dbGetPlayerId();
        const [rows] = await dbPool.query(
            `SELECT pi.*, i.item_type, i.restore_health, i.restore_mana
               FROM rpg_player_items pi JOIN rpg_items i ON i.id = pi.item_id
              WHERE pi.id = ? AND pi.player_id = ?`,
            [playerItemId, playerId]);
        if (!rows.length) {
            sendJson(res, 404, { error: 'Player item not found' });
            return true;
        }
        const row = rows[0];
        if (row.item_type !== ITEM_TYPE_CONSUMABLE) {
            sendJson(res, 400, { error: 'Item is not consumable' });
            return true;
        }
        const newQty = row.quantity - 1;
        if (newQty <= 0) {
            await dbPool.query('DELETE FROM rpg_player_items WHERE id = ?', [playerItemId]);
        } else {
            await dbPool.query('UPDATE rpg_player_items SET quantity = ? WHERE id = ?', [newQty, playerItemId]);
        }
        sendJson(res, 200, {
            quantity: Math.max(0, newQty),
            restore_health: row.restore_health || 0,
            restore_mana: row.restore_mana || 0,
        });
        return true;
    }

    const equipMatch = route.match(/^\/player\/items\/(\d+)\/(equip|unequip)$/);
    if (method === 'POST' && equipMatch) {
        const playerItemId = Number(equipMatch[1]);
        const equip = equipMatch[2] === 'equip';
        const body = await readBody(req);
        const playerId = await dbGetPlayerId();
        const [rows] = await dbPool.query(
            `SELECT pi.id, i.item_type, i.required_level, p.level AS player_level
               FROM rpg_player_items pi
               JOIN rpg_items i ON i.id = pi.item_id
               JOIN rpg_players p ON p.id = pi.player_id
              WHERE pi.id = ? AND pi.player_id = ?`,
            [playerItemId, playerId]);
        if (!rows.length) {
            sendJson(res, 404, { error: 'Player item not found' });
            return true;
        }
        const row = rows[0];
        if (equip) {
            if (row.required_level > row.player_level) {
                sendJson(res, 400, { error: 'Player level too low' });
                return true;
            }
            if (row.item_type === ITEM_TYPE_CONSUMABLE) {
                sendJson(res, 400, { error: 'Consumables cannot be equipped' });
                return true;
            }
        }
        const slot = equip && body.slot != null ? Number(body.slot) : null;
        await dbPool.query(
            'UPDATE rpg_player_items SET is_equipped = ?, slot = ? WHERE id = ?',
            [equip ? 1 : 0, slot, playerItemId]);
        sendJson(res, 200, { ok: true });
        return true;
    }

    const unlockMatch = route.match(/^\/player\/skills\/(\d+)\/unlock$/);
    if (method === 'POST' && unlockMatch) {
        const skillId = Number(unlockMatch[1]);
        const playerId = await dbGetPlayerId();
        const [skillRows] = await dbPool.query('SELECT * FROM rpg_skills WHERE id = ?', [skillId]);
        if (!skillRows.length) {
            sendJson(res, 400, { error: 'Unknown skill' });
            return true;
        }
        const def = skillRows[0];
        const [playerRows] = await dbPool.query('SELECT class_id, level FROM rpg_players WHERE id = ?', [playerId]);
        const player = playerRows[0];
        if (def.class_id !== player.class_id) {
            sendJson(res, 400, { error: 'Skill belongs to another class' });
            return true;
        }
        if (def.unlock_level > player.level) {
            sendJson(res, 400, { error: 'Player level too low' });
            return true;
        }
        await dbPool.query(
            'INSERT IGNORE INTO rpg_player_skills (player_id, skill_id, `rank`, bar_slot) VALUES (?, ?, 1, NULL)',
            [playerId, skillId]);
        sendJson(res, 200, { ok: true });
        return true;
    }

    const rankUpMatch = route.match(/^\/player\/skills\/(\d+)\/rank-up$/);
    if (method === 'PUT' && rankUpMatch) {
        const skillId = Number(rankUpMatch[1]);
        const playerId = await dbGetPlayerId();
        const [rows] = await dbPool.query(
            `SELECT ps.id, ps.\`rank\`, s.max_rank, p.skill_points
               FROM rpg_player_skills ps
               JOIN rpg_skills s ON s.id = ps.skill_id
               JOIN rpg_players p ON p.id = ps.player_id
              WHERE ps.player_id = ? AND ps.skill_id = ?`,
            [playerId, skillId]);
        if (!rows.length) {
            sendJson(res, 404, { error: 'Skill not unlocked' });
            return true;
        }
        const row = rows[0];
        if (row.skill_points <= 0 || row.rank >= row.max_rank) {
            sendJson(res, 400, { error: 'Cannot rank up' });
            return true;
        }
        const conn = await dbPool.getConnection();
        try {
            await conn.beginTransaction();
            const [upd] = await conn.query(
                'UPDATE rpg_players SET skill_points = skill_points - 1 WHERE id = ? AND skill_points > 0', [playerId]);
            if (!upd.affectedRows) throw new Error('No skill points');
            await conn.query('UPDATE rpg_player_skills SET `rank` = `rank` + 1 WHERE id = ?', [row.id]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            sendJson(res, 400, { error: 'Cannot rank up' });
            conn.release();
            return true;
        }
        conn.release();
        sendJson(res, 200, { ok: true });
        return true;
    }

    const slotMatch = route.match(/^\/player\/skills\/(\d+)\/slot$/);
    if (method === 'PUT' && slotMatch) {
        const skillId = Number(slotMatch[1]);
        const body = await readBody(req);
        const slot = body.slot == null ? null : Number(body.slot);
        const playerId = await dbGetPlayerId();
        const [rows] = await dbPool.query(
            'SELECT id FROM rpg_player_skills WHERE player_id = ? AND skill_id = ?', [playerId, skillId]);
        if (!rows.length) {
            sendJson(res, 404, { error: 'Skill not unlocked' });
            return true;
        }
        if (slot != null) {
            await dbPool.query(
                'UPDATE rpg_player_skills SET bar_slot = NULL WHERE player_id = ? AND bar_slot = ?',
                [playerId, slot]);
        }
        await dbPool.query('UPDATE rpg_player_skills SET bar_slot = ? WHERE id = ?', [slot, rows[0].id]);
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (method === 'POST' && route === '/map-props') {
        const body = await readBody(req);
        const { fields, error } = sanitizeMapPropBody(body);
        if (error || !fields.model_path) {
            sendJson(res, 400, { error: error || 'model_path is required' });
            return true;
        }
        const [ins] = await dbPool.query(
            'INSERT INTO rpg_map_props (model_path, pos_x, pos_y, pos_z, rot_y, scale, collidable) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [fields.model_path, fields.pos_x ?? 0, fields.pos_y ?? 0, fields.pos_z ?? 0,
             fields.rot_y ?? 0, fields.scale ?? 1, fields.collidable ?? 1]);
        const [rows] = await dbPool.query('SELECT * FROM rpg_map_props WHERE id = ?', [ins.insertId]);
        sendJson(res, 200, rows[0]);
        return true;
    }

    const mapPropMatch = route.match(/^\/map-props\/(\d+)$/);
    if (method === 'PUT' && mapPropMatch) {
        const propId = Number(mapPropMatch[1]);
        const body = await readBody(req);
        const { fields, error } = sanitizeMapPropBody(body);
        if (error) {
            sendJson(res, 400, { error });
            return true;
        }
        const entries = Object.entries(fields);
        if (!entries.length) {
            sendJson(res, 400, { error: 'No valid fields to update' });
            return true;
        }
        const sets = entries.map(([key]) => `${key} = ?`);
        const params = entries.map(([, value]) => value);
        params.push(propId);
        const [result] = await dbPool.query(`UPDATE rpg_map_props SET ${sets.join(', ')} WHERE id = ?`, params);
        if (!result.affectedRows) {
            sendJson(res, 404, { error: 'Map prop not found' });
            return true;
        }
        sendJson(res, 200, { ok: true });
        return true;
    }

    if (method === 'DELETE' && mapPropMatch) {
        const [result] = await dbPool.query('DELETE FROM rpg_map_props WHERE id = ?', [Number(mapPropMatch[1])]);
        if (!result.affectedRows) {
            sendJson(res, 404, { error: 'Map prop not found' });
            return true;
        }
        sendJson(res, 200, { ok: true });
        return true;
    }

    sendJson(res, 404, { error: 'Unknown Fabulus route' });
    return true;
}

// ── Route handler ────────────────────────────────────────────────────────────

/**
 * Returns true when the request was handled (matched /api/fabulus/*).
 */
async function handleFabulusRoutes(req, res) {
    const urlPath = req.url.split('?')[0];
    if (!urlPath.startsWith(API_PREFIX)) return false;
    const route = urlPath.substring(API_PREFIX.length) || '/';
    const method = req.method;

    if (!USE_MOCK && !dbPool) {
        sendJson(res, 503, { error: 'Database not available' });
        return true;
    }

    try {
        if (!USE_MOCK) {
            return await handleDbRoutes(req, res, route, method);
        }
        if (method === 'GET') {
            switch (route) {
                case '/classes': sendJson(res, 200, mockClasses); return true;
                case '/player': sendJson(res, 200, mockState.player); return true;
                case '/enemies': sendJson(res, 200, mockEnemies); return true;
                case '/items': sendJson(res, 200, mockItems); return true;
                case '/rarities': sendJson(res, 200, mockRarities); return true;
                case '/affixes': sendJson(res, 200, mockAffixes); return true;
                case '/levels': sendJson(res, 200, mockLevels); return true;
                case '/loot-tables': sendJson(res, 200, mockLootTables); return true;
                case '/player/items': sendJson(res, 200, mockState.playerItems); return true;
                case '/player/skills': sendJson(res, 200, mockState.playerSkills); return true;
                case '/player/settings': sendJson(res, 200, mockState.playerSettings); return true;
                case '/skills': {
                    const query = new URL(req.url, 'http://localhost').searchParams;
                    const classId = Number(query.get('class_id'));
                    const list = Number.isFinite(classId) && classId > 0
                        ? mockSkills.filter(s => s.class_id === classId)
                        : mockSkills;
                    sendJson(res, 200, list);
                    return true;
                }
            }
        }

        if (method === 'PUT' && route === '/player/settings') {
            const body = await readBody(req);
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                sendJson(res, 400, { error: 'Invalid settings payload' });
                return true;
            }
            let written = 0;
            for (const [key, value] of Object.entries(body)) {
                if (typeof key !== 'string' || key.length > 60) continue;
                const str = String(value);
                if (str.length > 255) continue;
                mockState.playerSettings[key] = str;
                written++;
            }
            sendJson(res, 200, { ok: true, written });
            return true;
        }

        if (method === 'PUT' && route === '/player/state') {
            const body = await readBody(req);
            const allowed = ['level', 'experience', 'strength', 'dexterity', 'intelligence', 'vitality', 'current_health', 'current_mana', 'gold', 'unspent_points', 'skill_points', 'pos_x', 'pos_z'];
            for (const key of allowed) {
                if (body[key] !== undefined && Number.isFinite(Number(body[key]))) {
                    mockState.player[key] = Number(body[key]);
                }
            }
            sendJson(res, 200, { ok: true });
            return true;
        }

        if (method === 'PUT' && route === '/player/class') {
            const body = await readBody(req);
            const classId = Number(body.class_id);
            const classDef = mockClasses.find(c => c.id === classId);
            if (!classDef) {
                sendJson(res, 400, { error: 'Unknown class_id' });
                return true;
            }
            const p = mockState.player;
            p.class_id = classId;
            p.level = 1;
            p.experience = 0;
            p.strength = classDef.base_strength;
            p.dexterity = classDef.base_dexterity;
            p.intelligence = classDef.base_intelligence;
            p.vitality = classDef.base_vitality;
            p.unspent_points = 0;
            p.skill_points = 0;
            p.current_health = classDef.base_health;
            p.current_mana = classDef.base_mana;
            p.gold = classDef.starting_gold;
            p.pos_x = 0;
            p.pos_z = 0;
            mockState.playerItems = [
                { id: 1, player_id: 1, item_id: 1, is_equipped: 1, slot: 1, quantity: 1, affixes: null },
                { id: 2, player_id: 1, item_id: 2, is_equipped: 0, slot: null, quantity: 1, affixes: null },
            ];
            mockState.nextPlayerItemId = 3;
            const firstSkill = mockSkills.find(s => s.class_id === classId && s.unlock_level <= 1);
            mockState.playerSkills = firstSkill ? [{ skill_id: firstSkill.id, rank: 1, bar_slot: 1 }] : [];
            sendJson(res, 200, { ok: true });
            return true;
        }

        if (method === 'PUT' && route === '/player/attributes') {
            const body = await readBody(req);
            const attr = Number(body.attribute_type);
            const p = mockState.player;
            if (p.unspent_points <= 0) {
                sendJson(res, 400, { error: 'No unspent points' });
                return true;
            }
            const fieldByAttr = { 1: 'strength', 2: 'dexterity', 3: 'intelligence', 4: 'vitality' };
            const field = fieldByAttr[attr];
            if (!field) {
                sendJson(res, 400, { error: 'Invalid attribute_type' });
                return true;
            }
            p[field] += 1;
            p.unspent_points -= 1;
            sendJson(res, 200, { ok: true });
            return true;
        }

        if (method === 'POST' && route === '/player/items') {
            const body = await readBody(req);
            const itemId = Number(body.item_id);
            const def = mockItems.find(i => i.id === itemId);
            if (!def) {
                sendJson(res, 400, { error: 'Unknown item_id' });
                return true;
            }
            const affixes = sanitizeAffixes(body.affixes);
            if (def.item_type === ITEM_TYPE_CONSUMABLE && !affixes) {
                const existing = mockState.playerItems.find(pi =>
                    pi.item_id === itemId && !pi.is_equipped && (!def.max_stack || pi.quantity < def.max_stack));
                if (existing) {
                    existing.quantity += 1;
                    sendJson(res, 200, existing);
                    return true;
                }
            }
            const row = {
                id: mockState.nextPlayerItemId++,
                player_id: mockState.player.id,
                item_id: itemId,
                is_equipped: 0,
                slot: null,
                quantity: 1,
                affixes,
            };
            mockState.playerItems.push(row);
            sendJson(res, 200, row);
            return true;
        }

        const deleteMatch = route.match(/^\/player\/items\/(\d+)$/);
        if (method === 'DELETE' && deleteMatch) {
            const playerItemId = Number(deleteMatch[1]);
            const idx = mockState.playerItems.findIndex(pi => pi.id === playerItemId);
            if (idx < 0) {
                sendJson(res, 404, { error: 'Player item not found' });
                return true;
            }
            mockState.playerItems.splice(idx, 1);
            sendJson(res, 200, { ok: true });
            return true;
        }

        const sellMatch = route.match(/^\/player\/items\/(\d+)\/sell$/);
        if (method === 'POST' && sellMatch) {
            const playerItemId = Number(sellMatch[1]);
            const idx = mockState.playerItems.findIndex(pi => pi.id === playerItemId);
            if (idx < 0) {
                sendJson(res, 404, { error: 'Player item not found' });
                return true;
            }
            const row = mockState.playerItems[idx];
            const def = mockItems.find(i => i.id === row.item_id);
            const rarity = def ? mockRarities.find(r => r.id === def.rarity_id) : null;
            // Fallback formula when sell_value is missing: 5 * rarity multiplier * required level.
            const unitValue = (def && def.sell_value != null)
                ? def.sell_value
                : Math.max(1, Math.round(5 * (rarity ? rarity.stat_multiplier : 1) * (def ? def.required_level : 1)));
            const total = unitValue * Math.max(1, row.quantity);
            mockState.playerItems.splice(idx, 1);
            mockState.player.gold += total;
            sendJson(res, 200, { gold: mockState.player.gold, sold_value: total });
            return true;
        }

        const consumeMatch = route.match(/^\/player\/items\/(\d+)\/consume$/);
        if (method === 'POST' && consumeMatch) {
            const playerItemId = Number(consumeMatch[1]);
            const row = mockState.playerItems.find(pi => pi.id === playerItemId);
            if (!row) {
                sendJson(res, 404, { error: 'Player item not found' });
                return true;
            }
            const def = mockItems.find(i => i.id === row.item_id);
            if (!def || def.item_type !== ITEM_TYPE_CONSUMABLE) {
                sendJson(res, 400, { error: 'Item is not consumable' });
                return true;
            }
            row.quantity -= 1;
            if (row.quantity <= 0) {
                mockState.playerItems.splice(mockState.playerItems.indexOf(row), 1);
            }
            sendJson(res, 200, {
                quantity: Math.max(0, row.quantity),
                restore_health: def.restore_health || 0,
                restore_mana: def.restore_mana || 0,
            });
            return true;
        }

        const equipMatch = route.match(/^\/player\/items\/(\d+)\/(equip|unequip)$/);
        if (method === 'POST' && equipMatch) {
            const playerItemId = Number(equipMatch[1]);
            const equip = equipMatch[2] === 'equip';
            const body = await readBody(req);
            const row = mockState.playerItems.find(pi => pi.id === playerItemId);
            if (!row) {
                sendJson(res, 404, { error: 'Player item not found' });
                return true;
            }
            if (equip) {
                const def = mockItems.find(i => i.id === row.item_id);
                if (def && def.required_level > mockState.player.level) {
                    sendJson(res, 400, { error: 'Player level too low' });
                    return true;
                }
                if (def && def.item_type === ITEM_TYPE_CONSUMABLE) {
                    sendJson(res, 400, { error: 'Consumables cannot be equipped' });
                    return true;
                }
            }
            row.is_equipped = equip ? 1 : 0;
            row.slot = equip && body.slot != null ? Number(body.slot) : null;
            sendJson(res, 200, { ok: true });
            return true;
        }

        const unlockMatch = route.match(/^\/player\/skills\/(\d+)\/unlock$/);
        if (method === 'POST' && unlockMatch) {
            const skillId = Number(unlockMatch[1]);
            const def = mockSkills.find(s => s.id === skillId);
            if (!def) {
                sendJson(res, 400, { error: 'Unknown skill' });
                return true;
            }
            if (def.class_id !== mockState.player.class_id) {
                sendJson(res, 400, { error: 'Skill belongs to another class' });
                return true;
            }
            if (def.unlock_level > mockState.player.level) {
                sendJson(res, 400, { error: 'Player level too low' });
                return true;
            }
            if (!mockState.playerSkills.some(ps => ps.skill_id === skillId)) {
                mockState.playerSkills.push({ skill_id: skillId, rank: 1, bar_slot: null });
            }
            sendJson(res, 200, { ok: true });
            return true;
        }

        const rankUpMatch = route.match(/^\/player\/skills\/(\d+)\/rank-up$/);
        if (method === 'PUT' && rankUpMatch) {
            const skillId = Number(rankUpMatch[1]);
            const ps = mockState.playerSkills.find(s => s.skill_id === skillId);
            const def = mockSkills.find(s => s.id === skillId);
            if (!ps || !def) {
                sendJson(res, 404, { error: 'Skill not unlocked' });
                return true;
            }
            if (mockState.player.skill_points <= 0 || ps.rank >= def.max_rank) {
                sendJson(res, 400, { error: 'Cannot rank up' });
                return true;
            }
            ps.rank += 1;
            mockState.player.skill_points -= 1;
            sendJson(res, 200, { ok: true });
            return true;
        }

        const slotMatch = route.match(/^\/player\/skills\/(\d+)\/slot$/);
        if (method === 'PUT' && slotMatch) {
            const skillId = Number(slotMatch[1]);
            const body = await readBody(req);
            const slot = body.slot == null ? null : Number(body.slot);
            const ps = mockState.playerSkills.find(s => s.skill_id === skillId);
            if (!ps) {
                sendJson(res, 404, { error: 'Skill not unlocked' });
                return true;
            }
            if (slot != null) {
                for (const other of mockState.playerSkills) {
                    if (other.bar_slot === slot) other.bar_slot = null;
                }
            }
            ps.bar_slot = slot;
            sendJson(res, 200, { ok: true });
            return true;
        }

        sendJson(res, 404, { error: 'Unknown Fabulus route' });
        return true;
    } catch (err) {
        console.error('[Fabulus API] Route error:', err.message);
        sendJson(res, 500, { error: 'Internal error' });
        return true;
    }
}

module.exports = { handleFabulusRoutes, setDbPool };
