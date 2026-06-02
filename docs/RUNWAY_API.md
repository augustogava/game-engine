# Runway & Airport API — Game Integration Guide

> This document describes every API the game client (`flight.html`) needs to consume: user airports, runway data, aircraft data, and how to use them for spawning.

> **Full game API index (missions, plans, aircraft, airports):** [docs/api/GAME_API_REFERENCE.md](./api/GAME_API_REFERENCE.md) · §7 Airports and runways.

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [Data Source & Seeding](#2-data-source--seeding)
3. [API Endpoints](#3-api-endpoints)
4. [URL Parameters Passed to the Game](#4-url-parameters-passed-to-the-game)
5. [Game Client Integration](#5-game-client-integration)
6. [Spawn Modes](#6-spawn-modes)
7. [Coordinate System Reference](#7-coordinate-system-reference)
8. [Examples](#8-examples)

---

## 1. Database Schema

### `airport_runways`

Created by migration `api/migrations/create_airport_runways.js`.

```sql
CREATE TABLE airport_runways (
  id                          INT AUTO_INCREMENT PRIMARY KEY,
  airport_id                  INT NOT NULL,
  length_ft                   INT DEFAULT NULL,
  width_ft                    INT DEFAULT NULL,
  surface                     VARCHAR(50) DEFAULT NULL,
  lighted                     TINYINT(1) NOT NULL DEFAULT 0,
  closed                      TINYINT(1) NOT NULL DEFAULT 0,
  le_ident                    VARCHAR(10) DEFAULT NULL,
  le_latitude_deg             DECIMAL(10,7) DEFAULT NULL,
  le_longitude_deg            DECIMAL(10,7) DEFAULT NULL,
  le_elevation_ft             INT DEFAULT NULL,
  le_heading_deg_true         DECIMAL(6,2) DEFAULT NULL,
  le_displaced_threshold_ft   INT DEFAULT NULL,
  he_ident                    VARCHAR(10) DEFAULT NULL,
  he_latitude_deg             DECIMAL(10,7) DEFAULT NULL,
  he_longitude_deg            DECIMAL(10,7) DEFAULT NULL,
  he_elevation_ft             INT DEFAULT NULL,
  he_heading_deg_true         DECIMAL(6,2) DEFAULT NULL,
  he_displaced_threshold_ft   INT DEFAULT NULL,
  created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE CASCADE,
  INDEX idx_runway_airport (airport_id),
  INDEX idx_runway_closed (closed)
);
```

### Column descriptions

| Column | Type | Description |
|--------|------|-------------|
| `airport_id` | INT | FK to `airports.id` |
| `length_ft` | INT | Runway length in feet |
| `width_ft` | INT | Runway width in feet |
| `surface` | VARCHAR(50) | Surface material (ASP, CON, GRS, etc.) |
| `lighted` | TINYINT(1) | 1 = has lighting |
| `closed` | TINYINT(1) | 1 = permanently closed |
| `le_ident` | VARCHAR(10) | Low-end designator (e.g. "09L") |
| `le_latitude_deg` | DECIMAL(10,7) | Threshold latitude (low end) |
| `le_longitude_deg` | DECIMAL(10,7) | Threshold longitude (low end) |
| `le_elevation_ft` | INT | Threshold elevation AMSL (low end) |
| `le_heading_deg_true` | DECIMAL(6,2) | True heading from low end |
| `le_displaced_threshold_ft` | INT | Displaced threshold distance (low end) |
| `he_ident` | VARCHAR(10) | High-end designator (e.g. "27R") |
| `he_latitude_deg` | DECIMAL(10,7) | Threshold latitude (high end) |
| `he_longitude_deg` | DECIMAL(10,7) | Threshold longitude (high end) |
| `he_elevation_ft` | INT | Threshold elevation AMSL (high end) |
| `he_heading_deg_true` | DECIMAL(6,2) | True heading from high end |
| `he_displaced_threshold_ft` | INT | Displaced threshold distance (high end) |

### Low-end (LE) vs High-end (HE)

Each runway has two ends. The **low end (LE)** is the end with the lower runway number (e.g., runway 09), and the **high end (HE)** is the opposite (e.g., runway 27). They are always ~180° apart in heading.

```
   LE (09)                                    HE (27)
   ──────────────────────────────────────────────
   le_heading = 90°                    he_heading = 270°
   le_lat/le_lon                       he_lat/he_lon
```

---

## 2. Data Source & Seeding

### Source

**OurAirports** — https://ourairports.com/data/

- File: `runways.csv`
- Direct download: https://davidmegginson.github.io/ourairports-data/runways.csv
- License: Public domain
- Updated regularly (~weekly)
- Contains ~45,000 runway records worldwide

### Prerequisites

Airports must be seeded first:

```bash
cd api
node scripts/seed-airports.js
```

### Import runways

**Automatic:** The API server auto-imports runway data on startup if the `airport_runways` table has fewer than 1,000 rows. This is handled by `api/seeds/auto-seed-runways.js`, called from `server.js` after migrations. No manual action needed after first deploy.

**Manual (force re-import):**

```bash
cd api
node scripts/import-runways.js
```

The script/auto-seed will:
1. Download `runways.csv` from OurAirports
2. Parse and filter out closed runways and rows without coordinates
3. Match each runway to an existing airport via `icao_code`
4. Clear existing `airport_runways` data (idempotent re-run)
5. Batch-insert matched runways

Expected output:

```
[Seed] Downloading runways CSV from OurAirports...
[Seed] Downloaded 5.2 MB
[Seed] Parsed 38421 open runways
[Seed] Matched 35102 runways to existing airports
[Seed] Imported 35102 runways into airport_runways
```

---

## 3. API Endpoints

Base URL: `https://api.simflightpro.com` (production) / `http://localhost:3011` (dev)

All authenticated endpoints require `Authorization: Bearer <jwt-token>` header.

---

### 3.1 `GET /api/airports/acquired`

Returns only airports the authenticated user owns. This is the primary endpoint the game should use to list airports available for flight.

**Auth:** Required (Bearer token).

**Success Response (200):**

```json
{
  "data": [
    {
      "id": 55,
      "user_id": 12,
      "airport_id": 1842,
      "is_owned": 1,
      "is_favorite": 0,
      "is_home_base": 1,
      "created_at": "2025-12-01T10:30:00.000Z",
      "name": "Guarulhos - Governador André Franco Montoro International Airport",
      "icao_code": "SBGR",
      "iata_code": "GRU",
      "type": "large_airport",
      "country_code": "BR",
      "municipality": "São Paulo",
      "latitude": -23.4355560,
      "longitude": -46.4730560,
      "elevation_ft": 2459
    },
    {
      "id": 56,
      "user_id": 12,
      "airport_id": 302,
      "is_owned": 1,
      "is_favorite": 1,
      "is_home_base": 0,
      "created_at": "2025-12-05T14:00:00.000Z",
      "name": "John F Kennedy International Airport",
      "icao_code": "KJFK",
      "iata_code": "JFK",
      "type": "large_airport",
      "country_code": "US",
      "municipality": "New York",
      "latitude": 40.6399280,
      "longitude": -73.7786930,
      "elevation_ft": 13
    }
  ]
}
```

**Fields available per airport:**

| Field | Type | Description |
|-------|------|-------------|
| `airport_id` | int | Airport ID (use this to fetch runways) |
| `is_owned` | int | 1 = user owns this airport |
| `is_favorite` | int | 1 = user marked as favorite |
| `is_home_base` | int | 1 = user's home airport (for default spawn) |
| `name` | string | Airport full name |
| `icao_code` | string | ICAO identifier (e.g. "SBGR") |
| `iata_code` | string/null | IATA identifier (e.g. "GRU") |
| `type` | string | `large_airport`, `medium_airport`, `small_airport`, `heliport` |
| `country_code` | string | ISO country code |
| `municipality` | string | City name |
| `latitude` | float | Airport center latitude (WGS84) |
| `longitude` | float | Airport center longitude (WGS84) |
| `elevation_ft` | int/null | Airport elevation in feet AMSL |

**Error Responses:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ "error": "Not authenticated" }` | Missing or invalid token |

---

### 3.2 `GET /api/airports/:id`

Returns full details for a single airport (any airport, not just acquired).

**Auth:** Not required.

**Success Response (200):**

```json
{
  "id": 1842,
  "icao_code": "SBGR",
  "iata_code": "GRU",
  "name": "Guarulhos - Governador André Franco Montoro International Airport",
  "city": "São Paulo",
  "country": "Brazil",
  "country_code": "BR",
  "latitude": -23.4355560,
  "longitude": -46.4730560,
  "elevation_ft": 2459,
  "type": "large_airport",
  "continent": "SA",
  "region": "BR-SP",
  "municipality": "São Paulo",
  "is_active": 1,
  "created_at": "2025-01-01T00:00:00.000Z",
  "updated_at": "2025-01-01T00:00:00.000Z",
  "credit_price": 500,
  "runway_count": 2,
  "runways": [
    {
      "id": 4523,
      "airport_id": 1842,
      "length_ft": 13123,
      "width_ft": 148,
      "surface": "ASP",
      "lighted": 1,
      "closed": 0,
      "le_ident": "09L",
      "le_latitude_deg": -23.44,
      "le_longitude_deg": -46.47,
      "le_elevation_ft": 2459,
      "le_heading_deg_true": 92.1,
      "le_displaced_threshold_ft": null,
      "he_ident": "27R",
      "he_latitude_deg": -23.45,
      "he_longitude_deg": -46.45,
      "he_elevation_ft": 2450,
      "he_heading_deg_true": 272.1,
      "he_displaced_threshold_ft": null
    }
  ],
  "is_owned": false,
  "acquired_at": null
}
```

`city` is set from `municipality` when `city` is null. `credit_price` matches marketplace pricing by `type`. `runways` duplicates `GET /api/airports/:id/runways` (open runways only, longest first). With `Authorization: Bearer`, `is_owned` and `acquired_at` are included when the user owns the airport.

---

### 3.3 `GET /api/airports/:id/runways`

Returns all open (non-closed) runways for an airport, ordered by length descending (longest first).

**Auth:** Not required.

**Parameters:**

| Param | In | Type | Required | Description |
|-------|----|------|----------|-------------|
| `id` | path | INT | Yes | Airport ID |

**Success Response (200):**

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
      "le_ident": "09R",
      "le_latitude_deg": -23.4355780,
      "le_longitude_deg": -46.4730830,
      "le_elevation_ft": 2461,
      "le_heading_deg_true": 93.30,
      "le_displaced_threshold_ft": 1001,
      "he_ident": "27L",
      "he_latitude_deg": -23.4319640,
      "he_longitude_deg": -46.4362960,
      "he_elevation_ft": 2425,
      "he_heading_deg_true": 273.30,
      "he_displaced_threshold_ft": null
    },
    {
      "id": 4524,
      "airport_id": 1842,
      "length_ft": 9843,
      "width_ft": 148,
      "surface": "ASP",
      "lighted": 1,
      "closed": 0,
      "le_ident": "09L",
      "le_latitude_deg": -23.4255200,
      "le_longitude_deg": -46.4867630,
      "le_elevation_ft": 2484,
      "le_heading_deg_true": 93.10,
      "le_displaced_threshold_ft": null,
      "he_ident": "27R",
      "he_latitude_deg": -23.4231700,
      "he_longitude_deg": -46.4589760,
      "he_elevation_ft": 2461,
      "he_heading_deg_true": 273.10,
      "he_displaced_threshold_ft": 984
    }
  ]
}
```

**Error Responses:**

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "Invalid airport id" }` | Non-numeric `:id` |
| 404 | `{ "error": "Airport not found" }` | Airport does not exist |
| 500 | `{ "error": "Failed to get airport runways" }` | Server error |

**Notes:**
- The first element in `data` is the longest runway (best for spawn).
- An empty `data: []` means no runway data is available for this airport (use mid-air spawn fallback).

---

### 3.4 `GET /api/user-aircrafts`

Returns all aircraft owned by the user, with full physics data and surfaces. Needed by the game for spawn parameters (`spawn_alt_offset_m`, `spawn_airborne_speed_ms`, etc.) and flight physics.

**Auth:** Required (Bearer token).

**Success Response (200):**

```json
{
  "data": [
    {
      "id": 1,
      "user_id": 12,
      "aircraft_id": 1,
      "is_selected": 1,
      "acquired_at": "2025-12-01T10:30:00.000Z",
      "aircraft": {
        "id": 1,
        "code": "dc8",
        "name": "Douglas DC-8",
        "category": 2,
        "model_file": "models/DC8_AFRC_AIR_0824.glb",
        "mass_kg": 10000.0,
        "max_thrust_n": 50000.0,
        "spawn_alt_offset_m": 600.0,
        "spawn_airborne_thrust": 0.70,
        "spawn_airborne_speed_ms": 100.0,
        "default_flap_index_ground": 2,
        "default_flap_index_air": 0,
        "flap_steps_json": [0, 5, 15, 25, 30, 40],
        "surfaces": [
          {
            "surface_index": 0,
            "label": "left_wing",
            "pos_x": -3.0, "pos_y": 0.0, "pos_z": -0.5,
            "normal_x": 0.0, "normal_y": 1.0, "normal_z": 0.0,
            "area": 38.0, "chord": 2.5, "aspect_ratio": 7.5,
            "zero_lift_aoa": -0.035, "flap_fraction": 0.15
          }
        ]
      }
    }
  ]
}
```

The aircraft with `is_selected: 1` is the one the user chose to fly. Use its spawn parameters.

---

### 3.5 Endpoint summary for the game

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/airports/acquired` | Bearer | User's airports (for airport selection menu) |
| `GET` | `/api/airports/:id` | No | Single airport details |
| `GET` | `/api/airports/:id/runways` | No | Runway data for ground spawn |
| `GET` | `/api/user-aircrafts` | Bearer | User's aircraft fleet + physics data |
| `GET` | `/api/airports/search?q=` | No | Search airports by name/ICAO |
| `GET` | `/api/airports/nearby?lat=&lng=` | No | Airports near a coordinate |

---

## 4. URL Parameters Passed to the Game

When the user clicks "Start Flight" on the map, the website opens:

```
https://game.simflightpro.com/flight.html?token=...&lat=...&lng=...&...
```

### Full parameter reference

| Parameter | Type | Always present | Description |
|-----------|------|---------------|-------------|
| `token` | string | Yes | JWT auth token |
| `lat` | float | Yes | Airport center latitude |
| `lng` | float | Yes | Airport center longitude |
| `airport_id` | int | Yes | Airport database ID |
| `icao` | string | Yes* | Airport ICAO code (e.g. "SBGR") |
| `alt` | int | If known | Airport elevation in **meters** (AMSL) |
| `rwy_lat` | float | If runway exists | Runway threshold latitude (spawn point) |
| `rwy_lng` | float | If runway exists | Runway threshold longitude (spawn point) |
| `rwy_hdg` | float | If runway exists | Runway heading in degrees true |
| `rwy_elev` | int | If runway exists | Runway threshold elevation (ft AMSL) |
| `rwy_id` | string | If runway exists | Runway designator (e.g. "09R") |
| `rwy_len` | int | If runway exists | Runway length in feet |
| `rwy_wid` | int | If runway exists | Runway width in feet |
| `rwy_sfc` | string | If runway exists | Runway surface type |

*`icao` is present when the airport has an ICAO code.

### Surface type codes

Common values from OurAirports:

| Code | Surface |
|------|---------|
| `ASP` | Asphalt |
| `CON` | Concrete |
| `GRS` | Grass |
| `GVL` | Gravel |
| `TURF` | Turf |
| `DIRT` | Dirt |
| `SAND` | Sand |
| `WATER` | Water |
| `SNOW` | Snow |
| `ICE` | Ice |

---

## 5. Game Client Integration

### 5.1 Reading URL parameters

```javascript
const params = new URLSearchParams(window.location.search);
const token    = params.get('token');
const lat      = parseFloat(params.get('lat'));
const lng      = parseFloat(params.get('lng'));
const alt      = parseInt(params.get('alt')) || 0;
const airportId = parseInt(params.get('airport_id')) || null;
const icao     = params.get('icao') || null;

// Runway data (may be null if no runway available)
const rwyLat   = params.has('rwy_lat') ? parseFloat(params.get('rwy_lat')) : null;
const rwyLng   = params.has('rwy_lng') ? parseFloat(params.get('rwy_lng')) : null;
const rwyHdg   = params.has('rwy_hdg') ? parseFloat(params.get('rwy_hdg')) : null;
const rwyElev  = params.has('rwy_elev') ? parseInt(params.get('rwy_elev')) : null;
const rwyId    = params.get('rwy_id') || null;
const rwyLen   = params.has('rwy_len') ? parseInt(params.get('rwy_len')) : null;
const rwyWid   = params.has('rwy_wid') ? parseInt(params.get('rwy_wid')) : null;
const rwySfc   = params.get('rwy_sfc') || null;

history.replaceState(null, '', window.location.pathname);
```

### 5.2 Deciding spawn mode

```javascript
const hasRunwayData = rwyLat !== null && rwyLng !== null && rwyHdg !== null;

if (hasRunwayData) {
  groundSpawn(rwyLat, rwyLng, rwyHdg, rwyElev, rwyLen, rwyWid, rwySfc);
} else if (lat && lng) {
  airSpawn(lat, lng, alt);
} else {
  defaultSpawn();
}
```

### 5.3 Ground spawn (runway available)

Place the aircraft on the runway threshold, aligned with the runway heading, wheels on the ground.

```javascript
function groundSpawn(rwyLat, rwyLng, rwyHdg, rwyElev, rwyLen, rwyWid, rwySfc) {
  const FT_TO_M = 0.3048;

  // Position: runway threshold
  const spawnLat = rwyLat;
  const spawnLng = rwyLng;

  // Altitude: threshold elevation (or airport elevation fallback)
  const spawnAltM = (rwyElev || alt || 0) * FT_TO_M;

  // Heading: align with runway direction (true heading)
  const spawnHeading = rwyHdg;

  // Aircraft state: on the ground, brakes set, idle thrust
  const initialState = {
    latitude: spawnLat,
    longitude: spawnLng,
    altitude_m: spawnAltM,
    heading_deg: spawnHeading,
    pitch_deg: 0,
    roll_deg: 0,
    airspeed_ms: 0,
    throttle: 0,
    on_ground: true,
    brakes: true,
    flaps_index: aircraft.default_flap_index_ground,
  };

  // Optional: offset from threshold for taxi start position
  // Move the aircraft back from threshold along the runway heading
  if (rwyLen) {
    const TAXI_OFFSET_FT = 200;
    const offsetM = TAXI_OFFSET_FT * FT_TO_M;
    const oppositeHdgRad = ((spawnHeading + 180) % 360) * (Math.PI / 180);

    const R = 6371000; // Earth radius in meters
    const dLat = (offsetM * Math.cos(oppositeHdgRad)) / R;
    const dLng = (offsetM * Math.sin(oppositeHdgRad)) / (R * Math.cos(spawnLat * Math.PI / 180));

    initialState.latitude  += dLat * (180 / Math.PI);
    initialState.longitude += dLng * (180 / Math.PI);
  }

  // Apply friction based on surface type
  if (rwySfc) {
    initialState.surface_type = rwySfc;
  }

  placeAircraft(initialState);
}
```

### 5.4 Air spawn (no runway data — fallback)

Uses the existing `spawn_alt_offset_m`, `spawn_airborne_thrust`, `spawn_airborne_speed_ms` from the aircraft configuration.

```javascript
function airSpawn(lat, lng, altMeters) {
  const spawnAlt = altMeters + aircraft.spawn_alt_offset_m;

  const initialState = {
    latitude: lat,
    longitude: lng,
    altitude_m: spawnAlt,
    heading_deg: 0,
    pitch_deg: 0,
    roll_deg: 0,
    airspeed_ms: aircraft.spawn_airborne_speed_ms,
    throttle: aircraft.spawn_airborne_thrust,
    on_ground: false,
    brakes: false,
    flaps_index: aircraft.default_flap_index_air,
  };

  placeAircraft(initialState);
}
```

### 5.5 Default spawn (no airport selected — "Fly Now")

When the user clicks "Fly Now" from the sidebar without selecting an airport, no lat/lng is passed. The game should fetch the user's airports and pick one:

```javascript
async function resolveDefaultAirport(apiUrl, token) {
  const response = await fetch(`${apiUrl}/api/airports/acquired`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const json = await response.json();
  const airports = json.data || [];

  if (airports.length === 0) return null;

  // Priority: home base → first favorite → first owned
  const homeBase = airports.find(a => a.is_home_base === 1);
  if (homeBase) return homeBase;

  const favorite = airports.find(a => a.is_favorite === 1);
  if (favorite) return favorite;

  return airports[0];
}

// Usage on game load when no airport in URL:
const airport = await resolveDefaultAirport(API_URL, token);
if (airport) {
  const runways = await fetchRunways(airport.airport_id, token);
  if (runways.length > 0) {
    groundSpawn(runways[0].le_latitude_deg, runways[0].le_longitude_deg, ...);
  } else {
    airSpawn(airport.latitude, airport.longitude, (airport.elevation_ft || 0) * FT_TO_M);
  }
}
```

### 5.6 Full game bootstrap flow

Complete initialization sequence the game client should follow on load:

```javascript
const API_URL = 'https://api.simflightpro.com';
const FT_TO_M = 0.3048;

async function bootstrapGame() {
  // 1. Read URL params
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) {
    window.location.href = 'https://simflightpro.com/login';
    return;
  }
  history.replaceState(null, '', window.location.pathname);

  // 2. Fetch user's selected aircraft
  const aircraftRes = await fetch(`${API_URL}/api/user-aircrafts`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const aircraftData = (await aircraftRes.json()).data || [];
  const selected = aircraftData.find(a => a.is_selected === 1) || aircraftData[0];
  if (!selected) {
    console.error('No aircraft available');
    return;
  }
  const aircraft = selected.aircraft;

  // 3. Determine spawn airport + runway
  const rwyLat = params.has('rwy_lat') ? parseFloat(params.get('rwy_lat')) : null;
  const rwyLng = params.has('rwy_lng') ? parseFloat(params.get('rwy_lng')) : null;
  const rwyHdg = params.has('rwy_hdg') ? parseFloat(params.get('rwy_hdg')) : null;
  const hasRunway = rwyLat !== null && rwyLng !== null && rwyHdg !== null;

  if (hasRunway) {
    // GROUND SPAWN — runway data in URL (from map "Start Flight")
    groundSpawn({
      lat: rwyLat,
      lng: rwyLng,
      hdg: rwyHdg,
      elev: params.has('rwy_elev') ? parseInt(params.get('rwy_elev')) : null,
      len: params.has('rwy_len') ? parseInt(params.get('rwy_len')) : null,
      wid: params.has('rwy_wid') ? parseInt(params.get('rwy_wid')) : null,
      sfc: params.get('rwy_sfc'),
      aircraft,
    });
  } else if (params.has('lat') && params.has('lng')) {
    // AIR SPAWN — airport coords in URL but no runway
    airSpawn({
      lat: parseFloat(params.get('lat')),
      lng: parseFloat(params.get('lng')),
      alt: parseInt(params.get('alt')) || 0,
      aircraft,
    });
  } else if (params.has('missionId')) {
    // MISSION — fetch mission, then airport + runways
    await missionSpawn(params.get('missionId'), token, aircraft);
  } else {
    // FLY NOW — no airport in URL, resolve from user's acquired airports
    const airport = await resolveDefaultAirport(API_URL, token);
    if (airport) {
      const runways = await fetchRunways(airport.airport_id, token);
      if (runways.length > 0) {
        groundSpawn({
          lat: runways[0].le_latitude_deg,
          lng: runways[0].le_longitude_deg,
          hdg: runways[0].le_heading_deg_true,
          elev: runways[0].le_elevation_ft,
          len: runways[0].length_ft,
          wid: runways[0].width_ft,
          sfc: runways[0].surface,
          aircraft,
        });
      } else {
        airSpawn({
          lat: airport.latitude,
          lng: airport.longitude,
          alt: (airport.elevation_ft || 0) * FT_TO_M,
          aircraft,
        });
      }
    }
  }

  // 4. Connect WebSocket for multiplayer
  connectWebSocket(token);
}
```

### 5.7 Fetching runways from game client

Helper used by the bootstrap flow and mission spawn:

```javascript
async function fetchRunways(airportId, token) {
  const response = await fetch(`${API_URL}/api/airports/${airportId}/runways`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const json = await response.json();
  return json.data || [];
}
```

### 5.8 Mission spawn

When the URL has `missionId`, fetch mission details, then resolve the departure airport:

```javascript
async function missionSpawn(missionId, token, aircraft) {
  const missionRes = await fetch(`${API_URL}/api/missions/${missionId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const mission = await missionRes.json();

  if (!mission.departure_airport_id) {
    // Mission has no departure airport — use default spawn
    const airport = await resolveDefaultAirport(API_URL, token);
    if (airport) {
      airSpawn({ lat: airport.latitude, lng: airport.longitude, alt: 0, aircraft });
    }
    return;
  }

  // Fetch departure airport details
  const airportRes = await fetch(`${API_URL}/api/airports/${mission.departure_airport_id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const airport = await airportRes.json();

  // Fetch runways
  const runways = await fetchRunways(mission.departure_airport_id, token);

  if (runways.length > 0) {
    groundSpawn({
      lat: runways[0].le_latitude_deg,
      lng: runways[0].le_longitude_deg,
      hdg: runways[0].le_heading_deg_true,
      elev: runways[0].le_elevation_ft,
      len: runways[0].length_ft,
      wid: runways[0].width_ft,
      sfc: runways[0].surface,
      aircraft,
    });
  } else {
    airSpawn({
      lat: airport.latitude,
      lng: airport.longitude,
      alt: (airport.elevation_ft || 0) * FT_TO_M,
      aircraft,
    });
  }
}
```

---

## 6. Spawn Modes

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SPAWN DECISION FLOW                             │
│                                                                     │
│  URL has rwy_lat + rwy_lng + rwy_hdg?                              │
│  ├── YES → GROUND SPAWN                                            │
│  │   • Position: runway threshold (rwy_lat, rwy_lng)               │
│  │   • Altitude: rwy_elev (ft → m) — wheels on ground              │
│  │   • Heading: rwy_hdg (true heading)                              │
│  │   • Speed: 0 (stationary, brakes on)                             │
│  │   • Throttle: 0 (idle)                                           │
│  │   • Flaps: default_flap_index_ground                             │
│  │                                                                   │
│  └── NO → URL has lat + lng?                                        │
│      ├── YES → AIR SPAWN                                            │
│      │   • Position: airport center (lat, lng)                      │
│      │   • Altitude: alt + spawn_alt_offset_m                       │
│      │   • Heading: 0° (or random)                                  │
│      │   • Speed: spawn_airborne_speed_ms                           │
│      │   • Throttle: spawn_airborne_thrust                          │
│      │   • Flaps: default_flap_index_air                            │
│      │                                                               │
│      └── NO → DEFAULT SPAWN                                         │
│          • Fetch user home airport or use hardcoded default          │
│          • Then apply ground or air spawn logic                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Coordinate System Reference

| Property | Unit | System | Notes |
|----------|------|--------|-------|
| `latitude` / `longitude` | Decimal degrees | WGS84 | Standard GPS coordinates |
| `elevation_ft` | Feet | AMSL (above mean sea level) | Airport reference point |
| `rwy_elev` / `le_elevation_ft` | Feet | AMSL | Per-threshold, more precise |
| `heading_deg_true` | Degrees | True north (0°–360°) | NOT magnetic heading |
| `length_ft` / `width_ft` | Feet | — | Physical runway dimensions |
| `displaced_threshold_ft` | Feet | — | Distance from physical end to landing threshold |

### Converting true heading to magnetic heading

If the game uses magnetic heading, apply local magnetic variation:

```javascript
const magneticHeading = (trueHeading - magneticVariation + 360) % 360;
```

Magnetic variation can be looked up from WMM (World Magnetic Model) or approximated from the runway designator number:

```javascript
// Approximate: runway "09" means magnetic heading ~90°
// le_heading_deg_true might be 93.3° (true)
// Difference = approximate local magnetic variation
const approxMagVar = (parseInt(rwyId) * 10) - rwyHdg;
```

### Converting feet to meters

```javascript
const FT_TO_M = 0.3048;
const altitudeMeters = altitudeFeet * FT_TO_M;
```

---

## 8. Examples

### Example 1: GRU (São Paulo–Guarulhos) — Ground spawn

**Website opens:**

```
https://game.simflightpro.com/flight.html?
  token=eyJhbGciOi...
  &lat=-23.4356
  &lng=-46.4731
  &airport_id=1842
  &icao=SBGR
  &alt=750
  &rwy_lat=-23.4355780
  &rwy_lng=-46.4730830
  &rwy_hdg=93.30
  &rwy_elev=2461
  &rwy_id=09R
  &rwy_len=13123
  &rwy_wid=148
  &rwy_sfc=ASP
```

**Game reads and spawns:**

- Position: -23.4355780, -46.4730830 (runway 09R threshold)
- Altitude: 2461 ft × 0.3048 = 750 m (ground level at threshold)
- Heading: 93.30° true
- Speed: 0 (on ground)
- Surface: asphalt (ASP)
- Runway length available: 13,123 ft for takeoff roll

### Example 2: Small airstrip without runway data — Air spawn

**Website opens:**

```
https://game.simflightpro.com/flight.html?
  token=eyJhbGciOi...
  &lat=12.3456
  &lng=-45.6789
  &airport_id=9999
  &icao=XXXX
  &alt=150
```

No `rwy_*` params → game falls back to air spawn:

- Position: 12.3456, -45.6789 (airport center)
- Altitude: 150 + 600 (spawn_alt_offset_m) = 750 m
- Speed: 100 m/s (spawn_airborne_speed_ms)
- Throttle: 70% (spawn_airborne_thrust)

### Example 3: "Fly Now" button — No airport

**Website opens:**

```
https://game.simflightpro.com/flight.html?token=eyJhbGciOi...
```

No lat/lng, no runway. Game fetches user profile or uses default airport.

### Example 4: Mission start

**Website opens:**

```
https://game.simflightpro.com/flight.html?
  token=eyJhbGciOi...
  &missionId=42
```

Game fetches mission details via API, gets `departure_airport_id`, then:

```javascript
// Fetch departure airport runways
const runways = await fetch(`${API_URL}/api/airports/${mission.departure_airport_id}/runways`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(j => j.data);

if (runways.length > 0) {
  groundSpawn(runways[0].le_latitude_deg, runways[0].le_longitude_deg, ...);
} else {
  // Fetch airport for center coordinates
  const airport = await fetch(`${API_URL}/api/airports/${mission.departure_airport_id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());
  airSpawn(airport.latitude, airport.longitude, airport.elevation_ft * 0.3048);
}
```

---

## Setup Checklist

1. **Seed airports** (if not done — manual, one-time):
   ```bash
   cd api && node scripts/seed-airports.js
   ```

2. **Start the API server** — migrations + runway auto-seed run automatically:
   ```bash
   cd api && node server.js
   ```
   On startup the server will:
   - Run pending migrations (creates `airport_runways` table)
   - Auto-import runway data from OurAirports if table has < 1,000 rows

3. **Verify:**
   ```bash
   # Check acquired airports (requires valid token)
   curl -H "Authorization: Bearer <token>" https://api.simflightpro.com/api/airports/acquired

   # Check runways for an airport
   curl https://api.simflightpro.com/api/airports/1/runways
   ```

4. **Force re-import** (optional, manual):
   ```bash
   cd api && node scripts/import-runways.js
   ```
