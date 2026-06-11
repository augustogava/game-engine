export interface MapPropDef {
    id: number;
    model_path: string;
    pos_x: number;
    pos_y: number;
    pos_z: number;
    rot_y: number;
    /** Target height in world units (models are normalized on load). */
    scale: number;
    collidable: number;
}
