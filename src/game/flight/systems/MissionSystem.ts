import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { MISSION_TOAST_VISIBLE_MS, MISSION_TOAST_FADE_MS } from '../constants/index.js';

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

        const isDiscovery = mission.type === 'discovery';
        const isFreeFlight = mission.type === 'free_flight';
        const isRoute = mission.type === 'route';

        const firstWp = Array.isArray(mission.waypoints) && mission.waypoints.length > 0 ? mission.waypoints[0] : null;
        const firstWpLat = firstWp && firstWp.latitude != null ? Number(firstWp.latitude) : null;
        const firstWpLon = firstWp && firstWp.longitude != null ? Number(firstWp.longitude) : null;
        const hasFirstWp = firstWpLat != null && Number.isFinite(firstWpLat) && firstWpLon != null && Number.isFinite(firstWpLon);

        if ((isDiscovery || isFreeFlight) && mission.spawn_latitude != null && mission.spawn_longitude != null) {
            const spawnLat = Number(mission.spawn_latitude);
            const spawnLon = Number(mission.spawn_longitude);
            this.scene._pendingMissionLat = spawnLat;
            this.scene._pendingMissionLon = spawnLon;
            this.scene._pendingMissionAltM = mission.spawn_altitude_ft != null ? Number(mission.spawn_altitude_ft) * 0.3048 : 1000;
            this.scene._pendingMissionHdg = hasFirstWp ? this.computeBearingDeg(spawnLat, spawnLon, firstWpLat!, firstWpLon!) : 0;
            this.scene._pendingMissionAirborne = true;
            if (hasFirstWp) {
                console.debug(`[Mission] Spawn heading aligned to next waypoint: hdg=${this.scene._pendingMissionHdg.toFixed(1)}° → wp lat=${firstWpLat} lon=${firstWpLon}`);
            }
        } else if (isRoute && mission.dep_rwy_latitude != null && mission.dep_rwy_longitude != null) {
            this.scene._pendingMissionLat = Number(mission.dep_rwy_latitude);
            this.scene._pendingMissionLon = Number(mission.dep_rwy_longitude);
            this.scene._pendingMissionHdg = mission.dep_rwy_heading != null ? Number(mission.dep_rwy_heading) : 0;
            this.scene._pendingMissionAltM = mission.dep_rwy_elevation_ft != null ? Number(mission.dep_rwy_elevation_ft) * 0.3048 : 0;
            this.scene._pendingMissionAirborne = false;
            console.log(`[Mission] Spawning at runway centerline lat=${this.scene._pendingMissionLat} lon=${this.scene._pendingMissionLon} hdg=${this.scene._pendingMissionHdg}`);
        } else if (isRoute && mission.departure_lat != null && mission.departure_lon != null) {
            const depLat = Number(mission.departure_lat);
            const depLon = Number(mission.departure_lon);
            this.scene._pendingMissionLat = depLat;
            this.scene._pendingMissionLon = depLon;
            this.scene._pendingMissionHdg = hasFirstWp ? this.computeBearingDeg(depLat, depLon, firstWpLat!, firstWpLon!) : 0;
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

        this.scene._missionWaypoints = Array.isArray(mission.waypoints) ? mission.waypoints : [];
        this.scene._missionCurrentWpIndex = 0;

        console.log(`[Mission] Active mission id=${this.scene._activeMissionId}, type=${mission.type}, spawn lat=${this.scene._pendingMissionLat} lon=${this.scene._pendingMissionLon} airborne=${this.scene._pendingMissionAirborne} waypoints=${this.scene._missionWaypoints.length}`);
    }

    private computeBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const phi1 = toRad(lat1);
        const phi2 = toRad(lat2);
        const dLambda = toRad(lon2 - lon1);
        const y = Math.sin(dLambda) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
        const theta = Math.atan2(y, x);
        return ((theta * 180) / Math.PI + 360) % 360;
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
            const res = await fetch('/api/user-missions?status=started,in_progress', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res.ok) {
                console.warn(`[FlightScene] User-missions fetch failed: HTTP ${res.status}`);
                listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Failed to load missions</div>';
                return;
            }
            const json = await res.json();
            const userMissions = Array.isArray(json?.data) ? json.data : [];

            this.scene._missionsCache = userMissions;

            if (!userMissions.length) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,.4)">No missions acquired</div>';
                this.scene._activeMission = null;
                this.scene._activeUserMissionId = null;
                this.scene._activeMissionId = null;
                this.scene._missionWaypoints = [];
                this.scene._missionCurrentWpIndex = 0;
                return;
            }

            this.renderMissionsList();

            const activeFromList = userMissions.find((m: any) => m?.status === 'in_progress');
            if (activeFromList && activeFromList.departure_lat != null && activeFromList.arrival_lat != null) {
                this.scene._activeMission = {
                    departure_lat: Number(activeFromList.departure_lat),
                    departure_lon: Number(activeFromList.departure_lon),
                    arrival_lat: Number(activeFromList.arrival_lat),
                    arrival_lon: Number(activeFromList.arrival_lon),
                    departure_icao: activeFromList.departure_icao || '',
                    arrival_icao: activeFromList.arrival_icao || '',
                    mission_title: activeFromList.mission_title || '',
                };
                this.scene._activeUserMissionId = activeFromList.id ?? null;
                this.scene._activeMissionId = activeFromList.mission_id ?? null;
                const ami = activeFromList.mission || {};
                this.scene._missionWaypoints = Array.isArray(ami.waypoints) ? ami.waypoints : [];
                this.scene._missionCurrentWpIndex = 0;
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
                const aInProg = a?.status === 'in_progress' ? 0 : 1;
                const bInProg = b?.status === 'in_progress' ? 0 : 1;
                if (aInProg !== bInProg) return aInProg - bInProg;
                return 0;
            });

            if (!visible.length) {
                listEl.innerHTML = `<div style="color:rgba(255,255,255,.4)">${search ? 'Nenhuma miss\u00e3o encontrada' : 'No missions acquired'}</div>`;
                return;
            }

            let html = '';
            for (const um of visible) {
                const mid = Number(um?.mission_id);
                if (!Number.isFinite(mid) || mid <= 0) continue;
                const mi = um.mission || {};
                const isInProgress = um.status === 'in_progress';
                const borderColor = isInProgress ? 'rgba(80,255,160,.5)' : 'rgba(255,200,80,.35)';
                const mType = um.mission_type || mi.type || '';
                const depIcao = um.departure_icao || mi.departure_icao || '';
                const arrIcao = um.arrival_icao || mi.arrival_icao || '';
                const depName = um.departure_airport_name || mi.departure_airport_name || '';
                const arrName = um.arrival_airport_name || mi.arrival_airport_name || '';
                const isRoute = depIcao && arrIcao;
                let routeHtml = '';
                if (isRoute) {
                    routeHtml = `<div style="font-size:10px;color:rgba(255,255,255,.5)">${depIcao} <span style="color:#40ffaa">\u2708</span> ${arrIcao}</div>
                        <div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:2px">${depName} \u2192 ${arrName}</div>`;
                } else if (mType === 'discovery') {
                    routeHtml = `<div style="font-size:10px;color:rgba(255,255,255,.5)"><span style="color:#40ffaa">\u2708</span> Discovery Flight</div>`;
                } else {
                    routeHtml = `<div style="font-size:10px;color:rgba(255,255,255,.5)">${mType || 'Free Flight'}</div>`;
                }

                let actionHtml = '';
                if (isInProgress) {
                    actionHtml = `<div style="font-size:9px;color:#40ffaa;letter-spacing:.08em;margin-top:6px">IN PROGRESS</div>`;
                } else {
                    const umId = Number(um?.id);
                    if (!Number.isFinite(umId) || umId <= 0) {
                        console.warn(`[FlightScene] Skipping START button for mission ${mid}: invalid user-mission id`);
                        actionHtml = `<div style="font-size:9px;color:#ff8080;letter-spacing:.08em;margin-top:6px">INICIADA (ID INVÁLIDO)</div>`;
                    } else {
                        actionHtml = `<div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                            <span style="font-size:9px;color:#ffcc55;letter-spacing:.08em">INICIADA</span>
                            <button class="mission-start-btn" data-mission-id="${mid}" data-user-mission-id="${umId}" style="padding:4px 10px;background:rgba(0,80,40,.6);border:1px solid rgba(80,255,160,.5);border-radius:4px;color:#40ffaa;font-size:10px;font-family:'Orbitron',monospace;letter-spacing:.08em;cursor:pointer;pointer-events:auto">INICIAR JOGO</button>
                        </div>`;
                    }
                }

                html += `<div style="border:1px solid ${borderColor};border-radius:6px;padding:8px;margin-bottom:6px;background:rgba(0,20,15,.4)">
                    <div style="font-weight:600;color:#fff;margin-bottom:4px">${um.mission_title || mi.title || 'Mission'}</div>
                    ${routeHtml}
                    ${actionHtml}
                </div>`;
            }
            listEl.innerHTML = html;

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
            const res = await fetch('/api/flight-plans', {
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
                html += `<div style="border:1px solid rgba(80,255,160,.25);border-radius:6px;padding:8px;margin-bottom:6px;background:rgba(0,20,15,.4)">
                    <div style="font-weight:600;color:#fff;margin-bottom:4px">${name}</div>
                    <div style="font-size:10px;color:rgba(255,255,255,.6)">
                        ${depIcao}${depRwy} <span style="color:#40ffaa">\u2708</span> ${arrIcao}${arrRwy}
                    </div>
                    <div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:2px">${p.departure_airport_name || ''} \u2192 ${p.arrival_airport_name || ''}</div>
                    ${scheduled ? `<div style="font-size:9px;color:rgba(255,200,0,.6);margin-top:3px">\u{1F552} ${scheduled}</div>` : ''}
                    <button data-start-plan="${p.id}" style="margin-top:6px;background:rgba(0,255,128,.15);border:1px solid rgba(80,255,160,.4);color:#40ffaa;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:9px;font-family:inherit;letter-spacing:.06em">START</button>
                </div>`;
            }
            listEl.innerHTML = html;

            listEl.querySelectorAll('[data-start-plan]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    const planId = (e.currentTarget as HTMLElement).getAttribute('data-start-plan');
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
}
