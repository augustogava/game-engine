-- Fabulus RPG seed data (matches the mock data served by server/fabulus-routes.js)
-- Idempotent: safe to run multiple times (catalog rows upserted; player rows preserved).

INSERT INTO rpg_classes
    (id, name, description, model_path, icon_path, max_level, starting_gold, main_stat,
     base_health, base_mana, base_strength, base_dexterity, base_intelligence, base_vitality,
     health_per_level, mana_per_level, strength_per_level, dexterity_per_level, intelligence_per_level, vitality_per_level,
     health_regen, mana_regen, attribute_points_per_level, skill_points_per_level,
     walk_speed, run_speed, anim_idle, anim_walk, anim_run, anim_attack, anim_hit, anim_death)
VALUES
    (1, 'Knight', 'A heavily armored melee fighter. Strength fuels his blade.',
     'classes/Meshy_AI_Emerald_Knight_of_the_biped_Meshy_AI_Meshy_Merged_Animations.glb', 'models/rpg/icons/classes/knight.png', 50, 100, 1,
     120, 40, 12, 8, 5, 10,
     12, 4, 1, 0.5, 0, 1,
     0.8, 0.8, 3, 1,
     2.4, 5.0, 'Run_03', 'Attack', 'Walking', 'Idle_02', NULL, NULL),
    (2, 'Wizard', 'A master of the arcane. Intelligence empowers every spell.',
     'classes/Meshy_AI_Frostbound_Sage_biped_Meshy_AI_Meshy_Merged_Animations.glb', 'models/rpg/icons/classes/wizard.png', 50, 100, 3,
     80, 90, 5, 9, 14, 7,
     8, 9, 0, 0.5, 1, 0.5,
     0.4, 1.6, 3, 1,
     2.4, 4.8, 'Attack', 'Run_03', 'Idle_12', 'Running', NULL, NULL)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), description = VALUES(description), model_path = VALUES(model_path), icon_path = VALUES(icon_path),
    max_level = VALUES(max_level), starting_gold = VALUES(starting_gold), main_stat = VALUES(main_stat),
    base_health = VALUES(base_health), base_mana = VALUES(base_mana),
    base_strength = VALUES(base_strength), base_dexterity = VALUES(base_dexterity),
    base_intelligence = VALUES(base_intelligence), base_vitality = VALUES(base_vitality),
    health_per_level = VALUES(health_per_level), mana_per_level = VALUES(mana_per_level),
    strength_per_level = VALUES(strength_per_level), dexterity_per_level = VALUES(dexterity_per_level),
    intelligence_per_level = VALUES(intelligence_per_level), vitality_per_level = VALUES(vitality_per_level),
    health_regen = VALUES(health_regen), mana_regen = VALUES(mana_regen),
    attribute_points_per_level = VALUES(attribute_points_per_level), skill_points_per_level = VALUES(skill_points_per_level),
    walk_speed = VALUES(walk_speed), run_speed = VALUES(run_speed),
    anim_idle = VALUES(anim_idle), anim_walk = VALUES(anim_walk), anim_run = VALUES(anim_run),
    anim_attack = VALUES(anim_attack), anim_hit = VALUES(anim_hit), anim_death = VALUES(anim_death);

INSERT INTO rpg_enemies
    (id, name, model_path, level, max_health, damage_min, damage_max, armor,
     walk_speed, run_speed, aggro_range, attack_range, leash_range, attack_cooldown_ms,
     experience_reward, gold_min, gold_max, health_scale_pct, damage_scale_pct,
     elite_chance, elite_hp_mult, elite_dmg_mult, elite_xp_mult, elite_loot_rolls,
     anim_idle, anim_walk, anim_run, anim_attack, anim_hit, anim_death)
