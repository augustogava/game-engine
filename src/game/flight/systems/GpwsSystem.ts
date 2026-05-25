import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { AudioCore } from '../../AudioCore.js';
import {
    MMO_FALLBACK_BY_CATEGORY,
    MMO_FALLBACK_DEFAULT,
    VNE_FALLBACK_MULT_OF_STALL,
    OVERSPEED_CLACKER_INTERVAL_MS,
    GPWS_PULL_UP_VS_FPM,
    GPWS_SINK_RATE_VS_FPM,
    GPWS_MIN_VS_FOR_CALLOUT_FPM,
    GPWS_CALLOUT_FT,
    GPWS_CALLOUT_REPEAT_MS,
    GPWS_ALERT_DURATION_MS,
    GPWS_ALERT_TYPE_PULL_UP,
    GPWS_ALERT_TYPE_SINK,
    GPWS_ALERT_TYPE_CALLOUT,
    GPWS_ALERT_TYPE_TOO_LOW_GEAR,
    GPWS_ALERT_TYPE_TOO_LOW_FLAPS,
    GPWS_ALERT_TYPE_TERRAIN_CLOSURE,
    GPWS_TOO_LOW_GEAR_AGL_FT,
    GPWS_TOO_LOW_FLAPS_AGL_FT,
    GPWS_TOO_LOW_MIN_AGL_FT,
    GPWS_TOO_LOW_MIN_SPEED_KTS,
    GPWS_TERRAIN_CLOSURE_FPM,
    GPWS_TERRAIN_CLOSURE_MAX_AGL_FT,
    GPWS_TERRAIN_CLOSURE_REPEAT_MS,
    GPWS_TOO_LOW_REPEAT_MS,
} from '../constants/index.js';

