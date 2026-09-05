# Game Engine Change Request: Onboarding Events

**Target project:** game client/server at `game.simflightpro.com` (separate repository).
**Status:** Web side complete and working with the current game; the items below are optional polish.

## Context

New pilots see an onboarding checklist on `https://simflightpro.com/dashboard` with three rewarded steps:

| Step | Reward | Detected by |
|---|---|---|
| `first_flight_plan` | 0.25 h | `POST /api/flight-plans` (web app) |
| `first_flight` | 0.5 h | `PUT /api/flight-logs/:id` with `status: "landed"` — **the call the game already makes on landing** |
| `first_mission` | 0.5 h | `PUT /api/user-missions/:id/complete` (game or web) |
| `trail_complete` (bonus) | 1 h | Automatically when the three steps above are done |

Rewards are credited to `user_flight_stats.purchased_flight_hours`, so a pilot's available hours increase immediately after landing their first flight. Every reward also creates an in-app notification (`onboarding_reward`).

## Required game changes

None. The API derives `first_flight` from the landing update the game already sends. Make sure the landing `PUT` keeps sending `status: "landed"` (a flight left in `in_flight`/`departed` never counts).

## Optional enhancements

1. **Refresh the hours HUD after landing.** After the landing `PUT` succeeds, re-fetch `GET /api/flight-stats` (or whatever the HUD uses) so the newly credited onboarding hours show up without a page reload.
2. **Post-landing hint for first-time pilots.** The response of `PUT /api/flight-logs/:id` is unchanged (`{ "message": "Flight updated" }`); to know whether this landing completed a step the game can call `GET /api/onboarding/me` (Bearer token) and look for `steps[].code === "first_flight" && completed && completed_at` within the last minute, then show a toast such as "First flight logged — +0.5 h credited" with a link to `https://simflightpro.com/dashboard`.
3. **Mission completion.** If the game completes missions itself via `PUT /api/user-missions/:id/complete`, nothing else is needed; the same endpoint triggers `first_mission`.

## Contract reference

`GET https://api.simflightpro.com/api/onboarding/me` (Bearer access token) → see `docs/api/ONBOARDING_API.md` for the payload.
