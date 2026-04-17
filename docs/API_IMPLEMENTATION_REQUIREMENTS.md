# Game Server (`server.js`) — Implementation Requirements

> This document describes what the production game server (`server.js`) needs to implement. This is the **raw Node.js HTTP + WebSocket server** that serves the built game from `dist/` and runs real-time multiplayer at 20 Hz.

---

## Current State

The server already has:

| Feature | How |
|---------|-----|
| Static file server | Serves `dist/` with MIME types and cache headers |
| `POST /api/register` | ~~Creates a UUID, stores `(email, ip, location)` in `game_sessions`~~ **→ TO BE REMOVED** |
| WebSocket `/ws` | `join` → `update` → `state` broadcast at 20 Hz, `playerJoined`/`playerLeft` events |
| MySQL pool | Auto-creates `game_sessions` table on startup |

---

## 0. Authentication Integration (Login-First Architecture)

**Context:** The game will **never** be opened without a logged-in user. The user always logs in through the website first (Express API `POST /api/auth/login`), then navigates to the game. There is no anonymous/guest play.

### Full flow

**Domains:**

| Service | URL |
|---------|-----|
| Website (React SPA + Express API) | `https://simflightpro.com` |
| Game server (`server.js`) | `https://game.simflightpro.com` |

Since these are **different subdomains**, localStorage is not shared. The token is passed via **URL query parameter** when the website opens the game.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WEBSITE  —  https://simflightpro.com                      │
│                                                                             │
│  1. User logs in via POST /api/auth/login                                   │
│     → Express API returns JWT { id, username, isAdmin }                     │
│     → Token stored in localStorage                                          │
│                                                                             │
│  2. User clicks "Play" / "Enter Game"                                       │
│     → Website reads token from localStorage                                 │
│     → Opens game URL with token in query param:                             │
│       https://game.simflightpro.com/?token=eyJhbGciOi...                    │
│       (window.location.href or window.open)                                 │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ Browser navigates
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│               GAME SERVER  —  https://game.simflightpro.com                 │
│                                                                             │
│  3. server.js serves dist/index.html (static file handler)                  │
│     → Game client JS loads in the browser                                   │
│     → Reads token from URL: new URLSearchParams(location.search).get(token) │
│     → Strips token from URL bar (history.replaceState) for cleanliness      │
│     → Connects WebSocket: new WebSocket('wss://game.simflightpro.com/ws')   │
│     → Sends: { type: 'join', token }                                        │
│                                                                             │
│  4. server.js WS `join` handler:                                            │
│     → jwt.verify(token, SECRET_KEY) → extract { id, username }              │
│     → If invalid/expired → ws.close(4001, 'Unauthorized')                   │
│     → If valid → playerId = decoded.id (INT from users table)               │
│     → Store in players Map, broadcast playerJoined                          │
│                                                                             │
│  5. On WS `update`:                                                         │
│     → playerId is users.id (INT), accumulate distance for stats flush       │
│                                                                             │
│  6. On WS `close`:                                                          │
│     → Final stats flush → remove from Map → broadcast playerLeft            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Changes to `join` message

**Old (anonymous):**

```json
{ "type": "join", "userId": "a1b2c3d4-e5f6-..." }
```

**New (authenticated):**

```json
{ "type": "join", "token": "<jwt-from-login>" }
```

No `userId` field needed — the server extracts `id` from the token.

### Server-side `join` handler

```javascript
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY; // same env var as Express API

// Inside wss.on('connection') → on 'message'
if (msg.type === 'join') {
    if (!msg.token || !SECRET_KEY) {
        ws.close(4001, 'Authentication required');
        return;
    }

    let decoded;
    try {
        decoded = jwt.verify(msg.token, SECRET_KEY);
    } catch (err) {
        console.log(`[WS] Invalid token: ${err.message}`);
        ws.close(4001, 'Invalid or expired token');
        return;
    }

    playerId = decoded.id;         // users.id (INT)
    const username = decoded.username;

    players.set(playerId, {
        ws,
        state: null,
        username,
        sessionStart: Date.now(),
        lastPersist: Date.now(),
        distanceNm: 0,
        prevLat: null,
        prevLon: null,
    });

    const onlineCount = players.size;
    ws.send(JSON.stringify({ type: 'welcome', userId: playerId, username, onlineCount }));
    broadcast({ type: 'playerJoined', userId: playerId, username, onlineCount });
    console.log(`[WS] Player joined: ${username} (id: ${playerId}, online: ${onlineCount})`);
}
```

### `POST /api/register` — REMOVE

This endpoint is no longer needed. Authentication happens via the website. Remove the entire `POST /api/register` handler from `server.js`.

The `game_sessions` table can be **repurposed** to log WebSocket connections instead (see Section 6).

### Website side — "Play" button (React — `src/`)

When the user clicks "Play" or "Enter Game", the website builds the game URL with the token:

```typescript
const GAME_URL = import.meta.env.VITE_GAME_URL || 'http://localhost:3000';

function handlePlayClick() {
    const token = localStorage.getItem('token');
    if (!token) {
        // redirect to login
        return;
    }
    window.location.href = `${GAME_URL}?token=${encodeURIComponent(token)}`;
}
```

