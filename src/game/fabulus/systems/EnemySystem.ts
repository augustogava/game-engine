import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import type { EnemyDef, EnemyInstance } from '../types/index.js';
import { ENEMY_STATE } from '../types/index.js';
import {
    ENEMY_COLLIDER_RADIUS, ENEMY_HEIGHT_UNITS, ENEMY_LUNGE_DISTANCE, ENEMY_LUNGE_DURATION_MS,
    ENEMY_RESPAWN_MS, ENEMY_SPAWN_COUNT, ENEMY_SPAWN_MIN_DIST, ENEMY_WANDER_INTERVAL_MS,
    ENEMY_WANDER_RADIUS, MAP_HALF, MODELS_BASE_PATH,
} from '../constants/index.js';
import { FabulusPrefs } from '../FabulusPrefs.js';

const HP_BAR_WIDTH = 1.1;
const HP_BAR_HEIGHT = 0.14;
const HP_BAR_TEX_W = 256;
const HP_BAR_TEX_H = 32;
const ENEMY_LEVEL_VARIANCE = 2;
const RETURN_REGEN_PER_SEC_PCT = 10;
const DEATH_FADE_SECONDS = 1.2;
const ATTACK_DAMAGE_POINT_PCT = 0.5;
const ELITE_SCALE_MULT = 1.25;
const ELITE_TINT = { r: 1.0, g: 0.82, b: 0.45 };
const ELITE_EMISSIVE = { r: 0.22, g: 0.15, b: 0.03 };

// Visual variants per enemy def (shared goblin GLB differentiated by scale + tint).
const ENEMY_VARIANT_STYLES: Record<number, { scale: number; tint: { r: number; g: number; b: number } }> = {
    2: { scale: 1.3, tint: { r: 1.0, g: 0.55, b: 0.45 } },
    3: { scale: 0.85, tint: { r: 0.55, g: 0.8, b: 1.0 } },
};

export class EnemySystem {
    private scene: FabulusScene;
    private containers: Map<number, BABYLON.AssetContainer> = new Map();
    private nextInstanceId = 1;
    private highlightedTarget: EnemyInstance | null = null;
    private hoveredEnemy: EnemyInstance | null = null;
    private _onPrefsChange = (): void => {
        for (const e of this.scene.enemies) {
            if (e.state !== ENEMY_STATE.DEAD) this.refreshHpBar(e);
        }
    };

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    async init(): Promise<void> {
        FabulusPrefs.onChange(this._onPrefsChange);
        for (const def of this.scene.enemyDefs) {
            try {
                const lastSlash = def.model_path.lastIndexOf('/');
                const dir = lastSlash >= 0 ? def.model_path.substring(0, lastSlash + 1) : '';
                const file = lastSlash >= 0 ? def.model_path.substring(lastSlash + 1) : def.model_path;
                const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(MODELS_BASE_PATH + dir, file, this.scene.bScene);
                this.containers.set(def.id, container);
            } catch (err) {
                console.warn(`[Fabulus] Enemy model load failed (${def.name}):`, err);
            }
        }
        this._spawnInitial();
        console.debug(`[Fabulus] Enemies ready (${this.scene.enemies.length})`);
    }

    private _spawnInitial(): void {
        const defs = this.scene.enemyDefs;
        if (!defs.length) return;
        for (let i = 0; i < ENEMY_SPAWN_COUNT; i++) {
            const def = defs[i % defs.length];
            const angle = (i / ENEMY_SPAWN_COUNT) * Math.PI * 2 + Math.random() * 0.5;
            const dist = ENEMY_SPAWN_MIN_DIST + Math.random() * (MAP_HALF * 0.6 - ENEMY_SPAWN_MIN_DIST);
            const pos = this._findClearPosition(Math.cos(angle) * dist, Math.sin(angle) * dist);
            this.spawn(def, pos.x, pos.z);
        }
    }

    private _findClearPosition(x: number, z: number): { x: number; z: number } {
        const clearance = ENEMY_COLLIDER_RADIUS + 1.5;
        const maxTries = 12;
        let px = x;
        let pz = z;
        for (let attempt = 0; attempt < maxTries; attempt++) {
            const blocking = this.scene.staticColliders.find(box =>
                px > box.minX - clearance && px < box.maxX + clearance &&
                pz > box.minZ - clearance && pz < box.maxZ + clearance);
            if (!blocking) return { x: px, z: pz };
            const angle = Math.random() * Math.PI * 2;
            px = x + Math.cos(angle) * clearance * (attempt + 1);
            pz = z + Math.sin(angle) * clearance * (attempt + 1);
        }
        console.warn('[Fabulus] No clear spawn position found, using original');
        return { x, z };
    }

