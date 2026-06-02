import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { MISSION_TOAST_VISIBLE_MS, MISSION_TOAST_FADE_MS } from '../constants/index.js';
import { resolveHudImageUrl, HUD_IMAGE_PLACEHOLDER, hudImgOnError } from '../../api/hudImageUrl.js';
import { initialBearingDeg } from '../physics/NavMath.js';

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function flightPlanStatusToApi(status: string): number {
    switch (status) {
        case 'in_progress': return 1;
        case 'completed': return 2;
        case 'cancelled': return 3;
        case 'planned':
        default: return 0;
    }
}

const WAYPOINT_REACH_NM = 0.3;

export class MissionSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    setFlightPlanSpawn(plan: any): void {
        const hasRunway = plan?.dep_rwy_latitude != null && plan?.dep_rwy_longitude != null && plan?.dep_rwy_heading != null;
        const hasAirportCenter = plan?.dep_latitude != null && plan?.dep_longitude != null;

        if (!hasRunway && !hasAirportCenter) {
            console.warn('[FlightPlan] Plan missing both runway and airport coordinates — skipping spawn override');
            return;
        }

        const spawnLat = hasRunway ? Number(plan.dep_rwy_latitude) : Number(plan.dep_latitude);
        const spawnLon = hasRunway ? Number(plan.dep_rwy_longitude) : Number(plan.dep_longitude);
        const spawnHdg = hasRunway ? Number(plan.dep_rwy_heading) : Number(plan.dep_rwy_heading ?? 0);

        if (!hasRunway) {
            console.debug('[FlightPlan] Runway data unavailable, using airport center as spawn position');
        }

        this.scene._activeFlightPlanId = Number(plan.id);
        this.scene._activeFlightPlanArrivalAirportId = plan.arrival_airport_id != null ? Number(plan.arrival_airport_id) : null;
        this.patchFlightPlanStatus(this.scene._activeFlightPlanId, 'in_progress');
        this.scene._pendingFlightPlanLat = spawnLat;
        this.scene._pendingFlightPlanLon = spawnLon;
        this.scene._pendingFlightPlanHdg = spawnHdg;
        if (plan.scheduled_departure_at) {
            const scheduled = new Date(plan.scheduled_departure_at).getTime();
            if (!isNaN(scheduled)) {
                this.scene._simTimeOffsetMs = scheduled - Date.now();
                console.log(`[FlightPlan] Sim time offset: ${Math.round(this.scene._simTimeOffsetMs / 60000)} min`);
            }
        }
        const elevFt = plan.dep_rwy_elevation_ft ?? plan.dep_elevation_ft ?? 0;
        this.scene._pendingFlightPlanAltM = Number(elevFt) * 0.3048;
        const arrLat = plan.arr_rwy_latitude ?? plan.arr_latitude;
        const arrLon = plan.arr_rwy_longitude ?? plan.arr_longitude;
        if (arrLat != null && arrLon != null) {
            this.scene._activeFlightPlanNav = {
                departure_lat: spawnLat,
                departure_lon: spawnLon,
                arrival_lat: Number(arrLat),
                arrival_lon: Number(arrLon),
                departure_icao: plan.departure_icao || '',
                arrival_icao: plan.arrival_icao || '',
                name: plan.name || '',
            };
        }