### Game client side (inside the game's own JS, served from `dist/`)

The game client runs on `game.simflightpro.com`. It reads the token from the URL, cleans it up, and connects:

```javascript
// On game load — read token from URL
const params = new URLSearchParams(window.location.search);
const token = params.get('token');

if (!token) {
    // No token — redirect back to website login
    window.location.href = 'https://simflightpro.com/login';
}

// Remove token from URL bar (security: avoid sharing URL with token)
history.replaceState(null, '', window.location.pathname);

// Connect to game server WebSocket
const ws = new WebSocket(`wss://${window.location.host}/ws`);

ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', token }));
};

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    // handle 'welcome', 'state', 'playerJoined', 'playerLeft'
};

ws.onclose = (event) => {
    if (event.code === 4001) {
        // Token rejected — redirect to login
        window.location.href = 'https://simflightpro.com/login';
    }
};
```

### Security considerations

- The token is short-lived (8h default, or 30d with "remember me")
- `history.replaceState` removes it from the URL bar immediately after reading
- HTTPS encrypts the URL in transit (query params are not visible to intermediaries)
- The game server validates the token server-side — a tampered/expired token results in `ws.close(4001)`

### `game_sessions` table changes

Since `POST /api/register` is removed, the table no longer receives UUID inserts from the REST endpoint. It becomes a **WebSocket session log** written on `join`:

| Column | Old | New |
|--------|-----|-----|
| `user_id` | `VARCHAR(36)` UUID | `INT` — `users.id` from JWT |
| `email` | From register body | From DB lookup or dropped (username from JWT is enough) |

Updated `game_sessions` schema:

```sql
CREATE TABLE IF NOT EXISTS game_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    username VARCHAR(100) NOT NULL,
    ip VARCHAR(45) NOT NULL,
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    disconnected_at DATETIME DEFAULT NULL,
    flight_duration_min DECIMAL(10,2) DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_game_sessions_user (user_id),
    INDEX idx_game_sessions_connected (connected_at)
);
```

Remove the `UNIQUE KEY idx_user_id` — a user can have multiple sessions over time.

### New dependency for `server.js`

```bash
npm install jsonwebtoken
```

### Environment variable

`SECRET_KEY` — **same** env var the Express API already uses (not `JWT_SECRET`). Must be set on the game server's Railway service too.

---

## 1. Expose Online Player Count via REST

**Why:** The landing page displays a live "Active Pilots" stat card. The frontend fetches this over HTTP (no WebSocket needed for a single number).

### What to add

A new `GET /api/online-count` route inside the existing `http.createServer` callback:

```javascript
if (req.method === 'GET' && req.url.split('?')[0] === '/api/online-count') {
    jsonResponse(res, 200, { count: players.size });
    return;
}
```

- `players` is the existing in-memory `Map` — its `.size` is the real-time count.
- No auth required, no DB query. Pure in-memory read.
- Response: `{ "count": 7 }`

### Where in the code

Add it **before** the static file handler block, right after the `POST /api/register` block (around line 117 of the current file).

---

## 2. Expose Online Player Positions via REST

**Why:** The Map page on the website (`/map`) needs to display all flying players as markers. The map frontend polls this endpoint every 5–10 seconds.

### What to add

A new `GET /api/players` route:

```javascript
if (req.method === 'GET' && req.url.split('?')[0] === '/api/players') {
    const list = [];
    for (const [id, entry] of players) {
        if (entry.state) {
            list.push({
                userId: id,
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
```

- Reads from the same in-memory `players` Map.
- Only returns players that have sent at least one `update` (state is not null).
- Response example:

```json
{
  "data": [
    {
      "userId": "a1b2c3d4-...",
      "lat": -23.5505,
      "lon": -46.6333,
      "alt": 5000,
      "heading": 90,
      "airspeed": 250,
      "aircraft": null
    }
  ]
}
```

### Where in the code

Add it right after the `/api/online-count` block.

---

## 3. Add `aircraft` Field to WebSocket Update

**Why:** The landing page and map need to show what aircraft each player is flying.

### Current `update` message format

```json
{ "type": "update", "lat": ..., "lon": ..., "alt": ..., "airspeed": ..., "throttle": ..., "heading": ..., "pitch": ..., "roll": ... }
```

### Change needed

In the `msg.type === 'update'` handler, also capture `msg.aircraft`:

```javascript
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
            aircraft: msg.aircraft || null,   // ← ADD THIS
        };
    }
}
```

The game client (`RealtimeClient.ts`) must also start sending `aircraft` in its `sendThrottled()` payload. This is backwards-compatible — old clients that don't send it will have `aircraft: null`.

---

## 4. Platform Statistics Endpoint

**Why:** The landing page hero section shows airports count, missions count, registered pilots, and total flight hours. These should come from real DB data instead of hardcoded values.

### What to add

A new `GET /api/stats` route:

```javascript
if (req.method === 'GET' && req.url.split('?')[0] === '/api/stats') {
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
    } catch (err) {
        console.error('[API] Stats error:', err.message);
        jsonResponse(res, 200, {
            airports: 0, missions: 0, registeredPilots: 0,
            totalFlightHours: 0, onlineNow: players.size
        });
    }
    return;
}
```

### Database tables used

These tables already exist (created by `api/` migrations):

| Table | Query |
|-------|-------|
| `airports` | `COUNT(*) WHERE is_active = 1` |
| `missions` | `COUNT(*) WHERE is_active = 1` |
| `users` | `COUNT(*) WHERE is_enabled = 1` |
| `user_flight_stats` | `SUM(total_flight_hours)` |

If any table doesn't exist yet (e.g., server started before migrations ran), the `try/catch` returns zeros gracefully.

---

## 5. Periodic Stats Persistence

**Why:** While a player is flying, the game server holds real-time flight data in memory (via WebSocket). This data must be periodically written to the database so that if the server crashes or the player disconnects abruptly, the flight progress is not lost.

Since all players are authenticated (see Section 0), `playerId` is always `users.id` (INT) extracted from the JWT. No UUID, no guest fallback — stats are always persisted.

### `user_flight_stats` table (already exists, created by Express API migrations)

```sql
CREATE TABLE IF NOT EXISTS user_flight_stats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    total_flights INT DEFAULT 0,
    total_distance_km DECIMAL(12,2) DEFAULT 0,
    total_distance_nm DECIMAL(12,2) DEFAULT 0,
    total_flight_hours DECIMAL(10,2) DEFAULT 0,
    total_missions_completed INT DEFAULT 0,
    total_missions_failed INT DEFAULT 0,
    total_reward_points INT DEFAULT 0,
    favorite_airport_id INT DEFAULT NULL,
    most_used_aircraft VARCHAR(100) DEFAULT NULL,
    best_landing_rate_fpm DECIMAL(8,2) DEFAULT NULL,
    avg_landing_rate_fpm DECIMAL(8,2) DEFAULT NULL,
    pilot_rank ENUM('student','private_pilot','commercial_pilot',
                    'airline_pilot','captain','senior_captain') DEFAULT 'student',
    last_flight_at DATETIME DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (favorite_airport_id) REFERENCES airports(id) ON DELETE SET NULL
);
```

### What to add

Each player entry in the in-memory `players` Map should also track cumulative session data:

```javascript
players.set(playerId, {  // playerId = users.id (INT) from JWT
    ws,
    state: null,
    username,              // from decoded JWT
    sessionStart: Date.now(),
    lastPersist: Date.now(),
    distanceNm: 0,
    prevLat: null,
    prevLon: null,
});
```

#### 5a. Accumulate distance on each `update`

In the `msg.type === 'update'` handler, after storing the state, compute the distance from the previous position:

```javascript
if (entry.prevLat !== null && entry.prevLon !== null) {
    const dNm = haversineNm(entry.prevLat, entry.prevLon, msg.lat, msg.lon);
    if (dNm < 50) entry.distanceNm += dNm; // ignore teleports > 50 NM
}
entry.prevLat = msg.lat;
entry.prevLon = msg.lon;
```

Haversine helper (nautical miles):

```javascript
function haversineNm(lat1, lon1, lat2, lon2) {
    const R = 3440.065; // Earth radius in NM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
```

#### 5b. Periodic DB flush (every 30 seconds)

A `setInterval` writes accumulated stats to the database for every connected player:

```javascript
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
```

#### 5c. Final flush on disconnect

In the `ws.on('close')` handler, run the same persist logic one last time **before** deleting the player from the Map. Also increment `total_flights` by 1:

```javascript
ws.on('close', async () => {
    if (playerId) {
        const entry = players.get(playerId);
        if (entry && dbPool) {
            const sessionMinutes = (Date.now() - entry.lastPersist) / 60000;
            const hoursIncrement = sessionMinutes / 60;
            const distKm = entry.distanceNm * 1.852;
            try {
                await dbPool.execute(
                    `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, last_flight_at)
                     VALUES (?, 1, ?, ?, ?, NOW())
                     ON DUPLICATE KEY UPDATE
                       total_flights     = total_flights + 1,
                       total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
                       total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
                       total_distance_km  = total_distance_km  + VALUES(total_distance_km),
                       last_flight_at = NOW()`,
                    [playerId, hoursIncrement, entry.distanceNm, distKm]
                );
            } catch (err) {
                console.error(`[DB] Final persist error for user ${playerId}:`, err.message);
            }
        }

        players.delete(playerId);
        const onlineCount = players.size;
        broadcast({ type: 'playerLeft', userId: playerId, onlineCount });
        console.log(`[WS] Player left: ${playerId} (online: ${onlineCount})`);
    }
});
```

### Data flow

```
Player connects  →  join { token }  →  jwt.verify(token) → playerId = users.id (INT)
                     │
                     ├─  sessionStart = now, distanceNm = 0
                     │
Every ~50ms      →  update → accumulate haversine distance
                     │
Every 30s        →  flush  → UPSERT hours + distance to user_flight_stats, reset counters
                     │
Player disconnects → final flush → +1 flight, persist remaining hours + distance, delete from Map
```

---

## 6. Persist WebSocket Session to `game_sessions`

**Why:** Every WebSocket connection should be logged for flight history and analytics.

### How it works (after Section 0 changes)

Since `POST /api/register` is removed, `game_sessions` is written **on WebSocket `join`** and **updated on `close`**:

```javascript
// On join (inside the join handler from Section 0, after jwt.verify succeeds):
if (dbPool) {
    const ip = (ws._socket?.remoteAddress || '').replace('::ffff:', '');
    dbPool.execute(
        `INSERT INTO game_sessions (user_id, username, ip)
         VALUES (?, ?, ?)`,
        [playerId, username, ip]
    ).then(([result]) => {
        const entry = players.get(playerId);
        if (entry) entry.sessionDbId = result.insertId;
    }).catch(err => console.error('[DB] Session insert error:', err.message));
}
```

```javascript
// On disconnect (inside ws.on('close'), before players.delete):
if (entry && dbPool && entry.sessionDbId) {
    const durationMin = (Date.now() - entry.sessionStart) / 60000;
    dbPool.execute(
        `UPDATE game_sessions SET disconnected_at = NOW(), flight_duration_min = ? WHERE id = ?`,
        [durationMin, entry.sessionDbId]
    ).catch(err => console.error('[DB] Session update error:', err.message));
}
```

This is fire-and-forget — if the DB is unavailable, multiplayer still works.

---

## 7. Flight Log Recording

**Why:** The `flight_logs` table stores individual flight records (departure, arrival, route, stats). Currently the Express API has CRUD routes for it (`api/routes/flight-logs.js`) but **nothing creates entries** — the game client never calls them. The game server is the only place that knows when a player departs, flies, and lands.

### `flight_logs` table (created by Express API migrations)

```sql
CREATE TABLE IF NOT EXISTS flight_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    mission_id INT DEFAULT NULL,
    departure_airport_id INT NOT NULL,
    arrival_airport_id INT DEFAULT NULL,
    departure_time DATETIME NOT NULL,
    arrival_time DATETIME DEFAULT NULL,
    flight_duration_min INT DEFAULT NULL,
    distance_km DECIMAL(10,2) DEFAULT NULL,
    distance_nm DECIMAL(10,2) DEFAULT NULL,
    max_altitude_ft INT DEFAULT NULL,
    avg_speed_knots DECIMAL(8,2) DEFAULT NULL,
    aircraft_type VARCHAR(100) DEFAULT NULL,
    aircraft_registration VARCHAR(20) DEFAULT NULL,
    status ENUM('departed','in_flight','landed','cancelled','crashed') DEFAULT 'departed',
    landing_rate_fpm DECIMAL(8,2) DEFAULT NULL,
    route_data JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE SET NULL,
    FOREIGN KEY (departure_airport_id) REFERENCES airports(id) ON DELETE CASCADE,
    FOREIGN KEY (arrival_airport_id) REFERENCES airports(id) ON DELETE SET NULL,
    INDEX idx_flight_user (user_id),
    INDEX idx_flight_status (status),
    INDEX idx_flight_departure_time (departure_time)
);
```

### Flight lifecycle inside the game server

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. JOIN                                                             │
│    Player enters game. No flight_log yet.                           │
│                                                                     │
│ 2. FIRST UPDATE (player has a position, on or near ground)          │
│    → Find nearest airport within 5 NM                               │
│    → INSERT flight_logs (status='departed', departure_airport_id)   │
│    → Store flightLogId in player Map entry                          │
│                                                                     │
│ 3. AIRBORNE DETECTION (alt > prev_ground + 100ft & speed > 30kts)  │
│    → UPDATE flight_logs SET status = 'in_flight'                    │
│    → Track max_altitude, speed samples, route points                │
│                                                                     │
│ 4. LANDING DETECTED (was airborne, now alt near ground & speed <30) │
│    → Find nearest airport within 5 NM for arrival                   │
│    → UPDATE flight_logs:                                            │
│        arrival_airport_id, arrival_time = NOW(),                    │
│        status = 'landed', flight_duration_min, distance_km/nm,      │
│        max_altitude_ft, avg_speed_knots, landing_rate_fpm,          │
│        route_data (JSON array of sampled waypoints)                 │
│    → Reset tracking → ready for next flight (back to step 2)       │
│                                                                     │
│ 5. DISCONNECT WITHOUT LANDING                                       │
│    → UPDATE flight_logs SET status = 'cancelled',                   │
│        fill partial stats (duration, distance, max alt, avg speed)  │
└─────────────────────────────────────────────────────────────────────┘
```

