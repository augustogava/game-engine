import '@babylonjs/loaders';
import * as BABYLON from '@babylonjs/core';
import { Scene3D } from '../../engine/3d/Scene3D.js';
import { InputManager } from '../../engine/input/InputManager.js';
import { FabulusApi } from './api/FabulusApi.js';
import type {
    Aabb, ActiveBuff, AffixDef, ClassDef, DerivedStats, EnemyDef, EnemyInstance, GroundDrop,
    ItemDef, LootTableEntry, MapPropDef, NpcDef, PlayerItem, PlayerSkill, PlayerState, RarityDef, SkillDef,
} from './types/index.js';
import { AFFIX_TYPE, ATTRIBUTE_TYPE, ITEM_TYPE, VALUE_TYPE } from './types/index.js';
import { FabulusPrefs } from './FabulusPrefs.js';
import {
    ARMOR_K, ARMOR_PER_STR, ARMOR_PER_VIT, ATK_SPEED_PER_DEX, BASE_ATTACK_RANGE,
    BASE_ATTACK_SPEED, BASE_HAND_DMG_MAX, BASE_HAND_DMG_MIN, CLASS_STORAGE_KEY, CRIT_BASE_PCT,
    COMBAT_EXIT_DELAY_MS, CRIT_DMG_BASE, CRIT_DMG_PER_DEX, CRIT_PER_DEX, HEALTH_PER_VIT, HP_REGEN_PER_VIT,
    MAIN_STAT_DMG_PER_POINT, MANA_PER_INT, MANA_REGEN_PER_INT,
    MOVE_SPEED_PER_DEX, SKILL_DMG_PER_INT, STATE_SAVE_THROTTLE_MS, XP_CURVE_BASE, XP_CURVE_EXPONENT,
} from './constants/index.js';
import { CameraSystem } from './systems/CameraSystem.js';
import { LightingSystem } from './systems/LightingSystem.js';
import { MapSystem } from './systems/MapSystem.js';
import { InputSystem } from './systems/InputSystem.js';
import { PlayerSystem } from './systems/PlayerSystem.js';
import { EnemySystem } from './systems/EnemySystem.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { SkillSystem } from './systems/SkillSystem.js';
import { LootSystem } from './systems/LootSystem.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { WeaponSystem } from './systems/WeaponSystem.js';
import { VfxSystem } from './systems/VfxSystem.js';
import { UiSystem } from './systems/UiSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { RenderSystem } from './systems/RenderSystem.js';
import { MinimapSystem } from './systems/MinimapSystem.js';
import { PropSystem } from './systems/PropSystem.js';
import { NpcSystem } from './systems/NpcSystem.js';

export class FabulusScene extends Scene3D {
    bScene!: BABYLON.Scene;
    onReady: (() => void) | null = null;
    ready = false;

    classes: ClassDef[] = [];
    classDef!: ClassDef;
    player!: PlayerState;
    enemyDefs: EnemyDef[] = [];
    itemsCatalog: ItemDef[] = [];
    rarities: RarityDef[] = [];
    skillsCatalog: SkillDef[] = [];
    playerSkills: PlayerSkill[] = [];
    playerItems: PlayerItem[] = [];
    affixesCatalog: AffixDef[] = [];
    lootTables: LootTableEntry[] = [];
    levels: { level: number; experience_required: number }[] = [];
    npcDefs: NpcDef[] = [];
    mapProps: MapPropDef[] = [];
    derived!: DerivedStats;

    playerRoot: BABYLON.TransformNode | null = null;
    playerMeshes: BABYLON.AbstractMesh[] = [];
    playerAnims: Record<string, BABYLON.AnimationGroup | null> = {};
    playerLogicalState = 'idle';
    playerDead = false;

    moveTarget: BABYLON.Vector3 | null = null;
    attackTarget: EnemyInstance | null = null;
    runMode = false;
    lastCombatAt = 0;

    enemies: EnemyInstance[] = [];
    staticColliders: Aabb[] = [];
    groundMesh: BABYLON.Mesh | null = null;
    groundDrops: GroundDrop[] = [];
    activeBuffs: ActiveBuff[] = [];
    skillCooldowns: Map<number, number> = new Map();

