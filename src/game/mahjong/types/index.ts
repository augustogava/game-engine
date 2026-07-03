/**
 * Mahjong Solitaire — shared types and numeric enums.
 * Enums use numeric values (no strings) per project convention.
 */

export const TILE_GROUP = {
    SUIT_DOTS: 1,
    SUIT_BAMBOO: 2,
    SUIT_CHAR: 3,
    WIND: 4,
    DRAGON: 5,
    FLOWER: 6,
    SEASON: 7,
} as const;
export type TileGroup = typeof TILE_GROUP[keyof typeof TILE_GROUP];

export const GAME_STATE = {
    LOADING: 1,
    EMAIL_GATE: 2,
    PLAYING: 3,
    WON: 4,
    LOST: 5,
} as const;
export type GameState = typeof GAME_STATE[keyof typeof GAME_STATE];

/** Visual + matching definition for one of the 42 distinct tile faces. */
export interface TileFace {
    id: number;
    group: TileGroup;
    /** Primary glyph drawn large on the tile face. */
    glyph: string;
    /** Suit rank (1-9) for suited tiles, 0 otherwise. */
    rank: number;
    /** Theme color (hex) used when drawing the face. */
    color: string;
    /** Pip count to draw for the dots suit (0 = no pips). */
    pips: number;
    /** Bar count to draw for the bamboo suit (0 = no bars). */
    bars: number;
}

/** A slot position in the half-cell grid. A tile occupies a 2x2 half-cell footprint. */
export interface SlotPosition {
    gx: number;
    gy: number;
    layer: number;
}

/** A live tile on the board. */
export interface Tile {
    id: number;
    faceId: number;
    pos: SlotPosition;
    removed: boolean;
    /** Face-down tile: shows the green back until flipped to reveal its face. */
    hidden: boolean;
    /** Babylon base mesh (any to avoid importing BABYLON types here). */
    mesh: any;
    symbolMesh: any;
}

/** Player rank (league) snapshot returned by the backend. */
export interface RankInfo {
    rankOrder: number;
    maxRank: number;
    rankName: string;
    color: string;
    icon: string;
    /** Position inside the same-rank cohort by points earned this period. */
    position: number;
    cohortSize: number;
    periodPoints: number;
    rankUpTopN: number;
    rankUpDays: number;
    /** Epoch ms when the current evaluation period closes. */
    periodEndsAt: number;
}

export interface MahjongUser {
    userId: string;
    name: string;
    email?: string;
    totalPoints: number;
    bestIq: number;
    bestLevel: number;
    rank?: RankInfo | null;
}

export interface WinResult {
    level: number;
    tiles: number;
    timeMs: number;
    points: number;
    iq: number;
    combo: number;
}

export interface LeaderboardEntry {
    rank: number;
    name: string;
    totalPoints: number;
    /** Points earned in the current rank evaluation period. */
    periodPoints: number;
    iq: number;
    level: number;
    isSelf: boolean;
}

/** Rank cohort metadata for the leaderboard panel (null = global fallback). */
export interface LeaderboardRankMeta {
    rankOrder: number;
    rankName: string;
    color: string;
    icon: string;
    rankUpTopN: number;
    rankUpDays: number;
}

export interface LeaderboardResponse {
    rank: LeaderboardRankMeta | null;
    entries: LeaderboardEntry[];
}
