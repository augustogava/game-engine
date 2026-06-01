import { GameCore3D } from './engine/3d/GameCore3D.js';
import { FlightSceneSimple } from './game/FlightSceneSimple.js';

const WEBSITE_LOGIN_URL = 'https://simflightpro.com/login';
const FLIGHT_HOURS_URL = 'https://simflightpro.com/flight-time';
const WEBSITE_STORE_URL = 'https://simflightpro.com/aircrafts';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const loadingEl = document.getElementById('loading')!;
const loadingStatus = document.getElementById('loading-status')!;
const authError = document.getElementById('auth-error')!;

const params = new URLSearchParams(window.location.search);
const token = params.get('token') || localStorage.getItem('auth_token');
const flightPlanId = params.get('flightPlanId');
const missionId = params.get('missionId') ?? params.get('mission_id');

if (params.has('token')) {
    params.delete('token');
    try {
        const cleanedSearch = params.toString();
        history.replaceState(null, '', window.location.pathname + (cleanedSearch ? `?${cleanedSearch}` : ''));
    } catch (err) {
        console.warn('[flight-main] Failed to clean token from URL:', err);
    }
}

if (!token) {
    if (window.location.hostname.includes('simflightpro.com')) {
        window.location.href = WEBSITE_LOGIN_URL;
    } else {
        authError.textContent = 'No token. Add ?token=<jwt> to the URL.';
    }
}

if (token) {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('token', token);
}

const FREE_HOUR_FIRST_DELAY_MS = 2000;
const FREE_HOUR_INTERVAL_MS = 5 * 60 * 1000;
let freeHourTimer: number | undefined;

let sceneReady = false;
let dismissed = false;
let statusInterval: number | undefined;

function dismissLoading() {
    if (dismissed) return;
    if (!sceneReady) return;
    dismissed = true;
    if (statusInterval) clearInterval(statusInterval);
    loadingEl.style.transition = 'opacity 1s ease';
    requestAnimationFrame(() => {
        loadingEl.style.opacity = '0';
        setTimeout(() => loadingEl.remove(), 1100);
    });
}