    readonly cameraSystem = new CameraSystem(this);
    readonly lightingSystem = new LightingSystem(this);
    readonly mapSystem = new MapSystem(this);
    readonly inputSystem = new InputSystem(this);
    readonly playerSystem = new PlayerSystem(this);
    readonly enemySystem = new EnemySystem(this);
    readonly combatSystem = new CombatSystem(this);
    readonly skillSystem = new SkillSystem(this);
    readonly lootSystem = new LootSystem(this);
    readonly collisionSystem = new CollisionSystem(this);
    readonly weaponSystem = new WeaponSystem(this);
    readonly vfxSystem = new VfxSystem(this);
    readonly uiSystem = new UiSystem(this);
    readonly audioSystem = new AudioSystem(this);
    readonly renderSystem = new RenderSystem(this);
    readonly minimapSystem = new MinimapSystem(this);
    readonly propSystem = new PropSystem(this);
    readonly npcSystem = new NpcSystem(this);

    private _lastStateSaveAt = 0;

    onCreate(scene: BABYLON.Scene, _input: InputManager): void {
        this.bScene = scene;
        scene.clearColor = new BABYLON.Color4(0.02, 0.022, 0.032, 1);
        this._asyncInit().catch(err => {
            console.error('[Fabulus] Scene init failed:', err);
            this.uiSystem.showLoadingError('Falha ao carregar o mundo. Recarregue a pagina.');
        });
    }

    private async _asyncInit(): Promise<void> {
        this.uiSystem.setLoadingStatus('Consultando os arcanos...');
        const [classes, fetchedPlayer, enemyDefs, items, rarities, playerItems, levels, lootTables, affixes, npcDefs, mapProps] = await Promise.all([
            FabulusApi.fetchClasses(),
            FabulusApi.fetchPlayer(),
            FabulusApi.fetchEnemies(),
            FabulusApi.fetchItems(),
            FabulusApi.fetchRarities(),
            FabulusApi.fetchPlayerItems(),
            FabulusApi.fetchLevels(),
            FabulusApi.fetchLootTables(),
            FabulusApi.fetchAffixes(),
            FabulusApi.fetchNpcs(),
            FabulusApi.fetchMapProps(),
        ]);
        await FabulusPrefs.syncFromApi();
        let player = fetchedPlayer;
        let freshPlayerItems = playerItems;

        if (player.class_id && classes.some(c => c.id === player.class_id)) {
            localStorage.setItem(CLASS_STORAGE_KEY, String(player.class_id));
        } else {
            const chosenClassId = await this.uiSystem.showClassSelect(classes, player.class_id);
            localStorage.setItem(CLASS_STORAGE_KEY, String(chosenClassId));
            await FabulusApi.selectClass(chosenClassId);
            [player, freshPlayerItems] = await Promise.all([
                FabulusApi.fetchPlayer(),
                FabulusApi.fetchPlayerItems(),
            ]);
        }

        this.classes = classes;
        this.player = player;
        this.enemyDefs = enemyDefs;
        this.itemsCatalog = items;
        this.rarities = rarities;
        this.playerItems = freshPlayerItems;
        this.levels = levels;
        this.lootTables = lootTables;
        this.affixesCatalog = affixes;
        this.npcDefs = npcDefs;
        this.mapProps = mapProps;

        const classDef = classes.find(c => c.id === player.class_id);
        if (!classDef) throw new Error(`Class ${player.class_id} not found`);
        this.classDef = classDef;

        const [skillsCatalog, playerSkills] = await Promise.all([
            FabulusApi.fetchSkills(classDef.id),
            FabulusApi.fetchPlayerSkills(),
        ]);
        this.skillsCatalog = skillsCatalog;
        this.playerSkills = playerSkills;

        this.recomputeDerivedStats();

        this.uiSystem.setLoadingStatus('Forjando o mundo...');
        this.lightingSystem.init();
        this.cameraSystem.init();
        this.renderSystem.init();
        this.mapSystem.init();
        await this.propSystem.init();
        this.vfxSystem.init();

        this.uiSystem.setLoadingStatus('Invocando o heroi...');
        await this.playerSystem.init();
        this.weaponSystem.init();

        this.uiSystem.setLoadingStatus('Despertando as criaturas...');
        await this.enemySystem.init();
        await this.npcSystem.init();
        await this.lootSystem.init();

        this.inputSystem.init();
        this.uiSystem.init();
        this.audioSystem.init();
        this.skillSystem.init();
        this.minimapSystem.init();

        this.recomputeDerivedStats();
        this.player.current_health = Math.min(this.player.current_health, this.derived.maxHealth);
        this.player.current_mana = Math.min(this.player.current_mana, this.derived.maxMana);

        this.ready = true;
        window.addEventListener('pagehide', this._onPageHide);
        console.debug('[Fabulus] World ready');
        if (this.onReady) this.onReady();
    }