### Additional fields in the players Map entry

```javascript
players.set(playerId, {
    // ... existing fields (ws, state, username, sessionStart, etc.) ...

    // Flight log tracking
    flightLogId: null,           // flight_logs.id (set after INSERT)
    departureAirportId: null,    // airports.id
    isAirborne: false,           // true once airborne detection fires
    maxAltitudeFt: 0,            // track max altitude during flight
    speedSamples: [],            // airspeed readings for avg calculation
    routePoints: [],             // [[lat, lon, alt], ...] sampled every 10s
    lastRouteSample: 0,          // Date.now() of last route sample
    flightStartTime: null,       // Date.now() when flight_log was created
    flightDistanceNm: 0,         // per-flight distance (reset on landing)
    prevVerticalSpeed: 0,        // for landing rate (fpm) calculation
});
```

### 7a. Helper — Find nearest airport

```javascript
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
```

`LEAST/GREATEST` clamps the ACOS argument to [-1, 1] to avoid NaN from floating point rounding.

### 7b. Departure — on first `update` (no active flight)

Inside the `msg.type === 'update'` handler, after storing state and accumulating distance:

```javascript
if (!entry.flightLogId && dbPool) {
    const airport = await findNearestAirport(msg.lat, msg.lon, 5);
    if (airport) {
        entry.departureAirportId = airport.id;
    }

    try {
        const [result] = await dbPool.execute(
            `INSERT INTO flight_logs
             (user_id, departure_airport_id, aircraft_type, departure_time, status)
             VALUES (?, ?, ?, NOW(), 'departed')`,
            [playerId, entry.departureAirportId, msg.aircraft || null]
        );
        entry.flightLogId = result.insertId;
        entry.flightStartTime = Date.now();
        entry.maxAltitudeFt = msg.alt || 0;
        entry.speedSamples = [];
        entry.routePoints = [];
        entry.flightDistanceNm = 0;
        entry.isAirborne = false;
        console.log(`[Flight] Departure logged for user ${playerId}, log id: ${entry.flightLogId}`);
    } catch (err) {
        console.error(`[DB] Flight log insert error:`, err.message);
    }
}
```

