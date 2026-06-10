export interface EnemyDef {
    id: number;
    name: string;
    model_path: string;
    level: number;
    max_health: number;
    damage_min: number;
    damage_max: number;
    armor: number;
    walk_speed: number;
    run_speed: number;
    aggro_range: number;
    attack_range: number;
    leash_range: number;
    attack_cooldown_ms: number;
    experience_reward: number;
    gold_min: number;
    gold_max: number;
    health_scale_pct: number;
    damage_scale_pct: number;
    anim_idle: string | null;
    anim_walk: string | null;
    anim_run: string | null;
    anim_attack: string | null;
    anim_hit: string | null;
    anim_death: string | null;
}
