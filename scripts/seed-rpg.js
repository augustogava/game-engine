/**
 * Runs db/fabulus_schema.sql + db/fabulus_seed.sql against DATABASE_RPG_URL.
 * Usage: node scripts/seed-rpg.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function loadEnv() {
    const vars = {};
    try {
        const content = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
        for (const line of content.split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
            if (m && !line.trim().startsWith('#')) vars[m[1]] = m[2];
        }
    } catch (_) {}
    return vars;
}

async function main() {
    const env = loadEnv();
    const url = process.env.DATABASE_RPG_URL || env.DATABASE_RPG_URL;
    if (!url) {
        console.error('[Seed:RPG] DATABASE_RPG_URL not set');
        process.exit(1);
    }

    const conn = await mysql.createConnection({ uri: url, multipleStatements: true });
    try {
        for (const file of ['fabulus_schema.sql', 'fabulus_seed.sql']) {
            const sql = fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');
            console.log(`[Seed:RPG] Running ${file}...`);
            await conn.query(sql);
        }
        const [tables] = await conn.query("SHOW TABLES LIKE 'rpg\\_%'");
        console.log(`[Seed:RPG] Done. ${tables.length} rpg_* tables present:`);
        for (const t of tables) console.log('  -', Object.values(t)[0]);
        const counts = {};
        for (const t of ['rpg_classes', 'rpg_enemies', 'rpg_items', 'rpg_skills', 'rpg_affixes', 'rpg_loot_tables', 'rpg_levels', 'rpg_players', 'rpg_player_items', 'rpg_player_skills']) {
            const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM ${t}`);
            counts[t] = row.n;
        }
        console.table(counts);
    } finally {
        await conn.end();
    }
}

main().catch((err) => {
    console.error('[Seed:RPG] Failed:', err.message);
    process.exit(1);
});
