import { resolveHudImageUrl, HUD_IMAGE_PLACEHOLDER, hudImgOnError } from '../game/api/hudImageUrl.js';
import { UiPreferences, UI_PREF_STORAGE_KEY, LANGUAGE_EN, LANGUAGE_PT } from '../game/UiPreferences.js';

export const PREFLIGHT_AIRCRAFT_KEY = 'preflight_aircraft_id';
export const PREFLIGHT_SPAWN_KEY = 'preflight_spawn';

export type PreflightSpawnConfig = {
    airportId: number;
    icao: string;
    runwayId: number;
    end: 'le' | 'he';
    lat: number;
    lon: number;
    hdg: number;
    elevationFt: number;
    simTimeIso: string;
};

export const DEFAULT_SBGR_SPAWN: PreflightSpawnConfig = {
    airportId: 0,
    icao: 'SBGR',
    runwayId: 0,
    end: 'le',
    lat: -23.4341,
    lon: -46.4825,
    hdg: 74,
    elevationFt: 2459,
    simTimeIso: new Date().toISOString(),
};

type Lang = 'pt' | 'en';

const PT_COUNTRY_CODES = new Set(['BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL', 'GQ']);

const I18N: Record<Lang, Record<string, string>> = {
    pt: {
        'tab.aircraft': 'Aeronave',
        'tab.airport': 'Aeroporto',
        'tab.missions': 'Missões',
        'tab.plans': 'Plano de voo',
        'airport.airport': 'Aeroporto',
        'airport.runway': 'Pista',
        'airport.end': 'Extremidade',
        'airport.datetime': 'Data e hora do voo',
        'airport.searchPlaceholder': 'ICAO ou nome (ex. SBGR)',
        'cta.flyNow': 'VOAR AGORA',
        'cta.startFly': 'INICIAR E VOAR',
        'cta.locked': 'BLOQUEADO',
        'cta.preparing': 'PREPARANDO...',
        'common.back': '← Voltar',
        'common.loading': 'Carregando...',
        'common.connError': 'Erro de conexão',
        'aircraft.none': 'Nenhuma aeronave',
        'aircraft.loadFail': 'Falha ao carregar aeronaves',
        'aircraft.unavailable': 'Indisponível',
        'aircraft.owned': 'Sua aeronave',
        'aircraft.pro': 'PRO disponível',
        'missions.none': 'Nenhuma missão',
        'missions.loadFail': 'Falha ao carregar missões',
        'plans.none': 'Nenhum plano de voo',
        'plans.loadFail': 'Falha ao carregar planos',
        'badge.pro': 'PRO',
        'badge.done': 'Concluída',
        'badge.locked': 'Bloqueado',
        'badge.inProgress': 'Em progresso',
        'detail.distance': 'Distância',
        'detail.duration': 'Duração',
        'detail.reward': 'Recompensa',
        'detail.departure': 'Partida',
        'detail.arrival': 'Chegada',
        'detail.runway': 'Pista',
        'detail.scheduled': 'Partida programada',
        'detail.notes': 'Notas',
        'diff.beginner': 'Iniciante',
        'diff.easy': 'Fácil',
        'diff.intermediate': 'Intermediário',
        'diff.advanced': 'Avançado',
        'diff.expert': 'Especialista',
        'runway.none': 'Sem pistas',
        'runway.error': 'Erro ao carregar pistas',
        'runway.placeholder': '—',
        'unit.km': 'km',
        'unit.min': 'min',
        'unit.pts': 'pts',
    },
    en: {
        'tab.aircraft': 'Aircraft',
        'tab.airport': 'Airport',
        'tab.missions': 'Missions',
        'tab.plans': 'Flight plan',
        'airport.airport': 'Airport',
        'airport.runway': 'Runway',
        'airport.end': 'Runway end',
        'airport.datetime': 'Flight date & time',
        'airport.searchPlaceholder': 'ICAO or name (e.g. SBGR)',
        'cta.flyNow': 'FLY NOW',
        'cta.startFly': 'START & FLY',
        'cta.locked': 'LOCKED',
        'cta.preparing': 'PREPARING...',
        'common.back': '← Back',
        'common.loading': 'Loading...',
        'common.connError': 'Connection error',
        'aircraft.none': 'No aircraft',
        'aircraft.loadFail': 'Failed to load aircraft',
        'aircraft.unavailable': 'Unavailable',
        'aircraft.owned': 'Your aircraft',
        'aircraft.pro': 'PRO available',
        'missions.none': 'No missions',
        'missions.loadFail': 'Failed to load missions',
        'plans.none': 'No flight plans',
        'plans.loadFail': 'Failed to load plans',
        'badge.pro': 'PRO',
        'badge.done': 'Completed',
        'badge.locked': 'Locked',
        'badge.inProgress': 'In progress',
        'detail.distance': 'Distance',
        'detail.duration': 'Duration',
        'detail.reward': 'Reward',
        'detail.departure': 'Departure',
        'detail.arrival': 'Arrival',
        'detail.runway': 'Runway',
        'detail.scheduled': 'Scheduled departure',
        'detail.notes': 'Notes',
        'diff.beginner': 'Beginner',
        'diff.easy': 'Easy',
        'diff.intermediate': 'Intermediate',
        'diff.advanced': 'Advanced',
        'diff.expert': 'Expert',
        'runway.none': 'No runways',
        'runway.error': 'Failed to load runways',
        'runway.placeholder': '—',
        'unit.km': 'km',
        'unit.min': 'min',
        'unit.pts': 'pts',
    },
};

