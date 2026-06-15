/** Post-processing: bloom + vignette for a polished look. */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import {
    BLOOM_KERNEL, BLOOM_THRESHOLD, BLOOM_WEIGHT, VIGNETTE_WEIGHT,
} from '../constants/graphicsConstants.js';

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
        this.pipeline.bloomEnabled = true;
        this.pipeline.bloomThreshold = BLOOM_THRESHOLD;
        this.pipeline.bloomWeight = BLOOM_WEIGHT;
        this.pipeline.bloomKernel = BLOOM_KERNEL;
        this.pipeline.bloomScale = 0.5;

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
