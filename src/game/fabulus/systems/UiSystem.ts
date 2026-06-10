import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import type { ClassDef, EnemyInstance, ItemDef, PlayerItem } from '../types/index.js';
import { ATTRIBUTE_LABEL, ATTRIBUTE_TYPE, ENEMY_STATE, ITEM_TYPE, ITEM_TYPE_LABEL, SKILL_TYPE, VALUE_TYPE } from '../types/index.js';
import { CLASS_STORAGE_KEY, FLOAT_TEXT_DURATION_MS, LEVELUP_MODAL_AUTOCLOSE_MS, MAX_BAR_SLOTS, MAX_INVENTORY, TOAST_DURATION_MS } from '../constants/index.js';
import {
    CHARACTER_ICON_SVG, GEAR_ICON_SVG, INVENTORY_ICON_SVG, MOUNT_ICON_SVG, POTION_ICON_SVG,
    SKILLS_ICON_SVG, itemIconSvg, skillIconSvg,
} from '../constants/uiIcons.js';
import { FabulusApi } from '../api/FabulusApi.js';
import { FabulusPrefs } from '../FabulusPrefs.js';
import { AudioCore } from '../../AudioCore.js';

const SLOT_CAST_FLASH_MS = 220;
const SKILL_TYPE_LABEL: Record<number, string> = {
    1: 'Melee',
    2: 'Projectile',
    3: 'Area',
    4: 'Buff',
    5: 'Heal',
};
const PAPERDOLL_LEFT: { type: number; label: string }[] = [
    { type: ITEM_TYPE.HELMET, label: 'Helm' },
    { type: ITEM_TYPE.CHEST, label: 'Chest' },
    { type: ITEM_TYPE.BOOTS, label: 'Boots' },
    { type: ITEM_TYPE.OFFHAND, label: 'Offhand' },
];
const PAPERDOLL_RIGHT: { type: number; label: string }[] = [
    { type: ITEM_TYPE.WEAPON, label: 'Weapon' },
    { type: ITEM_TYPE.AMULET, label: 'Amulet' },
    { type: ITEM_TYPE.RING, label: 'Ring' },
    { type: ITEM_TYPE.RING, label: 'Ring 2' },
];
const MAX_RINGS = 2;

interface FloatEntry {
    el: HTMLElement;
    x: number;
    y: number;
    z: number;
    bornAt: number;
}

export class UiSystem {
    private scene: FabulusScene;
    private floats: FloatEntry[] = [];
    private floatPool: HTMLElement[] = [];
    private activeTab: 'character' | 'skills' = 'character';
    private panelOpen = false;
    private levelUpCloseTimer: number | undefined;
    private deathTimerInterval: number | undefined;
    private hudCache: Record<string, string> = {};

    private _setText(el: HTMLElement | null, key: string, value: string): void {
        if (!el || this.hudCache[key] === value) return;
        this.hudCache[key] = value;
        el.textContent = value;
    }

    private _setStyle(el: HTMLElement | null, key: string, prop: 'height' | 'width', value: string): void {
        if (!el || this.hudCache[key] === value) return;
        this.hudCache[key] = value;
        el.style[prop] = value;
    }

    constructor(scene: FabulusScene) {
        this.scene = scene;
    }

    private $(id: string): HTMLElement | null {
        return document.getElementById(id);
    }

    setLoadingStatus(message: string): void {
        const el = this.$('loading-status');
        if (el) el.textContent = message;
    }

    showLoadingError(message: string): void {
        const el = this.$('loading-status');
        if (el) {
            el.textContent = message;
            el.classList.add('error');
        }
    }

    init(): void {
        this._buildSlotRow();
        this._wireBasicAttack();
        this._wirePanel();
        this._wireSettings();
        this._fillStaticIcons();
        this.refreshPanels();
        console.debug('[Fabulus] UI ready');
    }

    private _fillStaticIcons(): void {
        const potion = this.$('utility-potion');
        if (potion) potion.innerHTML = POTION_ICON_SVG;
        const mount = this.$('utility-mount');
        if (mount) mount.innerHTML = MOUNT_ICON_SVG;
        const gear = this.$('btn-settings');
        if (gear) gear.innerHTML = GEAR_ICON_SVG;
        const hudIcon = (id: string, icon: string, key: string) => {
            const btn = this.$(id);
            if (btn) btn.innerHTML = `${icon}<span class="hud-btn-key">${key}</span>`;
        };
        hudIcon('btn-character', CHARACTER_ICON_SVG, 'C');
        hudIcon('btn-inventory', INVENTORY_ICON_SVG, 'I');
        hudIcon('btn-skills', SKILLS_ICON_SVG, 'K');
    }

