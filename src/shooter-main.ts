/**
 * shooter-main.ts - Entry point for the Stick Shooter game
 */
import { GameCore } from './engine/GameCore.js';
import { ShooterScene } from './game/ShooterScene.js';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found!');

// Fixed timestep of 60Hz. Max delta 0.05 to prevent physics blowup
const game = new GameCore({
    canvas,
    fixedDt: 1 / 60,
    maxDeltaTime: 0.05,
});

const shooterScene = new ShooterScene();

// Remove loading screen when the scene first enters
game.on('update', () => {
    if ((window as any).__hideLoading) {
        (window as any).__hideLoading();
        delete (window as any).__hideLoading;
    }
});

game.start(shooterScene);
