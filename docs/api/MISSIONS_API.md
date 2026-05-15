# Missions API

## Overview

The Missions API manages flight missions and user mission progress. It provides endpoints for listing available missions, viewing mission details, and tracking user participation.

**Base URL:** `/api`
**Auth:** Bearer JWT token via `Authorization: Bearer <token>` header.

---

## Data Model

### Mission

| Field | Type | Description |
|---|---|---|
| `id` | INT | Auto-increment primary key |
| `title` | VARCHAR(255) | Mission display title |
| `description` | TEXT | Detailed mission description |
| `type` | ENUM | `free_flight`, `scheduled`, `challenge`, `milestone`, `route`, `discovery` |
| `difficulty` | ENUM | `beginner`, `intermediate`, `advanced`, `expert` |
| `departure_airport_id` | INT (nullable) | FK to `airports.id` |
| `departure_runway_id` | INT (nullable) | FK to `airport_runways.id` |
| `arrival_airport_id` | INT (nullable) | FK to `airports.id` |
| `arrival_runway_id` | INT (nullable) | FK to `airport_runways.id` |
| `spawn_latitude` | DECIMAL(10,7) (nullable) | Latitude for discovery spawn point |
| `spawn_longitude` | DECIMAL(10,7) (nullable) | Longitude for discovery spawn point |
| `spawn_altitude_ft` | INT (nullable) | Altitude in feet for discovery spawn |
| `distance_nm` | DECIMAL(10,2) (nullable) | Estimated distance in nautical miles |
| `estimated_duration_min` | INT (nullable) | Estimated flight duration in minutes |
| `reward_points` | INT | Points awarded on completion |
| `image_base64` | LONGTEXT (nullable) | Mission cover image as base64 data URI |
| `is_active` | BOOLEAN | Soft delete flag. `0` = hidden everywhere |
| `is_enabled` | BOOLEAN | Playability flag. `0` = hidden from non-admin users |
| `sort_order` | INT | Display ordering (lower = first) |
| `required_aircraft_id` | INT (nullable) | FK to `aircrafts.id`. If set, the mission can only be played with this aircraft. `null` = any aircraft allowed |

### Mission Waypoints

Missions can have ordered waypoints that define a flight path for the player to follow. The game engine uses these to draw a minimap path and detect when the player reaches each checkpoint.

| Field | Type | Description |
|---|---|---|
| `id` | INT | Auto-increment primary key |
| `mission_id` | INT | FK to `missions.id` (CASCADE on delete) |
| `order_index` | INT | Sequence number (1, 2, 3…). Player must reach them in order |
| `name` | VARCHAR(100) (nullable) | Display label (e.g. "Monterey Bay", "Everest Base Camp") |
| `latitude` | DECIMAL(10,7) | Waypoint latitude |
| `longitude` | DECIMAL(10,7) | Waypoint longitude |
| `altitude_ft` | INT (nullable) | Suggested altitude at this waypoint |

**How waypoints work:**

1. Each mission can have 0 or more waypoints, ordered by `order_index`.
2. Route missions use waypoints as intermediate navigation points between departure and arrival airports.
3. Discovery missions use waypoints as exploration checkpoints — the player spawns at the spawn point and must fly to each waypoint in sequence.
4. When the player reaches the **last waypoint**, the mission objective is considered complete.
5. The game engine draws the waypoints on the minimap as a path for the player to follow.
6. Waypoints are returned in the `waypoints` array on `GET /api/missions/:id`, `GET /api/user-missions`, `GET /api/user-missions/active`, and `POST /api/user-missions`.

