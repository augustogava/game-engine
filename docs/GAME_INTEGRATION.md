# SimFlightPro - Game Integration Documentation

API Base URL: `https://api.simflightpro.com/api` (production) or `http://localhost:3011/api` (dev)

All authenticated endpoints require `Authorization: Bearer <JWT>` header.

---

## 1. Database Schema

### 1.1 `missions`

```sql
CREATE TABLE missions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  type ENUM('free_flight','scheduled','challenge','milestone') NOT NULL,
  difficulty ENUM('beginner','intermediate','advanced','expert') NOT NULL,
  departure_airport_id INT DEFAULT NULL,        -- FK airports(id)
  arrival_airport_id INT DEFAULT NULL,           -- FK airports(id)
  min_altitude_ft INT DEFAULT NULL,
  max_altitude_ft INT DEFAULT NULL,
  required_aircraft_type VARCHAR(100) DEFAULT NULL,
  reward_points INT DEFAULT 0,
  distance_nm DECIMAL(10,2) DEFAULT NULL,
  estimated_duration_min INT DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 1.2 `user_missions`

Tracks which missions a user has started/completed/failed.

```sql
CREATE TABLE user_missions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,                          -- FK users(id)
  mission_id INT NOT NULL,                       -- FK missions(id)
  status ENUM('started','in_progress','completed','failed','cancelled') DEFAULT 'started',
  started_at DATETIME NOT NULL,
  completed_at DATETIME DEFAULT NULL,
  score INT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Status flow:**
```
started -> in_progress -> completed
                       -> failed
                       -> cancelled
```

### 1.3 `flight_logs`

Every flight session is recorded here. Can optionally be linked to a mission.

```sql
CREATE TABLE flight_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,                          -- FK users(id)
  mission_id INT DEFAULT NULL,                   -- FK missions(id), NULL if free flight
  flight_plan_id INT DEFAULT NULL,               -- FK flight_plans(id), NULL if not from a plan
  departure_airport_id INT NOT NULL,             -- FK airports(id)
  arrival_airport_id INT DEFAULT NULL,           -- FK airports(id)
  departure_time DATETIME NOT NULL,
  arrival_time DATETIME DEFAULT NULL,
  flight_duration_min INT DEFAULT NULL,
  distance_km DECIMAL(10,2) DEFAULT NULL,
  distance_nm DECIMAL(10,2) DEFAULT NULL,
  max_altitude_ft INT DEFAULT NULL,
  avg_speed_knots DECIMAL(8,2) DEFAULT NULL,
  aircraft_type VARCHAR(100) DEFAULT NULL,
  aircraft_registration VARCHAR(20) DEFAULT NULL,
  status ENUM('departed','in_flight','landed','cancelled','crashed') DEFAULT 'departed',
  landing_rate_fpm DECIMAL(8,2) DEFAULT NULL,
  route_data JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Status flow:**
```
departed -> in_flight -> landed
                      -> crashed
                      -> cancelled
```

### 1.4 `user_flight_stats`

Aggregated stats per user. One row per user. Updated via `PUT /flight-stats/recalculate`.

```sql
CREATE TABLE user_flight_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNIQUE NOT NULL,                   -- FK users(id)
  total_flights INT DEFAULT 0,
  total_distance_km DECIMAL(12,2) DEFAULT 0,
  total_distance_nm DECIMAL(12,2) DEFAULT 0,
  total_flight_hours DECIMAL(10,2) DEFAULT 0,
  total_missions_completed INT DEFAULT 0,
  total_missions_failed INT DEFAULT 0,
  total_reward_points INT DEFAULT 0,
  favorite_airport_id INT DEFAULT NULL,
  most_used_aircraft VARCHAR(100) DEFAULT NULL,
  best_landing_rate_fpm DECIMAL(8,2) DEFAULT NULL,
  avg_landing_rate_fpm DECIMAL(8,2) DEFAULT NULL,
  pilot_rank ENUM('student','private_pilot','commercial_pilot','airline_pilot','captain','senior_captain') DEFAULT 'student',
  last_flight_at DATETIME DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 1.5 `airports`

