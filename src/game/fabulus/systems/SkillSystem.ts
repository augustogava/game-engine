import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import type { EnemyInstance, SkillDef } from '../types/index.js';
import { ENEMY_STATE, SKILL_TYPE } from '../types/index.js';
import { FabulusApi } from '../api/FabulusApi.js';
import {
    FROST_SLOW_MS, FROST_SLOW_PCT, GLOBAL_COOLDOWN_MS, MAX_BAR_SLOTS, PROJECTILE_DEFAULT_SPEED,
    PROJECTILE_MAX_RANGE, PROJECTILE_RADIUS, RANK_EFFECT_SCALING,
} from '../constants/index.js';

interface Projectile {
    mesh: BABYLON.Mesh;
    trail: BABYLON.ParticleSystem | null;
    pooled: PooledProjectile;
    dirX: number;
    dirZ: number;
    speed: number;
    traveled: number;
    maxRange: number;
    coeffPct: number;
}

const PROJECTILE_HEIGHT = 1.1;
const SKILL_VFX_COLORS: Record<string, BABYLON.Color3> = {
    fire: new BABYLON.Color3(1.0, 0.45, 0.15),
    arcane: new BABYLON.Color3(0.6, 0.35, 1.0),
    frost: new BABYLON.Color3(0.45, 0.7, 1.0),
    strike: new BABYLON.Color3(1.0, 0.85, 0.4),
    default: new BABYLON.Color3(0.8, 0.8, 1.0),
};

interface PooledProjectile {
    mesh: BABYLON.Mesh;
    mat: BABYLON.StandardMaterial;
    trail: BABYLON.ParticleSystem | null;
}

export class SkillSystem {
    private scene: FabulusScene;
    private projectiles: Projectile[] = [];
    private projectilePool: PooledProjectile[] = [];
    private globalCooldownUntil = 0;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    init(): void {
        this.checkUnlocks(this.scene.player.level);
        console.debug(`[Fabulus] Skills ready (${this.scene.playerSkills.length} unlocked)`);
    }

    checkUnlocks(level: number): number[] {
        const newlyUnlocked: number[] = [];
        for (const def of this.scene.skillsCatalog) {
            if (def.unlock_level > level) continue;
            if (this.scene.playerSkills.some(ps => ps.skill_id === def.id)) continue;
            const usedSlots = new Set(this.scene.playerSkills.map(ps => ps.bar_slot).filter(s => s != null));
            let freeSlot: number | null = null;
            for (let slot = 1; slot <= MAX_BAR_SLOTS; slot++) {
                if (!usedSlots.has(slot)) { freeSlot = slot; break; }
            }
            this.scene.playerSkills.push({ skill_id: def.id, rank: 1, bar_slot: freeSlot });
            newlyUnlocked.push(def.id);
            FabulusApi.unlockSkill(def.id).catch(err => console.warn('[Fabulus] unlockSkill failed:', err));
            if (freeSlot != null) {
                FabulusApi.assignSkillSlot(def.id, freeSlot).catch(err => console.warn('[Fabulus] assignSkillSlot failed:', err));
            }
        }
        return newlyUnlocked;
    }

    getCooldownRemaining(skillId: number): number {
        const until = this.scene.skillCooldowns.get(skillId) ?? 0;
        return Math.max(0, until - this.scene.now());
    }

    effectiveCoeff(def: SkillDef, rank: number): number {
        return def.damage_coeff + (rank - 1) * def.damage_coeff_per_rank;
    }

    tryCastSlot(slot: number): void {
        const ps = this.scene.playerSkills.find(p => p.bar_slot === slot);
        if (!ps) return;
        const def = this.scene.getSkillDef(ps.skill_id);
        if (!def) return;
        this.cast(def, ps.rank);
    }

    cast(def: SkillDef, rank: number): void {
        const scene = this.scene;
        if (scene.playerDead) return;
        const now = scene.now();
        if (now < this.globalCooldownUntil) return;
        if (this.getCooldownRemaining(def.id) > 0) return;
        if (scene.player.current_mana < def.mana_cost) {
            scene.uiSystem.toast('Mana insuficiente');
            return;
        }

        const coeff = this.effectiveCoeff(def, rank);
        let executed = false;

        switch (def.skill_type) {
            case SKILL_TYPE.MELEE_STRIKE:
                executed = this._castMelee(def, coeff);
                break;
            case SKILL_TYPE.PROJECTILE:
                executed = this._castProjectile(def, coeff);
                break;
            case SKILL_TYPE.AOE:
                executed = this._castAoe(def, coeff);
                break;
            case SKILL_TYPE.BUFF:
                executed = this._castBuff(def, rank);
                break;
            case SKILL_TYPE.HEAL:
                executed = this._castHeal(def, coeff);
                break;
            default:
                console.warn(`[Fabulus] Unknown skill type: ${def.skill_type}`);
        }

        if (!executed) return;
        scene.player.current_mana -= def.mana_cost;
        scene.skillCooldowns.set(def.id, now + def.cooldown_ms);
        this.globalCooldownUntil = now + GLOBAL_COOLDOWN_MS;
        scene.uiSystem.setCastingSlot(def.id);
        scene.audioSystem.playSkillCast();
    }

