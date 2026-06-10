import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import type { EnemyInstance, GroundDrop, ItemDef } from '../types/index.js';
import { DROP_KIND, LOOT_TYPE } from '../types/index.js';
import { RARITY_FALLBACK_COLOR as UI_RARITY_FALLBACK } from '../constants/uiConstants.js';
import {
    COIN_BOUNCE_DAMPING, COIN_MAX_BOUNCES, COIN_MODEL_FILE, COIN_REST_BOB_AMPL,
    COIN_REST_BOB_SPEED, COIN_SCALE, COIN_SPIN_SPEED, DROP_DESPAWN_MS, DROP_EJECT_SPEED_MAX,
    DROP_EJECT_SPEED_MIN, DROP_FADE_WARN_MS, DROP_GRAVITY, DROP_SCATTER_RADIUS,
    ITEM_BEAM_HEIGHT, ITEM_BEAM_RADIUS, MAP_HALF, MAX_INVENTORY, MODELS_BASE_PATH, PICKUP_RADIUS,
} from '../constants/index.js';
import { FabulusApi } from '../api/FabulusApi.js';

const DROP_SPAWN_HEIGHT = 1.2;
const DROP_REST_Y = 0.12;
const LABEL_TEX_W = 256;
const LABEL_TEX_H = 48;
const RARE_LIGHT_MIN_RARITY = 3;
const RARE_LIGHT_RANGE = 4.5;
const RARE_LIGHT_INTENSITY = 0.85;
const GLOW_DECAL_RADIUS = 0.7;

export class LootSystem {
    private scene: FabulusScene;
    private coinContainer: BABYLON.AssetContainer | null = null;
    private nextDropId = 1;
    private pendingPickupDropId: number | null = null;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    async init(): Promise<void> {
        try {
            this.coinContainer = await BABYLON.SceneLoader.LoadAssetContainerAsync(MODELS_BASE_PATH, COIN_MODEL_FILE, this.scene.bScene);
            console.debug('[Fabulus] Coin model loaded');
        } catch (err) {
            console.warn('[Fabulus] Coin model load failed, using procedural coins:', err);
            this.coinContainer = null;
        }
    }

    private _findClearDropPosition(x: number, z: number): { x: number; z: number } {
        const clearance = 0.4;
        const half = MAP_HALF - 1;
        let px = Math.max(-half, Math.min(half, x));
        let pz = Math.max(-half, Math.min(half, z));
        for (let attempt = 0; attempt < 8; attempt++) {
            const blocking = this.scene.staticColliders.find(box =>
                px > box.minX - clearance && px < box.maxX + clearance &&
                pz > box.minZ - clearance && pz < box.maxZ + clearance);
            if (!blocking) return { x: px, z: pz };
            const angle = Math.random() * Math.PI * 2;
            px = x + Math.cos(angle) * (1 + attempt * 0.6);
            pz = z + Math.sin(angle) * (1 + attempt * 0.6);
        }
        return { x, z };
    }

    onEnemyDeath(enemy: EnemyInstance): void {
        const entries = this.scene.lootTables.filter(lt => lt.enemy_id === enemy.def.id);
        const pos = enemy.root.position;
        for (const entry of entries) {
            if (Math.random() * 100 >= entry.drop_chance_pct) continue;
            if (entry.loot_type === LOOT_TYPE.GOLD) {
                const min = entry.gold_min ?? enemy.def.gold_min;
                const max = entry.gold_max ?? enemy.def.gold_max;
                const amount = min + Math.floor(Math.random() * (max - min + 1));
                if (amount > 0) {
                    const clear = this._findClearDropPosition(pos.x, pos.z);
                    this._spawnGoldDrop(clear.x, clear.z, amount);
                }
            } else if (entry.loot_type === LOOT_TYPE.ITEM) {
                const itemDef = entry.item_id != null
                    ? this.scene.getItemDef(entry.item_id)
                    : this._rollRandomItem();
                if (itemDef) {
                    const clear = this._findClearDropPosition(pos.x, pos.z);
                    this._spawnItemDrop(clear.x, clear.z, itemDef);
                }
            }
        }
    }

    private _rollRandomItem(): ItemDef | null {
        const items = this.scene.itemsCatalog;
        if (!items.length) return null;
        let totalWeight = 0;
        const weighted = items.map(item => {
            const rarity = this.scene.getRarity(item.rarity_id);
            const weight = rarity ? rarity.drop_weight : 1;
            totalWeight += weight;
            return { item, weight };
        });
        let roll = Math.random() * totalWeight;
        for (const w of weighted) {
            roll -= w.weight;
            if (roll <= 0) return w.item;
        }
        return weighted[weighted.length - 1].item;
    }

