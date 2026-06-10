import { RealtimeClient } from '../engine/network/RealtimeClient.js';

export interface PlayerState {
    userId: string;
    lat: number;
    lon: number;
    alt: number;
    airspeed: number;
    throttle: number;
    heading: number;
    pitch: number;
    roll: number;
    onGround?: boolean;
    missionId?: number;
    flightPlanId?: number;
    aircraftRegistration?: string;
    aircraftId?: number;
    aircraftCode?: string;
    aircraftModelFile?: string;
    username?: string;
    avatarUrl?: string;
}

type PlayersUpdateCallback = (players: PlayerState[]) => void;
type CountChangeCallback = (count: number) => void;

export class MultiplayerClient {
    private rt: RealtimeClient;
    private token: string;
    private _userId: string = '';
    private _username: string = '';
    private onPlayersUpdateCb: PlayersUpdateCallback | null = null;
    private onCountChangeCb: CountChangeCallback | null = null;
    private onAuthFailureCb: (() => void) | null = null;
    private onNoFlightHoursCb: (() => void) | null = null;
    private _onFlightLogEndedCb: ((msg: any) => void) | null = null;
    private _onAchievementsUnlockedCb: ((achievements: any[]) => void) | null = null;
    private _onDailyBonusCb: ((msg: any) => void) | null = null;
    private _onlineCount = 0;
    private _pendingCrash: { reason: string; altitudeFt: number; verticalSpeedFpm: number } | null = null;

    constructor(token: string) {
        this.token = token;
        this.rt = new RealtimeClient({ path: '/ws', sendRateMs: 50 });

        this.rt.onMessage((msg) => {
            if (msg.type === 'welcome') {
                this._userId = String(msg.userId);
                this._username = msg.username || '';
                this._onlineCount = msg.onlineCount;
                this.onCountChangeCb?.(this._onlineCount);
            }
            if (msg.type === 'state' && Array.isArray(msg.players)) {
                const players = msg.players as PlayerState[];
                for (let i = 0; i < players.length; i++) {
                    players[i].userId = String(players[i].userId);
                }
                this.onPlayersUpdateCb?.(players);
            }
            if (msg.type === 'playerJoined' || msg.type === 'playerLeft') {
                this._onlineCount = msg.onlineCount;
                this.onCountChangeCb?.(this._onlineCount);
            }
            if (msg.type === 'noFlightHours') {
                this.onNoFlightHoursCb?.();
            }
            if (msg.type === 'flightLogStarted') {
                console.log(`[FlightLog] STARTED id=${msg.flightLogId} aircraftId=${msg.aircraftId} type=${msg.aircraftType} departureAirportId=${msg.departureAirportId} missionId=${msg.missionId} userMissionId=${msg.userMissionId} flightPlanId=${msg.flightPlanId}`);
            }
            if (msg.type === 'flightLogUpdated') {
                console.log(`[FlightLog] UPDATED id=${msg.flightLogId} distance=${msg.distanceKm}km/${msg.distanceNm}nm maxAlt=${msg.maxAltitudeFt}ft avgSpd=${msg.avgSpeedKnots}kts routePts=${msg.routePoints}`);
            }
            if (msg.type === 'flightLogEnded') {
                console.log(`[FlightLog] ENDED id=${msg.flightLogId} status=${msg.status} distance=${msg.distanceKm}km/${msg.distanceNm}nm maxAlt=${msg.maxAltitudeFt}ft avgSpd=${msg.avgSpeedKnots}kts landingFpm=${msg.landingRateFpm} arrivalAirportId=${msg.arrivalAirportId}`);
                this._onFlightLogEndedCb?.(msg);
            }
            if (msg.type === 'flightLogSkipped') {
                console.warn(`[FlightLog] SKIPPED reason=${msg.reason} received=${msg.received}`);
            }
            if (msg.type === 'achievementsUnlocked' && Array.isArray(msg.achievements) && msg.achievements.length) {
                console.log(`[Achievements] Unlocked: ${msg.achievements.map((a: any) => a.code).join(', ')}`);
                this._onAchievementsUnlockedCb?.(msg.achievements);
            }
            if (msg.type === 'dailyBonus') {
                console.log(`[Daily] Bonus received: streakDays=${msg.streakDays} streakPoints=${msg.streakPoints} dailyMissionPoints=${msg.dailyMissionPoints}`);
                this._onDailyBonusCb?.(msg);
            }
        });

        this.rt.onClose((code) => {
            if (code === 4001) this.onAuthFailureCb?.();
            if (code === 4002) this.onNoFlightHoursCb?.();
        });
    }

