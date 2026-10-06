import type { LiveTrafficFlight } from '../types/LiveTrafficFlight.js';
import { LIVE_TRAFFIC_FETCH_TIMEOUT_MS, LIVE_TRAFFIC_BOUNDS_DECIMALS } from '../constants/liveTrafficConstants.js';
import { fetchJsonWithTimeout, FetchTimeoutError } from './fetchWithTimeout.js';

export interface LiveTrafficBounds {
    north: number;
    south: number;
    west: number;
    east: number;
}

export interface LiveTrafficFetchOptions {
    categories?: string;
    limit?: number;
    signal?: AbortSignal;
}

export interface LiveTrafficFetchResult {
    flights: LiveTrafficFlight[] | null;
    status: number;
    retryAfterMs: number | null;
}

export const LIVE_TRAFFIC_STATUS_OK = 200;
export const LIVE_TRAFFIC_STATUS_UNAUTHORIZED = 401;
export const LIVE_TRAFFIC_STATUS_RATE_LIMITED = 429;
const LIVE_TRAFFIC_STATUS_NETWORK_ERROR = 0;
const EPOCH_SECONDS_THRESHOLD = 1_000_000_000;
const MS_PER_SECOND = 1000;

function isValidBounds(b: LiveTrafficBounds): boolean {
    return Number.isFinite(b.north) && Number.isFinite(b.south)
        && Number.isFinite(b.west)  && Number.isFinite(b.east)
        && b.north >= -90 && b.north <= 90
        && b.south >= -90 && b.south <= 90
        && b.west  >= -180 && b.west  <= 180
        && b.east  >= -180 && b.east  <= 180
        && b.north > b.south;
}

export function parseRetryAfterMs(headers: Headers | null): number | null {
    if (!headers) return null;
    const reset = Number(headers.get('ratelimit-reset'));
    if (Number.isFinite(reset) && reset > 0) {
        if (reset > EPOCH_SECONDS_THRESHOLD) return Math.max(0, reset * MS_PER_SECOND - Date.now());
        return reset * MS_PER_SECOND;
    }
    const retryAfter = headers.get('retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) return seconds * MS_PER_SECOND;
        const dateMs = Date.parse(retryAfter);
        if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
    }
    return null;
}

export async function fetchLiveTrafficPositions(
    bounds: LiveTrafficBounds,
    opts: LiveTrafficFetchOptions = {},
): Promise<LiveTrafficFetchResult> {
    if (!isValidBounds(bounds)) {
        console.warn('[LiveTraffic] fetchLiveTrafficPositions: invalid bounds', bounds);
        return { flights: [], status: LIVE_TRAFFIC_STATUS_OK, retryAfterMs: null };
    }
    try {
        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            console.warn('[LiveTraffic] No auth token; skipping live traffic fetch');
            return { flights: [], status: LIVE_TRAFFIC_STATUS_OK, retryAfterMs: null };
        }
        const decimals = LIVE_TRAFFIC_BOUNDS_DECIMALS;
        const boundsStr = `${bounds.north.toFixed(decimals)},${bounds.south.toFixed(decimals)},${bounds.west.toFixed(decimals)},${bounds.east.toFixed(decimals)}`;
        const params = new URLSearchParams();
        params.set('bounds', boundsStr);
        if (opts.categories) params.set('categories', opts.categories);
        if (Number.isFinite(opts.limit) && (opts.limit as number) > 0) params.set('limit', String(Math.floor(opts.limit as number)));

        const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
        const resp = await fetchJsonWithTimeout(
            `/api/live-traffic/positions?${params.toString()}`,
            { headers },
            LIVE_TRAFFIC_FETCH_TIMEOUT_MS,
            opts.signal,
        );
        if (!resp.ok) {
            const retryAfterMs = parseRetryAfterMs(resp.headers);
            console.warn(`[LiveTraffic] HTTP ${resp.status} fetching positions${retryAfterMs != null ? ` (retry after ${Math.round(retryAfterMs / MS_PER_SECOND)}s)` : ''}`);
            return { flights: null, status: resp.status, retryAfterMs };
        }
        const json = resp.data;
        const data = Array.isArray(json?.data) ? json.data : [];
        const flights: LiveTrafficFlight[] = [];
        for (const item of data) {
            if (!item || typeof item.fr24_id !== 'string') continue;
            if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
            flights.push({
                fr24_id: item.fr24_id,
                hex: typeof item.hex === 'string' ? item.hex : undefined,
                callsign: typeof item.callsign === 'string' ? item.callsign : '',
                lat: Number(item.lat),
                lon: Number(item.lon),
                track: Number.isFinite(item.track) ? Number(item.track) : 0,
                alt: Number.isFinite(item.alt) ? Number(item.alt) : 0,
                gspeed: Number.isFinite(item.gspeed) ? Number(item.gspeed) : 0,
                vspeed: Number.isFinite(item.vspeed) ? Number(item.vspeed) : 0,
                squawk: Number.isFinite(item.squawk) ? Number(item.squawk) : undefined,
                timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
                source: typeof item.source === 'string' ? item.source : undefined,
            });
        }
        console.debug(`[LiveTraffic] Fetched ${flights.length} flights (bounds=${boundsStr})`);
        return { flights, status: resp.status, retryAfterMs: null };
    } catch (err) {
        if (err instanceof FetchTimeoutError) {
            console.warn(`[LiveTraffic] ${err.message}`);
            return { flights: null, status: LIVE_TRAFFIC_STATUS_NETWORK_ERROR, retryAfterMs: null };
        }
        if (err instanceof DOMException && err.name === 'AbortError') {
            console.debug('[LiveTraffic] fetchLiveTrafficPositions aborted');
            return { flights: [], status: LIVE_TRAFFIC_STATUS_OK, retryAfterMs: null };
        }
        console.warn('[LiveTraffic] fetchLiveTrafficPositions failed:', err);
        return { flights: null, status: LIVE_TRAFFIC_STATUS_NETWORK_ERROR, retryAfterMs: null };
    }
}
