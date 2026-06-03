import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import {
    getAirDensity,
    computeCoefficients,
    computeSurfaceForces,
} from '../physics/AeroPhysics.js';
import * as CONST from '../constants/index.js';
const {
    CRASH_METERS_TO_FEET,
    CRASH_MPS_TO_FPM,
    SPOILER_DEPLOY_RATE_PER_S,
    SPOILER_RETRACT_RATE_PER_S,
    FLAP_TYPE_FOWLER,
    FLAP_TYPE_SLOTTED,
    FLAP_TYPE_SPLIT,
    SPAWN_TERRAIN_RAY_HEIGHT_M,
    SPAWN_TERRAIN_RAY_LENGTH_M,
    TERRAIN_RAY_HEIGHT_M,
    TERRAIN_RAY_LENGTH_M,
    TERRAIN_UNKNOWN_Y,
    TERRAIN_HIT_ABOVE_LIMIT_M,
    GROUND_TERRAIN_SMOOTH_SNAP_DELTA_M,
    GROUND_TERRAIN_SMOOTH_TAU_S,
    GEAR_STATE_DOWN,
    GEAR_STATE_EXTENDING,
    GEAR_STATE_RETRACTING,
    GEAR_STATE_UP,
    GEAR_INSTANT_TRANSITION_MS,
    GEAR_MAX_TRAVEL_M,
    GEAR_SPRING_K_MIN_N_PER_M,
    GROUND_Y,
    G_ACCEL,
    RUNWAY_COLLIDER_Y_BIAS_M,
    WIND_ALTITUDE_GAIN_KT_PER_1000FT,
    WIND_MAX_SPEED_KT,
    WIND_DEFAULT_SPEED_KT,
    WIND_DEFAULT_DIRECTION_DEG,
    WIND_METAR_BLEND_TOP_AGL_FT,
    KT_TO_MS,
    TURB_FADE_AGL_M,
    TURB_FULL_AGL_M,
    TURB_MAX_GUST_MS,
    TURB_TAU_S,
    MAGNETO_BOTH,
    MS_TO_KT,
    ENGINE_TYPE_PISTON,
    ENGINE_TYPE_TURBOPROP,
    ENGINE_TYPE_ELECTRIC,
    SPOOL_TAU_PISTON_S,
    SPOOL_TAU_TURBOPROP_S,
    SPOOL_TAU_ELECTRIC_S,
    SPOOL_TAU_JET_S,
    ASYM_YAW_TORQUE_SCALE,
    YAW_RATE_DAMP_COEF,
    SEA_LEVEL_AIR_DENSITY_KG_PER_M3,
    BEST_POWER_MIX,
    MAGNETO_LEFT,
    MAGNETO_RIGHT,
    MAGNETO_SINGLE_FACTOR,
    JET_THRUST_LAPSE_EXPONENT,
    ISA_TROPOPAUSE_M,
    ISA_TROPOPAUSE_TEMP_K,
    ISA_SEA_LEVEL_TEMP_K,
    ISA_LAPSE_RATE_K_PER_M,
    SPECIFIC_HEAT_RATIO_AIR,
    GAS_CONSTANT_AIR_J_PER_KG_K,
    JET_THRUST_MACH_MIN_FACTOR,
    JET_THRUST_MACH_LAPSE_COEF,
    SPOILER_DEFAULT_LIFT_LOSS,
    SPOILER_DEFAULT_DRAG_CD,
    MACH_DRAG_RISE_START,
    MACH_DRAG_RISE_COEF,
    G_FORCE_SMOOTHING,
    ANGULAR_DAMPING,
    CRASH_VS_THRESHOLD_MS,
    CRASH_GROUND_SPEED_MS,
    CRASH_GROUND_ATTITUDE_DEG,
    CINEMATIC_DURATION_MS,
    CAMERA_RADIUS_MIN_M,
    CAMERA_RADIUS_MAX_M,
    CAMERA_COCKPIT_RADIUS_M,
    CAMERA_COCKPIT_LOWER_RADIUS_M,
    CINEMATIC_INITIAL_RADIUS_M,
    CAMERA_MODE_COCKPIT,
    CAMERA_MODE_FLYBY,
    CAMERA_MODE_TOWER,
    TOWER_CAMERA_MIN_RADIUS_M,
    TOWER_CAMERA_BETA_RAD,
    CAMERA_MODE_CHASE,
} = CONST as any;
import { UiPreferences } from '../../UiPreferences.js';

