# SimFlightPro — Game API Reference

Complete reference for APIs consumed by the browser game (`flight.html`) via the game server same-origin proxy (`/api/...` → Admin API `MAIN_API_URL`).

**Production:** `https://api.simflightpro.com/api`  
**Game origin:** `https://game.simflightpro.com`  
**Website:** `https://simflightpro.com`

---

## Table of contents

1. [Architecture](#1-architecture)
2. [Authentication](#2-authentication)
3. [HUD list APIs (`has_access`)](#3-hud-list-apis-has_access)
4. [Missions](#4-missions)
5. [Flight plans](#5-flight-plans)
6. [Aircraft](#6-aircraft)
7. [Airports and runways](#7-airports-and-runways)
8. [Game server proxy map](#8-game-server-proxy-map)
9. [Related documentation](#9-related-documentation)

---

## 1. Architecture

```text
Browser (flight.html HUD)
    │  GET/PUT/PATCH/POST  /api/*
    ▼
Game server (server.js, game.simflightpro.com)
    │  proxy + Authorization: Bearer <JWT>
    ▼
Admin API (this repo, api.simflightpro.com:3011)
    ▼
MySQL
```

Some routes are implemented locally on the game server (legacy MySQL); most HUD panels proxy to the Admin API. Prefer Admin API routes documented here.

---

## 2. Authentication

All HUD list endpoints and user-scoped actions require:

```http
Authorization: Bearer <JWT>
```

The JWT is passed from the website or login flow as `flight.html?token=...`.

| Endpoint | Auth |
|----------|------|
| HUD lists (`user-missions`, `user-aircrafts`, `flight-plans`) | Required |
| `GET /api/aircrafts`, `GET /api/airports/*` (except `/acquired`) | Optional |
| Mission start / complete | Required |

**PRO status:** Resolved on the server for `has_access` on missions and aircraft. Optional client check: `GET /api/flight-stats` → `is_pro` (boolean).

---

## 3. HUD list APIs (`has_access`)

Three panels load **every item** and use **`has_access`** to enable the primary button. Full rules, JSON examples, and HUD pseudocode:

**[GAME_HUD_LIST_APIS.md](./GAME_HUD_LIST_APIS.md)**

| Panel | Endpoint | Query (HUD) |
|-------|----------|-------------|
| Missions | `GET /api/user-missions` | (none) |
| Flight plans | `GET /api/flight-plans` | `?status=all&limit=100` |
| Aircraft | `GET /api/user-aircrafts` | (none) |

### Quick reference: `has_access`

| Resource | `has_access === true` when |
|----------|---------------------------|
| Mission | Active user mission (`started` / `in_progress`), **or** mission active+enabled and (not PRO-only or user is PRO) |
| Aircraft | Aircraft active and (owned **or** user is PRO) |
| Flight plan | `is_active === 1` and status `planned` or `in_progress` |

### Quick reference: images

Every HUD list item includes **`image_url`** — a URL the game can load in `<img src>` (or equivalent). Use **`image_url`** only in the HUD; avoid loading `mission.image_base64` in list views (large payload).

| Resource | `image_url` | Also on nested object |
|----------|-------------|------------------------|
| Mission | Resolved from `missions.image_base64` (`data:` URI or `http(s)`) | `mission.image_url` (same value) |
| Aircraft | Resolved from `aircrafts.thumbnail_url` (absolute or `/uploads/...`) | `aircraft.thumbnail_url` normalized to absolute URL |
| Flight plan | `{API_URL}/uploads/flight-plans/default-cover.png` | — |

Relative paths such as `/uploads/aircrafts/cessna172.png` are expanded with `API_URL` (default `https://api.simflightpro.com`).

---

## 4. Missions

**Deep spec:** [GAME_HUD_LIST_APIS.md §1](./GAME_HUD_LIST_APIS.md#1-get-apiuser-missions) · [MISSIONS_API.md](./MISSIONS_API.md)

### List (HUD)

```http
GET /api/user-missions
Authorization: Bearer <token>
```

Returns the full enabled mission catalog with `user_mission`, `has_access`, `image_url`, and `previously_completed`. See [GAME_HUD_LIST_APIS.md](./GAME_HUD_LIST_APIS.md).

### Lifecycle (game)

```text
POST /user-missions { mission_id }     → status: started
PUT  /user-missions/:id/start          → status: in_progress
PUT  /user-missions/:id/complete       → awards reward_points
```

### URL launch

```text
flight.html?token=...&missionId=5&userMissionId=88
```

| Param | Description |
|-------|-------------|
| `missionId` | `missions.id` |
| `userMissionId` | `user_missions.id` (optional; avoids lookup) |

### Other endpoints

| Method | Path | Use |
|--------|------|-----|
| GET | `/api/user-missions/active` | Single `in_progress` mission (minimap) |
| GET | `/api/missions` | Public catalog (website; not required for HUD v2) |
| GET | `/api/missions/:id` | Mission detail |
| PUT | `/api/user-missions/:id` | Fail / cancel |

### Example: list (PRO locked)

```bash
curl -s "https://api.simflightpro.com/api/user-missions" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {mission_id, has_access, requires_pro: .mission.requires_pro}'
```

### Example: start mission

```bash
curl -s -X PUT "https://api.simflightpro.com/api/user-missions/88/start" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 5. Flight plans

**Deep spec:** [GAME_HUD_LIST_APIS.md §3](./GAME_HUD_LIST_APIS.md#3-get-apiflight-plans) · [FLIGHT_PLANS_API.md](../FLIGHT_PLANS_API.md)

### List (HUD)

```http
GET /api/flight-plans?status=all&limit=100
Authorization: Bearer <token>
```

### Detail (spawn)

```http
GET /api/flight-plans/42
Authorization: Bearer <token>
```

Response includes resolved runway coordinates (`dep_rwy_latitude`, `dep_rwy_heading`, etc.) — game does not need to resolve LE/HE.

### Status update

```http
PATCH /api/flight-plans/42/status
Content-Type: application/json

{ "status": 1 }
```

| Value | Status |
|-------|--------|
| 0 | planned |
| 1 | in_progress |
| 2 | completed |
| 3 | cancelled |

### URL launch

```text
flight.html?token=...&flightPlanId=42
```

### Example: list for picker

```bash
curl -s "https://api.simflightpro.com/api/flight-plans?status=all&limit=100" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | {id, name, has_access, status}'
```

---

## 6. Aircraft

**Deep spec:** [GAME_HUD_LIST_APIS.md §2](./GAME_HUD_LIST_APIS.md#2-get-apiuser-aircrafts) · [AIRCRAFTS_API_SPECIFICATION.md](./AIRCRAFTS_API_SPECIFICATION.md)

### List (HUD)

```http
GET /api/user-aircrafts
Authorization: Bearer <token>
```

Returns all active aircraft with `has_access`, `is_owned`, `pro_access`, `image_url`, and full nested `aircraft` + `surfaces`.

### Select (owned only)

```http
POST /api/user-aircrafts/3/select
Authorization: Bearer <token>
```

`:id` is `aircraft_id`. Requires row in `user_aircrafts`. PRO-only access (`pro_access`, not owned) uses `aircraft_id` in client without `select`.

### Physics detail

```http
GET /api/aircrafts/3
```

Public; returns full physics. Enum fields: `category`, `engine_type`, `prop_rotation_dir` as **numeric** indices.

### Purchase (website only)

HUD opens `https://simflightpro.com/aircrafts` — not `acquire` in panel.

### Example: list flyable aircraft

```bash
curl -s "https://api.simflightpro.com/api/user-aircrafts" \
  -H "Authorization: Bearer $TOKEN" | jq '[.data[] | select(.has_access) | {aircraft_id, is_owned, pro_access, name: .aircraft.name}]'
```

---

## 7. Airports and runways

**Pathways** in the product are **runways** (`airport_runways`), not separate route tables.

### List / search airports

```http
GET /api/airports?page=1&limit=50&q=SBGR
GET /api/airports/search?q=guarulhos
GET /api/airports/nearby?lat=-23.5&lng=-46.6&radius_km=50
```

No auth required for search/list/detail/runways.

### Airport detail

```http
GET /api/airports/1842
```

Detail includes all `airports` columns, `credit_price`, `runway_count`, embedded `runways` (same shape as `/runways`), and with JWT optional `is_owned` / `acquired_at`.

### Runways (pathways) for an airport

```http
GET /api/airports/1842/runways
```

**Response `200`:**

```json
{
  "data": [
    {
      "id": 4523,
      "airport_id": 1842,
      "length_ft": 13123,
      "width_ft": 148,
      "surface": "ASP",
      "lighted": 1,
      "closed": 0,
      "le_ident": "09L",
      "le_latitude_deg": -23.431,
      "le_longitude_deg": -46.478,
      "le_heading_deg_true": 93.0,
      "he_ident": "27R",
      "he_latitude_deg": -23.440,
      "he_longitude_deg": -46.468,
      "he_heading_deg_true": 273.0
    }
  ]
}
```

Only `closed = 0` runways; sorted by `length_ft DESC`.

### Map (bbox)

```http
GET /api/map/airports?zoom=8&bounds=-24,-47,-23,-46
```

### User acquired airports

```http
GET /api/airports/acquired
Authorization: Bearer <token>
```

### Typical game flow

```text
1. GET /api/airports/search?q=SBGR     → airport id
2. GET /api/airports/{id}/runways      → pick runway + end (le/he)
3. Use coords in flight plan or free flight spawn
```

**More detail:** [RUNWAY_API.md](../RUNWAY_API.md)

Mission **route path** waypoints are on the mission object (`mission.waypoints`), not on the airport API.

---

## 8. Game server proxy map

| Game panel | Local / proxy | Admin API path |
|------------|---------------|----------------|
| Missions list | Proxy (or local legacy) | `GET /api/user-missions` |
| Mission start | Proxy | `PUT /api/user-missions/:id/start` |
| Mission complete | Proxy | `PUT /api/user-missions/:id/complete` |
| Flight plans | Proxy | `GET /api/flight-plans`, `GET/PATCH ...` |
| Aircraft list | Proxy | `GET /api/user-aircrafts` |
| Aircraft select | Proxy | `POST /api/user-aircrafts/:id/select` |
| Aircraft catalog | Proxy | `GET /api/aircrafts/:id` |
| Airports / runways | Proxy | `GET /api/airports/*` |

Forward method, path, query string, body, and `Authorization` header unchanged.

---

## 9. Related documentation

| Document | Content |
|----------|---------|
| [GAME_HUD_LIST_APIS.md](./GAME_HUD_LIST_APIS.md) | `has_access` rules, JSON shapes, HUD code samples |
| [MISSIONS_API.md](./MISSIONS_API.md) | Mission model, waypoints, complete flow |
| [FLIGHT_PLANS_API.md](../FLIGHT_PLANS_API.md) | Flight plan schema, spawn integration |
| [AIRCRAFTS_API_SPECIFICATION.md](./AIRCRAFTS_API_SPECIFICATION.md) | Physics fields, DB schema |
| [RUNWAY_API.md](../RUNWAY_API.md) | Runways, spawn modes |
| [GAME_INTEGRATION.md](../GAME_INTEGRATION.md) | Legacy integration notes |
| [POINTS_AND_REWARDS.md](../POINTS_AND_REWARDS.md) | Points on complete |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-02 | Initial GAME_API_REFERENCE |
| 2026-06-02 | HUD list APIs implemented (`has_access`, catalog responses) |