    private _onPageHide = (): void => {
        if (this.ready) this.persistState(true, true);
    };

    update(dt: number): void {
        if (!this.ready) return;
        this.inputSystem.update(dt);
        this.playerSystem.update(dt);
        this.skillSystem.update(dt);
        this.enemySystem.update(dt);
        this.npcSystem.update(dt);
        this.propSystem.update(dt);
        this.combatSystem.update(dt);
        this.lootSystem.update(dt);
        this.collisionSystem.update(dt);
        this.cameraSystem.update(dt);
        this.vfxSystem.update(dt);
        this.uiSystem.update(dt);
        this.minimapSystem.update(dt);
        this._maybePersistState();
    }

    now(): number {
        return performance.now();
    }

    isInCombat(): boolean {
        return this.now() - this.lastCombatAt < COMBAT_EXIT_DELAY_MS;
    }

    get inputManager(): InputManager {
        return this.input;
    }

    getItemDef(itemId: number): ItemDef | null {
        return this.itemsCatalog.find(i => i.id === itemId) ?? null;
    }

    getRarity(rarityId: number): RarityDef | null {
        return this.rarities.find(r => r.id === rarityId) ?? null;
    }

    getSkillDef(skillId: number): SkillDef | null {
        return this.skillsCatalog.find(s => s.id === skillId) ?? null;
    }

    getEquippedItems(): { playerItem: PlayerItem; def: ItemDef }[] {
        const out: { playerItem: PlayerItem; def: ItemDef }[] = [];
        for (const pi of this.playerItems) {
            if (!pi.is_equipped) continue;
            const def = this.getItemDef(pi.item_id);
            if (def) out.push({ playerItem: pi, def });
        }
        return out;
    }

    getEquippedWeapon(): ItemDef | null {
        const equipped = this.getEquippedItems().find(e => e.def.item_type === ITEM_TYPE.WEAPON);
        return equipped ? equipped.def : null;
    }

    /** Composed display name including rolled affixes (e.g. "Sharp Rusty Sword of Haste"). */
    getItemDisplayName(def: ItemDef, playerItem?: PlayerItem | null): string {
        const affixes = playerItem?.affixes;
        if (!affixes || !affixes.length) return def.name;
        const prefix = affixes.find(a => a.affix_type === AFFIX_TYPE.PREFIX);
        const suffix = affixes.find(a => a.affix_type === AFFIX_TYPE.SUFFIX);
        let name = def.name;
        if (prefix) name = `${prefix.name} ${name}`;
        if (suffix) name = `${name} ${suffix.name}`;
        return name;
    }

    xpRequired(level: number): number {
        const row = this.levels.find(l => l.level === level);
        if (row) return row.experience_required;
        return Math.floor(XP_CURVE_BASE * Math.pow(level, XP_CURVE_EXPONENT));
    }

    getMainStatValue(): number {
        const d = this.derived;
        switch (this.classDef.main_stat) {
            case ATTRIBUTE_TYPE.STRENGTH: return d.strength;
            case ATTRIBUTE_TYPE.DEXTERITY: return d.dexterity;
            case ATTRIBUTE_TYPE.INTELLIGENCE: return d.intelligence;
            case ATTRIBUTE_TYPE.VITALITY: return d.vitality;
            default: return d.strength;
        }
    }