If no airport is found within 5 NM (e.g. player spawned mid-air), `departure_airport_id` will be null. Since the FK is `NOT NULL` in the original schema, either:
- Allow null: `ALTER TABLE flight_logs MODIFY departure_airport_id INT DEFAULT NULL`
- Or use a fallback "Unknown" airport row

**Recommendation:** change the column to allow NULL — add this to the migration or to `initDatabase()`.

### 7c. In-flight tracking — on every `update` (while flight is active)

```javascript
if (entry.flightLogId) {
    // Max altitude
    if (msg.alt > entry.maxAltitudeFt) entry.maxAltitudeFt = msg.alt;

    // Speed samples (for average)
    if (msg.airspeed > 0) entry.speedSamples.push(msg.airspeed);

    // Per-flight distance
    if (entry.prevLat !== null && entry.prevLon !== null) {
        const dNm = haversineNm(entry.prevLat, entry.prevLon, msg.lat, msg.lon);
        if (dNm < 50) entry.flightDistanceNm += dNm;
    }

    // Route sampling (every 10 seconds)
    const now = Date.now();
    if (now - entry.lastRouteSample > 10000) {
        entry.routePoints.push([
            Math.round(msg.lat * 10000) / 10000,
            Math.round(msg.lon * 10000) / 10000,
            Math.round(msg.alt)
        ]);
        entry.lastRouteSample = now;
    }

    // Airborne detection
    if (!entry.isAirborne && msg.alt > 200 && msg.airspeed > 30) {
        entry.isAirborne = true;
        dbPool.execute(
            `UPDATE flight_logs SET status = 'in_flight' WHERE id = ?`,
            [entry.flightLogId]
        ).catch(() => {});
    }

    // Landing detection (was airborne, now slow & low)
    if (entry.isAirborne && msg.alt < 200 && msg.airspeed < 30) {
        await finalizeFlight(playerId, entry, 'landed', msg);
    }
}
```

