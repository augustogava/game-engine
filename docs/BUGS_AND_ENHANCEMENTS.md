# server.js — Bugs, Fixes & Enhancements

> Tracked issues for the game server (`server.js`). Each item includes severity, current behavior, expected behavior, and the fix.

---

## Bugs

### BUG-1: Duplicate session overwrites old connection (High)

**Current behavior:** If the same user (same `users.id`) opens two browser tabs, `players.set(playerId, ...)` silently overwrites the first entry. The old WebSocket stays open but becomes invisible — no stats flush, no session update in `game_sessions`, no `playerLeft` broadcast. Accumulated flight hours and distance are lost.

**Expected behavior:** The old connection should be closed cleanly before the new one takes over.

**Fix:** In the `join` handler, before `players.set()`:

```javascript
const existing = players.get(playerId);
if (existing) {
    // Flush remaining stats for the old session
    if (dbPool) {
        const sessionMinutes = (Date.now() - existing.lastPersist) / 60000;
        const hoursIncrement = sessionMinutes / 60;
        const distKm = existing.distanceNm * 1.852;
        dbPool.execute(
            `INSERT INTO user_flight_stats (user_id, total_flights, total_flight_hours, total_distance_nm, total_distance_km, last_flight_at)
             VALUES (?, 1, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
               total_flights      = total_flights + 1,
               total_flight_hours = total_flight_hours + VALUES(total_flight_hours),
               total_distance_nm  = total_distance_nm  + VALUES(total_distance_nm),
               total_distance_km  = total_distance_km  + VALUES(total_distance_km),
               last_flight_at = NOW()`,
            [playerId, hoursIncrement, existing.distanceNm, distKm]
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
```

**Files:** `server.js` (WS `join` handler)

---

### BUG-2: `ws.on('error')` loses accumulated stats (Medium)

**Current behavior:**

```javascript
ws.on('error', () => {
    if (playerId) players.delete(playerId);
});
```

This deletes the player from the Map without flushing stats to `user_flight_stats` or updating `game_sessions.disconnected_at`. All accumulated hours, distance, and the session record are lost.

**Expected behavior:** The `close` event should handle all cleanup. The `error` handler should only log.

**Fix:** Replace the error handler:

```javascript
ws.on('error', (err) => {
    console.error(`[WS] Error for player ${playerId}:`, err.message);
});
```

The `close` event fires after `error` in Node.js and already handles stats flush, session update, and Map cleanup.

**Files:** `server.js` (WS `error` handler)

---

### BUG-3: CORS `Allow-Methods` inconsistency (Low)

**Current behavior:** `jsonResponse()` sets `'Access-Control-Allow-Methods': 'GET, OPTIONS'` but `CORS_HEADERS` sets `'GET, POST, OPTIONS'`. Because the `writeHead` override merges headers (specific overrides global), API responses end up with `GET, OPTIONS` while static file responses get `GET, POST, OPTIONS`.

**Expected behavior:** Consistent CORS methods across all responses. Since `POST /api/register` was removed, there are no POST endpoints.

**Fix:** Update `CORS_HEADERS`:

```javascript
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};
```

**Files:** `server.js` (`CORS_HEADERS` constant)

---

### BUG-4: `playerLeft` not broadcast on WS error without close (Low)

**Current behavior:** If a WebSocket errors and the `close` event does not fire (rare but possible with abrupt TCP resets), the player is deleted from the Map by the `error` handler but no `playerLeft` is broadcast. Other clients see a stale online count until the next `playerJoined`/`playerLeft`.

**Expected behavior:** This is resolved by BUG-2 fix — removing `players.delete()` from the error handler and relying on `close` for all cleanup.

**Files:** `server.js` (same as BUG-2)

---

## Enhancements

### ENH-1: Graceful shutdown on SIGTERM (High)

**Why:** Railway sends `SIGTERM` before stopping the service. Without handling it, all in-flight sessions lose their remaining stats and `game_sessions` rows are never updated with `disconnected_at`.

**Implementation:**

```javascript
async function gracefulShutdown() {
    console.log('[Server] Shutting down...');

    // Stop accepting new connections
    server.close();

    // Flush stats and close all WS connections
    for (const [userId, entry] of players) {
        if (dbPool) {
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
```

**Files:** `server.js` (add at the bottom, before `initDatabase().then(...)`)

---

### ENH-2: Stale player cleanup (Medium)

**Why:** If a WebSocket connection drops silently (no `close` event, no `error` event — e.g. network cable pulled), the player stays in the Map forever. The 20 Hz broadcast sends data to a dead socket, and the 30s flush keeps writing stats that will never be finalized.

**Implementation:** A periodic check that removes players whose WebSocket is no longer OPEN:

```javascript
setInterval(() => {
    for (const [userId, entry] of players) {
        if (entry.ws.readyState !== 1) {
            console.log(`[WS] Stale connection detected for user ${userId}, cleaning up`);
            // Trigger the close handler logic
            entry.ws.terminate();
        }
    }
}, 60000);
```

`ws.terminate()` forces a close and fires the `close` event, which handles all cleanup.

**Files:** `server.js` (add after the 30s stats flush setInterval)

---

### ENH-3: Rate limit on `join` attempts (Medium)

**Why:** A malicious client could spam `join` messages with invalid tokens, causing repeated `jwt.verify()` calls and `[WS] Invalid token` log spam.

**Implementation:** Track failed attempts per IP and close connections that exceed a threshold:

```javascript
const joinAttempts = new Map(); // ip -> { count, firstAttempt }

// Inside wss.on('connection'):
const clientIp = (ws._socket?.remoteAddress || '').replace('::ffff:', '');

// Inside msg.type === 'join', before jwt.verify:
const attempts = joinAttempts.get(clientIp) || { count: 0, firstAttempt: Date.now() };
if (attempts.count >= 5 && (Date.now() - attempts.firstAttempt) < 60000) {
    ws.close(4003, 'Too many attempts');
    return;
}
attempts.count++;
joinAttempts.set(clientIp, attempts);

// On successful join, clear attempts:
joinAttempts.delete(clientIp);

// Periodic cleanup (every 5 min):
setInterval(() => {
    const cutoff = Date.now() - 60000;
    for (const [ip, a] of joinAttempts) {
        if (a.firstAttempt < cutoff) joinAttempts.delete(ip);
    }
}, 300000);
```

**Files:** `server.js` (WS connection handler)

---

### ENH-4: Add `username` to `/api/players` response (Low)

**Why:** The map page could display player names next to markers. Currently only `userId` is returned.

**Implementation:**

```javascript
list.push({
    userId: id,
    username: entry.username,  // ← add this
    lat: entry.state.lat,
    // ... rest unchanged
});
```

**Files:** `server.js` (GET /api/players handler)
**Also update:** `doc/SERVER_DOCUMENTATION.md` (response schema + field table)

---

### ENH-5: WebSocket ping/pong heartbeat (Low)

**Why:** Detect dead connections faster than the 60s stale cleanup (ENH-2). The `ws` library supports native ping/pong frames.

**Implementation:**

```javascript
const HEARTBEAT_INTERVAL = 30000;

setInterval(() => {
    for (const [, entry] of players) {
        if (entry.ws.isAlive === false) {
            entry.ws.terminate();
            return;
        }
        entry.ws.isAlive = false;
        entry.ws.ping();
    }
}, HEARTBEAT_INTERVAL);

// On connection:
wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    // ... rest of handler
});
```

**Files:** `server.js` (WS connection handler + new setInterval)

---

### ENH-6: Log request duration for `/api/stats` (Low)

**Why:** The `/api/stats` endpoint runs 4 sequential DB queries. If the database is slow, this could take seconds. Logging the duration helps monitor performance.

**Implementation:**

```javascript
if (req.method === 'GET' && req.url.split('?')[0] === '/api/stats') {
    const start = Date.now();
    // ... existing logic ...
    console.log(`[API] /api/stats responded in ${Date.now() - start}ms`);
    return;
}
```

**Files:** `server.js` (GET /api/stats handler)

---

## Priority order

| # | Item | Severity | Effort |
|---|------|----------|--------|
| 1 | BUG-1: Duplicate session | High | Small |
| 2 | BUG-2: Error handler loses stats | Medium | Tiny |
| 3 | ENH-1: Graceful shutdown | High | Medium |
| 4 | ENH-2: Stale player cleanup | Medium | Small |
| 5 | ENH-5: Ping/pong heartbeat | Low | Small |
| 6 | ENH-3: Rate limit join | Medium | Small |
| 7 | BUG-3: CORS inconsistency | Low | Tiny |
| 8 | BUG-4: playerLeft not broadcast | Low | Fixed by BUG-2 |
| 9 | ENH-4: Username in /api/players | Low | Tiny |
| 10 | ENH-6: Log stats duration | Low | Tiny |
