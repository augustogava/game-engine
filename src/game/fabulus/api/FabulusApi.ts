import type { AffixDef, ClassDef, EnemyDef, ItemDef, LootTableEntry, MapPropDef, NpcDef, PlayerItem, PlayerSkill, PlayerState, RarityDef, RolledAffix, SkillDef } from '../types/index.js';
import { ITEM_TYPE } from '../types/index.js';
import {
    MOCK_AFFIXES, MOCK_CLASSES, MOCK_ENEMIES, MOCK_ITEMS, MOCK_LEVELS, MOCK_LOOT_TABLES,
    MOCK_PLAYER, MOCK_PLAYER_ITEMS, MOCK_PLAYER_SKILLS, MOCK_RARITIES, MOCK_SKILLS,
} from '../data/mockData.js';

const USE_MOCK = false;
const API_BASE = '/api/fabulus';
// Mock persistence: the in-memory "database" survives reloads via localStorage,
// simulating a real server-side DB until MySQL is wired in.
const MOCK_DB_STORAGE_KEY = 'fabulus_mock_db_v1';

function deepCopy<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders(), ...options });
    if (!res.ok) throw new Error(`Fabulus API ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
}

interface MockDbState {
    player: PlayerState;
    playerItems: PlayerItem[];
    playerSkills: PlayerSkill[];
    playerSettings: Record<string, string>;
    nextPlayerItemId: number;
}

function freshMockState(): MockDbState {
    return {
        player: { ...deepCopy(MOCK_PLAYER), class_id: 0 },
        playerItems: deepCopy(MOCK_PLAYER_ITEMS),
        playerSkills: deepCopy(MOCK_PLAYER_SKILLS),
        playerSettings: {},
        nextPlayerItemId: MOCK_PLAYER_ITEMS.length + 1,
    };
}

function loadMockState(): MockDbState {
    try {
        const raw = localStorage.getItem(MOCK_DB_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<MockDbState>;
            if (parsed && parsed.player && Array.isArray(parsed.playerItems) && Array.isArray(parsed.playerSkills)) {
                return {
                    player: parsed.player as PlayerState,
                    playerItems: (parsed.playerItems as PlayerItem[]).map(pi => ({ ...pi, quantity: pi.quantity ?? 1, affixes: pi.affixes ?? null })),
                    playerSkills: parsed.playerSkills as PlayerSkill[],
                    playerSettings: parsed.playerSettings && typeof parsed.playerSettings === 'object' ? parsed.playerSettings : {},
                    nextPlayerItemId: Math.max(
                        Number(parsed.nextPlayerItemId) || 0,
                        (parsed.playerItems as PlayerItem[]).reduce((m, pi) => Math.max(m, pi.id), 0) + 1,
                    ),
                };
            }
        }
    } catch (err) {
        console.warn('[Fabulus] mock db load failed, starting fresh:', err);
    }
    return freshMockState();
}

const mockState = loadMockState();

function saveMockState(): void {
    try {
        localStorage.setItem(MOCK_DB_STORAGE_KEY, JSON.stringify(mockState));
    } catch (err) {
        console.warn('[Fabulus] mock db save failed:', err);
    }
}

export const FabulusApi = {
    async fetchClasses(): Promise<ClassDef[]> {
        if (USE_MOCK) return deepCopy(MOCK_CLASSES);
        return apiFetch<ClassDef[]>('/classes');
    },

    async fetchPlayer(): Promise<PlayerState> {
        if (USE_MOCK) return deepCopy(mockState.player);
        return apiFetch<PlayerState>('/player');
    },

    async fetchEnemies(): Promise<EnemyDef[]> {
        if (USE_MOCK) return deepCopy(MOCK_ENEMIES);
        return apiFetch<EnemyDef[]>('/enemies');
    },

    async fetchItems(): Promise<ItemDef[]> {
        if (USE_MOCK) return deepCopy(MOCK_ITEMS);
        return apiFetch<ItemDef[]>('/items');
    },

    async fetchRarities(): Promise<RarityDef[]> {
        if (USE_MOCK) return deepCopy(MOCK_RARITIES);
        return apiFetch<RarityDef[]>('/rarities');
    },

    async fetchAffixes(): Promise<AffixDef[]> {
        if (USE_MOCK) return deepCopy(MOCK_AFFIXES);
        return apiFetch<AffixDef[]>('/affixes');
    },

    async fetchPlayerItems(): Promise<PlayerItem[]> {
        if (USE_MOCK) return deepCopy(mockState.playerItems);
        return apiFetch<PlayerItem[]>('/player/items');
    },

    async fetchSkills(classId: number): Promise<SkillDef[]> {
        if (USE_MOCK) return deepCopy(MOCK_SKILLS.filter(s => s.class_id === classId));
        return apiFetch<SkillDef[]>(`/skills?class_id=${classId}`);
    },

    async fetchPlayerSkills(): Promise<PlayerSkill[]> {
        if (USE_MOCK) return deepCopy(mockState.playerSkills);
        return apiFetch<PlayerSkill[]>('/player/skills');
    },

    async fetchLootTables(): Promise<LootTableEntry[]> {
        if (USE_MOCK) return deepCopy(MOCK_LOOT_TABLES);
        return apiFetch<LootTableEntry[]>('/loot-tables');
    },

    async fetchLevels(): Promise<{ level: number; experience_required: number }[]> {
        if (USE_MOCK) return deepCopy(MOCK_LEVELS);
        return apiFetch<{ level: number; experience_required: number }[]>('/levels');
    },

    async fetchNpcs(): Promise<NpcDef[]> {
        return apiFetch<NpcDef[]>('/npcs');
    },

    async fetchMapProps(): Promise<MapPropDef[]> {
        return apiFetch<MapPropDef[]>('/map-props');
    },

    async createMapProp(prop: Omit<MapPropDef, 'id'>): Promise<MapPropDef> {
        return apiFetch<MapPropDef>('/map-props', {
            method: 'POST',
            body: JSON.stringify(prop),
        });
    },

    async updateMapProp(propId: number, partial: Partial<Omit<MapPropDef, 'id'>>): Promise<void> {
        await apiFetch(`/map-props/${propId}`, {
            method: 'PUT',
            body: JSON.stringify(partial),
        });
    },

    async deleteMapProp(propId: number): Promise<void> {
        await apiFetch(`/map-props/${propId}`, { method: 'DELETE' });
    },

    async fetchSettings(): Promise<Record<string, string>> {
        if (USE_MOCK) return deepCopy(mockState.playerSettings);
        return apiFetch<Record<string, string>>('/player/settings');
    },

    async saveSettings(settings: Record<string, string>): Promise<void> {
        if (USE_MOCK) {
            for (const [key, value] of Object.entries(settings)) {
                mockState.playerSettings[key] = String(value);
            }
            saveMockState();
            return;
        }
        await apiFetch('/player/settings', {
            method: 'PUT',
            body: JSON.stringify(settings),
        });
    },

    async equipItem(playerItemId: number, equip: boolean, slot: number | null): Promise<void> {
        if (USE_MOCK) {
            const row = mockState.playerItems.find(pi => pi.id === playerItemId);
            if (!row) throw new Error('Player item not found');
            row.is_equipped = equip ? 1 : 0;
            row.slot = equip ? slot : null;
            saveMockState();
            return;
        }
        await apiFetch(`/player/items/${playerItemId}/${equip ? 'equip' : 'unequip'}`, {
            method: 'POST',
            body: JSON.stringify({ slot }),
        });
    },

    async addPlayerItem(itemId: number, affixes: RolledAffix[] | null = null): Promise<PlayerItem> {
        if (USE_MOCK) {
            const def = MOCK_ITEMS.find(i => i.id === itemId);
            if (def && def.item_type === ITEM_TYPE.CONSUMABLE && !affixes) {
                const existing = mockState.playerItems.find(pi =>
                    pi.item_id === itemId && !pi.is_equipped && !pi.affixes && (!def.max_stack || pi.quantity < def.max_stack));
                if (existing) {
                    existing.quantity += 1;
                    saveMockState();
                    return deepCopy(existing);
                }
            }
            const row: PlayerItem = {
                id: mockState.nextPlayerItemId++,
                player_id: mockState.player.id,
                item_id: itemId,
                is_equipped: 0,
                slot: null,
                quantity: 1,
                affixes: affixes ? deepCopy(affixes) : null,
            };
            mockState.playerItems.push(row);
            saveMockState();
            return deepCopy(row);
        }
        return apiFetch<PlayerItem>('/player/items', {
            method: 'POST',
            body: JSON.stringify({ item_id: itemId, affixes }),
        });
    },

    async deletePlayerItem(playerItemId: number): Promise<void> {
        if (USE_MOCK) {
            const idx = mockState.playerItems.findIndex(pi => pi.id === playerItemId);
            if (idx < 0) throw new Error('Player item not found');
            mockState.playerItems.splice(idx, 1);
            saveMockState();
            return;
        }
        await apiFetch(`/player/items/${playerItemId}`, { method: 'DELETE' });
    },

    async sellPlayerItem(playerItemId: number): Promise<{ gold: number; sold_value: number }> {
        if (USE_MOCK) {
            const idx = mockState.playerItems.findIndex(pi => pi.id === playerItemId);
            if (idx < 0) throw new Error('Player item not found');
            const row = mockState.playerItems[idx];
            const def = MOCK_ITEMS.find(i => i.id === row.item_id);
            const rarity = def ? MOCK_RARITIES.find(r => r.id === def.rarity_id) : null;
            // Fallback formula when sell_value is missing: 5 * rarity multiplier * required level.
            const unitValue = def?.sell_value ?? Math.max(1, Math.round(5 * (rarity?.stat_multiplier ?? 1) * (def?.required_level ?? 1)));
            const total = unitValue * Math.max(1, row.quantity);
            mockState.playerItems.splice(idx, 1);
            mockState.player.gold += total;
            saveMockState();
            return { gold: mockState.player.gold, sold_value: total };
        }
        return apiFetch<{ gold: number; sold_value: number }>(`/player/items/${playerItemId}/sell`, { method: 'POST' });
    },

    async consumePlayerItem(playerItemId: number): Promise<{ quantity: number; restore_health: number; restore_mana: number }> {
        if (USE_MOCK) {
            const row = mockState.playerItems.find(pi => pi.id === playerItemId);
            if (!row) throw new Error('Player item not found');
            const def = MOCK_ITEMS.find(i => i.id === row.item_id);
            if (!def || def.item_type !== ITEM_TYPE.CONSUMABLE) throw new Error('Item is not consumable');
            row.quantity -= 1;
            if (row.quantity <= 0) {
                const idx = mockState.playerItems.indexOf(row);
                mockState.playerItems.splice(idx, 1);
            }
            saveMockState();
            return {
                quantity: Math.max(0, row.quantity),
                restore_health: def.restore_health ?? 0,
                restore_mana: def.restore_mana ?? 0,
            };
        }
        return apiFetch<{ quantity: number; restore_health: number; restore_mana: number }>(`/player/items/${playerItemId}/consume`, { method: 'POST' });
    },

    async assignSkillSlot(skillId: number, slot: number | null): Promise<void> {
        if (USE_MOCK) {
            for (const ps of mockState.playerSkills) {
                if (ps.bar_slot === slot && slot != null) ps.bar_slot = null;
            }
            const row = mockState.playerSkills.find(ps => ps.skill_id === skillId);
            if (row) row.bar_slot = slot;
            saveMockState();
            return;
        }
        await apiFetch(`/player/skills/${skillId}/slot`, {
            method: 'PUT',
            body: JSON.stringify({ slot }),
        });
    },

    async unlockSkill(skillId: number): Promise<void> {
        if (USE_MOCK) {
            if (!mockState.playerSkills.some(ps => ps.skill_id === skillId)) {
                mockState.playerSkills.push({ skill_id: skillId, rank: 1, bar_slot: null });
                saveMockState();
            }
            return;
        }
        await apiFetch(`/player/skills/${skillId}/unlock`, { method: 'POST' });
    },

    async rankUpSkill(skillId: number): Promise<void> {
        if (USE_MOCK) {
            if (mockState.player.skill_points <= 0) throw new Error('No skill points available');
            const row = mockState.playerSkills.find(ps => ps.skill_id === skillId);
            const def = MOCK_SKILLS.find(s => s.id === skillId);
            if (!row || !def || row.rank >= def.max_rank) throw new Error('Skill cannot be ranked up');
            row.rank += 1;
            mockState.player.skill_points -= 1;
            saveMockState();
            return;
        }
        await apiFetch(`/player/skills/${skillId}/rank-up`, { method: 'PUT' });
    },

    async spendAttributePoint(attributeType: number): Promise<void> {
        if (USE_MOCK) {
            const p = mockState.player;
            if (p.unspent_points <= 0) return;
            if (attributeType === 1) p.strength += 1;
            else if (attributeType === 2) p.dexterity += 1;
            else if (attributeType === 3) p.intelligence += 1;
            else if (attributeType === 4) p.vitality += 1;
            else return;
            p.unspent_points -= 1;
            saveMockState();
            return;
        }
        await apiFetch('/player/attributes', {
            method: 'PUT',
            body: JSON.stringify({ attribute_type: attributeType }),
        });
    },

    async selectClass(classId: number): Promise<void> {
        if (USE_MOCK) {
            const classDef = MOCK_CLASSES.find(c => c.id === classId);
            if (!classDef) return;
            const p = mockState.player;
            p.class_id = classId;
            p.level = 1;
            p.experience = 0;
            p.strength = classDef.base_strength;
            p.dexterity = classDef.base_dexterity;
            p.intelligence = classDef.base_intelligence;
            p.vitality = classDef.base_vitality;
            p.unspent_points = 0;
            p.skill_points = 0;
            p.current_health = classDef.base_health;
            p.current_mana = classDef.base_mana;
            p.gold = classDef.starting_gold;
            p.pos_x = 0;
            p.pos_z = 0;
            mockState.playerItems = deepCopy(MOCK_PLAYER_ITEMS);
            mockState.nextPlayerItemId = MOCK_PLAYER_ITEMS.length + 1;
            const firstSkill = MOCK_SKILLS.find(s => s.class_id === classId && s.unlock_level <= 1);
            mockState.playerSkills = firstSkill ? [{ skill_id: firstSkill.id, rank: 1, bar_slot: 1 }] : [];
            saveMockState();
            return;
        }
        await apiFetch('/player/class', {
            method: 'PUT',
            body: JSON.stringify({ class_id: classId }),
        });
    },

    async savePlayerState(partial: Partial<PlayerState>): Promise<void> {
        if (USE_MOCK) {
            Object.assign(mockState.player, partial);
            saveMockState();
            return;
        }
        await apiFetch('/player/state', {
            method: 'PUT',
            body: JSON.stringify(partial),
        });
    },
};
