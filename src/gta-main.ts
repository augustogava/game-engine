/**
 * GTA Top-Down Game Entry Point
 * 
 * A GTA 1 inspired top-down driving game with realistic car physics,
 * AI traffic, pedestrians with pathfinding, and dynamic lighting.
 */
import { GameCore } from './engine/index.js';
import { GTAScene } from './game/gta/GTAScene.js';

function main(): void {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    const game = new GameCore({
        canvas
    });

    const gtaScene = new GTAScene();
    game.scenes.push(gtaScene);

    game.start();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
