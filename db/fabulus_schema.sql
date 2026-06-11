-- Fabulus RPG schema
-- Enum conventions (numeric values, no strings):
--   attribute_type: 1=strength 2=dexterity 3=intelligence 4=vitality 5=max_health
--                   6=max_mana 7=armor 8=damage_pct 9=move_speed_pct 10=crit_chance_pct
--                   11=crit_damage_pct 12=attack_speed_pct 13=hp_regen 14=mana_regen
--   item_type:      1=weapon 2=helmet 3=chest 4=boots 5=ring 6=amulet 7=offhand 8=consumable
--   value_type:     1=flat 2=percent
--   skill_type:     1=melee_strike 2=projectile 3=aoe 4=buff 5=heal
--   loot_type:      1=gold 2=item
--   affix_type:     1=prefix 2=suffix

CREATE TABLE IF NOT EXISTS rpg_classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    model_path VARCHAR(255) NOT NULL,
    icon_path VARCHAR(255) NULL,
    max_level INT NOT NULL DEFAULT 50,
    starting_gold INT NOT NULL DEFAULT 100,
    main_stat TINYINT NOT NULL DEFAULT 1,
    base_health INT NOT NULL,
    base_mana INT NOT NULL,
    base_strength INT NOT NULL,
    base_dexterity INT NOT NULL,
    base_intelligence INT NOT NULL,
    base_vitality INT NOT NULL,
    health_per_level INT NOT NULL,
    mana_per_level INT NOT NULL,
    attribute_points_per_level INT NOT NULL DEFAULT 3,
    skill_points_per_level INT NOT NULL DEFAULT 1,
    walk_speed FLOAT NOT NULL DEFAULT 2.4,
    run_speed FLOAT NOT NULL DEFAULT 5.0,
    anim_idle VARCHAR(80) NULL,
    anim_walk VARCHAR(80) NULL,
    anim_run VARCHAR(80) NULL,
    anim_attack VARCHAR(80) NULL,
    anim_hit VARCHAR(80) NULL,
    anim_death VARCHAR(80) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rpg_players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    class_id INT NOT NULL,
    name VARCHAR(60) NOT NULL,
    level INT NOT NULL DEFAULT 1,
    experience BIGINT NOT NULL DEFAULT 0,
    strength INT NOT NULL,
    dexterity INT NOT NULL,
    intelligence INT NOT NULL,
    vitality INT NOT NULL,
    unspent_points INT NOT NULL DEFAULT 0,
    skill_points INT NOT NULL DEFAULT 0,
    current_health FLOAT NOT NULL,
    current_mana FLOAT NOT NULL,
    gold INT NOT NULL DEFAULT 0,
    pos_x FLOAT NOT NULL DEFAULT 0,
    pos_z FLOAT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_rpg_players_user (user_id),
    KEY idx_rpg_players_class (class_id),
    CONSTRAINT fk_rpg_players_class FOREIGN KEY (class_id) REFERENCES rpg_classes (id)
);

