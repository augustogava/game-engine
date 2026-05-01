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
const MAIN_API_URL = process.env.MAIN_API_URL || env.MAIN_API_URL || '';

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
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

// ── Configurable game constants ──────────────────────────────────────────────
const POINTS_PER_KM      = 0.1;
const POINTS_PER_LANDING = 0;

// ── HTTP infrastructure helpers ──────────────────────────────────────────────
function parseBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
            catch (_) { resolve(null); }
        });
        req.on('error', () => resolve(null));
    });
}

function authenticateRequest(req) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || !SECRET_KEY) return null;
    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        if (!decoded.id || !decoded.username) return null;
        return { id: decoded.id, username: decoded.username };
    } catch (_) {
        return null;
    }
}

// ── Proxy to main API ────────────────────────────────────────────────────────
async function proxyToMainApi(apiPath, req, res, body) {
    if (!MAIN_API_URL) {
        return jsonResponse(res, 503, { error: 'Main API not configured' });
    }
    const targetUrl = `${MAIN_API_URL}${apiPath}`;
    const headers = { 'Content-Type': 'application/json' };
    const auth = req.headers['authorization'];
    if (auth) headers['Authorization'] = auth;

    try {
        const options = { method: req.method, headers };
        if (body) options.body = JSON.stringify(body);
        const resp = await fetch(targetUrl, options);
        const data = await resp.json();
        return jsonResponse(res, resp.status, data);
    } catch (err) {
        console.error(`[Proxy] ${req.method} ${apiPath} error:`, err.message);
        return jsonResponse(res, 502, { error: 'Main API unreachable' });
    }
}

function matchRoute(method, urlPath, pattern) {
    const parts = urlPath.split('/');
    const patParts = pattern.split('/');
    if (parts.length !== patParts.length) return null;
    const params = {};
    for (let i = 0; i < patParts.length; i++) {
        if (patParts[i].startsWith(':')) {
            params[patParts[i].slice(1)] = parts[i];
        } else if (patParts[i] !== parts[i]) {
            return null;
        }
    }
    return params;
}

function getQueryParams(url) {
    const idx = url.indexOf('?');
    if (idx === -1) return {};
    const params = {};
    new URLSearchParams(url.slice(idx)).forEach((v, k) => { params[k] = v; });
    return params;
}

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

    const elapsed = entry.flightStartTime ? (Date.now() - entry.flightStartTime) : 0;
    const durationMin = elapsed > 0 ? elapsed / 60000 : 0;
    const distKm = entry.flightDistanceNm * 1.852;
    const avgSpeed = entry.speedSamples.length
        ? entry.speedSamples.reduce((a, b) => a + b, 0) / entry.speedSamples.length
        : null;

    let arrivalAirportId = null;
    if (status === 'landed' && lastMsg) {
        const airport = await findNearestAirport(lastMsg.lat, lastMsg.lon, 5);
        if (airport) arrivalAirportId = airport.id;
    }

    if (lastMsg) {
        entry.routePoints.push([
            Math.round(lastMsg.lat * 10000) / 10000,
            Math.round(lastMsg.lon * 10000) / 10000,
            Math.round(lastMsg.alt || 0)
        ]);
    }

    const maxAltFt = Math.round(entry.maxAltitudeFt * METERS_TO_FEET);
    const avgSpeedKnots = avgSpeed ? Math.round(avgSpeed * KMH_TO_KNOTS * 100) / 100 : null;
    const landingFpm = status === 'landed' ? Math.round(entry.lastVerticalFpm * METERS_TO_FEET) : null;
    const finalDuration = Math.round(durationMin * 100) / 100;
    const finalDistKm = Math.round(distKm * 100) / 100;
    const finalDistNm = Math.round(entry.flightDistanceNm * 100) / 100;

    console.log(`[Flight] Finalizing: user=${userId}, log=${entry.flightLogId}, status=${status}, elapsed=${elapsed}ms, duration=${finalDuration}min, dist=${finalDistKm}km, maxAlt=${maxAltFt}ft, avgSpd=${avgSpeedKnots}kts, routePts=${entry.routePoints.length}, startTime=${entry.flightStartTime}`);

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
                finalDuration,
                finalDistKm,
                finalDistNm,
                maxAltFt,
                avgSpeedKnots,
                landingFpm,
                JSON.stringify(entry.routePoints),
                entry.flightLogId,
            ]
        );
        console.log(`[Flight] ${status}: user ${userId}, log ${entry.flightLogId}, ${finalDuration}min, ${finalDistNm}nm`);
    } catch (err) {
        console.error(`[DB] Flight log finalize error:`, err.message);
    }

    if (entry.userMissionId && entry.missionId) {
        try {
            if (status === 'landed') {
                const [mRows] = await dbPool.execute(
                    `SELECT arrival_airport_id FROM missions WHERE id = ?`, [entry.missionId]);
                const mission = mRows.length ? mRows[0] : null;
                const missionArrival = mission ? mission.arrival_airport_id : null;
                if (!missionArrival || (arrivalAirportId && arrivalAirportId === missionArrival)) {
                    await dbPool.execute(
                        `UPDATE user_missions SET status = 'completed', completed_at = NOW() WHERE id = ?`,
                        [entry.userMissionId]);
                    console.log(`[Mission] Completed: user ${userId}, userMission ${entry.userMissionId}`);
                } else {
                    await dbPool.execute(
                        `UPDATE user_missions SET status = 'failed' WHERE id = ?`,
                        [entry.userMissionId]);
                    console.log(`[Mission] Failed (wrong airport): user ${userId}, userMission ${entry.userMissionId}`);
                }
            } else {
                await dbPool.execute(
                    `UPDATE user_missions SET status = 'failed' WHERE id = ?`,
                    [entry.userMissionId]);
                console.log(`[Mission] Failed (${status}): user ${userId}, userMission ${entry.userMissionId}`);
            }
        } catch (err) {
            console.error(`[DB] Mission auto-update error:`, err.message);
        }
    }

    if (status === 'landed') {
        const ok = await recalculateStats(userId);
        if (ok) {
            entry.distanceNm = 0;
            entry.lastPersist = Date.now();
            entry.statsRecalculated = true;
        }
    }

    entry.flightLogId = null;
    entry.creatingFlightLog = false;
    entry.departureAirportId = null;
    entry.departureAlt = 0;
    entry.isAirborne = false;
    entry.maxAltitudeFt = 0;
    entry.speedSamples = [];
    entry.routePoints = [];
    entry.flightDistanceNm = 0;
    entry.flightStartTime = null;
    entry.missionId = null;
    entry.userMissionId = null;
    entry.aircraftRegistration = null;
    entry.prevAlt = undefined;
    entry.lastUpdateTime = 0;
    entry.lastVerticalFpm = 0;
    entry.onGroundCount = 0;
}

