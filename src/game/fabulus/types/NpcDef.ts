export interface DialogOption {
    label: string;
    next: string | null;
}

export interface DialogNode {
    text: string;
    options: DialogOption[];
}

export interface DialogTree {
    start: string;
    nodes: Record<string, DialogNode>;
}

export interface NpcDef {
    id: number;
    name: string;
    title: string | null;
    model_path: string;
    pos_x: number;
    pos_z: number;
    rot_y: number;
    scale: number;
    idle_anim: string | null;
    dialog: DialogTree | null;
}