        if (Array.isArray(plan.waypoints) && plan.waypoints.length > 0) {
            this.scene._missionWaypoints = plan.waypoints
                .map((wp: any, i: number) => ({
                    id: Number(wp.id ?? i),
                    order_index: Number(wp.order_index ?? i + 1),
                    name: wp.name ?? null,
                    latitude: Number(wp.latitude ?? wp.lat),
                    longitude: Number(wp.longitude ?? wp.lon),
                    altitude_ft: wp.altitude_ft != null ? Number(wp.altitude_ft) : null,
                }))
                .filter((wp: { latitude: number; longitude: number }) => Number.isFinite(wp.latitude) && Number.isFinite(wp.longitude))
                .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index);
            this.scene._missionCurrentWpIndex = 0;
            console.log(`[FlightPlan] Loaded ${this.scene._missionWaypoints.length} waypoints for plan ${this.scene._activeFlightPlanId}`);
        }

        console.log(`[FlightPlan] Active plan id=${this.scene._activeFlightPlanId}, spawn lat=${spawnLat} lon=${spawnLon} hdg=${spawnHdg} (runway=${hasRunway})`);
    }

    setMissionSpawn(mission: any, userMissionId: number | null): void {
        this.scene._activeMissionId = Number(mission.id);
        this.scene._activeUserMissionId = userMissionId;

        this.scene._pendingFlightPlanLat = null;
        this.scene._pendingFlightPlanLon = null;
        this.scene._pendingFlightPlanHdg = null;
        this.scene._pendingFlightPlanAltM = null;

        const missionType = String(mission.type ?? '').toLowerCase();
        const isDiscovery = missionType === 'discovery';
        const isFreeFlight = missionType === 'free_flight';
        const isRoute = missionType === 'route';

        const waypoints = this.normalizeMissionWaypoints(mission.waypoints);
        this.scene._missionWaypoints = waypoints;
        this.scene._missionCurrentWpIndex = 0;

        const firstWp = waypoints.length > 0 ? waypoints[0] : null;
        const firstWpLat = firstWp ? firstWp.latitude : null;
        const firstWpLon = firstWp ? firstWp.longitude : null;
        const hasFirstWp = firstWpLat != null && firstWpLon != null;

        const headingToFirstWp = (fromLat: number, fromLon: number): number => {
            if (!hasFirstWp || firstWpLat == null || firstWpLon == null) return 0;
            return initialBearingDeg(fromLat, fromLon, firstWpLat, firstWpLon);
        };

        if ((isDiscovery || isFreeFlight) && mission.spawn_latitude != null && mission.spawn_longitude != null) {
            const spawnLat = Number(mission.spawn_latitude);
            const spawnLon = Number(mission.spawn_longitude);
            this.scene._pendingMissionLat = spawnLat;
            this.scene._pendingMissionLon = spawnLon;
            this.scene._pendingMissionAltM = mission.spawn_altitude_ft != null ? Number(mission.spawn_altitude_ft) * 0.3048 : 1000;
            this.scene._pendingMissionHdg = headingToFirstWp(spawnLat, spawnLon);
            this.scene._pendingMissionAirborne = true;
            if (hasFirstWp) {
                console.debug(`[Mission] Spawn heading aligned to next waypoint: hdg=${this.scene._pendingMissionHdg.toFixed(1)}° → wp lat=${firstWpLat} lon=${firstWpLon} order=${firstWp?.order_index}`);
            } else if (waypoints.length > 0) {
                console.warn(`[Mission] Mission ${mission.id} has waypoints but first waypoint coordinates are invalid — spawn heading defaults to 0°`);
            }
        } else if (isRoute && mission.dep_rwy_latitude != null && mission.dep_rwy_longitude != null) {
            this.scene._pendingMissionLat = Number(mission.dep_rwy_latitude);
            this.scene._pendingMissionLon = Number(mission.dep_rwy_longitude);
            const rwyHdg = mission.dep_rwy_heading != null ? Number(mission.dep_rwy_heading) : null;
            this.scene._pendingMissionHdg = rwyHdg != null && Number.isFinite(rwyHdg)
                ? rwyHdg
                : headingToFirstWp(this.scene._pendingMissionLat, this.scene._pendingMissionLon);
            this.scene._pendingMissionAltM = mission.dep_rwy_elevation_ft != null ? Number(mission.dep_rwy_elevation_ft) * 0.3048 : 0;
            this.scene._pendingMissionAirborne = false;
            console.log(`[Mission] Spawning at runway centerline lat=${this.scene._pendingMissionLat} lon=${this.scene._pendingMissionLon} hdg=${this.scene._pendingMissionHdg}`);
        } else if (isRoute && mission.departure_lat != null && mission.departure_lon != null) {
            const depLat = Number(mission.departure_lat);
            const depLon = Number(mission.departure_lon);
            this.scene._pendingMissionLat = depLat;
            this.scene._pendingMissionLon = depLon;
            this.scene._pendingMissionHdg = headingToFirstWp(depLat, depLon);
            this.scene._pendingMissionAltM = 0;
            this.scene._pendingMissionAirborne = false;
            console.warn('[Mission] Route mission has no runway centerline — falling back to airport center');
        } else {
            console.warn(`[Mission] Mission ${mission.id} has no spawn coordinates — skipping spawn override`);
            return;
        }

        if (mission.arrival_lat != null && mission.arrival_lon != null) {
            this.scene._activeMission = {
                departure_lat: this.scene._pendingMissionLat,
                departure_lon: this.scene._pendingMissionLon,
                arrival_lat: Number(mission.arrival_lat),
                arrival_lon: Number(mission.arrival_lon),
                departure_icao: mission.departure_icao || '',
                arrival_icao: mission.arrival_icao || '',
                mission_title: mission.title || '',
            };
        }

        if (this.scene._pendingMissionHdg != null && Number.isFinite(this.scene._pendingMissionHdg)) {
            this.scene.initialHeading = this.scene._pendingMissionHdg;
        }

        console.log(`[Mission] Active mission id=${this.scene._activeMissionId}, type=${mission.type}, spawn lat=${this.scene._pendingMissionLat} lon=${this.scene._pendingMissionLon} hdg=${this.scene._pendingMissionHdg} airborne=${this.scene._pendingMissionAirborne} waypoints=${waypoints.length}`);
    }

    private normalizeMissionWaypoints(raw: unknown): Array<{ id: number; order_index: number; name: string | null; latitude: number; longitude: number; altitude_ft: number | null }> {
        if (!Array.isArray(raw)) return [];
        return raw
            .map((wp: any, i: number) => ({
                id: Number(wp.id ?? i),
                order_index: Number(wp.order_index ?? i + 1),
                name: wp.name ?? null,
                latitude: Number(wp.latitude ?? wp.lat),
                longitude: Number(wp.longitude ?? wp.lon),
                altitude_ft: wp.altitude_ft != null ? Number(wp.altitude_ft) : null,
            }))
            .filter((wp) => Number.isFinite(wp.latitude) && Number.isFinite(wp.longitude))
            .sort((a, b) => a.order_index - b.order_index);
    }

    private computeBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
        return initialBearingDeg(lat1, lon1, lat2, lon2);
    }

    checkWaypointProgress(lat: number, lon: number): void {
        if (!this.scene._missionWaypoints.length) return;
        if (this.scene._missionCurrentWpIndex >= this.scene._missionWaypoints.length) return;
        const total = this.scene._missionWaypoints.length;
        const idx = this.scene._missionCurrentWpIndex;
        const wp = this.scene._missionWaypoints[idx];
        const wpLat = Number(wp.latitude);
        const wpLon = Number(wp.longitude);
        if (!Number.isFinite(wpLat) || !Number.isFinite(wpLon)) {
            console.warn(`[Mission] Skipping invalid waypoint idx=${idx} order=${wp.order_index} lat=${wp.latitude} lon=${wp.longitude}`);
            this.scene._missionCurrentWpIndex++;
            return;
        }
        const dist = this.scene._haversineNm(lat, lon, wpLat, wpLon);
        let passed = false;
        let reason = '';
        if (dist <= WAYPOINT_REACH_NM) {
            passed = true;
            reason = `dist=${dist.toFixed(3)}nm <= reach=${WAYPOINT_REACH_NM}nm`;
        } else {
            const groundSpeedMs = Number(this.scene.groundSpeed) || 0;
            const trackVx = this.scene.velocity?.x ?? 0;
            const trackVz = this.scene.velocity?.z ?? 0;
            if (groundSpeedMs > 5 && (trackVx !== 0 || trackVz !== 0)) {
                const trackTrueDeg = ((Math.atan2(trackVx, -trackVz) * 180) / Math.PI + 360) % 360;
                const bearingToWpDeg = this.computeBearingDeg(lat, lon, wpLat, wpLon);
                const relBearing = Math.abs(((bearingToWpDeg - trackTrueDeg + 540) % 360) - 180);
                if (relBearing > 90 && dist < WAYPOINT_REACH_NM * 8) {
                    passed = true;
                    reason = `abeam relBrg=${relBearing.toFixed(1)}deg dist=${dist.toFixed(3)}nm`;
                }
            }
        }
        if (passed) {
            const reachedNum = idx + 1;
            console.log(`[Mission] WP ${reachedNum}/${total} reached: order=${wp.order_index} name="${wp.name ?? 'unnamed'}" ${reason}`);
            this.scene._missionCurrentWpIndex++;
            if (this.scene._missionCurrentWpIndex >= total) {
                if (this.scene._activeUserMissionId) {
                    console.log(`[Mission] All ${total} waypoints reached, calling /complete for userMissionId=${this.scene._activeUserMissionId}`);
                    this.completeActiveMission();
                } else if (this.scene._activeFlightPlanId) {
                    console.log(`[FlightPlan] All ${total} waypoints reached, marking plan ${this.scene._activeFlightPlanId} as completed`);
                    this.patchFlightPlanStatus(this.scene._activeFlightPlanId, 'completed');
                    this.scene._activeFlightPlanId = null;
                    this.scene._missionWaypoints = [];
                    this.scene._missionCurrentWpIndex = 0;
                }
            }
        }
    }

    async completeActiveMission(): Promise<void> {
        const umId = this.scene._activeUserMissionId;
        if (!umId || this.scene._completedUserMissionIds.has(umId) || this.scene._missionCompletionInFlight) return;
        this.scene._missionCompletionInFlight = true;
        const completedTitle = this.scene._activeMission?.mission_title || '';
        try {
            const token = localStorage.getItem('auth_token') || '';
            const res = await fetch(`/api/user-missions/${umId}/complete`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                console.log(`[Mission] Completed userMissionId=${umId}`);
                this.scene._completedUserMissionIds.add(umId);
                this.scene._activeMissionId = null;
                this.scene._activeUserMissionId = null;
                this.scene._activeMission = null;
                this.scene._missionWaypoints = [];
                this.showMissionCompleteToast(completedTitle);
                this.loadMissions();
            } else {
                console.warn(`[Mission] Complete failed: HTTP ${res.status}`);
            }
        } catch (err) {
            console.error('[Mission] Complete error:', err);
        } finally {
            this.scene._missionCompletionInFlight = false;
        }
    }

    showMissionCompleteToast(missionTitle: string): void {
        try {
            if (typeof document === 'undefined' || !document.body) {
                console.warn('[Mission] Toast skipped: document or body unavailable');
                return;
            }
            const existing = document.getElementById('mission-complete-toast');
            if (existing && existing.parentElement) existing.parentElement.removeChild(existing);

            const toast = document.createElement('div');
            toast.id = 'mission-complete-toast';
            const safeTitle = String(missionTitle ?? '').replace(/[<>&"']/g, (ch) => ({
                '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\'': '&#39;',
            } as Record<string, string>)[ch] || ch);
            toast.innerHTML = `
                <div class="mct-card">
                    <div class="mct-title">MISSÃO CONCLUÍDA</div>
                    ${safeTitle ? `<div class="mct-sub">${safeTitle}</div>` : ''}
                </div>
            `;
            toast.style.cssText = [
                'position:fixed',
                'top:80px',
                'left:50%',
                'transform:translateX(-50%) translateY(-12px)',
                'z-index:10000',
                'pointer-events:none',
                'opacity:0',
                `transition:opacity ${MISSION_TOAST_FADE_MS}ms ease, transform ${MISSION_TOAST_FADE_MS}ms ease`,
                'font-family:Orbitron,monospace',
            ].join(';');

            const style = document.createElement('style');
            style.textContent = `
                #mission-complete-toast .mct-card {
                    background: linear-gradient(180deg, rgba(0,40,20,0.92), rgba(0,20,10,0.92));
                    border: 1px solid rgba(0,255,128,0.7);
                    border-radius: 8px;
                    padding: 14px 28px;
                    color: #79ffaa;
                    text-align: center;
                    box-shadow: 0 4px 24px rgba(0,255,128,0.25), 0 0 40px rgba(0,255,128,0.15);
                    min-width: 240px;
                }
                #mission-complete-toast .mct-title {
                    font-size: 18px;
                    font-weight: 700;
                    letter-spacing: 0.18em;
                    text-shadow: 0 0 10px rgba(0,255,128,0.6);
                }
                #mission-complete-toast .mct-sub {
                    font-family: Inter, sans-serif;
                    font-size: 12px;
                    color: rgba(255,255,255,0.85);
                    margin-top: 6px;
                    letter-spacing: 0.04em;
                }
            `;
            toast.appendChild(style);
            document.body.appendChild(toast);

            requestAnimationFrame(() => {
                if (this.scene._disposed || !toast.isConnected) return;
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(-50%) translateY(0)';
            });

            this.scene._safeSetTimeout(() => {
                if (!toast.isConnected) return;
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(-12px)';
                this.scene._safeSetTimeout(() => {
                    if (toast.parentElement) toast.parentElement.removeChild(toast);
                }, MISSION_TOAST_FADE_MS);
            }, MISSION_TOAST_VISIBLE_MS);

            try { this.scene._doHaptic([60, 60, 120]); } catch { /* ignore */ }
        } catch (err) {
            console.warn('[Mission] Failed to show completion toast:', err);
        }
    }

    setupMissionsBtn(): void {
        if (!this.scene._missionBtnEl || !this.scene._missionPanelEl) return;
        const btn = this.scene._missionBtnEl;
        const panel = this.scene._missionPanelEl;

        btn.addEventListener('mouseenter', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.7)'; btn.style.boxShadow = '0 0 8px rgba(0,255,128,.2)'; } });
        btn.addEventListener('mouseleave', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none'; } });

        btn.addEventListener('click', () => {
            const visible = panel.style.display !== 'none';
            this.scene._closeAllPanels(visible ? null : panel);
            if (visible) {
                panel.style.display = 'none';
                btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none';
            } else {
                panel.style.display = 'block';
                btn.style.borderColor = 'rgba(80,255,160,.9)'; btn.style.boxShadow = '0 0 12px rgba(0,255,128,.35)';
                this.loadMissions();
            }
        });
    }

    wireMissionsToolbar(): void {
        if (this.scene._missionsSearchWired) return;
        const search = document.getElementById('missions-search') as HTMLInputElement | null;
        const sort = document.getElementById('missions-sort') as HTMLSelectElement | null;
        if (search) {
            search.addEventListener('input', () => this.renderMissionsList());
        }
        if (sort) {
            sort.addEventListener('change', () => this.renderMissionsList());
        }
        this.scene._missionsSearchWired = true;
    }

    async loadMissions(): Promise<void> {
        const listEl = document.getElementById('missions-list');
        if (!listEl) return;
        listEl.textContent = 'Loading...';

        this.wireMissionsToolbar();

        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Login required</div>';
            return;
        }

        try {
            const res = await fetch('/api/user-missions', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) {
                console.warn(`[FlightScene] User-missions fetch failed: HTTP ${res.status}`);
                listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Failed to load missions</div>';
                return;
            }
            const json = await res.json();
            const catalog = Array.isArray(json?.data) ? json.data : [];

            this.scene._missionsCache = catalog;

            if (!catalog.length) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,.4)">No missions</div>';
                this.scene._activeMission = null;
                this.scene._activeUserMissionId = null;
                this.scene._activeMissionId = null;
                this.scene._missionWaypoints = [];
                this.scene._missionCurrentWpIndex = 0;
                return;
            }

            this.renderMissionsList();

            const activeFromList = catalog.find((item: any) => item?.user_mission?.status === 'in_progress');
            const ami = activeFromList?.mission || {};
            if (activeFromList && ami) {
                const depLat = ami.departure_lat ?? activeFromList.departure_lat;
                const depLon = ami.departure_lon ?? activeFromList.departure_lon;
                const arrLat = ami.arrival_lat ?? activeFromList.arrival_lat;
                const arrLon = ami.arrival_lon ?? activeFromList.arrival_lon;
                if (depLat != null && depLon != null) {
                this.scene._activeMission = {
                    departure_lat: Number(depLat),
                    departure_lon: Number(depLon),
                    arrival_lat: arrLat != null ? Number(arrLat) : Number(depLat),
                    arrival_lon: arrLon != null ? Number(arrLon) : Number(depLon),
                    departure_icao: ami.departure_icao || activeFromList.departure_icao || '',
                    arrival_icao: ami.arrival_icao || activeFromList.arrival_icao || '',
                    mission_title: ami.title || activeFromList.mission_title || '',
                };
                this.scene._activeUserMissionId = activeFromList.user_mission?.id ?? null;
                this.scene._activeMissionId = activeFromList.mission_id ?? null;
                this.scene._missionWaypoints = Array.isArray(ami.waypoints) ? ami.waypoints : [];
                this.scene._missionCurrentWpIndex = 0;
                }
            } else {
                this.scene._activeMission = null;
                this.scene._activeUserMissionId = null;
                this.scene._activeMissionId = null;
                this.scene._missionWaypoints = [];
                this.scene._missionCurrentWpIndex = 0;
            }
        } catch (err) {
            console.warn('[FlightScene] Missions panel load error:', err);
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Connection error</div>';
        }
    }

    renderMissionsList(): void {
        const listEl = document.getElementById('missions-list');
        if (!listEl) return;
        const search = (document.getElementById('missions-search') as HTMLInputElement | null)?.value?.trim().toLowerCase() ?? '';
        const sortKey = (document.getElementById('missions-sort') as HTMLSelectElement | null)?.value ?? 'status';

        try {
            let visible = this.scene._missionsCache.slice();
            if (search) {
                visible = visible.filter((um: any) => {
                    const title = (um.mission_title || um.mission?.title || '').toLowerCase();
                    const dep = (um.departure_icao || um.mission?.departure_icao || '').toLowerCase();
                    const arr = (um.arrival_icao || um.mission?.arrival_icao || '').toLowerCase();
                    const type = (um.mission_type || um.mission?.type || '').toLowerCase();
                    return title.includes(search) || dep.includes(search) || arr.includes(search) || type.includes(search);
                });
            }
            visible.sort((a: any, b: any) => {
                if (sortKey === 'title') {
                    return (a.mission_title || a.mission?.title || '').localeCompare(b.mission_title || b.mission?.title || '');
                }
                if (sortKey === 'difficulty') {
                    return Number(a.mission_difficulty ?? a.mission?.difficulty ?? 0) - Number(b.mission_difficulty ?? b.mission?.difficulty ?? 0);
                }
                if (sortKey === 'distance') {
                    return Number(a.mission_distance_nm ?? a.mission?.distance_nm ?? 0) - Number(b.mission_distance_nm ?? b.mission?.distance_nm ?? 0);
                }
                const aInProg = a?.user_mission?.status === 'in_progress' ? 0 : 1;
                const bInProg = b?.user_mission?.status === 'in_progress' ? 0 : 1;
                if (aInProg !== bInProg) return aInProg - bInProg;
                return 0;
            });

            if (!visible.length) {
                listEl.innerHTML = `<div style="color:rgba(255,255,255,.4)">${search ? 'Nenhuma miss\u00e3o encontrada' : 'No missions acquired'}</div>`;
                return;
            }

            let html = '';
            for (const item of visible) {
                const mid = Number(item?.mission_id);
                if (!Number.isFinite(mid) || mid <= 0) continue;
                const mi = item.mission || {};
                const um = item.user_mission;
                const isInProgress = um?.status === 'in_progress';
                const canStart = um && ['started', 'in_progress'].includes(um.status) && item.has_access;
                const borderColor = isInProgress ? 'rgba(80,255,160,.5)' : item.has_access ? 'rgba(255,200,80,.35)' : 'rgba(255,255,255,.12)';
                const mType = item.mission_type || mi.type || '';
                const depIcao = item.departure_icao || mi.departure_icao || '';
                const arrIcao = item.arrival_icao || mi.arrival_icao || '';
                const depName = item.departure_airport_name || mi.departure_airport_name || '';
                const arrName = item.arrival_airport_name || mi.arrival_airport_name || '';
                const img = resolveHudImageUrl(item);
                const isRoute = depIcao && arrIcao;
                let routeHtml = '';
                if (isRoute) {
                    routeHtml = `<div style="font-size:10px;color:rgba(255,255,255,.5)">${escapeHtml(depIcao)} <span style="color:#40ffaa">\u2708</span> ${escapeHtml(arrIcao)}</div>
                        <div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:2px">${escapeHtml(depName)} \u2192 ${escapeHtml(arrName)}</div>`;
                } else if (mType === 'discovery') {
                    routeHtml = `<div style="font-size:10px;color:rgba(255,255,255,.5)"><span style="color:#40ffaa">\u2708</span> Discovery Flight</div>`;
                } else {
                    routeHtml = `<div style="font-size:10px;color:rgba(255,255,255,.5)">${escapeHtml(mType || 'Free Flight')}</div>`;
                }

                let actionHtml = '';
                if (isInProgress) {
                    actionHtml = `<div style="font-size:9px;color:#40ffaa;letter-spacing:.08em;margin-top:6px">EM PROGRESSO</div>`;
                } else if (canStart) {
                    const umId = Number(um?.id);
                    actionHtml = `<button class="mission-start-btn" data-mission-id="${mid}" data-user-mission-id="${umId}" style="margin-top:6px;padding:4px 10px;background:rgba(0,80,40,.6);border:1px solid rgba(80,255,160,.5);border-radius:4px;color:#40ffaa;font-size:10px;font-family:'Orbitron',monospace;letter-spacing:.08em;cursor:pointer">INICIAR JOGO</button>`;
                } else if (item.has_access && !um) {
                    actionHtml = `<button class="mission-acquire-btn" data-mission-id="${mid}" style="margin-top:6px;padding:4px 10px;background:rgba(0,80,40,.6);border:1px solid rgba(80,255,160,.5);border-radius:4px;color:#40ffaa;font-size:10px;font-family:'Orbitron',monospace;letter-spacing:.08em;cursor:pointer">INICIAR JOGO</button>`;
                } else if (!item.has_access) {
                    actionHtml = `<div style="font-size:9px;color:rgba(255,120,120,.8);margin-top:6px">BLOQUEADO</div>`;
                }

                html += `<div style="border:1px solid ${borderColor};border-radius:6px;padding:8px;margin-bottom:6px;background:rgba(0,20,15,.4);display:flex;gap:8px;align-items:flex-start">
                    <img data-hud-thumb src="${escapeHtml(img || HUD_IMAGE_PLACEHOLDER)}" alt="" width="56" height="40" style="width:56px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0"/>
                    <div style="flex:1;min-width:0">
                    <div style="font-weight:600;color:#fff;margin-bottom:4px">${escapeHtml(item.mission_title || mi.title || 'Mission')}</div>
                    ${routeHtml}
                    ${actionHtml}
                    </div>
                </div>`;
            }
            listEl.innerHTML = html;
            listEl.querySelectorAll<HTMLImageElement>('img[data-hud-thumb]').forEach((imgEl) => {
                imgEl.addEventListener('error', () => hudImgOnError(imgEl), { once: true });
            });

            const startButtons = listEl.querySelectorAll<HTMLButtonElement>('.mission-start-btn');
            startButtons.forEach((btn) => {
                btn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const target = ev.currentTarget as HTMLButtonElement;
                    const mid = target.dataset.missionId;
                    const umIdStr = target.dataset.userMissionId;
                    if (!mid) {
                        console.warn('[FlightScene] Mission START button clicked without mission id');
                        return;
                    }
                    const startMissionId = Number(mid);
                    if (!Number.isFinite(startMissionId) || startMissionId <= 0) {
                        console.warn(`[FlightScene] Invalid mission id on START button: ${mid}`);
                        return;
                    }
                    const startUserMissionId = Number(umIdStr);
                    if (!Number.isFinite(startUserMissionId) || startUserMissionId <= 0) {
                        console.warn(`[FlightScene] Invalid user-mission id on START button: ${umIdStr}`);
                        return;
                    }
                    target.disabled = true;
                    target.textContent = 'CARREGANDO...';
                    const tk = localStorage.getItem('auth_token') || '';
                    if (!tk) {
                        console.warn('[FlightScene] Cannot promote mission: no auth token');
                        target.disabled = false;
                        target.textContent = 'INICIAR JOGO';
                        return;
                    }
                    try {
                        const promoteRes = await fetch(`/api/user-missions/${startUserMissionId}/start`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${tk}` },
                        });
                        if (!promoteRes.ok && promoteRes.status !== 409) {
                            console.warn(`[FlightScene] Failed to start user-mission ${startUserMissionId}: HTTP ${promoteRes.status}`);
                            target.disabled = false;
                            target.textContent = 'INICIAR JOGO';
                            return;
                        }
                        if (promoteRes.status === 409) {
                            console.log(`[FlightScene] user-mission ${startUserMissionId} already in_progress (409 idempotent), launching mission ${startMissionId}`);
                        } else {
                            console.log(`[FlightScene] Started user-mission ${startUserMissionId} (in_progress), launching mission ${startMissionId}`);
                        }
                    } catch (err) {
                        console.warn(`[FlightScene] Start user-mission ${startUserMissionId} error:`, err);
                        target.disabled = false;
                        target.textContent = 'INICIAR JOGO';
                        return;
                    }
                    window.location.href = `flight.html?mission_id=${encodeURIComponent(String(startMissionId))}`;
                });
            });

            const acquireButtons = listEl.querySelectorAll<HTMLButtonElement>('.mission-acquire-btn');
            acquireButtons.forEach((btn) => {
                btn.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    const mid = Number((ev.currentTarget as HTMLButtonElement).dataset.missionId);
                    if (!Number.isFinite(mid) || mid <= 0) return;
                    const target = ev.currentTarget as HTMLButtonElement;
                    target.disabled = true;
                    target.textContent = 'CARREGANDO...';
                    const tk = localStorage.getItem('auth_token') || '';
                    if (!tk) {
                        target.disabled = false;
                        target.textContent = 'INICIAR JOGO';
                        return;
                    }
                    let userMissionId: number | null = null;
                    try {
                        const postRes = await fetch('/api/user-missions', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ mission_id: mid }),
                        });
                        if (postRes.ok) {
                            const data = await postRes.json();
                            userMissionId = data?.id != null ? Number(data.id) : null;
                        } else if (postRes.status === 409) {
                            const recoverRes = await fetch('/api/user-missions/active', {
                                headers: { Authorization: `Bearer ${tk}` },
                            });
                            if (recoverRes.ok) {
                                const recoverJson = await recoverRes.json();
                                const recoverList: any[] = Array.isArray(recoverJson?.data) ? recoverJson.data : [];
                                const existing = recoverList.find((um: any) => Number(um?.mission_id) === mid);
                                if (existing?.id != null) userMissionId = Number(existing.id);
                            }
                        } else {
                            console.warn(`[FlightScene] Mission acquire failed: HTTP ${postRes.status}`);
                            target.disabled = false;
                            target.textContent = 'INICIAR JOGO';
                            return;
                        }
                        if (userMissionId != null) {
                            const promoteRes = await fetch(`/api/user-missions/${userMissionId}/start`, {
                                method: 'PUT',
                                headers: { Authorization: `Bearer ${tk}` },
                            });
                            if (!promoteRes.ok && promoteRes.status !== 409) {
                                console.warn(`[FlightScene] Mission start after acquire failed: HTTP ${promoteRes.status}`);
                                target.disabled = false;
                                target.textContent = 'INICIAR JOGO';
                                return;
                            }
                        }
                        window.location.href = `flight.html?mission_id=${encodeURIComponent(String(mid))}`;
                    } catch (err) {
                        console.warn('[FlightScene] Mission acquire flow error:', err);
                        target.disabled = false;
                        target.textContent = 'INICIAR JOGO';
                    }
                });
            });
        } catch (err) {
            console.warn('[FlightScene] Render missions list error:', err);
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Render error</div>';
        }
    }

    setupFlightPlansBtn(): void {
        if (!this.scene._flightPlansBtnEl || !this.scene._flightPlansPanelEl) return;
        const btn = this.scene._flightPlansBtnEl;
        const panel = this.scene._flightPlansPanelEl;

        btn.addEventListener('mouseenter', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.7)'; btn.style.boxShadow = '0 0 8px rgba(0,255,128,.2)'; } });
        btn.addEventListener('mouseleave', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none'; } });

        btn.addEventListener('click', () => {
            const visible = panel.style.display !== 'none';
            this.scene._closeAllPanels(visible ? null : panel);
            if (visible) {
                panel.style.display = 'none';
                btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none';
            } else {
                panel.style.display = 'block';
                btn.style.borderColor = 'rgba(80,255,160,.9)'; btn.style.boxShadow = '0 0 12px rgba(0,255,128,.35)';
                this.loadFlightPlans();
            }
        });
    }

    async loadFlightPlans(): Promise<void> {
        const listEl = document.getElementById('flight-plans-list');
        if (!listEl) return;
        listEl.textContent = 'Loading...';

        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Login required</div>';
            return;
        }

        try {
            const res = await fetch('/api/flight-plans?status=all&limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Failed to load flight plans</div>';
                return;
            }
            const json = await res.json();
            const plans = json.data || [];

            if (!plans.length) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,.4)">No flight plans</div>';
                return;
            }

            let html = '';
            for (const p of plans) {
                const name = p.name || 'Unnamed plan';
                const depIcao = p.departure_icao || '???';
                const arrIcao = p.arrival_icao || '???';
                const depRwy = p.dep_rwy_ident ? ` RWY ${p.dep_rwy_ident}` : '';
                const arrRwy = p.arr_rwy_ident ? ` RWY ${p.arr_rwy_ident}` : '';
                const scheduled = p.scheduled_departure_at ? new Date(p.scheduled_departure_at).toLocaleString() : '';
                const img = resolveHudImageUrl(p);
                const canStart = p.has_access === true;
                const btnStyle = canStart
                    ? 'margin-top:6px;background:rgba(0,255,128,.15);border:1px solid rgba(80,255,160,.4);color:#40ffaa;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:9px;font-family:inherit;letter-spacing:.06em'
                    : 'margin-top:6px;background:rgba(80,80,80,.2);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.35);padding:3px 10px;border-radius:3px;font-size:9px;font-family:inherit;letter-spacing:.06em;cursor:not-allowed';
                html += `<div style="border:1px solid rgba(80,255,160,.25);border-radius:6px;padding:8px;margin-bottom:6px;background:rgba(0,20,15,.4);display:flex;gap:8px">
                    <img data-hud-thumb src="${escapeHtml(img || HUD_IMAGE_PLACEHOLDER)}" alt="" width="56" height="40" style="width:56px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0"/>
                    <div style="flex:1">
                    <div style="font-weight:600;color:#fff;margin-bottom:4px">${escapeHtml(name)}</div>
                    <div style="font-size:10px;color:rgba(255,255,255,.6)">
                        ${escapeHtml(depIcao)}${escapeHtml(depRwy)} <span style="color:#40ffaa">\u2708</span> ${escapeHtml(arrIcao)}${escapeHtml(arrRwy)}
                    </div>
                    <div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:2px">${escapeHtml(p.departure_airport_name || '')} \u2192 ${escapeHtml(p.arrival_airport_name || '')}</div>
                    ${scheduled ? `<div style="font-size:9px;color:rgba(255,200,0,.6);margin-top:3px">\u{1F552} ${escapeHtml(scheduled)}</div>` : ''}
                    <button data-start-plan="${p.id}" data-can-start="${canStart ? '1' : '0'}" ${canStart ? '' : 'disabled'} style="${btnStyle}">START</button>
                    </div>
                </div>`;
            }
            listEl.innerHTML = html;
            listEl.querySelectorAll<HTMLImageElement>('img[data-hud-thumb]').forEach((imgEl) => {
                imgEl.addEventListener('error', () => hudImgOnError(imgEl), { once: true });
            });

            listEl.querySelectorAll('[data-start-plan]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    const target = e.currentTarget as HTMLElement;
                    if (target.getAttribute('data-can-start') !== '1') return;
                    const planId = target.getAttribute('data-start-plan');
                    if (planId) {
                        window.location.search = `?flightPlanId=${planId}`;
                    }
                });
            });
        } catch (err) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Connection error</div>';
        }
    }

    async patchFlightPlanStatus(planId: number, status: string): Promise<void> {
        const token = localStorage.getItem('auth_token') || '';
        if (!token) return;
        const statusCode = flightPlanStatusToApi(status);
        try {
            const res = await fetch(`/api/flight-plans/${planId}/status`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: statusCode }),
            });
            if (!res.ok) console.warn(`[FlightPlan] PATCH status=${statusCode} failed: ${res.status}`);
            else console.log(`[FlightPlan] Plan ${planId} status -> ${statusCode}`);
        } catch (err) {
            console.error('[FlightPlan] PATCH status error:', err);
        }
    }
}
