# Flight Plans API — Game Integration Guide

> This document describes the Flight Plans feature: API endpoints, database schema, URL parameters, and how the game client should integrate with flight plans created by users on the website.

API Base URL: `https://api.simflightpro.com/api` (production) or `http://localhost:3011/api` (dev)

All endpoints require `Authorization: Bearer <JWT>` header.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Database Schema](#2-database-schema)
3. [API Endpoints](#3-api-endpoints)
4. [URL Parameters Passed to the Game](#4-url-parameters-passed-to-the-game)
5. [Game Client Integration](#5-game-client-integration)
6. [Full Response Examples](#6-full-response-examples)

---

## 1. Overview

A **Flight Plan** ("Plano de Voo") is a user-created route that specifies:

- **Departure airport** + specific **runway end** (e.g. SBGR runway 09R)
- **Arrival airport** + specific **runway end** (e.g. KJFK runway 04L)
- **Scheduled departure datetime**

Users create flight plans on the website at `/flight-plans`. The game receives a `flightPlanId` via URL parameter, fetches the plan from the API, and uses it to configure the spawn position, heading, and destination.

### How it reaches the game

Two flows are supported:

```
Flow A — Website pre-selects a plan:
  Website opens: flight.html?token=...&flightPlanId=42
  Game reads flightPlanId, calls GET /api/flight-plans/42, spawns accordingly.

Flow B — Game shows a plan picker:
  Website opens: flight.html?token=...
  Game calls GET /api/flight-plans (list), shows picker UI, user selects one.
```

---

## 2. Database Schema

### `flight_plans`

Created by migration `api/migrations/create_flight_plans.js`.

```sql
CREATE TABLE flight_plans (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  user_id               INT NOT NULL,
  name                  VARCHAR(255) DEFAULT NULL,
  departure_airport_id  INT NOT NULL,
  departure_runway_id   INT NOT NULL,
  departure_runway_end  ENUM('le','he') NOT NULL,
  arrival_airport_id    INT NOT NULL,
  arrival_runway_id     INT NOT NULL,
  arrival_runway_end    ENUM('le','he') NOT NULL,
  scheduled_departure_at DATETIME NOT NULL,
  notes                 TEXT DEFAULT NULL,
  is_active             TINYINT(1) DEFAULT 1,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (departure_airport_id) REFERENCES airports(id),
  FOREIGN KEY (arrival_airport_id) REFERENCES airports(id),
  FOREIGN KEY (departure_runway_id) REFERENCES airport_runways(id),
  FOREIGN KEY (arrival_runway_id) REFERENCES airport_runways(id)
);
```

### Runway end concept

Each row in `airport_runways` has **two ends**: LE (low-end) and HE (high-end). For example, runway 09L/27R:

```
   LE (09L)                                    HE (27R)
   ──────────────────────────────────────────────
   le_heading = 90°                    he_heading = 270°
   le_lat/le_lon                       he_lat/he_lon
```

The `departure_runway_end` and `arrival_runway_end` fields store which end the user selected (`'le'` or `'he'`). The API resolves these into concrete lat/lng/heading values in the response, so **the game does not need to interpret LE/HE** — it receives ready-to-use values.

---

## 3. API Endpoints

### 3.1 List user's flight plans

```
GET /api/flight-plans?page=1&limit=20&is_active=1
```

**Auth:** Required (Bearer token). Returns only the authenticated user's plans.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Items per page (max 100) |
| `is_active` | int | 1 | Filter by active status. Omit to get only active plans. |

**Success Response (200):**

```json
{
  "data": [
    {
      "id": 42,
      "user_id": 12,
      "name": "Weekend trip GRU → JFK",
      "departure_airport_id": 1842,
      "departure_runway_id": 4523,
      "departure_runway_end": "le",
      "arrival_airport_id": 302,
      "arrival_runway_id": 1105,
      "arrival_runway_end": "he",
      "scheduled_departure_at": "2026-05-15T14:30:00.000Z",
      "notes": null,
      "is_active": 1,

      "departure_airport_name": "Guarulhos International Airport",
      "departure_icao": "SBGR",
      "dep_latitude": -23.4355560,
      "dep_longitude": -46.4730560,
      "dep_elevation_ft": 2459,

      "dep_rwy_ident": "09R",
      "dep_rwy_heading": 93.30,
      "dep_rwy_latitude": -23.4355780,
      "dep_rwy_longitude": -46.4730830,
      "dep_rwy_elevation_ft": 2461,
      "dep_rwy_length_ft": 13123,
      "dep_rwy_width_ft": 148,
      "dep_rwy_surface": "ASP",

      "arrival_airport_name": "John F Kennedy International Airport",
      "arrival_icao": "KJFK",
      "arr_latitude": 40.6399280,
      "arr_longitude": -73.7786930,
      "arr_elevation_ft": 13,

      "arr_rwy_ident": "31R",
      "arr_rwy_heading": 314.10,
      "arr_rwy_latitude": 40.6352120,
      "arr_rwy_longitude": -73.7723080,
      "arr_rwy_elevation_ft": 12,
      "arr_rwy_length_ft": 14511,
      "arr_rwy_width_ft": 200,
      "arr_rwy_surface": "ASP"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

### 3.2 Get single flight plan

```
GET /api/flight-plans/:id
```

**Auth:** Required. Returns the plan only if it belongs to the authenticated user.

**Success Response (200):** Same shape as a single item from the list above (not wrapped in `data` array).

**Error Responses:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ "error": "Not authenticated" }` | Missing or invalid token |
| 404 | `{ "error": "Flight plan not found" }` | Plan doesn't exist or doesn't belong to user |

### 3.3 Create flight plan

```
POST /api/flight-plans
Content-Type: application/json

{
  "name": "Weekend trip GRU → JFK",
  "departure_airport_id": 1842,
  "departure_runway_id": 4523,
  "departure_runway_end": "le",
  "arrival_airport_id": 302,
  "arrival_runway_id": 1105,
  "arrival_runway_end": "he",
  "scheduled_departure_at": "2026-05-15T14:30:00Z",
  "notes": "optional notes"
}
```

**Required fields:** `departure_airport_id`, `departure_runway_id`, `departure_runway_end`, `arrival_airport_id`, `arrival_runway_id`, `arrival_runway_end`, `scheduled_departure_at`

**Optional fields:** `name`, `notes`

**Validations:**
- Departure and arrival airports must be different
- Both airports must exist and be active
- Each runway must belong to its respective airport and not be closed
- `*_runway_end` must be `'le'` or `'he'`
- `scheduled_departure_at` must be a valid ISO datetime

**Success Response (201):**
```json
{ "id": 42, "message": "Flight plan created" }
```

### 3.4 Update flight plan

```
PUT /api/flight-plans/:id
Content-Type: application/json

{ "name": "Updated name", "scheduled_departure_at": "2026-05-20T10:00:00Z" }
```

Partial update — send only fields to change. Same validations apply when airport/runway fields change.

### 3.5 Delete flight plan (soft delete)

```
DELETE /api/flight-plans/:id
```

Sets `is_active = 0`. The plan is no longer returned by default list queries.

### 3.6 Update flight plan status

```
PATCH /api/flight-plans/:id/status
Content-Type: application/json

{ "status": "in_progress" }
```

The game calls this endpoint during a flight (e.g. `in_progress` on takeoff, `completed` on arrival, `cancelled` on unload/disconnect).

**Status enum:** `"planned"`, `"in_progress"`, `"completed"`, `"cancelled"` — strings matching the `flight_plans.status` column enum.

---

## 4. URL Parameters Passed to the Game

When the user clicks "Iniciar Voo" (Start Flight) on a flight plan card, the website opens:

```
https://game.simflightpro.com/flight.html?token=...&flightPlanId=42
```

### Parameter reference

| Parameter | Type | Always present | Description |
|-----------|------|---------------|-------------|
| `token` | string | Yes | JWT auth token |
| `flightPlanId` | int | When launched from a plan | Flight plan database ID |

When `flightPlanId` is present, the game should call `GET /api/flight-plans/:id` to get all the data it needs.

When `flightPlanId` is absent but the game wants to support a plan picker, call `GET /api/flight-plans` to list available plans.

---

## 5. Game Client Integration

### 5.1 Reading the flight plan parameter

```javascript
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const flightPlanId = params.get('flightPlanId');
```

### 5.2 Fetching and using a flight plan

```javascript
const API_URL = 'https://api.simflightpro.com';
const FT_TO_M = 0.3048;

async function handleFlightPlan(flightPlanId, token) {
  const response = await fetch(`${API_URL}/api/flight-plans/${flightPlanId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    console.error('Failed to fetch flight plan:', response.status);
    return null;
  }

  const plan = await response.json();
  return plan;
}
```

### 5.3 Spawning from a flight plan

The API response contains all the resolved runway data for both departure and arrival. Use the departure runway data for spawn:

```javascript
async function flightPlanSpawn(flightPlanId, token, aircraft) {
  const plan = await handleFlightPlan(flightPlanId, token);
  if (!plan) return;

  // --- DEPARTURE: spawn on the selected runway ---
  const hasDepRunway = plan.dep_rwy_latitude != null
                    && plan.dep_rwy_longitude != null
                    && plan.dep_rwy_heading != null;

  if (hasDepRunway) {
    groundSpawn({
      lat: plan.dep_rwy_latitude,
      lng: plan.dep_rwy_longitude,
      hdg: plan.dep_rwy_heading,
      elev: plan.dep_rwy_elevation_ft,
      len: plan.dep_rwy_length_ft,
      wid: plan.dep_rwy_width_ft,
      sfc: plan.dep_rwy_surface,
      aircraft,
    });
  } else {
    // Fallback: air spawn over departure airport center
    airSpawn({
      lat: plan.dep_latitude,
      lng: plan.dep_longitude,
      alt: (plan.dep_elevation_ft || 0) * FT_TO_M,
      aircraft,
    });
  }

  // --- ARRIVAL: store as destination for navigation ---
  setDestination({
    airport_name: plan.arrival_airport_name,
    icao: plan.arrival_icao,
    latitude: plan.arr_rwy_latitude || plan.arr_latitude,
    longitude: plan.arr_rwy_longitude || plan.arr_longitude,
    heading: plan.arr_rwy_heading,
    elevation_ft: plan.arr_rwy_elevation_ft || plan.arr_elevation_ft,
    runway_ident: plan.arr_rwy_ident,
    runway_length_ft: plan.arr_rwy_length_ft,
    runway_surface: plan.arr_rwy_surface,
  });

  // Store plan metadata for HUD / UI display
  setActivePlan({
    id: plan.id,
    name: plan.name,
    departure_icao: plan.departure_icao,
    dep_rwy_ident: plan.dep_rwy_ident,
    arrival_icao: plan.arrival_icao,
    arr_rwy_ident: plan.arr_rwy_ident,
    scheduled_departure_at: plan.scheduled_departure_at,
  });
}
```

### 5.4 Listing plans for in-game picker (Flow B)

If the game opens without a `flightPlanId`, it can show a plan selection UI:

```javascript
async function listFlightPlans(token) {
  const response = await fetch(`${API_URL}/api/flight-plans?is_active=1`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) return [];

  const json = await response.json();
  return json.data || [];
}

// Usage:
const plans = await listFlightPlans(token);

if (plans.length > 0) {
  // Show picker UI with plan cards:
  // - plan.name || "Unnamed plan"
  // - plan.departure_icao + " RWY " + plan.dep_rwy_ident
  //   → plan.arrival_icao + " RWY " + plan.arr_rwy_ident
  // - Scheduled: plan.scheduled_departure_at
  //
  // On selection:
  //   flightPlanSpawn(selectedPlan.id, token, aircraft);
}
```

### 5.5 Updated bootstrap flow

Add flight plan handling to the existing game bootstrap (see `RUNWAY_API.md` section 5.6):

```javascript
async function bootstrapGame() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) {
    window.location.href = 'https://simflightpro.com/login';
    return;
  }
  history.replaceState(null, '', window.location.pathname);

  // Fetch selected aircraft
  const aircraftRes = await fetch(`${API_URL}/api/user-aircrafts`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const aircraftData = (await aircraftRes.json()).data || [];
  const selected = aircraftData.find(a => a.is_selected === 1) || aircraftData[0];
  if (!selected) { console.error('No aircraft available'); return; }
  const aircraft = selected.aircraft;

  // Determine spawn mode (in priority order)
  const rwyLat = params.has('rwy_lat') ? parseFloat(params.get('rwy_lat')) : null;
  const rwyLng = params.has('rwy_lng') ? parseFloat(params.get('rwy_lng')) : null;
  const rwyHdg = params.has('rwy_hdg') ? parseFloat(params.get('rwy_hdg')) : null;
  const hasRunway = rwyLat !== null && rwyLng !== null && rwyHdg !== null;

  if (hasRunway) {
    // GROUND SPAWN — runway data in URL (from map "Start Flight")
    groundSpawn({ /* ... existing logic ... */ });

  } else if (params.has('flightPlanId')) {
    // ★ NEW: FLIGHT PLAN SPAWN
    await flightPlanSpawn(params.get('flightPlanId'), token, aircraft);

  } else if (params.has('lat') && params.has('lng')) {
    // AIR SPAWN — airport coords in URL but no runway
    airSpawn({ /* ... existing logic ... */ });

  } else if (params.has('missionId')) {
    // MISSION SPAWN
    await missionSpawn(params.get('missionId'), token, aircraft);

  } else {
    // FLY NOW — no params, resolve default airport or show flight plan picker
    const plans = await listFlightPlans(token);
    if (plans.length > 0) {
      // Option: show plan picker before spawning
      showFlightPlanPicker(plans, token, aircraft);
    } else {
      const airport = await resolveDefaultAirport(API_URL, token);
      // ... existing default spawn logic ...
    }
  }

  connectWebSocket(token);
}
```

### 5.6 Creating a flight log from a flight plan

When the user starts flying a flight plan, create a flight log linked to the plan via `flight_plan_id`:

```javascript
async function startFlightFromPlan(plan, token) {
  const response = await fetch(`${API_URL}/api/flight-logs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      departure_airport_id: plan.departure_airport_id,
      arrival_airport_id: plan.arrival_airport_id,
      flight_plan_id: plan.id,
      status: 'departed',
    }),
  });

  const result = await response.json();
  return result.id; // flight log ID — update it during/after flight
}
```

The `flight_plan_id` field is optional (nullable). It links the flight log back to the flight plan that originated it, allowing queries like "show me all flights from this plan".
```

---

## 6. Full Response Examples

### Example: GET /api/flight-plans/42

```json
{
  "id": 42,
  "user_id": 12,
  "name": "Weekend trip GRU → JFK",
  "departure_airport_id": 1842,
  "departure_runway_id": 4523,
  "departure_runway_end": "le",
  "arrival_airport_id": 302,
  "arrival_runway_id": 1105,
  "arrival_runway_end": "he",
  "scheduled_departure_at": "2026-05-15T14:30:00.000Z",
  "notes": null,
  "is_active": 1,
  "created_at": "2026-05-11T17:00:00.000Z",
  "updated_at": "2026-05-11T17:00:00.000Z",

  "departure_airport_name": "Guarulhos International Airport",
  "departure_icao": "SBGR",
  "dep_latitude": -23.4355560,
  "dep_longitude": -46.4730560,
  "dep_elevation_ft": 2459,

  "dep_rwy_ident": "09R",
  "dep_rwy_heading": 93.30,
  "dep_rwy_latitude": -23.4355780,
  "dep_rwy_longitude": -46.4730830,
  "dep_rwy_elevation_ft": 2461,
  "dep_rwy_length_ft": 13123,
  "dep_rwy_width_ft": 148,
  "dep_rwy_surface": "ASP",

  "arrival_airport_name": "John F Kennedy International Airport",
  "arrival_icao": "KJFK",
  "arr_latitude": 40.6399280,
  "arr_longitude": -73.7786930,
  "arr_elevation_ft": 13,

  "arr_rwy_ident": "31R",
  "arr_rwy_heading": 314.10,
  "arr_rwy_latitude": 40.6352120,
  "arr_rwy_longitude": -73.7723080,
  "arr_rwy_elevation_ft": 12,
  "arr_rwy_length_ft": 14511,
  "arr_rwy_width_ft": 200,
  "arr_rwy_surface": "ASP"
}
```

### Response field reference

**Plan fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Flight plan ID |
| `name` | string/null | User-defined plan name |
| `scheduled_departure_at` | datetime | When the flight is scheduled |
| `is_active` | int | 1 = active, 0 = soft-deleted |

**Departure airport fields:**

| Field | Type | Description |
|-------|------|-------------|
| `departure_airport_id` | int | Airport DB ID |
| `departure_icao` | string | ICAO code (e.g. "SBGR") |
| `departure_airport_name` | string | Full airport name |
| `dep_latitude` | float | Airport center latitude |
| `dep_longitude` | float | Airport center longitude |
| `dep_elevation_ft` | int/null | Airport elevation (ft AMSL) |

**Departure runway fields (resolved from chosen end):**

| Field | Type | Description |
|-------|------|-------------|
| `departure_runway_id` | int | Runway DB ID |
| `departure_runway_end` | string | `'le'` or `'he'` |
| `dep_rwy_ident` | string | Runway designator (e.g. "09R") |
| `dep_rwy_heading` | float | True heading in degrees |
| `dep_rwy_latitude` | float | Threshold latitude — **use for spawn position** |
| `dep_rwy_longitude` | float | Threshold longitude — **use for spawn position** |
| `dep_rwy_elevation_ft` | int/null | Threshold elevation (ft AMSL) |
| `dep_rwy_length_ft` | int/null | Runway length (ft) |
| `dep_rwy_width_ft` | int/null | Runway width (ft) |
| `dep_rwy_surface` | string/null | Surface type (ASP, CON, GRS, etc.) |

**Arrival airport fields:**

| Field | Type | Description |
|-------|------|-------------|
| `arrival_airport_id` | int | Airport DB ID |
| `arrival_icao` | string | ICAO code |
| `arrival_airport_name` | string | Full airport name |
| `arr_latitude` | float | Airport center latitude |
| `arr_longitude` | float | Airport center longitude |
| `arr_elevation_ft` | int/null | Airport elevation (ft AMSL) |

**Arrival runway fields (resolved from chosen end):**

| Field | Type | Description |
|-------|------|-------------|
| `arrival_runway_id` | int | Runway DB ID |
| `arrival_runway_end` | string | `'le'` or `'he'` |
| `arr_rwy_ident` | string | Runway designator — **use for destination display** |
| `arr_rwy_heading` | float | True heading — **use for approach/landing** |
| `arr_rwy_latitude` | float | Threshold latitude — **use for destination nav** |
| `arr_rwy_longitude` | float | Threshold longitude — **use for destination nav** |
| `arr_rwy_elevation_ft` | int/null | Threshold elevation (ft AMSL) |
| `arr_rwy_length_ft` | int/null | Runway length (ft) |
| `arr_rwy_width_ft` | int/null | Runway width (ft) |
| `arr_rwy_surface` | string/null | Surface type |

---

## Endpoint summary for the game

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/flight-plans` | Bearer | List user's flight plans (for in-game picker) |
| `GET` | `/api/flight-plans/:id` | Bearer | Get single plan (when launched with `flightPlanId`) |
