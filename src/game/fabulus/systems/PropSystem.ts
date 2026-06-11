import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import type { Aabb, MapPropDef } from '../types/index.js';
import {
    EDITOR_MAX_SCALE, EDITOR_MIN_SCALE, EDITOR_ROTATE_STEP_RAD, EDITOR_SAVE_DEBOUNCE_MS,
    EDITOR_SCALE_STEP_PCT, MODELS_BASE_PATH, PROP_CATALOG, type PropCatalogEntry,
} from '../constants/index.js';
import { FabulusApi } from '../api/FabulusApi.js';

const SELECT_HIGHLIGHT_COLOR = new BABYLON.Color3(0.35, 0.8, 1.0);

interface PropInstance {
    def: MapPropDef;
    root: BABYLON.TransformNode;
    meshes: BABYLON.AbstractMesh[];
    collider: Aabb | null;
    baseHeight: number;
}

export class PropSystem {
    private scene: FabulusScene;
    private containers: Map<string, BABYLON.AssetContainer> = new Map();
    private instances: Map<number, PropInstance> = new Map();
    private editorActive = false;
    private placementEntry: PropCatalogEntry | null = null;
    private selected: PropInstance | null = null;
    private dragging = false;
    private saveTimers: Map<number, number> = new Map();
    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onPointerUp: (() => void) | null = null;
    private _canvas: HTMLCanvasElement | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    async init(): Promise<void> {
        for (const def of this.scene.mapProps) {
            await this.spawnProp(def);
        }
        this._canvas = this.scene.bScene.getEngine().getRenderingCanvas();
        this._onPointerMove = (e: PointerEvent) => this._handleDragMove(e.offsetX, e.offsetY);
        this._onPointerUp = () => this._endDrag();
        if (this._canvas) this._canvas.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        console.debug(`[Fabulus] Props ready (${this.instances.size})`);
    }

    isEditorActive(): boolean {
        return this.editorActive;
    }

    private async _getContainer(modelPath: string): Promise<BABYLON.AssetContainer | null> {
        const cached = this.containers.get(modelPath);
        if (cached) return cached;
        try {
            const lastSlash = modelPath.lastIndexOf('/');
            const dir = lastSlash >= 0 ? modelPath.substring(0, lastSlash + 1) : '';
            const file = lastSlash >= 0 ? modelPath.substring(lastSlash + 1) : modelPath;
            const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(MODELS_BASE_PATH + dir, file, this.scene.bScene);
            this.containers.set(modelPath, container);
            return container;
        } catch (err) {
            console.warn(`[Fabulus] Prop model load failed (${modelPath}):`, err);
            return null;
        }
    }

    async spawnProp(def: MapPropDef): Promise<PropInstance | null> {
        const container = await this._getContainer(def.model_path);
        if (!container) return null;
        const s = this.scene.bScene;
        const root = new BABYLON.TransformNode(`fab_prop_${def.id}`, s);
        // pos_y is stored as an offset relative to the terrain surface.
        root.position.set(def.pos_x, def.pos_y + this.scene.mapSystem.getHeightAt(def.pos_x, def.pos_z), def.pos_z);
        root.rotation.y = def.rot_y;

        const entries = container.instantiateModelsToScene(name => `p${def.id}_${name}`, false);
        const modelRoot = entries.rootNodes[0] as BABYLON.TransformNode;
        modelRoot.parent = root;
        const allMeshes = this.scene.renderSystem.collectModelMeshes(modelRoot);
        if (!allMeshes.length) return null;
        this.scene.renderSystem.normalizeModelHeight(modelRoot, allMeshes, def.scale);
        for (const m of allMeshes) {
            m.isPickable = true;
            m.metadata = { ...(m.metadata || {}), mapPropId: def.id };
        }
        this.scene.renderSystem.prepareMeshes(allMeshes);
        for (const g of entries.animationGroups) g.stop();

        const instance: PropInstance = {
            def,
            root,
            meshes: allMeshes,
            collider: null,
            baseHeight: def.scale,
        };
        if (def.collidable) {
            const box = this._computeAabb(instance);
            if (box) {
                instance.collider = box;
                this.scene.staticColliders.push(box);
            }
        }
        this.instances.set(def.id, instance);
        return instance;
    }

    private _computeAabb(instance: PropInstance): Aabb | null {
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        instance.root.computeWorldMatrix(true);
        for (const m of instance.meshes) {
            if (!m.getTotalVertices()) continue;
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            minX = Math.min(minX, bb.minimumWorld.x);
            maxX = Math.max(maxX, bb.maximumWorld.x);
            minZ = Math.min(minZ, bb.minimumWorld.z);
            maxZ = Math.max(maxZ, bb.maximumWorld.z);
        }
        if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
        return { minX, maxX, minZ, maxZ };
    }