    spawn(def: EnemyDef, x: number, z: number): EnemyInstance | null {
        const s = this.scene.bScene;
        const instanceId = this.nextInstanceId++;
        const root = new BABYLON.TransformNode(`fab_enemy_${instanceId}`, s);
        root.position.set(x, 0, z);

        const level = def.level + Math.floor(Math.random() * (ENEMY_LEVEL_VARIANCE + 1));
        const levelDelta = level - def.level;
        const isElite = Math.random() * 100 < (def.elite_chance ?? 0);
        const eliteHpMult = isElite ? (def.elite_hp_mult ?? 1) : 1;
        const eliteDmgMult = isElite ? (def.elite_dmg_mult ?? 1) : 1;
        const maxHp = Math.round(def.max_health * (1 + levelDelta * def.health_scale_pct / 100) * eliteHpMult);
        const dmgScale = (1 + levelDelta * def.damage_scale_pct / 100) * eliteDmgMult;

        const instance: EnemyInstance = {
            instanceId,
            def,
            level,
            root,
            meshes: [],
            anims: { walk: null, run: null },
            currentAnim: null,
            state: ENEMY_STATE.IDLE,
            hp: maxHp,
            maxHp,
            damageMin: Math.round(def.damage_min * dmgScale),
            damageMax: Math.round(def.damage_max * dmgScale),
            lastAttackAt: 0,
            staggeredUntil: 0,
            spawnPos: { x, z },
            wanderTarget: null,
            nextWanderAt: 0,
            respawnAt: 0,
            lungeStartedAt: 0,
            hpBarPlane: null,
            hpBarTexture: null,
            colliderRadius: ENEMY_COLLIDER_RADIUS,
            deathStartedAt: 0,
            slowPct: 0,
            slowUntil: 0,
            isElite,
            xpMult: isElite ? (def.elite_xp_mult ?? 1) : 1,
            lootRollsBonus: isElite ? (def.elite_loot_rolls ?? 0) : 0,
        };

        const container = this.containers.get(def.id);
        if (container) {
            const entries = container.instantiateModelsToScene(name => `e${instanceId}_${name}`, false);
            const modelRoot = entries.rootNodes[0] as BABYLON.TransformNode;
            modelRoot.parent = root;

            const childMeshes = modelRoot.getChildMeshes(false);
            const allMeshes = childMeshes.length ? childMeshes : [modelRoot as unknown as BABYLON.AbstractMesh];
            this.scene.renderSystem.normalizeModelHeight(modelRoot, allMeshes, ENEMY_HEIGHT_UNITS);
            const variant = ENEMY_VARIANT_STYLES[def.id];
            if (variant) {
                modelRoot.scaling.scaleInPlace(variant.scale);
                instance.colliderRadius = ENEMY_COLLIDER_RADIUS * variant.scale;
                this._applyVariantTint(allMeshes, variant.tint);
            }
            if (isElite) {
                modelRoot.scaling.scaleInPlace(ELITE_SCALE_MULT);
                instance.colliderRadius *= ELITE_SCALE_MULT;
                this._applyEliteLook(allMeshes);
            }
            for (const m of allMeshes) {
                m.isPickable = true;
                m.metadata = { ...(m.metadata || {}), enemyInstanceId: instanceId };
            }
            this.scene.renderSystem.prepareMeshes(allMeshes);
            instance.meshes = [modelRoot, ...childMeshes];

            for (const g of entries.animationGroups) g.stop();
            const find = (name: string | null) => name
                ? (entries.animationGroups.find(g => g.name.endsWith(name)) ?? null)
                : null;
            instance.anims = {
                idle: find(def.anim_idle),
                walk: find(def.anim_walk),
                run: find(def.anim_run),
                attack: find(def.anim_attack),
            };
        } else {
            const body = BABYLON.MeshBuilder.CreateCapsule(`fab_enemy_body_${instanceId}`, { height: ENEMY_HEIGHT_UNITS, radius: 0.3 }, s);
            body.parent = root;
            body.position.y = ENEMY_HEIGHT_UNITS / 2;
            body.isPickable = true;
            body.metadata = { enemyInstanceId: instanceId };
            const mat = new BABYLON.StandardMaterial(`fab_enemy_mat_${instanceId}`, s);
            mat.diffuseColor = new BABYLON.Color3(0.35, 0.55, 0.3);
            body.material = mat;
            instance.meshes = [body];
            if (isElite) {
                body.scaling.scaleInPlace(ELITE_SCALE_MULT);
                instance.colliderRadius *= ELITE_SCALE_MULT;
                this._applyEliteLook([body]);
            }
        }

        this._buildHpBar(instance);
        this._playEnemyAnim(instance, 'walk', 1);
        this._stopEnemyAnim(instance);
        this.scene.enemies.push(instance);
        return instance;
    }