    private _findTarget(range: number): EnemyInstance | null {
        const scene = this.scene;
        const current = scene.attackTarget;
        if (current && current.state !== ENEMY_STATE.DEAD && this._dist(current) <= range) return current;
        let best: EnemyInstance | null = null;
        let bestDist = range;
        for (const e of scene.enemies) {
            if (e.state === ENEMY_STATE.DEAD) continue;
            const d = this._dist(e);
            if (d <= bestDist) {
                best = e;
                bestDist = d;
            }
        }
        return best;
    }

    private _dist(enemy: EnemyInstance): number {
        const root = this.scene.playerRoot;
        if (!root || !enemy.root) return Infinity;
        return Math.hypot(enemy.root.position.x - root.position.x, enemy.root.position.z - root.position.z);
    }

    private _castMelee(def: SkillDef, coeff: number): boolean {
        const target = this._findTarget(def.range);
        if (!target) {
            this.scene.uiSystem.toast('Nenhum alvo ao alcance');
            return false;
        }
        const staggerMs = def.duration_ms ?? 0;
        return this.scene.combatSystem.castMeleeSkill(target, coeff, def.anim_override, staggerMs);
    }

    private _castProjectile(def: SkillDef, coeff: number): boolean {
        const root = this.scene.playerRoot;
        if (!root) return false;
        let dirX: number;
        let dirZ: number;
        const target = this._findTarget(def.range > 0 ? def.range : PROJECTILE_MAX_RANGE);
        if (target && target.root) {
            const dx = target.root.position.x - root.position.x;
            const dz = target.root.position.z - root.position.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.001) return false;
            dirX = dx / d;
            dirZ = dz / d;
            root.rotation.y = Math.atan2(dx, dz);
        } else {
            dirX = Math.sin(root.rotation.y);
            dirZ = Math.cos(root.rotation.y);
        }

        const color = SKILL_VFX_COLORS[def.vfx_key] ?? SKILL_VFX_COLORS.default;
        const pooled = this._acquireProjectile(color);
        pooled.mesh.position.set(root.position.x + dirX * 0.6, PROJECTILE_HEIGHT, root.position.z + dirZ * 0.6);

