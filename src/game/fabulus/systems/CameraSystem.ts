import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import {
    CAMERA_ALPHA_RAD, CAMERA_BETA_RAD, CAMERA_FOLLOW_LERP,
    CAMERA_RADIUS_DEFAULT, CAMERA_RADIUS_MAX, CAMERA_RADIUS_MIN, CAMERA_WHEEL_ZOOM_STEP,
} from '../constants/index.js';

const SHAKE_DECAY_PER_SEC = 4.5;

export class CameraSystem {
    private scene: FabulusScene;
    camera: BABYLON.ArcRotateCamera | null = null;
    private _wheelHandler: ((e: WheelEvent) => void) | null = null;
    private shakeIntensity = 0;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        const s = this.scene.bScene;
        const camera = new BABYLON.ArcRotateCamera(
            'fab_camera', CAMERA_ALPHA_RAD, CAMERA_BETA_RAD, CAMERA_RADIUS_DEFAULT,
            new BABYLON.Vector3(0, 0, 0), s,
        );
        camera.inputs.clear();
        camera.lowerRadiusLimit = CAMERA_RADIUS_MIN;
        camera.upperRadiusLimit = CAMERA_RADIUS_MAX;
        camera.minZ = 0.5;
        camera.maxZ = 300;
        s.activeCamera = camera;
        this.camera = camera;

        const canvas = s.getEngine().getRenderingCanvas();
        if (canvas) {
            this._wheelHandler = (e: WheelEvent) => {
                if (!this.camera) return;
                const next = this.camera.radius + e.deltaY * CAMERA_WHEEL_ZOOM_STEP;
                this.camera.radius = Math.max(CAMERA_RADIUS_MIN, Math.min(CAMERA_RADIUS_MAX, next));
            };
            canvas.addEventListener('wheel', this._wheelHandler, { passive: true });
        }
        console.debug('[Fabulus] Camera ready');
    }

    shake(intensity: number): void {
        this.shakeIntensity = Math.min(0.5, this.shakeIntensity + intensity);
    }

    update(dt: number): void {
        if (!this.camera || !this.scene.playerRoot) return;
        const target = this.scene.playerRoot.position;
        const lerp = Math.min(1, CAMERA_FOLLOW_LERP * dt);
        const cur = this.camera.target;
        cur.x += (target.x - cur.x) * lerp;
        cur.y += (target.y + 1 - cur.y) * lerp;
        cur.z += (target.z - cur.z) * lerp;

        if (this.shakeIntensity > 0.001) {
            cur.x += (Math.random() * 2 - 1) * this.shakeIntensity;
            cur.z += (Math.random() * 2 - 1) * this.shakeIntensity;
            this.shakeIntensity = Math.max(0, this.shakeIntensity - SHAKE_DECAY_PER_SEC * this.shakeIntensity * dt - 0.002);
        }

        this.scene.lightingSystem.followPlayer();
    }

    dispose(): void {
        const canvas = this.scene.bScene.getEngine().getRenderingCanvas();
        if (canvas && this._wheelHandler) {
            canvas.removeEventListener('wheel', this._wheelHandler);
            this._wheelHandler = null;
        }
    }
}
