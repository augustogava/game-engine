import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { ENEMY_STATE } from '../types/index.js';
import { CURSOR_ATTACK_URL, CURSOR_HOTSPOT_X, CURSOR_HOTSPOT_Y, CURSOR_KNIGHT_URL, MAX_BAR_SLOTS } from '../constants/index.js';
import { FabulusPrefs, type FabulusActionId } from '../FabulusPrefs.js';

const CURSOR_KNIGHT = `url(${CURSOR_KNIGHT_URL}) ${CURSOR_HOTSPOT_X} ${CURSOR_HOTSPOT_Y}, crosshair`;
const CURSOR_ATTACK = `url(${CURSOR_ATTACK_URL}) ${CURSOR_HOTSPOT_X} ${CURSOR_HOTSPOT_Y}, crosshair`;
const CURSOR_TALK = 'pointer';

const HOLD_REPICK_INTERVAL_MS = 90;
const SKILL_ACTIONS: FabulusActionId[] = ['skill1', 'skill2', 'skill3', 'skill4'];
const NPC_TOOLTIP_OFFSET_X = 16;
const NPC_TOOLTIP_OFFSET_Y = 18;

export class InputSystem {
    private scene: FabulusScene;
    private pointerHeld = false;
    private lastHoldPickAt = 0;
    private lastPointerX = 0;
    private lastPointerY = 0;
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onPointerUp: ((e: PointerEvent) => void) | null = null;
    private _onPointerLeave: (() => void) | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _tooltipEl: HTMLDivElement | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        const canvas = this.scene.bScene.getEngine().getRenderingCanvas();
        if (!canvas) {
            console.warn('[Fabulus] Input init failed: no canvas');
            return;
        }
        this._canvas = canvas;