VALUES
    (1, 'Goblin', 'enemies/goblin_Merged_Animations.glb', 1, 24, 3, 6, 5,
     1.6, 3.4, 9, 1.6, 18, 1600,
     28, 2, 6, 18, 12,
     8, 2.5, 1.5, 3, 1,
     NULL, 'Walking', 'Running', NULL, NULL, NULL),
    (2, 'Goblin Brute', 'enemies/goblin_Merged_Animations.glb', 3, 50, 6, 11, 9,
     1.3, 2.8, 8, 1.8, 18, 2000,
     70, 5, 12, 20, 14,
     8, 2.5, 1.5, 3, 1,
     NULL, 'Walking', 'Running', NULL, NULL, NULL),
    (3, 'Goblin Shaman', 'enemies/goblin_Merged_Animations.glb', 2, 18, 5, 9, 2,
     1.5, 3.0, 11, 1.6, 20, 1900,
     48, 3, 9, 16, 12,
     8, 2.5, 1.5, 3, 1,
     NULL, 'Walking', 'Running', NULL, NULL, NULL),
    (4, 'Rotwalker', 'enemies/Meshy_AI_Rotwalker_biped_Meshy_AI_Meshy_Merged_Animations.glb', 4, 60, 8, 14, 12,
     1.4, 3.0, 10, 1.8, 20, 2100,
     95, 6, 14, 20, 14,
     8, 2.5, 1.5, 3, 1,
     'Running', 'Axe_Spin_Attack', 'Attack', 'Idle_02', NULL, NULL)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), model_path = VALUES(model_path), level = VALUES(level),
    max_health = VALUES(max_health), damage_min = VALUES(damage_min), damage_max = VALUES(damage_max),
    armor = VALUES(armor), walk_speed = VALUES(walk_speed), run_speed = VALUES(run_speed),
    aggro_range = VALUES(aggro_range), attack_range = VALUES(attack_range), leash_range = VALUES(leash_range),
    attack_cooldown_ms = VALUES(attack_cooldown_ms), experience_reward = VALUES(experience_reward),
    gold_min = VALUES(gold_min), gold_max = VALUES(gold_max),
    health_scale_pct = VALUES(health_scale_pct), damage_scale_pct = VALUES(damage_scale_pct),
    elite_chance = VALUES(elite_chance), elite_hp_mult = VALUES(elite_hp_mult),
    elite_dmg_mult = VALUES(elite_dmg_mult), elite_xp_mult = VALUES(elite_xp_mult),
    elite_loot_rolls = VALUES(elite_loot_rolls),
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

-- sell_value: explicit per item. Fallback formula when NULL: round(5 * rarity stat_multiplier * required_level).
INSERT INTO rpg_items
    (id, name, description, item_type, main_stat, model_path, icon_path, rarity_id, required_level,
     damage_min, damage_max, attack_speed, armor, anim_attack_override,
     sell_value, restore_health, restore_mana, use_cooldown_ms, max_stack)
VALUES
    (1, 'Rusty Sword', 'A worn blade that has seen better days.', 1, 1, NULL, 'models/rpg/icons/items/rusty-sword.png', 1, 1, 4, 7, 1.0, NULL, NULL, 5, NULL, NULL, NULL, NULL),
    (2, 'Iron Helmet', 'Solid iron protection for the head.', 2, NULL, NULL, 'models/rpg/icons/items/iron-helmet.png', 1, 1, NULL, NULL, NULL, 3, NULL, 8, NULL, NULL, NULL, NULL),
    (3, 'Leather Boots', 'Light boots favored by scouts.', 4, 2, NULL, 'models/rpg/icons/items/leather-boots.png', 2, 1, NULL, NULL, NULL, 2, NULL, 12, NULL, NULL, NULL, NULL),
    (4, 'Apprentice Ring', 'A simple band humming with arcane energy.', 5, 3, NULL, 'models/rpg/icons/items/apprentice-ring.png', 2, 1, NULL, NULL, NULL, NULL, NULL, 15, NULL, NULL, NULL, NULL),
    (5, 'Padded Tunic', 'A quilted tunic offering modest protection.', 3, NULL, NULL, 'models/rpg/icons/items/padded-tunic.png', 1, 1, NULL, NULL, NULL, 4, NULL, 10, NULL, NULL, NULL, NULL),
    (6, 'Knight''s Cuirass', 'Forged steel chest plate of the royal guard.', 3, 1, NULL, 'models/rpg/icons/items/knights-cuirass.png', 3, 4, NULL, NULL, NULL, 8, NULL, 40, NULL, NULL, NULL, NULL),
    (7, 'Bone Amulet', 'A carved talisman thrumming with spirit energy.', 6, 3, NULL, 'models/rpg/icons/items/bone-amulet.png', 2, 1, NULL, NULL, NULL, NULL, NULL, 18, NULL, NULL, NULL, NULL),
    (8, 'Talisman of Vigor', 'An ancient charm that quickens the blood.', 6, 4, NULL, 'models/rpg/icons/items/talisman-of-vigor.png', 3, 5, NULL, NULL, NULL, NULL, NULL, 45, NULL, NULL, NULL, NULL),
    (9, 'Wooden Buckler', 'A small round shield of hardened oak.', 7, NULL, NULL, 'models/rpg/icons/items/wooden-buckler.png', 1, 1, NULL, NULL, NULL, 5, NULL, 8, NULL, NULL, NULL, NULL),
    (10, 'Runed Shield', 'Etched with wards that turn aside steel and spell.', 7, 4, NULL, 'models/rpg/icons/items/runed-shield.png', 3, 4, NULL, NULL, NULL, 10, NULL, 42, NULL, NULL, NULL, NULL),
    (11, 'Minor Health Potion', 'A small vial of crimson liquid. Restores health.', 8, NULL, NULL, 'models/rpg/icons/items/minor-health-potion.png', 1, 1, NULL, NULL, NULL, NULL, NULL, 3, 50, NULL, 5000, 10),
    (12, 'Greater Health Potion', 'A hearty draught that mends deep wounds.', 8, NULL, NULL, 'models/rpg/icons/items/greater-health-potion.png', 2, 3, NULL, NULL, NULL, NULL, NULL, 10, 150, NULL, 5000, 10),
    (13, 'Minor Mana Potion', 'Azure essence that replenishes arcane reserves.', 8, NULL, NULL, 'models/rpg/icons/items/minor-mana-potion.png', 1, 1, NULL, NULL, NULL, NULL, NULL, 3, NULL, 40, 5000, 10)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), description = VALUES(description), item_type = VALUES(item_type),
    main_stat = VALUES(main_stat), model_path = VALUES(model_path), icon_path = VALUES(icon_path), rarity_id = VALUES(rarity_id),
    required_level = VALUES(required_level), damage_min = VALUES(damage_min), damage_max = VALUES(damage_max),
    attack_speed = VALUES(attack_speed), armor = VALUES(armor), anim_attack_override = VALUES(anim_attack_override),
    sell_value = VALUES(sell_value), restore_health = VALUES(restore_health), restore_mana = VALUES(restore_mana),
    use_cooldown_ms = VALUES(use_cooldown_ms), max_stack = VALUES(max_stack);

