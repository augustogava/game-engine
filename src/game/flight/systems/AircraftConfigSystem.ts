import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import type { AircraftConfig } from '../types/index.js';
import { DEFAULT_AIRCRAFT_CONFIG } from '../types/index.js';
import { fetchAircraftConfig } from '../api/AircraftConfigApi.js';
import {
    ENGINE_TYPE_PISTON,
    ENGINE_TYPE_TURBOPROP,
    ENGINE_TYPE_TURBOJET,
    ENGINE_TYPE_TURBOFAN,
    ENGINE_TYPE_ELECTRIC,
    MACH_DRAG_RISE_COEF,
    JET_THRUST_MACH_LAPSE_COEF,
    JET_THRUST_MACH_MIN_FACTOR,
} from '../constants/index.js';
import { resolveHudImageUrl, HUD_IMAGE_PLACEHOLDER, hudImgOnError } from '../../api/hudImageUrl.js';
import { PREFLIGHT_AIRCRAFT_KEY } from '../../../preflight/PreflightController.js';
import {
    ENGINE_SOUND_TYPE_PISTON,
    ENGINE_SOUND_TYPE_TURBOPROP,
    ENGINE_SOUND_TYPE_TURBOJET,
    ENGINE_SOUND_TYPE_TURBOFAN,
    ENGINE_SOUND_TYPE_ELECTRIC,
} from '../../EngineSound.js';

