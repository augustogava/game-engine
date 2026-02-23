/**
 * SpriteSheet - Engine module for loading, slicing, and rendering sprite sheets.
 * Supports static sprites, animated sprites, and tiled rendering.
 */

/** A rectangular region within a sprite sheet image */
export interface Frame {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * SpriteSheet loads a single image and lets you define named rectangular frames within it.
 */
export class SpriteSheet {
    public image: HTMLImageElement | HTMLCanvasElement;
    private frames = new Map<string, Frame>();
    private _loaded = false;

    private chromaticKey(img: HTMLImageElement, isMap: boolean = false): HTMLCanvasElement {
        const off = document.createElement('canvas');
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const c = off.getContext('2d', { willReadFrequently: true })!;
        c.drawImage(img, 0, 0);

        const imgData = c.getImageData(0, 0, off.width, off.height);
        const data = imgData.data;

        // Use top-left pixel as the key for characters, but for the map, the white background is [255, 255, 255]
        const rK = isMap ? 255 : data[0];
        const gK = isMap ? 255 : data[1];
        const bK = isMap ? 255 : data[2];

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const dist = Math.abs(r - rK) + Math.abs(g - gK) + Math.abs(b - bK);

            // Allow larger tolerance for white jpeg compression artifacts
            if (dist < (isMap ? 150 : 40)) {
                data[i + 3] = 0;
            }
        }

        c.putImageData(imgData, 0, 0);
        return off;
    }

    constructor(src: string) {
        // use an internal image object to load
        const img = new Image();
        img.src = src;
        img.onload = () => {
            if (src.includes('rpg_npcs')) {
                this.image = this.chromaticKey(img, false) as any;
            } else if (src.includes('rpg_map')) {
                this.image = this.chromaticKey(img, true) as any;
            } else {
                this.image = img;
            }
            this._loaded = true;
        };
        // fallback initialize
        this.image = img;
    }

    get loaded(): boolean { return this._loaded; }

    /** Define a named frame region */
    defineFrame(name: string, x: number, y: number, w: number, h: number): void {
        this.frames.set(name, { x, y, w, h });
    }

    /** Define a grid of frames from a row. Generates names like `prefix_0`, `prefix_1`, ... */
    defineRow(prefix: string, y: number, h: number, cellWidth: number, count: number, startX: number = 0): void {
        for (let i = 0; i < count; i++) {
            this.defineFrame(`${prefix}_${i}`, startX + i * cellWidth, y, cellWidth, h);
        }
    }

    /** Get a frame by name */
    getFrame(name: string): Frame | undefined {
        return this.frames.get(name);
    }

    /** Get all frame names */
    getFrameNames(): string[] {
        return Array.from(this.frames.keys());
    }

    /**
     * Draw a single named frame at a world position.
     * @param ctx Canvas rendering context
     * @param frameName Name of the frame to draw
     * @param dx Destination X
     * @param dy Destination Y
     * @param dw Destination width (defaults to frame width)
     * @param dh Destination height (defaults to frame height)
     */
    draw(ctx: CanvasRenderingContext2D, frameName: string, dx: number, dy: number, dw?: number, dh?: number): void {
        if (!this._loaded) return;
        const f = this.frames.get(frameName);
        if (!f) return;
        ctx.drawImage(this.image, f.x, f.y, f.w, f.h, dx, dy, dw ?? f.w, dh ?? f.h);
    }

    /**
     * Draw a frame directly from a Frame object.
     */
    drawFrame(ctx: CanvasRenderingContext2D, frame: Frame, dx: number, dy: number, dw?: number, dh?: number): void {
        if (!this._loaded) return;
        ctx.drawImage(this.image, frame.x, frame.y, frame.w, frame.h, dx, dy, dw ?? frame.w, dh ?? frame.h);
    }
}

/**
 * Sprite - Static reference to a single frame within a SpriteSheet.
 */
export class Sprite {
    constructor(
        public sheet: SpriteSheet,
        public frameName: string,
        public width?: number,
        public height?: number
    ) { }

    draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
        this.sheet.draw(ctx, this.frameName, x, y, this.width, this.height);
    }
}

/**
 * AnimatedSprite - Cycles through a sequence of frames at a given FPS.
 */
export class AnimatedSprite {
    private frameNames: string[];
    private fps: number;
    private elapsed = 0;
    private currentIndex = 0;
    public loop = true;

    constructor(
        public sheet: SpriteSheet,
        frameNames: string[],
        fps: number = 10
    ) {
        this.frameNames = frameNames;
        this.fps = fps;
    }

    /** Update the animation timer */
    update(dt: number): void {
        this.elapsed += dt;
        const frameDuration = 1 / this.fps;
        while (this.elapsed >= frameDuration) {
            this.elapsed -= frameDuration;
            if (this.loop) {
                this.currentIndex = (this.currentIndex + 1) % this.frameNames.length;
            } else {
                this.currentIndex = Math.min(this.currentIndex + 1, this.frameNames.length - 1);
            }
        }
    }

    /** Reset to first frame */
    reset(): void {
        this.currentIndex = 0;
        this.elapsed = 0;
    }

    /** Get the current frame name */
    get currentFrame(): string {
        return this.frameNames[this.currentIndex];
    }

    draw(ctx: CanvasRenderingContext2D, x: number, y: number, w?: number, h?: number): void {
        this.sheet.draw(ctx, this.currentFrame, x, y, w, h);
    }
}

/**
 * TiledSprite - Repeats a frame horizontally to fill a given width.
 * Perfect for ground strips, sky layers, etc.
 */
export class TiledSprite {
    constructor(
        public sheet: SpriteSheet,
        public frameName: string,
        public tileWidth: number,
        public tileHeight: number
    ) { }

    /**
     * Draw the tile repeated across a horizontal span.
     * @param ctx Canvas context
     * @param x Left edge of the tiled area (world coords)
     * @param y Top edge
     * @param totalWidth Total width to fill
     * @param scrollOffset Horizontal scroll offset (for parallax)
     */
    drawTiled(ctx: CanvasRenderingContext2D, x: number, y: number, totalWidth: number, scrollOffset: number = 0): void {
        if (!this.sheet.loaded) return;
        const f = this.sheet.getFrame(this.frameName);
        if (!f) return;

        // Calculate starting tile index based on scroll
        const offset = ((scrollOffset % this.tileWidth) + this.tileWidth) % this.tileWidth;
        const startX = x - offset;

        for (let tx = startX; tx < x + totalWidth; tx += this.tileWidth) {
            this.sheet.drawFrame(ctx, f, tx, y, this.tileWidth, this.tileHeight);
        }
    }
}