    /** Elites get cloned materials (containers share materials between instances) with a golden tint + glow. */
    private _applyEliteLook(meshes: BABYLON.AbstractMesh[]): void {
        for (const m of meshes) {
            const mat = m.material;
            if (!mat) continue;
            const cloned = mat.clone(`${mat.name}_elite_${m.uniqueId}`);
            if (!cloned) continue;
            if (cloned instanceof BABYLON.PBRMaterial) {
                cloned.albedoColor = cloned.albedoColor.multiply(new BABYLON.Color3(ELITE_TINT.r, ELITE_TINT.g, ELITE_TINT.b));
                cloned.emissiveColor = new BABYLON.Color3(ELITE_EMISSIVE.r, ELITE_EMISSIVE.g, ELITE_EMISSIVE.b);
            } else if (cloned instanceof BABYLON.StandardMaterial) {
                cloned.diffuseColor = cloned.diffuseColor.multiply(new BABYLON.Color3(ELITE_TINT.r, ELITE_TINT.g, ELITE_TINT.b));
                cloned.emissiveColor = new BABYLON.Color3(ELITE_EMISSIVE.r, ELITE_EMISSIVE.g, ELITE_EMISSIVE.b);
            }
            m.material = cloned;
        }
        const layer = this.scene.renderSystem.getHighlightLayer();
        if (layer) {
            for (const m of meshes) {
                if (m instanceof BABYLON.Mesh && m.getTotalVertices() > 0) {
                    try { layer.addMesh(m, new BABYLON.Color3(0.95, 0.75, 0.25)); } catch { /* skinned edge cases */ }
                }
            }
        }
    }

    private _restoreEliteGlow(instance: EnemyInstance): void {
        const layer = this.scene.renderSystem.getHighlightLayer();
        if (!layer) return;
        for (const m of instance.meshes) {
            if (m instanceof BABYLON.Mesh && m.getTotalVertices() > 0) {
                try { layer.addMesh(m, new BABYLON.Color3(0.95, 0.75, 0.25)); } catch { /* skinned edge cases */ }
            }
        }
    }

    private _applyVariantTint(meshes: BABYLON.AbstractMesh[], tint: { r: number; g: number; b: number }): void {
        for (const m of meshes) {
            const mat = m.material;
            if (!mat) continue;
            const meta = (mat.metadata ?? {}) as { fabTinted?: boolean };
            if (meta.fabTinted) continue;
            meta.fabTinted = true;
            mat.metadata = meta;
            if (mat instanceof BABYLON.PBRMaterial) {
                mat.albedoColor = mat.albedoColor.multiply(new BABYLON.Color3(tint.r, tint.g, tint.b));
            } else if (mat instanceof BABYLON.StandardMaterial) {
                mat.diffuseColor = mat.diffuseColor.multiply(new BABYLON.Color3(tint.r, tint.g, tint.b));
            }
        }
    }

    private _buildHpBar(instance: EnemyInstance): void {
        const s = this.scene.bScene;
        const variant = ENEMY_VARIANT_STYLES[instance.def.id];
        const plane = BABYLON.MeshBuilder.CreatePlane(`fab_hpbar_${instance.instanceId}`, { width: HP_BAR_WIDTH, height: HP_BAR_HEIGHT * 2 }, s);
        plane.parent = instance.root;
        plane.position.y = ENEMY_HEIGHT_UNITS * (variant ? variant.scale : 1) * (instance.isElite ? ELITE_SCALE_MULT : 1) + 0.35;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;

        const tex = new BABYLON.DynamicTexture(`fab_hpbar_tex_${instance.instanceId}`, { width: HP_BAR_TEX_W, height: HP_BAR_TEX_H * 2 }, s, false);
        tex.hasAlpha = true;
        const mat = new BABYLON.StandardMaterial(`fab_hpbar_mat_${instance.instanceId}`, s);
        mat.diffuseTexture = tex;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        plane.material = mat;
        plane.setEnabled(false);

        instance.hpBarPlane = plane;
        instance.hpBarTexture = tex;
        this._drawHpBar(instance);
    }

