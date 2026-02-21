/**
 * LightingRenderer - 2D lighting pass using off-screen canvas compositing.
 *
 * Architecture:
 *   1. Render a dark "ambient" layer (the shadow overlay) to an off-screen canvas.
 *   2. For each light, cut out a lit region using radial/cone gradients
 *      with 'destination-out' or 'lighter' compositing.
 *   3. Composite the lighting canvas onto the main canvas with 'multiply'
 *      (so lit areas show the scene, dark areas mask it).
 *
 * Usage:
 *   const lighting = new LightingRenderer(renderer);
 *   lighting.ambientColor = { r: 20, g: 20, b: 40 };
 *   lighting.ambientIntensity = 0.85;
 *   lighting.addLight(new PointLight(new Vector2(400, 300), 200));
 *
 *   // In render loop (after drawing the world, before drawing HUD):
 *   lighting.render(camera);
 */
import { Renderer } from '../renderer/Renderer.js';
import { Camera2D } from '../camera/Camera2D.js';
import {
    Light, PointLight, DirectionalLight, SpotLight,
    LightColor, rgbToString
} from './Light.js';
import { Vector2 } from '../math/Vector2.js';
import { MathUtils } from '../math/MathUtils.js';

export class LightingRenderer {
    /** Lights managed by this renderer */
    lights: Light[] = [];

    /** Base ambient color (fills the shadow overlay) */
    ambientColor: LightColor = { r: 10, g: 10, b: 25 };

    /** How dark the unlit areas are (0=fully transparent, 1=full ambient color) */
    ambientIntensity: number = 0.85;

    /** Enable/disable the entire lighting pass */
    enabled: boolean = true;

    /**
     * Composite operation used to blend the light canvas over the scene.
     * 'multiply' = physically correct darkening.
     * 'source-over' with low ambient alpha = simpler additive.
     */
    compositeMode: GlobalCompositeOperation = 'multiply';

    private lightCanvas: HTMLCanvasElement;
    private lightCtx: CanvasRenderingContext2D;
    private pixelRatio: number;

    constructor(private renderer: Renderer) {
        this.pixelRatio = window.devicePixelRatio || 1;
        this.lightCanvas = document.createElement('canvas');
        const ctx = this.lightCanvas.getContext('2d');
        if (!ctx) throw new Error('LightingRenderer: failed to get 2D context');
        this.lightCtx = ctx;
        this.resize(renderer.width, renderer.height);

        window.addEventListener('resize', () => {
            this.resize(renderer.width, renderer.height);
        });
    }

    private resize(w: number, h: number): void {
        const pr = this.pixelRatio;
        this.lightCanvas.width = w * pr;
        this.lightCanvas.height = h * pr;
    }

    addLight<T extends Light>(light: T): T {
        this.lights.push(light);
        return light;
    }

    removeLight(light: Light): void {
        const idx = this.lights.indexOf(light);
        if (idx !== -1) this.lights.splice(idx, 1);
    }

    clear(): void { this.lights.length = 0; }

    // ─── Main Render Pass ───────────────────────────────────────────────────

    render(camera: Camera2D): void {
        if (!this.enabled) return;

        const lc = this.lightCtx;
        const pr = this.pixelRatio;
        const W = this.renderer.width * pr;
        const H = this.renderer.height * pr;

        // 1. Fill shadow overlay with ambient color
        lc.setTransform(1, 0, 0, 1, 0, 0);
        lc.globalCompositeOperation = 'source-over';
        lc.globalAlpha = this.ambientIntensity;
        lc.fillStyle = rgbToString(this.ambientColor, 1);
        lc.fillRect(0, 0, W, H);

        // 2. Punch out lights using 'destination-out'
        lc.globalCompositeOperation = 'destination-out';

        for (const light of this.lights) {
            if (!light.enabled) continue;
            switch (light.type) {
                case 'point': this.renderPointLight(lc, camera, light as PointLight, pr); break;
                case 'directional': this.renderDirectional(lc, light as DirectionalLight, W, H); break;
                case 'spot': this.renderSpotLight(lc, camera, light as SpotLight, pr); break;
            }
        }

        // 3. Composite onto main canvas
        const mainCtx = this.renderer.ctx;
        mainCtx.setTransform(1, 0, 0, 1, 0, 0);
        mainCtx.globalCompositeOperation = this.compositeMode;
        mainCtx.globalAlpha = 1;
        mainCtx.drawImage(this.lightCanvas, 0, 0, W, H, 0, 0, this.renderer.width, this.renderer.height);

        // Reset
        mainCtx.globalCompositeOperation = 'source-over';
        mainCtx.globalAlpha = 1;
    }

    // ─── Point Light ────────────────────────────────────────────────────────

