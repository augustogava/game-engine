export interface ClassDef {
    id: number;
    name: string;
    description: string;
    model_path: string;
    max_level: number;
    starting_gold: number;
    main_stat: number;
    base_health: number;
    base_mana: number;
    base_strength: number;
    base_dexterity: number;
    base_intelligence: number;
    base_vitality: number;
    health_per_level: number;
    mana_per_level: number;
    attribute_points_per_level: number;
    skill_points_per_level: number;
    walk_speed: number;
    run_speed: number;
    anim_idle: string | null;
    anim_walk: string | null;
    anim_run: string | null;
    anim_attack: string | null;
    anim_hit: string | null;
    anim_death: string | null;
}