-- Child tables without natural unique keys: rebuild to stay idempotent.
DELETE FROM rpg_item_modifiers;
INSERT INTO rpg_item_modifiers (item_id, attribute_type, value, value_type) VALUES
    (2, 4, 2, 1),
    (3, 9, 8, 1),
    (4, 3, 3, 1),
    (4, 6, 10, 1),
    (5, 4, 3, 1),
    (6, 1, 5, 1),
    (6, 5, 20, 1),
    (7, 6, 12, 1),
    (7, 3, 2, 1),
    (8, 5, 30, 1),
    (8, 13, 1.5, 1),
    (10, 4, 4, 1);

INSERT INTO rpg_affixes (id, name, affix_type, attribute_type, value_type, min_roll, max_roll, min_rarity, weight) VALUES
    (1, 'Sharp', 1, 8, 2, 4, 8, 1, 100),
    (2, 'Bear''s', 1, 1, 1, 2, 5, 1, 80),
    (3, 'Hawk''s', 1, 2, 1, 2, 5, 1, 80),
    (4, 'Sage''s', 1, 3, 1, 2, 5, 1, 80),
    (5, 'Stalwart', 1, 4, 1, 2, 5, 1, 80),
    (6, 'Keen', 1, 10, 1, 2, 4, 2, 40),
    (7, 'of Haste', 2, 12, 2, 4, 8, 2, 50),
    (8, 'of the Wind', 2, 9, 1, 4, 8, 1, 70),
    (9, 'of Blood', 2, 5, 1, 10, 25, 1, 90),
    (10, 'of Spirit', 2, 6, 1, 10, 25, 1, 90),
    (11, 'of Renewal', 2, 13, 1, 1, 2, 2, 40),
    (12, 'of Ruin', 2, 11, 1, 10, 20, 3, 25)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), affix_type = VALUES(affix_type), attribute_type = VALUES(attribute_type),
    value_type = VALUES(value_type), min_roll = VALUES(min_roll), max_roll = VALUES(max_roll),
    min_rarity = VALUES(min_rarity), weight = VALUES(weight);

INSERT INTO rpg_skills
    (id, class_id, name, description, icon_key, skill_type, unlock_level, mana_cost, cooldown_ms,
     damage_coeff, damage_coeff_per_rank, max_rank, `range`, radius, duration_ms, projectile_speed, anim_override, vfx_key, vfx_element, icon_path)
