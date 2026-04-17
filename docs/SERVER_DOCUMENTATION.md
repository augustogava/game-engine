# server.js — Complete Technical Documentation

> Production game server for SimFlightPro. Serves the built game client, provides REST APIs for the website, and runs JWT-authenticated real-time multiplayer with flight stats persistence.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Startup Flow](#startup-flow)
4. [Environment Variables](#environment-variables)
5. [Authentication Flow (JWT)](#authentication-flow-jwt)
6. [REST API Endpoints](#rest-api-endpoints)
7. [WebSocket Protocol](#websocket-protocol)
8. [Flight Stats Persistence](#flight-stats-persistence)
9. [Session Logging](#session-logging)
10. [Static File Server](#static-file-server)
11. [Database Tables](#database-tables)
12. [In-Memory State](#in-memory-state)
13. [Helper Functions](#helper-functions)
14. [Dependencies](#dependencies)
15. [Build & Run](#build--run)
16. [Client-Side Integration](#client-side-integration)
17. [Adding New Features](#adding-new-features)

---

## Overview

`server.js` is a single-file Node.js server (no Express, no framework) that provides three core services on one port:

| Service | Transport | Purpose |
|---------|-----------|---------|
| Static file server | HTTP GET | Serves the built game from `dist/` |
| REST API | HTTP GET | Online count, player positions, platform stats, health check |
| Multiplayer | WebSocket | Real-time player state sync at 20 Hz with JWT auth |

Tech stack: `http` (Node built-in) + `mysql2/promise` + `ws` + `jsonwebtoken`.

There is **no anonymous play**. Every player authenticates via a JWT issued by the website's Express API. The game server verifies the token and extracts the user identity.

---

## Architecture

```
                         ┌─────────────────────────────────────────┐
                         │         https://simflightpro.com         │
                         │         (Website — React + Express)      │
                         │                                         │
                         │  POST /api/auth/login → JWT { id, ... } │
                         │  User clicks "Play"                     │
                         │  → redirect to game with ?token=...     │
                         └────────────────┬────────────────────────┘
                                          │ browser navigates
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  https://game.simflightpro.com                               │
│                  (Game Server — server.js)                                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  HTTP Layer (single http.createServer)                                  │ │
│  │                                                                         │ │
│  │  1. OPTIONS → 204 (CORS preflight)                                      │ │
│  │  2. GET /api/online-count → { count: N }                                │ │
│  │  3. GET /api/players → { data: [...positions] }                         │ │
│  │  4. GET /api/stats → { airports, missions, pilots, hours, online }      │ │
│  │  5. GET /health → 200 OK                                                │ │
│  │  6. * → static files from dist/                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  WebSocket Layer (ws, noServer mode, path: /ws)                         │ │
│  │                                                                         │ │
│  │  join { token } → jwt.verify → players Map                              │ │
│  │  update { lat, lon, alt, ... } → state + haversine accumulation         │ │
│  │  close → final stats flush + session update + playerLeft broadcast      │ │
│  │                                                                         │ │
│  │  Timers:                                                                │ │
│  │    50ms  → broadcast all player states (20 Hz)                          │ │
│  │    30s   → flush accumulated stats to user_flight_stats                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  MySQL Pool (mysql2/promise)                                            │ │
│  │                                                                         │ │
│  │  game_sessions     → written on join, updated on disconnect             │ │
│  │  user_flight_stats → UPSERT every 30s + final flush on disconnect       │ │
│  │  airports, missions, users → read-only (queried by /api/stats)          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Startup Flow

```
1. loadEnv()              Read .env file into memory
2. Read DATABASE_URL      From process.env or .env
3. Read SECRET_KEY        From process.env or .env
4. initDatabase()         Create MySQL pool, CREATE TABLE IF NOT EXISTS game_sessions
5. server.listen(PORT)    Start HTTP server on 0.0.0.0:PORT
```

If `DATABASE_URL` is not set, the server still starts but all database features (stats, session logging) are disabled. Multiplayer works regardless.

If `SECRET_KEY` is not set, all WebSocket `join` attempts are rejected with close code `4001`.

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | No | `3000` | HTTP server listen port |
| `DATABASE_URL` | No | _(empty)_ | MySQL connection URI. If absent, DB features disabled. |
| `SECRET_KEY` | **Yes** | _(empty)_ | JWT signing secret. Must match the Express API's `SECRET_KEY`. If absent, all WS connections are rejected. |

---

## Authentication Flow (JWT)

There is no registration endpoint on the game server. Authentication is handled entirely by the website:

### Step-by-step

1. **User logs in on website** → `POST /api/auth/login` on the Express API returns a JWT containing `{ id, username, isAdmin }`.
2. **User clicks "Play"** → Website reads the JWT from `localStorage` and redirects the browser to `https://game.simflightpro.com/?token=<jwt>`.
3. **Game client loads** → JavaScript reads the token from the URL query parameter, strips it from the URL bar via `history.replaceState`, then opens a WebSocket to `wss://game.simflightpro.com/ws`.
4. **Client sends `join`** → `{ type: 'join', token: '<jwt>' }`.
5. **Server verifies** → `jwt.verify(token, SECRET_KEY)`. Extracts `decoded.id` (INT, `users.id`) and `decoded.username`.
6. **On failure** → `ws.close(4001, 'Invalid or expired token')`. Client should redirect back to login.
7. **On success** → Player is added to the in-memory `players` Map with `playerId = decoded.id`.

### Token payload (expected structure)

```json
{
  "id": 42,
  "username": "pilot_ace",
  "isAdmin": false,
  "iat": 1713360000,
  "exp": 1713388800
}
```

### Close codes

| Code | Meaning |
|------|---------|
| `4001` | Authentication failed (no token, no SECRET_KEY, invalid token, expired token) |

---

## REST API Endpoints

All REST endpoints are unauthenticated, read-only, and return JSON with CORS headers (`Access-Control-Allow-Origin: *`).

---

### `GET /api/online-count`

Returns the number of currently connected WebSocket players.

**Source:** In-memory `players.size`.

**Response:**

```json
{ "count": 7 }
```

---

### `GET /api/players`

Returns the position and flight data of all connected players that have sent at least one `update` message.

**Source:** In-memory `players` Map (only entries where `state !== null`).

**Response:**

```json
{
  "data": [
    {
      "userId": 42,
      "lat": -23.5505,
      "lon": -46.6333,
      "alt": 5000,
      "heading": 90,
      "airspeed": 250,
      "aircraft": "B737"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `number` | `users.id` from the JWT |
| `lat` | `number` | Latitude in decimal degrees |
| `lon` | `number` | Longitude in decimal degrees |
| `alt` | `number` | Altitude in feet |
| `heading` | `number` | Heading in degrees (0-360) |
| `airspeed` | `number` | Airspeed in knots |
| `aircraft` | `string \| null` | Aircraft type identifier or null |

---

### `GET /api/stats`

Returns platform-wide statistics from the database plus the live online count.

**Source:** MySQL queries on `airports`, `missions`, `users`, `user_flight_stats` tables + in-memory `players.size`.

**Response (success):**

```json
{
  "airports": 150,
  "missions": 45,
  "registeredPilots": 1200,
  "totalFlightHours": 8500,
  "onlineNow": 7
}
```

**Response (DB unavailable or tables don't exist):**

```json
{
  "airports": 0,
  "missions": 0,
  "registeredPilots": 0,
  "totalFlightHours": 0,
  "onlineNow": 7
}
```

Always returns `200` — never errors. If the database is down or the queried tables haven't been created yet by the Express API migrations, all DB-sourced values default to `0`.

**Database queries:**

| Field | Query |
|-------|-------|
| `airports` | `SELECT COUNT(*) FROM airports WHERE is_active = 1` |
| `missions` | `SELECT COUNT(*) FROM missions WHERE is_active = 1` |
| `registeredPilots` | `SELECT COUNT(*) FROM users WHERE is_enabled = 1` |
| `totalFlightHours` | `SELECT COALESCE(SUM(total_flight_hours), 0) FROM user_flight_stats` |
| `onlineNow` | `players.size` (in-memory) |

---

### `GET /health`

Health check endpoint for Railway deployment monitoring.

**Response:** `200 OK` (plain text body: `OK`).

---

## WebSocket Protocol

**Endpoint:** `ws://<host>/ws` or `wss://<host>/ws`

The WebSocket uses `noServer` mode — the HTTP server's `upgrade` event manually routes connections. Only requests with pathname `/ws` are accepted; all others are destroyed.

All messages are JSON strings. There is no binary protocol.

---

### Client -> Server Messages

#### `join`

Authenticates the player. Must be the first message sent.

```json
{ "type": "join", "token": "eyJhbGciOi..." }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | `string` | Yes | JWT issued by the Express API login endpoint |

**Server behavior:**
- Verifies the JWT with `SECRET_KEY`
- Extracts `id` (INT) and `username` from the token payload
- Adds the player to the `players` Map
- Inserts a row into `game_sessions` (fire-and-forget)
- Sends `welcome` to the client
- Broadcasts `playerJoined` to all connected players

**On failure:** `ws.close(4001)` with reason string.

---

#### `update`

Sends the player's current flight state. Should be sent at ~20 Hz (every 50ms) using throttled sending.

```json
{
  "type": "update",
  "lat": -23.5505,
  "lon": -46.6333,
  "alt": 5000,
  "airspeed": 250,
  "throttle": 0.75,
  "heading": 90,
  "pitch": 5,
  "roll": 0,
  "aircraft": "B737"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `lat` | `number` | Latitude (decimal degrees) |
| `lon` | `number` | Longitude (decimal degrees) |
| `alt` | `number` | Altitude (feet) |
| `airspeed` | `number` | Airspeed (knots) |
| `throttle` | `number` | Throttle position (0-1) |
| `heading` | `number` | Heading (degrees, 0-360) |
| `pitch` | `number` | Pitch (degrees) |
| `roll` | `number` | Roll/bank (degrees) |
| `aircraft` | `string \| null` | Aircraft type identifier |

**Server behavior:**
- Stores the state in the player's Map entry
- Computes haversine distance from previous position (nautical miles)
- Accumulates distance if < 50 NM (teleports > 50 NM are ignored)
- Updates `prevLat`/`prevLon` for next calculation

---

### Server -> Client Messages

#### `welcome`

Sent to the player immediately after successful `join`.

```json
{
  "type": "welcome",
  "userId": 42,
  "username": "pilot_ace",
  "onlineCount": 7
}
```

---

#### `playerJoined`

Broadcast to all connected players when a new player joins.

```json
{
  "type": "playerJoined",
  "userId": 42,
  "username": "pilot_ace",
  "onlineCount": 7
}
```

---

#### `playerLeft`

Broadcast to all connected players when a player disconnects.

```json
{
  "type": "playerLeft",
  "userId": 42,
  "onlineCount": 6
}
```

---

#### `state`

Sent to each player every 50ms (20 Hz). Contains the flight state of **all other players** (excludes the recipient).

```json
{
  "type": "state",
  "players": [
    {
      "userId": 43,
      "lat": -22.9068,
      "lon": -43.1729,
      "alt": 8000,
      "airspeed": 300,
      "throttle": 0.9,
      "heading": 180,
      "pitch": 0,
      "roll": -5,
      "aircraft": "A320"
    }
  ]
}
```

If no other players are connected or none have sent an `update` yet, `players` will be an empty array.

---

## Flight Stats Persistence

Flight statistics are accumulated in-memory during the session and periodically flushed to the `user_flight_stats` database table.

### Data flow

```
Player connects   →  join { token }  →  playerId = users.id (INT from JWT)
                       │
                       ├─  sessionStart = now, distanceNm = 0
                       │
Every ~50ms       →  update → haversine distance accumulated (teleports > 50 NM ignored)
                       │
Every 30 seconds  →  periodic flush → UPSERT hours + distance to user_flight_stats
                       │                 reset distanceNm = 0, lastPersist = now
                       │
Player disconnects → final flush → UPSERT with total_flights + 1
                                    persist remaining hours + distance
                                    delete from Map
```

### Periodic flush (every 30 seconds)

For each connected player where at least 30 seconds have passed since the last persist:

1. Calculate `hoursIncrement = (now - lastPersist) / 3600000`
2. Convert `distanceNm` to km: `distKm = distanceNm * 1.852`
3. UPSERT into `user_flight_stats`:
   - INSERT with `total_flights = 0` (periodic flush does NOT increment flight count)
   - ON DUPLICATE KEY: accumulate `total_flight_hours`, `total_distance_nm`, `total_distance_km`
4. Reset `entry.distanceNm = 0` and `entry.lastPersist = now`

### Final flush (on disconnect)

Same logic but:
- `total_flights = 1` (the INSERT value) and `total_flights = total_flights + 1` (the UPDATE)
- This counts the completed flight session

### Why periodic + final?

If the server crashes or the player's connection drops abruptly, the periodic flush ensures at most 30 seconds of flight data is lost. The final flush captures the remaining delta and increments the flight counter.

---

## Session Logging

Every WebSocket connection is logged in the `game_sessions` table for analytics and flight history.

### On join (fire-and-forget)

```sql
INSERT INTO game_sessions (user_id, username, ip) VALUES (?, ?, ?)
```

The `result.insertId` is stored as `entry.sessionDbId` so the row can be updated on disconnect.

### On disconnect

```sql
UPDATE game_sessions SET disconnected_at = NOW(), flight_duration_min = ? WHERE id = ?
```

Where `flight_duration_min = (Date.now() - entry.sessionStart) / 60000`.

If the DB is unavailable, session logging silently fails and multiplayer continues working.

---

## Static File Server

All HTTP requests that don't match an API route or health check are served as static files from the `dist/` directory.

### Request resolution

```
URL path → decode → strip query string
"/" → "/index.html"
Resolve against dist/ directory
Path traversal check (must stay inside dist/) → 403 if violated
Read file → respond with MIME type
```

### MIME types

| Extension | Content-Type |
|-----------|-------------|
| `.html` | `text/html` |
| `.js` | `application/javascript` |
| `.css` | `text/css` |
| `.json`, `.map` | `application/json` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |
| `.ico` | `image/x-icon` |
| `.woff`, `.woff2` | `font/woff`, `font/woff2` |
| `.ttf` | `font/ttf` |
| `.glb` | `model/gltf-binary` |

### Cache policy

| Type | Header |
|------|--------|
| `.html` | `Cache-Control: no-cache` |
| `.js`, `.css`, images, fonts | `Cache-Control: public, max-age=31536000, immutable` |
| All responses | `X-Content-Type-Options: nosniff` |

### CORS

All responses include:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

`OPTIONS` requests return `204 No Content` immediately.

---

## Database Tables

### `game_sessions` (owned by this server)

Auto-created on startup via `CREATE TABLE IF NOT EXISTS`.

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

| Column | Type | Written when |
|--------|------|-------------|
| `user_id` | `INT` | On WS join (from JWT `decoded.id`) |
| `username` | `VARCHAR(100)` | On WS join (from JWT `decoded.username`) |
| `ip` | `VARCHAR(45)` | On WS join (`ws._socket.remoteAddress`) |
| `connected_at` | `DATETIME` | Auto (DEFAULT CURRENT_TIMESTAMP) |
| `disconnected_at` | `DATETIME` | On WS close |
| `flight_duration_min` | `DECIMAL(10,2)` | On WS close |

A user can have **multiple rows** — one per WebSocket session.

---

### `user_flight_stats` (owned by Express API migrations, read/written by this server)

This table is NOT created by `server.js`. It's created by the Express API's database migrations. The game server UPSERTs into it.

```sql
-- Key columns used by server.js:
user_id             INT UNIQUE NOT NULL
total_flights       INT DEFAULT 0
total_distance_km   DECIMAL(12,2) DEFAULT 0
total_distance_nm   DECIMAL(12,2) DEFAULT 0
total_flight_hours  DECIMAL(10,2) DEFAULT 0
last_flight_at      DATETIME DEFAULT NULL
```

If this table doesn't exist (Express API hasn't run migrations yet), the UPSERT queries fail silently and are caught by try/catch.

---

### `airports`, `missions`, `users` (read-only, owned by Express API)

Only queried by `GET /api/stats`. If any table doesn't exist, the catch block returns zeros.

---

## In-Memory State

### `players` Map

```
Key:   playerId (number — users.id from JWT)
Value: {
    ws:           WebSocket,           // the connection
    state:        PlayerState | null,  // latest flight data (null until first update)
    username:     string,              // from JWT
    sessionStart: number,              // Date.now() at join
    lastPersist:  number,              // Date.now() at last DB flush
    distanceNm:   number,              // accumulated NM since last flush
    prevLat:      number | null,       // previous latitude for haversine
    prevLon:      number | null,       // previous longitude for haversine
    sessionDbId:  number | undefined,  // game_sessions.id (set async after INSERT)
}
```

### `PlayerState` object

```
{
    userId:    number,
    lat:       number,
    lon:       number,
    alt:       number,
    airspeed:  number,
    throttle:  number,
    heading:   number,
    pitch:     number,
    roll:      number,
    aircraft:  string | null,
}
```

All in-memory state is lost on server restart. Flight stats are protected by the 30-second periodic flush.

---

## Helper Functions

### `haversineNm(lat1, lon1, lat2, lon2)`

Calculates the great-circle distance between two points in **nautical miles** using the Haversine formula.

- Earth radius: 3440.065 NM
- Input: decimal degrees
- Output: distance in nautical miles

Used to accumulate flight distance between consecutive `update` messages. Distances > 50 NM are treated as teleports and ignored.

### `jsonResponse(res, status, data)`

Sends a JSON response with CORS headers.

### `getClientIp(req)`

Extracts the client IP from `X-Forwarded-For` header (for reverse proxy / Railway) or falls back to `req.socket.remoteAddress`.

### `broadcast(msg)`

Sends a JSON message to all connected players whose WebSocket is in OPEN state.

### `loadEnv()`

Reads the `.env` file line-by-line using regex, returns key-value pairs. Does not use the `dotenv` package.

---

## Dependencies

### Runtime (`dependencies`)

| Package | Version | Purpose |
|---------|---------|---------|
| `jsonwebtoken` | ^9.0.3 | Verify JWTs on WebSocket join |
| `mysql2` | ^3.20.0 | MySQL driver (async/promise API) |
| `ws` | ^8.20.0 | WebSocket server |
| `uuid` | ^13.0.0 | Used by game client (not by server.js directly) |

### Dev (`devDependencies`)

| Package | Version | Purpose |
|---------|---------|---------|
| `@babylonjs/core` | ^9.1.0 | 3D engine (flight sim client) |
| `@babylonjs/loaders` | ^9.1.0 | 3D model loaders |
| `3d-tiles-renderer` | ^0.4.23 | Google 3D Tiles (flight sim) |
| `esbuild` | ^0.25.0 | Bundler |
| `typescript` | ^5.3.0 | Type checking |

---

## Build & Run

### NPM scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `node scripts/dev.js` | Development server with HMR |
| `build` | `node scripts/build.js` | Production build → `dist/` |
| `start` | `node server.js` | Production server |
| `type-check` | `tsc --noEmit` | TypeScript type checking |

### Build pipeline (`scripts/build.js`)

1. Bundles TypeScript entry points via esbuild:
   - `src/main.ts`, `src/shooter-main.ts`, `src/rpg-main.ts`, `src/ocean-main.ts`, `src/gta-main.ts` → IIFE, ES2020, minified
   - `src/flight-main.ts` → ESM, ES2022, minified (Three.js marked external)
2. Copies `.html` files into `dist/`, rewriting `src="dist/"` → `src="`
3. Copies `src/game/assets/` and `models/` into `dist/`

### Running in production

```bash
npm run build
npm start
```

### Running in development

```bash
npm run dev
```

---

## Client-Side Integration

### `RealtimeClient` (`src/engine/network/RealtimeClient.ts`)

The game client uses `RealtimeClient` to manage the WebSocket connection:

- Auto-detects `ws://` or `wss://` based on `location.protocol`
- Connects to `ws://<host>/ws`
- `send(data)` — sends immediately
- `sendThrottled(data)` — rate-limits to 50ms (matches the 20 Hz server tick)
- `onMessage(cb)` — register message listener
- `onConnectionChange(cb)` — monitor connect/disconnect
- `dispose()` — close connection and clean up
- Auto-reconnects on disconnect with exponential backoff (1s -> 1.5x -> max 15s)

### Game client auth flow (in the game's own JS)

```javascript
// Read token from URL
const params = new URLSearchParams(window.location.search);
const token = params.get('token');

// No token → redirect back to login
if (!token) {
    window.location.href = 'https://simflightpro.com/login';
}

// Strip token from URL bar
history.replaceState(null, '', window.location.pathname);

// Connect and authenticate
const ws = new WebSocket(`wss://${window.location.host}/ws`);
ws.onopen = () => ws.send(JSON.stringify({ type: 'join', token }));

// Handle auth rejection
ws.onclose = (event) => {
    if (event.code === 4001) {
        window.location.href = 'https://simflightpro.com/login';
    }
};
```

### Website "Play" button (React)

```typescript
const GAME_URL = import.meta.env.VITE_GAME_URL || 'http://localhost:3000';

function handlePlayClick() {
    const token = localStorage.getItem('token');
    if (!token) return; // redirect to login
    window.location.href = `${GAME_URL}?token=${encodeURIComponent(token)}`;
}
```

---

## Adding New Features

### Adding a new REST endpoint

Insert a new `if` block **before** the static file handler (line 205), following the existing pattern:

```javascript
if (req.method === 'GET' && req.url.split('?')[0] === '/api/your-endpoint') {
    // your logic
    jsonResponse(res, 200, { result: 'ok' });
    return;
}
```

### Adding a new WebSocket message type

Inside the `ws.on('message')` handler (after the `update` block, around line 339), add:

```javascript
if (msg.type === 'your-type' && playerId) {
    // handle message
    // optionally broadcast:
    broadcast({ type: 'your-response', data: ... });
}
```

### Adding a new database table

In `initDatabase()`, add another `dbPool.execute(CREATE TABLE IF NOT EXISTS ...)` after the existing `game_sessions` creation.

### Adding a new game page

1. Create `your-game.html` in the project root
2. Create `src/your-game-main.ts` as the entry point
3. Add both to `scripts/build.js` (`entryPoints` array and `htmlFiles` array)
4. Add a card in `index.html` linking to `your-game.html`

### Adding fields to the WebSocket `update` state

1. In the `msg.type === 'update'` handler, add the field to the `entry.state` object
2. The 20 Hz broadcast loop automatically includes all fields in `entry.state`
3. Update the game client to send the new field in its `sendThrottled()` payload
