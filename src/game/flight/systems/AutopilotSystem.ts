import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import * as NavMath from '../physics/NavMath.js';
import {
    MIN_GS_FOR_ETE_MS,
    AP_HDG_MAX_BANK_DEG,
    AP_HDG_BANK_GAIN,
    AP_HDG_ROLL_RATE_GAIN,
    AP_ALT_PITCH_MAX,
    AP_VS_PITCH_MAX,
    AP_VS_PITCH_GAIN,
    AP_VS_DEFAULT_FPM,
    AP_PITCH_RATE_DAMP_GAIN,
    AP_PITCH_RATE_MAX_RAD_PER_S,
    AP_ALT_TO_VS_GAIN_FPM_PER_FT,
    AP_ALT_MAX_VS_FPM,
    AP_NAV_MAX_INTERCEPT_DEG,
    AP_NAV_XTE_DEG_PER_NM,
    AP_APR_GLIDESLOPE_DEG,
    AP_APR_MIN_ALT_FT,
    AP_INPUT_DISENGAGE_THRESHOLD,
    AUTOTRIM_DEADBAND,
    AUTOTRIM_RATE_PER_S,
    AUTOTRIM_MAX,
    MAGVAR_C0,
    MAGVAR_C_LON,
    MAGVAR_C_LAT,
    MAGVAR_C_LON2,
    MAGVAR_C_LAT2,
    MAGVAR_C_LONLAT,
    METERS_PER_DEG_LAT,
} from '../constants/index.js';

