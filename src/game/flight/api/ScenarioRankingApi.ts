import {
    SCENARIO_RESULT_ORDER_HIGHER_WINS,
    SCENARIO_RESULT_ORDER_LOWER_WINS,
    SCENARIO_RANKING_PERIOD_ALL_TIME,
    SCENARIO_RANKING_PERIOD_THIS_WEEK,
} from '../constants/missionScenarioConstants.js';
import { fetchJsonWithTimeout } from './fetchWithTimeout.js';

const RANKING_FETCH_TIMEOUT_MS = 8000;
const SCORE_SUBMIT_TIMEOUT_MS = 8000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const TIME_SECONDS_PAD = 2;
const TIME_MILLIS_PAD = 3;
const SCORE_MAX = 2147483647;
const ACTIVE_USER_MISSION_STATUSES = 'in_progress,started';

export interface MissionRankingEntry {
    rank: number;
    user_id: number;
    username: string;
    score: number;
    runs: number;
}

export interface MissionRankingSelf {
    rank: number;
    score: number;
    runs: number;
}

export interface MissionRanking {
    mission_id: number;
    ranked: boolean;
    order: number;
    period: number;
    data: MissionRankingEntry[];
    me: MissionRankingSelf | null;
}

export function formatScenarioTimeMs(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const totalMs = Math.round(ms);
    const minutes = Math.floor(totalMs / (SECONDS_PER_MINUTE * MS_PER_SECOND));
    const seconds = Math.floor((totalMs % (SECONDS_PER_MINUTE * MS_PER_SECOND)) / MS_PER_SECOND);
    const millis = totalMs % MS_PER_SECOND;
    return `${minutes}:${String(seconds).padStart(TIME_SECONDS_PAD, '0')}.${String(millis).padStart(TIME_MILLIS_PAD, '0')}`;
}

export function formatScenarioResult(value: number, order: number, pointsText: (points: number) => string): string {
    if (!Number.isFinite(value)) return '—';
    return order === SCENARIO_RESULT_ORDER_LOWER_WINS ? formatScenarioTimeMs(value) : pointsText(Math.round(value));
}

export function isBetterScenarioResult(candidate: number, reference: number | null | undefined, order: number): boolean {
    if (!Number.isFinite(candidate)) return false;
    if (reference == null || !Number.isFinite(reference)) return true;
    return order === SCENARIO_RESULT_ORDER_LOWER_WINS ? candidate < reference : candidate > reference;
}

function normalizeRanking(raw: any, missionId: number, period: number): MissionRanking | null {
    if (!raw || typeof raw !== 'object') return null;
    const order = Number(raw.order);
    if (order !== SCENARIO_RESULT_ORDER_HIGHER_WINS && order !== SCENARIO_RESULT_ORDER_LOWER_WINS) return null;
    const rows: any[] = Array.isArray(raw.data) ? raw.data : [];
    const data: MissionRankingEntry[] = [];
    for (const row of rows) {
        const score = Number(row?.score);
        const rank = Number(row?.rank);
        if (!Number.isFinite(score) || !Number.isInteger(rank) || rank <= 0) continue;
        data.push({
            rank,
            user_id: Number(row.user_id),
            username: String(row.username ?? ''),
            score,
            runs: Number.isFinite(Number(row.runs)) ? Number(row.runs) : 0,
        });
    }
    const meScore = Number(raw.me?.score);
    const meRank = Number(raw.me?.rank);
    const me = raw.me && Number.isFinite(meScore) && Number.isInteger(meRank) && meRank > 0
        ? { rank: meRank, score: meScore, runs: Number.isFinite(Number(raw.me.runs)) ? Number(raw.me.runs) : 0 }
        : null;
    return { mission_id: missionId, ranked: raw.ranked === true, order, period, data, me };
}

