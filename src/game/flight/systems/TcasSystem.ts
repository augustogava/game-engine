import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import { TERRAIN_UNKNOWN_Y } from '../constants/index.js';

const TCAS_UPDATE_INTERVAL_S = 0.5;
const TCAS_TA_TAU_S = 40;
const TCAS_RA_TAU_S = 25;
const TCAS_TA_RANGE_M = 3700;
const TCAS_RA_RANGE_M = 1850;
const TCAS_TA_VERTICAL_M = 260;
const TCAS_RA_VERTICAL_M = 180;
const TCAS_TAU_VERTICAL_MULT = 1.5;
const TCAS_MIN_CLOSURE_MS = 0.5;
const TCAS_RA_MIN_AGL_M = 300;
const TCAS_ALERT_ID = 'tcas-alert';
const TCAS_ALERT_Z_INDEX = '25';
const TCAS_TA_COLOR = '#ffcc00';
const TCAS_RA_COLOR = '#ff4040';
const FT_TO_M = 0.3048;
const TCAS_AURAL_TRAFFIC = 'Traffic, traffic';
const TCAS_AURAL_CLIMB = 'Climb, climb';
const TCAS_AURAL_DESCEND = 'Descend, descend';
const TCAS_AURAL_CLEAR = 'Clear of conflict';

type TcasState = 'none' | 'ta' | 'ra-climb' | 'ra-descend';

interface IntruderSample {
    range: number;
    sampleMs: number;
}

export class TcasSystem {
    private readonly scene: any;
    private _accumS = 0;
    private _state: TcasState = 'none';
    private readonly _samples = new Map<string, IntruderSample>();
    private readonly _seen = new Set<string>();
    private readonly _tmpPos = new BABYLON.Vector3();
    private _alertEl: HTMLDivElement | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    update(dt: number): void {
        this._accumS += Number.isFinite(dt) ? Math.max(0, dt) : 0;
        if (this._accumS < TCAS_UPDATE_INTERVAL_S) return;
        this._accumS = 0;
        try {
            this.setState(this.evaluate());
        } catch (err) {
            console.warn('[TCAS] Evaluation failed:', err);
        }
    }

    private evaluate(): TcasState {
        const own = this.scene.planeRoot?.position as BABYLON.Vector3 | undefined;
        if (!own || this.scene.isOnGround === true || this.scene._paused === true) {
            this._samples.clear();
            return 'none';
        }
        const terrainY = Number(this.scene.terrainY);
        const aglM = Number.isFinite(terrainY) && terrainY !== TERRAIN_UNKNOWN_Y ? own.y - terrainY : Number.POSITIVE_INFINITY;
        const raAllowed = aglM >= TCAS_RA_MIN_AGL_M;
        const now = performance.now();
        this._seen.clear();

        let worst: TcasState = 'none';
        const consider = (id: string, pos: BABYLON.Vector3) => {
            this._seen.add(id);
            const range = Math.hypot(pos.x - own.x, pos.z - own.z);
            const vertical = Math.abs(pos.y - own.y);
            const prev = this._samples.get(id);
            let tau = Number.POSITIVE_INFINITY;
            if (prev) {
                const elapsedS = (now - prev.sampleMs) / 1000;
                const closure = elapsedS > 0 ? (prev.range - range) / elapsedS : 0;
                if (closure > TCAS_MIN_CLOSURE_MS) tau = range / closure;
            }
            this._samples.set(id, { range, sampleMs: now });

            const isRa = raAllowed && (
                (range < TCAS_RA_RANGE_M && vertical < TCAS_RA_VERTICAL_M)
                || (tau < TCAS_RA_TAU_S && vertical < TCAS_RA_VERTICAL_M * TCAS_TAU_VERTICAL_MULT)
            );
            if (isRa) {
                worst = pos.y > own.y ? 'ra-descend' : 'ra-climb';
                return;
            }
            const isTa = (range < TCAS_TA_RANGE_M && vertical < TCAS_TA_VERTICAL_M)
                || (tau < TCAS_TA_TAU_S && vertical < TCAS_TA_VERTICAL_M * TCAS_TAU_VERTICAL_MULT);
            if (isTa && worst === 'none') worst = 'ta';
        };

        const remotes = this.scene.remotePlayers;
        if (remotes && typeof remotes.forEach === 'function') {
            for (const [id, remote] of remotes) {
                const root = remote?.root;
                if (!root || (typeof root.isEnabled === 'function' && !root.isEnabled(false))) continue;
                consider(`mp:${id}`, root.position);
            }
        }
        const traffic = this.scene._liveTrafficSystem?.getTrafficEntries?.();
        if (Array.isArray(traffic) && typeof this.scene._latLonToLocalToRef === 'function') {
            for (const entry of traffic) {
                if (!Number.isFinite(entry?.lat) || !Number.isFinite(entry?.lon) || !Number.isFinite(entry?.altFt)) continue;
                this.scene._latLonToLocalToRef(entry.lat, entry.lon, entry.altFt * FT_TO_M, this._tmpPos);
                consider(`lt:${entry.fr24Id}`, this._tmpPos);
            }
        }
        for (const id of this._samples.keys()) {
            if (!this._seen.has(id)) this._samples.delete(id);
        }
        return worst;
    }

    private setState(next: TcasState): void {
        if (next === this._state) return;
        const previous = this._state;
        this._state = next;
        console.debug(`[TCAS] ${previous} -> ${next}`);
        let aural = '';
        if (next === 'ta' && previous === 'none') aural = TCAS_AURAL_TRAFFIC;
        else if (next === 'ra-climb') aural = TCAS_AURAL_CLIMB;
        else if (next === 'ra-descend') aural = TCAS_AURAL_DESCEND;
        else if ((previous === 'ra-climb' || previous === 'ra-descend') && (next === 'none' || next === 'ta')) aural = TCAS_AURAL_CLEAR;
        if (aural) {
            try { this.scene._flightAudio?.speakGpws?.(aural); } catch (err) { console.warn('[TCAS] Aural alert failed:', err); }
        }
        this.renderAlert();
    }

    private renderAlert(): void {
        if (this._state === 'none') {
            if (this._alertEl) this._alertEl.style.display = 'none';
            return;
        }
        if (!this._alertEl) {
            const el = document.createElement('div');
            el.id = TCAS_ALERT_ID;
            el.style.cssText = `position:fixed;top:18%;left:50%;transform:translateX(-50%);padding:6px 18px;font-family:'Orbitron',monospace;font-weight:700;font-size:18px;letter-spacing:.18em;background:rgba(0,0,0,.55);border:2px solid;border-radius:6px;pointer-events:none;z-index:${TCAS_ALERT_Z_INDEX}`;
            document.body.appendChild(el);
            this._alertEl = el;
        }
        const isRa = this._state === 'ra-climb' || this._state === 'ra-descend';
        const color = isRa ? TCAS_RA_COLOR : TCAS_TA_COLOR;
        this._alertEl.textContent = this._state === 'ra-climb'
            ? I18n.t('tcas.label.climb')
            : this._state === 'ra-descend' ? I18n.t('tcas.label.descend') : I18n.t('tcas.label.traffic');
        this._alertEl.style.color = color;
        this._alertEl.style.borderColor = color;
        this._alertEl.style.display = 'block';
    }

    dispose(): void {
        this._alertEl?.remove();
        this._alertEl = null;
        this._samples.clear();
        this._state = 'none';
    }
}
