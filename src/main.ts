/**
 * main.ts - Entry point for the AntiGravity Engine galaxy simulation
 */
import { GameCore } from './engine/GameCore.js';
import { GalaxyScene } from './game/GalaxyScene.js';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found!');

const game = new GameCore({
    canvas,
    fixedDt: 1 / 60,
    maxDeltaTime: 0.05,
});

const galaxyScene = new GalaxyScene();

// Pass fps to scene HUD
game.on('update', () => {
    galaxyScene.fpsRef.fps = game.fps;
});

game.start(galaxyScene);