export class AircraftConfigSystem {
    private readonly scene: any;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    applyAircraftConfig(cfg: AircraftConfig): void {
        const massRaw = Number(cfg.mass_kg);
        if (!Number.isFinite(massRaw) || massRaw <= 0) {
            console.error(`[AircraftConfig] Invalid mass_kg=${cfg.mass_kg} for ${cfg.code ?? 'unknown'}, using default ${DEFAULT_AIRCRAFT_CONFIG.mass_kg}`);
            cfg.mass_kg = DEFAULT_AIRCRAFT_CONFIG.mass_kg;
        }
        const thrustRaw = Number(cfg.max_thrust_n);
        if (!Number.isFinite(thrustRaw) || thrustRaw <= 0) {
            console.error(`[AircraftConfig] Invalid max_thrust_n=${cfg.max_thrust_n} for ${cfg.code ?? 'unknown'}, using default ${DEFAULT_AIRCRAFT_CONFIG.max_thrust_n}`);
            cfg.max_thrust_n = DEFAULT_AIRCRAFT_CONFIG.max_thrust_n;
        }
        const surfacesValid = Array.isArray(cfg.surfaces)
            && cfg.surfaces.length >= 4
            && cfg.surfaces.every((s: any) => Number.isFinite(Number(s?.area)) && Number(s.area) > 0);
        if (!surfacesValid) {
            console.error(`[AircraftConfig] Invalid surfaces for ${cfg.code ?? 'unknown'} (count=${Array.isArray(cfg.surfaces) ? cfg.surfaces.length : 'none'}), using default surfaces`);
            cfg.surfaces = DEFAULT_AIRCRAFT_CONFIG.surfaces;
        }
        if (cfg.engine_type == null) cfg.engine_type = DEFAULT_AIRCRAFT_CONFIG.engine_type;
        if (cfg.engine_count == null) cfg.engine_count = DEFAULT_AIRCRAFT_CONFIG.engine_count;
        if (cfg.fuel_capacity_kg == null) cfg.fuel_capacity_kg = DEFAULT_AIRCRAFT_CONFIG.fuel_capacity_kg;
        if (cfg.fuel_burn_rate_kg_per_s_max == null) cfg.fuel_burn_rate_kg_per_s_max = DEFAULT_AIRCRAFT_CONFIG.fuel_burn_rate_kg_per_s_max;
        if (cfg.fuel_burn_rate_kg_per_s_idle == null) cfg.fuel_burn_rate_kg_per_s_idle = DEFAULT_AIRCRAFT_CONFIG.fuel_burn_rate_kg_per_s_idle;
        if (cfg.flap_type == null) cfg.flap_type = DEFAULT_AIRCRAFT_CONFIG.flap_type;
        if (cfg.gear_spring_k == null) cfg.gear_spring_k = DEFAULT_AIRCRAFT_CONFIG.gear_spring_k;
        if (cfg.gear_damping_c == null) cfg.gear_damping_c = DEFAULT_AIRCRAFT_CONFIG.gear_damping_c;
        if (!cfg.gear_positions || !cfg.gear_positions.length) cfg.gear_positions = DEFAULT_AIRCRAFT_CONFIG.gear_positions;
        if (cfg.fuselage_side_area == null) cfg.fuselage_side_area = DEFAULT_AIRCRAFT_CONFIG.fuselage_side_area;
        if (cfg.fuselage_cn_beta == null) cfg.fuselage_cn_beta = DEFAULT_AIRCRAFT_CONFIG.fuselage_cn_beta;
        if (cfg.afterburner_thrust_mult == null) cfg.afterburner_thrust_mult = 1.0;
        if (cfg.afterburner_fuel_mult   == null) cfg.afterburner_fuel_mult   = 1.0;
        if (cfg.wave_drag_coef          == null) cfg.wave_drag_coef          = MACH_DRAG_RISE_COEF;
        if (cfg.wave_drag_decay_k       == null) cfg.wave_drag_decay_k       = 0.0;
        if (cfg.mach_lapse_coef         == null) cfg.mach_lapse_coef         = JET_THRUST_MACH_LAPSE_COEF;
        if (cfg.mach_lapse_floor        == null) cfg.mach_lapse_floor        = JET_THRUST_MACH_MIN_FACTOR;
        if (cfg.transonic_cd0_factor    == null) cfg.transonic_cd0_factor    = 1.0;
        if (cfg.gear_retractable        == null) {
            cfg.gear_retractable = cfg.engine_type === ENGINE_TYPE_TURBOFAN
                                || cfg.engine_type === ENGINE_TYPE_TURBOJET;
        } else {
            cfg.gear_retractable = cfg.gear_retractable === true || (cfg.gear_retractable as unknown as number) === 1;
        }
        this.scene.aircraftConfig = cfg;
        this._updateTouchGearButtonVisibility(cfg.gear_retractable === true);
        this.scene.FLAP_STEPS = cfg.flap_steps_json || DEFAULT_AIRCRAFT_CONFIG.flap_steps_json;
        this.scene.baseZeroLiftAoA = cfg.base_zero_lift_aoa;
        this.scene.fuelRemaining = cfg.fuel_capacity_kg;
        this.scene.gearCompression = new Array(cfg.gear_positions.length).fill(0);
        this.scene._updateEngineColumnsVisibility();
        try {
            this.scene._engineSound.setEngineType(this.mapEngineType(cfg.engine_type));
        } catch (err) {
            console.warn('[EngineSound] setEngineType failed:', err);
        }
    }

    private _updateTouchGearButtonVisibility(retractable: boolean): void {
        try {
            const gearBtn = document.getElementById('touch-gear') as HTMLElement | null;
            if (gearBtn) {
                gearBtn.style.display = retractable ? '' : 'none';
            }
        } catch (err) {
            console.warn('[AircraftConfig] touch gear visibility update failed:', err);
        }
    }

    mapEngineType(et: number): number {
        switch (et) {
            case ENGINE_TYPE_PISTON:    return ENGINE_SOUND_TYPE_PISTON;
            case ENGINE_TYPE_TURBOPROP: return ENGINE_SOUND_TYPE_TURBOPROP;
            case ENGINE_TYPE_TURBOJET:  return ENGINE_SOUND_TYPE_TURBOJET;
            case ENGINE_TYPE_ELECTRIC:  return ENGINE_SOUND_TYPE_ELECTRIC;
            default:
                return ENGINE_SOUND_TYPE_TURBOFAN;
        }
    }