export function setPreflightUiActive(active: boolean): void {
    document.body.classList.toggle('preflight-active', active);
    const canvas = document.getElementById('game-canvas') as HTMLElement | null;
    if (!canvas) return;
    if (active) {
        canvas.style.pointerEvents = 'none';
        canvas.style.visibility = 'hidden';
    } else {
        canvas.style.pointerEvents = '';
        canvas.style.visibility = '';
    }
}

export function ensureDefaultSpawnConfig(): void {
    try {
        const raw = localStorage.getItem(PREFLIGHT_SPAWN_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as PreflightSpawnConfig;
            if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) return;
        }
    } catch (err) {
        console.warn('[Preflight] Invalid spawn config in storage, applying SBGR default:', err);
    }
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    const spawn: PreflightSpawnConfig = {
        ...DEFAULT_SBGR_SPAWN,
        simTimeIso: d.toISOString(),
    };
    try {
        localStorage.setItem(PREFLIGHT_SPAWN_KEY, JSON.stringify(spawn));
    } catch (err) {
        console.warn('[Preflight] Failed to persist default SBGR spawn:', err);
    }
}

type AircraftRow = {
    aircraft_id: number;
    has_access: boolean;
    is_owned: boolean;
    pro_access: boolean;
    is_selected: number;
    image_url?: string | null;
    aircraft?: { id: number; name: string; code?: string };
};

type MissionItem = {
    mission_id: number;
    has_access: boolean;
    image_url?: string | null;
    previously_completed?: boolean;
    mission?: Record<string, unknown>;
    user_mission?: { id: number; status: string } | null;
};

type FlightPlanItem = Record<string, unknown> & {
    id: number;
    has_access?: boolean;
    image_url?: string | null;
    name?: string;
};

type AirportRow = { id: number; icao_code?: string; iata_code?: string; name?: string; municipality?: string; elevation_ft?: number };

function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attachImgFallback(root: ParentNode): void {
    root.querySelectorAll<HTMLImageElement>('img[data-hud-thumb]').forEach((img) => {
        img.addEventListener('error', () => hudImgOnError(img), { once: true });
    });
}

export class PreflightController {
    private readonly token: string;
    private lang: Lang = 'pt';
    private selectedAircraftId: number | null = null;
    private aircraftRows: AircraftRow[] = [];
    private missionItems: MissionItem[] = [];
    private planItems: FlightPlanItem[] = [];
    private airports: AirportRow[] = [];
    private runways: any[] = [];
    private selectedAirportId: number | null = null;
    private searchTimer: number | undefined;
    private flyResolve: (() => void) | null = null;

    constructor(token: string) {
        this.token = token;
        const saved = localStorage.getItem(PREFLIGHT_AIRCRAFT_KEY);
        if (saved) {
            const n = Number(saved);
            if (Number.isFinite(n) && n > 0) this.selectedAircraftId = n;
        }
    }

    private t(key: string): string {
        return I18N[this.lang][key] ?? I18N.pt[key] ?? key;
    }

    async run(): Promise<void> {
        const root = document.getElementById('preflight');
        if (!root) {
            console.warn('[Preflight] #preflight element missing');
            return Promise.resolve();
        }
        await this.detectAndApplyLanguage();
        this.applyStaticI18n();
        this.wireTabs();
        this.wireFlyButton();
        this.wireDetailBack();
        this.wireAirportFields();
        this.setDefaultDateTime();
        this.updateFooterVisibility('aircraft');
        setPreflightUiActive(true);
        root.classList.add('preflight-visible');
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';

        await Promise.all([
            this.loadAircrafts(),
            this.loadMissions(),
            this.loadPlans(),
            this.initDefaultAirport(),
        ]);

        return new Promise<void>((resolve) => {
            this.flyResolve = resolve;
        });
    }

    hide(): void {
        document.getElementById('preflight')?.classList.remove('preflight-visible');
        setPreflightUiActive(false);
    }

    private async detectAndApplyLanguage(): Promise<void> {
        try {
            if (localStorage.getItem(UI_PREF_STORAGE_KEY)) {
                this.lang = UiPreferences.get().language === LANGUAGE_EN ? 'en' : 'pt';
                console.debug(`[Preflight] Using stored language preference: ${this.lang}`);
                return;
            }
        } catch (err) {
            console.warn('[Preflight] Failed to read stored language preference:', err);
        }

        let detected: Lang = 'pt';
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1500);
            const res = await fetch('https://ipapi.co/country/', { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const cc = (await res.text()).trim().toUpperCase();
            detected = PT_COUNTRY_CODES.has(cc) ? 'pt' : 'en';
            console.debug(`[Preflight] IP geolocation country=${cc} → language=${detected}`);
        } catch (err) {
            const navLang = (navigator.language || '').toLowerCase();
            detected = navLang.startsWith('pt') ? 'pt' : 'en';
            console.warn(`[Preflight] IP language detection failed, falling back to navigator.language=${navLang} → ${detected}:`, err);
        }
        this.lang = detected;
        try {
            UiPreferences.set({ language: detected === 'en' ? LANGUAGE_EN : LANGUAGE_PT });
        } catch (err) {
            console.warn('[Preflight] Failed to persist detected language:', err);
        }
    }

