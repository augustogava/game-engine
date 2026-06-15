/**
 * The 42 distinct Mahjong tile faces: 3 suits (1-9), 4 winds, 3 dragons,
 * 4 flowers, 4 seasons. faceId is the index into TILE_FACES.
 */
import { TILE_GROUP, type TileFace } from '../types/index.js';

const CN_NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

const COLOR_DOTS = '#1565c0';
const COLOR_BAMBOO = '#2e7d32';
const COLOR_CHAR = '#b00020';
const COLOR_WIND = '#303f9f';
const COLOR_DRAGON_RED = '#c62828';
const COLOR_DRAGON_GREEN = '#2e7d32';
const COLOR_DRAGON_WHITE = '#37474f';
const COLOR_FLOWER = '#ad1457';
const COLOR_SEASON = '#00838f';

function buildFaces(): TileFace[] {
    const faces: TileFace[] = [];
    let id = 0;

    // Dots 1-9
    for (let rank = 1; rank <= 9; rank++) {
        faces.push({ id: id++, group: TILE_GROUP.SUIT_DOTS, glyph: String(rank), rank, color: COLOR_DOTS, pips: rank, bars: 0 });
    }
    // Bamboo 1-9
    for (let rank = 1; rank <= 9; rank++) {
        faces.push({ id: id++, group: TILE_GROUP.SUIT_BAMBOO, glyph: String(rank), rank, color: COLOR_BAMBOO, pips: 0, bars: rank });
    }
    // Characters 1-9 (萬)
    for (let rank = 1; rank <= 9; rank++) {
        faces.push({ id: id++, group: TILE_GROUP.SUIT_CHAR, glyph: CN_NUMERALS[rank], rank, color: COLOR_CHAR, pips: 0, bars: 0 });
    }
    // Winds: East, South, West, North
    for (const g of ['東', '南', '西', '北']) {
        faces.push({ id: id++, group: TILE_GROUP.WIND, glyph: g, rank: 0, color: COLOR_WIND, pips: 0, bars: 0 });
    }
    // Dragons: Red (中), Green (發), White (□)
    faces.push({ id: id++, group: TILE_GROUP.DRAGON, glyph: '中', rank: 0, color: COLOR_DRAGON_RED, pips: 0, bars: 0 });
    faces.push({ id: id++, group: TILE_GROUP.DRAGON, glyph: '發', rank: 0, color: COLOR_DRAGON_GREEN, pips: 0, bars: 0 });
    faces.push({ id: id++, group: TILE_GROUP.DRAGON, glyph: '□', rank: 0, color: COLOR_DRAGON_WHITE, pips: 0, bars: 0 });
    // Flowers: Plum, Orchid, Chrysanthemum, Bamboo (match as a group)
    for (const g of ['梅', '蘭', '菊', '竹']) {
        faces.push({ id: id++, group: TILE_GROUP.FLOWER, glyph: g, rank: 0, color: COLOR_FLOWER, pips: 0, bars: 0 });
    }
    // Seasons: Spring, Summer, Autumn, Winter (match as a group)
    for (const g of ['春', '夏', '秋', '冬']) {
        faces.push({ id: id++, group: TILE_GROUP.SEASON, glyph: g, rank: 0, color: COLOR_SEASON, pips: 0, bars: 0 });
    }

    return faces;
}

export const TILE_FACES: TileFace[] = buildFaces();

/** Two faces match if identical, or both flowers, or both seasons. */
export function facesMatch(aId: number, bId: number): boolean {
    if (aId === bId) return true;
    const a = TILE_FACES[aId];
    const b = TILE_FACES[bId];
    if (!a || !b) return false;
    if (a.group === TILE_GROUP.FLOWER && b.group === TILE_GROUP.FLOWER) return true;
    if (a.group === TILE_GROUP.SEASON && b.group === TILE_GROUP.SEASON) return true;
    return false;
}

/** Pairs each face contributes per "set": suited/honor tiles have 4 copies (2 pairs), bonus tiles 1 pair. */
function pairsPerFace(face: TileFace): number {
    return (face.group === TILE_GROUP.FLOWER || face.group === TILE_GROUP.SEASON) ? 1 : 2;
}

/**
 * Builds a list of faceIds (one entry per pair) totalling `pairCount` pairs,
 * cycling through the canonical distribution and shuffling for variety.
 */
export function buildPairFaceIds(pairCount: number, rng: () => number): number[] {
    const base: number[] = [];
    for (const face of TILE_FACES) {
        const n = pairsPerFace(face);
        for (let i = 0; i < n; i++) base.push(face.id);
    }
    const result: number[] = [];
    while (result.length < pairCount) {
        const shuffled = base.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        for (const id of shuffled) {
            if (result.length >= pairCount) break;
            result.push(id);
        }
    }
    return result;
}
