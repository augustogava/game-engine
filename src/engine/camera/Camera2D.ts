/**
 * Camera2D - World-to-screen and screen-to-world transforms with pan and zoom
 */
import { Vector2 } from '../math/Vector2.js';
import { MathUtils } from '../math/MathUtils.js';

export class Camera2D {
    position: Vector2; // World position the camera looks at
    zoom: number;
    minZoom: number;
    maxZoom: number;
    private _screenWidth: number;
    private _screenHeight: number;

    constructor(screenWidth: number, screenHeight: number) {
        this.position = Vector2.zero();
        this.zoom = 1;
        this.minZoom = 0.01;
        this.maxZoom = 50;
        this._screenWidth = screenWidth;
        this._screenHeight = screenHeight;
    }

    get screenWidth(): number { return this._screenWidth; }
    get screenHeight(): number { return this._screenHeight; }

    resize(w: number, h: number): void {
        this._screenWidth = w;
        this._screenHeight = h;
    }

    /** Converts a world-space point to screen-space */
    worldToScreen(worldPos: Vector2): Vector2 {
        return new Vector2(
            (worldPos.x - this.position.x) * this.zoom + this._screenWidth * 0.5,
            (worldPos.y - this.position.y) * this.zoom + this._screenHeight * 0.5
        );
    }

    /** Converts a screen-space point to world-space */
    screenToWorld(screenPos: Vector2): Vector2 {
        return new Vector2(
            (screenPos.x - this._screenWidth * 0.5) / this.zoom + this.position.x,
            (screenPos.y - this._screenHeight * 0.5) / this.zoom + this.position.y
        );
    }

    /** Pan camera by a screen-space delta */
    pan(screenDelta: Vector2): void {
        this.position.x -= screenDelta.x / this.zoom;
        this.position.y -= screenDelta.y / this.zoom;
    }

    /** Zoom centered on a screen-space point */
    zoomAt(screenPoint: Vector2, factor: number): void {
        const worldBefore = this.screenToWorld(screenPoint);
        this.zoom = MathUtils.clamp(this.zoom * factor, this.minZoom, this.maxZoom);
        const worldAfter = this.screenToWorld(screenPoint);
        // Compensate so the point under the cursor stays fixed
        this.position.x += worldBefore.x - worldAfter.x;
        this.position.y += worldBefore.y - worldAfter.y;
    }

    /** Apply camera transform to a Canvas 2D context */
    applyToContext(ctx: CanvasRenderingContext2D): void {
        ctx.setTransform(
            this.zoom, 0,
            0, this.zoom,
            this._screenWidth * 0.5 - this.position.x * this.zoom,
            this._screenHeight * 0.5 - this.position.y * this.zoom
        );
    }

    /** Get the visible world bounds */
    getWorldBounds(): { left: number; right: number; top: number; bottom: number } {
        const hw = (this._screenWidth * 0.5) / this.zoom;
        const hh = (this._screenHeight * 0.5) / this.zoom;
        return {
            left: this.position.x - hw,
            right: this.position.x + hw,
            top: this.position.y - hh,
            bottom: this.position.y + hh,
        };
    }

    isPointVisible(worldPos: Vector2, margin: number = 0): boolean {
        const bounds = this.getWorldBounds();
        return worldPos.x >= bounds.left - margin &&
            worldPos.x <= bounds.right + margin &&
            worldPos.y >= bounds.top - margin &&
            worldPos.y <= bounds.bottom + margin;
    }
}
