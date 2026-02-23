import { GameCore } from './engine/GameCore.js';
import { RpgScene } from './game/RpgScene.js';

// rpg-main.ts
// Entry point for the Top-Down RPG

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    // Set initial size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const game = new GameCore({ canvas });

    // Use pixelated rendering
    game.renderer.ctx.imageSmoothingEnabled = false;
    window.addEventListener('resize', () => {
        game.renderer.ctx.imageSmoothingEnabled = false;
    });

    const rpgScene = new RpgScene();
    game.start(rpgScene);

    // Hide loading screen
    if ((window as any).__hideLoading) {
        (window as any).__hideLoading();
    }
});