CREATE TABLE IF NOT EXISTS rpg_player_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    setting_key VARCHAR(60) NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    UNIQUE KEY idx_rpg_player_settings (player_id, setting_key),
    CONSTRAINT fk_rpg_settings_player FOREIGN KEY (player_id) REFERENCES rpg_players (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rpg_levels (
    level INT PRIMARY KEY,
    experience_required BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS rpg_enemies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    model_path VARCHAR(255) NOT NULL,
    level INT NOT NULL DEFAULT 1,
    max_health INT NOT NULL,
    damage_min INT NOT NULL,
    damage_max INT NOT NULL,
    armor INT NOT NULL DEFAULT 0,
    walk_speed FLOAT NOT NULL DEFAULT 1.6,
    run_speed FLOAT NOT NULL DEFAULT 3.4,
    aggro_range FLOAT NOT NULL DEFAULT 9,
    attack_range FLOAT NOT NULL DEFAULT 1.6,
    leash_range FLOAT NOT NULL DEFAULT 18,
    attack_cooldown_ms INT NOT NULL DEFAULT 1600,
    experience_reward INT NOT NULL,
    gold_min INT NOT NULL DEFAULT 0,
    gold_max INT NOT NULL DEFAULT 0,
    health_scale_pct FLOAT NOT NULL DEFAULT 0,
    damage_scale_pct FLOAT NOT NULL DEFAULT 0,
    elite_chance FLOAT NOT NULL DEFAULT 0,
    elite_hp_mult FLOAT NOT NULL DEFAULT 2.5,
    elite_dmg_mult FLOAT NOT NULL DEFAULT 1.5,
    elite_xp_mult FLOAT NOT NULL DEFAULT 3,
    elite_loot_rolls INT NOT NULL DEFAULT 1,
    anim_idle VARCHAR(80) NULL,
    anim_walk VARCHAR(80) NULL,
    anim_run VARCHAR(80) NULL,
    anim_attack VARCHAR(80) NULL,
    anim_hit VARCHAR(80) NULL,
    anim_death VARCHAR(80) NULL
);

CREATE TABLE IF NOT EXISTS rpg_rarities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(40) NOT NULL,
    color_hex VARCHAR(9) NOT NULL,
    max_modifiers INT NOT NULL DEFAULT 1,
    stat_multiplier FLOAT NOT NULL DEFAULT 1.0,
    drop_weight INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rpg_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    description TEXT,
    item_type TINYINT NOT NULL,
    main_stat TINYINT NULL,
    model_path VARCHAR(255) NULL,
    icon_path VARCHAR(255) NULL,
    rarity_id INT NOT NULL,
    required_level INT NOT NULL DEFAULT 1,
    damage_min INT NULL,
    damage_max INT NULL,
    attack_speed FLOAT NULL,
    armor INT NULL,
    anim_attack_override VARCHAR(80) NULL,
    sell_value INT NULL,
    restore_health INT NULL,
    restore_mana INT NULL,
    use_cooldown_ms INT NULL,
    max_stack INT NULL,
    KEY idx_rpg_items_type (item_type),
    KEY idx_rpg_items_rarity (rarity_id),
    CONSTRAINT fk_rpg_items_rarity FOREIGN KEY (rarity_id) REFERENCES rpg_rarities (id)
);

CREATE TABLE IF NOT EXISTS rpg_item_modifiers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    attribute_type TINYINT NOT NULL,
    value FLOAT NOT NULL,
    value_type TINYINT NOT NULL DEFAULT 1,
    KEY idx_rpg_item_modifiers_item (item_id),
    CONSTRAINT fk_rpg_modifiers_item FOREIGN KEY (item_id) REFERENCES rpg_items (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rpg_player_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    item_id INT NOT NULL,
    is_equipped TINYINT NOT NULL DEFAULT 0,
    slot TINYINT NULL,
    quantity INT NOT NULL DEFAULT 1,
    affixes JSON NULL,
    acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_rpg_player_items_player (player_id),
    CONSTRAINT fk_rpg_player_items_player FOREIGN KEY (player_id) REFERENCES rpg_players (id) ON DELETE CASCADE,
    CONSTRAINT fk_rpg_player_items_item FOREIGN KEY (item_id) REFERENCES rpg_items (id)
);

CREATE TABLE IF NOT EXISTS rpg_skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    name VARCHAR(80) NOT NULL,
    description TEXT,
    icon_key VARCHAR(60) NOT NULL,
    skill_type TINYINT NOT NULL,
    unlock_level INT NOT NULL DEFAULT 1,
    mana_cost INT NOT NULL DEFAULT 0,
    cooldown_ms INT NOT NULL DEFAULT 1000,
    damage_coeff FLOAT NOT NULL DEFAULT 0,
    damage_coeff_per_rank FLOAT NOT NULL DEFAULT 0,
    max_rank INT NOT NULL DEFAULT 5,
    `range` FLOAT NOT NULL DEFAULT 0,
    radius FLOAT NULL,
    duration_ms INT NULL,
    projectile_speed FLOAT NULL,
    anim_override VARCHAR(80) NULL,
    vfx_key VARCHAR(60) NOT NULL DEFAULT 'default',
    vfx_element VARCHAR(20) NOT NULL DEFAULT 'physical',
    icon_path VARCHAR(255) NULL,
    KEY idx_rpg_skills_class (class_id),
    CONSTRAINT fk_rpg_skills_class FOREIGN KEY (class_id) REFERENCES rpg_classes (id)
);

