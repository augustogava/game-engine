export interface LootTableEntry {
    id: number;
    enemy_id: number;
    loot_type: number;
    drop_chance_pct: number;
    gold_min: number | null;
    gold_max: number | null;
    item_id: number | null;
}
