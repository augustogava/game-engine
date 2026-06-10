import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { ENEMY_STATE } from '../types/index.js';
import { CURSOR_ATTACK_URL, CURSOR_HOTSPOT_X, CURSOR_HOTSPOT_Y, CURSOR_KNIGHT_URL, MAX_BAR_SLOTS } from '../constants/index.js';
import { FabulusPrefs, type FabulusActionId } from '../FabulusPrefs.js';

const CURSOR_KNIGHT = `url(${CURSOR_KNIGHT_URL}) ${CURSOR_HOTSPOT_X} ${CURSOR_HOTSPOT_Y}, crosshair`;
const CURSOR_ATTACK = `url(${CURSOR_ATTACK_URL}) ${CURSOR_HOTSPOT_X} ${CURSOR_HOTSPOT_Y}, crosshair`;

const HOLD_REPICK_INTERVAL_MS = 90;
const SKILL_ACTIONS: FabulusActionId[] = ['skill1', 'skill2', 'skill3', 'skill4'];

export class InputSystem {
    private scene: FabulusScene;
    private pointerHeld = false;
    private lastHoldPickAt = 0;
    private lastPointerX = 0;
    private lastPointerY = 0;
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onPointerUp: ((e: PointerEvent) => void) | null = null;
    private _canvas: HTMLCanvasElement | null = null;

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

        canvas.addEventListener('pointerdown', this._onPointerDown);
        canvas.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        canvas.addEventListener('pointerleave', () => {
            if (this._canvas) this._canvas.style.cursor = 'default';
            this.scene.enemySystem.setHovered(null);
        });
        this._updateCursor(0, 0);
        console.debug('[Fabulus] Input ready');
    }

    private _updateCursor(x: number, y: number): void {
        if (!this._canvas) return;
        if (this.scene.playerDead) {
            this._canvas.style.cursor = 'default';
            return;
        }
        const pick = this._pick(x, y);
        if (pick?.pickedMesh) {
            const meta = pick.pickedMesh.metadata as { enemyInstanceId?: number } | null;
            if (meta?.enemyInstanceId != null) {
                const enemy = this.scene.enemySystem.findByInstanceId(meta.enemyInstanceId);
                if (enemy && enemy.state !== ENEMY_STATE.DEAD) {
                    this.scene.enemySystem.setHovered(enemy);
                    this._canvas.style.cursor = CURSOR_ATTACK;
                    return;
                }
            }
        }
        this.scene.enemySystem.setHovered(null);
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
        const mesh = pick.pickedMesh;
        const meta = mesh.metadata as { enemyInstanceId?: number; lootDropId?: number } | null;

        if (meta && meta.enemyInstanceId != null) {
            const enemy = this.scene.enemySystem.findByInstanceId(meta.enemyInstanceId);
            if (enemy && enemy.state !== ENEMY_STATE.DEAD) {
                this.scene.attackTarget = enemy;
                this.scene.moveTarget = null;
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
            this.scene.moveTarget = new BABYLON.Vector3(pick.pickedPoint.x, 0, pick.pickedPoint.z);
            this.scene.vfxSystem.moveMarker(pick.pickedPoint.x, pick.pickedPoint.z);
        }
    }

    private _holdRepick(): void {
        if (!this.pointerHeld || this.scene.playerDead || this.scene.attackTarget) return;
        const now = this.scene.now();
        if (now - this.lastHoldPickAt < HOLD_REPICK_INTERVAL_MS) return;
        this.lastHoldPickAt = now;
        const pick = this._pick(this.lastPointerX, this.lastPointerY);
        if (pick && pick.pickedPoint && pick.pickedMesh === this.scene.groundMesh) {
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
            this.scene.uiSystem.openInventory();
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

        this._holdRepick();
    }

    dispose(): void {
        if (this._canvas) {
            if (this._onPointerDown) this._canvas.removeEventListener('pointerdown', this._onPointerDown);
            if (this._onPointerMove) this._canvas.removeEventListener('pointermove', this._onPointerMove);
        }
        if (this._onPointerUp) window.removeEventListener('pointerup', this._onPointerUp);
    }
}