function renderMissionMapPreview(mission: any): void {
    try {
        const canvas = document.getElementById('loading-mission-map') as HTMLCanvasElement | null;
        const titleEl = document.getElementById('loading-mission-title');
        if (!canvas) {
            console.warn('[flight-main] Mission preview canvas not found');
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const points: Array<{ lat: number; lon: number; name: string; type: 'dep' | 'arr' | 'wp' | 'spawn' }> = [];
        if (mission.departure_lat != null && mission.departure_lon != null) {
            points.push({ lat: Number(mission.departure_lat), lon: Number(mission.departure_lon), name: mission.departure_icao || 'DEP', type: 'dep' });
        } else if (mission.spawn_latitude != null && mission.spawn_longitude != null) {
            points.push({ lat: Number(mission.spawn_latitude), lon: Number(mission.spawn_longitude), name: 'SPAWN', type: 'spawn' });
        }
        if (Array.isArray(mission.waypoints)) {
            for (const wp of mission.waypoints) {
                if (wp && wp.latitude != null && wp.longitude != null) {
                    points.push({ lat: Number(wp.latitude), lon: Number(wp.longitude), name: wp.name || `WP${wp.order_index || ''}`, type: 'wp' });
                }
            }
        }
        if (mission.arrival_lat != null && mission.arrival_lon != null) {
            points.push({ lat: Number(mission.arrival_lat), lon: Number(mission.arrival_lon), name: mission.arrival_icao || 'ARR', type: 'arr' });
        }
        if (points.length === 0) {
            console.debug('[flight-main] Mission preview: no points to render');
            return;
        }

        const W = canvas.width, H = canvas.height;
        const PAD = 22;
        let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
        for (const p of points) {
            if (p.lat < minLat) minLat = p.lat;
            if (p.lat > maxLat) maxLat = p.lat;
            if (p.lon < minLon) minLon = p.lon;
            if (p.lon > maxLon) maxLon = p.lon;
        }
        let dLat = maxLat - minLat;
        let dLon = maxLon - minLon;
        if (dLat < 0.01) dLat = 0.01;
        if (dLon < 0.01) dLon = 0.01;
        const project = (lat: number, lon: number): { x: number; y: number } => {
            const x = PAD + ((lon - minLon) / dLon) * (W - 2 * PAD);
            const y = H - PAD - ((lat - minLat) / dLat) * (H - 2 * PAD);
            return { x, y };
        };

        ctx.fillStyle = 'rgba(0,16,12,0.9)';
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(80,255,160,0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = project(points[i].lat, points[i].lon);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        for (let i = 0; i < points.length; i++) {
            const p = project(points[i].lat, points[i].lon);
            const isEndpoint = points[i].type === 'dep' || points[i].type === 'arr' || points[i].type === 'spawn';
            ctx.fillStyle = isEndpoint ? 'rgba(125,249,200,0.95)' : 'rgba(255,200,80,0.85)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, isEndpoint ? 5 : 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = '9px Inter, sans-serif';
            ctx.fillText(points[i].name, p.x + 7, p.y - 3);
        }

        canvas.style.display = 'block';
        if (titleEl) {
            titleEl.textContent = mission.title || 'MISSION';
            titleEl.style.display = 'block';
        }
        console.log(`[flight-main] Rendered mission preview with ${points.length} points`);
    } catch (err) {
        console.warn('[flight-main] Mission preview render failed:', err);
    }
}

const game = new GameCore3D({ canvas, antialias: true });
const scene = new FlightSceneSimple();

scene.onSpawned = () => {
    sceneReady = true;
    console.log('[flight-main] Scene spawned');
    dismissLoading();
};

(async () => {
    if (flightPlanId && token) {
        try {
            loadingStatus.textContent = 'Loading flight plan...';
            const res = await fetch(`/api/flight-plans/${encodeURIComponent(flightPlanId)}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const plan = await res.json();
                console.log(`[flight-main] Flight plan ${flightPlanId} data:`, { dep_rwy_lat: plan.dep_rwy_latitude, dep_rwy_lon: plan.dep_rwy_longitude, dep_rwy_hdg: plan.dep_rwy_heading, dep_lat: plan.dep_latitude, dep_lon: plan.dep_longitude });
                scene.setFlightPlanSpawn(plan);
                console.log(`[flight-main] Flight plan ${flightPlanId} loaded for spawn`);
            } else {
                console.warn(`[flight-main] Flight plan ${flightPlanId} fetch failed: ${res.status}`);
            }
        } catch (err) {
            console.error('[flight-main] Flight plan fetch error:', err);
        }
    }

    if (missionId && token && !flightPlanId) {
        try {
            loadingStatus.textContent = 'Loading mission...';
            const missionIdNum = Number(missionId);

            const detailRes = await fetch(`/api/missions/${encodeURIComponent(missionId)}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!detailRes.ok) {
                console.warn(`[flight-main] Mission ${missionId} fetch failed: ${detailRes.status}`);
            } else {
                const mission = await detailRes.json();
                console.log(`[flight-main] Mission ${missionId} loaded:`, { type: mission.type, departure_icao: mission.departure_icao, arrival_icao: mission.arrival_icao });
                renderMissionMapPreview(mission);

                const requiredAircraftId = mission?.required_aircraft_id != null
                    ? Number(mission.required_aircraft_id)
                    : null;

                if (requiredAircraftId != null && Number.isFinite(requiredAircraftId) && requiredAircraftId > 0) {
                    let owns = false;
                    let alreadySelected = false;
                    try {
                        const ownedRes = await fetch('/api/user-aircrafts', {
                            headers: { 'Authorization': `Bearer ${token}` },
                        });
                        if (ownedRes.ok) {
                            const ownedJson = await ownedRes.json();
                            const list: any[] = Array.isArray(ownedJson?.data) ? ownedJson.data : [];
                            const match = list.find((ua: any) => Number(ua?.aircraft?.id) === requiredAircraftId);
                            if (match) {
                                owns = true;
                                alreadySelected = Number(match.is_selected) === 1;
                            }
                        } else {
                            console.warn(`[flight-main] Owned aircrafts fetch failed: HTTP ${ownedRes.status}`);
                        }
                    } catch (err) {
                        console.warn('[flight-main] Owned aircrafts fetch error:', err);
                    }

                    if (!owns) {
                        console.warn(`[flight-main] Player does not own required aircraft id=${requiredAircraftId} code=${mission.required_aircraft_code ?? '?'} for mission ${missionId} - blocking start`);
                        showRequiredAircraftBlockPanel(mission);
                        return;
                    }

                    if (!alreadySelected) {
                        try {
                            loadingStatus.textContent = 'Trocando aeronave...';
                            const selectRes = await fetch(`/api/user-aircrafts/${requiredAircraftId}/select`, {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            });
                            if (selectRes.ok) {
                                console.log(`[flight-main] Auto-switched to required aircraft id=${requiredAircraftId} code=${mission.required_aircraft_code ?? '?'} for mission ${missionId}`);
                            } else {
                                console.warn(`[flight-main] Failed to auto-switch to required aircraft ${requiredAircraftId}: HTTP ${selectRes.status}`);
                            }
                        } catch (err) {
                            console.warn('[flight-main] Required aircraft switch error:', err);
                        }
                    } else {
                        console.log(`[flight-main] Required aircraft id=${requiredAircraftId} is already selected for mission ${missionId}`);
                    }
                }

                let userMissionId: number | null = null;
                let alreadyActive = false;
                let needsPromotion = false;

                try {
                    const activeRes = await fetch('/api/user-missions/active', {
                        headers: { 'Authorization': `Bearer ${token}` },
                    });
                    if (activeRes.ok) {
                        const activeJson = await activeRes.json();
                        const activeList = Array.isArray(activeJson?.data) ? activeJson.data : [];
                        const existing = activeList.find((um: any) => Number(um?.mission_id) === missionIdNum);
                        if (existing && existing.id != null) {
                            userMissionId = Number(existing.id);
                            alreadyActive = true;
                            if (existing.status === 'started') {
                                needsPromotion = true;
                            }
                        }
                    } else {
                        console.warn(`[flight-main] Active user-missions check failed: ${activeRes.status}`);
                    }
                } catch (err) {
                    console.warn('[flight-main] Active user-missions check error:', err);
                }

                if (alreadyActive) {
                    if (needsPromotion && userMissionId != null) {
                        try {
                            const promoteRes = await fetch(`/api/user-missions/${userMissionId}/start`, {
                                method: 'PUT',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });
                            if (promoteRes.ok) {
                                console.log(`[flight-main] Promoted user-mission ${userMissionId} from 'started' to 'in_progress' via /start`);
                            } else if (promoteRes.status === 409) {
                                console.log(`[flight-main] user-mission ${userMissionId} already in_progress (409 idempotent)`);
                            } else {
                                console.warn(`[flight-main] Failed to start user-mission ${userMissionId}: HTTP ${promoteRes.status}`);
                            }
                        } catch (err) {
                            console.warn(`[flight-main] Start user-mission ${userMissionId} error:`, err);
                        }
                    }
                    console.log(`[flight-main] Mission ${missionId} already active, userMissionId=${userMissionId}`);
                    scene.setMissionSpawn(mission, userMissionId);
                } else {
                    const startRes = await fetch('/api/user-missions', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mission_id: missionIdNum }),
                    });
                    if (startRes.ok) {
                        const startData = await startRes.json();
                        userMissionId = startData?.id != null ? Number(startData.id) : null;
                        console.log(`[flight-main] Mission ${missionId} acquired, userMissionId=${userMissionId}`);
                        if (userMissionId != null) {
                            try {
                                const promoteRes = await fetch(`/api/user-missions/${userMissionId}/start`, {
                                    method: 'PUT',
                                    headers: { 'Authorization': `Bearer ${token}` },
                                });
                                if (promoteRes.ok) {
                                    console.log(`[flight-main] Started user-mission ${userMissionId} (in_progress) via /start`);
                                } else if (promoteRes.status === 409) {
                                    console.log(`[flight-main] user-mission ${userMissionId} already in_progress (409 idempotent)`);
                                } else {
                                    console.warn(`[flight-main] Failed to start user-mission ${userMissionId}: HTTP ${promoteRes.status}`);
                                }
                            } catch (err) {
                                console.warn(`[flight-main] Start user-mission ${userMissionId} error:`, err);
                            }
                        }
                        scene.setMissionSpawn(mission, userMissionId);
                    } else if (startRes.status === 409) {
                        console.log(`[flight-main] Mission ${missionId} already active (race), fetching active userMissionId`);
                        let recoveredUserMissionId: number | null = null;
                        try {
                            const recoverRes = await fetch('/api/user-missions/active', {
                                headers: { 'Authorization': `Bearer ${token}` },
                            });
                            if (recoverRes.ok) {
                                const recoverJson = await recoverRes.json();
                                const recoverList: any[] = Array.isArray(recoverJson?.data) ? recoverJson.data : [];
                                const existing = recoverList.find((um: any) => Number(um?.mission_id) === missionIdNum);
                                if (existing && existing.id != null) {
                                    recoveredUserMissionId = Number(existing.id);
                                    console.log(`[flight-main] Recovered userMissionId=${recoveredUserMissionId} after 409`);
                                } else {
                                    console.warn(`[flight-main] No active user-mission for mission ${missionId} after 409`);
                                }
                            } else {
                                console.warn(`[flight-main] Recover after 409 failed: HTTP ${recoverRes.status}`);
                            }
                        } catch (recoverErr) {
                            console.warn('[flight-main] Recover after 409 error:', recoverErr);
                        }
                        scene.setMissionSpawn(mission, recoveredUserMissionId);
                    } else {
                        console.warn(`[flight-main] Mission ${missionId} acquire failed: ${startRes.status}`);
                        scene.setMissionSpawn(mission, null);
                    }
                }
            }
        } catch (err) {
            console.error('[flight-main] Mission fetch error:', err);
        }
    }

    if (token && !flightPlanId && !missionId) {
        try {
            loadingStatus.textContent = 'Resetting mission state...';
            const activeRes = await fetch('/api/user-missions?status=in_progress', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (activeRes.ok) {
                const activeJson = await activeRes.json();
                const activeList = Array.isArray(activeJson?.data) ? activeJson.data : [];
                let resetCount = 0;
                for (const um of activeList) {
                    const umId = Number(um?.id);
                    if (!Number.isFinite(umId) || umId <= 0) continue;
                    try {
                        const resetRes = await fetch(`/api/user-missions/${umId}`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'started' }),
                        });
                        if (resetRes.ok) {
                            resetCount++;
                        } else {
                            console.warn(`[flight-main] Failed to reset user-mission ${umId} to 'started': HTTP ${resetRes.status}`);
                        }
                    } catch (err) {
                        console.warn(`[flight-main] Reset user-mission ${umId} error:`, err);
                    }
                }
                if (activeList.length) {
                    console.log(`[flight-main] Normal-game start: reset ${resetCount}/${activeList.length} in_progress user-missions to 'started'`);
                }
            } else {
                console.warn(`[flight-main] In-progress user-missions fetch failed for normal-game cleanup: HTTP ${activeRes.status}`);
            }
        } catch (err) {
            console.warn('[flight-main] Normal-game mission cleanup error:', err);
        }
    }

    game.start(scene);

    if (token) {
        scene.initMultiplayer(token, () => {
            console.warn('[flight-main] Auth failure — redirecting to login');
            window.location.href = WEBSITE_LOGIN_URL;
        }, () => {
            console.warn('[flight-main] No flight hours remaining — redirecting to buy hours');
            window.location.href = FLIGHT_HOURS_URL;
        });

        setTimeout(() => { claimFreeFlightHour(token); }, FREE_HOUR_FIRST_DELAY_MS);
        freeHourTimer = window.setInterval(() => claimFreeFlightHour(token), FREE_HOUR_INTERVAL_MS);

        window.addEventListener('beforeunload', () => {
            if (freeHourTimer !== undefined) clearInterval(freeHourTimer);
        });
    }
})();

