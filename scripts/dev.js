const esbuild = require('esbuild');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = 3002;

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
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

// ── 2D Games bundle (IIFE, existing) ────────────────────────────────────────
const ctx2D = esbuild.context({
    entryPoints: ['src/main.ts', 'src/shooter-main.ts', 'src/rpg-main.ts', 'src/ocean-main.ts', 'src/gta-main.ts'],
    bundle: true,
    outdir: 'dist',
    sourcemap: true,
    target: 'es2020',
    format: 'iife',
    logLevel: 'info',
});

// ── 3D Flight Game build options ─────────────────────────────────────────────
const flight3dOpts = {
    entryPoints: ['src/flight-main.ts'],
    bundle: true,
    outdir: 'dist',
    sourcemap: true,
    target: 'es2022',
    format: 'esm',
    splitting: false,
    logLevel: 'info',
    external: ['three', 'three/*'],
    define: {
        '__GOOGLE_MAPS_API_KEY__': JSON.stringify(env.GOOGLE_MAPS_API_KEY || ''),
    },
};

let building3D = false;
async function buildFlight() {
    if (building3D) return;
    building3D = true;
    try {
        await esbuild.build(flight3dOpts);
    } catch (e) {
        console.error('[3D build error]', e.message);
    }
    building3D = false;
}

ctx2D.then(async (c2D) => {
    await c2D.watch();
    await buildFlight();
    await initDatabase();

    const srcDir = path.join(__dirname, '..', 'src');
    fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
        if (filename && /\.(ts|js)$/.test(filename)) {
            console.log(`[watch] build started (change: "src/${filename.replace(/\\/g, '/')}")`);
            buildFlight().then(() => console.log('[watch] build finished'));
        }
    });

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
                const userId = uuidv4();
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

        // Static files from project root
        let filePath = req.url === '/' ? '/index.html' : req.url;
        const fullPath = path.join(__dirname, '..', decodeURIComponent(filePath.split('?')[0]));

        fs.readFile(fullPath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            const ext = path.extname(fullPath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.map': 'application/json',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.glb': 'model/gltf-binary',
                '.glb_file': 'model/gltf-binary',
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
            res.end(data);
        });
    });

    // ── WebSocket multiplayer ────────────────────────────────────────────────
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
                    broadcastDev({ type: 'playerJoined', onlineCount });
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
                broadcastDev({ type: 'playerLeft', userId: playerId, onlineCount });
                console.log(`[WS] Player left: ${playerId} (online: ${onlineCount})`);
            }
        });

        ws.on('error', () => {
            if (playerId) players.delete(playerId);
        });
    });

    function broadcastDev(msg) {
        const payload = JSON.stringify(msg);
        for (const [, entry] of players) {
            if (entry.ws.readyState === 1) {
                try { entry.ws.send(payload); } catch (e) { /* ignore */ }
            }
        }
    }

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

    server.listen(PORT, () => {
        console.log(`\n🚀 Dev server running at http://localhost:${PORT}\n`);
    });
});
