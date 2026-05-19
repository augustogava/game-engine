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
} from '../constants/index.js';

export class GpwsSystem {
    private readonly scene: any;

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
            return;
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
