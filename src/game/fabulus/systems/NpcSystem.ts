import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import type { NpcDef } from '../types/index.js';
import { MODELS_BASE_PATH, NPC_INTERACT_RANGE, NPC_INTERACT_MAX_RANGE, NPC_INTERACT_STUCK_MS, NPC_LABEL_OFFSET_Y } from '../constants/index.js';

const LABEL_WIDTH = 1.6;
const LABEL_HEIGHT = 0.42;
const LABEL_TEX_W = 320;
const LABEL_TEX_H = 84;
const NPC_FALLBACK_HEIGHT = 2.2;

interface NpcInstance {
    def: NpcDef;
    root: BABYLON.TransformNode;
    meshes: BABYLON.AbstractMesh[];
    idleAnim: BABYLON.AnimationGroup | null;
    labelTexture: BABYLON.DynamicTexture | null;
    labelPlane: BABYLON.Mesh | null;
}

export class NpcSystem {
    private scene: FabulusScene;
    private containers: Map<string, BABYLON.AssetContainer> = new Map();
    private instances: Map<number, NpcInstance> = new Map();
    private interactTarget: NpcInstance | null = null;
    private interactLastDist = Number.POSITIVE_INFINITY;
    private interactStuckSince = 0;
    private hoveredNpcId: number | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    async init(): Promise<void> {
        for (const def of this.scene.npcDefs) {
            await this._spawn(def);
        }
        console.debug(`[Fabulus] NPCs ready (${this.instances.size})`);
    }

