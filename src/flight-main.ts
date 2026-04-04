/**
 * flight-main.ts — Entry point for the 3D Flight Game
 *
 * BabylonJS is loaded via the <script> importmap in flight.html
 * so `window.BABYLON` is available before this module executes.
 */
import { GameCore3D } from './engine/3d/GameCore3D.js';
import { FlightSceneSimple } from './game/FlightSceneSimple.js';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

const game = new GameCore3D({ canvas, antialias: true });
const scene = new FlightSceneSimple();

game.start(scene);

// Hide loading screen
window.addEventListener('load', () => {
    setTimeout(() => {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.opacity = '0';
            loading.style.transition = 'opacity 1s ease';
            setTimeout(() => loading.remove(), 1100);
        }
    }, 1800);
});
