export interface AirportOverlayEntry {
    icao: string;
    glbPath: string;
    clipRadiusM: number;
    clipMaxAltM: number;
    altOffsetM?: number;
    headingOffsetDeg?: number;
    loadRadiusM?: number;
    unloadRadiusM?: number;
}

export const AIRPORT_OVERLAY_DEFAULT_LOAD_RADIUS_M = 15000;
export const AIRPORT_OVERLAY_DEFAULT_UNLOAD_RADIUS_M = 20000;
export const AIRPORT_OVERLAY_FADE_DURATION_S = 1.2;
export const AIRPORT_OVERLAY_CLIP_MIN_TILE_RADIUS_M = 5;
export const AIRPORT_OVERLAY_METADATA_RADIUS_KM = 50;

export const AIRPORT_OVERLAYS: AirportOverlayEntry[] = [
];