VALUES
    (1, 1, 'Power Strike', 'A mighty blow dealing heavy weapon damage.', 'power-strike', 1, 1, 6, 3000, 150, 20, 5, 2.4, NULL, NULL, NULL, NULL, 'strike', 'physical', 'models/rpg/icons/skills/power-strike.png'),
    (2, 1, 'Shield Bash', 'Bash the enemy, dealing damage and staggering it briefly.', 'shield-bash', 1, 2, 8, 5000, 120, 15, 5, 2.2, NULL, 1000, NULL, NULL, 'bash', 'physical', 'models/rpg/icons/skills/shield-bash.png'),
    (3, 1, 'Whirlwind', 'Spin in place, striking all enemies around you.', 'whirlwind', 3, 4, 14, 7000, 100, 12, 5, 0, 3.2, NULL, NULL, NULL, 'whirl', 'physical', 'models/rpg/icons/skills/whirlwind.png'),
    (4, 1, 'Battle Shout', 'A war cry that increases your damage for a short time.', 'battle-shout', 4, 6, 12, 16000, 0, 0, 5, 0, NULL, 10000, NULL, NULL, 'shout', 'physical', 'models/rpg/icons/skills/battle-shout.png'),
    (5, 1, 'Second Wind', 'Recover a portion of your maximum health.', 'second-wind', 5, 8, 18, 20000, 25, 5, 5, 0, NULL, NULL, NULL, NULL, 'heal', 'holy', 'models/rpg/icons/skills/second-wind.png'),
    (6, 2, 'Fire Bolt', 'Hurl a bolt of fire at your target.', 'fire-bolt', 2, 1, 7, 2500, 130, 18, 5, 16, NULL, NULL, 14, NULL, 'fire', 'fire', 'models/rpg/icons/skills/fire-bolt.png'),
    (7, 2, 'Frost Nova', 'A burst of frost damaging everything nearby.', 'frost-nova', 3, 2, 13, 8000, 80, 10, 5, 0, 3.5, NULL, NULL, NULL, 'frost', 'ice', 'models/rpg/icons/skills/frost-nova.png'),
    (8, 2, 'Arcane Orb', 'A slow but devastating sphere of arcane power.', 'arcane-orb', 2, 4, 16, 6000, 180, 22, 5, 16, NULL, NULL, 8, NULL, 'arcane', 'arcane', 'models/rpg/icons/skills/arcane-orb.png'),
    (9, 2, 'Mage Armor', 'Arcane shielding hardens your defenses.', 'mage-armor', 4, 6, 15, 18000, 0, 0, 5, 0, NULL, 15000, NULL, NULL, 'ward', 'arcane', 'models/rpg/icons/skills/mage-armor.png'),
    (10, 2, 'Mend', 'Soothing magic restores your health.', 'mend', 5, 8, 20, 20000, 30, 5, 5, 0, NULL, NULL, NULL, NULL, 'heal', 'holy', 'models/rpg/icons/skills/mend.png')
ON DUPLICATE KEY UPDATE
    class_id = VALUES(class_id), name = VALUES(name), description = VALUES(description),
    icon_key = VALUES(icon_key), skill_type = VALUES(skill_type), unlock_level = VALUES(unlock_level),
    mana_cost = VALUES(mana_cost), cooldown_ms = VALUES(cooldown_ms), damage_coeff = VALUES(damage_coeff),
    damage_coeff_per_rank = VALUES(damage_coeff_per_rank), max_rank = VALUES(max_rank),
    `range` = VALUES(`range`), radius = VALUES(radius), duration_ms = VALUES(duration_ms),
    projectile_speed = VALUES(projectile_speed), anim_override = VALUES(anim_override), vfx_key = VALUES(vfx_key),
    vfx_element = VALUES(vfx_element), icon_path = VALUES(icon_path);

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
    (10, 3, 2, 5, NULL, NULL, NULL),
    (11, 1, 2, 10, NULL, NULL, 11),
    (12, 1, 2, 3, NULL, NULL, 9),
    (13, 2, 2, 3, NULL, NULL, 6),
    (14, 2, 2, 6, NULL, NULL, 12),
    (15, 2, 2, 5, NULL, NULL, 5),
    (16, 3, 2, 10, NULL, NULL, 13),
    (17, 3, 2, 4, NULL, NULL, 7),
    (18, 3, 2, 2, NULL, NULL, 8),
    (19, 2, 2, 2, NULL, NULL, 10),
    (20, 4, 1, 90, 6, 14, NULL),
    (21, 4, 2, 8, NULL, NULL, 12),
    (22, 4, 2, 5, NULL, NULL, 6),
    (23, 4, 2, 3, NULL, NULL, 10)
ON DUPLICATE KEY UPDATE
    enemy_id = VALUES(enemy_id), loot_type = VALUES(loot_type), drop_chance_pct = VALUES(drop_chance_pct),
    gold_min = VALUES(gold_min), gold_max = VALUES(gold_max), item_id = VALUES(item_id);

-- Extended items (ids 14-50) generated from data/fabulus-extended.json
INSERT INTO rpg_items
    (id, name, description, item_type, main_stat, model_path, icon_path, rarity_id, required_level,
     damage_min, damage_max, attack_speed, armor, anim_attack_override,
     sell_value, restore_health, restore_mana, use_cooldown_ms, max_stack)
