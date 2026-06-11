import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import type { EnemyInstance, GroundDrop, ItemDef, RolledAffix } from '../types/index.js';
import { AFFIX_TYPE, DROP_KIND, ITEM_TYPE, LOOT_TYPE } from '../types/index.js';
import { FabulusPrefs } from '../FabulusPrefs.js';
import { RARITY_FALLBACK_COLOR as UI_RARITY_FALLBACK } from '../constants/uiConstants.js';
import {
    COIN_BOUNCE_DAMPING, COIN_MAX_BOUNCES, COIN_MODEL_FILE, COIN_REST_BOB_AMPL,
    COIN_REST_BOB_SPEED, COIN_SCALE, COIN_SPIN_SPEED, DROP_DESPAWN_MS, DROP_EJECT_SPEED_MAX,
    DROP_EJECT_SPEED_MIN, DROP_FADE_WARN_MS, DROP_GRAVITY, DROP_SCATTER_RADIUS,
    ITEM_BEAM_HEIGHT, ITEM_BEAM_RADIUS, LOOT_PICK_PROXY_HEIGHT, LOOT_PICK_PROXY_RADIUS_GOLD,
    LOOT_PICK_PROXY_RADIUS_ITEM, MAP_HALF, MAX_INVENTORY, MAX_PROC_LEVEL, MODELS_BASE_PATH, PICKUP_RADIUS,
} from '../constants/index.js';
import { FabulusApi } from '../api/FabulusApi.js';

