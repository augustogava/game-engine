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

## 8. What is intentionally NOT in scope here

- Per-engine geometry (position/axis per engine). Total `max_thrust_n` keeps the existing semantics of "total thrust along body forward". A later spec may add an `aircraft_engines` child table.
- Engine thermodynamic state (MAP, CHT, EGT, mixture lever value, magneto position). Those are runtime telemetry, not aircraft-definition data, and stay on the client.
- Multi-tank fuel modeling. A single fuel mass is sufficient for the current flight model.
- Changes to `aircraft_surfaces`, `user_aircrafts`, `flight_logs`, or any other table.
