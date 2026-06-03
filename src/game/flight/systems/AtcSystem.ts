import type { FlightSceneSimple } from '../../FlightSceneSimple.js';

type AtcPhase = 'parked' | 'taxi' | 'takeoff' | 'climb' | 'cruise' | 'descent' | 'approach' | 'landing' | 'taxi_in';

const ATC_MIN_PHASE_DWELL_MS = 1500;
const ATC_MSG_DURATION_MS = 5000;
const ATC_TRAFFIC_HORIZONTAL_M = 5556;
const ATC_TRAFFIC_VERTICAL_M = 304.8;
const ATC_TRAFFIC_COOLDOWN_MS = 25000;

export class AtcSystem {
    private readonly scene: any;
    private _phase: AtcPhase | null = null;
    private _pendingPhase: AtcPhase | null = null;
    private _pendingSinceMs = 0;
    private _hasBeenAirborne = false;
    private _lastTrafficMs = 0;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    update(_dt: number): void {
        try {
            if (!this.scene.planeRoot) return;
            const now = Date.now();
            const phase = this._detectPhase();
            if (phase && phase !== this._phase) {
                if (this._pendingPhase !== phase) {
                    this._pendingPhase = phase;
                    this._pendingSinceMs = now;
                } else if (now - this._pendingSinceMs >= ATC_MIN_PHASE_DWELL_MS) {
                    this._phase = phase;
                    this._pendingPhase = null;
                    this._emitPhaseMessage(phase);
                    if ((phase === 'takeoff' || phase === 'approach' || phase === 'landing')
                        && this.scene._missionSystem && typeof this.scene._missionSystem.refreshWeatherAtPosition === 'function') {
                        this.scene._missionSystem.refreshWeatherAtPosition(phase);
                    }
                }
            } else if (phase === this._phase) {
                this._pendingPhase = null;
            }
            this._checkTraffic(now);
        } catch (err) {
            console.warn('[ATC] update failed:', err);
        }
    }

    private _detectPhase(): AtcPhase | null {
        const iasKt = (Number(this.scene._lastIasMs) || 0) * 1.94384;
        const gsKt = (Number(this.scene.groundSpeed) || 0) * 1.94384;
        const onGround = this.scene.isOnGround === true;
        const vsFpm = (Number(this.scene.velocity?.y) || 0) * 196.85;
        const aglFt = this._aglFt();

        if (!onGround) this._hasBeenAirborne = true;

        if (onGround) {
            if (iasKt >= 40) return 'takeoff';
            if (gsKt >= 5) return this._hasBeenAirborne ? 'taxi_in' : 'taxi';
            return this._hasBeenAirborne ? 'taxi_in' : 'parked';
        }

        if (aglFt < 600 && vsFpm < 50) return 'landing';
        if (vsFpm > 300) return 'climb';
        if (vsFpm < -300) {
            return (aglFt < 4000 || this._nearArrival()) ? 'approach' : 'descent';
        }
        return 'cruise';
    }

    private _aglFt(): number {
        const py = Number(this.scene.planeRoot?.position?.y);
        if (!Number.isFinite(py)) return 0;
        const groundY = Number.isFinite(this.scene.terrainY) ? this.scene.terrainY : 0;
        return Math.max(0, (py - groundY) * 3.28084);
    }

    private _nearArrival(): boolean {
        const nav = this.scene._activeFlightPlanNav;
        if (!nav || !Number.isFinite(nav.arrival_lat) || !Number.isFinite(nav.arrival_lon)) return false;
        const here = this.scene._autopilotSystem?.apCurrentLatLon?.();
        if (!here) return false;
        const dx = nav.arrival_lat - here.lat;
        const dy = nav.arrival_lon - here.lon;
        return (dx * dx + dy * dy) < (0.25 * 0.25);
    }

    private _windText(): string {
        try {
            const wind = this.scene._getWindAtAltitude(0);
            if (wind && Number.isFinite(wind.dirDeg) && Number.isFinite(wind.speedKt)) {
                return `${wind.dirDeg.toFixed(0)}°/${wind.speedKt.toFixed(0)}kt`;
            }
        } catch { /* ignore */ }
        return 'calm';
    }

    private _emitPhaseMessage(phase: AtcPhase): void {
        const nav = this.scene._activeFlightPlanNav || null;
        const depRwy = nav?.dep_rwy_ident || '';
        const arrRwy = nav?.arr_rwy_ident || '';
        const arrIcao = nav?.arrival_icao || nav?.arr_icao || '';
        let msg = '';
        switch (phase) {
            case 'taxi':
                msg = depRwy ? `ATC: Taxi to runway ${depRwy}.` : 'ATC: Taxi to the active runway.';
                break;
            case 'takeoff':
                msg = depRwy ? `ATC: Runway ${depRwy}, cleared for takeoff. Wind ${this._windText()}.` : `ATC: Cleared for takeoff. Wind ${this._windText()}.`;
                break;
            case 'climb':
                msg = 'ATC: Climb approved. Contact Control.';
                break;
            case 'cruise':
                msg = 'ATC: Cruising. Radar contact.';
                break;
            case 'descent':
                msg = 'ATC: Descent approved.';
                break;
            case 'approach':
                msg = (arrIcao || arrRwy)
                    ? `ATC: Approach to ${arrIcao || 'destination'}${arrRwy ? ` runway ${arrRwy}` : ''}.`
                    : 'ATC: On approach.';
                break;
            case 'landing':
                msg = arrRwy ? `ATC: Runway ${arrRwy}, cleared to land. Wind ${this._windText()}.` : `ATC: Cleared to land. Wind ${this._windText()}.`;
                break;
            case 'taxi_in':
                msg = arrIcao ? `ATC: Landing confirmed. Taxi to the ramp. Welcome to ${arrIcao}.` : 'ATC: Landing confirmed. Taxi to the ramp.';
                break;
            default:
                return;
        }
        if (msg) {
            try { this.scene._showToast(msg, ATC_MSG_DURATION_MS); } catch { /* ignore */ }
            console.log(`[ATC] phase=${phase} -> ${msg}`);
        }
    }

    private _checkTraffic(now: number): void {
        if (this.scene.isOnGround === true) return;
        const players = this.scene.remotePlayers;
        if (!players || typeof players.forEach !== 'function' || players.size === 0) return;
        if (now - this._lastTrafficMs < ATC_TRAFFIC_COOLDOWN_MS) return;
        const me = this.scene.planeRoot?.position;
        if (!me) return;
        for (const [, remote] of players) {
            const pos = remote?.root?.position;
            if (!pos) continue;
            const dxz = Math.hypot(pos.x - me.x, pos.z - me.z);
            const dy = Math.abs(pos.y - me.y);
            if (dxz < ATC_TRAFFIC_HORIZONTAL_M && dy < ATC_TRAFFIC_VERTICAL_M) {
                this._lastTrafficMs = now;
                const msg = 'ATC: Traffic nearby, maintain visual separation.';
                try { this.scene._showToast(msg, ATC_MSG_DURATION_MS); } catch { /* ignore */ }
                console.log('[ATC] traffic advisory issued');
                return;
            }
        }
    }
}