    private _drawHpBar(instance: EnemyInstance): void {
        const tex = instance.hpBarTexture as BABYLON.DynamicTexture | null;
        if (!tex) return;
        const drawKey = `${Math.round(instance.hp)}_${instance.level}${(instance as any).isElite ? '_e' : ''}`;
        if ((instance as any).__hpDrawKey === drawKey) return;
        (instance as any).__hpDrawKey = drawKey;
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const nameH = HP_BAR_TEX_H;
        const totalH = HP_BAR_TEX_H * 2;
        ctx.clearRect(0, 0, HP_BAR_TEX_W, totalH);
        ctx.font = 'bold 22px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(8,6,5,0.7)';
        ctx.fillRect(0, 0, HP_BAR_TEX_W, nameH);
        ctx.fillStyle = instance.isElite ? '#f0c860' : '#e8dcc4';
        const displayName = instance.isElite ? `Elite ${instance.def.name}` : instance.def.name;
        ctx.fillText(`${displayName} Lv${instance.level}`, HP_BAR_TEX_W / 2, nameH / 2 + 2, HP_BAR_TEX_W - 8);
        ctx.fillStyle = 'rgba(10,8,8,0.85)';
        ctx.fillRect(0, nameH, HP_BAR_TEX_W, HP_BAR_TEX_H);
        const pct = Math.max(0, instance.hp / instance.maxHp);
        ctx.fillStyle = pct > 0.5 ? '#a3232a' : '#d0352e';
        ctx.fillRect(3, nameH + 3, (HP_BAR_TEX_W - 6) * pct, HP_BAR_TEX_H - 6);
        tex.update();
    }

    refreshHpBar(instance: EnemyInstance): void {
        this._drawHpBar(instance);
        if (instance.hpBarPlane) {
            const prefs = FabulusPrefs.get();
            const show = prefs.showEnemyHpBars && (instance.hp < instance.maxHp
                || this.scene.attackTarget === instance
                || this.hoveredEnemy === instance);
            instance.hpBarPlane.setEnabled(show && instance.state !== ENEMY_STATE.DEAD);
        }
    }

    setHovered(instance: EnemyInstance | null): void {
        if (this.hoveredEnemy === instance) return;
        const prev = this.hoveredEnemy;
        this.hoveredEnemy = instance;
        if (prev) this.refreshHpBar(prev);
        if (instance) this.refreshHpBar(instance);
    }

    private _updateTargetHighlight(): void {
        const target = this.scene.attackTarget;
        const effective = target && target.state !== ENEMY_STATE.DEAD ? target : null;
        if (this.highlightedTarget === effective) return;
        const layer = this.scene.renderSystem.getHighlightLayer();
        if (!layer) return;
        if (this.highlightedTarget) {
            const prev = this.highlightedTarget;
            for (const m of prev.meshes) {
                if (m instanceof BABYLON.Mesh) {
                    try { layer.removeMesh(m); } catch { /* mesh may be disposed */ }
                }
            }
            if (prev.isElite) this._restoreEliteGlow(prev);
        }
        this.highlightedTarget = effective;
        if (effective) {
            for (const m of effective.meshes) {
                if (m instanceof BABYLON.Mesh && m.getTotalVertices() > 0) {
                    try { layer.addMesh(m, new BABYLON.Color3(0.9, 0.2, 0.12)); } catch { /* skinned edge cases */ }
                }
            }
        }
    }

    private _playEnemyAnim(instance: EnemyInstance, key: string, speedRatio: number): void {
        const group = instance.anims[key] ?? instance.anims.walk;
        if (!group) return;
        if (instance.currentAnim === group) {
            if (group.speedRatio !== speedRatio) group.speedRatio = speedRatio;
            return;
        }
        if (instance.currentAnim) instance.currentAnim.stop();
        group.start(true, speedRatio);
        instance.currentAnim = group;
    }

    private _stopEnemyAnim(instance: EnemyInstance): void {
        if (instance.currentAnim) {
            instance.currentAnim.goToFrame(instance.currentAnim.from);
            instance.currentAnim.pause();
        }
    }