    private renderPointLight(
        lc: CanvasRenderingContext2D,
        camera: Camera2D,
        light: PointLight,
        pr: number,
    ): void {
        // World → screen position
        const screen = camera.worldToScreen(light.position);
        const sx = screen.x * pr, sy = screen.y * pr;
        const screenRadius = light.radius * camera.zoom * pr;
        const innerR = Math.max(0, light.innerRadius * camera.zoom * pr);

        // Quick cull
        if (sx + screenRadius < 0 || sx - screenRadius > this.lightCanvas.width) return;
        if (sy + screenRadius < 0 || sy - screenRadius > this.lightCanvas.height) return;

        const grad = lc.createRadialGradient(sx, sy, innerR, sx, sy, screenRadius);
        const clampedIntensity = MathUtils.clamp(light.intensity, 0, 2);
        const centerAlpha = Math.min(1, clampedIntensity);

        // Falloff
        if (light.falloff === 1) {
            // Linear
            grad.addColorStop(0, `rgba(0,0,0,${centerAlpha.toFixed(3)})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
        } else {
            // Quadratic-ish (3 stops)
            grad.addColorStop(0, `rgba(0,0,0,${centerAlpha.toFixed(3)})`);
            grad.addColorStop(0.4, `rgba(0,0,0,${(centerAlpha * 0.7).toFixed(3)})`);
            grad.addColorStop(0.75, `rgba(0,0,0,${(centerAlpha * 0.2).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
        }

        // Tint: blend with light color by overlaying a colored circle in 'source-over'
        // first draw the alpha mask (destination-out), then overlay color via 'screen':
        lc.globalCompositeOperation = 'destination-out';
        lc.fillStyle = grad;
        lc.beginPath();
        lc.arc(sx, sy, screenRadius, 0, MathUtils.PI2);
        lc.fill();

        // Color tint (screen blend over the opening)
        lc.globalCompositeOperation = 'source-over';
        lc.globalAlpha = clampedIntensity * 0.25;
        const tintGrad = lc.createRadialGradient(sx, sy, 0, sx, sy, screenRadius * 0.7);
        tintGrad.addColorStop(0, rgbToString(light.color, 0.9));
        tintGrad.addColorStop(1, rgbToString(light.color, 0));
        lc.fillStyle = tintGrad;
        lc.beginPath();
        lc.arc(sx, sy, screenRadius * 0.7, 0, MathUtils.PI2);
        lc.fill();
        lc.globalAlpha = 1;
        lc.globalCompositeOperation = 'destination-out';
    }

    // ─── Directional Light ──────────────────────────────────────────────────

    private renderDirectional(
        lc: CanvasRenderingContext2D,
        light: DirectionalLight,
        W: number,
        H: number,
    ): void {
        // Uniform fill — just reduce the ambient darkness
        const alpha = MathUtils.clamp(light.intensity * 0.5, 0, 0.5);
        lc.globalCompositeOperation = 'destination-out';
        lc.globalAlpha = alpha;
        lc.fillStyle = 'white';
        lc.fillRect(0, 0, W, H);
        lc.globalAlpha = 1;
    }

    // ─── Spot Light ─────────────────────────────────────────────────────────

    private renderSpotLight(
        lc: CanvasRenderingContext2D,
        camera: Camera2D,
        light: SpotLight,
        pr: number,
    ): void {
        const screen = camera.worldToScreen(light.position);
        const sx = screen.x * pr, sy = screen.y * pr;
        const screenRadius = light.radius * camera.zoom * pr;

        const outerA = light.outerAngle;
        const innerA = light.innerAngle;
        const dir = light.direction;

        // Draw a cone gradient using clipping
        lc.save();
        lc.beginPath();
        lc.moveTo(sx, sy);
        lc.arc(sx, sy, screenRadius, dir - outerA, dir + outerA, false);
        lc.closePath();
        lc.clip();

        // Radial gradient for falloff
        const grad = lc.createRadialGradient(sx, sy, 0, sx, sy, screenRadius);
        const centerAlpha = MathUtils.clamp(light.intensity, 0, 1);
        grad.addColorStop(0, `rgba(0,0,0,${centerAlpha.toFixed(3)})`);
        grad.addColorStop(0.6, `rgba(0,0,0,${(centerAlpha * 0.5).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        // Soft inner cone (penumbra vs umbra)
        const innerFraction = innerA / outerA;
        lc.globalCompositeOperation = 'destination-out';
        lc.fillStyle = grad;
        lc.beginPath();
        lc.arc(sx, sy, screenRadius, 0, MathUtils.PI2);
        lc.fill();

        lc.restore();

        // Tint
        lc.globalCompositeOperation = 'source-over';
        lc.globalAlpha = light.intensity * 0.2;
        const tintGrad = lc.createRadialGradient(sx, sy, 0, sx, sy, screenRadius * innerFraction);
        tintGrad.addColorStop(0, rgbToString(light.color, 0.8));
        tintGrad.addColorStop(1, rgbToString(light.color, 0));
        lc.fillStyle = tintGrad;
        lc.beginPath();
        lc.moveTo(sx, sy);
        lc.arc(sx, sy, screenRadius * innerFraction, dir - innerA, dir + innerA, false);
        lc.closePath();
        lc.fill();
        lc.globalAlpha = 1;
        lc.globalCompositeOperation = 'destination-out';
    }
}
