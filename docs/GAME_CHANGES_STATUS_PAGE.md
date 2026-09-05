# Game Engine Change Request: Health Endpoint Contract for the Status Page

**Target project:** game client/server at `game.simflightpro.com` (separate repository).
**Status:** API probe and public status page are live. The probe only needs `GET /health` to return `200`, which the game server already does for Railway; the enhancements below are optional.

## Context

`https://simflightpro.com/status` shows the health of the web API, database, payments and the game server. The web API (`api/server.js`, `buildHealthReport`) probes the game every time `/api/health` is requested:

```
GET https://game.simflightpro.com/health
Accept: application/json
timeout: 3 s
```

- `2xx` → game shows **Operational** with the measured latency.
- Non-2xx, timeout or connection error → game shows **Outage** and the overall status becomes **degraded** (never `error`, so the web API stays deployable when only the game is down).
- The base URL is `GAME_SERVER_URL` (default `https://game.simflightpro.com`); the probe can be turned off with `GAME_HEALTH_CHECK=false`.

## Required (already satisfied)

`GET /health` must answer `200` quickly, without authentication and without CORS restrictions for server-to-server calls (the probe is made by the API, not by browsers).

## Optional enhancements

1. Return a JSON body so future versions of the status page can display richer data. Suggested shape:

```json
{
  "status": "ok",
  "version": "1.8.2",
  "onlinePlayers": 42,
  "uptimeSeconds": 86400,
  "serverTime": "2026-09-05T18:00:00.000Z"
}
```

2. Return `503` with `{ "status": "error" }` when the multiplayer server cannot accept connections even though the HTTP process is up (for example the WebSocket hub failed to start). This makes the status page reflect real player impact instead of process liveness.

3. Keep the endpoint cheap: it is hit once per status-page load and by Railway's health check.

## Nothing else changes

No authentication, launch-code or gameplay contracts are affected by this request.
