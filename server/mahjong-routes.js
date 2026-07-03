/**
 * Mahjong Solitaire backend routes (/api/mahjong/*).
 * Serves from MySQL via the RPG pool (DATABASE_RPG_URL), injected with setDbPool().
 * Handles first-run registration (email + IP + location), score submission and
 * the global leaderboard ordered by total points then best IQ.
 */
const API_PREFIX = '/api/mahjong';
const MAX_BODY_BYTES = 16 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GEO_LOOKUP_TIMEOUT_MS = 2500;
const LEADERBOARD_LIMIT = 100;
const MAX_LEVEL = 9999;
const MAX_TILES = 100000;
const MAX_TIME_MS = 24 * 60 * 60 * 1000;
const MAX_POINTS = 100000000;
const IQ_MIN = 40;
const IQ_MAX = 250;

// Rank system defaults (used when mahjong_settings has no row yet).
const RANK_UP_DAYS_DEFAULT = 7;
const RANK_UP_TOP_N_DEFAULT = 3;
const RANK_MIN_ORDER = 1;
// Fixed epoch anchoring the global promotion periods.
const RANK_EPOCH_MS = Date.UTC(2024, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

let dbPool = null;
let tablesReady = false;

function setDbPool(pool) {
    dbPool = pool;
    tablesReady = false;
}

async function ensureTables() {
    if (tablesReady || !dbPool) return;
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS mahjong_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            email VARCHAR(255) NOT NULL,
            ip VARCHAR(45) NOT NULL DEFAULT 'unknown',
            location VARCHAR(255) NOT NULL DEFAULT 'unknown',
            total_points BIGINT NOT NULL DEFAULT 0,
            best_iq DECIMAL(6,1) NOT NULL DEFAULT 0,
            best_level INT NOT NULL DEFAULT 0,
            games_won INT NOT NULL DEFAULT 0,
            rank_order INT NOT NULL DEFAULT 1,
            rank_updated_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY idx_mahjong_users_user (user_id),
            UNIQUE KEY idx_mahjong_users_email (email),
            KEY idx_mahjong_users_points (total_points),
            KEY idx_mahjong_users_iq (best_iq),
            KEY idx_mahjong_users_rank (rank_order)
        )
    `);
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS mahjong_scores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            level INT NOT NULL,
            tiles INT NOT NULL,
            time_ms INT NOT NULL,
            points INT NOT NULL,
            iq DECIMAL(6,1) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_mahjong_scores_user (user_id),
            KEY idx_mahjong_scores_created (created_at),
            CONSTRAINT fk_mahjong_scores_user FOREIGN KEY (user_id) REFERENCES mahjong_users (user_id) ON DELETE CASCADE
        )
    `);
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS mahjong_ranks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            rank_order INT NOT NULL,
            name VARCHAR(64) NOT NULL,
            color VARCHAR(16) NOT NULL DEFAULT '#c8d0dc',
            icon VARCHAR(16) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY idx_mahjong_ranks_order (rank_order)
        )
    `);
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS mahjong_settings (
            setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
            setting_value BIGINT NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    // Idempotent migration: widen IQ columns to decimal for pre-existing tables.
    await migrateIqColumns();
    await migrateRankColumns();
    await seedRankDefaults();
    tablesReady = true;
}

async function migrateIqColumns() {
    try {
        await dbPool.query('ALTER TABLE mahjong_users MODIFY best_iq DECIMAL(6,1) NOT NULL DEFAULT 0');
        await dbPool.query('ALTER TABLE mahjong_scores MODIFY iq DECIMAL(6,1) NOT NULL');
    } catch (err) {
        console.warn('[Mahjong] IQ column migration skipped:', err.message);
    }
}

async function migrateRankColumns() {
    try {
        const [cols] = await dbPool.query("SHOW COLUMNS FROM mahjong_users LIKE 'rank_order'");
        if (cols.length === 0) {
            await dbPool.query('ALTER TABLE mahjong_users ADD COLUMN rank_order INT NOT NULL DEFAULT 1');
            await dbPool.query('ALTER TABLE mahjong_users ADD COLUMN rank_updated_at DATETIME NULL');
            await dbPool.query('ALTER TABLE mahjong_users ADD KEY idx_mahjong_users_rank (rank_order)');
            console.log('[Mahjong] Rank columns added to mahjong_users');
        }
    } catch (err) {
        console.warn('[Mahjong] Rank column migration skipped:', err.message);
    }
}

/** Seeds default settings rows when missing (rank rows come from db/mahjong_seed.sql). */
async function seedRankDefaults() {
    try {
        await dbPool.query(
            `INSERT IGNORE INTO mahjong_settings (setting_key, setting_value) VALUES
             ('rank_up_days', ?), ('rank_up_top_n', ?), ('rank_last_period', 0)`,
            [RANK_UP_DAYS_DEFAULT, RANK_UP_TOP_N_DEFAULT],
        );
    } catch (err) {
        console.warn('[Mahjong] Rank settings seed skipped:', err.message);
    }
}

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
            if (!body) { resolve({}); return; }
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function isPublicIp(ip) {
    if (!ip || ip === 'unknown') return false;
    if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.')) return false;
    if (ip.startsWith('10.') || ip.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
    if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return false;
    return true;
}

async function resolveLocationFromIp(ip) {
    if (!isPublicIp(ip)) return 'unknown';
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);
        const resp = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`, { signal: controller.signal });
        clearTimeout(timer);
        if (!resp.ok) return 'unknown';
        const data = await resp.json();
        if (!data || data.status !== 'success') return 'unknown';
        const parts = [data.city, data.regionName, data.country].filter(Boolean);
        return parts.length ? parts.join(', ').slice(0, 255) : 'unknown';
    } catch (err) {
        console.warn('[Mahjong] IP geolocation failed:', err.message);
        return 'unknown';
    }
}

