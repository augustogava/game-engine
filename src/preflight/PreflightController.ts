import { resolveHudImageUrl, HUD_IMAGE_PLACEHOLDER, hudImgOnError } from '../game/api/hudImageUrl.js';

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
    simTimeIso: new Date().toISOString(),
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
    private selectedAircraftId: number | null = null;
    private aircraftRows: AircraftRow[] = [];
    private missionItems: MissionItem[] = [];
    private planItems: FlightPlanItem[] = [];
    private airports: Array<{ id: number; icao_code?: string; name?: string }> = [];
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

    async run(): Promise<void> {
        const root = document.getElementById('preflight');
        if (!root) {
            console.warn('[Preflight] #preflight element missing');
            return Promise.resolve();
        }
        this.wireTabs();
        this.wireFlyButton();
        this.wireDetailBack();
        this.wireAirportFields();
        this.setDefaultDateTime();
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

    private wireTabs(): void {
        document.querySelectorAll<HTMLButtonElement>('.preflight-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                if (!tab) return;
                document.querySelectorAll('.preflight-tab').forEach((t) => t.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.preflight-panel').forEach((p) => p.classList.remove('active'));
                document.getElementById(`preflight-panel-${tab === 'plans' ? 'plans' : tab}`)?.classList.add('active');
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
            this.selectedAirportId = null;
            this.searchTimer = window.setTimeout(() => void this.searchAirports(search!.value.trim()), 350);
        });
        const rwy = document.getElementById('preflight-runway-select') as HTMLSelectElement | null;
        rwy?.addEventListener('change', () => this.persistSpawnFromForm());
        const end = document.getElementById('preflight-runway-end') as HTMLSelectElement | null;
        end?.addEventListener('change', () => this.persistSpawnFromForm());
        const dt = document.getElementById('preflight-datetime') as HTMLInputElement | null;
        dt?.addEventListener('change', () => this.persistSpawnFromForm());
    }

    private async initDefaultAirport(): Promise<void> {
        const search = document.getElementById('preflight-airport-search') as HTMLInputElement | null;
        if (search) search.value = 'SBGR';
        await this.searchAirports('SBGR');
        if (this.airports.length) {
            this.selectedAirportId = this.airports[0].id;
            await this.loadRunways(this.airports[0].id);
        } else {
            ensureDefaultSpawnConfig();
        }
    }

    private async searchAirports(q: string): Promise<void> {
        if (!q) return;
        try {
            const res = await fetch(`/api/airports/search?q=${encodeURIComponent(q)}`);
            if (!res.ok) {
                console.warn(`[Preflight] Airport search failed: HTTP ${res.status}`);
                return;
            }
            const json = await res.json();
            this.airports = Array.isArray(json?.data) ? json.data : [];
            if (this.airports.length && !this.selectedAirportId) {
                this.selectedAirportId = this.airports[0].id;
                await this.loadRunways(this.airports[0].id);
            } else if (this.airports.length) {
                const match = this.airports.find((a) =>
                    (a.icao_code || '').toUpperCase() === q.toUpperCase()) || this.airports[0];
                this.selectedAirportId = match.id;
                await this.loadRunways(match.id);
            }
        } catch (err) {
            console.warn('[Preflight] Airport search error:', err);
        }
    }

    private async loadRunways(airportId: number): Promise<void> {
        const sel = document.getElementById('preflight-runway-select') as HTMLSelectElement | null;
        if (!sel) return;
        sel.innerHTML = '<option value="">Carregando...</option>';
        try {
            const res = await fetch(`/api/airports/${airportId}/runways`);
            if (!res.ok) {
                sel.innerHTML = '<option value="">Erro ao carregar pistas</option>';
                return;
            }
            const json = await res.json();
            this.runways = Array.isArray(json?.data) ? json.data : [];
            if (!this.runways.length) {
                sel.innerHTML = '<option value="">Sem pistas</option>';
                return;
            }
            sel.innerHTML = this.runways.map((r) => {
                const label = `${r.le_ident || '?'}/${r.he_ident || '?'}`;
                return `<option value="${r.id}">${escapeHtml(label)} (${r.length_ft || '?'}ft)</option>`;
            }).join('');
            this.persistSpawnFromForm();
        } catch (err) {
            console.warn('[Preflight] Runways load error:', err);
            sel.innerHTML = '<option value="">Erro</option>';
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
        const spawn: PreflightSpawnConfig = {
            airportId: this.selectedAirportId,
            icao: ap?.icao_code || 'SBGR',
            runwayId: rwyId,
            end,
            lat,
            lon,
            hdg: Number.isFinite(hdg) ? hdg : 0,
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
        list.innerHTML = '<div class="preflight-msg">Carregando...</div>';
        try {
            const res = await fetch('/api/user-aircrafts', { headers: authHeaders(this.token) });
            if (!res.ok) {
                list.innerHTML = '<div class="preflight-msg">Falha ao carregar aeronaves</div>';
                return;
            }
            const json = await res.json();
            this.aircraftRows = Array.isArray(json?.data) ? json.data : [];
            if (!this.aircraftRows.length) {
                list.innerHTML = '<div class="preflight-msg">Nenhuma aeronave</div>';
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
            list.innerHTML = '<div class="preflight-msg">Erro de conexão</div>';
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
            html += `<div class="preflight-card${selected ? ' selected' : ''}${locked ? ' locked' : ''}" data-aircraft-id="${row.aircraft_id}" data-has-access="${row.has_access ? '1' : '0'}">
                <img data-hud-thumb src="${escapeHtml(img || HUD_IMAGE_PLACEHOLDER)}" alt="${escapeHtml(name)}" width="72" height="48" style="width:72px;height:48px;object-fit:cover;border-radius:4px;border:1px solid rgba(80,255,160,.25);flex-shrink:0;background:#0a1620"/>
                <div style="flex:1;min-width:0">
                    <div class="preflight-card-title">${escapeHtml(name)}${pro ? '<span class="preflight-badge-pro">PRO</span>' : ''}</div>
                    <div class="preflight-card-sub">${locked ? 'Indisponível' : row.is_owned ? 'Sua aeronave' : 'PRO disponível'}</div>
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

    private async loadMissions(): Promise<void> {
        const list = document.getElementById('preflight-missions-list');
        if (!list) return;
        list.innerHTML = '<div class="preflight-msg">Carregando...</div>';
        try {
            const res = await fetch('/api/user-missions', { headers: authHeaders(this.token) });
            if (!res.ok) {
                list.innerHTML = '<div class="preflight-msg">Falha ao carregar missões</div>';
                return;
            }
            const json = await res.json();
            this.missionItems = Array.isArray(json?.data) ? json.data : [];
            this.renderMissionList();
        } catch (err) {
            console.warn('[Preflight] Missions load error:', err);
            list.innerHTML = '<div class="preflight-msg">Erro de conexão</div>';
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
            list.innerHTML = '<div class="preflight-msg">Nenhuma missão</div>';
            return;
        }
        let html = '';
        for (const item of enabled) {
            const m = item.mission || {};
            const title = (m as { title?: string }).title || 'Missão';
            const dep = (m as { departure_icao?: string }).departure_icao || '';
            const arr = (m as { arrival_icao?: string }).arrival_icao || '';
            const img = resolveHudImageUrl(item);
            html += `<div class="preflight-card" data-mission-id="${item.mission_id}">
                <img data-hud-thumb src="${escapeHtml(img || HUD_IMAGE_PLACEHOLDER)}" alt="" width="72" height="48" style="width:72px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0"/>
                <div><div class="preflight-card-title">${escapeHtml(title)}</div>
                <div class="preflight-card-sub">${escapeHtml(dep)} → ${escapeHtml(arr)}</div></div>
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
        const m = item.mission || {};
        const title = (m as { title?: string }).title || 'Missão';
        const desc = (m as { description?: string }).description || '';
        const img = resolveHudImageUrl(item);
        const body = document.getElementById('preflight-mission-detail-body');
        const detail = document.getElementById('preflight-mission-detail');
        const list = document.getElementById('preflight-missions-list');
        if (!body || !detail || !list) return;
        list.style.display = 'none';
        detail.classList.add('visible');
        const canFly = item.has_access;
        const um = item.user_mission;
        const inProgress = um && ['started', 'in_progress'].includes(um.status);
        body.innerHTML = `
            <img class="preflight-hero-img" data-hud-thumb src="${escapeHtml(img || HUD_IMAGE_PLACEHOLDER)}" alt="${escapeHtml(title)}"/>
            <h2 style="font-family:Orbitron,monospace;font-size:14px;color:#40ffaa;margin-bottom:8px">${escapeHtml(title)}</h2>
            <p style="font-size:12px;color:rgba(255,255,255,.6);line-height:1.5;margin-bottom:12px">${escapeHtml(desc)}</p>
            <button type="button" class="preflight-cta-btn" id="preflight-mission-fly" ${canFly ? '' : 'disabled'}>${inProgress ? 'VOAR AGORA' : canFly ? 'INICIAR E VOAR' : 'BLOQUEADO'}</button>
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
        list.innerHTML = '<div class="preflight-msg">Carregando...</div>';
        try {
            const res = await fetch('/api/flight-plans?status=all&limit=100', { headers: authHeaders(this.token) });
            if (!res.ok) {
                list.innerHTML = '<div class="preflight-msg">Falha ao carregar planos</div>';
                return;
            }
            const json = await res.json();
            this.planItems = Array.isArray(json?.data) ? json.data : [];
            this.renderPlanList();
        } catch (err) {
            console.warn('[Preflight] Plans load error:', err);
            list.innerHTML = '<div class="preflight-msg">Erro de conexão</div>';
        }
    }

    private renderPlanList(): void {
        const list = document.getElementById('preflight-plans-list');
        if (!list) return;
        if (!this.planItems.length) {
            list.innerHTML = '<div class="preflight-msg">Nenhum plano de voo</div>';
            return;
        }
        let html = '';
        for (const p of this.planItems) {
            const name = p.name || 'Plano';
            const dep = p.departure_icao || '???';
            const arr = p.arrival_icao || '???';
            const img = resolveHudImageUrl(p);
            html += `<div class="preflight-card" data-plan-id="${p.id}">
                <img data-hud-thumb src="${escapeHtml(img || HUD_IMAGE_PLACEHOLDER)}" alt="" width="72" height="48" style="width:72px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0"/>
                <div><div class="preflight-card-title">${escapeHtml(String(name))}</div>
                <div class="preflight-card-sub">${escapeHtml(String(dep))} → ${escapeHtml(String(arr))}</div></div>
            </div>`;
        }
        list.innerHTML = html;
        attachImgFallback(list);
        list.querySelectorAll<HTMLElement>('[data-plan-id]').forEach((card) => {
            card.addEventListener('click', () => {
                const id = Number(card.dataset.planId);
                const plan = this.planItems.find((x) => Number(x.id) === id);
                if (plan) void this.showPlanDetail(plan);
            });
        });
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
        const img = resolveHudImageUrl(full);
        const canFly = full.has_access === true;
        body.innerHTML = `
            <img class="preflight-hero-img" data-hud-thumb src="${escapeHtml(img || HUD_IMAGE_PLACEHOLDER)}" alt=""/>
            <h2 style="font-family:Orbitron,monospace;font-size:14px;color:#40ffaa;margin-bottom:8px">${escapeHtml(String(name))}</h2>
            <p style="font-size:12px;color:rgba(255,255,255,.55)">${escapeHtml(String(full.departure_icao || ''))} → ${escapeHtml(String(full.arrival_icao || ''))}</p>
            <button type="button" class="preflight-cta-btn" id="preflight-plan-fly" ${canFly ? '' : 'disabled'}>VOAR AGORA</button>
        `;
        attachImgFallback(body);
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
        ensureDefaultSpawnConfig();
        const btn = document.getElementById('preflight-fly-btn') as HTMLButtonElement | null;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'PREPARANDO...';
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
            this.hide();
            const loading = document.getElementById('loading');
            if (loading) {
                loading.style.display = 'flex';
                loading.style.opacity = '1';
            }
            this.flyResolve?.();
            this.flyResolve = null;
        } catch (err) {
            console.warn('[Preflight] Fly free error:', err);
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'VOAR AGORA';
            }
        }
    }
}

export function applyPreflightToUrlAndScene(scene: { setSimTimeOffsetFromIso(iso: string): void }): void {
    ensureDefaultSpawnConfig();
    try {
        const raw = localStorage.getItem(PREFLIGHT_SPAWN_KEY);
        if (!raw) return;
        const spawn = JSON.parse(raw) as PreflightSpawnConfig;
        if (spawn.simTimeIso) scene.setSimTimeOffsetFromIso(spawn.simTimeIso);
        const params = new URLSearchParams(window.location.search);
        params.set('lat', String(spawn.lat));
        params.set('lng', String(spawn.lon));
        params.set('hdg', String(spawn.hdg));
        params.delete('alt');
        params.delete('flightPlanId');
        params.delete('mission_id');
        params.delete('missionId');
        const qs = params.toString();
        history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
        console.debug(`[Preflight] Free flight spawn icao=${spawn.icao} lat=${spawn.lat} lon=${spawn.lon} hdg=${spawn.hdg}`);
    } catch (err) {
        console.warn('[Preflight] applyPreflightToUrlAndScene failed:', err);
    }
}
