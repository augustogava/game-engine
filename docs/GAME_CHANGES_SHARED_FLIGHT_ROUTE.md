# Game Engine Change Request: Route Track for Shared Flights

**Target project:** game client/server at `game.simflightpro.com` (separate repository).
**Status:** API and web app ready. Shared flight pages already work with whatever the game sends today; the changes below improve the map quality and add an in-game share shortcut.

## Context

The web app now has a public page per flight, `https://simflightpro.com/flights/:id`, showing the route on a Leaflet map plus duration, distance, altitude, speed and landing rate, with share buttons (X, WhatsApp, native share, copy link). A flight is only visible after the pilot publishes it (`is_public = 1`, done from the web logbook or via the endpoint below).

The map is drawn from `flight_logs.route_data`. When it is empty the page falls back to a straight line between departure and arrival airports.

## API contract

### 1. Route track on flight completion (already accepted by the API)

`PUT https://api.simflightpro.com/api/flight-logs/:id` (Bearer access token, same call the game already makes on landing).

Field `route_data` must be a JSON array of points in flight order:

```json
{
  "status": "landed",
  "route_data": [
    [-23.4356, -46.4731, 2461],
    [-23.3021, -46.1207, 5500],
    [-22.9105, -43.1631, 11]
  ]
}
```

- Each point is `[latitude, longitude, altitude_ft]`; altitude is optional and ignored by the map.
- Recommended sampling: one point every 5-10 s, or every ~1 nm, capped at 2000 points per flight (the column is `JSON`; keep the payload under ~200 KB).
- Send the array once, in the final `PUT` that sets `status: "landed"`. Partial updates during the flight are not required.

### 2. Publish / unpublish a flight (new)

`POST https://api.simflightpro.com/api/flight-logs/:id/share` (Bearer access token, header `X-Requested-With: SimFlightProGame`).

Body (optional): `{ "public": true }` (default) or `{ "public": false }`.

Response `200`:

```json
{ "success": true, "is_public": true, "url": "https://simflightpro.com/flights/1234" }
```

Errors: `400` invalid id, `401` missing/invalid token, `404` flight not owned by the caller, `409` flight status is not `landed`.

### 3. Public read (no auth, used by the web page)

`GET https://api.simflightpro.com/api/flight-logs/public/:id` returns `404` until the flight is published. The payload never includes the pilot e-mail or user id besides `pilot.id` / `pilot.display_name`.

## Suggested game-side steps

1. Buffer position samples during the flight and include them as `route_data` in the landing `PUT`.
2. On the post-landing summary screen add a "Share flight" button that calls `POST /api/flight-logs/:id/share` and shows/copies the returned `url` (or opens `https://twitter.com/intent/tweet?url=<url>` / `https://wa.me/?text=<url>`).
3. Nothing else changes; the web logbook (`/flight-history`) can also publish any landed flight after the fact.
