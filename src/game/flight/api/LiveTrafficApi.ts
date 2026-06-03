import type { LiveTrafficFlight } from '../types/LiveTrafficFlight.js';

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

function isValidBounds(b: LiveTrafficBounds): boolean {
    return Number.isFinite(b.north) && Number.isFinite(b.south)
        && Number.isFinite(b.west)  && Number.isFinite(b.east)
        && b.north >= -90 && b.north <= 90
        && b.south >= -90 && b.south <= 90
        && b.west  >= -180 && b.west  <= 180
        && b.east  >= -180 && b.east  <= 180
        && b.north > b.south;
}

export async function fetchLiveTrafficPositions(
    bounds: LiveTrafficBounds,
    opts: LiveTrafficFetchOptions = {},
): Promise<LiveTrafficFlight[]> {
    if (!isValidBounds(bounds)) {
        console.warn('[LiveTraffic] fetchLiveTrafficPositions: invalid bounds', bounds);
        return [];
    }
    try {
        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            console.warn('[LiveTraffic] No auth token; skipping live traffic fetch');
            return [];
        }
        const boundsStr = `${bounds.north.toFixed(3)},${bounds.south.toFixed(3)},${bounds.west.toFixed(3)},${bounds.east.toFixed(3)}`;
        const params = new URLSearchParams();
        params.set('bounds', boundsStr);
        if (opts.categories) params.set('categories', opts.categories);
        if (Number.isFinite(opts.limit) && (opts.limit as number) > 0) params.set('limit', String(Math.floor(opts.limit as number)));

        const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
        const resp = await fetch(`/api/live-traffic/positions?${params.toString()}`, { headers, signal: opts.signal });
        if (!resp.ok) {
            console.warn(`[LiveTraffic] HTTP ${resp.status} fetching positions`);
            return [];
        }
        const json = await resp.json();
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
        return flights;
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
            console.debug('[LiveTraffic] fetchLiveTrafficPositions aborted');
            return [];
        }
        console.warn('[LiveTraffic] fetchLiveTrafficPositions failed:', err);
        return [];
    }
}