    private _makeCoinMesh(): BABYLON.TransformNode {
        const s = this.scene.bScene;
        if (this.coinContainer) {
            const entries = this.coinContainer.instantiateModelsToScene(name => `coin_${this.nextDropId}_${name}`, false);
            const root = entries.rootNodes[0] as BABYLON.TransformNode;
            const childMeshes = root.getChildMeshes(false);
            let maxDim = 0;
            for (const m of childMeshes) {
                m.computeWorldMatrix(true);
                if (!m.getTotalVertices()) continue;
                const bb = m.getBoundingInfo().boundingBox;
                maxDim = Math.max(maxDim,
                    bb.maximumWorld.x - bb.minimumWorld.x,
                    bb.maximumWorld.y - bb.minimumWorld.y,
                    bb.maximumWorld.z - bb.minimumWorld.z);
                m.isPickable = false;
            }
            if (maxDim > 0.001) root.scaling.scaleInPlace(COIN_SCALE / maxDim);
            return root;
        }
        const coin = BABYLON.MeshBuilder.CreateCylinder(`fab_coin_${this.nextDropId}`, { height: 0.05, diameter: 0.3, tessellation: 16 }, s);
        const mat = new BABYLON.StandardMaterial('fab_coin_mat', s);
        mat.diffuseColor = new BABYLON.Color3(0.95, 0.78, 0.25);
        mat.emissiveColor = new BABYLON.Color3(0.25, 0.18, 0.04);
        coin.material = mat;
        coin.isPickable = false;
        return coin;
    }

    private _ejectVelocity(): { x: number; y: number; z: number } {
        const angle = Math.random() * Math.PI * 2;
        const horizontal = Math.random() * DROP_SCATTER_RADIUS;
        return {
            x: Math.cos(angle) * horizontal,
            y: DROP_EJECT_SPEED_MIN + Math.random() * (DROP_EJECT_SPEED_MAX - DROP_EJECT_SPEED_MIN),
            z: Math.sin(angle) * horizontal,
        };
    }

    private _spawnGoldDrop(x: number, z: number, amount: number): void {
        const root = this._makeCoinMesh();
        root.position.set(x, DROP_SPAWN_HEIGHT, z);
        const now = this.scene.now();
        this.scene.groundDrops.push({
            kind: DROP_KIND.GOLD,
            amount,
            itemDef: null,
            root,
            beam: null,
            label: null,
            velocity: this._ejectVelocity(),
            bounces: 0,
            resting: false,
            restY: DROP_REST_Y,
            spawnedAt: now,
            expiresAt: now + DROP_DESPAWN_MS,
        });
        this.nextDropId++;
    }

    private _makeRadialGlowTexture(dropId: number): BABYLON.DynamicTexture {
        const size = 64;
        const tex = new BABYLON.DynamicTexture(`fab_drop_glow_tex_${dropId}`, { width: size, height: size }, this.scene.bScene, false);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const c = size / 2;
        const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
        gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        tex.update();
        tex.hasAlpha = true;
        return tex;
    }

