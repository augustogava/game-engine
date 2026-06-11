import * as BABYLON from '@babylonjs/core';
import type { FabulusScene } from '../FabulusScene.js';
import type { ClassDef, EnemyInstance, ItemDef, MapPropDef, NpcDef, PlayerItem } from '../types/index.js';
import { ATTRIBUTE_LABEL, ATTRIBUTE_TYPE, ENEMY_STATE, ITEM_TYPE, ITEM_TYPE_LABEL, SKILL_TYPE, VALUE_TYPE } from '../types/index.js';
import { CLASS_STORAGE_KEY, FLOAT_TEXT_DURATION_MS, LEVELUP_MODAL_AUTOCLOSE_MS, MAX_BAR_SLOTS, MAX_INVENTORY, TOAST_DURATION_MS, type PropCatalogEntry } from '../constants/index.js';
import {
    CHARACTER_ICON_SVG, GEAR_ICON_SVG, INVENTORY_ICON_SVG, POTION_ICON_SVG,
    SKILLS_ICON_SVG, itemIconSvg, skillIconSvg,
} from '../constants/uiIcons.js';
import { FabulusApi } from '../api/FabulusApi.js';
import { FabulusPrefs, type FabulusActionId, type FabulusPrefsData, type GfxPreset, type WeatherMode } from '../FabulusPrefs.js';
import { AudioCore } from '../../AudioCore.js';