```sql
CREATE TABLE airports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  icao_code VARCHAR(10) UNIQUE NOT NULL,
  iata_code VARCHAR(10) DEFAULT NULL,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(255) DEFAULT NULL,
  country VARCHAR(100) DEFAULT NULL,
  country_code VARCHAR(5) DEFAULT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  elevation_ft INT DEFAULT NULL,
  type ENUM('large_airport','medium_airport','small_airport','heliport','seaplane_base','closed') DEFAULT 'small_airport',
  continent VARCHAR(5) DEFAULT NULL,
  region VARCHAR(10) DEFAULT NULL,
  municipality VARCHAR(255) DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 1.6 `user_airports`

Airports owned/favorited by a user.

```sql
CREATE TABLE user_airports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  airport_id INT NOT NULL,
  is_owned BOOLEAN DEFAULT FALSE,
  is_favorite BOOLEAN DEFAULT FALSE,
  is_home_base BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_airport (user_id, airport_id)
);
```

### 1.7 `marketplace_listings`

```sql
CREATE TABLE marketplace_listings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seller_id INT NOT NULL,                        -- FK users(id)
  airport_id INT DEFAULT NULL,                   -- FK airports(id), for airport-type listings
  listing_type ENUM('airport','aircraft','license','other') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  price DECIMAL(10,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  status ENUM('active','sold','cancelled','expired') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 1.8 `purchase_history`

Generic purchase record for any marketplace acquisition. Stripe-ready.

```sql
CREATE TABLE purchase_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,                          -- FK users(id)
  listing_id INT DEFAULT NULL,                   -- FK marketplace_listings(id)
  listing_type ENUM('airport','aircraft','license','other') NOT NULL,
  title VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  status ENUM('pending','completed','failed','refunded') DEFAULT 'completed',
  payment_method VARCHAR(50) DEFAULT 'free',     -- 'free', 'stripe', 'points'
  stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
  stripe_checkout_session_id VARCHAR(255) DEFAULT NULL,
  stripe_customer_id VARCHAR(255) DEFAULT NULL,
  stripe_receipt_url VARCHAR(512) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 1.9 `online_sessions`

Tracks live player positions for multiplayer map.

```sql
CREATE TABLE online_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,                          -- FK users(id), UNIQUE
  username VARCHAR(100) NOT NULL,
  latitude DECIMAL(10,7) DEFAULT NULL,
  longitude DECIMAL(10,7) DEFAULT NULL,
  altitude_ft INT DEFAULT NULL,
  heading DECIMAL(6,2) DEFAULT NULL,
  airspeed_knots DECIMAL(8,2) DEFAULT NULL,
  aircraft_type VARCHAR(100) DEFAULT NULL,
  last_heartbeat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  connected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_online_user (user_id)
);
```

---

## 2. Missions API

### 2.1 List missions (public)

```
GET /api/missions?type=challenge&difficulty=beginner&page=1&limit=20
```

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "title": "Cross-Country Challenge",
      "description": "Navigate across country terrain...",
      "type": "challenge",
      "difficulty": "intermediate",
      "departure_airport_id": null,
      "arrival_airport_id": null,
      "min_altitude_ft": null,
      "max_altitude_ft": null,
      "required_aircraft_type": null,
      "reward_points": 500,
      "distance_nm": 320.00,
      "estimated_duration_min": 150,
      "is_active": 1,
      "sort_order": 0,
      "departure_airport_name": null,
      "arrival_airport_name": null
    }
  ],
  "total": 8,
  "page": 1,
  "limit": 20
}
```

### 2.2 Get mission detail (public)

```
GET /api/missions/:id
```

**Response:** Single mission object (same fields as above, plus `departure_icao`, `arrival_icao`).

### 2.3 Start a mission (auth required)

```
POST /api/user-missions
Content-Type: application/json

{ "mission_id": 1 }
```

**Response:** `201`
```json
{ "id": 42, "message": "Mission started" }
```

**Errors:**
- `409` if mission already in progress (status is `started` or `in_progress`)
- `400` if `mission_id` missing

### 2.4 List user's missions (auth required)

```
GET /api/user-missions
```