export class AutopilotSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    apCurrentNavTarget(): { lat: number; lon: number } | null {
        const wpts = this.scene._missionWaypoints;
        const wpIdx = this.scene._missionCurrentWpIndex;
        if (wpts && wpts.length > 0 && wpIdx >= 0 && wpIdx < wpts.length) {
            const wp = wpts[wpIdx];
            if (Number.isFinite(Number(wp.latitude)) && Number.isFinite(Number(wp.longitude))) {
                return { lat: Number(wp.latitude), lon: Number(wp.longitude) };
            }
        }
        const fp = this.scene._activeFlightPlanNav ?? this.scene._missionDestForNav();
        if (fp && Number.isFinite(fp.arrival_lat) && Number.isFinite(fp.arrival_lon)) {
            return { lat: fp.arrival_lat, lon: fp.arrival_lon };
        }
        return null;
    }

    magneticVariationDeg(lat: number, lon: number): number {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 0;
        const safeLat = Math.max(-85, Math.min(85, lat));
        let lonAdj = lon;
        while (lonAdj > 180) lonAdj -= 360;
        while (lonAdj < -180) lonAdj += 360;
        const variation = MAGVAR_C0
            + MAGVAR_C_LON  * lonAdj
            + MAGVAR_C_LAT  * safeLat
            + MAGVAR_C_LON2 * lonAdj * lonAdj
            + MAGVAR_C_LAT2 * safeLat * safeLat
            + MAGVAR_C_LONLAT * lonAdj * safeLat;
        return Math.max(-30, Math.min(30, variation));
    }

    apCurrentLatLon(): { lat: number; lon: number } | null {
        if (!this.scene.planeRoot) return null;
        const cosOriginLat = Math.cos(this.scene.originLat * Math.PI / 180);
        const eastM = this.scene.planeRoot.position.x;
        const northM = -this.scene.planeRoot.position.z;
        const lat = this.scene.originLat + (northM / METERS_PER_DEG_LAT);
        const lon = this.scene.originLon + (eastM / (METERS_PER_DEG_LAT * Math.max(cosOriginLat, 0.01)));
        return { lat, lon };
    }

    updateAutopilot(dt: number): void {
        if (!this.scene._autopilotMaster || !this.scene.planeRoot || !this.scene.planeRoot.rotationQuaternion) return;
        const stepDt = Math.max(0.001, Math.min(0.1, dt));
        const wm = this.scene.planeRoot.getWorldMatrix();
        const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm);
        const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm);
        const curHdgDeg = ((Math.atan2(fwd.x, fwd.z) * 180 / Math.PI) + 360) % 360;

        if ((this.scene._autopilotNavHold || this.scene._autopilotAprHold) && this.scene.surfaces.length >= 4) {
            const target = this.apCurrentNavTarget();
            const here = this.apCurrentLatLon();
            if (target && here) {
                const desiredBrg = NavMath.initialBearingDeg(here.lat, here.lon, target.lat, target.lon);
                const trackDeg = (this.scene.groundSpeed > MIN_GS_FOR_ETE_MS
                    && Number.isFinite(this.scene.velocity.x) && Number.isFinite(this.scene.velocity.z))
                    ? ((Math.atan2(this.scene.velocity.x, this.scene.velocity.z) * 180 / Math.PI) + 360) % 360
                    : curHdgDeg;
                const trackErrDeg = ((desiredBrg - trackDeg + 540) % 360) - 180;
                const distNm = NavMath.haversineNm(here.lat, here.lon, target.lat, target.lon);
                const xteNm = Math.sin(trackErrDeg * Math.PI / 180) * Math.max(0.1, distNm);
                const intercept = Math.max(
                    -AP_NAV_MAX_INTERCEPT_DEG,
                    Math.min(AP_NAV_MAX_INTERCEPT_DEG, xteNm * AP_NAV_XTE_DEG_PER_NM + trackErrDeg * 0.5),
                );
                this.scene._autopilotTargetHdgDeg = ((desiredBrg + intercept) + 360) % 360;
            }
        }

        if ((this.scene._autopilotHdgHold || this.scene._autopilotNavHold || this.scene._autopilotAprHold) && this.scene.surfaces.length >= 2) {
            const delta = ((this.scene._autopilotTargetHdgDeg - curHdgDeg + 540) % 360) - 180;
            const targetBank = Math.max(-AP_HDG_MAX_BANK_DEG, Math.min(AP_HDG_MAX_BANK_DEG, delta * AP_HDG_BANK_GAIN * AP_HDG_MAX_BANK_DEG));
            const sinBank = Math.max(-1, Math.min(1, right.y));
            const curBankDeg = -Math.asin(sinBank) * 180 / Math.PI;
            const rollErr = targetBank - curBankDeg;
            const rollCmd = Math.max(-0.7, Math.min(0.7, rollErr * AP_HDG_ROLL_RATE_GAIN / AP_HDG_MAX_BANK_DEG));
            this.scene.surfaces[0].controlInput =  rollCmd;
            this.scene.surfaces[1].controlInput = -rollCmd;
        }

        const curPitchSin = Math.max(-1, Math.min(1, fwd.y));
        const curPitchRad = Math.asin(curPitchSin);
        const lastPitchRad = this.scene._autopilotLastPitchRad;
        let pitchRateRadPerS = 0;
        if (Number.isFinite(lastPitchRad)) {
            const raw = (curPitchRad - lastPitchRad) / stepDt;
            pitchRateRadPerS = Math.max(-AP_PITCH_RATE_MAX_RAD_PER_S, Math.min(AP_PITCH_RATE_MAX_RAD_PER_S, raw));
        }
        this.scene._autopilotLastPitchRad = curPitchRad;

        const vsFpmNow = this.scene.velocity.y * 196.85;
        let targetVsFpm: number | null = null;
        let pitchMax = AP_VS_PITCH_MAX;

        if (this.scene._autopilotAprHold && this.scene.surfaces.length >= 3) {
            const target = this.apCurrentNavTarget();
            const here = this.apCurrentLatLon();
            if (target && here) {
                const distNm = NavMath.haversineNm(here.lat, here.lon, target.lat, target.lon);
                const distFt = distNm * 6076.12;
                const glideAltFt = Math.max(AP_APR_MIN_ALT_FT, distFt * Math.tan(AP_APR_GLIDESLOPE_DEG * Math.PI / 180));
                const altMslFt = Math.max(0, (this.scene.refAlt + this.scene.planeRoot.position.y)) * 3.28084;
                const errFt = glideAltFt - altMslFt;
                targetVsFpm = Math.max(-AP_ALT_MAX_VS_FPM, Math.min(AP_ALT_MAX_VS_FPM, errFt * AP_ALT_TO_VS_GAIN_FPM_PER_FT));
                pitchMax = AP_ALT_PITCH_MAX;
            }
        } else if (this.scene._autopilotVsHold && this.scene.surfaces.length >= 3) {
            targetVsFpm = this.scene._autopilotTargetVsFpm;
            pitchMax = AP_VS_PITCH_MAX;
        } else if (this.scene._autopilotAltHold && this.scene.surfaces.length >= 3) {
            const altMslFt = Math.max(0, (this.scene.refAlt + this.scene.planeRoot.position.y)) * 3.28084;
            const errFt = this.scene._autopilotTargetAltFt - altMslFt;
            targetVsFpm = Math.max(-AP_ALT_MAX_VS_FPM, Math.min(AP_ALT_MAX_VS_FPM, errFt * AP_ALT_TO_VS_GAIN_FPM_PER_FT));
            pitchMax = AP_ALT_PITCH_MAX;
        }

        if (targetVsFpm !== null) {
            const errFpm = targetVsFpm - vsFpmNow;
            const pitchCmd = Math.max(-pitchMax, Math.min(pitchMax,
                errFpm * AP_VS_PITCH_GAIN - pitchRateRadPerS * AP_PITCH_RATE_DAMP_GAIN));
            this.scene.surfaces[2].controlInput = -pitchCmd;
        }

        if ((this.scene._autopilotAltHold || this.scene._autopilotVsHold || this.scene._autopilotAprHold) && this.scene.surfaces.length >= 3) {
            const elevatorCmd = this.scene.surfaces[2].controlInput;
            if (Math.abs(elevatorCmd) > AUTOTRIM_DEADBAND) {
                const trimDir = -Math.sign(elevatorCmd);
                this.scene.trimPitch = Math.max(-AUTOTRIM_MAX, Math.min(AUTOTRIM_MAX,
                    this.scene.trimPitch + trimDir * AUTOTRIM_RATE_PER_S * stepDt));
            }
        }
    }

    engageAutopilotMaster(): void {
        this.scene._autopilotMaster = !this.scene._autopilotMaster;
        if (this.scene._autopilotMaster) {
            if (!this.scene._autopilotHdgHold) this.engageAutopilotHdgHold(true);
            if (!this.scene._autopilotAltHold) this.engageAutopilotAltHold(true);
            console.log('[AP] Master ON');
        } else {
            this.scene._autopilotHdgHold = false;
            this.scene._autopilotAltHold = false;
            this.scene._autopilotVsHold = false;
            this.scene._autopilotNavHold = false;
            this.scene._autopilotAprHold = false;
            console.log('[AP] Master OFF');
        }
    }

    engageAutopilotHdgHold(forceOn: boolean = false): void {
        const newState = forceOn ? true : !this.scene._autopilotHdgHold;
        this.scene._autopilotHdgHold = newState;
        if (newState) {
            this.scene._autopilotNavHold = false;
            this.scene._autopilotAprHold = false;
            if (this.scene.planeRoot) {
                const wm = this.scene.planeRoot.getWorldMatrix();
                const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm);
                this.scene._autopilotTargetHdgDeg = ((Math.atan2(fwd.x, fwd.z) * 180 / Math.PI) + 360) % 360;
            }
        }
    }

    engageAutopilotAltHold(forceOn: boolean = false): void {
        const newState = forceOn ? true : !this.scene._autopilotAltHold;
        this.scene._autopilotAltHold = newState;
        if (newState) {
            this.scene._autopilotVsHold = false;
            this.scene._autopilotAprHold = false;
            this.scene._autopilotLastPitchRad = Number.NaN;
            if (this.scene.planeRoot) {
                this.scene._autopilotTargetAltFt = Math.max(0, (this.scene.refAlt + this.scene.planeRoot.position.y)) * 3.28084;
            }
        }
    }

    engageAutopilotVsHold(forceOn: boolean = false): void {
        const newState = forceOn ? true : !this.scene._autopilotVsHold;
        this.scene._autopilotVsHold = newState;
        if (newState) {
            this.scene._autopilotAltHold = false;
            this.scene._autopilotAprHold = false;
            this.scene._autopilotLastPitchRad = Number.NaN;
            const vsFpm = this.scene.velocity.y * 196.85;
            this.scene._autopilotTargetVsFpm = Math.round(vsFpm / 100) * 100;
            if (Math.abs(this.scene._autopilotTargetVsFpm) < 50) {
                this.scene._autopilotTargetVsFpm = vsFpm >= 0 ? AP_VS_DEFAULT_FPM : -AP_VS_DEFAULT_FPM;
            }
        }
    }

    engageAutopilotNavHold(forceOn: boolean = false): void {
        const newState = forceOn ? true : !this.scene._autopilotNavHold;
        if (newState && !this.apCurrentNavTarget()) {
            console.warn('[AP] NAV armed but no waypoint/destination available');
            return;
        }
        this.scene._autopilotNavHold = newState;
        if (newState) {
            this.scene._autopilotHdgHold = false;
            this.scene._autopilotAprHold = false;
        }
    }

    engageAutopilotAprHold(forceOn: boolean = false): void {
        const newState = forceOn ? true : !this.scene._autopilotAprHold;
        if (newState && !this.apCurrentNavTarget()) {
            console.warn('[AP] APR armed but no destination available');
            return;
        }
        this.scene._autopilotAprHold = newState;
        if (newState) {
            this.scene._autopilotHdgHold = false;
            this.scene._autopilotAltHold = false;
            this.scene._autopilotVsHold = false;
            this.scene._autopilotNavHold = false;
            this.scene._autopilotLastPitchRad = Number.NaN;
        }
    }

    adjustAutopilotVsTarget(deltaFpm: number): void {
        this.scene._autopilotTargetVsFpm = Math.max(-3000, Math.min(3000, this.scene._autopilotTargetVsFpm + deltaFpm));
    }

    adjustAutopilotAltTarget(deltaFt: number): void {
        this.scene._autopilotTargetAltFt = Math.max(0, Math.min(50000, this.scene._autopilotTargetAltFt + deltaFt));
    }

    adjustAutopilotHdgTarget(deltaDeg: number): void {
        this.scene._autopilotTargetHdgDeg = (this.scene._autopilotTargetHdgDeg + deltaDeg + 360) % 360;
    }

    wireAutopilotPanel(): void {
        const wire = (id: string, fn: () => void) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fn();
                this.scene._cockpitClick();
            });
        };
        wire('ap-btn-ap',  () => this.engageAutopilotMaster());
        wire('ap-btn-hdg', () => { if (!this.scene._autopilotMaster) this.engageAutopilotMaster(); this.engageAutopilotHdgHold(); });
        wire('ap-btn-alt', () => { if (!this.scene._autopilotMaster) this.engageAutopilotMaster(); this.engageAutopilotAltHold(); });
        wire('ap-btn-vs',  () => { if (!this.scene._autopilotMaster) this.engageAutopilotMaster(); this.engageAutopilotVsHold(); });
        wire('ap-btn-nav', () => { if (!this.scene._autopilotMaster) this.engageAutopilotMaster(); this.engageAutopilotNavHold(); });
        wire('ap-btn-apr', () => { if (!this.scene._autopilotMaster) this.engageAutopilotMaster(); this.engageAutopilotAprHold(); });

        this.wireApTargetEdit('ap-tgt-hdg', 'hdg');
        this.wireApTargetEdit('ap-tgt-alt', 'alt');
        this.wireApTargetEdit('ap-tgt-vs',  'vs');

        this.wireApKnob('ap-knob-hdg', 'hdg');
        this.wireApKnob('ap-knob-alt', 'alt');
        this.wireApKnob('ap-knob-vs',  'vs');
    }

    wireApKnob(knobId: string, field: 'hdg' | 'alt' | 'vs'): void {
        const knob = document.getElementById(knobId);
        if (!knob) return;

        const KNOB_DEG_PER_STEP = 12;
        const KNOB_DRAG_MOVE_THRESHOLD_DEG = 4;

        const stepFor = (big: boolean): number => {
            if (field === 'hdg') return big ? 10 : 1;
            if (field === 'alt') return big ? 1000 : 100;
            return big ? 500 : 100;
        };

        const apply = (dir: 1 | -1, big: boolean) => {
            const inc = dir * stepFor(big);
            if (field === 'hdg')      this.adjustAutopilotHdgTarget(inc);
            else if (field === 'alt') this.adjustAutopilotAltTarget(inc);
            else                       this.adjustAutopilotVsTarget(inc);
            this.updateAutopilotPanel();
        };

        const angleFrom = (clientX: number, clientY: number): number => {
            const rect = knob.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top  + rect.height / 2;
            return Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI;
        };

        let dragging = false;
        let lastAngle = 0;
        let accumDeg = 0;
        let movedSignificantly = false;
        let dragShift = false;

        const onMove = (e: MouseEvent) => {
            if (!dragging) return;
            const a = angleFrom(e.clientX, e.clientY);
            let delta = a - lastAngle;
            if (delta > 180) delta -= 360;
            else if (delta < -180) delta += 360;
            lastAngle = a;
            accumDeg += delta;
            if (Math.abs(accumDeg) > KNOB_DRAG_MOVE_THRESHOLD_DEG) movedSignificantly = true;
            while (accumDeg >= KNOB_DEG_PER_STEP)  { apply(1,  dragShift); accumDeg -= KNOB_DEG_PER_STEP; }
            while (accumDeg <= -KNOB_DEG_PER_STEP) { apply(-1, dragShift); accumDeg += KNOB_DEG_PER_STEP; }
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (movedSignificantly) {
                try { this.scene._cockpitClick(); } catch { /* ignore */ }
            }
        };

        knob.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            dragging = true;
            movedSignificantly = false;
            dragShift = e.shiftKey;
            lastAngle = angleFrom(e.clientX, e.clientY);
            accumDeg = 0;
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });

        knob.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!Number.isFinite(e.deltaY) || e.deltaY === 0) return;
            const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
            apply(dir, e.shiftKey);
            try { this.scene._cockpitClick(); } catch { /* ignore */ }
        }, { passive: false });

        knob.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (movedSignificantly) { movedSignificantly = false; return; }
            const rect = knob.getBoundingClientRect();
            if (rect.height <= 0) return;
            const upper = (e.clientY - rect.top) < rect.height * 0.5;
            apply(upper ? 1 : -1, e.shiftKey);
            try { this.scene._cockpitClick(); } catch { /* ignore */ }
        });

        knob.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            apply(-1, e.shiftKey);
            try { this.scene._cockpitClick(); } catch { /* ignore */ }
        });
    }

    wireApTargetEdit(spanId: string, field: 'hdg' | 'alt' | 'vs'): void {
        const span = document.getElementById(spanId);
        if (!span) return;
        span.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.scene._apEditingField !== null) return;
            this.beginApTargetEdit(span, field);
        });
    }

    beginApTargetEdit(span: HTMLElement, field: 'hdg' | 'alt' | 'vs'): void {
        let currentValue: number;
        let minVal: number;
        let maxVal: number;
        let stepHint: string;
        if (field === 'hdg') {
            currentValue = Math.round(this.scene._autopilotTargetHdgDeg);
            minVal = 0; maxVal = 359; stepHint = '1';
        } else if (field === 'alt') {
            currentValue = Math.round(this.scene._autopilotTargetAltFt);
            minVal = 0; maxVal = 50000; stepHint = '100';
        } else {
            currentValue = Math.round(this.scene._autopilotTargetVsFpm);
            minVal = -3000; maxVal = 3000; stepHint = '100';
        }

        this.scene._apEditingField = field;
        const originalHtml = span.textContent || '';
        const input = document.createElement('input');
        input.type = 'number';
        input.value = String(currentValue);
        input.min = String(minVal);
        input.max = String(maxVal);
        input.step = stepHint;
        input.style.cssText = 'width:54px;font:inherit;background:rgba(0,16,32,.9);color:#9cf;border:1px solid #40c0ff;border-radius:2px;padding:0 2px;text-align:center;outline:none';

        span.textContent = '';
        span.appendChild(input);
        try { input.focus(); input.select(); } catch { /* ignore */ }

        const commit = (apply: boolean) => {
            if (this.scene._apEditingField !== field) return;
            this.scene._apEditingField = null;
            input.removeEventListener('keydown', onKey);
            input.removeEventListener('blur', onBlur);
            if (apply) {
                const raw = parseFloat(input.value);
                if (Number.isFinite(raw)) {
                    const clamped = Math.max(minVal, Math.min(maxVal, raw));
                    if (field === 'hdg') {
                        this.scene._autopilotTargetHdgDeg = ((Math.round(clamped) % 360) + 360) % 360;
                        console.log(`[AP] Target HDG set to ${Math.round(this.scene._autopilotTargetHdgDeg)}`);
                    } else if (field === 'alt') {
                        this.scene._autopilotTargetAltFt = Math.round(clamped);
                        console.log(`[AP] Target ALT set to ${Math.round(this.scene._autopilotTargetAltFt)} ft`);
                    } else {
                        this.scene._autopilotTargetVsFpm = Math.round(clamped);
                        console.log(`[AP] Target VS set to ${Math.round(this.scene._autopilotTargetVsFpm)} fpm`);
                    }
                } else {
                    console.warn(`[AP] Invalid input for ${field}: "${input.value}"`);
                }
            }
            try { if (input.parentNode === span) span.removeChild(input); } catch { /* ignore */ }
            span.textContent = originalHtml;
            this.updateAutopilotPanel();
        };

        const onKey = (ev: KeyboardEvent) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
            else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
        };
        const onBlur = () => commit(true);
        input.addEventListener('keydown', onKey);
        input.addEventListener('blur', onBlur);
    }

    updateAutopilotPanel(): void {
        const setBtn = (id: string, active: boolean) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.toggle('active', active);
        };
        setBtn('ap-btn-ap',  this.scene._autopilotMaster);
        setBtn('ap-btn-hdg', this.scene._autopilotHdgHold);
        setBtn('ap-btn-alt', this.scene._autopilotAltHold);
        setBtn('ap-btn-vs',  this.scene._autopilotVsHold);
        setBtn('ap-btn-nav', this.scene._autopilotNavHold);
        setBtn('ap-btn-apr', this.scene._autopilotAprHold);

        const setKnobRotation = (knobId: string, rotDeg: number) => {
            const k = document.getElementById(knobId);
            if (!k) return;
            const inner = k.querySelector('.ap-knob-inner') as HTMLElement | null;
            if (inner) inner.style.transform = `rotate(${rotDeg}deg)`;
        };
        setKnobRotation('ap-knob-hdg', ((this.scene._autopilotTargetHdgDeg % 360) + 360) % 360);
        setKnobRotation('ap-knob-alt', (((this.scene._autopilotTargetAltFt % 1000) + 1000) % 1000) * 0.36);
        const vsRot = Math.max(-180, Math.min(180, (this.scene._autopilotTargetVsFpm / 3000) * 180));
        setKnobRotation('ap-knob-vs',  vsRot);

        const hdgEl = document.getElementById('ap-tgt-hdg');
        const altEl = document.getElementById('ap-tgt-alt');
        const vsEl  = document.getElementById('ap-tgt-vs');
        if (hdgEl && this.scene._apEditingField !== 'hdg') hdgEl.textContent = String(Math.round(this.scene._autopilotTargetHdgDeg)).padStart(3, '0');
        if (altEl && this.scene._apEditingField !== 'alt') altEl.textContent = String(Math.round(this.scene._autopilotTargetAltFt)).padStart(5, '0');
        if (vsEl  && this.scene._apEditingField !== 'vs')  vsEl.textContent  = `${this.scene._autopilotTargetVsFpm >= 0 ? '+' : ''}${Math.round(this.scene._autopilotTargetVsFpm)}`;
    }

    maybeDisengageAutopilotByInput(): void {
        if (!this.scene._autopilotMaster) return;
        const stick = Math.max(
            Math.abs(this.scene.smoothedPitch),
            Math.abs(this.scene.smoothedRoll),
            Math.abs(this.scene.smoothedYaw),
        );
        if (stick > AP_INPUT_DISENGAGE_THRESHOLD) {
            this.scene._autopilotMaster = false;
            this.scene._autopilotHdgHold = false;
            this.scene._autopilotAltHold = false;
            this.scene._autopilotVsHold = false;
            this.scene._autopilotNavHold = false;
            this.scene._autopilotAprHold = false;
            console.log('[AP] Disengaged by stick input');
        }
    }
}
