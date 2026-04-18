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
    private _onlineCount = 0;

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
                const players = msg.players.map((p: any) => ({ ...p, userId: String(p.userId) }));
                this.onPlayersUpdateCb?.(players);
            }
            if (msg.type === 'playerJoined' || msg.type === 'playerLeft') {
                this._onlineCount = msg.onlineCount;
                this.onCountChangeCb?.(this._onlineCount);
            }
        });

        this.rt.onClose((code) => {
            if (code === 4001) this.onAuthFailureCb?.();
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
            }
        });
        this.rt.connect();
    }

    sendUpdate(state: Omit<PlayerState, 'userId'>): void {
        this.rt.sendThrottled({
            type: 'update',
            ...state,
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

    dispose(): void {
        this.rt.dispose();
    }
}
