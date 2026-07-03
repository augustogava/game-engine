/**
 * Preloads and caches the generated PNG art for the decorative tile faces
 * (gold tile 33, friendly animals 34-37) so faceRenderer can composite them
 * synchronously onto the glossy tile background.
 */
import { MAHJONG_FACE_ART_BASE_URL } from '../constants/graphicsConstants.js';

/** Face ids that have generated artwork (gold treasure + friendly animals). */
export const ART_FACE_IDS: readonly number[] = [33, 34, 35, 36, 37];

const artCache = new Map<number, HTMLImageElement>();
let loaded = false;

function loadOne(faceId: number): Promise<void> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { artCache.set(faceId, img); resolve(); };
        img.onerror = () => {
            console.warn(`[faceArt] Failed to load art for face ${faceId} at ${img.src}`);
            resolve();
        };
        img.src = `${MAHJONG_FACE_ART_BASE_URL}face-${faceId}.png`;
    });
}

/** Preloads every decorative face image. Resolves even if some fail to load. */
export async function loadFaceArt(): Promise<void> {
    if (loaded) return;
    await Promise.all(ART_FACE_IDS.map(loadOne));
    loaded = true;
    console.debug(`[faceArt] Loaded ${artCache.size}/${ART_FACE_IDS.length} face art images`);
}

/** Returns the preloaded art image for a face, or null when none exists. */
export function getFaceArt(faceId: number): HTMLImageElement | null {
    return artCache.get(faceId) ?? null;
}