    recomputeDerivedStats(): void {
        const p = this.player;
        const c = this.classDef;
        const flat: Record<number, number> = {};
        const pct: Record<number, number> = {};

        const accumulate = (mods: { attribute_type: number; value: number; value_type: number }[]) => {
            for (const m of mods) {
                if (m.value_type === VALUE_TYPE.PERCENT) pct[m.attribute_type] = (pct[m.attribute_type] ?? 0) + m.value;
                else flat[m.attribute_type] = (flat[m.attribute_type] ?? 0) + m.value;
            }
        };

        let itemArmor = 0;
        for (const { playerItem, def } of this.getEquippedItems()) {
            accumulate(def.modifiers);
            if (playerItem.affixes && playerItem.affixes.length) accumulate(playerItem.affixes);
            if (def.armor != null) {
                const rarity = this.getRarity(def.rarity_id);
                itemArmor += def.armor * (rarity ? rarity.stat_multiplier : 1);
            }
        }
        for (const buff of this.activeBuffs) accumulate(buff.effects);

        const flatOf = (attr: number) => flat[attr] ?? 0;
        const pctMult = (attr: number) => 1 + (pct[attr] ?? 0) / 100;

        const strength = Math.round((p.strength + flatOf(ATTRIBUTE_TYPE.STRENGTH)) * pctMult(ATTRIBUTE_TYPE.STRENGTH));
        const dexterity = Math.round((p.dexterity + flatOf(ATTRIBUTE_TYPE.DEXTERITY)) * pctMult(ATTRIBUTE_TYPE.DEXTERITY));
        const intelligence = Math.round((p.intelligence + flatOf(ATTRIBUTE_TYPE.INTELLIGENCE)) * pctMult(ATTRIBUTE_TYPE.INTELLIGENCE));
        const vitality = Math.round((p.vitality + flatOf(ATTRIBUTE_TYPE.VITALITY)) * pctMult(ATTRIBUTE_TYPE.VITALITY));

        const maxHealth = Math.round(
            (c.base_health + (p.level - 1) * c.health_per_level + vitality * HEALTH_PER_VIT + flatOf(ATTRIBUTE_TYPE.MAX_HEALTH))
            * pctMult(ATTRIBUTE_TYPE.MAX_HEALTH),
        );
        const maxMana = Math.round(
            (c.base_mana + (p.level - 1) * c.mana_per_level + intelligence * MANA_PER_INT + flatOf(ATTRIBUTE_TYPE.MAX_MANA))
            * pctMult(ATTRIBUTE_TYPE.MAX_MANA),
        );

        const armor = Math.round(
            (strength * ARMOR_PER_STR + vitality * ARMOR_PER_VIT + itemArmor + flatOf(ATTRIBUTE_TYPE.ARMOR))
            * pctMult(ATTRIBUTE_TYPE.ARMOR),
        );
        const damageReductionPct = (armor / (armor + ARMOR_K)) * 100;

        const weapon = this.getEquippedWeapon();
        const rarityMult = weapon ? (this.getRarity(weapon.rarity_id)?.stat_multiplier ?? 1) : 1;
        const weaponDamageMin = weapon && weapon.damage_min != null ? Math.round(weapon.damage_min * rarityMult) : BASE_HAND_DMG_MIN;
        const weaponDamageMax = weapon && weapon.damage_max != null ? Math.round(weapon.damage_max * rarityMult) : BASE_HAND_DMG_MAX;
        const baseAttackSpeed = weapon && weapon.attack_speed != null ? weapon.attack_speed : BASE_ATTACK_SPEED;
        const attackSpeed = baseAttackSpeed * (1 + dexterity * ATK_SPEED_PER_DEX) * pctMult(ATTRIBUTE_TYPE.ATTACK_SPEED_PCT);

        let mainStat = strength;
        if (c.main_stat === ATTRIBUTE_TYPE.DEXTERITY) mainStat = dexterity;
        else if (c.main_stat === ATTRIBUTE_TYPE.INTELLIGENCE) mainStat = intelligence;
        else if (c.main_stat === ATTRIBUTE_TYPE.VITALITY) mainStat = vitality;
        const mainStatMult = 1 + mainStat * MAIN_STAT_DMG_PER_POINT;
        const additiveMult = pctMult(ATTRIBUTE_TYPE.DAMAGE_PCT);
        const skillDamageMult = 1 + intelligence * SKILL_DMG_PER_INT;

        const critChancePct = Math.min(100, CRIT_BASE_PCT + dexterity * CRIT_PER_DEX + (pct[ATTRIBUTE_TYPE.CRIT_CHANCE_PCT] ?? 0) + flatOf(ATTRIBUTE_TYPE.CRIT_CHANCE_PCT));
        const critDamageMult = CRIT_DMG_BASE + dexterity * CRIT_DMG_PER_DEX + ((pct[ATTRIBUTE_TYPE.CRIT_DAMAGE_PCT] ?? 0) + flatOf(ATTRIBUTE_TYPE.CRIT_DAMAGE_PCT)) / 100;

        const avgWeapon = (weaponDamageMin + weaponDamageMax) / 2;
        const dps = avgWeapon * mainStatMult * additiveMult * attackSpeed * (1 + (critChancePct / 100) * (critDamageMult - 1));

        const moveSpeedMult = (1 + dexterity * MOVE_SPEED_PER_DEX)
            * (1 + (flatOf(ATTRIBUTE_TYPE.MOVE_SPEED_PCT) + (pct[ATTRIBUTE_TYPE.MOVE_SPEED_PCT] ?? 0)) / 100);

        const hpRegen = (c.health_regen + vitality * HP_REGEN_PER_VIT + flatOf(ATTRIBUTE_TYPE.HP_REGEN))
            * pctMult(ATTRIBUTE_TYPE.HP_REGEN);
        const manaRegen = (c.mana_regen + intelligence * MANA_REGEN_PER_INT + flatOf(ATTRIBUTE_TYPE.MANA_REGEN))
            * pctMult(ATTRIBUTE_TYPE.MANA_REGEN);

        this.derived = {
            strength, dexterity, intelligence, vitality,
            maxHealth, maxMana,
            armor, damageReductionPct,
            weaponDamageMin, weaponDamageMax,
            attackSpeed, attackRange: BASE_ATTACK_RANGE,
            dps,
            critChancePct, critDamageMult,
            mainStatMult, additiveMult, skillDamageMult,
            moveSpeedMult,
            hpRegen, manaRegen,
        };
    }

