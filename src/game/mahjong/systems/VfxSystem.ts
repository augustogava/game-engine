/** Particle effects: white petal shower on match, golden petals on level win. */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import { MATCH_PARTICLE_COUNT, MATCH_PARTICLE_LIFETIME } from '../constants/graphicsConstants.js';

const PETAL_TEXTURE_SIZE = 64;

export class VfxSystem {
    private game: MahjongScene;
    private bjs!: BABYLON.Scene;
    private petalTexture!: BABYLON.DynamicTexture;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        this.bjs = this.game.bjs;
        this.petalTexture = new BABYLON.DynamicTexture('mahjong-petal', PETAL_TEXTURE_SIZE, this.bjs, false);
        const ctx = this.petalTexture.getContext() as unknown as CanvasRenderingContext2D;
        this.drawPetal(ctx, PETAL_TEXTURE_SIZE);
        this.petalTexture.hasAlpha = true;
        this.petalTexture.update();
    }

    /** Soft white petal: a teardrop with a subtle radial fade, like the reference shower. */
    private drawPetal(ctx: CanvasRenderingContext2D, size: number): void {
        const c = size / 2;
        ctx.clearRect(0, 0, size, size);
        const grad = ctx.createRadialGradient(c, c * 0.85, 2, c, c, c * 0.95);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.75, 'rgba(255,255,255,0.9)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(c, size * 0.06);
        ctx.bezierCurveTo(size * 0.92, size * 0.3, size * 0.82, size * 0.86, c, size * 0.94);
        ctx.bezierCurveTo(size * 0.18, size * 0.86, size * 0.08, size * 0.3, c, size * 0.06);
        ctx.closePath();
        ctx.fill();
    }

    /** White petal shower streaming upward from a matched tile toward the tray. */
    burst(position: BABYLON.Vector3, combo = 1): void {
        const intensity = Math.min(1 + (combo - 1) * 0.22, 2.6);
        const capacity = Math.round(MATCH_PARTICLE_COUNT * 1.6 * intensity);
        const ps = new BABYLON.ParticleSystem(`match-petals-${Date.now()}`, capacity, this.bjs);
        ps.particleTexture = this.petalTexture;
        ps.emitter = position.clone();
        ps.minEmitBox = new BABYLON.Vector3(-0.25, 0, -0.25);
        ps.maxEmitBox = new BABYLON.Vector3(0.25, 0.15, 0.25);
        ps.color1 = new BABYLON.Color4(1, 1, 1, 0.95);
        ps.color2 = new BABYLON.Color4(0.92, 0.96, 1, 0.85);
        ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
        ps.minSize = 0.09 * intensity;
        ps.maxSize = 0.22 * intensity;
        ps.minLifeTime = MATCH_PARTICLE_LIFETIME;
        ps.maxLifeTime = MATCH_PARTICLE_LIFETIME * 1.8;
        ps.emitRate = 900 * intensity;
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        // Upward stream drifting toward the top of the screen (tray side, -Z).
        ps.gravity = new BABYLON.Vector3(0, -1.2, 0);
        ps.direction1 = new BABYLON.Vector3(-1.4, 4.5, -3.2);
        ps.direction2 = new BABYLON.Vector3(1.4, 7.5, -1.0);
        ps.minEmitPower = 1.0 * intensity;
        ps.maxEmitPower = 2.4 * intensity;
        ps.minInitialRotation = 0;
        ps.maxInitialRotation = Math.PI * 2;
        ps.minAngularSpeed = -Math.PI * 2;
        ps.maxAngularSpeed = Math.PI * 2;
        ps.updateSpeed = 0.02;
        ps.targetStopDuration = 0.16;
        ps.disposeOnStop = true;
        ps.start();
    }

    /** Golden petal shower over the board on a level win. */
    celebrate(): void {
        const ps = new BABYLON.ParticleSystem(`win-shower-${Date.now()}`, 420, this.bjs);
        ps.particleTexture = this.petalTexture;
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
        ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        ps.gravity = new BABYLON.Vector3(0, -9, 0);
        ps.direction1 = new BABYLON.Vector3(-1.2, -2, -1.2);
        ps.direction2 = new BABYLON.Vector3(1.2, -1, 1.2);
        ps.minInitialRotation = 0;
        ps.maxInitialRotation = Math.PI * 2;
        ps.minAngularSpeed = -Math.PI;
        ps.maxAngularSpeed = Math.PI;
        ps.minEmitPower = 1;
        ps.maxEmitPower = 3;
        ps.updateSpeed = 0.02;
        ps.targetStopDuration = 1.3;
        ps.disposeOnStop = true;
        ps.start();
    }

    dispose(): void {
        this.petalTexture?.dispose();
    }
}
