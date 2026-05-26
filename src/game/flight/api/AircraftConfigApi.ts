import { AircraftConfig, DEFAULT_AIRCRAFT_CONFIG } from '../types/AircraftConfig.js';

const CACHED_SELECTED_AIRCRAFT_KEY = 'cached_selected_aircraft_v1';

function normalizeAircraftConfig(cfg: AircraftConfig): AircraftConfig {
    if (typeof cfg.flap_steps_json === 'string') {
        try {
            cfg.flap_steps_json = JSON.parse(cfg.flap_steps_json as unknown as string);
        } catch (err) {
            console.warn('[Aircraft] Failed to parse flap_steps_json from cached config:', err);
            cfg.flap_steps_json = [];
        }
    }
    if (!Array.isArray(cfg.surfaces)) cfg.surfaces = [];
    return cfg;
}

function cacheSelectedAircraftConfig(cfg: AircraftConfig): void {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(CACHED_SELECTED_AIRCRAFT_KEY, JSON.stringify(cfg));
    } catch (err) {
        console.warn('[Aircraft] Failed to cache selected aircraft config:', err);
    }
}

export function getCachedSelectedAircraftConfig(): AircraftConfig | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(CACHED_SELECTED_AIRCRAFT_KEY);
        if (!raw) return null;
        const cfg = JSON.parse(raw) as AircraftConfig;
        if (!cfg || typeof cfg !== 'object' || !cfg.model_file || !cfg.code) {
            console.warn('[Aircraft] Cached selected aircraft config is invalid, ignoring.');
            return null;
        }
        return normalizeAircraftConfig(cfg);
    } catch (err) {
        console.warn('[Aircraft] Failed to read cached selected aircraft config:', err);
        return null;
    }
}

export async function fetchAircraftConfig(aircraftId: number): Promise<AircraftConfig> {
    try {
        const token = localStorage.getItem('auth_token') || '';
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resp = await fetch(`/api/aircrafts/${aircraftId}`, { headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        console.debug('[Aircraft] fetchAircraftConfig raw response:', JSON.stringify(data));
        if (typeof data.flap_steps_json === 'string') {
            data.flap_steps_json = JSON.parse(data.flap_steps_json);
        }
        if (!Array.isArray(data.surfaces)) data.surfaces = [];
        return data as AircraftConfig;
    } catch (err) {
        console.error('[Aircraft] Failed to fetch config, using default:', err);
        return DEFAULT_AIRCRAFT_CONFIG;
    }
}

export async function fetchSelectedAircraftConfig(): Promise<AircraftConfig> {
    try {
        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            console.warn('[Aircraft] No auth token, using DEFAULT_AIRCRAFT_CONFIG (id=0). Flight logs will NOT be saved.');
            return DEFAULT_AIRCRAFT_CONFIG;
        }
        const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
        const resp = await fetch('/api/user-aircrafts', { headers });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        console.debug('[Aircraft] fetchSelectedAircraftConfig raw response:', JSON.stringify(data));
        const list: any[] = Array.isArray(data.data) ? data.data : [];
        const selected = list.find((ua: any) => ua.is_selected === 1) || list.find((ua: any) => ua.aircraft);
        if (selected?.aircraft) {
            const cfg = selected.aircraft as AircraftConfig;
            console.debug('[Aircraft] selected aircraft config:', JSON.stringify(cfg));
            console.log(`[Aircraft] Using ${selected.is_selected === 1 ? 'SELECTED' : 'FALLBACK (first owned)'} aircraft: id=${cfg.id} code=${cfg.code} name=${cfg.name}`);
            normalizeAircraftConfig(cfg);
            cacheSelectedAircraftConfig(cfg);
            return cfg;
        }
        console.warn('[Aircraft] No owned aircraft found for user, using DEFAULT_AIRCRAFT_CONFIG (id=0). Flight logs will NOT be saved.');
        return DEFAULT_AIRCRAFT_CONFIG;
    } catch (err) {
        console.error('[Aircraft] Failed to fetch selected aircraft, using default:', err);
        return DEFAULT_AIRCRAFT_CONFIG;
    }
}