VALUES
    (14, 'Bronze Dagger', 'A short curved blade favored by rogues and scouts.', 1, 2, NULL, 'models/rpg/icons/items/bronze-dagger.png', 1, 1, 3, 5, 1.2, NULL, NULL, 6, NULL, NULL, NULL, NULL),
    (15, 'Iron Mace', 'A heavy flanged mace that crushes bone and shield alike.', 1, 1, NULL, 'models/rpg/icons/items/iron-mace.png', 1, 2, 5, 9, 0.9, NULL, NULL, 10, NULL, NULL, NULL, NULL),
    (16, 'Steel Longsword', 'A well-balanced blade of polished steel.', 1, 1, NULL, 'models/rpg/icons/items/steel-longsword.png', 2, 3, 8, 13, 1, NULL, NULL, 18, NULL, NULL, NULL, NULL),
    (17, 'Oak Battle Staff', 'A gnarled staff topped with a faintly glowing crystal.', 1, 3, NULL, 'models/rpg/icons/items/oak-battle-staff.png', 2, 4, 6, 10, 1.1, NULL, NULL, 22, NULL, NULL, NULL, NULL),
    (18, 'Serpent Fang Blade', 'A curved sword with a venom-green edge and serpent pommel.', 1, 2, NULL, 'models/rpg/icons/items/serpent-fang-blade.png', 3, 6, 12, 18, 1.1, NULL, NULL, 45, NULL, NULL, NULL, NULL),
    (19, 'Warlord''s Greataxe', 'A massive double-bladed axe forged for champions.', 1, 1, NULL, 'models/rpg/icons/items/warlords-greataxe.png', 4, 8, 18, 26, 0.8, NULL, NULL, 75, NULL, NULL, NULL, NULL),
    (20, 'Dawnbreaker', 'A radiant holy blade said to banish the darkest foes.', 1, 1, NULL, 'models/rpg/icons/items/dawnbreaker.png', 5, 10, 22, 32, 1, NULL, NULL, 120, NULL, NULL, NULL, NULL),
    (21, 'Leather Cap', 'A simple leather cap offering minimal protection.', 2, NULL, NULL, 'models/rpg/icons/items/leather-cap.png', 1, 1, NULL, NULL, NULL, 2, NULL, 5, NULL, NULL, NULL, NULL),
    (22, 'Bronze Helm', 'An open-faced bronze helm with a sturdy nose guard.', 2, NULL, NULL, 'models/rpg/icons/items/bronze-helm.png', 1, 2, NULL, NULL, NULL, 4, NULL, 10, NULL, NULL, NULL, NULL),
    (23, 'Mage Hood', 'A deep blue hood woven with silver arcane thread.', 2, 3, NULL, 'models/rpg/icons/items/mage-hood.png', 2, 3, NULL, NULL, NULL, 1, NULL, 16, NULL, NULL, NULL, NULL),
    (24, 'Steel Greathelm', 'A fully enclosed steel helm with a narrow visor.', 2, 1, NULL, 'models/rpg/icons/items/steel-greathelm.png', 3, 6, NULL, NULL, NULL, 7, NULL, 38, NULL, NULL, NULL, NULL),
    (25, 'Crown of Kings', 'An ornate golden crown set with crimson gemstones.', 2, 4, NULL, 'models/rpg/icons/items/crown-of-kings.png', 4, 9, NULL, NULL, NULL, 5, NULL, 85, NULL, NULL, NULL, NULL),
    (26, 'Traveler''s Vest', 'A worn leather vest suited for long journeys.', 3, NULL, NULL, 'models/rpg/icons/items/travelers-vest.png', 1, 1, NULL, NULL, NULL, 3, NULL, 7, NULL, NULL, NULL, NULL),
    (27, 'Chainmail Hauberk', 'Interlinked steel rings offering reliable protection.', 3, NULL, NULL, 'models/rpg/icons/items/chainmail-hauberk.png', 2, 3, NULL, NULL, NULL, 6, NULL, 20, NULL, NULL, NULL, NULL),
    (28, 'Scholar''s Robe', 'Flowing blue robes embroidered with arcane sigils.', 3, 3, NULL, 'models/rpg/icons/items/scholars-robe.png', 2, 4, NULL, NULL, NULL, 2, NULL, 24, NULL, NULL, NULL, NULL),
    (29, 'Plate Armor', 'Heavy steel plate forged for front-line warriors.', 3, 1, NULL, 'models/rpg/icons/items/plate-armor.png', 3, 7, NULL, NULL, NULL, 10, NULL, 55, NULL, NULL, NULL, NULL),
    (30, 'Aegis of the Ancients', 'A legendary breastplate engraved with glowing runes.', 3, 4, NULL, 'models/rpg/icons/items/aegis-of-the-ancients.png', 5, 10, NULL, NULL, NULL, 14, NULL, 130, NULL, NULL, NULL, NULL),
    (31, 'Worn Sandals', 'Simple leather sandals, light on the feet.', 4, 2, NULL, 'models/rpg/icons/items/worn-sandals.png', 1, 1, NULL, NULL, NULL, 1, NULL, 4, NULL, NULL, NULL, NULL),
    (32, 'Hide Boots', 'Sturdy hide boots with fur trim for cold trails.', 4, NULL, NULL, 'models/rpg/icons/items/hide-boots.png', 1, 2, NULL, NULL, NULL, 3, NULL, 9, NULL, NULL, NULL, NULL),
    (33, 'Swiftstride Boots', 'Sleek green boots that quicken every step.', 4, 2, NULL, 'models/rpg/icons/items/swiftstride-boots.png', 2, 4, NULL, NULL, NULL, 3, NULL, 20, NULL, NULL, NULL, NULL),
    (34, 'Greaves of Valor', 'Steel greaves worn by knights of the royal guard.', 4, 1, NULL, 'models/rpg/icons/items/greaves-of-valor.png', 3, 6, NULL, NULL, NULL, 5, NULL, 35, NULL, NULL, NULL, NULL),
    (35, 'Boots of the Tempest', 'Light boots crackling with storm energy.', 4, 2, NULL, 'models/rpg/icons/items/boots-of-the-tempest.png', 4, 9, NULL, NULL, NULL, 4, NULL, 70, NULL, NULL, NULL, NULL),
    (36, 'Copper Band', 'A simple polished copper ring.', 5, 1, NULL, 'models/rpg/icons/items/copper-band.png', 1, 1, NULL, NULL, NULL, NULL, NULL, 6, NULL, NULL, NULL, NULL),
    (37, 'Ring of Focus', 'A silver ring set with a glowing blue sapphire.', 5, 3, NULL, 'models/rpg/icons/items/ring-of-focus.png', 2, 3, NULL, NULL, NULL, NULL, NULL, 18, NULL, NULL, NULL, NULL),
    (38, 'Band of Vitality', 'A golden ring set with a deep green emerald.', 5, 4, NULL, 'models/rpg/icons/items/band-of-vitality.png', 2, 5, NULL, NULL, NULL, NULL, NULL, 25, NULL, NULL, NULL, NULL),
    (39, 'Signet of Fury', 'A dark iron signet ring set with a glowing ruby.', 5, 1, NULL, 'models/rpg/icons/items/signet-of-fury.png', 3, 7, NULL, NULL, NULL, NULL, NULL, 50, NULL, NULL, NULL, NULL),
    (40, 'Ring of the Archmage', 'An elaborate golden ring with a violet arcane gem.', 5, 3, NULL, 'models/rpg/icons/items/ring-of-the-archmage.png', 4, 10, NULL, NULL, NULL, NULL, NULL, 90, NULL, NULL, NULL, NULL),
    (41, 'Wooden Pendant', 'A carved wooden talisman on a leather cord.', 6, NULL, NULL, 'models/rpg/icons/items/wooden-pendant.png', 1, 1, NULL, NULL, NULL, NULL, NULL, 5, NULL, NULL, NULL, NULL),
    (42, 'Amulet of Warding', 'A silver shield-shaped amulet on a heavy chain.', 6, 4, NULL, 'models/rpg/icons/items/amulet-of-warding.png', 2, 3, NULL, NULL, NULL, NULL, NULL, 16, NULL, NULL, NULL, NULL),
    (43, 'Pendant of Power', 'A golden amulet radiating raw strength.', 6, 1, NULL, 'models/rpg/icons/items/pendant-of-power.png', 3, 6, NULL, NULL, NULL, NULL, NULL, 42, NULL, NULL, NULL, NULL),
    (44, 'Heart of the Phoenix', 'A legendary phoenix amulet pulsing with fiery life.', 6, 4, NULL, 'models/rpg/icons/items/heart-of-the-phoenix.png', 5, 10, NULL, NULL, NULL, NULL, NULL, 110, NULL, NULL, NULL, NULL),
    (45, 'Iron Targe', 'A small round iron shield with a central boss.', 7, NULL, NULL, 'models/rpg/icons/items/iron-targe.png', 1, 2, NULL, NULL, NULL, 6, NULL, 10, NULL, NULL, NULL, NULL),
    (46, 'Spellbook of Embers', 'A leather-bound tome leaking fiery embers.', 7, 3, NULL, 'models/rpg/icons/items/spellbook-of-embers.png', 2, 4, NULL, NULL, NULL, NULL, NULL, 22, NULL, NULL, NULL, NULL),
    (47, 'Tower Shield', 'A tall rectangular shield of banded steel.', 7, 4, NULL, 'models/rpg/icons/items/tower-shield.png', 3, 7, NULL, NULL, NULL, 12, NULL, 48, NULL, NULL, NULL, NULL),
    (48, 'Bulwark of the Guardian', 'A legendary golden kite shield engraved with a lion.', 7, 4, NULL, 'models/rpg/icons/items/bulwark-of-the-guardian.png', 5, 10, NULL, NULL, NULL, 16, NULL, 115, NULL, NULL, NULL, NULL),
    (49, 'Greater Mana Potion', 'A large vial of swirling blue essence. Restores mana.', 8, NULL, NULL, 'models/rpg/icons/items/greater-mana-potion.png', 2, 5, NULL, NULL, NULL, NULL, NULL, 8, NULL, 80, 5000, 10),
    (50, 'Elixir of Renewal', 'A golden elixir that mends body and spirit alike.', 8, NULL, NULL, 'models/rpg/icons/items/elixir-of-renewal.png', 3, 8, NULL, NULL, NULL, NULL, NULL, 25, 100, 50, 8000, 5)
