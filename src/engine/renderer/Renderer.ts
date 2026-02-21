/**
 * Renderer - Canvas 2D abstraction layer with HiDPI support
 */
import { Camera2D } from '../camera/Camera2D.js';
import { Vector2 } from '../math/Vector2.js';

export class Renderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    private pixelRatio: number;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get 2D context');
        this.ctx = ctx;
        this.pixelRatio = window.devicePixelRatio || 1;
        this.resize(window.innerWidth, window.innerHeight);

        window.addEventListener('resize', () => {
            this.resize(window.innerWidth, window.innerHeight);
        });
    }

    resize(width: number, height: number): void {
        const pr = this.pixelRatio;
        this.canvas.width = width * pr;
        this.canvas.height = height * pr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.ctx.scale(pr, pr);
    }

    get width(): number { return this.canvas.width / this.pixelRatio; }
    get height(): number { return this.canvas.height / this.pixelRatio; }

    clear(color: string = '#000000'): void {
        this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    applyCamera(camera: Camera2D): void {
        const pr = this.pixelRatio;
        this.ctx.setTransform(
            camera.zoom * pr, 0,
            0, camera.zoom * pr,
            (this.width * 0.5 - camera.position.x * camera.zoom) * pr,
            (this.height * 0.5 - camera.position.y * camera.zoom) * pr
        );
    }

    resetTransform(): void {
        this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    }

    // ─── Drawing primitives ────────────────────────────────────────────────

    fillCircle(x: number, y: number, radius: number, color: string): void {
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
    }

    strokeCircle(x: number, y: number, radius: number, color: string, lineWidth: number = 1): void {
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.stroke();
    }

    fillRect(x: number, y: number, w: number, h: number, color: string): void {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, w, h);
    }

    line(x1: number, y1: number, x2: number, y2: number, color: string, lineWidth: number = 1): void {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.stroke();
    }

    text(text: string, x: number, y: number, color: string = '#fff', size: number = 14, align: CanvasTextAlign = 'left'): void {
        this.ctx.fillStyle = color;
        this.ctx.font = `${size}px Inter, system-ui, sans-serif`;
        this.ctx.textAlign = align;
        this.ctx.fillText(text, x, y);
    }

    createRadialGradient(x: number, y: number, r0: number, r1: number): CanvasGradient {
        return this.ctx.createRadialGradient(x, y, r0, x, y, r1);
    }

    setGlobalAlpha(alpha: number): void { this.ctx.globalAlpha = alpha; }
    setCompositeOperation(op: GlobalCompositeOperation): void { this.ctx.globalCompositeOperation = op; }
    setShadow(blur: number, color: string): void { this.ctx.shadowBlur = blur; this.ctx.shadowColor = color; }
    clearShadow(): void { this.ctx.shadowBlur = 0; this.ctx.shadowColor = 'transparent'; }

    save(): void { this.ctx.save(); }
    restore(): void { this.ctx.restore(); }
}
