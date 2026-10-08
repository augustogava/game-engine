import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import * as NavMath from '../physics/NavMath.js';
import { TERRAIN_UNKNOWN_Y } from '../constants/index.js';

type AtcPhase = 'parked' | 'taxi' | 'takeoff' | 'climb' | 'cruise' | 'descent' | 'approach' | 'landing' | 'taxi_in';

const ATC_MIN_PHASE_DWELL_MS = 1500;
const ATC_MSG_DURATION_MS = 5000;
const ATC_TRAFFIC_HORIZONTAL_M = 5556;
const ATC_TRAFFIC_VERTICAL_M = 304.8;
const ATC_TRAFFIC_COOLDOWN_MS = 25000;
const ATC_NEAR_ARRIVAL_NM = 15;
const ATC_LANDING_CLEARANCE_NM = 5;
const ATC_TOAST_PREFIX = 'ATC: ';

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

    reset(): void {
        this._phase = null;
        this._pendingPhase = null;
        this._pendingSinceMs = 0;
        this._hasBeenAirborne = false;
        console.debug('[ATC] Phase tracking reset on spawn');
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

        if (aglFt < 600 && vsFpm < 50 && this._withinLandingClearance()) return 'landing';
        if (vsFpm > 300) return 'climb';
        if (vsFpm < -300) {
            return (aglFt < 4000 || this._nearArrival()) ? 'approach' : 'descent';
        }
        return 'cruise';
    }

    private _aglFt(): number {
        const py = Number(this.scene.planeRoot?.position?.y);
        if (!Number.isFinite(py)) return 0;
        const groundY = (Number.isFinite(this.scene.terrainY) && this.scene.terrainY !== TERRAIN_UNKNOWN_Y)
            ? this.scene.terrainY
            : 0;
        return Math.max(0, (py - groundY) * 3.28084);
    }

    private _nearArrival(): boolean {
        const distNm = this._distanceToArrivalNm(this.scene._activeFlightPlanNav);
        return distNm != null && distNm <= ATC_NEAR_ARRIVAL_NM;
    }

    private _withinLandingClearance(): boolean {
        const nav = this.scene._activeFlightPlanNav ?? this.scene._missionDestForNav?.() ?? null;
        const distNm = this._distanceToArrivalNm(nav);
        return distNm == null || distNm <= ATC_LANDING_CLEARANCE_NM;
    }

    private _distanceToArrivalNm(nav: any): number | null {
        if (!nav || !Number.isFinite(nav.arrival_lat) || !Number.isFinite(nav.arrival_lon)) return null;
        const here = this.scene._autopilotSystem?.apCurrentLatLon?.();
        if (!here) return null;
        const distNm = NavMath.haversineNm(here.lat, here.lon, Number(nav.arrival_lat), Number(nav.arrival_lon));
        return Number.isFinite(distNm) ? distNm : null;
    }

    private _windText(elevFt: number = 0): string {
        try {
            const elev = Number.isFinite(elevFt) ? elevFt : 0;
            const wind = this.scene._getWindAtAltitude(elev);
            if (wind && Number.isFinite(wind.dirDeg) && Number.isFinite(wind.speedKt)) {
                return `${wind.dirDeg.toFixed(0)}°/${wind.speedKt.toFixed(0)}kt`;
            }
        } catch { /* ignore */ }
        return I18n.t('atc.windCalm');
    }

    private _announce(phrase: string): void {
        if (!phrase) return;
        try { this.scene._showToast(`${ATC_TOAST_PREFIX}${phrase}`, ATC_MSG_DURATION_MS); } catch { /* ignore */ }
        try { this.scene._flightAudio?.speakAtc?.(phrase); } catch (err) { console.warn('[ATC] speakAtc failed:', err); }
    }

    private _emitPhaseMessage(phase: AtcPhase): void {
        const nav = this.scene._activeFlightPlanNav || null;
        const depRwy = nav?.dep_rwy_ident || '';
        const arrRwy = nav?.arr_rwy_ident || '';
        const arrIcao = nav?.arrival_icao || nav?.arr_icao || '';
        const depElevFt = Number(nav?.dep_elevation_ft);
        const arrElevFt = Number(nav?.arr_elevation_ft);
        let msg = '';
        switch (phase) {
            case 'taxi':
                msg = depRwy ? I18n.format('atc.taxi.rwy', { rwy: depRwy }) : I18n.t('atc.taxi');
                break;
            case 'takeoff':
                msg = depRwy
                    ? I18n.format('atc.takeoff.rwy', { rwy: depRwy, wind: this._windText(depElevFt) })
                    : I18n.format('atc.takeoff', { wind: this._windText(depElevFt) });
                break;
            case 'climb':
                msg = I18n.t('atc.climb');
                break;
            case 'cruise':
                msg = I18n.t('atc.cruise');
                break;
            case 'descent':
                msg = I18n.t('atc.descent');
                break;
            case 'approach': {
                const dest = arrIcao || I18n.t('atc.destination');
                msg = arrRwy
                    ? I18n.format('atc.approach.rwy', { dest, rwy: arrRwy })
                    : arrIcao ? I18n.format('atc.approach.dest', { dest }) : I18n.t('atc.approach');
                break;
            }
            case 'landing':
                msg = arrRwy
                    ? I18n.format('atc.landing.rwy', { rwy: arrRwy, wind: this._windText(arrElevFt) })
                    : I18n.format('atc.landing', { wind: this._windText(arrElevFt) });
                break;
            case 'taxi_in':
                msg = arrIcao ? I18n.format('atc.taxiIn.dest', { dest: arrIcao }) : I18n.t('atc.taxiIn');
                break;
            default:
                return;
        }
        if (msg) {
            this._announce(msg);
            console.debug(`[ATC] phase=${phase} -> ${msg}`);
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
            if (typeof remote.root.isEnabled === 'function' && !remote.root.isEnabled(false)) continue;
            const dxz = Math.hypot(pos.x - me.x, pos.z - me.z);
            const dy = Math.abs(pos.y - me.y);
            if (dxz < ATC_TRAFFIC_HORIZONTAL_M && dy < ATC_TRAFFIC_VERTICAL_M) {
                this._lastTrafficMs = now;
                this._announce(I18n.t('atc.traffic'));
                console.debug('[ATC] traffic advisory issued');
                return;
            }
        }
    }
}