ON DUPLICATE KEY UPDATE
    name = VALUES(name), description = VALUES(description), item_type = VALUES(item_type),
    main_stat = VALUES(main_stat), model_path = VALUES(model_path), icon_path = VALUES(icon_path), rarity_id = VALUES(rarity_id),
    required_level = VALUES(required_level), damage_min = VALUES(damage_min), damage_max = VALUES(damage_max),
    attack_speed = VALUES(attack_speed), armor = VALUES(armor), anim_attack_override = VALUES(anim_attack_override),
    sell_value = VALUES(sell_value), restore_health = VALUES(restore_health), restore_mana = VALUES(restore_mana),
    use_cooldown_ms = VALUES(use_cooldown_ms), max_stack = VALUES(max_stack);

INSERT INTO rpg_item_modifiers (item_id, attribute_type, value, value_type) VALUES
    (17, 3, 2, 1),
    (18, 10, 3, 1),
    (19, 1, 4, 1),
    (20, 8, 8, 2),
    (22, 4, 1, 1),
    (23, 3, 2, 1),
    (23, 6, 8, 1),
    (24, 4, 3, 1),
    (25, 1, 3, 1),
    (25, 4, 3, 1),
    (25, 5, 15, 1),
    (27, 4, 2, 1),
    (28, 3, 3, 1),
    (28, 6, 15, 1),
    (29, 1, 4, 1),
    (30, 4, 5, 1),
    (30, 5, 30, 1),
    (31, 9, 4, 1),
    (33, 9, 10, 1),
    (34, 4, 3, 1),
    (35, 9, 12, 1),
    (35, 2, 2, 1),
    (36, 1, 1, 1),
    (37, 3, 4, 1),
    (37, 6, 8, 1),
    (38, 4, 3, 1),
    (38, 5, 15, 1),
    (39, 1, 4, 1),
    (39, 10, 5, 1),
    (40, 3, 5, 1),
    (40, 6, 20, 1),
    (40, 14, 1, 1),
    (41, 5, 5, 1),
    (42, 5, 15, 1),
    (42, 4, 1, 1),
    (43, 1, 2, 1),
    (43, 2, 2, 1),
    (43, 8, 10, 2),
    (44, 5, 40, 1),
    (44, 13, 2, 1),
    (46, 3, 3, 1),
    (46, 6, 12, 1),
    (47, 4, 4, 1),
    (48, 4, 5, 1),
    (48, 5, 25, 1);

