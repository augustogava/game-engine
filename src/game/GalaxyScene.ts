/**
 * GalaxyScene v5
 *
 * Key design changes from v4:
 * - Physics ALWAYS starts at correct orbital positions (original behaviour)
 * - Formation animation is visual-only: display position lerps from a random
 *   3D-sphere ("chaos") to the physics position over formationDuration seconds.
 *   No chaotic physics, no velocity nudging.
 * - Stars are crisp 1-pixel dots, no square kernel, glow only for large stars.
 * - AdditiveBlend removed from multi-overlap near center → no over-bright blob.
 * - 3D orbit: right-click drag to pitch/yaw, left drag to pan, scroll to zoom.
 */

import { Scene, SceneContext } from '../engine/scene/Scene.js';
import { Renderer } from '../engine/renderer/Renderer.js';
import { Vector2 } from '../engine/math/Vector2.js';
import { MathUtils } from '../engine/math/MathUtils.js';
import { ObjectPool } from '../engine/commons/ObjectPool.js';
import { QuadTree } from '../engine/spatial/QuadTree.js';
import { GalaxyParticle } from './GalaxyParticle.js';

// ---- Config ----------------------------------------------------------------

export interface MilkyWayConfig {
    starCount: number;
    dustCount: number;
    galaxyRadius: number;
    coreRadius: number;
    blackHoleMass: number;
    G: number;
    simSpeed: number;
    formationDuration: number;
}

const DEF: MilkyWayConfig = {
    starCount: 12000,
    dustCount: 2000,
    galaxyRadius: 2400,
    coreRadius: 200,
    blackHoleMass: 2_200_000,
    G: 6.674e-3,
    simSpeed: 1.0,
    formationDuration: 18,
};

// ---- Arms / colours --------------------------------------------------------

interface Arm { base: number; pitch: number; }
const ARMS: Arm[] = [
    { base: 0, pitch: 0.22 },
    { base: Math.PI / 2, pitch: 0.20 },
    { base: Math.PI, pitch: 0.21 },
    { base: 3 * Math.PI / 2, pitch: 0.19 },
];

const TEMPS: [number, number, number][] = [
    [155, 176, 255], [170, 191, 255], [202, 215, 255], [248, 247, 255],
    [255, 244, 232], [255, 222, 162], [255, 185, 95], [255, 140, 60],
];

const NEBULA_COL: [number, number, number][] = [
    [80, 30, 140], [20, 60, 180], [180, 30, 60], [30, 100, 150], [140, 50, 180],
];

// ---- Scene -----------------------------------------------------------------

export class GalaxyScene extends Scene {
    private cfg: MilkyWayConfig;
    private particles: GalaxyParticle[] = [];
    private pool: ObjectPool<GalaxyParticle>;
    private qt!: QuadTree<GalaxyParticle>;

    // 3D view
    private pitch = Math.PI / 9;   // ~20° initial tilt so disc depth is visible
    private yaw = 0.0;
    private panX = 0.0;
    private panY = 0.0;
    private zoom = 0.12;          // start showing the full formed galaxy

    // Input
    private panning = false;
    private orbiting = false;
    private mx = 0; private my = 0;

    // Formation – visual only (chaos positions separate from physics positions)
    private formT = 0.0;
    private formed = false;
    private chaosX!: Float32Array;
    private chaosY!: Float32Array;
    private chaosZ!: Float32Array;

    private time = 0.0;
    private bgStars: { x: number; y: number; r: number; a: number }[] = [];

    fpsRef: { fps: number } = { fps: 0 };

    constructor(config?: Partial<MilkyWayConfig>) {
        super();
        this.cfg = Object.assign({}, DEF, config);
        this.pool = new ObjectPool<GalaxyParticle>(() => new GalaxyParticle(), p => p.reset(), 16000);
    }

    override onEnter(ctx: SceneContext): void {
        super.onEnter(ctx);
        this.initQt();
        this.spawn();
        this.buildUI();
        this.bindInput();
    }
    override onExit(): void {
        this.freeAll();
        document.getElementById('galaxy-ui')?.remove();
        this.ctx.input.removeAllListeners();
    }