**Response:**
```json
{
  "data": [
    {
      "id": 42,
      "user_id": 2,
      "mission_id": 1,
      "status": "started",
      "started_at": "2026-04-17T19:00:00.000Z",
      "completed_at": null,
      "score": null,
      "notes": null,
      "mission_title": "Cross-Country Challenge",
      "mission_type": "challenge",
      "mission_difficulty": "intermediate",
      "departure_airport_name": null,
      "arrival_airport_name": null
    }
  ]
}
```

### 2.5 Update mission progress (auth required)

```
PUT /api/user-missions/:id
Content-Type: application/json

{ "status": "in_progress", "score": 350, "notes": "Halfway there" }
```

All fields optional (at least one required). Valid status values: `started`, `in_progress`, `completed`, `failed`, `cancelled`.

### 2.6 Complete a mission (auth required)

```
PUT /api/user-missions/:id/complete
```

Sets `status = 'completed'` and `completed_at = NOW()`.

**Important for game integration:** After completing a mission, call `PUT /api/flight-stats/recalculate` to update `total_reward_points` and `total_missions_completed` in `user_flight_stats`.

---

## 3. Flight Logs API

### 3.1 Create a flight log (auth required)

```
POST /api/flight-logs
Content-Type: application/json

{
  "departure_airport_id": 123,
  "arrival_airport_id": 456,
  "aircraft_type": "Cessna 172",
  "aircraft_registration": "N12345",
  "mission_id": 1,
  "status": "departed"
}
```

Only `departure_airport_id` is required. `mission_id` links the flight to a mission. `flight_plan_id` links it to a flight plan.

**Response:** `201`
```json
{ "id": 99, "message": "Flight recorded" }
```

### 3.2 Update a flight log (auth required)

```
PUT /api/flight-logs/:id
Content-Type: application/json

{
  "status": "landed",
  "arrival_airport_id": 456,
  "flight_duration_min": 45,
  "distance_km": 85.5,
  "distance_nm": 46.2,
  "max_altitude_ft": 5500,
  "avg_speed_knots": 110,
  "landing_rate_fpm": -180.5
}
```

When `status` is set to `"landed"`, `arrival_time` is automatically set to `NOW()`.

### 3.3 List flight logs (auth required)

```
GET /api/flight-logs?page=1&limit=20
```

### 3.4 Get recent flights (auth required)

```
GET /api/flight-logs/recent
```

Returns last 10 flights.

---

## 4. Flight Stats API

### 4.1 Get user stats (auth required)

```
GET /api/flight-stats
```

**Response:**
```json
{
  "user_id": 2,
  "total_flights": 5,
  "total_flight_hours": 3.5,
  "total_distance_km": 450.00,
  "total_distance_nm": 243.00,
  "total_missions_completed": 2,
  "total_missions_failed": 0,
  "total_reward_points": 700,
  "most_used_aircraft": "Cessna 172",
  "pilot_rank": "student",
  "best_landing_rate_fpm": -120.00,
  "avg_landing_rate_fpm": -180.00
}
```

If no stats exist, returns defaults with zeros and `pilot_rank: 'student'`.

### 4.2 Recalculate stats (auth required)

```
PUT /api/flight-stats/recalculate
```

Recalculates all stats from `flight_logs` and `user_missions` tables:
- Flight counts, hours, distance from `flight_logs WHERE status = 'landed'`
- Mission counts from `user_missions`
- `total_reward_points` = SUM of `missions.reward_points` for completed user_missions

**Call this after:** completing a flight, completing/failing a mission.

### 4.3 Leaderboard (public)

```
GET /api/flight-stats/leaderboard
```

Returns top 20 pilots ordered by `total_flight_hours`.

### 4.4 Platform stats (public)

```
GET /api/flight-stats/platform
```

Returns:
```json
{
  "airports": 500,
  "missions": 8,
  "activePilots": 25,
  "totalFlightHours": 1200,
  "onlineNow": 3
}
```

`onlineNow` counts `online_sessions` with `last_heartbeat` in last 30 seconds.

---

## 5. Marketplace API

### 5.1 List active listings (public)

```
GET /api/marketplace?listing_type=aircraft&page=1&limit=20
```

### 5.2 Acquire a listing (auth required)

```
POST /api/marketplace/:id/acquire
```