INSERT INTO rpg_loot_tables (id, enemy_id, loot_type, drop_chance_pct, gold_min, gold_max, item_id) VALUES
    (24, 1, 2, 4, NULL, NULL, 14),
    (25, 1, 2, 3, NULL, NULL, 21),
    (26, 1, 2, 3, NULL, NULL, 26),
    (27, 1, 2, 2, NULL, NULL, 31),
    (28, 1, 2, 2, NULL, NULL, 36),
    (29, 1, 2, 2, NULL, NULL, 41),
    (30, 2, 2, 4, NULL, NULL, 15),
    (31, 2, 2, 3, NULL, NULL, 22),
    (32, 2, 2, 3, NULL, NULL, 27),
    (33, 2, 2, 2, NULL, NULL, 45),
    (34, 2, 2, 3, NULL, NULL, 16),
    (35, 2, 2, 2, NULL, NULL, 37),
    (36, 3, 2, 4, NULL, NULL, 17),
    (37, 3, 2, 3, NULL, NULL, 23),
    (38, 3, 2, 3, NULL, NULL, 28),
    (39, 3, 2, 2, NULL, NULL, 33),
    (40, 3, 2, 2, NULL, NULL, 42),
    (41, 3, 2, 2, NULL, NULL, 46),
    (42, 4, 2, 4, NULL, NULL, 18),
    (43, 4, 2, 3, NULL, NULL, 24),
    (44, 4, 2, 3, NULL, NULL, 29),
    (45, 4, 2, 2, NULL, NULL, 34),
    (46, 4, 2, 2, NULL, NULL, 38),
    (47, 4, 2, 2, NULL, NULL, 43),
    (48, 4, 2, 2, NULL, NULL, 47),
    (49, 4, 2, 3, NULL, NULL, 49),
    (50, 2, 2, 2, NULL, NULL, 19),
    (51, 4, 2, 1, NULL, NULL, 20),
    (52, 4, 2, 1, NULL, NULL, 25),
    (53, 4, 2, 1, NULL, NULL, 30),
    (54, 4, 2, 1, NULL, NULL, 35),
    (55, 4, 2, 1, NULL, NULL, 40),
    (56, 4, 2, 1, NULL, NULL, 44),
    (57, 4, 2, 1, NULL, NULL, 48),
    (58, 4, 2, 2, NULL, NULL, 50)
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

