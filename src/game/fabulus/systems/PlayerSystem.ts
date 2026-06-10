import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import { ENEMY_STATE } from '../types/index.js';
import {
    ARRIVAL_THRESHOLD, MODELS_BASE_PATH, PLAYER_HEIGHT_UNITS, PLAYER_RESPAWN_MS,
    PLAYER_TURN_LERP, RUN_ANIM_REFERENCE_SPEED, WALK_ANIM_REFERENCE_SPEED,
} from '../constants/index.js';

const PLAYER_MODEL_YAW_OFFSET = 0;
const DEATH_FADE_SECONDS = 1.2;

// Visual differentiation while classes share the same GLB (no dedicated Wizard asset yet).
const CLASS_MODEL_TINTS: Record<number, { r: number; g: number; b: number }> = {
    2: { r: 0.55, g: 0.6, b: 1.0 },
};

export class PlayerSystem {
    private scene: FabulusScene;
    attackLockUntil = 0;
    private respawnAt = 0;
    private anims: Record<string, BABYLON.AnimationGroup | null> = {};
    private currentLoop: BABYLON.AnimationGroup | null = null;
    private deathFadeT = 0;
    private spawnX = 0;
    private spawnZ = 0;
    private attackTimeouts: number[] = [];

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    async init(): Promise<void> {
        const s = this.scene.bScene;
        const c = this.scene.classDef;
        const root = new BABYLON.TransformNode('fab_player_root', s);
        root.position.set(this.scene.player.pos_x, 0, this.scene.player.pos_z);
        this.spawnX = this.scene.player.pos_x;
        this.spawnZ = this.scene.player.pos_z;
        this.scene.playerRoot = root;

        const lastSlash = c.model_path.lastIndexOf('/');
        const dir = lastSlash >= 0 ? c.model_path.substring(0, lastSlash + 1) : '';
        const file = lastSlash >= 0 ? c.model_path.substring(lastSlash + 1) : c.model_path;

        await new Promise<void>((resolve) => {
            BABYLON.SceneLoader.ImportMesh('', MODELS_BASE_PATH + dir, file, s, (meshes, _ps, _sk, animationGroups) => {
                try {
                    this._attachModel(meshes, animationGroups, root);
                } catch (err) {
                    console.warn('[Fabulus] Player model attach failed, using fallback:', err);
                    this._buildFallbackMesh(root);
                }
                resolve();
            }, undefined, (_sc, message) => {
                console.warn('[Fabulus] Player model load failed, using fallback:', message);
                this._buildFallbackMesh(root);
                resolve();
            });
        });

        this.playLogical('idle');
        console.debug('[Fabulus] Player ready');
    }

    private _attachModel(meshes: BABYLON.AbstractMesh[], animationGroups: BABYLON.AnimationGroup[], root: BABYLON.TransformNode): void {
        if (!meshes.length) {
            this._buildFallbackMesh(root);
            return;
        }
        const modelRoot = meshes[0];
        modelRoot.parent = root;

        for (const m of meshes) m.isPickable = false;
        this.scene.renderSystem.normalizeModelHeight(modelRoot, meshes, PLAYER_HEIGHT_UNITS);
        this.scene.renderSystem.prepareMeshes(meshes);
        this._applyClassTint(meshes);
        this.scene.playerMeshes = meshes;

        for (const g of animationGroups) g.stop();
        const c = this.scene.classDef;
        const find = (name: string | null) => name ? (animationGroups.find(g => g.name === name) ?? null) : null;
        this.anims = {
            idle: find(c.anim_idle),
            walk: find(c.anim_walk),
            run: find(c.anim_run),
            attack: find(c.anim_attack),
            hit: find(c.anim_hit),
            death: find(c.anim_death),
        };
        this.scene.playerAnims = this.anims;
        console.debug('[Fabulus] Player animations:', animationGroups.map(g => g.name).join(', '));
    }