    kill(instance: EnemyInstance): void {
        instance.state = ENEMY_STATE.DEAD;
        instance.deathStartedAt = this.scene.now();
        instance.respawnAt = this.scene.now() + ENEMY_RESPAWN_MS;
        if (instance.currentAnim) instance.currentAnim.stop();
        if (instance.hpBarPlane) instance.hpBarPlane.setEnabled(false);
        if (this.scene.attackTarget === instance) this.scene.attackTarget = null;
        if (this.hoveredEnemy === instance) this.hoveredEnemy = null;
        this.scene.vfxSystem.deathBurst(instance.root.position);
        this.scene.audioSystem.playEnemyDeath();
    }

    private _respawn(instance: EnemyInstance): void {
        instance.state = ENEMY_STATE.IDLE;
        instance.hp = instance.maxHp;
        instance.root.position.set(instance.spawnPos.x, 0, instance.spawnPos.z);
        instance.root.rotation.x = 0;
        const modelRoot = instance.meshes[0];
        if (modelRoot && modelRoot.position !== undefined) modelRoot.position.z = 0;
        for (const m of instance.meshes) {
            if (m.visibility !== undefined) m.visibility = 1;
        }
        instance.wanderTarget = null;
        instance.nextWanderAt = 0;
        instance.slowPct = 0;
        instance.slowUntil = 0;
        instance.lungeStartedAt = 0;
        instance.lastAttackAt = 0;
        instance.deathStartedAt = 0;
        instance.staggeredUntil = 0;
        this.refreshHpBar(instance);
    }