    findByNpcId(id: number): NpcInstance | null {
        return this.instances.get(id) ?? null;
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
            console.warn(`[Fabulus] NPC model load failed (${modelPath}):`, err);
            return null;
        }
    }

    private async _spawn(def: NpcDef): Promise<void> {
        const s = this.scene.bScene;
        const root = new BABYLON.TransformNode(`fab_npc_${def.id}`, s);
        root.position.set(def.pos_x, 0, def.pos_z);
        root.rotation.y = def.rot_y;

        const instance: NpcInstance = {
            def,
            root,
            meshes: [],
            idleAnim: null,
            labelTexture: null,
            labelPlane: null,
        };

        const container = await this._getContainer(def.model_path);
        const height = def.scale > 0 ? def.scale : NPC_FALLBACK_HEIGHT;
        if (container) {
            const entries = container.instantiateModelsToScene(name => `n${def.id}_${name}`, false);
            const modelRoot = entries.rootNodes[0] as BABYLON.TransformNode;
            modelRoot.parent = root;
            const allMeshes = this.scene.renderSystem.collectModelMeshes(modelRoot);
            if (allMeshes.length) {
                this.scene.renderSystem.normalizeModelHeight(modelRoot, allMeshes, height);
                for (const m of allMeshes) {
                    m.isPickable = true;
                    m.metadata = { ...(m.metadata || {}), npcId: def.id };
                }
                this.scene.renderSystem.prepareMeshes(allMeshes);
                instance.meshes = allMeshes;
            }

            for (const g of entries.animationGroups) g.stop();
            instance.idleAnim = this._findIdleAnim(entries.animationGroups, def.idle_anim);
            if (instance.idleAnim) {
                instance.idleAnim.start(true, 1);
            } else if (entries.animationGroups.length) {
                // No idle clip available: freeze the first clip on its initial frame so the
                // NPC stands still instead of looping a walk/locomotion animation in place.
                const pose = entries.animationGroups[0];
                pose.start(false, 1);
                pose.goToFrame(pose.from);
                pose.pause();
                instance.idleAnim = pose;
            }
        } else {
            const body = BABYLON.MeshBuilder.CreateCapsule(`fab_npc_body_${def.id}`, { height, radius: 0.32 }, s);
            body.parent = root;
            body.position.y = height / 2;
            body.isPickable = true;
            body.metadata = { npcId: def.id };
            const mat = new BABYLON.StandardMaterial(`fab_npc_mat_${def.id}`, s);
            mat.diffuseColor = new BABYLON.Color3(0.45, 0.4, 0.6);
            body.material = mat;
            instance.meshes = [body];
            this.scene.renderSystem.prepareMeshes([body]);
        }

        this._buildLabel(instance, height);
        this.instances.set(def.id, instance);
    }

    private _findIdleAnim(groups: BABYLON.AnimationGroup[], idleName: string | null): BABYLON.AnimationGroup | null {
        if (!groups.length) return null;
        if (idleName) {
            const named = groups.find(g => g.name.endsWith(idleName));
            if (named) return named;
        }
        return groups.find(g => /idle|stand|breath|pose/i.test(g.name)) ?? null;
    }

    private _buildLabel(instance: NpcInstance, height: number): void {
        const s = this.scene.bScene;
        const def = instance.def;
        const plane = BABYLON.MeshBuilder.CreatePlane(`fab_npc_label_${def.id}`, { width: LABEL_WIDTH, height: LABEL_HEIGHT }, s);
        plane.parent = instance.root;
        plane.position.y = height + NPC_LABEL_OFFSET_Y;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;
        plane.setEnabled(false);

        const tex = new BABYLON.DynamicTexture(`fab_npc_label_tex_${def.id}`, { width: LABEL_TEX_W, height: LABEL_TEX_H }, s, false);
        tex.hasAlpha = true;
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        ctx.clearRect(0, 0, LABEL_TEX_W, LABEL_TEX_H);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 26px Georgia, serif';
        ctx.fillStyle = '#f0e6cf';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;
        ctx.fillText(def.name, LABEL_TEX_W / 2, def.title ? 26 : LABEL_TEX_H / 2, LABEL_TEX_W - 8);
        if (def.title) {
            ctx.font = '20px Georgia, serif';
            ctx.fillStyle = '#c9a45c';
            ctx.fillText(def.title, LABEL_TEX_W / 2, 58, LABEL_TEX_W - 8);
        }
        tex.update();

        const mat = new BABYLON.StandardMaterial(`fab_npc_label_mat_${def.id}`, s);
        mat.diffuseTexture = tex;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        plane.material = mat;
        instance.labelTexture = tex;
        instance.labelPlane = plane;
    }

    getDisplayName(npcId: number): string | null {
        const instance = this.instances.get(npcId);
        return instance ? instance.def.name : null;
    }

    /** Shows the floating name only for the hovered NPC and hides any previous one. */
    setHovered(npcId: number | null): void {
        if (this.hoveredNpcId === npcId) return;
        const prev = this.hoveredNpcId != null ? this.instances.get(this.hoveredNpcId) : null;
        if (prev?.labelPlane) prev.labelPlane.setEnabled(false);
        this.hoveredNpcId = npcId;
        const next = npcId != null ? this.instances.get(npcId) : null;
        if (next?.labelPlane) next.labelPlane.setEnabled(true);
    }

    /** Player clicked the NPC: walk into range, then open the dialogue. */
    beginInteract(npcId: number): void {
        const instance = this.instances.get(npcId);
        if (!instance) return;
        this.interactTarget = instance;
        this.interactLastDist = Number.POSITIVE_INFINITY;
        this.interactStuckSince = 0;
        this.scene.attackTarget = null;
        const playerRoot = this.scene.playerRoot;
        const npcPos = instance.root.position;
        if (playerRoot) {
            const dx = playerRoot.position.x - npcPos.x;
            const dz = playerRoot.position.z - npcPos.z;
            const dist = Math.hypot(dx, dz);
            if (dist <= NPC_INTERACT_RANGE) {
                this._openWith(instance);
                return;
            }
            const stop = Math.max(0, NPC_INTERACT_RANGE * 0.85);
            const nx = dx / dist;
            const nz = dz / dist;
            this.scene.moveTarget = new BABYLON.Vector3(npcPos.x + nx * stop, 0, npcPos.z + nz * stop);
        } else {
            this.scene.moveTarget = new BABYLON.Vector3(npcPos.x, 0, npcPos.z);
        }
    }

    cancelInteract(): void {
        this.interactTarget = null;
    }

    private _openWith(instance: NpcInstance): void {
        const playerRoot = this.scene.playerRoot;
        if (playerRoot) {
            const dx = playerRoot.position.x - instance.root.position.x;
            const dz = playerRoot.position.z - instance.root.position.z;
            instance.root.rotation.y = Math.atan2(dx, dz);
        }
        this.interactTarget = null;
        this.scene.moveTarget = null;
        this.scene.uiSystem.openDialogue(instance.def);
    }

    update(_dt: number): void {
        const target = this.interactTarget;
        if (!target) return;
        const playerRoot = this.scene.playerRoot;
        if (!playerRoot || this.scene.playerDead) {
            this.interactTarget = null;
            return;
        }
        const dx = playerRoot.position.x - target.root.position.x;
        const dz = playerRoot.position.z - target.root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= NPC_INTERACT_RANGE) {
            this._openWith(target);
            return;
        }
        // Blocked path fallback: if the player can no longer get closer (e.g. a
        // collider stands between them and the NPC), open the dialogue anyway.
        const now = this.scene.now();
        if (dist < this.interactLastDist - 0.05) {
            this.interactLastDist = dist;
            this.interactStuckSince = now;
        } else if (
            dist <= NPC_INTERACT_MAX_RANGE &&
            this.interactStuckSince > 0 &&
            now - this.interactStuckSince >= NPC_INTERACT_STUCK_MS
        ) {
            this._openWith(target);
        }
    }

    dispose(): void {
        for (const instance of this.instances.values()) {
            if (instance.labelTexture) instance.labelTexture.dispose();
            try { instance.root.dispose(false, true); } catch { /* already disposed */ }
        }
        this.instances.clear();
        for (const container of this.containers.values()) {
            try { container.dispose(); } catch { /* already disposed */ }
        }
        this.containers.clear();
        this.interactTarget = null;
        this.hoveredNpcId = null;
    }
}