    private _wireSettings(): void {
        const prefs = FabulusPrefs.get();
        AudioCore.setVolumes({ master: prefs.masterVolume, sfx: prefs.sfxVolume });

        const popover = this.$('settings-popover');
        this.$('btn-settings')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            popover?.classList.toggle('hidden');
        });
        document.addEventListener('pointerdown', (ev) => {
            if (!popover || popover.classList.contains('hidden')) return;
            const target = ev.target as Node;
            if (popover.contains(target) || this.$('btn-settings')?.contains(target)) return;
            popover.classList.add('hidden');
        });

        const master = this.$('setting-master') as HTMLInputElement | null;
        if (master) {
            master.value = String(Math.round(prefs.masterVolume * 100));
            master.addEventListener('input', () => {
                const v = Number(master.value) / 100;
                FabulusPrefs.set({ masterVolume: v });
                AudioCore.setVolumes({ master: v });
            });
        }
        const sfx = this.$('setting-sfx') as HTMLInputElement | null;
        if (sfx) {
            sfx.value = String(Math.round(prefs.sfxVolume * 100));
            sfx.addEventListener('input', () => {
                const v = Number(sfx.value) / 100;
                FabulusPrefs.set({ sfxVolume: v });
                AudioCore.setVolumes({ sfx: v });
                this.scene.audioSystem.playUiClick();
            });
        }
        const run = this.$('setting-run') as HTMLInputElement | null;
        if (run) {
            run.checked = prefs.runByDefault;
            run.addEventListener('change', () => {
                FabulusPrefs.set({ runByDefault: run.checked });
                this.scene.audioSystem.playUiClick();
            });
        }
        this.$('setting-class')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            localStorage.removeItem(CLASS_STORAGE_KEY);
            window.location.reload();
        });
    }

    showClassSelect(classes: ClassDef[], currentClassId: number): Promise<number> {
        const mainStatLabel: Record<number, string> = {
            1: 'Forca', 2: 'Destreza', 3: 'Inteligencia', 4: 'Vitalidade',
        };
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.id = 'class-select';

            const title = document.createElement('h2');
            title.textContent = 'Escolha sua classe';
            overlay.appendChild(title);

            const cards = document.createElement('div');
            cards.className = 'class-cards';
            for (const c of classes) {
                const card = document.createElement('div');
                card.className = 'class-card d4-panel';
                if (c.id === currentClassId) card.classList.add('current');

                const name = document.createElement('h3');
                name.textContent = c.name;
                card.appendChild(name);

                const desc = document.createElement('p');
                desc.textContent = c.description;
                card.appendChild(desc);

                const stat = document.createElement('div');
                stat.className = 'class-stat';
                stat.innerHTML = `Atributo principal: <b>${mainStatLabel[c.main_stat] ?? '?'}</b><br>`
                    + `Vida ${c.base_health} &middot; Mana ${c.base_mana}`;
                card.appendChild(stat);

                card.addEventListener('click', () => {
                    this.scene.audioSystem.playUiClick();
                    overlay.remove();
                    resolve(c.id);
                });
                cards.appendChild(card);
            }
            overlay.appendChild(cards);
            document.body.appendChild(overlay);
        });
    }

    openInventory(): void {
        this.openPanel('character');
        this.$('inventory-grid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    private _wireBasicAttack(): void {
        this.$('basic-attack-slot')?.addEventListener('click', () => {
            if (this.scene.playerDead) return;
            this.scene.audioSystem.playUiClick();
            this._attackNearestEnemy();
        });
    }

    private _attackNearestEnemy(): void {
        let best: EnemyInstance | null = null;
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

    private _wirePanel(): void {
        const tabs = document.querySelectorAll<HTMLElement>('#panel-tabs .panel-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const name = tab.dataset.tab as 'character' | 'skills';
                this.scene.audioSystem.playUiClick();
                this.openPanel(name);
            });
        });
        this.$('panel-close')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            this.closeAll();
        });
        this.$('btn-character')?.addEventListener('click', () => this.togglePanel('character'));
        this.$('btn-inventory')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            this.openInventory();
        });
        this.$('btn-skills')?.addEventListener('click', () => this.togglePanel('skills'));
        this.$('levelup-close')?.addEventListener('click', () => this._hideLevelUpModal());
        this.$('levelup-open-character')?.addEventListener('click', () => {
            this._hideLevelUpModal();
            this.openPanel('character');
        });
    }

    private _buildSlotRow(): void {
        const row = this.$('slot-row');
        if (!row) return;
        row.innerHTML = '';
        for (let slot = 1; slot <= MAX_BAR_SLOTS; slot++) {
            const cell = document.createElement('div');
            cell.className = 'skill-slot';
            cell.id = `skill-slot-${slot}`;
            cell.innerHTML = `
                <div class="slot-icon" id="slot-icon-${slot}"></div>
                <div class="slot-cd" id="slot-cd-${slot}"></div>
                <span class="slot-rank" id="slot-rank-${slot}"></span>
                <span class="slot-key">${slot}</span>`;
            cell.addEventListener('click', () => this.scene.skillSystem.tryCastSlot(slot));
            row.appendChild(cell);
        }
    }

    togglePanel(tab: 'character' | 'skills'): void {
        if (this.panelOpen && this.activeTab === tab) {
            this.closeAll();
        } else {
            this.openPanel(tab);
        }
    }

    openPanel(tab: 'character' | 'skills'): void {
        this.activeTab = tab;
        this.panelOpen = true;
        this.$('game-panel')?.classList.remove('hidden');
        this.$('tab-character')?.classList.toggle('hidden', tab !== 'character');
        this.$('tab-skills')?.classList.toggle('hidden', tab !== 'skills');
        document.querySelectorAll<HTMLElement>('#panel-tabs .panel-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        this.refreshPanels();
    }

    closeAll(): void {
        this.closePanel();
        this._hideLevelUpModal();
    }

    closePanel(): void {
        this.panelOpen = false;
        this.$('game-panel')?.classList.add('hidden');
    }

    handleEscape(): void {
        const modal = this.$('levelup-modal');
        if (modal && !modal.classList.contains('hidden')) {
            this._hideLevelUpModal();
            return;
        }
        const settings = this.$('settings-popover');
        if (settings && !settings.classList.contains('hidden')) {
            settings.classList.add('hidden');
            return;
        }
        this.closePanel();
    }

    refreshPanels(): void {
        if (!this.panelOpen) return;
        if (this.activeTab === 'character') this._renderCharacterTab();
        else this._renderSkillsTab();
    }

    // ── Character tab ────────────────────────────────────────────────────────

    private _renderCharacterTab(): void {
        const p = this.scene.player;
        const d = this.scene.derived;
        const c = this.scene.classDef;

        const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
        const ribbon = this.$('ribbon-level');
        if (ribbon) ribbon.textContent = String(p.level);
        const nameEl = this.$('char-name');
        if (nameEl) nameEl.textContent = p.name;
        const classEl = this.$('char-class-level');
        if (classEl) classEl.textContent = c.name;

        const summary = this.$('stat-summary');
        if (summary) {
            summary.innerHTML = `
                <div class="summary-stat"><span class="big">${fmt(d.dps)}</span><span class="lbl">Attack</span></div>
                <div class="summary-stat"><span class="big">${fmt(d.armor)}</span><span class="lbl">Defense</span></div>
                <div class="summary-stat"><span class="big">${fmt(d.maxHealth)}</span><span class="lbl">Life</span></div>`;
        }

        const attrList = this.$('attr-list');
        if (attrList) {
            attrList.innerHTML = '<div class="section-head">Attributes</div>';
            const rows: { attr: number; label: string; base: number; eff: number }[] = [
                { attr: ATTRIBUTE_TYPE.STRENGTH, label: 'Strength', base: p.strength, eff: d.strength },
                { attr: ATTRIBUTE_TYPE.DEXTERITY, label: 'Dexterity', base: p.dexterity, eff: d.dexterity },
                { attr: ATTRIBUTE_TYPE.INTELLIGENCE, label: 'Intelligence', base: p.intelligence, eff: d.intelligence },
                { attr: ATTRIBUTE_TYPE.VITALITY, label: 'Vitality', base: p.vitality, eff: d.vitality },
            ];
            for (const row of rows) {
                const div = document.createElement('div');
                div.className = 'stat-row';
                const bonus = row.eff - row.base;
                const isMain = this.scene.classDef.main_stat === row.attr;
                div.innerHTML = `
                    <span class="stat-name${isMain ? ' main-stat' : ''}">${row.label}</span>
                    <span class="stat-value">${row.eff}${bonus !== 0 ? ` <em>(${row.base}${bonus > 0 ? '+' + bonus : bonus})</em>` : ''}</span>`;
                if (p.unspent_points > 0) {
                    const btn = document.createElement('button');
                    btn.className = 'attr-plus';
                    btn.textContent = '+';
                    btn.addEventListener('click', () => this._spendPoint(row.attr));
                    div.appendChild(btn);
                }
                attrList.appendChild(div);
            }
            const pts = document.createElement('div');
            pts.className = 'points-banner' + (p.unspent_points > 0 ? ' has-points' : '');
            pts.textContent = p.unspent_points > 0 ? `${p.unspent_points} pontos disponiveis` : 'Nenhum ponto disponivel';
            attrList.appendChild(pts);
        }

        const goldEl = this.$('char-gold');
        if (goldEl) goldEl.textContent = p.gold.toLocaleString('en-US');
        const xpReq = this.scene.xpRequired(p.level);
        const xpFillEl = this.$('char-xp-fill');
        if (xpFillEl) xpFillEl.style.width = `${Math.min(100, (p.experience / Math.max(1, xpReq)) * 100)}%`;
        const xpTextEl = this.$('char-xp-text');
        if (xpTextEl) xpTextEl.textContent = `XP ${Math.floor(p.experience).toLocaleString('en-US')} / ${xpReq.toLocaleString('en-US')}`;

        const tech = this.$('tech-stats');
        if (tech) {
            const mainStatBonusPct = Math.round((d.mainStatMult - 1) * 100);
            tech.innerHTML = `<div class="section-head">Details</div>
                <div class="tech-row"><span>Damage</span><span>${d.weaponDamageMin}-${d.weaponDamageMax}</span></div>
                <div class="tech-row"><span>DPS</span><span>${fmt(d.dps)}</span></div>
                <div class="tech-row"><span>Main Stat Bonus</span><span>+${mainStatBonusPct}%</span></div>
                <div class="tech-row"><span>Max Life</span><span>${fmt(d.maxHealth)}</span></div>
                <div class="tech-row"><span>Max Mana</span><span>${fmt(d.maxMana)}</span></div>
                <div class="tech-row"><span>Attacks/s</span><span>${d.attackSpeed.toFixed(2)}</span></div>
                <div class="tech-row"><span>Crit Chance</span><span>${d.critChancePct.toFixed(1)}%</span></div>
                <div class="tech-row"><span>Crit Damage</span><span>${Math.round(d.critDamageMult * 100)}%</span></div>
                <div class="tech-row"><span>Armor</span><span>${d.armor}</span></div>
                <div class="tech-row"><span>Reduction</span><span>${d.damageReductionPct.toFixed(1)}%</span></div>
                <div class="tech-row"><span>Life Regen</span><span>${d.hpRegen.toFixed(1)}/s</span></div>
                <div class="tech-row"><span>Mana Regen</span><span>${d.manaRegen.toFixed(1)}/s</span></div>
                <div class="tech-row"><span>Move Speed</span><span>${Math.round(d.moveSpeedMult * 100)}%</span></div>`;
        }

        this._renderPaperDoll();
        this._renderInventory();
    }

    private async _spendPoint(attr: number): Promise<void> {
        const p = this.scene.player;
        if (p.unspent_points <= 0) return;
        if (attr === ATTRIBUTE_TYPE.STRENGTH) p.strength += 1;
        else if (attr === ATTRIBUTE_TYPE.DEXTERITY) p.dexterity += 1;
        else if (attr === ATTRIBUTE_TYPE.INTELLIGENCE) p.intelligence += 1;
        else if (attr === ATTRIBUTE_TYPE.VITALITY) p.vitality += 1;
        else return;
        p.unspent_points -= 1;
        this.scene.audioSystem.playUiClick();
        FabulusApi.spendAttributePoint(attr).catch(err => console.warn('[Fabulus] spendAttributePoint failed:', err));
        this.scene.recomputeDerivedStats();
        this.refreshPanels();
    }

    private _itemTooltip(def: ItemDef): string {
        const rarity = this.scene.getRarity(def.rarity_id);
        const lines: string[] = [`${def.name} (${rarity ? rarity.name : ''} ${ITEM_TYPE_LABEL[def.item_type] ?? ''})`];
        if (def.damage_min != null) lines.push(`Damage: ${def.damage_min}-${def.damage_max}`);
        if (def.attack_speed != null) lines.push(`Attack Speed: ${def.attack_speed}`);
        if (def.armor != null) lines.push(`Armor: ${def.armor}`);
        for (const m of def.modifiers) {
            const label = ATTRIBUTE_LABEL[m.attribute_type] ?? `Attr ${m.attribute_type}`;
            lines.push(`+${m.value}${m.value_type === VALUE_TYPE.PERCENT ? '%' : ''} ${label}`);
        }
        lines.push(def.description);
        return lines.join('\n');
    }

    private _renderPaperDoll(): void {
        const left = this.$('doll-left');
        const right = this.$('doll-right');
        if (!left || !right) return;
        left.innerHTML = '';
        right.innerHTML = '';
        const equipped = this.scene.getEquippedItems();
        const usedByType = new Map<number, number>();
        const buildSlot = (slotDef: { type: number; label: string }, parent: HTMLElement) => {
            const cell = document.createElement('div');
            cell.className = 'doll-slot';
            cell.dataset.itemType = String(slotDef.type);
            const typeIndex = usedByType.get(slotDef.type) ?? 0;
            usedByType.set(slotDef.type, typeIndex + 1);
            const entries = equipped.filter(e => e.def.item_type === slotDef.type);
            const entry = entries[typeIndex];
            if (entry) {
                const rarity = this.scene.getRarity(entry.def.rarity_id);
                cell.classList.add('filled');
                cell.style.borderColor = rarity ? rarity.color_hex : '';
                cell.innerHTML = `<span class="doll-item" style="color:${rarity ? rarity.color_hex : 'inherit'}">${itemIconSvg(entry.def.item_type)}</span><span class="doll-slot-label">${entry.def.name}</span>`;
                cell.title = this._itemTooltip(entry.def) + '\n\nClique para desequipar';
                cell.addEventListener('click', () => this._unequip(entry.playerItem));
            } else {
                cell.innerHTML = `<span class="doll-empty">${slotDef.label}</span>`;
            }
            parent.appendChild(cell);
        };
        for (const slotDef of PAPERDOLL_LEFT) buildSlot(slotDef, left);
        for (const slotDef of PAPERDOLL_RIGHT) buildSlot(slotDef, right);
    }

    private _setEquipHint(itemType: number, on: boolean): void {
        document.querySelectorAll<HTMLElement>(`.doll-slot[data-item-type="${itemType}"]`).forEach(slot => {
            slot.classList.toggle('equip-hint', on);
        });
    }

    private _renderInventory(): void {
        const grid = this.$('inventory-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const bagItems = this.scene.playerItems.filter(pi => !pi.is_equipped);
        for (let i = 0; i < MAX_INVENTORY; i++) {
            const cell = document.createElement('div');
            cell.className = 'inv-cell';
            const pi = bagItems[i];
            if (pi) {
                const def = this.scene.getItemDef(pi.item_id);
                if (def) {
                    const rarity = this.scene.getRarity(def.rarity_id);
                    cell.classList.add('filled');
                    cell.style.borderColor = rarity ? rarity.color_hex : '';
                    cell.innerHTML = `<span style="color:${rarity ? rarity.color_hex : 'inherit'}">${itemIconSvg(def.item_type)}</span>`;
                    cell.title = this._itemTooltip(def) + '\n\nClique para equipar';
                    cell.addEventListener('click', () => this._equip(pi, def));
                    cell.addEventListener('mouseenter', () => this._setEquipHint(def.item_type, true));
                    cell.addEventListener('mouseleave', () => this._setEquipHint(def.item_type, false));
                }
            }
            grid.appendChild(cell);
        }
    }

    private async _equip(pi: PlayerItem, def: ItemDef): Promise<void> {
        if (def.required_level > this.scene.player.level) {
            this.toast(`Requer level ${def.required_level}`);
            return;
        }
        const sameType = this.scene.getEquippedItems().filter(e => e.def.item_type === def.item_type);
        const maxSlots = def.item_type === ITEM_TYPE.RING ? MAX_RINGS : 1;
        if (sameType.length >= maxSlots) {
            const evicted = sameType[0];
            evicted.playerItem.is_equipped = 0;
            evicted.playerItem.slot = null;
            FabulusApi.equipItem(evicted.playerItem.id, false, null).catch(err => console.warn('[Fabulus] unequip failed:', err));
        }
        pi.is_equipped = 1;
        pi.slot = def.item_type;
        FabulusApi.equipItem(pi.id, true, def.item_type).catch(err => console.warn('[Fabulus] equip failed:', err));
        this.scene.audioSystem.playUiClick();
        this._afterEquipChange(def.item_type === ITEM_TYPE.WEAPON);
    }

    private async _unequip(pi: PlayerItem): Promise<void> {
        const def = this.scene.getItemDef(pi.item_id);
        pi.is_equipped = 0;
        pi.slot = null;
        FabulusApi.equipItem(pi.id, false, null).catch(err => console.warn('[Fabulus] unequip failed:', err));
        this.scene.audioSystem.playUiClick();
        this._afterEquipChange(def ? def.item_type === ITEM_TYPE.WEAPON : false);
    }

    private _afterEquipChange(weaponChanged: boolean): void {
        this.scene.recomputeDerivedStats();
        const p = this.scene.player;
        const d = this.scene.derived;
        p.current_health = Math.min(p.current_health, d.maxHealth);
        p.current_mana = Math.min(p.current_mana, d.maxMana);
        if (weaponChanged) this.scene.weaponSystem.refresh();
        this.refreshPanels();
    }

    // ── Skills tab ───────────────────────────────────────────────────────────

    private _renderSkillsTab(): void {
        const p = this.scene.player;
        const banner = this.$('skill-points-banner');
        if (banner) {
            banner.textContent = p.skill_points > 0
                ? `${p.skill_points} pontos de habilidade disponiveis`
                : 'Nenhum ponto de habilidade disponivel';
            banner.classList.toggle('has-points', p.skill_points > 0);
        }

        const list = this.$('skill-list');
        if (!list) return;
        list.innerHTML = '';
        const sorted = [...this.scene.skillsCatalog].sort((a, b) => a.unlock_level - b.unlock_level);
        for (const def of sorted) {
            const ps = this.scene.playerSkills.find(s => s.skill_id === def.id);
            const unlocked = !!ps;
            const card = document.createElement('div');
            card.className = 'skill-card' + (unlocked ? '' : ' locked');

            const coeff = this.scene.skillSystem.effectiveCoeff(def, ps ? ps.rank : 1);
            const dmgLine = def.skill_type === SKILL_TYPE.BUFF
                ? def.effects.map(e => `+${e.value}${e.value_type === VALUE_TYPE.PERCENT ? '%' : ''} ${ATTRIBUTE_LABEL[e.attribute_type]}`).join(', ')
                : def.skill_type === SKILL_TYPE.HEAL
                    ? `Cura ${coeff}% da vida maxima`
                    : `${coeff}% de dano da arma`;

            card.innerHTML = `
                <div class="skill-icon">${skillIconSvg(def.icon_key)}</div>
                <div class="skill-info">
                    <div class="skill-head">
                        <span class="skill-name">${def.name}</span>
                        <span class="skill-meta">${SKILL_TYPE_LABEL[def.skill_type] ?? ''} · ${def.mana_cost} mana · ${(def.cooldown_ms / 1000).toFixed(1)}s</span>
                    </div>
                    <div class="skill-desc">${def.description}</div>
                    <div class="skill-numbers">${dmgLine}</div>
                    <div class="skill-footer"></div>
                </div>`;

            const footer = card.querySelector('.skill-footer') as HTMLElement;
            if (!unlocked) {
                footer.innerHTML = `<span class="skill-lock">Desbloqueia no level ${def.unlock_level}</span>`;
            } else {
                const rankSpan = document.createElement('span');
                rankSpan.className = 'skill-rank';
                rankSpan.textContent = `Rank ${ps!.rank}/${def.max_rank}`;
                footer.appendChild(rankSpan);

                if (ps!.bar_slot != null) {
                    const activeBadge = document.createElement('span');
                    activeBadge.className = 'skill-active-badge';
                    activeBadge.textContent = `Active — slot ${ps!.bar_slot}`;
                    footer.appendChild(activeBadge);
                }

                if (ps!.rank < def.max_rank) {
                    const up = document.createElement('button');
                    up.className = 'skill-up';
                    up.textContent = 'Upgrade';
                    up.disabled = p.skill_points <= 0;
                    up.addEventListener('click', async () => {
                        const ok = await this.scene.skillSystem.rankUp(def.id);
                        if (ok) {
                            this.scene.audioSystem.playUiClick();
                            this.refreshPanels();
                        }
                    });
                    footer.appendChild(up);
                }

                const slots = document.createElement('span');
                slots.className = 'skill-assign';
                for (let slot = 1; slot <= MAX_BAR_SLOTS; slot++) {
                    const b = document.createElement('button');
                    b.className = 'assign-btn' + (ps!.bar_slot === slot ? ' active' : '');
                    b.textContent = String(slot);
                    b.title = `Atribuir ao slot ${slot}`;
                    b.addEventListener('click', async () => {
                        await this.scene.skillSystem.assignSlot(def.id, ps!.bar_slot === slot ? null : slot);
                        this.scene.audioSystem.playUiClick();
                        this.refreshPanels();
                    });
                    slots.appendChild(b);
                }
                footer.appendChild(slots);
            }
            list.appendChild(card);
        }
    }

    // ── HUD ──────────────────────────────────────────────────────────────────

    setCastingSlot(skillId: number): void {
        const ps = this.scene.playerSkills.find(s => s.skill_id === skillId);
        if (!ps || ps.bar_slot == null) return;
        const cell = this.$(`skill-slot-${ps.bar_slot}`);
        if (!cell) return;
        cell.classList.add('casting');
        setTimeout(() => cell.classList.remove('casting'), SLOT_CAST_FLASH_MS);
    }

    private _refreshHud(): void {
        const p = this.scene.player;
        const d = this.scene.derived;

        const hpPct = Math.max(0, Math.min(1, p.current_health / Math.max(1, d.maxHealth)));
        const manaPct = Math.max(0, Math.min(1, p.current_mana / Math.max(1, d.maxMana)));
        this._setStyle(this.$('hp-orb-fill'), 'hpFill', 'height', `${(hpPct * 100).toFixed(1)}%`);
        this._setStyle(this.$('mana-orb-fill'), 'manaFill', 'height', `${(manaPct * 100).toFixed(1)}%`);
        this._setText(this.$('hp-orb-text'), 'hpText', `${Math.round(p.current_health)}`);
        this._setText(this.$('mana-orb-text'), 'manaText', `${Math.round(p.current_mana)}`);

        this._setText(this.$('level-badge'), 'level', String(p.level));
        const req = this.scene.xpRequired(p.level);
        this._setStyle(this.$('xp-fill'), 'xpFill', 'width', `${Math.min(100, (p.experience / Math.max(1, req)) * 100).toFixed(1)}%`);
        this._setText(this.$('gold-counter'), 'gold', p.gold.toLocaleString('en-US'));
        this._setText(this.$('xp-text'), 'xpText', `${Math.floor(p.experience).toLocaleString('en-US')} / ${req.toLocaleString('en-US')}`);

        const now = this.scene.now();
        for (let slot = 1; slot <= MAX_BAR_SLOTS; slot++) {
            const ps = this.scene.playerSkills.find(s => s.bar_slot === slot);
            const icon = this.$(`slot-icon-${slot}`);
            const cd = this.$(`slot-cd-${slot}`);
            const rankBadge = this.$(`slot-rank-${slot}`);
            if (!icon || !cd) continue;
            if (!ps) {
                if (icon.dataset.iconKey) {
                    icon.innerHTML = '';
                    delete icon.dataset.iconKey;
                }
                if (rankBadge) rankBadge.textContent = '';
                cd.style.opacity = '0';
                continue;
            }
            const def = this.scene.getSkillDef(ps.skill_id);
            if (!def) continue;
            if (icon.dataset.iconKey !== def.icon_key) {
                icon.innerHTML = skillIconSvg(def.icon_key);
                icon.dataset.iconKey = def.icon_key;
                icon.title = def.name;
            }
            if (rankBadge && rankBadge.textContent !== String(ps.rank)) {
                rankBadge.textContent = String(ps.rank);
            }
            const remaining = this.scene.skillSystem.getCooldownRemaining(def.id);
            if (remaining > 0) {
                const frac = remaining / def.cooldown_ms;
                cd.style.opacity = '1';
                cd.style.background = `conic-gradient(rgba(0,0,0,0.75) ${frac * 360}deg, transparent 0deg)`;
            } else {
                cd.style.opacity = '0';
            }
            const slotEl = this.$(`skill-slot-${slot}`);
            if (slotEl) slotEl.classList.toggle('no-mana', this.scene.player.current_mana < def.mana_cost);
        }

        const buffRow = this.$('buff-row');
        if (buffRow) {
            const html = this.scene.activeBuffs.map(b => {
                const remaining = Math.max(0, Math.ceil((b.expiresAt - now) / 1000));
                return `<span class="buff-chip" title="${b.name}">${b.name.split(' ').map(w => w[0]).join('')}<em>${remaining}s</em></span>`;
            }).join('');
            if (buffRow.innerHTML !== html) buffRow.innerHTML = html;
        }

        this._refreshTargetFrame();
    }

    private _refreshTargetFrame(): void {
        const frame = this.$('target-frame');
        if (!frame) return;
        const target = this.scene.attackTarget;
        if (!target || target.state === ENEMY_STATE.DEAD) {
            frame.classList.add('hidden');
            return;
        }
        frame.classList.remove('hidden');
        const name = this.$('target-name');
        if (name) name.textContent = `${target.def.name}  ·  Lv ${target.level}`;
        const fill = this.$('target-hp-fill');
        if (fill) fill.style.width = `${Math.max(0, (target.hp / target.maxHp) * 100)}%`;
    }

    // ── Floating text ────────────────────────────────────────────────────────

    floatText(x: number, y: number, z: number, text: string, kind: string): void {
        const layer = this.$('float-layer');
        if (!layer) return;
        let el = this.floatPool.pop();
        if (!el) {
            el = document.createElement('span');
            layer.appendChild(el);
        }
        el.className = `float-text ${kind}`;
        el.textContent = text;
        el.style.display = '';
        el.style.opacity = '1';
        this.floats.push({ el, x, y, z, bornAt: this.scene.now() });
    }

    private _updateFloats(): void {
        if (!this.floats.length) return;
        const s = this.scene.bScene;
        const engine = s.getEngine();
        const camera = s.activeCamera;
        const canvas = engine.getRenderingCanvas();
        if (!camera || !canvas) return;
        const rw = engine.getRenderWidth();
        const rh = engine.getRenderHeight();
        const now = this.scene.now();

        for (let i = this.floats.length - 1; i >= 0; i--) {
            const f = this.floats[i];
            const age = now - f.bornAt;
            if (age > FLOAT_TEXT_DURATION_MS) {
                f.el.style.display = 'none';
                this.floatPool.push(f.el);
                this.floats.splice(i, 1);
                continue;
            }
            const t = age / FLOAT_TEXT_DURATION_MS;
            const projected = BABYLON.Vector3.Project(
                new BABYLON.Vector3(f.x, f.y, f.z),
                BABYLON.Matrix.Identity(),
                s.getTransformMatrix(),
                camera.viewport.toGlobal(rw, rh),
            );
            const cssX = (projected.x / rw) * canvas.clientWidth;
            const cssY = (projected.y / rh) * canvas.clientHeight - t * 50;
            f.el.style.transform = `translate(-50%, -50%) translate(${cssX}px, ${cssY}px)`;
            f.el.style.opacity = String(1 - t * t);
        }
    }

    // ── Toast / modal / death ────────────────────────────────────────────────

    toast(message: string): void {
        const bar = this.$('toast-bar');
        if (!bar) return;
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = message;
        bar.appendChild(el);
        setTimeout(() => {
            el.classList.add('fading');
            setTimeout(() => el.remove(), 400);
        }, TOAST_DURATION_MS);
    }

    showLevelUpModal(unlockedSkillIds: number[]): void {
        const modal = this.$('levelup-modal');
        if (!modal) return;
        const p = this.scene.player;
        const title = this.$('levelup-title');
        if (title) title.textContent = `Level ${p.level}!`;
        const body = this.$('levelup-body');
        if (body) {
            body.innerHTML = '';
            const addLine = (html: string) => {
                const div = document.createElement('div');
                div.className = 'lvl-line';
                div.innerHTML = html;
                body.appendChild(div);
                return div;
            };
            addLine(`+${this.scene.classDef.attribute_points_per_level} pontos de atributo`);
            addLine(`+${this.scene.classDef.skill_points_per_level} ponto de habilidade`);
            for (const id of unlockedSkillIds) {
                const def = this.scene.getSkillDef(id);
                if (!def) continue;
                const line = addLine(`Nova habilidade: ${def.name}`);
                line.classList.add('unlock');
                const ps = this.scene.playerSkills.find(s => s.skill_id === id);
                if (ps && ps.bar_slot == null) {
                    const btn = document.createElement('button');
                    btn.className = 'lvl-assign';
                    btn.type = 'button';
                    btn.textContent = 'Atribuir a barra';
                    btn.addEventListener('click', async () => {
                        const used = new Set(this.scene.playerSkills.map(s => s.bar_slot).filter(s => s != null));
                        let free: number | null = null;
                        for (let slot = 1; slot <= MAX_BAR_SLOTS; slot++) {
                            if (!used.has(slot)) { free = slot; break; }
                        }
                        if (free == null) {
                            this.toast('Barra cheia — gerencie na aba Skills');
                            return;
                        }
                        await this.scene.skillSystem.assignSlot(id, free);
                        this.scene.audioSystem.playUiClick();
                        btn.textContent = `Slot ${free}`;
                        btn.disabled = true;
                    });
                    line.appendChild(btn);
                }
            }
        }
        modal.classList.remove('hidden');
        if (this.levelUpCloseTimer) clearTimeout(this.levelUpCloseTimer);
        this.levelUpCloseTimer = window.setTimeout(() => this._hideLevelUpModal(), LEVELUP_MODAL_AUTOCLOSE_MS);
    }

    private _hideLevelUpModal(): void {
        this.$('levelup-modal')?.classList.add('hidden');
        if (this.levelUpCloseTimer) {
            clearTimeout(this.levelUpCloseTimer);
            this.levelUpCloseTimer = undefined;
        }
    }

    showDeathOverlay(respawnMs: number): void {
        const overlay = this.$('death-overlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        const countdown = this.$('death-countdown');
        const deadline = this.scene.now() + respawnMs;
        const tick = () => {
            const remaining = Math.max(0, Math.ceil((deadline - this.scene.now()) / 1000));
            if (countdown) countdown.textContent = `Renascendo em ${remaining}s...`;
        };
        tick();
        if (this.deathTimerInterval) clearInterval(this.deathTimerInterval);
        this.deathTimerInterval = window.setInterval(tick, 250);
    }

    hideDeathOverlay(): void {
        this.$('death-overlay')?.classList.add('hidden');
        if (this.deathTimerInterval) {
            clearInterval(this.deathTimerInterval);
            this.deathTimerInterval = undefined;
        }
    }

    update(_dt: number): void {
        this._refreshHud();
        this._updateFloats();
    }

    dispose(): void {
        if (this.deathTimerInterval) clearInterval(this.deathTimerInterval);
        if (this.levelUpCloseTimer) clearTimeout(this.levelUpCloseTimer);
    }
}
