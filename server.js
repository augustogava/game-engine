const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

const NEARBY_DEFAULT_RADIUS_KM = 10;
const NEARBY_MIN_RADIUS_KM = 0.5;
const NEARBY_MAX_RADIUS_KM = 50;
const NEARBY_KM_PER_DEG_LAT = 111.32;
const NEARBY_MIN_COS_LAT = 0.01;
const NEARBY_MAX_AIRPORTS = 50;
const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

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
const ALLOWED_ORIGINS_RAW = process.env.ALLOWED_ORIGINS || env.ALLOWED_ORIGINS || '';
const ALLOWED_ORIGINS = ALLOWED_ORIGINS_RAW
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
if (ALLOWED_ORIGINS.length === 0) {
    console.warn('[CORS] ALLOWED_ORIGINS not configured: falling back to "*" (insecure for production)');
}

function resolveCorsOrigin(reqOrigin) {
    if (ALLOWED_ORIGINS.length === 0) return '*';
    if (!reqOrigin) return ALLOWED_ORIGINS[0];
    if (ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
    return ALLOWED_ORIGINS[0];
}

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

        try {
            const [sweep] = await dbPool.execute(
                `UPDATE flight_logs
                    SET arrival_time = COALESCE(arrival_time, updated_at, departure_time),
                        flight_duration_min = COALESCE(
                            flight_duration_min,
                            GREATEST(TIMESTAMPDIFF(SECOND, departure_time, COALESCE(updated_at, departure_time)) / 60, 0)
                        ),
                        status = 'cancelled',
                        updated_at = NOW()
                  WHERE status IN ('departed','in_flight')`
            );
            if (sweep.affectedRows > 0) {
                console.warn(`[DB] Closed ${sweep.affectedRows} orphaned flight log(s) on startup`);
            }
        } catch (err) {
            console.error('[DB] Orphan flight log sweep failed:', err.message);
        }

        console.log('[DB] Connected and tables ready.');
    } catch (err) {
        console.error('[DB] Init failed:', err.message);
        dbPool = null;
    }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function jsonResponse(res, status, data) {
    const payload = JSON.stringify(data);
    const reqOrigin = res.req && res.req.headers ? res.req.headers.origin : undefined;
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': resolveCorsOrigin(reqOrigin),
        'Vary': 'Origin',
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
    '.hdr': 'application/octet-stream',
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
const FLIGHT_LOG_COOLDOWN_MS = 15000;
const MIN_AIRSPEED_TO_START_LOG = 30;
const MAX_STEP_NM = 1;
const MAX_ROUTE_POINTS = 5000;
const RECONNECT_REUSE_WINDOW_MS = 30000;
const NEAREST_AIRPORT_RADIUS_NM = 5;
const NEAREST_AIRPORT_FALLBACK_NM = 15;
const PERIODIC_FLUSH_MS = 30000;
const PERIODIC_MIN_SESSION_MIN = 0.5;
const MISSION_WAYPOINT_REACH_NM = 2.0;

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
        return { id: decoded.id, username: decoded.username, isAdmin: !!decoded.isAdmin };
    } catch (_) {
        return null;
    }
}

function tryAuthenticate(req) {
    return authenticateRequest(req);
}

// ── Shared missions SQL fragments ────────────────────────────────────────────
const MISSION_SELECT = `
    m.id, m.title, m.description, m.type, m.difficulty,
    m.departure_airport_id, m.departure_runway_id,
    m.arrival_airport_id, m.arrival_runway_id,
    m.spawn_latitude, m.spawn_longitude, m.spawn_altitude_ft,
    m.distance_nm, m.estimated_duration_min, m.reward_points,
    m.image_base64, m.is_active, m.is_enabled, m.sort_order,
    m.required_aircraft_id, m.required_aircraft_type,
    req_ac.code AS required_aircraft_code,
    req_ac.name AS required_aircraft_name,
    req_ac.thumbnail_url AS required_aircraft_thumbnail,
    da.name AS departure_airport_name, da.icao_code AS departure_icao,
    da.latitude AS departure_lat, da.longitude AS departure_lon,
    aa.name AS arrival_airport_name, aa.icao_code AS arrival_icao,
    aa.latitude AS arrival_lat, aa.longitude AS arrival_lon,
    dr.le_ident AS departure_runway_ident, dr.length_ft AS departure_runway_length_ft,
    dr.le_latitude_deg AS dep_rwy_latitude, dr.le_longitude_deg AS dep_rwy_longitude,
    dr.le_heading_deg_true AS dep_rwy_heading, dr.le_elevation_ft AS dep_rwy_elevation_ft,
    ar.le_ident AS arrival_runway_ident, ar.length_ft AS arrival_runway_length_ft,
    ar.le_latitude_deg AS arr_rwy_latitude, ar.le_longitude_deg AS arr_rwy_longitude,
    ar.le_heading_deg_true AS arr_rwy_heading`;

const MISSION_JOINS = `
    FROM missions m
    LEFT JOIN airports da ON m.departure_airport_id = da.id
    LEFT JOIN airports aa ON m.arrival_airport_id = aa.id
    LEFT JOIN airport_runways dr ON m.departure_runway_id = dr.id
    LEFT JOIN airport_runways ar ON m.arrival_runway_id = ar.id
    LEFT JOIN aircrafts req_ac ON m.required_aircraft_id = req_ac.id`;

function buildMissionNested(row) {
    return {
        title: row.mission_title_full || row.title,
        description: row.mission_description || row.description,
        type: row.mission_type_full || row.type,
        difficulty: row.mission_difficulty_full || row.difficulty,
        distance_nm: row.mission_distance_nm != null ? row.mission_distance_nm : row.distance_nm,
        estimated_duration_min: row.mission_estimated_duration_min != null ? row.mission_estimated_duration_min : row.estimated_duration_min,
        reward_points: row.mission_reward_points != null ? row.mission_reward_points : row.reward_points,
        spawn_latitude: row.mission_spawn_latitude != null ? row.mission_spawn_latitude : row.spawn_latitude,
        spawn_longitude: row.mission_spawn_longitude != null ? row.mission_spawn_longitude : row.spawn_longitude,
        spawn_altitude_ft: row.mission_spawn_altitude_ft != null ? row.mission_spawn_altitude_ft : row.spawn_altitude_ft,
        image_base64: row.mission_image_base64 != null ? row.mission_image_base64 : row.image_base64,
        is_enabled: row.mission_is_enabled != null ? row.mission_is_enabled : row.is_enabled,
        departure_airport_name: row.departure_airport_name,
        departure_icao: row.departure_icao,
        arrival_airport_name: row.arrival_airport_name,
        arrival_icao: row.arrival_icao,
        departure_runway_ident: row.departure_runway_ident,
        departure_runway_length_ft: row.departure_runway_length_ft,
        arrival_runway_ident: row.arrival_runway_ident,
        arrival_runway_length_ft: row.arrival_runway_length_ft,
    };
}

const USER_MISSION_SELECT = `
    um.id, um.user_id, um.mission_id, um.status, um.started_at, um.completed_at, um.score, um.notes,
    m.title AS mission_title, m.type AS mission_type, m.difficulty AS mission_difficulty,
    m.title AS mission_title_full, m.description AS mission_description,
    m.type AS mission_type_full, m.difficulty AS mission_difficulty_full,
    m.distance_nm AS mission_distance_nm, m.estimated_duration_min AS mission_estimated_duration_min,
    m.reward_points AS mission_reward_points,
    m.spawn_latitude AS mission_spawn_latitude, m.spawn_longitude AS mission_spawn_longitude,
    m.spawn_altitude_ft AS mission_spawn_altitude_ft,
    m.image_base64 AS mission_image_base64, m.is_enabled AS mission_is_enabled,
    da.name AS departure_airport_name, da.latitude AS departure_lat, da.longitude AS departure_lon, da.icao_code AS departure_icao,
    aa.name AS arrival_airport_name, aa.latitude AS arrival_lat, aa.longitude AS arrival_lon, aa.icao_code AS arrival_icao,
    dr.le_ident AS departure_runway_ident, dr.length_ft AS departure_runway_length_ft,
    ar.le_ident AS arrival_runway_ident, ar.length_ft AS arrival_runway_length_ft`;

