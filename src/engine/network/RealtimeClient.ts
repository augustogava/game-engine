export interface RealtimeClientConfig {
    path?: string;
    sendRateMs?: number;
    reconnect?: boolean;
    maxReconnectDelay?: number;
}

type MessageCallback = (msg: any) => void;
type ConnectionCallback = (connected: boolean) => void;
type CloseCallback = (code: number, reason: string) => void;

export class RealtimeClient {
    private ws: WebSocket | null = null;
    private disposed = false;
    private lastSendTime = 0;
    private reconnectDelay = 1000;

    private readonly path: string;
    private readonly sendRateMs: number;
    private readonly shouldReconnect: boolean;
    private readonly maxReconnectDelay: number;

    private messageListeners: MessageCallback[] = [];
    private connectionListeners: ConnectionCallback[] = [];
    private closeListeners: CloseCallback[] = [];
    private _connected = false;
    private _lastMessageMs = 0;
    private _recentMessageTimestamps: number[] = [];
    private _messagesReceived = 0;
    private _malformedReceived = 0;

    constructor(config: RealtimeClientConfig = {}) {
        this.path = config.path ?? '/ws';
        this.sendRateMs = config.sendRateMs ?? 50;
        this.shouldReconnect = config.reconnect ?? true;
        this.maxReconnectDelay = config.maxReconnectDelay ?? 15000;
    }

    get connected(): boolean { return this._connected; }

    connect(): void {
        if (this.disposed) return;

        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${proto}//${location.host}${this.path}`;

        try {
            this.ws = new WebSocket(url);
        } catch (e) {
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            this._connected = true;
            this.reconnectDelay = 1000;
            this.notifyConnection(true);
        };

        this.ws.onmessage = (ev) => {
            const now = performance.now();
            this._lastMessageMs = now;
            this._messagesReceived++;
            this._recentMessageTimestamps.push(now);
            const cutoff = now - 5000;
            while (this._recentMessageTimestamps.length > 0 && this._recentMessageTimestamps[0] < cutoff) {
                this._recentMessageTimestamps.shift();
            }
            try {
                const msg = JSON.parse(ev.data);
                for (const cb of this.messageListeners) cb(msg);
            } catch (e) {
                this._malformedReceived++;
                const preview = typeof ev.data === 'string' ? ev.data.slice(0, 64) : '<binary>';
                console.warn(`[RealtimeClient] malformed message (preview): ${preview}`);
            }
        };

        this.ws.onclose = (ev) => {
            this._connected = false;
            this.notifyConnection(false);
            for (const cb of this.closeListeners) cb(ev.code, ev.reason);
            if (ev.code >= 4000) return;
            this.scheduleReconnect();
        };

        this.ws.onerror = () => {
            this.ws?.close();
        };
    }

    send(data: Record<string, any>): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(data));
    }

    sendThrottled(data: Record<string, any>): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const now = performance.now();
        if (now - this.lastSendTime < this.sendRateMs) return;
        this.lastSendTime = now;
        this.ws.send(JSON.stringify(data));
    }

    onMessage(cb: MessageCallback): void {
        this.messageListeners.push(cb);
    }

    onConnectionChange(cb: ConnectionCallback): void {
        this.connectionListeners.push(cb);
    }

    onClose(cb: CloseCallback): void {
        this.closeListeners.push(cb);
    }

    getLastMessageAgeMs(): number {
        if (this._lastMessageMs <= 0) return -1;
        return performance.now() - this._lastMessageMs;
    }

    getRecentMessageRateHz(): number {
        return this._recentMessageTimestamps.length / 5;
    }

    getMalformedCount(): number {
        return this._malformedReceived;
    }

    getMessagesReceived(): number {
        return this._messagesReceived;
    }

    dispose(): void {
        this.disposed = true;
        this.ws?.close();
        this.ws = null;
        this.messageListeners = [];
        this.connectionListeners = [];
        this.closeListeners = [];
    }

    private notifyConnection(connected: boolean): void {
        for (const cb of this.connectionListeners) cb(connected);
    }

    private scheduleReconnect(): void {
        if (this.disposed || !this.shouldReconnect) return;
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
    }
}
