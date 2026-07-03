/** Top-down camera that frames the whole board with a slight tilt. */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import {
    CAMERA_ALPHA, CAMERA_BETA, CAMERA_FOV, CAMERA_LERP_SPEED,
    CAMERA_RADIUS_FACTOR, CAMERA_RADIUS_MAX, CAMERA_RADIUS_MIN,
} from '../constants/cameraConstants.js';

/** Extra distance margin so the board clears the top HUD/tray and controls. */
const FRAME_MARGIN = 1.5;

/** Fallback fractions when the DOM overlays cannot be measured. */
const FALLBACK_VERTICAL_FILL = 0.6;
const HORIZONTAL_FILL = 0.92;

/** Padding (CSS px) kept between the board and the tray above / controls below. */
const BAND_PADDING_PX = 14;

/** Clamp range for the DOM-derived vertical fill fraction. */
const VERTICAL_FILL_MIN = 0.3;
const VERTICAL_FILL_MAX = 0.85;

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

    /** Measures the free vertical band between the tray (above) and the controls
     *  (below) in CSS pixels; falls back to a fixed fraction if unavailable. */
    private measureVerticalBand(viewportHeight: number): { fill: number; centerOffsetPx: number } {
        const tray = document.getElementById('mj-tray');
        const controls = document.getElementById('mj-controls');
        if (!tray || !controls || viewportHeight <= 0) {
            return { fill: FALLBACK_VERTICAL_FILL, centerOffsetPx: 0 };
        }
        const bandTop = tray.getBoundingClientRect().bottom + BAND_PADDING_PX;
        const bandBottom = controls.getBoundingClientRect().top - BAND_PADDING_PX;
        if (bandBottom - bandTop < viewportHeight * VERTICAL_FILL_MIN) {
            return { fill: FALLBACK_VERTICAL_FILL, centerOffsetPx: 0 };
        }
        const fill = Math.min(VERTICAL_FILL_MAX, (bandBottom - bandTop) / viewportHeight);
        const centerOffsetPx = (bandTop + bandBottom) / 2 - viewportHeight / 2;
        return { fill, centerOffsetPx };
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

        // The board must fit inside the band left free by the DOM overlays.
        const cssHeight = window.innerHeight;
        const band = this.measureVerticalBand(cssHeight);

        // Distance needed so the board width fits horizontally and the board depth
        // fits vertically, each only filling its allowed fraction of the viewport.
        const fitH = (this.lastBoardWidth / HORIZONTAL_FILL) / 2 / Math.tan(hHalfFov);
        const fitV = (this.lastBoardDepth / band.fill) / 2 / Math.tan(vHalfFov);
        const radius = Math.max(fitH, fitV) * CAMERA_RADIUS_FACTOR + FRAME_MARGIN;
        this.targetRadius = Math.min(CAMERA_RADIUS_MAX, Math.max(CAMERA_RADIUS_MIN, radius));

        // Shift the board so it centers inside the band (negative y renders lower).
        const worldPerCssPx = (2 * this.targetRadius * Math.tan(vHalfFov)) / Math.max(1, cssHeight);
        this.camera.targetScreenOffset.y = -band.centerOffsetPx * worldPerCssPx;
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
