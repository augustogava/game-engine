import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { MISSION_TOAST_VISIBLE_MS, MISSION_TOAST_FADE_MS } from '../constants/index.js';
import { resolveHudImageUrl, HUD_IMAGE_PLACEHOLDER, hudImgOnError } from '../../api/hudImageUrl.js';
import { initialBearingDeg, haversineNm } from '../physics/NavMath.js';

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const WAYPOINT_REACH_NM = 0.3;

export class MissionSystem {
    private readonly scene: any;
    private _lastWxRefreshMs = 0;
    private _lastWxLat = Number.NaN;
    private _lastWxLon = Number.NaN;

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
                dep_rwy_ident: plan.dep_rwy_ident || '',
                arr_rwy_ident: plan.arr_rwy_ident || '',
                dep_rwy_heading: plan.dep_rwy_heading != null ? Number(plan.dep_rwy_heading) : null,
                arr_rwy_heading: plan.arr_rwy_heading != null ? Number(plan.arr_rwy_heading) : null,
                dep_elevation_ft: plan.dep_rwy_elevation_ft ?? plan.dep_elevation_ft ?? null,
                arr_elevation_ft: plan.arr_rwy_elevation_ft ?? plan.arr_elevation_ft ?? null,
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
        if (!this.scene._missionWaypoints.length) {
            this.checkDirectMissionArrival(lat, lon);
            return;
        }
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

    private checkDirectMissionArrival(lat: number, lon: number): void {
        if (!this.scene._activeUserMissionId || this.scene._missionCompletionInFlight) return;
        const mission = this.scene._activeMission;
        if (!mission || mission.arrival_lat == null || mission.arrival_lon == null) return;
        const arrLat = Number(mission.arrival_lat);
        const arrLon = Number(mission.arrival_lon);
        if (!Number.isFinite(arrLat) || !Number.isFinite(arrLon)) return;
        const dist = this.scene._haversineNm(lat, lon, arrLat, arrLon);
        if (dist > WAYPOINT_REACH_NM) return;
        console.log(`[Mission] Destination reached without waypoints: dist=${dist.toFixed(3)}nm, completing userMissionId=${this.scene._activeUserMissionId}`);
        this.completeActiveMission();
    }

