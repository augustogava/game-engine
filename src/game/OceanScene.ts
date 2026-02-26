/**
 * OceanScene - Side-view ocean/water simulation using SPH fluid physics.
 */
import { Scene, SceneContext } from '../engine/scene/Scene.js';
import { Renderer } from '../engine/renderer/Renderer.js';
import { MathUtils } from '../engine/math/MathUtils.js';
import { SPHFluid, SPHConfig, defaultSPHConfig } from '../engine/fluid/SPHFluid.js';

export interface OceanConfig extends SPHConfig {
    particleCount: number;
    showDebug: boolean;
}

const DEF: OceanConfig = {
    ...defaultSPHConfig,
    particleCount: 400,
    smoothingRadius: 30,
    restDensity: 1000,
    stiffness: 3,
    viscosity: 0.003,
    gravity: 980,
    surfaceTension: 0.0001,
    particleMass: 65,
    visualRadius: 14,
    collisionRadius: 12,
    damping: 0.999,
    showDebug: false,
};

export class OceanScene extends Scene {
    private cfg: OceanConfig;
    private fluid!: SPHFluid;

    private mx = 0;
    private my = 0;
    private mouseDown = false;
    private rightMouseDown = false;

    private containerPadding = 50;
    private time = 0;

    fpsRef: { fps: number } = { fps: 0 };

    constructor(config?: Partial<OceanConfig>) {
        super();
        this.cfg = { ...DEF, ...config };
    }

    override onEnter(ctx: SceneContext): void {
        super.onEnter(ctx);
        
        this.fluid = new SPHFluid(this.cfg);
        this.updateBoundary();
        this.spawnWater();
        this.buildUI();
        this.bindInput();
    }

    override onExit(): void {
        this.fluid.clear();
        document.getElementById('ocean-ui')?.remove();
        this.ctx.input.removeAllListeners();
    }

    private updateBoundary(): void {
        const pad = this.containerPadding;
        const w = this.ctx.renderer.width;
        const h = this.ctx.renderer.height;
        this.fluid.setBoundary(pad, pad, w - pad, h - pad);
    }

    private spawnWater(): void {
        this.fluid.clear();
        
        const w = this.ctx.renderer.width;
        const pad = this.containerPadding;
        
        const spacing = this.cfg.collisionRadius * 2.2;
        const cols = Math.floor((w - pad * 2) / spacing * 0.5);
        const rows = Math.ceil(this.cfg.particleCount / cols);
        
        const startX = pad + spacing * 2;
        const startY = pad + spacing * 2;
        
        this.fluid.spawnBlock(startX, startY, cols, rows, spacing);
    }

