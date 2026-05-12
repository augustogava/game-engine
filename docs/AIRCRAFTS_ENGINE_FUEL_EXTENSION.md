# Aircrafts — Engine Type & Fuel System Extension

Addendum to [AIRCRAFTS_API_SPECIFICATION.md](./AIRCRAFTS_API_SPECIFICATION.md).
This spec is consumed by the **Admin API team** (the team that owns the database, migrations and `/api/aircrafts*` endpoints). The game client (`FlightSceneSimple.ts`) cannot enable propeller-specific physics or a real fuel system until these fields are present in the API response.

- API Base URL: `https://api.simflightpro.com/api` (production) or `http://localhost:3011/api` (dev)
- Affected endpoints: `GET /api/aircrafts`, `GET /api/aircrafts/:id`, `GET /api/user-aircrafts`
- Affected table: `aircrafts`

## Status

| Step | Status |
|---|---|
| §2 Schema migration (`ALTER TABLE aircrafts ADD COLUMN ...`) | **APPLIED** |
| §5 DC-8 seed `UPDATE` | **PENDING** — run the statement in §5 next |
| §2.1 Validation rules on create/update endpoints | PENDING (Admin API) |
| §4 API response additions on `GET /api/aircrafts*` | PENDING (Admin API) |
| §8 Gear mechanics fields (`ALTER TABLE`, seed UPDATEs) | **PENDING** — run the statements in §8.1 and §8.2 |
| §8.4 API response for `gear_spring_k` / `gear_damping_c` | PENDING (Admin API) |
| §9 Thrust re-tuning (`max_thrust_n` for DC-8 / C172) | **PENDING** — run the statement in §9.2 |
| §10 Wing loading re-tuning (DC-8 `mass_kg` / `fuel_capacity_kg`) | **APPLIED** |

---

## 1. Motivation

The game today applies the same physics model to every aircraft. The flight engine needs to gate **prop-only physics** (P-factor, propwash over tail surfaces, engine reaction torque, propeller gyroscopic precession, fuel-air mixture and magneto switching) so they do NOT run on jets like the Douglas DC-8.

The existing `category` enum (`light | turboprop | jet | heavy_jet | military`) is **insufficient**:

- `light` may be piston-prop (C172) **or** electric **or** very-light-jet.
- `military` may be turbofan (F-22) **or** turboprop (A-29).

A precise `engine_type` discriminator and a small set of engine/fuel parameters are required.

In addition, the current API does not expose any fuel data, so the client fakes fuel as a wall-clock countdown. A real fuel model needs capacity + burn rates.

---

## 2. Schema changes — APPLIED

> Status: the migration below has already been executed against the database. It is kept here for reference and for replay on other environments.

Add **nine** new columns to the existing `aircrafts` table. No tables are dropped or renamed. No existing column is changed.

```sql
ALTER TABLE aircrafts
  ADD COLUMN engine_type
      ENUM('piston','turboprop','turbojet','turbofan','electric')
      NOT NULL DEFAULT 'turbofan'
      COMMENT 'Discriminator for engine-class physics. Returned as numeric enum index.'
      AFTER category,
  ADD COLUMN engine_count
      TINYINT UNSIGNED NOT NULL DEFAULT 1
      COMMENT 'Number of engines installed. >=1.'
      AFTER engine_type,
  ADD COLUMN prop_diameter_m
      DECIMAL(4,2) NULL
      COMMENT 'Propeller disc diameter in meters. NULL for jet/electric.'
      AFTER engine_count,
  ADD COLUMN prop_rotation_dir
      ENUM('cw','ccw') NULL
      COMMENT 'Prop rotation viewed from the cockpit. NULL for jet/electric.'
      AFTER prop_diameter_m,
  ADD COLUMN prop_inertia_kgm2
      DECIMAL(8,3) NULL
      COMMENT 'Moment of inertia of the spinning rotor assembly. NULL for jet/electric.'
      AFTER prop_rotation_dir,
  ADD COLUMN prop_rpm_max
      SMALLINT UNSIGNED NULL
      COMMENT 'Max steady-state propeller RPM. NULL for jet/electric.'
      AFTER prop_inertia_kgm2,
  ADD COLUMN fuel_capacity_kg
      DECIMAL(10,2) NOT NULL DEFAULT 0.00
      COMMENT 'Usable fuel mass at 100% tanks, in kilograms.'
      AFTER prop_rpm_max,
  ADD COLUMN fuel_burn_rate_kg_per_s_max
      DECIMAL(8,5) NOT NULL DEFAULT 0.00000
      COMMENT 'Fuel mass-flow at 100% throttle, ISA sea level, total across all engines.'
      AFTER fuel_capacity_kg,
  ADD COLUMN fuel_burn_rate_kg_per_s_idle
      DECIMAL(8,5) NOT NULL DEFAULT 0.00000
      COMMENT 'Fuel mass-flow at idle, total across all engines.'
      AFTER fuel_burn_rate_kg_per_s_max;
```