const USER_MISSION_JOINS = `
    FROM user_missions um
    JOIN missions m ON um.mission_id = m.id
    LEFT JOIN airports da ON m.departure_airport_id = da.id
    LEFT JOIN airports aa ON m.arrival_airport_id = aa.id
    LEFT JOIN airport_runways dr ON m.departure_runway_id = dr.id
    LEFT JOIN airport_runways ar ON m.arrival_runway_id = ar.id`;

function enrichUserMissionRow(row, waypoints = []) {
    const mission = buildMissionNested(row);
    mission.waypoints = waypoints;
    const result = {
        id: row.id,
        user_id: row.user_id,
        mission_id: row.mission_id,
        status: row.status,
        started_at: row.started_at,
        completed_at: row.completed_at,
        score: row.score,
        notes: row.notes,
        mission_title: row.mission_title,
        mission_type: row.mission_type,
        mission_difficulty: row.mission_difficulty,
        departure_airport_name: row.departure_airport_name,
        departure_lat: row.departure_lat,
        departure_lon: row.departure_lon,
        departure_icao: row.departure_icao,
        arrival_airport_name: row.arrival_airport_name,
        arrival_lat: row.arrival_lat,
        arrival_lon: row.arrival_lon,
        arrival_icao: row.arrival_icao,
        departure_runway_ident: row.departure_runway_ident,
        departure_runway_length_ft: row.departure_runway_length_ft,
        arrival_runway_ident: row.arrival_runway_ident,
        arrival_runway_length_ft: row.arrival_runway_length_ft,
        mission,
    };
    return result;
}

async function loadWaypointsForMissionIds(missionIds) {
    if (!dbPool || !missionIds.length) return new Map();
    const placeholders = missionIds.map(() => '?').join(',');
    const [rows] = await dbPool.execute(
        `SELECT id, mission_id, order_index, name, latitude, longitude, altitude_ft
           FROM mission_waypoints
          WHERE mission_id IN (${placeholders})
          ORDER BY mission_id ASC, order_index ASC, id ASC`,
        missionIds
    );
    const byMission = new Map();
    for (const r of rows) {
        if (!byMission.has(r.mission_id)) byMission.set(r.mission_id, []);
        byMission.get(r.mission_id).push(r);
    }
    return byMission;
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

async function callExternalMissionComplete(userMissionId, authToken) {
    if (!MAIN_API_URL) {
        console.warn(`[Mission] External /complete skipped: MAIN_API_URL not configured (userMission=${userMissionId})`);
        return false;
    }
    if (!Number.isFinite(Number(userMissionId)) || Number(userMissionId) <= 0) {
        console.warn(`[Mission] External /complete skipped: invalid userMissionId=${userMissionId}`);
        return false;
    }
    if (!authToken) {
        console.warn(`[Mission] External /complete skipped: missing auth token (userMission=${userMissionId})`);
        return false;
    }
    try {
        const url = `${MAIN_API_URL}/api/user-missions/${userMissionId}/complete`;
        const resp = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
        });
        if (!resp.ok) {
            console.warn(`[Mission] External /complete failed: HTTP ${resp.status} (userMission=${userMissionId})`);
            return false;
        }
        console.log(`[Mission] External /complete OK (userMission=${userMissionId})`);
        return true;
    } catch (err) {
        console.error(`[Mission] External /complete error (userMission=${userMissionId}):`, err.message);
        return false;
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
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusNm) || radiusNm <= 0) return null;
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

async function findNearestAirportWithFallback(lat, lon) {
    let airport = await findNearestAirport(lat, lon, NEAREST_AIRPORT_RADIUS_NM);
    if (!airport) airport = await findNearestAirport(lat, lon, NEAREST_AIRPORT_FALLBACK_NM);
    return airport;
}

