# Game HUD — List APIs (`has_access`)

Specification for the three HUD panels in `flight.html` (missions, flight plans, aircraft). Each list returns **all items** visible in the catalog plus a boolean **`has_access`** so the game can enable or disable the primary action button without duplicating website business rules.

**Related:** [GAME_API_REFERENCE.md](./GAME_API_REFERENCE.md) (full game API index), [MISSIONS_API.md](./MISSIONS_API.md), [FLIGHT_PLANS_API.md](../FLIGHT_PLANS_API.md), [AIRCRAFTS_API_SPECIFICATION.md](./AIRCRAFTS_API_SPECIFICATION.md).

**Base URL:** `https://api.simflightpro.com/api` (production) · `http://localhost:3011/api` (dev)

**Auth:** `Authorization: Bearer <JWT>` on every endpoint below.

---

## Implementation status

| Endpoint | Status |
|----------|--------|
| `GET /api/user-missions` | **Implemented** — full mission catalog + `has_access`, `image_url`, `previously_completed` |
| `GET /api/user-aircrafts` | **Implemented** — full active aircraft catalog + `has_access`, `is_owned`, `pro_access` |
| `GET /api/flight-plans` | **Implemented** — `has_access`, `image_url` on list and detail |

**Breaking change:** `GET /api/user-missions` no longer returns only `user_missions` rows. Each item is `{ mission_id, has_access, image_url, mission, user_mission, previously_completed }`. Optional `?status=` filters items by `user_mission.status`.

The game server should proxy these routes to the Admin API unchanged.

---

## `image_url` (all list endpoints)

Each item exposes **`image_url`** at the root of the JSON object. The game HUD should use this field for thumbnails.

| Endpoint | Resolution |
|----------|------------|
| `GET /api/user-missions` | From `missions.image_base64`: returns `data:image/...;base64,...` or `https://...` when stored that way. Duplicated on `mission.image_url`. |
| `GET /api/user-aircrafts` | From `aircrafts.thumbnail_url`, expanded to absolute URL if path is relative (`/uploads/aircrafts/...`). Also written to `aircraft.thumbnail_url`. |
| `GET /api/flight-plans` | Default cover: `{API_URL}/uploads/flight-plans/default-cover.png` (static asset on the API server). |

`API_URL` is the Admin API origin (env `API_URL`, default `https://api.simflightpro.com`). Static files are served at `GET {API_URL}/uploads/...` (no `/api` prefix).

---

## `has_access` rules (aligned with website)

Logic mirrors [`src/pages/MissionDetail.tsx`](../../src/pages/MissionDetail.tsx) and [`src/pages/Aircrafts.tsx`](../../src/pages/Aircrafts.tsx).

### Missions

```text
IF user_mission.status IN ('started', 'in_progress'):
  has_access = true                    // Play — same as MissionDetail "Play" (ignores PRO lock)
ELSE:
  has_access = mission.is_active
              AND mission.is_enabled
              AND (NOT mission.requires_pro OR user.is_pro)
```

| Website UI | API field |
|--------------|-----------|
| Gold **PRO** badge on card | `mission.requires_pro` (0 or 1) — informational |
| Block start / show upgrade | `has_access === false` and `requires_pro === 1` |
| **Play** on active mission | `user_mission` with `started` / `in_progress` → `has_access === true` |

`user.is_pro` is resolved server-side via subscription check (same as `GET /api/flight-stats` → `is_pro`).

### Aircraft

```text
has_access = aircraft.is_active AND (is_owned OR user.is_pro)
pro_access = NOT is_owned AND user.is_pro   // UI: "PRO available"
```

| Website UI | API field |
|--------------|-----------|
| **Owned** | `is_owned === true` |
| **PRO available** (not purchased) | `pro_access === true` |
| Purchase buttons | `has_access === false` |

Rank (`min_pilot_rank`) applies only to `POST /api/user-aircrafts/:id/acquire`, not to `has_access` for flying.

**Note:** `POST /api/user-aircrafts/:id/select` requires a real `user_aircrafts` row. PRO users flying via `pro_access` may set `aircraft_id` in the game client without calling `select`.

### Flight plans

```text
has_access = (is_active === 1) AND (status === 'planned' OR status === 'in_progress')
```

No PRO gate. List is always scoped to the authenticated user.

---

## 1. `GET /api/user-missions`