    private _spawnItemDrop(x: number, z: number, itemDef: ItemDef): void {
        const s = this.scene.bScene;
        const dropId = this.nextDropId++;
        const rarity = this.scene.getRarity(itemDef.rarity_id);
        const colorHex = rarity ? rarity.color_hex : UI_RARITY_FALLBACK;
        const color = BABYLON.Color3.FromHexString(colorHex);

        const root = new BABYLON.TransformNode(`fab_drop_${dropId}`, s);
        root.position.set(x, DROP_SPAWN_HEIGHT, z);

        const pedestal = BABYLON.MeshBuilder.CreateBox(`fab_drop_ped_${dropId}`, { width: 0.4, height: 0.12, depth: 0.4 }, s);
        pedestal.parent = root;
        const pedMat = new BABYLON.StandardMaterial(`fab_drop_ped_mat_${dropId}`, s);
        pedMat.diffuseColor = new BABYLON.Color3(0.2, 0.18, 0.15);
        pedestal.material = pedMat;
        pedestal.isPickable = true;
        pedestal.metadata = { lootDropId: dropId };

        const beam = BABYLON.MeshBuilder.CreateCylinder(`fab_drop_beam_${dropId}`, {
            height: ITEM_BEAM_HEIGHT, diameter: ITEM_BEAM_RADIUS * 2, tessellation: 12,
        }, s);
        beam.parent = root;
        beam.position.y = ITEM_BEAM_HEIGHT / 2;
        const beamMat = new BABYLON.StandardMaterial(`fab_drop_beam_mat_${dropId}`, s);
        beamMat.emissiveColor = color;
        beamMat.alpha = 0.35;
        beamMat.disableLighting = true;
        beam.material = beamMat;
        beam.isPickable = true;
        beam.metadata = { lootDropId: dropId };

        const glow = BABYLON.MeshBuilder.CreateDisc(`fab_drop_glow_${dropId}`, { radius: GLOW_DECAL_RADIUS, tessellation: 24 }, s);
        glow.parent = root;
        glow.rotation.x = Math.PI / 2;
        glow.position.y = 0.03;
        glow.isPickable = false;
        const glowMat = new BABYLON.StandardMaterial(`fab_drop_glow_mat_${dropId}`, s);
        const glowTex = this._makeRadialGlowTexture(dropId);
        glowMat.diffuseTexture = glowTex;
        glowMat.opacityTexture = glowTex;
        glowMat.emissiveColor = color;
        glowMat.alpha = 0.5;
        glowMat.disableLighting = true;
        glow.material = glowMat;

        if (itemDef.rarity_id >= RARE_LIGHT_MIN_RARITY) {
            const light = new BABYLON.PointLight(`fab_drop_light_${dropId}`, new BABYLON.Vector3(0, 0.8, 0), s);
            light.parent = root;
            light.diffuse = color;
            light.specular = color;
            light.intensity = RARE_LIGHT_INTENSITY;
            light.range = RARE_LIGHT_RANGE;
            light.falloffType = BABYLON.Light.FALLOFF_GLTF;
        }

        const label = BABYLON.MeshBuilder.CreatePlane(`fab_drop_label_${dropId}`, { width: 1.6, height: 0.3 }, s);
        label.parent = root;
        label.position.y = ITEM_BEAM_HEIGHT + 0.2;
        label.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        label.isPickable = true;
        label.metadata = { lootDropId: dropId };
        const labelTex = new BABYLON.DynamicTexture(`fab_drop_label_tex_${dropId}`, { width: LABEL_TEX_W, height: LABEL_TEX_H }, s, false);
        const ctx = labelTex.getContext() as CanvasRenderingContext2D;
        ctx.fillStyle = 'rgba(12,10,8,0.8)';
        ctx.fillRect(0, 0, LABEL_TEX_W, LABEL_TEX_H);
        ctx.font = 'bold 22px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colorHex;
        ctx.fillText(itemDef.name, LABEL_TEX_W / 2, LABEL_TEX_H / 2);
        labelTex.update();
        const labelMat = new BABYLON.StandardMaterial(`fab_drop_label_mat_${dropId}`, s);
        labelMat.diffuseTexture = labelTex;
        labelMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        labelMat.disableLighting = true;
        labelMat.backFaceCulling = false;
        label.material = labelMat;

        const now = this.scene.now();
        const drop: GroundDrop = {
            kind: DROP_KIND.ITEM,
            amount: 0,
            itemDef,
            root,
            beam,
            label,
            velocity: this._ejectVelocity(),
            bounces: 0,
            resting: false,
            restY: 0.06,
            spawnedAt: now,
            expiresAt: now + DROP_DESPAWN_MS,
        };
        (root as any).__dropId = dropId;
        (drop as any).dropId = dropId;
        this.scene.groundDrops.push(drop);
    }

    pickupByDropId(dropId: number): void {
        const drop = this.scene.groundDrops.find(d => (d as any).dropId === dropId);
        if (!drop || drop.kind !== DROP_KIND.ITEM || !drop.itemDef) return;
        const root = this.scene.playerRoot;
        if (root) {
            const dist = Math.hypot(drop.root.position.x - root.position.x, drop.root.position.z - root.position.z);
            if (dist > PICKUP_RADIUS * 3) {
                this.scene.attackTarget = null;
                this.scene.moveTarget = drop.root.position.clone();
                this.pendingPickupDropId = dropId;
                return;
            }
        }
        this._collectItem(drop);
    }

    cancelPendingPickup(): void {
        this.pendingPickupDropId = null;
    }