// ── Pilot rank calculation ───────────────────────────────────────────────────
function computePilotRank(hours, missionsCompleted) {
    if (hours >= 1000 && missionsCompleted >= 100) return 'senior_captain';
    if (hours >= 500  && missionsCompleted >= 50)  return 'captain';
    if (hours >= 200  && missionsCompleted >= 25)  return 'airline_pilot';
    if (hours >= 50   && missionsCompleted >= 10)  return 'commercial_pilot';
    if (hours >= 10   && missionsCompleted >= 2)   return 'private_pilot';
    return 'student';
}

// ── Recalculate full stats for a user ────────────────────────────────────────
async function recalculateStats(userId) {
    if (!dbPool) return false;
    try {
        const [[flightAgg]] = await dbPool.execute(
            `SELECT COUNT(*) AS cnt,
                    COALESCE(SUM(flight_duration_min), 0) / 60 AS hours,
                    COALESCE(SUM(distance_km), 0) AS dist_km,
                    COALESCE(SUM(distance_nm), 0) AS dist_nm,
                    MAX(landing_rate_fpm) AS best_lr,
                    AVG(landing_rate_fpm) AS avg_lr
             FROM flight_logs WHERE user_id = ? AND status = 'landed'`,
            [userId]
        );

        const [[missionAgg]] = await dbPool.execute(
            `SELECT COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END), 0) AS completed,
                    COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END), 0) AS failed
             FROM user_missions WHERE user_id = ?`,
            [userId]
        );

        const [[missionPts]] = await dbPool.execute(
            `SELECT COALESCE(SUM(m.reward_points), 0) AS pts
             FROM user_missions um JOIN missions m ON um.mission_id = m.id
             WHERE um.user_id = ? AND um.status = 'completed'`,
            [userId]
        );

        const distancePoints = Math.floor((flightAgg.dist_km || 0) * POINTS_PER_KM);
        const landingPoints = (flightAgg.cnt || 0) * POINTS_PER_LANDING;
        const totalPoints = (missionPts.pts || 0) + distancePoints + landingPoints;

        let favAirportId = null;
        const [favRows] = await dbPool.execute(
            `SELECT departure_airport_id AS aid, COUNT(*) AS cnt
             FROM flight_logs WHERE user_id = ? AND departure_airport_id IS NOT NULL AND status = 'landed'
             GROUP BY departure_airport_id ORDER BY cnt DESC LIMIT 1`,
            [userId]
        );
        if (favRows.length) favAirportId = favRows[0].aid;

        let mostAircraftId = null;
        const [acRows] = await dbPool.execute(
            `SELECT aircraft_id, COUNT(*) AS cnt
             FROM flight_logs WHERE user_id = ? AND aircraft_id IS NOT NULL AND status = 'landed'
             GROUP BY aircraft_id ORDER BY cnt DESC LIMIT 1`,
            [userId]
        );
        if (acRows.length) mostAircraftId = acRows[0].aircraft_id;

        const rank = computePilotRank(flightAgg.hours || 0, missionAgg.completed || 0);

        await dbPool.execute(
            `INSERT INTO user_flight_stats
                (user_id, total_flights, total_flight_hours, total_distance_km, total_distance_nm,
                 total_missions_completed, total_missions_failed, total_reward_points,
                 best_landing_rate_fpm, avg_landing_rate_fpm,
                 favorite_airport_id, most_used_aircraft_id, pilot_rank, last_flight_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
                total_flights            = GREATEST(total_flights, VALUES(total_flights)),
                total_flight_hours       = GREATEST(total_flight_hours, VALUES(total_flight_hours)),
                total_distance_km        = GREATEST(total_distance_km, VALUES(total_distance_km)),
                total_distance_nm        = GREATEST(total_distance_nm, VALUES(total_distance_nm)),
                total_missions_completed = VALUES(total_missions_completed),
                total_missions_failed    = VALUES(total_missions_failed),
                total_reward_points      = GREATEST(total_reward_points, VALUES(total_reward_points)),
                best_landing_rate_fpm    = VALUES(best_landing_rate_fpm),
                avg_landing_rate_fpm     = VALUES(avg_landing_rate_fpm),
                favorite_airport_id      = VALUES(favorite_airport_id),
                most_used_aircraft_id    = VALUES(most_used_aircraft_id),
                pilot_rank               = VALUES(pilot_rank),
                last_flight_at           = NOW()`,
            [
                userId,
                flightAgg.cnt || 0,
                Math.round((flightAgg.hours || 0) * 100) / 100,
                Math.round((flightAgg.dist_km || 0) * 100) / 100,
                Math.round((flightAgg.dist_nm || 0) * 100) / 100,
                missionAgg.completed || 0,
                missionAgg.failed || 0,
                totalPoints,
                flightAgg.best_lr != null ? Math.round(flightAgg.best_lr * 100) / 100 : null,
                flightAgg.avg_lr != null ? Math.round(flightAgg.avg_lr * 100) / 100 : null,
                favAirportId,
                mostAircraftId,
                rank,
            ]
        );
        console.log(`[Stats] Recalculated for user ${userId}: ${flightAgg.cnt} flights, rank=${rank}, pts=${totalPoints}`);
        return true;
    } catch (err) {
        console.error(`[DB] recalculateStats error for user ${userId}:`, err.message);
        return false;
    }
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
                    aircraftId: entry.state.aircraftId || null,
                    aircraftCode: entry.state.aircraftCode || null,
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

    const urlPath = req.url.split('?')[0];
    const query = getQueryParams(req.url);

    // ── Missions API ─────────────────────────────────────────────────────

    if (req.method === 'GET' && urlPath === '/api/missions') {
        if (!dbPool) return jsonResponse(res, 200, { data: [], total: 0, page: 1, limit: 20 });
        const page = Math.max(1, parseInt(query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
        const offset = (page - 1) * limit;
        let where = 'WHERE m.is_active = 1';
        const params = [];
        if (query.type) { where += ' AND m.type = ?'; params.push(query.type); }
        if (query.difficulty) { where += ' AND m.difficulty = ?'; params.push(query.difficulty); }
        try {
            const [[{ total }]] = await dbPool.execute(`SELECT COUNT(*) AS total FROM missions m ${where}`, params);
            const [rows] = await dbPool.execute(
                `SELECT m.*, da.name AS departure_airport_name, da.latitude AS departure_lat, da.longitude AS departure_lon, da.icao_code AS departure_icao,
                        aa.name AS arrival_airport_name, aa.latitude AS arrival_lat, aa.longitude AS arrival_lon, aa.icao_code AS arrival_icao
                 FROM missions m
                 LEFT JOIN airports da ON m.departure_airport_id = da.id
                 LEFT JOIN airports aa ON m.arrival_airport_id = aa.id
                 ${where} ORDER BY m.sort_order, m.id LIMIT ${limit} OFFSET ${offset}`, params);
            return jsonResponse(res, 200, { data: rows, total, page, limit });
        } catch (err) {
            console.error('[API] GET /api/missions error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    let routeParams;
    if (req.method === 'GET' && (routeParams = matchRoute(req.method, urlPath, '/api/missions/:id'))) {
        if (!dbPool) return jsonResponse(res, 404, { error: 'Not found' });
        const { id } = routeParams;
        try {
            const [rows] = await dbPool.execute(
                `SELECT m.*, da.name AS departure_airport_name, da.icao_code AS departure_icao, da.latitude AS departure_lat, da.longitude AS departure_lon,
                        aa.name AS arrival_airport_name, aa.icao_code AS arrival_icao, aa.latitude AS arrival_lat, aa.longitude AS arrival_lon
                 FROM missions m
                 LEFT JOIN airports da ON m.departure_airport_id = da.id
                 LEFT JOIN airports aa ON m.arrival_airport_id = aa.id
                 WHERE m.id = ?`, [id]);
            if (!rows.length) return jsonResponse(res, 404, { error: 'Mission not found' });
            return jsonResponse(res, 200, rows[0]);
        } catch (err) {
            console.error('[API] GET /api/missions/:id error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'POST' && urlPath === '/api/user-missions') {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 503, { error: 'Database unavailable' });
        const body = await parseBody(req);
        if (!body || !body.mission_id) return jsonResponse(res, 400, { error: 'mission_id is required' });
        try {
            const [existing] = await dbPool.execute(
                `SELECT id FROM user_missions WHERE user_id = ? AND mission_id = ? AND status IN ('started','in_progress')`,
                [user.id, body.mission_id]);
            if (existing.length) return jsonResponse(res, 409, { error: 'Mission already in progress' });
            const [result] = await dbPool.execute(
                `INSERT INTO user_missions (user_id, mission_id, status, started_at) VALUES (?, ?, 'started', NOW())`,
                [user.id, body.mission_id]);
            return jsonResponse(res, 201, { id: result.insertId, message: 'Mission started' });
        } catch (err) {
            console.error('[API] POST /api/user-missions error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'GET' && urlPath === '/api/user-missions/active') {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 200, { data: [] });
        try {
            const [rows] = await dbPool.execute(
                `SELECT um.*, m.title AS mission_title, m.type AS mission_type,
                        m.difficulty AS mission_difficulty,
                        da.name AS departure_airport_name, da.latitude AS departure_lat, da.longitude AS departure_lon, da.icao_code AS departure_icao,
                        aa.name AS arrival_airport_name, aa.latitude AS arrival_lat, aa.longitude AS arrival_lon, aa.icao_code AS arrival_icao
                 FROM user_missions um
                 JOIN missions m ON um.mission_id = m.id
                 LEFT JOIN airports da ON m.departure_airport_id = da.id
                 LEFT JOIN airports aa ON m.arrival_airport_id = aa.id
                 WHERE um.user_id = ? AND um.status IN ('started','in_progress')
                 ORDER BY um.created_at DESC`, [user.id]);
            return jsonResponse(res, 200, { data: rows });
        } catch (err) {
            console.error('[API] GET /api/user-missions/active error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'GET' && urlPath === '/api/user-missions') {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 200, { data: [] });
        try {
            const [rows] = await dbPool.execute(
                `SELECT um.*, m.title AS mission_title, m.type AS mission_type,
                        m.difficulty AS mission_difficulty,
                        da.name AS departure_airport_name, da.latitude AS departure_lat, da.longitude AS departure_lon, da.icao_code AS departure_icao,
                        aa.name AS arrival_airport_name, aa.latitude AS arrival_lat, aa.longitude AS arrival_lon, aa.icao_code AS arrival_icao
                 FROM user_missions um
                 JOIN missions m ON um.mission_id = m.id
                 LEFT JOIN airports da ON m.departure_airport_id = da.id
                 LEFT JOIN airports aa ON m.arrival_airport_id = aa.id
                 WHERE um.user_id = ? ORDER BY um.created_at DESC`, [user.id]);
            return jsonResponse(res, 200, { data: rows });
        } catch (err) {
            console.error('[API] GET /api/user-missions error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'PUT' && (routeParams = matchRoute(req.method, urlPath, '/api/user-missions/:id/complete'))) {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 503, { error: 'Database unavailable' });
        const { id } = routeParams;
        try {
            const [rows] = await dbPool.execute(
                `SELECT id FROM user_missions WHERE id = ? AND user_id = ?`, [id, user.id]);
            if (!rows.length) return jsonResponse(res, 404, { error: 'User mission not found' });
            await dbPool.execute(
                `UPDATE user_missions SET status = 'completed', completed_at = NOW() WHERE id = ?`, [id]);
            await recalculateStats(user.id);
            return jsonResponse(res, 200, { message: 'Mission completed' });
        } catch (err) {
            console.error('[API] PUT /api/user-missions/:id/complete error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'PUT' && (routeParams = matchRoute(req.method, urlPath, '/api/user-missions/:id'))) {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 503, { error: 'Database unavailable' });
        const { id } = routeParams;
        const body = await parseBody(req);
        if (!body) return jsonResponse(res, 400, { error: 'Request body required' });
        try {
            const [rows] = await dbPool.execute(
                `SELECT id FROM user_missions WHERE id = ? AND user_id = ?`, [id, user.id]);
            if (!rows.length) return jsonResponse(res, 404, { error: 'User mission not found' });
            const sets = []; const vals = [];
            if (body.status) { sets.push('status = ?'); vals.push(body.status); }
            if (body.score !== undefined) { sets.push('score = ?'); vals.push(body.score); }
            if (body.notes !== undefined) { sets.push('notes = ?'); vals.push(body.notes); }
            if (body.status === 'completed') { sets.push('completed_at = NOW()'); }
            if (!sets.length) return jsonResponse(res, 400, { error: 'No fields to update' });
            vals.push(id);
            await dbPool.execute(`UPDATE user_missions SET ${sets.join(', ')} WHERE id = ?`, vals);
            if (body.status === 'completed' || body.status === 'failed') await recalculateStats(user.id);
            return jsonResponse(res, 200, { message: 'Mission updated' });
        } catch (err) {
            console.error('[API] PUT /api/user-missions/:id error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    // ── Flight Logs API ──────────────────────────────────────────────────

    if (req.method === 'GET' && urlPath === '/api/flight-logs/recent') {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 200, { data: [] });
        try {
            const [rows] = await dbPool.execute(
                `SELECT fl.*, da.name AS departure_name, da.icao_code AS departure_icao,
                        aa.name AS arrival_name, aa.icao_code AS arrival_icao
                 FROM flight_logs fl
                 LEFT JOIN airports da ON fl.departure_airport_id = da.id
                 LEFT JOIN airports aa ON fl.arrival_airport_id = aa.id
                 WHERE fl.user_id = ? ORDER BY fl.departure_time DESC LIMIT 10`, [user.id]);
            return jsonResponse(res, 200, { data: rows });
        } catch (err) {
            console.error('[API] GET /api/flight-logs/recent error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'GET' && urlPath === '/api/flight-logs') {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 200, { data: [], total: 0, page: 1, limit: 20 });
        const page = Math.max(1, parseInt(query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
        const offset = (page - 1) * limit;
        try {
            const [[{ total }]] = await dbPool.execute(
                `SELECT COUNT(*) AS total FROM flight_logs WHERE user_id = ?`, [user.id]);
            const [rows] = await dbPool.execute(
                `SELECT fl.*, da.name AS departure_name, da.icao_code AS departure_icao,
                        aa.name AS arrival_name, aa.icao_code AS arrival_icao
                 FROM flight_logs fl
                 LEFT JOIN airports da ON fl.departure_airport_id = da.id
                 LEFT JOIN airports aa ON fl.arrival_airport_id = aa.id
                 WHERE fl.user_id = ? ORDER BY fl.departure_time DESC LIMIT ${limit} OFFSET ${offset}`, [user.id]);
            return jsonResponse(res, 200, { data: rows, total, page, limit });
        } catch (err) {
            console.error('[API] GET /api/flight-logs error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    // ── Flight Stats API ─────────────────────────────────────────────────

    if (req.method === 'GET' && urlPath === '/api/flight-stats/leaderboard') {
        if (!dbPool) return jsonResponse(res, 200, { data: [] });
        try {
            const [rows] = await dbPool.execute(
                `SELECT ufs.*, u.username
                 FROM user_flight_stats ufs
                 JOIN users u ON ufs.user_id = u.id
                 ORDER BY ufs.total_flight_hours DESC LIMIT 20`);
            return jsonResponse(res, 200, { data: rows });
        } catch (err) {
            console.error('[API] GET /api/flight-stats/leaderboard error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'GET' && urlPath === '/api/flight-stats/platform') {
        if (!dbPool) return jsonResponse(res, 200, { airports: 0, missions: 0, activePilots: 0, totalFlightHours: 0, onlineNow: players.size });
        try {
            const [[a]] = await dbPool.execute("SELECT COUNT(*) AS cnt FROM airports WHERE is_active = 1");
            const [[m]] = await dbPool.execute("SELECT COUNT(*) AS cnt FROM missions WHERE is_active = 1");
            const [[p]] = await dbPool.execute("SELECT COUNT(*) AS cnt FROM users WHERE is_enabled = 1");
            const [[h]] = await dbPool.execute("SELECT COALESCE(SUM(total_flight_hours), 0) AS total FROM user_flight_stats");
            return jsonResponse(res, 200, {
                airports: a.cnt || 0, missions: m.cnt || 0,
                activePilots: p.cnt || 0,
                totalFlightHours: Math.round(h.total || 0),
                onlineNow: players.size,
            });
        } catch (err) {
            console.error('[API] GET /api/flight-stats/platform error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'PUT' && urlPath === '/api/flight-stats/recalculate') {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        await recalculateStats(user.id);
        return jsonResponse(res, 200, { message: 'Stats recalculated' });
    }

    if (req.method === 'GET' && urlPath === '/api/flight-stats') {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 200, {
            user_id: user.id, total_flights: 0, total_flight_hours: 0,
            total_distance_km: 0, total_distance_nm: 0,
            total_missions_completed: 0, total_missions_failed: 0, total_reward_points: 0,
            most_used_aircraft_id: null, pilot_rank: 'student',
            best_landing_rate_fpm: null, avg_landing_rate_fpm: null,
        });
        try {
            const [rows] = await dbPool.execute(
                `SELECT * FROM user_flight_stats WHERE user_id = ?`, [user.id]);
            if (rows.length) return jsonResponse(res, 200, rows[0]);
            return jsonResponse(res, 200, {
                user_id: user.id, total_flights: 0, total_flight_hours: 0,
                total_distance_km: 0, total_distance_nm: 0,
                total_missions_completed: 0, total_missions_failed: 0, total_reward_points: 0,
                most_used_aircraft_id: null, pilot_rank: 'student',
                best_landing_rate_fpm: null, avg_landing_rate_fpm: null,
            });
        } catch (err) {
            console.error('[API] GET /api/flight-stats error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    // ── Marketplace API ──────────────────────────────────────────────────

    if (req.method === 'GET' && urlPath === '/api/marketplace/purchases') {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 200, { data: [] });
        try {
            const [rows] = await dbPool.execute(
                `SELECT ph.*, ml.description AS listing_description
                 FROM purchase_history ph
                 LEFT JOIN marketplace_listings ml ON ph.listing_id = ml.id
                 WHERE ph.user_id = ? ORDER BY ph.created_at DESC`, [user.id]);
            return jsonResponse(res, 200, { data: rows });
        } catch (err) {
            console.error('[API] GET /api/marketplace/purchases error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'GET' && urlPath === '/api/marketplace') {
        if (!dbPool) return jsonResponse(res, 200, { data: [], total: 0, page: 1, limit: 20 });
        const page = Math.max(1, parseInt(query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
        const offset = (page - 1) * limit;
        let where = "WHERE ml.status = 'active'";
        const params = [];
        if (query.listing_type) { where += ' AND ml.listing_type = ?'; params.push(query.listing_type); }
        try {
            const [[{ total }]] = await dbPool.execute(`SELECT COUNT(*) AS total FROM marketplace_listings ml ${where}`, params);
            const [rows] = await dbPool.execute(
                `SELECT ml.*, u.username AS seller_name
                 FROM marketplace_listings ml
                 LEFT JOIN users u ON ml.seller_id = u.id
                 ${where} ORDER BY ml.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
            return jsonResponse(res, 200, { data: rows, total, page, limit });
        } catch (err) {
            console.error('[API] GET /api/marketplace error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'POST' && (routeParams = matchRoute(req.method, urlPath, '/api/marketplace/:id/acquire'))) {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 503, { error: 'Database unavailable' });
        const { id } = routeParams;
        try {
            const [listings] = await dbPool.execute(
                `SELECT * FROM marketplace_listings WHERE id = ? AND status = 'active'`, [id]);
            if (!listings.length) return jsonResponse(res, 404, { error: 'Listing not found or inactive' });
            const listing = listings[0];
            const [dup] = await dbPool.execute(
                `SELECT id FROM purchase_history WHERE user_id = ? AND listing_id = ? AND status = 'completed'`,
                [user.id, id]);
            if (dup.length) return jsonResponse(res, 409, { error: 'Already acquired' });
            const [result] = await dbPool.execute(
                `INSERT INTO purchase_history (user_id, listing_id, listing_type, title, price, currency, status, payment_method)
                 VALUES (?, ?, ?, ?, ?, ?, 'completed', 'free')`,
                [user.id, id, listing.listing_type, listing.title, listing.price, listing.currency]);
            if (listing.listing_type === 'airport' && listing.airport_id) {
                await dbPool.execute(
                    `INSERT IGNORE INTO user_airports (user_id, airport_id, is_owned) VALUES (?, ?, 1)`,
                    [user.id, listing.airport_id]);
            }
            return jsonResponse(res, 201, { id: result.insertId, message: 'Item acquired successfully' });
        } catch (err) {
            console.error('[API] POST /api/marketplace/:id/acquire error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    // ── Airports API ─────────────────────────────────────────────────────

    if (req.method === 'GET' && urlPath === '/api/airports/acquired') {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 200, { data: [] });
        try {
            const [rows] = await dbPool.execute(
                `SELECT ua.*, a.name, a.icao_code, a.iata_code, a.type, a.country_code, a.municipality
                 FROM user_airports ua JOIN airports a ON ua.airport_id = a.id
                 WHERE ua.user_id = ?`, [user.id]);
            return jsonResponse(res, 200, { data: rows });
        } catch (err) {
            console.error('[API] GET /api/airports/acquired error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'POST' && (routeParams = matchRoute(req.method, urlPath, '/api/airports/:id/acquire'))) {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Authentication required' });
        if (!dbPool) return jsonResponse(res, 503, { error: 'Database unavailable' });
        const { id } = routeParams;
        try {
            const [airports] = await dbPool.execute(`SELECT id FROM airports WHERE id = ? AND is_active = 1`, [id]);
            if (!airports.length) return jsonResponse(res, 404, { error: 'Airport not found' });
            await dbPool.execute(
                `INSERT IGNORE INTO user_airports (user_id, airport_id, is_owned) VALUES (?, ?, 1)`,
                [user.id, id]);
            return jsonResponse(res, 201, { message: 'Airport acquired' });
        } catch (err) {
            console.error('[API] POST /api/airports/:id/acquire error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    // ── Aircrafts API (proxy to main API) ─────────────────────────────

    if (req.method === 'GET' && urlPath === '/api/aircrafts') {
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return proxyToMainApi(`/api/aircrafts${qs}`, req, res);
    }

    if (req.method === 'GET' && (routeParams = matchRoute(req.method, urlPath, '/api/aircrafts/:id'))) {
        return proxyToMainApi(`/api/aircrafts/${routeParams.id}`, req, res);
    }

    if (req.method === 'GET' && urlPath === '/api/user-aircrafts') {
        return proxyToMainApi('/api/user-aircrafts', req, res);
    }

    if (req.method === 'POST' && (routeParams = matchRoute(req.method, urlPath, '/api/user-aircrafts/:id/select'))) {
        return proxyToMainApi(`/api/user-aircrafts/${routeParams.id}/select`, req, res, await parseBody(req));
    }

    if (req.method === 'POST' && (routeParams = matchRoute(req.method, urlPath, '/api/user-aircrafts/:id/acquire'))) {
        return proxyToMainApi(`/api/user-aircrafts/${routeParams.id}/acquire`, req, res, await parseBody(req));
    }

    // Static files from dist/
    let staticPath = decodeURIComponent(urlPath);
    if (staticPath === '/') staticPath = '/index.html';

    const filePath = path.join(DIST_DIR, staticPath);
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

                        if (!existing.statsRecalculated) {
                            const sm = (Date.now() - existing.lastPersist) / 60000;
                            const hi = sm / 60;
                            const dk = existing.distanceNm * 1.852;
                            dbPool.execute(
                                `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, total_reward_points, last_flight_at)
                                 VALUES (?, 1, ?, ?, ?, FLOOR(? * ?), NOW())
                                 ON DUPLICATE KEY UPDATE
                                   total_flights      = total_flights + 1,
                                   total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                                   total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                                   total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                                   total_reward_points = GREATEST(total_reward_points, FLOOR((total_distance_km + VALUES(total_distance_km)) * ?)),
                                   last_flight_at = NOW()`,
                                [playerId, hi, existing.distanceNm, dk, dk, POINTS_PER_KM, POINTS_PER_KM]
                            ).catch(() => {});
                        }

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
                    creatingFlightLog: false,
                    departureAirportId: null,
                    departureAlt: 0,
                    isAirborne: false,
                    maxAltitudeFt: 0,
                    speedSamples: [],
                    routePoints: [],
                    lastRouteSample: 0,
                    flightStartTime: null,
                    flightDistanceNm: 0,
                    prevAlt: undefined,
                    lastUpdateTime: 0,
                    lastVerticalFpm: 0,
                    missionId: null,
                    userMissionId: null,
                    aircraftRegistration: null,
                    statsRecalculated: false,
                    onGroundCount: 0,
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
                        aircraftId: msg.aircraftId ? Number(msg.aircraftId) : null,
                        aircraftCode: msg.aircraftCode || null,
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

                    const nowMs = Date.now();
                    if (entry.prevAlt !== undefined && entry.lastUpdateTime) {
                        const dtSeconds = Math.max(0.01, (nowMs - entry.lastUpdateTime) / 1000);
                        entry.lastVerticalFpm = ((alt - entry.prevAlt) / dtSeconds) * 60;
                    }
                    entry.prevAlt = alt;
                    entry.lastUpdateTime = nowMs;

                    if (!entry.flightLogId && !entry.creatingFlightLog && dbPool) {
                        entry.creatingFlightLog = true;
                        const airport = await findNearestAirport(lat, lon, 5);
                        if (airport) entry.departureAirportId = airport.id;

                        if (msg.missionId) entry.missionId = Number(msg.missionId) || null;
                        if (msg.aircraftRegistration) entry.aircraftRegistration = String(msg.aircraftRegistration);

                        if (entry.missionId) {
                            try {
                                const [umRows] = await dbPool.execute(
                                    `SELECT id FROM user_missions WHERE user_id = ? AND mission_id = ? AND status IN ('started','in_progress') LIMIT 1`,
                                    [playerId, entry.missionId]);
                                if (umRows.length) {
                                    entry.userMissionId = umRows[0].id;
                                    await dbPool.execute(`UPDATE user_missions SET status = 'in_progress' WHERE id = ?`, [entry.userMissionId]);
                                }
                            } catch (_) {}
                        }

                        try {
                            const [result] = await dbPool.execute(
                                `INSERT INTO flight_logs
                                 (user_id, departure_airport_id, aircraft_id, aircraft_registration, mission_id, departure_time, status)
                                 VALUES (?, ?, ?, ?, ?, NOW(), 'departed')`,
                                [playerId, entry.departureAirportId, msg.aircraftId ? Number(msg.aircraftId) : null, entry.aircraftRegistration, entry.missionId]
                            );
                            entry.flightLogId = result.insertId;
                            entry.flightStartTime = Date.now();
                            entry.maxAltitudeFt = alt || 0;
                            entry.speedSamples = [];
                            entry.routePoints = [[
                                Math.round(lat * 10000) / 10000,
                                Math.round(lon * 10000) / 10000,
                                Math.round(alt)
                            ]];
                            entry.flightDistanceNm = 0;
                            entry.isAirborne = false;
                            entry.departureAlt = alt;
                            entry.lastRouteSample = Date.now();
                            entry.statsRecalculated = false;
                            console.log(`[Flight] Departure logged for user ${playerId}, log id: ${entry.flightLogId}, mission: ${entry.missionId || 'none'}`);
                        } catch (err) {
                            console.error(`[DB] Flight log insert error:`, err.message);
                        }
                        entry.creatingFlightLog = false;
                    }

                    if (entry.flightLogId) {
                        if (alt > entry.maxAltitudeFt) entry.maxAltitudeFt = alt;
                        if (airspeed > 0) entry.speedSamples.push(airspeed);
                        entry.flightDistanceNm += stepNm;

                        const now = Date.now();
                        if (now - entry.lastRouteSample > 5000) {
                            entry.routePoints.push([
                                Math.round(lat * 10000) / 10000,
                                Math.round(lon * 10000) / 10000,
                                Math.round(alt)
                            ]);
                            entry.lastRouteSample = now;
                        }

                        const altAboveDepart = alt - (entry.departureAlt || 0);
                        if (!entry.isAirborne && altAboveDepart > 30 && airspeed > 30) {
                            entry.isAirborne = true;
                            dbPool.execute(
                                `UPDATE flight_logs SET status = 'in_flight' WHERE id = ?`,
                                [entry.flightLogId]
                            ).catch(() => {});
                        }

                        const onGround = msg.onGround === true;
                        if (entry.isAirborne && onGround) {
                            entry.onGroundCount = (entry.onGroundCount || 0) + 1;
                            if (entry.onGroundCount >= 20) {
                                await finalizeFlight(playerId, entry, 'landed', entry.state);
                            }
                        } else if (entry.isAirborne) {
                            entry.onGroundCount = 0;
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

                if (!entry.statsRecalculated) {
                    const sessionMinutes = (Date.now() - entry.lastPersist) / 60000;
                    const hoursIncrement = sessionMinutes / 60;
                    const distKm = entry.distanceNm * 1.852;
                    try {
                        await dbPool.execute(
                            `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, total_reward_points, last_flight_at)
                             VALUES (?, 1, ?, ?, ?, FLOOR(? * ?), NOW())
                             ON DUPLICATE KEY UPDATE
                               total_flights      = total_flights + 1,
                               total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                               total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                               total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                               total_reward_points = GREATEST(total_reward_points, FLOOR((total_distance_km + VALUES(total_distance_km)) * ?)),
                               last_flight_at = NOW()`,
                            [playerId, hoursIncrement, entry.distanceNm, distKm, distKm, POINTS_PER_KM, POINTS_PER_KM]
                        );
                    } catch (err) {
                        console.error(`[DB] Final persist error for user ${playerId}:`, err.message);
                    }
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
                `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, total_reward_points, last_flight_at)
                 VALUES (?, 0, ?, ?, ?, FLOOR(? * ?), NOW())
                 ON DUPLICATE KEY UPDATE
                   total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                   total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                   total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                   total_reward_points = GREATEST(total_reward_points, FLOOR((total_distance_km + VALUES(total_distance_km)) * ?)),
                   last_flight_at = NOW()`,
                [userId, hoursIncrement, entry.distanceNm, distKm, distKm, POINTS_PER_KM, POINTS_PER_KM]
            );
        } catch (err) {
            console.error(`[DB] Stats persist error for user ${userId}:`, err.message);
        }

        entry.distanceNm = 0;
        entry.lastPersist = now;

        if (entry.flightLogId && entry.flightStartTime) {
            const elapsed = now - entry.flightStartTime;
            const durMin = Math.round((elapsed / 60000) * 100) / 100;
            const fDistKm = Math.round(entry.flightDistanceNm * 1.852 * 100) / 100;
            const fDistNm = Math.round(entry.flightDistanceNm * 100) / 100;
            const maxAltFt = Math.round(entry.maxAltitudeFt * METERS_TO_FEET);
            const avgSpd = entry.speedSamples.length
                ? Math.round((entry.speedSamples.reduce((a, b) => a + b, 0) / entry.speedSamples.length) * KMH_TO_KNOTS * 100) / 100
                : null;
            try {
                await dbPool.execute(
                    `UPDATE flight_logs SET
                        flight_duration_min = ?,
                        distance_km = ?,
                        distance_nm = ?,
                        max_altitude_ft = ?,
                        avg_speed_knots = ?,
                        route_data = ?
                     WHERE id = ?`,
                    [durMin, fDistKm, fDistNm, maxAltFt, avgSpd, JSON.stringify(entry.routePoints), entry.flightLogId]
                );
            } catch (err) {
                console.error(`[DB] Flight log periodic update error for user ${userId}:`, err.message);
            }
        }
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

            if (!entry.statsRecalculated) {
                const sessionMinutes = (Date.now() - entry.lastPersist) / 60000;
                const hoursIncrement = sessionMinutes / 60;
                const distKm = entry.distanceNm * 1.852;
                try {
                    await dbPool.execute(
                        `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, total_reward_points, last_flight_at)
                         VALUES (?, 1, ?, ?, ?, FLOOR(? * ?), NOW())
                         ON DUPLICATE KEY UPDATE
                           total_flights      = total_flights + 1,
                           total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                           total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                           total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                           total_reward_points = GREATEST(total_reward_points, FLOOR((total_distance_km + VALUES(total_distance_km)) * ?)),
                           last_flight_at = NOW()`,
                        [userId, hoursIncrement, entry.distanceNm, distKm, distKm, POINTS_PER_KM, POINTS_PER_KM]
                    );
                } catch (_) {}
            }

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