- Validates listing exists and is active
- Creates `purchase_history` record with `status='completed'`, `payment_method='free'`
- For airport-type listings with `airport_id`, also inserts into `user_airports`
- Returns `409` if already acquired

**Response:** `201`
```json
{ "id": 5, "message": "Item acquired successfully" }
```

### 5.3 Get user purchases (auth required)

```
GET /api/marketplace/purchases
```

**Response:**
```json
{
  "data": [
    {
      "id": 5,
      "user_id": 2,
      "listing_id": 3,
      "listing_type": "aircraft",
      "title": "Cessna 172 Skyhawk",
      "price": 0.00,
      "currency": "USD",
      "status": "completed",
      "payment_method": "free",
      "stripe_payment_intent_id": null,
      "created_at": "2026-04-17T20:00:00.000Z",
      "listing_description": "Classic trainer aircraft"
    }
  ]
}
```

### 5.4 Acquire an airport directly (auth required)

```
POST /api/airports/:id/acquire
```

Inserts into `user_airports` table directly (for airports browsed outside marketplace listings).

### 5.5 Get user's acquired airports (auth required)

```
GET /api/airports/acquired
```

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "user_id": 2,
      "airport_id": 123,
      "is_owned": 1,
      "is_favorite": 0,
      "is_home_base": 0,
      "name": "Guarulhos International",
      "icao_code": "SBGR",
      "iata_code": "GRU",
      "type": "large_airport",
      "country_code": "BR",
      "municipality": "Guarulhos"
    }
  ]
}
```

---

## 6. Typical Game Flows

### 6.1 User starts a mission from the game

```
1. Game loads mission details:     GET  /api/missions/:id
2. User clicks "Start Mission":   POST /api/user-missions         { mission_id: 1 }
3. Game creates flight log:        POST /api/flight-logs           { departure_airport_id, mission_id, aircraft_type }
4. During flight, update log:      PUT  /api/flight-logs/:id       { status: "in_flight", distance_km, max_altitude_ft }
5. On landing:                     PUT  /api/flight-logs/:id       { status: "landed", arrival_airport_id, flight_duration_min, distance_km, landing_rate_fpm }
6. Mission success:                PUT  /api/user-missions/:id/complete
   Mission failure:                PUT  /api/user-missions/:id     { status: "failed" }
7. Recalculate stats:              PUT  /api/flight-stats/recalculate
```

### 6.2 Free flight (no mission)

```
1. Game creates flight log:        POST /api/flight-logs           { departure_airport_id, aircraft_type }
2. During flight, update:          PUT  /api/flight-logs/:id       { status: "in_flight" }
3. On landing:                     PUT  /api/flight-logs/:id       { status: "landed", arrival_airport_id, flight_duration_min, distance_km, landing_rate_fpm }
4. Recalculate stats:              PUT  /api/flight-stats/recalculate
```

### 6.3 Multiplayer heartbeat

```
Game sends periodic heartbeat to online_sessions table (every ~10 seconds):
- INSERT or UPDATE with user position (latitude, longitude, altitude_ft, heading, airspeed_knots, aircraft_type)
- Set last_heartbeat = NOW()
- Players with last_heartbeat older than 30 seconds are considered offline
```

### 6.4 User acquires marketplace item

```
1. Browse listings:                GET  /api/marketplace
2. Acquire item:                   POST /api/marketplace/:id/acquire
3. Check inventory:                GET  /api/marketplace/purchases
4. For airports specifically:      GET  /api/airports/acquired
```

---

## 7. Pilot Rank Progression

```
student -> private_pilot -> commercial_pilot -> airline_pilot -> captain -> senior_captain
```

The `pilot_rank` field in `user_flight_stats` is an ENUM. The game/backend should update it based on criteria like total flight hours, missions completed, etc.

---

## 8. Points System

- Each mission has `reward_points` (defined in `missions` table)
- When a user completes a mission (`user_missions.status = 'completed'`), those points count toward the user's total
- `user_flight_stats.total_reward_points` = SUM of all `missions.reward_points` where `user_missions.status = 'completed'`
- Points are recalculated via `PUT /api/flight-stats/recalculate`
- Points are displayed on Dashboard and Flight Stats pages
