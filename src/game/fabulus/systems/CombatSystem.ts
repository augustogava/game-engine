import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import type { EnemyInstance } from '../types/index.js';
import { ENEMY_STATE } from '../types/index.js';
import {
    ARMOR_K, ATTACK_DAMAGE_POINT, ATTACK_REACH_GRACE, XP_GAP_FACTOR, XP_GAP_MAX_MULT, XP_GAP_MIN_MULT,
} from '../constants/index.js';

export class CombatSystem {
    private scene: FabulusScene;
    private swinging = false;
    private lastSwingAt = 0;

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    update(_dt: number): void {
        if (this.scene.playerDead || this.swinging) return;
        const target = this.scene.attackTarget;
        if (!target || target.state === ENEMY_STATE.DEAD || !target.root || !this.scene.playerRoot) return;

        const d = this.scene.derived;
        const dist = this._distToEnemy(target);
        if (dist > d.attackRange) return;

        const now = this.scene.now();
        const swingIntervalMs = 1000 / Math.max(0.2, d.attackSpeed);
        if (now - this.lastSwingAt < swingIntervalMs) return;

        this.lastSwingAt = now;
        this._startSwing(target, 100, null, 0, false);
    }

    private _startSwing(target: EnemyInstance, coeffPct: number, animOverride: string | null, staggerMs: number, isSkill = false): void {
        this.swinging = true;
        const d = this.scene.derived;
        const weapon = this.scene.getEquippedWeapon();
        const override = animOverride ?? (weapon ? weapon.anim_attack_override : null);
        this.scene.audioSystem.playSwing();
        this.scene.weaponSystem.swingFlash();
        const playerRoot = this.scene.playerRoot;
        if (playerRoot) {
            this.scene.vfxSystem.slashArc(
                playerRoot.position.x, playerRoot.position.z, playerRoot.rotation.y,
                new BABYLON.Color3(1.0, 0.85, 0.4),
            );
        }

        this.scene.playerSystem.playAttack(
            Math.max(0.6, d.attackSpeed),
            override,
            () => {
                if (this.scene.playerDead) return;
                if (target.state === ENEMY_STATE.DEAD) return;
                const dist = this._distToEnemy(target);
                if (dist > d.attackRange * ATTACK_REACH_GRACE) return;
                this.dealDamageToEnemy(target, coeffPct, staggerMs, isSkill);
            },
            () => {
                this.swinging = false;
                if (!this.scene.playerDead) this.scene.playerSystem.playLogical('idle');
            },
            ATTACK_DAMAGE_POINT,
        );
    }

    resetSwing(): void {
        this.swinging = false;
    }

    castMeleeSkill(target: EnemyInstance, coeffPct: number, animOverride: string | null, staggerMs: number): boolean {
        if (this.swinging) return false;
        this.lastSwingAt = this.scene.now();
        this._startSwing(target, coeffPct, animOverride, staggerMs, true);
        return true;
    }

    rollPlayerDamage(coeffPct: number, isSkill = false): { amount: number; crit: boolean } {
        const d = this.scene.derived;
        const weaponRoll = d.weaponDamageMin + Math.random() * (d.weaponDamageMax - d.weaponDamageMin);
        let raw = weaponRoll * d.mainStatMult * d.additiveMult * (coeffPct / 100);
        if (isSkill) raw *= d.skillDamageMult;
        const crit = Math.random() * 100 < d.critChancePct;
        if (crit) raw *= d.critDamageMult;
        return { amount: raw, crit };
    }

