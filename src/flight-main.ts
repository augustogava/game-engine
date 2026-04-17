import { GameCore3D } from './engine/3d/GameCore3D.js';
import { FlightSceneSimple } from './game/FlightSceneSimple.js';

const WEBSITE_LOGIN_URL = 'https://simflightpro.com/login';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const loadingEl = document.getElementById('loading')!;
const loadingStatus = document.getElementById('loading-status')!;
const authError = document.getElementById('auth-error')!;

const params = new URLSearchParams(window.location.search);
const token = params.get('token');

if (!token) {
    if (window.location.hostname.includes('simflightpro.com')) {
        window.location.href = WEBSITE_LOGIN_URL;
    } else {
        authError.textContent = 'No token. Add ?token=<jwt> to the URL.';
    }
}

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

game.start(scene);

if (token) {
    scene.initMultiplayer(token, () => {
        console.warn('[flight-main] Auth failure — redirecting to login');
        window.location.href = WEBSITE_LOGIN_URL;
    });
}

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