    private _applyClassTint(meshes: BABYLON.AbstractMesh[]): void {
        const tint = CLASS_MODEL_TINTS[this.scene.classDef.id];
        if (!tint) return;
        const color = new BABYLON.Color3(tint.r, tint.g, tint.b);
        const seen = new Set<BABYLON.Material>();
        for (const m of meshes) {
            const mat = m.material;
            if (!mat || seen.has(mat)) continue;
            seen.add(mat);
            if (mat instanceof BABYLON.PBRMaterial) {
                mat.albedoColor = mat.albedoColor.multiply(color);
            } else if (mat instanceof BABYLON.StandardMaterial) {
                mat.diffuseColor = mat.diffuseColor.multiply(color);
            }
        }
    }

    private _buildFallbackMesh(root: BABYLON.TransformNode): void {
        const s = this.scene.bScene;
        const body = BABYLON.MeshBuilder.CreateCapsule('fab_player_fallback', { height: PLAYER_HEIGHT_UNITS, radius: 0.35 }, s);
        body.parent = root;
        body.position.y = PLAYER_HEIGHT_UNITS / 2;
        body.isPickable = false;
        const mat = new BABYLON.StandardMaterial('fab_player_fallback_mat', s);
        mat.diffuseColor = new BABYLON.Color3(0.45, 0.5, 0.65);
        body.material = mat;
        this.scene.playerMeshes = [body];
        this.scene.renderSystem.prepareMeshes([body]);
        this.anims = { idle: null, walk: null, run: null, attack: null, hit: null, death: null };
        this.scene.playerAnims = this.anims;
    }

    private _stopAllAnims(): void {
        for (const key of Object.keys(this.anims)) {
            const g = this.anims[key];
            if (g?.isPlaying) g.stop();
        }
        this.currentLoop = null;
    }

    playLogical(state: string, speedRatio = 1): void {
        if (this.scene.playerLogicalState === state && state !== 'attack') {
            if (this.currentLoop && this.currentLoop.speedRatio !== speedRatio) this.currentLoop.speedRatio = speedRatio;
            return;
        }
        this.scene.playerLogicalState = state;
        const anims = this.anims;

        if (state === 'idle') {
            this._stopAllAnims();
            if (anims.idle) {
                anims.idle.start(true, 1);
                this.currentLoop = anims.idle;
            } else if (anims.walk) {
                anims.walk.start(true, 1);
                anims.walk.goToFrame(anims.walk.from);
                anims.walk.pause();
                this.currentLoop = anims.walk;
            }
        } else if (state === 'walk' || state === 'run') {
            this._stopAllAnims();
            const group = state === 'run' ? (anims.run ?? anims.walk) : (anims.walk ?? anims.run);
            if (group) {
                group.start(true, speedRatio);
                this.currentLoop = group;
            }
        } else if (state === 'dead') {
            this._stopAllAnims();
            if (anims.death) {
                anims.death.start(false, 1);
            }
        }
    }

    playAttack(speedRatio: number, animOverride: string | null, onDamagePoint: () => void, onEnd: () => void, damagePointPct: number): void {
        const anims = this.anims;
        let group = anims.attack;
        if (animOverride) {
            const all = this.scene.bScene.animationGroups as BABYLON.AnimationGroup[];
            group = all.find(g => g.name === animOverride) ?? group;
        }
        if (this.currentLoop) {
            this.currentLoop.stop();
            this.currentLoop = null;
        }
        this.scene.playerLogicalState = 'attack';

        if (!group) {
            const durationMs = 450 / Math.max(0.2, speedRatio);
            this.attackTimeouts.push(window.setTimeout(onDamagePoint, durationMs * damagePointPct));
            this.attackTimeouts.push(window.setTimeout(() => {
                onEnd();
            }, durationMs));
            return;
        }

        group.stop();
        group.start(false, speedRatio);
        const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? 60;
        const durationMs = ((group.to - group.from) / fps) * 1000 / Math.max(0.2, speedRatio);
        this.attackTimeouts.push(window.setTimeout(onDamagePoint, durationMs * damagePointPct));
        group.onAnimationGroupEndObservable.addOnce(() => onEnd());
    }

    private _clearAttackTimeouts(): void {
        for (const handle of this.attackTimeouts) clearTimeout(handle);
        this.attackTimeouts = [];
    }

