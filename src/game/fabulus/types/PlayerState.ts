export interface PlayerState {
    id: number;
    user_id: number;
    class_id: number;
    name: string;
    level: number;
    experience: number;
    strength: number;
    dexterity: number;
    intelligence: number;
    vitality: number;
    unspent_points: number;
    skill_points: number;
    current_health: number;
    current_mana: number;
    gold: number;
    pos_x: number;
    pos_z: number;
}

export interface DerivedStats {
    strength: number;
    dexterity: number;
    intelligence: number;
    vitality: number;
    maxHealth: number;
    maxMana: number;
    armor: number;
    damageReductionPct: number;
    weaponDamageMin: number;
    weaponDamageMax: number;
    attackSpeed: number;
    attackRange: number;
    dps: number;
    critChancePct: number;
    critDamageMult: number;
    mainStatMult: number;
    additiveMult: number;
    skillDamageMult: number;
    moveSpeedMult: number;
    hpRegen: number;
    manaRegen: number;
}
