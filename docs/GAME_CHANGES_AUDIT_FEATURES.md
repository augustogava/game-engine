# Game Engine Change Request: Audit Features (Security, Landing, Training, Social)

**Target project:** game client/server at `game.simflightpro.com` (separate repository).
**Status:** API and web app changes are done in this repository. Each section below says whether the game **must** change (otherwise something breaks or a feature never triggers) or **should** change (optional improvement).

All endpoints are on `https://api.simflightpro.com/api`, use the pilot's Bearer access token and the header `X-Requested-With: SimFlightProGame`, like the existing game calls. Enums in requests and responses are **numbers**.

## Summary

| # | Change | Priority | Section |
|---|--------|----------|---------|
| 1 | Send the Bearer token to live traffic; handle `401`/`429` | **Must** | [1](#1-live-traffic-now-requires-auth-and-is-rate-limited) |
| 2 | Measure and send a reliable `landing_rate_fpm` | **Must** | [2](#2-landing-grade-and-landing-bonus) |
| 3 | Treat `409` on mission completion as success | **Must** | [3](#3-mission-completion-is-now-idempotent) |
| 4 | Handle "no selected aircraft" after a marketplace sale | **Must** | [4](#4-marketplace-transfers-can-remove-the-selected-aircraft) |
| 5 | Flight plan status: send the numeric enum | **Must** | [5](#5-flight-plan-status-numeric-enum) |
| 6 | Support the Flight School lessons (approach spawn) | **Must** for lesson 2 | [6](#6-flight-school-training-lessons) |
| 7 | Mechanics for scheduled / challenge / milestone missions | Must before enabling | [7](#7-scheduled-challenge-and-milestone-missions) |
| 8 | Use home base as default spawn | Should | [8](#8-home-base-default-spawn) |
| 9 | Show landing grade, rank-up, achievements, challenges in the HUD | Should | [9](#9-post-landing-summary-hud) |
| 10 | Group flights from organization events | Should | [10](#10-group-flights-organization-events) |
| 11 | Send an end-of-flight reason | Should | [11](#11-end-of-flight-reason-diagnostics) |
| 12 | Never call `POST /flight-stats/purchase-hours` | Must (if used) | [12](#12-purchase-hours-endpoint-is-admin-only) |

---

## 1. Live traffic now requires auth and is rate limited

`GET /api/live-traffic/positions` and `GET /api/live-traffic/airport/:code` were open to anyone and spent the paid Flightradar24 quota. They now:

- **Require** `Authorization: Bearer <access token>` (as `docs/api/LIVE_TRAFFIC_API.md` always documented). Without it: `401 { "error": "Not authenticated" }`.
- Are rate limited to **30 requests per minute per pilot**. Over the limit: `429 { "error": "Too many live traffic requests, please slow down" }` plus `RateLimit-*` headers.
- Cap `limit` at **1000** positions (anything higher is reduced).
- Cache responses on the server: positions for **15 s** (bounds rounded to 2 decimals), airport details for **6 h**.

**Game-side steps**

1. Always attach the pilot token to live-traffic requests.
2. Poll positions no faster than **every 15 s**; polling faster only returns the cached copy and burns the rate limit.
3. On `429`, back off (e.g. wait the `RateLimit-Reset` seconds) and keep the last traffic on screen.
4. On `401`, refresh the token with the normal refresh flow and retry once.
5. Round the requested bounds to 2 decimals yourself to share the server cache with other pilots in the same area.

## 2. Landing grade and landing bonus

Landed flights are now graded and the pilot earns bonus credits once per flight. Grading happens inside the call the game already makes on landing:

`PUT /api/flight-logs/:id` with `{ "status": "landed", "landing_rate_fpm": <value>, ... }`

Response (new fields):

```json
{ "message": "Flight updated", "landing_grade": 1, "landing_bonus_credits": 50 }
```

| `landing_grade` | Name | Touchdown vertical speed (absolute fpm) | Bonus credits |
|---|---|---|---|
| `0` | None | not landed, missing or implausible value | 0 |
| `1` | Butter | 10 – 60 | 50 |
| `2` | Smooth | 61 – 180 | 25 |
| `3` | Firm | 181 – 400 | 10 |
| `4` | Hard | 401 – 2000 | 0 |

Values below **10 fpm** or above **2000 fpm** are treated as sensor errors (grade `0`, no bonus, excluded from the landing leaderboard and the "smooth landings" weekly challenge). The bonus is paid only once per flight, even if `PUT` is repeated.

**Production data today (2,773 flights):** 91 landed flights have exactly `0`, 76 are below 5 fpm (many exactly `1.00`) and 9 exceed 2000 fpm. Those readings get no grade.

**Game-side steps (must)**

1. Capture the vertical speed at the **first main-gear contact** (not after the bounce, not averaged over the rollout). Store it in fpm.
2. Sign does not matter (the API uses the absolute value), but never send `0` for "unknown": omit the field instead.
3. Clamp obviously wrong values on the client (e.g. ignore samples where the aircraft is already on ground since >1 s).
4. Send it in the same `PUT` that sets `status: "landed"` (the bonus is evaluated there).
5. **If the game server writes `flight_logs` directly to MySQL instead of calling the API**, the grade/bonus, onboarding step and arrival-airport resolution never run. Switch the landing write to `PUT /api/flight-logs/:id`.

## 3. Mission completion is now idempotent

`PUT /api/user-missions/:id/complete` used to pay twice when two requests arrived together (double click, retry on timeout). Now only the first call completes the mission; any concurrent or repeated call returns:

`409 { "error": "Mission already completed" }`

**Game-side steps (must):** treat `409` from this endpoint as success (show the normal "mission complete" screen, do not show an error, do not retry). Retrying after a network timeout is now safe.

The success response also includes `points_multiplier` (see [9](#9-post-landing-summary-hud)).

## 4. Marketplace transfers can remove the selected aircraft

Player-to-player listings now **transfer** ownership: when someone buys an aircraft or airport a pilot listed, the seller's `user_aircrafts` / `user_airports` row is deleted. If the seller had that aircraft selected (`is_selected = 1`), they end up with no selected aircraft.

**Game-side steps (must):** when loading the pilot's aircraft list (`GET /api/user-aircrafts` or the HUD list), if no row has `is_selected = 1`, fall back to the default trainer (`code = "c172"`) or the first owned aircraft, exactly as `docs/RUNWAY_API.md` suggests (`aircraftData.find(a => a.is_selected === 1) || aircraftData[0]`). Do not crash or block the spawn.

## 5. Flight plan status (numeric enum)

`PATCH /api/flight-plans/:id/status` and `PUT /api/flight-plans/:id` accept the numeric status enum documented in `docs/api/GAME_HUD_LIST_APIS.md`:

| Code | Status |
|---|---|
| `0` | planned |
| `1` | in_progress |
| `2` | completed |
| `3` | cancelled |

Example: `PATCH /api/flight-plans/42/status` with `{ "status": 2 }`. Any other value returns `400`. Legacy string values are still accepted for older clients but should not be used.

**Game-side steps (must):** send the numeric codes. Also note:

- Rewards for a plan are paid **once**. Setting `completed` again (even after going back to `planned`) returns `200` with `points_awarded: 0`.
- Send `completed` only after the pilot actually lands at the plan's arrival airport.

## 6. Flight School (training lessons)

Data from production: 31% of flights crash after ~1.9 minutes on average and only 12% land. A three-lesson Flight School now appears at the top of the website's Missions page. Lessons are normal missions with a new numeric field `training_order` (`1`, `2`, `3`); they are seeded by migration `api/migrations/missions_flight_school_create.js`.

`GET /api/missions/flight-school` (public):

```json
{ "data": [
  { "id": 101, "title": "Flight School 1: Takeoff and Short Hop", "type": "route", "difficulty": "beginner", "reward_points": 120, "estimated_duration_min": 20, "distance_nm": 15.9, "training_order": 1 },
  { "id": 102, "title": "Flight School 2: Landing Practice on Final", "type": "discovery", "...": "..." },
  { "id": 103, "title": "Flight School 3: Round Trip with a Smooth Landing", "type": "route", "...": "..." }
] }
```

Mission ids differ per environment; always read them from the API. `GET /api/missions/:id` and the HUD lists also return `training_order` (`null` for normal missions).

| Lesson | Type | Setup | What the game must support |
|---|---|---|---|
| 1 | `route` | KBUF (longest runway) → KIAG, Cessna 172 (`required_aircraft_id` = c172) | Normal route mission: spawn on the departure runway, complete on landing at KIAG. Nothing new. |
| 2 | `discovery` | Spawn **4 nm out on final for KBUF runway 23**, ~2,000 ft MSL (3° glideslope). Waypoints: `2 nm final RWY 23` (~1,360 ft) then `Threshold RWY 23` (~770 ft) | See below. |
| 3 | `route` | KIAG → KBUF | Normal route mission. |

**Lesson 2 needs these game behaviours (must):**

1. **Spawn heading:** discovery missions have no heading column. Point the aircraft at the first waypoint (bearing spawn → waypoint 1, ≈ 224° true for runway 23).
2. **Approach configuration:** spawn airborne at ~65 kt, flaps for approach, gear down (fixed gear on the 172), throttle at approach power, trimmed for descent. Spawning at cruise configuration makes the lesson unflyable.
3. **Completion:** complete the mission (`PUT /api/user-missions/:id/complete`) only after the aircraft **lands** on or near the threshold waypoint, not when it merely flies over it. Then send the landing `PUT /api/flight-logs/:id` with `landing_rate_fpm` so the lesson shows a landing grade.

**Should:** for `training_order` missions show short on-screen coaching (target speed, "flare now" at ~20 ft, vertical speed readout) and a retry button after a crash instead of returning to the menu.

## 7. Scheduled, challenge and milestone missions

Eight missions exist in the database (`scheduled` ×2, `challenge` ×4, `milestone` ×2) but are disabled (`is_enabled = 0`) because the game lacks the mechanics. The website now shows them under "Coming soon" (`GET /api/missions/coming-soon`).

Mechanics needed before an admin enables them:

| Type | Needed in the game |
|---|---|
| `scheduled` | Departure time window (mission `scheduled_departure_at` style data from the plan), on-time detection, IFR instruments (heading/altitude hold, basic nav) |
| `challenge` | Skill scenarios (engine-out / power-off landing, short field, crosswind), engine failure trigger, success criteria per challenge |
| `milestone` | Long-term goals across several flights (e.g. total distance), progress reporting |

When a type is ready, an admin enables its missions with the existing `PUT /api/missions/:id` `{ "is_enabled": 1 }`. No other API change is required.

## 8. Home base default spawn

Pilots can now mark one **owned** airport as home base and any owned airport as favorite (website airport page).

- `GET /api/airports/acquired` already returns `is_home_base` and `is_favorite` (`0`/`1`) per owned airport.
- New: `PATCH /api/airports/acquired/:airportId` with `{ "is_home_base": 1 }` and/or `{ "is_favorite": 1 }` (only `0`/`1`; only owned airports; setting a home base clears the previous one). Response: `{ "airport_id": 22697, "is_favorite": 0, "is_home_base": 1 }`.

**Game-side steps (should):**

1. For a free flight with no mission/plan selected, spawn at the airport with `is_home_base === 1` (longest open runway), falling back to the current default.
2. Optionally add a "Set as home base" action in the in-game airport menu calling the `PATCH` above.

## 9. Post-landing summary (HUD)

Everything below works without game changes (the website shows it), but showing it in the game closes the loop right after landing.

1. **Landing grade and bonus:** read `landing_grade` and `landing_bonus_credits` from the landing `PUT` response (section 2) and show e.g. "Butter landing · +50 credits".
2. **Rank up and achievements:** `GET /api/flight-stats` now evaluates achievements and rank on every call. New fields:
   - `rank_up`: `null` or `{ "previous_rank_code", "previous_rank_name", "new_rank_code", "new_rank_name" }` (returned **once**, the first time the new rank is seen).
   - `newly_unlocked_achievements`: array of `{ id, code, title, description, icon, category }` unlocked by this call.
   - `points_multiplier`: `1` normally, `1.25` with a pilot license (mission and flight-plan points are already multiplied server-side).
   Call it once after the landing `PUT` and show a celebration for `rank_up` and a toast per achievement. A matching in-app notification is also created (`rank_up`, `achievement_unlocked`).
3. **Weekly challenges:** `GET /api/flight-stats/weekly-challenges` returns `{ week: { key, start, end }, challenges: [{ code, metric, target, progress, reward_credits, completed, claimed }] }`. `metric` enum: `0` landings, `1` flight minutes, `2` distinct arrival airports, `3` smooth landings (10–180 fpm), `4` missions completed. Claim with `POST /api/flight-stats/weekly-challenges/:code/claim` → `{ claimed, reason_code }` where `reason_code` `0` claimed, `1` already claimed, `2` not completed, `3` not found. Progress depends on accurate `status`, `flight_duration_min`, `arrival_airport_id` (resolved by the API from the last `route_data` point when omitted) and `landing_rate_fpm`.

## 10. Group flights (organization events)

Virtual-airline managers can schedule group flights on the website (organization dashboard → "Group flights"). Members RSVP and get a "Fly mission" button that opens the game with the existing launch flow (`openGame({ missionId })` → launch code → `?missionId=<id>`).

Endpoints (members of the organization only):

- `GET /api/organization-flights/:orgId/events` → `{ can_manage, data: [{ id, title, description, mission_id, mission_title, starts_at, rsvp_count, is_going }] }`
- `POST|DELETE /api/organization-flights/:orgId/events/:eventId/rsvp`
- `GET /api/organization-flights/:orgId/stats` → organization totals and member leaderboard.

**Game-side steps (should):**

1. Nothing is required for the "Fly mission" button; it uses the current launch parameters.
2. Optional: when a pilot joins with a `missionId` that belongs to an event starting within ±30 min, place members in the same multiplayer session/area and show the other members' callsigns, so the group actually flies together.

## 11. End-of-flight reason (diagnostics)

57% of flights end as `cancelled` after ~25 minutes on average. The API cannot tell whether the pilot quit, the tab closed, the connection dropped or the session timed out.

**Game-side steps (should):** when closing a flight that did not land or crash, include a reason in the final `PUT /api/flight-logs/:id`:

```json
{ "status": "cancelled", "end_reason": 1 }
```

Suggested numeric enum: `0` unknown, `1` pilot quit, `2` tab/window closed, `3` connection lost, `4` session timeout, `5` out of flight hours. The API ignores the field today; adding a column for it is a small follow-up once the game sends it. Also apply the stat-flush fixes already tracked for the game server in `docs/BUGS_AND_ENHANCEMENTS.md` (BUG-1/BUG-2, ENH-1), which explain part of the lost sessions.

## 12. Purchase-hours endpoint is admin only

`POST /api/flight-stats/purchase-hours` credited any amount of hours to any signed-in user without payment verification. It is now **admin only** (`403` otherwise). Paid hours are credited exclusively by the Stripe webhook.

**Game-side steps (must, if used):** if the game ever called this endpoint, remove the call. Send pilots to the website checkout (`https://simflightpro.com/flight-time`) instead.

---

## Related documents

- `docs/GAME_INTEGRATION.md` – base flight/mission flow
- `docs/api/GAME_HUD_LIST_APIS.md` – HUD lists and status enums
- `docs/api/LIVE_TRAFFIC_API.md` – live traffic contract
- `docs/RUNWAY_API.md` – spawn and selected aircraft
- `docs/BUGS_AND_ENHANCEMENTS.md` – game server bugs (`server.js`)
