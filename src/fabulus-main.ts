import { GameCore3D } from './engine/3d/GameCore3D.js';
import { FabulusScene } from './game/fabulus/FabulusScene.js';

const LOADING_FADE_MS = 800;

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const loadingEl = document.getElementById('loading');

if (!canvas) {
    console.error('[fabulus-main] Canvas #game-canvas not found');
} else {
    const core = new GameCore3D({ canvas, antialias: true });
    const scene = new FabulusScene();

    scene.onReady = () => {
        if (!loadingEl) return;
        loadingEl.style.transition = `opacity ${LOADING_FADE_MS}ms ease`;
        requestAnimationFrame(() => {
            loadingEl.style.opacity = '0';
            setTimeout(() => loadingEl.remove(), LOADING_FADE_MS + 100);
        });
    };

    window.addEventListener('beforeunload', () => {
        try {
            scene.persistState(true);
        } catch (err) {
            console.warn('[fabulus-main] persist on unload failed:', err);
        }
    });

    core.start(scene);
    console.debug('[fabulus-main] Game started');
}