> **Awarding points on completion:** finishing the route (visually) does **not** automatically credit points. The game engine must call [`PUT /api/user-missions/:id/complete`](#put-apiuser-missionsidcomplete) once the last waypoint is reached. That endpoint adds `mission.reward_points` to `user_flight_stats.total_reward_points`, increments `total_missions_completed`, and writes a row to `user_points_log` with `source_type='mission'` and `source_id=user_mission_id`. See [`docs/POINTS_AND_REWARDS.md`](../POINTS_AND_REWARDS.md) for the full rules.

### Mission Types

| Type | Description | Required Fields |
|---|---|---|
| `route` | Airport-to-airport flight | `departure_airport_id`, `arrival_airport_id` |
| `discovery` | Free-roam exploration from a mid-air spawn point | `spawn_latitude`, `spawn_longitude`, `spawn_altitude_ft` |
| `free_flight` | Legacy: unrestricted flight (disabled) | — |
| `scheduled` | Legacy: scheduled departure (disabled, needs IFR instruments) | — |
| `challenge` | Legacy: skill challenge (disabled, needs engine-off mechanics) | — |
| `milestone` | Legacy: achievement-based (disabled) | — |

### User Mission Status Lifecycle

```
started     → in_progress   (game launches the mission)
in_progress → started       (auto-demoted when the user starts another mission)
in_progress → completed     (last waypoint reached, points awarded)
started     → cancelled
in_progress → failed
in_progress → cancelled
```

| Status | Set by | Meaning |
|---|---|---|
| `started` | `POST /api/user-missions` (acquire) **or** automatic demotion when another mission is started | The user has acquired the mission but is not actively flying it right now. May have been previously `in_progress` and pushed back to the queue. |
| `in_progress` | `PUT /api/user-missions/:id/start` | The game has loaded the mission and the player is actively flying it. **At most one mission per user can be `in_progress` at any time** — starting another one demotes this one back to `started`. Only missions in this state appear in `GET /api/user-missions/active`. |
| `completed` | `PUT /api/user-missions/:id/complete` | Player completed the mission. `reward_points` are credited to `user_flight_stats.total_reward_points` and a row is added to `user_points_log`. Strict transition — only allowed from `in_progress`. |
| `failed` / `cancelled` | `PUT /api/user-missions/:id` (generic update) | Mission abandoned/lost. No points awarded. |

> Missions in status `started` are intentionally **not** returned by `GET /api/user-missions/active` — that endpoint is the game's "pick up where I left off" view and must only contain the single mission actively being played.

### is_enabled vs is_active

- **`is_active=0`**: Soft-deleted. Hidden for everyone, everywhere.
- **`is_enabled=0`**: Not playable yet (game features not implemented). Hidden from regular users; admins see them via `?include_disabled=1`.

---

## Endpoints: `/api/missions`

### `GET /api/missions`

List missions with pagination and filters.

**Auth:** Optional (admins see disabled missions).

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | INT | 1 | Page number |
| `limit` | INT | 20 | Items per page (max 100) |
| `type` | STRING | — | Filter by mission type |
| `difficulty` | STRING | — | Filter by difficulty level |
| `is_active` | INT | 1 | Override active filter (admin) |
| `include_disabled` | INT | 0 | Include `is_enabled=0` missions (admin only) |

**Response (200):**

```json
{
  "data": [
    {
      "id": 1,
      "title": "Bay Area to Los Angeles",
      "description": "Fly the classic California corridor...",
      "type": "route",
      "difficulty": "beginner",
      "departure_airport_id": 42,
      "departure_runway_id": 105,
      "arrival_airport_id": 58,
      "arrival_runway_id": 210,
      "spawn_latitude": null,
      "spawn_longitude": null,
      "spawn_altitude_ft": null,
      "distance_nm": 293.00,
      "estimated_duration_min": 90,
      "reward_points": 200,
      "image_base64": null,
      "is_active": 1,
      "is_enabled": 1,
      "sort_order": 0,
      "departure_airport_name": "San Francisco International Airport",
      "departure_icao": "KSFO",
      "arrival_airport_name": "Los Angeles International Airport",
      "arrival_icao": "KLAX",
      "departure_runway_ident": "28R",
      "departure_runway_length_ft": 11870,
      "arrival_runway_ident": "25L",
      "arrival_runway_length_ft": 10285,
      "required_aircraft_id": 1,
      "required_aircraft_code": "c172",
      "required_aircraft_name": "Cessna 172",
      "required_aircraft_thumbnail": "/uploads/aircrafts/cessna172.png"
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 20
}
```

---

### `GET /api/missions/:id`

Get a single mission with full detail, including waypoints.

**Auth:** Optional (admins see disabled missions).

**Response (200):** Same structure as a single item from the list, plus a `waypoints` array:

```json
{
  "id": 1,
  "title": "Bay Area to Los Angeles",
  "type": "route",
  "waypoints": [
    {
      "id": 1,
      "mission_id": 1,
      "order_index": 1,
      "name": "San Jose",
      "latitude": 37.3626,
      "longitude": -121.929,
      "altitude_ft": 10000
    },
    {
      "id": 2,
      "mission_id": 1,
      "order_index": 2,
      "name": "Monterey Bay",
      "latitude": 36.6002,
      "longitude": -121.8947,
      "altitude_ft": 12000
    }
  ]
}
```

**Response (404):**

```json
{ "error": "Mission not found" }
```

---

### `POST /api/missions`

Create a new mission. Admin only.

**Auth:** Required (admin).

**Request Body:**

```json
{
  "title": "Bay Area to Los Angeles",
  "description": "Fly the classic California corridor...",
  "type": "route",
  "difficulty": "beginner",
  "departure_airport_id": 42,
  "departure_runway_id": 105,
  "arrival_airport_id": 58,
  "arrival_runway_id": 210,
  "distance_nm": 293,
  "estimated_duration_min": 90,
  "reward_points": 200,
  "is_enabled": 1,
  "required_aircraft_id": 1
}
```

**Optional `waypoints` array:**

```json
{
  "title": "Grand Canyon Explorer",
  "type": "discovery",
  "spawn_latitude": 36.0544,
  "spawn_longitude": -112.1401,
  "spawn_altitude_ft": 8500,
  "waypoints": [
    { "order_index": 1, "name": "South Rim", "latitude": 36.057, "longitude": -112.125, "altitude_ft": 8500 },
    { "order_index": 2, "name": "Bright Angel", "latitude": 36.0585, "longitude": -112.094, "altitude_ft": 7500 },
    { "order_index": 3, "name": "Desert View", "latitude": 36.0405, "longitude": -111.8265, "altitude_ft": 8000 }
  ]
}
```

**Validation:**
- `title` is required.
- `type` must be one of the valid enum values.
- `difficulty` must be one of the valid enum values.
- If `type=route`: `departure_airport_id` and `arrival_airport_id` are required.
- If `type=discovery`: `spawn_latitude`, `spawn_longitude`, and `spawn_altitude_ft` are required.
- Each waypoint must have `latitude` and `longitude`. `order_index`, `name`, and `altitude_ft` are optional.

**Response (201):**

```json
{ "id": 11, "message": "Mission created" }
```

**Error Responses:**

| Code | Body |
|---|---|
| 400 | `{ "error": "title is required" }` |
| 400 | `{ "error": "Route missions require departure_airport_id and arrival_airport_id" }` |
| 400 | `{ "error": "Discovery missions require spawn_latitude, spawn_longitude and spawn_altitude_ft" }` |
| 401 | `{ "error": "Not authenticated" }` |
| 403 | `{ "error": "Admin required" }` |

---

### `PUT /api/missions/:id`

Update an existing mission. Admin only.

**Auth:** Required (admin).

**Request Body:** Partial — only include fields to update. If `waypoints` array is provided, all existing waypoints are replaced.

```json
{
  "title": "Updated Title",
  "is_enabled": 0,
  "waypoints": [
    { "order_index": 1, "name": "Point A", "latitude": 40.0, "longitude": -74.0, "altitude_ft": 5000 }
  ]
}
```

**Response (200):**

```json
{ "message": "Mission updated" }
```

**Error Responses:**

| Code | Body |
|---|---|
| 400 | `{ "error": "No fields to update" }` |
| 401 | `{ "error": "Not authenticated" }` |
| 403 | `{ "error": "Admin required" }` |

---

### `DELETE /api/missions/:id`

Soft-delete a mission (sets `is_active=0`). Admin only.

**Auth:** Required (admin).

**Response (200):**

```json
{ "message": "Mission deleted" }
```

---

## Endpoints: `/api/user-missions`

### `GET /api/user-missions`

List the authenticated user's missions with full enriched mission data.

**Auth:** Required.

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `status` | STRING | — | Comma-separated status filter (e.g. `in_progress,completed`) |

**Response (200):**

```json
{
  "data": [
    {
      "id": 1,
      "user_id": 42,
      "mission_id": 5,
      "status": "in_progress",
      "started_at": "2026-05-14T12:00:00.000Z",
      "completed_at": null,
      "score": null,
      "notes": null,
      "mission_title": "Bay Area to Los Angeles",
      "mission_type": "route",
      "mission_difficulty": "beginner",
      "mission": {
        "title": "Bay Area to Los Angeles",
        "description": "Fly the classic California corridor...",
        "type": "route",
        "difficulty": "beginner",
        "distance_nm": 293.00,
        "estimated_duration_min": 90,
        "reward_points": 200,
        "spawn_latitude": null,
        "spawn_longitude": null,
        "spawn_altitude_ft": null,
        "image_base64": null,
        "is_enabled": 1,
        "departure_airport_name": "San Francisco International Airport",
        "departure_icao": "KSFO",
        "arrival_airport_name": "Los Angeles International Airport",
        "arrival_icao": "KLAX",
        "departure_runway_ident": "28R",
        "departure_runway_length_ft": 11870,
        "arrival_runway_ident": "25L",
        "arrival_runway_length_ft": 10285,
        "required_aircraft_id": 1,
        "required_aircraft_code": "c172",
        "required_aircraft_name": "Cessna 172",
        "required_aircraft_thumbnail": "/uploads/aircrafts/cessna172.png",
        "waypoints": [
          { "id": 1, "mission_id": 5, "order_index": 1, "name": "San Jose", "latitude": 37.3626, "longitude": -121.929, "altitude_ft": 10000 },
          { "id": 2, "mission_id": 5, "order_index": 2, "name": "Monterey Bay", "latitude": 36.6002, "longitude": -121.8947, "altitude_ft": 12000 }
        ]
      }
    }
  ]
}
```

---

### `GET /api/user-missions/active`

Alias for `GET /api/user-missions?status=in_progress`. Returns only missions with `in_progress` status. Used by the game engine to get the current active mission with full waypoint data for minimap path drawing.

**Auth:** Required.

**Response (200):** Same shape as `GET /api/user-missions`.

---

### `POST /api/user-missions`

Acquire a mission for the user. Creates a user-mission record with `status='started'` (the user has chosen to play the mission, but the game hasn't started it yet) and returns the full enriched payload. Triggered by the **"Iniciar Missão"** button on the website.

**Auth:** Required.

**Request Body:**

```json
{ "mission_id": 5 }
```

**Response (201):**

Same shape as a single item from `GET /api/user-missions`, with `status: "started"`. The mission will **not** appear in `GET /api/user-missions/active` until the game transitions it via [`PUT /api/user-missions/:id/start`](#put-apiuser-missionsidstart).

**Error Responses:**

| Code | Body | Description |
|---|---|---|
| 400 | `{ "error": "mission_id is required" }` | Missing field |
| 401 | `{ "error": "Not authenticated" }` | No JWT |
| 403 | `{ "error": "Mission not available" }` | Mission is `is_active=0` or `is_enabled=0` |
| 404 | `{ "error": "Mission not found" }` | Invalid mission_id |
| 409 | `{ "error": "Mission already in progress" }` | User already has an active record (`started`, `in_progress`) for this mission |

---

### `PUT /api/user-missions/:id/start`

Transition a user mission from `started` to `in_progress`. **Called by the game** when the player loads the mission and the scene starts. Only after this call does the mission appear in `GET /api/user-missions/active`.

`:id` is the `user_missions.id` (not the mission template id).

**Auth:** Required.

**Request Body:** Empty (or ignored).

**Side effect — single active mission rule:** before promoting `:id` to `in_progress`, **all other** missions of the same user that are currently `in_progress` are demoted back to `'started'` (single SQL `UPDATE ... WHERE user_id = ? AND status = 'in_progress' AND id <> ?`). This guarantees that **at most one mission per user is `in_progress` at any time**, so `GET /api/user-missions/active` always returns either zero or one row, and the player never has two missions "running" in parallel.

**Response (200):**

Same enriched shape as a single item from `GET /api/user-missions`, with `status: "in_progress"`.

**Error Responses:**

| Code | Body | Description |
|---|---|---|
| 400 | `{ "error": "Invalid user mission id" }` | `:id` is not a number |
| 400 | `{ "error": "Only started missions can be transitioned to in_progress" }` | Current status is not `started` (e.g. `completed`, `failed`, `cancelled`) |
| 401 | `{ "error": "Not authenticated" }` | No JWT |
| 404 | `{ "error": "User mission not found" }` | Invalid id or wrong user |
| 409 | `{ "error": "Mission already in progress" }` | Idempotency guard — already transitioned |

> **Game integration tip:** the website launches the game with the URL:
>
> ```
> flight.html?token=<jwt>&missionId=<mission template id>&userMissionId=<user_missions.id>
> ```
>
> - `userMissionId` is **passed when available** (the user already has an acquired `started` row for this mission). The game should call `PUT /api/user-missions/<userMissionId>/start` directly with this value.
> - If `userMissionId` is **missing** (legacy entry point or the user opened the game without going through the mission card), the game must fall back to `GET /api/user-missions?status=started`, find the row whose `mission_id === missionId`, and use its `id`.
> - `PUT /:id/start` is idempotent for in-progress missions (returns `409 Mission already in progress`), so it's safe to call on every game load.

---

### `PUT /api/user-missions/:id`

Update mission progress. `:id` is the `user_missions.id`.

**Auth:** Required.

**Request Body:** Partial — only include fields to update.

```json
{
  "status": "failed",
  "score": 750,
  "notes": "Engine failure at 12000ft"
}
```

**Response (200):**

```json
{ "message": "Mission progress updated" }
```

**Response (404):**

```json
{ "error": "User mission not found" }
```

---

### `PUT /api/user-missions/:id/complete`

Mark a mission as completed. Awards `reward_points` to the user and increments `total_missions_completed` in `user_flight_stats`. Also logs the points to `user_points_log` with `source_type='mission'`. This affects pilot rank progression.

`:id` is the `user_missions.id`.

**Auth:** Required.

**Validation:**
- Mission must be in `in_progress` status.
- Cannot complete an already completed mission (prevents double points).

**Side effects on success:**

1. `user_missions.status` → `completed`, `completed_at` set to `NOW()`.
2. `user_flight_stats.total_reward_points` += `mission.reward_points` (upsert).
3. `user_flight_stats.total_missions_completed` += 1.
4. New row in `user_points_log`:
   ```
   (user_id, points, source_type, source_id, description)
   = (<user>, <reward_points>, 'mission', <user_mission_id>, 'Mission #<mission_id> completed')
   ```
5. Pilot rank is recomputed on the next read using the updated stats.

> See [`docs/POINTS_AND_REWARDS.md`](../POINTS_AND_REWARDS.md) for the full points & rank system, including how mission rewards interact with flight-plan points and the recalculation caveat.

**Response (200):**

```json
{ "message": "Mission completed", "points_awarded": 200 }
```

**Error Responses:**

| Code | Body | Description |
|---|---|---|
| 400 | `{ "error": "Only in_progress missions can be completed" }` | Mission is failed/cancelled |
| 401 | `{ "error": "Not authenticated" }` | No JWT |
| 404 | `{ "error": "User mission not found" }` | Invalid id or wrong user |
| 409 | `{ "error": "Mission already completed" }` | Prevents double completion/points |

---

## URL Parameters Passed to the Game

When the user clicks **"Iniciar Jogo"** on a mission card (Missions list or Mission Detail page), the website opens:

```
https://game.simflightpro.com/flight.html?token=<jwt>&missionId=<mission template id>&userMissionId=<user_missions.id>
```

| Parameter | Type | Always present | Description |
|---|---|---|---|
| `token` | string | Yes | JWT auth token. |
| `missionId` | int | Yes | The `missions.id` (template id). Used by the game to know which mission scene/waypoints to render. |
| `userMissionId` | int | When the user has a `started` row | The `user_missions.id` for this mission, so the game can call `PUT /api/user-missions/<userMissionId>/start` directly without an extra lookup. |

### Game bootstrap flow

```
1. Game reads `token`, `missionId`, `userMissionId` from URL.
2. If `userMissionId` is missing:
     GET /api/user-missions?status=started
       → find row whose mission_id === missionId
       → use that id as userMissionId
3. PUT /api/user-missions/<userMissionId>/start
     → 200 OK: status is now 'in_progress', mission appears in /active.
     → 409 Mission already in progress: idempotent retry, ignore.
4. (Optional) GET /api/user-missions/active
     → fetch full waypoints + required_aircraft for the HUD/minimap.
5. ... player flies the mission ...
6. PUT /api/user-missions/<userMissionId>/complete
     → 200 OK with `points_awarded`.
```

---

## Examples

### List enabled missions

```bash
curl -s https://api.simflightpro.com/api/missions?type=route&difficulty=beginner
```

### Get mission detail

```bash
curl -s https://api.simflightpro.com/api/missions/5
```

### Acquire a mission (website "Iniciar Missão" button)

Creates a `user_missions` row with `status='started'`.

```bash
curl -s -X POST https://api.simflightpro.com/api/user-missions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"mission_id": 5}'
```

### Transition mission to in_progress (called by the game on scene load)

```bash
curl -s -X PUT https://api.simflightpro.com/api/user-missions/123/start \
  -H "Authorization: Bearer <token>"
```

### List my active missions

```bash
curl -s https://api.simflightpro.com/api/user-missions?status=in_progress \
  -H "Authorization: Bearer <token>"
```

### Complete a mission

```bash
curl -s -X PUT https://api.simflightpro.com/api/user-missions/123/complete \
  -H "Authorization: Bearer <token>"
```

### Get active mission with waypoints (game engine)

```bash
curl -s https://api.simflightpro.com/api/user-missions/active \
  -H "Authorization: Bearer <token>"
```

### Admin: list all missions including disabled

```bash
curl -s https://api.simflightpro.com/api/missions?include_disabled=1 \
  -H "Authorization: Bearer <admin-token>"
```