    // ---- 3D projection (inline-friendly helper) ------------------------------

    private proj(wx: number, wy: number, wz: number, W: number, H: number): { sx: number; sy: number } {
        const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
        const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
        const rx = wx * cy + wy * sy;
        const ry = -wx * sy + wy * cy;
        const projY = ry * cp - wz * sp;
        return {
            sx: (rx - this.panX) * this.zoom + W * 0.5,
            sy: (projY - this.panY) * this.zoom + H * 0.5,
        };
    }

    // ---- Init ----------------------------------------------------------------

    private initQt(): void {
        const R = this.cfg.galaxyRadius * 2;
        this.qt = new QuadTree<GalaxyParticle>({ x: 0, y: 0, hw: R, hh: R }, 8, 14);
    }
    private freeAll(): void {
        for (const p of this.particles) this.pool.release(p);
        this.particles.length = 0;
    }

    // ---- Spawn ---------------------------------------------------------------
    // Physics positions = correct orbital positions from the start.
    // Chaos positions   = random 3D sphere = visual-only for formation animation.

    private spawn(): void {
        this.freeAll();
        this.formT = 0;
        this.formed = false;
        const cfg = this.cfg;
        const total = cfg.starCount + cfg.dustCount;
        this.chaosX = new Float32Array(total);
        this.chaosY = new Float32Array(total);
        this.chaosZ = new Float32Array(total);

        let idx = 0;

        // Core bulge – make it a proper 3D ellipsoid, not a flat disc
        const coreN = Math.floor(cfg.starCount * 0.18);
        for (let i = 0; i < coreN; i++, idx++) {
            const r = Math.abs(MathUtils.gaussianRandom(0, cfg.coreRadius * 0.5));
            const a = Math.random() * MathUtils.PI2;
            this.makeParticle(idx, r * Math.cos(a), r * Math.sin(a),
                MathUtils.gaussianRandom(0, cfg.coreRadius * 0.45), a, r, 'core', 0);
        }

        // Central bar
        const barN = Math.floor(cfg.starCount * 0.07);
        const bAng = 0.25;
        for (let i = 0; i < barN; i++, idx++) {
            const along = MathUtils.gaussianRandom(0, cfg.coreRadius * 1.5);
            const perp = MathUtils.gaussianRandom(0, cfg.coreRadius * 0.14);
            const tx = Math.cos(bAng) * along - Math.sin(bAng) * perp;
            const ty = Math.sin(bAng) * along + Math.cos(bAng) * perp;
            const r = Math.sqrt(tx * tx + ty * ty);
            const a = Math.atan2(ty, tx);
            this.makeParticle(idx, tx, ty, MathUtils.gaussianRandom(0, cfg.coreRadius * 0.30), a, r, 'core', 0);
        }

        // Spiral arms – disc thickness tapers with radius (thick near core, thin at edge)
        const armN = cfg.starCount - coreN - barN;
        const perArm = Math.floor(armN / ARMS.length);
        for (let ai = 0; ai < ARMS.length; ai++) {
            for (let i = 0; i < perArm; i++, idx++) {
                const { tx, ty, ang, r } = this.sampleArm(ARMS[ai]);
                // 0.10 gives a disc ~240 units thick at mid-radius — clearly visible from side
                const dzScale = cfg.galaxyRadius * 0.10 * (0.8 - 0.65 * (r / cfg.galaxyRadius));
                const dz = MathUtils.gaussianRandom(0, Math.max(dzScale, cfg.coreRadius * 0.05));
                this.makeParticle(idx, tx, ty, dz, ang, r, 'star', ai);
            }
        }

        // Dust / nebula – same disc thickness as stars
        for (let i = 0; i < cfg.dustCount; i++, idx++) {
            const arm = ARMS[i % ARMS.length];
            const { tx, ty, ang, r } = this.sampleArm(arm, 1.6);
            const type = (i % 5 === 0) ? 'nebula' : 'dust';
            const dzScale = cfg.galaxyRadius * 0.09 * (0.8 - 0.60 * (r / cfg.galaxyRadius));
            this.makeParticle(idx, tx, ty, MathUtils.gaussianRandom(0, Math.max(dzScale, cfg.coreRadius * 0.04)),
                ang, r, type as GalaxyParticle['type'], i % ARMS.length);
        }
    }