export class GpwsSystem {
    private readonly scene: any;
    private _lastAglFt: number = -1;
    private _lastAglMs: number = 0;
    private _lastTooLowGearMs: number = 0;
    private _lastTooLowFlapsMs: number = 0;
    private _lastTerrainClosureMs: number = 0;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    playAlertBeep(freq: number, durationMs: number, type: OscillatorType = 'sine', gain: number = 0.18): void {
        try {
            const ctx = AudioCore.getCtx();
            const bus = AudioCore.getAlertsBus();
            if (!ctx || !bus) return;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            const now = ctx.currentTime;
            const durS = Math.max(0.02, durationMs / 1000);
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);
            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(gain, now + 0.01);
            g.gain.setValueAtTime(gain, now + Math.max(0.02, durS - 0.04));
            g.gain.exponentialRampToValueAtTime(0.001, now + durS);
            osc.connect(g);
            g.connect(bus);
            osc.start(now);
            osc.stop(now + durS + 0.05);
        } catch (err) {
            console.warn('[Alert] beep failed:', err);
        }
    }

    resolveMmo(): number {
        const cfg = this.scene.aircraftConfig;
        if (cfg.mmo != null && Number.isFinite(cfg.mmo) && cfg.mmo > 0) return cfg.mmo;
        const fromCategory = MMO_FALLBACK_BY_CATEGORY[cfg.category];
        return (fromCategory != null && fromCategory > 0) ? fromCategory : MMO_FALLBACK_DEFAULT;
    }

    updateOverspeed(speedKtsIas: number, mach: number): void {
        const cfg = this.scene.aircraftConfig;
        const vne = (cfg.vne_kts && cfg.vne_kts > 0)
            ? cfg.vne_kts
            : Math.max(1, cfg.stall_speed_kts) * VNE_FALLBACK_MULT_OF_STALL;
        const mmo = this.resolveMmo();
        const overByIas = Number.isFinite(speedKtsIas) && speedKtsIas > vne;
        const overByMach = Number.isFinite(mach) && mach > mmo;
        const active = overByIas || overByMach;
        this.scene._overspeedActive = active;
        if (!active) return;
        const nowMs = performance.now();
        if (nowMs - this.scene._overspeedLastTickMs >= OVERSPEED_CLACKER_INTERVAL_MS) {
            this.scene._overspeedLastTickMs = nowMs;
            this.playAlertBeep(2200, 80, 'square', 0.22);
        }
    }

    updateGPWS(aglFt: number, vsFpm: number): void {
        const nowMs = performance.now();
        const onGround = aglFt < 8;
        if (onGround) {
            this.scene._gpwsLastCalloutFt = -1;
            this.scene._gpwsActiveAlert = 0;
            this._lastAglFt = aglFt;
            this._lastAglMs = nowMs;
            return;
        }

        if (this._lastAglFt >= 0 && this._lastAglMs > 0) {
            const dtSec = (nowMs - this._lastAglMs) / 1000;
            if (dtSec > 0.05 && dtSec < 2.0) {
                const aglRateFpm = ((aglFt - this._lastAglFt) / dtSec) * 60;
                if (aglRateFpm < GPWS_TERRAIN_CLOSURE_FPM
                    && aglFt < GPWS_TERRAIN_CLOSURE_MAX_AGL_FT
                    && (nowMs - this._lastTerrainClosureMs) > GPWS_TERRAIN_CLOSURE_REPEAT_MS) {
                    this._lastTerrainClosureMs = nowMs;
                    this.scene._gpwsActiveAlert = GPWS_ALERT_TYPE_TERRAIN_CLOSURE;
                    this.scene._gpwsAlertUntilMs = nowMs + GPWS_ALERT_DURATION_MS;
                    this.playAlertBeep(720, 220, 'square', 0.28);
                    this.playAlertBeep(540, 220, 'square', 0.28);
                    console.debug(`[GPWS] Terrain closure: aglRate=${aglRateFpm.toFixed(0)}fpm agl=${aglFt.toFixed(0)}ft`);
                }
            }
        }
        this._lastAglFt = aglFt;
        this._lastAglMs = nowMs;

        const speedKts = (this.scene._lastIasMs ?? 0) * 1.94384;
        if (speedKts > GPWS_TOO_LOW_MIN_SPEED_KTS && aglFt > GPWS_TOO_LOW_MIN_AGL_FT) {
            const gearRetractable = this.scene.aircraftConfig?.gear_retractable === true;
            const gearDownState = this.scene.gearState;
            const gearIsDown = gearDownState != null && gearDownState === 0;
            if (gearRetractable && !gearIsDown && aglFt < GPWS_TOO_LOW_GEAR_AGL_FT
                && (nowMs - this._lastTooLowGearMs) > GPWS_TOO_LOW_REPEAT_MS) {
                this._lastTooLowGearMs = nowMs;
                this.scene._gpwsActiveAlert = GPWS_ALERT_TYPE_TOO_LOW_GEAR;
                this.scene._gpwsAlertUntilMs = nowMs + GPWS_ALERT_DURATION_MS;
                this.playAlertBeep(620, 180, 'sine', 0.22);
                this.playAlertBeep(420, 180, 'sine', 0.22);
                console.debug(`[GPWS] Too low gear: agl=${aglFt.toFixed(0)}ft`);
            }
            const flapDeg = this.scene.FLAP_STEPS?.[this.scene.flapIndex ?? 0] ?? 0;
            if (flapDeg <= 0 && aglFt < GPWS_TOO_LOW_FLAPS_AGL_FT
                && (nowMs - this._lastTooLowFlapsMs) > GPWS_TOO_LOW_REPEAT_MS) {
                this._lastTooLowFlapsMs = nowMs;
                this.scene._gpwsActiveAlert = GPWS_ALERT_TYPE_TOO_LOW_FLAPS;
                this.scene._gpwsAlertUntilMs = nowMs + GPWS_ALERT_DURATION_MS;
                this.playAlertBeep(560, 180, 'sine', 0.22);
                this.playAlertBeep(380, 180, 'sine', 0.22);
                console.debug(`[GPWS] Too low flaps: agl=${aglFt.toFixed(0)}ft`);
            }
        }

        if (vsFpm < GPWS_PULL_UP_VS_FPM && aglFt < 1500) {
            if (this.scene._gpwsActiveAlert !== GPWS_ALERT_TYPE_PULL_UP || nowMs > this.scene._gpwsAlertUntilMs) {
                this.scene._gpwsActiveAlert = GPWS_ALERT_TYPE_PULL_UP;
                this.scene._gpwsAlertUntilMs = nowMs + GPWS_ALERT_DURATION_MS;
                this.playAlertBeep(880, 200, 'square', 0.30);
                this.playAlertBeep(660, 200, 'square', 0.30);
            }
            return;
        }
        if (vsFpm < GPWS_SINK_RATE_VS_FPM && aglFt < 2500) {
            if (this.scene._gpwsActiveAlert !== GPWS_ALERT_TYPE_SINK || nowMs > this.scene._gpwsAlertUntilMs) {
                this.scene._gpwsActiveAlert = GPWS_ALERT_TYPE_SINK;
                this.scene._gpwsAlertUntilMs = nowMs + GPWS_ALERT_DURATION_MS;
                this.playAlertBeep(440, 250, 'sine', 0.20);
            }
            return;
        }
        if (vsFpm > GPWS_MIN_VS_FOR_CALLOUT_FPM) {
            return;
        }
        for (const ft of GPWS_CALLOUT_FT) {
            const crossed = aglFt <= ft && (this.scene._gpwsLastCalloutFt > ft || this.scene._gpwsLastCalloutFt < 0);
            const expired = (nowMs - this.scene._gpwsLastCalloutMs) > GPWS_CALLOUT_REPEAT_MS;
            if (crossed && expired) {
                this.scene._gpwsLastCalloutFt = ft;
                this.scene._gpwsLastCalloutMs = nowMs;
                this.scene._gpwsActiveAlert = GPWS_ALERT_TYPE_CALLOUT;
                this.scene._gpwsAlertUntilMs = nowMs + 500;
                const freq = 600 + Math.max(0, 500 - ft) * 2;
                this.playAlertBeep(freq, 140, 'triangle', 0.18);
                break;
            }
        }
    }
}