function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const clamped = Math.min(max, Math.max(min, n));
    return Math.round(clamped * 10) / 10;
}

function displayNameFromEmail(email) {
    const local = String(email || '').split('@')[0] || 'player';
    return local.slice(0, 32);
}

// ── Rank system ──────────────────────────────────────────────────────────────

async function getRankSettings() {
    const [rows] = await dbPool.query('SELECT setting_key, setting_value FROM mahjong_settings');
    const map = {};
    for (const row of rows) map[row.setting_key] = Number(row.setting_value);
    return {
        days: map.rank_up_days > 0 ? map.rank_up_days : RANK_UP_DAYS_DEFAULT,
        topN: map.rank_up_top_n > 0 ? map.rank_up_top_n : RANK_UP_TOP_N_DEFAULT,
        lastPeriod: Number.isFinite(map.rank_last_period) ? map.rank_last_period : 0,
    };
}

/**
 * Lazy promotion sweep: when a global period of `rank_up_days` days rolls
 * over, the top `rank_up_top_n` players of each rank (by points earned in the
 * closed period, only if > 0) move up one rank. The period index is claimed
 * atomically so concurrent requests run the sweep once.
 */
async function processRankPeriods() {
    try {
        const settings = await getRankSettings();
        const periodMs = settings.days * DAY_MS;
        const currentPeriod = Math.floor((Date.now() - RANK_EPOCH_MS) / periodMs);
        if (currentPeriod <= settings.lastPeriod) return;

        const [claim] = await dbPool.query(
            "UPDATE mahjong_settings SET setting_value = ? WHERE setting_key = 'rank_last_period' AND setting_value = ?",
            [currentPeriod, settings.lastPeriod],
        );
        if (claim.affectedRows !== 1) return; // Another worker claimed this sweep.

        // Evaluate only the most recently closed period (avoids mass catch-up
        // promotions on first deploy, when lastPeriod is far behind).
        const startSec = (RANK_EPOCH_MS + (currentPeriod - 1) * periodMs) / 1000;
        const endSec = startSec + periodMs / 1000;
        const [[{ maxRank }]] = await dbPool.query('SELECT COALESCE(MAX(rank_order), 1) AS maxRank FROM mahjong_ranks');

        // Top ranks first so nobody is promoted twice in one sweep.
        for (let rank = maxRank - 1; rank >= RANK_MIN_ORDER; rank--) {
            const [winners] = await dbPool.query(
                `SELECT s.user_id
                 FROM mahjong_scores s
                 JOIN mahjong_users u ON u.user_id = s.user_id
                 WHERE u.rank_order = ? AND s.created_at >= FROM_UNIXTIME(?) AND s.created_at < FROM_UNIXTIME(?)
                 GROUP BY s.user_id
                 HAVING SUM(s.points) > 0
                 ORDER BY SUM(s.points) DESC
                 LIMIT ?`,
                [rank, startSec, endSec, settings.topN],
            );
            if (winners.length === 0) continue;
            const ids = winners.map((w) => w.user_id);
            await dbPool.query(
                'UPDATE mahjong_users SET rank_order = rank_order + 1, rank_updated_at = NOW() WHERE user_id IN (?)',
                [ids],
            );
            console.log(`[Mahjong] Rank up: ${ids.length} player(s) promoted from rank ${rank} to ${rank + 1}`);
        }
    } catch (err) {
        console.warn('[Mahjong] Rank period sweep failed:', err.message);
    }
}

