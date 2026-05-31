import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    CAMERA_LOWER_RADIUS_LIMIT_M,
    CAMERA_UPPER_RADIUS_LIMIT_M,
    CAMERA_GROUND_CLEARANCE_M,
    CAMERA_BETA_SAFETY_EPSILON,
    CAMERA_MODE_COUNT,
    CAMERA_MODE_CHASE,
    CAMERA_MODE_COCKPIT,
    CAMERA_MODE_EXTERNAL_FIXED,
    CAMERA_MODE_FLYBY,
    CAMERA_MODE_TOWER,
    CAMERA_RADIUS_MIN_M,
    CAMERA_RADIUS_MAX_M,
    CAMERA_CYCLE_COOLDOWN_MS,
    TOWER_CAMERA_HEIGHT_M,
    TOWER_CAMERA_BETA_RAD,
    TOWER_CAMERA_MIN_RADIUS_M,
    GROUND_Y,
} from '../constants/index.js';

export class CameraSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    buildCamera(scene: BABYLON.Scene): void {
        const canvas = scene.getEngine().getRenderingCanvas();

        this.scene.camera = new BABYLON.ArcRotateCamera(
            'flightCam',
            -Math.PI / 2,
            1.50,
            65,
            this.scene.planeRoot.position.clone(),
            scene,
        );

        this.scene.camera.minZ = 0.5;
        this.scene.camera.maxZ = this.scene.tiles ? 100000 : 60000;
        this.scene.camera.lowerRadiusLimit = CAMERA_LOWER_RADIUS_LIMIT_M;
        this.scene.camera.upperRadiusLimit = CAMERA_UPPER_RADIUS_LIMIT_M;
        this.scene.camera.inertia = 0.8;
        this.scene.camera.panningSensibility = 0;
        this.scene.camera.wheelPrecision = 10;

        this.scene.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

        if (canvas) this.scene.camera.attachControl(canvas, true);

        if (this.scene.isMobile) {
            this.scene.camera.inputs.removeByType('ArcRotateCameraPointersInput');
        }

        scene.activeCamera = this.scene.camera;
    }

    clampCameraAboveGround(): void {
        if (!this.scene.camera) return;
        try {
            const groundLevel = this.scene.tiles ? this.scene.terrainY : GROUND_Y;
            if (!Number.isFinite(groundLevel)) return;
            const minCameraY = groundLevel + CAMERA_GROUND_CLEARANCE_M;
            const radius = this.scene.camera.radius;
            if (!(radius > 0)) return;
            const dy = this.scene.camera.target.y - minCameraY;
            let upperBeta: number;
            const ratio = -dy / radius;
            if (ratio <= -1) {
                upperBeta = Math.PI - CAMERA_BETA_SAFETY_EPSILON;
            } else if (ratio >= 1) {
                upperBeta = CAMERA_BETA_SAFETY_EPSILON;
            } else {
                upperBeta = Math.acos(ratio);
            }
            this.scene.camera.upperBetaLimit = upperBeta;
            if (this.scene.camera.beta > upperBeta) {
                this.scene.camera.beta = upperBeta;
            }
        } catch (err) {
            console.warn('[Camera] Ground clamp failed:', err);
        }
    }

    setCameraMode(mode: number): void {
        if (!this.scene.camera || !this.scene.planeRoot) return;
        const safeMode = ((mode % CAMERA_MODE_COUNT) + CAMERA_MODE_COUNT) % CAMERA_MODE_COUNT;
        this.scene._cameraMode = safeMode;
        const target = this.scene.planeRoot.position.clone();
        try {
            switch (safeMode) {
                case CAMERA_MODE_CHASE:
                    this.scene.camera.beta = 1.50;
                    this.scene.camera.radius = Math.max(CAMERA_RADIUS_MIN_M, Math.min(CAMERA_RADIUS_MAX_M, this.scene.camera.radius || 35));
                    this.scene.camera.target.copyFrom(target);
                    break;
                case CAMERA_MODE_COCKPIT:
                    this.scene.camera.beta = Math.PI / 2;
                    this.scene.camera.radius = 0.5;
                    this.scene.camera.target.copyFrom(target);
                    break;
                case CAMERA_MODE_EXTERNAL_FIXED:
                    this.scene.camera.beta = 1.20;
                    this.scene.camera.radius = 50;
                    break;
                case CAMERA_MODE_FLYBY:
                    this.scene.camera.beta = 1.40;
                    this.scene.camera.radius = 80;
                    break;
                case CAMERA_MODE_TOWER:
                    this.scene.camera.beta = TOWER_CAMERA_BETA_RAD;
                    this.scene.camera.radius = TOWER_CAMERA_MIN_RADIUS_M;
                    this.captureTowerCameraPosition();
                    break;
            }
            if (safeMode !== CAMERA_MODE_TOWER) this.scene._towerCameraSet = false;
            this.setAircraftModelVisible(safeMode !== CAMERA_MODE_COCKPIT);
            console.log(`[Camera] Mode changed to ${safeMode}`);
        } catch (err) {
            console.warn('[Camera] Failed to set mode:', err);
        }
    }

    setAircraftModelVisible(visible: boolean): void {
        const meshes = this.scene._loadedModelMeshes;
        if (!Array.isArray(meshes)) return;
        for (const mesh of meshes) {
            try {
                if (mesh) mesh.isVisible = visible;
            } catch (err) {
                console.warn('[Camera] Failed to toggle aircraft mesh visibility:', err);
            }
        }
    }

    cycleCameraMode(): void {
        const now = performance.now();
        if (now - this.scene._lastCameraCycleMs < CAMERA_CYCLE_COOLDOWN_MS) return;
        this.scene._lastCameraCycleMs = now;
        this.setCameraMode((this.scene._cameraMode + 1) % CAMERA_MODE_COUNT);
    }

    captureTowerCameraPosition(): void {
        if (!this.scene.planeRoot) return;
        const groundY = this.scene.tiles ? this.scene.terrainY : GROUND_Y;
        const lockedY = (Number.isFinite(groundY) && groundY > -1e8 ? groundY : GROUND_Y) + TOWER_CAMERA_HEIGHT_M;
        const px = this.scene.planeRoot.position.x;
        const pz = this.scene.planeRoot.position.z;
        this.scene._towerCameraPos.set(px, lockedY, pz);
        this.scene._towerCameraSet = true;
    }
}
