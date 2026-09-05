# Game Engine Change Request: `POST /api/user/batch-info` Now Requires Authentication

**Target project:** game server/client at `game.simflightpro.com`.
**Status:** Applied on the API. Game must send the player's JWT.

## What changed

`POST https://api.simflightpro.com/api/user/batch-info` previously accepted anonymous requests and returned `{ players: [{ userId, username, avatarUrl }] }` for any list of IDs. It now:

1. Requires `Authorization: Bearer <JWT>` (the same token the game already receives on launch). Missing/invalid token -> `401 { "error": "Authentication required" }`.
2. Validates the body with zod: `userIds` must be an array of 1..100 positive integers. Invalid -> `400 { "error": "Invalid request data", "issues": [...] }`.

`GET /api/user/:id/avatar-image` stays **public** (it is consumed via `<img src>` which cannot send headers) and returns only the avatar bitmap.

## Required change

Where the game calls `batch-info` (player list / multiplayer name tags), add the header:

```js
fetch(`${API_URL}/api/user/batch-info`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest',
  },
  body: JSON.stringify({ userIds }),
});
```

`X-Requested-With` is optional when a valid Bearer token is present (CSRF check is bypassed for token-authenticated requests) but recommended.
