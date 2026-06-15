/** Top-down camera that frames the whole board with a slight tilt. */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import {
    CAMERA_ALPHA, CAMERA_BETA, CAMERA_FOV, CAMERA_LERP_SPEED,
    CAMERA_RADIUS_FACTOR, CAMERA_RADIUS_MAX, CAMERA_RADIUS_MIN,
} from '../constants/cameraConstants.js';

export class CameraSystem {
    private game: MahjongScene;
    private camera!: BABYLON.ArcRotateCamera;
    private targetRadius = 20;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        const bjs = this.game.bjs;
        this.camera = new BABYLON.ArcRotateCamera('mahjong-cam', CAMERA_ALPHA, CAMERA_BETA, this.targetRadius, BABYLON.Vector3.Zero(), bjs);
        this.camera.fov = CAMERA_FOV;
        this.camera.lowerRadiusLimit = CAMERA_RADIUS_MIN;
        this.camera.upperRadiusLimit = CAMERA_RADIUS_MAX;
        this.camera.lowerBetaLimit = BABYLON.Tools.ToRadians(2);
        this.camera.upperBetaLimit = BABYLON.Tools.ToRadians(55);
        this.camera.wheelPrecision = 18;
        this.camera.panningSensibility = 0;
        this.camera.attachControl(bjs.getEngine().getRenderingCanvas(), true);
        bjs.activeCamera = this.camera;
    }

    /** Re-frames the camera to fit a board of the given radius. */
    frameBoard(boardRadius: number): void {
        this.targetRadius = Math.min(CAMERA_RADIUS_MAX, Math.max(CAMERA_RADIUS_MIN, boardRadius * CAMERA_RADIUS_FACTOR + 6));
    }

    update(dt: number): void {
        if (!this.camera) return;
        const t = Math.min(1, CAMERA_LERP_SPEED * dt);
        this.camera.radius += (this.targetRadius - this.camera.radius) * t;
    }

    dispose(): void {
        this.camera?.dispose();
    }
}
