/** Post-processing: vignette + FXAA. Bloom is intentionally off so only the
 *  selected tile glows (via the highlight layer). */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import { VIGNETTE_WEIGHT } from '../constants/graphicsConstants.js';

export class RenderSystem {
    private game: MahjongScene;
    private pipeline!: BABYLON.DefaultRenderingPipeline;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        const bjs = this.game.bjs;
        const camera = bjs.activeCamera;
        if (!camera) {
            console.warn('[RenderSystem] No active camera; skipping post-processing.');
            return;
        }
        this.pipeline = new BABYLON.DefaultRenderingPipeline('mahjong-pipeline', true, bjs, [camera]);
        // Bloom disabled so plain tiles never glow; only the selected tile glows
        // via the highlight layer (a separate pass, unaffected by this setting).
        this.pipeline.bloomEnabled = false;

        this.pipeline.imageProcessingEnabled = true;
        this.pipeline.imageProcessing.vignetteEnabled = true;
        this.pipeline.imageProcessing.vignetteWeight = VIGNETTE_WEIGHT;
        this.pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(0, 0, 0, 0);
        this.pipeline.imageProcessing.contrast = 1.08;
        this.pipeline.imageProcessing.exposure = 1.05;

        this.pipeline.fxaaEnabled = true;
    }

    dispose(): void {
        this.pipeline?.dispose();
    }
}
