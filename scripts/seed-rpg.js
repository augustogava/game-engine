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

    // Columns added after initial release; CREATE TABLE IF NOT EXISTS won't add them to existing DBs.
    const MIGRATIONS = [
        "ALTER TABLE rpg_classes ADD COLUMN health_regen FLOAT NOT NULL DEFAULT 0.5",
        "ALTER TABLE rpg_classes ADD COLUMN mana_regen FLOAT NOT NULL DEFAULT 1.0",
    ];

    const conn = await mysql.createConnection({ uri: url, multipleStatements: true });
    try {
        const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'fabulus_schema.sql'), 'utf8');
        console.log('[Seed:RPG] Running fabulus_schema.sql...');
        await conn.query(schemaSql);

        for (const migration of MIGRATIONS) {
            try {
                await conn.query(migration);
                console.log(`[Seed:RPG] Migration applied: ${migration}`);
            } catch (err) {
                if (err.code !== 'ER_DUP_FIELDNAME') throw err;
            }
        }

        const seedSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'fabulus_seed.sql'), 'utf8');
        console.log('[Seed:RPG] Running fabulus_seed.sql...');
        await conn.query(seedSql);
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