    private _refreshCollider(instance: PropInstance): void {
        if (!instance.def.collidable) return;
        const fresh = this._computeAabb(instance);
        if (!fresh) return;
        if (instance.collider) {
            instance.collider.minX = fresh.minX;
            instance.collider.maxX = fresh.maxX;
            instance.collider.minZ = fresh.minZ;
            instance.collider.maxZ = fresh.maxZ;
        } else {
            instance.collider = fresh;
            this.scene.staticColliders.push(fresh);
        }
    }

    private _removeCollider(instance: PropInstance): void {
        if (!instance.collider) return;
        const idx = this.scene.staticColliders.indexOf(instance.collider);
        if (idx >= 0) this.scene.staticColliders.splice(idx, 1);
        instance.collider = null;
    }

    findByPropId(id: number): PropInstance | null {
        return this.instances.get(id) ?? null;
    }

    // ── Editor mode ──────────────────────────────────────────────────────────

    toggleEditor(): void {
        this.editorActive = !this.editorActive;
        if (!this.editorActive) {
            this._select(null);
            this.placementEntry = null;
            this._endDrag();
        }
        this.scene.moveTarget = null;
        this.scene.attackTarget = null;
        this.scene.uiSystem.setEditorMode(this.editorActive, PROP_CATALOG);
        console.debug(`[Fabulus] Map editor ${this.editorActive ? 'enabled' : 'disabled'}`);
    }

    setPlacementEntry(entry: PropCatalogEntry | null): void {
        this.placementEntry = entry;
        if (entry) this._select(null);
        this.scene.uiSystem.refreshEditorPalette(entry);
    }

    getPlacementEntry(): PropCatalogEntry | null {
        return this.placementEntry;
    }

    handleEditorClick(pick: BABYLON.PickingInfo): void {
        if (!this.editorActive) return;
        const meta = pick.pickedMesh?.metadata as { mapPropId?: number } | null;

        if (this.placementEntry && pick.pickedPoint && meta?.mapPropId == null) {
            this._placeAt(this.placementEntry, pick.pickedPoint.x, pick.pickedPoint.z);
            return;
        }
        if (meta?.mapPropId != null) {
            const instance = this.instances.get(meta.mapPropId);
            if (instance) {
                this._select(instance);
                this.dragging = true;
                return;
            }
        }
        this._select(null);
    }

    private async _placeAt(entry: PropCatalogEntry, x: number, z: number): Promise<void> {
        try {
            const created = await FabulusApi.createMapProp({
                model_path: entry.model_path,
                pos_x: Number(x.toFixed(2)),
                pos_y: 0,
                pos_z: Number(z.toFixed(2)),
                rot_y: 0,
                scale: entry.default_scale,
                collidable: entry.collidable ? 1 : 0,
            });
            this.scene.mapProps.push(created);
            const instance = await this.spawnProp(created);
            if (instance) this._select(instance);
            this.scene.uiSystem.toast(`Prop adicionado: ${entry.label}`);
        } catch (err) {
            console.warn('[Fabulus] createMapProp failed:', err);
            this.scene.uiSystem.toast('Falha ao adicionar o prop');
        }
    }

    private _select(instance: PropInstance | null): void {
        if (this.selected === instance) return;
        const layer = this.scene.renderSystem.getHighlightLayer();
        if (this.selected && layer) {
            for (const m of this.selected.meshes) {
                if (m instanceof BABYLON.Mesh) {
                    try { layer.removeMesh(m); } catch { /* mesh may be disposed */ }
                }
            }
        }
        this.selected = instance;
        if (instance && layer) {
            for (const m of instance.meshes) {
                if (m instanceof BABYLON.Mesh && m.getTotalVertices() > 0) {
                    try { layer.addMesh(m, SELECT_HIGHLIGHT_COLOR); } catch { /* skinned edge cases */ }
                }
            }
        }
        this.scene.uiSystem.setEditorSelection(instance ? instance.def : null);
    }