    private _updatePendingPickup(): void {
        if (this.pendingPickupDropId == null) return;
        const drop = this.scene.groundDrops.find(d => (d as any).dropId === this.pendingPickupDropId);
        if (!drop) {
            this.pendingPickupDropId = null;
            return;
        }
        const root = this.scene.playerRoot;
        if (!root || this.scene.playerDead) return;
        const dist = Math.hypot(drop.root.position.x - root.position.x, drop.root.position.z - root.position.z);
        if (dist <= PICKUP_RADIUS * 3) {
            this.pendingPickupDropId = null;
            this._collectItem(drop);
        }
    }

    private _collectItem(drop: GroundDrop): void {
        if (!drop.itemDef) return;
        const bagCount = this.scene.playerItems.filter(pi => !pi.is_equipped).length;
        if (bagCount >= MAX_INVENTORY) {
            this.scene.uiSystem.toast('Inventario cheio');
            return;
        }
        const itemDef = drop.itemDef;
        FabulusApi.addPlayerItem(itemDef.id)
            .then(row => {
                this.scene.playerItems.push(row);
                this.scene.uiSystem.toast(`Voce obteve: ${itemDef.name}`);
                this.scene.uiSystem.refreshPanels();
            })
            .catch(err => console.warn('[Fabulus] addPlayerItem failed:', err));
        this.scene.audioSystem.playItemPickup();
        this._dispose(drop);
    }

    private _collectGold(drop: GroundDrop): void {
        this.scene.player.gold += drop.amount;
        this.scene.audioSystem.playCoin();
        const pos = drop.root.position;
        this.scene.uiSystem.floatText(pos.x, pos.y + 0.8, pos.z, `+${drop.amount} gold`, 'gold');
        this.scene.vfxSystem.goldSparkle(pos);
        this._dispose(drop);
    }

    private _dispose(drop: GroundDrop): void {
        const idx = this.scene.groundDrops.indexOf(drop);
        if (idx >= 0) this.scene.groundDrops.splice(idx, 1);
        try { drop.root.dispose(false, true); } catch (err) { console.warn('[Fabulus] drop dispose failed:', err); }
    }

    update(dt: number): void {
        const now = this.scene.now();
        const playerRoot = this.scene.playerRoot;
        this._updatePendingPickup();

        for (let i = this.scene.groundDrops.length - 1; i >= 0; i--) {
            const drop = this.scene.groundDrops[i];

            if (!drop.resting) {
                drop.velocity.y -= DROP_GRAVITY * dt;
                drop.root.position.x += drop.velocity.x * dt;
                drop.root.position.y += drop.velocity.y * dt;
                drop.root.position.z += drop.velocity.z * dt;
                if (drop.kind === DROP_KIND.GOLD) {
                    drop.root.rotation.x += COIN_SPIN_SPEED * 2 * dt;
                    drop.root.rotation.y += COIN_SPIN_SPEED * dt;
                }
                if (drop.root.position.y <= drop.restY) {
                    drop.root.position.y = drop.restY;
                    drop.bounces++;
                    if (drop.bounces > COIN_MAX_BOUNCES || Math.abs(drop.velocity.y) < 0.8) {
                        drop.resting = true;
                        drop.root.rotation.x = 0;
                        drop.velocity.x = 0;
                        drop.velocity.z = 0;
                    } else {
                        drop.velocity.y = -drop.velocity.y * COIN_BOUNCE_DAMPING;
                        drop.velocity.x *= COIN_BOUNCE_DAMPING;
                        drop.velocity.z *= COIN_BOUNCE_DAMPING;
                    }
                }
            } else if (drop.kind === DROP_KIND.GOLD) {
                drop.root.rotation.y += COIN_SPIN_SPEED * 0.4 * dt;
                drop.root.position.y = drop.restY + Math.sin(now / 1000 * COIN_REST_BOB_SPEED * Math.PI) * COIN_REST_BOB_AMPL;
            }

            if (drop.kind === DROP_KIND.GOLD && playerRoot && !this.scene.playerDead) {
                const dist = Math.hypot(drop.root.position.x - playerRoot.position.x, drop.root.position.z - playerRoot.position.z);
                if (dist <= PICKUP_RADIUS) {
                    this._collectGold(drop);
                    continue;
                }
            }

            const remaining = drop.expiresAt - now;
            if (remaining <= 0) {
                this._dispose(drop);
            } else if (remaining < DROP_FADE_WARN_MS) {
                const vis = remaining / DROP_FADE_WARN_MS;
                const meshes = drop.root.getChildMeshes ? drop.root.getChildMeshes(false) : [];
                for (const m of meshes) m.visibility = vis;
                if ((drop.root as any).visibility !== undefined) (drop.root as any).visibility = vis;
            }
        }
    }
}