export async function fetchMissionRanking(missionId: number, period: number, token: string, order?: number | null): Promise<MissionRanking | null> {
    if (!Number.isInteger(missionId) || missionId <= 0) {
        console.warn(`[Ranking] Invalid mission id ${missionId}`);
        return null;
    }
    const safePeriod = period === SCENARIO_RANKING_PERIOD_THIS_WEEK ? SCENARIO_RANKING_PERIOD_THIS_WEEK : SCENARIO_RANKING_PERIOD_ALL_TIME;
    const query = new URLSearchParams({ period: String(safePeriod) });
    if (order === SCENARIO_RESULT_ORDER_HIGHER_WINS || order === SCENARIO_RESULT_ORDER_LOWER_WINS) query.set('order', String(order));
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    try {
        const result = await fetchJsonWithTimeout(`/api/missions/${missionId}/leaderboard?${query.toString()}`, { headers }, RANKING_FETCH_TIMEOUT_MS);
        if (!result.ok) {
            console.warn(`[Ranking] Mission ${missionId} ranking fetch failed: HTTP ${result.status}`);
            return null;
        }
        const ranking = normalizeRanking(result.data, missionId, safePeriod);
        if (!ranking) console.warn(`[Ranking] Mission ${missionId} ranking response has an unexpected shape`);
        return ranking;
    } catch (err) {
        console.warn(`[Ranking] Mission ${missionId} ranking fetch error:`, err);
        return null;
    }
}

export async function fetchStoredUserMissionScore(userMissionId: number, token: string): Promise<number | null> {
    if (!Number.isInteger(userMissionId) || userMissionId <= 0 || !token) return null;
    try {
        const result = await fetchJsonWithTimeout(`/api/user-missions?status=${ACTIVE_USER_MISSION_STATUSES}`, {
            headers: { Authorization: `Bearer ${token}` },
        }, RANKING_FETCH_TIMEOUT_MS);
        if (!result.ok) {
            console.warn(`[Ranking] Stored score lookup failed for user mission ${userMissionId}: HTTP ${result.status}`);
            return null;
        }
        const items: any[] = Array.isArray(result.data?.data) ? result.data.data : [];
        for (const item of items) {
            const row = item?.user_mission ?? item;
            if (Number(row?.id) !== userMissionId) continue;
            const stored = row?.score == null ? Number.NaN : Number(row.score);
            return Number.isFinite(stored) ? stored : null;
        }
        return null;
    } catch (err) {
        console.warn(`[Ranking] Stored score lookup error for user mission ${userMissionId}:`, err);
        return null;
    }
}

export async function submitUserMissionScore(userMissionId: number, score: number, token: string): Promise<number | null> {
    if (!Number.isInteger(userMissionId) || userMissionId <= 0 || !token) {
        console.warn(`[Ranking] Score not submitted: invalid user mission ${userMissionId} or missing session`);
        return null;
    }
    if (!Number.isFinite(score) || score < 0 || score > SCORE_MAX) {
        console.warn(`[Ranking] Score not submitted: value ${score} is outside 0-${SCORE_MAX}`);
        return null;
    }
    const submitted = Math.round(score);
    try {
        const result = await fetchJsonWithTimeout(`/api/user-missions/${userMissionId}/score`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: submitted }),
        }, SCORE_SUBMIT_TIMEOUT_MS);
        if (!result.ok) {
            console.warn(`[Ranking] Score submit failed for user mission ${userMissionId}: HTTP ${result.status}`);
            return null;
        }
        const acceptedRaw = result.data?.result == null ? Number.NaN : Number(result.data.result);
        const accepted = Number.isFinite(acceptedRaw) ? acceptedRaw : submitted;
        console.debug(`[Ranking] Score accepted for user mission ${userMissionId}: submitted=${submitted} accepted=${accepted} verified=${result.data?.verified === true}`);
        return accepted;
    } catch (err) {
        console.warn(`[Ranking] Score submit error for user mission ${userMissionId}:`, err);
        return null;
    }
}