### 7d. Finalize flight — on landing or disconnect

```javascript
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
                route_data = ?
             WHERE id = ?`,
            [
                status,
                arrivalAirportId,
                Math.round(durationMin),
                Math.round(distKm * 100) / 100,
                Math.round(entry.flightDistanceNm * 100) / 100,
                entry.maxAltitudeFt,
                avgSpeed ? Math.round(avgSpeed * 100) / 100 : null,
                JSON.stringify(entry.routePoints),
                entry.flightLogId,
            ]
        );
        console.log(`[Flight] ${status}: user ${userId}, log ${entry.flightLogId}, ${Math.round(durationMin)}min, ${Math.round(entry.flightDistanceNm)}nm`);
    } catch (err) {
        console.error(`[DB] Flight log finalize error:`, err.message);
    }

    // Reset for next flight
    entry.flightLogId = null;
    entry.departureAirportId = null;
    entry.isAirborne = false;
    entry.maxAltitudeFt = 0;
    entry.speedSamples = [];
    entry.routePoints = [];
    entry.flightDistanceNm = 0;
    entry.flightStartTime = null;
}
```

### 7e. Disconnect without landing

In the `ws.on('close')` handler, **before** the existing stats flush, add:

```javascript
if (entry.flightLogId) {
    await finalizeFlight(playerId, entry, 'cancelled', entry.state);
}
```

This ensures open flights are marked as `cancelled` with whatever stats were accumulated.

### 7f. Multiple flights per session

After landing, the tracking fields are reset (`flightLogId = null`). The next `update` triggers step 7b again — creating a new `flight_logs` row for the new flight. A single WebSocket session can produce multiple `flight_logs` entries.

### 7g. Landing rate (vertical speed at touchdown)

To calculate `landing_rate_fpm`, track vertical speed between consecutive updates:

```javascript
// Inside the update handler, after storing state:
if (entry.prevAlt !== undefined) {
    const dtSeconds = 0.05; // ~50ms between updates
    entry.lastVerticalFpm = ((msg.alt - entry.prevAlt) / dtSeconds) * 60;
}
entry.prevAlt = msg.alt;
```

On landing detection, `entry.lastVerticalFpm` is the approximate landing rate. Add it to the `finalizeFlight` UPDATE:

```sql
landing_rate_fpm = ?
```

```javascript
// In finalizeFlight, add to params:
status === 'landed' ? Math.round(entry.lastVerticalFpm) : null
```

### 7h. Schema changes — handled by Express API migration

All schema changes are applied by the Express API migration `api/migrations/flight_sim_schema_updates.js`, which runs automatically on API startup. **Do not add ALTER TABLE logic to `server.js`.**

The migration handles:

| Table | Change | Why |
|-------|--------|-----|
| `game_sessions` | `user_id` VARCHAR(36) → INT | JWT auth uses `users.id` (INT) |
| `game_sessions` | Drop `email`, `location` columns | No longer needed (username from JWT) |
| `game_sessions` | Add `username`, `disconnected_at`, `flight_duration_min` | Session tracking |
| `game_sessions` | Drop `UNIQUE idx_user_id` | Users can have multiple sessions |
| `game_sessions` | Rename `created_at` → `connected_at` | Clarity |
| `flight_logs` | `departure_airport_id` NOT NULL → NULL allowed | Mid-air spawn (no airport nearby) |
| `flight_logs` | Add `route_data` JSON column if missing | Store sampled waypoints |
| `user_flight_stats` | Add `best_landing_rate_fpm`, `avg_landing_rate_fpm`, `most_used_aircraft`, `favorite_airport_id` if missing | Extended stats tracking |

All operations are idempotent (checks `information_schema` before altering).

### Summary: flight_logs vs other tables

| What | Table | When written | By whom |
|------|-------|-------------|---------|
| WebSocket connection | `game_sessions` | Join + disconnect | server.js |
| Lifetime totals | `user_flight_stats` | Every 30s + disconnect | server.js |
| Individual flight record | `flight_logs` | Departure + in-flight + landing/disconnect | server.js |

---

## 8. Health Check Endpoint (already implemented)

**Why:** Railway uses `/health` for deployment health checks. The `railway.json` references `healthcheckPath: "/health"`.

### What to add

```javascript
if (req.method === 'GET' && req.url.split('?')[0] === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
}
```

Add this **before** the static file handler. It must respond with `200` for Railway to consider the service healthy.

---

## 9. Auto-Create Missing Tables on Startup

**Why:** The game server shares the same MySQL database as the Express API, but may start before the API runs migrations. It should ensure the tables it reads exist.

### Change `initDatabase()` to also create tables it depends on

```javascript
async function initDatabase() {
    if (!DATABASE_URL) {
        console.warn('[DB] No DATABASE_URL — registration and stats disabled.');
        return;
    }
    try {
        dbPool = mysql.createPool({ uri: DATABASE_URL, waitForConnections: true, connectionLimit: 10 });

        // Table this server owns (updated schema — no more UUID, no UNIQUE)
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
```

The `/api/stats` endpoint queries `airports`, `missions`, `users`, `user_flight_stats` — those are created by the Express API migrations. If they don't exist yet, the stats endpoint catches the error and returns zeros.

---

## Summary of All New Routes

| Method | Path | Auth | Source | Description |
|--------|------|------|--------|-------------|
| `GET` | `/api/online-count` | No | In-memory | `{ count: N }` — number of connected WS players |
| `GET` | `/api/players` | No | In-memory | All player positions for map markers |
| `GET` | `/api/stats` | No | DB + memory | Platform stats (airports, missions, pilots, hours, online) |
| `GET` | `/health` | No | Static | Returns `200 OK` for Railway health checks |

### Route order inside `http.createServer`

```
1. OPTIONS (CORS preflight)          ← already exists
2. GET  /api/online-count            ← NEW
3. GET  /api/players                 ← NEW
4. GET  /api/stats                   ← NEW
5. GET  /health                      ← NEW
6. Static file handler (dist/)       ← already exists

REMOVED: POST /api/register          ← no longer needed (auth via website JWT)
```

---

## WebSocket Changes Summary

| Change | Where |
|--------|-------|
| Capture `msg.aircraft` in `update` handler | `wss.on('connection')` → `msg.type === 'update'` |
| Accumulate haversine distance on each `update` | `wss.on('connection')` → `msg.type === 'update'` |
| Create flight_log on first update (departure) | `wss.on('connection')` → `msg.type === 'update'` |
| Track max alt, avg speed, route points on each update | `wss.on('connection')` → `msg.type === 'update'` |
| Detect airborne → `status = 'in_flight'` | `wss.on('connection')` → `msg.type === 'update'` |
| Detect landing → finalize flight_log with stats | `wss.on('connection')` → `msg.type === 'update'` |
| Verify JWT and extract `users.id` as `playerId` on `join` | `wss.on('connection')` → `msg.type === 'join'` |
| Reject connection if token invalid/missing (`ws.close(4001)`) | `wss.on('connection')` → `msg.type === 'join'` |
| Insert row into `game_sessions` on `join` | `wss.on('connection')` → `msg.type === 'join'` |
| Update `game_sessions` with duration on disconnect | `ws.on('close')` |
| Finalize open flight_log as `cancelled` on disconnect | `ws.on('close')` |
| Final stats flush + `total_flights +1` on disconnect | `ws.on('close')` |
| Periodic stats flush every 30 s (`setInterval`) | Top-level, after server starts |

---

## Environment Variables

The server uses (existing + new):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP server port |
| `DATABASE_URL` | _(empty)_ | MySQL URI; if absent, DB features are disabled but server still runs |
| `SECRET_KEY` | _(required)_ | **NEW** — Must be the same value as the Express API's `SECRET_KEY`. Used by `jsonwebtoken` to verify the JWT on WebSocket `join`. Connection is rejected if not set. |

### Client-side — Website (React `.env`)

| Variable | Example | Purpose |
|----------|---------|---------|
| `VITE_GAME_URL` | `https://game.simflightpro.com` | Base URL of the game server. The "Play" button appends `?token=...` and redirects here. Falls back to `http://localhost:3000` in dev. |

The WebSocket URL is derived on the game side from `window.location.host` — no extra env var needed for the game client.

---

## Appendix: Complete Database Schema Reference

All tables created by the Express API migration `api/migrations/create_flight_sim_tables.js`, with updates applied by `api/migrations/flight_sim_schema_updates.js`.

---

### `airports`

Queried by `GET /api/stats` (count) and `findNearestAirport()` (departure/arrival detection for flight logs).

```sql
CREATE TABLE IF NOT EXISTS airports (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    icao_code     VARCHAR(10) UNIQUE NOT NULL,
    iata_code     VARCHAR(10) DEFAULT NULL,
    name          VARCHAR(255) NOT NULL,
    city          VARCHAR(255) DEFAULT NULL,
    country       VARCHAR(100) DEFAULT NULL,
    country_code  VARCHAR(5) DEFAULT NULL,
    latitude      DECIMAL(10,7) NOT NULL,
    longitude     DECIMAL(10,7) NOT NULL,
    elevation_ft  INT DEFAULT NULL,
    type          ENUM('large_airport','medium_airport','small_airport',
                       'heliport','seaplane_base','closed') DEFAULT 'small_airport',
    continent     VARCHAR(5) DEFAULT NULL,
    region        VARCHAR(10) DEFAULT NULL,
    municipality  VARCHAR(255) DEFAULT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_airport_iata (iata_code),
    INDEX idx_airport_country (country_code),
    INDEX idx_airport_type (type),
    INDEX idx_airport_coords (latitude, longitude),
    INDEX idx_airport_active (is_active)
);
```

---

### `missions`

Queried by `GET /api/stats` (count). Referenced by `flight_logs.mission_id`.

```sql
CREATE TABLE IF NOT EXISTS missions (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    title                   VARCHAR(255) NOT NULL,
    description             TEXT DEFAULT NULL,
    type                    ENUM('free_flight','scheduled','challenge','milestone') NOT NULL,
    difficulty              ENUM('beginner','intermediate','advanced','expert') NOT NULL,
    departure_airport_id    INT DEFAULT NULL,
    arrival_airport_id      INT DEFAULT NULL,
    min_altitude_ft         INT DEFAULT NULL,
    max_altitude_ft         INT DEFAULT NULL,
    required_aircraft_type  VARCHAR(100) DEFAULT NULL,
    reward_points           INT DEFAULT 0,
    distance_nm             DECIMAL(10,2) DEFAULT NULL,
    estimated_duration_min  INT DEFAULT NULL,
    is_active               BOOLEAN DEFAULT TRUE,
    sort_order              INT DEFAULT 0,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (departure_airport_id) REFERENCES airports(id) ON DELETE SET NULL,
    FOREIGN KEY (arrival_airport_id) REFERENCES airports(id) ON DELETE SET NULL,
    INDEX idx_mission_type (type),
    INDEX idx_mission_difficulty (difficulty),
    INDEX idx_mission_active (is_active)
);
```

---

### `user_missions`

Not used by `server.js` yet. For future mission completion detection.

```sql
CREATE TABLE IF NOT EXISTS user_missions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    mission_id   INT NOT NULL,
    status       ENUM('started','in_progress','completed','failed','cancelled') DEFAULT 'started',
    started_at   DATETIME NOT NULL,
    completed_at DATETIME DEFAULT NULL,
    score        INT DEFAULT NULL,
    notes        TEXT DEFAULT NULL,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
    INDEX idx_user_mission_user (user_id),
    INDEX idx_user_mission_status (status)
);
```

---

### `flight_logs`

Written by `server.js` — INSERT on departure, UPDATE on in-flight/landing/disconnect.

```sql
CREATE TABLE IF NOT EXISTS flight_logs (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    user_id               INT NOT NULL,
    mission_id            INT DEFAULT NULL,
    departure_airport_id  INT DEFAULT NULL,          -- nullable (mid-air spawn)
    arrival_airport_id    INT DEFAULT NULL,
    departure_time        DATETIME NOT NULL,
    arrival_time          DATETIME DEFAULT NULL,
    flight_duration_min   INT DEFAULT NULL,
    distance_km           DECIMAL(10,2) DEFAULT NULL,
    distance_nm           DECIMAL(10,2) DEFAULT NULL,
    max_altitude_ft       INT DEFAULT NULL,
    avg_speed_knots       DECIMAL(8,2) DEFAULT NULL,
    aircraft_type         VARCHAR(100) DEFAULT NULL,
    aircraft_registration VARCHAR(20) DEFAULT NULL,
    status                ENUM('departed','in_flight','landed','cancelled','crashed') DEFAULT 'departed',
    landing_rate_fpm      DECIMAL(8,2) DEFAULT NULL,
    route_data            JSON DEFAULT NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE SET NULL,
    FOREIGN KEY (departure_airport_id) REFERENCES airports(id) ON DELETE CASCADE,
    FOREIGN KEY (arrival_airport_id) REFERENCES airports(id) ON DELETE SET NULL,
    INDEX idx_flight_user (user_id),
    INDEX idx_flight_status (status),
    INDEX idx_flight_departure_time (departure_time)
);
```

---

### `user_flight_stats`

Written by `server.js` — UPSERT every 30s and on disconnect.

```sql
CREATE TABLE IF NOT EXISTS user_flight_stats (
    id                       INT AUTO_INCREMENT PRIMARY KEY,
    user_id                  INT UNIQUE NOT NULL,
    total_flights            INT DEFAULT 0,
    total_distance_km        DECIMAL(12,2) DEFAULT 0,
    total_distance_nm        DECIMAL(12,2) DEFAULT 0,
    total_flight_hours       DECIMAL(10,2) DEFAULT 0,
    total_missions_completed INT DEFAULT 0,
    total_missions_failed    INT DEFAULT 0,
    total_reward_points      INT DEFAULT 0,
    favorite_airport_id      INT DEFAULT NULL,
    most_used_aircraft       VARCHAR(100) DEFAULT NULL,
    best_landing_rate_fpm    DECIMAL(8,2) DEFAULT NULL,
    avg_landing_rate_fpm     DECIMAL(8,2) DEFAULT NULL,
    pilot_rank               ENUM('student','private_pilot','commercial_pilot',
                                  'airline_pilot','captain','senior_captain') DEFAULT 'student',
    last_flight_at           DATETIME DEFAULT NULL,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (favorite_airport_id) REFERENCES airports(id) ON DELETE SET NULL
);
```

---

### `game_sessions`

Written by `server.js` — INSERT on WS join, UPDATE on WS close. Auto-created by `server.js` `initDatabase()`.

```sql
CREATE TABLE IF NOT EXISTS game_sessions (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT NOT NULL,
    username            VARCHAR(100) NOT NULL,
    ip                  VARCHAR(45) NOT NULL,
    connected_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    disconnected_at     DATETIME DEFAULT NULL,
    flight_duration_min DECIMAL(10,2) DEFAULT NULL,
    INDEX idx_game_sessions_user (user_id),
    INDEX idx_game_sessions_connected (connected_at)
);
```

---

### `marketplace_listings`

Not used by `server.js`.

```sql
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    seller_id     INT NOT NULL,
    airport_id    INT DEFAULT NULL,
    listing_type  ENUM('airport','aircraft','license','other') NOT NULL,
    title         VARCHAR(255) NOT NULL,
    description   TEXT DEFAULT NULL,
    price         DECIMAL(10,2) DEFAULT 0,
    currency      VARCHAR(10) DEFAULT 'USD',
    status        ENUM('active','sold','cancelled','expired') DEFAULT 'active',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE SET NULL,
    INDEX idx_listing_seller (seller_id),
    INDEX idx_listing_type (listing_type),
    INDEX idx_listing_status (status)
);
```

---

### `user_airports`

Not used by `server.js`.

```sql
CREATE TABLE IF NOT EXISTS user_airports (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    airport_id   INT NOT NULL,
    is_owned     BOOLEAN DEFAULT FALSE,
    is_favorite  BOOLEAN DEFAULT FALSE,
    is_home_base BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_airport (user_id, airport_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE CASCADE,
    INDEX idx_user_airport_user (user_id)
);
```

---

### `online_sessions` (may be deprecated)

Used by Express API `map.js` for heartbeat-based presence. May become redundant with game server in-memory tracking.

```sql
CREATE TABLE IF NOT EXISTS online_sessions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    username        VARCHAR(100) NOT NULL,
    latitude        DECIMAL(10,7) DEFAULT NULL,
    longitude       DECIMAL(10,7) DEFAULT NULL,
    altitude_ft     INT DEFAULT NULL,
    heading         DECIMAL(6,2) DEFAULT NULL,
    airspeed_knots  DECIMAL(8,2) DEFAULT NULL,
    aircraft_type   VARCHAR(100) DEFAULT NULL,
    last_heartbeat  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    connected_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY idx_online_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_online_heartbeat (last_heartbeat)
);
```