        this._onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            this.lastPointerX = e.offsetX;
            this.lastPointerY = e.offsetY;
            this.pointerHeld = true;
            this._handleClick(e.offsetX, e.offsetY);
        };
        this._onPointerMove = (e: PointerEvent) => {
            this.lastPointerX = e.offsetX;
            this.lastPointerY = e.offsetY;
            this._updateCursor(e.offsetX, e.offsetY);
        };
        this._onPointerUp = () => {
            this.pointerHeld = false;
        };

        this._onPointerLeave = () => {
            if (this._canvas) this._canvas.style.cursor = 'default';
            this.scene.enemySystem.setHovered(null);
            this.scene.npcSystem.setHovered(null);
            this._hideNpcTooltip();
        };

        this._createNpcTooltip();
        canvas.addEventListener('pointerdown', this._onPointerDown);
        canvas.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        canvas.addEventListener('pointerleave', this._onPointerLeave);
        this._updateCursor(0, 0);
        console.debug('[Fabulus] Input ready');
    }

    private _createNpcTooltip(): void {
        if (this._tooltipEl) return;
        const el = document.createElement('div');
        el.id = 'npc-tooltip';
        el.style.cssText = [
            'position:fixed', 'z-index:45', 'pointer-events:none', 'display:none',
            'padding:5px 12px', 'font-family:Cinzel, Georgia, serif', 'font-size:13px',
            'letter-spacing:1px', 'color:#f0d48a', 'background:rgba(10,7,5,0.95)',
            'border:1px solid #7a6235', 'text-shadow:0 1px 2px #000', 'white-space:nowrap',
            'box-shadow:0 4px 14px rgba(0,0,0,0.7)',
        ].join(';');
        document.body.appendChild(el);
        this._tooltipEl = el;
    }

    private _showNpcTooltip(x: number, y: number, npcId: number): void {
        if (!this._tooltipEl) return;
        const name = this.scene.npcSystem.getDisplayName(npcId);
        if (!name) {
            this._hideNpcTooltip();
            return;
        }
        this._tooltipEl.textContent = `Falar com ${name}`;
        this._tooltipEl.style.left = `${x + NPC_TOOLTIP_OFFSET_X}px`;
        this._tooltipEl.style.top = `${y + NPC_TOOLTIP_OFFSET_Y}px`;
        this._tooltipEl.style.display = 'block';
    }

    private _hideNpcTooltip(): void {
        if (this._tooltipEl) this._tooltipEl.style.display = 'none';
    }

    private _updateCursor(x: number, y: number): void {
        if (!this._canvas) return;
        if (this.scene.playerDead) {
            this._canvas.style.cursor = 'default';
            this.scene.enemySystem.setHovered(null);
            this.scene.npcSystem.setHovered(null);
            this._hideNpcTooltip();
            return;
        }
        const pick = this._pick(x, y);
        if (pick?.pickedMesh) {
            const meta = pick.pickedMesh.metadata as { enemyInstanceId?: number; npcId?: number; lootDropId?: number } | null;
            if (meta?.npcId != null) {
                this.scene.enemySystem.setHovered(null);
                this.scene.npcSystem.setHovered(meta.npcId);
                this._showNpcTooltip(x, y, meta.npcId);
                this._canvas.style.cursor = CURSOR_TALK;
                return;
            }
            if (meta?.enemyInstanceId != null) {
                const enemy = this.scene.enemySystem.findByInstanceId(meta.enemyInstanceId);
                if (enemy && enemy.state !== ENEMY_STATE.DEAD) {
                    this.scene.enemySystem.setHovered(enemy);
                    this.scene.npcSystem.setHovered(null);
                    this._hideNpcTooltip();
                    this._canvas.style.cursor = CURSOR_ATTACK;
                    return;
                }
            }
            if (meta?.lootDropId != null) {
                this.scene.enemySystem.setHovered(null);
                this.scene.npcSystem.setHovered(null);
                this._hideNpcTooltip();
                this._canvas.style.cursor = 'pointer';
                return;
            }
        }
        this.scene.enemySystem.setHovered(null);
        this.scene.npcSystem.setHovered(null);
        this._hideNpcTooltip();
        this._canvas.style.cursor = CURSOR_KNIGHT;
    }

    private _pick(x: number, y: number): BABYLON.PickingInfo | null {
        const s = this.scene.bScene;
        const pick = s.pick(x, y, (mesh) => mesh.isPickable);
        return pick && pick.hit ? pick : null;
    }

    private _handleClick(x: number, y: number): void {
        if (this.scene.playerDead) return;
        const pick = this._pick(x, y);
        if (!pick || !pick.pickedMesh) return;

        if (this.scene.propSystem.isEditorActive()) {
            this.scene.propSystem.handleEditorClick(pick);
            return;
        }

        const mesh = pick.pickedMesh;
        const meta = mesh.metadata as { enemyInstanceId?: number; lootDropId?: number; npcId?: number } | null;

        if (meta && meta.npcId != null) {
            this.scene.lootSystem.cancelPendingPickup();
            this.scene.npcSystem.beginInteract(meta.npcId);
            return;
        }

        if (meta && meta.enemyInstanceId != null) {
            const enemy = this.scene.enemySystem.findByInstanceId(meta.enemyInstanceId);
            if (enemy && enemy.state !== ENEMY_STATE.DEAD) {
                this.scene.attackTarget = enemy;
                this.scene.moveTarget = null;
                this.scene.lootSystem.cancelPendingPickup();
                this.scene.npcSystem.cancelInteract();
                this.scene.enemySystem.refreshHpBar(enemy);
                return;
            }
        }

        if (meta && meta.lootDropId != null) {
            this.scene.lootSystem.pickupByDropId(meta.lootDropId);
            return;
        }

        if (pick.pickedPoint) {
            this.scene.attackTarget = null;
            this.scene.lootSystem.cancelPendingPickup();
            this.scene.npcSystem.cancelInteract();
            this.scene.moveTarget = new BABYLON.Vector3(pick.pickedPoint.x, 0, pick.pickedPoint.z);
            this.scene.vfxSystem.moveMarker(pick.pickedPoint.x, pick.pickedPoint.z);
        }
    }

    private _holdRepick(): void {
        if (!this.pointerHeld || this.scene.playerDead || this.scene.attackTarget) return;
        if (this.scene.propSystem.isEditorActive()) return;
        const now = this.scene.now();
        if (now - this.lastHoldPickAt < HOLD_REPICK_INTERVAL_MS) return;
        this.lastHoldPickAt = now;
        const pick = this._pick(this.lastPointerX, this.lastPointerY);
        if (pick && pick.pickedPoint && pick.pickedMesh === this.scene.groundMesh) {
            this.scene.lootSystem.cancelPendingPickup();
            this.scene.moveTarget = new BABYLON.Vector3(pick.pickedPoint.x, 0, pick.pickedPoint.z);
        }
    }

    private _attackNearest(): void {
        let best = null as any;
        let bestDist = Infinity;
        const root = this.scene.playerRoot;
        if (!root) return;
        for (const e of this.scene.enemies) {
            if (e.state === ENEMY_STATE.DEAD || !e.root) continue;
            const d = Math.hypot(e.root.position.x - root.position.x, e.root.position.z - root.position.z);
            if (d < bestDist) {
                bestDist = d;
                best = e;
            }
        }
        if (best) {
            this.scene.attackTarget = best;
            this.scene.moveTarget = null;
            this.scene.enemySystem.refreshHpBar(best);
        }
    }

    update(_dt: number): void {
        const input = this.scene.inputManager;
        if (!input) return;

        const shiftHeld = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
        this.scene.runMode = FabulusPrefs.get().runByDefault ? !shiftHeld : shiftHeld;

        for (let i = 0; i < MAX_BAR_SLOTS && i < SKILL_ACTIONS.length; i++) {
            if (input.isKeyPressed(FabulusPrefs.codeFor(SKILL_ACTIONS[i]))) {
                this.scene.skillSystem.tryCastSlot(i + 1);
            }
        }

        if (input.isKeyPressed(FabulusPrefs.codeFor('character'))) {
            this.scene.uiSystem.togglePanel('character');
        }
        if (input.isKeyPressed(FabulusPrefs.codeFor('inventory'))) {
            this.scene.uiSystem.toggleInventory();
        }
        if (input.isKeyPressed(FabulusPrefs.codeFor('skills'))) {
            this.scene.uiSystem.togglePanel('skills');
        }
        if (input.isKeyPressed('Escape')) {
            this.scene.uiSystem.handleEscape();
        }
        if (input.isKeyPressed(FabulusPrefs.codeFor('attackNearest'))) {
            this._attackNearest();
        }
        if (input.isKeyPressed(FabulusPrefs.codeFor('potion1'))) {
            this.scene.uiSystem.usePotionSlot(1);
        }
        if (input.isKeyPressed(FabulusPrefs.codeFor('potion2'))) {
            this.scene.uiSystem.usePotionSlot(2);
        }
        if (input.isKeyPressed(FabulusPrefs.codeFor('minimap'))) {
            this.scene.minimapSystem.toggle();
        }
        if (input.isKeyPressed(FabulusPrefs.codeFor('editor'))) {
            this.scene.propSystem.toggleEditor();
        }

        this._holdRepick();
    }

    dispose(): void {
        if (this._canvas) {
            if (this._onPointerDown) this._canvas.removeEventListener('pointerdown', this._onPointerDown);
            if (this._onPointerMove) this._canvas.removeEventListener('pointermove', this._onPointerMove);
            if (this._onPointerLeave) this._canvas.removeEventListener('pointerleave', this._onPointerLeave);
        }
        if (this._onPointerUp) window.removeEventListener('pointerup', this._onPointerUp);
        if (this._tooltipEl) {
            this._tooltipEl.remove();
            this._tooltipEl = null;
        }
    }
}