let disposed = false;
function disposeGame(reason: string): void {
    if (disposed) return;
    disposed = true;
    try {
        console.debug(`[flight-main] Disposing game to free WebGL/tiles memory (reason=${reason})`);
        game.dispose();
    } catch (err) {
        console.warn('[flight-main] Game dispose on unload failed:', err);
    }
}
window.addEventListener('pagehide', () => disposeGame('pagehide'));
window.addEventListener('beforeunload', () => disposeGame('beforeunload'));

const MEMORY_DIAGNOSTIC_INTERVAL_MS = 15000;
const BYTES_PER_MB = 1048576;
function logMemorySnapshot(context: string): void {
    try {
        const mem = (performance as any)?.memory;
        if (mem && typeof mem.usedJSHeapSize === 'number') {
            const used = (mem.usedJSHeapSize / BYTES_PER_MB).toFixed(1);
            const total = (mem.totalJSHeapSize / BYTES_PER_MB).toFixed(1);
            const limit = (mem.jsHeapSizeLimit / BYTES_PER_MB).toFixed(1);
            console.debug(`[Memory] ${context}: usedJSHeap=${used}MB totalJSHeap=${total}MB heapLimit=${limit}MB visibility=${document.visibilityState}`);
        } else {
            console.debug(`[Memory] ${context}: heap metrics unavailable (non-Chromium) visibility=${document.visibilityState}`);
        }
    } catch (err) {
        console.warn('[Memory] Snapshot failed:', err);
    }
}
setInterval(() => logMemorySnapshot('periodic'), MEMORY_DIAGNOSTIC_INTERVAL_MS);
document.addEventListener('visibilitychange', () => logMemorySnapshot(`visibilitychange:${document.visibilityState}`));
window.addEventListener('pagehide', () => logMemorySnapshot('pagehide'));
document.addEventListener('freeze', () => logMemorySnapshot('freeze'));
document.addEventListener('resume', () => logMemorySnapshot('resume'));