    private bindInput(): void {
        const canvas = this.ctx.renderer.canvas;
        
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouseDown = true;
            if (e.button === 2) this.rightMouseDown = true;
            this.mx = e.clientX;
            this.my = e.clientY;
        });
        
        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouseDown = false;
            if (e.button === 2) this.rightMouseDown = false;
        });
        
        window.addEventListener('mousemove', (e) => {
            this.mx = e.clientX;
            this.my = e.clientY;
        });
        
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    override update(dt: number): void {
        this.time += dt;
        
        if (this.mouseDown) {
            this.fluid.applyForceAt(this.mx, this.my, 80, 15);
        }
        if (this.rightMouseDown) {
            this.fluid.applyAttractAt(this.mx, this.my, 100, 10);
        }
        
        this.fluid.update(dt);
    }

    override render(renderer: Renderer): void {
        const ctx = renderer.ctx;
        const W = renderer.width;
        const H = renderer.height;
        
        this.drawBackground(ctx, W, H);
        this.drawContainer(ctx, W, H);
        this.drawWater(ctx);
        this.drawHUD(ctx, W, H);
    }

    private drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0a1628');
        grad.addColorStop(0.5, '#0d1f3c');
        grad.addColorStop(1, '#102a4c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    private drawContainer(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        const pad = this.containerPadding;
        
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pad, pad);
        ctx.lineTo(pad, H - pad);
        ctx.lineTo(W - pad, H - pad);
        ctx.lineTo(W - pad, pad);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(30, 80, 120, 0.2)';
        ctx.fillRect(pad, pad, W - pad * 2, H - pad * 2);
    }

    private drawWater(ctx: CanvasRenderingContext2D): void {
        const particles = this.fluid.particles;
        
        ctx.globalCompositeOperation = 'lighter';
        
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            if (!p.active) continue;
            
            const x = p.position.x;
            const y = p.position.y;
            const vr = p.visualRadius;
            
            const speed = Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y);
            const speedFactor = Math.min(speed / 200, 1);
            
            const baseR = 30 + speedFactor * 50;
            const baseG = 120 + speedFactor * 80;
            const baseB = 220 + speedFactor * 35;
            
            const depthFactor = 1 - (y / this.ctx.renderer.height) * 0.3;
            const r = Math.floor(baseR * depthFactor);
            const g = Math.floor(baseG * depthFactor);
            const b = Math.floor(baseB);
            
            const grd = ctx.createRadialGradient(x, y, 0, x, y, vr);
            grd.addColorStop(0, `rgba(${r + 80}, ${g + 80}, ${b + 35}, 0.8)`);
            grd.addColorStop(0.4, `rgba(${r + 30}, ${g + 30}, ${b}, 0.5)`);
            grd.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(x, y, vr, 0, MathUtils.PI2);
            ctx.fill();
        }
        
        if (this.cfg.showDebug) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
            ctx.lineWidth = 1;
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                if (!p.active) continue;
                ctx.beginPath();
                ctx.arc(p.position.x, p.position.y, p.collisionRadius, 0, MathUtils.PI2);
                ctx.stroke();
            }
        }
        
        ctx.globalCompositeOperation = 'source-over';
    }

    private drawHUD(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#88ccff';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(
            `AntiGravity Engine | Ocean Sim | ${this.fluid.particleCount} particles | ${this.fpsRef.fps} FPS`,
            14, H - 16
        );
        ctx.globalAlpha = 1;
        
        ctx.globalAlpha = 0.3;
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillText(
            'Left click: Push water | Right click: Attract water',
            14, 20
        );
        ctx.globalAlpha = 1;
    }

    private buildUI(): void {
        const cfg = this.cfg;
        const el = document.createElement('div');
        el.id = 'ocean-ui';
        el.innerHTML = `
<div class="ui-title">Ocean Controls</div>

<div class="ui-section"><label>Particles <span id="vl-p">${cfg.particleCount}</span></label>
  <input type="range" id="sl-p" min="100" max="2000" step="50" value="${cfg.particleCount}"></div>

<div class="ui-section"><label>Smoothing H <span id="vl-h">${cfg.smoothingRadius}</span></label>
  <input type="range" id="sl-h" min="15" max="50" step="1" value="${cfg.smoothingRadius}"></div>

<div class="ui-section"><label>Stiffness <span id="vl-k">${cfg.stiffness.toFixed(1)}</span></label>
  <input type="range" id="sl-k" min="0.5" max="10" step="0.5" value="${cfg.stiffness}"></div>

<div class="ui-section"><label>Viscosity <span id="vl-v">${cfg.viscosity.toFixed(4)}</span></label>
  <input type="range" id="sl-v" min="0" max="0.01" step="0.0005" value="${cfg.viscosity}"></div>

<div class="ui-section"><label>Gravity <span id="vl-g">${cfg.gravity}</span></label>
  <input type="range" id="sl-g" min="100" max="2000" step="50" value="${cfg.gravity}"></div>

<div class="ui-section"><label>Surface Tension <span id="vl-st">${cfg.surfaceTension.toFixed(4)}</span></label>
  <input type="range" id="sl-st" min="0" max="0.001" step="0.0001" value="${cfg.surfaceTension}"></div>

<div class="ui-section"><label>Visual Radius <span id="vl-vr">${cfg.visualRadius}</span></label>
  <input type="range" id="sl-vr" min="6" max="30" step="1" value="${cfg.visualRadius}"></div>

<div class="ui-section"><label>Collision Radius <span id="vl-cr">${cfg.collisionRadius}</span></label>
  <input type="range" id="sl-cr" min="3" max="20" step="1" value="${cfg.collisionRadius}"></div>

<div class="ui-section"><label>Damping <span id="vl-d">${cfg.damping.toFixed(3)}</span></label>
  <input type="range" id="sl-d" min="0.9" max="1" step="0.001" value="${cfg.damping}"></div>

<div class="ui-buttons">
  <button id="btn-reset">Reset</button>
  <button id="btn-add">Add Water</button>
  <button id="btn-debug">Toggle Debug</button>
</div>

<div class="ui-presets">
  <div class="ui-subtitle">Presets</div>
  <button id="btn-water">Water</button>
  <button id="btn-oil">Oil</button>
  <button id="btn-honey">Honey</button>
</div>`;

        const wire = (id: string, vid: string, fn: (v: number) => string, apply: (v: number) => void) => {
            const sl = el.querySelector(`#${id}`) as HTMLInputElement;
            const vl = el.querySelector(`#${vid}`) as HTMLElement;
            sl?.addEventListener('input', () => {
                const v = parseFloat(sl.value);
                if (vl) vl.textContent = fn(v);
                apply(v);
            });
        };

        wire('sl-p', 'vl-p', v => { cfg.particleCount = v; return `${v}`; }, v => { cfg.particleCount = v; });
        wire('sl-h', 'vl-h', v => `${v}`, v => { cfg.smoothingRadius = v; this.fluid.updateConfig({ smoothingRadius: v }); });
        wire('sl-k', 'vl-k', v => v.toFixed(1), v => { cfg.stiffness = v; this.fluid.updateConfig({ stiffness: v }); });
        wire('sl-v', 'vl-v', v => v.toFixed(4), v => { cfg.viscosity = v; this.fluid.updateConfig({ viscosity: v }); });
        wire('sl-g', 'vl-g', v => `${v}`, v => { cfg.gravity = v; this.fluid.updateConfig({ gravity: v }); });
        wire('sl-st', 'vl-st', v => v.toFixed(4), v => { cfg.surfaceTension = v; this.fluid.updateConfig({ surfaceTension: v }); });
        wire('sl-vr', 'vl-vr', v => `${v}`, v => { cfg.visualRadius = v; this.fluid.updateConfig({ visualRadius: v }); });
        wire('sl-cr', 'vl-cr', v => `${v}`, v => { cfg.collisionRadius = v; this.fluid.updateConfig({ collisionRadius: v }); });
        wire('sl-d', 'vl-d', v => v.toFixed(3), v => { cfg.damping = v; this.fluid.updateConfig({ damping: v }); });

        el.querySelector('#btn-reset')?.addEventListener('click', () => this.spawnWater());
        el.querySelector('#btn-add')?.addEventListener('click', () => {
            const pad = this.containerPadding;
            const w = this.ctx.renderer.width;
            const spacing = cfg.collisionRadius * 2;
            this.fluid.spawnBlock(
                MathUtils.randomRange(pad + spacing, w - pad - spacing * 5),
                pad + spacing,
                5, 5, spacing
            );
        });
        el.querySelector('#btn-debug')?.addEventListener('click', () => {
            cfg.showDebug = !cfg.showDebug;
        });

        const applyPreset = (preset: Partial<OceanConfig>) => {
            Object.assign(cfg, preset);
            this.fluid.updateConfig(preset);
            
            const setValue = (id: string, vid: string, v: number, fmt: (v: number) => string) => {
                const sl = el.querySelector(`#${id}`) as HTMLInputElement;
                const vl = el.querySelector(`#${vid}`) as HTMLElement;
                if (sl) sl.value = `${v}`;
                if (vl) vl.textContent = fmt(v);
            };
            
            if (preset.viscosity !== undefined) setValue('sl-v', 'vl-v', preset.viscosity, v => v.toFixed(4));
            if (preset.stiffness !== undefined) setValue('sl-k', 'vl-k', preset.stiffness, v => v.toFixed(1));
            if (preset.surfaceTension !== undefined) setValue('sl-st', 'vl-st', preset.surfaceTension, v => v.toFixed(4));
            if (preset.gravity !== undefined) setValue('sl-g', 'vl-g', preset.gravity, v => `${v}`);
        };

        el.querySelector('#btn-water')?.addEventListener('click', () => {
            applyPreset({ viscosity: 0.003, stiffness: 3, surfaceTension: 0.0001, gravity: 980 });
        });
        el.querySelector('#btn-oil')?.addEventListener('click', () => {
            applyPreset({ viscosity: 0.006, stiffness: 2, surfaceTension: 0.0003, gravity: 800 });
        });
        el.querySelector('#btn-honey')?.addEventListener('click', () => {
            applyPreset({ viscosity: 0.01, stiffness: 1, surfaceTension: 0.0005, gravity: 500 });
        });

        document.body.appendChild(el);
    }
}