/**
 * Rank snapshot for a player: current rank row plus the position inside the
 * same-rank cohort by points earned in the current (open) period.
 */
async function getRankInfo(userId) {
    try {
        const settings = await getRankSettings();
        const periodMs = settings.days * DAY_MS;
        const currentPeriod = Math.floor((Date.now() - RANK_EPOCH_MS) / periodMs);
        const periodStartSec = (RANK_EPOCH_MS + currentPeriod * periodMs) / 1000;
        const periodEndsAt = RANK_EPOCH_MS + (currentPeriod + 1) * periodMs;

        const [[user]] = await dbPool.query(
            'SELECT rank_order FROM mahjong_users WHERE user_id = ? LIMIT 1',
            [userId],
        );
        if (!user) return null;
        const rankOrder = user.rank_order || RANK_MIN_ORDER;

        const [[rankRow]] = await dbPool.query(
            'SELECT name, color, icon FROM mahjong_ranks WHERE rank_order = ? LIMIT 1',
            [rankOrder],
        );
        const [[{ maxRank }]] = await dbPool.query('SELECT COALESCE(MAX(rank_order), 1) AS maxRank FROM mahjong_ranks');

        const [[mine]] = await dbPool.query(
            'SELECT COALESCE(SUM(points), 0) AS pts FROM mahjong_scores WHERE user_id = ? AND created_at >= FROM_UNIXTIME(?)',
            [userId, periodStartSec],
        );
        const myPoints = Number(mine.pts);

        const [[ahead]] = await dbPool.query(
            `SELECT COUNT(*) AS n FROM (
                SELECT s.user_id
                FROM mahjong_scores s
                JOIN mahjong_users u ON u.user_id = s.user_id
                WHERE u.rank_order = ? AND u.user_id <> ? AND s.created_at >= FROM_UNIXTIME(?)
                GROUP BY s.user_id
                HAVING SUM(s.points) > ?
            ) t`,
            [rankOrder, userId, periodStartSec, myPoints],
        );
        const [[cohort]] = await dbPool.query(
            'SELECT COUNT(*) AS n FROM mahjong_users WHERE rank_order = ?',
            [rankOrder],
        );

        return {
            rankOrder,
            maxRank: Number(maxRank),
            rankName: rankRow ? rankRow.name : `Rank ${rankOrder}`,
            color: rankRow ? rankRow.color : '#c8d0dc',
            icon: rankRow ? rankRow.icon : '',
            position: Number(ahead.n) + 1,
            cohortSize: Number(cohort.n),
            periodPoints: myPoints,
            rankUpTopN: settings.topN,
            rankUpDays: settings.days,
            periodEndsAt,
        };
    } catch (err) {
        console.warn('[Mahjong] Rank info failed:', err.message);
        return null;
    }
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function handleRegister(req, res) {
    const body = await readBody(req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email) || email.length > 255) {
        sendJson(res, 400, { error: 'A valid email is required' });
        return;
    }
    const ip = getClientIp(req);
    let location = (typeof body.location === 'string' && body.location.trim())
        ? body.location.trim().slice(0, 255)
        : '';
    if (!location) {
        location = await resolveLocationFromIp(ip);
    }

    const crypto = require('crypto');
    const newUserId = crypto.randomUUID();
    await dbPool.query(
        `INSERT INTO mahjong_users (user_id, email, ip, location)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE ip = VALUES(ip), location = VALUES(location)`,
        [newUserId, email, ip, location],
    );

    const [[user]] = await dbPool.query(
        'SELECT user_id, email, total_points, best_iq, best_level FROM mahjong_users WHERE email = ? LIMIT 1',
        [email],
    );
    if (!user) {
        sendJson(res, 500, { error: 'Registration failed' });
        return;
    }
    console.log(`[Mahjong] Registered/login: ${email} -> ${user.user_id} (${location})`);
    sendJson(res, 200, {
        userId: user.user_id,
        email: user.email,
        name: displayNameFromEmail(user.email),
        totalPoints: Number(user.total_points),
        bestIq: Number(user.best_iq),
        bestLevel: user.best_level,
    });
}

