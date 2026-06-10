/**
 * Fabulus RPG backend routes (/api/fabulus/*).
 * Mock mode: serves in-memory data shaped exactly like the rpg_* tables
 * (see db/fabulus_schema.sql). Swap USE_MOCK to false and pass a mysql pool
 * via setDbPool() to serve from the database.
 */
const USE_MOCK = true;

const API_PREFIX = '/api/fabulus';

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
        model_path: 'classes/armored_animation.glb', max_level: 50, starting_gold: 100, main_stat: 1,
        base_health: 120, base_mana: 40, base_strength: 12, base_dexterity: 8, base_intelligence: 5, base_vitality: 10,
        health_per_level: 12, mana_per_level: 4, attribute_points_per_level: 3, skill_points_per_level: 1,
        walk_speed: 2.4, run_speed: 5.0,
        anim_idle: null, anim_walk: 'Walking', anim_run: 'Running', anim_attack: 'Attack', anim_hit: null, anim_death: null,
    },
    {
        id: 2, name: 'Wizard', description: 'A master of the arcane. Intelligence empowers every spell.',
        model_path: 'classes/armored_animation.glb', max_level: 50, starting_gold: 100, main_stat: 3,
        base_health: 80, base_mana: 90, base_strength: 5, base_dexterity: 9, base_intelligence: 14, base_vitality: 7,
        health_per_level: 8, mana_per_level: 9, attribute_points_per_level: 3, skill_points_per_level: 1,
        walk_speed: 2.4, run_speed: 4.8,
        anim_idle: null, anim_walk: 'Walking', anim_run: 'Running', anim_attack: 'Attack', anim_hit: null, anim_death: null,
    },
];

const mockEnemies = [
    {
        id: 1, name: 'Goblin', model_path: 'enemies/goblin_Merged_Animations.glb', level: 1,
        max_health: 40, damage_min: 3, damage_max: 6, armor: 5,
        walk_speed: 1.6, run_speed: 3.4, aggro_range: 9, attack_range: 1.6, leash_range: 18,
        attack_cooldown_ms: 1600, experience_reward: 28, gold_min: 2, gold_max: 6,
        health_scale_pct: 18, damage_scale_pct: 12,
        anim_idle: null, anim_walk: 'Walking', anim_run: 'Running', anim_attack: null, anim_hit: null, anim_death: null,
    },
    {
        id: 2, name: 'Goblin Brute', model_path: 'enemies/goblin_Merged_Animations.glb', level: 3,
        max_health: 90, damage_min: 6, damage_max: 11, armor: 9,
        walk_speed: 1.3, run_speed: 2.8, aggro_range: 8, attack_range: 1.8, leash_range: 18,
        attack_cooldown_ms: 2000, experience_reward: 70, gold_min: 5, gold_max: 12,
        health_scale_pct: 20, damage_scale_pct: 14,
        anim_idle: null, anim_walk: 'Walking', anim_run: 'Running', anim_attack: null, anim_hit: null, anim_death: null,
    },
    {
        id: 3, name: 'Goblin Shaman', model_path: 'enemies/goblin_Merged_Animations.glb', level: 2,
        max_health: 30, damage_min: 5, damage_max: 9, armor: 2,
        walk_speed: 1.5, run_speed: 3.0, aggro_range: 11, attack_range: 1.6, leash_range: 20,
        attack_cooldown_ms: 1900, experience_reward: 48, gold_min: 3, gold_max: 9,
        health_scale_pct: 16, damage_scale_pct: 12,
        anim_idle: null, anim_walk: 'Walking', anim_run: 'Running', anim_attack: null, anim_hit: null, anim_death: null,
    },
];

const mockRarities = [
    { id: 1, name: 'Common', color_hex: '#c8c2b4', max_modifiers: 1, stat_multiplier: 1.0, drop_weight: 100 },
    { id: 2, name: 'Magic', color_hex: '#5e8fd9', max_modifiers: 2, stat_multiplier: 1.1, drop_weight: 40 },
    { id: 3, name: 'Rare', color_hex: '#e3c54e', max_modifiers: 3, stat_multiplier: 1.2, drop_weight: 15 },
    { id: 4, name: 'Epic', color_hex: '#9b59d0', max_modifiers: 4, stat_multiplier: 1.3, drop_weight: 5 },
    { id: 5, name: 'Legendary', color_hex: '#e08a2e', max_modifiers: 5, stat_multiplier: 1.4, drop_weight: 1 },
];