    dealDamageToEnemy(enemy: EnemyInstance, coeffPct: number, staggerMs = 0, isSkill = false): void {
        if (enemy.state === ENEMY_STATE.DEAD) return;
        const { amount, crit } = this.rollPlayerDamage(coeffPct, isSkill);
        const reduction = enemy.def.armor / (enemy.def.armor + ARMOR_K);
        const final = Math.max(1, Math.round(amount * (1 - reduction)));

        enemy.hp -= final;
        if (staggerMs > 0) enemy.staggeredUntil = this.scene.now() + staggerMs;
        this.scene.enemySystem.refreshHpBar(enemy);
        this.scene.vfxSystem.hitFlash(enemy.meshes);
        this.scene.vfxSystem.bloodSplatter(enemy.root.position);
        if (!isSkill) this.scene.vfxSystem.meleeImpact(enemy.root.position);
        this.scene.audioSystem.playHit(crit);

        const pos = enemy.root.position;
        this.scene.uiSystem.floatText(pos.x, pos.y + 1.8, pos.z, String(final), crit ? 'crit' : 'dmg');
        if (crit) {
            this.scene.cameraSystem.shake(0.12);
            this.scene.vfxSystem.impactDecal(pos.x, pos.z, 0.5);
        }

        if (enemy.hp <= 0) this._killEnemy(enemy);
    }

    private _killEnemy(enemy: EnemyInstance): void {
        const pos = enemy.root.position;
        this.scene.enemySystem.kill(enemy);
        this.scene.lootSystem.onEnemyDeath(enemy);

        const p = this.scene.player;
        const gapMult = Math.max(XP_GAP_MIN_MULT, Math.min(XP_GAP_MAX_MULT, 1 + (enemy.level - p.level) * XP_GAP_FACTOR));
        const xp = Math.round(enemy.def.experience_reward * gapMult * (enemy.xpMult || 1));
        this.scene.uiSystem.floatText(pos.x, pos.y + 2.2, pos.z, `+${xp} XP`, 'xp');
        this.gainXp(xp);
    }

    gainXp(amount: number): void {
        const p = this.scene.player;
        const c = this.scene.classDef;
        if (p.level >= c.max_level) return;
        p.experience += amount;

        let leveled = false;
        const unlockedSkillIds: number[] = [];
        while (p.level < c.max_level && p.experience >= this.scene.xpRequired(p.level)) {
            p.experience -= this.scene.xpRequired(p.level);
            p.level += 1;
            p.unspent_points += c.attribute_points_per_level;
            p.skill_points += c.skill_points_per_level;
            leveled = true;
            unlockedSkillIds.push(...this.scene.skillSystem.checkUnlocks(p.level));
        }

        if (leveled) {
            this.scene.recomputeDerivedStats();
            p.current_health = this.scene.derived.maxHealth;
            p.current_mana = this.scene.derived.maxMana;
            this.scene.vfxSystem.levelUpBurst();
            this.scene.audioSystem.playLevelUp();
            this.scene.uiSystem.showLevelUpModal(unlockedSkillIds);
            this.scene.uiSystem.toast(`Level ${p.level} alcancado!`);
            this.scene.persistState(true);
            console.debug(`[Fabulus] Level up: ${p.level}`);
        }
    }

    damagePlayer(dmgMin: number, dmgMax: number, _enemyLevel: number): void {
        if (this.scene.playerDead) return;
        const p = this.scene.player;
        const d = this.scene.derived;
        const raw = dmgMin + Math.random() * (dmgMax - dmgMin);
        const final = Math.max(1, Math.round(raw * (1 - d.damageReductionPct / 100)));

        p.current_health -= final;
        this.scene.vfxSystem.hitFlash(this.scene.playerMeshes);
        this.scene.cameraSystem.shake(0.06);
        this.scene.audioSystem.playPlayerHurt();

        const root = this.scene.playerRoot;
        if (root) {
            this.scene.uiSystem.floatText(root.position.x, root.position.y + 2.0, root.position.z, `-${final}`, 'taken');
        }

        if (p.current_health <= 0) {
            p.current_health = 0;
            this.scene.playerSystem.die();
        }
    }

    private _distToEnemy(enemy: EnemyInstance): number {
        const root = this.scene.playerRoot;
        if (!root || !enemy.root) return Infinity;
        return Math.hypot(enemy.root.position.x - root.position.x, enemy.root.position.z - root.position.z);
    }
}
