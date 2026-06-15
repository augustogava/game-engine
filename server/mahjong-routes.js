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
            best_iq INT NOT NULL DEFAULT 0,
            best_level INT NOT NULL DEFAULT 0,
            games_won INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY idx_mahjong_users_user (user_id),
            UNIQUE KEY idx_mahjong_users_email (email),
            KEY idx_mahjong_users_points (total_points),
            KEY idx_mahjong_users_iq (best_iq)
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
            iq INT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_mahjong_scores_user (user_id),
            KEY idx_mahjong_scores_created (created_at),
            CONSTRAINT fk_mahjong_scores_user FOREIGN KEY (user_id) REFERENCES mahjong_users (user_id) ON DELETE CASCADE
        )
    `);
    tablesReady = true;
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

function displayNameFromEmail(email) {
    const local = String(email || '').split('@')[0] || 'player';
    return local.slice(0, 32);
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
        bestIq: user.best_iq,
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
    sendJson(res, 200, {
        userId: user.user_id,
        email: user.email,
        name: displayNameFromEmail(user.email),
        totalPoints: Number(user.total_points),
        bestIq: user.best_iq,
        bestLevel: user.best_level,
        gamesWon: user.games_won,
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
    const iq = clampInt(body.iq, IQ_MIN, IQ_MAX, IQ_MIN);

    await dbPool.query(
        'INSERT INTO mahjong_scores (user_id, level, tiles, time_ms, points, iq) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, level, tiles, timeMs, points, iq],
    );
    await dbPool.query(
        `UPDATE mahjong_users
         SET total_points = total_points + ?,
             best_iq = GREATEST(best_iq, ?),
             best_level = GREATEST(best_level, ?),
             games_won = games_won + 1
         WHERE user_id = ?`,
        [points, iq, level, userId],
    );

    const [[updated]] = await dbPool.query(
        'SELECT total_points, best_iq, best_level FROM mahjong_users WHERE user_id = ? LIMIT 1',
        [userId],
    );
    console.log(`[Mahjong] Score saved: ${userId} level=${level} points=${points} iq=${iq}`);
    sendJson(res, 200, {
        ok: true,
        totalPoints: Number(updated.total_points),
        bestIq: updated.best_iq,
        bestLevel: updated.best_level,
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
        iq: row.best_iq,
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
