# Live Traffic API

## Overview

The Live Traffic API exposes real-world aviation data to the SimFlightPro game client by proxying the [Flightradar24 (FR24) API](https://fr24api.flightradar24.com/docs). It returns real-time aircraft positions inside a geographic bounding box and detailed airport information by IATA/ICAO code.

**Base URL:** `/api/live-traffic`
**Auth:** Bearer JWT token via `Authorization: Bearer <token>` header (SimFlightPro user token; the FR24 key is held server-side).
**Upstream provider:** `https://fr24api.flightradar24.com` (Accept-Version: `v1`).

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/live-traffic/positions` | Real-time flight positions inside a bounding box |
| GET | `/api/live-traffic/airport/:code` | Detailed airport information by IATA or ICAO code |

---

## 1. Live Flight Positions

`GET /api/live-traffic/positions`

Returns real-time aircraft positions (latitude, longitude, altitude, speed, heading, etc.) for all flights inside the requested bounding box.

### Query Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `bounds` | string | yes | Bounding box: `north,south,west,east` (comma-separated decimal degrees). Up to 3 decimal places are processed by the provider. |
| `limit` | integer | no | Max results returned. Provider max: `30000`. |
| `categories` | string | no | Comma-separated flight category codes: `P` passenger, `C` cargo, `M` military/government, `J` business jets, `T` general aviation, `H` helicopters, `B` lighter-than-air, `G` gliders, `D` drones, `V` ground vehicles, `O` other, `N` non-categorized. |
| `altitude_ranges` | string | no | Comma-separated altitude bands in feet, e.g. `0-3000,5000-7000`. |
| `aircraft` | string | no | Aircraft ICAO type codes, e.g. `B38M,B738` (max 15). |
| `airports` | string | no | Filter by IATA/ICAO codes or ISO 3166-1 alpha-2 country codes; optionally prefixed by direction `inbound:`, `outbound:`, `both:`. Max 15. |
| `routes` | string | no | Routes between airports/countries, e.g. `SE-US,ESSA-JFK` (max 15). |
| `flights` | string | no | Flight numbers, comma-separated (max 15). |
| `callsigns` | string | no | Flight callsigns, comma-separated (max 15). |
| `registrations` | string | no | Aircraft registrations, comma-separated (max 15). |
| `painted_as` | string | no | Airline livery ICAO codes (max 15). |
| `operating_as` | string | no | Operating airline ICAO codes (max 15). |
| `squawks` | string | no | Squawk codes (hex). |
| `data_sources` | string | no | `ADSB`, `MLAT`, `UAT`, `ESTIMATED` (comma-separated). |
| `airspaces` | string | no | FIR codes in lower/upper airspace. |
| `gspeed` | string | no | Ground speed in knots; single value or range, e.g. `80` or `120-140`. |

### Validation

- `bounds` must be exactly 4 comma-separated finite numbers.
- Latitude values (`north`, `south`) must be in `[-90, 90]`.
- Longitude values (`west`, `east`) must be in `[-180, 180]`.
- `north` must be greater than `south`.

### Example Request

```bash
curl --location \
  'https://api.simflightpro.com/api/live-traffic/positions?bounds=50.682,46.218,14.422,22.243&categories=P,C&limit=200' \
  --header 'Authorization: Bearer <user_jwt>'
```

### Example Response (200)

```json
{
  "data": [
    {
      "fr24_id": "321a0cc3",
      "hex": "394C19",
      "callsign": "AFR1463",
      "lat": -0.08806,
      "lon": -168.07118,
      "track": 219,
      "alt": 38000,
      "gspeed": 500,
      "vspeed": 340,
      "squawk": 6135,
      "timestamp": "2023-11-08T10:10:00Z",
      "source": "ADSB"
    }
  ]
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `fr24_id` | string | FR24 unique flight identifier |
| `hex` | string | Aircraft 24-bit ICAO transponder hex code |
| `callsign` | string | Flight callsign |
| `lat` | number | Latitude in decimal degrees |
| `lon` | number | Longitude in decimal degrees |
| `track` | number | Heading over ground in degrees (0-359) |
| `alt` | number | Barometric altitude in feet (AMSL, 1013.25 hPa) |
| `gspeed` | number | Ground speed in knots |
| `vspeed` | number | Vertical speed in feet per minute |
| `squawk` | number | Transponder squawk code |
| `timestamp` | string | Position timestamp (ISO 8601, UTC) |
| `source` | string | Data source: `ADSB`, `MLAT`, `UAT`, `ESTIMATED` |

### Error Responses

| Status | When | Body |
|---|---|---|
| 400 | Invalid or missing `bounds` | `{ "error": "bounds parameter is required" }` |
| 400 | Upstream validation error | `{ "error": "<message>", "details": "<details>" }` |
| 500 | `FR24_API_KEY` not configured on server | `{ "error": "Live traffic provider is not configured" }` |
| 502 | Provider auth/credit failure or other upstream error | `{ "error": "Live traffic provider returned an error" }` |

---

## 2. Airport Details

`GET /api/live-traffic/airport/:code`

Returns detailed airport information (location, elevation, timezone, country, runways) for the given IATA or ICAO code.

### Path Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `code` | string | yes | Airport IATA (3 letters) or ICAO (4 letters) code. Case-insensitive. |

### Validation

- `code` length must be 3 or 4.
- Only letters `A-Z` and digits `0-9` are accepted.

### Example Request

```bash
curl --location \
  'https://api.simflightpro.com/api/live-traffic/airport/ESSA' \
  --header 'Authorization: Bearer <user_jwt>'
```

### Example Response (200)

```json
{
  "name": "Stockholm Arlanda Airport",
  "iata": "ARN",
  "icao": "ESSA",
  "lon": 17.939816,
  "lat": 59.653545,
  "elevation": 137,
  "country": { "code": "SE", "name": "SWEDEN" },
  "city": "Stockholm",
  "state": null,
  "timezone": { "name": "Europe/Stockholm", "offset": 7200 },
  "runways": [
    {
      "designator": "01L",
      "heading": 4,
      "length": 10830,
      "width": 148,
      "elevation": 99,
      "thr_coordinates": [59.637252777777775, 17.91322222222222],
      "surface": { "type": "ASPHH", "description": "Asphalt" }
    }
  ]
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `name` | string | Airport name |
| `iata` | string | IATA code (3 letters) |
| `icao` | string | ICAO code (4 letters) |
| `lat` | number | Latitude in decimal degrees |
| `lon` | number | Longitude in decimal degrees |
| `elevation` | number | Field elevation in feet |
| `country.code` | string | ISO 3166-1 alpha-2 country code |
| `country.name` | string | Country name |
| `city` | string | City name |
| `state` | string\|null | State / region |
| `timezone.name` | string | IANA timezone name |
| `timezone.offset` | number | UTC offset in seconds |
| `runways[].designator` | string | Runway designator (e.g. `01L`) |
| `runways[].heading` | number | Magnetic heading in degrees |
| `runways[].length` | number | Length in feet |
| `runways[].width` | number | Width in feet |
| `runways[].elevation` | number | Threshold elevation in feet |
| `runways[].thr_coordinates` | number[] | Threshold `[lat, lon]` |
| `runways[].surface.type` | string | Surface code (e.g. `ASPHH`) |
| `runways[].surface.description` | string | Human-readable surface description |

### Error Responses

| Status | When | Body |
|---|---|---|
| 400 | Missing / malformed `code` | `{ "error": "Airport code must be 3-4 characters (IATA or ICAO)" }` |
| 404 | Airport not found by provider | `{ "error": "Airport not found: <code>" }` |
| 500 | `FR24_API_KEY` not configured on server | `{ "error": "Live traffic provider is not configured" }` |
| 502 | Provider auth/credit failure or other upstream error | `{ "error": "Live traffic provider returned an error" }` |

---

## Game Integration

### Calling from the Game Client

The game should compute a bounding box around the player's current position and request live traffic at a sensible interval (e.g. every 5-10 seconds, depending on FR24 credit usage). Example using the player coordinates:

```js
async function fetchLiveTraffic(playerLat, playerLon, rangeDeg = 1.0) {
  const north = playerLat + rangeDeg;
  const south = playerLat - rangeDeg;
  const west = playerLon - rangeDeg;
  const east = playerLon + rangeDeg;
  const bounds = `${north.toFixed(3)},${south.toFixed(3)},${west.toFixed(3)},${east.toFixed(3)}`;

  const res = await fetch(
    `https://api.simflightpro.com/api/live-traffic/positions?bounds=${bounds}&categories=P,C,J&limit=300`,
    { headers: { Authorization: `Bearer ${userJwt}` } }
  );
  if (!res.ok) throw new Error(`Live traffic request failed: ${res.status}`);
  const { data } = await res.json();
  return data;
}
```

### Fetching Airport Details

```js
async function fetchAirportDetails(icaoOrIata) {
  const res = await fetch(
    `https://api.simflightpro.com/api/live-traffic/airport/${encodeURIComponent(icaoOrIata)}`,
    { headers: { Authorization: `Bearer ${userJwt}` } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Airport request failed: ${res.status}`);
  return res.json();
}
```

### Notes

- The SimFlightPro API never exposes the FR24 token to clients; all requests are proxied server-side using `FR24_API_KEY` from the API environment.
- Each call consumes FR24 credits. Avoid polling at high frequency and use the smallest bounding box that fits the player's view.
- Coordinates returned by the provider follow WGS-84.
- Altitudes are barometric pressure altitudes referenced to standard atmospheric pressure (1013.25 hPa), not the player's local QNH.