CREATE TABLE IF NOT EXISTS rpg_skill_effects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    skill_id INT NOT NULL,
    attribute_type TINYINT NOT NULL,
    value FLOAT NOT NULL,
    value_type TINYINT NOT NULL DEFAULT 1,
    KEY idx_rpg_skill_effects_skill (skill_id),
    CONSTRAINT fk_rpg_effects_skill FOREIGN KEY (skill_id) REFERENCES rpg_skills (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rpg_player_skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL,
    skill_id INT NOT NULL,
    `rank` INT NOT NULL DEFAULT 1,
    bar_slot TINYINT NULL,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_rpg_player_skills (player_id, skill_id),
    CONSTRAINT fk_rpg_player_skills_player FOREIGN KEY (player_id) REFERENCES rpg_players (id) ON DELETE CASCADE,
    CONSTRAINT fk_rpg_player_skills_skill FOREIGN KEY (skill_id) REFERENCES rpg_skills (id)
);

CREATE TABLE IF NOT EXISTS rpg_affixes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    affix_type TINYINT NOT NULL,
    attribute_type TINYINT NOT NULL,
    value_type TINYINT NOT NULL DEFAULT 1,
    min_roll FLOAT NOT NULL,
    max_roll FLOAT NOT NULL,
    min_rarity INT NOT NULL DEFAULT 1,
    weight INT NOT NULL DEFAULT 1,
    KEY idx_rpg_affixes_type (affix_type)
);

CREATE TABLE IF NOT EXISTS rpg_loot_tables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enemy_id INT NOT NULL,
    loot_type TINYINT NOT NULL,
    drop_chance_pct FLOAT NOT NULL,
    gold_min INT NULL,
    gold_max INT NULL,
    item_id INT NULL,
    KEY idx_rpg_loot_enemy (enemy_id),
    CONSTRAINT fk_rpg_loot_enemy FOREIGN KEY (enemy_id) REFERENCES rpg_enemies (id) ON DELETE CASCADE,
    CONSTRAINT fk_rpg_loot_item FOREIGN KEY (item_id) REFERENCES rpg_items (id)
);

-- Static props placed on the map (model_path relative to models/rpg/).
-- scale is the target height in world units (models are normalized on load).
CREATE TABLE IF NOT EXISTS rpg_map_props (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model_path VARCHAR(255) NOT NULL,
    pos_x FLOAT NOT NULL DEFAULT 0,
    pos_y FLOAT NOT NULL DEFAULT 0,
    pos_z FLOAT NOT NULL DEFAULT 0,
    rot_y FLOAT NOT NULL DEFAULT 0,
    scale FLOAT NOT NULL DEFAULT 1,
    collidable TINYINT NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- NPCs with a pre-configured dialogue tree stored as JSON:
-- { "start": "<nodeKey>", "nodes": { "<nodeKey>": { "text": "...",
--   "options": [{ "label": "...", "next": "<nodeKey>|null" }] } } }
-- next = null closes the dialogue.
CREATE TABLE IF NOT EXISTS rpg_npcs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    title VARCHAR(80) NULL,
    model_path VARCHAR(255) NOT NULL,
    pos_x FLOAT NOT NULL DEFAULT 0,
    pos_z FLOAT NOT NULL DEFAULT 0,
    rot_y FLOAT NOT NULL DEFAULT 0,
    scale FLOAT NOT NULL DEFAULT 1,
    idle_anim VARCHAR(80) NULL,
    dialog JSON NULL
);