**Purpose:** Mission HUD — full mission catalog with per-user progress and access flag.

**Do not use** `?status=started,in_progress` for the HUD list (legacy). Load once; filter in UI with `has_access` and `user_mission.status`.

### Request

```http
GET /api/user-missions HTTP/1.1
Authorization: Bearer <token>
```

Optional legacy filter (avoid in HUD): `?status=started,in_progress,completed`

### Response `200`

```json
{
  "data": [
    {
      "mission_id": 5,
      "has_access": true,
      "image_url": "data:image/jpeg;base64,/9j/4AAQ...",
      "mission": {
        "id": 5,
        "title": "Chicago to Denver",
        "description": "...",
        "type": "route",
        "difficulty": "beginner",
        "requires_pro": 0,
        "is_active": 1,
        "is_enabled": 1,
        "distance_nm": 800.5,
        "estimated_duration_min": 210,
        "reward_points": 900,
        "departure_airport_id": 100,
        "arrival_airport_id": 200,
        "departure_runway_id": 10,
        "arrival_runway_id": 20,
        "spawn_latitude": null,
        "spawn_longitude": null,
        "spawn_altitude_ft": null,
        "image_base64": "data:image/jpeg;base64,...",
        "departure_airport_name": "O'Hare International",
        "departure_icao": "KORD",
        "arrival_airport_name": "Denver International",
        "arrival_icao": "KDEN",
        "departure_runway_ident": "28C",
        "arrival_runway_ident": "34R",
        "required_aircraft_id": null,
        "waypoints": [
          {
            "id": 1,
            "mission_id": 5,
            "order_index": 1,
            "name": "Waypoint 1",
            "latitude": 41.5,
            "longitude": -90.0,
            "altitude_ft": 10000
          }
        ]
      },
      "previously_completed": false,
      "user_mission": {
        "id": 88,
        "status": "in_progress",
        "started_at": "2026-06-01T10:00:00.000Z",
        "completed_at": null,
        "score": null,
        "notes": null
      }
    },
    {
      "mission_id": 12,
      "has_access": false,
      "image_url": "data:image/jpeg;base64,...",
      "mission": {
        "id": 12,
        "title": "Mount Fuji Scenic Flight",
        "requires_pro": 1,
        "is_active": 1,
        "is_enabled": 1
      },
      "user_mission": null
    }
  ]
}
```

### HUD usage

```javascript
for (const item of data) {
  const btnEnabled = item.has_access;
  const imgSrc = item.image_url;
  const showProBadge = item.mission?.requires_pro === 1;
  const canPlayNow = item.user_mission
    && ['started', 'in_progress'].includes(item.user_mission.status);

  if (canPlayNow && item.user_mission.id) {
    // PUT /api/user-missions/:id/start then open flight with missionId + userMissionId
  } else if (btnEnabled) {
    // POST /api/user-missions { mission_id } or navigate to start flow
  }
}
```

### Action endpoints (unchanged)

| Action | Method | Endpoint |
|--------|--------|----------|
| Start in game | PUT | `/api/user-missions/:id/start` |
| Complete | PUT | `/api/user-missions/:id/complete` |
| Acquire | POST | `/api/user-missions` body `{ "mission_id": 5 }` |

---

## 2. `GET /api/user-aircrafts`

**Purpose:** Aircraft HUD — full active catalog with ownership and access flags.

**Replaces** calling `GET /api/aircrafts` + `GET /api/user-aircrafts` separately for the panel.

### Request

```http
GET /api/user-aircrafts HTTP/1.1
Authorization: Bearer <token>
```

### Response `200`

