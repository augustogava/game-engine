/** Top-down camera that frames the whole board with a slight tilt. */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import {
    CAMERA_ALPHA, CAMERA_BETA, CAMERA_FOV, CAMERA_LERP_SPEED,
    CAMERA_RADIUS_FACTOR, CAMERA_RADIUS_MAX, CAMERA_RADIUS_MIN,
} from '../constants/cameraConstants.js';

/** Extra distance margin so the board clears the top HUD/tray and controls. */
const FRAME_MARGIN = 1.5;

/** Fraction of the viewport the board may occupy on each axis. The leftover
 *  vertical space keeps the board clear of the top HUD/tray and bottom controls. */
const VERTICAL_FILL = 0.74;
const HORIZONTAL_FILL = 0.92;

/** On portrait, shift the board down (as a fraction of board depth) so the top HUD/tray
 *  does not clip the upper tiles. Negative moves the rendered board downward on screen. */
const PORTRAIT_DOWN_OFFSET = 0.06;

export class CameraSystem {
    private game: MahjongScene;
    private camera!: BABYLON.ArcRotateCamera;
    private targetRadius = 20;
    private lastBoardWidth = 12;
    private lastBoardDepth = 12;
    private targetCenter = BABYLON.Vector3.Zero();
    private resizeHandler: (() => void) | null = null;

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
        // Camera is fully locked: no attachControl, so the user cannot zoom, pan,
        // rotate or pinch the view on desktop or mobile.
        bjs.activeCamera = this.camera;

        // Re-fit when the viewport changes (rotation / browser chrome / resize).
        this.resizeHandler = () => this.applyFraming();
        window.addEventListener('resize', this.resizeHandler);
        window.addEventListener('orientationchange', this.resizeHandler);
    }

    /** Re-frames the camera to fit a board of the given width/depth, optionally recentering on `center`. */
    frameBoard(boardWidth: number, boardDepth: number, center?: BABYLON.Vector3): void {
        this.lastBoardWidth = boardWidth;
        this.lastBoardDepth = boardDepth;
        if (center) this.targetCenter.copyFrom(center);
        this.applyFraming();
    }

    /** Computes the target distance so the whole board fits the current viewport,
     *  reserving space for the top HUD/tray and bottom controls. */
    private applyFraming(): void {
        if (!this.camera) return;
        const engine = this.game.bjs?.getEngine?.();
        const width = engine ? engine.getRenderWidth() : window.innerWidth;
        const height = engine ? engine.getRenderHeight() : window.innerHeight;
        const aspect = width / Math.max(1, height);

        // Babylon's default FOV mode is vertical-fixed: camera.fov is the vertical
        // field of view; the horizontal one widens with the aspect ratio.
        const vHalfFov = this.camera.fov / 2;
        const hHalfFov = Math.atan(Math.tan(vHalfFov) * aspect);

        // Distance needed so the board width fits horizontally and the board depth
        // fits vertically, each only filling its allowed fraction of the viewport.
        const fitH = (this.lastBoardWidth / HORIZONTAL_FILL) / 2 / Math.tan(hHalfFov);
        const fitV = (this.lastBoardDepth / VERTICAL_FILL) / 2 / Math.tan(vHalfFov);
        const radius = Math.max(fitH, fitV) * CAMERA_RADIUS_FACTOR + FRAME_MARGIN;
        this.targetRadius = Math.min(CAMERA_RADIUS_MAX, Math.max(CAMERA_RADIUS_MIN, radius));

        // Bias the board slightly lower on portrait so the top tiles clear the HUD/tray overlay.
        this.camera.targetScreenOffset.y = aspect < 1 ? -this.lastBoardDepth * PORTRAIT_DOWN_OFFSET : 0;
    }

    update(dt: number): void {
        if (!this.camera) return;
        const t = Math.min(1, CAMERA_LERP_SPEED * dt);
        this.camera.radius += (this.targetRadius - this.camera.radius) * t;
        const tgt = this.camera.target;
        tgt.x += (this.targetCenter.x - tgt.x) * t;
        tgt.y += (this.targetCenter.y - tgt.y) * t;
        tgt.z += (this.targetCenter.z - tgt.z) * t;
    }

    dispose(): void {
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            window.removeEventListener('orientationchange', this.resizeHandler);
            this.resizeHandler = null;
        }
        this.camera?.dispose();
    }
}