    update(dt: number): void {
        const now = this.scene.now();
        const playerRoot = this.scene.playerRoot;
        const playerPos = playerRoot ? playerRoot.position : null;
        this._updateTargetHighlight();

        for (const e of this.scene.enemies) {
            if (e.state === ENEMY_STATE.DEAD) {
                this._updateDeath(e, dt, now);
                continue;
            }
            if (now < e.staggeredUntil) continue;

            const px = playerPos ? playerPos.x : 0;
            const pz = playerPos ? playerPos.z : 0;
            const dxp = px - e.root.position.x;
            const dzp = pz - e.root.position.z;
            const distToPlayer = Math.hypot(dxp, dzp);
            const playerDistFromSpawn = Math.hypot(px - e.spawnPos.x, pz - e.spawnPos.z);
            const playerAlive = !this.scene.playerDead && playerPos != null;

            switch (e.state) {
                case ENEMY_STATE.IDLE:
                    if (playerAlive && distToPlayer <= e.def.aggro_range) {
                        e.state = ENEMY_STATE.CHASE;
                        this.scene.audioSystem.playEnemyGrowl();
                        break;
                    }
                    this._wander(e, dt, now);
                    break;

                case ENEMY_STATE.CHASE:
                    if (!playerAlive || playerDistFromSpawn > e.def.leash_range) {
                        e.state = ENEMY_STATE.RETURN;
                        break;
                    }
                    if (distToPlayer <= e.def.attack_range) {
                        e.state = ENEMY_STATE.ATTACK;
                        break;
                    }
                    this._moveTowards(e, px, pz, e.def.run_speed, dt, 'run');
                    break;

                case ENEMY_STATE.ATTACK: {
                    if (!playerAlive) {
                        e.state = ENEMY_STATE.RETURN;
                        break;
                    }
                    if (distToPlayer > e.def.attack_range * 1.25) {
                        e.state = ENEMY_STATE.CHASE;
                        break;
                    }
                    this._face(e, dxp, dzp);
                    this._stopEnemyAnim(e);
                    this._updateLunge(e, now);
                    if (now - e.lastAttackAt >= e.def.attack_cooldown_ms) {
                        e.lastAttackAt = now;
                        e.lungeStartedAt = now;
                        const dmgMin = e.damageMin;
                        const dmgMax = e.damageMax;
                        const level = e.level;
                        setTimeout(() => {
                            if (e.state === ENEMY_STATE.ATTACK && !this.scene.playerDead) {
                                this.scene.combatSystem.damagePlayer(dmgMin, dmgMax, level);
                            }
                        }, ENEMY_LUNGE_DURATION_MS * ATTACK_DAMAGE_POINT_PCT);
                    }
                    break;
                }

                case ENEMY_STATE.RETURN: {
                    const dxs = e.spawnPos.x - e.root.position.x;
                    const dzs = e.spawnPos.z - e.root.position.z;
                    if (Math.hypot(dxs, dzs) < 0.4) {
                        e.state = ENEMY_STATE.IDLE;
                        this._stopEnemyAnim(e);
                    } else {
                        this._moveTowards(e, e.spawnPos.x, e.spawnPos.z, e.def.run_speed, dt, 'run');
                        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (RETURN_REGEN_PER_SEC_PCT / 100) * dt);
                        this.refreshHpBar(e);
                    }
                    break;
                }
            }
        }
    }

    private _updateDeath(e: EnemyInstance, dt: number, now: number): void {
        const elapsed = (now - e.deathStartedAt) / 1000;
        if (elapsed < DEATH_FADE_SECONDS) {
            const t = elapsed / DEATH_FADE_SECONDS;
            e.root.rotation.x = -Math.PI / 2 * Math.min(1, t * 1.5);
            for (const m of e.meshes) {
                if (m.visibility !== undefined) m.visibility = Math.max(0, 1 - t);
            }
        } else {
            for (const m of e.meshes) {
                if (m.visibility !== undefined) m.visibility = 0;
            }
        }
        if (now >= e.respawnAt) this._respawn(e);
    }

    private _updateLunge(e: EnemyInstance, now: number): void {
        const modelRoot = e.meshes[0];
        if (!modelRoot || modelRoot.position === undefined) return;
        if (!e.lungeStartedAt) return;
        const t = (now - e.lungeStartedAt) / ENEMY_LUNGE_DURATION_MS;
        if (t >= 1) {
            modelRoot.position.z = 0;
            e.lungeStartedAt = 0;
            return;
        }
        const WINDUP_PHASE = 0.3;
        if (t < WINDUP_PHASE) {
            modelRoot.position.z = -Math.sin((t / WINDUP_PHASE) * Math.PI / 2) * ENEMY_LUNGE_DISTANCE * 0.35;
        } else {
            const ft = (t - WINDUP_PHASE) / (1 - WINDUP_PHASE);
            modelRoot.position.z = Math.sin(ft * Math.PI) * ENEMY_LUNGE_DISTANCE;
        }
    }

    private _wander(e: EnemyInstance, dt: number, now: number): void {
        if (!e.wanderTarget || now >= e.nextWanderAt) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * ENEMY_WANDER_RADIUS;
            e.wanderTarget = {
                x: e.spawnPos.x + Math.cos(angle) * dist,
                z: e.spawnPos.z + Math.sin(angle) * dist,
            };
            e.nextWanderAt = now + ENEMY_WANDER_INTERVAL_MS + Math.random() * 2000;
        }
        const dx = e.wanderTarget.x - e.root.position.x;
        const dz = e.wanderTarget.z - e.root.position.z;
        if (Math.hypot(dx, dz) < 0.3) {
            this._stopEnemyAnim(e);
            return;
        }
        this._moveTowards(e, e.wanderTarget.x, e.wanderTarget.z, e.def.walk_speed, dt, 'walk');
    }

    private _moveTowards(e: EnemyInstance, tx: number, tz: number, speed: number, dt: number, animKey: string): void {
        const dx = tx - e.root.position.x;
        const dz = tz - e.root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.001) return;
        let effectiveSpeed = speed;
        if (e.slowUntil > this.scene.now()) {
            effectiveSpeed *= Math.max(0.1, 1 - e.slowPct / 100);
        }
        const step = Math.min(dist, effectiveSpeed * dt);
        e.root.position.x += (dx / dist) * step;
        e.root.position.z += (dz / dist) * step;
        e.root.position.y = 0;
        this._face(e, dx, dz);
        this._playEnemyAnim(e, animKey, 1);
    }

    private _face(e: EnemyInstance, dx: number, dz: number): void {
        if (dx === 0 && dz === 0) return;
        e.root.rotation.y = Math.atan2(dx, dz);
    }

    findByInstanceId(id: number): EnemyInstance | null {
        return this.scene.enemies.find(e => e.instanceId === id) ?? null;
    }

    dispose(): void {
        for (const e of this.scene.enemies) {
            if (e.hpBarTexture) e.hpBarTexture.dispose();
            try { e.root.dispose(false, true); } catch { /* already disposed */ }
        }
        this.scene.enemies = [];
        for (const container of this.containers.values()) {
            try { container.dispose(); } catch { /* already disposed */ }
        }
        this.containers.clear();
        this.highlightedTarget = null;
        this.hoveredEnemy = null;
        FabulusPrefs.offChange(this._onPrefsChange);
    }
}