    private applyStaticI18n(): void {
        const set = (sel: string, text: string) => {
            const el = document.querySelector(sel);
            if (el) el.textContent = text;
        };
        set('.preflight-tab[data-tab="aircraft"]', this.t('tab.aircraft'));
        set('.preflight-tab[data-tab="airport"]', this.t('tab.airport'));
        set('.preflight-tab[data-tab="missions"]', this.t('tab.missions'));
        set('.preflight-tab[data-tab="plans"]', this.t('tab.plans'));
        set('label[for="preflight-airport-search"]', this.t('airport.airport'));
        set('label[for="preflight-runway-select"]', this.t('airport.runway'));
        set('label[for="preflight-runway-end"]', this.t('airport.end'));
        set('label[for="preflight-datetime"]', this.t('airport.datetime'));
        const search = document.getElementById('preflight-airport-search') as HTMLInputElement | null;
        if (search) search.placeholder = this.t('airport.searchPlaceholder');
        const fly = document.getElementById('preflight-fly-btn');
        if (fly) fly.textContent = this.t('cta.flyNow');
        document.querySelectorAll('.preflight-detail-back').forEach((b) => { b.textContent = this.t('common.back'); });
    }

    private updateFooterVisibility(tab: string): void {
        const footer = document.querySelector('.preflight-footer') as HTMLElement | null;
        if (!footer) return;
        footer.style.display = (tab === 'missions' || tab === 'plans') ? 'none' : '';
    }