    private makeParticle(
        idx: number,
        tx: number, ty: number, tz: number,
        ang: number, r: number,
        type: GalaxyParticle['type'], ai: number
    ): void {
        const p = this.pool.acquire();
        const cfg = this.cfg;

        // Physics → start at correct orbital position & velocity
        p.position.x = tx;
        p.position.y = ty;
        p.z = tz;
        const orbV = Math.sqrt(cfg.G * cfg.blackHoleMass / Math.max(r, 5));
        p.velocity.x = -Math.sin(ang) * orbV;
        p.velocity.y = Math.cos(ang) * orbV;
        p.vz = 0;

        // Chaos position → random point in a 3D sphere, truly all-directions
        // Radius randomly between 400 and 6000 world units.
        const chaosR = MathUtils.randomRange(200, 6000);
        const chaosAz = Math.random() * MathUtils.PI2;             // azimuth
        const chaosEl = (Math.random() - 0.5) * Math.PI;           // elevation -90..+90
        this.chaosX[idx] = Math.cos(chaosEl) * Math.cos(chaosAz) * chaosR;
        this.chaosY[idx] = Math.cos(chaosEl) * Math.sin(chaosAz) * chaosR;
        this.chaosZ[idx] = Math.sin(chaosEl) * chaosR;

        p.type = type;
        p.armIndex = ai;
        p.orbitRadius = r;
        p.active = true;
        p.age = Math.random() * 50;
        p.colorPhase = Math.random() * MathUtils.PI2;
        p.mass = 1; p.inverseMass = 1;

        this.colorP(p, r, type, ai);
        this.sizeP(p, type);
        this.particles.push(p);
    }

    private sampleArm(arm: Arm, spreadMult = 1): { tx: number; ty: number; ang: number; r: number } {
        const cfg = this.cfg;
        // Bias toward inner–mid radii so arms taper outward naturally
        const t = Math.pow(Math.random(), 0.55);
        const r = MathUtils.lerp(cfg.coreRadius * 0.5, cfg.galaxyRadius, t);
        const theta = arm.base + (1 / arm.pitch) * Math.log(r / (cfg.coreRadius * 0.35) + 1);
        // Increased base spread (0.32) so stars scatter much more broadly around
        // the arm centreline — no more tight visible ring gaps.
        const spread = MathUtils.gaussianRandom(0, 0.32 * spreadMult * (0.25 + t * 0.75));
        const ang = theta + spread;
        // Scatter radial position too so rings don't pile up at exact r values
        const rScatter = r + MathUtils.gaussianRandom(0, r * 0.06);
        return { tx: Math.cos(ang) * rScatter, ty: Math.sin(ang) * rScatter, ang, r: rScatter };
    }

    private colorP(p: GalaxyParticle, r: number, type: GalaxyParticle['type'], ai: number): void {
        const nr = MathUtils.clamp(r / this.cfg.galaxyRadius, 0, 1);
        if (type === 'nebula') {
            const c = NEBULA_COL[Math.floor(Math.random() * NEBULA_COL.length)];
            p.r = c[0]; p.g = c[1]; p.b = c[2]; return;
        }
        if (type === 'dust') {
            p.r = MathUtils.randomRange(150, 195); p.g = MathUtils.randomRange(80, 125); p.b = MathUtils.randomRange(35, 75); return;
        }
        if (type === 'core') {
            const c = TEMPS[Math.floor(Math.random() * 3)];
            p.r = c[0]; p.g = c[1]; p.b = c[2]; return;
        }
        const ci = MathUtils.clamp(nr * 1.2 + MathUtils.gaussianRandom(0, 0.16), 0, 1) * (TEMPS.length - 1);
        const lo = Math.floor(ci), hi = Math.min(lo + 1, TEMPS.length - 1);
        const frac = ci - lo;
        const ca = TEMPS[lo], cb = TEMPS[hi];
        p.r = MathUtils.lerp(ca[0], cb[0], frac);
        p.g = MathUtils.lerp(ca[1], cb[1], frac);
        p.b = MathUtils.lerp(ca[2], cb[2], frac);
    }

