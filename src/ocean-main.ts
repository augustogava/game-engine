/**
 * ocean-main.ts - Entry point for the AntiGravity Engine ocean simulation
 */
import { GameCore } from './engine/GameCore.js';
import { OceanScene } from './game/OceanScene.js';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found!');

const game = new GameCore({
    canvas,
    fixedDt: 1 / 60,
    maxDeltaTime: 0.05,
});

const oceanScene = new OceanScene();

game.on('update', () => {
    oceanScene.fpsRef.fps = game.fps;
});

game.start(oceanScene);