const mockItems = [
    {
        id: 1, name: 'Rusty Sword', description: 'A worn blade that has seen better days.',
        item_type: 1, main_stat: 1, model_path: null, rarity_id: 1, required_level: 1,
        damage_min: 4, damage_max: 7, attack_speed: 1.0, armor: null, anim_attack_override: null,
        modifiers: [],
    },
    {
        id: 2, name: 'Iron Helmet', description: 'Solid iron protection for the head.',
        item_type: 2, main_stat: null, model_path: null, rarity_id: 1, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: 3, anim_attack_override: null,
        modifiers: [{ attribute_type: 4, value: 2, value_type: 1 }],
    },
    {
        id: 3, name: 'Leather Boots', description: 'Light boots favored by scouts.',
        item_type: 4, main_stat: 2, model_path: null, rarity_id: 2, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: 2, anim_attack_override: null,
        modifiers: [{ attribute_type: 9, value: 8, value_type: 1 }],
    },
    {
        id: 4, name: 'Apprentice Ring', description: 'A simple band humming with arcane energy.',
        item_type: 5, main_stat: 3, model_path: null, rarity_id: 2, required_level: 1,
        damage_min: null, damage_max: null, attack_speed: null, armor: null, anim_attack_override: null,
        modifiers: [
            { attribute_type: 3, value: 3, value_type: 1 },
            { attribute_type: 6, value: 10, value_type: 1 },
        ],
    },
];

