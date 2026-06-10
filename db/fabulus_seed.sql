-- Fabulus RPG seed data (matches the mock data served by server/fabulus-routes.js)
-- Idempotent: safe to run multiple times (catalog rows upserted; player rows preserved).

INSERT INTO rpg_classes
    (id, name, description, model_path, max_level, starting_gold, main_stat,
     base_health, base_mana, base_strength, base_dexterity, base_intelligence, base_vitality,
     health_per_level, mana_per_level, attribute_points_per_level, skill_points_per_level,
     walk_speed, run_speed, anim_idle, anim_walk, anim_run, anim_attack, anim_hit, anim_death)
VALUES
    (1, 'Knight', 'A heavily armored melee fighter. Strength fuels his blade.',
     'classes/armored_animation.glb', 50, 100, 1,
     120, 40, 12, 8, 5, 10,
     12, 4, 3, 1,
     2.4, 5.0, NULL, 'Walking', 'Running', 'Attack', NULL, NULL),
    (2, 'Wizard', 'A master of the arcane. Intelligence empowers every spell.',
     'classes/armored_animation.glb', 50, 100, 3,
     80, 90, 5, 9, 14, 7,
     8, 9, 3, 1,
     2.4, 4.8, NULL, 'Walking', 'Running', 'Attack', NULL, NULL)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), description = VALUES(description), model_path = VALUES(model_path),
    max_level = VALUES(max_level), starting_gold = VALUES(starting_gold), main_stat = VALUES(main_stat),
    base_health = VALUES(base_health), base_mana = VALUES(base_mana),
    base_strength = VALUES(base_strength), base_dexterity = VALUES(base_dexterity),
    base_intelligence = VALUES(base_intelligence), base_vitality = VALUES(base_vitality),
    health_per_level = VALUES(health_per_level), mana_per_level = VALUES(mana_per_level),
    attribute_points_per_level = VALUES(attribute_points_per_level), skill_points_per_level = VALUES(skill_points_per_level),
    walk_speed = VALUES(walk_speed), run_speed = VALUES(run_speed),
    anim_idle = VALUES(anim_idle), anim_walk = VALUES(anim_walk), anim_run = VALUES(anim_run),
    anim_attack = VALUES(anim_attack), anim_hit = VALUES(anim_hit), anim_death = VALUES(anim_death);

INSERT INTO rpg_enemies
    (id, name, model_path, level, max_health, damage_min, damage_max, armor,
     walk_speed, run_speed, aggro_range, attack_range, leash_range, attack_cooldown_ms,
     experience_reward, gold_min, gold_max, health_scale_pct, damage_scale_pct,
     anim_idle, anim_walk, anim_run, anim_attack, anim_hit, anim_death)
VALUES
    (1, 'Goblin', 'enemies/goblin_Merged_Animations.glb', 1, 40, 3, 6, 5,
     1.6, 3.4, 9, 1.6, 18, 1600,
     28, 2, 6, 18, 12,
     NULL, 'Walking', 'Running', NULL, NULL, NULL),
    (2, 'Goblin Brute', 'enemies/goblin_Merged_Animations.glb', 3, 90, 6, 11, 9,
     1.3, 2.8, 8, 1.8, 18, 2000,
     70, 5, 12, 20, 14,
     NULL, 'Walking', 'Running', NULL, NULL, NULL),
    (3, 'Goblin Shaman', 'enemies/goblin_Merged_Animations.glb', 2, 30, 5, 9, 2,
     1.5, 3.0, 11, 1.6, 20, 1900,
     48, 3, 9, 16, 12,
     NULL, 'Walking', 'Running', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), model_path = VALUES(model_path), level = VALUES(level),
    max_health = VALUES(max_health), damage_min = VALUES(damage_min), damage_max = VALUES(damage_max),
    armor = VALUES(armor), walk_speed = VALUES(walk_speed), run_speed = VALUES(run_speed),
    aggro_range = VALUES(aggro_range), attack_range = VALUES(attack_range), leash_range = VALUES(leash_range),
    attack_cooldown_ms = VALUES(attack_cooldown_ms), experience_reward = VALUES(experience_reward),
    gold_min = VALUES(gold_min), gold_max = VALUES(gold_max),
    health_scale_pct = VALUES(health_scale_pct), damage_scale_pct = VALUES(damage_scale_pct),
    anim_idle = VALUES(anim_idle), anim_walk = VALUES(anim_walk), anim_run = VALUES(anim_run),
    anim_attack = VALUES(anim_attack), anim_hit = VALUES(anim_hit), anim_death = VALUES(anim_death);