    initSurfaces(): void {
        const cfg = this.scene.aircraftConfig;
        this.scene.surfaces = cfg.surfaces.map((s: any) => ({
            position:     new BABYLON.Vector3(s.pos_x, s.pos_y, s.pos_z),
            normal:       new BABYLON.Vector3(s.normal_x, s.normal_y, s.normal_z),
            area: s.area, chord: s.chord, aspectRatio: s.aspect_ratio,
            liftSlope: cfg.lift_slope, skinFriction: cfg.skin_friction,
            stallAlpha: cfg.stall_alpha_rad, zeroLiftAoA: s.zero_lift_aoa,
            oswaldE: cfg.oswald_efficiency, flapFraction: s.flap_fraction, controlInput: 0,
            zeroLiftCm: (s.zero_lift_cm != null && Number.isFinite(s.zero_lift_cm)) ? s.zero_lift_cm : 0,
        }));
        const leftWing = cfg.surfaces.find((s: any) => s.label === 'left_wing');
        if (leftWing) {
            this.scene.wingSpan = 2 * Math.sqrt(leftWing.area * leftWing.aspect_ratio);
        }
    }

    setupAircraftBtn(): void {
        if (!this.scene._aircraftBtnEl || !this.scene._aircraftPanelEl) return;
        const btn = this.scene._aircraftBtnEl;
        const panel = this.scene._aircraftPanelEl;

        btn.addEventListener('mouseenter', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.7)'; btn.style.boxShadow = '0 0 8px rgba(0,255,128,.2)'; } });
        btn.addEventListener('mouseleave', () => { if (panel.style.display === 'none') { btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none'; } });

        btn.addEventListener('click', () => {
            const visible = panel.style.display !== 'none';
            this.scene._closeAllPanels(visible ? null : panel);
            if (visible) {
                panel.style.display = 'none';
                btn.style.borderColor = 'rgba(80,255,160,.3)'; btn.style.boxShadow = 'none';
            } else {
                panel.style.display = 'block';
                btn.style.borderColor = 'rgba(80,255,160,.9)'; btn.style.boxShadow = '0 0 12px rgba(0,255,128,.35)';
                this.loadAircraftList();
            }
        });
    }

    async loadAircraftList(): Promise<void> {
        const listEl = document.getElementById('aircraft-list');
        if (!listEl) return;
        listEl.textContent = 'Loading...';

        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Login required</div>';
            return;
        }

        try {
            const ownedRes = await fetch('/api/user-aircrafts', { headers: { 'Authorization': `Bearer ${token}` } });
            const ownedData = ownedRes.ok ? await ownedRes.json() : { data: [] };
            const rows: any[] = Array.isArray(ownedData.data) ? ownedData.data : [];

            if (!rows.length) {
                listEl.innerHTML = '<div style="color:rgba(255,255,255,.4)">No aircraft available</div>';
                return;
            }

            const categories = ['LIGHT', 'TURBOPROP', 'JET', 'HEAVY JET', 'MILITARY'];
            let html = '';
            for (const row of rows) {
                const ac = row.aircraft || {};
                const aircraftId = row.aircraft_id ?? ac.id;
                const name = ac.name || `Aircraft #${aircraftId}`;
                const selected = row.is_selected === 1;
                const hasAccess = row.has_access === true;
                const proAccess = row.pro_access === true;
                const img = resolveHudImageUrl(row);
                const borderColor = selected ? 'rgba(80,255,160,.6)' : hasAccess ? 'rgba(80,255,160,.25)' : 'rgba(255,255,255,.1)';
                const bg = selected ? 'rgba(0,40,30,.6)' : 'rgba(0,20,15,.4)';
                const catLabel = categories[ac.category] || 'UNKNOWN';
                let actionBtn = '';
                if (selected) {
                    actionBtn = '<span style="color:#40ffaa;font-size:9px;letter-spacing:.1em">SELECTED</span>';
                } else if (hasAccess && row.is_owned) {
                    actionBtn = `<button data-select-aircraft="${aircraftId}" style="background:rgba(0,255,128,.15);border:1px solid rgba(80,255,160,.4);color:#40ffaa;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:9px;font-family:inherit">SELECT</button>`;
                } else if (hasAccess && proAccess) {
                    actionBtn = `<button data-select-aircraft="${aircraftId}" data-pro-only="1" style="background:rgba(0,255,128,.15);border:1px solid rgba(80,255,160,.4);color:#40ffaa;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:9px;font-family:inherit">SELECT (PRO)</button>`;
                } else {
                    actionBtn = `<button data-acquire-aircraft="1" style="background:rgba(255,200,0,.15);border:1px solid rgba(255,200,0,.4);color:#ffcc00;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:9px;font-family:inherit">LOJA</button>`;
                }

                html += `<div style="border:1px solid ${borderColor};border-radius:6px;padding:8px;margin-bottom:6px;background:${bg};display:flex;gap:8px;align-items:center">
                    <img data-hud-thumb src="${(img || HUD_IMAGE_PLACEHOLDER).replace(/"/g, '&quot;')}" alt="" width="56" height="40" style="width:56px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0"/>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:600;color:#fff;margin-bottom:2px">${name}${proAccess ? ' <span style="color:#ffcc55;font-size:8px">PRO</span>' : ''}</div>
                        <div style="font-size:9px;color:rgba(100,240,180,.5);letter-spacing:.08em">${catLabel}</div>
                    </div>
                    <div>${actionBtn}</div>
                </div>`;
            }
            listEl.innerHTML = html;
            listEl.querySelectorAll<HTMLImageElement>('img[data-hud-thumb]').forEach((imgEl) => {
                imgEl.addEventListener('error', () => hudImgOnError(imgEl), { once: true });
            });

            listEl.querySelectorAll('[data-select-aircraft]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    const target = e.currentTarget as HTMLElement;
                    const aircraftId = Number(target.getAttribute('data-select-aircraft'));
                    const proOnly = target.getAttribute('data-pro-only') === '1';
                    void this.switchAircraft(aircraftId, proOnly);
                });
            });

            listEl.querySelectorAll('[data-acquire-aircraft]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        window.open('https://simflightpro.com/aircrafts', '_blank', 'noopener,noreferrer');
                    } catch (err) {
                        console.error('[Aircraft] Failed to open store URL', err);
                    }
                });
            });
        } catch (err) {
            listEl.innerHTML = '<div style="color:rgba(255,100,100,.8)">Connection error</div>';
        }
    }

    async switchAircraft(aircraftId: number, proOnly = false): Promise<void> {
        const token = localStorage.getItem('auth_token') || '';
        if (!token) return;

        const switchToken = ++this.scene._aircraftConfigToken;
        try {
            if (!proOnly) {
                const selectResp = await fetch(`/api/user-aircrafts/${aircraftId}/select`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                if (!selectResp.ok) {
                    console.error('[Aircraft] Select failed');
                    return;
                }
            } else {
                localStorage.setItem(PREFLIGHT_AIRCRAFT_KEY, String(aircraftId));
            }

            const cfg = await fetchAircraftConfig(aircraftId);
            if (this.scene._aircraftConfigToken !== switchToken) {
                console.log(`[Aircraft] Discarding stale switch to id=${aircraftId} — newer switch in progress`);
                return;
            }
            this.applyAircraftConfig(cfg);
            this.initSurfaces();

            this.scene._loadedModelMeshes.forEach((m: BABYLON.AbstractMesh) => m.dispose());
            this.scene._loadedModelMeshes = [];
            this.scene._loadedAnimGroups.forEach((g: BABYLON.AnimationGroup) => g.dispose());
            this.scene._loadedAnimGroups = [];
            this.scene._propellerAnimGroup = null;
            this.scene._gearUpAnimGroups = [];
            this.scene._gearDownAnimGroups = [];
            this.scene._spoilerAnimGroups = [];
            const pivot = this.scene.planeRoot.getChildTransformNodes(true).find((n: BABYLON.TransformNode) => n.name === 'modelPivot');
            if (pivot) pivot.dispose();

            this.scene._loadAircraftModel(this.scene.scene);
            this.scene._spawnPlane(true);

            if (this.scene._aircraftPanelEl) this.scene._aircraftPanelEl.style.display = 'none';
            console.log(`[Aircraft] Switched to: ${cfg.name} (${cfg.code}) — reset to airport ground`);
            this.loadAircraftList();
        } catch (err) {
            console.error('[Aircraft] Switch error:', err);
        }
    }
}