const mockSkills = [
    {
        id: 1, class_id: 1, name: 'Power Strike', description: 'A mighty blow dealing heavy weapon damage.',
        icon_key: 'power-strike', skill_type: 1, unlock_level: 1, mana_cost: 6, cooldown_ms: 3000,
        damage_coeff: 150, damage_coeff_per_rank: 20, max_rank: 5, range: 2.4, radius: null,
        duration_ms: null, projectile_speed: null, anim_override: null, vfx_key: 'strike', effects: [],
    },
    {
        id: 2, class_id: 1, name: 'Shield Bash', description: 'Bash the enemy, dealing damage and staggering it briefly.',
        icon_key: 'shield-bash', skill_type: 1, unlock_level: 2, mana_cost: 8, cooldown_ms: 5000,
        damage_coeff: 120, damage_coeff_per_rank: 15, max_rank: 5, range: 2.2, radius: null,
        duration_ms: 1000, projectile_speed: null, anim_override: null, vfx_key: 'bash', effects: [],
    },
    {
        id: 3, class_id: 1, name: 'Whirlwind', description: 'Spin in place, striking all enemies around you.',
        icon_key: 'whirlwind', skill_type: 3, unlock_level: 4, mana_cost: 14, cooldown_ms: 7000,
        damage_coeff: 100, damage_coeff_per_rank: 12, max_rank: 5, range: 0, radius: 3.2,
        duration_ms: null, projectile_speed: null, anim_override: null, vfx_key: 'whirl', effects: [],
    },
    {
        id: 4, class_id: 1, name: 'Battle Shout', description: 'A war cry that increases your damage for a short time.',
        icon_key: 'battle-shout', skill_type: 4, unlock_level: 6, mana_cost: 12, cooldown_ms: 16000,
        damage_coeff: 0, damage_coeff_per_rank: 0, max_rank: 5, range: 0, radius: null,
        duration_ms: 10000, projectile_speed: null, anim_override: null, vfx_key: 'shout',
        effects: [{ attribute_type: 8, value: 20, value_type: 2 }],
    },
    {
        id: 5, class_id: 1, name: 'Second Wind', description: 'Recover a portion of your maximum health.',
        icon_key: 'second-wind', skill_type: 5, unlock_level: 8, mana_cost: 18, cooldown_ms: 20000,
        damage_coeff: 25, damage_coeff_per_rank: 5, max_rank: 5, range: 0, radius: null,
        duration_ms: null, projectile_speed: null, anim_override: null, vfx_key: 'heal', effects: [],
    },
    {
        id: 6, class_id: 2, name: 'Fire Bolt', description: 'Hurl a bolt of fire at your target.',
        icon_key: 'fire-bolt', skill_type: 2, unlock_level: 1, mana_cost: 7, cooldown_ms: 2500,
        damage_coeff: 130, damage_coeff_per_rank: 18, max_rank: 5, range: 16, radius: null,
        duration_ms: null, projectile_speed: 14, anim_override: null, vfx_key: 'fire', effects: [],
    },
    {
        id: 7, class_id: 2, name: 'Frost Nova', description: 'A burst of frost damaging everything nearby.',
        icon_key: 'frost-nova', skill_type: 3, unlock_level: 2, mana_cost: 13, cooldown_ms: 8000,
        damage_coeff: 80, damage_coeff_per_rank: 10, max_rank: 5, range: 0, radius: 3.5,
        duration_ms: null, projectile_speed: null, anim_override: null, vfx_key: 'frost', effects: [],
    },
    {
        id: 8, class_id: 2, name: 'Arcane Orb', description: 'A slow but devastating sphere of arcane power.',
        icon_key: 'arcane-orb', skill_type: 2, unlock_level: 4, mana_cost: 16, cooldown_ms: 6000,
        damage_coeff: 180, damage_coeff_per_rank: 22, max_rank: 5, range: 16, radius: null,
        duration_ms: null, projectile_speed: 8, anim_override: null, vfx_key: 'arcane', effects: [],
    },
    {
        id: 9, class_id: 2, name: 'Mage Armor', description: 'Arcane shielding hardens your defenses.',
        icon_key: 'mage-armor', skill_type: 4, unlock_level: 6, mana_cost: 15, cooldown_ms: 18000,
        damage_coeff: 0, damage_coeff_per_rank: 0, max_rank: 5, range: 0, radius: null,
        duration_ms: 15000, projectile_speed: null, anim_override: null, vfx_key: 'ward',
        effects: [{ attribute_type: 7, value: 30, value_type: 1 }],
    },
    {
        id: 10, class_id: 2, name: 'Mend', description: 'Soothing magic restores your health.',
        icon_key: 'mend', skill_type: 5, unlock_level: 8, mana_cost: 20, cooldown_ms: 20000,
        damage_coeff: 30, damage_coeff_per_rank: 5, max_rank: 5, range: 0, radius: null,
        duration_ms: null, projectile_speed: null, anim_override: null, vfx_key: 'heal', effects: [],
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
];

const mockLevels = (() => {
    const rows = [];
    for (let lvl = 1; lvl <= MAX_LEVEL_ROWS; lvl++) {
        rows.push({ level: lvl, experience_required: Math.floor(XP_CURVE_BASE * Math.pow(lvl, XP_CURVE_EXPONENT)) });
    }
    return rows;
})();

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
        { id: 1, player_id: 1, item_id: 1, is_equipped: 1, slot: 1 },
        { id: 2, player_id: 1, item_id: 2, is_equipped: 0, slot: null },
    ],
    playerSkills: [
        { skill_id: 1, rank: 1, bar_slot: 1 },
    ],
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
        req.on('data', chunk => { body += chunk; });
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
        if (method === 'GET') {
            switch (route) {
                case '/classes': sendJson(res, 200, mockClasses); return true;
                case '/player': sendJson(res, 200, mockState.player); return true;
                case '/enemies': sendJson(res, 200, mockEnemies); return true;
                case '/items': sendJson(res, 200, mockItems); return true;
                case '/rarities': sendJson(res, 200, mockRarities); return true;
                case '/levels': sendJson(res, 200, mockLevels); return true;
                case '/loot-tables': sendJson(res, 200, mockLootTables); return true;
                case '/player/items': sendJson(res, 200, mockState.playerItems); return true;
                case '/player/skills': sendJson(res, 200, mockState.playerSkills); return true;
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
            p.pos_x = 0;
            p.pos_z = 0;
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
            if (!mockItems.some(i => i.id === itemId)) {
                sendJson(res, 400, { error: 'Unknown item_id' });
                return true;
            }
            const row = {
                id: mockState.nextPlayerItemId++,
                player_id: mockState.player.id,
                item_id: itemId,
                is_equipped: 0,
                slot: null,
            };
            mockState.playerItems.push(row);
            sendJson(res, 200, row);
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
            }
            row.is_equipped = equip ? 1 : 0;
            row.slot = equip && body.slot != null ? Number(body.slot) : null;
            sendJson(res, 200, { ok: true });
            return true;
        }

        const unlockMatch = route.match(/^\/player\/skills\/(\d+)\/unlock$/);
        if (method === 'POST' && unlockMatch) {
            const skillId = Number(unlockMatch[1]);
            if (!mockSkills.some(s => s.id === skillId)) {
                sendJson(res, 400, { error: 'Unknown skill' });
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