    die(): void {
        if (this.scene.playerDead) return;
        this.scene.playerDead = true;
        this._clearAttackTimeouts();
        this.scene.moveTarget = null;
        this.scene.attackTarget = null;
        this.respawnAt = this.scene.now() + PLAYER_RESPAWN_MS;
        this.deathFadeT = 0;
        this.playLogical('dead');
        this.scene.uiSystem.showDeathOverlay(PLAYER_RESPAWN_MS);
        this.scene.audioSystem.playPlayerDeath();
        console.debug('[Fabulus] Player died');
    }

    private _respawn(): void {
        this.scene.playerDead = false;
        this.deathFadeT = 0;
        const root = this.scene.playerRoot;
        if (root) {
            root.position.set(this.spawnX, 0, this.spawnZ);
            root.rotation.x = 0;
            root.rotation.z = 0;
        }
        for (const m of this.scene.playerMeshes) m.visibility = 1;
        this.scene.player.current_health = this.scene.derived.maxHealth;
        this.scene.player.current_mana = this.scene.derived.maxMana;
        this.scene.uiSystem.hideDeathOverlay();
        this.playLogical('idle');
        this.scene.persistState(true);
        console.debug('[Fabulus] Player respawned');
    }

    update(dt: number): void {
        const root = this.scene.playerRoot;
        if (!root) return;
        const now = this.scene.now();

        if (this.scene.playerDead) {
            if (!this.anims.death && this.deathFadeT < 1) {
                this.deathFadeT = Math.min(1, this.deathFadeT + dt / DEATH_FADE_SECONDS);
                root.rotation.x = -Math.PI / 2 * this.deathFadeT;
                for (const m of this.scene.playerMeshes) m.visibility = 1 - this.deathFadeT * 0.7;
            }
            if (now >= this.respawnAt) this._respawn();
            return;
        }

        this._regen(dt);

        if (this.scene.playerLogicalState === 'attack' || now < this.attackLockUntil) return;

        let target: BABYLON.Vector3 | null = null;
        let stopDistance = ARRIVAL_THRESHOLD;
        const attackTarget = this.scene.attackTarget;
        if (attackTarget && attackTarget.state !== ENEMY_STATE.DEAD && attackTarget.root) {
            target = attackTarget.root.position;
            stopDistance = this.scene.derived.attackRange * 0.75;
        } else if (this.scene.moveTarget) {
            target = this.scene.moveTarget;
        }

        if (!target) {
            this.playLogical('idle');
            return;
        }

        const dx = target.x - root.position.x;
        const dz = target.z - root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= stopDistance) {
            if (!attackTarget) this.scene.moveTarget = null;
            this.playLogical('idle');
            if (attackTarget) this._faceTowards(dx, dz, dt, true);
            return;
        }

        const c = this.scene.classDef;
        const running = this.scene.runMode;
        const baseSpeed = running ? c.run_speed : c.walk_speed;
        const speed = baseSpeed * this.scene.derived.moveSpeedMult;
        const step = Math.min(dist, speed * dt);
        root.position.x += (dx / dist) * step;
        root.position.z += (dz / dist) * step;
        root.position.y = 0;

        this._faceTowards(dx, dz, dt, false);

        const refSpeed = running ? RUN_ANIM_REFERENCE_SPEED : WALK_ANIM_REFERENCE_SPEED;
        this.playLogical(running ? 'run' : 'walk', Math.max(0.5, speed / refSpeed));
        if (!this.scene.attackTarget) this.scene.audioSystem.tickFootsteps(dt, running);
    }

    private _faceTowards(dx: number, dz: number, dt: number, snap: boolean): void {
        const root = this.scene.playerRoot;
        if (!root || (dx === 0 && dz === 0)) return;
        const targetYaw = Math.atan2(dx, dz) + PLAYER_MODEL_YAW_OFFSET;
        const cur = root.rotation.y;
        let diff = targetYaw - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const lerp = snap ? 1 : Math.min(1, PLAYER_TURN_LERP * dt);
        root.rotation.y = cur + diff * lerp;
    }

    private _regen(dt: number): void {
        const p = this.scene.player;
        const d = this.scene.derived;
        if (p.current_health < d.maxHealth) {
            p.current_health = Math.min(d.maxHealth, p.current_health + d.hpRegen * dt);
        }
        if (p.current_mana < d.maxMana) {
            p.current_mana = Math.min(d.maxMana, p.current_mana + d.manaRegen * dt);
        }
    }
}