INSERT INTO rpg_player_items (id, player_id, item_id, is_equipped, slot, quantity, affixes) VALUES
    (1, 1, 1, 1, 1, 1, NULL),
    (2, 1, 2, 0, NULL, 1, NULL)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO rpg_player_skills (player_id, skill_id, `rank`, bar_slot) VALUES
    (1, 1, 1, 1)
ON DUPLICATE KEY UPDATE player_id = player_id;

-- Map props (editable in-game; reseed refreshes default layout). scale = target height in world units.
INSERT INTO rpg_map_props (id, model_path, pos_x, pos_y, pos_z, rot_y, scale, collidable) VALUES
    (1, 'house.glb', -14, 0, 16, 0.5, 8, 1),
    (2, 'house_2.glb', 16, 0, 14, -0.7, 7, 1),
    (3, 'chest.glb', 3, 0, 5, 0.3, 1.2, 1),
    (4, 'throne.glb', 0, 0, 20, 3.14, 2.6, 1),
    (5, 'stone_sentinel.glb', 12, 0, -6, -0.4, 3.5, 1),
    (6, 'tree_pin.glb', -10, 0, -8, 0.2, 9, 1),
    (7, 'tree_pin.glb', 10, 0, 8, -0.5, 8, 1),
    (8, 'chair.glb', -12, 0, 14, 2.4, 1.4, 1),
    (9, 'fountain.glb', 0, 0, 12, 0, 3, 1)
ON DUPLICATE KEY UPDATE
    model_path = VALUES(model_path), pos_x = VALUES(pos_x), pos_y = VALUES(pos_y), pos_z = VALUES(pos_z),
    rot_y = VALUES(rot_y), scale = VALUES(scale), collidable = VALUES(collidable);

-- NPC with pre-configured dialogue tree (next = null closes the dialogue).
INSERT INTO rpg_npcs (id, name, title, model_path, pos_x, pos_z, rot_y, scale, idle_anim, dialog) VALUES
    (1, 'Borin', 'Blacksmith',
     'npc/Meshy_AI_A_robust_medieval_bla_biped_Meshy_AI_Meshy_Merged_Animations.glb',
     7, 2, -1.85, 2.6, NULL,
     '{"start":"greet","nodes":{"greet":{"text":"Well met, traveler. The forge keeps me busy, but I always have time for a chat.","options":[{"label":"Who are you?","next":"about"},{"label":"Any advice for these lands?","next":"advice"},{"label":"Farewell.","next":null}]},"about":{"text":"Name''s Borin. I''ve been smithing for this village longer than you''ve been swinging swords.","options":[{"label":"Any advice for these lands?","next":"advice"},{"label":"Farewell.","next":null}]},"advice":{"text":"Watch out for goblins roaming the wilds. And keep a health potion handy - the brutes hit hard.","options":[{"label":"Who are you?","next":"about"},{"label":"Thanks. Farewell.","next":null}]}}}')
ON DUPLICATE KEY UPDATE
    name = VALUES(name), title = VALUES(title), model_path = VALUES(model_path),
    pos_x = VALUES(pos_x), pos_z = VALUES(pos_z), rot_y = VALUES(rot_y), scale = VALUES(scale),
    idle_anim = VALUES(idle_anim), dialog = VALUES(dialog);
