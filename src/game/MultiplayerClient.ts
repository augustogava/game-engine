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
}

type PlayersUpdateCallback = (players: PlayerState[]) => void;
type CountChangeCallback = (count: number) => void;

export class MultiplayerClient {
    private rt: RealtimeClient;
    private userId: string;
    private onPlayersUpdateCb: PlayersUpdateCallback | null = null;
    private onCountChangeCb: CountChangeCallback | null = null;
    private _onlineCount = 0;

    constructor(userId: string) {
        this.userId = userId;
        this.rt = new RealtimeClient({ path: '/ws', sendRateMs: 50 });

        this.rt.onMessage((msg) => {
            if (msg.type === 'welcome') {
                this._onlineCount = msg.onlineCount;
                this.onCountChangeCb?.(this._onlineCount);
            }
            if (msg.type === 'state' && Array.isArray(msg.players)) {
                this.onPlayersUpdateCb?.(msg.players);
            }
            if (msg.type === 'playerJoined' || msg.type === 'playerLeft') {
                this._onlineCount = msg.onlineCount;
                this.onCountChangeCb?.(this._onlineCount);
            }
        });
    }

    get onlineCount(): number { return this._onlineCount; }
    get connected(): boolean { return this.rt.connected; }

    connect(): void {
        this.rt.onConnectionChange((connected) => {
            if (connected) {
                this.rt.send({ type: 'join', userId: this.userId });
            }
        });
        this.rt.connect();
    }

    sendUpdate(state: Omit<PlayerState, 'userId'>): void {
        this.rt.sendThrottled({
            type: 'update',
            userId: this.userId,
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

    dispose(): void {
        this.rt.dispose();
    }
}