    persistState(force = false, keepalive = false): void {
        const now = this.now();
        if (!force && now - this._lastStateSaveAt < STATE_SAVE_THROTTLE_MS) return;
        this._lastStateSaveAt = now;
        const p = this.player;
        const pos = this.playerRoot ? this.playerRoot.position : null;
        FabulusApi.savePlayerState({
            level: p.level,
            experience: p.experience,
            strength: p.strength,
            dexterity: p.dexterity,
            intelligence: p.intelligence,
            vitality: p.vitality,
            current_health: Math.round(p.current_health),
            current_mana: Math.round(p.current_mana),
            gold: p.gold,
            unspent_points: p.unspent_points,
            skill_points: p.skill_points,
            pos_x: pos ? Number(pos.x.toFixed(2)) : p.pos_x,
            pos_z: pos ? Number(pos.z.toFixed(2)) : p.pos_z,
        }, keepalive).catch(err => console.warn('[Fabulus] persistState failed:', err));
    }

    private _maybePersistState(): void {
        this.persistState(false);
    }

    onDispose(): void {
        window.removeEventListener('pagehide', this._onPageHide);
        if (this.ready) this.persistState(true);
        this.inputSystem.dispose();
        this.uiSystem.dispose();
        this.audioSystem.dispose();
        this.cameraSystem.dispose();
        this.skillSystem.dispose();
        this.vfxSystem.dispose();
        this.weaponSystem.dispose();
        this.enemySystem.dispose();
        this.npcSystem.dispose();
        this.propSystem.dispose();
        this.minimapSystem.dispose();
        this.lootSystem.dispose();
        this.lightingSystem.dispose();
        this.renderSystem.dispose();
    }
}
