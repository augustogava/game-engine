import { GameCore3D } from './engine/3d/GameCore3D.js';
import { FlightSceneSimple } from './game/FlightSceneSimple.js';

const WEBSITE_LOGIN_URL = 'https://simflightpro.com/login';
const FLIGHT_HOURS_URL = 'https://simflightpro.com/flight-time';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const loadingEl = document.getElementById('loading')!;
const loadingStatus = document.getElementById('loading-status')!;
const authError = document.getElementById('auth-error')!;

const params = new URLSearchParams(window.location.search);
const token = params.get('token') || localStorage.getItem('auth_token');

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

const flightPlanId = params.get('flightPlanId');
params.delete('token');
const cleanSearch = params.toString();
history.replaceState(null, '', window.location.pathname + (cleanSearch ? `?${cleanSearch}` : ''));

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
                scene.setFlightPlanSpawn(plan);
                console.log(`[flight-main] Flight plan ${flightPlanId} loaded for spawn`);
            } else {
                console.warn(`[flight-main] Flight plan ${flightPlanId} fetch failed: ${res.status}`);
            }
        } catch (err) {
            console.error('[flight-main] Flight plan fetch error:', err);
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
    }
})();

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
