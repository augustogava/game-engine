import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const { items, lootTables } = JSON.parse(fs.readFileSync(path.join(root, 'data/fabulus-extended.json'), 'utf8'));

function esc(s) {
    return String(s).replace(/'/g, "''");
}

function sqlVal(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'string') return `'${esc(v)}'`;
    return v;
}

const itemRows = items.map(i =>
    `    (${[i.id, sqlVal(i.name), sqlVal(i.description), i.item_type, sqlVal(i.main_stat), sqlVal(i.model_path), sqlVal(i.icon_path), i.rarity_id, i.required_level, sqlVal(i.damage_min), sqlVal(i.damage_max), sqlVal(i.attack_speed), sqlVal(i.armor), sqlVal(i.anim_attack_override), sqlVal(i.sell_value), sqlVal(i.restore_health), sqlVal(i.restore_mana), sqlVal(i.use_cooldown_ms), sqlVal(i.max_stack)].join(', ')})`
).join(',\n');

const modRows = [];
for (const i of items) {
    for (const m of i.modifiers || []) {
        modRows.push(`    (${i.id}, ${m.attribute_type}, ${m.value}, ${m.value_type})`);
    }
}

const lootRows = lootTables.map(l =>
    `    (${[l.id, l.enemy_id, l.loot_type, l.drop_chance_pct, l.gold_min ?? 'NULL', l.gold_max ?? 'NULL', l.item_id ?? 'NULL'].join(', ')})`
).join(',\n');

const sql = `-- Extended items (ids 14-50) generated from data/fabulus-extended.json
INSERT INTO rpg_items
    (id, name, description, item_type, main_stat, model_path, icon_path, rarity_id, required_level,
     damage_min, damage_max, attack_speed, armor, anim_attack_override,
     sell_value, restore_health, restore_mana, use_cooldown_ms, max_stack)
VALUES
${itemRows}
ON DUPLICATE KEY UPDATE
    name = VALUES(name), description = VALUES(description), item_type = VALUES(item_type),
    main_stat = VALUES(main_stat), model_path = VALUES(model_path), icon_path = VALUES(icon_path), rarity_id = VALUES(rarity_id),
    required_level = VALUES(required_level), damage_min = VALUES(damage_min), damage_max = VALUES(damage_max),
    attack_speed = VALUES(attack_speed), armor = VALUES(armor), anim_attack_override = VALUES(anim_attack_override),
    sell_value = VALUES(sell_value), restore_health = VALUES(restore_health), restore_mana = VALUES(restore_mana),
    use_cooldown_ms = VALUES(use_cooldown_ms), max_stack = VALUES(max_stack);

INSERT INTO rpg_item_modifiers (item_id, attribute_type, value, value_type) VALUES
${modRows.join(',\n')};

INSERT INTO rpg_loot_tables (id, enemy_id, loot_type, drop_chance_pct, gold_min, gold_max, item_id) VALUES
${lootRows}
ON DUPLICATE KEY UPDATE
    enemy_id = VALUES(enemy_id), loot_type = VALUES(loot_type), drop_chance_pct = VALUES(drop_chance_pct),
    gold_min = VALUES(gold_min), gold_max = VALUES(gold_max), item_id = VALUES(item_id);
`;

fs.writeFileSync(path.join(root, 'db/fabulus-extended-seed.sql'), sql);
console.log(`Generated db/fabulus-extended-seed.sql (${items.length} items, ${modRows.length} modifiers, ${lootTables.length} loot entries)`);