### 2.1 Validation rules (Admin API)

- If `engine_type IN ('piston','turboprop')`:
  - `prop_diameter_m`, `prop_rotation_dir`, `prop_inertia_kgm2`, `prop_rpm_max` MUST be NOT NULL.
- If `engine_type IN ('turbojet','turbofan','electric')`:
  - The same four `prop_*` columns MUST be NULL.
- If `engine_type = 'electric'`:
  - `fuel_capacity_kg`, `fuel_burn_rate_kg_per_s_max`, `fuel_burn_rate_kg_per_s_idle` MUST all be `0`.
- `engine_count >= 1` always.
- `fuel_burn_rate_kg_per_s_idle <= fuel_burn_rate_kg_per_s_max`.

Reject create/update payloads that violate these with HTTP 400 and `{ "error": "<reason>" }`.

---

## 3. Enum encoding on the wire

Following the existing project rule (`enums at request/response always use the number, never the string`), responses MUST emit enum indices:

`engine_type` index map:

| Index | Value |
|---|---|
| 0 | `piston` |
| 1 | `turboprop` |
| 2 | `turbojet` |
| 3 | `turbofan` |
| 4 | `electric` |

`prop_rotation_dir` index map:

| Index | Value |
|---|---|
| 0 | `cw` |
| 1 | `ccw` |

`null` MUST be emitted as JSON `null` (not `0`) when the column is NULL.

The existing `category` index map ([AIRCRAFTS_API_SPECIFICATION.md §API Contract](./AIRCRAFTS_API_SPECIFICATION.md)) is unchanged: `0=light, 1=turboprop, 2=jet, 3=heavy_jet, 4=military`.

---

## 4. API response additions

`GET /api/aircrafts`, `GET /api/aircrafts/:id`, and the nested `aircraft` object inside `GET /api/user-aircrafts` MUST include the new fields. The order does not matter; the fields are additive.

Example response delta for the Douglas DC-8 (turbofan, 4 engines, no prop, ~30 t fuel):

```json
{
    "id": 1,
    "code": "dc8",
    "name": "Douglas DC-8",
    "category": 2,

    "engine_type": 3,
    "engine_count": 4,
    "prop_diameter_m": null,
    "prop_rotation_dir": null,
    "prop_inertia_kgm2": null,
    "prop_rpm_max": null,
    "fuel_capacity_kg": 23000.00,
    "fuel_burn_rate_kg_per_s_max": 2.15000,
    "fuel_burn_rate_kg_per_s_idle": 0.18000,

    "mass_kg": 10000.00,
    "max_thrust_n": 50000.00,
    "...": "(all other existing fields unchanged)"
}
```

Example delta for a hypothetical Cessna 172 (piston-prop, 1 engine):

```json
{
    "code": "c172",
    "category": 0,

    "engine_type": 0,
    "engine_count": 1,
    "prop_diameter_m": 1.93,
    "prop_rotation_dir": 0,
    "prop_inertia_kgm2": 0.450,
    "prop_rpm_max": 2700,
    "fuel_capacity_kg": 144.00,
    "fuel_burn_rate_kg_per_s_max": 0.00850,
    "fuel_burn_rate_kg_per_s_idle": 0.00130
}
```

---

## 5. Seed update for the existing Douglas DC-8 — RUN THIS NEXT

The DC-8 NASA/USAF AFRC research variant uses **four Pratt & Whitney JT3D-3B turbofans**. The seed row created by [AIRCRAFTS_API_SPECIFICATION.md §Seed Data](./AIRCRAFTS_API_SPECIFICATION.md) MUST be updated. Run this single statement against the production DB after §2 has been applied:

```sql
UPDATE aircrafts SET
  engine_type                  = 'turbofan',
  engine_count                 = 4,
  prop_diameter_m              = NULL,
  prop_rotation_dir            = NULL,
  prop_inertia_kgm2            = NULL,
  prop_rpm_max                 = NULL,
  fuel_capacity_kg             = 23000.00,
  fuel_burn_rate_kg_per_s_max  = 2.15000,
  fuel_burn_rate_kg_per_s_idle = 0.18000
WHERE code = 'dc8';
```