```json
{
  "data": [
    {
      "aircraft_id": 1,
      "has_access": true,
      "is_owned": true,
      "pro_access": false,
      "is_selected": 1,
      "image_url": "https://api.simflightpro.com/uploads/aircrafts/cessna172.png",
      "user_aircraft_id": 10,
      "acquired_at": "2026-04-30T22:00:00.000Z",
      "aircraft": {
        "id": 1,
        "code": "c172",
        "name": "Cessna 172",
        "category": 0,
        "engine_type": 0,
        "thumbnail_url": "https://api.simflightpro.com/uploads/aircrafts/cessna172.png",
        "model_file": "models/Cessna172.glb",
        "mass_kg": 1043,
        "max_thrust_n": 2400,
        "fuel_capacity_kg": 212,
        "surfaces": []
      }
    },
    {
      "aircraft_id": 3,
      "has_access": true,
      "is_owned": false,
      "pro_access": true,
      "is_selected": 0,
      "image_url": "https://api.simflightpro.com/uploads/aircrafts/dc8.png",
      "user_aircraft_id": null,
      "acquired_at": null,
      "aircraft": {
        "id": 3,
        "code": "dc8",
        "name": "Douglas DC-8",
        "category": 2
      }
    },
    {
      "aircraft_id": 7,
      "has_access": false,
      "is_owned": false,
      "pro_access": false,
      "is_selected": 0,
      "image_url": null,
      "user_aircraft_id": null,
      "acquired_at": null,
      "aircraft": {
        "id": 7,
        "code": "a320",
        "name": "Airbus A320",
        "price": 9.99,
        "credit_price": 5000,
        "min_pilot_rank": "captain"
      }
    }
  ]
}
```

Only aircraft with `aircrafts.is_active = 1` appear.

### HUD usage

```javascript
const flyable = data.filter((row) => row.has_access);
const selected = data.find((row) => row.is_selected === 1);

if (row.has_access) {
  // Use row.aircraft for physics; row.aircraft_id for scene load
} else if (row.mission?.requires_pro) {
  // Show PRO upsell — optional deep link to simflightpro.com
} else {
  // Show purchase link — simflightpro.com/aircrafts
}
```

### Action endpoints

| Action | Method | Endpoint |
|--------|--------|----------|
| Select (owned only) | POST | `/api/user-aircrafts/:aircraft_id/select` |
| Detail / physics | GET | `/api/aircrafts/:id` (optional if nested `aircraft` is complete) |

---

## 3. `GET /api/flight-plans`

**Purpose:** Flight plan HUD — all plans for the user.

### Request

```http
GET /api/flight-plans?status=all&limit=100 HTTP/1.1
Authorization: Bearer <token>
```

| Query | Required for HUD | Description |
|-------|------------------|-------------|
| `status=all` | Yes | Include `planned`, `in_progress`, `completed`, `cancelled` |
| `limit` | Recommended | Max 100 |
| `page` | Optional | Pagination |

Default without `status=all` is `status=planned` only (website default differs).

### Response fields (per item)

All columns from flight plan + airport/runway joins (see [FLIGHT_PLANS_API.md](../FLIGHT_PLANS_API.md)), plus:

| Field | Type | Description |
|-------|------|-------------|
| `has_access` | boolean | `is_active === 1` and status `planned` or `in_progress` |
| `image_url` | string | Default route cover: `{API_URL}/uploads/flight-plans/default-cover.png` |

### Example item

```json
{
  "id": 42,
  "user_id": 12,
  "name": "Weekend trip GRU → JFK",
  "status": "planned",
  "is_active": 1,
  "has_access": true,
  "image_url": "https://api.simflightpro.com/uploads/flight-plans/default-cover.png",
  "departure_icao": "SBGR",
  "arrival_icao": "KJFK",
  "dep_rwy_latitude": -23.435578,
  "dep_rwy_longitude": -46.473083,
  "dep_rwy_heading": 93.3,
  "arr_rwy_latitude": 40.635212,
  "arr_rwy_longitude": -73.772308,
  "arr_rwy_heading": 314.1,
  "points_reward": 450
}
```

### HUD usage

```javascript
const res = await fetch(`${API}/flight-plans?status=all&limit=100`, { headers });
const { data } = await res.json();

for (const plan of data) {
  if (plan.has_access) {
    // START → flight.html?flightPlanId=plan.id
  }
}
```

### Action endpoints

| Action | Method | Endpoint |
|--------|--------|----------|
| Load flight | GET | `/api/flight-plans/:id` |
| Update status | PATCH | `/api/flight-plans/:id/status` body `{ "status": "planned" }` — use the string enum in requests |

**Status enum (requests):** `"planned"`, `"in_progress"`, `"completed"`, `"cancelled"` (matches the `flight_plans.status` column enum).

---

## Errors (common)

| HTTP | Body | When |
|------|------|------|
| 401 | `{ "error": "Not authenticated" }` | Missing or invalid JWT |
| 500 | `{ "error": "Failed to list ..." }` | Server error |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-02 | Initial Game HUD v2 spec: catalog lists + `has_access` |
| 2026-06-02 | Implemented in Admin API; added `previously_completed` on missions |