// ── Finalize flight log ──────────────────────────────────────────────────────
async function finalizeFlight(userId, entry, status, lastMsg) {
    if (!entry.flightLogId || !dbPool) return;

    const flightLogId = entry.flightLogId;
    entry.flightLogId = null;
    entry.creatingFlightLog = false;

    const elapsed = entry.flightStartTime ? (Date.now() - entry.flightStartTime) : 0;
    const distKm = entry.flightDistanceNm * 1.852;
    const avgSpeed = entry.speedSamples.length
        ? entry.speedSamples.reduce((a, b) => a + b, 0) / entry.speedSamples.length
        : null;

    let arrivalAirportId = null;
    if (status === 'landed' && lastMsg && Number.isFinite(lastMsg.lat) && Number.isFinite(lastMsg.lon)) {
        const airport = await findNearestAirportWithFallback(lastMsg.lat, lastMsg.lon);
        if (airport) arrivalAirportId = airport.id;
    }

    if (lastMsg && Number.isFinite(lastMsg.lat) && Number.isFinite(lastMsg.lon)) {
        if (entry.routePoints.length >= MAX_ROUTE_POINTS) {
            entry.routePoints = entry.routePoints.filter((_, i) => i % 2 === 0);
        }
        entry.routePoints.push([
            Math.round(lastMsg.lat * 10000) / 10000,
            Math.round(lastMsg.lon * 10000) / 10000,
            Math.round(lastMsg.alt || 0)
        ]);
    }

    const maxAltFt = Math.round(entry.maxAltitudeFt * METERS_TO_FEET);
    const avgSpeedKnots = avgSpeed ? Math.round(avgSpeed * KMH_TO_KNOTS * 100) / 100 : null;
    const landingFpm = status === 'landed' ? Math.round(entry.lastVerticalFpm * METERS_TO_FEET) : null;
    const finalDistKm = Math.round(distKm * 100) / 100;
    const finalDistNm = Math.round(entry.flightDistanceNm * 100) / 100;

    console.log(`[Flight] Finalizing: user=${userId}, log=${flightLogId}, status=${status}, elapsed=${elapsed}ms, dist=${finalDistKm}km, maxAlt=${maxAltFt}ft, avgSpd=${avgSpeedKnots}kts, routePts=${entry.routePoints.length}, startTime=${entry.flightStartTime}`);

    try {
        await dbPool.execute(
            `UPDATE flight_logs SET
                status = ?,
                arrival_airport_id = ?,
                arrival_time = NOW(),
                flight_duration_min = TIMESTAMPDIFF(SECOND, departure_time, NOW()) / 60,
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
                finalDistKm,
                finalDistNm,
                maxAltFt,
                avgSpeedKnots,
                landingFpm,
                JSON.stringify(entry.routePoints),
                flightLogId,
            ]
        );
        console.log(`[Flight] ${status}: user ${userId}, log ${flightLogId}, ${finalDistNm}nm`);
        if (entry.ws && entry.ws.readyState === 1) {
            try {
                entry.ws.send(JSON.stringify({
                    type: 'flightLogEnded',
                    flightLogId,
                    status,
                    distanceKm: finalDistKm,
                    distanceNm: finalDistNm,
                    maxAltitudeFt: maxAltFt,
                    avgSpeedKnots,
                    landingRateFpm: landingFpm,
                    arrivalAirportId,
                }));
            } catch (_) {}
        }
    } catch (err) {
        console.error(`[DB] Flight log finalize error (log ${flightLogId}, user ${userId}):`, err.message);
    }

    if (status === 'landed' && entry.userMissionId && !entry.missionExternalCompleteSent) {
        const hasWaypoints = Array.isArray(entry.missionWaypoints) && entry.missionWaypoints.length > 0;
        const wpsOk = !hasWaypoints || entry.missionAllWpReached === true;
        const requiredAirportId = entry.missionArrivalAirportId || null;
        const airportOk = !requiredAirportId || (arrivalAirportId && Number(arrivalAirportId) === Number(requiredAirportId));
        if (wpsOk && airportOk) {
            entry.missionExternalCompleteSent = true;
            await callExternalMissionComplete(entry.userMissionId, entry.authToken);
        } else {
            console.log(`[Mission] Auto /complete skipped: user=${userId} userMission=${entry.userMissionId} waypointsOk=${wpsOk} airportOk=${airportOk} arrivalAirportId=${arrivalAirportId} requiredAirportId=${requiredAirportId}`);
        }
    }

    if (finalDistKm > 0 && (status === 'landed' || status === 'cancelled' || status === 'crashed')) {
        const flightPoints = Math.floor(finalDistKm * POINTS_PER_KM);
        if (flightPoints > 0) {
            const statusLabel = status === 'landed' ? 'landed' : (status === 'crashed' ? 'crashed' : 'cancelled');
            await logPointsHistory(
                userId,
                flightPoints,
                POINTS_SOURCE_FLIGHT,
                flightLogId,
                `Flight ${statusLabel}: ${finalDistKm}km`
            );
        }
    }

    const ok = await recalculateStats(userId);
    if (ok) {
        entry.distanceNm = 0;
        entry.lastPersist = Date.now();
        entry.statsRecalculated = true;
    }

    entry.lastFlightEndTime = Date.now();
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
    entry.missionArrivalAirportId = null;
    entry.missionWaypoints = null;
    entry.missionNextWpIndex = 0;
    entry.missionAllWpReached = false;
    entry.missionExternalCompleteSent = false;
    entry.aircraftRegistration = null;
    entry.aircraftType = null;
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

// ── Audit-log a points award/event into user_points_log ──────────────────────
const POINTS_SOURCE_FLIGHT = 'flight';
const POINTS_SOURCE_MISSION = 'mission';
const POINTS_SOURCE_MISSION_FAILED = 'mission_failed';
const POINTS_LOG_DESC_MAX = 255;

async function logPointsHistory(userId, points, sourceType, sourceId, description) {
    if (!dbPool) return false;
    if (!Number.isFinite(userId) || userId <= 0) {
        console.warn('[Points] Skipping audit log: invalid userId', userId);
        return false;
    }
    if (!Number.isFinite(points)) {
        console.warn(`[Points] Skipping audit log: invalid points value for user ${userId}, source=${sourceType}`);
        return false;
    }
    if (typeof sourceType !== 'string' || sourceType.length === 0) {
        console.warn(`[Points] Skipping audit log: invalid sourceType for user ${userId}`);
        return false;
    }
    const safePoints = Math.max(-2147483648, Math.min(2147483647, Math.trunc(points)));
    const safeSourceType = sourceType.slice(0, 50);
    const safeSourceId = Number.isFinite(sourceId) ? Math.trunc(sourceId) : null;
    const safeDescription = (typeof description === 'string' && description.length > 0)
        ? description.slice(0, POINTS_LOG_DESC_MAX)
        : null;
    try {
        await dbPool.execute(
            `INSERT INTO user_points_log (user_id, points, source_type, source_id, description, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [userId, safePoints, safeSourceType, safeSourceId, safeDescription]
        );
        console.debug(`[Points] Logged user=${userId} pts=${safePoints} source=${safeSourceType}${safeSourceId != null ? `#${safeSourceId}` : ''}`);
        return true;
    } catch (err) {
        console.error(`[Points] Audit log INSERT failed user=${userId} source=${safeSourceType}:`, err.message);
        return false;
    }
}

// ── Recalculate full stats for a user ────────────────────────────────────────
async function recalculateStats(userId) {
    if (!dbPool) return false;
    try {
        const [[flightAgg]] = await dbPool.execute(
            `SELECT
                SUM(CASE WHEN status = 'landed' THEN 1 ELSE 0 END) AS cnt,
                COALESCE(SUM(CASE WHEN status IN ('landed','cancelled') THEN flight_duration_min ELSE 0 END), 0) / 60 AS hours,
                COALESCE(SUM(CASE WHEN status IN ('landed','cancelled') THEN distance_km ELSE 0 END), 0) AS dist_km,
                COALESCE(SUM(CASE WHEN status IN ('landed','cancelled') THEN distance_nm ELSE 0 END), 0) AS dist_nm,
                MAX(CASE WHEN status = 'landed' THEN landing_rate_fpm END) AS best_lr,
                AVG(CASE WHEN status = 'landed' THEN landing_rate_fpm END) AS avg_lr
             FROM flight_logs WHERE user_id = ?`,
            [userId]
        );

        const [[missionAgg]] = await dbPool.execute(
            `SELECT COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END), 0) AS completed,
                    COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END), 0) AS failed
             FROM user_missions WHERE user_id = ?`,
            [userId]
        );

        const flightCount = Number(flightAgg.cnt) || 0;

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
                 total_missions_completed, total_missions_failed,
                 best_landing_rate_fpm, avg_landing_rate_fpm,
                 favorite_airport_id, most_used_aircraft_id, pilot_rank, last_flight_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
                total_flights            = VALUES(total_flights),
                total_flight_hours       = VALUES(total_flight_hours),
                total_distance_km        = VALUES(total_distance_km),
                total_distance_nm        = VALUES(total_distance_nm),
                total_missions_completed = VALUES(total_missions_completed),
                total_missions_failed    = VALUES(total_missions_failed),
                best_landing_rate_fpm    = VALUES(best_landing_rate_fpm),
                avg_landing_rate_fpm     = VALUES(avg_landing_rate_fpm),
                favorite_airport_id      = VALUES(favorite_airport_id),
                most_used_aircraft_id    = VALUES(most_used_aircraft_id),
                pilot_rank               = VALUES(pilot_rank),
                last_flight_at           = NOW()`,
            [
                userId,
                flightCount,
                Math.round((flightAgg.hours || 0) * 100) / 100,
                Math.round((flightAgg.dist_km || 0) * 100) / 100,
                Math.round((flightAgg.dist_nm || 0) * 100) / 100,
                missionAgg.completed || 0,
                missionAgg.failed || 0,
                flightAgg.best_lr != null ? Math.round(flightAgg.best_lr * 100) / 100 : null,
                flightAgg.avg_lr != null ? Math.round(flightAgg.avg_lr * 100) / 100 : null,
                favAirportId,
                mostAircraftId,
                rank,
            ]
        );
        console.log(`[Stats] Recalculated for user ${userId}: ${flightCount} flights, rank=${rank}`);
        return true;
    } catch (err) {
        console.error(`[DB] recalculateStats error for user ${userId}:`, err.message);
        return false;
    }
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const CORS_STATIC_HEADERS = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
};

const server = http.createServer(async (req, res) => {
    // Inject CORS on every response
    const _writeHead = res.writeHead.bind(res);
    const reqOrigin = req.headers ? req.headers.origin : undefined;
    const corsOrigin = resolveCorsOrigin(reqOrigin);
    res.writeHead = (status, headers) => {
        const merged = {
            ...CORS_STATIC_HEADERS,
            'Access-Control-Allow-Origin': corsOrigin,
            ...(typeof headers === 'object' ? headers : {}),
        };
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
        const user = tryAuthenticate(req);
        const isAdmin = user && user.isAdmin;
        const page = Math.max(1, parseInt(query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
        const offset = (page - 1) * limit;
        const activeFilter = isAdmin && query.is_active !== undefined ? parseInt(query.is_active) : 1;
        let where = `WHERE m.is_active = ${activeFilter ? 1 : 0}`;
        const params = [];
        if (!(isAdmin && query.include_disabled === '1')) {
            where += ' AND m.is_enabled = 1';
        }
        if (query.type) { where += ' AND m.type = ?'; params.push(query.type); }
        if (query.difficulty) { where += ' AND m.difficulty = ?'; params.push(query.difficulty); }
        try {
            const [[{ total }]] = await dbPool.execute(`SELECT COUNT(*) AS total FROM missions m ${where}`, params);
            const [rows] = await dbPool.execute(
                `SELECT ${MISSION_SELECT} ${MISSION_JOINS}
                 ${where} ORDER BY m.sort_order, m.id LIMIT ${limit} OFFSET ${offset}`, params);
            const missionIds = rows.map(r => r.id);
            const wps = await loadWaypointsForMissionIds(missionIds);
            for (const r of rows) r.waypoints = wps.get(r.id) || [];
            return jsonResponse(res, 200, { data: rows, total, page, limit });
        } catch (err) {
            console.error('[API] GET /api/missions error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    let routeParams;
    if (req.method === 'GET' && (routeParams = matchRoute(req.method, urlPath, '/api/missions/:id'))) {
        if (!dbPool) return jsonResponse(res, 404, { error: 'Mission not found' });
        const user = tryAuthenticate(req);
        const isAdmin = user && user.isAdmin;
        const { id } = routeParams;
        try {
            let where = 'WHERE m.id = ? AND m.is_active = 1';
            if (!isAdmin) where += ' AND m.is_enabled = 1';
            const [rows] = await dbPool.execute(
                `SELECT ${MISSION_SELECT} ${MISSION_JOINS} ${where}`, [id]);
            if (!rows.length) return jsonResponse(res, 404, { error: 'Mission not found' });
            const wps = await loadWaypointsForMissionIds([rows[0].id]);
            rows[0].waypoints = wps.get(rows[0].id) || [];
            return jsonResponse(res, 200, rows[0]);
        } catch (err) {
            console.error('[API] GET /api/missions/:id error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'POST' && urlPath === '/api/user-missions') {
        const user = authenticateRequest(req);
        if (!user) return jsonResponse(res, 401, { error: 'Not authenticated' });
        if (!dbPool) return jsonResponse(res, 503, { error: 'Database unavailable' });
        const body = await parseBody(req);
        if (!body || !body.mission_id) return jsonResponse(res, 400, { error: 'mission_id is required' });
        try {
            const [missionRows] = await dbPool.execute(
                `SELECT id, is_active, is_enabled FROM missions WHERE id = ?`, [body.mission_id]);
            if (!missionRows.length) return jsonResponse(res, 404, { error: 'Mission not found' });
            if (!missionRows[0].is_active || !missionRows[0].is_enabled) {
                return jsonResponse(res, 403, { error: 'Mission not available' });
            }
            const [existing] = await dbPool.execute(
                `SELECT id FROM user_missions WHERE user_id = ? AND mission_id = ? AND status IN ('started','in_progress')`,
                [user.id, body.mission_id]);
            if (existing.length) return jsonResponse(res, 409, { error: 'Mission already in progress' });
            const [result] = await dbPool.execute(
                `INSERT INTO user_missions (user_id, mission_id, status, started_at) VALUES (?, ?, 'in_progress', NOW())`,
                [user.id, body.mission_id]);
            const [enrichedRows] = await dbPool.execute(
                `SELECT ${USER_MISSION_SELECT} ${USER_MISSION_JOINS}
                 WHERE um.id = ?`, [result.insertId]);
            if (enrichedRows.length) {
                const wps = await loadWaypointsForMissionIds([enrichedRows[0].mission_id]);
                return jsonResponse(res, 201, enrichUserMissionRow(enrichedRows[0], wps.get(enrichedRows[0].mission_id) || []));
            }
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
                `SELECT ${USER_MISSION_SELECT} ${USER_MISSION_JOINS}
                 WHERE um.user_id = ? AND um.status IN ('started','in_progress')
                 ORDER BY um.started_at DESC`, [user.id]);
            const missionIds = rows.map(r => r.mission_id);
            const wps = await loadWaypointsForMissionIds(missionIds);
            return jsonResponse(res, 200, { data: rows.map(r => enrichUserMissionRow(r, wps.get(r.mission_id) || [])) });
        } catch (err) {
            console.error('[API] GET /api/user-missions/active error:', err.message);
            return jsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    if (req.method === 'GET' && urlPath === '/api/user-missions') {
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return proxyToMainApi(`/api/user-missions${qs}`, req, res);
    }

    if (req.method === 'PUT' && (routeParams = matchRoute(req.method, urlPath, '/api/user-missions/:id/complete'))) {
        return proxyToMainApi(`/api/user-missions/${routeParams.id}/complete`, req, res);
    }

    if (req.method === 'PUT' && (routeParams = matchRoute(req.method, urlPath, '/api/user-missions/:id/start'))) {
        return proxyToMainApi(`/api/user-missions/${routeParams.id}/start`, req, res);
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
                `SELECT id, status FROM user_missions WHERE id = ? AND user_id = ?`, [id, user.id]);
            if (!rows.length) return jsonResponse(res, 404, { error: 'User mission not found' });
            const sets = []; const vals = [];
            if (body.status) { sets.push('status = ?'); vals.push(body.status); }
            if (body.score !== undefined) { sets.push('score = ?'); vals.push(body.score); }
            if (body.notes !== undefined) { sets.push('notes = ?'); vals.push(body.notes); }
            if (body.status === 'completed') { sets.push('completed_at = NOW()'); }
            if (!sets.length) return jsonResponse(res, 400, { error: 'No fields to update' });
            const previousStatus = rows[0].status;
            const [missionInfoRows] = await dbPool.execute(
                `SELECT um.mission_id, m.reward_points, m.title
                 FROM user_missions um JOIN missions m ON um.mission_id = m.id
                 WHERE um.id = ?`, [id]
            );
            const missionInfo = missionInfoRows.length ? missionInfoRows[0] : null;
            vals.push(id);
            await dbPool.execute(`UPDATE user_missions SET ${sets.join(', ')} WHERE id = ?`, vals);
            if (body.status === 'completed' && previousStatus !== 'completed' && missionInfo) {
                await logPointsHistory(
                    user.id,
                    Number(missionInfo.reward_points) || 0,
                    POINTS_SOURCE_MISSION,
                    Number(id),
                    `Mission completed: ${missionInfo.title || `#${missionInfo.mission_id}`}`
                );
            } else if (body.status === 'failed' && previousStatus !== 'failed' && missionInfo) {
                await logPointsHistory(
                    user.id,
                    0,
                    POINTS_SOURCE_MISSION_FAILED,
                    Number(id),
                    `Mission failed: ${missionInfo.title || `#${missionInfo.mission_id}`}`
                );
            }
            if (body.status === 'completed' || body.status === 'failed') await recalculateStats(user.id);
            return jsonResponse(res, 200, { message: 'Mission progress updated' });
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

    if (req.method === 'POST' && urlPath === '/api/flight-stats/claim-free-hour') {
        return proxyToMainApi('/api/flight-stats/claim-free-hour', req, res, await parseBody(req));
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
            purchased_flight_hours: 1.00,
            available_flight_hours: 1.00,
        });
        try {
            const [rows] = await dbPool.execute(
                `SELECT * FROM user_flight_stats WHERE user_id = ?`, [user.id]);
            if (rows.length) {
                const data = rows[0];
                const purchased = parseFloat(data.purchased_flight_hours) || 1.00;
                const flown = parseFloat(data.total_flight_hours) || 0;
                data.available_flight_hours = Math.max(0, parseFloat((purchased - flown).toFixed(2)));
                return jsonResponse(res, 200, data);
            }
            return jsonResponse(res, 200, {
                user_id: user.id, total_flights: 0, total_flight_hours: 0,
                total_distance_km: 0, total_distance_nm: 0,
                total_missions_completed: 0, total_missions_failed: 0, total_reward_points: 0,
                most_used_aircraft_id: null, pilot_rank: 'student',
                best_landing_rate_fpm: null, avg_landing_rate_fpm: null,
                purchased_flight_hours: 1.00,
                available_flight_hours: 1.00,
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

    if (req.method === 'GET' && urlPath === '/api/airports/search') {
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return proxyToMainApi(`/api/airports/search${qs}`, req, res);
    }

    if (req.method === 'GET' && (routeParams = matchRoute(req.method, urlPath, '/api/airports/:id/runways'))) {
        return proxyToMainApi(`/api/airports/${routeParams.id}/runways`, req, res);
    }

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

    if (req.method === 'GET' && urlPath === '/api/airports/nearby') {
        if (!dbPool) return jsonResponse(res, 503, { error: 'Database unavailable' });
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const latStr = urlObj.searchParams.get('lat');
            const lngStr = urlObj.searchParams.get('lng');
            const radiusStr = urlObj.searchParams.get('radius_km');
            const lat = Number(latStr);
            const lng = Number(lngStr);
            const radiusKm = Math.min(Math.max(Number(radiusStr) || NEARBY_DEFAULT_RADIUS_KM, NEARBY_MIN_RADIUS_KM), NEARBY_MAX_RADIUS_KM);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return jsonResponse(res, 400, { error: 'Invalid lat/lng query parameters' });
            }
            const latDelta = radiusKm / NEARBY_KM_PER_DEG_LAT;
            const cosLat = Math.cos(lat * Math.PI / 180);
            const lngDelta = radiusKm / (NEARBY_KM_PER_DEG_LAT * Math.max(cosLat, NEARBY_MIN_COS_LAT));
            const [airports] = await dbPool.execute(
                `SELECT id, icao_code, iata_code, name, latitude, longitude, elevation_ft
                 FROM airports
                 WHERE is_active = 1
                   AND latitude BETWEEN ? AND ?
                   AND longitude BETWEEN ? AND ?
                 LIMIT ${NEARBY_MAX_AIRPORTS}`,
                [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta],
            );
            if (!airports.length) {
                console.debug(`[API] GET /api/airports/nearby lat=${lat} lng=${lng} radius=${radiusKm}km matches=0`);
                return jsonResponse(res, 200, { data: [] });
            }
            const ids = airports.map((a) => a.id);
            const placeholders = ids.map(() => '?').join(',');
            const [runways] = await dbPool.execute(
                `SELECT airport_id, length_ft, width_ft, surface, le_ident, le_latitude_deg, le_longitude_deg,
                        le_elevation_ft, le_heading_deg_true, le_displaced_threshold_ft,
                        he_ident, he_latitude_deg, he_longitude_deg, he_elevation_ft, he_heading_deg_true,
                        he_displaced_threshold_ft
                 FROM airport_runways
                 WHERE closed = 0 AND airport_id IN (${placeholders})`,
                ids,
            );
            const runwaysByAirport = new Map();
            for (const r of runways) {
                if (!runwaysByAirport.has(r.airport_id)) runwaysByAirport.set(r.airport_id, []);
                runwaysByAirport.get(r.airport_id).push({
                    length_ft: r.length_ft,
                    width_ft: r.width_ft,
                    surface: r.surface,
                    le_ident: r.le_ident,
                    le_latitude_deg: r.le_latitude_deg != null ? Number(r.le_latitude_deg) : null,
                    le_longitude_deg: r.le_longitude_deg != null ? Number(r.le_longitude_deg) : null,
                    le_elevation_ft: r.le_elevation_ft,
                    le_heading_deg_true: r.le_heading_deg_true != null ? Number(r.le_heading_deg_true) : null,
                    le_displaced_threshold_ft: r.le_displaced_threshold_ft,
                    he_ident: r.he_ident,
                    he_latitude_deg: r.he_latitude_deg != null ? Number(r.he_latitude_deg) : null,
                    he_longitude_deg: r.he_longitude_deg != null ? Number(r.he_longitude_deg) : null,
                    he_elevation_ft: r.he_elevation_ft,
                    he_heading_deg_true: r.he_heading_deg_true != null ? Number(r.he_heading_deg_true) : null,
                    he_displaced_threshold_ft: r.he_displaced_threshold_ft,
                });
            }
            const data = [];
            for (const a of airports) {
                const aLat = Number(a.latitude);
                const aLng = Number(a.longitude);
                const distKm = haversineKm(lat, lng, aLat, aLng);
                if (distKm > radiusKm) continue;
                data.push({
                    id: a.id,
                    icao_code: a.icao_code,
                    iata_code: a.iata_code,
                    name: a.name,
                    latitude: aLat,
                    longitude: aLng,
                    elevation_ft: a.elevation_ft,
                    distance_km: Number(distKm.toFixed(3)),
                    runways: runwaysByAirport.get(a.id) || [],
                });
            }
            data.sort((a, b) => a.distance_km - b.distance_km);
            console.debug(`[API] GET /api/airports/nearby lat=${lat} lng=${lng} radius=${radiusKm}km matches=${data.length}`);
            return jsonResponse(res, 200, { data });
        } catch (err) {
            console.error('[API] GET /api/airports/nearby error:', err.code || '', err.message);
            if (err.stack) console.error(err.stack);
            return jsonResponse(res, 500, {
                error: 'Internal server error',
                detail: err.message,
                code: err.code || null,
            });
        }
    }

    if (req.method === 'GET' && (routeParams = matchRoute(req.method, urlPath, '/api/airports/:id'))) {
        return proxyToMainApi(`/api/airports/${routeParams.id}`, req, res);
    }

    // ── Aircrafts API (proxy to main API) ─────────────────────────────

    if (req.method === 'GET' && urlPath === '/api/aircrafts') {
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return proxyToMainApi(`/api/aircrafts${qs}`, req, res);
    }

    if (req.method === 'GET' && (routeParams = matchRoute(req.method, urlPath, '/api/aircrafts/:id'))) {
        return proxyToMainApi(`/api/aircrafts/${routeParams.id}`, req, res);
    }

    if (req.method === 'GET' && urlPath === '/api/flight-plans') {
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return proxyToMainApi(`/api/flight-plans${qs}`, req, res);
    }

    if (req.method === 'GET' && (routeParams = matchRoute(req.method, urlPath, '/api/flight-plans/:id'))) {
        return proxyToMainApi(`/api/flight-plans/${routeParams.id}`, req, res);
    }

    if (req.method === 'PATCH' && (routeParams = matchRoute(req.method, urlPath, '/api/flight-plans/:id/status'))) {
        return proxyToMainApi(`/api/flight-plans/${routeParams.id}/status`, req, res, await parseBody(req));
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

    // ── Live Traffic API (proxy to main API) ──────────────────────────────

    if (req.method === 'GET' && urlPath === '/api/live-traffic/positions') {
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return proxyToMainApi(`/api/live-traffic/positions${qs}`, req, res);
    }

    if (req.method === 'GET' && (routeParams = matchRoute(req.method, urlPath, '/api/live-traffic/airport/:code'))) {
        return proxyToMainApi(`/api/live-traffic/airport/${encodeURIComponent(routeParams.code)}`, req, res);
    }

    // ── Avatar proxy (same-origin for canvas CORS) ────────────────────────
    if (req.method === 'GET' && (routeParams = matchRoute(req.method, urlPath, '/api/avatar/:id'))) {
        if (!MAIN_API_URL) { res.writeHead(404); res.end(); return; }
        try {
            const resp = await fetch(`${MAIN_API_URL}/api/user/${routeParams.id}/avatar-image`);
            if (!resp.ok) { res.writeHead(resp.status); res.end(); return; }
            const contentType = resp.headers.get('content-type') || 'image/png';
            const buffer = Buffer.from(await resp.arrayBuffer());
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300' });
            res.end(buffer);
        } catch (err) {
            console.error(`[API] Avatar proxy error:`, err.message);
            res.writeHead(502);
            res.end();
        }
        return;
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

// ── Fetch player info from main API ──────────────────────────────────────────
const playerInfoCache = new Map();
const PLAYER_INFO_CACHE_TTL = 300000;

async function fetchPlayerInfo(userId) {
    const cached = playerInfoCache.get(userId);
    if (cached && (Date.now() - cached.fetchedAt) < PLAYER_INFO_CACHE_TTL) {
        return cached;
    }
    if (!MAIN_API_URL) return { username: null, avatarUrl: null };
    try {
        const resp = await fetch(`${MAIN_API_URL}/api/user/batch-info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: [userId] }),
        });
        if (!resp.ok) return { username: null, avatarUrl: null };
        const data = await resp.json();
        const player = Array.isArray(data.players) ? data.players.find(p => p.userId === userId) : null;
        const info = {
            username: player?.username || null,
            avatarUrl: player?.avatarUrl ? `/api/avatar/${userId}` : null,
            fetchedAt: Date.now(),
        };
        playerInfoCache.set(userId, info);
        return info;
    } catch (err) {
        console.error(`[API] fetchPlayerInfo error for user ${userId}:`, err.message);
        return { username: null, avatarUrl: null };
    }
}

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
                const reuseFlight = !!(existing
                    && existing.flightLogId
                    && existing.lastUpdateTime
                    && (Date.now() - existing.lastUpdateTime) < RECONNECT_REUSE_WINDOW_MS);

                if (existing) {
                    if (dbPool) {
                        if (existing.flightLogId && !reuseFlight) {
                            await finalizeFlight(playerId, existing, 'cancelled', existing.state);
                        }

                        if (!reuseFlight && !existing.statsRecalculated) {
                            const sm = (Date.now() - existing.lastPersist) / 60000;
                            const hi = existing.flightLogId ? 0 : sm / 60;
                            const distNm = existing.flightLogId ? 0 : existing.distanceNm;
                            const dk = distNm * 1.852;
                            dbPool.execute(
                                `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, total_reward_points, last_flight_at)
                                 VALUES (?, 0, ?, ?, ?, FLOOR(? * ?), NOW())
                                 ON DUPLICATE KEY UPDATE
                                   total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                                   total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                                   total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                                   total_reward_points = total_reward_points + (FLOOR(total_distance_km * ?) - FLOOR((total_distance_km - VALUES(total_distance_km)) * ?)),
                                   last_flight_at = NOW()`,
                                [playerId, hi, distNm, dk, dk, POINTS_PER_KM, POINTS_PER_KM, POINTS_PER_KM]
                            ).catch(err => console.error('[DB] Existing-session stats persist error:', err.message));
                        }

                        if (existing.sessionDbId) {
                            const dur = (Date.now() - existing.sessionStart) / 60000;
                            dbPool.execute(
                                `UPDATE game_sessions SET disconnected_at = NOW(), flight_duration_min = ? WHERE id = ?`,
                                [dur, existing.sessionDbId]
                            ).catch(err => console.error('[DB] Existing-session close error:', err.message));
                        }
                    }
                    try { existing.ws.close(4000, 'Replaced by new session'); } catch (_) {}
                }

                if (reuseFlight) {
                    console.log(`[WS] Reusing open flight log ${existing.flightLogId} for user ${playerId} on reconnect`);
                }

                players.set(playerId, {
                    ws,
                    state: reuseFlight ? existing.state : null,
                    username,
                    avatarUrl: reuseFlight ? existing.avatarUrl : null,
                    sessionStart: reuseFlight ? existing.sessionStart : Date.now(),
                    lastPersist: reuseFlight ? existing.lastPersist : Date.now(),
                    distanceNm: reuseFlight ? existing.distanceNm : 0,
                    prevLat: reuseFlight ? existing.prevLat : null,
                    prevLon: reuseFlight ? existing.prevLon : null,
                    flightLogId: reuseFlight ? existing.flightLogId : null,
                    creatingFlightLog: false,
                    departureAirportId: reuseFlight ? existing.departureAirportId : null,
                    departureAlt: reuseFlight ? existing.departureAlt : 0,
                    isAirborne: reuseFlight ? existing.isAirborne : false,
                    maxAltitudeFt: reuseFlight ? existing.maxAltitudeFt : 0,
                    speedSamples: reuseFlight ? existing.speedSamples : [],
                    routePoints: reuseFlight ? existing.routePoints : [],
                    lastRouteSample: reuseFlight ? existing.lastRouteSample : 0,
                    flightStartTime: reuseFlight ? existing.flightStartTime : null,
                    flightDistanceNm: reuseFlight ? existing.flightDistanceNm : 0,
                    prevAlt: reuseFlight ? existing.prevAlt : undefined,
                    lastUpdateTime: reuseFlight ? existing.lastUpdateTime : 0,
                    lastVerticalFpm: reuseFlight ? existing.lastVerticalFpm : 0,
                    missionId: reuseFlight ? existing.missionId : null,
                    userMissionId: reuseFlight ? existing.userMissionId : null,
                    missionArrivalAirportId: reuseFlight ? existing.missionArrivalAirportId : null,
                    missionWaypoints: reuseFlight ? existing.missionWaypoints : null,
                    missionNextWpIndex: reuseFlight ? existing.missionNextWpIndex : 0,
                    missionAllWpReached: reuseFlight ? existing.missionAllWpReached : false,
                    missionExternalCompleteSent: reuseFlight ? existing.missionExternalCompleteSent : false,
                    authToken: msg.token,
                    aircraftRegistration: reuseFlight ? existing.aircraftRegistration : null,
                    aircraftType: reuseFlight ? existing.aircraftType : null,
                    statsRecalculated: false,
                    onGroundCount: reuseFlight ? existing.onGroundCount : 0,
                    lastFlightEndTime: reuseFlight ? existing.lastFlightEndTime : 0,
                    sessionDbId: undefined,
                });

                fetchPlayerInfo(playerId).then(info => {
                    const entry = players.get(playerId);
                    if (entry) {
                        if (info.username) entry.username = info.username;
                        entry.avatarUrl = info.avatarUrl;
                    }
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
                        const rawStep = haversineNm(entry.prevLat, entry.prevLon, lat, lon);
                        if (rawStep < MAX_STEP_NM) {
                            stepNm = rawStep;
                            entry.distanceNm += stepNm;
                        }
                    }
                    entry.prevLat = lat;
                    entry.prevLon = lon;

                    if (
                        entry.userMissionId &&
                        Array.isArray(entry.missionWaypoints) &&
                        entry.missionWaypoints.length > 0 &&
                        !entry.missionAllWpReached
                    ) {
                        try {
                            const nextIdx = entry.missionNextWpIndex || 0;
                            if (nextIdx < entry.missionWaypoints.length) {
                                const wp = entry.missionWaypoints[nextIdx];
                                const distToWp = haversineNm(lat, lon, wp.lat, wp.lon);
                                if (distToWp <= MISSION_WAYPOINT_REACH_NM) {
                                    console.log(`[Mission] Waypoint ${nextIdx + 1}/${entry.missionWaypoints.length} reached: user=${playerId} mission=${entry.missionId} name="${wp.name || 'unnamed'}" dist=${distToWp.toFixed(2)}nm`);
                                    entry.missionNextWpIndex = nextIdx + 1;
                                    if (entry.missionNextWpIndex >= entry.missionWaypoints.length) {
                                        entry.missionAllWpReached = true;
                                        console.log(`[Mission] All waypoints reached: user=${playerId} mission=${entry.missionId} userMission=${entry.userMissionId}`);
                                        if (!entry.missionArrivalAirportId && !entry.missionExternalCompleteSent) {
                                            entry.missionExternalCompleteSent = true;
                                            callExternalMissionComplete(entry.userMissionId, entry.authToken)
                                                .catch(err => console.error(`[Mission] Inflight external /complete error: ${err.message}`));
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`[Mission] Waypoint check error for user ${playerId}:`, err.message);
                        }
                    }

                    const nowMs = Date.now();
                    if (entry.prevAlt !== undefined && entry.lastUpdateTime) {
                        const dtSeconds = Math.max(0.01, (nowMs - entry.lastUpdateTime) / 1000);
                        entry.lastVerticalFpm = ((alt - entry.prevAlt) / dtSeconds) * 60;
                    }
                    entry.prevAlt = alt;
                    entry.lastUpdateTime = nowMs;

                    const cooldownExpired = !entry.lastFlightEndTime || (Date.now() - entry.lastFlightEndTime) >= FLIGHT_LOG_COOLDOWN_MS;
                    const aircraftIdNum = Number(msg.aircraftId);
                    const hasValidAircraftId = Number.isInteger(aircraftIdNum) && aircraftIdNum > 0;
                    if (!entry.flightLogId && !entry.creatingFlightLog && dbPool && cooldownExpired && airspeed >= MIN_AIRSPEED_TO_START_LOG && !hasValidAircraftId) {
                        if (!entry.warnedMissingAircraftId || (Date.now() - entry.warnedMissingAircraftId) > 60000) {
                            console.warn(`[Flight] Skipping flight log creation for user ${playerId}: missing or invalid aircraftId (received: ${msg.aircraftId})`);
                            entry.warnedMissingAircraftId = Date.now();
                            try {
                                ws.send(JSON.stringify({
                                    type: 'flightLogSkipped',
                                    reason: 'missingAircraftId',
                                    received: msg.aircraftId === undefined ? null : msg.aircraftId,
                                }));
                            } catch (_) {}
                        }
                    }
                    if (!entry.flightLogId && !entry.creatingFlightLog && dbPool && cooldownExpired && airspeed >= MIN_AIRSPEED_TO_START_LOG && hasValidAircraftId) {
                        entry.creatingFlightLog = true;
                        try {
                            const airport = await findNearestAirportWithFallback(lat, lon);

                            if (players.get(playerId) !== entry) {
                                console.warn(`[Flight] Aborting flight log creation for user ${playerId}: entry no longer active`);
                                return;
                            }

                            if (airport) entry.departureAirportId = airport.id;

                            if (msg.missionId) entry.missionId = Number(msg.missionId) || null;
                            if (msg.aircraftRegistration) entry.aircraftRegistration = String(msg.aircraftRegistration);
                            entry.aircraftType = msg.aircraftCode ? String(msg.aircraftCode) : (msg.aircraft ? String(msg.aircraft) : null);

                            if (entry.missionId) {
                                try {
                                    const [umRows] = await dbPool.execute(
                                        `SELECT id FROM user_missions WHERE user_id = ? AND mission_id = ? AND status IN ('started','in_progress') LIMIT 1`,
                                        [playerId, entry.missionId]);
                                    if (umRows.length) {
                                        entry.userMissionId = umRows[0].id;
                                        await dbPool.execute(`UPDATE user_missions SET status = 'in_progress' WHERE id = ?`, [entry.userMissionId]);
                                    }
                                } catch (err) {
                                    console.error(`[DB] User mission lookup error for user ${playerId}:`, err.message);
                                }

                                try {
                                    const [missionRows] = await dbPool.execute(
                                        `SELECT arrival_airport_id FROM missions WHERE id = ?`,
                                        [entry.missionId]
                                    );
                                    entry.missionArrivalAirportId = missionRows.length ? missionRows[0].arrival_airport_id : null;
                                    const wpsByMission = await loadWaypointsForMissionIds([entry.missionId]);
                                    const wps = wpsByMission.get(entry.missionId) || [];
                                    entry.missionWaypoints = wps
                                        .map(wp => ({
                                            id: wp.id,
                                            order_index: wp.order_index,
                                            name: wp.name,
                                            lat: Number(wp.latitude),
                                            lon: Number(wp.longitude),
                                        }))
                                        .filter(wp => Number.isFinite(wp.lat) && Number.isFinite(wp.lon));
                                    entry.missionNextWpIndex = 0;
                                    entry.missionAllWpReached = entry.missionWaypoints.length === 0;
                                    entry.missionExternalCompleteSent = false;
                                    console.log(`[Mission] Tracking mission ${entry.missionId} for user ${playerId}: waypoints=${entry.missionWaypoints.length}, requiredArrivalAirportId=${entry.missionArrivalAirportId || 'none'}`);
                                } catch (err) {
                                    console.error(`[Mission] Tracking setup error for user ${playerId}, mission=${entry.missionId}:`, err.message);
                                }
                            }

                            const [result] = await dbPool.execute(
                                `INSERT INTO flight_logs
                                 (user_id, departure_airport_id, aircraft_id, aircraft_type, aircraft_registration, mission_id, user_mission_id, departure_time, status)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 'departed')`,
                                [playerId, entry.departureAirportId, aircraftIdNum, entry.aircraftType, entry.aircraftRegistration, entry.missionId, entry.userMissionId]
                            );
                            const insertId = result.insertId;

                            if (players.get(playerId) !== entry) {
                                console.warn(`[Flight] Player ${playerId} disconnected after flight log INSERT (log ${insertId}); cancelling immediately`);
                                try {
                                    await dbPool.execute(
                                        `UPDATE flight_logs
                                            SET status = 'cancelled',
                                                arrival_time = NOW(),
                                                flight_duration_min = TIMESTAMPDIFF(SECOND, departure_time, NOW()) / 60
                                          WHERE id = ?`,
                                        [insertId]
                                    );
                                } catch (cancelErr) {
                                    console.error(`[DB] Failed to auto-cancel orphan flight log ${insertId}:`, cancelErr.message);
                                }
                                return;
                            }

                            entry.flightLogId = insertId;
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
                            console.log(`[Flight] Departure logged for user ${playerId}, log id: ${entry.flightLogId}, aircraft: ${aircraftIdNum} (${entry.aircraftType || '?'}), mission: ${entry.missionId || 'none'}, userMission: ${entry.userMissionId || 'none'}`);
                            try {
                                ws.send(JSON.stringify({
                                    type: 'flightLogStarted',
                                    flightLogId: entry.flightLogId,
                                    aircraftId: aircraftIdNum,
                                    aircraftType: entry.aircraftType || null,
                                    departureAirportId: entry.departureAirportId,
                                    missionId: entry.missionId,
                                    userMissionId: entry.userMissionId,
                                    departureTime: entry.flightStartTime,
                                }));
                            } catch (_) {}
                        } catch (err) {
                            console.error(`[DB] Flight log insert error for user ${playerId}:`, err.message);
                        } finally {
                            entry.creatingFlightLog = false;
                        }
                    }

                    if (entry.flightLogId) {
                        if (alt > entry.maxAltitudeFt) entry.maxAltitudeFt = alt;
                        if (airspeed > 0) entry.speedSamples.push(airspeed);
                        entry.flightDistanceNm += stepNm;

                        const now = Date.now();
                        if (now - entry.lastRouteSample > 5000) {
                            if (entry.routePoints.length >= MAX_ROUTE_POINTS) {
                                entry.routePoints = entry.routePoints.filter((_, i) => i % 2 === 0);
                            }
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

            if (msg.type === 'crash' && playerId) {
                const entry = players.get(playerId);
                if (!entry) {
                    console.warn(`[Crash] Received crash from unknown player ${playerId}`);
                    return;
                }
                const reasonRaw = typeof msg.reason === 'string' ? msg.reason.slice(0, 64) : 'unknown';
                const altFt = Number.isFinite(Number(msg.altitudeFt)) ? Math.round(Number(msg.altitudeFt)) : null;
                const vsFpm = Number.isFinite(Number(msg.verticalSpeedFpm)) ? Math.round(Number(msg.verticalSpeedFpm)) : null;
                if (!entry.flightLogId) {
                    console.warn(`[Crash] Player ${playerId} reported crash without an active flight log (reason=${reasonRaw}, altFt=${altFt}, vsFpm=${vsFpm}) — ignoring`);
                    return;
                }
                console.log(`[Crash] Player ${playerId} crashed: reason=${reasonRaw} altFt=${altFt} vsFpm=${vsFpm} flightLogId=${entry.flightLogId}`);
                try {
                    await finalizeFlight(playerId, entry, 'crashed', entry.state);
                } catch (err) {
                    console.error(`[Crash] finalizeFlight error for user ${playerId}:`, err.message);
                }
            }
        } catch (e) { /* ignore malformed */ }
    });

    ws.on('close', async () => {
        if (!playerId) return;
        const entry = players.get(playerId);
        if (!entry || entry.ws !== ws) {
            console.log(`[WS] Stale close for player ${playerId} (replaced by newer session)`);
            return;
        }
        if (dbPool) {
            if (entry.flightLogId) {
                await finalizeFlight(playerId, entry, 'cancelled', entry.state);
            }

            if (!entry.statsRecalculated) {
                const sessionMinutes = (Date.now() - entry.lastPersist) / 60000;
                const hoursIncrement = entry.flightLogId ? 0 : sessionMinutes / 60;
                const distNm = entry.flightLogId ? 0 : entry.distanceNm;
                const distKm = distNm * 1.852;
                try {
                    await dbPool.execute(
                        `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, total_reward_points, last_flight_at)
                         VALUES (?, 0, ?, ?, ?, FLOOR(? * ?), NOW())
                         ON DUPLICATE KEY UPDATE
                           total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                           total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                           total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                           total_reward_points = total_reward_points + (FLOOR(total_distance_km * ?) - FLOOR((total_distance_km - VALUES(total_distance_km)) * ?)),
                           last_flight_at = NOW()`,
                        [playerId, hoursIncrement, distNm, distKm, distKm, POINTS_PER_KM, POINTS_PER_KM, POINTS_PER_KM]
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
                others.push({ ...otherEntry.state, username: otherEntry.username, avatarUrl: otherEntry.avatarUrl });
            }
        }
        try {
            selfEntry.ws.send(JSON.stringify({ type: 'state', players: others }));
        } catch (e) { /* ignore */ }
    }
}, 50);

// Periodic stats flush every 30 seconds
let periodicFlushRunning = false;
setInterval(async () => {
    if (!dbPool || players.size === 0) return;
    if (periodicFlushRunning) {
        console.warn('[Periodic] Previous flush still running, skipping this tick');
        return;
    }
    periodicFlushRunning = true;
    try {
    for (const [userId, entry] of players) {
        const now = Date.now();
        const sessionMinutes = (now - entry.lastPersist) / 60000;
        if (sessionMinutes < PERIODIC_MIN_SESSION_MIN) continue;

        const hasActiveFlight = !!entry.flightLogId;
        const hoursIncrement = sessionMinutes / 60;
        const distNm = entry.distanceNm;
        const distKm = distNm * 1.852;

        try {
            await dbPool.execute(
                `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, total_reward_points, last_flight_at)
                 VALUES (?, 0, ?, ?, ?, FLOOR(? * ?), NOW())
                 ON DUPLICATE KEY UPDATE
                   total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                   total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                   total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                   total_reward_points = total_reward_points + (FLOOR(total_distance_km * ?) - FLOOR((total_distance_km - VALUES(total_distance_km)) * ?)),
                   last_flight_at = NOW()`,
                [userId, hoursIncrement, distNm, distKm, distKm, POINTS_PER_KM, POINTS_PER_KM, POINTS_PER_KM]
            );
        } catch (err) {
            console.error(`[DB] Stats persist error for user ${userId}:`, err.message);
        }

        try {
            const [[flightBalance]] = await dbPool.execute(
                `SELECT purchased_flight_hours, total_flight_hours FROM user_flight_stats WHERE user_id = ?`,
                [userId]
            );
            if (flightBalance) {
                const purchased = parseFloat(flightBalance.purchased_flight_hours) || 1.00;
                const flown = parseFloat(flightBalance.total_flight_hours) || 0;
                if (purchased - flown <= 0) {
                    console.log(`[WS] No flight hours remaining for user ${userId}, disconnecting`);
                    try {
                        entry.ws.send(JSON.stringify({ type: 'noFlightHours' }));
                        entry.ws.close(4002, 'No flight hours remaining');
                    } catch (_) {}
                    continue;
                }
            }
        } catch (err) {
            console.error(`[DB] Flight balance check error for user ${userId}:`, err.message);
        }

        entry.distanceNm = 0;
        entry.lastPersist = now;

        if (entry.flightLogId && entry.flightStartTime) {
            const fDistKm = Math.round(entry.flightDistanceNm * 1.852 * 100) / 100;
            const fDistNm = Math.round(entry.flightDistanceNm * 100) / 100;
            const maxAltFt = Math.round(entry.maxAltitudeFt * METERS_TO_FEET);
            const avgSpd = entry.speedSamples.length
                ? Math.round((entry.speedSamples.reduce((a, b) => a + b, 0) / entry.speedSamples.length) * KMH_TO_KNOTS * 100) / 100
                : null;
            try {
                const [updRes] = await dbPool.execute(
                    `UPDATE flight_logs SET
                        flight_duration_min = TIMESTAMPDIFF(SECOND, departure_time, NOW()) / 60,
                        distance_km = ?,
                        distance_nm = ?,
                        max_altitude_ft = ?,
                        avg_speed_knots = ?,
                        route_data = ?
                     WHERE id = ? AND status IN ('departed','in_flight')`,
                    [fDistKm, fDistNm, maxAltFt, avgSpd, JSON.stringify(entry.routePoints), entry.flightLogId]
                );
                if (updRes && updRes.affectedRows > 0 && entry.ws && entry.ws.readyState === 1) {
                    try {
                        entry.ws.send(JSON.stringify({
                            type: 'flightLogUpdated',
                            flightLogId: entry.flightLogId,
                            distanceKm: fDistKm,
                            distanceNm: fDistNm,
                            maxAltitudeFt: maxAltFt,
                            avgSpeedKnots: avgSpd,
                            routePoints: entry.routePoints.length,
                        }));
                    } catch (_) {}
                }
            } catch (err) {
                console.error(`[DB] Flight log periodic update error for user ${userId}:`, err.message);
            }
        }
    }
    } finally {
        periodicFlushRunning = false;
    }
}, PERIODIC_FLUSH_MS);

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
                const hoursIncrement = entry.flightLogId ? 0 : sessionMinutes / 60;
                const distNm = entry.flightLogId ? 0 : entry.distanceNm;
                const distKm = distNm * 1.852;
                try {
                    await dbPool.execute(
                        `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, total_reward_points, last_flight_at)
                         VALUES (?, 0, ?, ?, ?, FLOOR(? * ?), NOW())
                         ON DUPLICATE KEY UPDATE
                           total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                           total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                           total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                           total_reward_points = total_reward_points + (FLOOR(total_distance_km * ?) - FLOOR((total_distance_km - VALUES(total_distance_km)) * ?)),
                           last_flight_at = NOW()`,
                        [userId, hoursIncrement, distNm, distKm, distKm, POINTS_PER_KM, POINTS_PER_KM, POINTS_PER_KM]
                    );
                } catch (err) {
                    console.error(`[Shutdown] Stats persist error for user ${userId}:`, err.message);
                }
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
