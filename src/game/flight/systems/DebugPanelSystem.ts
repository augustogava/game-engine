import * as BABYLON from '@babylonjs/core';
import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { BUILD_VERSION, ENGINE_TYPE_PISTON, GROUND_Y } from '../constants/index.js';

const PANEL_STATE_STORAGE_KEY = 'flight_panels_v1';
const SETTINGS_TOGGLE_KEY_CODE = 'KeyS';

export class DebugPanelSystem {
    private readonly scene: any;
    private readonly _windowDragHandlers: { move: (e: MouseEvent) => void; up: () => void }[] = [];

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    makeDraggable(el: HTMLElement): void {
        let startX = 0, startY = 0, elX = 0, elY = 0, dragging = false;
        el.style.pointerEvents = 'auto';
        el.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button !== 0) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            elX = rect.left;
            elY = rect.top;
            e.preventDefault();
        });
        const moveHandler = (e: MouseEvent): void => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            el.style.position = 'fixed';
            el.style.left = `${elX + dx}px`;
            el.style.top = `${elY + dy}px`;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.transform = 'none';
        };
        const upHandler = (): void => { dragging = false; };
        window.addEventListener('mousemove', moveHandler);
        window.addEventListener('mouseup', upHandler);
        this._windowDragHandlers.push({ move: moveHandler, up: upHandler });
    }

    dispose(): void {
        for (const h of this._windowDragHandlers) {
            try { window.removeEventListener('mousemove', h.move); } catch (_) { /* ignore */ }
            try { window.removeEventListener('mouseup', h.up); } catch (_) { /* ignore */ }
        }
        this._windowDragHandlers.length = 0;
    }

    closeAllPanels(except?: HTMLElement | null): void {
        const panels = [this.scene._missionPanelEl, this.scene._aircraftPanelEl, this.scene._flightPlansPanelEl, this.scene._logbookPanelEl, this.scene._efbPanelEl, this.scene._achievementsPanelEl, this.scene._leaderboardPanelEl];
        const btns = [this.scene._missionBtnEl, this.scene._aircraftBtnEl, this.scene._flightPlansBtnEl, this.scene._logbookBtnEl, this.scene._efbBtnEl, this.scene._achievementsBtnEl, this.scene._leaderboardBtnEl];
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (!p || p === except) continue;
            if (p.id && this.scene._pinnedPanels.has(p.id)) continue;
            p.style.display = 'none';
            if (btns[i]) { btns[i]!.style.borderColor = 'rgba(80,255,160,.3)'; btns[i]!.style.boxShadow = 'none'; }
        }
    }

    persistPanelState(): void {
        try {
            const ids = ['missions-panel', 'aircraft-panel', 'flight-plans-panel', 'logbook-panel', 'efb-panel', 'achievements-panel', 'leaderboard-panel'];
            const state: Record<string, { x?: number; y?: number; w?: number; h?: number; minimized: boolean; pinned: boolean }> = {};
            for (const id of ids) {
                const el = document.getElementById(id);
                if (!el) continue;
                const entry: { x?: number; y?: number; w?: number; h?: number; minimized: boolean; pinned: boolean } = {
                    minimized: this.scene._minimizedPanels.has(id),
                    pinned: this.scene._pinnedPanels.has(id),
                };
                if (el.style.left) entry.x = parseInt(el.style.left, 10);
                if (el.style.top) entry.y = parseInt(el.style.top, 10);
                if (el.style.width) entry.w = parseInt(el.style.width, 10);
                if (el.style.height && el.style.height !== 'auto') entry.h = parseInt(el.style.height, 10);
                state[id] = entry;
            }
            localStorage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify(state));
        } catch (err) {
            console.warn('[Panels] Failed to persist state:', err);
        }
    }

    restorePanelState(): void {
        try {
            const raw = localStorage.getItem(PANEL_STATE_STORAGE_KEY);
            if (!raw) return;
            const state = JSON.parse(raw);
            if (!state || typeof state !== 'object') return;
            for (const id of Object.keys(state)) {
                const el = document.getElementById(id);
                const cfg = state[id];
                if (!el || !cfg) continue;
                const vw = window.innerWidth, vh = window.innerHeight;
                if (Number.isFinite(cfg.x) && Number.isFinite(cfg.y)) {
                    const x = Math.max(0, Math.min(vw - 100, Number(cfg.x)));
                    const y = Math.max(0, Math.min(vh - 50, Number(cfg.y)));
                    el.style.left = `${x}px`;
                    el.style.top = `${y}px`;
                    el.style.right = 'auto';
                }
                if (Number.isFinite(cfg.w) && Number.isFinite(cfg.h)) {
                    el.style.width = `${Math.max(220, Number(cfg.w))}px`;
                    el.style.height = `${Math.max(120, Number(cfg.h))}px`;
                }
                if (cfg.pinned) {
                    this.scene._pinnedPanels.add(id);
                    const pinBtn = el.querySelector<HTMLButtonElement>('.panel-pin');
                    if (pinBtn) { pinBtn.textContent = '\u25CF'; pinBtn.style.color = '#ffcc55'; }
                }
                if (cfg.minimized) {
                    this.scene._minimizedPanels.add(id);
                    const body = el.querySelector<HTMLElement>('.panel-body');
                    const tools = el.querySelector<HTMLElement>('.panel-toolbar');
                    if (body) body.style.display = 'none';
                    if (tools) tools.style.display = 'none';
                    el.style.height = 'auto';
                }
            }
        } catch (err) {
            console.warn('[Panels] Failed to restore state:', err);
        }
    }

    setupPanelControls(): void {
        const panels = ['missions-panel', 'aircraft-panel', 'flight-plans-panel', 'logbook-panel', 'efb-panel', 'achievements-panel', 'leaderboard-panel'];
        for (const id of panels) {
            const panel = document.getElementById(id);
            if (!panel) continue;
            const handle = panel.querySelector<HTMLElement>('.panel-handle');
            if (handle) this.scene._wirePanelDrag(panel, handle);
            const resize = panel.querySelector<HTMLElement>('.panel-resize');
            if (resize) this.scene._wirePanelResize(panel, resize);
            const minBtn = panel.querySelector<HTMLButtonElement>('.panel-min');
            if (minBtn) {
                minBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    this.scene._togglePanelMinimize(id);
                });
            }
            const pinBtn = panel.querySelector<HTMLButtonElement>('.panel-pin');
            if (pinBtn) {
                pinBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    this.scene._togglePanelPin(id);
                });
            }
            const closeBtn = panel.querySelector<HTMLButtonElement>('.panel-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    panel.style.display = 'none';
                    const btnId = closeBtn.getAttribute('data-btn');
                    if (btnId) {
                        const btn = document.getElementById(btnId);
                        if (btn) {
                            btn.style.borderColor = 'rgba(80,255,160,.3)';
                            btn.style.boxShadow = 'none';
                        }
                    }
                });
            }
        }
        this.scene._restorePanelState();
    }

    wirePanelDrag(panel: HTMLElement, handle: HTMLElement): void {
        handle.addEventListener('pointerdown', (ev: PointerEvent) => {
            const target = ev.target as HTMLElement;
            if (target && target.tagName === 'BUTTON') return;
            ev.preventDefault();
            const rect = panel.getBoundingClientRect();
            this.scene._panelDragState = {
                panel,
                offsetX: ev.clientX - rect.left,
                offsetY: ev.clientY - rect.top,
                pointerId: ev.pointerId,
            };
            handle.setPointerCapture(ev.pointerId);
            handle.style.cursor = 'grabbing';
        });
        handle.addEventListener('pointermove', (ev: PointerEvent) => {
            const st = this.scene._panelDragState;
            if (!st || st.pointerId !== ev.pointerId) return;
            const vw = window.innerWidth, vh = window.innerHeight;
            const newX = Math.max(0, Math.min(vw - 60, ev.clientX - st.offsetX));
            const newY = Math.max(0, Math.min(vh - 30, ev.clientY - st.offsetY));
            panel.style.left = `${newX}px`;
            panel.style.top = `${newY}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            panel.style.transform = 'none';
        });
        const endDrag = (ev: PointerEvent) => {
            const st = this.scene._panelDragState;
            if (!st || st.pointerId !== ev.pointerId) return;
            this.scene._panelDragState = null;
            try { handle.releasePointerCapture(ev.pointerId); } catch (_e) { /* ignore */ }
            handle.style.cursor = 'grab';
            this.scene._persistPanelState();
        };
        handle.addEventListener('pointerup', endDrag);
        handle.addEventListener('pointercancel', endDrag);
    }

    wirePanelResize(panel: HTMLElement, handle: HTMLElement): void {
        handle.addEventListener('pointerdown', (ev: PointerEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            const rect = panel.getBoundingClientRect();
            this.scene._panelResizeState = {
                panel,
                startW: rect.width,
                startH: rect.height,
                startX: ev.clientX,
                startY: ev.clientY,
                pointerId: ev.pointerId,
            };
            handle.setPointerCapture(ev.pointerId);
        });
        handle.addEventListener('pointermove', (ev: PointerEvent) => {
            const st = this.scene._panelResizeState;
            if (!st || st.pointerId !== ev.pointerId) return;
            const dx = ev.clientX - st.startX;
            const dy = ev.clientY - st.startY;
            panel.style.width = `${Math.max(220, st.startW + dx)}px`;
            panel.style.height = `${Math.max(120, st.startH + dy)}px`;
        });
        const endResize = (ev: PointerEvent) => {
            const st = this.scene._panelResizeState;
            if (!st || st.pointerId !== ev.pointerId) return;
            this.scene._panelResizeState = null;
            try { handle.releasePointerCapture(ev.pointerId); } catch (_e) { /* ignore */ }
            this.scene._persistPanelState();
        };
        handle.addEventListener('pointerup', endResize);
        handle.addEventListener('pointercancel', endResize);
    }

    togglePanelMinimize(id: string): void {
        const panel = document.getElementById(id);
        if (!panel) return;
        const body = panel.querySelector<HTMLElement>('.panel-body');
        const tools = panel.querySelector<HTMLElement>('.panel-toolbar');
        const resize = panel.querySelector<HTMLElement>('.panel-resize');
        const minBtn = panel.querySelector<HTMLButtonElement>('.panel-min');
        if (this.scene._minimizedPanels.has(id)) {
            this.scene._minimizedPanels.delete(id);
            if (body) body.style.display = '';
            if (tools) tools.style.display = '';
            if (resize) resize.style.display = '';
            if (minBtn) minBtn.textContent = '_';
            panel.style.height = '400px';
        } else {
            this.scene._minimizedPanels.add(id);
            if (body) body.style.display = 'none';
            if (tools) tools.style.display = 'none';
            if (resize) resize.style.display = 'none';
            if (minBtn) minBtn.textContent = '\u25A1';
            panel.style.height = 'auto';
        }
        this.scene._persistPanelState();
    }

    togglePanelPin(id: string): void {
        const panel = document.getElementById(id);
        if (!panel) return;
        const pinBtn = panel.querySelector<HTMLButtonElement>('.panel-pin');
        if (this.scene._pinnedPanels.has(id)) {
            this.scene._pinnedPanels.delete(id);
            if (pinBtn) { pinBtn.textContent = '\u25CB'; pinBtn.style.color = '#40ffaa'; }
        } else {
            this.scene._pinnedPanels.add(id);
            if (pinBtn) { pinBtn.textContent = '\u25CF'; pinBtn.style.color = '#ffcc55'; }
        }
        this.scene._persistPanelState();
    }

    buildDebugPanel(): void {
        const panel = document.createElement('div');
        panel.id = 'dbg-panel';
        panel.innerHTML = `
<style>
#dbg-panel{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:200;
  font-family:'Inter',monospace;color:#7df9c8;pointer-events:auto;
  background:linear-gradient(135deg,rgba(0,20,15,.82),rgba(0,30,20,.65));
  border:1px solid rgba(80,255,160,.25);border-radius:10px;padding:10px 16px;
  backdrop-filter:blur(12px);box-shadow:0 0 24px rgba(0,255,128,.08);
  display:flex;gap:20px;font-size:10px;max-width:95vw;overflow-x:auto;}
#dbg-panel.hidden{display:none}
.dbg-section{display:flex;flex-direction:column;gap:3px;min-width:200px}
.dbg-title{font-family:'Orbitron',monospace;font-size:9px;letter-spacing:.15em;color:rgba(100,240,180,.6);border-bottom:1px solid rgba(80,255,160,.15);padding-bottom:3px;margin-bottom:2px}
.dbg-row{display:flex;justify-content:space-between;gap:8px}
.dbg-lbl{color:rgba(200,255,230,.5);white-space:nowrap}
.dbg-val{color:#40ffaa;font-family:monospace;text-align:right;white-space:nowrap}
.dbg-ctrl{display:flex;flex-direction:column;gap:4px;min-width:180px}
.dbg-slider-row{display:flex;align-items:center;gap:6px}
.dbg-slider-row label{color:rgba(200,255,230,.5);font-size:9px;min-width:55px}
.dbg-slider-row input[type=range]{flex:1;height:4px;accent-color:#40ffaa;cursor:pointer}
.dbg-slider-row .dbg-sv{color:#40ffaa;font-family:monospace;font-size:9px;min-width:40px;text-align:right}
</style>
<div class="dbg-section">
  <div class="dbg-title">FLIGHT STATE</div>
  <div class="dbg-row"><span class="dbg-lbl">terrainY</span><span class="dbg-val" id="dbg-terrainY">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">groundLevel</span><span class="dbg-val" id="dbg-groundlvl">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">isOnGround</span><span class="dbg-val" id="dbg-onground">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">vert rate (m/s)</span><span class="dbg-val" id="dbg-vertrate">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">alt MSL (m)</span><span class="dbg-val" id="dbg-altmsl">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">lat / lon</span><span class="dbg-val" id="dbg-latlon">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">tiles</span><span class="dbg-val" id="dbg-tilesinfo">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">build</span><span class="dbg-val" id="dbg-buildver" style="color:#ffcc00">\u2014</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">POWERTRAIN</div>
  <div class="dbg-row"><span class="dbg-lbl">engine_type</span><span class="dbg-val" id="dbg-engtype">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">power / rpm</span><span class="dbg-val" id="dbg-engperf">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">fuel kg / %</span><span class="dbg-val" id="dbg-fueldbg">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">mixture</span><span class="dbg-val" id="dbg-mixture">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">magneto</span><span class="dbg-val" id="dbg-magneto">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">gear comp</span><span class="dbg-val" id="dbg-gearcomp">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">gear state</span><span class="dbg-val" id="dbg-gearstate">\u2014</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">AIRPLANE</div>
  <div class="dbg-row"><span class="dbg-lbl">POS (x,y,z)</span><span class="dbg-val" id="dbg-ppos">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">ROT (H,P,R)</span><span class="dbg-val" id="dbg-prot">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">VEL (km/h)</span><span class="dbg-val" id="dbg-pvel">\u2014</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">CAMERA</div>
  <div class="dbg-row"><span class="dbg-lbl">POS (x,y,z)</span><span class="dbg-val" id="dbg-cpos">\u2014</span></div>
  <div class="dbg-row"><span class="dbg-lbl">\u03B1 / \u03B2 / R</span><span class="dbg-val" id="dbg-corbit">\u2014</span></div>
</div>
<div class="dbg-ctrl">
  <div class="dbg-title">CAMERA CTRL</div>
  <div class="dbg-slider-row"><label>Radius</label><input type="range" id="dbg-cr" min="10" max="500" value="65"><span class="dbg-sv" id="dbg-crv">65</span></div>
  <div class="dbg-slider-row"><label>Height \u03B2</label><input type="range" id="dbg-cb" min="0" max="314" value="150"><span class="dbg-sv" id="dbg-cbv">1.50</span></div>
</div>
<div class="dbg-ctrl">
  <div class="dbg-title">AIRPLANE CTRL</div>
  <div class="dbg-slider-row"><label>Heading</label><input type="range" id="dbg-ph" min="0" max="360" value="0"><span class="dbg-sv" id="dbg-phv">0\u00B0</span></div>
  <div class="dbg-slider-row"><label>Pitch</label><input type="range" id="dbg-pp" min="-180" max="180" value="0"><span class="dbg-sv" id="dbg-ppv">0\u00B0</span></div>
  <div class="dbg-slider-row"><label>Roll</label><input type="range" id="dbg-pr" min="-180" max="180" value="0"><span class="dbg-sv" id="dbg-prv">0\u00B0</span></div>
</div>
<div class="dbg-section">
  <div class="dbg-title">MULTIPLAYER</div>
  <div class="dbg-row"><span class="dbg-lbl">Status</span><span class="dbg-val" id="dbg-mp-status">DISCONNECTED</span></div>
  <div class="dbg-row"><span class="dbg-lbl">Online</span><span class="dbg-val" id="dbg-mp-count">0</span></div>
  <div class="dbg-row"><span class="dbg-lbl">User ID</span><span class="dbg-val" id="dbg-mp-uid">\u2014</span></div>
</div>`;
        document.body.appendChild(panel);
        this.scene.dbgPanel    = panel;
        this.scene.dbgPlanePos = document.getElementById('dbg-ppos')!;
        this.scene.dbgPlaneRot = document.getElementById('dbg-prot')!;
        this.scene.dbgPlaneVel = document.getElementById('dbg-pvel')!;
        this.scene.dbgCamPos   = document.getElementById('dbg-cpos')!;
        this.scene.dbgCamOrbit = document.getElementById('dbg-corbit')!;
        this.scene.dbgMpStatus = document.getElementById('dbg-mp-status')!;
        this.scene.dbgMpCount  = document.getElementById('dbg-mp-count')!;
        this.scene.dbgMpUserId = document.getElementById('dbg-mp-uid')!;
        this.scene.dbgTerrainY  = document.getElementById('dbg-terrainY')!;
        this.scene.dbgGroundLvl = document.getElementById('dbg-groundlvl')!;
        this.scene.dbgOnGround  = document.getElementById('dbg-onground')!;
        this.scene.dbgVertRate  = document.getElementById('dbg-vertrate')!;
        this.scene.dbgAltMsl    = document.getElementById('dbg-altmsl')!;
        this.scene.dbgLatLon    = document.getElementById('dbg-latlon')!;
        this.scene.dbgTilesInfo = document.getElementById('dbg-tilesinfo')!;
        this.scene.dbgEngineType = document.getElementById('dbg-engtype')!;
        this.scene.dbgEnginePerf = document.getElementById('dbg-engperf')!;
        this.scene.dbgFuelDbg    = document.getElementById('dbg-fueldbg')!;
        this.scene.dbgMixture    = document.getElementById('dbg-mixture')!;
        this.scene.dbgMagneto    = document.getElementById('dbg-magneto')!;
        this.scene.dbgGearComp   = document.getElementById('dbg-gearcomp')!;
        this.scene.dbgGearState  = document.getElementById('dbg-gearstate')!;

        const buildVerEl = document.getElementById('dbg-buildver');
        if (buildVerEl) buildVerEl.textContent = `v${BUILD_VERSION}`;

        panel.classList.add('hidden');

        if (!this.scene._dbgKeydownHandler) {
            this.scene._dbgKeydownHandler = (e: KeyboardEvent) => {
                if (this.scene._disposed) return;
                if (e.shiftKey && e.code === 'KeyD') {
                    panel.classList.toggle('hidden');
                } else if (e.shiftKey && e.code === SETTINGS_TOGGLE_KEY_CODE) {
                    const settingsUi = document.getElementById('debug-ui');
                    if (settingsUi) settingsUi.classList.toggle('minimized');
                    else console.warn('[Debug] #debug-ui not found for settings toggle');
                }
            };
            window.addEventListener('keydown', this.scene._dbgKeydownHandler);
        }

        document.getElementById('dbg-cr')!.addEventListener('input', (e: any) => {
            const v = parseFloat(e.target.value);
            if (!Number.isFinite(v)) {
                console.warn('[Debug] dbg-cr ignored: non-finite value');
                return;
            }
            if (this.scene.camera) this.scene.camera.radius = v;
            document.getElementById('dbg-crv')!.textContent = String(v);
        });

        document.getElementById('dbg-cb')!.addEventListener('input', (e: any) => {
            const raw = parseFloat(e.target.value);
            if (!Number.isFinite(raw)) {
                console.warn('[Debug] dbg-cb ignored: non-finite value');
                return;
            }
            const v = raw / 100;
            if (this.scene.camera) this.scene.camera.beta = v;
            document.getElementById('dbg-cbv')!.textContent = v.toFixed(2);
        });

        const rotHandler = () => this.scene._applyDebugRotation();

        document.getElementById('dbg-ph')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-phv')!.textContent = `${e.target.value}\u00B0`;
            rotHandler();
        });
        document.getElementById('dbg-pp')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-ppv')!.textContent = `${e.target.value}\u00B0`;
            rotHandler();
        });
        document.getElementById('dbg-pr')!.addEventListener('input', (e: any) => {
            document.getElementById('dbg-prv')!.textContent = `${e.target.value}\u00B0`;
            rotHandler();
        });
    }

    applyDebugRotation(): void {
        const hDeg = parseFloat((document.getElementById('dbg-ph') as HTMLInputElement).value);
        const pDeg = parseFloat((document.getElementById('dbg-pp') as HTMLInputElement).value);
        const rDeg = parseFloat((document.getElementById('dbg-pr') as HTMLInputElement).value);

        this.scene.planeRoot.rotationQuaternion!.set(0, 0, 0, 1);

        const hq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 1, 0), (hDeg * Math.PI) / 180);
        const pq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1, 0, 0), (pDeg * Math.PI) / 180);
        const rq = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(0, 0, 1), (rDeg * Math.PI) / 180);

        this.scene.planeRoot.rotationQuaternion = this.scene.planeRoot.rotationQuaternion!
            .multiply(hq)
            .multiply(pq)
            .multiply(rq);

        this.scene.angularVelocity.set(0, 0, 0);
        this.scene.velocity.set(0, 0, 0);
    }

    updateDebugReadouts(): void {
        if (!this.scene.dbgPlanePos) return;
        // The telemetry panel is hidden most of the time; skip the ~20 DOM writes per frame while it is not visible.
        const panel = this.scene.dbgPanel as HTMLElement | undefined;
        if (panel && panel.classList.contains('hidden')) return;

        const pos = this.scene.planeRoot.position;
        this.scene.dbgPlanePos.textContent = `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;

        const q = this.scene.planeRoot.rotationQuaternion;
        if (q) {
            const surfaceUp = new BABYLON.Vector3(0, 1, 0);
            const wm = this.scene.planeRoot.getWorldMatrix();
            const fwd = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, 1), wm).normalize();
            const right = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1, 0, 0), wm).normalize();

            const pitch = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(fwd, surfaceUp))));
            const roll  = Math.asin(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(right, surfaceUp))));

            const fwdFlat = fwd.subtract(surfaceUp.scale(BABYLON.Vector3.Dot(fwd, surfaceUp)));
            if (fwdFlat.lengthSquared() > 0.0001) fwdFlat.normalize();
            // Same north convention as the HUD heading (-Z = north) so both readouts agree.
            const north = new BABYLON.Vector3(0, 0, -1);
            const east  = new BABYLON.Vector3(1, 0, 0);
            const headingRad = Math.atan2(BABYLON.Vector3.Dot(fwdFlat, east), BABYLON.Vector3.Dot(fwdFlat, north));
            const hDeg = ((headingRad * 180 / Math.PI) + 360) % 360;

            const pDeg = (pitch * 180 / Math.PI);
            const rDeg = (roll * 180 / Math.PI);
            this.scene.dbgPlaneRot.textContent = `H:${hDeg.toFixed(1)}\u00B0 P:${pDeg.toFixed(1)}\u00B0 R:${rDeg.toFixed(1)}\u00B0`;
        }

        const vel = this.scene.velocity;
        this.scene.dbgPlaneVel.textContent = `${(vel.length() * 3.6).toFixed(1)} (${(vel.x * 3.6).toFixed(1)}, ${(vel.y * 3.6).toFixed(1)}, ${(vel.z * 3.6).toFixed(1)})`;

        if (this.scene.camera) {
            const cp = this.scene.camera.position;
            this.scene.dbgCamPos.textContent = `${cp.x.toFixed(0)}, ${cp.y.toFixed(0)}, ${cp.z.toFixed(0)}`;
            this.scene.dbgCamOrbit.textContent = `${(this.scene.camera.alpha * 180 / Math.PI).toFixed(1)}\u00B0 / ${(this.scene.camera.beta * 180 / Math.PI).toFixed(1)}\u00B0 / ${this.scene.camera.radius.toFixed(1)}`;
        }

        const groundLevel = this.scene.tiles ? this.scene.terrainY : GROUND_Y;
        this.scene.dbgTerrainY.textContent = this.scene.terrainY.toFixed(2);
        this.scene.dbgGroundLvl.textContent = groundLevel.toFixed(2);
        this.scene.dbgOnGround.textContent = this.scene.isOnGround ? 'YES' : 'NO';
        this.scene.dbgOnGround.style.color = this.scene.isOnGround ? '#ff6060' : '#40ffaa';
        this.scene.dbgVertRate.textContent = vel.y.toFixed(2);
        this.scene.dbgAltMsl.textContent = (this.scene.refAlt + pos.y).toFixed(1);

        const { lat, lon } = this.scene._getCurrentLatLon();
        this.scene.dbgLatLon.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

        this.scene.dbgTilesInfo.textContent = this.scene.tiles ? 'loaded' : 'none';

        const fuelPct = this.scene.aircraftConfig.fuel_capacity_kg > 0
            ? (this.scene.fuelRemaining / this.scene.aircraftConfig.fuel_capacity_kg) * 100
            : 100;
        const gearCompText = this.scene.gearCompression.length > 0
            ? this.scene.gearCompression.map((g: number) => g.toFixed(2)).join(', ')
            : 'n/a';
        this.scene.dbgEngineType.textContent = String(this.scene.aircraftConfig.engine_type);
        this.scene.dbgEnginePerf.textContent = `${Math.round(this.scene.enginePower * 100)}% / ${Math.round(this.scene.engineRpm)}`;
        this.scene.dbgFuelDbg.textContent = `${this.scene.fuelRemaining.toFixed(1)} / ${fuelPct.toFixed(1)}%`;
        this.scene.dbgMixture.textContent = this.scene.aircraftConfig.engine_type === ENGINE_TYPE_PISTON
            ? this.scene.mixtureLevel.toFixed(2)
            : 'n/a';
        this.scene.dbgMagneto.textContent = this.scene.aircraftConfig.engine_type === ENGINE_TYPE_PISTON
            ? String(this.scene.magnetoSwitch)
            : 'n/a';
        this.scene.dbgGearComp.textContent = gearCompText;

        const gsLabels = ['DOWN', 'RETRACTING', 'UP', 'EXTENDING'];
        const gsColors = ['#40ffaa', '#ffcc00', '#888888', '#ffcc00'];
        this.scene.dbgGearState.textContent = gsLabels[this.scene.gearState] || '??';
        this.scene.dbgGearState.style.color = gsColors[this.scene.gearState] || '#fff';
    }

}