    private wireTabs(): void {
        document.querySelectorAll<HTMLButtonElement>('.preflight-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (!tab) return;
                document.querySelectorAll('.preflight-tab').forEach((t) => t.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.preflight-panel').forEach((p) => p.classList.remove('active'));
                document.getElementById(`preflight-panel-${tab === 'plans' ? 'plans' : tab}`)?.classList.add('active');
                this.updateFooterVisibility(tab);
            });
        });
    }

    private wireFlyButton(): void {
        const btn = document.getElementById('preflight-fly-btn') as HTMLButtonElement | null;
        btn?.addEventListener('click', () => void this.onFlyFree());
    }

    private wireDetailBack(): void {
        document.querySelectorAll<HTMLButtonElement>('.preflight-detail-back').forEach((btn) => {
            btn.addEventListener('click', () => {
                const which = btn.dataset.back;
                if (which === 'missions') {
                    document.getElementById('preflight-mission-detail')?.classList.remove('visible');
                    document.getElementById('preflight-missions-list')!.style.display = '';
                } else if (which === 'plans') {
                    document.getElementById('preflight-plan-detail')?.classList.remove('visible');
                    document.getElementById('preflight-plans-list')!.style.display = '';
                }
            });
        });
    }

    private setDefaultDateTime(): void {
        const el = document.getElementById('preflight-datetime') as HTMLInputElement | null;
        if (!el) return;
        const d = new Date();
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        el.value = d.toISOString().slice(0, 16);
    }

    private wireAirportFields(): void {
        const search = document.getElementById('preflight-airport-search') as HTMLInputElement | null;
        search?.addEventListener('input', () => {
            if (this.searchTimer) clearTimeout(this.searchTimer);
            const q = search!.value.trim();
            this.selectedAirportId = null;
            if (!q) {
                this.clearRunwaySelection();
                this.hideAirportSuggestions();
                return;
            }
            this.searchTimer = window.setTimeout(() => void this.searchAirports(q), 300);
        });
        document.addEventListener('click', (ev) => {
            const target = ev.target as Node | null;
            const field = search?.closest('.preflight-field');
            if (field && target && !field.contains(target)) this.hideAirportSuggestions();
        });
        const rwy = document.getElementById('preflight-runway-select') as HTMLSelectElement | null;
        rwy?.addEventListener('change', () => this.persistSpawnFromForm());
        const end = document.getElementById('preflight-runway-end') as HTMLSelectElement | null;
        end?.addEventListener('change', () => this.persistSpawnFromForm());
        const dt = document.getElementById('preflight-datetime') as HTMLInputElement | null;
        dt?.addEventListener('change', () => this.persistSpawnFromForm());
    }

    private clearRunwaySelection(): void {
        this.runways = [];
        const rwy = document.getElementById('preflight-runway-select') as HTMLSelectElement | null;
        if (rwy) rwy.innerHTML = `<option value="">${this.t('runway.placeholder')}</option>`;
        const end = document.getElementById('preflight-runway-end') as HTMLSelectElement | null;
        if (end) end.value = 'le';
        try {
            localStorage.removeItem(PREFLIGHT_SPAWN_KEY);
        } catch (err) {
            console.warn('[Preflight] Failed to clear spawn config:', err);
        }
    }

    private async initDefaultAirport(): Promise<void> {
        const search = document.getElementById('preflight-airport-search') as HTMLInputElement | null;
        if (search) search.value = 'SBGR';
        await this.searchAirports('SBGR', true);
        if (!this.selectedAirportId) ensureDefaultSpawnConfig();
    }

    private async searchAirports(q: string, autoSelect = false): Promise<void> {
        if (!q) return;
        try {
            const res = await fetch(`/api/airports/search?q=${encodeURIComponent(q)}`);
            if (!res.ok) {
                console.warn(`[Preflight] Airport search failed: HTTP ${res.status}`);
                return;
            }
            const json = await res.json();
            this.airports = Array.isArray(json?.data) ? json.data : [];
            if (autoSelect) {
                if (this.airports.length) {
                    const match = this.airports.find((a) => (a.icao_code || '').toUpperCase() === q.toUpperCase()) || this.airports[0];
                    await this.selectAirport(match);
                }
                return;
            }
            this.renderAirportSuggestions();
        } catch (err) {
            console.warn('[Preflight] Airport search error:', err);
        }
    }

    private renderAirportSuggestions(): void {
        const box = document.getElementById('preflight-airport-suggestions');
        if (!box) return;
        if (!this.airports.length) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }
        const top = this.airports.slice(0, 5);
        box.innerHTML = top.map((a) => {
            const sub = a.name || a.municipality || '';
            return `<div class="preflight-suggestion" data-airport-id="${a.id}">
                <span class="preflight-suggestion-icao">${escapeHtml(a.icao_code || a.iata_code || '')}</span>
                <span class="preflight-suggestion-name">${escapeHtml(sub)}</span>
            </div>`;
        }).join('');
        box.style.display = 'block';
        box.querySelectorAll<HTMLElement>('.preflight-suggestion').forEach((el) => {
            el.addEventListener('click', () => {
                const id = Number(el.dataset.airportId);
                const ap = this.airports.find((a) => a.id === id);
                if (ap) void this.selectAirport(ap);
            });
        });
    }

    private hideAirportSuggestions(): void {
        const box = document.getElementById('preflight-airport-suggestions');
        if (box) box.style.display = 'none';
    }

    private async selectAirport(ap: AirportRow): Promise<void> {
        this.selectedAirportId = ap.id;
        const search = document.getElementById('preflight-airport-search') as HTMLInputElement | null;
        if (search) search.value = ap.icao_code || ap.name || '';
        this.hideAirportSuggestions();
        await this.loadRunways(ap.id);
    }

    private async loadRunways(airportId: number): Promise<void> {
        const sel = document.getElementById('preflight-runway-select') as HTMLSelectElement | null;
        if (!sel) return;
        sel.innerHTML = `<option value="">${this.t('common.loading')}</option>`;
        try {
            const res = await fetch(`/api/airports/${airportId}/runways`);
            if (!res.ok) {
                sel.innerHTML = `<option value="">${this.t('runway.error')}</option>`;
                return;
            }
            const json = await res.json();
            this.runways = Array.isArray(json?.data) ? json.data : [];
            if (!this.runways.length) {
                sel.innerHTML = `<option value="">${this.t('runway.none')}</option>`;
                return;
            }
            sel.innerHTML = this.runways.map((r) => {
                const label = `${r.le_ident || '?'}/${r.he_ident || '?'}`;
                return `<option value="${r.id}">${escapeHtml(label)} (${r.length_ft || '?'}ft)</option>`;
            }).join('');
            this.persistSpawnFromForm();
        } catch (err) {
            console.warn('[Preflight] Runways load error:', err);
            sel.innerHTML = `<option value="">${this.t('runway.error')}</option>`;
        }
    }

    private persistSpawnFromForm(): void {
        const rwySel = document.getElementById('preflight-runway-select') as HTMLSelectElement | null;
        const endSel = document.getElementById('preflight-runway-end') as HTMLSelectElement | null;
        const dtSel = document.getElementById('preflight-datetime') as HTMLInputElement | null;
        if (!rwySel || !this.selectedAirportId) return;
        const rwyId = Number(rwySel.value);
        const rwy = this.runways.find((r) => Number(r.id) === rwyId);
        if (!rwy) return;
        const end = (endSel?.value === 'he' ? 'he' : 'le') as 'le' | 'he';
        const lat = Number(end === 'he' ? rwy.he_latitude_deg : rwy.le_latitude_deg);
        const lon = Number(end === 'he' ? rwy.he_longitude_deg : rwy.le_longitude_deg);
        const hdg = Number(end === 'he' ? rwy.he_heading_deg_true : rwy.le_heading_deg_true);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const ap = this.airports.find((a) => a.id === this.selectedAirportId);
        const simTimeIso = dtSel?.value ? new Date(dtSel.value).toISOString() : new Date().toISOString();
        const rwyElevFt = end === 'he' ? rwy.he_elevation_ft : rwy.le_elevation_ft;
        const elevationFt = Number(rwyElevFt ?? rwy.elevation_ft ?? ap?.elevation_ft ?? 0);
        const spawn: PreflightSpawnConfig = {
            airportId: this.selectedAirportId,
            icao: ap?.icao_code || 'SBGR',
            runwayId: rwyId,
            end,
            lat,
            lon,
            hdg: Number.isFinite(hdg) ? hdg : 0,
            elevationFt: Number.isFinite(elevationFt) ? elevationFt : 0,
            simTimeIso,
        };
        try {
            localStorage.setItem(PREFLIGHT_SPAWN_KEY, JSON.stringify(spawn));
        } catch (err) {
            console.warn('[Preflight] Failed to persist spawn config:', err);
        }
    }

    private async loadAircrafts(): Promise<void> {
        const list = document.getElementById('preflight-aircraft-list');
        if (!list) return;
        list.innerHTML = `<div class="preflight-msg">${this.t('common.loading')}</div>`;
        try {
            const res = await fetch('/api/user-aircrafts', { headers: authHeaders(this.token) });
            if (!res.ok) {
                list.innerHTML = `<div class="preflight-msg">${this.t('aircraft.loadFail')}</div>`;
                return;
            }
            const json = await res.json();
            this.aircraftRows = Array.isArray(json?.data) ? json.data : [];
            if (!this.aircraftRows.length) {
                list.innerHTML = `<div class="preflight-msg">${this.t('aircraft.none')}</div>`;
                return;
            }
            if (this.selectedAircraftId != null) {
                const saved = this.aircraftRows.find((r) => r.aircraft_id === this.selectedAircraftId);
                if (!saved?.has_access) this.selectedAircraftId = null;
            }
            if (this.selectedAircraftId == null) {
                const sel = this.aircraftRows.find((r) => r.is_selected === 1 && r.has_access)
                    || this.aircraftRows.find((r) => r.has_access);
                if (sel) this.selectedAircraftId = sel.aircraft_id;
            }
            this.renderAircraftList();
        } catch (err) {
            console.warn('[Preflight] Aircraft load error:', err);
            list.innerHTML = `<div class="preflight-msg">${this.t('common.connError')}</div>`;
        }
    }

    private renderAircraftList(): void {
        const list = document.getElementById('preflight-aircraft-list');
        if (!list) return;
        let html = '';
        for (const row of this.aircraftRows) {
            const name = row.aircraft?.name || `Aircraft #${row.aircraft_id}`;
            const img = resolveHudImageUrl(row);
            const selected = row.aircraft_id === this.selectedAircraftId;
            const locked = !row.has_access;
            const pro = row.pro_access;
            const sub = locked ? this.t('aircraft.unavailable') : row.is_owned ? this.t('aircraft.owned') : this.t('aircraft.pro');
            html += `<div class="preflight-card${selected ? ' selected' : ''}${locked ? ' locked' : ''}" data-aircraft-id="${row.aircraft_id}" data-has-access="${row.has_access ? '1' : '0'}">
                <img data-hud-thumb src="${escapeHtml(img || HUD_IMAGE_PLACEHOLDER)}" alt="${escapeHtml(name)}" width="72" height="48" loading="lazy" decoding="async" style="width:72px;height:48px;object-fit:cover;border-radius:4px;border:1px solid rgba(80,255,160,.25);flex-shrink:0;background:#0a1620"/>
                <div style="flex:1;min-width:0">
                    <div class="preflight-card-title">${escapeHtml(name)}${pro ? `<span class="preflight-badge preflight-badge-pro">${this.t('badge.pro')}</span>` : ''}</div>
                    <div class="preflight-card-sub">${escapeHtml(sub)}</div>
                </div>
            </div>`;
        }
        list.innerHTML = html;
        attachImgFallback(list);
        list.querySelectorAll<HTMLElement>('.preflight-card[data-has-access="1"]').forEach((card) => {
            card.addEventListener('click', () => {
                const id = Number(card.dataset.aircraftId);
                if (!Number.isFinite(id)) return;
                this.selectedAircraftId = id;
                localStorage.setItem(PREFLIGHT_AIRCRAFT_KEY, String(id));
                this.renderAircraftList();
            });
        });
    }

    private difficultyLabel(d?: string): string {
        if (!d) return '';
        const key = `diff.${d.toLowerCase()}`;
        const dict = I18N[this.lang];
        if (dict[key]) return dict[key];
        return d.charAt(0).toUpperCase() + d.slice(1);
    }

    private missionBadgesHtml(item: MissionItem): string {
        const m = (item.mission || {}) as Record<string, unknown>;
        const parts: string[] = [];
        if (Number(m.requires_pro) === 1) parts.push(`<span class="preflight-badge preflight-badge-pro">${this.t('badge.pro')}</span>`);
        const diff = this.difficultyLabel(m.difficulty as string | undefined);
        if (diff) parts.push(`<span class="preflight-badge preflight-badge-level">${escapeHtml(diff)}</span>`);
        if (item.previously_completed) parts.push(`<span class="preflight-badge preflight-badge-done">${this.t('badge.done')}</span>`);
        const st = item.user_mission?.status;
        if (st && ['started', 'in_progress'].includes(st)) {
            parts.push(`<span class="preflight-badge preflight-badge-prog">${this.t('badge.inProgress')}</span>`);
        } else if (!item.has_access) {
            parts.push(`<span class="preflight-badge preflight-badge-locked">${this.t('badge.locked')}</span>`);
        }
        return parts.join('');
    }

    private missionMetaText(m: Record<string, unknown>): string {
        const bits: string[] = [];
        if (m.distance_nm != null) bits.push(`${Math.round(Number(m.distance_nm) * 1.852)} ${this.t('unit.km')}`);
        if (m.estimated_duration_min != null) bits.push(`${Math.round(Number(m.estimated_duration_min))} ${this.t('unit.min')}`);
        if (m.reward_points != null) bits.push(`${Number(m.reward_points)} ${this.t('unit.pts')}`);
        return bits.join(' · ');
    }

    private async loadMissions(): Promise<void> {
        const list = document.getElementById('preflight-missions-list');
        if (!list) return;
        list.innerHTML = `<div class="preflight-msg">${this.t('common.loading')}</div>`;
        try {
            const res = await fetch('/api/user-missions', { headers: authHeaders(this.token) });
            if (!res.ok) {
                list.innerHTML = `<div class="preflight-msg">${this.t('missions.loadFail')}</div>`;
                return;
            }
            const json = await res.json();
            this.missionItems = Array.isArray(json?.data) ? json.data : [];
            this.renderMissionList();
        } catch (err) {
            console.warn('[Preflight] Missions load error:', err);
            list.innerHTML = `<div class="preflight-msg">${this.t('common.connError')}</div>`;
        }
    }

    private renderMissionList(): void {
        const list = document.getElementById('preflight-missions-list');
        if (!list) return;
        const enabled = this.missionItems.filter((item) => {
            const m = item.mission as { is_enabled?: number; is_active?: number } | undefined;
            if (m?.is_enabled === 0 || m?.is_active === 0) return false;
            return true;
        });
        if (!enabled.length) {
            list.innerHTML = `<div class="preflight-msg">${this.t('missions.none')}</div>`;
            return;
        }
        let html = '';
        for (const item of enabled) {
            const m = (item.mission || {}) as Record<string, unknown>;
            const title = (m.title as string) || 'Missão';
            const dep = (m.departure_icao as string) || '';
            const arr = (m.arrival_icao as string) || '';
            const img = resolveHudImageUrl(item);
            const route = dep || arr ? `${escapeHtml(dep)} → ${escapeHtml(arr)}` : '';
            const meta = this.missionMetaText(m);
            html += `<div class="preflight-card" data-mission-id="${item.mission_id}">
                <img data-hud-thumb src="${escapeHtml(img || HUD_IMAGE_PLACEHOLDER)}" alt="" width="72" height="48" loading="lazy" decoding="async" style="width:72px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0"/>
                <div style="flex:1;min-width:0">
                    <div class="preflight-card-title">${escapeHtml(title)}${this.missionBadgesHtml(item)}</div>
                    ${route ? `<div class="preflight-card-sub">${route}</div>` : ''}
                    ${meta ? `<div class="preflight-meta">${escapeHtml(meta)}</div>` : ''}
                </div>
            </div>`;
        }
        list.innerHTML = html;
        attachImgFallback(list);
        list.querySelectorAll<HTMLElement>('[data-mission-id]').forEach((card) => {
            card.addEventListener('click', () => {
                const id = Number(card.dataset.missionId);
                const item = this.missionItems.find((x) => x.mission_id === id);
                if (item) this.showMissionDetail(item);
            });
        });
    }

    private showMissionDetail(item: MissionItem): void {
        const m = (item.mission || {}) as Record<string, unknown>;
        const title = (m.title as string) || 'Missão';
        const desc = (m.description as string) || '';
        const dep = (m.departure_icao as string) || '';
        const arr = (m.arrival_icao as string) || '';
        const img = resolveHudImageUrl(item);
        const body = document.getElementById('preflight-mission-detail-body');
        const detail = document.getElementById('preflight-mission-detail');
        const list = document.getElementById('preflight-missions-list');
        if (!body || !detail || !list) return;
        list.style.display = 'none';
        detail.classList.add('visible');
        const canFly = item.has_access;
        const um = item.user_mission;
        const inProgress = um != null && ['started', 'in_progress'].includes(um.status);
        const ctaText = inProgress ? this.t('cta.flyNow') : canFly ? this.t('cta.startFly') : this.t('cta.locked');

        const stats: string[] = [];
        if (m.distance_nm != null) stats.push(`<div class="preflight-stat"><div class="preflight-stat-val">${Math.round(Number(m.distance_nm) * 1.852)} ${this.t('unit.km')}</div><div class="preflight-stat-lbl">${this.t('detail.distance')}</div></div>`);
        if (m.estimated_duration_min != null) stats.push(`<div class="preflight-stat"><div class="preflight-stat-val">${Math.round(Number(m.estimated_duration_min))} ${this.t('unit.min')}</div><div class="preflight-stat-lbl">${this.t('detail.duration')}</div></div>`);
        if (m.reward_points != null) stats.push(`<div class="preflight-stat"><div class="preflight-stat-val">${Number(m.reward_points)} ${this.t('unit.pts')}</div><div class="preflight-stat-lbl">${this.t('detail.reward')}</div></div>`);

        const rows: string[] = [];
        if (dep) rows.push(`<div class="preflight-detail-row"><span class="k">${this.t('detail.departure')}</span><span class="v">${escapeHtml((m.departure_airport_name as string) || '')} (${escapeHtml(dep)})</span></div>`);
        if (arr) rows.push(`<div class="preflight-detail-row"><span class="k">${this.t('detail.arrival')}</span><span class="v">${escapeHtml((m.arrival_airport_name as string) || '')} (${escapeHtml(arr)})</span></div>`);

        body.innerHTML = `
            <img class="preflight-hero-img" data-hud-thumb src="${escapeHtml(img || HUD_IMAGE_PLACEHOLDER)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async"/>
            <h2 style="font-family:Orbitron,monospace;font-size:14px;color:#40ffaa;margin-bottom:8px">${escapeHtml(title)}</h2>
            <div class="preflight-detail-badges">${this.missionBadgesHtml(item)}</div>
            ${stats.length ? `<div class="preflight-stat-row">${stats.join('')}</div>` : ''}
            ${rows.join('')}
            ${desc ? `<p style="font-size:12px;color:rgba(255,255,255,.6);line-height:1.5;margin:12px 0">${escapeHtml(desc)}</p>` : ''}
            <button type="button" class="preflight-cta-btn" id="preflight-mission-fly" ${canFly ? '' : 'disabled'}>${ctaText}</button>
        `;
        attachImgFallback(body);
        const flyBtn = document.getElementById('preflight-mission-fly');
        flyBtn?.addEventListener('click', () => {
            if (!canFly) return;
            void this.startMissionFlight(item);
        });
    }

    private async startMissionFlight(item: MissionItem): Promise<void> {
        const missionId = item.mission_id;
        let userMissionId = item.user_mission?.id ?? null;
        try {
            if (!userMissionId) {
                const postRes = await fetch('/api/user-missions', {
                    method: 'POST',
                    headers: { ...authHeaders(this.token), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mission_id: missionId }),
                });
                if (postRes.ok) {
                    const data = await postRes.json();
                    userMissionId = data?.id != null ? Number(data.id) : null;
                } else if (postRes.status === 409) {
                    try {
                        const recoverRes = await fetch('/api/user-missions/active', { headers: authHeaders(this.token) });
                        if (recoverRes.ok) {
                            const recoverJson = await recoverRes.json();
                            const recoverList: Array<{ id?: number; mission_id?: number }> = Array.isArray(recoverJson?.data) ? recoverJson.data : [];
                            const existing = recoverList.find((um) => Number(um?.mission_id) === missionId);
                            if (existing?.id != null) userMissionId = Number(existing.id);
                        }
                    } catch (recoverErr) {
                        console.warn('[Preflight] Recover user-mission after 409 error:', recoverErr);
                    }
                    if (userMissionId == null) {
                        console.warn(`[Preflight] Mission ${missionId} already active but userMissionId not recovered`);
                        return;
                    }
                } else {
                    console.warn(`[Preflight] Mission acquire failed: ${postRes.status}`);
                    return;
                }
            }
            if (userMissionId != null) {
                const startRes = await fetch(`/api/user-missions/${userMissionId}/start`, {
                    method: 'PUT',
                    headers: authHeaders(this.token),
                });
                if (!startRes.ok && startRes.status !== 409) {
                    console.warn(`[Preflight] Mission start failed: ${startRes.status}`);
                    return;
                }
            }
            window.location.href = `flight.html?mission_id=${encodeURIComponent(String(missionId))}`;
        } catch (err) {
            console.warn('[Preflight] Mission start error:', err);
        }
    }

    private async loadPlans(): Promise<void> {
        const list = document.getElementById('preflight-plans-list');
        if (!list) return;
        list.innerHTML = `<div class="preflight-msg">${this.t('common.loading')}</div>`;
        try {
            const res = await fetch('/api/flight-plans?status=all&limit=100', { headers: authHeaders(this.token) });
            if (!res.ok) {
                list.innerHTML = `<div class="preflight-msg">${this.t('plans.loadFail')}</div>`;
                return;
            }
            const json = await res.json();
            this.planItems = Array.isArray(json?.data) ? json.data : [];
            this.renderPlanList();
        } catch (err) {
            console.warn('[Preflight] Plans load error:', err);
            list.innerHTML = `<div class="preflight-msg">${this.t('common.connError')}</div>`;
        }
    }

    private renderPlanList(): void {
        const list = document.getElementById('preflight-plans-list');
        if (!list) return;
        if (!this.planItems.length) {
            list.innerHTML = `<div class="preflight-msg">${this.t('plans.none')}</div>`;
            return;
        }
        let html = '';
        for (const p of this.planItems) {
            const name = p.name || 'Plano';
            const dep = (p.departure_icao as string) || '???';
            const arr = (p.arrival_icao as string) || '???';
            const scheduled = this.formatDateTime(p.scheduled_departure_at as string | undefined);
            html += `<div class="preflight-card" data-plan-id="${p.id}">
                <div style="flex:1;min-width:0">
                    <div class="preflight-card-title">${escapeHtml(String(name))}</div>
                    <div class="preflight-card-sub">${escapeHtml(String(dep))} → ${escapeHtml(String(arr))}</div>
                    ${scheduled ? `<div class="preflight-meta">${escapeHtml(scheduled)}</div>` : ''}
                </div>
            </div>`;
        }
        list.innerHTML = html;
        list.querySelectorAll<HTMLElement>('[data-plan-id]').forEach((card) => {
            card.addEventListener('click', () => {
                const id = Number(card.dataset.planId);
                const plan = this.planItems.find((x) => Number(x.id) === id);
                if (plan) void this.showPlanDetail(plan);
            });
        });
    }

    private formatDateTime(iso?: string): string {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '';
            return d.toLocaleString(this.lang === 'pt' ? 'pt-BR' : 'en-US', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            });
        } catch (err) {
            console.warn('[Preflight] Date format error:', err);
            return '';
        }
    }

    private async showPlanDetail(plan: FlightPlanItem): Promise<void> {
        const body = document.getElementById('preflight-plan-detail-body');
        const detail = document.getElementById('preflight-plan-detail');
        const list = document.getElementById('preflight-plans-list');
        if (!body || !detail || !list) return;
        list.style.display = 'none';
        detail.classList.add('visible');
        let full = plan;
        try {
            const res = await fetch(`/api/flight-plans/${plan.id}`, { headers: authHeaders(this.token) });
            if (res.ok) full = await res.json();
        } catch (err) {
            console.warn('[Preflight] Plan detail fetch error:', err);
        }
        const name = full.name || 'Plano';
        const canFly = full.has_access !== false;
        const depName = (full.departure_airport_name as string) || '';
        const arrName = (full.arrival_airport_name as string) || '';
        const depIcao = (full.departure_icao as string) || '';
        const arrIcao = (full.arrival_icao as string) || '';
        const depRwy = (full.dep_rwy_ident as string) || '';
        const arrRwy = (full.arr_rwy_ident as string) || '';
        const scheduled = this.formatDateTime(full.scheduled_departure_at as string | undefined);
        const notes = (full.notes as string) || '';

        const rows: string[] = [];
        rows.push(`<div class="preflight-detail-row"><span class="k">${this.t('detail.departure')}</span><span class="v">${escapeHtml(depName)} (${escapeHtml(depIcao)})${depRwy ? ` · ${this.t('detail.runway')} ${escapeHtml(depRwy)}` : ''}</span></div>`);
        rows.push(`<div class="preflight-detail-row"><span class="k">${this.t('detail.arrival')}</span><span class="v">${escapeHtml(arrName)} (${escapeHtml(arrIcao)})${arrRwy ? ` · ${this.t('detail.runway')} ${escapeHtml(arrRwy)}` : ''}</span></div>`);
        if (scheduled) rows.push(`<div class="preflight-detail-row"><span class="k">${this.t('detail.scheduled')}</span><span class="v">${escapeHtml(scheduled)}</span></div>`);
        if (notes) rows.push(`<div class="preflight-detail-row"><span class="k">${this.t('detail.notes')}</span><span class="v">${escapeHtml(notes)}</span></div>`);

        body.innerHTML = `
            <h2 style="font-family:Orbitron,monospace;font-size:14px;color:#40ffaa;margin-bottom:8px">${escapeHtml(String(name))}</h2>
            <p style="font-size:12px;color:rgba(255,255,255,.55);margin-bottom:8px">${escapeHtml(depIcao)} → ${escapeHtml(arrIcao)}</p>
            ${rows.join('')}
            <button type="button" class="preflight-cta-btn" id="preflight-plan-fly" ${canFly ? '' : 'disabled'}>${this.t('cta.flyNow')}</button>
        `;
        document.getElementById('preflight-plan-fly')?.addEventListener('click', () => {
            if (!canFly) return;
            window.location.href = `flight.html?flightPlanId=${encodeURIComponent(String(plan.id))}`;
        });
    }

    private async onFlyFree(): Promise<void> {
        const row = this.aircraftRows.find((r) => r.aircraft_id === this.selectedAircraftId);
        if (!row?.has_access) {
            console.warn('[Preflight] No flyable aircraft selected');
            return;
        }
        this.persistSpawnFromForm();
        const rwySel = document.getElementById('preflight-runway-select') as HTMLSelectElement | null;
        const endSel = document.getElementById('preflight-runway-end') as HTMLSelectElement | null;
        const dtSel = document.getElementById('preflight-datetime') as HTMLInputElement | null;
        const runwayId = rwySel ? Number(rwySel.value) : NaN;
        const end = endSel?.value === 'he' ? 'he' : 'le';
        const simTimeIso = dtSel?.value ? new Date(dtSel.value).toISOString() : new Date().toISOString();
        const btn = document.getElementById('preflight-fly-btn') as HTMLButtonElement | null;
        if (btn) {
            btn.disabled = true;
            btn.textContent = this.t('cta.preparing');
        }
        try {
            localStorage.setItem(PREFLIGHT_AIRCRAFT_KEY, String(row.aircraft_id));
            if (row.is_owned) {
                const selectRes = await fetch(`/api/user-aircrafts/${row.aircraft_id}/select`, {
                    method: 'POST',
                    headers: { ...authHeaders(this.token), 'Content-Type': 'application/json' },
                });
                if (!selectRes.ok) {
                    console.warn(`[Preflight] Aircraft select failed: HTTP ${selectRes.status}`);
                }
            }
            const params = new URLSearchParams();
            if (this.selectedAirportId && Number.isFinite(runwayId) && runwayId > 0) {
                params.set('airportId', String(this.selectedAirportId));
                params.set('runwayId', String(runwayId));
                params.set('end', end);
            } else {
                console.warn('[Preflight] No airport/runway selected — game will use default spawn');
            }
            params.set('simTime', simTimeIso);
            console.debug(`[Preflight] Free flight → flight.html?${params.toString()}`);
            window.location.href = `flight.html?${params.toString()}`;
        } catch (err) {
            console.warn('[Preflight] Fly free error:', err);
            if (btn) {
                btn.disabled = false;
                btn.textContent = this.t('cta.flyNow');
            }
        }
    }
}

