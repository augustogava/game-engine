import { GameCore3D } from './engine/3d/GameCore3D.js';
import { MahjongScene } from './game/mahjong/MahjongScene.js';

const LOADING_FADE_MS = 600;

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const loadingEl = document.getElementById('mj-loading');

if (!canvas) {
    console.error('[mahjong-main] Canvas #game-canvas not found');
} else {
    const core = new GameCore3D({ canvas, antialias: true });
    const scene = new MahjongScene();

    scene.onReady = () => {
        if (!loadingEl) return;
        loadingEl.style.transition = `opacity ${LOADING_FADE_MS}ms ease`;
        requestAnimationFrame(() => {
            loadingEl.style.opacity = '0';
            setTimeout(() => loadingEl.classList.add('hidden'), LOADING_FADE_MS + 80);
        });
    };

    core.start(scene);
    console.debug('[mahjong-main] Game started');
}
