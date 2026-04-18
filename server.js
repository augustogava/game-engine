const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

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
const SECRET_KEY = process.env.SECRET_KEY || env.SECRET_KEY || '';

// ── MySQL pool ───────────────────────────────────────────────────────────────
let dbPool = null;

async function initDatabase() {
    if (!DATABASE_URL) {
        console.warn('[DB] No DATABASE_URL — registration and stats disabled.');
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
                user_id INT NOT NULL,
                username VARCHAR(100) NOT NULL,
                ip VARCHAR(45) NOT NULL,
                connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                disconnected_at DATETIME DEFAULT NULL,
                flight_duration_min DECIMAL(10,2) DEFAULT NULL,
                INDEX idx_game_sessions_user (user_id),
                INDEX idx_game_sessions_connected (connected_at)
            )
        `);
        console.log('[DB] Connected and tables ready.');
    } catch (err) {
        console.error('[DB] Init failed:', err.message);
        dbPool = null;
    }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function jsonResponse(res, status, data) {
    const payload = JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(payload);
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

// ── Haversine (nautical miles) ────────────────────────────────────────────────
function haversineNm(lat1, lon1, lat2, lon2) {
    const R = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ── Unit conversions (game sends metric, DB stores aviation) ─────────────────
const METERS_TO_FEET = 3.28084;
const KMH_TO_KNOTS = 1 / 1.852;

// ── Find nearest airport ─────────────────────────────────────────────────────
async function findNearestAirport(lat, lon, radiusNm) {
    if (!dbPool) return null;
    try {
        const [rows] = await dbPool.execute(
            `SELECT id, icao_code, name, latitude, longitude,
                    (3440.065 * ACOS(
                        LEAST(1, GREATEST(-1,
                            COS(RADIANS(?)) * COS(RADIANS(latitude)) *
                            COS(RADIANS(longitude) - RADIANS(?)) +
                            SIN(RADIANS(?)) * SIN(RADIANS(latitude))
                        ))
                    )) AS dist_nm
             FROM airports
             WHERE is_active = 1
             HAVING dist_nm < ?
             ORDER BY dist_nm ASC
             LIMIT 1`,
            [lat, lon, lat, radiusNm]
        );
        return rows.length ? rows[0] : null;
    } catch (err) {
        console.error('[DB] Nearest airport query error:', err.message);
        return null;
    }
}

// ── Finalize flight log ──────────────────────────────────────────────────────
async function finalizeFlight(userId, entry, status, lastMsg) {
    if (!entry.flightLogId || !dbPool) return;

    const durationMin = (Date.now() - entry.flightStartTime) / 60000;
    const distKm = entry.flightDistanceNm * 1.852;
    const avgSpeed = entry.speedSamples.length
        ? entry.speedSamples.reduce((a, b) => a + b, 0) / entry.speedSamples.length
        : null;

    let arrivalAirportId = null;
    if (status === 'landed' && lastMsg) {
        const airport = await findNearestAirport(lastMsg.lat, lastMsg.lon, 5);
        if (airport) arrivalAirportId = airport.id;
    }

    const maxAltFt = Math.round(entry.maxAltitudeFt * METERS_TO_FEET);
    const avgSpeedKnots = avgSpeed ? Math.round(avgSpeed * KMH_TO_KNOTS * 100) / 100 : null;
    const landingFpm = status === 'landed' ? Math.round(entry.lastVerticalFpm * METERS_TO_FEET) : null;

    try {
        await dbPool.execute(
            `UPDATE flight_logs SET
                status = ?,
                arrival_airport_id = ?,
                arrival_time = NOW(),
                flight_duration_min = ?,
                distance_km = ?,
                distance_nm = ?,
                max_altitude_ft = ?,
                avg_speed_knots = ?,
                landing_rate_fpm = ?,
                route_data = ?
             WHERE id = ?`,
            [
                status,
                arrivalAirportId,
                Math.round(durationMin),
                Math.round(distKm * 100) / 100,
                Math.round(entry.flightDistanceNm * 100) / 100,
                maxAltFt,
                avgSpeedKnots,
                landingFpm,
                JSON.stringify(entry.routePoints),
                entry.flightLogId,
            ]
        );
        console.log(`[Flight] ${status}: user ${userId}, log ${entry.flightLogId}, ${Math.round(durationMin)}min, ${Math.round(entry.flightDistanceNm)}nm`);
    } catch (err) {
        console.error(`[DB] Flight log finalize error:`, err.message);
    }

    entry.flightLogId = null;
    entry.departureAirportId = null;
    entry.isAirborne = false;
    entry.maxAltitudeFt = 0;
    entry.speedSamples = [];
    entry.routePoints = [];
    entry.flightDistanceNm = 0;
    entry.flightStartTime = null;
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

    // API: online player count
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/online-count') {
        jsonResponse(res, 200, { count: players.size });
        return;
    }

    // API: online player positions (for map)
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/players') {
        const list = [];
        for (const [id, entry] of players) {
            if (entry.state) {
                list.push({
                    userId: id,
                    username: entry.username,
                    lat: entry.state.lat,
                    lon: entry.state.lon,
                    alt: entry.state.alt,
                    heading: entry.state.heading,
                    airspeed: entry.state.airspeed,
                    aircraft: entry.state.aircraft || null,
                });
            }
        }
        jsonResponse(res, 200, { data: list });
        return;
    }

    // API: platform statistics
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/stats') {
        const statsStart = Date.now();
        if (!dbPool) {
            jsonResponse(res, 200, {
                airports: 0, missions: 0, registeredPilots: 0,
                totalFlightHours: 0, onlineNow: players.size
            });
            return;
        }
        try {
            const [[airports]] = await dbPool.execute(
                "SELECT COUNT(*) AS cnt FROM airports WHERE is_active = 1"
            );
            const [[missions]] = await dbPool.execute(
                "SELECT COUNT(*) AS cnt FROM missions WHERE is_active = 1"
            );
            const [[pilots]] = await dbPool.execute(
                "SELECT COUNT(*) AS cnt FROM users WHERE is_enabled = 1"
            );
            const [[hours]] = await dbPool.execute(
                "SELECT COALESCE(SUM(total_flight_hours), 0) AS total FROM user_flight_stats"
            );

            jsonResponse(res, 200, {
                airports: airports.cnt || 0,
                missions: missions.cnt || 0,
                registeredPilots: pilots.cnt || 0,
                totalFlightHours: Math.round(hours.total || 0),
                onlineNow: players.size,
            });
            console.log(`[API] /api/stats responded in ${Date.now() - statsStart}ms`);
        } catch (err) {
            console.error('[API] Stats error:', err.message);
            jsonResponse(res, 200, {
                airports: 0, missions: 0, registeredPilots: 0,
                totalFlightHours: 0, onlineNow: players.size
            });
        }
        return;
    }

    // Health check (Railway)
    if (req.method === 'GET' && req.url.split('?')[0] === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
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
const joinAttempts = new Map();

setInterval(() => {
    const cutoff = Date.now() - 60000;
    for (const [ip, a] of joinAttempts) {
        if (a.firstAttempt < cutoff) joinAttempts.delete(ip);
    }
}, 300000);

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
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const clientIp = (ws._socket?.remoteAddress || '').replace('::ffff:', '');

    ws.on('message', async (raw) => {
        try {
            const msg = JSON.parse(raw);

            if (msg.type === 'join') {
                const attempts = joinAttempts.get(clientIp) || { count: 0, firstAttempt: Date.now() };
                if (attempts.count >= 5 && (Date.now() - attempts.firstAttempt) < 60000) {
                    ws.close(4003, 'Too many attempts');
                    return;
                }

                if (!msg.token || !SECRET_KEY) {
                    attempts.count++;
                    joinAttempts.set(clientIp, attempts);
                    ws.close(4001, 'Authentication required');
                    return;
                }

                let decoded;
                try {
                    decoded = jwt.verify(msg.token, SECRET_KEY);
                } catch (err) {
                    attempts.count++;
                    joinAttempts.set(clientIp, attempts);
                    console.log(`[WS] Invalid token: ${err.message}`);
                    ws.close(4001, 'Invalid or expired token');
                    return;
                }

                joinAttempts.delete(clientIp);

                if (!decoded.id || !decoded.username) {
                    console.log('[WS] Token missing id or username');
                    ws.close(4001, 'Invalid token payload');
                    return;
                }

                playerId = decoded.id;
                const username = decoded.username;

                const existing = players.get(playerId);
                if (existing) {
                    if (dbPool) {
                        if (existing.flightLogId) {
                            await finalizeFlight(playerId, existing, 'cancelled', existing.state);
                        }

                        const sm = (Date.now() - existing.lastPersist) / 60000;
                        const hi = sm / 60;
                        const dk = existing.distanceNm * 1.852;
                        dbPool.execute(
                            `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, last_flight_at)
                             VALUES (?, 1, ?, ?, ?, NOW())
                             ON DUPLICATE KEY UPDATE
                               total_flights      = total_flights + 1,
                               total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                               total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                               total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                               last_flight_at = NOW()`,
                            [playerId, hi, existing.distanceNm, dk]
                        ).catch(() => {});

                        if (existing.sessionDbId) {
                            const dur = (Date.now() - existing.sessionStart) / 60000;
                            dbPool.execute(
                                `UPDATE game_sessions SET disconnected_at = NOW(), flight_duration_min = ? WHERE id = ?`,
                                [dur, existing.sessionDbId]
                            ).catch(() => {});
                        }
                    }
                    try { existing.ws.close(4000, 'Replaced by new session'); } catch (_) {}
                }

                players.set(playerId, {
                    ws,
                    state: null,
                    username,
                    sessionStart: Date.now(),
                    lastPersist: Date.now(),
                    distanceNm: 0,
                    prevLat: null,
                    prevLon: null,
                    flightLogId: null,
                    departureAirportId: null,
                    isAirborne: false,
                    maxAltitudeFt: 0,
                    speedSamples: [],
                    routePoints: [],
                    lastRouteSample: 0,
                    flightStartTime: null,
                    flightDistanceNm: 0,
                    prevAlt: undefined,
                    lastVerticalFpm: 0,
                });

                if (dbPool) {
                    const ip = (ws._socket?.remoteAddress || '').replace('::ffff:', '');
                    dbPool.execute(
                        `INSERT INTO game_sessions (user_id, username, ip) VALUES (?, ?, ?)`,
                        [playerId, username, ip]
                    ).then(([result]) => {
                        const entry = players.get(playerId);
                        if (entry) entry.sessionDbId = result.insertId;
                    }).catch(err => console.error('[DB] Session insert error:', err.message));
                }

                const onlineCount = players.size;
                ws.send(JSON.stringify({ type: 'welcome', userId: playerId, username, onlineCount }));
                broadcast({ type: 'playerJoined', userId: playerId, username, onlineCount });
                console.log(`[WS] Player joined: ${username} (id: ${playerId}, online: ${onlineCount})`);
            }

            if (msg.type === 'update' && playerId) {
                const lat = Number(msg.lat);
                const lon = Number(msg.lon);
                const alt = Number(msg.alt);
                const airspeed = Number(msg.airspeed);
                if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt) || !Number.isFinite(airspeed)) return;

                const entry = players.get(playerId);
                if (entry) {
                    entry.state = {
                        userId: playerId,
                        lat,
                        lon,
                        alt,
                        airspeed,
                        throttle: Number(msg.throttle) || 0,
                        heading: Number(msg.heading) || 0,
                        pitch: Number(msg.pitch) || 0,
                        roll: Number(msg.roll) || 0,
                        aircraft: msg.aircraft || null,
                    };

                    let stepNm = 0;
                    if (entry.prevLat !== null && entry.prevLon !== null) {
                        stepNm = haversineNm(entry.prevLat, entry.prevLon, lat, lon);
                        if (stepNm < 50) {
                            entry.distanceNm += stepNm;
                        } else {
                            stepNm = 0;
                        }
                    }
                    entry.prevLat = lat;
                    entry.prevLon = lon;

                    if (entry.prevAlt !== undefined) {
                        const dtSeconds = 0.05;
                        entry.lastVerticalFpm = ((alt - entry.prevAlt) / dtSeconds) * 60;
                    }
                    entry.prevAlt = alt;

                    if (!entry.flightLogId && dbPool) {
                        const airport = await findNearestAirport(lat, lon, 5);
                        if (airport) entry.departureAirportId = airport.id;

                        try {
                            const [result] = await dbPool.execute(
                                `INSERT INTO flight_logs
                                 (user_id, departure_airport_id, aircraft_type, departure_time, status)
                                 VALUES (?, ?, ?, NOW(), 'departed')`,
                                [playerId, entry.departureAirportId, msg.aircraft || null]
                            );
                            entry.flightLogId = result.insertId;
                            entry.flightStartTime = Date.now();
                            entry.maxAltitudeFt = alt || 0;
                            entry.speedSamples = [];
                            entry.routePoints = [];
                            entry.flightDistanceNm = 0;
                            entry.isAirborne = false;
                            entry.lastRouteSample = Date.now();
                            console.log(`[Flight] Departure logged for user ${playerId}, log id: ${entry.flightLogId}`);
                        } catch (err) {
                            console.error(`[DB] Flight log insert error:`, err.message);
                        }
                    }

                    if (entry.flightLogId) {
                        if (alt > entry.maxAltitudeFt) entry.maxAltitudeFt = alt;
                        if (airspeed > 0) entry.speedSamples.push(airspeed);
                        entry.flightDistanceNm += stepNm;

                        const now = Date.now();
                        if (now - entry.lastRouteSample > 10000) {
                            entry.routePoints.push([
                                Math.round(lat * 10000) / 10000,
                                Math.round(lon * 10000) / 10000,
                                Math.round(alt)
                            ]);
                            entry.lastRouteSample = now;
                        }

                        if (!entry.isAirborne && alt > 200 && airspeed > 30) {
                            entry.isAirborne = true;
                            dbPool.execute(
                                `UPDATE flight_logs SET status = 'in_flight' WHERE id = ?`,
                                [entry.flightLogId]
                            ).catch(() => {});
                        }

                        const onGround = msg.onGround === true;
                        if (entry.isAirborne && onGround) {
                            await finalizeFlight(playerId, entry, 'landed', entry.state);
                        }
                    }
                }
            }
        } catch (e) { /* ignore malformed */ }
    });

    ws.on('close', async () => {
        if (playerId) {
            const entry = players.get(playerId);
            if (entry && dbPool) {
                if (entry.flightLogId) {
                    await finalizeFlight(playerId, entry, 'cancelled', entry.state);
                }

                const sessionMinutes = (Date.now() - entry.lastPersist) / 60000;
                const hoursIncrement = sessionMinutes / 60;
                const distKm = entry.distanceNm * 1.852;
                try {
                    await dbPool.execute(
                        `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, last_flight_at)
                         VALUES (?, 1, ?, ?, ?, NOW())
                         ON DUPLICATE KEY UPDATE
                           total_flights      = total_flights + 1,
                           total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                           total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                           total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                           last_flight_at = NOW()`,
                        [playerId, hoursIncrement, entry.distanceNm, distKm]
                    );
                } catch (err) {
                    console.error(`[DB] Final persist error for user ${playerId}:`, err.message);
                }

                if (entry.sessionDbId) {
                    const durationMin = (Date.now() - entry.sessionStart) / 60000;
                    dbPool.execute(
                        `UPDATE game_sessions SET disconnected_at = NOW(), flight_duration_min = ? WHERE id = ?`,
                        [durationMin, entry.sessionDbId]
                    ).catch(err => console.error('[DB] Session update error:', err.message));
                }
            }

            players.delete(playerId);
            const onlineCount = players.size;
            broadcast({ type: 'playerLeft', userId: playerId, onlineCount });
            console.log(`[WS] Player left: ${playerId} (online: ${onlineCount})`);
        }
    });

    ws.on('error', (err) => {
        console.error(`[WS] Error for player ${playerId}:`, err.message);
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

// Periodic stats flush every 30 seconds
setInterval(async () => {
    if (!dbPool || players.size === 0) return;

    for (const [userId, entry] of players) {
        const now = Date.now();
        const sessionMinutes = (now - entry.lastPersist) / 60000;
        if (sessionMinutes < 0.5) continue;

        const hoursIncrement = sessionMinutes / 60;
        const distKm = entry.distanceNm * 1.852;

        try {
            await dbPool.execute(
                `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, last_flight_at)
                 VALUES (?, 0, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                   total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                   total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                   total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                   last_flight_at = NOW()`,
                [userId, hoursIncrement, entry.distanceNm, distKm]
            );
        } catch (err) {
            console.error(`[DB] Stats persist error for user ${userId}:`, err.message);
        }

        entry.distanceNm = 0;
        entry.lastPersist = now;
    }
}, 30000);

// Ping/pong heartbeat + stale connection cleanup
setInterval(() => {
    for (const [userId, entry] of players) {
        if (entry.ws.isAlive === false) {
            console.log(`[WS] Stale connection detected for user ${userId}, cleaning up`);
            entry.ws.terminate();
            continue;
        }
        entry.ws.isAlive = false;
        entry.ws.ping();
    }
}, 30000);

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function gracefulShutdown() {
    console.log('[Server] Shutting down...');
    server.close();

    for (const [userId, entry] of players) {
        if (dbPool) {
            if (entry.flightLogId) {
                await finalizeFlight(userId, entry, 'cancelled', entry.state);
            }

            const sessionMinutes = (Date.now() - entry.lastPersist) / 60000;
            const hoursIncrement = sessionMinutes / 60;
            const distKm = entry.distanceNm * 1.852;
            try {
                await dbPool.execute(
                    `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, last_flight_at)
                     VALUES (?, 1, ?, ?, ?, NOW())
                     ON DUPLICATE KEY UPDATE
                       total_flights      = total_flights + 1,
                       total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                       total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                       total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                       last_flight_at = NOW()`,
                    [userId, hoursIncrement, entry.distanceNm, distKm]
                );
            } catch (_) {}

            if (entry.sessionDbId) {
                const dur = (Date.now() - entry.sessionStart) / 60000;
                try {
                    await dbPool.execute(
                        `UPDATE game_sessions SET disconnected_at = NOW(), flight_duration_min = ? WHERE id = ?`,
                        [dur, entry.sessionDbId]
                    );
                } catch (_) {}
            }
        }
        try { entry.ws.close(1001, 'Server shutting down'); } catch (_) {}
    }

    players.clear();

    if (dbPool) {
        try { await dbPool.end(); } catch (_) {}
    }

    console.log('[Server] Shutdown complete.');
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ── Start ────────────────────────────────────────────────────────────────────
initDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Production server running on port ${PORT}`);
    });
});