setInterval(() => {
    if (!sceneReady && (scene as any).spawned) {
        sceneReady = true;
        console.log('[flight-main] Scene spawned (poll fallback)');
        dismissLoading();
    }
}, 500);

setTimeout(() => {
    if (!dismissed) {
        sceneReady = true;
        console.warn('[flight-main] Forcing loading dismiss (timeout)');
        dismissLoading();
    }
}, 20000);

statusInterval = (window as any).__loadingStatusInterval;

function showRequiredAircraftBlockPanel(mission: any): void {
    const ring = loadingEl.querySelector('.loading-ring') as HTMLElement | null;
    const status = document.getElementById('loading-status');
    const logo = loadingEl.querySelector('.loading-logo') as HTMLElement | null;
    const subtitle = loadingEl.querySelector('.loading-subtitle') as HTMLElement | null;
    if (ring) ring.style.display = 'none';
    if (status) status.style.display = 'none';
    if (logo) logo.style.display = 'none';
    if (subtitle) subtitle.style.display = 'none';

    const statusInt = (window as any).__loadingStatusInterval;
    if (statusInt) clearInterval(statusInt);

    const thumbnail = mission?.required_aircraft_thumbnail || '';
    const name = mission?.required_aircraft_name || mission?.required_aircraft_code || '';

    const panel = document.createElement('div');
    panel.id = 'aircraft-required-panel';
    panel.style.cssText = [
        'display:flex', 'flex-direction:column', 'align-items:center',
        'gap:18px', 'padding:28px 32px', 'max-width:380px',
        'background:rgba(2,10,20,0.85)', 'backdrop-filter:blur(10px)',
        'border:1px solid rgba(64,255,170,0.3)', 'border-radius:12px',
        'box-shadow:0 8px 32px rgba(0,0,0,0.5)', 'color:#fff',
        'font-family:Inter,system-ui,sans-serif', 'text-align:center',
    ].join(';');

    panel.innerHTML = `
        ${thumbnail ? `<img src="${thumbnail}" alt="${name}" style="width:160px;height:auto;border-radius:8px;border:1px solid rgba(64,255,170,0.2)"/>` : ''}
        <div style="font-family:'Orbitron',monospace;font-size:14px;letter-spacing:0.15em;color:#40ffaa;text-transform:uppercase">Aeronave necessária</div>
        ${name ? `<div style="font-size:18px;font-weight:600">${name}</div>` : ''}
        <div style="font-size:13px;line-height:1.5;color:rgba(220,240,235,0.75)">
            Você não possui a aeronave necessária para iniciar esta missão.
        </div>
        <a id="aircraft-required-buy" href="${WEBSITE_STORE_URL}" style="display:inline-block;background:#40ffaa;color:#020810;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em;font-size:12px;cursor:pointer">
            Comprar aeronave
        </a>
    `;

    loadingEl.appendChild(panel);
}

async function claimFreeFlightHour(authToken: string): Promise<void> {
    try {
        const resp = await fetch('/api/flight-stats/claim-free-hour', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: '{}',
        });
        if (!resp.ok) {
            console.warn(`[FreeHour] Claim failed: HTTP ${resp.status}`);
            return;
        }
        const data = await resp.json();
        if (typeof data?.granted === 'number' && data.granted > 0) {
            console.log(`[FreeHour] Granted ${data.granted}h (reward_type=${data.reward_type}, total=${data.free_flight_hours_given_total}, remaining=${data.free_flight_hours_remaining_limit})`);
        } else {
            console.log(`[FreeHour] No grant (reason_code=${data?.reason_code}, next_available_at=${data?.next_available_at ?? 'null'})`);
        }
    } catch (err) {
        console.warn('[FreeHour] Claim error:', err);
    }
}