Verify after running:

```sql
SELECT id, code,
       engine_type, engine_count,
       prop_diameter_m, prop_rotation_dir, prop_inertia_kgm2, prop_rpm_max,
       fuel_capacity_kg, fuel_burn_rate_kg_per_s_max, fuel_burn_rate_kg_per_s_idle
FROM aircrafts
WHERE code = 'dc8';
```

Expected single row:

```
engine_type                  = turbofan
engine_count                 = 4
prop_diameter_m              = NULL
prop_rotation_dir            = NULL
prop_inertia_kgm2            = NULL
prop_rpm_max                 = NULL
fuel_capacity_kg             = 23000.00
fuel_burn_rate_kg_per_s_max  = 2.15000
fuel_burn_rate_kg_per_s_idle = 0.18000
```

Numeric justification:

- 4 × JT3D ≈ 76,500 lbf static thrust total. The simulator already uses a scaled `max_thrust_n = 50000 N` (about 11,200 lbf) which is intentionally arcade-light; the fuel-burn numbers below are scaled to the same proportional cruise loading, not to a real DC-8.
- `fuel_burn_rate_kg_per_s_max = 2.15` ≈ 7,740 kg/h ≈ realistic cruise burn for the scaled thrust.
- `fuel_burn_rate_kg_per_s_idle = 0.18` ≈ 650 kg/h, four turbofans at ground idle.
- `fuel_capacity_kg = 23000` ≈ usable fuel for a ~3-hour session at this burn rate (allows long flights without refuel UI).

The Admin API team is free to tune these three numbers; the client only requires the columns to exist and be non-zero for non-electric engines.

---

## 6. Backwards compatibility

- New columns are additive. Old API consumers ignore unknown JSON fields.
- All defaults are valid: existing rows that are not updated default to `engine_type='turbofan'`, `engine_count=1`, all `prop_*` NULL, and **zero** fuel — this matches the current cosmetic fuel model on the client (a non-zero fuel system only activates when `fuel_capacity_kg > 0`).
- No existing column changes type or name.
- `category` continues to exist and is used purely as a UI grouping hint (display in the aircraft selector).

---

## 7. Acceptance criteria

1. **[DONE]** `DESCRIBE aircrafts` shows the 9 new columns with the types and defaults above.
2. **[PENDING]** `GET /api/aircrafts/1` (the DC-8 row) returns `engine_type: 3`, `engine_count: 4`, all `prop_*` fields `null`, `fuel_capacity_kg: 23000.00`, `fuel_burn_rate_kg_per_s_max: 2.15`, `fuel_burn_rate_kg_per_s_idle: 0.18`.
3. **[PENDING]** `GET /api/aircrafts` includes the same fields for every row.
4. **[PENDING]** `GET /api/user-aircrafts` includes the same fields inside each `aircraft` nested object.
5. **[PENDING]** Posting an aircraft with `engine_type='piston'` and `prop_diameter_m: null` returns HTTP 400.
6. **[PENDING]** Posting an aircraft with `engine_type='turbofan'` and a non-null `prop_inertia_kgm2` returns HTTP 400.
7. **[PENDING]** Posting an aircraft with `engine_count: 0` returns HTTP 400.

---

## 8. Gear mechanics fields — PENDING

Add **two** new nullable columns to `aircrafts` for per-aircraft landing gear stiffness and damping. Without these, the client falls back to hardcoded DC-8 defaults (`gear_spring_k = 200000`, `gear_damping_c = 50000`) which are far too stiff for lighter aircraft like the C172 and cause violent bouncing.

### 8.1 Schema migration

```sql
ALTER TABLE aircrafts
    ADD COLUMN gear_spring_k DOUBLE NULL COMMENT 'Spring constant per gear leg (N/m)' AFTER gear_positions,
    ADD COLUMN gear_damping_c DOUBLE NULL COMMENT 'Damping coefficient per gear leg (N·s/m)' AFTER gear_spring_k;
```

### 8.2 Seed updates

```sql
-- DC-8: persist current hardcoded values explicitly
UPDATE aircrafts
SET gear_spring_k  = 200000,
    gear_damping_c = 50000
WHERE code = 'dc8';

-- C172: dimensioned for 1255 kg, 3 gear legs, 5cm static deflection, damping ratio 0.7
UPDATE aircrafts
SET gear_spring_k  = 82000,
    gear_damping_c = 8200
WHERE code = 'c172';
```