const DROP_SPAWN_HEIGHT = 1.2;
const DROP_REST_Y = 0.02;
const DROP_ITEM_REST_Y = 0.06;
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
        FabulusPrefs.onChange(this._onPrefsChange);
        try {
            this.coinContainer = await BABYLON.SceneLoader.LoadAssetContainerAsync(MODELS_BASE_PATH, COIN_MODEL_FILE, this.scene.bScene);
            console.debug('[Fabulus] Coin model loaded');
        } catch (err) {
            console.warn('[Fabulus] Coin model load failed, using procedural coins:', err);
            this.coinContainer = null;
        }
    }

    private _onPrefsChange = (): void => {
        const show = FabulusPrefs.get().showDropLabels;
        for (const drop of this.scene.groundDrops) {
            if (drop.label) drop.label.setEnabled(show);
        }
    };

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
        const elite = enemy.isElite;
        const dropLevel = Math.max(1, Math.min(MAX_PROC_LEVEL, this.scene.player.level));
        for (const entry of entries) {
            if (Math.random() * 100 >= entry.drop_chance_pct) continue;
            if (entry.loot_type === LOOT_TYPE.GOLD) {
                const min = entry.gold_min ?? enemy.def.gold_min;
                const max = entry.gold_max ?? enemy.def.gold_max;
                let amount = min + Math.floor(Math.random() * (max - min + 1));
                if (elite) amount *= 2;
                if (amount > 0) {
                    const clear = this._findClearDropPosition(pos.x, pos.z);
                    this._spawnGoldDrop(clear.x, clear.z, amount);
                }
            } else if (entry.loot_type === LOOT_TYPE.ITEM) {
                this._spawnRolledItem(pos.x, pos.z, entry.item_id, elite, dropLevel);
            }
        }
        for (let i = 0; i < enemy.lootRollsBonus; i++) {
            this._spawnRolledItem(pos.x, pos.z, null, true, dropLevel);
        }
    }

    private _spawnRolledItem(x: number, z: number, itemId: number | null, eliteBias: boolean, dropLevel: number): void {
        const itemDef = itemId != null
            ? this.scene.getItemDef(itemId)
            : this._rollRandomItem(eliteBias, dropLevel);
        if (!itemDef) return;
        const affixes = itemId == null ? this._rollAffixes(itemDef, dropLevel) : null;
        const clear = this._findClearDropPosition(x, z);
        this._spawnItemDrop(clear.x, clear.z, itemDef, affixes);
    }

    private _rollRandomItem(eliteBias = false, dropLevel = 1): ItemDef | null {
        const items = this.scene.itemsCatalog.filter(i => i.required_level <= dropLevel);
        const pool = items.length ? items : this.scene.itemsCatalog;
        if (!pool.length) return null;
        let totalWeight = 0;
        const weighted = pool.map(item => {
            const rarity = this.scene.getRarity(item.rarity_id);
            let weight = rarity ? rarity.drop_weight : 1;
            const levelGap = Math.max(0, dropLevel - item.required_level);
            weight *= 1 + levelGap * 0.15;
            if (eliteBias) weight = Math.sqrt(weight);
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

    private _levelRollBias(dropLevel: number): number {
        if (MAX_PROC_LEVEL <= 1) return 0;
        return (dropLevel - 1) / (MAX_PROC_LEVEL - 1);
    }

    private _affixCountForDrop(itemDef: ItemDef, dropLevel: number): number {
        const rarity = this.scene.getRarity(itemDef.rarity_id);
        const maxMods = rarity?.max_modifiers ?? 1;
        const levelBonus = dropLevel >= 8 ? 1 : dropLevel >= 5 ? (Math.random() < 0.5 ? 1 : 0) : 0;
        const baseCount = itemDef.rarity_id >= 3 ? 2 : 1;
        return Math.min(maxMods, baseCount + levelBonus);
    }

    private _rollAffixValue(minRoll: number, maxRoll: number, dropLevel: number): number {
        const bias = this._levelRollBias(dropLevel);
        const randomSpread = 0.35;
        const t = Math.min(1, bias * (1 - randomSpread) + Math.random() * randomSpread);
        return Math.round((minRoll + t * (maxRoll - minRoll)) * 10) / 10;
    }

    private _rollAffixes(itemDef: ItemDef, dropLevel: number): RolledAffix[] | null {
        if (itemDef.item_type === ITEM_TYPE.CONSUMABLE) return null;
        const pool = this.scene.affixesCatalog.filter(a => a.min_rarity <= itemDef.rarity_id);
        if (!pool.length) return null;
        const count = this._affixCountForDrop(itemDef, dropLevel);
        const rolled: RolledAffix[] = [];
        const usedTypes = new Set<number>();
        for (let i = 0; i < count; i++) {
            const candidates = pool.filter(a => !usedTypes.has(a.affix_type));
            if (!candidates.length) break;
            let totalWeight = 0;
            for (const a of candidates) totalWeight += a.weight;
            let roll = Math.random() * totalWeight;
            let chosen = candidates[candidates.length - 1];
            for (const a of candidates) {
                roll -= a.weight;
                if (roll <= 0) { chosen = a; break; }
            }
            usedTypes.add(chosen.affix_type);
            const value = this._rollAffixValue(chosen.min_roll, chosen.max_roll, dropLevel);
            rolled.push({
                affix_id: chosen.id,
                name: chosen.name,
                affix_type: chosen.affix_type,
                attribute_type: chosen.attribute_type,
                value_type: chosen.value_type,
                value,
            });
        }
        return rolled.length ? rolled : null;
    }

    private _composeDropName(itemDef: ItemDef, affixes: RolledAffix[] | null): string {
        if (!affixes || !affixes.length) return itemDef.name;
        const prefix = affixes.find(a => a.affix_type === AFFIX_TYPE.PREFIX);
        const suffix = affixes.find(a => a.affix_type === AFFIX_TYPE.SUFFIX);
        let name = itemDef.name;
        if (prefix) name = `${prefix.name} ${name}`;
        if (suffix) name = `${name} ${suffix.name}`;
        return name;
    }

    private _makeCoinMesh(): BABYLON.TransformNode {
        const s = this.scene.bScene;
        // Wrapper keeps the drop root's origin at the model base, so physics/rest Y maps to the ground.
        const wrapper = new BABYLON.TransformNode(`fab_coin_root_${this.nextDropId}`, s);
        if (this.coinContainer) {
            const entries = this.coinContainer.instantiateModelsToScene(name => `coin_${this.nextDropId}_${name}`, false);
            const root = entries.rootNodes[0] as BABYLON.TransformNode;
            const childMeshes = root.getChildMeshes(false);
            let maxDim = 0;
            let minY = Infinity;
            for (const m of childMeshes) {
                m.computeWorldMatrix(true);
                if (!m.getTotalVertices()) continue;
                const bb = m.getBoundingInfo().boundingBox;
                maxDim = Math.max(maxDim,
                    bb.maximumWorld.x - bb.minimumWorld.x,
                    bb.maximumWorld.y - bb.minimumWorld.y,
                    bb.maximumWorld.z - bb.minimumWorld.z);
                minY = Math.min(minY, bb.minimumWorld.y);
                m.isPickable = false;
            }
            const scale = maxDim > 0.001 ? COIN_SCALE / maxDim : 1;
            if (maxDim > 0.001) root.scaling.scaleInPlace(scale);
            root.parent = wrapper;
            if (Number.isFinite(minY)) root.position.y = -minY * scale;
            return wrapper;
        }
        const coin = BABYLON.MeshBuilder.CreateCylinder(`fab_coin_${this.nextDropId}`, { height: 0.05, diameter: 0.3, tessellation: 16 }, s);
        const mat = new BABYLON.StandardMaterial('fab_coin_mat', s);
        mat.diffuseColor = new BABYLON.Color3(0.95, 0.78, 0.25);
        mat.emissiveColor = new BABYLON.Color3(0.25, 0.18, 0.04);
        coin.material = mat;
        coin.isPickable = false;
        coin.parent = wrapper;
        coin.position.y = 0.025;
        return wrapper;
    }

    /** Invisible cylinder enlarging the clickable area of a drop without changing its visuals. */
    private _attachPickProxy(root: BABYLON.TransformNode, dropId: number, radius: number): void {
        const proxy = BABYLON.MeshBuilder.CreateCylinder(
            `fab_drop_pick_${dropId}`,
            { height: LOOT_PICK_PROXY_HEIGHT, diameter: radius * 2, tessellation: 12 },
            this.scene.bScene,
        );
        proxy.parent = root;
        proxy.position.y = LOOT_PICK_PROXY_HEIGHT / 2;
        proxy.visibility = 0;
        proxy.isPickable = true;
        proxy.metadata = { lootDropId: dropId, isPickProxy: true };
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
        const dropId = this.nextDropId;
        const ground = this.scene.mapSystem.getHeightAt(x, z);
        const root = this._makeCoinMesh();
        root.position.set(x, ground + DROP_SPAWN_HEIGHT, z);
        const pickMeshes = root instanceof BABYLON.AbstractMesh ? [root as BABYLON.AbstractMesh] : root.getChildMeshes(false);
        for (const m of pickMeshes) {
            m.isPickable = true;
            m.metadata = { ...(m.metadata ?? {}), lootDropId: dropId };
        }
        this._attachPickProxy(root, dropId, LOOT_PICK_PROXY_RADIUS_GOLD);
        const now = this.scene.now();
        const drop: GroundDrop = {
            kind: DROP_KIND.GOLD,
            amount,
            itemDef: null,
            affixes: null,
            root,
            beam: null,
            label: null,
            velocity: this._ejectVelocity(),
            bounces: 0,
            resting: false,
            restY: ground + DROP_REST_Y,
            spawnedAt: now,
            expiresAt: now + DROP_DESPAWN_MS,
        };
        (root as any).__dropId = dropId;
        (drop as any).dropId = dropId;
        this.scene.groundDrops.push(drop);
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

    private _spawnItemDrop(x: number, z: number, itemDef: ItemDef, affixes: RolledAffix[] | null = null): void {
        const s = this.scene.bScene;
        const dropId = this.nextDropId++;
        const rarity = this.scene.getRarity(itemDef.rarity_id);
        const colorHex = rarity ? rarity.color_hex : UI_RARITY_FALLBACK;
        const color = BABYLON.Color3.FromHexString(colorHex);

        const ground = this.scene.mapSystem.getHeightAt(x, z);
        const root = new BABYLON.TransformNode(`fab_drop_${dropId}`, s);
        root.position.set(x, ground + DROP_SPAWN_HEIGHT, z);
        this._attachPickProxy(root, dropId, LOOT_PICK_PROXY_RADIUS_ITEM);

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
        ctx.fillText(this._composeDropName(itemDef, affixes), LABEL_TEX_W / 2, LABEL_TEX_H / 2);
        labelTex.update();
        const labelMat = new BABYLON.StandardMaterial(`fab_drop_label_mat_${dropId}`, s);
        labelMat.diffuseTexture = labelTex;
        labelMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        labelMat.disableLighting = true;
        labelMat.backFaceCulling = false;
        label.material = labelMat;
        label.setEnabled(FabulusPrefs.get().showDropLabels);

        const now = this.scene.now();
        const drop: GroundDrop = {
            kind: DROP_KIND.ITEM,
            amount: 0,
            itemDef,
            affixes,
            root,
            beam,
            label,
            velocity: this._ejectVelocity(),
            bounces: 0,
            resting: false,
            restY: ground + DROP_ITEM_REST_Y,
            spawnedAt: now,
            expiresAt: now + DROP_DESPAWN_MS,
        };
        (root as any).__dropId = dropId;
        (drop as any).dropId = dropId;
        this.scene.groundDrops.push(drop);
    }

    pickupByDropId(dropId: number): void {
        const drop = this.scene.groundDrops.find(d => (d as any).dropId === dropId);
        if (!drop) return;
        if (drop.kind === DROP_KIND.ITEM && !drop.itemDef) return;
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
        this._collect(drop);
    }

    private _collect(drop: GroundDrop): void {
        if (drop.kind === DROP_KIND.GOLD) this._collectGold(drop);
        else this._collectItem(drop);
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
            this._collect(drop);
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
        if ((drop as any).collecting) return;
        (drop as any).collecting = true;
        FabulusApi.addPlayerItem(itemDef.id, drop.affixes)
            .then(row => {
                const existing = this.scene.playerItems.find(pi => pi.id === row.id);
                if (existing) existing.quantity = row.quantity;
                else this.scene.playerItems.push(row);
                this.scene.audioSystem.playItemPickup();
                this.scene.uiSystem.toast(`Voce obteve: ${this._composeDropName(itemDef, drop.affixes)}`);
                this.scene.uiSystem.refreshPanels();
                this._dispose(drop);
            })
            .catch(err => {
                console.warn('[Fabulus] addPlayerItem failed:', err);
                (drop as any).collecting = false;
                this.scene.uiSystem.toast('Falha ao coletar o item, tente novamente');
            });
    }

    private _collectGold(drop: GroundDrop): void {
        this.scene.player.gold += drop.amount;
        this.scene.audioSystem.playCoin();
        const pos = drop.root.position;
        this.scene.uiSystem.floatText(pos.x, pos.y + 0.8, pos.z, `+${drop.amount} gold`, 'gold');
        this.scene.vfxSystem.goldSparkle(pos);
        this._dispose(drop);
        this.scene.persistState(true);
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
                // Drops scatter in XZ while falling: track the terrain under the new spot.
                const restOffset = drop.kind === DROP_KIND.GOLD ? DROP_REST_Y : DROP_ITEM_REST_Y;
                drop.restY = this.scene.mapSystem.getHeightAt(drop.root.position.x, drop.root.position.z) + restOffset;
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

            const remaining = drop.expiresAt - now;
            if (remaining <= 0) {
                this._dispose(drop);
            } else if (remaining < DROP_FADE_WARN_MS) {
                const vis = remaining / DROP_FADE_WARN_MS;
                const meshes = drop.root.getChildMeshes ? drop.root.getChildMeshes(false) : [];
                for (const m of meshes) {
                    if ((m.metadata as { isPickProxy?: boolean } | null)?.isPickProxy) continue;
                    m.visibility = vis;
                }
                if ((drop.root as any).visibility !== undefined) (drop.root as any).visibility = vis;
            }
        }
    }

    dispose(): void {
        FabulusPrefs.offChange(this._onPrefsChange);
        for (let i = this.scene.groundDrops.length - 1; i >= 0; i--) {
            this._dispose(this.scene.groundDrops[i]);
        }
    }
}