export class FlightPhysicsSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    triggerCrash(reason: string = 'unknown'): void {
        const altFtBefore = this.scene.planeRoot
            ? Math.max(0, (this.scene.refAlt + this.scene.planeRoot.position.y) * CRASH_METERS_TO_FEET)
            : 0;
        const vsFpmBefore = this.scene.velocity.y * CRASH_MPS_TO_FPM;
        this.scene._crashed = true;
        this.scene.velocity.setAll(0);
        this.scene.angularVelocity.setAll(0);
        this.scene.thrust = 0;
        if (this.scene._crashOverlayEl) this.scene._crashOverlayEl.style.display = 'block';
        console.log(`[Crash] Ground impact detected reason=${reason} altFt=${altFtBefore.toFixed(0)} vsFpm=${vsFpmBefore.toFixed(0)} — respawning in 3s`);
        try {
            this.scene.mpClient?.sendCrash(reason, altFtBefore, vsFpmBefore);
        } catch (err) {
            console.error('[Crash] Failed to notify server about crash:', (err as Error)?.message || err);
        }
        const RESPAWN_DELAY_MS = 3000;
        this.scene._safeSetTimeout(() => {
            if (!this.scene.planeRoot) return;
            if (this.scene._crashOverlayEl) this.scene._crashOverlayEl.style.display = 'none';
            this.scene._crashed = false;
            this.scene._worldReady = false;
            this.scene._worldReadyStartMs = 0;
            this.scene._spawnSnapFramesLeft = 0;
            console.debug('[Crash] Respawning at session origin');
            this.scene._spawnPlane();
        }, RESPAWN_DELAY_MS);
    }

    applySpoilers(dt: number, gearOnGround: boolean): void {
        const cfg = this.scene.aircraftConfig;
        if (cfg.ground_spoilers_auto && this.scene._spoilerArmed && gearOnGround && this.scene._spoilerTarget < 1) {
            this.scene._spoilerTarget = 1;
        }
        const stepDt = Number.isFinite(dt) && dt > 0 ? dt : this.scene.FIXED_DT;
        if (this.scene._spoilerDeflection < this.scene._spoilerTarget) {
            this.scene._spoilerDeflection = Math.min(this.scene._spoilerTarget, this.scene._spoilerDeflection + SPOILER_DEPLOY_RATE_PER_S * stepDt);
        } else if (this.scene._spoilerDeflection > this.scene._spoilerTarget) {
            this.scene._spoilerDeflection = Math.max(this.scene._spoilerTarget, this.scene._spoilerDeflection - SPOILER_RETRACT_RATE_PER_S * stepDt);
        }
    }

    toggleSpoilers(): void {
        if (this.scene._spoilerTarget > 0) {
            this.scene._spoilerTarget = 0;
            this.scene._spoilerArmed = false;
        } else {
            this.scene._spoilerTarget = 1;
        }
    }

    armGroundSpoilers(): void {
        this.scene._spoilerArmed = !this.scene._spoilerArmed;
    }

    killEngine(engineIdx: number): void {
        if (!Array.isArray(this.scene._engineAlive) || engineIdx < 0 || engineIdx >= this.scene._engineAlive.length) return;
        this.scene._engineAlive[engineIdx] = !this.scene._engineAlive[engineIdx];
        const aliveCount = this.scene._engineAlive.filter(Boolean).length;
        console.log(`[Engine] Toggled #${engineIdx + 1} -> ${this.scene._engineAlive[engineIdx] ? 'ALIVE' : 'DEAD'} (alive ${aliveCount}/${this.scene._engineAlive.length})`);
    }

    resetEngines(): void {
        const cnt = Math.max(1, this.scene.aircraftConfig?.engine_count ?? 1);
        this.scene._engineAlive = new Array(cnt).fill(true);
        this.scene._engineSpool = new Array(cnt).fill(1);
    }

    applyFlaps(dt: number): void {
        if (!this.scene.FLAP_STEPS || !this.scene.FLAP_STEPS.length) return;
        if (this.scene.flapIndex >= this.scene.FLAP_STEPS.length) this.scene.flapIndex = this.scene.FLAP_STEPS.length - 1;
        const targetDeg = this.scene.FLAP_STEPS[this.scene.flapIndex];
        const rate = 5;
        const stepDt = Number.isFinite(dt) && dt > 0 ? dt : this.scene.FIXED_DT;
        const animatingBefore = Math.abs(this.scene.currentFlapDeg - targetDeg) > 0.05;
        if (this.scene.currentFlapDeg < targetDeg) this.scene.currentFlapDeg = Math.min(targetDeg, this.scene.currentFlapDeg + rate * stepDt);
        if (this.scene.currentFlapDeg > targetDeg) this.scene.currentFlapDeg = Math.max(targetDeg, this.scene.currentFlapDeg - rate * stepDt);
        const animatingAfter = Math.abs(this.scene.currentFlapDeg - targetDeg) > 0.05;
        const flapAnimating = animatingBefore || animatingAfter;
        if (flapAnimating !== this.scene._lastFlapAnimating) {
            this.scene._lastFlapAnimating = flapAnimating;
            try { this.scene._flightAudio.setFlapsAnimating(flapAnimating); } catch (_) { /* ignore */ }
        }

        const flapRad = this.scene.currentFlapDeg * Math.PI / 180;
        const ft = this.scene.aircraftConfig.flap_type;

        let zeroLiftShift: number;
        let extraFriction: number;
        let stallBoost: number;
        let areaScale = 1.0;

        if (ft === FLAP_TYPE_FOWLER) {
            zeroLiftShift = -flapRad * 0.06;
            extraFriction = this.scene.currentFlapDeg * 0.0006;
            stallBoost = this.scene.currentFlapDeg * 0.0014;
            areaScale = 1.0 + this.scene.currentFlapDeg * 0.004;
        } else if (ft === FLAP_TYPE_SLOTTED) {
            zeroLiftShift = -flapRad * 0.05;
            extraFriction = this.scene.currentFlapDeg * 0.0007;
            stallBoost = this.scene.currentFlapDeg * 0.0012;
        } else if (ft === FLAP_TYPE_SPLIT) {
            zeroLiftShift = -flapRad * 0.035;
            extraFriction = this.scene.currentFlapDeg * 0.0015;
            stallBoost = this.scene.currentFlapDeg * 0.0005;
        } else {
            zeroLiftShift = -flapRad * 0.04;
            extraFriction = this.scene.currentFlapDeg * 0.0008;
            stallBoost = this.scene.currentFlapDeg * 0.0008;
        }

        for (let i = 0; i < 2; i++) {
            if (!this.scene.surfaces[i]) continue;
            this.scene.surfaces[i].zeroLiftAoA  = this.scene.baseZeroLiftAoA + zeroLiftShift;
            this.scene.surfaces[i].skinFriction = this.scene.aircraftConfig.skin_friction + extraFriction;
            this.scene.surfaces[i].stallAlpha   = this.scene.aircraftConfig.stall_alpha_rad + stallBoost;
            if (ft === FLAP_TYPE_FOWLER) {
                const baseCfg = this.scene.aircraftConfig.surfaces[i];
                if (baseCfg) this.scene.surfaces[i].area = baseCfg.area * areaScale;
            }
        }
    }

    applyPhysics(dt: number): void {
        const orientation = this.scene.planeRoot.rotationQuaternion!;
        const pos         = this.scene.planeRoot.position;

        const altitude = (this.scene.refAlt ?? 0) + pos.y;
        const airDensity = getAirDensity(altitude, this.scene._isaDeltaTempK);

        const rotMatrix = this.scene._tmpRotMatrix;
        BABYLON.Matrix.FromQuaternionToRef(orientation, rotMatrix);
        const invRotMatrix = this.scene._tmpInvRotMatrix;
        rotMatrix.invertToRef(invRotMatrix);

        const toWorld = (v: BABYLON.Vector3) => BABYLON.Vector3.TransformNormal(v, rotMatrix);
        const toBody  = (v: BABYLON.Vector3) => BABYLON.Vector3.TransformNormal(v, invRotMatrix);

        const cfg = this.scene.aircraftConfig;

        // ── Terrain ray (runs FIRST so gear uses fresh terrainY this tick) ───
        if (this.scene.tiles) {
            const inSpawnWindow = this.scene._spawnSnapFramesLeft > 0;
            const rayHeight = inSpawnWindow ? SPAWN_TERRAIN_RAY_HEIGHT_M : TERRAIN_RAY_HEIGHT_M;
            const rayLength = inSpawnWindow ? SPAWN_TERRAIN_RAY_LENGTH_M : TERRAIN_RAY_LENGTH_M;
            this.scene._terrainRay.origin.set(pos.x, pos.y + rayHeight, pos.z);
            this.scene._terrainRay.length = rayLength;
            let hit: BABYLON.PickingInfo | null;
            if (!inSpawnWindow && this.scene._terrainPickFrameTick === this.scene._frameTick && this.scene._cachedTerrainHit) {
                hit = this.scene._cachedTerrainHit;
            } else {
                hit = this.scene._pickTerrainPreferRunway(this.scene._terrainRay);
                this.scene._cachedTerrainHit = hit;
                this.scene._terrainPickFrameTick = this.scene._frameTick;
            }
            const wasUnknown = this.scene.terrainY === TERRAIN_UNKNOWN_Y;
            let resolvedTerrainY: number = TERRAIN_UNKNOWN_Y;
            if (hit?.hit && hit.pickedPoint) {
                const accept = inSpawnWindow || hit.pickedPoint.y <= pos.y + TERRAIN_HIT_ABOVE_LIMIT_M;
                if (accept) {
                    const isRunwayHit = hit.pickedMesh?.metadata?.type === 'runway-collider';
                    resolvedTerrainY = (inSpawnWindow && !isRunwayHit)
                        ? hit.pickedPoint.y + RUNWAY_COLLIDER_Y_BIAS_M
                        : hit.pickedPoint.y;
                } else if (!inSpawnWindow) {
                    const buryDepth = hit.pickedPoint.y - pos.y;
                    console.warn(`[Crash] Terrain tunneling detected: pos.y=${pos.y.toFixed(1)}m terrainHit=${hit.pickedPoint.y.toFixed(1)}m bury=${buryDepth.toFixed(1)}m speed=${(this.scene.velocity.length() * 1.94384).toFixed(0)}kt`);
                    this.scene._triggerCrash('terrain_tunneling');
                    return;
                }
            }
            if (resolvedTerrainY !== TERRAIN_UNKNOWN_Y) {
                if (this.scene.isOnGround
                    && this.scene.terrainY !== TERRAIN_UNKNOWN_Y
                    && Math.abs(resolvedTerrainY - this.scene.terrainY) < GROUND_TERRAIN_SMOOTH_SNAP_DELTA_M) {
                    const smoothAlpha = Math.min(1, dt / GROUND_TERRAIN_SMOOTH_TAU_S);
                    this.scene.terrainY = this.scene.terrainY + (resolvedTerrainY - this.scene.terrainY) * smoothAlpha;
                } else {
                    this.scene.terrainY = resolvedTerrainY;
                }
                this.scene._lastKnownSpawnTerrainY = resolvedTerrainY;
            } else if (inSpawnWindow && this.scene._lastKnownSpawnTerrainY !== TERRAIN_UNKNOWN_Y) {
                this.scene.terrainY = this.scene._lastKnownSpawnTerrainY;
            } else {
                this.scene.terrainY = TERRAIN_UNKNOWN_Y;
            }
            const isUnknown = this.scene.terrainY === TERRAIN_UNKNOWN_Y;
            if (wasUnknown !== isUnknown) {
                if (isUnknown) {
                    const hitInfo = hit?.hit && hit.pickedPoint
                        ? `rejected hit at y=${hit.pickedPoint.y.toFixed(1)}m (above pos.y+${TERRAIN_HIT_ABOVE_LIMIT_M}m)`
                        : `ray miss (origin.y=${(pos.y + rayHeight).toFixed(1)}m len=${rayLength}m)`;
                    console.debug(`[Terrain] terrainY -> UNKNOWN at pos.y=${pos.y.toFixed(1)}m, ${hitInfo}`);
                } else {
                    console.debug(`[Terrain] terrainY re-acquired at pos.y=${pos.y.toFixed(1)}m, terrainY=${this.scene.terrainY.toFixed(1)}m`);
                }
            }
        }

        const gearDeployed = this.scene.gearState === GEAR_STATE_DOWN || this.scene.gearState === GEAR_STATE_EXTENDING;

        // ── Spawn safety snap (ONLY during initial spawn settle window) ───
        // This handles the case where the physics terrain ray returns a
        // higher altitude than the spawn position (airport elevation > 0).
        // After the spawn window, in-flight terrain interactions are handled
        // purely by oleo compression + crash detection, so the snap never
        // fires during flight and never resets user input/angular velocity.
        if (this.scene._spawnSnapFramesLeft > 0) {
            this.scene._spawnSnapFramesLeft--;
            if (gearDeployed) {
                const groundLevelNow = this.scene.tiles ? this.scene.terrainY : GROUND_Y;
                let maxBury = 0;
                for (let gi = 0; gi < cfg.gear_positions.length; gi++) {
                    const gp = cfg.gear_positions[gi];
                    const wheelY = pos.y + toWorld(new BABYLON.Vector3(gp.x, gp.y, gp.z)).y;
                    const bury = groundLevelNow - wheelY;
                    if (bury > maxBury) maxBury = bury;
                }
                if (maxBury > GEAR_MAX_TRAVEL_M) {
                    const nGearsSnap = Math.max(1, cfg.gear_positions.length);
                    const sitMassSnap = cfg.mass_kg + (this.scene.fuelRemaining || 0);
                    const safeSpringKSnap = Math.max(GEAR_SPRING_K_MIN_N_PER_M, Number.isFinite(cfg.gear_spring_k) ? cfg.gear_spring_k : 0);
                    const eqComp = Math.min(
                        GEAR_MAX_TRAVEL_M * 0.5,
                        (sitMassSnap * G_ACCEL) / (nGearsSnap * safeSpringKSnap),
                    );
                    pos.y += (maxBury - eqComp);
                    if (this.scene.velocity.y < 0) this.scene.velocity.y = 0;
                    this.scene.angularVelocity.set(0, 0, 0);
                    console.warn(`[Gear/spawn] Terrain rose ${maxBury.toFixed(2)}m below plane; snapped pos.y +${(maxBury - eqComp).toFixed(2)}m (target comp ${eqComp.toFixed(3)}m)`);
                } else if (maxBury > 0) {
                    const SPAWN_SETTLE_ANG_DAMP = 0.25;
                    this.scene.angularVelocity.scaleInPlace(SPAWN_SETTLE_ANG_DAMP);
                }
            }
        }
        const hasProp = cfg.engine_type === ENGINE_TYPE_PISTON || cfg.engine_type === ENGINE_TYPE_TURBOPROP;
        const isPiston = cfg.engine_type === ENGINE_TYPE_PISTON;
        const isTurboprop = cfg.engine_type === ENGINE_TYPE_TURBOPROP;
        const isElectric = cfg.engine_type === ENGINE_TYPE_ELECTRIC;

        // ── Engine spool-up (N1 lags throttle) ───────────────────────────────
        const spoolTauS = isPiston ? SPOOL_TAU_PISTON_S
            : isTurboprop ? SPOOL_TAU_TURBOPROP_S
            : isElectric ? SPOOL_TAU_ELECTRIC_S
            : SPOOL_TAU_JET_S;
        const spoolAlpha = Math.max(0, Math.min(1, dt / Math.max(0.01, spoolTauS)));
        const throttleTarget = Number.isFinite(this.scene.thrust) ? this.scene.thrust : 0;
        this.scene._engineN1 = this.scene._engineN1 + (throttleTarget - this.scene._engineN1) * spoolAlpha;
        const n1 = Math.max(0, this.scene._engineN1);

        // ── Engine model ─────────────────────────────────────────────────────
        let effectiveThrust = n1;
        if (isPiston || isTurboprop) {
            const densityRatio = Math.max(0, airDensity / SEA_LEVEL_AIR_DENSITY_KG_PER_M3);
            const mapFraction = n1 * densityRatio;
            let mixEfficiency = 1.0;
            let magFactor = 1.0;
            if (isPiston) {
                const mixDelta = Math.abs(this.scene.mixtureLevel - BEST_POWER_MIX);
                mixEfficiency = Math.max(0, 1.0 - mixDelta * 2.5);
                magFactor = 0;
                if (this.scene.magnetoSwitch === MAGNETO_BOTH) magFactor = 1.0;
                else if (this.scene.magnetoSwitch === MAGNETO_LEFT || this.scene.magnetoSwitch === MAGNETO_RIGHT) magFactor = MAGNETO_SINGLE_FACTOR;
            }
            this.scene.enginePower = Math.max(0, Math.min(1, mapFraction * mixEfficiency * magFactor));
            this.scene.engineRpm = (cfg.prop_rpm_max || 2700) * Math.sqrt(this.scene.enginePower);
            effectiveThrust = this.scene.enginePower;
        } else {
            const densityRatio = Math.max(0.0001, airDensity / SEA_LEVEL_AIR_DENSITY_KG_PER_M3);
            const thrustAltitudeLapse = Math.pow(densityRatio, JET_THRUST_LAPSE_EXPONENT);
            let thrustMachLapse = 1.0;
            if (!isElectric) {
                const tempKEng = altitude > ISA_TROPOPAUSE_M
                    ? ISA_TROPOPAUSE_TEMP_K
                    : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * Math.max(0, altitude);
                const speedOfSoundEng = Math.sqrt(SPECIFIC_HEAT_RATIO_AIR * GAS_CONSTANT_AIR_J_PER_KG_K * tempKEng);
                const machNow = this.scene.velocity.length() / Math.max(1, speedOfSoundEng);
                const machLapseFloor = cfg.mach_lapse_floor ?? JET_THRUST_MACH_MIN_FACTOR;
                const machLapseCoef = cfg.mach_lapse_coef ?? JET_THRUST_MACH_LAPSE_COEF;
                thrustMachLapse = Math.max(
                    machLapseFloor,
                    1.0 - machLapseCoef * machNow,
                );
            }
            const altitudeLapseEffective = isElectric ? 1.0 : thrustAltitudeLapse;
            effectiveThrust = n1 * altitudeLapseEffective * thrustMachLapse;
            this.scene.enginePower = n1;
            this.scene.engineRpm = Math.round(1200 + n1 * 1500);
        }
        const allEnginesDead = Array.isArray(this.scene._engineAlive) && this.scene._engineAlive.length > 0 && !this.scene._engineAlive.some(Boolean);
        const outOfFuel = this.scene.fuelRemaining <= 0 && cfg.fuel_capacity_kg > 0;
        if (outOfFuel || allEnginesDead) {
            effectiveThrust = 0;
            this.scene.enginePower = 0;
            this.scene.engineRpm = 0;
        }

        // ── Fuel burn (after engine model so piston uses actual output) ──────
        const engineCountForBurn = Math.max(1, cfg.engine_count ?? 1);
        const aliveForBurnRatio = Array.isArray(this.scene._engineAlive)
            ? this.scene._engineAlive.filter(Boolean).length / engineCountForBurn
            : 1;
        if (this.scene.fuelRemaining > 0 && cfg.fuel_capacity_kg > 0 && aliveForBurnRatio > 0) {
            const burnFraction = (isPiston ? this.scene.enginePower : n1) * aliveForBurnRatio;
            const burnIdle = cfg.fuel_burn_rate_kg_per_s_idle;
            const burnMax  = cfg.fuel_burn_rate_kg_per_s_max;
            let burnRate: number;
            if (burnFraction <= 1.0) {
                burnRate = burnIdle + (burnMax - burnIdle) * burnFraction;
            } else {
                const abMaxThr = cfg.afterburner_thrust_mult ?? 1.0;
                const abFuelMult = cfg.afterburner_fuel_mult ?? 1.0;
                const span = Math.max(1e-3, abMaxThr - 1.0);
                const t = Math.min(1.0, (burnFraction - 1.0) / span);
                burnRate = burnMax + burnMax * (abFuelMult - 1.0) * t;
            }
            this.scene.fuelRemaining = Math.max(0, this.scene.fuelRemaining - burnRate * dt);
        }
        const MASS = cfg.fuel_capacity_kg > 0
            ? cfg.mass_kg + this.scene.fuelRemaining
            : cfg.mass_kg;
        const cIxx = cfg.inertia_xx;
        const cIyy = cfg.inertia_yy;
        const cIzz = cfg.inertia_zz;

        const engineCountTotal = Math.max(1, cfg.engine_count ?? 1);
        if (!Array.isArray(this.scene._engineAlive) || this.scene._engineAlive.length !== engineCountTotal) {
            this.scene._engineAlive = new Array(engineCountTotal).fill(true);
        }
        if (!Array.isArray(this.scene._engineSpool) || this.scene._engineSpool.length !== engineCountTotal) {
            this.scene._engineSpool = this.scene._engineAlive.map((alive: boolean) => (alive ? 1 : 0));
        }
        const engineSpoolAlpha = Math.max(0, Math.min(1, dt / Math.max(0.01, spoolTauS)));
        for (let e = 0; e < engineCountTotal; e++) {
            const target = this.scene._engineAlive[e] ? 1 : 0;
            this.scene._engineSpool[e] += (target - this.scene._engineSpool[e]) * engineSpoolAlpha;
        }
        let spoolSum = 0;
        for (let e = 0; e < engineCountTotal; e++) spoolSum += this.scene._engineSpool[e];
        const aliveThrustRatio = engineCountTotal > 0 ? spoolSum / engineCountTotal : 0;
        const thrustVec = this.scene._tmpFwd;
        thrustVec.set(0, 0, effectiveThrust * cfg.max_thrust_n * aliveThrustRatio);

        let asymYawTorqueBody = 0;
        {
            const halfSpanForEngines = (this.scene.wingSpan || 16) * 0.5;
            const enginePositions: number[] = [];
            if (engineCountTotal === 2)      enginePositions.push(-halfSpanForEngines * 0.45,  halfSpanForEngines * 0.45);
            else if (engineCountTotal === 3) enginePositions.push(-halfSpanForEngines * 0.55, 0, halfSpanForEngines * 0.55);
            else if (engineCountTotal === 4) enginePositions.push(-halfSpanForEngines * 0.70, -halfSpanForEngines * 0.30, halfSpanForEngines * 0.30, halfSpanForEngines * 0.70);
            else enginePositions.push(0);
            const thrustPerEngine = engineCountTotal > 0
                ? (effectiveThrust * cfg.max_thrust_n) / engineCountTotal
                : 0;
            for (let e = 0; e < engineCountTotal && e < enginePositions.length; e++) {
                asymYawTorqueBody += enginePositions[e] * thrustPerEngine * this.scene._engineSpool[e];
            }
            asymYawTorqueBody *= ASYM_YAW_TORQUE_SCALE;
        }

        // ── Ground effect ────────────────────────────────────────────────────
        const groundLevel = this.scene.tiles ? this.scene.terrainY : GROUND_Y;
        const agl = Math.max(0.1, pos.y - groundLevel);
        const hb = agl / Math.max(1, this.scene.wingSpan);
        const hb15 = Math.pow(hb, 1.5);
        const groundEffectFactor = (33 * hb15) / (1 + 33 * hb15);

        // ── Propwash speed boost on tail surfaces ────────────────────────────
        let propwashBoost = 0;
        if (hasProp && effectiveThrust > 0 && cfg.prop_diameter_m) {
            const discArea = Math.PI * (cfg.prop_diameter_m * 0.5) * (cfg.prop_diameter_m * 0.5);
            const thr = effectiveThrust * cfg.max_thrust_n;
            propwashBoost = Math.sqrt(Math.max(0, thr / (0.5 * Math.max(0.01, airDensity) * discArea)));
        }

        // ── Gear oleo forces (position-dependent, computed once per substep) ─
        const gearForce  = BABYLON.Vector3.Zero();
        const gearTorque = BABYLON.Vector3.Zero();
        let anyGearOnGround = false;
        if (gearDeployed) {
            for (let gi = 0; gi < cfg.gear_positions.length; gi++) {
                const gp = cfg.gear_positions[gi];
                const bodyPos = new BABYLON.Vector3(gp.x, gp.y, gp.z);
                const worldOffset = toWorld(bodyPos);
                const wheelY = pos.y + worldOffset.y;
                const compression = Math.max(0, groundLevel - wheelY);
                this.scene.gearCompression[gi] = compression;

                if (compression > 0) {
                    anyGearOnGround = true;
                    const gearBodyVel = toBody(this.scene.velocity).add(
                        BABYLON.Vector3.Cross(this.scene.angularVelocity, bodyPos),
                    );
                    const gearWorldVelY = toWorld(gearBodyVel).y;
                    const compressionRate = -gearWorldVelY;
                    const springF = Math.max(0, cfg.gear_spring_k * compression + cfg.gear_damping_c * compressionRate);
                    gearForce.y += springF;
                    gearTorque.addInPlace(BABYLON.Vector3.Cross(bodyPos, toBody(new BABYLON.Vector3(0, springF, 0))));
                }
            }
        } else {
            this.scene.gearCompression.fill(0);
        }

        const altMslFtForWind = (this.scene.refAlt + pos.y) * 3.28084;
        this.scene._getWindVectorWorldRef(altMslFtForWind, this.scene._tmpWindWorld);
        const windWorld = this.scene._tmpWindWorld;

        const computeForces = (vel: BABYLON.Vector3, angVel: BABYLON.Vector3) => {
            const totalForce  = BABYLON.Vector3.Zero();
            const totalTorque = BABYLON.Vector3.Zero();

            totalForce.y -= MASS * G_ACCEL;

            totalForce.addInPlace(toWorld(thrustVec));

            const airVelWorld = vel.subtract(windWorld);
            const bodyVel = toBody(airVelWorld);
            let primaryAlpha = 0;
            for (let si = 0; si < this.scene.surfaces.length; si++) {
                const surface = this.scene.surfaces[si];
                const pointVel = bodyVel.add(BABYLON.Vector3.Cross(angVel, surface.position));
                const isTailSurface = si >= 2;
                const pwBoost = isTailSurface ? propwashBoost : 0;
                const { force, torque, liftVec } = computeSurfaceForces(
                    surface, pointVel, airDensity, groundEffectFactor, cfg.flap_type, pwBoost,
                );
                if ((si === 0 || si === 1) && this.scene._spoilerDeflection > 0) {
                    const liftLoss = Math.max(0, Math.min(1, (cfg.spoiler_lift_loss ?? SPOILER_DEFAULT_LIFT_LOSS) * this.scene._spoilerDeflection));
                    const liftPenalty = liftVec.scale(-liftLoss);
                    force.addInPlace(liftPenalty);
                    torque.addInPlace(BABYLON.Vector3.Cross(surface.position, liftPenalty));
                }
                totalForce.addInPlace(toWorld(force));
                totalTorque.addInPlace(torque);
                if (si === 0 && pointVel.lengthSquared() > 1.0) {
                    const dragDirP = pointVel.normalizeToNew().scaleInPlace(-1);
                    const dotP = Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(dragDirP, surface.normal)));
                    primaryAlpha = Math.asin(dotP);
                }
            }
            this.scene._lastAoaRad = primaryAlpha;

            // Fuselage parasite drag (+ gear drag when deployed) — air-relative
            const spd = airVelWorld.length();
            if (spd >= 1.0) {
                const baseCd0 = cfg.fuselage_cd0 + (gearDeployed ? (cfg.gear_drag_cd ?? 0) : 0);
                const tempK = altitude > ISA_TROPOPAUSE_M
                    ? ISA_TROPOPAUSE_TEMP_K
                    : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * Math.max(0, altitude);
                const speedOfSound = Math.sqrt(SPECIFIC_HEAT_RATIO_AIR * GAS_CONSTANT_AIR_J_PER_KG_K * tempK);
                const machNumber = spd / Math.max(1, speedOfSound);
                const machExcess = Math.max(0, machNumber - MACH_DRAG_RISE_START);
                const waveCoef = cfg.wave_drag_coef ?? MACH_DRAG_RISE_COEF;
                const wavePeak = cfg.wave_drag_peak_mach ?? null;
                const waveDecayK = cfg.wave_drag_decay_k ?? 0;
                let machDragMult: number;
                if (wavePeak != null && machNumber > wavePeak) {
                    const peakExcess = Math.max(0, wavePeak - MACH_DRAG_RISE_START);
                    const peakDragMult = 1.0 + peakExcess * peakExcess * waveCoef;
                    machDragMult = 1.0 + (peakDragMult - 1.0) * Math.exp(-waveDecayK * (machNumber - wavePeak));
                } else {
                    machDragMult = 1.0 + machExcess * machExcess * waveCoef;
                }
                const transFactor = cfg.transonic_cd0_factor ?? 1.0;
                const effectiveCd0 = baseCd0 * (machExcess > 0 ? transFactor : 1.0);
                const qBody = 0.5 * airDensity * spd * spd * effectiveCd0 * cfg.fuselage_ref_area * machDragMult;
                totalForce.addInPlace(airVelWorld.normalizeToNew().scaleInPlace(-qBody));

                const wingAreaTotal = (cfg.surfaces[0]?.area ?? 0) + (cfg.surfaces[1]?.area ?? 0);
                if (this.scene._spoilerDeflection > 0) {
                    const spoilerCd = (cfg.spoiler_drag_cd ?? SPOILER_DEFAULT_DRAG_CD) * this.scene._spoilerDeflection;
                    const spoilerRefArea = wingAreaTotal > 0 ? wingAreaTotal : cfg.fuselage_ref_area;
                    const qSpoiler = 0.5 * airDensity * spd * spd * spoilerCd * spoilerRefArea * machDragMult;
                    totalForce.addInPlace(airVelWorld.normalizeToNew().scaleInPlace(-qSpoiler));
                }

                if (machExcess > 0) {
                    if (wingAreaTotal > 0) {
                        const wingWaveDrag = 0.5 * airDensity * spd * spd * cfg.skin_friction * wingAreaTotal * (machDragMult - 1.0);
                        totalForce.addInPlace(airVelWorld.normalizeToNew().scaleInPlace(-wingWaveDrag));
                    }
                }

                // Fuselage sideslip Cy/Cn (air-relative)
                const bodyVelNow = toBody(airVelWorld);
                const beta = Math.atan2(bodyVelNow.x, Math.max(1, Math.abs(bodyVelNow.z)));
                const qSide = 0.5 * airDensity * spd * spd * cfg.fuselage_side_area;
                const sideForce = -beta * qSide * 0.4;
                totalForce.addInPlace(toWorld(new BABYLON.Vector3(sideForce, 0, 0)));
                totalTorque.y += cfg.fuselage_cn_beta * beta * qSide * 5.0;

                const halfSpanYawDamp = (this.scene.wingSpan || 16) * 0.5;
                const yawRateNondim = (angVel.y * halfSpanYawDamp) / Math.max(1, spd);
                totalTorque.y -= YAW_RATE_DAMP_COEF * yawRateNondim * qSide * halfSpanYawDamp;

                const cdVert = (cfg.fuselage_cd_vertical != null && Number.isFinite(cfg.fuselage_cd_vertical))
                    ? Math.max(0, cfg.fuselage_cd_vertical)
                    : 0;
                const planformArea = (cfg.fuselage_planform_area != null && Number.isFinite(cfg.fuselage_planform_area))
                    ? Math.max(0, cfg.fuselage_planform_area)
                    : 0;
                if (cdVert > 0 && planformArea > 0) {
                    const vy = bodyVelNow.y;
                    if (Math.abs(vy) >= 1.0) {
                        const verticalDragMag = 0.5 * airDensity * vy * vy * cdVert * planformArea * machDragMult;
                        const verticalForceBodyY = -Math.sign(vy) * verticalDragMag;
                        totalForce.addInPlace(toWorld(new BABYLON.Vector3(0, verticalForceBodyY, 0)));
                    }
                }
            }

            const _propRotRaw: any = cfg.prop_rotation_dir;
            const propDirCommon = (_propRotRaw === 0 || _propRotRaw === 'cw') ? 1 : -1;

            if (hasProp && effectiveThrust > 0) {
                const bodyVelNow = toBody(airVelWorld);
                const alphaBody = Math.atan2(-bodyVelNow.y, Math.max(1, Math.abs(bodyVelNow.z)));
                totalTorque.y += effectiveThrust * cfg.max_thrust_n * Math.sin(alphaBody) * 0.04 * propDirCommon;

                totalTorque.x += effectiveThrust * cfg.max_thrust_n * 0.015 * -propDirCommon;
            }

            if (hasProp && cfg.prop_inertia_kgm2 && cfg.prop_rpm_max) {
                const omegaProp = (this.scene.engineRpm / 60) * 2 * Math.PI;
                const Hprop = cfg.prop_inertia_kgm2 * omegaProp * propDirCommon;
                totalTorque.x += angVel.y * Hprop;
                totalTorque.y -= angVel.x * Hprop;
            }

            // Gear oleo
            totalForce.addInPlace(gearForce);
            totalTorque.addInPlace(gearTorque);
            totalTorque.y += asymYawTorqueBody;

            if (this.scene.isOnGround && this.scene.surfaces.length >= 4) {
                const groundSpeedSq = vel.x * vel.x + vel.z * vel.z;
                if (groundSpeedSq > 0.25) {
                    const groundSpeed = Math.sqrt(groundSpeedSq);
                    const rudderInput = this.scene.surfaces[3].controlInput;
                    const NOSEWHEEL_GAIN = 600;
                    const NOSEWHEEL_MAX_SPEED_MS = 30;
                    const speedFactor = Math.max(0, 1 - groundSpeed / NOSEWHEEL_MAX_SPEED_MS);
                    totalTorque.y += -rudderInput * NOSEWHEEL_GAIN * speedFactor;
                }
            }

            return { force: totalForce, torque: totalTorque };
        };

        // ── Heun integrator ──────────────────────────────────────────────────
        const f1 = computeForces(this.scene.velocity, this.scene.angularVelocity);

        const halfDt  = dt * 0.5;
        const predVel = this.scene.velocity.add(f1.force.scale(halfDt / MASS));

        const Iw1   = new BABYLON.Vector3(cIxx * this.scene.angularVelocity.x, cIyy * this.scene.angularVelocity.y, cIzz * this.scene.angularVelocity.z);
        const gyro1 = BABYLON.Vector3.Cross(this.scene.angularVelocity, Iw1);
        const angAcc1 = new BABYLON.Vector3(
            (f1.torque.x - gyro1.x) / cIxx,
            (f1.torque.y - gyro1.y) / cIyy,
            (f1.torque.z - gyro1.z) / cIzz,
        );
        const predAngVel = this.scene.angularVelocity.add(angAcc1.scale(halfDt));

        const f2 = computeForces(predVel, predAngVel);

        const avgForce  = f1.force.add(f2.force).scaleInPlace(0.5);
        const avgTorque = f1.torque.add(f2.torque).scaleInPlace(0.5);

        this.scene.velocity.addInPlace(avgForce.scale(dt / MASS));
        pos.addInPlace(this.scene.velocity.scale(dt));

        this.scene.groundSpeed = Math.hypot(this.scene.velocity.x, this.scene.velocity.z);

        this.scene._tmpAirVel.copyFrom(this.scene.velocity).subtractInPlace(windWorld);
        this.scene._lastTasMs = this.scene._tmpAirVel.length();
        const qDyn = 0.5 * Math.max(0, airDensity) * this.scene._lastTasMs * this.scene._lastTasMs;
        this.scene._lastIasMs = Math.sqrt(Math.max(0, 2 * qDyn / SEA_LEVEL_AIR_DENSITY_KG_PER_M3));

        const gravityAccel = 9.81;
        const verticalAccel = avgForce.y / MASS;
        const verticalGNow = (verticalAccel + gravityAccel) / gravityAccel;
        const totalGNow = Math.max(0, Math.hypot(avgForce.x, avgForce.y + MASS * gravityAccel, avgForce.z) / (MASS * gravityAccel));
        const gMeasured = Number.isFinite(totalGNow) && totalGNow > 0 ? totalGNow : Math.abs(verticalGNow);
        this.scene._gForce = this.scene._gForce + (gMeasured - this.scene._gForce) * G_FORCE_SMOOTHING;
        if (Number.isFinite(verticalGNow)) {
            this.scene._gForceVertical = this.scene._gForceVertical + (verticalGNow - this.scene._gForceVertical) * G_FORCE_SMOOTHING;
        }

        const Iw2   = new BABYLON.Vector3(cIxx * this.scene.angularVelocity.x, cIyy * this.scene.angularVelocity.y, cIzz * this.scene.angularVelocity.z);
        const gyro2 = BABYLON.Vector3.Cross(this.scene.angularVelocity, Iw2);
        const angAcc = new BABYLON.Vector3(
            (avgTorque.x - gyro2.x) / cIxx,
            (avgTorque.y - gyro2.y) / cIyy,
            (avgTorque.z - gyro2.z) / cIzz,
        );
        this.scene.angularVelocity.addInPlace(angAcc.scale(dt));
        this.scene.angularVelocity.scaleInPlace(Math.max(0, 1 - ANGULAR_DAMPING * dt));

        const omegaQuat = new BABYLON.Quaternion(
            this.scene.angularVelocity.x,
            this.scene.angularVelocity.y,
            this.scene.angularVelocity.z,
            0,
        );
        const qDot = orientation.multiply(omegaQuat);
        orientation.x += qDot.x * 0.5 * dt;
        orientation.y += qDot.y * 0.5 * dt;
        orientation.z += qDot.z * 0.5 * dt;
        orientation.w += qDot.w * 0.5 * dt;
        orientation.normalize();

        // ── Ground contact ───────────────────────────────────────────────────
        this.scene.isOnGround = anyGearOnGround;

        // Hard floor safety + crash detection
        const safetyFloor = groundLevel - 0.5;
        if (pos.y < safetyFloor) {
            if (this.scene.velocity.y < CRASH_VS_THRESHOLD_MS) {
                this.scene._triggerCrash('hard_impact');
                return;
            }
            if (!this.scene._safetyFloorSnapActive) {
                this.scene._safetyFloorSnapActive = true;
                console.warn(`[Terrain] Safety-floor snap start: pos.y=${pos.y.toFixed(1)}m -> ${safetyFloor.toFixed(1)}m, terrainY=${this.scene.terrainY.toFixed(1)}m, vy=${this.scene.velocity.y.toFixed(2)}m/s`);
            }
            pos.y = safetyFloor;
            if (this.scene.velocity.y < 0) this.scene.velocity.y = 0;
        } else if (this.scene._safetyFloorSnapActive) {
            this.scene._safetyFloorSnapActive = false;
            console.debug(`[Terrain] Safety-floor snap ended at pos.y=${pos.y.toFixed(1)}m, terrainY=${this.scene.terrainY.toFixed(1)}m`);
        }

        if (anyGearOnGround) {
            const speed = Math.sqrt(this.scene.velocity.x * this.scene.velocity.x + this.scene.velocity.z * this.scene.velocity.z);
            if (speed > 0.5) {
                const rollingFriction = cfg.rolling_friction;
                const brakeFriction = this.scene.brakesOn ? cfg.brake_friction : (this.scene.thrust < 0.05 ? cfg.idle_friction : 0);
                const frictionDecel = (rollingFriction + brakeFriction) * dt;
                const newSpeed = Math.max(0, speed - frictionDecel);
                const scale = newSpeed / speed;
                this.scene.velocity.x *= scale;
                this.scene.velocity.z *= scale;
            } else if (speed > 0 && speed <= 0.5 && this.scene.thrust < 0.1) {
                this.scene.velocity.x *= 0.95;
                this.scene.velocity.z *= 0.95;
                if (speed < 0.05) {
                    this.scene.velocity.x = 0;
                    this.scene.velocity.z = 0;
                }
            }

            const wm = this.scene.planeRoot.getWorldMatrix();
            const bodyRight = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();
            const worldUp = new BABYLON.Vector3(0, 1, 0);
            const rollAngle = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(bodyRight, worldUp))));
            const horizSpeed = Math.sqrt(this.scene.velocity.x * this.scene.velocity.x + this.scene.velocity.z * this.scene.velocity.z);
            if (horizSpeed > CRASH_GROUND_SPEED_MS) {
                const bodyFwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
                const pitchAngle = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(bodyFwd, worldUp))));
                const pitchAbsDeg = Math.abs(pitchAngle) * 180 / Math.PI;
                const rollAbsDeg = Math.abs(rollAngle) * 180 / Math.PI;
                if (pitchAbsDeg > CRASH_GROUND_ATTITUDE_DEG || rollAbsDeg > CRASH_GROUND_ATTITUDE_DEG) {
                    console.warn(`[Crash] Ground attitude crash: speed=${(horizSpeed * 1.94384).toFixed(1)}kt pitch=${pitchAbsDeg.toFixed(1)}deg roll=${rollAbsDeg.toFixed(1)}deg`);
                    this.scene._triggerCrash('ground_attitude');
                    return;
                }
            }
            const GROUND_ROLL_CORRECTION_RATE = 8.0;
            const correction = BABYLON.Quaternion.RotationAxis(
                BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize(),
                -rollAngle * Math.min(1, GROUND_ROLL_CORRECTION_RATE * dt),
            );
            orientation.copyFrom(correction.multiply(orientation));
            orientation.normalize();

            this.scene.angularVelocity.z *= 0.05;

            // Pitch damping at taxi speed: prevents the asymmetric tricycle-gear
            // torque (nose arm >> main arm) from accumulating into a nose-up
            // flip when the plane is parked/taxiing. Above takeoff roll speed
            // the elevator is free so rotation works normally.
            const taxiSpeed = Math.sqrt(this.scene.velocity.x * this.scene.velocity.x + this.scene.velocity.z * this.scene.velocity.z);
            if (taxiSpeed < 20) {
                this.scene.angularVelocity.x *= 0.4;
            }

            const GROUND_YAW_RATE = 1.2;
            const yawInput = this.scene.smoothedYaw;
            if (Math.abs(yawInput) > 0.01) {
                const steerAngle = yawInput * GROUND_YAW_RATE * dt;
                const yawCorrection = BABYLON.Quaternion.RotationAxis(worldUp, steerAngle);
                orientation.copyFrom(yawCorrection.multiply(orientation));
                orientation.normalize();

                const groundSpeed = Math.sqrt(this.scene.velocity.x * this.scene.velocity.x + this.scene.velocity.z * this.scene.velocity.z);
                if (groundSpeed > 0.5) {
                    const wm2 = this.scene.planeRoot.getWorldMatrix();
                    const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm2).normalize();
                    const fwdHorizLen = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
                    if (fwdHorizLen > 0.01) {
                        this.scene.velocity.x = (fwd.x / fwdHorizLen) * groundSpeed;
                        this.scene.velocity.z = (fwd.z / fwdHorizLen) * groundSpeed;
                    }
                }
            }
        }

        if (this.scene._cinematicActive) {
            const elapsed = performance.now() - this.scene._cinematicStartMs;
            const t = Math.max(0, Math.min(1, elapsed / CINEMATIC_DURATION_MS));
            this.scene.camera.target.copyFrom(pos);
            this.scene.camera.alpha = -Math.PI / 2 + t * Math.PI * 2;
            const capturedTarget = Number.isFinite(this.scene._cinematicTargetRadius) && this.scene._cinematicTargetRadius > 0
                ? this.scene._cinematicTargetRadius
                : 35;
            const targetRadius = Math.max(CAMERA_RADIUS_MIN_M, Math.min(CAMERA_RADIUS_MAX_M, capturedTarget));
            this.scene.camera.radius = CINEMATIC_INITIAL_RADIUS_M + (targetRadius - CINEMATIC_INITIAL_RADIUS_M) * t;
            this.scene.camera.beta = 1.20 + (1.50 - 1.20) * t;
        } else if (this.scene._cameraMode === CAMERA_MODE_CHASE) {
            this.scene.camera.target.copyFrom(pos);

            const wm = this.scene.planeRoot.getWorldMatrix();
            BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), wm, this.scene._tmpFwd);
            const targetAlpha = Math.atan2(-this.scene._tmpFwd.z, -this.scene._tmpFwd.x);
            let da = targetAlpha - this.scene.camera.alpha;
            da = ((da + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
            this.scene.camera.alpha += da * Math.min(1, 3 * dt);
        } else if (this.scene._cameraMode === CAMERA_MODE_COCKPIT) {
            const wm = this.scene.planeRoot.getWorldMatrix();
            const cockpitOffset = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, 0.8, 0.5), wm);
            this.scene.camera.target.copyFrom(cockpitOffset);
            BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), wm, this.scene._tmpFwd);
            const targetAlpha = Math.atan2(-this.scene._tmpFwd.z, -this.scene._tmpFwd.x);
            this.scene.camera.alpha = targetAlpha;
            this.scene.camera.lowerRadiusLimit = CAMERA_COCKPIT_LOWER_RADIUS_M;
            this.scene.camera.radius = CAMERA_COCKPIT_RADIUS_M;
        } else if (this.scene._cameraMode === CAMERA_MODE_FLYBY) {
            this.scene.camera.target.copyFrom(pos);
        } else if (this.scene._cameraMode === CAMERA_MODE_TOWER) {
            if (!this.scene._towerCameraSet) this.scene._captureTowerCameraPosition();
            this.scene.camera.target.copyFrom(pos);
            const dx = pos.x - this.scene._towerCameraPos.x;
            const dz = pos.z - this.scene._towerCameraPos.z;
            const horizDist = Math.sqrt(dx * dx + dz * dz);
            const dy = pos.y - this.scene._towerCameraPos.y;
            const targetAlpha = Math.atan2(-dz, -dx);
            const targetRadius = Math.max(TOWER_CAMERA_MIN_RADIUS_M, Math.sqrt(horizDist * horizDist + dy * dy));
            const beta = TOWER_CAMERA_BETA_RAD;
            let da = targetAlpha - this.scene.camera.alpha;
            da = ((da + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
            this.scene.camera.alpha += da * Math.min(1, 6 * dt);
            this.scene.camera.beta = beta;
            this.scene.camera.radius += (targetRadius - this.scene.camera.radius) * Math.min(1, 4 * dt);
        }

        this.scene._clampCameraAboveGround();

        if (this.scene.ground) {
            this.scene.ground.position.x = pos.x;
            this.scene.ground.position.z = pos.z;
        }
    }

    easyModeAssistEnabled(): boolean {
        return UiPreferences.get().easyMode && !this.scene.isOnGround;
    }

    easyModeStabilization(): { pitch: number; roll: number } {
        if (!this.scene.planeRoot || !this.scene.planeRoot.rotationQuaternion) return { pitch: 0, roll: 0 };
        BABYLON.Matrix.FromQuaternionToRef(this.scene.planeRoot.rotationQuaternion, this.scene._tmpRotMatrix);
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), this.scene._tmpRotMatrix, this.scene._tmpFwd);
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(1, 0, 0), this.scene._tmpRotMatrix, this.scene._tmpRight);
        const pitchAngle = Math.asin(Math.max(-1, Math.min(1, this.scene._tmpFwd.y)));
        const bankSin = Math.max(-1, Math.min(1, this.scene._tmpRight.y));
        const desiredPitch = 0.05;
        const pitchError = desiredPitch - pitchAngle;
        const rollError = -bankSin;
        const k = 0.6;
        return {
            pitch: Math.max(-0.6, Math.min(0.6, -pitchError * k)),
            roll:  Math.max(-0.5, Math.min(0.5, rollError * k)),
        };
    }

    easyModeAutoThrottle(dt: number): void {
        const tasKts = (Number.isFinite(this.scene._lastTasMs) ? this.scene._lastTasMs : this.scene.velocity.length()) * MS_TO_KT;
        const targetKts = UiPreferences.get().autoThrottleTargetKts;
        const errorKts = targetKts - tasKts;
        const k = 0.005;
        const delta = Math.max(-0.5, Math.min(0.5, errorKts * k));
        const rate = (delta > 0 ? this.scene.aircraftConfig.throttle_up_rate : this.scene.aircraftConfig.throttle_down_rate) || 0.4;
        this.scene.thrust = Math.max(0, Math.min(this.scene.aircraftConfig.afterburner_thrust_mult ?? 1.0, this.scene.thrust + delta * rate * dt));
    }

    toggleGear(): void {
        if (this.scene.gearState === GEAR_STATE_RETRACTING || this.scene.gearState === GEAR_STATE_EXTENDING) return;
        if (this.scene.gearState === GEAR_STATE_DOWN) {
            if (this.scene.isOnGround) {
                console.warn('[Gear] Cannot retract gear while on ground.');
                return;
            }
            this.scene.gearState = GEAR_STATE_RETRACTING;
            this.scene._gearTransitionStartMs = performance.now();
            for (const g of this.scene._gearUpAnimGroups) g.start(false, 1.0, g.from, g.to);
            console.log('[Gear] Retracting...');
        } else if (this.scene.gearState === GEAR_STATE_UP) {
            this.scene.gearState = GEAR_STATE_EXTENDING;
            this.scene._gearTransitionStartMs = performance.now();
            const downGroups = this.scene._gearDownAnimGroups.length > 0
                ? this.scene._gearDownAnimGroups
                : this.scene._gearUpAnimGroups;
            const hasExplicitDown = this.scene._gearDownAnimGroups.length > 0;
            for (const g of downGroups) {
                if (hasExplicitDown) {
                    g.start(false, 1.0, g.from, g.to);
                } else {
                    g.start(false, 1.0, g.to, g.from);
                }
            }
            console.log(`[Gear] Extending... (${hasExplicitDown ? 'explicit' : 'reversed gear_up'})`);
        }
    }

    updateGearState(): void {
        const now = performance.now();
        const transitioning = this.scene.gearState === GEAR_STATE_RETRACTING || this.scene.gearState === GEAR_STATE_EXTENDING;
        if (transitioning !== this.scene._lastGearTransitioning) {
            this.scene._lastGearTransitioning = transitioning;
            try { this.scene._flightAudio.setGearTransitioning(transitioning); } catch (_) { /* ignore */ }
        }
        if (this.scene.gearState === GEAR_STATE_RETRACTING) {
            const hasAnims = this.scene._gearUpAnimGroups.length > 0;
            const allDone = hasAnims && this.scene._gearUpAnimGroups.every((g: BABYLON.AnimationGroup) => !g.isPlaying);
            const timerDone = (now - this.scene._gearTransitionStartMs) > GEAR_INSTANT_TRANSITION_MS;
            if (allDone || (!hasAnims && timerDone)) {
                this.scene.gearState = GEAR_STATE_UP;
                console.log('[Gear] UP.');
            }
        } else if (this.scene.gearState === GEAR_STATE_EXTENDING) {
            const downGroups = this.scene._gearDownAnimGroups.length > 0
                ? this.scene._gearDownAnimGroups
                : this.scene._gearUpAnimGroups;
            const hasAnims = downGroups.length > 0;
            const allDone = hasAnims && downGroups.every((g: BABYLON.AnimationGroup) => !g.isPlaying);
            const timerDone = (now - this.scene._gearTransitionStartMs) > GEAR_INSTANT_TRANSITION_MS;
            if (allDone || (!hasAnims && timerDone)) {
                this.scene.gearState = GEAR_STATE_DOWN;
                console.log('[Gear] DOWN.');
            }
        }
    }

    getWindAtAltitude(altFt: number): { speedKt: number; dirDeg: number } {
        const altSafe = Number.isFinite(altFt) && altFt > 0 ? altFt : 0;
        const altGain = (altSafe / 1000) * WIND_ALTITUDE_GAIN_KT_PER_1000FT;
        const procSpeed = Math.min(WIND_MAX_SPEED_KT, WIND_DEFAULT_SPEED_KT + altGain);
        const procDir = WIND_DEFAULT_DIRECTION_DEG;

        const metar = this.scene._metarSurfaceWind;
        if (metar && Number.isFinite(metar.speedKt) && Number.isFinite(metar.dirDeg)) {
            const surfElev = Number.isFinite(this.scene._metarSurfaceElevFt) ? this.scene._metarSurfaceElevFt : 0;
            const t = Math.max(0, Math.min(1, (altSafe - surfElev) / WIND_METAR_BLEND_TOP_AGL_FT));
            const speed = metar.speedKt * (1 - t) + procSpeed * t;
            let delta = ((procDir - metar.dirDeg + 540) % 360) - 180;
            const dir = ((metar.dirDeg + delta * t) % 360 + 360) % 360;
            return { speedKt: speed, dirDeg: dir };
        }
        return { speedKt: procSpeed, dirDeg: procDir };
    }

    getWindVectorWorldRef(altMslFt: number, out: BABYLON.Vector3): void {
        const wind = this.scene._getWindAtAltitude(altMslFt);
        if (Number.isFinite(wind.speedKt) && wind.speedKt > 0) {
            const speedMs = wind.speedKt * KT_TO_MS;
            const dirRad = (wind.dirDeg * Math.PI) / 180;
            out.set(-Math.sin(dirRad) * speedMs, 0, -Math.cos(dirRad) * speedMs);
        } else {
            out.set(0, 0, 0);
        }
        out.x += this.scene._turbVec.x;
        out.y += this.scene._turbVec.y;
        out.z += this.scene._turbVec.z;
    }

    updateTurbulence(dt: number, aglM: number): void {
        const safeAgl = Number.isFinite(aglM) && aglM > 0 ? aglM : 0;
        let intensity: number;
        if (safeAgl >= TURB_FADE_AGL_M) {
            intensity = 0;
        } else if (safeAgl <= TURB_FULL_AGL_M) {
            intensity = 1.0;
        } else {
            intensity = 1.0 - (safeAgl - TURB_FULL_AGL_M) / (TURB_FADE_AGL_M - TURB_FULL_AGL_M);
        }
        const targetMag = TURB_MAX_GUST_MS * intensity;
        const stepDt = Number.isFinite(dt) && dt > 0 ? Math.min(0.2, dt) : 0.016;
        const alpha = Math.max(0, Math.min(1, stepDt / TURB_TAU_S));
        const r1 = (Math.random() + Math.random() + Math.random() - 1.5) * 0.67;
        const r2 = (Math.random() + Math.random() + Math.random() - 1.5) * 0.67;
        const r3 = (Math.random() + Math.random() + Math.random() - 1.5) * 0.67;
        this.scene._turbVec.x += (r1 * targetMag - this.scene._turbVec.x) * alpha;
        this.scene._turbVec.y += (r2 * targetMag * 0.5 - this.scene._turbVec.y) * alpha;
        this.scene._turbVec.z += (r3 * targetMag - this.scene._turbVec.z) * alpha;
        this.scene._turbTime += stepDt;
    }

}
