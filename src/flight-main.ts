import { GameCore3D } from './engine/3d/GameCore3D.js';
import { FlightSceneSimple } from './game/FlightSceneSimple.js';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const loadingEl = document.getElementById('loading')!;
const emailForm = document.getElementById('email-form') as HTMLFormElement;
const emailInput = document.getElementById('email-input') as HTMLInputElement;
const emailSubmit = document.getElementById('email-submit') as HTMLButtonElement;
const emailError = document.getElementById('email-error')!;
const loadingStatus = document.getElementById('loading-status')!;

let registeredUserId: string | null = null;
let sceneReady = false;
let dismissed = false;
let statusInterval: number | undefined;

function getUserLocation(): Promise<string> {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve('unknown');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve(`${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`),
            () => resolve('unknown'),
            { timeout: 3000 },
        );
    });
}

function dismissLoading() {
    if (dismissed) return;
    if (!registeredUserId || !sceneReady) return;
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

// Safety: if scene reports spawned but somehow the callback missed, poll
setInterval(() => {
    if (!sceneReady && (scene as any).spawned) {
        sceneReady = true;
        console.log('[flight-main] Scene spawned (poll fallback)');
        dismissLoading();
    }
}, 500);

// Safety: force-dismiss loading after 20s regardless
setTimeout(() => {
    if (!dismissed) {
        sceneReady = true;
        if (registeredUserId) {
            console.warn('[flight-main] Forcing loading dismiss (timeout)');
            dismissLoading();
        }
    }
}, 20000);

emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const email = emailInput.value.trim();
    if (!email) return;

    emailSubmit.disabled = true;
    emailSubmit.textContent = 'CONNECTING…';
    emailError.textContent = '';

    try {
        const location = await getUserLocation();

        emailSubmit.textContent = 'REGISTERING…';
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, location }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({ error: 'Registration failed' }));
            throw new Error(data.error || 'Registration failed');
        }

        const { userId } = await res.json();
        registeredUserId = userId;
        console.log('[flight-main] Registered:', userId);

        loadingEl.classList.add('registered');
        scene.initMultiplayer(userId);
        dismissLoading();
    } catch (err: any) {
        console.error('[flight-main] Registration error:', err);
        emailError.textContent = err.message || 'Connection error';
        emailSubmit.disabled = false;
        emailSubmit.textContent = 'ENTER THE SKY';
    }
});

// Capture the status interval from the inline script so we can clear it
statusInterval = (window as any).__loadingStatusInterval;