    get userId(): string { return this._userId; }
    get username(): string { return this._username; }
    get onlineCount(): number { return this._onlineCount; }
    get connected(): boolean { return this.rt.connected; }

    connect(): void {
        this.rt.onConnectionChange((connected) => {
            if (connected) {
                this.rt.send({ type: 'join', token: this.token });
                this._flushPendingCrash();
            }
        });
        this.rt.connect();
    }

    private _flushPendingCrash(): void {
        if (!this._pendingCrash) return;
        if (!this.rt.connected) return;
        const pending = this._pendingCrash;
        this._pendingCrash = null;
        console.log(`[Crash] Flushing queued crash after (re)connect reason=${pending.reason} altFt=${pending.altitudeFt} vsFpm=${pending.verticalSpeedFpm}`);
        this.rt.send({
            type: 'crash',
            reason: pending.reason,
            altitudeFt: pending.altitudeFt,
            verticalSpeedFpm: pending.verticalSpeedFpm,
        });
    }

    sendUpdate(state: Omit<PlayerState, 'userId'>): void {
        this.rt.sendThrottled({
            type: 'update',
            ...state,
        });
    }

    sendCrash(reason: string, altitudeFt: number, verticalSpeedFpm: number): void {
        const safeReason = (typeof reason === 'string' && reason.length > 0) ? reason.slice(0, 64) : 'unknown';
        const safeAlt = Number.isFinite(altitudeFt) ? Math.round(altitudeFt) : 0;
        const safeVs = Number.isFinite(verticalSpeedFpm) ? Math.round(verticalSpeedFpm) : 0;
        if (!this.rt.connected) {
            this._pendingCrash = { reason: safeReason, altitudeFt: safeAlt, verticalSpeedFpm: safeVs };
            console.warn(`[Crash] sendCrash queued: WebSocket not connected (reason=${safeReason}); will flush on reconnect`);
            return;
        }
        console.log(`[Crash] sendCrash reason=${safeReason} altFt=${safeAlt} vsFpm=${safeVs}`);
        this.rt.send({
            type: 'crash',
            reason: safeReason,
            altitudeFt: safeAlt,
            verticalSpeedFpm: safeVs,
        });
    }

    onPlayersUpdate(cb: PlayersUpdateCallback): void {
        this.onPlayersUpdateCb = cb;
    }

    onPlayerCountChange(cb: CountChangeCallback): void {
        this.onCountChangeCb = cb;
    }

    onConnectionChange(cb: (connected: boolean) => void): void {
        this.rt.onConnectionChange(cb);
    }

    onAuthFailure(cb: () => void): void {
        this.onAuthFailureCb = cb;
    }

    onNoFlightHours(cb: () => void): void {
        this.onNoFlightHoursCb = cb;
    }

    onFlightLogEnded(cb: (msg: any) => void): void {
        this._onFlightLogEndedCb = cb;
    }

    onAchievementsUnlocked(cb: (achievements: any[]) => void): void {
        this._onAchievementsUnlockedCb = cb;
    }

    onDailyBonus(cb: (msg: any) => void): void {
        this._onDailyBonusCb = cb;
    }

    getLastMessageAgeMs(): number {
        return this.rt.getLastMessageAgeMs();
    }

    getRecentMessageRateHz(): number {
        return this.rt.getRecentMessageRateHz();
    }

    getMalformedCount(): number {
        return this.rt.getMalformedCount();
    }

    getMessagesReceived(): number {
        return this.rt.getMessagesReceived();
    }

    dispose(): void {
        this.rt.dispose();
    }
}