        this.projectiles.push({
            mesh: pooled.mesh,
            trail: pooled.trail,
            pooled,
            dirX, dirZ,
            speed: def.projectile_speed ?? PROJECTILE_DEFAULT_SPEED,
            traveled: 0,
            maxRange: def.range > 0 ? def.range : PROJECTILE_MAX_RANGE,
            coeffPct: coeff,
        });
        this.scene.audioSystem.playProjectile();
        return true;
    }

    private _acquireProjectile(color: BABYLON.Color3): PooledProjectile {
        let pooled = this.projectilePool.pop();
        if (!pooled) {
            const mesh = BABYLON.MeshBuilder.CreateSphere(`fab_proj_${this.projectiles.length}_${Date.now()}`, { diameter: PROJECTILE_RADIUS * 2 }, this.scene.bScene);
            const mat = new BABYLON.StandardMaterial('fab_proj_mat', this.scene.bScene);
            mat.disableLighting = true;
            mesh.material = mat;
            mesh.isPickable = false;
            pooled = { mesh, mat, trail: this.scene.vfxSystem.attachProjectileTrail(mesh, color) };
        }
        pooled.mat.emissiveColor = color;
        pooled.mesh.setEnabled(true);
        if (pooled.trail) {
            pooled.trail.emitter = pooled.mesh;
            pooled.trail.color1 = new BABYLON.Color4(color.r, color.g, color.b, 0.9);
            pooled.trail.color2 = new BABYLON.Color4(color.r * 0.6, color.g * 0.6, color.b * 0.6, 0.5);
            pooled.trail.start();
        }
        return pooled;
    }

    private _castAoe(def: SkillDef, coeff: number): boolean {
        const root = this.scene.playerRoot;
        if (!root || def.radius == null) return false;
        const cx = root.position.x;
        const cz = root.position.z;
        let hits = 0;
        const isFrost = def.vfx_key === 'frost';
        const now = this.scene.now();
        for (const e of this.scene.enemies) {
            if (e.state === ENEMY_STATE.DEAD || !e.root) continue;
            const d = Math.hypot(e.root.position.x - cx, e.root.position.z - cz);
            if (d <= def.radius) {
                this.scene.combatSystem.dealDamageToEnemy(e, coeff, 0, true);
                if (isFrost) {
                    e.slowPct = FROST_SLOW_PCT;
                    e.slowUntil = now + FROST_SLOW_MS;
                }
                hits++;
            }
        }
        this.scene.vfxSystem.aoeRing(cx, cz, def.radius, SKILL_VFX_COLORS[def.vfx_key] ?? SKILL_VFX_COLORS.default);
        console.debug(`[Fabulus] AoE ${def.name} hit ${hits} enemies`);
        return true;
    }

    private _castBuff(def: SkillDef, rank: number): boolean {
        if (def.duration_ms == null || !def.effects.length) return false;
        const rankMult = 1 + (rank - 1) * RANK_EFFECT_SCALING;
        const effects = def.effects.map(e => ({ ...e, value: e.value * rankMult }));
        this.scene.activeBuffs = this.scene.activeBuffs.filter(b => b.skillId !== def.id);
        this.scene.activeBuffs.push({
            skillId: def.id,
            name: def.name,
            iconKey: def.icon_key,
            effects,
            expiresAt: this.scene.now() + def.duration_ms,
        });
        this.scene.recomputeDerivedStats();
        this.scene.vfxSystem.buffAura(SKILL_VFX_COLORS[def.vfx_key] ?? SKILL_VFX_COLORS.default);
        return true;
    }

    private _castHeal(def: SkillDef, coeff: number): boolean {
        const p = this.scene.player;
        const d = this.scene.derived;
        if (p.current_health >= d.maxHealth) {
            this.scene.uiSystem.toast('Vida ja esta cheia');
            return false;
        }
        const healed = Math.round(d.maxHealth * (coeff / 100));
        p.current_health = Math.min(d.maxHealth, p.current_health + healed);
        const root = this.scene.playerRoot;
        if (root) this.scene.uiSystem.floatText(root.position.x, root.position.y + 2.0, root.position.z, `+${healed}`, 'heal');
        this.scene.vfxSystem.healSparkle();
        this.scene.audioSystem.playHeal();
        return true;
    }

    async rankUp(skillId: number): Promise<boolean> {
        const scene = this.scene;
        const ps = scene.playerSkills.find(p => p.skill_id === skillId);
        const def = scene.getSkillDef(skillId);
        if (!ps || !def) return false;
        if (scene.player.skill_points <= 0 || ps.rank >= def.max_rank) return false;
        ps.rank += 1;
        scene.player.skill_points -= 1;
        try {
            await FabulusApi.rankUpSkill(skillId);
        } catch (err) {
            console.warn('[Fabulus] rankUpSkill failed:', err);
        }
        return true;
    }

    async assignSlot(skillId: number, slot: number | null): Promise<void> {
        if (slot != null && (slot < 1 || slot > MAX_BAR_SLOTS)) return;
        for (const ps of this.scene.playerSkills) {
            if (slot != null && ps.bar_slot === slot) ps.bar_slot = null;
        }
        const row = this.scene.playerSkills.find(ps => ps.skill_id === skillId);
        if (row) row.bar_slot = slot;
        try {
            await FabulusApi.assignSkillSlot(skillId, slot);
        } catch (err) {
            console.warn('[Fabulus] assignSkillSlot failed:', err);
        }
    }

    update(dt: number): void {
        this._updateProjectiles(dt);
        this._updateBuffs();
    }

    private _updateProjectiles(dt: number): void {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const step = proj.speed * dt;
            proj.mesh.position.x += proj.dirX * step;
            proj.mesh.position.z += proj.dirZ * step;
            proj.traveled += step;

            let hit: EnemyInstance | null = null;
            for (const e of this.scene.enemies) {
                if (e.state === ENEMY_STATE.DEAD || !e.root) continue;
                const d = Math.hypot(e.root.position.x - proj.mesh.position.x, e.root.position.z - proj.mesh.position.z);
                if (d <= e.colliderRadius + PROJECTILE_RADIUS) {
                    hit = e;
                    break;
                }
            }

            if (hit) {
                this.scene.combatSystem.dealDamageToEnemy(hit, proj.coeffPct, 0, true);
                this._disposeProjectile(proj, i);
            } else if (proj.traveled >= proj.maxRange) {
                this._disposeProjectile(proj, i);
            }
        }
    }

    private _disposeProjectile(proj: Projectile, index: number): void {
        if (proj.trail) {
            proj.trail.emitter = proj.mesh.position.clone();
            proj.trail.stop();
        }
        proj.mesh.setEnabled(false);
        this.projectilePool.push(proj.pooled);
        this.projectiles.splice(index, 1);
    }

    private _updateBuffs(): void {
        const now = this.scene.now();
        const before = this.scene.activeBuffs.length;
        this.scene.activeBuffs = this.scene.activeBuffs.filter(b => b.expiresAt > now);
        if (this.scene.activeBuffs.length !== before) {
            this.scene.recomputeDerivedStats();
        }
    }
}