async function handlePlayer(req, res) {
    const query = new URL(req.url, 'http://localhost').searchParams;
    const userId = query.get('userId');
    if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return;
    }
    const [[user]] = await dbPool.query(
        'SELECT user_id, email, total_points, best_iq, best_level, games_won FROM mahjong_users WHERE user_id = ? LIMIT 1',
        [userId],
    );
    if (!user) {
        sendJson(res, 404, { error: 'Player not found' });
        return;
    }
    const rank = await getRankInfo(user.user_id);
    sendJson(res, 200, {
        userId: user.user_id,
        email: user.email,
        name: displayNameFromEmail(user.email),
        totalPoints: Number(user.total_points),
        bestIq: Number(user.best_iq),
        bestLevel: user.best_level,
        gamesWon: user.games_won,
        rank,
    });
}

async function handleScore(req, res) {
    const body = await readBody(req);
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!userId) {
        sendJson(res, 400, { error: 'userId is required' });
        return;
    }
    const [[user]] = await dbPool.query(
        'SELECT user_id FROM mahjong_users WHERE user_id = ? LIMIT 1',
        [userId],
    );
    if (!user) {
        sendJson(res, 404, { error: 'Player not found' });
        return;
    }

    const level = clampInt(body.level, 1, MAX_LEVEL, 1);
    const tiles = clampInt(body.tiles, 0, MAX_TILES, 0);
    const timeMs = clampInt(body.timeMs, 0, MAX_TIME_MS, 0);
    const points = clampInt(body.points, 0, MAX_POINTS, 0);
    const iq = clampFloat(body.iq, IQ_MIN, IQ_MAX, IQ_MIN);
    const won = body.won === 1 || body.won === true || body.won === '1';

    await dbPool.query(
        'INSERT INTO mahjong_scores (user_id, level, tiles, time_ms, points, iq) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, level, tiles, timeMs, points, iq],
    );
    await dbPool.query(
        `UPDATE mahjong_users
         SET total_points = total_points + ?,
             best_iq = GREATEST(best_iq, ?),
             best_level = GREATEST(best_level, ?),
             games_won = games_won + ?
         WHERE user_id = ?`,
        [points, iq, won ? level : 0, won ? 1 : 0, userId],
    );

    const [[updated]] = await dbPool.query(
        'SELECT total_points, best_iq, best_level FROM mahjong_users WHERE user_id = ? LIMIT 1',
        [userId],
    );
    console.log(`[Mahjong] Score saved: ${userId} level=${level} points=${points} iq=${iq} won=${won ? 1 : 0}`);
    const rank = await getRankInfo(userId);
    sendJson(res, 200, {
        ok: true,
        totalPoints: Number(updated.total_points),
        bestIq: Number(updated.best_iq),
        bestLevel: updated.best_level,
        rank,
    });
}

async function handleLeaderboard(req, res) {
    const query = new URL(req.url, 'http://localhost').searchParams;
    const selfId = query.get('userId') || '';
    const [rows] = await dbPool.query(
        `SELECT user_id, email, total_points, best_iq, best_level
         FROM mahjong_users
         WHERE total_points > 0
         ORDER BY total_points DESC, best_iq DESC
         LIMIT ?`,
        [LEADERBOARD_LIMIT],
    );
    const entries = rows.map((row, index) => ({
        rank: index + 1,
        name: displayNameFromEmail(row.email),
        totalPoints: Number(row.total_points),
        iq: Number(row.best_iq),
        level: row.best_level,
        isSelf: row.user_id === selfId,
    }));
    sendJson(res, 200, entries);
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Returns true when the request was handled (matched /api/mahjong/*).
 */
async function handleMahjongRoutes(req, res) {
    const urlPath = req.url.split('?')[0];
    if (!urlPath.startsWith(API_PREFIX)) return false;
    const route = urlPath.substring(API_PREFIX.length) || '/';
    const method = req.method;

    if (!dbPool) {
        sendJson(res, 503, { error: 'Database not available' });
        return true;
    }

    try {
        await ensureTables();
        await processRankPeriods();

        if (method === 'POST' && route === '/register') { await handleRegister(req, res); return true; }
        if (method === 'GET' && route === '/player') { await handlePlayer(req, res); return true; }
        if (method === 'POST' && route === '/score') { await handleScore(req, res); return true; }
        if (method === 'GET' && route === '/leaderboard') { await handleLeaderboard(req, res); return true; }

        sendJson(res, 404, { error: 'Unknown Mahjong route' });
        return true;
    } catch (err) {
        console.error('[Mahjong] Route error:', err.message);
        sendJson(res, 500, { error: 'Internal error' });
        return true;
    }
}

module.exports = { handleMahjongRoutes, setDbPool };