    private _handleDragMove(x: number, y: number): void {
        if (!this.editorActive || !this.dragging || !this.selected) return;
        const ground = this.scene.groundMesh;
        if (!ground) return;
        const pick = this.scene.bScene.pick(x, y, (mesh) => mesh === ground);
        if (!pick || !pick.hit || !pick.pickedPoint) return;
        const instance = this.selected;
        instance.root.position.x = pick.pickedPoint.x;
        instance.root.position.z = pick.pickedPoint.z;
        instance.root.position.y = instance.def.pos_y + pick.pickedPoint.y;
        instance.def.pos_x = Number(pick.pickedPoint.x.toFixed(2));
        instance.def.pos_z = Number(pick.pickedPoint.z.toFixed(2));
        this._refreshCollider(instance);
        this._scheduleSave(instance);
    }

    private _endDrag(): void {
        this.dragging = false;
    }

    private _rotateSelected(): void {
        const instance = this.selected;
        if (!instance) return;
        instance.def.rot_y = Number(((instance.def.rot_y + EDITOR_ROTATE_STEP_RAD) % (Math.PI * 2)).toFixed(4));
        instance.root.rotation.y = instance.def.rot_y;
        this._refreshCollider(instance);
        this._scheduleSave(instance);
    }

    private _scaleSelected(direction: 1 | -1): void {
        const instance = this.selected;
        if (!instance) return;
        const factor = 1 + direction * (EDITOR_SCALE_STEP_PCT / 100);
        const next = Math.max(EDITOR_MIN_SCALE, Math.min(EDITOR_MAX_SCALE, instance.def.scale * factor));
        instance.def.scale = Number(next.toFixed(3));
        const ratio = instance.def.scale / instance.baseHeight;
        instance.root.scaling.setAll(ratio);
        for (const m of instance.meshes) m.refreshBoundingInfo(true, false);
        this._refreshCollider(instance);
        this._scheduleSave(instance);
    }

    private async _deleteSelected(): Promise<void> {
        const instance = this.selected;
        if (!instance) return;
        this._select(null);
        try {
            await FabulusApi.deleteMapProp(instance.def.id);
            this._disposeInstance(instance);
            const idx = this.scene.mapProps.indexOf(instance.def);
            if (idx >= 0) this.scene.mapProps.splice(idx, 1);
            this.scene.uiSystem.toast('Prop removido');
        } catch (err) {
            console.warn('[Fabulus] deleteMapProp failed:', err);
            this.scene.uiSystem.toast('Falha ao remover o prop');
        }
    }

    private _disposeInstance(instance: PropInstance): void {
        this._removeCollider(instance);
        const timer = this.saveTimers.get(instance.def.id);
        if (timer) {
            clearTimeout(timer);
            this.saveTimers.delete(instance.def.id);
        }
        try { instance.root.dispose(false, true); } catch { /* already disposed */ }
        this.instances.delete(instance.def.id);
    }

    private _scheduleSave(instance: PropInstance): void {
        const propId = instance.def.id;
        const existing = this.saveTimers.get(propId);
        if (existing) clearTimeout(existing);
        this.saveTimers.set(propId, window.setTimeout(() => {
            this.saveTimers.delete(propId);
            FabulusApi.updateMapProp(propId, {
                pos_x: instance.def.pos_x,
                pos_y: instance.def.pos_y,
                pos_z: instance.def.pos_z,
                rot_y: instance.def.rot_y,
                scale: instance.def.scale,
            }).catch(err => {
                console.warn('[Fabulus] updateMapProp failed:', err);
                this.scene.uiSystem.toast('Falha ao salvar o prop');
            });
        }, EDITOR_SAVE_DEBOUNCE_MS));
    }

    update(_dt: number): void {
        if (!this.editorActive) return;
        const input = this.scene.inputManager;
        if (!input) return;
        if (input.isKeyPressed('KeyR')) this._rotateSelected();
        if (input.isKeyPressed('Equal') || input.isKeyPressed('NumpadAdd')) this._scaleSelected(1);
        if (input.isKeyPressed('Minus') || input.isKeyPressed('NumpadSubtract')) this._scaleSelected(-1);
        if (input.isKeyPressed('Delete')) void this._deleteSelected();
    }

    dispose(): void {
        if (this._canvas && this._onPointerMove) this._canvas.removeEventListener('pointermove', this._onPointerMove);
        if (this._onPointerUp) window.removeEventListener('pointerup', this._onPointerUp);
        for (const timer of this.saveTimers.values()) clearTimeout(timer);
        this.saveTimers.clear();
        for (const instance of [...this.instances.values()]) {
            this._disposeInstance(instance);
        }
        for (const container of this.containers.values()) {
            try { container.dispose(); } catch { /* already disposed */ }
        }
        this.containers.clear();
        this.selected = null;
        this.placementEntry = null;
    }
}
