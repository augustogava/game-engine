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
in_progress → completed
in_progress → failed
in_progress → cancelled
```

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
      "arrival_runway_length_ft": 10285
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 20
}
```

---

### `GET /api/missions/:id`

Get a single mission with full detail.

**Auth:** Optional (admins see disabled missions).

**Response (200):** Same structure as a single item from the list.

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
  "is_enabled": 1
}
```

**Validation:**
- `title` is required.
- `type` must be one of the valid enum values.
- `difficulty` must be one of the valid enum values.
- If `type=route`: `departure_airport_id` and `arrival_airport_id` are required.
- If `type=discovery`: `spawn_latitude`, `spawn_longitude`, and `spawn_altitude_ft` are required.

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

**Request Body:** Partial — only include fields to update.

```json
{
  "title": "Updated Title",
  "is_enabled": 0
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
        "arrival_runway_length_ft": 10285
      }
    }
  ]
}
```

---

### `POST /api/user-missions`

Start a mission. Creates a user-mission record with `status='in_progress'` and returns the full enriched payload.

**Auth:** Required.

**Request Body:**

```json
{ "mission_id": 5 }
```

**Response (201):**

Same shape as a single item from `GET /api/user-missions`, with `status: "in_progress"`.

**Error Responses:**

| Code | Body | Description |
|---|---|---|
| 400 | `{ "error": "mission_id is required" }` | Missing field |
| 401 | `{ "error": "Not authenticated" }` | No JWT |
| 403 | `{ "error": "Mission not available" }` | Mission is `is_active=0` or `is_enabled=0` |
| 404 | `{ "error": "Mission not found" }` | Invalid mission_id |
| 409 | `{ "error": "Mission already in progress" }` | User already has an active record for this mission |

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

Mark a mission as completed. `:id` is the `user_missions.id`.

**Auth:** Required.

**Response (200):**

```json
{ "message": "Mission completed" }
```

**Response (404):**

```json
{ "error": "User mission not found" }
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

### Start a mission

```bash
curl -s -X POST https://api.simflightpro.com/api/user-missions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"mission_id": 5}'
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

### Admin: list all missions including disabled

```bash
curl -s https://api.simflightpro.com/api/missions?include_disabled=1 \
  -H "Authorization: Bearer <admin-token>"
```
