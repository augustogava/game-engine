# Dynamic Aircrafts - API Specification & Database Schema

## Overview

The flight simulator currently has a single hardcoded aircraft (Douglas DC-8). This document specifies everything needed to make aircrafts dynamic and database-driven, allowing users to select from multiple aircraft with different physics, aerodynamics, and 3D models.

The **Admin API** owns the database, migrations, seed data, and business logic. The game server (`server.js`) acts as a proxy, forwarding requests with the user's JWT.

---

## Architecture

```
Browser (FlightSceneSimple.ts)
    │
    │  GET /api/aircrafts
    │  GET /api/aircrafts/:id
    │  GET /api/user-aircrafts          (JWT)
    │  POST /api/user-aircrafts/:id/select  (JWT)
    │  POST /api/user-aircrafts/:id/acquire (JWT)
    │
    ▼
Game Server (server.js) ── proxy ──► Admin API (MAIN_API_URL)
                                         │
                                         ▼
                                     MySQL Database
```

All requests are proxied as-is. The `Authorization: Bearer <jwt>` header is forwarded to the Admin API.

---

## Database Tables

### 1. `aircrafts`

Main table storing all aircraft definitions. Each row contains the full physics model, aerodynamics, and rendering config needed by the game engine.

```sql
CREATE TABLE IF NOT EXISTS aircrafts (
    id                        INT AUTO_INCREMENT PRIMARY KEY,
    code                      VARCHAR(50) NOT NULL UNIQUE COMMENT 'Internal identifier (e.g. dc8, cessna172)',
    name                      VARCHAR(150) NOT NULL COMMENT 'Display name (e.g. Douglas DC-8)',
    category                  ENUM('light','turboprop','jet','heavy_jet','military') NOT NULL DEFAULT 'jet',
    description               TEXT NULL COMMENT 'Optional description for UI display',

    -- 3D Model
    model_file                VARCHAR(255) NOT NULL COMMENT 'Path to .glb file relative to public root (e.g. models/DC8.glb)',
    model_target_size         DECIMAL(8,2) NOT NULL DEFAULT 40.00 COMMENT 'Scale normalizer: model is scaled so bounding box diagonal = this value',
    model_rotation_y          DECIMAL(8,4) NOT NULL DEFAULT 3.1416 COMMENT 'Y-axis rotation offset in radians applied to the model pivot',
    thumbnail_url             VARCHAR(500) NULL COMMENT 'Preview image URL for aircraft selection UI',

    -- Physics: Mass & Inertia
    mass_kg                   DECIMAL(12,2) NOT NULL COMMENT 'Aircraft mass in kilograms. Used for F=ma and gravity calculations',
    max_thrust_n              DECIMAL(12,2) NOT NULL COMMENT 'Maximum engine thrust in Newtons. Thrust vector = throttle * max_thrust_n along forward axis',
    inertia_xx                DECIMAL(12,2) NOT NULL COMMENT 'Moment of inertia around X axis (roll). Higher = harder to roll',
    inertia_yy                DECIMAL(12,2) NOT NULL COMMENT 'Moment of inertia around Y axis (yaw). Higher = harder to yaw',
    inertia_zz                DECIMAL(12,2) NOT NULL COMMENT 'Moment of inertia around Z axis (pitch). Higher = harder to pitch',

    -- Aerodynamics
    lift_slope                DECIMAL(6,3) NOT NULL COMMENT 'Lift curve slope (dCL/dAlpha). Higher = more lift per degree of AoA. Typical: 4.0-6.0',
    skin_friction             DECIMAL(6,4) NOT NULL COMMENT 'Base skin friction drag coefficient. Typical: 0.01-0.03',
    stall_alpha_rad           DECIMAL(6,4) NOT NULL COMMENT 'Stall angle of attack in radians. Beyond this, lift drops sharply. Typical: 0.20-0.30',
    oswald_efficiency         DECIMAL(4,2) NOT NULL COMMENT 'Oswald span efficiency factor (0-1). Affects induced drag. Typical: 0.7-0.9',
    fuselage_cd0              DECIMAL(6,4) NOT NULL COMMENT 'Fuselage parasitic drag coefficient. Added as extra drag independent of wings',
    fuselage_ref_area         DECIMAL(8,2) NOT NULL COMMENT 'Fuselage reference area in m². Multiplied by fuselage_cd0 for drag force',
    stall_speed_kts           DECIMAL(6,1) NOT NULL COMMENT 'Stall speed in knots for HUD warning display only (not physics)',
    base_zero_lift_aoa        DECIMAL(8,5) NOT NULL COMMENT 'Base zero-lift angle of attack in radians. Wing produces no lift at this AoA',

    -- Flaps
    flap_steps_json           JSON NOT NULL COMMENT 'Array of flap detent angles in degrees. E.g. [0, 5, 15, 25, 30, 40]',
    default_flap_index_ground TINYINT NOT NULL DEFAULT 2 COMMENT 'Index into flap_steps_json when spawning on ground',
    default_flap_index_air    TINYINT NOT NULL DEFAULT 0 COMMENT 'Index into flap_steps_json when spawning airborne',

    -- Throttle & Ground Handling
    throttle_up_rate          DECIMAL(5,3) NOT NULL DEFAULT 0.550 COMMENT 'Throttle increase rate per second (0-1 range). How fast throttle spools up',
    throttle_down_rate        DECIMAL(5,3) NOT NULL DEFAULT 0.400 COMMENT 'Throttle decrease rate per second. How fast throttle spools down',
    rolling_friction          DECIMAL(5,3) NOT NULL DEFAULT 0.300 COMMENT 'Ground rolling friction deceleration coefficient',
    brake_friction            DECIMAL(5,2) NOT NULL DEFAULT 8.00 COMMENT 'Brake friction coefficient when brakes are engaged',
    idle_friction             DECIMAL(5,2) NOT NULL DEFAULT 1.50 COMMENT 'Extra friction when thrust < 0.05 (idle on ground)',

    -- Spawn Parameters
    spawn_alt_offset_m        DECIMAL(8,1) NOT NULL DEFAULT 600.0 COMMENT 'Altitude above ground for airborne spawn in meters',
    spawn_airborne_thrust     DECIMAL(4,2) NOT NULL DEFAULT 0.70 COMMENT 'Initial throttle (0-1) when spawning airborne',
    spawn_airborne_speed_ms   DECIMAL(8,1) NOT NULL DEFAULT 100.0 COMMENT 'Initial forward velocity in m/s when spawning airborne',

    -- Marketplace / Unlocking
    price                     INT NOT NULL DEFAULT 0 COMMENT 'Price in reward points. 0 = free/starter aircraft',
    min_pilot_rank            VARCHAR(30) NOT NULL DEFAULT 'student' COMMENT 'Minimum pilot rank required to unlock. Values: student, private_pilot, commercial_pilot, airline_pilot, captain, senior_captain',
    is_default                TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = this is the default/starter aircraft given to all new users',
    is_active                 TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = soft-deleted, not shown in lists',
    sort_order                INT NOT NULL DEFAULT 0 COMMENT 'Display ordering in selection UI (lower = first)',

    created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_aircrafts_active (is_active, sort_order),
    INDEX idx_aircrafts_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 2. `aircraft_surfaces`

Each aircraft has N aerodynamic surfaces (typically 4: left wing, right wing, horizontal stabilizer, vertical stabilizer). The game engine iterates these surfaces to compute lift, drag, and torque forces.

```sql
CREATE TABLE IF NOT EXISTS aircraft_surfaces (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    aircraft_id     INT NOT NULL COMMENT 'FK to aircrafts.id',
    surface_index   TINYINT NOT NULL COMMENT 'Order index. 0=left_wing, 1=right_wing, 2=h_stab, 3=v_stab (convention)',
    label           VARCHAR(50) NOT NULL COMMENT 'Human-readable label: left_wing, right_wing, h_stab, v_stab',

    -- Position in body frame (meters, relative to aircraft center of mass)
    pos_x           DECIMAL(8,4) NOT NULL COMMENT 'X position: negative=left, positive=right',
    pos_y           DECIMAL(8,4) NOT NULL COMMENT 'Y position: negative=down, positive=up',
    pos_z           DECIMAL(8,4) NOT NULL COMMENT 'Z position: negative=tail, positive=nose',

    -- Surface normal vector (unit vector, defines lift direction)
    normal_x        DECIMAL(4,2) NOT NULL COMMENT 'Normal X component. Wings: 0, V-stab: 1',
    normal_y        DECIMAL(4,2) NOT NULL COMMENT 'Normal Y component. Wings: 1, V-stab: 0',
    normal_z        DECIMAL(4,2) NOT NULL COMMENT 'Normal Z component. Usually 0',

    -- Aerodynamic properties
    area            DECIMAL(8,3) NOT NULL COMMENT 'Surface area in m². Larger = more lift and drag',
    chord           DECIMAL(6,3) NOT NULL COMMENT 'Chord length in meters. Used for Reynolds number calculations',
    aspect_ratio    DECIMAL(6,3) NOT NULL COMMENT 'Aspect ratio (span²/area). Higher = less induced drag',
    zero_lift_aoa   DECIMAL(8,5) NOT NULL COMMENT 'Zero-lift angle of attack in radians for this specific surface',
    flap_fraction   DECIMAL(5,3) NOT NULL COMMENT 'Flap effectiveness fraction (0-1). 0=no flap effect, higher=more flap influence on this surface',

    sort_order      TINYINT NOT NULL DEFAULT 0 COMMENT 'Processing order in physics loop',

    CONSTRAINT fk_aircraft_surfaces_aircraft FOREIGN KEY (aircraft_id) REFERENCES aircrafts(id) ON DELETE CASCADE,
    INDEX idx_surfaces_aircraft (aircraft_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**How surfaces work in the engine:**
- Left/right wings (index 0,1): Primary lift surfaces. Normal points UP `(0,1,0)`. `controlInput` is mapped to roll (ailerons). Flaps affect these surfaces.
- Horizontal stabilizer (index 2): Normal points UP `(0,1,0)`. `controlInput` is mapped to pitch (elevator).
- Vertical stabilizer (index 3): Normal points RIGHT `(1,0,0)`. `controlInput` is mapped to yaw (rudder).
- The engine reads `liftSlope`, `skinFriction`, `stallAlpha`, `oswaldE` from the parent `aircrafts` row and applies them to all surfaces.
- `zero_lift_aoa` and `flap_fraction` are per-surface because wings have different values than stabilizers.

### 3. `user_aircrafts`

Tracks which aircrafts each user owns and which one is currently selected.

```sql
CREATE TABLE IF NOT EXISTS user_aircrafts (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL COMMENT 'FK to users.id',
    aircraft_id     INT NOT NULL COMMENT 'FK to aircrafts.id',
    is_selected     TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = currently selected aircraft for this user. Only one per user should be 1',
    acquired_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_user_aircraft (user_id, aircraft_id),
    CONSTRAINT fk_user_aircrafts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_aircrafts_aircraft FOREIGN KEY (aircraft_id) REFERENCES aircrafts(id) ON DELETE CASCADE,
    INDEX idx_user_aircrafts_selected (user_id, is_selected)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Selection logic:** When a user selects an aircraft, set `is_selected = 0` for all their rows, then `is_selected = 1` for the chosen one.

**Auto-assign default:** When a new user registers, automatically insert a `user_aircrafts` row with the aircraft where `is_default = 1` and `is_selected = 1`.

---

## Seed Data

### DC-8 (Default Starter Aircraft)

```sql
INSERT INTO aircrafts (
    code, name, category, description, model_file, model_target_size, model_rotation_y, thumbnail_url,
    mass_kg, max_thrust_n, inertia_xx, inertia_yy, inertia_zz,
    lift_slope, skin_friction, stall_alpha_rad, oswald_efficiency,
    fuselage_cd0, fuselage_ref_area, stall_speed_kts, base_zero_lift_aoa,
    flap_steps_json, default_flap_index_ground, default_flap_index_air,
    throttle_up_rate, throttle_down_rate, rolling_friction, brake_friction, idle_friction,
    spawn_alt_offset_m, spawn_airborne_thrust, spawn_airborne_speed_ms,
    price, min_pilot_rank, is_default, is_active, sort_order
) VALUES (
    'dc8', 'Douglas DC-8', 'jet',
    'Four-engine narrow-body commercial jet airliner. NASA/USAF research variant.',
    'models/DC8_AFRC_AIR_0824.glb', 40.00, 3.1416, NULL,
    10000.00, 50000.00, 211333.00, 256608.00, 48531.00,
    5.500, 0.0200, 0.2600, 0.80,
    0.0400, 45.00, 25.0, -0.03500,
    '[0, 5, 15, 25, 30, 40]', 2, 0,
    0.550, 0.400, 0.300, 8.00, 1.50,
    600.0, 0.70, 100.0,
    0, 'student', 1, 1, 0
);

-- Aerodynamic surfaces for DC-8 (aircraft_id = LAST_INSERT_ID())
SET @dc8_id = LAST_INSERT_ID();

INSERT INTO aircraft_surfaces (aircraft_id, surface_index, label, pos_x, pos_y, pos_z, normal_x, normal_y, normal_z, area, chord, aspect_ratio, zero_lift_aoa, flap_fraction, sort_order) VALUES
(@dc8_id, 0, 'left_wing',  -3.0000, 0.0000, -0.5000, 0.00, 1.00, 0.00, 38.000, 2.500, 7.500, -0.03500, 0.150, 0),
(@dc8_id, 1, 'right_wing',  3.0000, 0.0000, -0.5000, 0.00, 1.00, 0.00, 38.000, 2.500, 7.500, -0.03500, 0.150, 1),
(@dc8_id, 2, 'h_stab',      0.0000, 0.0000, -7.0000, 0.00, 1.00, 0.00,  7.200, 1.800, 2.200,  0.00000, 0.350, 2),
(@dc8_id, 3, 'v_stab',      0.0000, 1.5000, -7.0000, 1.00, 0.00, 0.00,  7.000, 2.000, 1.750,  0.00000, 0.350, 3);
```

---

## Existing Tables Migration

The following existing tables reference aircraft by string and must be migrated to FK `aircrafts.id`.

### `flight_logs`

**Current column:** `aircraft_type VARCHAR(...)` - stores a string like `"DC8_AFRC_AIR_0824"`

**Migration:**
```sql
ALTER TABLE flight_logs ADD COLUMN aircraft_id INT NULL AFTER aircraft_type;
ALTER TABLE flight_logs ADD CONSTRAINT fk_flight_logs_aircraft FOREIGN KEY (aircraft_id) REFERENCES aircrafts(id) ON DELETE SET NULL;
ALTER TABLE flight_logs ADD INDEX idx_flight_logs_aircraft (aircraft_id);

-- Populate from existing data (match by model filename pattern)
UPDATE flight_logs fl
JOIN aircrafts a ON fl.aircraft_type LIKE CONCAT('%', a.code, '%')
SET fl.aircraft_id = a.id
WHERE fl.aircraft_type IS NOT NULL AND fl.aircraft_id IS NULL;

-- Eventually drop the old column after verification:
-- ALTER TABLE flight_logs DROP COLUMN aircraft_type;
```

### `user_flight_stats`

**Current column:** `most_used_aircraft VARCHAR(...)` - stores a string

**Migration:**
```sql
ALTER TABLE user_flight_stats ADD COLUMN most_used_aircraft_id INT NULL AFTER most_used_aircraft;
ALTER TABLE user_flight_stats ADD CONSTRAINT fk_user_flight_stats_aircraft FOREIGN KEY (most_used_aircraft_id) REFERENCES aircrafts(id) ON DELETE SET NULL;

-- Populate from existing data
UPDATE user_flight_stats ufs
JOIN aircrafts a ON ufs.most_used_aircraft LIKE CONCAT('%', a.code, '%')
SET ufs.most_used_aircraft_id = a.id
WHERE ufs.most_used_aircraft IS NOT NULL AND ufs.most_used_aircraft_id IS NULL;

-- Eventually drop the old column after verification:
-- ALTER TABLE user_flight_stats DROP COLUMN most_used_aircraft;
```

### Other Tables

Audit all tables for columns referencing aircraft by string (`aircraft_type`, `aircraft_name`, `aircraft_code`, etc.) and migrate them to INT FK -> `aircrafts.id`.

---

## API Contract

All endpoints must be implemented by the Admin API. The game server proxies these with the `Authorization` header forwarded.

### `GET /api/aircrafts`

List all active aircrafts with their surfaces.

**Query Parameters:**
- `category` (optional) - Filter by category enum value

**Response (200):**
```json
{
    "data": [
        {
            "id": 1,
            "code": "dc8",
            "name": "Douglas DC-8",
            "category": 2,
            "description": "Four-engine narrow-body...",
            "model_file": "models/DC8_AFRC_AIR_0824.glb",
            "model_target_size": 40.00,
            "model_rotation_y": 3.1416,
            "thumbnail_url": null,
            "mass_kg": 10000.00,
            "max_thrust_n": 50000.00,
            "inertia_xx": 211333.00,
            "inertia_yy": 256608.00,
            "inertia_zz": 48531.00,
            "lift_slope": 5.500,
            "skin_friction": 0.0200,
            "stall_alpha_rad": 0.2600,
            "oswald_efficiency": 0.80,
            "fuselage_cd0": 0.0400,
            "fuselage_ref_area": 45.00,
            "stall_speed_kts": 25.0,
            "base_zero_lift_aoa": -0.03500,
            "flap_steps_json": [0, 5, 15, 25, 30, 40],
            "default_flap_index_ground": 2,
            "default_flap_index_air": 0,
            "throttle_up_rate": 0.550,
            "throttle_down_rate": 0.400,
            "rolling_friction": 0.300,
            "brake_friction": 8.00,
            "idle_friction": 1.50,
            "spawn_alt_offset_m": 600.0,
            "spawn_airborne_thrust": 0.70,
            "spawn_airborne_speed_ms": 100.0,
            "price": 0,
            "min_pilot_rank": "student",
            "is_default": 1,
            "sort_order": 0,
            "surfaces": [
                {
                    "surface_index": 0,
                    "label": "left_wing",
                    "pos_x": -3.0000, "pos_y": 0.0000, "pos_z": -0.5000,
                    "normal_x": 0.00, "normal_y": 1.00, "normal_z": 0.00,
                    "area": 38.000, "chord": 2.500, "aspect_ratio": 7.500,
                    "zero_lift_aoa": -0.03500, "flap_fraction": 0.150
                },
                {
                    "surface_index": 1,
                    "label": "right_wing",
                    "pos_x": 3.0000, "pos_y": 0.0000, "pos_z": -0.5000,
                    "normal_x": 0.00, "normal_y": 1.00, "normal_z": 0.00,
                    "area": 38.000, "chord": 2.500, "aspect_ratio": 7.500,
                    "zero_lift_aoa": -0.03500, "flap_fraction": 0.150
                },
                {
                    "surface_index": 2,
                    "label": "h_stab",
                    "pos_x": 0.0000, "pos_y": 0.0000, "pos_z": -7.0000,
                    "normal_x": 0.00, "normal_y": 1.00, "normal_z": 0.00,
                    "area": 7.200, "chord": 1.800, "aspect_ratio": 2.200,
                    "zero_lift_aoa": 0.00000, "flap_fraction": 0.350
                },
                {
                    "surface_index": 3,
                    "label": "v_stab",
                    "pos_x": 0.0000, "pos_y": 1.5000, "pos_z": -7.0000,
                    "normal_x": 1.00, "normal_y": 0.00, "normal_z": 0.00,
                    "area": 7.000, "chord": 2.000, "aspect_ratio": 1.750,
                    "zero_lift_aoa": 0.00000, "flap_fraction": 0.350
                }
            ]
        }
    ]
}
```

**Notes:**
- `category` must be returned as its enum numeric index (0=light, 1=turboprop, 2=jet, 3=heavy_jet, 4=military)
- `flap_steps_json` must be returned as a parsed JSON array, not a string
- `surfaces` must be included nested in each aircraft, ordered by `sort_order`

---

### `GET /api/aircrafts/:id`

Get a single aircraft with full detail and surfaces.

**Response (200):** Same structure as a single item from the list above.

**Response (404):**
```json
{ "error": "Aircraft not found" }
```

---

### `GET /api/user-aircrafts`

List aircrafts owned by the authenticated user.

**Headers:** `Authorization: Bearer <jwt>` (required)

**Response (200):**
```json
{
    "data": [
        {
            "id": 1,
            "user_id": 42,
            "aircraft_id": 1,
            "is_selected": 1,
            "acquired_at": "2026-04-30T22:00:00.000Z",
            "aircraft": {
                "id": 1,
                "code": "dc8",
                "name": "Douglas DC-8",
                "category": 2,
                "model_file": "models/DC8_AFRC_AIR_0824.glb",
                "thumbnail_url": null,
                "surfaces": [...]
            }
        }
    ]
}
```

**Notes:**
- Each item must include the full `aircraft` object with `surfaces` nested
- The item with `is_selected = 1` is the currently active aircraft

---

### `POST /api/user-aircrafts/:id/select`

Select an aircraft as the user's active aircraft. `:id` is the `aircraft_id`.

**Headers:** `Authorization: Bearer <jwt>` (required)

**Response (200):**
```json
{ "message": "Aircraft selected" }
```

**Response (404):**
```json
{ "error": "Aircraft not owned by user" }
```

**Logic:**
1. Verify user owns this aircraft (`user_aircrafts` row exists)
2. Set `is_selected = 0` for all user's rows
3. Set `is_selected = 1` for the specified aircraft

---

### `POST /api/user-aircrafts/:id/acquire`

Acquire/unlock an aircraft. `:id` is the `aircraft_id`.

**Headers:** `Authorization: Bearer <jwt>` (required)

**Request Body:**
```json
{ "payment_method": "points" }
```

**Response (201):**
```json
{ "id": 5, "message": "Aircraft acquired" }
```

**Response (409):**
```json
{ "error": "Aircraft already owned" }
```

**Response (403):**
```json
{ "error": "Insufficient rank or points" }
```

**Logic:**
1. Check aircraft exists and `is_active = 1`
2. Check user doesn't already own it
3. Validate `min_pilot_rank` against user's current rank
4. Validate user has enough `total_reward_points` >= `price`
5. Deduct points from user if price > 0
6. Insert into `user_aircrafts`

---

## How the Game Engine Uses Each Field

| Field | Engine Usage |
|---|---|
| `model_file` | Loaded via `BABYLON.SceneLoader.ImportMesh('', folder, filename, scene)`. The path is split into folder + filename. |
| `model_target_size` | After loading, the model's bounding box diagonal is computed. `scaleFactor = model_target_size / diagonalLength`. Applied to the model pivot. |
| `model_rotation_y` | Applied as `modelPivot.rotation.y = model_rotation_y`. Most models need `Math.PI` (3.1416) to face forward. |
| `mass_kg` | Used in `F = ma` for linear acceleration: `velocity += force * dt / mass_kg` |
| `max_thrust_n` | Thrust force = `throttle * max_thrust_n` along the aircraft's forward axis |
| `inertia_xx/yy/zz` | Used in angular acceleration: `angularAccel.x = torque.x / inertia_xx`. Higher values = more resistance to rotation. |
| `lift_slope` | Corrected lift slope per surface: `corrSlope = lift_slope * AR / (AR + 2*(AR+4)/(AR+2))`. Determines how much lift per degree of AoA. |
| `skin_friction` | Base drag coefficient when not stalled. Increases with flap deployment. |
| `stall_alpha_rad` | When AoA exceeds this, the engine blends from normal lift to flat-plate model (lift drops, drag spikes). |
| `oswald_efficiency` | Induced drag: `CD_induced = CL² / (π * AR * oswald_efficiency)` |
| `fuselage_cd0` | Extra parasitic drag: `F_fuselage = 0.5 * ρ * V² * fuselage_cd0 * fuselage_ref_area` |
| `stall_speed_kts` | HUD shows "STALL" warning when speed < this value and altitude > 20m |
| `base_zero_lift_aoa` | Wing zero-lift AoA. Shifted by flaps: `zeroLift = base + (-flapRad * 0.04)` |
| `flap_steps_json` | Array of flap angles in degrees. User cycles through with keys 5/6. |
| `throttle_up/down_rate` | `thrust += rate * dt` when W/S keys pressed |
| `rolling_friction` | Ground deceleration: `speed -= rolling_friction * dt` |
| `brake_friction` | When brakes on: `speed -= brake_friction * dt` |
| `idle_friction` | When thrust < 0.05: `speed -= idle_friction * dt` |
| `spawn_alt_offset_m` | Airborne spawn: `position.y = groundLevel + spawn_alt_offset_m` |
| `spawn_airborne_thrust` | Initial throttle for airborne spawn |
| `spawn_airborne_speed_ms` | Initial forward velocity for airborne spawn |
| `surfaces[].position` | Point where aerodynamic force is applied. Creates torque = cross(position, force) |
| `surfaces[].normal` | Defines the lift direction. Wings: (0,1,0)=up. V-stab: (1,0,0)=right. |
| `surfaces[].area` | Dynamic pressure force = 0.5 * ρ * V² * area |
| `surfaces[].aspect_ratio` | Affects induced drag and corrected lift slope |
| `surfaces[].flap_fraction` | How much flap deflection affects this surface's lift: `CL += sqrt(flapFraction) * corrSlope * controlInput * 0.52` |
