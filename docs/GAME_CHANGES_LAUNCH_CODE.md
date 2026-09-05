# Game Engine Change Request: Launch Code Instead of JWT in the URL

**Target project:** game client/server at `game.simflightpro.com` (separate repository).
**Status:** API and web app ready; game support pending. Web app keeps sending `?token=` until `VITE_GAME_LAUNCH_MODE=code` is enabled.

## Problem

The web app currently opens the game as:

```
https://game.simflightpro.com/flight.html?token=<JWT>&missionId=...
```

The JWT (valid for up to 30 days with "remember me") ends up in browser history, referrer headers, proxy/CDN logs and screenshots.

## Solution

The web app requests a **single-use launch code** (90 s TTL) and puts that in the URL instead:

```
https://game.simflightpro.com/flight.html?code=<launch-code>&missionId=...
```

The game exchanges the code for a short-lived access token on load.

## API contract

### 1. Web app obtains a code (already implemented)

`POST https://api.simflightpro.com/api/auth/game-launch-code`
Headers: `Authorization: Bearer <JWT>`, `X-Requested-With: XMLHttpRequest`

```json
{ "code": "k3Y2...base64url...", "expiresInSeconds": 90 }
```

### 2. Game exchanges the code (game must implement)

`POST https://api.simflightpro.com/api/auth/game-launch-exchange`
Headers: `Content-Type: application/json` (no auth header, no CSRF header required)

```json
{ "code": "k3Y2...base64url..." }
```

Success `200`:

```json
{
  "token": "<JWT access token, TOKEN_EXPIRY (default 8h)>",
  "accessToken": "<same>",
  "user": { "id": 123, "username": "pilot@example.com" }
}
```

Failure `401 { "error": "Invalid token" }` when the code is unknown, expired, already used or the account is disabled. Rate limited: 45 requests / 15 min per IP.

## Required change in `flight.html` / game bootstrap

```js
const params = new URLSearchParams(window.location.search);
let token = params.get('token');            // legacy, keep supporting during rollout
const code = params.get('code');

if (!token && code) {
  const res = await fetch('https://api.simflightpro.com/api/auth/game-launch-exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) { showLoginRequired(); return; }
  token = (await res.json()).token;
  // Remove the code from the address bar so a refresh does not retry a consumed code
  params.delete('code');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
}
```

All other query parameters (`missionId`, `userMissionId`, `flightPlanId`, `lat`, `lng`, `airport_id`, `icao`, `alt`, `rwy_*`) are unchanged.

## Rollout

1. Deploy the game with support for both `token` and `code`.
2. Set `VITE_GAME_LAUNCH_MODE=code` on the web app (Railway env) and redeploy.
3. Once confirmed, the game can stop accepting `token` from the query string.

## Storage

Table `game_launch_codes` (migration `api/migrations/game_launch_codes_create.js`): `user_id`, `code_hash` (sha256), `expires_at`, `used_at`, `created_ip`. Codes older than 24h are purged opportunistically on each issue.
