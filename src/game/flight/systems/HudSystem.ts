import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import { InputBindings, DEFAULT_KEY_BINDINGS, ACTION_LABELS, type ActionId, type KeyBindings } from '../../InputBindings.js';
import { UiPreferences } from '../../UiPreferences.js';
import { AudioCore } from '../../AudioCore.js';
import * as CONST from '../constants/index.js';

const PFD_ATTITUDE_CENTER_Y_FRAC = 0.5;
const PFD_ATTITUDE_FILL_ALPHA = 0;
const HSI_CANVAS_CENTER_Y_PX = 108;
const PFD_ATTITUDE_RADIUS_PX = 110;
const PFD_TAPE_HALF_HEIGHT_PX = 96;
const PFD_TAPE_WIDTH_PX = 50;
const PFD_TAPE_EDGE_GAP_PX = 6;
const PFD_TAPE_BG_COLOR = 'rgba(0,0,0,0.5)';
const PFD_TAPE_READOUT_BG_COLOR = 'rgba(0,0,0,0.85)';
const PFD_TAPE_READOUT_H_PX = 28;
const PFD_TAPE_READOUT_W_PX = 50;
const PFD_TAPE_NOTCH_PX = 7;
const PFD_SPD_PX_PER_KT = 1.5;
const PFD_SPD_MINOR_STEP_KT = 10;
const PFD_SPD_MAJOR_STEP_KT = 20;
const PFD_ALT_PX_PER_FT = 0.2;
const PFD_ALT_MINOR_STEP_FT = 100;
const PFD_ALT_MAJOR_STEP_FT = 500;
const PFD_VNE_COLOR = '#ff5555';
const PFD_VFE_COLOR = '#79e7ff';
const PFD_PIXELS_PER_PITCH_DEG = 3.4;
const PFD_LADDER_MIN_PITCH_DEG = -90;
const PFD_LADDER_MAX_PITCH_DEG = 90;
const PFD_LADDER_STEP_DEG = 5;
const PFD_LADDER_HALF_WIDTH_PX = 26;
const PFD_LADDER_HALF_WIDTH_MINOR_PX = 14;
const PFD_LADDER_DASH_PATTERN_PX: number[] = [6, 5];
const PFD_SKY_COLOR = '#2e6db4';
const PFD_GROUND_COLOR = '#6b4a2a';
const PFD_FULL_GROUND_COLOR = '#2d5c2d';
const PFD_PRIMARY_COLOR = 'rgba(255,255,255,0.95)';
const PFD_PRIMARY_COLOR_DIM = 'rgba(255,255,255,0.7)';
const PFD_SELECTED_COLOR = '#79e7ff';
const PFD_BUG_COLOR = '#e070e0';
const PFD_BANK_RADIUS_PX = 96;
const PFD_HSI_RADIUS_PX = 80;
const PFD_AP_ACTIVE_COLOR = '#40ffaa';
const PFD_FD_COLOR = '#e83bd6';
const PFD_AIRCRAFT_SYMBOL_COLOR = '#ffd200';
const PFD_AIRCRAFT_SYMBOL_OUTLINE = '#1a1a1a';
const PFD_FD_BAR_HALF_W_PX = 40;
const PFD_FD_BAR_RISE_PX = 11;
const PFD_FD_MAX_PITCH_OFFSET_PX = 60;
const PFD_FD_MAX_BANK_ERR_DEG = 30;
const PFD_CRS_COLOR = '#19d519';
const PFD_CDI_FULLSCALE_NM = 2.0;
const PFD_GS_FULLSCALE_FT = 120;
const PFD_RA_DISPLAY_MAX_FT = 2500;
const PFD_MACH_DISPLAY_MIN = 0.40;
const PFD_FULL_ATT_CY_PX = 175;
const PFD_FULL_HSI_CY_PX = 410;
const PFD_FULL_FMA_H_PX = 20;
const PFD_FULL_LADDER_LIMIT_PX = 92;
const PFD_FULL_VSI_WIDTH_PX = 16;
const PFD_FULL_TAPE_BALL_GAP_PX = 16;
const PFD_FULL_VSI_MAX_FPM = 2000;
const PFD_FULL_VSI_HALF_PX = 96;
const PFD_MS_TO_FPM = 196.850394;
const PFD_SLIP_PX_PER_DEG = 2.6;
const PFD_SLIP_MAX_PX = 16;
const PFD_TREND_SECONDS = 6;
const PFD_TREND_FILTER_TAU_S = 0.8;
const PFD_TREND_COLOR = '#e070e0';
const PFD_BAND_LOWSPEED_COLOR = '#ff3030';
const PFD_BAND_GREEN_COLOR = '#19c219';
const PFD_BAND_WHITE_COLOR = '#f0f0f0';
const PFD_BARBER_POLE_RED = '#ff3030';
const PFD_BARBER_POLE_WHITE = '#ffffff';
const PFD_BARBER_POLE_STRIPE_PX = 4;
const PFD_BEARING_PTR_COLOR = '#79e7ff';
const PFD_HSI_TERM_RANGE_NM = 30;
const PFD_HSI_DISK_COLOR = 'rgba(0,0,0,0.45)';
const PFD_NAV_BLOCK_LABEL_COLOR = 'rgba(255,255,255,0.55)';

const _C: any = CONST;
const {
    CAMERA_MODE_TOWER,
    MS_TO_KT,
    COLORBLIND_NONE,
    ENGINE_TYPE_PISTON, ENGINE_TYPE_TURBOPROP,
    CLOUD_DENSITY_MULT_LOW, CLOUD_DENSITY_MULT_MEDIUM, CLOUD_DENSITY_MULT_HIGH, CLOUD_DENSITY_MULT_ULTRA,
    MIN_GS_FOR_ETE_MS,
    HDG_DELTA_GREEN_DEG, HDG_DELTA_AMBER_DEG,
    XTE_INDICATOR_MAX_NM,
    AP_APR_GLIDESLOPE_DEG,
    ALT_BAND_GREEN_FT, ALT_BAND_AMBER_FT,
    GEAR_STATE_DOWN, GEAR_STATE_UP, GEAR_STATE_RETRACTING, GEAR_STATE_EXTENDING,
    GROUND_Y,
    ON_GROUND_AGL_M,
    STALL_AOA_WARNING_FRACTION, STALL_WARNING_MIN_AGL_M,
    ISA_TROPOPAUSE_M, ISA_TROPOPAUSE_TEMP_K, ISA_SEA_LEVEL_TEMP_K, ISA_LAPSE_RATE_K_PER_M,
    SPECIFIC_HEAT_RATIO_AIR, GAS_CONSTANT_AIR_J_PER_KG_K,
    OVER_G_THRESHOLD,
    G_BLACKOUT_ONSET_G, G_BLACKOUT_FULL_G,
    G_REDOUT_ONSET_G, G_REDOUT_FULL_G,
    G_STRESS_RISE_PER_S, G_STRESS_RECOVER_PER_S,
    G_STRESS_MAX_OPACITY,
} = CONST as any;

export class HudSystem {
    private readonly scene: any;
    private _cachedSpdMarksHalfH: number = 0;
    private _cachedAltMarksHalfH: number = 0;
    private _resizeHandler: (() => void) | null = null;

