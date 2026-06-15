/**
 * Runs db/mahjong_schema.sql + db/mahjong_seed.sql against DATABASE_RPG_URL.
 * Usage: node scripts/seed-mahjong.js
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
        console.error('[Seed:Mahjong] DATABASE_RPG_URL not set');
        process.exit(1);
    }

    const conn = await mysql.createConnection({ uri: url, multipleStatements: true });
    try {
        const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'mahjong_schema.sql'), 'utf8');
        console.log('[Seed:Mahjong] Running mahjong_schema.sql...');
        await conn.query(schemaSql);

        const seedSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'mahjong_seed.sql'), 'utf8');
        const trimmedSeed = seedSql.replace(/(^|\n)\s*--[^\n]*/g, '').trim();
        if (trimmedSeed) {
            console.log('[Seed:Mahjong] Running mahjong_seed.sql...');
            await conn.query(seedSql);
        } else {
            console.log('[Seed:Mahjong] No seed rows to insert (catalog is code-defined).');
        }

        const [tables] = await conn.query("SHOW TABLES LIKE 'mahjong\\_%'");
        console.log(`[Seed:Mahjong] Done. ${tables.length} mahjong_* tables present:`);
        for (const t of tables) console.log('  -', Object.values(t)[0]);
        const counts = {};
        for (const t of ['mahjong_users', 'mahjong_scores']) {
            const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM ${t}`);
            counts[t] = row.n;
        }
        console.table(counts);
    } finally {
        await conn.end();
    }
}

main().catch((err) => {
    console.error('[Seed:Mahjong] Failed:', err.message);
    process.exit(1);
});
