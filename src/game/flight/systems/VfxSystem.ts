import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    CLOUD_TEXTURE_URL,
    ENGINE_TYPE_TURBOFAN,
    ENGINE_TYPE_TURBOJET,
    VAPOR_CONE_MACH_MIN,
    VAPOR_CONE_MACH_MAX,
    VAPOR_CONE_MAX_RATE,
    HEAT_HAZE_MAX_RATE,
    FLARE_OCCLUSION_CHECK_INTERVAL_MS,
    FLARE_OCCLUSION_SUN_DISTANCE_M,
    COLOR_GRADE_DAY_TINT_R,
    COLOR_GRADE_DAY_TINT_G,
    COLOR_GRADE_DAY_TINT_B,
    COLOR_GRADE_SUNSET_TINT_R,
    COLOR_GRADE_SUNSET_TINT_G,
    COLOR_GRADE_SUNSET_TINT_B,
    COLOR_GRADE_NIGHT_TINT_R,
    COLOR_GRADE_NIGHT_TINT_G,
    COLOR_GRADE_NIGHT_TINT_B,
    COLOR_GRADE_CONTRAST_DAY,
    COLOR_GRADE_CONTRAST_NIGHT,
    MOTION_BLUR_MAX_STRENGTH,
    MOTION_BLUR_SAMPLES,
    MOTION_BLUR_TRIGGER_G,
    CAMERA_MODE_COCKPIT,
    ISA_TROPOPAUSE_M,
    ISA_TROPOPAUSE_TEMP_K,
    ISA_SEA_LEVEL_TEMP_K,
    ISA_LAPSE_RATE_K_PER_M,
    COLOR_LUT_URL,
    CONTRAIL_TEXTURE_URL,
    CONTRAIL_PARTICLE_CAPACITY,
    CONTRAIL_EMIT_RATE_MAX,
    CONTRAIL_MIN_LIFETIME_S,
    CONTRAIL_MAX_LIFETIME_S,
    CONTRAIL_MIN_SIZE_INITIAL_M,
    CONTRAIL_MAX_SIZE_INITIAL_M,
    CONTRAIL_FINAL_SIZE_MULTIPLIER,
    CONTRAIL_INITIAL_ALPHA,
    CONTRAIL_MIN_DRIFT_MS,
    CONTRAIL_MAX_DRIFT_MS,
    CONTRAIL_ENABLE_MIN_ALTITUDE_M,
    CONTRAIL_ENABLE_MIN_SPEED_MS,
    CONTRAIL_ENABLE_MAX_TEMP_C,
    CONTRAIL_ENABLE_MIN_ENGINE_POWER,
    CONTRAIL_EMIT_LERP_RATE,
    CONTRAIL_WAKE_SINK_RATE_MS,
    CONTRAIL_NOISE_STRENGTH_LATERAL,
    CONTRAIL_NOISE_STRENGTH_VERTICAL,
    CONTRAIL_NOISE_ANIMATION_SPEED,
    CONTRAIL_NOISE_TEXTURE_SIZE,
} from '../constants/index.js';
import { NoiseProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/noiseProceduralTexture.js';

const COLOR_GRADE_TINT_HUE_EPSILON_DEG = 1.0;
const COLOR_GRADE_TINT_DENSITY_EPSILON = 0.5;
const COLOR_GRADE_CONTRAST_EPSILON = 0.01;

export class VfxSystem {
    private readonly scene: any;
    private _lastTintH: number = Number.NaN;
    private _lastTintAmp: number = Number.NaN;
    private _lastContrast: number = Number.NaN;
    private _lastColorCurvesEnabled: boolean | null = null;
    private _lastColorGradingEnabled: boolean | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    /**
     * Build a pair of contrail emitters + particle systems attached to a given root TransformNode.
     * Reusable for own aircraft and remote multiplayer aircraft.
     */
    buildContrailPair(scene: BABYLON.Scene, parentRoot: BABYLON.TransformNode, halfSpan: number, idTag: string): {
        emL: BABYLON.TransformNode; emR: BABYLON.TransformNode;
        psL: BABYLON.ParticleSystem; psR: BABYLON.ParticleSystem;
    } | null {
        if (this.scene.isMobile === true) return null;
        const safeHalf = Math.max(2, halfSpan);
        const sharedTex = (() => {
            try {
                const t = new BABYLON.Texture(CONTRAIL_TEXTURE_URL, scene, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
                t.hasAlpha = true;
                return t;
            } catch (err) {
                console.warn('[Contrails] failed to load custom texture, falling back to cloud puff:', err);
                try { return new BABYLON.Texture(CLOUD_TEXTURE_URL, scene); } catch (_) { return null; }
            }
        })();
        const makeEmitter = (name: string, x: number): BABYLON.TransformNode => {
            const em = new BABYLON.TransformNode(name, scene);
            em.parent = parentRoot;
            em.position.set(x, 0, -safeHalf * 0.2);
            return em;
        };
        let sharedNoise: NoiseProceduralTexture | null = null;
        try {
            sharedNoise = new NoiseProceduralTexture(`contrailNoise_${idTag}`, CONTRAIL_NOISE_TEXTURE_SIZE, scene);
            sharedNoise.animationSpeedFactor = CONTRAIL_NOISE_ANIMATION_SPEED;
            sharedNoise.persistence = 1.4;
            sharedNoise.brightness = 0.5;
            sharedNoise.octaves = 3;
        } catch (err) {
            console.warn('[Contrails] noise texture init failed; turbulence disabled:', err);
            sharedNoise = null;
        }

        const buildPs = (name: string, emitter: BABYLON.TransformNode): BABYLON.ParticleSystem => {
            const ps = new BABYLON.ParticleSystem(name, CONTRAIL_PARTICLE_CAPACITY, scene);
            if (sharedTex) ps.particleTexture = sharedTex;
            ps.emitter = emitter as unknown as BABYLON.AbstractMesh;
            ps.minEmitBox = new BABYLON.Vector3(-0.05, -0.02, 0);
            ps.maxEmitBox = new BABYLON.Vector3( 0.05,  0.02, 0);
            ps.color1    = new BABYLON.Color4(1.00, 1.00, 1.00, CONTRAIL_INITIAL_ALPHA);
            ps.color2    = new BABYLON.Color4(0.98, 0.99, 1.00, CONTRAIL_INITIAL_ALPHA * 0.9);
            ps.colorDead = new BABYLON.Color4(0.95, 0.97, 1.00, 0);
            ps.minSize = CONTRAIL_MIN_SIZE_INITIAL_M;
            ps.maxSize = CONTRAIL_MAX_SIZE_INITIAL_M;
            ps.minLifeTime = CONTRAIL_MIN_LIFETIME_S;
            ps.maxLifeTime = CONTRAIL_MAX_LIFETIME_S;
            ps.emitRate = 0;
            ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            ps.gravity = new BABYLON.Vector3(0, -CONTRAIL_WAKE_SINK_RATE_MS, 0);
            ps.direction1 = new BABYLON.Vector3(0, 0, 0);
            ps.direction2 = new BABYLON.Vector3(0, 0, 0);
            ps.minEmitPower = CONTRAIL_MIN_DRIFT_MS;
            ps.maxEmitPower = CONTRAIL_MAX_DRIFT_MS;
            ps.minAngularSpeed = -0.03;
            ps.maxAngularSpeed =  0.03;
            ps.updateSpeed = 0.016;
            ps.preWarmCycles = 0;

            if (sharedNoise) {
                ps.noiseTexture = sharedNoise;
                ps.noiseStrength = new BABYLON.Vector3(
                    CONTRAIL_NOISE_STRENGTH_LATERAL,
                    CONTRAIL_NOISE_STRENGTH_VERTICAL,
                    CONTRAIL_NOISE_STRENGTH_LATERAL,
                );
            }

            ps.addSizeGradient(0.00, 0.4);
            ps.addSizeGradient(0.05, 0.7);
            ps.addSizeGradient(0.20, 1.2);
            ps.addSizeGradient(0.55, 2.4);
            ps.addSizeGradient(1.00, CONTRAIL_FINAL_SIZE_MULTIPLIER);

            ps.addColorGradient(0.00, new BABYLON.Color4(1.00, 1.00, 1.00, 0.00));
            ps.addColorGradient(0.04, new BABYLON.Color4(1.00, 1.00, 1.00, CONTRAIL_INITIAL_ALPHA));
            ps.addColorGradient(0.45, new BABYLON.Color4(0.99, 0.99, 1.00, CONTRAIL_INITIAL_ALPHA * 0.80));
            ps.addColorGradient(0.80, new BABYLON.Color4(0.97, 0.98, 1.00, CONTRAIL_INITIAL_ALPHA * 0.30));
            ps.addColorGradient(1.00, new BABYLON.Color4(0.95, 0.97, 1.00, 0));

            ps.start();
            return ps;
        };
        const emL = makeEmitter(`contrailEmL_${idTag}`, -safeHalf * 0.92);
        const emR = makeEmitter(`contrailEmR_${idTag}`,  safeHalf * 0.92);
        const psL = buildPs(`contrailPSL_${idTag}`, emL);
        const psR = buildPs(`contrailPSR_${idTag}`, emR);
        return { emL, emR, psL, psR };
    }

    /**
     * Compute the target contrail emit rate for given environmental conditions.
     * Returns 0 if conditions are not met (low altitude, warm air, slow speed, low power).
     */
    computeContrailEmitRate(altM: number, tempC: number, speedMs: number, enginePower: number): number {
        const altOk = altM > CONTRAIL_ENABLE_MIN_ALTITUDE_M;
        const tempOk = tempC < CONTRAIL_ENABLE_MAX_TEMP_C;
        const speedOk = speedMs > CONTRAIL_ENABLE_MIN_SPEED_MS;
        const powerOk = enginePower > CONTRAIL_ENABLE_MIN_ENGINE_POWER;
        if (!(altOk && tempOk && speedOk && powerOk)) return 0;
        const powerFactor = Math.max(0, Math.min(1, (enginePower - CONTRAIL_ENABLE_MIN_ENGINE_POWER) / Math.max(0.0001, 1 - CONTRAIL_ENABLE_MIN_ENGINE_POWER)));
        return CONTRAIL_EMIT_RATE_MAX * (0.55 + 0.45 * powerFactor);
    }

    /** Standard ISA temperature in °C for a given MSL altitude in meters. */
    isaTempC(altM: number): number {
        const tempK = altM > ISA_TROPOPAUSE_M
            ? ISA_TROPOPAUSE_TEMP_K
            : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * Math.max(0, altM);
        return tempK - 273.15;
    }

    buildContrails(scene: BABYLON.Scene, halfSpan: number): void {
        this.disposeContrails();
        this.scene._contrailHalfSpan = Math.max(2, halfSpan);
        const pair = this.buildContrailPair(scene, this.scene.planeRoot, this.scene._contrailHalfSpan, 'self');
        if (!pair) return;
        this.scene._contrailEmitterLeft  = pair.emL;
        this.scene._contrailEmitterRight = pair.emR;
        this.scene._contrailPSLeft  = pair.psL;
        this.scene._contrailPSRight = pair.psR;
        console.debug(`[Contrails] Built (capacity=${CONTRAIL_PARTICLE_CAPACITY}/side, lifetime=${CONTRAIL_MIN_LIFETIME_S}-${CONTRAIL_MAX_LIFETIME_S}s, halfSpan=${this.scene._contrailHalfSpan.toFixed(1)}m)`);
    }

    disposeContrails(): void {
        if (this.scene._contrailPSLeft)  { try { this.scene._contrailPSLeft.dispose();  } catch (_) { /* ignore */ } }
        if (this.scene._contrailPSRight) { try { this.scene._contrailPSRight.dispose(); } catch (_) { /* ignore */ } }
        if (this.scene._contrailEmitterLeft)  { try { this.scene._contrailEmitterLeft.dispose();  } catch (_) { /* ignore */ } }
        if (this.scene._contrailEmitterRight) { try { this.scene._contrailEmitterRight.dispose(); } catch (_) { /* ignore */ } }
        this.scene._contrailPSLeft = null;
        this.scene._contrailPSRight = null;
        this.scene._contrailEmitterLeft = null;
        this.scene._contrailEmitterRight = null;
    }

    buildVaporCone(scene: BABYLON.Scene): void {
        this.disposeVaporCone();
        if (this.scene.isMobile === true) {
            console.info('[VaporCone] Skipped on mobile (particle system disabled for performance)');
            return;
        }
        try {
            const em = new BABYLON.TransformNode('vaporConeEm', scene);
            em.parent = this.scene.planeRoot;
            em.position.set(0, 0, -1.5);
            this.scene._vaporConeEmitter = em;
            const ps = new BABYLON.ParticleSystem('vaporCone', 600, scene);
            try { ps.particleTexture = new BABYLON.Texture(CLOUD_TEXTURE_URL, scene); } catch (_) { /* ignore */ }
            ps.emitter = em as unknown as BABYLON.AbstractMesh;
            const r = Math.max(2, this.scene._contrailHalfSpan * 0.35);
            ps.createCylinderEmitter(r, 0.6, 1, 0);
            ps.color1 = new BABYLON.Color4(1, 1, 1, 0.85);
            ps.color2 = new BABYLON.Color4(0.95, 0.97, 1, 0.55);
            ps.colorDead = new BABYLON.Color4(0.9, 0.92, 1, 0);
            ps.minSize = 0.8;
            ps.maxSize = 2.5;
            ps.minLifeTime = 0.10;
            ps.maxLifeTime = 0.35;
            ps.emitRate = 0;
            ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            ps.gravity = new BABYLON.Vector3(0, 0, 0);
            ps.minEmitPower = 0;
            ps.maxEmitPower = 0;
            ps.updateSpeed = 0.01;
            ps.start();
            this.scene._vaporConePS = ps;
        } catch (err) {
            console.warn('[VaporCone] build failed:', err);
        }
    }

    disposeVaporCone(): void {
        if (this.scene._vaporConePS)     { try { this.scene._vaporConePS.dispose();     } catch (_) { /* ignore */ } this.scene._vaporConePS = null; }
        if (this.scene._vaporConeEmitter){ try { this.scene._vaporConeEmitter.dispose();} catch (_) { /* ignore */ } this.scene._vaporConeEmitter = null; }
    }

    updateVaporCone(): void {
        if (!this.scene._vaporConePS) return;
        const mach = Number.isFinite(this.scene._lastMach) ? this.scene._lastMach : 0;
        const target = (mach > VAPOR_CONE_MACH_MIN && mach < VAPOR_CONE_MACH_MAX)
            ? VAPOR_CONE_MAX_RATE * (1 - Math.abs(mach - 1.0) / Math.max(0.01, VAPOR_CONE_MACH_MAX - 1.0))
            : 0;
        const cur = this.scene._vaporConePS.emitRate || 0;
        this.scene._vaporConePS.emitRate = cur + (target - cur) * 0.2;
    }

    buildHeatHaze(scene: BABYLON.Scene): void {
        this.disposeHeatHaze();
        const cfg = this.scene.aircraftConfig;
        const isJet = cfg.engine_type === ENGINE_TYPE_TURBOFAN || cfg.engine_type === ENGINE_TYPE_TURBOJET;
        if (!isJet) return;
        if (this.scene.isMobile === true) {
            console.info('[HeatHaze] Skipped on mobile (particle system disabled for performance)');
            return;
        }
        try {
            const em = new BABYLON.TransformNode('heatHazeEm', scene);
            em.parent = this.scene.planeRoot;
            em.position.set(0, 0, -this.scene._contrailHalfSpan * 0.6);
            this.scene._heatHazeEmitter = em;
            const ps = new BABYLON.ParticleSystem('heatHaze', 200, scene);
            try { ps.particleTexture = new BABYLON.Texture(CLOUD_TEXTURE_URL, scene); } catch (_) { /* ignore */ }
            ps.emitter = em as unknown as BABYLON.AbstractMesh;
            ps.minEmitBox = new BABYLON.Vector3(-0.5, -0.3, -0.2);
            ps.maxEmitBox = new BABYLON.Vector3( 0.5,  0.3,  0.2);
            ps.color1 = new BABYLON.Color4(1, 1, 1, 0.05);
            ps.color2 = new BABYLON.Color4(1, 1, 1, 0.08);
            ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
            ps.minSize = 0.4;
            ps.maxSize = 1.2;
            ps.minLifeTime = 0.3;
            ps.maxLifeTime = 0.9;
            ps.emitRate = 0;
            ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            ps.gravity = new BABYLON.Vector3(0, 0, 0);
            ps.direction1 = new BABYLON.Vector3(0, 0, -1);
            ps.direction2 = new BABYLON.Vector3(0, 0, -1);
            ps.minEmitPower = 2;
            ps.maxEmitPower = 5;
            ps.updateSpeed = 0.015;
            ps.start();
            this.scene._heatHazePS = ps;
        } catch (err) {
            console.warn('[HeatHaze] build failed:', err);
        }
    }

    disposeHeatHaze(): void {
        if (this.scene._heatHazePS)     { try { this.scene._heatHazePS.dispose();     } catch (_) { /* ignore */ } this.scene._heatHazePS = null; }
        if (this.scene._heatHazeEmitter){ try { this.scene._heatHazeEmitter.dispose();} catch (_) { /* ignore */ } this.scene._heatHazeEmitter = null; }
    }

    updateHeatHaze(): void {
        if (!this.scene._heatHazePS) return;
        const n1 = Math.max(0, Math.min(1.5, this.scene._engineN1));
        const tasMs = Number.isFinite(this.scene._lastTasMs) ? this.scene._lastTasMs : 0;
        const speedScale = Math.max(0, 1 - tasMs / 120);
        const target = HEAT_HAZE_MAX_RATE * n1 * speedScale;
        const cur = this.scene._heatHazePS.emitRate || 0;
        this.scene._heatHazePS.emitRate = cur + (target - cur) * 0.1;
    }

    updateLensFlareOcclusion(dtMs: number): void {
        if (!this.scene._lensFlareSystem || !this.scene.scene || !this.scene.camera) return;
        this.scene._flareCheckTimerMs += dtMs;
        if (this.scene._flareCheckTimerMs < FLARE_OCCLUSION_CHECK_INTERVAL_MS) return;
        this.scene._flareCheckTimerMs = 0;
        const sunMesh = this.scene.scene.getMeshByName('sunMesh');
        const sunLight = this.scene.scene.getLightByName('sun') as BABYLON.DirectionalLight | null;
        let sunWorld: BABYLON.Vector3 | null = null;
        if (sunMesh) sunWorld = sunMesh.getAbsolutePosition();
        else if (sunLight) {
            const dir = sunLight.direction;
            const dirN = dir.normalizeToNew().scaleInPlace(-FLARE_OCCLUSION_SUN_DISTANCE_M);
            sunWorld = this.scene.camera.position.add(dirN);
        }
        if (!sunWorld) return;
        const camPos = this.scene.camera.position;
        const toSun = sunWorld.subtract(camPos);
        const distToSun = toSun.length();
        if (distToSun < 1) return;
        const dir = toSun.scale(1 / distToSun);
        const ray = new BABYLON.Ray(camPos, dir, distToSun);
        const planeRoot = this.scene.planeRoot;
        const tilesGroup = this.scene.tiles ? this.scene.tiles.group : null;
        const pick = this.scene.scene.pickWithRay(ray, (m: BABYLON.AbstractMesh) => {
            if (!m || !m.isEnabled() || !m.isVisible || m.isPickable === false) return false;
            if (m.name === 'sunMesh' || m.name === 'sunHalo' || m.name === 'moonMesh' || m.name === 'moonHalo') return false;
            if (m.name === 'skyBox') return false;
            if (tilesGroup && m.isDescendantOf(tilesGroup)) return false;
            if (planeRoot && m.isDescendantOf(planeRoot)) return true;
            return true;
        }, true);
        const occluded = !!(pick && pick.hit);
        this.scene._flareOccluded = occluded;
    }

    updateColorGrading(elevationDeg: number): void {
        if (!this.scene._pipeline) return;
        const ip = this.scene._pipeline.imageProcessing;
        if (!ip) return;
        const dayT = Math.max(0, Math.min(1, (elevationDeg + 6) / 30));
        const sunsetT = Math.max(0, Math.min(1, 1.0 - Math.abs(elevationDeg) / 10));
        const nightT = Math.max(0, Math.min(1, -elevationDeg / 10));
        let r = COLOR_GRADE_DAY_TINT_R * dayT
              + COLOR_GRADE_SUNSET_TINT_R * sunsetT
              + COLOR_GRADE_NIGHT_TINT_R * nightT;
        let g = COLOR_GRADE_DAY_TINT_G * dayT
              + COLOR_GRADE_SUNSET_TINT_G * sunsetT
              + COLOR_GRADE_NIGHT_TINT_G * nightT;
        let b = COLOR_GRADE_DAY_TINT_B * dayT
              + COLOR_GRADE_SUNSET_TINT_B * sunsetT
              + COLOR_GRADE_NIGHT_TINT_B * nightT;
        const norm = Math.max(0.001, dayT + sunsetT + nightT);
        r /= norm; g /= norm; b /= norm;
        if (this._lastColorCurvesEnabled !== true) {
            ip.colorCurvesEnabled = true;
            this._lastColorCurvesEnabled = true;
        }
        if (!ip.colorCurves) ip.colorCurves = new BABYLON.ColorCurves();
        const cc = ip.colorCurves;
        const tintH = ((Math.atan2(g - b, r - g) * 180 / Math.PI) + 360) % 360;
        const tintAmp = Math.min(40, Math.abs((r - 1.0) + (b - 1.0)) * 60);
        if (!Number.isFinite(this._lastTintH) || Math.abs(tintH - this._lastTintH) >= COLOR_GRADE_TINT_HUE_EPSILON_DEG) {
            cc.globalHue = tintH;
            this._lastTintH = tintH;
        }
        if (!Number.isFinite(this._lastTintAmp) || Math.abs(tintAmp - this._lastTintAmp) >= COLOR_GRADE_TINT_DENSITY_EPSILON) {
            cc.globalDensity = tintAmp;
            this._lastTintAmp = tintAmp;
        }
        const newContrast = COLOR_GRADE_CONTRAST_DAY * dayT + COLOR_GRADE_CONTRAST_NIGHT * (sunsetT + nightT) / Math.max(0.001, sunsetT + nightT + dayT);
        if (!Number.isFinite(this._lastContrast) || Math.abs(newContrast - this._lastContrast) >= COLOR_GRADE_CONTRAST_EPSILON) {
            ip.contrast = newContrast;
            this._lastContrast = newContrast;
        }
        if (this._lastColorGradingEnabled !== false) {
            ip.colorGradingEnabled = false;
            this._lastColorGradingEnabled = false;
        }
    }

    ensureMotionBlur(active: boolean): void {
        if (!this.scene.scene || !this.scene.camera) return;
        if (active) {
            if (this.scene._motionBlurPP) return;
            try {
                const cam = this.scene.camera;
                const mb = new BABYLON.MotionBlurPostProcess('motionBlur', this.scene.scene, 1.0, cam);
                mb.motionStrength = MOTION_BLUR_MAX_STRENGTH;
                mb.motionBlurSamples = MOTION_BLUR_SAMPLES;
                this.scene._motionBlurPP = mb;
            } catch (err) {
                console.warn('[MotionBlur] init failed:', err);
            }
            return;
        }
        if (this.scene._motionBlurPP) {
            try { this.scene._motionBlurPP.dispose(this.scene.camera); } catch (_) { /* ignore */ }
            this.scene._motionBlurPP = null;
        }
    }

    updateMotionBlurAndDof(): void {
        if (this.scene.isMobile) {
            if (this.scene._motionBlurPP) this.ensureMotionBlur(false);
            if (this.scene._dofEnabledInCockpit && this.scene._pipeline) {
                try { this.scene._pipeline.depthOfFieldEnabled = false; } catch (_) { /* ignore */ }
                this.scene._dofEnabledInCockpit = false;
            }
            return;
        }
        const gAbs = Math.abs(Number.isFinite(this.scene._gForce) ? this.scene._gForce : 1);
        const wantMb = gAbs > MOTION_BLUR_TRIGGER_G;
        this.ensureMotionBlur(wantMb);
        if (this.scene._pipeline) {
            const isCockpit = this.scene._cameraMode === CAMERA_MODE_COCKPIT;
            if (isCockpit !== this.scene._dofEnabledInCockpit) {
                this.scene._dofEnabledInCockpit = isCockpit;
                try {
                    this.scene._pipeline.depthOfFieldEnabled = isCockpit;
                    if (isCockpit) {
                        this.scene._pipeline.depthOfField.focalLength = 50;
                        this.scene._pipeline.depthOfField.fStop = 1.8;
                        this.scene._pipeline.depthOfField.focusDistance = 800;
                    }
                } catch (err) {
                    console.warn('[DOF] toggle failed:', err);
                }
            }
        }
    }

    updateContrails(_dt: number): void {
        if (!this.scene._contrailPSLeft || !this.scene._contrailPSRight) return;
        const altM = this.scene.planeRoot ? Math.max(0, this.scene.refAlt + this.scene.planeRoot.position.y) : 0;
        const tempC = this.isaTempC(altM);
        const speedMs = Number.isFinite(this.scene._lastTasMs) ? this.scene._lastTasMs : this.scene.velocity.length();
        const enginePower = Number.isFinite(this.scene.enginePower) ? this.scene.enginePower : 0;
        const targetRate = this.computeContrailEmitRate(altM, tempC, speedMs, enginePower);
        const curL = this.scene._contrailPSLeft.emitRate || 0;
        const curR = this.scene._contrailPSRight.emitRate || 0;
        this.scene._contrailPSLeft.emitRate  = curL + (targetRate - curL) * CONTRAIL_EMIT_LERP_RATE;
        this.scene._contrailPSRight.emitRate = curR + (targetRate - curR) * CONTRAIL_EMIT_LERP_RATE;
    }

    setGodRays(scene: BABYLON.Scene, enabled: boolean): void {
        if (enabled === !!this.scene._godRays) return;
        if (enabled) {
            const cam = scene.activeCamera;
            const sunMesh = scene.getMeshByName('sunMesh');
            if (!cam || !sunMesh) {
                console.warn('[GodRays] Cannot create — missing camera or sunMesh');
                return;
            }
            try {
                this.scene._godRays = new BABYLON.VolumetricLightScatteringPostProcess(
                    'godRays',
                    0.5,
                    cam,
                    sunMesh as BABYLON.Mesh,
                    60,
                    BABYLON.Texture.BILINEAR_SAMPLINGMODE,
                    scene.getEngine(),
                    false,
                    scene,
                );
                this.scene._godRays.exposure = 0.18;
                this.scene._godRays.decay    = 0.96;
                this.scene._godRays.weight   = 0.40;
                this.scene._godRays.density  = 0.92;
                console.debug('[GodRays] Volumetric light scattering enabled');
            } catch (err) {
                console.warn('[GodRays] Failed to create:', err);
                this.scene._godRays = null;
            }
        } else if (this.scene._godRays) {
            try {
                const cam = scene.activeCamera;
                if (cam) this.scene._godRays.dispose(cam);
                else (this.scene._godRays as any).dispose();
            } catch (_) { /* ignore */ }
            this.scene._godRays = null;
            console.debug('[GodRays] Disposed');
        }
    }

    setFxaaFallback(enabled: boolean): void {
        if (!this.scene._pipeline) return;
        const samples = this.scene._pipeline.samples ?? 1;
        const want = enabled && samples <= 1;
        if (this.scene._pipeline.fxaaEnabled !== want) {
            this.scene._pipeline.fxaaEnabled = want;
            console.debug(`[FXAA] fallback set to ${want} (samples=${samples})`);
        }
    }

    setColorLut(scene: BABYLON.Scene, enabled: boolean): void {
        if (!this.scene._pipeline) return;
        const ip = this.scene._pipeline.imageProcessing;
        if (!ip) return;
        if (enabled === !!this.scene._colorLutTexture) return;
        if (enabled) {
            try {
                const tex = new BABYLON.Texture(
                    COLOR_LUT_URL,
                    scene,
                    true,
                    false,
                    BABYLON.Texture.BILINEAR_SAMPLINGMODE,
                );
                tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
                tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
                ip.colorGradingTexture = tex;
                ip.colorGradingEnabled = true;
                this.scene._colorLutTexture = tex;
                console.debug(`[ColorLUT] Enabled (${COLOR_LUT_URL})`);
            } catch (err) {
                console.warn('[ColorLUT] Failed to enable:', err);
                this.scene._colorLutTexture = null;
            }
        } else if (this.scene._colorLutTexture) {
            try {
                ip.colorGradingEnabled = false;
                ip.colorGradingTexture = null;
                this.scene._colorLutTexture.dispose();
            } catch (_) { /* ignore */ }
            this.scene._colorLutTexture = null;
            console.debug('[ColorLUT] Disabled');
        }
    }
}
