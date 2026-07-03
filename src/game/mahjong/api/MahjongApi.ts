/** REST client for the Mahjong backend (/api/mahjong/*). */
import type { LeaderboardEntry, MahjongUser, RankInfo, WinResult } from '../types/index.js';

const API_BASE = '/api/mahjong';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (!res.ok) {
        let detail = '';
        try { detail = (await res.json())?.error || ''; } catch (_) { /* ignore */ }
        throw new Error(detail || `Mahjong API ${path} failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
}

export const MahjongApi = {
    async register(email: string, location: string | null): Promise<MahjongUser> {
        return apiFetch<MahjongUser>('/register', {
            method: 'POST',
            body: JSON.stringify({ email, location: location || undefined }),
        });
    },

    async getPlayer(userId: string): Promise<MahjongUser> {
        return apiFetch<MahjongUser>(`/player?userId=${encodeURIComponent(userId)}`);
    },

    async submitScore(userId: string, result: WinResult, won: boolean): Promise<{ totalPoints: number; bestIq: number; bestLevel: number; rank: RankInfo | null }> {
        return apiFetch('/score', {
            method: 'POST',
            body: JSON.stringify({
                userId,
                level: result.level,
                tiles: result.tiles,
                timeMs: result.timeMs,
                points: result.points,
                iq: result.iq,
                combo: result.combo,
                won: won ? 1 : 0,
            }),
        });
    },

    async getLeaderboard(userId: string | null): Promise<LeaderboardEntry[]> {
        const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
        return apiFetch<LeaderboardEntry[]>(`/leaderboard${q}`);
    },
};