INSERT INTO rpg_rarities (id, name, color_hex, max_modifiers, stat_multiplier, drop_weight) VALUES
    (1, 'Common', '#c8c2b4', 1, 1.0, 100),
    (2, 'Magic', '#5e8fd9', 2, 1.1, 40),
    (3, 'Rare', '#e3c54e', 3, 1.2, 15),
    (4, 'Epic', '#9b59d0', 4, 1.3, 5),
    (5, 'Legendary', '#e08a2e', 5, 1.4, 1)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), color_hex = VALUES(color_hex), max_modifiers = VALUES(max_modifiers),
    stat_multiplier = VALUES(stat_multiplier), drop_weight = VALUES(drop_weight);

INSERT INTO rpg_items
    (id, name, description, item_type, main_stat, model_path, rarity_id, required_level,
     damage_min, damage_max, attack_speed, armor, anim_attack_override)
VALUES
    (1, 'Rusty Sword', 'A worn blade that has seen better days.', 1, 1, NULL, 1, 1, 4, 7, 1.0, NULL, NULL),
    (2, 'Iron Helmet', 'Solid iron protection for the head.', 2, NULL, NULL, 1, 1, NULL, NULL, NULL, 3, NULL),
    (3, 'Leather Boots', 'Light boots favored by scouts.', 4, 2, NULL, 2, 1, NULL, NULL, NULL, 2, NULL),
    (4, 'Apprentice Ring', 'A simple band humming with arcane energy.', 5, 3, NULL, 2, 1, NULL, NULL, NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), description = VALUES(description), item_type = VALUES(item_type),
    main_stat = VALUES(main_stat), model_path = VALUES(model_path), rarity_id = VALUES(rarity_id),
    required_level = VALUES(required_level), damage_min = VALUES(damage_min), damage_max = VALUES(damage_max),
    attack_speed = VALUES(attack_speed), armor = VALUES(armor), anim_attack_override = VALUES(anim_attack_override);

-- Child tables without natural unique keys: rebuild to stay idempotent.
DELETE FROM rpg_item_modifiers;
INSERT INTO rpg_item_modifiers (item_id, attribute_type, value, value_type) VALUES
    (2, 4, 2, 1),
    (3, 9, 8, 1),
    (4, 3, 3, 1),
    (4, 6, 10, 1);

INSERT INTO rpg_skills
    (id, class_id, name, description, icon_key, skill_type, unlock_level, mana_cost, cooldown_ms,
     damage_coeff, damage_coeff_per_rank, max_rank, `range`, radius, duration_ms, projectile_speed, anim_override, vfx_key)
VALUES
    (1, 1, 'Power Strike', 'A mighty blow dealing heavy weapon damage.', 'power-strike', 1, 1, 6, 3000, 150, 20, 5, 2.4, NULL, NULL, NULL, NULL, 'strike'),
    (2, 1, 'Shield Bash', 'Bash the enemy, dealing damage and staggering it briefly.', 'shield-bash', 1, 2, 8, 5000, 120, 15, 5, 2.2, NULL, 1000, NULL, NULL, 'bash'),
    (3, 1, 'Whirlwind', 'Spin in place, striking all enemies around you.', 'whirlwind', 3, 4, 14, 7000, 100, 12, 5, 0, 3.2, NULL, NULL, NULL, 'whirl'),
    (4, 1, 'Battle Shout', 'A war cry that increases your damage for a short time.', 'battle-shout', 4, 6, 12, 16000, 0, 0, 5, 0, NULL, 10000, NULL, NULL, 'shout'),
    (5, 1, 'Second Wind', 'Recover a portion of your maximum health.', 'second-wind', 5, 8, 18, 20000, 25, 5, 5, 0, NULL, NULL, NULL, NULL, 'heal'),
    (6, 2, 'Fire Bolt', 'Hurl a bolt of fire at your target.', 'fire-bolt', 2, 1, 7, 2500, 130, 18, 5, 16, NULL, NULL, 14, NULL, 'fire'),
    (7, 2, 'Frost Nova', 'A burst of frost damaging everything nearby.', 'frost-nova', 3, 2, 13, 8000, 80, 10, 5, 0, 3.5, NULL, NULL, NULL, 'frost'),
    (8, 2, 'Arcane Orb', 'A slow but devastating sphere of arcane power.', 'arcane-orb', 2, 4, 16, 6000, 180, 22, 5, 16, NULL, NULL, 8, NULL, 'arcane'),
    (9, 2, 'Mage Armor', 'Arcane shielding hardens your defenses.', 'mage-armor', 4, 6, 15, 18000, 0, 0, 5, 0, NULL, 15000, NULL, NULL, 'ward'),
    (10, 2, 'Mend', 'Soothing magic restores your health.', 'mend', 5, 8, 20, 20000, 30, 5, 5, 0, NULL, NULL, NULL, NULL, 'heal')