### 8.3 Dimensioning formula for new aircraft

Target a static deflection `d` (5 cm is a good default) and a damping ratio `ξ ≈ 0.7` (critically-damped-ish, no oscillation):

```
gear_spring_k = (mass_kg × 9.81) / (N_gear_legs × d)
gear_damping_c = 2 × ξ × √(gear_spring_k × mass_kg / N_gear_legs)
```

Example for C172 (mass=1255 kg, N=3 legs, d=0.05 m):
- `gear_spring_k = 1255 × 9.81 / (3 × 0.05) ≈ 82,070 N/m`
- `gear_damping_c = 2 × 0.7 × √(82070 × 418) ≈ 8,200 N·s/m`

### 8.4 API response

Both columns must be returned in `GET /api/aircrafts`, `GET /api/aircrafts/:id`, and the nested `aircraft` object in `GET /api/user-aircrafts`. Type: `number | null`. When `null`, the client uses the DEFAULT_AIRCRAFT_CONFIG fallback.

### 8.5 Validation rules

- Both columns are nullable (backwards-compatible; existing aircraft not yet updated get client-side fallback).
- When provided, `gear_spring_k > 0` and `gear_damping_c >= 0`.

---

## 9. Thrust re-tuning (`max_thrust_n`) — PENDING

In-flight testing showed that the original arcade-light `max_thrust_n = 50000 N` for the DC-8 produces a **thrust-to-weight ratio of only 0.15** at the seeded mass (10000 kg empty + 23000 kg fuel = 33000 kg), which is below the minimum a swept-wing jetliner needs to climb. Symptoms: at full throttle the aircraft tops out around 240 KIAS at 1000 ft, loses speed in any pitch-up, and cannot climb sustainably.

### 9.1 Target thrust-to-weight ratios

| Aircraft | Real T/W (empty) | Game target T/W (full fuel) | Calculation |
|---|---|---|---|
| DC-8 (4× JT3D) | ~0.50 | **0.49** | `160000 / (33000 × 9.81)` |
| C172 SP (180 hp) | ~0.23 | **~0.22** | `2700 / ((mass + fuel) × 9.81)` |

### 9.2 Seed updates

```sql
-- DC-8: bring T/W into the realistic 0.45-0.50 band so climb is possible
UPDATE aircrafts
SET max_thrust_n = 160000.00
WHERE code = 'dc8';

-- Cessna 172 SP: real-world static thrust at sea level (180 hp piston, fixed-pitch prop)
UPDATE aircrafts
SET max_thrust_n = 2700.00
WHERE code = 'c172';
```

### 9.3 Verification

```sql
SELECT code, mass_kg, max_thrust_n, fuel_capacity_kg,
       ROUND(max_thrust_n / (mass_kg * 9.81), 3)                          AS twr_empty,
       ROUND(max_thrust_n / ((mass_kg + fuel_capacity_kg) * 9.81), 3)     AS twr_full
FROM aircrafts
WHERE code IN ('dc8', 'c172');
```

Expected:

```
dc8   mass=10000.00  thrust=160000.00  twr_empty=1.631  twr_full=0.494
c172  mass=<as-seeded>  thrust=2700.00  twr_empty=~0.25  twr_full=~0.22
```

### 9.4 Dimensioning formula for new aircraft

For new aircraft, target T/W in this band:

```
T/W (full fuel) =  max_thrust_n / ((mass_kg + fuel_capacity_kg) × 9.81)
```

| Aircraft class | Target T/W full | Notes |
|---|---|---|
| Light piston single | 0.20 – 0.30 | Long takeoff roll OK |
| Turboprop / regional | 0.30 – 0.40 | |
| Narrow-body / heavy jet | 0.25 – 0.35 | If real-mass-scaled |
| Game-scaled jet (light mass) | 0.45 – 0.55 | Compensates for game-mass scaling |
| Fighter / military | 0.80 – 1.20 | |

So: `max_thrust_n = target_TW × (mass_kg + fuel_capacity_kg) × 9.81`.

### 9.5 Backwards compatibility

No schema change. Only the existing `max_thrust_n` column values are changed. Game client requires no code change.

---

## 10. Wing-loading re-tuning (`mass_kg` / `fuel_capacity_kg`) — PENDING

After §9 was applied, in-flight testing showed the DC-8 still could not climb beyond ~1000 ft. The plane stabilised at ~100 KT but in a stalled-attitude phugoid cycle. Root cause was **excessive wing loading**, not thrust.

### 10.1 Why this is needed