type GroundSpawnScene = {
    setSimTimeOffsetFromIso(iso: string): void;
    setFreeFlightGroundSpawn(lat: number, lon: number, hdg: number, elevationFt: number): void;
};

export function applyPreflightToUrlAndScene(scene: GroundSpawnScene): void {
    ensureDefaultSpawnConfig();
    try {
        const raw = localStorage.getItem(PREFLIGHT_SPAWN_KEY);
        const spawn = raw ? (JSON.parse(raw) as PreflightSpawnConfig) : DEFAULT_SBGR_SPAWN;
        scene.setFreeFlightGroundSpawn(spawn.lat, spawn.lon, spawn.hdg, spawn.elevationFt ?? 0);
        if (spawn.simTimeIso) scene.setSimTimeOffsetFromIso(spawn.simTimeIso);
        const params = new URLSearchParams(window.location.search);
        params.delete('alt');
        params.delete('lat');
        params.delete('lng');
        params.delete('hdg');
        params.delete('flightPlanId');
        params.delete('mission_id');
        params.delete('missionId');
        const qs = params.toString();
        history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
        console.debug(`[Preflight] Fallback ground spawn icao=${spawn.icao} lat=${spawn.lat} lon=${spawn.lon} hdg=${spawn.hdg} elevFt=${spawn.elevationFt ?? 0}`);
    } catch (err) {
        console.warn('[Preflight] applyPreflightToUrlAndScene failed:', err);
    }
}
