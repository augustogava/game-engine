const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

// ── Env loader ───────────────────────────────────────────────────────────────
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    const vars = {};
    if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
            const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
            if (match) vars[match[1]] = match[2];
        });
    }
    return vars;
}
const env = loadEnv();
const DATABASE_URL = process.env.DATABASE_URL || env.DATABASE_URL || '';

// ── MySQL pool ───────────────────────────────────────────────────────────────
let dbPool = null;

async function initDatabase() {
    if (!DATABASE_URL) {
        console.warn('[DB] No DATABASE_URL configured — registration disabled.');
        return;
    }
    try {
        dbPool = mysql.createPool({
            uri: DATABASE_URL,
            waitForConnections: true,
            connectionLimit: 10,
        });
        await dbPool.execute(`
            CREATE TABLE IF NOT EXISTS game_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                email VARCHAR(255) NOT NULL,
                ip VARCHAR(45) NOT NULL,
                location VARCHAR(255) DEFAULT 'unknown',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY idx_user_id (user_id)
            )
        `);
        console.log('[DB] Connected and game_sessions table ready.');
    } catch (err) {
        console.error('[DB] Init failed:', err.message);
        dbPool = null;
    }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

function jsonResponse(res, status, data) {
    const payload = JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(payload);
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket.remoteAddress || 'unknown';
}

// ── Static file MIME types ───────────────────────────────────────────────────
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.map': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.glb': 'model/gltf-binary',
};

// ── HTTP server ──────────────────────────────────────────────────────────────
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const server = http.createServer(async (req, res) => {
    // Inject CORS on every response
    const _writeHead = res.writeHead.bind(res);
    res.writeHead = (status, headers) => {
        const merged = { ...CORS_HEADERS, ...(typeof headers === 'object' ? headers : {}) };
        return _writeHead(status, merged);
    };

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API: register
    if (req.method === 'POST' && req.url.split('?')[0] === '/api/register') {
        try {
            if (!dbPool) {
                jsonResponse(res, 503, { error: 'Database not available' });
                return;
            }
            const { email, location } = await readJsonBody(req);
            if (!email || typeof email !== 'string') {
                jsonResponse(res, 400, { error: 'Email is required' });
                return;
            }
            const userId = crypto.randomUUID();
            const ip = getClientIp(req);
            const loc = (location && typeof location === 'string') ? location : 'unknown';
            await dbPool.execute(
                'INSERT INTO game_sessions (user_id, email, ip, location) VALUES (?, ?, ?, ?)',
                [userId, email.trim(), ip, loc],
            );
            console.log(`[API] Registered: ${email.trim()} -> ${userId}`);
            jsonResponse(res, 200, { userId });
        } catch (err) {
            console.error('[API] Register error:', err.message);
            jsonResponse(res, 500, { error: 'Registration failed' });
        }
        return;
    }

    // Static files from dist/
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(DIST_DIR, urlPath);
    const ext = path.extname(filePath).toLowerCase();

    if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - Not Found</h1>');
            } else {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
            return;
        }

        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const headers = {
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
        };

        if (ext === '.html') {
            headers['Cache-Control'] = 'no-cache';
        } else if (['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2'].includes(ext)) {
            headers['Cache-Control'] = 'public, max-age=31536000, immutable';
        }

        res.writeHead(200, headers);
        res.end(data);
    });
});

// ── WebSocket multiplayer ────────────────────────────────────────────────────
const players = new Map();

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/ws') {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', (ws) => {
    let playerId = null;

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);

            if (msg.type === 'join' && msg.userId) {
                playerId = msg.userId;
                players.set(playerId, { ws, state: null });
                const onlineCount = players.size;
                ws.send(JSON.stringify({ type: 'welcome', onlineCount }));
                broadcast({ type: 'playerJoined', onlineCount });
                console.log(`[WS] Player joined: ${playerId} (online: ${onlineCount})`);
            }

            if (msg.type === 'update' && playerId) {
                const entry = players.get(playerId);
                if (entry) {
                    entry.state = {
                        userId: playerId,
                        lat: msg.lat,
                        lon: msg.lon,
                        alt: msg.alt,
                        airspeed: msg.airspeed,
                        throttle: msg.throttle,
                        heading: msg.heading,
                        pitch: msg.pitch,
                        roll: msg.roll,
                    };
                }
            }
        } catch (e) { /* ignore malformed */ }
    });

    ws.on('close', () => {
        if (playerId) {
            players.delete(playerId);
            const onlineCount = players.size;
            broadcast({ type: 'playerLeft', userId: playerId, onlineCount });
            console.log(`[WS] Player left: ${playerId} (online: ${onlineCount})`);
        }
    });

    ws.on('error', () => {
        if (playerId) players.delete(playerId);
    });
});

function broadcast(msg) {
    const payload = JSON.stringify(msg);
    for (const [, entry] of players) {
        if (entry.ws.readyState === 1) {
            try { entry.ws.send(payload); } catch (e) { /* ignore */ }
        }
    }
}

// Broadcast all player states at 20Hz
setInterval(() => {
    if (players.size === 0) return;

    for (const [selfId, selfEntry] of players) {
        if (selfEntry.ws.readyState !== 1) continue;
        const others = [];
        for (const [otherId, otherEntry] of players) {
            if (otherId !== selfId && otherEntry.state) {
                others.push(otherEntry.state);
            }
        }
        try {
            selfEntry.ws.send(JSON.stringify({ type: 'state', players: others }));
        } catch (e) { /* ignore */ }
    }
}, 50);

// ── Start ────────────────────────────────────────────────────────────────────
initDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Production server running on port ${PORT}`);
    });
});