const SLOT_CAST_FLASH_MS = 220;
const FPS_REFRESH_S = 0.5;
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
const KEYBIND_ACTIONS: { action: FabulusActionId; label: string }[] = [
    { action: 'skill1', label: 'Skill 1' },
    { action: 'skill2', label: 'Skill 2' },
    { action: 'skill3', label: 'Skill 3' },
    { action: 'skill4', label: 'Skill 4' },
    { action: 'character', label: 'Personagem' },
    { action: 'inventory', label: 'Inventario' },
    { action: 'skills', label: 'Habilidades' },
    { action: 'attackNearest', label: 'Atacar proximo' },
    { action: 'potion1', label: 'Pocao de vida' },
    { action: 'potion2', label: 'Pocao de mana' },
    { action: 'minimap', label: 'Minimapa' },
    { action: 'editor', label: 'Editor de mapa' },
];

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
    private leftOpen = false;
    private rightOpen = false;
    private levelUpCloseTimer: number | undefined;
    private deathTimerInterval: number | undefined;
    private hudCache: Record<string, string> = {};
    private potionCooldowns: Map<number, number> = new Map();
    private fpsAccum = 0;
    private activeSettingsTab: 'graphics' | 'game' | 'audio' = 'graphics';
    private keybindListening: FabulusActionId | null = null;
    private dialogueNpc: NpcDef | null = null;
    private _onKeybindCapture: ((e: KeyboardEvent) => void) | null = null;
    private _onPrefsChange = (prefs: FabulusPrefsData): void => {
        this.$('fps-indicator')?.classList.toggle('hidden', !prefs.showFps);
    };

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
        this._wirePanels();
        this._wirePotionSlots();
        this._wireEscMenu();
        this._wireSettingsPanel();
        this._fillStaticIcons();
        this._applyAudioPrefs();
        FabulusPrefs.onChange(this._onPrefsChange);
        this.$('fps-indicator')?.classList.toggle('hidden', !FabulusPrefs.get().showFps);
        this.refreshPanels();
        console.debug('[Fabulus] UI ready');
    }

    private _applyAudioPrefs(): void {
        const prefs = FabulusPrefs.get();
        AudioCore.setVolumes({
            master: prefs.muted ? 0 : prefs.masterVolume,
            sfx: prefs.sfxVolume,
        });
    }

    private _fillStaticIcons(): void {
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

    // ── Icon helpers (icon_path com fallback para SVG procedural) ───────────

    private _iconNode(iconPath: string | null | undefined, fallbackSvg: string, colorHex?: string): HTMLElement {
        const wrap = document.createElement('span');
        wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;';
        if (colorHex) wrap.style.color = colorHex;
        if (iconPath) {
            const img = document.createElement('img');
            img.src = iconPath;
            img.alt = '';
            img.draggable = false;
            img.addEventListener('error', () => {
                wrap.innerHTML = fallbackSvg;
            });
            wrap.appendChild(img);
        } else {
            wrap.innerHTML = fallbackSvg;
        }
        return wrap;
    }

    // ── Class select ─────────────────────────────────────────────────────────

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

                if (c.icon_path) {
                    const portrait = document.createElement('img');
                    portrait.src = c.icon_path;
                    portrait.alt = c.name;
                    portrait.style.cssText = 'width:96px;height:96px;object-fit:contain;margin:0 auto 10px;display:block;';
                    portrait.addEventListener('error', () => portrait.remove());
                    card.appendChild(portrait);
                }

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

    // ── Panels (compact left/right) ──────────────────────────────────────────

    private _wirePanels(): void {
        const tabs = document.querySelectorAll<HTMLElement>('#left-tabs .panel-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const name = tab.dataset.tab as 'character' | 'skills';
                if (!name) return;
                this.scene.audioSystem.playUiClick();
                this.openPanel(name);
            });
        });
        this.$('panel-left-close')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            this.closeLeftPanel();
        });
        this.$('panel-right-close')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            this.closeRightPanel();
        });
        this.$('btn-character')?.addEventListener('click', () => this.togglePanel('character'));
        this.$('btn-inventory')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            this.toggleInventory();
        });
        this.$('btn-skills')?.addEventListener('click', () => this.togglePanel('skills'));
        this.$('levelup-close')?.addEventListener('click', () => this._hideLevelUpModal());
        this.$('levelup-open-character')?.addEventListener('click', () => {
            this._hideLevelUpModal();
            this.openPanel('character');
        });
    }

    togglePanel(tab: 'character' | 'skills'): void {
        if (this.leftOpen && this.activeTab === tab) {
            this.closeLeftPanel();
        } else {
            this.openPanel(tab);
        }
    }

    openPanel(tab: 'character' | 'skills'): void {
        this.activeTab = tab;
        this.leftOpen = true;
        this.$('panel-left')?.classList.remove('hidden');
        this.$('tab-character')?.classList.toggle('hidden', tab !== 'character');
        this.$('tab-skills')?.classList.toggle('hidden', tab !== 'skills');
        document.querySelectorAll<HTMLElement>('#left-tabs .panel-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        this.refreshPanels();
    }

    openInventory(): void {
        this.rightOpen = true;
        this.$('panel-right')?.classList.remove('hidden');
        this.refreshPanels();
    }

    toggleInventory(): void {
        if (this.rightOpen) this.closeRightPanel();
        else this.openInventory();
    }

    closeLeftPanel(): void {
        this.leftOpen = false;
        this.$('panel-left')?.classList.add('hidden');
    }

    closeRightPanel(): void {
        this.rightOpen = false;
        this.$('panel-right')?.classList.add('hidden');
    }

    closeAll(): void {
        this.closeLeftPanel();
        this.closeRightPanel();
        this._hideLevelUpModal();
    }

    handleEscape(): void {
        if (this.dialogueNpc) {
            this.closeDialogue();
            return;
        }
        if (this.scene.propSystem.isEditorActive()) {
            if (this.scene.propSystem.getPlacementEntry()) {
                this.scene.propSystem.setPlacementEntry(null);
            } else {
                this.scene.propSystem.toggleEditor();
            }
            return;
        }
        const modal = this.$('levelup-modal');
        if (modal && !modal.classList.contains('hidden')) {
            this._hideLevelUpModal();
            return;
        }
        const settings = this.$('settings-panel');
        if (settings && !settings.classList.contains('hidden')) {
            this._stopKeybindCapture();
            settings.classList.add('hidden');
            return;
        }
        const escMenu = this.$('esc-menu');
        if (escMenu && !escMenu.classList.contains('hidden')) {
            escMenu.classList.add('hidden');
            return;
        }
        // Prioridade: fechar paineis abertos antes de abrir o menu.
        if (this.leftOpen || this.rightOpen) {
            this.closeLeftPanel();
            this.closeRightPanel();
            return;
        }
        escMenu?.classList.remove('hidden');
    }

    refreshPanels(): void {
        if (this.leftOpen) {
            if (this.activeTab === 'character') this._renderCharacterTab();
            else this._renderSkillsTab();
        }
        if (this.rightOpen) {
            this._renderPaperDoll();
            this._renderInventory();
        }
    }

    // ── ESC menu + settings panel ────────────────────────────────────────────

    private _wireEscMenu(): void {
        this.$('esc-settings')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            this.$('esc-menu')?.classList.add('hidden');
            this._openSettings();
        });
        this.$('esc-close')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            this.$('esc-menu')?.classList.add('hidden');
        });
    }

    private _wireSettingsPanel(): void {
        this.$('btn-settings')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            this._openSettings();
        });
        this.$('settings-close')?.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            this._stopKeybindCapture();
            this.$('settings-panel')?.classList.add('hidden');
        });
        document.querySelectorAll<HTMLElement>('#settings-tabs .settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const name = tab.dataset.stab as 'graphics' | 'game' | 'audio';
                if (!name) return;
                this.scene.audioSystem.playUiClick();
                this.activeSettingsTab = name;
                document.querySelectorAll<HTMLElement>('#settings-tabs .settings-tab').forEach(t => {
                    t.classList.toggle('active', t.dataset.stab === name);
                });
                this._buildSettingsBody();
            });
        });
    }

    private _openSettings(): void {
        this.$('esc-menu')?.classList.add('hidden');
        this.$('settings-panel')?.classList.remove('hidden');
        this._buildSettingsBody();
    }

    private _buildSettingsBody(): void {
        const body = this.$('settings-body');
        if (!body) return;
        this._stopKeybindCapture();
        body.innerHTML = '';
        if (this.activeSettingsTab === 'graphics') this._buildGraphicsSettings(body);
        else if (this.activeSettingsTab === 'game') this._buildGameSettings(body);
        else this._buildAudioSettings(body);
    }

    private _addSelect(parent: HTMLElement, label: string, options: { value: string; label: string }[], current: string, onChange: (v: string) => void): HTMLSelectElement {
        const row = document.createElement('div');
        row.className = 'setting-row';
        const lbl = document.createElement('label');
        lbl.textContent = label;
        const sel = document.createElement('select');
        for (const opt of options) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (opt.value === current) o.selected = true;
            sel.appendChild(o);
        }
        sel.addEventListener('change', () => {
            this.scene.audioSystem.playUiClick();
            onChange(sel.value);
        });
        row.appendChild(lbl);
        row.appendChild(sel);
        parent.appendChild(row);
        return sel;
    }

    private _addCheckbox(parent: HTMLElement, label: string, checked: boolean, onChange: (v: boolean) => void): HTMLInputElement {
        const row = document.createElement('div');
        row.className = 'setting-row';
        const lbl = document.createElement('label');
        lbl.textContent = label;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        cb.addEventListener('change', () => {
            this.scene.audioSystem.playUiClick();
            onChange(cb.checked);
        });
        row.appendChild(lbl);
        row.appendChild(cb);
        parent.appendChild(row);
        return cb;
    }

    private _addSlider(parent: HTMLElement, label: string, value: number, onInput: (v: number) => void): void {
        const row = document.createElement('div');
        row.className = 'setting-row';
        const lbl = document.createElement('label');
        lbl.textContent = label;
        const range = document.createElement('input');
        range.type = 'range';
        range.min = '0';
        range.max = '100';
        range.step = '1';
        range.value = String(Math.round(value * 100));
        range.addEventListener('input', () => onInput(Number(range.value) / 100));
        row.appendChild(lbl);
        row.appendChild(range);
        parent.appendChild(row);
    }

    private _addSection(parent: HTMLElement, title: string): void {
        const div = document.createElement('div');
        div.className = 'settings-section';
        div.textContent = title;
        parent.appendChild(div);
    }

    private _buildGraphicsSettings(body: HTMLElement): void {
        const prefs = FabulusPrefs.get();

        this._addSection(body, 'Preset geral');
        this._addSelect(body, 'Preset',
            [
                { value: 'custom', label: 'Personalizado' },
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'ultra', label: 'Ultra' },
            ], 'custom', v => {
                if (v === 'custom') return;
                FabulusPrefs.applyPreset(v as GfxPreset);
                this._buildSettingsBody();
            });

        this._addSection(body, 'Qualidade');
        this._addSelect(body, 'Antialiasing',
            [
                { value: 'off', label: 'Off' },
                { value: 'fxaa', label: 'FXAA' },
                { value: 'msaa2', label: 'MSAA 2x' },
                { value: 'msaa4', label: 'MSAA 4x' },
            ], prefs.gfxAntialiasing, v => FabulusPrefs.set({ gfxAntialiasing: v as FabulusPrefsData['gfxAntialiasing'] }));
        this._addSelect(body, 'Rendering scale',
            [
                { value: '0.5', label: '50%' },
                { value: '0.75', label: '75%' },
                { value: '1', label: '100%' },
                { value: '1.25', label: '125%' },
                { value: '1.5', label: '150%' },
            ], String(prefs.gfxRenderScale), v => FabulusPrefs.set({ gfxRenderScale: Number(v) }));
        this._addSelect(body, 'Sombras',
            [
                { value: 'off', label: 'Off' },
                { value: 'low', label: 'Low (1024)' },
                { value: 'medium', label: 'Medium (2048)' },
                { value: 'high', label: 'High (4096)' },
            ], prefs.gfxShadowQuality, v => FabulusPrefs.set({ gfxShadowQuality: v as FabulusPrefsData['gfxShadowQuality'] }));
        this._addSelect(body, 'SSAO',
            [
                { value: 'off', label: 'Off' },
                { value: 'low', label: 'Low' },
                { value: 'high', label: 'High' },
            ], prefs.gfxSsao, v => FabulusPrefs.set({ gfxSsao: v as FabulusPrefsData['gfxSsao'] }));
        this._addSelect(body, 'Particulas',
            [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
            ], prefs.gfxParticleQuality, v => FabulusPrefs.set({ gfxParticleQuality: v as FabulusPrefsData['gfxParticleQuality'] }));
        this._addSelect(body, 'Nivel de detalhe (requer reload)',
            [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
            ], prefs.gfxDetailLevel, v => {
                FabulusPrefs.set({ gfxDetailLevel: v as FabulusPrefsData['gfxDetailLevel'] });
                this.toast('Nivel de detalhe aplicado no proximo reload');
            });

        this._addSection(body, 'Pos-processamento');
        this._addCheckbox(body, 'Bloom', prefs.gfxBloom, v => FabulusPrefs.set({ gfxBloom: v }));
        this._addCheckbox(body, 'Vignette', prefs.gfxVignette, v => FabulusPrefs.set({ gfxVignette: v }));
        this._addCheckbox(body, 'Color grading', prefs.gfxColorGrading, v => FabulusPrefs.set({ gfxColorGrading: v }));
        this._addCheckbox(body, 'Sharpen', prefs.gfxSharpen, v => FabulusPrefs.set({ gfxSharpen: v }));

        this._addSection(body, 'Ultra (efeitos avancados)');
        this._addCheckbox(body, 'Ceu procedural', prefs.gfxSky, v => FabulusPrefs.set({ gfxSky: v }));
        this._addCheckbox(body, 'Atmosfera / god rays', prefs.gfxVolumetrics, v => FabulusPrefs.set({ gfxVolumetrics: v }));
        this._addCheckbox(body, 'Chao ultra (requer reload)', prefs.gfxGroundUltra, v => {
            FabulusPrefs.set({ gfxGroundUltra: v });
            this.toast('Chao ultra aplicado no proximo reload');
        });
        this._addCheckbox(body, 'Agua / lava', prefs.gfxWater, v => FabulusPrefs.set({ gfxWater: v }));
        this._addCheckbox(body, 'Clima', prefs.gfxWeather, v => FabulusPrefs.set({ gfxWeather: v }));
        this._addCheckbox(body, 'VFX avancados', prefs.gfxAdvancedVfx, v => FabulusPrefs.set({ gfxAdvancedVfx: v }));
        this._addSelect(body, 'Tipo de clima',
            [
                { value: 'ambient', label: 'Ambiente' },
                { value: 'clear', label: 'Limpo' },
                { value: 'rain', label: 'Chuva' },
                { value: 'fog', label: 'Neblina' },
                { value: 'ember', label: 'Brasas' },
                { value: 'dust', label: 'Poeira' },
            ], prefs.weatherMode, v => {
                FabulusPrefs.set({ weatherMode: v as WeatherMode });
                this.scene.weatherSystem.setMode(v as WeatherMode);
            });

        this._addSection(body, 'Indicadores');
        this._addCheckbox(body, 'Mostrar FPS', prefs.showFps, v => FabulusPrefs.set({ showFps: v }));
    }

    private _buildGameSettings(body: HTMLElement): void {
        const prefs = FabulusPrefs.get();

        this._addSection(body, 'Gameplay');
        this._addCheckbox(body, 'Correr por padrao (Shift anda)', prefs.runByDefault, v => FabulusPrefs.set({ runByDefault: v }));
        this._addCheckbox(body, 'Mostrar nomes de drops', prefs.showDropLabels, v => FabulusPrefs.set({ showDropLabels: v }));
        this._addCheckbox(body, 'Mostrar HP bars de inimigos', prefs.showEnemyHpBars, v => FabulusPrefs.set({ showEnemyHpBars: v }));
        this._addCheckbox(body, 'Mostrar minimapa', prefs.showMinimap, v => FabulusPrefs.set({ showMinimap: v }));

        this._addSection(body, 'Atalhos de teclado');
        for (const kb of KEYBIND_ACTIONS) {
            const row = document.createElement('div');
            row.className = 'setting-row';
            const lbl = document.createElement('label');
            lbl.textContent = kb.label;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'keybind-btn';
            btn.textContent = this._keyLabel(FabulusPrefs.codeFor(kb.action));
            btn.addEventListener('click', () => {
                this.scene.audioSystem.playUiClick();
                this._startKeybindCapture(kb.action, btn);
            });
            row.appendChild(lbl);
            row.appendChild(btn);
            body.appendChild(row);
        }

        this._addSection(body, 'Personagem');
        const classBtn = document.createElement('button');
        classBtn.type = 'button';
        classBtn.className = 'settings-btn';
        classBtn.textContent = 'Trocar classe';
        classBtn.addEventListener('click', () => {
            this.scene.audioSystem.playUiClick();
            localStorage.removeItem(CLASS_STORAGE_KEY);
            window.location.reload();
        });
        body.appendChild(classBtn);
    }

    private _buildAudioSettings(body: HTMLElement): void {
        const prefs = FabulusPrefs.get();
        this._addSection(body, 'Volumes');
        this._addSlider(body, 'Volume geral', prefs.masterVolume, v => {
            FabulusPrefs.set({ masterVolume: v });
            this._applyAudioPrefs();
        });
        this._addSlider(body, 'Volume efeitos', prefs.sfxVolume, v => {
            FabulusPrefs.set({ sfxVolume: v });
            this._applyAudioPrefs();
            this.scene.audioSystem.playUiClick();
        });
        this._addCheckbox(body, 'Mudo', prefs.muted, v => {
            FabulusPrefs.set({ muted: v });
            this._applyAudioPrefs();
        });
    }

    private _keyLabel(code: string): string {
        return code.replace(/^Key/, '').replace(/^Digit/, '');
    }

    private _startKeybindCapture(action: FabulusActionId, btn: HTMLButtonElement): void {
        this._stopKeybindCapture();
        this.keybindListening = action;
        btn.classList.add('listening');
        btn.textContent = '...';
        this._onKeybindCapture = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.code !== 'Escape') {
                FabulusPrefs.setBinding(action, e.code);
            }
            btn.classList.remove('listening');
            btn.textContent = this._keyLabel(FabulusPrefs.codeFor(action));
            this._stopKeybindCapture();
        };
        document.addEventListener('keydown', this._onKeybindCapture, { capture: true });
    }

    private _stopKeybindCapture(): void {
        if (this._onKeybindCapture) {
            document.removeEventListener('keydown', this._onKeybindCapture, { capture: true });
            this._onKeybindCapture = null;
        }
        this.keybindListening = null;
    }

    // ── Potion HUD slots ─────────────────────────────────────────────────────

    private _wirePotionSlots(): void {
        this.$('potion-slot-1')?.addEventListener('click', () => this.usePotionSlot(1));
        this.$('potion-slot-2')?.addEventListener('click', () => this.usePotionSlot(2));
    }

    private _potionForSlot(slot: number): { pi: PlayerItem; def: ItemDef } | null {
        for (const pi of this.scene.playerItems) {
            if (pi.is_equipped) continue;
            const def = this.scene.getItemDef(pi.item_id);
            if (!def || def.item_type !== ITEM_TYPE.CONSUMABLE) continue;
            if (slot === 1 && (def.restore_health ?? 0) > 0) return { pi, def };
            if (slot === 2 && (def.restore_mana ?? 0) > 0 && !(def.restore_health ?? 0)) return { pi, def };
        }
        return null;
    }

    usePotionSlot(slot: number): void {
        if (this.scene.playerDead) return;
        const entry = this._potionForSlot(slot);
        if (!entry) {
            this.toast(slot === 1 ? 'Sem pocoes de vida' : 'Sem pocoes de mana');
            return;
        }
        this._consumeItem(entry.pi, entry.def);
    }

    private _consumeItem(pi: PlayerItem, def: ItemDef): void {
        const now = this.scene.now();
        const readyAt = this.potionCooldowns.get(def.id) ?? 0;
        if (now < readyAt) return;
        const p = this.scene.player;
        const d = this.scene.derived;
        const restoresHealth = (def.restore_health ?? 0) > 0;
        const restoresMana = (def.restore_mana ?? 0) > 0;
        const healthFull = p.current_health >= d.maxHealth;
        const manaFull = p.current_mana >= d.maxMana;
        if (restoresHealth && healthFull && (!restoresMana || manaFull)) {
            this.toast('Vida ja esta cheia');
            return;
        }
        if (restoresMana && !restoresHealth && manaFull) {
            this.toast('Mana ja esta cheia');
            return;
        }
        this.potionCooldowns.set(def.id, now + (def.use_cooldown_ms ?? 0));
        FabulusApi.consumePlayerItem(pi.id)
            .then(res => {
                if (res.quantity <= 0) {
                    const idx = this.scene.playerItems.indexOf(pi);
                    if (idx >= 0) this.scene.playerItems.splice(idx, 1);
                } else {
                    pi.quantity = res.quantity;
                }
                if (res.restore_health > 0) {
                    p.current_health = Math.min(d.maxHealth, p.current_health + res.restore_health);
                    this.scene.vfxSystem.healSparkle();
                }
                if (res.restore_mana > 0) {
                    p.current_mana = Math.min(d.maxMana, p.current_mana + res.restore_mana);
                }
                this.scene.audioSystem.playPotionDrink();
                this.refreshPanels();
            })
            .catch(err => {
                console.warn('[Fabulus] consumePlayerItem failed:', err);
                this.potionCooldowns.set(def.id, 0);
                this.toast('Falha ao usar a pocao');
            });
    }

    private _refreshPotionSlots(): void {
        const now = this.scene.now();
        for (const slot of [1, 2]) {
            const cell = this.$(`potion-slot-${slot}`);
            const qtyEl = this.$(`potion-qty-${slot}`);
            const cdEl = this.$(`potion-cd-${slot}`);
            if (!cell) continue;
            const entry = this._potionForSlot(slot);
            const keyCode = FabulusPrefs.codeFor(slot === 1 ? 'potion1' : 'potion2');
            const key = `${keyCode}:${entry ? `${entry.def.id}:${entry.pi.quantity ?? 1}` : 'empty'}`;
            if (this.hudCache[`potion${slot}`] !== key) {
                this.hudCache[`potion${slot}`] = key;
                const keyEl = cell.querySelector('.slot-key');
                if (keyEl) keyEl.textContent = this._keyLabel(keyCode);
                cell.classList.toggle('empty', !entry);
                const old = cell.querySelector('.potion-icon');
                if (old) old.remove();
                if (entry) {
                    const icon = this._iconNode(entry.def.icon_path, POTION_ICON_SVG);
                    icon.classList.add('potion-icon');
                    icon.style.position = 'absolute';
                    icon.style.inset = '4px';
                    cell.insertBefore(icon, cell.firstChild);
                    cell.title = `${entry.def.name} [${slot === 1 ? this._keyLabel(FabulusPrefs.codeFor('potion1')) : this._keyLabel(FabulusPrefs.codeFor('potion2'))}]`;
                } else {
                    cell.title = slot === 1 ? 'Pocao de vida' : 'Pocao de mana';
                }
                if (qtyEl) qtyEl.textContent = entry ? String(entry.pi.quantity ?? 1) : '';
            }
            if (cdEl && entry) {
                const readyAt = this.potionCooldowns.get(entry.def.id) ?? 0;
                const remaining = readyAt - now;
                if (remaining > 0 && (entry.def.use_cooldown_ms ?? 0) > 0) {
                    const frac = remaining / entry.def.use_cooldown_ms!;
                    cdEl.style.opacity = '1';
                    cdEl.style.background = `conic-gradient(rgba(0,0,0,0.75) ${frac * 360}deg, transparent 0deg)`;
                } else {
                    cdEl.style.opacity = '0';
                }
            } else if (cdEl) {
                cdEl.style.opacity = '0';
            }
        }
    }

    // ── Basic attack ─────────────────────────────────────────────────────────

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
    }

    private async _spendPoint(attr: number): Promise<void> {
        const p = this.scene.player;
        if (p.unspent_points <= 0) return;
        const apply = (delta: number) => {
            if (attr === ATTRIBUTE_TYPE.STRENGTH) p.strength += delta;
            else if (attr === ATTRIBUTE_TYPE.DEXTERITY) p.dexterity += delta;
            else if (attr === ATTRIBUTE_TYPE.INTELLIGENCE) p.intelligence += delta;
            else if (attr === ATTRIBUTE_TYPE.VITALITY) p.vitality += delta;
        };
        if (attr !== ATTRIBUTE_TYPE.STRENGTH && attr !== ATTRIBUTE_TYPE.DEXTERITY
            && attr !== ATTRIBUTE_TYPE.INTELLIGENCE && attr !== ATTRIBUTE_TYPE.VITALITY) return;
        apply(1);
        p.unspent_points -= 1;
        this.scene.audioSystem.playUiClick();
        this.scene.recomputeDerivedStats();
        this.refreshPanels();
        try {
            await FabulusApi.spendAttributePoint(attr);
        } catch (err) {
            console.warn('[Fabulus] spendAttributePoint failed:', err);
            apply(-1);
            p.unspent_points += 1;
            this.scene.recomputeDerivedStats();
            this.refreshPanels();
            this.toast('Falha ao gastar ponto de atributo');
        }
    }

    // ── Equipment / inventory (right panel) ──────────────────────────────────

    private _itemTooltip(def: ItemDef, pi?: PlayerItem | null): string {
        const rarity = this.scene.getRarity(def.rarity_id);
        const displayName = this.scene.getItemDisplayName(def, pi);
        const lines: string[] = [`${displayName} (${rarity ? rarity.name : ''} ${ITEM_TYPE_LABEL[def.item_type] ?? ''})`];
        if (def.damage_min != null) lines.push(`Damage: ${def.damage_min}-${def.damage_max}`);
        if (def.attack_speed != null) lines.push(`Attack Speed: ${def.attack_speed}`);
        if (def.armor != null) lines.push(`Armor: ${def.armor}`);
        for (const m of def.modifiers) {
            const label = ATTRIBUTE_LABEL[m.attribute_type] ?? `Attr ${m.attribute_type}`;
            lines.push(`+${m.value}${m.value_type === VALUE_TYPE.PERCENT ? '%' : ''} ${label}`);
        }
        if (pi?.affixes) {
            for (const a of pi.affixes) {
                const label = ATTRIBUTE_LABEL[a.attribute_type] ?? `Attr ${a.attribute_type}`;
                lines.push(`+${a.value}${a.value_type === VALUE_TYPE.PERCENT ? '%' : ''} ${label} [${a.name}]`);
            }
        }
        if ((def.restore_health ?? 0) > 0) lines.push(`Restaura ${def.restore_health} de vida`);
        if ((def.restore_mana ?? 0) > 0) lines.push(`Restaura ${def.restore_mana} de mana`);
        lines.push(`Venda: ${this._sellValue(def)} ouro`);
        lines.push(def.description);
        return lines.join('\n');
    }

    private _sellValue(def: ItemDef): number {
        if (def.sell_value != null) return def.sell_value;
        const rarity = this.scene.getRarity(def.rarity_id);
        return Math.max(1, Math.round(5 * (rarity ? rarity.stat_multiplier : 1) * def.required_level));
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
                const icon = this._iconNode(entry.def.icon_path, itemIconSvg(entry.def.item_type), rarity?.color_hex);
                icon.style.height = '32px';
                cell.appendChild(icon);
                const label = document.createElement('span');
                label.className = 'doll-slot-label';
                label.textContent = this.scene.getItemDisplayName(entry.def, entry.playerItem);
                cell.appendChild(label);
                cell.title = this._itemTooltip(entry.def, entry.playerItem) + '\n\nClique para desequipar';
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
                    const isConsumable = def.item_type === ITEM_TYPE.CONSUMABLE;
                    cell.classList.add('filled');
                    cell.style.borderColor = rarity ? rarity.color_hex : '';
                    cell.appendChild(this._iconNode(def.icon_path, itemIconSvg(def.item_type), rarity?.color_hex));

                    if (isConsumable && (pi.quantity ?? 1) > 1) {
                        const qty = document.createElement('span');
                        qty.className = 'inv-qty';
                        qty.textContent = String(pi.quantity);
                        cell.appendChild(qty);
                    }

                    const actions = document.createElement('div');
                    actions.className = 'inv-actions';
                    const sellBtn = document.createElement('button');
                    sellBtn.type = 'button';
                    sellBtn.className = 'inv-action sell';
                    sellBtn.textContent = '$';
                    sellBtn.title = `Vender por ${this._sellValue(def)} ouro`;
                    sellBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        this._sellItem(pi, def);
                    });
                    const discardBtn = document.createElement('button');
                    discardBtn.type = 'button';
                    discardBtn.className = 'inv-action discard';
                    discardBtn.textContent = '\u2715';
                    discardBtn.title = 'Descartar';
                    discardBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        this._discardItem(pi, def);
                    });
                    actions.appendChild(sellBtn);
                    actions.appendChild(discardBtn);
                    cell.appendChild(actions);

                    cell.title = this._itemTooltip(def, pi)
                        + (isConsumable ? '\n\nClique para usar' : '\n\nClique para equipar');
                    cell.addEventListener('click', () => {
                        if (isConsumable) this._consumeItem(pi, def);
                        else this._equip(pi, def);
                    });
                    if (!isConsumable) {
                        cell.addEventListener('mouseenter', () => this._setEquipHint(def.item_type, true));
                        cell.addEventListener('mouseleave', () => this._setEquipHint(def.item_type, false));
                    }
                }
            }
            grid.appendChild(cell);
        }
    }

    private async _sellItem(pi: PlayerItem, def: ItemDef): Promise<void> {
        try {
            const res = await FabulusApi.sellPlayerItem(pi.id);
            const idx = this.scene.playerItems.indexOf(pi);
            if (idx >= 0) this.scene.playerItems.splice(idx, 1);
            this.scene.player.gold = res.gold;
            this.scene.audioSystem.playSellItem();
            this.toast(`Vendido: ${this.scene.getItemDisplayName(def, pi)} (+${res.sold_value} ouro)`);
            this.refreshPanels();
        } catch (err) {
            console.warn('[Fabulus] sellPlayerItem failed:', err);
            this.toast('Falha ao vender o item');
        }
    }

    private async _discardItem(pi: PlayerItem, def: ItemDef): Promise<void> {
        const name = this.scene.getItemDisplayName(def, pi);
        if (!window.confirm(`Descartar ${name}? Esta acao nao pode ser desfeita.`)) return;
        try {
            await FabulusApi.deletePlayerItem(pi.id);
            const idx = this.scene.playerItems.indexOf(pi);
            if (idx >= 0) this.scene.playerItems.splice(idx, 1);
            this.scene.audioSystem.playUiClick();
            this.toast(`Descartado: ${name}`);
            this.refreshPanels();
        } catch (err) {
            console.warn('[Fabulus] deletePlayerItem failed:', err);
            this.toast('Falha ao descartar o item');
        }
    }

    private async _equip(pi: PlayerItem, def: ItemDef): Promise<void> {
        if (def.item_type === ITEM_TYPE.CONSUMABLE) return;
        if (def.required_level > this.scene.player.level) {
            this.toast(`Requer level ${def.required_level}`);
            return;
        }
        const sameType = this.scene.getEquippedItems().filter(e => e.def.item_type === def.item_type);
        const maxSlots = def.item_type === ITEM_TYPE.RING ? MAX_RINGS : 1;
        let evicted: PlayerItem | null = null;
        let evictedSlot: number | null = null;
        if (sameType.length >= maxSlots) {
            evicted = sameType[0].playerItem;
            evictedSlot = evicted.slot;
            evicted.is_equipped = 0;
            evicted.slot = null;
        }
        pi.is_equipped = 1;
        pi.slot = def.item_type;
        this.scene.audioSystem.playUiClick();
        this._afterEquipChange(def.item_type === ITEM_TYPE.WEAPON);
        let evictedUnequipped = false;
        try {
            if (evicted) {
                await FabulusApi.equipItem(evicted.id, false, null);
                evictedUnequipped = true;
            }
            await FabulusApi.equipItem(pi.id, true, def.item_type);
        } catch (err) {
            console.warn('[Fabulus] equip failed:', err);
            pi.is_equipped = 0;
            pi.slot = null;
            if (evicted) {
                evicted.is_equipped = 1;
                evicted.slot = evictedSlot;
                if (evictedUnequipped) {
                    FabulusApi.equipItem(evicted.id, true, evictedSlot)
                        .catch(e => console.warn('[Fabulus] equip rollback failed:', e));
                }
            }
            this._afterEquipChange(def.item_type === ITEM_TYPE.WEAPON);
            this.toast('Falha ao equipar o item');
        }
    }

    private async _unequip(pi: PlayerItem): Promise<void> {
        const def = this.scene.getItemDef(pi.item_id);
        const prevSlot = pi.slot;
        pi.is_equipped = 0;
        pi.slot = null;
        this.scene.audioSystem.playUiClick();
        this._afterEquipChange(def ? def.item_type === ITEM_TYPE.WEAPON : false);
        try {
            await FabulusApi.equipItem(pi.id, false, null);
        } catch (err) {
            console.warn('[Fabulus] unequip failed:', err);
            pi.is_equipped = 1;
            pi.slot = prevSlot;
            this._afterEquipChange(def ? def.item_type === ITEM_TYPE.WEAPON : false);
            this.toast('Falha ao desequipar o item');
        }
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
                <div class="skill-icon"></div>
                <div class="skill-info">
                    <div class="skill-head">
                        <span class="skill-name">${def.name}</span>
                        <span class="skill-meta">${SKILL_TYPE_LABEL[def.skill_type] ?? ''} · ${def.mana_cost} mana · ${(def.cooldown_ms / 1000).toFixed(1)}s</span>
                    </div>
                    <div class="skill-desc">${def.description}</div>
                    <div class="skill-numbers">${dmgLine}</div>
                    <div class="skill-footer"></div>
                </div>`;

            const iconBox = card.querySelector('.skill-icon') as HTMLElement;
            iconBox.appendChild(this._iconNode(def.icon_path, skillIconSvg(def.icon_key)));

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
                icon.innerHTML = '';
                icon.appendChild(this._iconNode(def.icon_path, skillIconSvg(def.icon_key)));
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

        this._refreshPotionSlots();
        this._refreshTargetFrame();
    }

    private _refreshFps(dt: number): void {
        if (!FabulusPrefs.get().showFps) return;
        this.fpsAccum += dt;
        if (this.fpsAccum < FPS_REFRESH_S) return;
        this.fpsAccum = 0;
        const fps = this.scene.bScene.getEngine().getFps();
        this._setText(this.$('fps-indicator'), 'fps', `${Math.round(fps)} FPS`);
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
        if (name) {
            const displayName = target.isElite ? `Elite ${target.def.name}` : target.def.name;
            name.textContent = `${displayName}  ·  Lv ${target.level}`;
            name.style.color = target.isElite ? '#f0c860' : '';
        }
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

    // ── NPC dialogue ─────────────────────────────────────────────────────────

    openDialogue(npc: NpcDef): void {
        const panel = this.$('dialogue-panel');
        if (!panel) return;
        const dialog = npc.dialog;
        if (!dialog || !dialog.start || !dialog.nodes || !dialog.nodes[dialog.start]) {
            console.warn(`[Fabulus] NPC ${npc.id} has no valid dialogue tree`);
            this.toast(`${npc.name} nao tem nada a dizer.`);
            return;
        }
        this.dialogueNpc = npc;
        const nameEl = this.$('dialogue-name');
        if (nameEl) nameEl.textContent = npc.name;
        const titleEl = this.$('dialogue-title');
        if (titleEl) {
            titleEl.textContent = npc.title ?? '';
            titleEl.classList.toggle('hidden', !npc.title);
        }
        panel.classList.remove('hidden');
        this._renderDialogueNode(dialog.start);
    }

    private _renderDialogueNode(nodeKey: string): void {
        const npc = this.dialogueNpc;
        if (!npc || !npc.dialog) return;
        const node = npc.dialog.nodes[nodeKey];
        if (!node) {
            console.warn(`[Fabulus] Dialogue node not found: ${nodeKey} (npc ${npc.id})`);
            this.closeDialogue();
            return;
        }
        const textEl = this.$('dialogue-text');
        if (textEl) textEl.textContent = node.text;
        const optionsEl = this.$('dialogue-options');
        if (!optionsEl) return;
        optionsEl.innerHTML = '';
        const options = Array.isArray(node.options) && node.options.length
            ? node.options
            : [{ label: 'Fechar', next: null }];
        for (const option of options) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dialogue-option';
            btn.textContent = option.label;
            btn.addEventListener('click', () => {
                this.scene.audioSystem.playUiClick();
                if (option.next == null) {
                    this.closeDialogue();
                } else {
                    this._renderDialogueNode(option.next);
                }
            });
            optionsEl.appendChild(btn);
        }
    }

    closeDialogue(): void {
        this.dialogueNpc = null;
        this.$('dialogue-panel')?.classList.add('hidden');
    }

    // ── Map editor palette ───────────────────────────────────────────────────

    setEditorMode(active: boolean, catalog: PropCatalogEntry[]): void {
        const panel = this.$('editor-palette');
        if (!panel) return;
        panel.classList.toggle('hidden', !active);
        if (!active) return;
        const list = this.$('editor-prop-list');
        if (list) {
            list.innerHTML = '';
            for (const entry of catalog) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'editor-prop-btn';
                btn.dataset.modelPath = entry.model_path;
                btn.textContent = entry.label;
                btn.addEventListener('click', () => {
                    this.scene.audioSystem.playUiClick();
                    const current = this.scene.propSystem.getPlacementEntry();
                    this.scene.propSystem.setPlacementEntry(current === entry ? null : entry);
                });
                list.appendChild(btn);
            }
        }
        this.refreshEditorPalette(this.scene.propSystem.getPlacementEntry());
        this.setEditorSelection(null);
    }

    refreshEditorPalette(selected: PropCatalogEntry | null): void {
        document.querySelectorAll<HTMLElement>('#editor-prop-list .editor-prop-btn').forEach(btn => {
            btn.classList.toggle('active', selected != null && btn.dataset.modelPath === selected.model_path);
        });
        const hint = this.$('editor-hint');
        if (hint) {
            hint.textContent = selected
                ? `Clique no chao para posicionar: ${selected.label}`
                : 'Selecione um prop para adicionar ou clique em um prop do mapa';
        }
    }

    setEditorSelection(def: MapPropDef | null): void {
        const el = this.$('editor-selection');
        if (!el) return;
        if (!def) {
            el.classList.add('hidden');
            el.textContent = '';
            return;
        }
        el.classList.remove('hidden');
        el.textContent = `#${def.id} ${def.model_path} — arraste para mover · R gira · +/- escala (${def.scale}) · Del remove`;
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

    update(dt: number): void {
        this._refreshHud();
        this._updateFloats();
        this._refreshFps(dt);
    }

    dispose(): void {
        if (this.deathTimerInterval) clearInterval(this.deathTimerInterval);
        if (this.levelUpCloseTimer) clearTimeout(this.levelUpCloseTimer);
        this._stopKeybindCapture();
        FabulusPrefs.offChange(this._onPrefsChange);
    }
}