    private sizeP(p: GalaxyParticle, type: GalaxyParticle['type']): void {
        if (type === 'core') { p.size = MathUtils.randomRange(1.0, 2.5); p.alpha = MathUtils.randomRange(0.6, 0.9); }
        else if (type === 'star') { p.size = MathUtils.randomRange(0.7, 2.0); p.alpha = MathUtils.randomRange(0.45, 0.85); }
        else if (type === 'dust') { p.size = MathUtils.randomRange(0.8, 2.2); p.alpha = MathUtils.randomRange(0.03, 0.10); }
        else { p.size = MathUtils.randomRange(50, 200); p.alpha = MathUtils.randomRange(0.008, 0.03); }
    }

    // ---- Input ---------------------------------------------------------------

    private bindInput(): void {
        const canvas = this.ctx.renderer.canvas;
        canvas.addEventListener('mousedown', e => {
            // Left-drag = orbit 3D  |  Right-drag = pan
            if (e.button === 0) this.orbiting = true;
            if (e.button === 2) this.panning = true;
            this.mx = e.clientX; this.my = e.clientY;
        });
        window.addEventListener('mouseup', () => { this.panning = false; this.orbiting = false; });
        window.addEventListener('mousemove', e => {
            const dx = e.clientX - this.mx, dy = e.clientY - this.my;
            this.mx = e.clientX; this.my = e.clientY;
            if (this.orbiting) {
                this.yaw += dx * 0.006;
                this.pitch = MathUtils.clamp(this.pitch + dy * 0.004, -Math.PI * 0.499, Math.PI * 0.499);
            }
            if (this.panning) { this.panX -= dx / this.zoom; this.panY -= dy / this.zoom; }
        });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const f = e.deltaY > 0 ? 0.88 : 1 / 0.88;
            this.zoom = MathUtils.clamp(this.zoom * f, 0.004, 5);
        }, { passive: false });
    }

    // ---- Update --------------------------------------------------------------

    override update(dt: number): void {
        const cfg = this.cfg;
        const sdt = Math.min(dt, 0.033) * cfg.simSpeed;
        this.time += sdt;

        if (!this.formed) {
            this.formT += dt;
            if (this.formT >= cfg.formationDuration) this.formed = true;
        }

        this.qt.clear();
        for (const p of this.particles) {
            if (p.active) this.qt.insert({ x: p.position.x, y: p.position.y, mass: p.mass, data: p });
        }

        const G = cfg.G, M = cfg.blackHoleMass;
        const softSq = (cfg.coreRadius * 0.25) ** 2;
        const maxAcc = 4000;

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (!p.active) continue;

            // Black hole gravity
            const dx = -p.position.x, dy = -p.position.y;
            const ds = dx * dx + dy * dy + softSq;
            const d = Math.sqrt(ds);
            let acc = G * M / ds;
            if (acc > maxAcc) acc = maxAcc;
            p.velocity.x += (dx / d) * acc * sdt;
            p.velocity.y += (dy / d) * acc * sdt;

            // Very subtle disc-plane restoring — much weaker so the 3D thickness is
            // preserved. Coefficient 0.008 (was 0.12) means the disc oscillates slowly
            // rather than snapping flat every frame.
            p.vz += (-p.z * 0.008 - p.vz * 0.18) * sdt;
            p.z += p.vz * sdt;

            p.position.x += p.velocity.x * sdt;
            p.position.y += p.velocity.y * sdt;
            p.age += sdt;

            // Twinkle
            if (p.type === 'star' || p.type === 'core') {
                p.colorPhase += sdt * 0.35;
                const tw = 0.88 + 0.12 * Math.sin(p.colorPhase);
                p.alpha = MathUtils.clamp((p.type === 'core' ? 0.62 : 0.56) * tw, 0.06, 0.88);
            }
        }
    }

    // ---- Render --------------------------------------------------------------

    override render(renderer: Renderer): void {
        const ctx = renderer.ctx;
        const W = renderer.width;
        const H = renderer.height;
        const pr = window.devicePixelRatio || 1;

        renderer.clear('#000004');
        renderer.resetTransform();
        this.drawBgStars(ctx, W, H);

        // Formation ease value (0 = chaos spawn, 1 = final orbit)
        const formEase = this.formed ? 1.0
            : MathUtils.smootherstep(0, 1, Math.min(this.formT / this.cfg.formationDuration, 1.0));

        // Pre-compute 3D constants
        const cy_ = Math.cos(this.yaw), sy_ = Math.sin(this.yaw);
        const cp_ = Math.cos(this.pitch), sp_ = Math.sin(this.pitch);
        const z_ = this.zoom;
        const oX = W * 0.5;
        const oY = H * 0.5;

        // ---- ImageData pass: one crisp pixel per star --------------------------
        const PW = W * pr | 0;
        const PH = H * pr | 0;
        const img = ctx.createImageData(PW, PH);
        const buf = img.data;

        const LARGE: GalaxyParticle[] = [];

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (!p.active || p.type === 'nebula') continue;

            // Display position = lerp(chaos, physics)
            const wx = MathUtils.lerp(this.chaosX[i], p.position.x, formEase);
            const wy = MathUtils.lerp(this.chaosY[i], p.position.y, formEase);
            const wz = MathUtils.lerp(this.chaosZ[i], p.z, formEase);

            // 3D → screen
            const rx = wx * cy_ + wy * sy_;
            const ry = -wx * sy_ + wy * cy_;
            const projY = ry * cp_ - wz * sp_;
            const sx = (rx - this.panX) * z_ + oX;
            const sy3 = (projY - this.panY) * z_ + oY;

            // Screen size of this particle
            const sr = p.size * z_;

            // Broad cull
            if (sx < -sr * 2 || sx > W + sr * 2 || sy3 < -sr * 2 || sy3 > H + sr * 2) continue;

            const screenPhysPx = sr * pr; // size in physical pixels

            if (screenPhysPx > 4 && p.type !== 'dust') {
                // Large/bright — collect for gradient pass
                (p as any)._sx = sx;
                (p as any)._sy = sy3;
                (p as any)._sr = sr;
                LARGE.push(p);
            } else {
                // Single crisp pixel (or 2×2 max for medium stars)
                const px2 = sx * pr | 0;
                const py2 = sy3 * pr | 0;

                // Clamp alpha: never full-white in centre, cap to avoid blooms
                const drawA = Math.min(p.alpha, 0.72);
                const aInt = (drawA * 255) | 0;
                const rr = p.r | 0, gg = p.g | 0, bb = p.b | 0;

                // Blit 1 pixel (or 2×2 if medium)
                const half = screenPhysPx > 1.8 ? 1 : 0;
                for (let dy2 = -half; dy2 <= half; dy2++) {
                    for (let dx2 = -half; dx2 <= half; dx2++) {
                        const ppx = px2 + dx2, ppy = py2 + dy2;
                        if (ppx < 0 || ppx >= PW || ppy < 0 || ppy >= PH) continue;
                        const off = (ppy * PW + ppx) * 4;
                        // Plain alpha-max blend (no additive — prevents over-bright core)
                        if (aInt > buf[off + 3]) {
                            buf[off] = rr;
                            buf[off + 1] = gg;
                            buf[off + 2] = bb;
                            buf[off + 3] = aInt;
                        }
                    }
                }
            }
        }

        // Flush pixel buffer (identity = physical pixels)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.putImageData(img, 0, 0);

        // ---- Gradient pass: large stars only -----------------------------------
        ctx.setTransform(pr, 0, 0, pr, 0, 0);
        ctx.globalCompositeOperation = 'screen';
        for (const p of LARGE) {
            const sx = (p as any)._sx as number;
            const sy3 = (p as any)._sy as number;
            const glowR = Math.min((p as any)._sr as number * 2.4, 10); // cap at 10px
            ctx.globalAlpha = 1;
            const grd = ctx.createRadialGradient(sx, sy3, 0, sx, sy3, glowR);
            const alpha = (p.alpha * 0.85).toFixed(3);
            const alpha2 = (p.alpha * 0.15).toFixed(3);
            grd.addColorStop(0, `rgba(${p.r | 0},${p.g | 0},${p.b | 0},${alpha})`);
            grd.addColorStop(0.45, `rgba(${p.r | 0},${p.g | 0},${p.b | 0},${alpha2})`);
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd;
            ctx.beginPath(); ctx.arc(sx, sy3, glowR, 0, MathUtils.PI2); ctx.fill();
        }

        // ---- Nebula pass -------------------------------------------------------
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (p.type !== 'nebula') continue;
            const wx = MathUtils.lerp(this.chaosX[i], p.position.x, formEase);
            const wy = MathUtils.lerp(this.chaosY[i], p.position.y, formEase);
            const wz = MathUtils.lerp(this.chaosZ[i], p.z, formEase);
            const { sx, sy } = this.proj(wx, wy, wz, W, H);
            const nr = p.size * this.zoom;
            if (sx + nr < 0 || sx - nr > W || sy + nr < 0 || sy - nr > H) continue;
            ctx.globalAlpha = p.alpha;
            const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, nr);
            grd.addColorStop(0, `rgba(${p.r | 0},${p.g | 0},${p.b | 0},0.7)`);
            grd.addColorStop(0.55, `rgba(${p.r | 0},${p.g | 0},${p.b | 0},0.15)`);
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd;
            ctx.beginPath(); ctx.arc(sx, sy, nr, 0, MathUtils.PI2); ctx.fill();
        }

        // ---- Black hole --------------------------------------------------------
        ctx.globalAlpha = 1;
        this.drawBH(ctx, W, H);

        // ---- HUD ---------------------------------------------------------------
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this.drawHUD(ctx, W, H);
        this.drawFormBar(ctx, W, H);
    }

    // ---- Helpers -------------------------------------------------------------

    private drawBgStars(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        if (this.bgStars.length === 0) {
            for (let i = 0; i < 500; i++) {
                this.bgStars.push({
                    x: Math.random(), y: Math.random(),
                    r: MathUtils.randomRange(0.1, 0.45), a: MathUtils.randomRange(0.04, 0.22)
                });
            }
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff';
        for (const s of this.bgStars) {
            ctx.globalAlpha = s.a + 0.04 * Math.sin(this.time * 0.3 + s.x * 80);
            ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, MathUtils.PI2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    private drawBH(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
        const { sx, sy } = this.proj(0, 0, 0, W, H);
        const cr = this.cfg.coreRadius;
        const ringR = cr * 0.36 * this.zoom;
        if (ringR < 1) return;

        // Tight accretion ring (NOT a giant blob)
        ctx.globalCompositeOperation = 'screen';
        const ring = ctx.createRadialGradient(sx, sy, ringR * 0.12, sx, sy, ringR);
        ring.addColorStop(0, 'rgba(255,255,255,0)');
        ring.addColorStop(0.28, 'rgba(255,240,200,0.6)');
        ring.addColorStop(0.62, 'rgba(255,120,35,0.3)');
        ring.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ring;
        ctx.beginPath(); ctx.arc(sx, sy, ringR, 0, MathUtils.PI2); ctx.fill();

        // Hard event horizon (dark disc hiding everything behind it)
        ctx.globalCompositeOperation = 'source-over';
        const bhR = Math.max(ringR * 0.13, 2);
        const bh = ctx.createRadialGradient(sx, sy, 0, sx, sy, bhR * 2.2);
        bh.addColorStop(0, '#000000');
        bh.addColorStop(0.65, '#000000');
        bh.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bh;
        ctx.beginPath(); ctx.arc(sx, sy, bhR * 2.2, 0, MathUtils.PI2); ctx.fill();
    }

    private drawHUD(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        const d = (r: number) => Math.round(r * 180 / Math.PI);
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = '#b8bcff';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(
            `AntiGravity Engine  |  ${this.particles.length.toLocaleString()} particles  |  ${this.fpsRef.fps} FPS  |  ${this.zoom.toFixed(3)}x  |  pitch ${d(this.pitch)}  yaw ${d(this.yaw % MathUtils.PI2)}`,
            14, H - 16
        );
        ctx.globalAlpha = 1;
    }

    private drawFormBar(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        if (this.formed) return;
        const t = Math.min(this.formT / this.cfg.formationDuration, 1.0);
        const bw = 220, bh_ = 4, bx = (W - bw) / 2, by = H - 50;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh_, 2); ctx.fill();
        ctx.fillStyle = '#8b7ff5';
        ctx.beginPath(); ctx.roundRect(bx, by, bw * t, bh_, 2); ctx.fill();
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = 'rgba(180,180,255,0.7)';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Galaxy forming...', W / 2, H - 58);
        ctx.globalAlpha = 1;
    }

    // ---- UI ------------------------------------------------------------------

    private buildUI(): void {
        const cfg = this.cfg;
        const el = document.createElement('div');
        el.id = 'galaxy-ui';
        el.innerHTML = `
<div class="ui-title">Milky Way Controls</div>
<div class="ui-section"><label>Stars <span id="vl-s">${cfg.starCount.toLocaleString()}</span></label>
  <input type="range" id="sl-s" min="2000" max="20000" step="1000" value="${cfg.starCount}"></div>
<div class="ui-section"><label>Dust <span id="vl-d">${cfg.dustCount.toLocaleString()}</span></label>
  <input type="range" id="sl-d" min="0" max="6000" step="500" value="${cfg.dustCount}"></div>
<div class="ui-section"><label>Galaxy Radius <span id="vl-r">${cfg.galaxyRadius}</span></label>
  <input type="range" id="sl-r" min="500" max="6000" step="100" value="${cfg.galaxyRadius}"></div>
<div class="ui-section"><label>Black Hole Mass <span id="vl-m">${(cfg.blackHoleMass / 1e6).toFixed(1)}M</span></label>
  <input type="range" id="sl-m" min="200000" max="12000000" step="200000" value="${cfg.blackHoleMass}"></div>
<div class="ui-section"><label>Sim Speed <span id="vl-v">${cfg.simSpeed.toFixed(1)}x</span></label>
  <input type="range" id="sl-v" min="0" max="5" step="0.1" value="${cfg.simSpeed}"></div>
<div class="ui-section"><label>Formation Time <span id="vl-f">${cfg.formationDuration}s</span></label>
  <input type="range" id="sl-f" min="3" max="60" step="1" value="${cfg.formationDuration}"></div>
<button id="btn-respawn">Regenerate</button>
<div class="ui-hints">Left drag: orbit 3D  |  Right drag: pan  |  Scroll: zoom</div>`;
        const wire = (id: string, vid: string, fn: (v: number) => string) => {
            const sl = el.querySelector(`#${id}`) as HTMLInputElement;
            const vl = el.querySelector(`#${vid}`) as HTMLElement;
            sl?.addEventListener('input', () => { if (vl) vl.textContent = fn(parseFloat(sl.value)); });
        };
        wire('sl-s', 'vl-s', v => { cfg.starCount = v; return v.toLocaleString(); });
        wire('sl-d', 'vl-d', v => { cfg.dustCount = v; return v.toLocaleString(); });
        wire('sl-r', 'vl-r', v => { cfg.galaxyRadius = v; return `${v}`; });
        wire('sl-m', 'vl-m', v => { cfg.blackHoleMass = v; return `${(v / 1e6).toFixed(1)}M`; });
        wire('sl-v', 'vl-v', v => { cfg.simSpeed = v; return `${v.toFixed(1)}x`; });
        wire('sl-f', 'vl-f', v => { cfg.formationDuration = v; return `${v}s`; });
        el.querySelector('#btn-respawn')?.addEventListener('click', () => { this.initQt(); this.spawn(); });
        document.body.appendChild(el);
    }
}