ON DUPLICATE KEY UPDATE
    class_id = VALUES(class_id), name = VALUES(name), description = VALUES(description),
    icon_key = VALUES(icon_key), skill_type = VALUES(skill_type), unlock_level = VALUES(unlock_level),
    mana_cost = VALUES(mana_cost), cooldown_ms = VALUES(cooldown_ms), damage_coeff = VALUES(damage_coeff),
    damage_coeff_per_rank = VALUES(damage_coeff_per_rank), max_rank = VALUES(max_rank),
    `range` = VALUES(`range`), radius = VALUES(radius), duration_ms = VALUES(duration_ms),
    projectile_speed = VALUES(projectile_speed), anim_override = VALUES(anim_override), vfx_key = VALUES(vfx_key);

-- Child tables without natural unique keys: rebuild to stay idempotent.
DELETE FROM rpg_skill_effects;
INSERT INTO rpg_skill_effects (skill_id, attribute_type, value, value_type) VALUES
    (4, 8, 20, 2),
    (9, 7, 30, 1);

INSERT INTO rpg_loot_tables (id, enemy_id, loot_type, drop_chance_pct, gold_min, gold_max, item_id) VALUES
    (1, 1, 1, 80, 2, 6, NULL),
    (2, 1, 2, 5, NULL, NULL, 3),
    (3, 1, 2, 3, NULL, NULL, 4),
    (4, 1, 2, 4, NULL, NULL, NULL),
    (5, 2, 1, 90, 5, 12, NULL),
    (6, 2, 2, 6, NULL, NULL, 2),
    (7, 2, 2, 6, NULL, NULL, NULL),
    (8, 3, 1, 80, 3, 9, NULL),
    (9, 3, 2, 6, NULL, NULL, 4),
    (10, 3, 2, 5, NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE
    enemy_id = VALUES(enemy_id), loot_type = VALUES(loot_type), drop_chance_pct = VALUES(drop_chance_pct),
    gold_min = VALUES(gold_min), gold_max = VALUES(gold_max), item_id = VALUES(item_id);

-- XP curve: experience required to advance FROM each level (floor(100 * level^1.5))
INSERT INTO rpg_levels (level, experience_required)
SELECT seq.level, FLOOR(100 * POW(seq.level, 1.5))
FROM (
    SELECT (t.n * 10 + u.n + 1) AS level
    FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) t
    CROSS JOIN (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
                UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) u
) seq
WHERE seq.level <= 50
ON DUPLICATE KEY UPDATE experience_required = VALUES(experience_required);

-- Example player (mock user). Progress is preserved on reseed (no-op update).
INSERT INTO rpg_players
    (id, user_id, class_id, name, level, experience, strength, dexterity, intelligence, vitality,
     unspent_points, skill_points, current_health, current_mana, gold, pos_x, pos_z)
VALUES
    (1, '00000000-0000-0000-0000-000000000000', 1, 'Fabulus', 1, 0, 12, 8, 5, 10, 0, 0, 120, 40, 100, 0, 0)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO rpg_player_items (id, player_id, item_id, is_equipped, slot) VALUES
    (1, 1, 1, 1, 1),
    (2, 1, 2, 0, NULL)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO rpg_player_skills (player_id, skill_id, `rank`, bar_slot) VALUES
    (1, 1, 1, 1)
ON DUPLICATE KEY UPDATE player_id = player_id;
