/** Particle bursts on a successful match. */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import { MATCH_PARTICLE_COUNT, MATCH_PARTICLE_LIFETIME } from '../constants/graphicsConstants.js';

export class VfxSystem {
    private game: MahjongScene;
    private bjs!: BABYLON.Scene;
    private particleTexture!: BABYLON.DynamicTexture;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        this.bjs = this.game.bjs;
        this.particleTexture = new BABYLON.DynamicTexture('mahjong-spark', 64, this.bjs, false);
        const ctx = this.particleTexture.getContext() as unknown as CanvasRenderingContext2D;
        const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
        grad.addColorStop(0, 'rgba(255,245,210,1)');
        grad.addColorStop(0.4, 'rgba(255,200,90,0.85)');
        grad.addColorStop(1, 'rgba(255,160,40,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        this.particleTexture.hasAlpha = true;
        this.particleTexture.update();
    }

    /** Spark burst at a matched tile; intensity scales with the current combo. */
    burst(position: BABYLON.Vector3, combo = 1): void {
        const intensity = Math.min(1 + (combo - 1) * 0.18, 2.2);
        const capacity = Math.round(MATCH_PARTICLE_COUNT * intensity);
        const ps = new BABYLON.ParticleSystem(`match-burst-${Date.now()}`, capacity, this.bjs);
        ps.particleTexture = this.particleTexture;
        ps.emitter = position.clone();
        ps.minEmitBox = new BABYLON.Vector3(-0.1, 0, -0.1);
        ps.maxEmitBox = new BABYLON.Vector3(0.1, 0.1, 0.1);
        ps.color1 = new BABYLON.Color4(1, 0.9, 0.5, 1);
        ps.color2 = new BABYLON.Color4(1, 0.7, 0.3, 1);
        ps.colorDead = new BABYLON.Color4(1, 0.5, 0.1, 0);
        ps.minSize = 0.12 * intensity;
        ps.maxSize = 0.34 * intensity;
        ps.minLifeTime = MATCH_PARTICLE_LIFETIME * 0.5;
        ps.maxLifeTime = MATCH_PARTICLE_LIFETIME;
        ps.emitRate = 800 * intensity;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
        ps.gravity = new BABYLON.Vector3(0, -3.5, 0);
        ps.direction1 = new BABYLON.Vector3(-2, 3, -2);
        ps.direction2 = new BABYLON.Vector3(2, 5, 2);
        ps.minEmitPower = 1.2 * intensity;
        ps.maxEmitPower = 3.2 * intensity;
        ps.updateSpeed = 0.02;
        ps.targetStopDuration = 0.12;
        ps.disposeOnStop = true;
        ps.start();
    }

    /** Golden confetti shower over the board on a level win. */
    celebrate(): void {
        const ps = new BABYLON.ParticleSystem(`win-shower-${Date.now()}`, 420, this.bjs);
        ps.particleTexture = this.particleTexture;
        ps.emitter = new BABYLON.Vector3(0, 14, 0);
        ps.minEmitBox = new BABYLON.Vector3(-9, 0, -9);
        ps.maxEmitBox = new BABYLON.Vector3(9, 0, 9);
        ps.color1 = new BABYLON.Color4(1, 0.86, 0.36, 1);
        ps.color2 = new BABYLON.Color4(1, 0.62, 0.22, 1);
        ps.colorDead = new BABYLON.Color4(1, 0.5, 0.1, 0);
        ps.minSize = 0.18;
        ps.maxSize = 0.52;
        ps.minLifeTime = 1.6;
        ps.maxLifeTime = 2.8;
        ps.emitRate = 320;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
        ps.gravity = new BABYLON.Vector3(0, -9, 0);
        ps.direction1 = new BABYLON.Vector3(-1.2, -2, -1.2);
        ps.direction2 = new BABYLON.Vector3(1.2, -1, 1.2);
        ps.minEmitPower = 1;
        ps.maxEmitPower = 3;
        ps.updateSpeed = 0.02;
        ps.targetStopDuration = 1.3;
        ps.disposeOnStop = true;
        ps.start();
    }

    dispose(): void {
        this.particleTexture?.dispose();
    }
}
