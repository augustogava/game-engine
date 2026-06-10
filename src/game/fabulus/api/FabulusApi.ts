import type { ClassDef, EnemyDef, ItemDef, LootTableEntry, PlayerItem, PlayerSkill, PlayerState, RarityDef, SkillDef } from '../types/index.js';
import {
    MOCK_CLASSES, MOCK_ENEMIES, MOCK_ITEMS, MOCK_LEVELS, MOCK_LOOT_TABLES,
    MOCK_PLAYER, MOCK_PLAYER_ITEMS, MOCK_PLAYER_SKILLS, MOCK_RARITIES, MOCK_SKILLS,
} from '../data/mockData.js';

const USE_MOCK = true;
const API_BASE = '/api/fabulus';

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

const mockState = {
    player: deepCopy(MOCK_PLAYER),
    playerItems: deepCopy(MOCK_PLAYER_ITEMS),
    playerSkills: deepCopy(MOCK_PLAYER_SKILLS),
    nextPlayerItemId: MOCK_PLAYER_ITEMS.length + 1,
};

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

    async equipItem(playerItemId: number, equip: boolean, slot: number | null): Promise<void> {
        if (USE_MOCK) {
            const row = mockState.playerItems.find(pi => pi.id === playerItemId);
            if (!row) return;
            row.is_equipped = equip ? 1 : 0;
            row.slot = equip ? slot : null;
            return;
        }
        await apiFetch(`/player/items/${playerItemId}/${equip ? 'equip' : 'unequip'}`, {
            method: 'POST',
            body: JSON.stringify({ slot }),
        });
    },

    async addPlayerItem(itemId: number): Promise<PlayerItem> {
        if (USE_MOCK) {
            const row: PlayerItem = {
                id: mockState.nextPlayerItemId++,
                player_id: mockState.player.id,
                item_id: itemId,
                is_equipped: 0,
                slot: null,
            };
            mockState.playerItems.push(row);
            return deepCopy(row);
        }
        return apiFetch<PlayerItem>('/player/items', {
            method: 'POST',
            body: JSON.stringify({ item_id: itemId }),
        });
    },

    async assignSkillSlot(skillId: number, slot: number | null): Promise<void> {
        if (USE_MOCK) {
            for (const ps of mockState.playerSkills) {
                if (ps.bar_slot === slot && slot != null) ps.bar_slot = null;
            }
            const row = mockState.playerSkills.find(ps => ps.skill_id === skillId);
            if (row) row.bar_slot = slot;
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
            }
            return;
        }
        await apiFetch(`/player/skills/${skillId}/unlock`, { method: 'POST' });
    },

    async rankUpSkill(skillId: number): Promise<void> {
        if (USE_MOCK) {
            if (mockState.player.skill_points <= 0) return;
            const row = mockState.playerSkills.find(ps => ps.skill_id === skillId);
            const def = MOCK_SKILLS.find(s => s.id === skillId);
            if (!row || !def || row.rank >= def.max_rank) return;
            row.rank += 1;
            mockState.player.skill_points -= 1;
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
            p.pos_x = 0;
            p.pos_z = 0;
            const firstSkill = MOCK_SKILLS.find(s => s.class_id === classId && s.unlock_level <= 1);
            mockState.playerSkills = firstSkill ? [{ skill_id: firstSkill.id, rank: 1, bar_slot: 1 }] : [];
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
            return;
        }
        await apiFetch('/player/state', {
            method: 'PUT',
            body: JSON.stringify(partial),
        });
    },
};