    private _lastChecklistHtml: string = '';

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
        this._resizeHandler = () => {
            this._cachedSpdMarksHalfH = 0;
            this._cachedAltMarksHalfH = 0;
        };
        try { window.addEventListener('resize', this._resizeHandler); } catch (_) { /* ignore */ }
    }

    disposeResizeListener(): void {
        if (this._resizeHandler) {
            try { window.removeEventListener('resize', this._resizeHandler); } catch (_) { /* ignore */ }
            this._resizeHandler = null;
        }
    }

    updateEngineColumnsVisibility(): void {
        const engineCount = Math.max(0, this.scene.aircraftConfig?.engine_count ?? 1);
        const eng1Col = document.getElementById('hud-engine1-col');
        if (eng1Col) eng1Col.style.display = engineCount >= 1 ? '' : 'none';
        if (this.scene.hudEngine2Col) this.scene.hudEngine2Col.style.display = engineCount >= 2 ? '' : 'none';
        if (this.scene.hudEngine3Col) this.scene.hudEngine3Col.style.display = engineCount >= 3 ? '' : 'none';
        if (this.scene.hudEngine4Col) this.scene.hudEngine4Col.style.display = engineCount >= 4 ? '' : 'none';
    }

    showHudWarningOverlay(text: string, visible: boolean): void {
        if (!this.scene.hudWarning) return;
        if (visible) {
            this.scene.hudWarning.textContent = text;
            this.scene.hudWarning.style.display = 'block';
        } else if (this.scene.hudWarning.textContent === text) {
            this.scene.hudWarning.style.display = 'none';
        }
    }

    convertSpeedKts(kts: number): { value: number; unit: string } {
        const units = UiPreferences.get().unitSystem;
        if (units === _C.UNIT_SYSTEM_METRIC) {
            return { value: Math.round(kts * 1.852), unit: I18n.t('units.kmh') };
        }
        return { value: Math.round(kts), unit: I18n.t('units.kts') };
    }

    convertAltitudeFt(ft: number): { value: number; unit: string } {
        const units = UiPreferences.get().unitSystem;
        if (units === _C.UNIT_SYSTEM_METRIC) {
            return { value: Math.round(ft * 0.3048), unit: I18n.t('units.m') };
        }
        return { value: Math.round(ft), unit: I18n.t('units.ft') };
    }

    initUxSettings(): void {
        const prefs = UiPreferences.get();
        const setVal = (id: string, val: string | number) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = String(val); };
        const setSel = (id: string, val: string) => { const el = document.getElementById(id) as HTMLSelectElement | null; if (el) el.value = val; };
        const setCheck = (id: string, val: boolean) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.checked = val; };
        setSel('ux-units', prefs.unitSystem);
        setSel('ux-language', prefs.language);
        setCheck('ux-mouse-yoke', prefs.mouseYoke);
        setCheck('ux-easy-mode', prefs.easyMode);
        setVal('ux-auto-thr', prefs.autoThrottleTargetKts);
        setVal('ux-expo', Math.round(prefs.desktopExpo * 100) / 100);
        setVal('ux-deadzone', Math.round(prefs.desktopDeadzone * 100));
        setVal('ux-sensitivity', Math.round(prefs.desktopSensitivity * 100));
        setCheck('ux-gamepad', prefs.gamepadEnabled);
        setCheck('ux-checklist', prefs.showChecklist);
        setCheck('ux-fps-overlay', prefs.showFpsOverlay);
        setCheck('ux-latency-overlay', prefs.showLatencyOverlay);
        setCheck('ux-g-effects', prefs.showGEffects);
        setCheck('ux-g-limiter', prefs.gLimiterEnabled);
        setSel('ux-colorblind', prefs.colorblindMode);
        setVal('ux-font-scale', Math.round(prefs.fontScale * 100));
        setCheck('ux-contrast', prefs.contrastBoost);

        const updTextLabel = (id: string, label: string) => { const el = document.getElementById(id); if (el) el.textContent = label; };
        const handleNumber = (id: string, key: keyof ReturnType<typeof UiPreferences.get>, scale: number, suffix: string) => {
            const el = document.getElementById(id) as HTMLInputElement | null;
            const valEl = document.getElementById(`${id}-val`);
            if (!el) return;
            const update = () => {
                const v = (parseFloat(el.value) || 0) * scale;
                if (valEl) valEl.textContent = `${el.value}${suffix}`;
                UiPreferences.set({ [key]: v } as Partial<ReturnType<typeof UiPreferences.get>>);
            };
            el.addEventListener('input', update);
            const init = (parseFloat(el.value) || 0);
            updTextLabel(`${id}-val`, `${init}${suffix}`);
        };
        handleNumber('ux-expo', 'desktopExpo', 1, 'x');
        handleNumber('ux-deadzone', 'desktopDeadzone', 0.01, '%');
        handleNumber('ux-sensitivity', 'desktopSensitivity', 0.01, '%');
        handleNumber('ux-font-scale', 'fontScale', 0.01, '%');

        const autoThrEl = document.getElementById('ux-auto-thr') as HTMLInputElement | null;
        if (autoThrEl) {
            autoThrEl.addEventListener('input', () => {
                UiPreferences.set({ autoThrottleTargetKts: parseInt(autoThrEl.value, 10) || 250 });
            });
        }

        const handleCheck = (id: string, key: keyof ReturnType<typeof UiPreferences.get>) => {
            const el = document.getElementById(id) as HTMLInputElement | null;
            if (!el) return;
            el.addEventListener('change', () => {
                UiPreferences.set({ [key]: el.checked } as Partial<ReturnType<typeof UiPreferences.get>>);
            });
        };
        handleCheck('ux-mouse-yoke', 'mouseYoke');
        handleCheck('ux-easy-mode', 'easyMode');
        handleCheck('ux-gamepad', 'gamepadEnabled');
        handleCheck('ux-checklist', 'showChecklist');
        handleCheck('ux-fps-overlay', 'showFpsOverlay');
        handleCheck('ux-latency-overlay', 'showLatencyOverlay');
        handleCheck('ux-g-effects', 'showGEffects');
        handleCheck('ux-g-limiter', 'gLimiterEnabled');
        handleCheck('ux-contrast', 'contrastBoost');

        const handleSelect = (id: string, key: keyof ReturnType<typeof UiPreferences.get>) => {
            const el = document.getElementById(id) as HTMLSelectElement | null;
            if (!el) return;
            el.addEventListener('change', () => {
                UiPreferences.set({ [key]: el.value } as Partial<ReturnType<typeof UiPreferences.get>>);
            });
        };
        handleSelect('ux-units', 'unitSystem');
        handleSelect('ux-language', 'language');
        handleSelect('ux-colorblind', 'colorblindMode');

        UiPreferences.onChange((p) => {
            this.scene._setMouseYoke(p.mouseYoke);
            this.scene._gLimiterEnabled = p.gLimiterEnabled === true;
        });
        this.scene._gLimiterEnabled = prefs.gLimiterEnabled === true;

        // const replayBtn = document.getElementById('ux-replay-btn');
        // if (replayBtn) replayBtn.addEventListener('click', () => this.scene._toggleReplay());
        const towerBtn = document.getElementById('ux-tower-btn');
        if (towerBtn) towerBtn.addEventListener('click', () => {
            this.scene._setCameraMode(CAMERA_MODE_TOWER);
            this.scene._captureTowerCameraPosition();
        });
        const screenshotBtn = document.getElementById('ux-screenshot-btn');
        if (screenshotBtn) screenshotBtn.addEventListener('click', () => this.scene._takeScreenshot());
        const resetKeysBtn = document.getElementById('ux-keys-reset');
        if (resetKeysBtn) resetKeysBtn.addEventListener('click', () => InputBindings.reset());

        this.scene._buildKeymapList();
        this._initGamepadMapping();

        const uxHeader = document.getElementById('ux-header');
        const uxBody = document.getElementById('ux-settings');
        if (uxHeader && uxBody) {
            uxHeader.addEventListener('click', () => {
                const visible = uxBody.style.display !== 'none';
                uxBody.style.display = visible ? 'none' : '';
                const h3 = uxHeader.querySelector('h3');
                if (h3) h3.textContent = visible ? 'UX \u25B8' : 'UX \u25BE';
            });
        }

        const ctrlHeader = document.getElementById('controls-header');
        const ctrlBody = document.getElementById('controls-settings');
        if (ctrlHeader && ctrlBody) {
            ctrlHeader.addEventListener('click', () => {
                const visible = ctrlBody.style.display !== 'none';
                ctrlBody.style.display = visible ? 'none' : '';
                const h3 = ctrlHeader.querySelector('h3');
                if (h3) h3.textContent = visible ? 'CONTROLS \u25B8' : 'CONTROLS \u25BE';
            });
        }
    }

    private _gpLiveRafId = 0;

    private static readonly GP_PRESETS_KEY = 'flight_gp_presets_v1';

    private _gpFieldKeys() {
        return [
            'gpAxisAileron', 'gpAxisElevator', 'gpAxisRudder', 'gpAxisThrottle',
            'gpThrottleInverted', 'gpInvertAileron', 'gpInvertElevator', 'gpInvertRudder',
            'gpBtnGear', 'gpBtnBrake', 'gpBtnFlapDown', 'gpBtnFlapUp',
            'gpBtnCamera', 'gpBtnRespawn', 'gpBtnPause',
        ] as const;
    }

    private _loadGpPresets(): Record<string, Record<string, unknown>> {
        try {
            const raw = localStorage.getItem(HudSystem.GP_PRESETS_KEY);
            if (!raw) return {};
            return JSON.parse(raw) as Record<string, Record<string, unknown>>;
        } catch { return {}; }
    }

    private _saveGpPresets(presets: Record<string, Record<string, unknown>>): void {
        try { localStorage.setItem(HudSystem.GP_PRESETS_KEY, JSON.stringify(presets)); } catch { /* ignore */ }
    }

    private _refreshGpUi(gpAxisFields: { id: string; key: string }[], gpBtnFields: { id: string; key: string }[], invFields: { id: string; key: string }[]): void {
        const fresh = UiPreferences.get() as unknown as Record<string, unknown>;
        for (const f of gpAxisFields) {
            const el = document.getElementById(f.id) as HTMLInputElement | null;
            if (el) el.value = String(fresh[f.key] ?? 0);
        }
        for (const f of gpBtnFields) {
            const el = document.getElementById(f.id) as HTMLInputElement | null;
            if (el) el.value = String(fresh[f.key] ?? 0);
        }
        for (const f of invFields) {
            const el = document.getElementById(f.id) as HTMLInputElement | null;
            if (el) el.checked = !!fresh[f.key];
        }
    }

    private _initGamepadMapping(): void {
        const prefs = UiPreferences.get();

        const gpAxisFields = [
            { id: 'gp-axis-aileron', key: 'gpAxisAileron' },
            { id: 'gp-axis-elevator', key: 'gpAxisElevator' },
            { id: 'gp-axis-rudder', key: 'gpAxisRudder' },
            { id: 'gp-axis-throttle', key: 'gpAxisThrottle' },
        ];
        for (const f of gpAxisFields) {
            const el = document.getElementById(f.id) as HTMLInputElement | null;
            if (!el) continue;
            el.value = String((prefs as unknown as Record<string, unknown>)[f.key] ?? 0);
            el.addEventListener('change', () => {
                UiPreferences.set({ [f.key]: parseInt(el.value, 10) || 0 } as Partial<ReturnType<typeof UiPreferences.get>>);
            });
        }

        const gpBtnFields = [
            { id: 'gp-btn-gear', key: 'gpBtnGear' },
            { id: 'gp-btn-brake', key: 'gpBtnBrake' },
            { id: 'gp-btn-flapdown', key: 'gpBtnFlapDown' },
            { id: 'gp-btn-flapup', key: 'gpBtnFlapUp' },
            { id: 'gp-btn-camera', key: 'gpBtnCamera' },
            { id: 'gp-btn-respawn', key: 'gpBtnRespawn' },
            { id: 'gp-btn-pause', key: 'gpBtnPause' },
        ];
        for (const f of gpBtnFields) {
            const el = document.getElementById(f.id) as HTMLInputElement | null;
            if (!el) continue;
            el.value = String((prefs as unknown as Record<string, unknown>)[f.key] ?? 0);
            el.addEventListener('change', () => {
                UiPreferences.set({ [f.key]: parseInt(el.value, 10) || 0 } as Partial<ReturnType<typeof UiPreferences.get>>);
            });
        }

        const invFields = [
            { id: 'gp-inv-aileron', key: 'gpInvertAileron' },
            { id: 'gp-inv-elevator', key: 'gpInvertElevator' },
            { id: 'gp-inv-rudder', key: 'gpInvertRudder' },
            { id: 'gp-throttle-inv', key: 'gpThrottleInverted' },
        ];
        for (const f of invFields) {
            const el = document.getElementById(f.id) as HTMLInputElement | null;
            if (!el) continue;
            el.checked = !!(prefs as unknown as Record<string, unknown>)[f.key];
            el.addEventListener('change', () => {
                UiPreferences.set({ [f.key]: el.checked } as Partial<ReturnType<typeof UiPreferences.get>>);
            });
        }

        const resetBtn = document.getElementById('gp-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                UiPreferences.set({
                    gpAxisAileron: 0, gpAxisElevator: 1, gpAxisRudder: 5, gpAxisThrottle: 2,
                    gpThrottleInverted: true,
                    gpInvertAileron: false, gpInvertElevator: true, gpInvertRudder: true,
                    gpBtnGear: 0, gpBtnBrake: 1, gpBtnFlapDown: 2, gpBtnFlapUp: 3,
                    gpBtnCamera: 4, gpBtnRespawn: 5, gpBtnPause: 9,
                });
                this._refreshGpUi(gpAxisFields, gpBtnFields, invFields);
            });
        }

        const presetSel = document.getElementById('gp-preset-sel') as HTMLSelectElement | null;
        const refreshPresetList = () => {
            if (!presetSel) return;
            const saved = this._loadGpPresets();
            const cur = presetSel.value;
            presetSel.innerHTML = '<option value="">-- Preset --</option>';
            for (const name of Object.keys(saved).sort()) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                presetSel.appendChild(opt);
            }
            presetSel.value = cur;
        };
        refreshPresetList();

        if (presetSel) {
            presetSel.addEventListener('change', () => {
                const name = presetSel.value;
                if (!name) return;
                const saved = this._loadGpPresets();
                const preset = saved[name];
                if (!preset) return;
                UiPreferences.set(preset as Partial<ReturnType<typeof UiPreferences.get>>);
                this._refreshGpUi(gpAxisFields, gpBtnFields, invFields);
            });
        }

        const presetSaveBtn = document.getElementById('gp-preset-save');
        if (presetSaveBtn) {
            presetSaveBtn.addEventListener('click', () => {
                const name = prompt('Nome do preset:');
                if (!name || !name.trim()) return;
                const cur = UiPreferences.get() as unknown as Record<string, unknown>;
                const keys = this._gpFieldKeys();
                const data: Record<string, unknown> = {};
                for (const k of keys) data[k] = cur[k];
                const saved = this._loadGpPresets();
                saved[name.trim()] = data;
                this._saveGpPresets(saved);
                refreshPresetList();
                if (presetSel) presetSel.value = name.trim();
            });
        }

        const presetDelBtn = document.getElementById('gp-preset-del');
        if (presetDelBtn) {
            presetDelBtn.addEventListener('click', () => {
                if (!presetSel || !presetSel.value) return;
                const saved = this._loadGpPresets();
                delete saved[presetSel.value];
                this._saveGpPresets(saved);
                presetSel.value = '';
                refreshPresetList();
            });
        }

        const statusEl = document.getElementById('gp-status');
        const liveBar = document.getElementById('gp-live-bar');
        const updateLiveBar = () => {
            try {
                if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
                const pads = navigator.getGamepads();
                let pad: Gamepad | null = null;
                if (pads) for (const p of pads) { if (p && p.connected) { pad = p; break; } }
                if (!pad) {
                    if (statusEl) statusEl.textContent = 'Desconectado';
                    if (liveBar) liveBar.style.display = 'none';
                } else {
                    if (statusEl) statusEl.textContent = pad.id.substring(0, 30);
                    if (liveBar) {
                        liveBar.style.display = '';
                        const parts: string[] = [];
                        for (let i = 0; i < Math.min(pad.axes.length, 8); i++) {
                            parts.push(`A${i}:${pad.axes[i].toFixed(2)}`);
                        }
                        for (let i = 0; i < Math.min(pad.buttons.length, 16); i++) {
                            if (pad.buttons[i].pressed) parts.push(`B${i}`);
                        }
                        liveBar.textContent = parts.join(' | ');
                    }
                }
            } catch { /* ignore */ }
            this._gpLiveRafId = requestAnimationFrame(updateLiveBar);
        };
        updateLiveBar();
    }

    buildKeymapList(): void {
        const container = document.getElementById('ux-keymap-list');
        if (!container) return;
        const bindings = InputBindings.get();
        const actions = Object.keys(DEFAULT_KEY_BINDINGS) as ActionId[];
        container.innerHTML = '';
        for (const action of actions) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:space-between;font-size:10px;padding:2px 0';
            const lbl = document.createElement('span');
            lbl.textContent = ACTION_LABELS[action];
            lbl.style.cssText = 'flex:1;color:rgba(200,255,230,.7)';
            const btn = document.createElement('button');
            btn.textContent = bindings[action];
            btn.style.cssText = 'background:rgba(0,30,20,.6);border:1px solid rgba(80,255,160,.3);color:#40ffaa;padding:2px 6px;border-radius:3px;font-family:monospace;font-size:10px;cursor:pointer;min-width:80px';
            btn.addEventListener('click', () => {
                btn.textContent = I18n.t('settings.keymap.waitKey');
                btn.style.color = '#ffcc00';
                const handler = (ev: KeyboardEvent) => {
                    ev.preventDefault();
                    if (ev.code === 'Escape') {
                        btn.textContent = InputBindings.codeFor(action);
                        btn.style.color = '#40ffaa';
                    } else {
                        InputBindings.setBinding(action, ev.code);
                        btn.textContent = ev.code;
                        btn.style.color = '#40ffaa';
                    }
                    window.removeEventListener('keydown', handler, true);
                };
                window.addEventListener('keydown', handler, true);
            });
            row.appendChild(lbl);
            row.appendChild(btn);
            container.appendChild(row);
        }
        InputBindings.onChange((b) => {
            const buttons = container.querySelectorAll('button');
            const actionsList = Object.keys(DEFAULT_KEY_BINDINGS) as ActionId[];
            buttons.forEach((btn, idx) => {
                if (actionsList[idx]) btn.textContent = b[actionsList[idx]];
            });
        });
    }

    takeScreenshot(): void {
        try {
            const canvas = this.scene.scene?.getEngine?.()?.getRenderingCanvas?.();
            if (!canvas) return;
            const dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png');
            const a = document.createElement('a');
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const { lat, lon } = this.scene._getCurrentLatLon();
            const altFt = Math.round((this.scene.refAlt + (this.scene.planeRoot?.position.y ?? 0)) * 3.28084);
            const speedKts = Math.round((Number.isFinite(this.scene._lastTasMs) ? this.scene._lastTasMs : this.scene.velocity.length()) * MS_TO_KT);
            const meta = `lat${lat.toFixed(3)}_lon${lon.toFixed(3)}_alt${altFt}ft_kts${speedKts}`;
            a.download = `flightsim_${ts}_${meta}.png`;
            a.href = dataUrl;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            console.log(`[Screenshot] Saved: ${a.download}`);
            this.scene._showToast(I18n.t('screenshot.taken'));
        } catch (err) {
            console.warn('[Screenshot] failed:', err);
        }
    }

    showToast(message: string, durationMs: number = 2200): void {
        try {
            let toast = document.getElementById('ux-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'ux-toast';
                toast.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(0,30,20,.85);border:1px solid rgba(80,255,160,.4);color:#40ffaa;padding:10px 20px;border-radius:8px;font-family:Inter,sans-serif;font-size:12px;pointer-events:none;backdrop-filter:blur(8px);transition:opacity .3s';
                document.body.appendChild(toast);
            }
            toast.textContent = message;
            toast.style.opacity = '1';
            setTimeout(() => { if (toast) toast.style.opacity = '0'; }, durationMs);
        } catch (err) {
            console.warn('[Toast] failed:', err);
        }
    }

    buildChecklistOverlay(): void {
        if (this.scene._checklistEl) return;
        const el = document.createElement('div');
        el.id = 'ux-checklist';
        el.style.cssText = 'position:fixed;top:90px;right:10px;z-index:120;background:rgba(0,30,20,.7);border:1px solid rgba(80,255,160,.25);border-radius:8px;padding:10px 14px;font-family:Inter,sans-serif;color:#7df9c8;font-size:11px;backdrop-filter:blur(6px);min-width:180px;display:none;pointer-events:none';
        document.body.appendChild(el);
        this.scene._checklistEl = el;
    }

    buildFpsLatencyOverlay(): void {
        if (this.scene._ovrFpsLatencyEl) return;
        const el = document.createElement('div');
        el.id = 'ux-fps-latency';
        el.style.cssText = 'position:fixed;top:10px;right:10px;z-index:121;background:rgba(0,20,15,.65);border:1px solid rgba(80,255,160,.2);border-radius:6px;padding:4px 8px;font-family:monospace;color:#40ffaa;font-size:10px;backdrop-filter:blur(4px);pointer-events:none;display:none';
        document.body.appendChild(el);
        this.scene._ovrFpsLatencyEl = el;
    }

    buildGEffectsOverlay(): void {
        if (this.scene._gEffectsEl) return;
        const el = document.createElement('div');
        el.id = 'ux-g-effects';
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:200;pointer-events:none;opacity:0;transition:background-color .12s linear;background:radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,1) 100%)';
        document.body.appendChild(el);
        this.scene._gEffectsEl = el;
    }

    updateGEffectsOverlay(dt: number): void {
        const el = this.scene._gEffectsEl as HTMLElement | null;
        if (!el) return;
        const prefs = UiPreferences.get();
        if (!prefs.showGEffects) {
            if (el.style.opacity !== '0') el.style.opacity = '0';
            this.scene._gStress = 0;
            return;
        }
        const nz = Number.isFinite(this.scene._gForceVertical) ? this.scene._gForceVertical : 1;
        const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.5) : 0;

        let stressDelta = 0;
        let isRedout = false;
        if (nz >= G_BLACKOUT_ONSET_G) {
            const span = Math.max(0.01, G_BLACKOUT_FULL_G - G_BLACKOUT_ONSET_G);
            const intensity = Math.max(0, Math.min(1, (nz - G_BLACKOUT_ONSET_G) / span));
            stressDelta = G_STRESS_RISE_PER_S * intensity * safeDt;
        } else if (nz <= G_REDOUT_ONSET_G) {
            const span = Math.max(0.01, G_REDOUT_ONSET_G - G_REDOUT_FULL_G);
            const intensity = Math.max(0, Math.min(1, (G_REDOUT_ONSET_G - nz) / span));
            stressDelta = G_STRESS_RISE_PER_S * intensity * safeDt;
            isRedout = true;
        } else {
            stressDelta = -G_STRESS_RECOVER_PER_S * safeDt;
        }

        let stress = (Number.isFinite(this.scene._gStress) ? this.scene._gStress : 0) + stressDelta;
        if (stress < 0) stress = 0;
        if (stress > 1) stress = 1;
        this.scene._gStress = stress;

        const maxOpacity = Math.max(0, Math.min(1, G_STRESS_MAX_OPACITY));
        const opacity = stress * maxOpacity;
        const opacityStr = opacity.toFixed(3);
        if (el.style.opacity !== opacityStr) el.style.opacity = opacityStr;

        const tint = isRedout ? 'rgba(200,0,0,0.65)' : 'rgba(0,0,0,0.85)';
        if (el.style.backgroundColor !== tint) el.style.backgroundColor = tint;
    }

    applyAccessibility(): void {
        const prefs = UiPreferences.get();
        const root = document.documentElement;
        root.style.setProperty('--font-scale', String(prefs.fontScale));
        document.body.classList.toggle('a11y-contrast', prefs.contrastBoost);
        document.body.classList.toggle('a11y-cb-protan', prefs.colorblindMode === 'protanopia');
        document.body.classList.toggle('a11y-cb-deutan', prefs.colorblindMode === 'deuteranopia');
        document.body.classList.toggle('a11y-cb-tritan', prefs.colorblindMode === 'tritanopia');
        document.body.classList.toggle('a11y-no-cb', prefs.colorblindMode === COLORBLIND_NONE);
    }

    refreshKeysHelper(): void {
        const helper = document.getElementById('keys-helper');
        if (!helper) return;
        const b = InputBindings.get();
        const groups: Array<[string, string[]]> = [
            ['Throttle', [b.throttleUp, b.throttleDown]],
            ['Pitch', [b.pitchUp, b.pitchDown]],
            ['Roll', [b.rollLeft, b.rollRight]],
            ['Yaw', [b.yawLeft, b.yawRight]],
            ['Flaps', [b.flapDown, b.flapUp]],
            ['Spoilers', ['Backslash']],
            ['Trim Pitch', [b.trimPitchDown, b.trimPitchUp]],
            ['Trim Yaw', [b.trimYawLeft, b.trimYawRight]],
            ['Trim Wheel', ['PageUp', 'PageDown']],
            ['Brake', [b.brakeToggle]],
            ['Gear', [b.gearToggle]],
            ['Lights', ['KeyL']],
            ['Camera', [b.cameraCycle]],
            ['Tower', [b.towerCamera]],
            ['Pause', [b.pauseToggle]],
            ['TimeScale', [b.timeScaleDown, b.timeScaleUp]],
            ['Easy', [b.easyModeToggle]],
            ['Yoke', [b.mouseYokeToggle]],
            ['AT', [b.autothrottleToggle]],
            // ['Replay', [b.replayToggle]],
            ['Screenshot', [b.screenshot]],
            ['Respawn', [b.respawn]],
            ['AP Master', ['KeyZ']],
            ['AP HDG', ['KeyF']],
            ['AP ALT', ['KeyJ']],
            ['AP VS',  ['KeyK']],
            ['AP NAV', ['KeyU']],
            ['AP APR', ['KeyI']],
            ['Kill Eng', ['Digit1', 'Digit2', 'Digit3', 'Digit4']],
            ['Helper', ['KeyH', 'Slash']],
        ];
        const friendly = (code: string): string => {
            if (code.startsWith('Key')) return code.slice(3);
            if (code.startsWith('Digit')) return code.slice(5);
            if (code.startsWith('Arrow')) {
                if (code === 'ArrowUp') return '\u2191';
                if (code === 'ArrowDown') return '\u2193';
                if (code === 'ArrowLeft') return '\u2190';
                if (code === 'ArrowRight') return '\u2192';
            }
            if (code === 'BracketLeft') return '[';
            if (code === 'BracketRight') return ']';
            if (code === 'Equal') return '=';
            if (code === 'Minus') return '-';
            if (code === 'Slash') return '/';
            if (code === 'Backslash') return '\\';
            if (code === 'PageUp') return 'PgUp';
            if (code === 'PageDown') return 'PgDn';
            return code;
        };
        helper.innerHTML = groups.map(([label, codes]) =>
            `<div class="kh-group"><span class="kh-label">${label}</span>${codes.map(c => `<kbd>${friendly(c)}</kbd>`).join('')}</div>`
        ).join('');
    }

    updateChecklistOverlay(speedKts: number, aglFt: number, vsFpm: number, gearDown: boolean, flapsDown: boolean): void {
        const el = this.scene._checklistEl;
        if (!el) return;
        const prefs = UiPreferences.get();
        if (!prefs.showChecklist) {
            if (el.style.display !== 'none') el.style.display = 'none';
            return;
        }
        let phaseKey = '';
        let items: Array<[string, boolean]> = [];
        if (this.scene.isOnGround && speedKts < 30) {
            phaseKey = 'checklist.preTakeoff';
            items = [
                [I18n.t('checklist.preTakeoff.flaps'), flapsDown],
                [I18n.t('checklist.preTakeoff.brakes'), this.scene.brakesOn],
                [I18n.t('checklist.preTakeoff.gear'), gearDown],
                [I18n.t('checklist.preTakeoff.mixture'), this.scene.aircraftConfig.engine_type !== ENGINE_TYPE_PISTON || this.scene.mixtureLevel >= 0.6],
            ];
        } else if (this.scene.isOnGround && speedKts >= 30) {
            phaseKey = 'checklist.takeoff';
            items = [
                [I18n.t('checklist.takeoff.throttle'), this.scene.thrust >= 0.85],
                [I18n.t('checklist.takeoff.rotate'), false],
            ];
        } else if (vsFpm > 200 && aglFt < 5000) {
            phaseKey = 'checklist.climb';
            items = [
                [I18n.t('checklist.climb.gear'), !gearDown],
                [I18n.t('checklist.climb.flaps'), !flapsDown],
            ];
        } else if (vsFpm < -200 && aglFt > 1500) {
            phaseKey = 'checklist.descent';
            items = [[I18n.t('checklist.descent.throttle'), this.scene.thrust < 0.5]];
        } else if (aglFt < 1500 && aglFt > 50 && !this.scene.isOnGround) {
            phaseKey = 'checklist.approach';
            items = [
                [I18n.t('checklist.approach.flaps'), flapsDown],
                [I18n.t('checklist.approach.gear'), gearDown],
            ];
        } else if (aglFt <= 50 && !this.scene.isOnGround) {
            phaseKey = 'checklist.landing';
            items = [[I18n.t('checklist.landing.flare'), this.scene.thrust < 0.3]];
        } else {
            phaseKey = 'checklist.cruise';
            items = [[I18n.t('checklist.cruise.altitude'), Math.abs(vsFpm) < 200]];
        }
        if (phaseKey !== this.scene._checklistPhase) {
            const prevPhase = this.scene._checklistPhase;
            this.scene._checklistPhase = phaseKey;
            try {
                if (prevPhase && this.scene._flightAudio?.speakAtc) {
                    const phrase = I18n.t(`${phaseKey}.atc`);
                    if (phrase && !phrase.endsWith('.atc')) this.scene._flightAudio.speakAtc(phrase);
                }
            } catch (err) {
                console.warn('[ATC] phase callout failed:', err);
            }
        }
        const title = `<div style="font-family:Orbitron,monospace;font-size:10px;color:#40ffaa;letter-spacing:.12em;border-bottom:1px solid rgba(80,255,160,.2);padding-bottom:3px;margin-bottom:4px">${I18n.t(phaseKey)}</div>`;
        const list = items.map(([txt, ok]) =>
            `<div style="display:flex;gap:6px;align-items:center"><span style="color:${ok ? '#40ffaa' : '#888'}">${ok ? '\u2713' : '\u25CB'}</span><span style="${ok ? '' : 'color:rgba(200,255,230,.4)'}">${txt}</span></div>`
        ).join('');
        const nextHtml = title + list;
        if (nextHtml !== this._lastChecklistHtml) {
            el.innerHTML = nextHtml;
            this._lastChecklistHtml = nextHtml;
        }
        if (el.style.display !== '') el.style.display = '';
    }

    updateFpsLatencyOverlay(): void {
        const el = this.scene._ovrFpsLatencyEl;
        if (!el) return;
        const prefs = UiPreferences.get();
        const timeScaleActive = !this.scene._paused && Math.abs(this.scene._timeScale - 1) > 0.01;
        if (!prefs.showFpsOverlay && !prefs.showLatencyOverlay && !this.scene._paused && !timeScaleActive) {
            if (el.style.display !== 'none') el.style.display = 'none';
            return;
        }
        const fps = this.scene.scene?.getEngine?.()?.getFps?.()?.toFixed(0) ?? '--';
        const parts: string[] = [];
        if (prefs.showFpsOverlay) parts.push(`${fps} ${I18n.t('hud.fps')}`);
        if (prefs.showLatencyOverlay && this.scene.mpClient) {
            const ageMs = this.scene.mpClient.getLastMessageAgeMs();
            const rate = this.scene.mpClient.getRecentMessageRateHz();
            const malformed = this.scene.mpClient.getMalformedCount();
            if (ageMs >= 0) {
                parts.push(`WS ${ageMs.toFixed(0)}ms`);
                parts.push(`${rate.toFixed(1)}Hz`);
                if (malformed > 0) parts.push(`drop=${malformed}`);
            }
        }
        if (this.scene._paused) parts.push(I18n.t('hud.paused'));
        else if (Math.abs(this.scene._timeScale - 1) > 0.01) parts.push(`${this.scene._timeScale.toFixed(2)}${I18n.t('hud.timeScale')}`);
        if (this.scene._gamepadAxes.connected) parts.push('GP');
        if (UiPreferences.get().easyMode) parts.push('EASY');
        if (this.scene._mouseYokeActive) parts.push('YOKE');
        if (this.scene._autopilotAtHold) parts.push(`AT ${Math.round(this.scene._autopilotAtTargetKts)}kt`);
        // if (this.scene._replayActive) parts.push(I18n.t('replay.playing'));
        el.textContent = parts.join('  |  ');
        el.style.display = '';
    }

    initAudioSettings(): void {
        const stored = AudioCore.getVolumes();
        const ids: Array<keyof typeof stored> = ['master', 'engine', 'wind', 'alerts', 'atc', 'music', 'click'];
        for (const key of ids) {
            const slider = document.getElementById(`aud-${key}`) as HTMLInputElement | null;
            const valEl = document.getElementById(`aud-${key}-val`);
            if (!slider) continue;
            const pct = Math.round(stored[key] * 100);
            slider.value = String(pct);
            if (valEl) valEl.textContent = `${pct}%`;
            slider.addEventListener('input', () => {
                const v = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0)) / 100;
                if (valEl) valEl.textContent = `${Math.round(v * 100)}%`;
                AudioCore.setVolumes({ [key]: v } as Partial<typeof stored>);
            });
        }

        const audHeader = document.getElementById('audio-header');
        const audSettings = document.getElementById('audio-settings');
        if (audHeader && audSettings) {
            audHeader.addEventListener('click', () => {
                const visible = audSettings.style.display !== 'none';
                audSettings.style.display = visible ? 'none' : '';
                const h3 = audHeader.querySelector('h3');
                if (h3) h3.textContent = visible ? 'AUDIO \u25B8' : 'AUDIO \u25BE';
            });
        }
    }

    initGraphicsSettings(scene: BABYLON.Scene): void {
        const saved = localStorage.getItem('gfx_settings');
        let cfg: Record<string, any> = {};
        if (saved) { try { cfg = JSON.parse(saved); } catch (_) { /* ignore */ } }
        if (typeof cfg.cloudDensity === 'string' && cfg.cloudDensity === 'ultra') {
            this.scene._cloudVolumetric = true;
        }
        if (cfg.vegetation === true || cfg.colorLut === true || cfg.aerialFog === true || cfg.godRays === true || cfg.tileFade === true || cfg.waterTilesRefl === true) {
            cfg.vegetation = false;
            cfg.colorLut = false;
            cfg.aerialFog = false;
            cfg.godRays = false;
            cfg.tileFade = false;
            cfg.waterTilesRefl = false;
            try {
                localStorage.setItem('gfx_settings', JSON.stringify(cfg));
                console.debug('[GFX] Migrated saved settings: disabled vegetation/colorLut/aerialFog/godRays/tileFade/waterTilesRefl (problematic premium flags)');
            } catch (_) { /* ignore */ }
        }

        const saveSettings = () => {
            const s: Record<string, any> = {};
            s.bloom = (document.getElementById('gfx-bloom') as HTMLInputElement)?.checked ?? true;
            s.bloomWeight = parseInt((document.getElementById('gfx-bloom-weight') as HTMLInputElement)?.value || '40') / 100;
            s.ssao = (document.getElementById('gfx-ssao') as HTMLInputElement)?.checked ?? true;
            s.shadows = (document.getElementById('gfx-shadows') as HTMLInputElement)?.checked ?? true;
            s.shadowQuality = parseInt((document.getElementById('gfx-shadow-quality') as HTMLSelectElement)?.value || '4096');
            s.fog = (document.getElementById('gfx-fog') as HTMLInputElement)?.checked ?? true;
            s.fogDensity = parseInt((document.getElementById('gfx-fog-density') as HTMLInputElement)?.value || '30') / 100;
            s.aa = parseInt((document.getElementById('gfx-aa') as HTMLSelectElement)?.value || '8');
            s.vignette = (document.getElementById('gfx-vignette') as HTMLInputElement)?.checked ?? true;
            s.chromatic = (document.getElementById('gfx-chromatic') as HTMLInputElement)?.checked ?? true;
            s.renderScale = parseInt((document.getElementById('gfx-render-scale') as HTMLInputElement)?.value || '100') / 100;
            s.fpsLimit = parseInt((document.getElementById('gfx-fps-limit') as HTMLSelectElement)?.value || '0');
            s.cloudDensity = (document.getElementById('gfx-cloud-density') as HTMLSelectElement)?.value || 'medium';
            s.overcast = (document.getElementById('gfx-overcast') as HTMLInputElement)?.checked ?? false;
            s.milkyway = (document.getElementById('gfx-milkyway') as HTMLInputElement)?.checked ?? false;
            s.highClouds = (document.getElementById('gfx-highclouds') as HTMLInputElement)?.checked ?? true;
            s.highCloudsCover = parseInt((document.getElementById('gfx-highclouds-cover') as HTMLInputElement)?.value || '55') / 100;
            s.highCloudsSpeed = parseInt((document.getElementById('gfx-highclouds-speed') as HTMLInputElement)?.value || '12') / 100;
            s.highCloudsScale = parseInt((document.getElementById('gfx-highclouds-scale') as HTMLInputElement)?.value || '170') / 100;
            s.highCloudsAlpha = parseInt((document.getElementById('gfx-highclouds-alpha') as HTMLInputElement)?.value || '85') / 100;
            s.highCloudsReflect = parseInt((document.getElementById('gfx-highclouds-reflect') as HTMLInputElement)?.value || '24') / 100;
            s.hdrEnv = (document.getElementById('gfx-hdr-env') as HTMLSelectElement)?.value || 'auto';
            s.preset = (document.getElementById('gfx-preset') as HTMLSelectElement)?.value || 'high';
            s.tileShadows      = this.scene._premium.tileShadows;
            s.aerialFog        = this.scene._premium.aerialFog;
            s.tileFade         = this.scene._premium.tileFade;
            s.godRays          = this.scene._premium.godRays;
            s.colorLut         = this.scene._premium.colorLut;
            s.cloudCameraFade  = this.scene._premium.cloudCameraFade;
            s.waterTilesRefl   = this.scene._premium.waterTilesRefl;
            s.fxaaFallback     = this.scene._premium.fxaaFallback;
            s.vegetation       = this.scene._premium.vegetation;
            s.volumetricClouds = this.scene._premium.volumetricClouds;
            const disableDynEl = document.getElementById('gfx-disable-dynamic-lights') as HTMLInputElement | null;
            s.disableDynamicLights = disableDynEl?.checked ?? false;
            this.scene._disableDynamicLighting = s.disableDynamicLights;
            localStorage.setItem('gfx_settings', JSON.stringify(s));
        };

        const cloudDensityFromLabel = (label: string): number => {
            switch (label) {
                case 'low': return CLOUD_DENSITY_MULT_LOW;
                case 'high': return CLOUD_DENSITY_MULT_HIGH;
                case 'ultra': return CLOUD_DENSITY_MULT_ULTRA;
                case 'medium':
                default: return CLOUD_DENSITY_MULT_MEDIUM;
            }
        };

        const applySettings = () => {
            saveSettings();
            requestAnimationFrame(() => {
                try {
                    const p = this.scene._pipeline;
                    const ssao = this.scene._ssao;
                    const engine = this.scene.scene?.getEngine();
                    if (!p || !engine) return;

                    const bloomEl = document.getElementById('gfx-bloom') as HTMLInputElement | null;
                    const bloomWEl = document.getElementById('gfx-bloom-weight') as HTMLInputElement | null;
                    const ssaoEl = document.getElementById('gfx-ssao') as HTMLInputElement | null;
                    const shadowsEl = document.getElementById('gfx-shadows') as HTMLInputElement | null;
                    const shadowQEl = document.getElementById('gfx-shadow-quality') as HTMLSelectElement | null;
                    const fogEl = document.getElementById('gfx-fog') as HTMLInputElement | null;
                    const fogDEl = document.getElementById('gfx-fog-density') as HTMLInputElement | null;
                    const aaEl = document.getElementById('gfx-aa') as HTMLSelectElement | null;
                    const vigEl = document.getElementById('gfx-vignette') as HTMLInputElement | null;
                    const chrEl = document.getElementById('gfx-chromatic') as HTMLInputElement | null;
                    const scaleEl = document.getElementById('gfx-render-scale') as HTMLInputElement | null;
                    const scaleLbl = document.getElementById('gfx-render-scale-val');
                    const fpsEl = document.getElementById('gfx-fps-limit') as HTMLSelectElement | null;

                    if (bloomEl) p.bloomEnabled = bloomEl.checked;
                    if (bloomWEl) p.bloomWeight = parseInt(bloomWEl.value) / 100;
                    if (ssaoEl && ssao) {
                        ssao.totalStrength = ssaoEl.checked ? 1.2 : 0;
                        try {
                            const cam = this.scene.scene?.activeCamera;
                            const ppm = this.scene.scene?.postProcessRenderPipelineManager;
                            if (cam && ppm) {
                                if (ssaoEl.checked) {
                                    if (!this.scene._ssaoAttached) {
                                        ppm.attachCamerasToRenderPipeline('ssao', cam);
                                        this.scene._ssaoAttached = true;
                                    }
                                } else if (this.scene._ssaoAttached !== false) {
                                    ppm.detachCamerasFromRenderPipeline('ssao', cam);
                                    this.scene._ssaoAttached = false;
                                }
                            }
                        } catch (err) {
                            console.warn('[SSAO] attach/detach failed:', err);
                        }
                    }
                    if (shadowsEl && this.scene._shadowGen) {
                        if (!shadowsEl.checked) {
                            this.scene._shadowGen.setDarkness(1);
                        } else {
                            this.scene._shadowGen.setDarkness(0);
                            if (shadowQEl) {
                                const sz = parseInt(shadowQEl.value);
                                if (sz !== this.scene._shadowGen.mapSize) {
                                    this.scene._shadowGen.mapSize = sz;
                                }
                            }
                        }
                    }
                    if (fogEl) {
                        scene.fogMode = fogEl.checked ? BABYLON.Scene.FOGMODE_EXP2 : BABYLON.Scene.FOGMODE_NONE;
                    }
                    if (fogDEl) {
                        scene.fogDensity = 0.000002 + (parseInt(fogDEl.value) / 100) * 0.000025;
                    }
                    if (aaEl) p.samples = parseInt(aaEl.value);
                    if (vigEl) p.imageProcessing.vignetteEnabled = vigEl.checked;
                    if (chrEl) p.chromaticAberrationEnabled = chrEl.checked;
                    if (scaleEl) {
                        const scale = parseInt(scaleEl.value) / 100;
                        engine.setHardwareScalingLevel(1 / scale);
                        if (scaleLbl) scaleLbl.textContent = scale.toFixed(1) + 'x';
                    }
                    if (fpsEl) {
                        const limit = parseInt(fpsEl.value);
                        const MAX_FPS_CAP = 144;
                        (engine as any).maxFPS = limit > 0 ? limit : MAX_FPS_CAP;
                    }

                    const cloudDensityEl = document.getElementById('gfx-cloud-density') as HTMLSelectElement | null;
                    if (cloudDensityEl) {
                        const newMult = cloudDensityFromLabel(cloudDensityEl.value);
                        const newVolumetric = cloudDensityEl.value === 'ultra';
                        if (newMult !== this.scene._cloudDensityMult || newVolumetric !== this.scene._cloudVolumetric) {
                            this.scene._cloudDensityMult = newMult;
                            this.scene._cloudVolumetric = newVolumetric;
                            this.scene._rebuildClouds(scene);
                        }
                    }
                    const overcastEl = document.getElementById('gfx-overcast') as HTMLInputElement | null;
                    if (overcastEl) {
                        this.scene._setOvercast(scene, overcastEl.checked);
                    }
                    const milkywayEl = document.getElementById('gfx-milkyway') as HTMLInputElement | null;
                    if (milkywayEl) {
                        this.scene._setMilkyWay(scene, milkywayEl.checked);
                    }

                    const highCloudsSys = this.scene.getHighCloudsSystem?.();
                    if (highCloudsSys) {
                        const hcEnableEl = document.getElementById('gfx-highclouds') as HTMLInputElement | null;
                        const hcCoverEl = document.getElementById('gfx-highclouds-cover') as HTMLInputElement | null;
                        const hcCoverLbl = document.getElementById('gfx-highclouds-cover-val');
                        const hcSpeedEl = document.getElementById('gfx-highclouds-speed') as HTMLInputElement | null;
                        const hcSpeedLbl = document.getElementById('gfx-highclouds-speed-val');
                        const hcScaleEl = document.getElementById('gfx-highclouds-scale') as HTMLInputElement | null;
                        const hcScaleLbl = document.getElementById('gfx-highclouds-scale-val');
                        const hcAlphaEl = document.getElementById('gfx-highclouds-alpha') as HTMLInputElement | null;
                        const hcAlphaLbl = document.getElementById('gfx-highclouds-alpha-val');
                        const hcReflectEl = document.getElementById('gfx-highclouds-reflect') as HTMLInputElement | null;
                        const hcReflectLbl = document.getElementById('gfx-highclouds-reflect-val');
                        if (hcEnableEl) highCloudsSys.setEnabled(hcEnableEl.checked);
                        if (hcCoverEl) {
                            const v = parseInt(hcCoverEl.value) / 100;
                            highCloudsSys.setCover(v);
                            if (hcCoverLbl) hcCoverLbl.textContent = v.toFixed(2);
                        }
                        if (hcSpeedEl) {
                            const v = parseInt(hcSpeedEl.value) / 100;
                            highCloudsSys.setSpeed(v);
                            if (hcSpeedLbl) hcSpeedLbl.textContent = v.toFixed(2);
                        }
                        if (hcScaleEl) {
                            const v = parseInt(hcScaleEl.value) / 100;
                            highCloudsSys.setScale(v);
                            if (hcScaleLbl) hcScaleLbl.textContent = v.toFixed(2);
                        }
                        if (hcAlphaEl) {
                            const v = parseInt(hcAlphaEl.value) / 100;
                            highCloudsSys.setAlpha(v);
                            if (hcAlphaLbl) hcAlphaLbl.textContent = v.toFixed(2);
                        }
                        if (hcReflectEl) {
                            const v = parseInt(hcReflectEl.value) / 100;
                            highCloudsSys.setReflect(v);
                            if (hcReflectLbl) hcReflectLbl.textContent = v.toFixed(2);
                        }
                        highCloudsSys.setAutoTint(true);
                    }
                    const hdrEnvEl = document.getElementById('gfx-hdr-env') as HTMLSelectElement | null;
                    if (hdrEnvEl) {
                        try {
                            this.scene._applyHdrEnvironment(scene, hdrEnvEl.value || 'none');
                        } catch (err) {
                            console.error('[GFX] applyHdrEnvironment failed:', err);
                        }
                    }
                    this.scene._fogDensityBase = scene.fogDensity;
                    this.scene._setGodRays(scene, this.scene._premium.godRays);
                    this.scene._setColorLut(scene, this.scene._premium.colorLut);
                    this.scene._setWaterTilesReflection(this.scene._premium.waterTilesRefl);
                    this.scene._setFxaaFallback(this.scene._premium.fxaaFallback);
                    this.scene._setVegetation(scene, this.scene._premium.vegetation);
                    this.scene._setVolumetricClouds(scene, this.scene._premium.volumetricClouds);
                } catch (e) {
                    console.error('[GFX] applySettings error:', e);
                }
            });
        };

        const presets: Record<string, Record<string, any>> = {
            low:    { bloom: false, bloomWeight: 20, ssao: false, shadows: false, shadowQuality: '1024', fog: true, fogDensity: 30, aa: '1', vignette: false, chromatic: false, renderScale: 75, fpsLimit: '0',  cloudDensity: 'low',    overcast: false, milkyway: false, hdrEnv: 'none',
                      tileShadows: false, aerialFog: false, tileFade: false, godRays: false, colorLut: false, cloudCameraFade: false, waterTilesRefl: false, fxaaFallback: false, vegetation: false, volumetricClouds: false,
                      highClouds: false, highCloudsCover: 0.89, highCloudsSpeed: 0.03, highCloudsScale: 4.00, highCloudsAlpha: 0.82, highCloudsReflect: 0.24 },
            medium: { bloom: true,  bloomWeight: 20, ssao: false, shadows: true,  shadowQuality: '2048', fog: true, fogDensity: 30, aa: '2', vignette: true,  chromatic: false, renderScale: 100, fpsLimit: '0', cloudDensity: 'medium', overcast: false, milkyway: false, hdrEnv: 'auto',
                      tileShadows: false, aerialFog: false, tileFade: false, godRays: false, colorLut: false, cloudCameraFade: false, waterTilesRefl: false, fxaaFallback: false, vegetation: false, volumetricClouds: false,
                      highClouds: true,  highCloudsCover: 0.89, highCloudsSpeed: 0.03, highCloudsScale: 4.00, highCloudsAlpha: 0.82, highCloudsReflect: 0.24 },
            high:   { bloom: true,  bloomWeight: 40, ssao: true,  shadows: true,  shadowQuality: '4096', fog: true, fogDensity: 30, aa: '4', vignette: true,  chromatic: true,  renderScale: 100, fpsLimit: '0', cloudDensity: 'medium', overcast: false, milkyway: false, hdrEnv: 'auto',
                      tileShadows: true,  aerialFog: false, tileFade: false, godRays: false, colorLut: false, cloudCameraFade: true,  waterTilesRefl: false, fxaaFallback: true,  vegetation: false, volumetricClouds: false,
                      highClouds: true,  highCloudsCover: 0.89, highCloudsSpeed: 0.03, highCloudsScale: 4.00, highCloudsAlpha: 0.82, highCloudsReflect: 0.24 },
            ultra:  { bloom: true,  bloomWeight: 40, ssao: true,  shadows: true,  shadowQuality: '4096', fog: true, fogDensity: 30, aa: '8', vignette: true,  chromatic: true,  renderScale: 100, fpsLimit: '0', cloudDensity: 'high',   overcast: false, milkyway: true,  hdrEnv: 'auto',
                      tileShadows: true,  aerialFog: false, tileFade: false, godRays: false, colorLut: false, cloudCameraFade: true,  waterTilesRefl: false, fxaaFallback: true,  vegetation: false, volumetricClouds: false,
                      highClouds: true,  highCloudsCover: 0.89, highCloudsSpeed: 0.03, highCloudsScale: 4.00, highCloudsAlpha: 0.82, highCloudsReflect: 0.24 },
        };

        const applyPreset = (name: string) => {
            const p = presets[name];
            if (!p) return;
            const setCheck = (id: string, val: boolean) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.checked = val; };
            const setVal = (id: string, val: any) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = String(val); };
            setCheck('gfx-bloom', p.bloom); setVal('gfx-bloom-weight', p.bloomWeight);
            setCheck('gfx-ssao', p.ssao); setCheck('gfx-shadows', p.shadows);
            setVal('gfx-shadow-quality', p.shadowQuality); setCheck('gfx-fog', p.fog);
            setVal('gfx-fog-density', p.fogDensity); setVal('gfx-aa', p.aa);
            setCheck('gfx-vignette', p.vignette); setCheck('gfx-chromatic', p.chromatic);
            setVal('gfx-render-scale', p.renderScale); setVal('gfx-fps-limit', p.fpsLimit);
            setVal('gfx-cloud-density', p.cloudDensity);
            setCheck('gfx-overcast', p.overcast);
            setCheck('gfx-milkyway', p.milkyway);
            setCheck('gfx-highclouds', p.highClouds);
            if (p.highCloudsCover !== undefined) setVal('gfx-highclouds-cover', Math.round(p.highCloudsCover * 100));
            if (p.highCloudsSpeed !== undefined) setVal('gfx-highclouds-speed', Math.round(p.highCloudsSpeed * 100));
            if (p.highCloudsScale !== undefined) setVal('gfx-highclouds-scale', Math.round(p.highCloudsScale * 100));
            if (p.highCloudsAlpha !== undefined) setVal('gfx-highclouds-alpha', Math.round(p.highCloudsAlpha * 100));
            if (p.highCloudsReflect !== undefined) setVal('gfx-highclouds-reflect', Math.round(p.highCloudsReflect * 100));
            setVal('gfx-hdr-env', p.hdrEnv);
            this.scene._premium.tileShadows      = !!p.tileShadows;
            this.scene._premium.aerialFog        = !!p.aerialFog;
            this.scene._premium.tileFade         = !!p.tileFade;
            this.scene._premium.godRays          = !!p.godRays;
            this.scene._premium.colorLut         = !!p.colorLut;
            this.scene._premium.cloudCameraFade  = !!p.cloudCameraFade;
            this.scene._premium.waterTilesRefl   = !!p.waterTilesRefl;
            this.scene._premium.fxaaFallback     = !!p.fxaaFallback;
            this.scene._premium.vegetation       = !!p.vegetation;
            this.scene._premium.volumetricClouds = !!p.volumetricClouds;
            applySettings();
        };

        const MOBILE_QUALITY_RENDER_SCALE = 100;
        const MOBILE_QUALITY_SHADOW_QUALITY = '1024';
        const MOBILE_QUALITY_AA = '1';

        const isMobile = this.scene.isMobile === true;
        const dynLightsRow = document.getElementById('gfx-disable-dynamic-lights-row');
        if (dynLightsRow) dynLightsRow.style.display = isMobile ? 'none' : '';
        const applyDisableDynamicLights = (enabled: boolean) => {
            this.scene._disableDynamicLighting = enabled;
        };
        const disableDynEl = document.getElementById('gfx-disable-dynamic-lights') as HTMLInputElement | null;
        if (disableDynEl) {
            disableDynEl.addEventListener('change', () => {
                applyDisableDynamicLights(disableDynEl.checked);
                saveSettings();
            });
        }
        if (isMobile && Object.keys(cfg).length === 0) {
            console.info('[GFX] Mobile detected, first visit — applying "low" preset with quality overrides (render scale, shadows, FXAA)');
            applyPreset('low');
            const setCheckMobile = (id: string, val: boolean) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.checked = val; };
            const setValMobile = (id: string, val: any) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = String(val); };
            setValMobile('gfx-render-scale', MOBILE_QUALITY_RENDER_SCALE);
            setCheckMobile('gfx-shadows', true);
            setValMobile('gfx-shadow-quality', MOBILE_QUALITY_SHADOW_QUALITY);
            setValMobile('gfx-aa', MOBILE_QUALITY_AA);
            this.scene._premium.fxaaFallback = true;
            applySettings();
            const presetEl2 = document.getElementById('gfx-preset') as HTMLSelectElement | null;
            if (presetEl2) presetEl2.value = 'low';
        }

        if (Object.keys(cfg).length > 0) {
            const setCheck = (id: string, val: boolean | undefined) => { if (val !== undefined) { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.checked = val; } };
            const setVal = (id: string, val: any) => { if (val !== undefined) { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = String(val); } };
            setCheck('gfx-bloom', cfg.bloom);
            if (cfg.bloomWeight !== undefined) setVal('gfx-bloom-weight', Math.round(cfg.bloomWeight * 100));
            setCheck('gfx-ssao', cfg.ssao); setCheck('gfx-shadows', cfg.shadows);
            setVal('gfx-shadow-quality', cfg.shadowQuality); setCheck('gfx-fog', cfg.fog);
            if (cfg.fogDensity !== undefined) setVal('gfx-fog-density', Math.round(cfg.fogDensity * 100));
            setVal('gfx-aa', cfg.aa);
            setCheck('gfx-vignette', cfg.vignette); setCheck('gfx-chromatic', cfg.chromatic);
            setCheck('gfx-disable-dynamic-lights', cfg.disableDynamicLights);
            applyDisableDynamicLights(!!cfg.disableDynamicLights);
            if (cfg.renderScale !== undefined) setVal('gfx-render-scale', Math.round(cfg.renderScale * 100));
            setVal('gfx-fps-limit', cfg.fpsLimit);
            if (cfg.cloudDensity !== undefined) setVal('gfx-cloud-density', cfg.cloudDensity);
            setCheck('gfx-overcast', cfg.overcast);
            setCheck('gfx-milkyway', cfg.milkyway);
            setCheck('gfx-highclouds', cfg.highClouds);
            if (cfg.highCloudsCover !== undefined) setVal('gfx-highclouds-cover', Math.round(cfg.highCloudsCover * 100));
            if (cfg.highCloudsSpeed !== undefined) setVal('gfx-highclouds-speed', Math.round(cfg.highCloudsSpeed * 100));
            if (cfg.highCloudsScale !== undefined) setVal('gfx-highclouds-scale', Math.round(cfg.highCloudsScale * 100));
            if (cfg.highCloudsAlpha !== undefined) setVal('gfx-highclouds-alpha', Math.round(cfg.highCloudsAlpha * 100));
            if (cfg.highCloudsReflect !== undefined) setVal('gfx-highclouds-reflect', Math.round(cfg.highCloudsReflect * 100));
            if (cfg.hdrEnv !== undefined) setVal('gfx-hdr-env', cfg.hdrEnv);
            if (cfg.preset) { const el = document.getElementById('gfx-preset') as HTMLSelectElement | null; if (el) el.value = cfg.preset; }

            const hasPremiumKeys = cfg.tileShadows !== undefined
                || cfg.aerialFog !== undefined
                || cfg.colorLut !== undefined
                || cfg.vegetation !== undefined;
            if (!hasPremiumKeys && cfg.preset && presets[cfg.preset]) {
                const pd = presets[cfg.preset];
                this.scene._premium.tileShadows      = !!pd.tileShadows;
                this.scene._premium.aerialFog        = !!pd.aerialFog;
                this.scene._premium.tileFade         = !!pd.tileFade;
                this.scene._premium.godRays          = !!pd.godRays;
                this.scene._premium.colorLut         = !!pd.colorLut;
                this.scene._premium.cloudCameraFade  = !!pd.cloudCameraFade;
                this.scene._premium.waterTilesRefl   = !!pd.waterTilesRefl;
                this.scene._premium.fxaaFallback     = !!pd.fxaaFallback;
                this.scene._premium.vegetation       = !!pd.vegetation;
                this.scene._premium.volumetricClouds = !!pd.volumetricClouds;
                console.debug(`[GFX] Migrated cfg without premium keys using preset "${cfg.preset}" defaults`);
            } else {
                if (cfg.tileShadows      !== undefined) this.scene._premium.tileShadows      = !!cfg.tileShadows;
                if (cfg.aerialFog        !== undefined) this.scene._premium.aerialFog        = !!cfg.aerialFog;
                if (cfg.tileFade         !== undefined) this.scene._premium.tileFade         = !!cfg.tileFade;
                if (cfg.godRays          !== undefined) this.scene._premium.godRays          = !!cfg.godRays;
                if (cfg.colorLut         !== undefined) this.scene._premium.colorLut         = !!cfg.colorLut;
                if (cfg.cloudCameraFade  !== undefined) this.scene._premium.cloudCameraFade  = !!cfg.cloudCameraFade;
                if (cfg.waterTilesRefl   !== undefined) this.scene._premium.waterTilesRefl   = !!cfg.waterTilesRefl;
                if (cfg.fxaaFallback     !== undefined) this.scene._premium.fxaaFallback     = !!cfg.fxaaFallback;
                if (cfg.vegetation       !== undefined) this.scene._premium.vegetation       = !!cfg.vegetation;
                if (cfg.volumetricClouds !== undefined) this.scene._premium.volumetricClouds = !!cfg.volumetricClouds;
            }

            this.scene._safeSetTimeout(() => applySettings(), 100);
        } else {
            this.scene._safeSetTimeout(() => {
                try {
                    const hdrEnvEl = document.getElementById('gfx-hdr-env') as HTMLSelectElement | null;
                    const val = hdrEnvEl?.value || 'auto';
                    if (val && val !== 'none') {
                        this.scene._applyHdrEnvironment(scene, val);
                    }
                } catch (err) {
                    console.error('[GFX] Initial HDR apply failed:', err);
                }
            }, 100);
        }

        const ids = ['gfx-bloom', 'gfx-bloom-weight', 'gfx-ssao', 'gfx-shadows', 'gfx-shadow-quality', 'gfx-fog', 'gfx-fog-density', 'gfx-aa', 'gfx-vignette', 'gfx-chromatic', 'gfx-render-scale', 'gfx-fps-limit', 'gfx-cloud-density', 'gfx-overcast', 'gfx-milkyway', 'gfx-highclouds', 'gfx-highclouds-cover', 'gfx-highclouds-speed', 'gfx-highclouds-scale', 'gfx-highclouds-alpha', 'gfx-highclouds-reflect', 'gfx-hdr-env'];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => applySettings());
        }

        const presetEl = document.getElementById('gfx-preset');
        if (presetEl) {
            presetEl.addEventListener('change', () => {
                applyPreset((presetEl as HTMLSelectElement).value);
            });
        }
    }

    initTapeMarks(): void {
        if (this.scene.hudSpdMarks && this.scene.spdMarkEls.length === 0) {
            for (let i = 0; i < 7; i++) {
                const el = document.createElement('div');
                el.className = 'hud-tape-mark';
                const valEl = document.createElement('span');
                valEl.className = 'hud-tape-mark-val';
                const line = document.createElement('div');
                line.className = 'hud-tape-mark-line';
                el.appendChild(valEl);
                el.appendChild(line);
                this.scene.hudSpdMarks.appendChild(el);
                this.scene.spdMarkEls.push({ el, valEl });
            }
        }
        if (this.scene.hudAltMarks && this.scene.altMarkEls.length === 0) {
            for (let i = 0; i < 7; i++) {
                const el = document.createElement('div');
                el.className = 'hud-tape-mark';
                const valEl = document.createElement('span');
                valEl.className = 'hud-tape-mark-val';
                const line = document.createElement('div');
                line.className = 'hud-tape-mark-line';
                el.appendChild(valEl);
                el.appendChild(line);
                this.scene.hudAltMarks.appendChild(el);
                this.scene.altMarkEls.push({ el, valEl });
            }
        }
    }

    updateTapeMarks(speedKts: number, altitudeFt: number): void {
        const TICKER_HALF_HEIGHT_PX = 20;
        const MARK_SPACING_PX = 30;
        const MARK_HALF_HEIGHT_PX = 7;

        const spdStep = 20;
        const spdRange = 60;
        const spdCenter = Math.round(speedKts / spdStep) * spdStep;
        
        if (this.scene.spdMarkEls.length > 0) {
            const centerChanged = spdCenter !== this.scene.lastSpdCenter;
            this.scene.lastSpdCenter = spdCenter;
            if (this._cachedSpdMarksHalfH <= 0) {
                this._cachedSpdMarksHalfH = (this.scene.hudSpdMarks?.offsetHeight ?? 180) / 2;
            }
            const spdHalfWrapper = this._cachedSpdMarksHalfH;
            const spdMaxAbsY = spdHalfWrapper - MARK_HALF_HEIGHT_PX;
            
            for (let i = 0; i < 7; i++) {
                const idx = 3 - i;
                const val = Math.max(0, spdCenter + idx * spdStep);
                const offset = ((speedKts - val) / spdRange) * 50;
                const mark = this.scene.spdMarkEls[i];
                mark.el.style.transform = `translateY(${offset}px)`;
                if (centerChanged) mark.valEl.textContent = String(val);
                const naturalY = (i - 3) * MARK_SPACING_PX;
                const visualY = naturalY + offset;
                const inTickerZone = Math.abs(visualY) < TICKER_HALF_HEIGHT_PX;
                const outsideWrapper = Math.abs(visualY) > spdMaxAbsY;
                const desiredOpacity = (inTickerZone || outsideWrapper) ? '0' : '1';
                if (mark.el.style.opacity !== desiredOpacity) mark.el.style.opacity = desiredOpacity;
            }
            
            if (this.scene.hudSpdTape) {
                const fillPct = 50 + ((speedKts % spdStep) / spdStep - 0.5) * 15;
                this.scene.hudSpdTape.style.height = `${Math.max(5, Math.min(95, fillPct))}%`;
            }
        }
        
        const altStep = 200;
        const altRange = 600;
        const altCenter = Math.round(altitudeFt / altStep) * altStep;
        
        if (this.scene.altMarkEls.length > 0) {
            const centerChanged = altCenter !== this.scene.lastAltCenter;
            this.scene.lastAltCenter = altCenter;
            if (this._cachedAltMarksHalfH <= 0) {
                this._cachedAltMarksHalfH = (this.scene.hudAltMarks?.offsetHeight ?? 180) / 2;
            }
            const altHalfWrapper = this._cachedAltMarksHalfH;
            const altMaxAbsY = altHalfWrapper - MARK_HALF_HEIGHT_PX;
            
            for (let i = 0; i < 7; i++) {
                const idx = 3 - i;
                const val = Math.max(0, altCenter + idx * altStep);
                const offset = ((altitudeFt - val) / altRange) * 50;
                const mark = this.scene.altMarkEls[i];
                mark.el.style.transform = `translateY(${offset}px)`;
                if (centerChanged) mark.valEl.textContent = String(val);
                const naturalY = (i - 3) * MARK_SPACING_PX;
                const visualY = naturalY + offset;
                const inTickerZone = Math.abs(visualY) < TICKER_HALF_HEIGHT_PX;
                const outsideWrapper = Math.abs(visualY) > altMaxAbsY;
                const desiredOpacity = (inTickerZone || outsideWrapper) ? '0' : '1';
                if (mark.el.style.opacity !== desiredOpacity) mark.el.style.opacity = desiredOpacity;
            }
            
            if (this.scene.hudAltTape) {
                const fillPct = Math.min(100, Math.max(5, (altitudeFt % 1000) / 1000 * 100));
                this.scene.hudAltTape.style.height = `${fillPct}%`;
            }
        }
    }

    buildHUD(): void {
        const hud = document.createElement('div');
        hud.id = 'flight-hud';
        hud.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400&display=swap');
#flight-hud { position:fixed;inset:0;pointer-events:none;z-index:100;font-family:'Orbitron',monospace;color:#fff;opacity:0;transition:opacity 1s ease; }
.hp{position:absolute}
#hfps{font-size:10px;color:rgba(100,240,180,.4);font-family:'Inter',sans-serif}
#hw{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(255,30,0,.12);border:1px solid rgba(255,60,0,.7);border-radius:10px;color:#ff5500;font-size:20px;letter-spacing:.2em;text-align:center;padding:16px 36px;display:none;animation:stallPulse 1s ease-in-out infinite}
@keyframes stallPulse{0%,100%{opacity:1}50%{opacity:.3}}

#ap-panel{user-select:none}
#ap-panel .ap-btn{background:#1a1a1f;color:#aaa;border:1px solid #555;border-radius:3px;padding:2px 8px;font:inherit;cursor:pointer;letter-spacing:.06em;transition:background .15s,color .15s,box-shadow .15s,border-color .15s}
#ap-panel .ap-btn:hover{border-color:#8aa;color:#ddd}
#ap-panel .ap-btn.active{background:#15402a;color:#40ff80;border-color:#40ff80;box-shadow:0 0 8px rgba(64,255,128,.55),inset 0 0 4px rgba(64,255,128,.25);text-shadow:0 0 4px rgba(64,255,128,.6)}
#ap-panel .ap-units{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;padding:0 2px}
#ap-panel .ap-unit{display:flex;flex-direction:column;align-items:center;gap:3px}
#ap-panel .ap-display{background:#000;color:#9cf;border:1px solid rgba(80,180,255,.45);border-radius:3px;padding:1px 5px;font-size:11px;font-family:'Orbitron',monospace;min-width:54px;text-align:center;text-shadow:0 0 4px rgba(120,200,255,.55);letter-spacing:.05em}
#ap-panel .ap-display span{cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px;color:inherit}
#ap-panel .ap-knob{width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#666,#222 65%,#0a0a0a 100%);border:1px solid #2a2a2a;box-shadow:inset 0 -2px 4px rgba(0,0,0,.6),0 1px 3px rgba(0,0,0,.5);cursor:pointer;position:relative;flex-shrink:0}
#ap-panel .ap-knob:hover{border-color:#5a8aaa}
#ap-panel .ap-knob-inner{position:absolute;inset:0;border-radius:50%;transition:transform .12s ease-out;pointer-events:none}
#ap-panel .ap-knob-tick{position:absolute;top:2px;left:50%;transform:translateX(-50%);width:2px;height:9px;background:#aac8ff;border-radius:1px;box-shadow:0 0 3px rgba(120,200,255,.7)}

/* Left Panel - Airspeed */
.hud-panel-left{position:absolute;left:12px;bottom:12px;font-family:'Inter',sans-serif;display:flex;align-items:flex-end;gap:8px}
.hud-panel-right{position:absolute;right:12px;bottom:12px;font-family:'Inter',sans-serif;display:flex;align-items:flex-end;gap:8px}

.hud-tape-col{display:flex;flex-direction:column}
.hud-header{font-size:9px;letter-spacing:.1em;color:#fff;margin-bottom:2px;font-weight:400;opacity:.8}
.hud-header-sub{font-size:7px;color:rgba(255,255,255,.4);margin-left:2px}
.hud-cyan{color:#79e7ff!important}
.hud-alt-sel{font-size:14px;font-weight:700;color:#79e7ff;font-family:'Orbitron',monospace;letter-spacing:.05em;text-align:right;margin-bottom:2px;text-shadow:0 1px 3px rgba(0,0,0,.8)}

.hud-tape-section{display:flex;align-items:stretch;overflow:visible;position:relative}
.hud-tape-wrapper{position:relative;display:block;height:180px;overflow:visible;width:64px;background:linear-gradient(to right,rgba(0,0,0,.55),rgba(0,0,0,.35));border:1px solid rgba(255,255,255,.12)}
.hud-tape{position:absolute;right:0;top:0;bottom:0;width:6px;background:linear-gradient(to top,rgba(0,0,0,.7),rgba(0,0,0,.5));overflow:hidden}
.hud-tape-fill-spd{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(255,255,255,.10),rgba(255,255,255,.20));transition:height .15s}
.hud-tape-fill-alt{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(255,255,255,.10),rgba(255,255,255,.20));transition:height .15s}
.hud-tape-marks{position:absolute;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:18px;pointer-events:none;left:0;right:8px;align-items:flex-end;overflow:visible}
.hud-tape-marks-left,.hud-tape-marks-right{left:0;right:8px;align-items:flex-end}
.hud-tape-mark{display:flex;align-items:center;gap:3px;justify-content:flex-end;white-space:nowrap}
.hud-tape-mark-line{width:5px;height:1px;background:rgba(255,255,255,.65);flex-shrink:0}
.hud-tape-mark-val{font-size:10px;color:rgba(255,255,255,.9);font-family:'Inter',sans-serif;font-weight:500;min-width:34px;text-align:right;letter-spacing:.5px}

.hud-ticker-box{position:absolute;left:-6px;right:-6px;top:50%;transform:translateY(-50%);height:30px;background:rgba(0,0,0,.92);border:1px solid rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;font-family:'Orbitron',monospace;font-weight:700;font-size:18px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.95);letter-spacing:0;pointer-events:none;z-index:5;box-shadow:0 0 6px rgba(0,0,0,.6);line-height:1;padding:0 3px;white-space:nowrap;overflow:visible;font-variant-numeric:tabular-nums}
.hud-ticker-static{display:inline-block;line-height:1;width:.62em;text-align:center}
.hud-ticker-static:empty{display:none}
.hud-ticker-rolling{position:relative;display:inline-block;height:1em;width:.62em;vertical-align:top;clip-path:inset(0 -100px 0 -100px)}
.hud-ticker-rolling-inner{position:absolute;left:0;top:0;display:flex;flex-direction:column;line-height:1;transition:transform .12s linear}
.hud-ticker-rolling-inner span{display:block;height:1em;text-align:center;width:.62em}
.hud-ticker-small{font-size:.7em;opacity:.9;margin-left:2px;display:inline-flex;align-items:baseline}

.hud-value-row{display:flex;align-items:baseline;gap:2px;margin-top:3px}
.hud-value-main{font-size:24px;font-weight:700;color:#fff;font-family:'Orbitron',monospace;text-shadow:0 1px 4px rgba(0,0,0,.9)}
.hud-value-unit{font-size:9px;color:rgba(255,255,255,.4)}

.hud-sub-row{display:flex;align-items:center;gap:4px;margin-top:1px}
.hud-sub-label{font-size:8px;color:rgba(255,255,255,.5)}
.hud-sub-val{font-size:11px;color:#79e7ff;font-family:'Orbitron',monospace;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.8)}

/* Engine Section - Side by side */
.hud-engine-col{display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:4px}
.hud-engine-title{font-size:8px;letter-spacing:.08em;color:#fff;margin-bottom:2px;font-weight:600}
.hud-engine-content{display:flex;flex-direction:column;gap:4px}
.hud-rpm-gauge{position:relative;width:56px;height:56px}
.hud-rpm-bg{width:100%;height:100%;border-radius:50%;background:radial-gradient(circle,rgba(20,20,20,.9),rgba(10,10,10,.95));border:1px solid rgba(80,255,160,.25)}
.hud-rpm-needle{position:absolute;bottom:50%;left:50%;width:2px;height:22px;background:linear-gradient(to top,#50ff80,#80ffa0);transform-origin:bottom center;transform:rotate(-120deg);border-radius:1px;box-shadow:0 0 4px rgba(80,255,128,.5)}
.hud-rpm-center{position:absolute;top:50%;left:50%;width:6px;height:6px;background:#222;border:1px solid rgba(80,255,160,.3);border-radius:50%;transform:translate(-50%,-50%)}
.hud-rpm-label{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);font-size:7px;color:#79e7ff;letter-spacing:.04em;font-weight:700;line-height:1;text-align:center;white-space:nowrap}
.hud-rpm-end{position:absolute;font-size:6px;color:rgba(255,255,255,.55);font-family:'Inter',sans-serif}
.hud-rpm-end-min{bottom:6px;left:4px}
.hud-rpm-end-max{bottom:6px;right:4px}
.hud-engine-thr{font-size:11px;font-weight:700;color:#fff;font-family:'Orbitron',monospace;text-align:center;margin:1px 0;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.hud-engine-vals{display:flex;flex-direction:column;gap:0}
.hud-engine-val{display:flex;align-items:baseline;gap:3px}
.hud-engine-val-num{font-size:11px;font-weight:600;color:#fff;font-family:'Orbitron',monospace;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.hud-engine-val-lbl{font-size:7px;color:rgba(255,255,255,.35)}

/* Right Panel - Instruments side by side */
.hud-instr-col{display:flex;flex-direction:column;justify-content:flex-end;gap:4px;padding-bottom:4px}
.hud-vs-row{display:flex;align-items:center;gap:4px}
.hud-vs-header{font-size:8px;color:#fff;font-weight:600;letter-spacing:.05em}
.hud-vs-val{font-size:12px;font-weight:700;color:#79e7ff;font-family:'Orbitron',monospace;text-shadow:0 1px 3px rgba(0,0,0,.8);min-width:34px;text-align:right;line-height:1}

/* VS strip with numeric scale - aligned so its zero-line matches the altitude ticker center */
.hud-vs-col{display:flex;flex-direction:column;align-items:flex-start;padding-bottom:12px}
.hud-vs-col-top{display:flex;align-items:center;justify-content:space-between;gap:4px;font-family:'Inter',sans-serif;height:14px;width:100%;margin-bottom:2px;padding-left:10px}
.hud-vs-col-top .hud-vs-header{font-size:9px}
.hud-vs-strip{position:relative;display:flex;align-items:stretch;height:180px;width:36px}
.hud-vs-strip-bg{position:absolute;left:6px;top:0;bottom:0;width:1px;background:rgba(255,255,255,.25)}
.hud-vs-strip-zero{position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,.55);z-index:1}
.hud-vs-scale{position:relative;flex:1;display:flex;flex-direction:column;justify-content:space-between;font-size:9px;color:rgba(255,255,255,.65);font-family:'Inter',sans-serif;padding:0 2px 0 12px;line-height:1}
.hud-vs-scale span{display:block}
.hud-vs-pointer{position:absolute;left:-2px;top:50%;width:0;height:0;border-top:5px solid transparent;border-bottom:5px solid transparent;border-left:9px solid #79e7ff;transform:translateY(-50%);transition:top .12s linear;filter:drop-shadow(0 0 2px rgba(0,0,0,.7));z-index:3}

.hud-vs-bar{width:20px;height:80px;background:rgba(0,0,0,.5);position:relative;display:none}
.hud-vs-bar-fill{position:absolute;left:2px;right:2px;background:linear-gradient(to top,#50c878,#80ee90);transition:height .12s,bottom .12s,background .3s}
.hud-vs-bar-zero{position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,.25)}
.hud-vs-bar-marks{position:absolute;right:-10px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:space-between;font-size:7px;color:rgba(255,255,255,.4)}

.hud-instr-group{display:flex;flex-direction:column;gap:2px}
.hud-instr-item{display:flex;align-items:center;gap:4px}
.hud-instr-val{font-size:11px;font-weight:600;color:#fff;font-family:'Orbitron',monospace;min-width:28px;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.hud-instr-lbl{font-size:8px;color:rgba(255,255,255,.4);letter-spacing:.04em}
.hud-instr-bar{width:28px;height:4px;background:rgba(0,0,0,.4);overflow:hidden;border-radius:2px}
.hud-instr-bar-fill{height:100%;background:linear-gradient(90deg,#50c878,#80ee90);border-radius:2px}

.hud-bottom-row{display:flex;gap:6px;margin-top:3px;padding-top:2px;border-top:1px solid rgba(255,255,255,.08)}
.hud-bottom-item{display:flex;flex-direction:column;align-items:center}
.hud-bottom-val{font-size:9px;color:#fff;font-family:'Orbitron',monospace;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.hud-bottom-lbl{font-size:7px;color:rgba(255,255,255,.25)}

@media(max-width:768px){
#hfps{display:none}
#hud-utc{font-size:8px!important;letter-spacing:.08em!important}
#flight-pfd{top:26%!important;transform:translate(-50%,-50%)!important;width:272px;height:184px}
#flight-hsi{top:75%!important;width:172px!important;height:172px!important}
#gps-map{width:168px!important;height:168px!important;top:2px!important;left:2px!important}
.hud-panel-left{left:6px!important;bottom:6px!important;transform:scale(.7);transform-origin:bottom left}
.hud-panel-right{right:6px!important;bottom:6px!important;transform:scale(.7);transform-origin:bottom right}
.hud-tape-wrapper{height:140px!important;width:60px!important}
.hud-vs-strip{height:140px!important}
.hud-ticker-box{height:26px!important;font-size:15px!important;left:-6px!important;right:-6px!important}
.hud-value-main{font-size:18px!important}
.hud-rpm-gauge{width:48px!important;height:48px!important}
.hud-rpm-needle{height:18px!important}
.hud-vs-scale{font-size:8px!important}
#missions-btn{top:22px!important;right:10px!important}
#aircraft-btn{top:60px!important;right:10px!important}
#flight-plans-btn{top:98px!important;right:10px!important}
#missions-panel{top:16px!important;right:50px!important;width:260px!important;max-height:50vh!important}
#aircraft-panel{top:54px!important;right:50px!important;width:260px!important;max-height:50vh!important}
#flight-plans-panel{top:92px!important;right:50px!important;width:260px!important;max-height:50vh!important}
#nav-info{top:185px!important;left:auto!important;right:2px!important;width:140px!important;font-size:9px!important}
#ap-panel{top:auto!important;bottom:60px!important;right:50%!important;transform:translateX(50%)!important;font-size:9px!important;padding:4px 5px!important;gap:4px!important}
#ap-panel .ap-btn{padding:2px 5px!important;font-size:9px!important}
#ap-panel .ap-units{gap:6px!important}
#ap-panel .ap-display{font-size:10px!important;min-width:46px!important;padding:1px 4px!important}
#ap-panel .ap-knob{width:22px!important;height:22px!important}
#ap-panel .ap-knob-tick{height:7px!important;top:2px!important}
#instrument-dock{bottom:10px!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;padding:4px!important}
#pfd-panel{width:480px!important}
}
@media(max-width:480px){
#hud-utc{font-size:7px!important;letter-spacing:.06em!important}
#flight-pfd{top:22%!important;width:212px!important;height:143px!important}
#flight-hsi{top:73%!important;width:150px!important;height:150px!important}
#gps-map{width:132px!important;height:132px!important;top:4px!important;left:2px!important}
.hud-panel-left{left:6px!important;bottom:4px!important;transform:scale(.55);transform-origin:bottom left}
.hud-panel-right{right:6px!important;bottom:4px!important;transform:scale(.55);transform-origin:bottom right}
.hud-tape-wrapper{height:110px!important;width:56px!important}
.hud-vs-strip{height:110px!important;width:30px!important}
.hud-ticker-box{height:22px!important;font-size:13px!important;left:-4px!important;right:-4px!important}
.hud-value-main{font-size:16px!important}
.hud-vs-scale span:not(.hud-vs-scale-zero){visibility:hidden}
#h-online{display:none!important}
#missions-btn{top:6px!important;right:6px!important;width:28px!important;height:28px!important}
#aircraft-btn{top:40px!important;right:6px!important;width:28px!important;height:28px!important}
#missions-panel{top:4px!important;right:40px!important;width:200px!important;max-height:45vh!important;font-size:10px!important}
#aircraft-panel{top:38px!important;right:40px!important;width:200px!important;max-height:45vh!important;font-size:10px!important}
#flight-plans-btn{top:74px!important;right:6px!important;width:28px!important;height:28px!important}
#flight-plans-panel{top:72px!important;right:40px!important;width:200px!important;max-height:45vh!important;font-size:10px!important}
#nav-info{top:150px!important;left:auto!important;right:2px!important;width:110px!important;font-size:8px!important}
#ap-panel{top:auto!important;bottom:58px!important;right:50%!important;transform:translateX(50%)!important;font-size:8px!important;padding:3px 4px!important;gap:3px!important;max-width:96vw!important}
#ap-panel .ap-btn{padding:2px 4px!important;font-size:8px!important;letter-spacing:.02em!important}
#ap-panel .ap-units{gap:4px!important}
#ap-panel .ap-display{font-size:9px!important;min-width:40px!important;padding:1px 3px!important}
#ap-panel .ap-knob{width:20px!important;height:20px!important}
#ap-panel .ap-knob-tick{height:6px!important;top:2px!important;width:2px!important}
#instrument-dock{bottom:10px!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;padding:3px!important;gap:4px!important}
#pfd-panel{width:380px!important}
}
@media(max-height:440px){
#flight-pfd{top:24%!important;width:228px!important;height:154px!important}
#flight-hsi{top:72%!important;width:160px!important;height:160px!important}
#gps-map{width:120px!important;height:120px!important;top:2px!important;left:2px!important}
#hud-utc{font-size:7px!important}
.hud-panel-left{left:6px!important;bottom:4px!important;transform:scale(.6);transform-origin:bottom left}
.hud-panel-right{right:6px!important;bottom:4px!important;transform:scale(.6);transform-origin:bottom right}
#instrument-dock{bottom:8px!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important}
#pfd-panel{bottom:6px!important;width:560px!important}
}

</style>
<div class="hp" id="hl"></div>
<div class="hp" id="hr"></div>
<div style="position:absolute;top:4px;right:6px;display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:10px;font-family:'Inter',sans-serif;padding:4px 6px">
  <div id="hfps" style="color:rgba(100,240,180,.4)"></div>
  <div id="h-online" style="color:rgba(100,240,180,.4)">0 ONLINE</div>
</div>
<div id="hud-utc" style="position:absolute;top:2px;left:50%;transform:translateX(-50%);font-size:11px;font-family:'Orbitron',monospace;color:rgba(100,240,180,.7);letter-spacing:.12em;text-shadow:0 0 6px rgba(0,0,0,.8)"></div>
<div class="hp" id="hw">&#9888; STALL &#9888;</div>
<div id="ap-panel" style="position:absolute;top:38px;right:54px;display:flex;flex-direction:column;gap:6px;font-family:'Orbitron',monospace;font-size:10px;color:#aac;background:rgba(0,8,16,.65);padding:6px 7px;border:1px solid rgba(80,180,255,.3);border-radius:5px;z-index:50;pointer-events:auto">
  <div style="display:flex;gap:4px;justify-content:center">
    <button id="ap-btn-ap"  type="button" class="ap-btn">AP</button>
    <button id="ap-btn-nav" type="button" class="ap-btn">NAV</button>
    <button id="ap-btn-apr" type="button" class="ap-btn">APR</button>
  </div>
  <div class="ap-units">
    <div class="ap-unit">
      <div class="ap-display"><span id="ap-tgt-hdg" title="Clique para editar (0-359)">---</span></div>
      <div class="ap-knob" id="ap-knob-hdg" title="Rolar para ajustar (Shift = passo grande, clique direito = -)"><div class="ap-knob-inner"><div class="ap-knob-tick"></div></div></div>
      <button id="ap-btn-hdg" type="button" class="ap-btn">HDG</button>
    </div>
    <div class="ap-unit">
      <div class="ap-display"><span id="ap-tgt-alt" title="Clique para editar (ft)">-----</span></div>
      <div class="ap-knob" id="ap-knob-alt" title="Rolar para ajustar (Shift = passo grande, clique direito = -)"><div class="ap-knob-inner"><div class="ap-knob-tick"></div></div></div>
      <button id="ap-btn-alt" type="button" class="ap-btn">ALT</button>
    </div>
    <div class="ap-unit">
      <div class="ap-display"><span id="ap-tgt-vs" title="Clique para editar (ft/min)">----</span></div>
      <div class="ap-knob" id="ap-knob-vs" title="Rolar para ajustar (Shift = passo grande, clique direito = -)"><div class="ap-knob-inner"><div class="ap-knob-tick"></div></div></div>
      <button id="ap-btn-vs" type="button" class="ap-btn">VS</button>
    </div>
  </div>
</div>
<div id="crash-overlay" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(180,0,0,.35);z-index:500;pointer-events:none">
  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
    <div style="font-family:'Orbitron',monospace;font-size:36px;color:#ff2200;letter-spacing:.3em;text-shadow:0 0 30px rgba(255,0,0,.8);animation:stallPulse 0.8s ease-in-out infinite">CRASHED</div>
    <div style="font-family:'Inter',sans-serif;font-size:12px;color:rgba(255,255,255,.5);margin-top:12px;letter-spacing:.1em">Respawning...</div>
  </div>
</div>

<!-- Left Panel - Airspeed & Engine side by side -->
<div class="hud-panel-left">
  <div class="hud-tape-col">
    <div class="hud-header hud-cyan">IRSPD<span class="hud-header-sub hud-cyan" style="opacity:.85">KTS</span></div>
    <div class="hud-tape-section">
      <div class="hud-tape-wrapper">
        <div class="hud-tape">
          <div class="hud-tape-fill-spd" id="hud-spd-tape" style="height:50%"></div>
        </div>
        <div class="hud-tape-marks hud-tape-marks-left" id="hud-spd-marks"></div>
        <div class="hud-ticker-box" id="hud-spd-ticker">
          <span class="hud-ticker-static" id="hud-spd-h">0</span><span class="hud-ticker-static" id="hud-spd-t">0</span><span class="hud-ticker-rolling"><span class="hud-ticker-rolling-inner" id="hud-spd-u-inner"><span>0</span><span>1</span></span></span>
        </div>
      </div>
    </div>
    <div class="hud-value-row" style="display:none">
      <span class="hud-value-main" id="bb-spd-v">0</span>
    </div>
    <div class="hud-sub-row">
      <span class="hud-sub-label">IAS</span>
      <span class="hud-sub-val"><span id="hud-ias-v">0</span>KT</span>
    </div>
    <div class="hud-sub-row">
      <span class="hud-sub-label">TAS</span>
      <span class="hud-sub-val"><span id="hud-tas-v">0</span>KT</span>
    </div>
    <div class="hud-sub-row">
      <span class="hud-sub-label">GS</span>
      <span class="hud-sub-val"><span id="hud-gs-v">0</span>KT</span>
    </div>
  </div>
  <div class="hud-engine-col" id="hud-engine1-col">
    <div class="hud-engine-title">ENGINE #1</div>
    <div class="hud-engine-content">
      <div class="hud-rpm-gauge">
        <div class="hud-rpm-bg"></div>
        <div class="hud-rpm-needle" id="hud-rpm-needle"></div>
        <div class="hud-rpm-center"></div>
        <div class="hud-rpm-label">LVR<br>A/THR</div>
        <div class="hud-rpm-end hud-rpm-end-min">0</div>
        <div class="hud-rpm-end hud-rpm-end-max">110</div>
      </div>
      <div class="hud-engine-thr" id="hud-eng1-pct">0%</div>
      <div class="hud-engine-vals">
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-rpm-v">0</span><span class="hud-engine-val-lbl">RPM</span></div>
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-fuel-v">100%</span><span class="hud-engine-val-lbl">FUEL</span></div>
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-aoa-v">0&deg;</span><span class="hud-engine-val-lbl">AOA</span></div>
      </div>
    </div>
  </div>
  <div class="hud-engine-col" id="hud-engine2-col" style="display:none">
    <div class="hud-engine-title">ENGINE #2</div>
    <div class="hud-engine-content">
      <div class="hud-rpm-gauge">
        <div class="hud-rpm-bg"></div>
        <div class="hud-rpm-needle" id="hud-rpm-needle2"></div>
        <div class="hud-rpm-center"></div>
        <div class="hud-rpm-label">LVR<br>A/THR</div>
        <div class="hud-rpm-end hud-rpm-end-min">0</div>
        <div class="hud-rpm-end hud-rpm-end-max">110</div>
      </div>
      <div class="hud-engine-thr" id="hud-eng2-pct">0%</div>
      <div class="hud-engine-vals">
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-rpm2-v">0</span><span class="hud-engine-val-lbl">RPM</span></div>
      </div>
    </div>
  </div>
  <div class="hud-engine-col" id="hud-engine3-col" style="display:none">
    <div class="hud-engine-title">ENGINE #3</div>
    <div class="hud-engine-content">
      <div class="hud-rpm-gauge">
        <div class="hud-rpm-bg"></div>
        <div class="hud-rpm-needle" id="hud-rpm-needle3"></div>
        <div class="hud-rpm-center"></div>
        <div class="hud-rpm-label">LVR<br>A/THR</div>
        <div class="hud-rpm-end hud-rpm-end-min">0</div>
        <div class="hud-rpm-end hud-rpm-end-max">110</div>
      </div>
      <div class="hud-engine-thr" id="hud-eng3-pct">0%</div>
      <div class="hud-engine-vals">
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-rpm3-v">0</span><span class="hud-engine-val-lbl">RPM</span></div>
      </div>
    </div>
  </div>
  <div class="hud-engine-col" id="hud-engine4-col" style="display:none">
    <div class="hud-engine-title">ENGINE #4</div>
    <div class="hud-engine-content">
      <div class="hud-rpm-gauge">
        <div class="hud-rpm-bg"></div>
        <div class="hud-rpm-needle" id="hud-rpm-needle4"></div>
        <div class="hud-rpm-center"></div>
        <div class="hud-rpm-label">LVR<br>A/THR</div>
        <div class="hud-rpm-end hud-rpm-end-min">0</div>
        <div class="hud-rpm-end hud-rpm-end-max">110</div>
      </div>
      <div class="hud-engine-thr" id="hud-eng4-pct">0%</div>
      <div class="hud-engine-vals">
        <div class="hud-engine-val"><span class="hud-engine-val-num" id="hud-rpm4-v">0</span><span class="hud-engine-val-lbl">RPM</span></div>
      </div>
    </div>
  </div>
</div>

<!-- Right Panel - Altitude & Instruments side by side -->
<div class="hud-panel-right">
  <div class="hud-instr-col">
    <div class="hud-instr-group">
      <div class="hud-instr-item"><span class="hud-instr-val" id="bb-flp">OFF</span><span class="hud-instr-lbl">FLAPS</span></div>
      <div class="hud-instr-item"><span class="hud-instr-val" id="bb-brk">OFF</span><span class="hud-instr-lbl">BRK</span></div>
      <div class="hud-instr-item" id="hud-gear-row" style="display:none"><span class="hud-instr-val" id="hud-gear-state">DOWN</span><span class="hud-instr-lbl">GEAR</span></div>
      <div class="hud-instr-item"><span class="hud-instr-val" id="hud-trim-v">0</span><span class="hud-instr-lbl">TRIM</span></div>
      <div class="hud-instr-item"><span class="hud-instr-val" id="hud-thr-pct" style="min-width:22px">0%</span><div class="hud-instr-bar"><div class="hud-instr-bar-fill" id="bb-thr" style="width:0%"></div></div><span class="hud-instr-lbl">THR</span><span class="hud-instr-ab" id="hud-ab-tag" style="display:none;margin-left:4px;padding:1px 4px;border:1px solid #ff5a00;color:#ff5a00;font-weight:bold;border-radius:3px;font-size:.85em">AB</span></div>
      <div class="hud-instr-item" id="hud-ap-row"><span class="hud-instr-val" id="hud-ap-state" style="color:#888">OFF</span><span class="hud-instr-lbl">AP</span></div>
      <div class="hud-instr-item" id="hud-spoiler-row"><span class="hud-instr-val" id="hud-spoiler-state" style="color:#888">--</span><span class="hud-instr-lbl">SPL</span></div>
      <div class="hud-instr-item" id="hud-engs-row"><span class="hud-instr-val" id="hud-engs-state" style="color:#40ff80">OK</span><span class="hud-instr-lbl">ENG</span></div>
    </div>
    <div class="hud-bottom-row">
      <div class="hud-bottom-item"><span class="hud-bottom-val" id="hud-hdg-v">0&deg;</span><span class="hud-bottom-lbl">HDG</span></div>
      <div class="hud-bottom-item"><span class="hud-bottom-val" id="bb-att">LEVEL</span><span class="hud-bottom-lbl">ATT</span></div>
    </div>
  </div>
  <div class="hud-tape-col">
    <div class="hud-header hud-cyan" style="text-align:right">ALTITUDE</div>
    <div class="hud-alt-sel" id="hud-alt-sel">5000</div>
    <div class="hud-tape-section">
      <div class="hud-tape-wrapper">
        <div class="hud-tape">
          <div class="hud-tape-fill-alt" id="hud-alt-tape" style="height:50%"></div>
        </div>
        <div class="hud-tape-marks hud-tape-marks-right" id="hud-alt-marks"></div>
        <div class="hud-ticker-box" id="hud-alt-ticker">
          <span class="hud-ticker-static" id="hud-alt-h">0</span><span class="hud-ticker-static" id="hud-alt-t">0</span><span class="hud-ticker-static" id="hud-alt-u">0</span><span class="hud-ticker-small"><span class="hud-ticker-static" id="hud-alt-tens">0</span><span class="hud-ticker-rolling"><span class="hud-ticker-rolling-inner" id="hud-alt-units-inner"><span>0</span><span>1</span></span></span></span>
        </div>
      </div>
    </div>
    <div class="hud-sub-row" style="justify-content:flex-end">
      <span class="hud-sub-val"><span id="hud-baro-v">29.92</span> IN</span>
    </div>
    <div class="hud-value-row" style="justify-content:flex-end;display:none">
      <span class="hud-value-main" id="bb-alt-v">0</span>
    </div>
  </div>
  <div class="hud-vs-col">
    <div class="hud-vs-col-top">
      <span class="hud-vs-header">VS</span>
      <span class="hud-vs-val" id="hud-vs-v">0</span>
    </div>
    <div class="hud-vs-strip">
      <div class="hud-vs-strip-bg"></div>
      <div class="hud-vs-strip-zero"></div>
      <div class="hud-vs-pointer" id="hud-vs-pointer"></div>
      <div class="hud-vs-scale">
        <span>6</span>
        <span>4</span>
        <span>2</span>
        <span class="hud-vs-scale-zero" style="visibility:hidden">0</span>
        <span>-2</span>
        <span>-4</span>
        <span>-6</span>
      </div>
      <div class="hud-vs-bar" style="display:none"><div class="hud-vs-bar-fill" id="hud-vs-bar" style="height:0;bottom:50%"></div></div>
    </div>
  </div>
</div>

<canvas id="flight-pfd" width="340" height="230" style="position:absolute;top:28%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:2;opacity:.72"></canvas>
<canvas id="flight-hsi" width="200" height="200" style="position:absolute;top:77%;left:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:2;opacity:.82"></canvas>
<div id="gps-map" style="position:absolute;top:4px;left:4px;width:216px;height:216px;border-radius:10px;overflow:hidden;box-shadow:0 0 20px rgba(0,255,128,.12);background:rgba(0,20,15,.6);pointer-events:auto;touch-action:none">
  <img id="gps-map-img" style="position:absolute;top:-50%;left:-50%;width:200%;height:200%;object-fit:cover;opacity:0.9;will-change:transform;pointer-events:none;user-select:none" draggable="false">
  <canvas id="gps-map-hdg" width="216" height="216" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
  <div id="gps-map-handle" title="Arrastar GPS" style="position:absolute;top:0;left:0;right:0;height:14px;background:linear-gradient(to bottom,rgba(80,255,160,.18),rgba(80,255,160,0));cursor:grab;display:flex;align-items:center;justify-content:center;font-size:8px;letter-spacing:.18em;color:rgba(100,240,180,.7);font-family:'Inter',sans-serif;text-shadow:0 0 4px rgba(0,0,0,.8);user-select:none">GPS &#x2022;&#x2022;&#x2022;</div>
  <div id="gps-zoom-controls" style="position:absolute;top:18px;right:4px;display:flex;flex-direction:column;gap:2px;z-index:2">
    <button id="gps-zoom-in" title="Aumentar zoom" type="button" style="width:18px;height:18px;padding:0;border:1px solid rgba(80,255,160,.45);background:rgba(2,10,20,.75);color:rgba(100,240,180,.95);font-family:'Orbitron',monospace;font-size:14px;line-height:1;cursor:pointer;border-radius:3px;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:none">+</button>
    <button id="gps-zoom-out" title="Diminuir zoom" type="button" style="width:18px;height:18px;padding:0;border:1px solid rgba(80,255,160,.45);background:rgba(2,10,20,.75);color:rgba(100,240,180,.95);font-family:'Orbitron',monospace;font-size:14px;line-height:1;cursor:pointer;border-radius:3px;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:none">&#8722;</button>
    <div id="gps-zoom-val" style="width:18px;text-align:center;font-size:8px;color:rgba(100,240,180,.7);font-family:'Inter',sans-serif;text-shadow:0 0 4px rgba(0,0,0,.8);user-select:none;pointer-events:none">12</div>
    <button id="gps-mode-toggle" title="Alternar modo do mapa (Norte/Heading)" type="button" style="width:18px;height:18px;padding:0;margin-top:4px;border:1px solid rgba(80,255,160,.45);background:rgba(2,10,20,.75);color:rgba(100,240,180,.95);font-family:'Orbitron',monospace;font-size:9px;line-height:1;cursor:pointer;border-radius:3px;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:none">N</button>
  </div>
  <div id="gps-coords" style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-size:8px;color:rgba(100,240,180,.6);font-family:'Inter',sans-serif;text-shadow:0 0 4px rgba(0,0,0,.8);white-space:nowrap;pointer-events:none"></div>
</div>

<div id="missions-btn" style="position:absolute;top:74px;right:14px;width:32px;height:32px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;transition:border-color .2s,box-shadow .2s" title="Missions">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#40ffaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="12,2 15,10 12,8 9,10"/><circle cx="12" cy="12" r="3"/></svg>
</div>

<div id="missions-panel" class="game-panel" style="display:none;position:absolute;top:64px;right:54px;width:320px;height:400px;background:rgba(2,10,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.3);border-radius:8px;pointer-events:auto;font-family:'Inter',sans-serif;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:300">
  <div class="panel-handle" id="missions-panel-handle" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;cursor:grab;border-bottom:1px solid rgba(80,255,160,.15);user-select:none;touch-action:none">
    <span class="panel-title" style="font-family:'Orbitron',monospace;font-size:11px;color:#40ffaa;letter-spacing:.12em">MISSIONS</span>
    <div style="display:flex;gap:4px">
      <button class="panel-pin" data-panel="missions-panel" title="Fixar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u25CB</button>
      <button class="panel-min" data-panel="missions-panel" title="Minimizar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">_</button>
      <button class="panel-close" data-panel="missions-panel" data-btn="missions-btn" title="Fechar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u00D7</button>
    </div>
  </div>
  <div class="panel-toolbar" style="display:flex;gap:4px;padding:6px 10px;border-bottom:1px solid rgba(80,255,160,.08)">
    <input id="missions-search" type="text" placeholder="Buscar..." style="flex:1;min-width:0;padding:3px 6px;font-size:10px;background:rgba(0,20,15,.5);border:1px solid rgba(80,255,160,.25);border-radius:3px;color:#fff;outline:none">
    <select id="missions-sort" style="padding:3px 4px;font-size:10px;background:rgba(0,20,15,.5);border:1px solid rgba(80,255,160,.25);border-radius:3px;color:#fff;outline:none">
      <option value="status">Status</option>
      <option value="title">Nome</option>
      <option value="difficulty">Dificuldade</option>
      <option value="distance">Dist\u00E2ncia</option>
    </select>
  </div>
  <div class="panel-body" style="overflow-y:auto;padding:10px;height:calc(100% - 78px)">
    <div id="missions-list" style="font-size:11px;color:rgba(255,255,255,.7)">Loading...</div>
  </div>
  <div class="panel-resize" data-panel="missions-panel" style="position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,rgba(80,255,160,.5) 50%,rgba(80,255,160,.5) 60%,transparent 60%,transparent 70%,rgba(80,255,160,.5) 70%,rgba(80,255,160,.5) 80%,transparent 80%);touch-action:none"></div>
</div>

<div id="aircraft-btn" style="position:absolute;top:112px;right:14px;width:32px;height:32px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;transition:border-color .2s,box-shadow .2s" title="Aircraft">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#40ffaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12l5-3v2h4l1-5h2l1 5h4v-2l5 3-5 3v-2h-4l-1 5h-2l-1-5H7v2z"/></svg>
</div>

<div id="aircraft-panel" class="game-panel" style="display:none;position:absolute;top:102px;right:54px;width:320px;height:400px;background:rgba(2,10,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.3);border-radius:8px;pointer-events:auto;font-family:'Inter',sans-serif;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:300">
  <div class="panel-handle" id="aircraft-panel-handle" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;cursor:grab;border-bottom:1px solid rgba(80,255,160,.15);user-select:none;touch-action:none">
    <span class="panel-title" style="font-family:'Orbitron',monospace;font-size:11px;color:#40ffaa;letter-spacing:.12em">AIRCRAFT</span>
    <div style="display:flex;gap:4px">
      <button class="panel-pin" data-panel="aircraft-panel" title="Fixar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u25CB</button>
      <button class="panel-min" data-panel="aircraft-panel" title="Minimizar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">_</button>
      <button class="panel-close" data-panel="aircraft-panel" data-btn="aircraft-btn" title="Fechar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u00D7</button>
    </div>
  </div>
  <div class="panel-body" style="overflow-y:auto;padding:10px;height:calc(100% - 36px)">
    <div id="aircraft-list" style="font-size:11px;color:rgba(255,255,255,.7)">Loading...</div>
  </div>
  <div class="panel-resize" data-panel="aircraft-panel" style="position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,rgba(80,255,160,.5) 50%,rgba(80,255,160,.5) 60%,transparent 60%,transparent 70%,rgba(80,255,160,.5) 70%,rgba(80,255,160,.5) 80%,transparent 80%);touch-action:none"></div>
</div>

<div id="flight-plans-btn" style="position:absolute;top:150px;right:14px;width:32px;height:32px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;transition:border-color .2s,box-shadow .2s" title="Flight Plans">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#40ffaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h4l3-4 4 4h7"/><path d="M3 17h4l3 4 4-4h7"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
</div>

<div id="flight-plans-panel" class="game-panel" style="display:none;position:absolute;top:140px;right:54px;width:320px;height:400px;background:rgba(2,10,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.3);border-radius:8px;pointer-events:auto;font-family:'Inter',sans-serif;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.6);z-index:300">
  <div class="panel-handle" id="flight-plans-panel-handle" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;cursor:grab;border-bottom:1px solid rgba(80,255,160,.15);user-select:none;touch-action:none">
    <span class="panel-title" style="font-family:'Orbitron',monospace;font-size:11px;color:#40ffaa;letter-spacing:.12em">FLIGHT PLANS</span>
    <div style="display:flex;gap:4px">
      <button class="panel-pin" data-panel="flight-plans-panel" title="Fixar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u25CB</button>
      <button class="panel-min" data-panel="flight-plans-panel" title="Minimizar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">_</button>
      <button class="panel-close" data-panel="flight-plans-panel" data-btn="flight-plans-btn" title="Fechar" style="width:20px;height:20px;padding:0;border:1px solid rgba(80,255,160,.3);background:rgba(0,20,15,.4);color:#40ffaa;font-size:11px;cursor:pointer;border-radius:3px">\u00D7</button>
    </div>
  </div>
  <div class="panel-body" style="overflow-y:auto;padding:10px;height:calc(100% - 36px)">
    <div id="flight-plans-list" style="font-size:11px;color:rgba(255,255,255,.7)">Loading...</div>
  </div>
  <div class="panel-resize" data-panel="flight-plans-panel" style="position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,rgba(80,255,160,.5) 50%,rgba(80,255,160,.5) 60%,transparent 60%,transparent 70%,rgba(80,255,160,.5) 70%,rgba(80,255,160,.5) 80%,transparent 80%);touch-action:none"></div>
</div>

<div id="instrument-dock" style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:6px;background:rgba(2,10,20,.85);backdrop-filter:blur(12px);border:1px solid rgba(80,255,160,.3);border-radius:8px;pointer-events:auto;box-shadow:0 0 12px rgba(0,255,128,.1);z-index:250">
  <div id="pfd-btn" style="width:32px;height:32px;background:rgba(2,10,20,.6);border:1px solid rgba(80,255,160,.3);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;transition:border-color .2s,box-shadow .2s" title="PFD (Shift+I)">
    <svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#40ffaa" stroke-width="1.6"/><path d="M3.6 12a8.4 8.4 0 0 1 16.8 0z" fill="#2e6db4"/><path d="M3.6 12a8.4 8.4 0 0 0 16.8 0z" fill="#6b4a2a"/><circle cx="12" cy="12" r="9" fill="none" stroke="#40ffaa" stroke-width="1.6"/><line x1="7" y1="12" x2="17" y2="12" stroke="#fff" stroke-width="1.4"/><circle cx="12" cy="12" r="1.2" fill="#fff"/></svg>
  </div>
  <div id="ap-toggle-btn" style="width:32px;height:32px;background:rgba(2,10,20,.6);border:1px solid rgba(80,180,255,.4);border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:auto;font-family:'Orbitron',monospace;font-size:11px;letter-spacing:.04em;color:#9cf;transition:border-color .2s,box-shadow .2s,color .2s" title="Piloto autom\u00E1tico (AP)">AP</div>
</div>

<div id="pfd-panel" class="game-panel" style="display:none;position:absolute;bottom:60px;left:50%;transform:translateX(-50%);width:800px;aspect-ratio:1024 / 652;background:url('src/game/assets/textures/g1000_bezel.png') center/100% 100% no-repeat;pointer-events:auto;font-family:'Inter',sans-serif;color:#fff;filter:drop-shadow(0 8px 32px rgba(0,0,0,.6));z-index:300">
  <div class="panel-handle" id="pfd-panel-handle" style="position:absolute;top:0;left:12.4%;width:75.1%;height:9%;cursor:grab;user-select:none;touch-action:none"></div>
  <button class="panel-close" data-panel="pfd-panel" data-btn="pfd-btn" title="Fechar" style="position:absolute;top:1.5%;right:1.5%;width:18px;height:18px;padding:0;border:1px solid rgba(80,255,160,.45);background:rgba(0,20,15,.65);color:#40ffaa;font-size:11px;line-height:1;cursor:pointer;border-radius:3px;z-index:2">\u00D7</button>
  <canvas id="pfd-panel-canvas" width="769" height="517" style="position:absolute;left:12.40%;top:10.12%;width:75.10%;height:79.29%;display:block"></canvas>
</div>

<div id="nav-info" style="display:none;position:absolute;top:340px;left:4px;width:210px;background:rgba(2,10,20,.85);border:1px solid rgba(80,255,160,.3);border-radius:6px;padding:6px 8px;font-family:'Inter',sans-serif;color:#fff;font-size:10px;cursor:grab;box-shadow:0 0 12px rgba(0,255,128,.1)">
  <div style="font-family:'Orbitron',monospace;font-size:8px;color:#40ffaa;letter-spacing:.15em;margin-bottom:3px">NAV</div>
  <div id="nav-leg-block" style="display:none;border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:3px;margin-bottom:3px">
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">WPT</span><span id="nav-wpt-name" style="color:#fff">\u2014</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">LEG</span><span id="nav-leg-idx" style="color:#fff">\u2014</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">DIST</span><span id="nav-leg-dist" style="color:#40ffaa">\u2014 nm</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">BRG</span><span id="nav-leg-brg" style="color:#40ffaa">\u2014\u00B0</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">HDG\u0394</span><span id="nav-hdg-delta" style="color:#40ffaa">\u2014</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">XTE</span><span id="nav-xte-val" style="color:#40ffaa">\u2014</span></div>
    <div id="nav-xte-bar-wrap" style="position:relative;height:5px;background:rgba(255,255,255,.08);border-radius:2px;margin:2px 0">
      <div id="nav-xte-bar-mid" style="position:absolute;left:50%;top:-1px;width:1px;height:7px;background:rgba(255,255,255,.5)"></div>
      <div id="nav-xte-bar-dot" style="position:absolute;left:50%;top:0;width:5px;height:5px;background:#40ffaa;border-radius:50%;transform:translateX(-2.5px);transition:left .15s linear"></div>
    </div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">TGT</span><span id="nav-tgt-alt" style="color:#fff">\u2014</span></div>
    <div id="nav-alt-band-wrap" style="display:none;position:relative;height:5px;background:rgba(255,255,255,.08);border-radius:2px;margin:2px 0">
      <div id="nav-alt-band-mid" style="position:absolute;left:50%;top:-1px;width:1px;height:7px;background:rgba(255,255,255,.5)"></div>
      <div id="nav-alt-band-dot" style="position:absolute;left:50%;top:0;width:5px;height:5px;background:#40ffaa;border-radius:50%;transform:translateX(-2.5px);transition:left .15s linear"></div>
    </div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">ETE</span><span id="nav-ete" style="color:#fff">\u2014</span></div>
    <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">ETA</span><span id="nav-eta" style="color:#fff">\u2014</span></div>
  </div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">DEST</span><span id="nav-dest" style="color:#fff">\u2014</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">DIST</span><span id="nav-dist" style="color:#40ffaa">\u2014 km</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">BRG</span><span id="nav-brg" style="color:#40ffaa">\u2014\u00B0</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">TOTAL</span><span id="nav-total-dist" style="color:#40ffaa">\u2014</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">WIND</span><span id="nav-wind" style="color:#40ffaa">\u2014</span></div>
  <div style="display:flex;justify-content:space-between"><span style="color:rgba(255,255,255,.4)">GS</span><span id="nav-gs" style="color:#40ffaa">\u2014 kt</span></div>
</div>`;
        document.body.appendChild(hud);
        const panelLeft = hud.querySelector<HTMLElement>('.hud-panel-left');
        const panelRight = hud.querySelector<HTMLElement>('.hud-panel-right');
        const apPanel = hud.querySelector<HTMLElement>('#ap-panel');
        if (panelLeft) this.scene._makeDraggable(panelLeft);
        if (panelRight) this.scene._makeDraggable(panelRight);
        if (apPanel) this.scene._makeDraggable(apPanel);
        const navPanel = hud.querySelector<HTMLElement>('#nav-info');
        if (navPanel) this.scene._makeDraggable(navPanel);
        this.scene.hudCanvas = document.getElementById('flight-pfd') as HTMLCanvasElement;
        this.scene.hudCtx    = this.scene.hudCanvas.getContext('2d')!;
        this.scene.hudSpeedVal = document.getElementById('bb-spd-v')!;
        this.scene.hudAltVal   = document.getElementById('bb-alt-v')!;
        this.scene.hudThrottle = document.getElementById('bb-thr')!;
        this.scene.hudThrPct   = document.getElementById('hud-thr-pct')!;
        this.scene.hudAbTag    = document.getElementById('hud-ab-tag');
        this.scene.hudAttitude = document.getElementById('bb-att')!;
        this.scene.hudWarning  = document.getElementById('hw')!;
        this.scene._crashOverlayEl = document.getElementById('crash-overlay');
        this.scene.hudFps      = document.getElementById('hfps')!;
        this.scene.hudOnline   = document.getElementById('h-online')!;
        this.scene.hudFlapVal  = document.getElementById('bb-flp')!;
        this.scene.hudFlapBar  = document.getElementById('bb-flp')!;
        this.scene.hudBrakeVal = document.getElementById('bb-brk')!;
        this.scene.hudGearRow  = document.getElementById('hud-gear-row')!;
        this.scene.hudGearState = document.getElementById('hud-gear-state')!;
        this.scene.hudTasVal   = document.getElementById('hud-tas-v')!;
        this.scene.hudGsVal    = document.getElementById('hud-gs-v');
        this.scene.hudIasVal   = document.getElementById('hud-ias-v');
        this.scene.hudApState  = document.getElementById('hud-ap-state');
        this.scene.hudSpoilerState = document.getElementById('hud-spoiler-state');
        this.scene.hudEngsState    = document.getElementById('hud-engs-state');
        this.scene._wireAutopilotPanel();
        this.scene.hudRpmVal   = document.getElementById('hud-rpm-v')!;
        this.scene.hudRpmNeedle = document.getElementById('hud-rpm-needle')!;
        this.scene.hudFuelVal  = document.getElementById('hud-fuel-v')!;
        this.scene.hudAoaVal   = document.getElementById('hud-aoa-v')!;
        this.scene.hudVsVal    = document.getElementById('hud-vs-v')!;
        this.scene.hudTrimVal  = document.getElementById('hud-trim-v')!;
        this.scene.hudBaroVal  = document.getElementById('hud-baro-v')!;
        this.scene.hudHdgVal   = document.getElementById('hud-hdg-v')!;
        this.scene.hudAltTape  = document.getElementById('hud-alt-tape')!;
        this.scene.hudSpdTape  = document.getElementById('hud-spd-tape')!;
        this.scene.hudSpdMarks = document.getElementById('hud-spd-marks')!;
        this.scene.hudAltMarks = document.getElementById('hud-alt-marks')!;
        this.scene.hudVsBar    = document.getElementById('hud-vs-bar')!;
        this.scene.hudSpdH        = document.getElementById('hud-spd-h');
        this.scene.hudSpdT        = document.getElementById('hud-spd-t');
        this.scene.hudSpdUInner   = document.getElementById('hud-spd-u-inner');
        this.scene.hudAltH        = document.getElementById('hud-alt-h');
        this.scene.hudAltT        = document.getElementById('hud-alt-t');
        this.scene.hudAltU        = document.getElementById('hud-alt-u');
        this.scene.hudAltTens     = document.getElementById('hud-alt-tens');
        this.scene.hudAltUnitsInner = document.getElementById('hud-alt-units-inner');
        this.scene.hudAltSel      = document.getElementById('hud-alt-sel');
        this.scene.hudVsPointer   = document.getElementById('hud-vs-pointer');
        this.scene.hudEngine2Col  = document.getElementById('hud-engine2-col');
        this.scene.hudEngine3Col  = document.getElementById('hud-engine3-col');
        this.scene.hudEngine4Col  = document.getElementById('hud-engine4-col');
        this.scene.hudRpmVal2     = document.getElementById('hud-rpm2-v');
        this.scene.hudRpmVal3     = document.getElementById('hud-rpm3-v');
        this.scene.hudRpmVal4     = document.getElementById('hud-rpm4-v');
        this.scene.hudRpmNeedle2  = document.getElementById('hud-rpm-needle2');
        this.scene.hudRpmNeedle3  = document.getElementById('hud-rpm-needle3');
        this.scene.hudRpmNeedle4  = document.getElementById('hud-rpm-needle4');
        this.scene.hudEng1Pct     = document.getElementById('hud-eng1-pct');
        this.scene.hudEng2Pct     = document.getElementById('hud-eng2-pct');
        this.scene.hudEng3Pct     = document.getElementById('hud-eng3-pct');
        this.scene.hudEng4Pct     = document.getElementById('hud-eng4-pct');
        this.scene._updateEngineColumnsVisibility();
        this.scene.hudUtc      = document.getElementById('hud-utc')!;
        this.scene.mapImg      = document.getElementById('gps-map-img') as HTMLImageElement;
        this.scene.mapHeadingCanvas = document.getElementById('gps-map-hdg') as HTMLCanvasElement;
        this.scene._mapHdgCtx  = this.scene.mapHeadingCanvas.getContext('2d');
        this.scene._setupMinimapDrag();

        this.scene._missionBtnEl = document.getElementById('missions-btn');
        this.scene._missionPanelEl = document.getElementById('missions-panel');
        this.scene._setupMissionsBtn();

        this.scene._aircraftBtnEl = document.getElementById('aircraft-btn');
        this.scene._aircraftPanelEl = document.getElementById('aircraft-panel');
        this.scene._setupAircraftBtn();

        this.scene._flightPlansBtnEl = document.getElementById('flight-plans-btn');
        this.scene._flightPlansPanelEl = document.getElementById('flight-plans-panel');
        this.scene._setupFlightPlansBtn();

        this.scene._setupPanelControls();
        this.setupPfdPanel();
        this.setupAutopilotToggle();

        this.scene._navInfoEl = document.getElementById('nav-info');
        this.scene._navDestEl = document.getElementById('nav-dest');
        this.scene._navDistEl = document.getElementById('nav-dist');
        this.scene._navBrgEl  = document.getElementById('nav-brg');

        this.scene._initTapeMarks();
        this.scene._initFlapBar();
        this.scene._buildDebugPanel();
    }

    setText(id: string, text: string): void {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    setHtml(id: string, html: string): void {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }

    setStyle(id: string, prop: string, value: string): void {
        const el = document.getElementById(id);
        if (el) (el.style as unknown as Record<string, string>)[prop] = value;
    }

    updateNavInfo(lat: number, lon: number): void {
        if (!this.scene._navInfoEl) return;

        const nav = this.scene._activeFlightPlanNav ?? this.scene._missionDestForNav();
        if (!nav) {
            this.scene._navInfoEl.style.display = 'none';
            return;
        }

        this.scene._navInfoEl.style.display = 'block';

        const totalDistNm = this.scene._haversineNm(lat, lon, nav.arrival_lat, nav.arrival_lon);
        const totalBrgDeg = this.scene._initialBearingDeg(lat, lon, nav.arrival_lat, nav.arrival_lon);
        const magVarHere = this.scene._magneticVariationDeg(lat, lon);
        const totalBrgMag = ((totalBrgDeg - magVarHere) + 360) % 360;
        if (this.scene._navDestEl) this.scene._navDestEl.textContent = nav.arrival_icao || '\u2014';
        if (this.scene._navDistEl) {
            const distUnits = UiPreferences.get().unitSystem;
            this.scene._navDistEl.textContent = distUnits === _C.UNIT_SYSTEM_METRIC
                ? `${Math.round(totalDistNm * 1.852)} km`
                : `${Math.round(totalDistNm)} nm`;
        }
        if (this.scene._navBrgEl) this.scene._navBrgEl.textContent = `${Math.round(totalBrgMag)}\u00B0M`;
        this.scene._setText('nav-total-dist', `${totalDistNm.toFixed(1)} nm`);

        const gsKt = this.scene.groundSpeed * 1.944;
        this.scene._setText('nav-gs', `${Math.round(gsKt)} kt`);

        const altMslFt = this.scene.planeRoot ? Math.max(0, (this.scene.refAlt + this.scene.planeRoot.position.y) * 3.28084) : 0;
        const wind = this.scene._getWindAtAltitude(altMslFt);

        const trackDeg = this.scene.groundSpeed > MIN_GS_FOR_ETE_MS && Number.isFinite(this.scene.velocity.x) && Number.isFinite(this.scene.velocity.z)
            ? ((Math.atan2(this.scene.velocity.x, this.scene.velocity.z) * 180 / Math.PI) + 360) % 360
            : totalBrgDeg;
        const windAngleRad = (wind.dirDeg - trackDeg) * Math.PI / 180;
        const headComp = -wind.speedKt * Math.cos(windAngleRad);
        const crossComp = wind.speedKt * Math.sin(windAngleRad);
        const headSign = headComp >= 0 ? 'H+' : 'H-';
        const crossSign = crossComp >= 0 ? 'X+' : 'X-';
        this.scene._setText('nav-wind', `${String(Math.round(wind.dirDeg)).padStart(3, '0')}/${Math.round(wind.speedKt).toString().padStart(2, '0')} ${headSign}${Math.abs(headComp).toFixed(0)} ${crossSign}${Math.abs(crossComp).toFixed(0)}`);

        const wpts = this.scene._missionWaypoints;
        const idx = this.scene._missionCurrentWpIndex;
        const legBlock = document.getElementById('nav-leg-block');
        const hasActiveWp = wpts.length > 0 && idx < wpts.length;
        const useArrivalAsLeg = !hasActiveWp && nav.arrival_lat != null && nav.arrival_lon != null;
        if (hasActiveWp || useArrivalAsLeg) {
            if (legBlock) legBlock.style.display = 'block';
            const wp = hasActiveWp ? wpts[idx] : {
                name: nav.arrival_icao || 'DEST',
                order_index: 1,
                latitude: nav.arrival_lat,
                longitude: nav.arrival_lon,
                altitude_ft: null,
            };
            const wpLat = Number(wp.latitude);
            const wpLon = Number(wp.longitude);
            const legDistNm = this.scene._haversineNm(lat, lon, wpLat, wpLon);
            const legBrgDeg = this.scene._initialBearingDeg(lat, lon, wpLat, wpLon);
            this.scene._setText('nav-wpt-name', wp.name || `WP ${wp.order_index}`);
            this.scene._setText('nav-leg-idx', hasActiveWp ? `${idx + 1}/${wpts.length}` : 'DIRECT');
            this.scene._setText('nav-leg-dist', `${legDistNm.toFixed(1)} nm`);
            const legBrgMag = ((legBrgDeg - magVarHere) + 360) % 360;
            this.scene._setText('nav-leg-brg', `${Math.round(legBrgMag)}\u00B0M`);

            const wm = this.scene.planeRoot ? this.scene.planeRoot.getWorldMatrix() : null;
            const fwd = wm ? BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm) : null;
            const currentHdgDeg = fwd ? (((Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI) + 360) % 360) : 0;
            const delta = ((legBrgDeg - currentHdgDeg + 540) % 360) - 180;
            const absD = Math.abs(delta);
            const arrow = delta > 1 ? '\u25B6' : delta < -1 ? '\u25C0' : '\u25B2';
            const deltaColor = absD < HDG_DELTA_GREEN_DEG ? '#40ffaa' : absD < HDG_DELTA_AMBER_DEG ? '#ffcc55' : '#ff5566';
            this.scene._setHtml('nav-hdg-delta', `<span style="color:${deltaColor}">${arrow} ${Math.round(absD)}\u00B0</span>`);

            let prevLat: number, prevLon: number;
            if (useArrivalAsLeg || idx === 0) {
                prevLat = nav.departure_lat;
                prevLon = nav.departure_lon;
            } else {
                prevLat = Number(wpts[idx - 1].latitude);
                prevLon = Number(wpts[idx - 1].longitude);
            }
            const xteNm = this.scene._computeXteNm(prevLat, prevLon, wpLat, wpLon, lat, lon);
            const xteSide = xteNm >= 0 ? 'R' : 'L';
            const xteAbs = Math.abs(xteNm);
            const xteColor = xteAbs < 0.2 ? '#40ffaa' : xteAbs < 0.5 ? '#ffcc55' : '#ff5566';
            this.scene._setHtml('nav-xte-val', `<span style="color:${xteColor}">${xteAbs.toFixed(2)} nm ${xteSide}</span>`);
            const xteFrac = Math.max(-1, Math.min(1, xteNm / XTE_INDICATOR_MAX_NM));
            const xteLeftPct = 50 + xteFrac * 50;
            this.scene._setStyle('nav-xte-bar-dot', 'left', `${xteLeftPct}%`);

            if (wp.altitude_ft != null) {
                const tgtAlt = Number(wp.altitude_ft);
                this.scene._setText('nav-tgt-alt', `${tgtAlt} ft`);
                const altDelta = altMslFt - tgtAlt;
                const altAbs = Math.abs(altDelta);
                const altColor = altAbs < ALT_BAND_GREEN_FT ? '#40ffaa' : altAbs < ALT_BAND_AMBER_FT ? '#ffcc55' : '#ff5566';
                this.scene._setStyle('nav-alt-band-wrap', 'display', 'block');
                const altFrac = Math.max(-1, Math.min(1, altDelta / ALT_BAND_AMBER_FT));
                const altLeftPct = 50 + altFrac * 50;
                this.scene._setStyle('nav-alt-band-dot', 'left', `${altLeftPct}%`);
                this.scene._setStyle('nav-alt-band-dot', 'background', altColor);
            } else {
                this.scene._setText('nav-tgt-alt', '\u2014');
                this.scene._setStyle('nav-alt-band-wrap', 'display', 'none');
            }

            if (this.scene.groundSpeed > MIN_GS_FOR_ETE_MS) {
                const eteMin = (legDistNm / gsKt) * 60;
                this.scene._setText('nav-ete', this.scene._formatEteMin(eteMin));
                const simTimeMs = Date.now() + (this.scene._simTimeOffsetMs || 0);
                this.scene._setText('nav-eta', this.scene._formatEtaUtc(simTimeMs, eteMin));
            } else {
                this.scene._setText('nav-ete', '--:--');
                this.scene._setText('nav-eta', '--:--');
            }
        } else {
            if (legBlock) legBlock.style.display = 'none';
        }
    }

    updateHUD(): void {
        const now = this.scene._getSimDate();
        const hh = String(now.getUTCHours()).padStart(2, '0');
        const mm = String(now.getUTCMinutes()).padStart(2, '0');
        const ss = String(now.getUTCSeconds()).padStart(2, '0');
        const dd = String(now.getUTCDate()).padStart(2, '0');
        const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
        const lonForLocal = Number.isFinite(this.scene.originLon) ? this.scene.originLon : 0;
        const localMs = now.getTime() + (lonForLocal / 15) * 3600 * 1000;
        const localDate = new Date(localMs);
        const lhh = String(localDate.getUTCHours()).padStart(2, '0');
        const lmm = String(localDate.getUTCMinutes()).padStart(2, '0');
        this.scene.hudUtc.textContent = `${dd}/${mo}/${now.getUTCFullYear()} ${hh}:${mm}:${ss} UTC \u00B7 ${lhh}:${lmm} LCL`;

        const tasMs = Number.isFinite(this.scene._lastTasMs) ? this.scene._lastTasMs : this.scene.velocity.length();
        const iasMs = Number.isFinite(this.scene._lastIasMs) ? this.scene._lastIasMs : tasMs;
        const gsMs  = Number.isFinite(this.scene.groundSpeed) ? this.scene.groundSpeed : 0;
        const speedKtsIas = Math.max(0, Math.round(iasMs * MS_TO_KT));
        const speedKtsTas = Math.max(0, Math.round(tasMs * MS_TO_KT));
        const speedKtsGs  = Math.max(0, Math.round(gsMs  * MS_TO_KT));
        const speedKts = speedKtsIas;
        const pos = this.scene.planeRoot.position;
        const altitudeM = Math.round(Math.max(0, pos.y));
        const altitudeFt = Math.round(altitudeM * 3.28084);
        const abMax = this.scene.aircraftConfig?.afterburner_thrust_mult ?? 1;
        const thrustNorm = abMax > 0 ? this.scene.thrust / abMax : this.scene.thrust;
        const pct = Math.round(Math.min(100, Math.max(0, thrustNorm * 100)));

        const altitudeMslFt = Math.round(Math.max(0, this.scene.refAlt + pos.y) * 3.28084);
        const speedDisp = this.scene._convertSpeedKts(speedKts);
        const altDisp = this.scene._convertAltitudeFt(altitudeMslFt);
        this.scene.hudSpeedVal.textContent = String(speedDisp.value);
        this.scene.hudAltVal.textContent   = String(altDisp.value);
        if (this.scene.hudSpeedVal.parentElement) {
            const u = this.scene.hudSpeedVal.parentElement.querySelector('.hud-unit');
            if (u) u.textContent = speedDisp.unit;
        }
        if (this.scene.hudAltVal.parentElement) {
            const u = this.scene.hudAltVal.parentElement.querySelector('.hud-unit');
            if (u) u.textContent = altDisp.unit;
        }
        this.scene.hudThrottle.style.width = `${pct}%`;
        if (this.scene.hudThrPct) this.scene.hudThrPct.textContent = `${pct}%`;
        const _engAliveArr = Array.isArray(this.scene._engineAlive) ? this.scene._engineAlive : [];
        const _eng1Alive = _engAliveArr.length === 0 ? true : (_engAliveArr[0] === true);
        const _eng2Alive = _engAliveArr.length === 0 ? true : (_engAliveArr[1] === true);
        const _eng3Alive = _engAliveArr.length === 0 ? true : (_engAliveArr[2] === true);
        const _eng4Alive = _engAliveArr.length === 0 ? true : (_engAliveArr[3] === true);
        if (this.scene.hudEng1Pct) this.scene.hudEng1Pct.textContent = `${_eng1Alive ? pct : 0}%`;
        if (this.scene.hudEng2Pct) this.scene.hudEng2Pct.textContent = `${_eng2Alive ? pct : 0}%`;
        if (this.scene.hudEng3Pct) this.scene.hudEng3Pct.textContent = `${_eng3Alive ? pct : 0}%`;
        if (this.scene.hudEng4Pct) this.scene.hudEng4Pct.textContent = `${_eng4Alive ? pct : 0}%`;
        if (this.scene.hudAbTag) {
            this.scene.hudAbTag.style.display = this.scene.thrust > 1.0 ? '' : 'none';
        }

        const spdAbs = Math.max(0, Number.isFinite(speedKts) ? speedKts : 0);
        const spdHund = Math.floor(spdAbs / 100) % 10;
        const spdTen  = Math.floor(spdAbs / 10) % 10;
        const spdOne  = spdAbs % 10;
        if (this.scene.hudSpdH) this.scene.hudSpdH.textContent = spdAbs >= 100 ? String(spdHund) : '';
        if (this.scene.hudSpdT) this.scene.hudSpdT.textContent = spdAbs >= 10  ? String(spdTen)  : '0';
        if (this.scene.hudSpdUInner) {
            const nextOne = (spdOne + 1) % 10;
            const inner = this.scene.hudSpdUInner;
            if (inner.dataset.cur !== String(spdOne)) {
                inner.innerHTML = `<span>${spdOne}</span><span>${nextOne}</span>`;
                inner.dataset.cur = String(spdOne);
            }
        }

        const altAbs = Math.max(0, Number.isFinite(altitudeMslFt) ? altitudeMslFt : 0);
        const altDH    = Math.floor(altAbs / 10000) % 10;
        const altDT    = Math.floor(altAbs / 1000)  % 10;
        const altDU    = Math.floor(altAbs / 100)   % 10;
        const altDTens = Math.floor(altAbs / 10)    % 10;
        const altDOne  = altAbs % 10;
        if (this.scene.hudAltH) this.scene.hudAltH.textContent = altAbs >= 10000 ? String(altDH) : '';
        if (this.scene.hudAltT) this.scene.hudAltT.textContent = altAbs >= 1000  ? String(altDT) : '';
        if (this.scene.hudAltU) this.scene.hudAltU.textContent = String(altDU);
        if (this.scene.hudAltTens) this.scene.hudAltTens.textContent = String(altDTens);
        if (this.scene.hudAltUnitsInner) {
            const nextOne = (altDOne + 1) % 10;
            const inner = this.scene.hudAltUnitsInner;
            if (inner.dataset.cur !== String(altDOne)) {
                inner.innerHTML = `<span>${altDOne}</span><span>${nextOne}</span>`;
                inner.dataset.cur = String(altDOne);
            }
        }

        if (this.scene.hudAltSel) {
            const presetFt = this.scene._pendingMissionAltM != null && Number.isFinite(this.scene._pendingMissionAltM)
                ? Math.max(0, Math.round((this.scene._pendingMissionAltM as number) * 3.28084 / 100) * 100)
                : 5000;
            const presetText = String(presetFt);
            if (this.scene.hudAltSel.textContent !== presetText) this.scene.hudAltSel.textContent = presetText;
        }

        const flapDeg = this.scene.FLAP_STEPS[this.scene.flapIndex];
        this.scene.hudFlapVal.textContent = flapDeg > 0 ? `${flapDeg}\u00B0` : 'OFF';
        this.scene.hudBrakeVal.textContent = this.scene.brakesOn ? 'ON' : 'OFF';
        this.scene.hudBrakeVal.style.color = this.scene.brakesOn ? '#ff4040' : '';

        if (this.scene.hudGearRow) {
            this.scene.hudGearRow.style.display = '';
            const gs = this.scene.gearState;
            const label = gs === GEAR_STATE_DOWN ? 'DOWN'
                : gs === GEAR_STATE_UP ? 'UP'
                : gs === GEAR_STATE_RETRACTING ? 'RET...'
                : 'EXT...';
            const color = gs === GEAR_STATE_DOWN ? '#50ff80'
                : gs === GEAR_STATE_UP ? '#888'
                : '#ffcc00';
            this.scene.hudGearState.textContent = label;
            this.scene.hudGearState.style.color = color;
            if (this.scene.isMobile) {
                const gearBtn = document.getElementById('touch-gear');
                if (gearBtn) {
                    const btnLabel = gs === GEAR_STATE_DOWN ? 'GR\u25BC'
                        : gs === GEAR_STATE_UP ? 'GR\u25B2'
                        : gs === GEAR_STATE_RETRACTING ? 'GR\u2191'
                        : 'GR\u2193';
                    if (gearBtn.textContent !== btnLabel) gearBtn.textContent = btnLabel;
                    const stateClass = (gs === GEAR_STATE_RETRACTING || gs === GEAR_STATE_EXTENDING)
                        ? 'transit'
                        : (gs === GEAR_STATE_UP ? 'up' : 'down');
                    if (!gearBtn.classList.contains(stateClass)) {
                        gearBtn.classList.remove('up', 'down', 'transit');
                        gearBtn.classList.add(stateClass);
                    }
                }
            }
        }

        const wm = this.scene.planeRoot.getWorldMatrix();
        BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0, 0, 1), wm, this.scene._tmpFwd);
        this.scene._tmpFwd.normalize();
        this.scene._tmpUp.set(0, 1, 0);
        const pitchAngle = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(this.scene._tmpFwd, this.scene._tmpUp))));
        const pitchDeg = Math.round(pitchAngle * 180 / Math.PI);

        const groundY = this.scene.tiles ? this.scene.terrainY : GROUND_Y;
        const aglM = Math.max(0, pos.y - groundY);
        const isOnGround = aglM < ON_GROUND_AGL_M;

        this.scene.hudAttitude.textContent =
            isOnGround         ? 'GROUND'   :
            pitchAngle > 0.08  ? 'CLIMB' :
            pitchAngle < -0.08 ? 'DESC'   : 'LEVEL';
        try {
            this.scene._engineSound.setThrottle(this.scene.thrust);
            this.scene._engineSound.setRpm(this.scene.engineRpm);
            this.scene._engineSound.update();
        } catch (err) {
            // EngineSound errors should not break HUD
        }

        try {
            this.scene._flightAudio.setAirspeed(speedKtsIas);
            this.scene._flightAudio.update();
        } catch (_) { /* ignore */ }

        const stallAlpha = this.scene.aircraftConfig.stall_alpha_rad;
        const aoaAbs = Math.abs(Number.isFinite(this.scene._lastAoaRad) ? this.scene._lastAoaRad : 0);
        const stallByAoa = Number.isFinite(stallAlpha) && stallAlpha > 0
            && aoaAbs > STALL_AOA_WARNING_FRACTION * stallAlpha;
        const stallByIas = speedKtsIas < this.scene.aircraftConfig.stall_speed_kts;
        const stallActive = this.scene._spawnSnapFramesLeft <= 0
            && aglM > STALL_WARNING_MIN_AGL_M
            && (stallByIas || stallByAoa);

        let currentMach = 0;
        try {
            const altForMach = Math.max(0, (this.scene.refAlt ?? 0) + pos.y);
            const tempK = altForMach > ISA_TROPOPAUSE_M
                ? ISA_TROPOPAUSE_TEMP_K
                : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * altForMach;
            const speedOfSound = Math.sqrt(SPECIFIC_HEAT_RATIO_AIR * GAS_CONSTANT_AIR_J_PER_KG_K * tempK);
            currentMach = speedOfSound > 0 ? tasMs / speedOfSound : 0;
            this.scene._lastMach = currentMach;
        } catch (err) {
            console.warn('[Physics] Mach computation failed:', err);
        }

        this.scene._updateOverspeed(speedKtsIas, currentMach);
        const aglFtForGpws = aglM * 3.28084;
        const vsFpmForGpws = Math.round(this.scene.velocity.y * 196.85);
        this.scene._updateGPWS(aglFtForGpws, vsFpmForGpws);
        const anyWarn = stallActive || this.scene._overspeedActive;
        this.scene.hudWarning.style.display = anyWarn ? 'block' : 'none';
        if (anyWarn && this.scene.hudWarning) {
            const label = this.scene._overspeedActive ? 'OVERSPEED' : 'STALL';
            this.scene.hudWarning.innerHTML = `\u26A0 ${label} \u26A0`;
        }
        if (stallActive && !this.scene._lastStallState) {
            this.scene._doHaptic([100, 50, 100]);
        }
        if (stallActive !== this.scene._lastStallState) {
            try { this.scene._flightAudio.setStallActive(stallActive); } catch (_) { /* ignore */ }
        }
        this.scene._lastStallState = stallActive;

        try {
            const mmoForAudio = this.scene._resolveMmo();
            this.scene._flightAudio.maybeOverspeedFromMach(currentMach, mmoForAudio);
        } catch (err) {
            console.warn('[Audio] Mach overspeed update failed:', err);
        }

        try {
            const vsFpm = this.scene.velocity.y * 196.85;
            const gearDown = this.scene.gearState === GEAR_STATE_DOWN || this.scene.gearState === GEAR_STATE_EXTENDING;
            const aglFt = aglM * 3.28084;
            this.scene._flightAudio.updateGpws(aglFt, vsFpm, isOnGround, gearDown);
        } catch (_) { /* ignore */ }
        const overGActive = this.scene._gForce > OVER_G_THRESHOLD;
        if (overGActive && !this.scene._lastOverGState) {
            this.scene._doHaptic([200, 100, 200, 100, 200]);
            console.warn(`[Physics] Over-G detected: ${this.scene._gForce.toFixed(2)}g`);
        }
        this.scene._lastOverGState = overGActive;

        this.scene.hudFps.textContent =
            `${this.scene.scene?.getEngine?.()?.getFps?.()?.toFixed(0) ?? '--'} FPS`;

        if (this.scene.hudTasVal) this.scene.hudTasVal.textContent = String(speedKtsTas);
        if (this.scene.hudGsVal)  this.scene.hudGsVal.textContent  = String(speedKtsGs);
        if (this.scene.hudIasVal) this.scene.hudIasVal.textContent = String(speedKtsIas);

        if (this.scene.hudApState) {
            if (this.scene._autopilotMaster) {
                const parts: string[] = [];
                if (this.scene._autopilotNavHold) parts.push('NAV');
                else if (this.scene._autopilotHdgHold) parts.push(`HDG ${Math.round(this.scene._autopilotTargetHdgDeg).toString().padStart(3, '0')}`);
                if (this.scene._autopilotAprHold) parts.push('APR');
                else if (this.scene._autopilotVsHold) parts.push(`VS ${this.scene._autopilotTargetVsFpm >= 0 ? '+' : ''}${Math.round(this.scene._autopilotTargetVsFpm)}`);
                else if (this.scene._autopilotAltHold) parts.push(`ALT ${Math.round(this.scene._autopilotTargetAltFt)}`);
                this.scene.hudApState.textContent = parts.length ? parts.join(' / ') : 'ON';
                this.scene.hudApState.style.color = '#40ff80';
            } else {
                this.scene.hudApState.textContent = 'OFF';
                this.scene.hudApState.style.color = '#888';
            }
        }
        this.scene._updateAutopilotPanel();

        if (this.scene.hudSpoilerState) {
            const pct = Math.round(this.scene._spoilerDeflection * 100);
            if (this.scene._spoilerArmed && pct === 0) {
                this.scene.hudSpoilerState.textContent = 'ARM';
                this.scene.hudSpoilerState.style.color = '#ffcc55';
            } else if (pct > 0) {
                this.scene.hudSpoilerState.textContent = `${pct}%`;
                this.scene.hudSpoilerState.style.color = '#40ff80';
            } else {
                this.scene.hudSpoilerState.textContent = '--';
                this.scene.hudSpoilerState.style.color = '#888';
            }
            if (this.scene.isMobile) {
                const splBtn = document.getElementById('touch-spl');
                if (splBtn) {
                    splBtn.classList.toggle('active', this.scene._spoilerDeflection > 0.01);
                    splBtn.classList.toggle('armed', this.scene._spoilerArmed && this.scene._spoilerDeflection <= 0.01);
                }
            }
        }
        if (this.scene.hudEngsState) {
            const total = Math.max(1, this.scene.aircraftConfig.engine_count ?? 1);
            const alive = Array.isArray(this.scene._engineAlive) ? this.scene._engineAlive.filter(Boolean).length : total;
            if (alive === total) {
                this.scene.hudEngsState.textContent = 'OK';
                this.scene.hudEngsState.style.color = '#40ff80';
            } else if (alive === 0) {
                this.scene.hudEngsState.textContent = 'OUT';
                this.scene.hudEngsState.style.color = '#ff4040';
            } else {
                this.scene.hudEngsState.textContent = `${alive}/${total}`;
                this.scene.hudEngsState.style.color = '#ffcc55';
            }
        }

        const _engineEt = this.scene.aircraftConfig.engine_type;
        const _engineIsProp = _engineEt === ENGINE_TYPE_PISTON || _engineEt === ENGINE_TYPE_TURBOPROP;
        const _engineRpmMax = this.scene.aircraftConfig.prop_rpm_max || 2700;
        const _engineFrac = _engineIsProp
            ? (_engineRpmMax > 0 ? this.scene.engineRpm / _engineRpmMax : 0)
            : this.scene.enginePower;
        const _engineClamped = Math.max(0, Math.min(1, Number.isFinite(_engineFrac) ? _engineFrac : 0));
        const _engineRpmAngle = -120 + _engineClamped * 240;
        const _engineDeadAngle = -120;
        const _engRpmRounded = Math.round(this.scene.engineRpm);
        if (this.scene.hudRpmVal) this.scene.hudRpmVal.textContent = String(_eng1Alive ? _engRpmRounded : 0);
        if (this.scene.hudRpmNeedle) {
            this.scene.hudRpmNeedle.style.transform = `rotate(${_eng1Alive ? _engineRpmAngle : _engineDeadAngle}deg)`;
        }
        const _engineCountCfg = this.scene.aircraftConfig?.engine_count ?? 1;
        if (this.scene.hudEngine2Col && _engineCountCfg >= 2) {
            if (this.scene.hudRpmVal2) this.scene.hudRpmVal2.textContent = String(_eng2Alive ? _engRpmRounded : 0);
            if (this.scene.hudRpmNeedle2) this.scene.hudRpmNeedle2.style.transform = `rotate(${_eng2Alive ? _engineRpmAngle : _engineDeadAngle}deg)`;
        }
        if (this.scene.hudEngine3Col && _engineCountCfg >= 3) {
            if (this.scene.hudRpmVal3) this.scene.hudRpmVal3.textContent = String(_eng3Alive ? _engRpmRounded : 0);
            if (this.scene.hudRpmNeedle3) this.scene.hudRpmNeedle3.style.transform = `rotate(${_eng3Alive ? _engineRpmAngle : _engineDeadAngle}deg)`;
        }
        if (this.scene.hudEngine4Col && _engineCountCfg >= 4) {
            if (this.scene.hudRpmVal4) this.scene.hudRpmVal4.textContent = String(_eng4Alive ? _engRpmRounded : 0);
            if (this.scene.hudRpmNeedle4) this.scene.hudRpmNeedle4.style.transform = `rotate(${_eng4Alive ? _engineRpmAngle : _engineDeadAngle}deg)`;
        }

        const fuelPct = this.scene.aircraftConfig.fuel_capacity_kg > 0
            ? Math.round((this.scene.fuelRemaining / this.scene.aircraftConfig.fuel_capacity_kg) * 100)
            : 100;
        if (this.scene.hudFuelVal) this.scene.hudFuelVal.textContent = `${fuelPct}%`;

        const aoaSource = Number.isFinite(this.scene._lastAoaRad) ? this.scene._lastAoaRad : 0;
        const aoaDeg = Math.round(aoaSource * 180 / Math.PI);
        if (this.scene.hudAoaVal) this.scene.hudAoaVal.textContent = `${aoaDeg}\u00B0`;

        const vsFpm = Math.round(this.scene.velocity.y * 196.85);
        if (this.scene.hudVsVal) this.scene.hudVsVal.textContent = String(vsFpm);

        if (this.scene.hudVsPointer) {
            const vsForPointer = Number.isFinite(vsFpm) ? vsFpm : 0;
            const vsRangeFpm = 6000;
            const vsClamped = Math.max(-vsRangeFpm, Math.min(vsRangeFpm, vsForPointer));
            const vsTopPct = 50 - (vsClamped / vsRangeFpm) * 50;
            this.scene.hudVsPointer.style.top = `${vsTopPct}%`;
        }
        if (this.scene.hudVsBar) {
            const vsClamp = Math.max(-1000, Math.min(1000, vsFpm));
            const vsHeight = Math.abs(vsClamp) / 1000 * 50;
            this.scene.hudVsBar.style.height = `${vsHeight}%`;
            this.scene.hudVsBar.style.bottom = vsFpm >= 0 ? '50%' : `${50 - vsHeight}%`;
            this.scene.hudVsBar.style.background = vsFpm >= 0 
                ? 'linear-gradient(to top,rgba(50,200,100,.8),rgba(100,255,150,.6))'
                : 'linear-gradient(to bottom,rgba(200,100,50,.8),rgba(255,150,100,.6))';
        }

        if (this.scene.hudTrimVal) this.scene.hudTrimVal.textContent = String(Math.round(this.scene.trimPitch * 1000));
        if (this.scene.hudBaroVal) this.scene.hudBaroVal.textContent = '29.92';

        if (this.scene.hudHdgVal) {
            const fwdFlat = this.scene._tmpFwd.subtract(this.scene._tmpUp.scale(BABYLON.Vector3.Dot(this.scene._tmpFwd, this.scene._tmpUp)));
            if (fwdFlat.lengthSquared() > 0.0001) fwdFlat.normalize();
            const hdgRad = Math.atan2(
                BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(1, 0, 0)),
                BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(0, 0, -1)),
            );
            const hdgTrueDeg = ((hdgRad * 180 / Math.PI) + 360) % 360;
            const here = this.scene._apCurrentLatLon();
            const magVar = here ? this.scene._magneticVariationDeg(here.lat, here.lon) : 0;
            const hdgMagDeg = Math.round(((hdgTrueDeg - magVar) + 360) % 360);
            this.scene.hudHdgVal.textContent = `${hdgMagDeg}\u00B0M`;
        }

        this.scene._updateTapeMarks(speedKts, altitudeFt);

        this.scene._drawFlightHUD();
        if (this.scene._pfdPanelEl && this.scene._pfdPanelEl.style.display !== 'none') {
            this.drawFullPfd(this.scene._pfdPanelCtx, this.scene._pfdPanelCanvas);
        }
        this.scene._updateMap();
        this.scene._updateDebugReadouts();

        try {
            const flapsDown = this.scene.flapIndex > 0;
            const gearDownNow = this.scene.gearState === GEAR_STATE_DOWN;
            this.scene._updateChecklistOverlay(speedKtsIas, aglM * 3.28084, vsFpm, gearDownNow, flapsDown);
        } catch (err) {
            console.warn('[Checklist] update failed:', err);
        }
        try {
            this.scene._updateFpsLatencyOverlay();
        } catch (err) {
            console.warn('[FpsLatency] update failed:', err);
        }
    }

    setupPfdPanel(): void {
        const panel = document.getElementById('pfd-panel');
        const handle = document.getElementById('pfd-panel-handle');
        const btn = document.getElementById('pfd-btn');
        const canvas = document.getElementById('pfd-panel-canvas') as HTMLCanvasElement | null;
        if (!panel || !btn || !canvas) {
            console.warn('[PFD Panel] Missing DOM elements; setup skipped');
            return;
        }
        this.scene._pfdPanelEl = panel;
        this.scene._pfdPanelCanvas = canvas;
        this.scene._pfdPanelCtx = canvas.getContext('2d');

        if (handle) this.scene._wirePanelDrag(panel, handle);

        const setActive = (active: boolean): void => {
            btn.style.borderColor = active ? 'rgba(80,255,160,.9)' : 'rgba(80,255,160,.3)';
            btn.style.boxShadow = active ? '0 0 12px rgba(0,255,128,.35)' : 'none';
        };
        const togglePanel = (): void => {
            const visible = panel.style.display !== 'none';
            panel.style.display = visible ? 'none' : 'block';
            setActive(!visible);
            console.log(`[PFD Panel] ${visible ? 'closed' : 'opened'}`);
        };

        btn.addEventListener('mouseenter', () => {
            if (panel.style.display === 'none') {
                btn.style.borderColor = 'rgba(80,255,160,.7)';
                btn.style.boxShadow = '0 0 8px rgba(0,255,128,.2)';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (panel.style.display === 'none') setActive(false);
        });
        btn.addEventListener('click', (ev) => { ev.stopPropagation(); togglePanel(); });

        const closeBtn = panel.querySelector<HTMLButtonElement>('.panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                panel.style.display = 'none';
                setActive(false);
            });
        }

        if (!this.scene._pfdPanelKeydownHandler) {
            this.scene._pfdPanelKeydownHandler = (e: KeyboardEvent) => {
                if (this.scene._disposed) return;
                if (!(e.shiftKey && e.code === 'KeyI')) return;
                const ae = document.activeElement;
                const tag = ae ? ae.tagName : '';
                if (tag === 'INPUT' || tag === 'TEXTAREA' || this.scene._apEditingField) return;
                e.preventDefault();
                togglePanel();
            };
            window.addEventListener('keydown', this.scene._pfdPanelKeydownHandler);
        }
    }

    setupAutopilotToggle(): void {
        const panel = document.getElementById('ap-panel');
        const btn = document.getElementById('ap-toggle-btn');
        if (!panel || !btn) {
            console.warn('[AP Panel] Missing DOM elements; autopilot toggle setup skipped');
            return;
        }
        const setActive = (active: boolean): void => {
            btn.style.borderColor = active ? 'rgba(80,180,255,.9)' : 'rgba(80,180,255,.4)';
            btn.style.boxShadow = active ? '0 0 12px rgba(80,180,255,.35)' : 'none';
            btn.style.color = active ? '#cfe6ff' : '#9cf';
        };
        const applyVisible = (visible: boolean): void => {
            panel.style.display = visible ? 'flex' : 'none';
            setActive(visible);
        };
        if (this.scene.isMobile === true) {
            panel.style.display = 'none';
            console.debug('[AP Panel] Mobile detected — autopilot panel hidden by default');
        }
        applyVisible(panel.style.display !== 'none');

        btn.addEventListener('mouseenter', () => {
            if (panel.style.display === 'none') {
                btn.style.borderColor = 'rgba(80,180,255,.7)';
                btn.style.boxShadow = '0 0 8px rgba(80,180,255,.2)';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (panel.style.display === 'none') setActive(false);
        });
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const visible = panel.style.display !== 'none';
            applyVisible(!visible);
            console.log(`[AP Panel] ${visible ? 'closed' : 'opened'}`);
        });
    }

    drawFlightHUD(
        ctx: CanvasRenderingContext2D | null = this.scene.hudCtx,
        canvas: HTMLCanvasElement = this.scene.hudCanvas,
    ): void {
        if (!ctx || !canvas) return;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        ctx.clearRect(0, 0, W, H);

        const wm = this.scene.planeRoot.getWorldMatrix();
        const fwd   = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
        const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();
        const up    = new BABYLON.Vector3(0, 1, 0);

        const pitchRad = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(fwd, up))));
        const rollRad  = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(right, up))));
        const pitchDeg = pitchRad * 180 / Math.PI;
        const rollDeg  = rollRad * 180 / Math.PI;

        const fwdFlat = fwd.subtract(up.scale(BABYLON.Vector3.Dot(fwd, up)));
        if (fwdFlat.lengthSquared() > 0.0001) fwdFlat.normalize();
        const hdgRad = Math.atan2(
            BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(1, 0, 0)),
            BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(0, 0, -1)),
        );
        const hdgDeg = ((hdgRad * 180 / Math.PI) + 360) % 360;

        const speed    = this.scene.velocity.length() * 3.6 * 0.539957;
        const pPos = this.scene.planeRoot.position;
        const altitude = Math.max(0, this.scene.refAlt + pPos.y) * 3.28084;

        const ay = H * PFD_ATTITUDE_CENTER_Y_FRAC;

        this._drawPfdAttitude(ctx, cx, ay, pitchDeg, rollRad, rollDeg, PFD_ATTITUDE_FILL_ALPHA);
        this._drawPfdSideReadouts(ctx, W, ay, speed, altitude, undefined, undefined, null);
        this._drawHsiCanvas(hdgDeg);
    }

    private _hsiCanvas: HTMLCanvasElement | null = null;
    private _hsiCtx: CanvasRenderingContext2D | null = null;

    private _drawHsiCanvas(hdgDeg: number): void {
        if (!this._hsiCanvas) {
            this._hsiCanvas = document.getElementById('flight-hsi') as HTMLCanvasElement | null;
            this._hsiCtx = this._hsiCanvas ? this._hsiCanvas.getContext('2d') : null;
        }
        const ctx = this._hsiCtx;
        const cv = this._hsiCanvas;
        if (!ctx || !cv) return;
        ctx.clearRect(0, 0, cv.width, cv.height);
        this._drawPfdHsi(ctx, cv.width / 2, HSI_CANVAS_CENTER_Y_PX, hdgDeg);
    }

    private _drawPfdAttitude(
        ctx: CanvasRenderingContext2D,
        ax: number,
        ay: number,
        pitchDeg: number,
        rollRad: number,
        rollDeg: number,
        fillAlpha: number = 1,
        rectFull: { x0: number; y0: number; w: number; h: number } | null = null,
        slipDeg: number | null = null,
    ): void {
        const R = PFD_ATTITUDE_RADIUS_PX;
        const ppd = PFD_PIXELS_PER_PITCH_DEG;
        const big = rectFull ? (rectFull.w + rectFull.h) * 2 : R * 3;
        const lineHalfW = rectFull ? big : R;
        const ladderClip = rectFull ? PFD_FULL_LADDER_LIMIT_PX : R - 4;

        ctx.save();
        ctx.translate(ax, ay);

        ctx.save();
        ctx.beginPath();
        if (rectFull) {
            ctx.rect(rectFull.x0 - ax, rectFull.y0 - ay, rectFull.w, rectFull.h);
        } else {
            ctx.arc(0, 0, R, 0, Math.PI * 2);
        }
        ctx.clip();
        ctx.rotate(-rollRad);

        const horizonY = pitchDeg * ppd;
        if (rectFull || fillAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = rectFull ? 1 : fillAlpha;
            ctx.fillStyle = PFD_SKY_COLOR;
            ctx.fillRect(-big, -big, big * 2, big + horizonY);
            ctx.fillStyle = rectFull ? PFD_FULL_GROUND_COLOR : PFD_GROUND_COLOR;
            ctx.fillRect(-big, horizonY, big * 2, big);
            ctx.restore();
        }

        ctx.strokeStyle = PFD_PRIMARY_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-lineHalfW, horizonY);
        ctx.lineTo(lineHalfW, horizonY);
        ctx.stroke();

        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let deg = PFD_LADDER_MIN_PITCH_DEG; deg <= PFD_LADDER_MAX_PITCH_DEG; deg += PFD_LADDER_STEP_DEG) {
            if (deg === 0) continue;
            const yOff = (pitchDeg - deg) * ppd;
            if (Math.abs(yOff) > ladderClip) continue;
            const isLabel = deg % 10 === 0;
            const halfW = isLabel ? PFD_LADDER_HALF_WIDTH_PX : PFD_LADDER_HALF_WIDTH_MINOR_PX;
            const isBelow = deg < 0;
            ctx.strokeStyle = PFD_PRIMARY_COLOR_DIM;
            ctx.lineWidth = 1.5;
            ctx.setLineDash(isBelow ? PFD_LADDER_DASH_PATTERN_PX : []);
            ctx.beginPath();
            ctx.moveTo(-halfW, yOff);
            ctx.lineTo(halfW, yOff);
            ctx.stroke();
            ctx.setLineDash([]);
            if (isLabel) {
                const tickH = isBelow ? -4 : 4;
                ctx.beginPath();
                ctx.moveTo(-halfW, yOff);
                ctx.lineTo(-halfW, yOff + tickH);
                ctx.moveTo(halfW, yOff);
                ctx.lineTo(halfW, yOff + tickH);
                ctx.stroke();
                ctx.fillStyle = PFD_PRIMARY_COLOR_DIM;
                const lbl = `${Math.abs(deg)}`;
                ctx.fillText(lbl, -halfW - 12, yOff);
                ctx.fillText(lbl, halfW + 12, yOff);
            }
        }
        ctx.restore();

        if (!rectFull) {
            ctx.strokeStyle = PFD_PRIMARY_COLOR_DIM;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, R, 0, Math.PI * 2);
            ctx.stroke();
        }

        const bankR = PFD_BANK_RADIUS_PX;
        ctx.strokeStyle = PFD_PRIMARY_COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, bankR, Math.PI + 0.35, -0.35);
        ctx.stroke();
        ctx.lineWidth = 1;
        for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
            const rad = (-90 + a) * Math.PI / 180;
            const inner = a % 30 === 0 ? bankR - 9 : bankR - 5;
            ctx.beginPath();
            ctx.moveTo(Math.cos(rad) * inner, Math.sin(rad) * inner);
            ctx.lineTo(Math.cos(rad) * bankR, Math.sin(rad) * bankR);
            ctx.stroke();
        }

        ctx.strokeStyle = PFD_PRIMARY_COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -bankR);
        ctx.lineTo(-6, -bankR - 9);
        ctx.lineTo(6, -bankR - 9);
        ctx.closePath();
        ctx.stroke();

        const bankPtr = (-90 - rollDeg) * Math.PI / 180;
        ctx.fillStyle = PFD_PRIMARY_COLOR;
        ctx.beginPath();
        ctx.moveTo(Math.cos(bankPtr) * (bankR - 2), Math.sin(bankPtr) * (bankR - 2));
        ctx.lineTo(Math.cos(bankPtr - 0.05) * (bankR - 11), Math.sin(bankPtr - 0.05) * (bankR - 11));
        ctx.lineTo(Math.cos(bankPtr + 0.05) * (bankR - 11), Math.sin(bankPtr + 0.05) * (bankR - 11));
        ctx.fill();

        if (Number.isFinite(slipDeg)) {
            const sOff = Math.max(-PFD_SLIP_MAX_PX, Math.min(PFD_SLIP_MAX_PX, (slipDeg as number) * PFD_SLIP_PX_PER_DEG));
            const syTop = -(bankR - 13);
            const syBot = syTop + 6;
            ctx.fillStyle = PFD_PRIMARY_COLOR;
            ctx.strokeStyle = PFD_AIRCRAFT_SYMBOL_OUTLINE;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-7 + sOff, syTop);
            ctx.lineTo(7 + sOff, syTop);
            ctx.lineTo(9 + sOff, syBot);
            ctx.lineTo(-9 + sOff, syBot);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        if (this.scene._fdActive === true) {
            const cmdPitchDeg = Number.isFinite(this.scene._fdCmdPitchDeg) ? this.scene._fdCmdPitchDeg : pitchDeg;
            const cmdRollDeg = Number.isFinite(this.scene._fdCmdRollDeg) ? this.scene._fdCmdRollDeg : 0;
            const curRollStdDeg = -rollDeg;
            const pitchErrDeg = cmdPitchDeg - pitchDeg;
            const rollErrDeg = Math.max(-PFD_FD_MAX_BANK_ERR_DEG, Math.min(PFD_FD_MAX_BANK_ERR_DEG, cmdRollDeg - curRollStdDeg));
            const yOff = Math.max(-PFD_FD_MAX_PITCH_OFFSET_PX, Math.min(PFD_FD_MAX_PITCH_OFFSET_PX, -pitchErrDeg * ppd));
            ctx.save();
            ctx.translate(0, yOff);
            ctx.rotate(rollErrDeg * Math.PI / 180);
            ctx.strokeStyle = PFD_FD_COLOR;
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-PFD_FD_BAR_HALF_W_PX, PFD_FD_BAR_RISE_PX);
            ctx.lineTo(0, 0);
            ctx.lineTo(PFD_FD_BAR_HALF_W_PX, PFD_FD_BAR_RISE_PX);
            ctx.stroke();
            ctx.restore();
        }

        ctx.lineJoin = 'round';
        ctx.lineCap = 'butt';
        for (const pass of [{ c: PFD_AIRCRAFT_SYMBOL_OUTLINE, w: 6 }, { c: PFD_AIRCRAFT_SYMBOL_COLOR, w: 3 }]) {
            ctx.strokeStyle = pass.c;
            ctx.lineWidth = pass.w;
            ctx.beginPath();
            ctx.moveTo(-44, 0);
            ctx.lineTo(-18, 0);
            ctx.lineTo(-18, 9);
            ctx.moveTo(44, 0);
            ctx.lineTo(18, 0);
            ctx.lineTo(18, 9);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(-8, 1);
        ctx.lineTo(8, 1);
        ctx.closePath();
        ctx.fillStyle = PFD_AIRCRAFT_SYMBOL_COLOR;
        ctx.strokeStyle = PFD_AIRCRAFT_SYMBOL_OUTLINE;
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    private _drawPfdSideReadouts(
        ctx: CanvasRenderingContext2D,
        W: number,
        ay: number,
        speed: number,
        altitude: number,
        spdXOverride?: number,
        altXOverride?: number,
        tapeBg: string | null = PFD_TAPE_BG_COLOR,
        showSpdEnhancements: boolean = false,
        spdTrendKt: number | null = null,
    ): void {
        const spdX = spdXOverride ?? PFD_TAPE_EDGE_GAP_PX;
        const altX = altXOverride ?? (W - PFD_TAPE_WIDTH_PX - PFD_TAPE_EDGE_GAP_PX);

        const cfg = this.scene.aircraftConfig ?? null;
        const spdMarkers: { value: number; color: string }[] = [];
        const vne = cfg?.vne_kts;
        const vfe = cfg?.vfe_kts;
        const stall = cfg?.stall_speed_kts;
        if (typeof vfe === 'number' && Number.isFinite(vfe) && vfe > 0) spdMarkers.push({ value: vfe, color: PFD_VFE_COLOR });
        if (typeof vne === 'number' && Number.isFinite(vne) && vne > 0) spdMarkers.push({ value: vne, color: PFD_VNE_COLOR });

        const spdBands: { from: number; to: number; color: string; lane?: number }[] = [];
        if (showSpdEnhancements && typeof stall === 'number' && Number.isFinite(stall) && stall > 0) {
            spdBands.push({ from: 0, to: stall, color: PFD_BAND_LOWSPEED_COLOR });
            if (typeof vne === 'number' && Number.isFinite(vne) && vne > stall) {
                spdBands.push({ from: stall, to: vne, color: PFD_BAND_GREEN_COLOR });
            }
            if (typeof vfe === 'number' && Number.isFinite(vfe) && vfe > stall) {
                spdBands.push({ from: stall, to: vfe, color: PFD_BAND_WHITE_COLOR, lane: 1 });
            }
        }
        const atActive = this.scene._autopilotAtHold === true;
        const selSpeed = atActive && Number.isFinite(this.scene._autopilotAtTargetKts) ? this.scene._autopilotAtTargetKts : null;

        const altActive = this.scene._autopilotAltHold === true;
        const targetAltFt = Number.isFinite(this.scene._autopilotTargetAltFt) ? this.scene._autopilotTargetAltFt : null;
        const selAlt = showSpdEnhancements
            ? targetAltFt
            : (altActive ? targetAltFt : null);
        const altSelColor = showSpdEnhancements ? PFD_SELECTED_COLOR : PFD_BUG_COLOR;
        const barberPoleKts = showSpdEnhancements && typeof vne === 'number' && Number.isFinite(vne) && vne > 0 ? vne : null;

        this._drawPfdTape(ctx, spdX, ay, 'left', speed, PFD_SPD_PX_PER_KT, PFD_SPD_MINOR_STEP_KT, PFD_SPD_MAJOR_STEP_KT, spdMarkers, selSpeed, PFD_BUG_COLOR, tapeBg, spdBands, showSpdEnhancements ? spdTrendKt : null, barberPoleKts);
        this._drawPfdTape(ctx, altX, ay, 'right', altitude, PFD_ALT_PX_PER_FT, PFD_ALT_MINOR_STEP_FT, PFD_ALT_MAJOR_STEP_FT, [], selAlt, altSelColor, tapeBg);

        if (selAlt !== null) {
            const selText = `${Math.round(selAlt)}`;
            const bx = altX;
            const by = ay - PFD_TAPE_HALF_HEIGHT_PX - 20;
            ctx.fillStyle = PFD_TAPE_READOUT_BG_COLOR;
            ctx.fillRect(bx, by, PFD_TAPE_WIDTH_PX, 16);
            ctx.strokeStyle = altSelColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, PFD_TAPE_WIDTH_PX, 16);
            ctx.fillStyle = altSelColor;
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(selText, bx + PFD_TAPE_WIDTH_PX / 2, by + 8);
        }
    }

    private _drawPfdTape(
        ctx: CanvasRenderingContext2D,
        x: number,
        ay: number,
        side: 'left' | 'right',
        value: number,
        pxPerUnit: number,
        minorStep: number,
        majorStep: number,
        markers: { value: number; color: string }[],
        selValue: number | null,
        selColor: string,
        tapeBg: string | null = PFD_TAPE_BG_COLOR,
        bands: { from: number; to: number; color: string; lane?: number }[] = [],
        trendKt: number | null = null,
        barberPoleAboveKts: number | null = null,
    ): void {
        const tapeW = PFD_TAPE_WIDTH_PX;
        const halfH = PFD_TAPE_HALF_HEIGHT_PX;
        const top = ay - halfH;
        const bottom = ay + halfH;
        const innerEdge = side === 'left' ? x + tapeW : x;
        const tickDir = side === 'left' ? -1 : 1;

        if (tapeBg) {
            ctx.fillStyle = tapeBg;
            ctx.fillRect(x, top, tapeW, halfH * 2);
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, top, tapeW, halfH * 2);
        ctx.clip();

        for (const band of bands) {
            const yFrom = Math.min(bottom, Math.max(top, ay + (value - band.from) * pxPerUnit));
            const yTo = Math.min(bottom, Math.max(top, ay + (value - band.to) * pxPerUnit));
            const bTop = Math.min(yFrom, yTo);
            const bH = Math.abs(yFrom - yTo);
            if (bH < 0.5) continue;
            const lane = band.lane ?? 0;
            const stripW = 5;
            const bx = side === 'left'
                ? innerEdge - stripW * (lane + 1)
                : innerEdge + stripW * lane;
            ctx.fillStyle = band.color;
            ctx.fillRect(bx, bTop, stripW, bH);
        }

        if (barberPoleAboveKts !== null && side === 'left') {
            const yVne = ay + (value - barberPoleAboveKts) * pxPerUnit;
            const poleTop = top;
            const poleBot = Math.max(top, Math.min(bottom, yVne));
            if (poleBot > poleTop + 1) {
                const stripW = 5;
                const bx = innerEdge - stripW;
                this._drawPfdBarberPole(ctx, bx, poleTop, stripW, poleBot - poleTop);
            }
        }

        if (trendKt !== null && Math.abs(trendKt) >= 1) {
            const ty = ay - trendKt * pxPerUnit;
            const tyClamped = Math.min(bottom, Math.max(top, ty));
            const tx = side === 'left' ? innerEdge - 2 : innerEdge + 2;
            ctx.strokeStyle = PFD_TREND_COLOR;
            ctx.fillStyle = PFD_TREND_COLOR;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(tx, ay);
            ctx.lineTo(tx, tyClamped);
            ctx.stroke();
            const dir = trendKt >= 0 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(tx, tyClamped);
            ctx.lineTo(tx - 3, tyClamped - dir * 4);
            ctx.lineTo(tx + 3, tyClamped - dir * 4);
            ctx.closePath();
            ctx.fill();
        }

        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 3;
        ctx.font = '10px monospace';
        ctx.textBaseline = 'middle';
        const lowest = Math.floor((value - halfH / pxPerUnit) / minorStep) * minorStep;
        const highest = Math.ceil((value + halfH / pxPerUnit) / minorStep) * minorStep;
        for (let m = lowest; m <= highest; m += minorStep) {
            if (m < 0) continue;
            const y = ay + (value - m) * pxPerUnit;
            if (y < top - 1 || y > bottom + 1) continue;
            const major = m % majorStep === 0;
            const len = major ? 9 : 5;
            ctx.strokeStyle = PFD_PRIMARY_COLOR;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(innerEdge, y);
            ctx.lineTo(innerEdge + tickDir * len, y);
            ctx.stroke();
            if (major) {
                ctx.fillStyle = PFD_PRIMARY_COLOR;
                ctx.textAlign = side === 'left' ? 'right' : 'left';
                const lx = side === 'left' ? innerEdge + tickDir * (len + 3) : innerEdge + tickDir * (len + 3);
                ctx.fillText(`${m}`, lx, y);
            }
        }

        for (const mk of markers) {
            const y = ay + (value - mk.value) * pxPerUnit;
            if (y < top - 1 || y > bottom + 1) continue;
            ctx.strokeStyle = mk.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(innerEdge, y);
            ctx.lineTo(innerEdge + tickDir * 9, y);
            ctx.stroke();
        }

        if (selValue !== null) {
            let by = ay + (value - selValue) * pxPerUnit;
            by = Math.max(top + 4, Math.min(bottom - 4, by));
            const bw = 8;
            const bx0 = side === 'left' ? x + tapeW - bw : x;
            ctx.fillStyle = selColor;
            ctx.beginPath();
            ctx.moveTo(bx0 + (side === 'left' ? bw : 0), by - 6);
            ctx.lineTo(bx0 + (side === 'left' ? 0 : bw), by - 6);
            ctx.lineTo(bx0 + (side === 'left' ? 0 : bw), by + 6);
            ctx.lineTo(bx0 + (side === 'left' ? bw : 0), by + 6);
            ctx.lineTo(bx0 + (side === 'left' ? bw : 0), by + 3);
            ctx.lineTo(bx0 + (side === 'left' ? bw - 4 : 4), by);
            ctx.lineTo(bx0 + (side === 'left' ? bw : 0), by - 3);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        ctx.strokeStyle = PFD_PRIMARY_COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(innerEdge, top);
        ctx.lineTo(innerEdge, bottom);
        ctx.stroke();

        this._drawPfdRollingReadout(ctx, x, ay, side, value);
    }

    private _drawPfdBarberPole(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
        const stripe = PFD_BARBER_POLE_STRIPE_PX;
        for (let sy = y; sy < y + h; sy += stripe) {
            for (let sx = x; sx < x + w; sx += stripe) {
                const diag = Math.floor((sx - x + sy - y) / stripe) % 2 === 0;
                ctx.fillStyle = diag ? PFD_BARBER_POLE_RED : PFD_BARBER_POLE_WHITE;
                ctx.fillRect(sx, sy, stripe, stripe);
            }
        }
    }

    private _drawPfdRollingReadout(
        ctx: CanvasRenderingContext2D,
        x: number,
        ay: number,
        side: 'left' | 'right',
        value: number,
    ): void {
        const w = PFD_TAPE_READOUT_W_PX;
        const h = PFD_TAPE_READOUT_H_PX;
        const boxX = side === 'left' ? x : x + PFD_TAPE_WIDTH_PX - w;
        const boxY = ay - h / 2;
        const notch = PFD_TAPE_NOTCH_PX;

        ctx.fillStyle = PFD_TAPE_READOUT_BG_COLOR;
        ctx.beginPath();
        if (side === 'left') {
            ctx.moveTo(boxX, boxY);
            ctx.lineTo(boxX + w, boxY);
            ctx.lineTo(boxX + w, ay - notch);
            ctx.lineTo(boxX + w + notch, ay);
            ctx.lineTo(boxX + w, ay + notch);
            ctx.lineTo(boxX + w, boxY + h);
            ctx.lineTo(boxX, boxY + h);
        } else {
            ctx.moveTo(boxX + w, boxY);
            ctx.lineTo(boxX, boxY);
            ctx.lineTo(boxX, ay - notch);
            ctx.lineTo(boxX - notch, ay);
            ctx.lineTo(boxX, ay + notch);
            ctx.lineTo(boxX, boxY + h);
            ctx.lineTo(boxX + w, boxY + h);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = PFD_PRIMARY_COLOR;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const fontPx = 16;
        const charW = fontPx * 0.6;
        const intVal = Math.max(0, Math.floor(value));
        const frac = value - Math.floor(value);
        const text = `${intVal}`;
        const lead = text.length > 1 ? text.slice(0, -1) : '';
        const lastDigit = intVal % 10;

        const rightX = boxX + w - 5;
        const digitCenterX = rightX - charW / 2;
        const leadRightX = rightX - charW;

        ctx.save();
        ctx.beginPath();
        ctx.rect(boxX, boxY + 1, w, h - 2);
        ctx.clip();
        ctx.fillStyle = PFD_PRIMARY_COLOR;
        ctx.font = `bold ${fontPx}px monospace`;
        ctx.textBaseline = 'middle';
        if (lead) {
            ctx.textAlign = 'right';
            ctx.fillText(lead, leadRightX, ay);
        }
        ctx.textAlign = 'center';
        const lineH = fontPx;
        const curY = ay - frac * lineH;
        ctx.fillText(`${lastDigit}`, digitCenterX, curY);
        ctx.fillText(`${(lastDigit + 1) % 10}`, digitCenterX, curY + lineH);
        ctx.fillText(`${(lastDigit + 9) % 10}`, digitCenterX, curY - lineH);
        ctx.restore();
    }

    private _drawPfdHsi(
        ctx: CanvasRenderingContext2D,
        cx: number,
        hy: number,
        hdgDeg: number,
        brgToWptDeg: number | null = null,
        annun: string | null = null,
    ): void {
        const R = PFD_HSI_RADIUS_PX;
        const cardinals: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

        ctx.save();
        ctx.translate(cx, hy);

        ctx.strokeStyle = PFD_PRIMARY_COLOR_DIM;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let b = 0; b < 360; b += 10) {
            const rel = (b - hdgDeg) * Math.PI / 180;
            const ox = Math.sin(rel);
            const oy = -Math.cos(rel);
            const major = b % 30 === 0;
            const len = major ? 10 : 6;
            ctx.strokeStyle = PFD_PRIMARY_COLOR_DIM;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ox * R, oy * R);
            ctx.lineTo(ox * (R - len), oy * (R - len));
            ctx.stroke();
            if (major) {
                const lbl = cardinals[b] || `${b / 10}`;
                ctx.fillStyle = cardinals[b] ? PFD_PRIMARY_COLOR : PFD_PRIMARY_COLOR_DIM;
                ctx.fillText(lbl, ox * (R - 20), oy * (R - 20));
            }
        }

        const apHdg = this.scene._autopilotTargetHdgDeg;
        if (typeof apHdg === 'number' && Number.isFinite(apHdg)) {
            const rel = (apHdg - hdgDeg) * Math.PI / 180;
            const ox = Math.sin(rel);
            const oy = -Math.cos(rel);
            const tx = -oy;
            const ty = ox;
            ctx.fillStyle = PFD_BUG_COLOR;
            ctx.beginPath();
            ctx.moveTo(ox * (R + 7), oy * (R + 7));
            ctx.lineTo(ox * R + tx * 5, oy * R + ty * 5);
            ctx.lineTo(ox * R - tx * 5, oy * R - ty * 5);
            ctx.closePath();
            ctx.fill();
        }

        if (brgToWptDeg !== null && Number.isFinite(brgToWptDeg)) {
            const rel = (brgToWptDeg - hdgDeg) * Math.PI / 180;
            const ox = Math.sin(rel);
            const oy = -Math.cos(rel);
            ctx.strokeStyle = PFD_BEARING_PTR_COLOR;
            ctx.fillStyle = PFD_BEARING_PTR_COLOR;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(ox * (R - 12), oy * (R - 12));
            ctx.lineTo(ox * 22, oy * 22);
            ctx.stroke();
            const tx = -oy;
            const ty = ox;
            ctx.beginPath();
            ctx.moveTo(ox * (R - 4), oy * (R - 4));
            ctx.lineTo(ox * (R - 14) + tx * 5, oy * (R - 14) + ty * 5);
            ctx.lineTo(ox * (R - 14) - tx * 5, oy * (R - 14) - ty * 5);
            ctx.closePath();
            ctx.fill();
        }

        ctx.strokeStyle = PFD_PRIMARY_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(0, 10);
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.moveTo(-7, 10);
        ctx.lineTo(7, 10);
        ctx.stroke();

        if (annun) {
            ctx.fillStyle = PFD_CRS_COLOR;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GPS', -R * 0.42, -8);
            ctx.fillStyle = PFD_BUG_COLOR;
            ctx.fillText(annun, R * 0.42, -8);
        }

        ctx.restore();

        ctx.fillStyle = PFD_PRIMARY_COLOR;
        ctx.beginPath();
        ctx.moveTo(cx, hy - R);
        ctx.lineTo(cx - 5, hy - R - 7);
        ctx.lineTo(cx + 5, hy - R - 7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(cx - 22, hy - R - 26, 44, 17);
        ctx.strokeStyle = PFD_PRIMARY_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 22, hy - R - 26, 44, 17);
        ctx.fillStyle = PFD_PRIMARY_COLOR;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${String(Math.round(hdgDeg) % 360).padStart(3, '0')}`, cx, hy - R - 17);
    }

    drawFullPfd(ctx: CanvasRenderingContext2D | null, canvas: HTMLCanvasElement | null): void {
        if (!ctx || !canvas) return;
        const W = canvas.width;
        const cx = W / 2;
        ctx.clearRect(0, 0, W, canvas.height);

        const wm = this.scene.planeRoot.getWorldMatrix();
        const fwd   = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
        const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();
        const up    = new BABYLON.Vector3(0, 1, 0);

        const pitchRad = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(fwd, up))));
        const rollRad  = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(right, up))));
        const pitchDeg = pitchRad * 180 / Math.PI;
        const rollDeg  = rollRad * 180 / Math.PI;

        const fwdFlat = fwd.subtract(up.scale(BABYLON.Vector3.Dot(fwd, up)));
        if (fwdFlat.lengthSquared() > 0.0001) fwdFlat.normalize();
        const hdgRad = Math.atan2(
            BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(1, 0, 0)),
            BABYLON.Vector3.Dot(fwdFlat, new BABYLON.Vector3(0, 0, -1)),
        );
        const hdgDeg = ((hdgRad * 180 / Math.PI) + 360) % 360;

        const speed    = this.scene.velocity.length() * 3.6 * 0.539957;
        const pPos     = this.scene.planeRoot.position;
        const altitude = Math.max(0, this.scene.refAlt + pPos.y) * 3.28084;
        const vsFpm    = this.scene.velocity.y * PFD_MS_TO_FPM;

        const ay = PFD_FULL_ATT_CY_PX;
        const hy = PFD_FULL_HSI_CY_PX;
        const spdX = cx - PFD_ATTITUDE_RADIUS_PX - PFD_FULL_TAPE_BALL_GAP_PX - PFD_TAPE_WIDTH_PX;
        const altX = cx + PFD_ATTITUDE_RADIUS_PX + PFD_FULL_TAPE_BALL_GAP_PX;

        const tasMs = Number.isFinite(this.scene._lastTasMs) ? this.scene._lastTasMs : this.scene.velocity.length();
        const tasKt = tasMs * MS_TO_KT;
        const gsKt = (Number.isFinite(this.scene.groundSpeed) ? this.scene.groundSpeed : 0) * MS_TO_KT;
        const altForIsa = Math.max(0, (this.scene.refAlt ?? 0) + pPos.y);
        const tempK = altForIsa > ISA_TROPOPAUSE_M
            ? ISA_TROPOPAUSE_TEMP_K
            : ISA_SEA_LEVEL_TEMP_K - ISA_LAPSE_RATE_K_PER_M * altForIsa;
        const oatC = tempK - 273.15;
        const wind = this.scene._getWindAtAltitude(altitude);
        const mach = Number.isFinite(this.scene._lastMach) ? this.scene._lastMach : 0;
        const groundY = this.scene.tiles ? this.scene.terrainY : GROUND_Y;
        const aglFt = Math.max(0, pPos.y - groundY) * 3.28084;
        const navInfo = this._getPfdNavInfo();

        const vel = this.scene.velocity;
        const speedMs = vel ? vel.length() : 0;
        let slipDeg: number | null = null;
        if (speedMs > 2) {
            const lateral = BABYLON.Vector3.Dot(vel, right) / speedMs;
            slipDeg = Math.asin(Math.max(-1, Math.min(1, lateral))) * 180 / Math.PI;
        }
        const spdTrendKt = this._computeSpeedTrendKt(speed);

        const attRect = { x0: 0, y0: PFD_FULL_FMA_H_PX, w: W, h: canvas.height - PFD_FULL_FMA_H_PX };
        this._drawPfdAttitude(ctx, cx, ay, pitchDeg, rollRad, rollDeg, 1, attRect, slipDeg);
        this._drawPfdSideReadouts(ctx, W, ay, speed, altitude, spdX, altX, PFD_TAPE_BG_COLOR, true, spdTrendKt);
        this._drawPfdVsi(ctx, altX + PFD_TAPE_WIDTH_PX + 3, ay, vsFpm);
        if (this.scene._autopilotVsHold === true && Number.isFinite(this.scene._autopilotTargetVsFpm)) {
            this._drawPfdVsiBug(ctx, altX + PFD_TAPE_WIDTH_PX + 3, ay, this.scene._autopilotTargetVsFpm);
        }
        if (this.scene._autopilotAprHold === true && navInfo) {
            const distFt = navInfo.distNm * 6076.12;
            const glideAltFt = distFt * Math.tan(AP_APR_GLIDESLOPE_DEG * Math.PI / 180);
            this._drawPfdGlideslope(ctx, altX - 16, ay, altitude - glideAltFt);
        }
        this._drawPfdFma(ctx, W);
        this._drawPfdBaro(ctx, altX, ay + PFD_TAPE_HALF_HEIGHT_PX + 6);
        this._drawPfdRadarAlt(ctx, altX, ay + PFD_TAPE_HALF_HEIGHT_PX + 26, aglFt);
        this._drawPfdMach(ctx, spdX + PFD_TAPE_WIDTH_PX / 2, ay - PFD_TAPE_HALF_HEIGHT_PX - 9, mach);
        this._drawPfdAnnunciators(ctx, spdX, ay + PFD_TAPE_HALF_HEIGHT_PX + 12);
        this._drawPfdDataBlock(ctx, 8, canvas.height - 8, tasKt, gsKt, oatC);
        this._drawPfdWind(ctx, 12, PFD_FULL_FMA_H_PX + 24, wind, hdgDeg);
        ctx.fillStyle = PFD_HSI_DISK_COLOR;
        ctx.beginPath();
        ctx.arc(cx, hy, PFD_HSI_RADIUS_PX + 8, 0, Math.PI * 2);
        ctx.fill();
        let hsiAnnun: string | null = null;
        if (navInfo) {
            hsiAnnun = this.scene._autopilotAprHold === true ? 'APR'
                : navInfo.distNm < PFD_HSI_TERM_RANGE_NM ? 'TERM' : 'ENR';
        }
        this._drawPfdHsi(ctx, cx, hy, hdgDeg, navInfo ? navInfo.brgDeg : null, hsiAnnun);
        this._drawPfdSelHdg(ctx, cx - 150, hy + 70, this.scene._autopilotTargetHdgDeg);
        if (navInfo) {
            this._drawPfdSelDtk(ctx, cx + 92, hy + 70, navInfo.crsDeg);
            this._drawPfdWptInfo(ctx, cx, PFD_FULL_FMA_H_PX + 14, navInfo.distNm, navInfo.brgDeg);
            this._drawPfdCdi(ctx, cx, hy, hdgDeg, navInfo.crsDeg, navInfo.xteNm);
        }
        this._drawPfdNavBlock(ctx, canvas);
    }

    private _spdTrendPrevKt: number = NaN;
    private _spdTrendPrevMs: number = 0;
    private _spdTrendFilteredKt: number = 0;

    private _computeSpeedTrendKt(speedKt: number): number | null {
        const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (!Number.isFinite(this._spdTrendPrevKt)) {
            this._spdTrendPrevKt = speedKt;
            this._spdTrendPrevMs = nowMs;
            return null;
        }
        const dtS = (nowMs - this._spdTrendPrevMs) / 1000;
        if (dtS < 0.05) return this._spdTrendFilteredKt;
        const accelKtPerS = (speedKt - this._spdTrendPrevKt) / dtS;
        this._spdTrendPrevKt = speedKt;
        this._spdTrendPrevMs = nowMs;
        const rawTrend = accelKtPerS * PFD_TREND_SECONDS;
        const alpha = Math.max(0, Math.min(1, dtS / PFD_TREND_FILTER_TAU_S));
        this._spdTrendFilteredKt += alpha * (rawTrend - this._spdTrendFilteredKt);
        return this._spdTrendFilteredKt;
    }

    private _navText(id: string): string {
        const el = document.getElementById(id);
        const t = el && el.textContent ? el.textContent.trim() : '';
        return t || '\u2014';
    }

    private _drawPfdNavBlock(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
        const navEl = this.scene._navInfoEl as HTMLElement | null;
        if (!navEl || navEl.style.display === 'none') return;
        const legBlock = document.getElementById('nav-leg-block');
        const legVisible = !!legBlock && legBlock.style.display !== 'none';
        const rows: { label: string; value: string }[] = [];
        if (legVisible) {
            rows.push({ label: 'WPT', value: this._navText('nav-wpt-name') });
            rows.push({ label: 'LEG', value: this._navText('nav-leg-idx') });
            rows.push({ label: 'DIST', value: this._navText('nav-leg-dist') });
            rows.push({ label: 'BRG', value: this._navText('nav-leg-brg') });
            rows.push({ label: 'HDG\u0394', value: this._navText('nav-hdg-delta') });
            rows.push({ label: 'XTE', value: this._navText('nav-xte-val') });
            rows.push({ label: 'ETE', value: this._navText('nav-ete') });
            rows.push({ label: 'ETA', value: this._navText('nav-eta') });
        }
        rows.push({ label: 'DEST', value: this._navText('nav-dest') });
        rows.push({ label: 'DIST', value: this._navText('nav-dist') });
        rows.push({ label: 'TOTAL', value: this._navText('nav-total-dist') });
        rows.push({ label: 'WIND', value: this._navText('nav-wind') });
        rows.push({ label: 'GS', value: this._navText('nav-gs') });

        const rowH = 13;
        const padX = 6;
        const headerH = 14;
        const boxW = 168;
        const boxH = headerH + rows.length * rowH + 6;
        const boxX = canvas.width - boxW - 4;
        const boxY = canvas.height - boxH - 4;

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = 'rgba(80,255,160,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        ctx.textBaseline = 'middle';
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = PFD_AP_ACTIVE_COLOR;
        ctx.textAlign = 'left';
        ctx.fillText('FLIGHT PLAN', boxX + padX, boxY + headerH / 2 + 2);

        let ry = boxY + headerH + rowH / 2 + 2;
        ctx.font = '9px monospace';
        for (const r of rows) {
            ctx.fillStyle = PFD_NAV_BLOCK_LABEL_COLOR;
            ctx.textAlign = 'left';
            ctx.fillText(r.label, boxX + padX, ry);
            ctx.fillStyle = PFD_AP_ACTIVE_COLOR;
            ctx.textAlign = 'right';
            ctx.fillText(r.value, boxX + boxW - padX, ry);
            ry += rowH;
        }
    }

    private _getPfdNavInfo(): { distNm: number; brgDeg: number; crsDeg: number; xteNm: number } | null {
        const here = this.scene._apCurrentLatLon();
        if (!here) return null;
        const nav = this.scene._activeFlightPlanNav ?? this.scene._missionDestForNav();
        const wpts = this.scene._missionWaypoints;
        const idx = this.scene._missionCurrentWpIndex;
        const hasActiveWp = wpts && wpts.length > 0 && idx >= 0 && idx < wpts.length;
        let destLat: number, destLon: number, prevLat: number, prevLon: number;
        if (hasActiveWp) {
            const wp = wpts[idx];
            destLat = Number(wp.latitude);
            destLon = Number(wp.longitude);
            if (idx === 0) {
                prevLat = nav && Number.isFinite(nav.departure_lat) ? nav.departure_lat : here.lat;
                prevLon = nav && Number.isFinite(nav.departure_lon) ? nav.departure_lon : here.lon;
            } else {
                prevLat = Number(wpts[idx - 1].latitude);
                prevLon = Number(wpts[idx - 1].longitude);
            }
        } else if (nav && Number.isFinite(nav.arrival_lat) && Number.isFinite(nav.arrival_lon)) {
            destLat = nav.arrival_lat;
            destLon = nav.arrival_lon;
            prevLat = Number.isFinite(nav.departure_lat) ? nav.departure_lat : here.lat;
            prevLon = Number.isFinite(nav.departure_lon) ? nav.departure_lon : here.lon;
        } else {
            return null;
        }
        if (!Number.isFinite(destLat) || !Number.isFinite(destLon)) return null;
        const distNm = this.scene._haversineNm(here.lat, here.lon, destLat, destLon);
        const brgDeg = this.scene._initialBearingDeg(here.lat, here.lon, destLat, destLon);
        const crsDeg = this.scene._initialBearingDeg(prevLat, prevLon, destLat, destLon);
        const xteNm = this.scene._computeXteNm(prevLat, prevLon, destLat, destLon, here.lat, here.lon);
        return { distNm, brgDeg, crsDeg, xteNm };
    }

    private _drawPfdDataBlock(ctx: CanvasRenderingContext2D, x: number, yBottom: number, tasKt: number, gsKt: number, oatC: number): void {
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 2;
        ctx.fillStyle = PFD_PRIMARY_COLOR;
        ctx.fillText(`OAT ${Math.round(oatC)}\u00B0C`, x, yBottom - 28);
        ctx.fillText(`TAS ${Math.round(tasKt)}KT`, x, yBottom - 15);
        ctx.fillText(`GS ${Math.round(gsKt)}KT`, x, yBottom - 2);
        ctx.shadowBlur = 0;
    }

    private _drawPfdWind(ctx: CanvasRenderingContext2D, x: number, y: number, wind: { dirDeg: number; speedKt: number }, hdgDeg: number): void {
        if (!wind || !Number.isFinite(wind.speedKt) || wind.speedKt < 1) return;
        const r = 9;
        const ax = x + r;
        const ay = y + r;
        const rel = ((wind.dirDeg + 180) - hdgDeg) * Math.PI / 180;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(rel);
        ctx.strokeStyle = PFD_PRIMARY_COLOR;
        ctx.fillStyle = PFD_PRIMARY_COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(0, r);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, r);
        ctx.lineTo(-3, r - 5);
        ctx.lineTo(3, r - 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = PFD_PRIMARY_COLOR;
        ctx.fillText(`${String(Math.round(wind.dirDeg) % 360).padStart(3, '0')}\u00B0/${Math.round(wind.speedKt)}KT`, ax + r + 4, ay);
    }

    private _drawPfdMach(ctx: CanvasRenderingContext2D, cxTape: number, y: number, mach: number): void {
        if (!Number.isFinite(mach) || mach < PFD_MACH_DISPLAY_MIN) return;
        ctx.fillStyle = PFD_PRIMARY_COLOR;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`M${mach.toFixed(2).replace(/^0/, '')}`, cxTape, y);
    }

    private _drawPfdRadarAlt(ctx: CanvasRenderingContext2D, x: number, y: number, aglFt: number): void {
        if (!Number.isFinite(aglFt) || aglFt > PFD_RA_DISPLAY_MAX_FT) return;
        const w = PFD_TAPE_WIDTH_PX;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y, w, 15);
        ctx.fillStyle = PFD_AP_ACTIVE_COLOR;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ra = aglFt < 100 ? Math.round(aglFt) : Math.round(aglFt / 10) * 10;
        ctx.fillText(`RA ${ra}`, x + w / 2, y + 8);
    }

    private _drawPfdVsiBug(ctx: CanvasRenderingContext2D, x: number, ay: number, selVsFpm: number): void {
        const halfPx = PFD_FULL_VSI_HALF_PX;
        const maxFpm = PFD_FULL_VSI_MAX_FPM;
        const clamped = Math.max(-maxFpm, Math.min(maxFpm, selVsFpm));
        const by = ay - (clamped / maxFpm) * halfPx;
        ctx.fillStyle = PFD_SELECTED_COLOR;
        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.lineTo(x + 6, by - 4);
        ctx.lineTo(x + 6, by + 4);
        ctx.closePath();
        ctx.fill();
    }

    private _drawPfdSelHdg(ctx: CanvasRenderingContext2D, x: number, y: number, hdgSel: number): void {
        if (!Number.isFinite(hdgSel)) return;
        ctx.fillStyle = PFD_BUG_COLOR;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`HDG ${String(Math.round(hdgSel) % 360).padStart(3, '0')}\u00B0`, x, y);
    }

    private _drawPfdSelDtk(ctx: CanvasRenderingContext2D, x: number, y: number, dtkDeg: number): void {
        if (!Number.isFinite(dtkDeg)) return;
        ctx.fillStyle = PFD_BUG_COLOR;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`DTK ${String(Math.round(dtkDeg) % 360).padStart(3, '0')}\u00B0`, x, y);
    }

    private _drawPfdWptInfo(ctx: CanvasRenderingContext2D, cx: number, y: number, distNm: number, brgDeg: number): void {
        ctx.fillStyle = PFD_PRIMARY_COLOR;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`DIS ${distNm.toFixed(1)}NM   BRG ${String(Math.round(brgDeg) % 360).padStart(3, '0')}\u00B0`, cx, y);
    }

    private _drawPfdCdi(ctx: CanvasRenderingContext2D, cx: number, hy: number, hdgDeg: number, crsDeg: number, xteNm: number): void {
        const R = PFD_HSI_RADIUS_PX;
        ctx.save();
        ctx.translate(cx, hy);
        ctx.rotate((crsDeg - hdgDeg) * Math.PI / 180);
        ctx.strokeStyle = PFD_CRS_COLOR;
        ctx.fillStyle = PFD_CRS_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -R + 6);
        ctx.lineTo(0, -R + 22);
        ctx.moveTo(0, R - 6);
        ctx.lineTo(0, R - 22);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -R + 2);
        ctx.lineTo(-5, -R + 12);
        ctx.lineTo(5, -R + 12);
        ctx.closePath();
        ctx.fill();
        const dotR = R * 0.55;
        ctx.fillStyle = PFD_PRIMARY_COLOR_DIM;
        for (const d of [-2, -1, 1, 2]) {
            ctx.beginPath();
            ctx.arc((d / 2) * dotR, 0, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        const frac = Math.max(-1, Math.min(1, xteNm / PFD_CDI_FULLSCALE_NM));
        const barX = frac * dotR;
        ctx.strokeStyle = PFD_CRS_COLOR;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(barX, -R + 24);
        ctx.lineTo(barX, R - 24);
        ctx.stroke();
        ctx.restore();
    }

    private _drawPfdGlideslope(ctx: CanvasRenderingContext2D, x: number, ay: number, devFt: number): void {
        const halfPx = PFD_TAPE_HALF_HEIGHT_PX * 0.7;
        ctx.strokeStyle = PFD_PRIMARY_COLOR_DIM;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, ay - halfPx);
        ctx.lineTo(x, ay + halfPx);
        ctx.stroke();
        ctx.fillStyle = PFD_PRIMARY_COLOR_DIM;
        for (const d of [-2, -1, 1, 2]) {
            const dy = ay + (d / 2) * halfPx;
            ctx.beginPath();
            ctx.arc(x, dy, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        const frac = Math.max(-1, Math.min(1, devFt / PFD_GS_FULLSCALE_FT));
        const dy = ay + frac * halfPx;
        ctx.fillStyle = PFD_CRS_COLOR;
        ctx.beginPath();
        ctx.moveTo(x - 6, dy);
        ctx.lineTo(x, dy - 5);
        ctx.lineTo(x + 6, dy);
        ctx.lineTo(x, dy + 5);
        ctx.closePath();
        ctx.fill();
    }

    private _drawPfdVsi(ctx: CanvasRenderingContext2D, x: number, ay: number, vsFpm: number): void {
        const w = PFD_FULL_VSI_WIDTH_PX;
        const halfPx = PFD_FULL_VSI_HALF_PX;
        const maxFpm = PFD_FULL_VSI_MAX_FPM;
        const top = ay - halfPx;
        const bottom = ay + halfPx;

        ctx.fillStyle = PFD_TAPE_BG_COLOR;
        ctx.fillRect(x, top, w, halfPx * 2);

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, top, w, halfPx * 2);
        ctx.clip();

        ctx.strokeStyle = PFD_PRIMARY_COLOR_DIM;
        ctx.fillStyle = PFD_PRIMARY_COLOR_DIM;
        ctx.lineWidth = 1;
        ctx.font = '8px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let f = -maxFpm; f <= maxFpm; f += 500) {
            const y = ay - (f / maxFpm) * halfPx;
            const major = f % 1000 === 0;
            ctx.beginPath();
            ctx.moveTo(x + w, y);
            ctx.lineTo(x + w - (major ? 6 : 4), y);
            ctx.stroke();
            if (major && f !== 0) ctx.fillText(`${Math.abs(f) / 1000}`, x + w - 7, y);
        }

        ctx.strokeStyle = PFD_PRIMARY_COLOR_DIM;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, ay);
        ctx.lineTo(x + w, ay);
        ctx.stroke();

        const clamped = Math.max(-maxFpm, Math.min(maxFpm, vsFpm));
        const py = Math.max(top + 3, Math.min(bottom - 3, ay - (clamped / maxFpm) * halfPx));
        ctx.strokeStyle = PFD_PRIMARY_COLOR;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + 1, py);
        ctx.lineTo(x + w - 1, py);
        ctx.stroke();

        ctx.restore();

        if (Math.abs(vsFpm) >= 100) {
            ctx.fillStyle = PFD_PRIMARY_COLOR;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = vsFpm >= 0 ? 'bottom' : 'top';
            ctx.fillText(`${Math.round(vsFpm / 50) * 50}`, x + w + 2, py + (vsFpm >= 0 ? -2 : 2));
        }
    }

    private _drawPfdFma(ctx: CanvasRenderingContext2D, W: number): void {
        const h = PFD_FULL_FMA_H_PX;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, h);
        ctx.strokeStyle = 'rgba(80,255,160,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(W, h);
        ctx.stroke();

        const s = this.scene;
        const apOn = s._autopilotMaster === true;
        const lateral = s._autopilotNavHold === true ? 'NAV'
            : s._autopilotAprHold === true ? 'APR'
            : s._autopilotHdgHold === true ? 'HDG'
            : 'ROL';
        const vertical = s._autopilotAltHold === true ? 'ALT'
            : s._autopilotVsHold === true ? 'VS'
            : 'PIT';
        const color = apOn ? PFD_AP_ACTIVE_COLOR : PFD_PRIMARY_COLOR_DIM;

        ctx.font = 'bold 11px monospace';
        ctx.textBaseline = 'middle';
        const my = h / 2;
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(lateral, 10, my);
        ctx.textAlign = 'center';
        ctx.fillText(apOn ? 'AP' : 'FD', W / 2, my);
        ctx.textAlign = 'right';
        ctx.fillText(vertical, W - 10, my);
    }

    private _drawPfdBaro(ctx: CanvasRenderingContext2D, x: number, y: number): void {
        const w = PFD_TAPE_WIDTH_PX;
        const baroText = (this.scene.hudBaroVal && this.scene.hudBaroVal.textContent)
            ? this.scene.hudBaroVal.textContent
            : '29.92';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y, w, 16);
        ctx.strokeStyle = 'rgba(80,255,160,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, 16);
        ctx.fillStyle = PFD_SELECTED_COLOR;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${baroText} IN`, x + w / 2, y + 8);
    }

    private _drawPfdAnnunciators(ctx: CanvasRenderingContext2D, x: number, y: number): void {
        const flapSteps = this.scene.FLAP_STEPS as number[] | undefined;
        const flapDeg = flapSteps && flapSteps.length > this.scene.flapIndex ? flapSteps[this.scene.flapIndex] : 0;
        const flapText = flapDeg > 0 ? `FLAPS ${flapDeg}\u00B0` : 'FLAPS UP';

        const gs = this.scene.gearState;
        let gearText = 'GEAR ?';
        let gearColor = PFD_PRIMARY_COLOR_DIM;
        if (gs === GEAR_STATE_DOWN) { gearText = 'GEAR DOWN'; gearColor = PFD_AP_ACTIVE_COLOR; }
        else if (gs === GEAR_STATE_UP) { gearText = 'GEAR UP'; gearColor = PFD_PRIMARY_COLOR_DIM; }
        else if (gs === GEAR_STATE_RETRACTING || gs === GEAR_STATE_EXTENDING) { gearText = 'GEAR \u2022\u2022'; gearColor = '#ffcc00'; }

        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = flapDeg > 0 ? PFD_AP_ACTIVE_COLOR : PFD_PRIMARY_COLOR_DIM;
        ctx.fillText(flapText, x, y);
        ctx.fillStyle = gearColor;
        ctx.fillText(gearText, x, y + 14);
    }

}