    async completeActiveMission(): Promise<void> {
        const umId = this.scene._activeUserMissionId;
        if (!umId || this.scene._completedUserMissionIds.has(umId) || this.scene._missionCompletionInFlight) return;
        this.scene._missionCompletionInFlight = true;
        const completedTitle = this.scene._activeMission?.mission_title || '';
        const completedRewardRaw = Number(this.scene._activeMission?.reward_points);
        const completedReward = Number.isFinite(completedRewardRaw) && completedRewardRaw > 0 ? completedRewardRaw : 0;
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
                this.showMissionCompleteToast(completedTitle, completedReward);
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

    showMissionCompleteToast(missionTitle: string, rewardPoints = 0): void {
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
            const safeReward = Number.isFinite(rewardPoints) && rewardPoints > 0 ? Math.round(rewardPoints) : 0;
            toast.innerHTML = `
                <div class="mct-card">
                    <div class="mct-title">MISSÃO CONCLUÍDA</div>
                    ${safeTitle ? `<div class="mct-sub">${safeTitle}</div>` : ''}
                    ${safeReward > 0 ? `<div class="mct-pts">+${safeReward} pts</div>` : ''}
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
                #mission-complete-toast .mct-pts {
                    font-size: 16px;
                    font-weight: 700;
                    color: #ffe27a;
                    margin-top: 8px;
                    letter-spacing: 0.08em;
                    text-shadow: 0 0 10px rgba(255,210,80,0.55);
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

    async loadDailyMissionBanner(): Promise<void> {
        try {
            const listEl = document.getElementById('missions-list');
            if (!listEl || !listEl.parentElement) return;
            const token = localStorage.getItem('auth_token') || '';
            if (!token) return;
            const resp = await fetch('/api/missions/daily', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) return;
            const json = await resp.json();
            const daily = json?.data;
            if (!daily || !daily.id) return;
            let banner = document.getElementById('daily-mission-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'daily-mission-banner';
                listEl.parentElement.insertBefore(banner, listEl);
            }
            const esc = (s: unknown): string => String(s ?? '').replace(/[<>&"']/g, (ch) => ({
                '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\'': '&#39;',
            } as Record<string, string>)[ch] || ch);
            const streak = Number(daily.flight_streak_days) || 0;
            const bonus = Number(daily.daily_bonus_points) || 0;
            const done = daily.completed_today === true;
            banner.innerHTML = `
                <div style="border:1px solid rgba(255,210,80,.55);border-radius:6px;padding:8px 10px;margin-bottom:8px;background:linear-gradient(180deg,rgba(40,32,0,.55),rgba(20,16,0,.45))">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                        <span style="font-family:Orbitron,monospace;font-size:9px;color:#ffe27a;letter-spacing:.12em">MISSÃO DO DIA${done ? ' ✓' : ''}</span>
                        ${bonus > 0 ? `<span style="font-size:9px;color:#ffe27a;white-space:nowrap">+${bonus} pts bônus</span>` : ''}
                    </div>
                    <div style="font-size:11px;color:rgba(255,255,255,.9);margin-top:4px;font-weight:600">${esc(daily.title)}</div>
                    ${streak > 0 ? `<div style="font-size:9px;color:rgba(100,240,180,.7);margin-top:3px">🔥 Streak de voo: ${streak} dia(s)</div>` : ''}
                </div>
            `;
        } catch (err) {
            console.warn('[Mission] Daily mission banner load failed:', err);
        }
    }

    async loadMissions(): Promise<void> {
        const listEl = document.getElementById('missions-list');
        if (!listEl) return;
        listEl.textContent = 'Loading...';

        this.wireMissionsToolbar();
        void this.loadDailyMissionBanner();

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
                this.scene._missionWaypoints = this.normalizeMissionWaypoints(ami.waypoints);
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
        try {
            const res = await fetch(`/api/flight-plans/${planId}/status`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) console.warn(`[FlightPlan] PATCH status=${status} failed: ${res.status}`);
            else console.log(`[FlightPlan] Plan ${planId} status -> ${status}`);
        } catch (err) {
            console.error('[FlightPlan] PATCH status error:', err);
        }
    }

    setupLogbookBtn(): void {
        if (!this.scene._logbookBtnEl || !this.scene._logbookPanelEl) return;
        const btn = this.scene._logbookBtnEl;
        const panel = this.scene._logbookPanelEl;

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
                this.loadLogbook(1);
            }
        });
    }

    async loadLogbook(page: number = 1): Promise<void> {
        const listEl = document.getElementById('logbook-list');
        if (!listEl) return;
        const safePage = Math.max(1, Math.floor(page) || 1);
        listEl.textContent = 'Carregando...';

        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Login necessário</div>';
            return;
        }

        const limit = 20;
        try {
            const res = await fetch(`/api/flight-logs?page=${safePage}&limit=${limit}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Falha ao carregar logbook</div>';
                console.warn(`[Logbook] GET /api/flight-logs failed: ${res.status}`);
                return;
            }
            const json = await res.json();
            const logs = Array.isArray(json.data) ? json.data : [];
            const total = Number(json.total) || logs.length;

            if (!logs.length) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,.4)">Sem voos registrados</div>';
                return;
            }

            const statusMap: Record<string, { label: string; color: string }> = {
                landed: { label: 'Pousou', color: '#40ffaa' },
                cancelled: { label: 'Cancelado', color: '#ffaa55' },
                in_flight: { label: 'Em voo', color: '#9cf' },
                departed: { label: 'Decolou', color: '#9cf' },
            };

            let html = '';
            for (const log of logs) {
                const st = statusMap[log.status] || { label: String(log.status || '\u2014'), color: 'rgba(255,255,255,.6)' };
                const depIcao = log.departure_icao || '???';
                const arrIcao = log.arrival_icao || '???';
                const dur = log.flight_duration_min != null ? `${Number(log.flight_duration_min).toFixed(0)} min` : '\u2014';
                const distNm = log.distance_nm != null ? `${Number(log.distance_nm).toFixed(1)} nm` : '\u2014';
                const maxAlt = log.max_altitude_ft != null ? `${Number(log.max_altitude_ft).toFixed(0)} ft` : '\u2014';
                const avgSpd = log.avg_speed_knots != null ? `${Number(log.avg_speed_knots).toFixed(0)} kt` : '\u2014';
                const lr = log.landing_rate_fpm != null ? `${Number(log.landing_rate_fpm).toFixed(0)} fpm` : '\u2014';
                const when = log.departure_time ? new Date(log.departure_time).toLocaleString() : '';
                html += `<div style="border:1px solid rgba(80,255,160,.25);border-radius:6px;padding:8px;margin-bottom:6px;background:rgba(0,20,15,.4)">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                        <span style="font-weight:600;color:#fff">${escapeHtml(depIcao)} <span style="color:#40ffaa">\u2708</span> ${escapeHtml(arrIcao)}</span>
                        <span style="font-size:9px;color:${st.color};border:1px solid ${st.color};border-radius:3px;padding:1px 6px">${escapeHtml(st.label)}</span>
                    </div>
                    <div style="font-size:9px;color:rgba(255,255,255,.4);margin-bottom:4px">${escapeHtml((log.departure_name || '') + (log.arrival_name ? ' \u2192 ' + log.arrival_name : ''))}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:10px;color:rgba(255,255,255,.7)">
                        <span>\u23F1 ${escapeHtml(dur)}</span>
                        <span>\u2194 ${escapeHtml(distNm)}</span>
                        <span>\u2191 ${escapeHtml(maxAlt)}</span>
                        <span>GS ${escapeHtml(avgSpd)}</span>
                        ${log.status === 'landed' ? `<span>\u{1F6EC} ${escapeHtml(lr)}</span>` : ''}
                    </div>
                    ${when ? `<div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:3px">${escapeHtml(when)}</div>` : ''}
                </div>`;
            }

            const totalPages = Math.max(1, Math.ceil(total / limit));
            if (totalPages > 1) {
                const prevDisabled = safePage <= 1;
                const nextDisabled = safePage >= totalPages;
                const pagerBtn = (enabled: boolean) => enabled
                    ? 'background:rgba(0,255,128,.15);border:1px solid rgba(80,255,160,.4);color:#40ffaa;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:9px;font-family:inherit'
                    : 'background:rgba(80,80,80,.2);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.35);padding:3px 10px;border-radius:3px;font-size:9px;font-family:inherit;cursor:not-allowed';
                html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                    <button data-logbook-prev ${prevDisabled ? 'disabled' : ''} style="${pagerBtn(!prevDisabled)}">Anterior</button>
                    <span style="font-size:9px;color:rgba(255,255,255,.5)">${safePage} / ${totalPages}</span>
                    <button data-logbook-next ${nextDisabled ? 'disabled' : ''} style="${pagerBtn(!nextDisabled)}">Próximo</button>
                </div>`;
            }

            listEl.innerHTML = html;
            const prevBtn = listEl.querySelector('[data-logbook-prev]');
            if (prevBtn) prevBtn.addEventListener('click', () => { if (safePage > 1) this.loadLogbook(safePage - 1); });
            const nextBtn = listEl.querySelector('[data-logbook-next]');
            if (nextBtn) nextBtn.addEventListener('click', () => { if (safePage < totalPages) this.loadLogbook(safePage + 1); });
            console.log(`[Logbook] Loaded page ${safePage}/${totalPages} (${logs.length} of ${total})`);
        } catch (err) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Erro de conexão</div>';
            console.error('[Logbook] load error:', err);
        }
    }

    setupEfbBtn(): void {
        if (!this.scene._efbBtnEl || !this.scene._efbPanelEl) return;
        const btn = this.scene._efbBtnEl;
        const panel = this.scene._efbPanelEl;

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
                this.renderEfb();
            }
        });
    }

    renderEfb(): void {
        const el = document.getElementById('efb-content');
        if (!el) return;
        try {
            const nav = this.scene._activeFlightPlanNav || this.scene._activeMission || null;
            const wps = Array.isArray(this.scene._missionWaypoints) ? this.scene._missionWaypoints : [];
            const hasRoute = !!nav || wps.length > 0;

            const points: { label: string; lat: number; lon: number; alt: number | null }[] = [];
            if (nav && Number.isFinite(nav.departure_lat) && Number.isFinite(nav.departure_lon)) {
                const depRwy = nav.dep_rwy_ident ? ` RWY ${nav.dep_rwy_ident}` : '';
                points.push({ label: `${nav.departure_icao || 'DEP'}${depRwy}`, lat: Number(nav.departure_lat), lon: Number(nav.departure_lon), alt: nav.dep_elevation_ft ?? null });
            }
            for (const wp of wps) {
                if (Number.isFinite(wp.latitude) && Number.isFinite(wp.longitude)) {
                    points.push({ label: wp.name || `WP${wp.order_index}`, lat: Number(wp.latitude), lon: Number(wp.longitude), alt: wp.altitude_ft ?? null });
                }
            }
            if (nav && Number.isFinite(nav.arrival_lat) && Number.isFinite(nav.arrival_lon)) {
                const arrRwy = nav.arr_rwy_ident ? ` RWY ${nav.arr_rwy_ident}` : '';
                const arrIcao = nav.arrival_icao || nav.arr_icao || 'ARR';
                points.push({ label: `${arrIcao}${arrRwy}`, lat: Number(nav.arrival_lat), lon: Number(nav.arrival_lon), alt: nav.arr_elevation_ft ?? null });
            }

            let totalNm = 0;
            let legsHtml = '';
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                const altTxt = p.alt != null ? ` <span style="color:rgba(255,255,255,.4)">${Number(p.alt).toFixed(0)} ft</span>` : '';
                let legTxt = '';
                if (i > 0) {
                    const prev = points[i - 1];
                    const dist = haversineNm(prev.lat, prev.lon, p.lat, p.lon);
                    const brg = initialBearingDeg(prev.lat, prev.lon, p.lat, p.lon);
                    totalNm += dist;
                    legTxt = `<span style="color:#40ffaa;font-size:9px"> ${dist.toFixed(1)} nm / ${brg.toFixed(0)}°</span>`;
                }
                legsHtml += `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(80,255,160,.08)"><span>${escapeHtml(p.label)}${altTxt}</span>${legTxt}</div>`;
            }

            const routeName = nav?.name || nav?.mission_title || '';
            const depIcao = nav?.departure_icao || nav?.dep_icao || '';
            const cfg = this.scene.aircraftConfig || {};
            const cruiseKt = Number.isFinite(cfg.vne_kts) && cfg.vne_kts > 0
                ? cfg.vne_kts * 0.8
                : (Number.isFinite(cfg.stall_speed_kts) && cfg.stall_speed_kts > 0 ? cfg.stall_speed_kts * 4 : 250);
            const estTimeHr = cruiseKt > 0 ? totalNm / cruiseKt : 0;
            const estTimeMin = estTimeHr * 60;
            const burnMax = Number(cfg.fuel_burn_rate_kg_per_s_max) || 0;
            const burnIdle = Number(cfg.fuel_burn_rate_kg_per_s_idle) || 0;
            const cruiseBurnKgPerS = burnMax > 0 ? (burnMax + burnIdle) / 2 : 0;
            const tripFuelKg = cruiseBurnKgPerS * estTimeHr * 3600;
            const reserveFuelKg = cruiseBurnKgPerS * 0.75 * 3600;
            const totalFuelKg = tripFuelKg + reserveFuelKg;
            const capKg = Number(cfg.fuel_capacity_kg) || 0;
            const fuelPct = capKg > 0 ? Math.min(100, (totalFuelKg / capKg) * 100) : 0;
            const fuelColor = capKg > 0 && totalFuelKg > capKg ? '#ff6666' : '#40ffaa';

            const baseMassKg = Number(cfg.mass_kg) || 0;
            const takeoffMassKg = baseMassKg + totalFuelKg;

            const elevForWx = (nav && nav.dep_elevation_ft != null) ? Number(nav.dep_elevation_ft) : 0;
            let wxHtml = '';
            try {
                const wx = this.scene._weatherService?.getSnapshot(elevForWx);
                if (wx) {
                    wxHtml = `<div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Vento</span><span>${wx.windDirDeg.toFixed(0)}° / ${wx.windSpeedKt.toFixed(0)} kt</span></div>
                    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Nuvens</span><span>${(wx.cloudCoverage * 100).toFixed(0)}%</span></div>
                    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Precip.</span><span>${(wx.precipitationIntensity * 100).toFixed(0)}%</span></div>
                    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">ISA Δ</span><span>${wx.isaDeltaTempK >= 0 ? '+' : ''}${wx.isaDeltaTempK.toFixed(1)} K</span></div>`;
                }
            } catch (wErr) {
                console.warn('[EFB] weather briefing failed:', wErr);
            }

            const section = (title: string, body: string) => `<div style="margin-bottom:10px"><div style="font-family:'Orbitron',monospace;font-size:9px;color:#40ffaa;letter-spacing:.12em;margin-bottom:4px">${title}</div>${body}</div>`;

            let approachHtml = '';
            if (nav) {
                const arrIdent = nav.arr_rwy_ident || '\u2014';
                const fac = (nav.arr_rwy_heading != null && Number.isFinite(Number(nav.arr_rwy_heading)))
                    ? `${Number(nav.arr_rwy_heading).toFixed(0)}°`
                    : 'N/D';
                const thrElev = nav.arr_elevation_ft != null ? `${Number(nav.arr_elevation_ft).toFixed(0)} ft` : 'N/D';
                approachHtml = `<div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Pista cheg.</span><span>${escapeHtml(String(arrIdent))}</span></div>
                    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Curso final</span><span style="color:#40ffaa">${fac}</span></div>
                    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Rampa</span><span>3.0°</span></div>
                    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Elev. threshold</span><span>${thrElev}</span></div>
                    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">NAVAID/ILS</span><span style="color:rgba(255,255,255,.35)">N/D</span></div>`;
            }

            const routeBody = hasRoute
                ? legsHtml + `<div style="display:flex;justify-content:space-between;margin-top:4px;font-weight:600"><span>Total</span><span style="color:#40ffaa">${totalNm.toFixed(1)} nm</span></div>`
                : '<div style="color:rgba(255,255,255,.4)">Sem rota ativa</div>';

            el.innerHTML =
                (routeName ? `<div style="font-weight:600;color:#fff;margin-bottom:8px">${escapeHtml(routeName)}</div>` : '') +
                section('ROTA', routeBody) +
                (approachHtml ? section('APPROACH (IFR geométrico)', approachHtml) : '') +
                section('COMBUSTÍVEL (estimativa)',
                    `<div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Cruzeiro</span><span>${cruiseKt.toFixed(0)} kt</span></div>
                     <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Tempo est.</span><span>${estTimeMin.toFixed(0)} min</span></div>
                     <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Trip</span><span>${tripFuelKg.toFixed(0)} kg</span></div>
                     <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Reserva (45min)</span><span>${reserveFuelKg.toFixed(0)} kg</span></div>
                     <div style="display:flex;justify-content:space-between;font-weight:600"><span>Total</span><span style="color:${fuelColor}">${totalFuelKg.toFixed(0)} kg ${capKg > 0 ? `(${fuelPct.toFixed(0)}% cap.)` : ''}</span></div>
                     ${capKg > 0 && totalFuelKg > capKg ? '<div style="color:#ff6666;font-size:9px;margin-top:2px">Acima da capacidade do tanque</div>' : ''}`) +
                section('PESO (estimativa)',
                    `<div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Vazio/base</span><span>${baseMassKg.toFixed(0)} kg</span></div>
                     <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Combustível</span><span>${totalFuelKg.toFixed(0)} kg</span></div>
                     <div style="display:flex;justify-content:space-between;font-weight:600"><span>Decolagem est.</span><span style="color:#40ffaa">${takeoffMassKg.toFixed(0)} kg</span></div>`) +
                (wxHtml ? section('BRIEFING METEO (procedural)', wxHtml) : '') +
                section('METAR REAL', '<div id="efb-metar" style="font-size:10px;color:rgba(255,255,255,.7)">\u2014</div>');
            console.log(`[EFB] Rendered: ${points.length} pts, ${totalNm.toFixed(1)} nm, route=${hasRoute}`);

            if (depIcao) this.loadMetarBriefing(depIcao, elevForWx);
            else this.refreshWeatherAtPosition('efb', true);
        } catch (err) {
            el.innerHTML = '<div style="color:rgba(255,100,100,.8)">Erro ao montar EFB</div>';
            console.error('[EFB] render error:', err);
        }
    }

    async loadMetarBriefing(icao: string, elevFt: number): Promise<void> {
        const el = document.getElementById('efb-metar');
        if (!el) return;
        const code = String(icao || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{3,4}$/.test(code)) {
            el.innerHTML = '<div style="color:rgba(255,255,255,.4)">METAR indisponível (ICAO inválido)</div>';
            return;
        }
        el.textContent = 'Carregando METAR...';
        try {
            const res = await fetch(`/api/weather/metar?icao=${encodeURIComponent(code)}`);
            if (!res.ok) {
                el.innerHTML = '<div style="color:rgba(255,255,255,.4)">METAR indisponível</div>';
                console.warn(`[METAR] briefing HTTP ${res.status} for ${code}`);
                return;
            }
            const json = await res.json();
            const m = json.data;
            if (!m) {
                el.innerHTML = '<div style="color:rgba(255,255,255,.4)">METAR indisponível</div>';
                return;
            }
            const weather = this.applyMetarToScene(m, elevFt);
            console.log(`[METAR] Weather ${code}: cloud=${(weather.cloudCoverage * 100).toFixed(0)}% precip=${(weather.precipIntensity * 100).toFixed(0)}% type=${weather.precipType} (${weather.label})`);
            this._renderMetarEl(el, m, weather, !!json.stale);
        } catch (err) {
            el.innerHTML = '<div style="color:rgba(255,255,255,.4)">METAR indisponível</div>';
            console.warn('[METAR] briefing fetch failed:', err);
        }
    }

    /** Fetches the METAR of the nearest airport to the aircraft and applies it (on-demand). */
    async refreshWeatherAtPosition(reason: string, force: boolean = false): Promise<void> {
        try {
            const ll = typeof this.scene._getCurrentLatLon === 'function' ? this.scene._getCurrentLatLon() : null;
            if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lon)) {
                console.debug(`[METAR] refreshWeatherAtPosition skipped (${reason}): no position`);
                return;
            }
            const now = Date.now();
            if (!force && this._lastWxRefreshMs > 0 && Number.isFinite(this._lastWxLat) && Number.isFinite(this._lastWxLon)) {
                const dtMs = now - this._lastWxRefreshMs;
                const movedNm = haversineNm(this._lastWxLat, this._lastWxLon, ll.lat, ll.lon);
                if (dtMs < 60000 && movedNm < 10) {
                    console.debug(`[METAR] refreshWeatherAtPosition throttled (${reason}): ${(dtMs / 1000).toFixed(0)}s, ${movedNm.toFixed(1)}nm`);
                    return;
                }
            }
            const res = await fetch(`/api/weather/metar/nearest?lat=${ll.lat.toFixed(4)}&lon=${ll.lon.toFixed(4)}`);
            if (!res.ok) {
                console.warn(`[METAR] nearest HTTP ${res.status} (${reason})`);
                return;
            }
            const json = await res.json();
            const m = json.data;
            if (!m) {
                console.warn(`[METAR] nearest no data (${reason})`);
                return;
            }
            const elevFt = json.airport && Number.isFinite(json.airport.elevation_ft) ? Number(json.airport.elevation_ft) : 0;
            const weather = this.applyMetarToScene(m, elevFt);
            this._lastWxRefreshMs = now;
            this._lastWxLat = ll.lat;
            this._lastWxLon = ll.lon;
            console.log(`[METAR] Position weather (${reason}) ${json.airport?.icao || '?'}: cloud=${(weather.cloudCoverage * 100).toFixed(0)}% precip=${(weather.precipIntensity * 100).toFixed(0)}% (${weather.label})`);
            const el = document.getElementById('efb-metar');
            if (el) this._renderMetarEl(el, m, weather, !!json.stale);
        } catch (err) {
            console.warn(`[METAR] refreshWeatherAtPosition failed (${reason}):`, err);
        }
    }

    /** Applies parsed METAR data to the scene: surface wind/gust, density altitude, clouds, precipitation, ceiling. */
    applyMetarToScene(m: any, elevFt: number): { cloudCoverage: number; precipIntensity: number; precipType: number; label: string } {
        const weather = this._deriveMetarWeather(m);
        const elev = Number.isFinite(elevFt) ? Number(elevFt) : 0;
        if (Number.isFinite(m.windDirDeg) && Number.isFinite(m.windSpeedKt)) {
            const gustKt = Number.isFinite(m.windGustKt) ? Number(m.windGustKt) : 0;
            this.scene._metarSurfaceWind = { speedKt: Number(m.windSpeedKt), dirDeg: Number(m.windDirDeg), gustKt };
            this.scene._metarSurfaceElevFt = elev;
        }
        if (Number.isFinite(m.tempC)) {
            const isaTemp = 15 - 1.98 * (elev / 1000);
            this.scene._isaDeltaTempK = Math.max(-40, Math.min(40, Number(m.tempC) - isaTemp));
        }
        this.scene._metarCloudBaseFt = this._lowestCeilingFt(m);
        this.scene._metarApplied = true;
        this.scene._currentCloudCoverage = weather.cloudCoverage;
        this.scene._precipitationIntensity = weather.precipIntensity;
        this.scene._precipitationType = weather.precipType;
        if (typeof this.scene._applyMetarWeatherVisuals === 'function') {
            this.scene._applyMetarWeatherVisuals();
        }
        return weather;
    }

    private _lowestCeilingFt(m: any): number {
        const clouds = Array.isArray(m && m.clouds) ? m.clouds : [];
        let base = 0;
        for (const c of clouds) {
            const cov = String(c && c.cover || '').toUpperCase();
            if ((cov === 'BKN' || cov === 'OVC' || cov === 'VV') && Number.isFinite(c.baseFt)) {
                const b = Number(c.baseFt);
                if (base === 0 || b < base) base = b;
            }
        }
        return base;
    }

    private _renderMetarEl(el: HTMLElement, m: any, weather: { label: string }, stale: boolean): void {
        const windTxt = `${m.windVariable ? 'VRB' : (m.windDirDeg != null ? m.windDirDeg + '°' : '\u2014')} / ${m.windSpeedKt != null ? m.windSpeedKt + ' kt' : '\u2014'}${m.windGustKt != null ? ' G' + m.windGustKt : ''}`;
        el.innerHTML = `<div style="font-family:monospace;font-size:9px;color:#9cf;word-break:break-word;margin-bottom:4px">${escapeHtml(m.raw || '')}</div>
            <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Condição</span><span>${escapeHtml(weather.label)}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Vento</span><span>${escapeHtml(windTxt)}</span></div>
            ${m.tempC != null ? `<div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Temp/Orvalho</span><span>${m.tempC}° / ${m.dewpointC ?? '\u2014'}°</span></div>` : ''}
            ${m.altimeterHpa != null ? `<div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">QNH</span><span>${Number(m.altimeterHpa).toFixed(0)} hPa</span></div>` : ''}
            ${m.visibility != null ? `<div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">Visib.</span><span>${escapeHtml(String(m.visibility))}</span></div>` : ''}
            ${stale ? '<div style="color:#ffaa55;font-size:9px;margin-top:2px">Dados em cache (fonte indisponível)</div>' : ''}`;
    }

    private _deriveMetarWeather(m: any): { cloudCoverage: number; precipIntensity: number; precipType: number; label: string } {
        const coverMap: Record<string, number> = { SKC: 0, CLR: 0, NSC: 0, CAVOK: 0, NCD: 0, FEW: 0.25, SCT: 0.45, BKN: 0.75, OVC: 1.0, VV: 1.0 };
        let cloudCoverage = 0;
        const clouds = Array.isArray(m && m.clouds) ? m.clouds : [];
        for (const c of clouds) {
            const cov = coverMap[String(c && c.cover || '').toUpperCase()];
            if (Number.isFinite(cov) && cov > cloudCoverage) cloudCoverage = cov;
        }

        const wx = String(m && m.wxString || '').toUpperCase();
        let precipIntensity = 0;
        let precipType = 0;
        if (wx && wx !== 'NSW') {
            const hasRain = /RA|DZ|SH/.test(wx);
            const hasSnow = /SN|SG|PL|GS|GR/.test(wx);
            if (hasSnow) precipType = 2;
            else if (hasRain) precipType = 1;
            else if (/TS/.test(wx)) precipType = 1;
            if (precipType > 0) {
                if (/(^|\s)\+/.test(wx) || /\+RA|\+SN|\+SH|TS/.test(wx)) precipIntensity = 1.0;
                else if (/(^|\s)-/.test(wx) || /-RA|-SN|-DZ/.test(wx)) precipIntensity = 0.35;
                else precipIntensity = 0.65;
            }
        }

        let label: string;
        if (precipType === 2) label = precipIntensity >= 0.8 ? 'Neve forte' : (precipIntensity <= 0.4 ? 'Neve fraca' : 'Neve');
        else if (precipType === 1) label = precipIntensity >= 0.8 ? 'Chuva forte' : (precipIntensity <= 0.4 ? 'Chuva fraca' : 'Chuva');
        else if (cloudCoverage >= 0.75) label = 'Encoberto';
        else if (cloudCoverage >= 0.4) label = 'Nublado';
        else if (cloudCoverage > 0) label = 'Poucas nuvens';
        else label = 'Céu limpo';

        return { cloudCoverage, precipIntensity, precipType, label };
    }
}
