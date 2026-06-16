/**
 * The 42 distinct Mahjong tile faces: 3 suits (1-9), 4 winds, 3 dragons,
 * 4 flowers, 4 seasons. faceId is the index into TILE_FACES.
 */
import { TILE_GROUP, type TileFace } from '../types/index.js';

const CN_NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

const COLOR_DOTS = '#0d74ff';
const COLOR_BAMBOO = '#12863a';
const COLOR_CHAR = '#e21030';
const COLOR_WIND = '#2433c4';
const COLOR_DRAGON_RED = '#e51b1b';
const COLOR_DRAGON_GREEN = '#129b46';
const COLOR_DRAGON_WHITE = '#2b6cb0';
const COLOR_FLOWER = '#d81b76';
const COLOR_SEASON = '#00a7b5';

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

function shuffleInPlace(ids: number[], rng: () => number): number[] {
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
}

/**
 * Builds a list of faceIds (one entry per pair) totalling `pairCount` pairs,
 * biased toward maximum distinctness: every distinct face is used once before
 * any face repeats (a second pair, only for faces that allow it). Scarcer
 * duplicate matches mean the small tray fills faster, raising difficulty.
 */
export function buildPairFaceIds(pairCount: number, rng: () => number): number[] {
    const distinctRound = shuffleInPlace(TILE_FACES.map(f => f.id), rng);
    const repeatRound = shuffleInPlace(
        TILE_FACES.filter(f => pairsPerFace(f) >= 2).map(f => f.id), rng,
    );
    const ordered = [...distinctRound, ...repeatRound];

    const result: number[] = [];
    let i = 0;
    while (result.length < pairCount) {
        if (i >= ordered.length) {
            i = 0;
            shuffleInPlace(ordered, rng);
        }
        result.push(ordered[i++]);
    }
    return result;
}