The seeded DC-8 has `mass_kg = 10000` + `fuel_capacity_kg = 23000` = **33000 kg total** with only **76 m² total wing area** (38 m² per wing in `aircraft_surfaces`). With the lift model (`lift_slope = 5.5`, `stall_alpha = 0.26 rad`, AR = 7.5), `Cl_max ≈ 1.23`. Stall speed becomes:

```
v_stall = √( W / (½·ρ·Cl_max·S) )
        = √( 33000·9.81 / (0.5 · 1.225 · 1.23 · 76) )
        = 75.2 m/s ≈ 146 KT
```

Pilots could not accelerate the aircraft past 100 KT in climb attitude — drag at the high AoA needed to support weight at that speed equals the available thrust, and the aircraft sits on the back side of the power curve forever.

Two ways out:

1. Increase wing area (would require multi-row updates in `aircraft_surfaces`).
2. **Reduce mass / fuel weight** (single-row update in `aircrafts`). **This is the chosen path.**

### 10.2 Seed update

```sql
UPDATE aircrafts SET
    mass_kg          = 5000.00,    -- was 10000
    fuel_capacity_kg = 8000.00     -- was 23000
WHERE code = 'dc8';
```

### 10.3 Verification

```sql
SELECT code, mass_kg, fuel_capacity_kg, max_thrust_n,
       ROUND(SQRT((mass_kg + fuel_capacity_kg) * 9.81 / (0.5 * 1.225 * 1.23 * 76)) * 1.94384, 1) AS v_stall_kt_clean,
       ROUND(max_thrust_n / ((mass_kg + fuel_capacity_kg) * 9.81), 3) AS twr_full
FROM aircrafts WHERE code = 'dc8';
```

Expected after the UPDATE:

```
dc8   mass=5000.00  fuel=8000.00  thrust=160000.00  v_stall_kt_clean≈92.5  twr_full=1.253
```

Result: clean stall drops from ~146 KT to ~92 KT, so the DC-8 can sustain level flight at 100+ KT and climb out properly. `twr_full` becomes 1.25 (arcade-powerful, similar to a fighter), which is intentional.

### 10.4 Dimensioning formula for new aircraft

When seeding a new aircraft, sanity-check the stall speed against expected operating speed:

```
v_stall_kt = √( (mass_kg + fuel_capacity_kg) · 9.81 / (0.5 · 1.225 · Cl_max · S_wing_total) ) · 1.94384
```

Where:
- `S_wing_total` = sum of `area` in `aircraft_surfaces` for left and right wings
- `Cl_max ≈ lift_slope_eff · (stall_alpha_rad - zero_lift_aoa)`, with `lift_slope_eff = lift_slope · AR / (AR + 2 · (AR + 4) / (AR + 2))`

Rule of thumb: target `v_stall_kt < 0.65 × typical_cruise_kt`. Otherwise the aircraft will be stuck on the back side of the power curve at low speeds.

### 10.5 C172 stall margin (OPTIONAL)

The C172 in DB uses real-world airfoil parameters (`lift_slope = 5.2`, `stall_alpha_rad = 0.28`), which produces a calculated clean stall of **~62 KT**. The real C172 publishes a stall of 48 KT — the difference comes from leading-edge geometry and finite-wing tip effects that our finite-wing model doesn't fully reproduce.

Raising `stall_alpha_rad` to **0.40** (23°) drops the clean stall to **~51 KT**, matching real publications:

```sql
-- OPTIONAL: bring C172 clean stall down to real-world value (~51 KT)
UPDATE aircrafts SET stall_alpha_rad = 0.40 WHERE code = 'c172';
```

Recalculation: `Cl_max = 3.90 × (0.40 + 0.03) = 1.68`, so `v_stall = √(12311 / (0.5·1.225·1.68·16.2)) ≈ 26.4 m/s ≈ 51 KT`.

### 10.6 Backwards compatibility

No schema change. Only existing column values change. The lift / drag model in `FlightSceneSimple.ts` requires no code change.

---

## 11. What is intentionally NOT in scope here

- Per-engine geometry (position/axis per engine). Total `max_thrust_n` keeps the existing semantics of "total thrust along body forward". A later spec may add an `aircraft_engines` child table.
- Engine thermodynamic state (MAP, CHT, EGT, mixture lever value, magneto position). Those are runtime telemetry, not aircraft-definition data, and stay on the client.
- Multi-tank fuel modeling. A single fuel mass is sufficient for the current flight model.
- Changes to `aircraft_surfaces`, `user_aircrafts`, `flight_logs`, or any other table.
