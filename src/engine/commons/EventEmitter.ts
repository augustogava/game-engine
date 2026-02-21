/**
 * EventEmitter - Lightweight typed event bus
 */
type Listener<T = unknown> = (data: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventEmitter<EventMap extends Record<string, any> = Record<string, any>> {
    private listeners: Map<string, Set<Listener<unknown>>> = new Map();
    private onceListeners: Map<string, Set<Listener<unknown>>> = new Map();

    on<K extends keyof EventMap & string>(event: K, listener: Listener<EventMap[K]>): this {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)!.add(listener as Listener<unknown>);
        return this;
    }

    off<K extends keyof EventMap & string>(event: K, listener: Listener<EventMap[K]>): this {
        this.listeners.get(event)?.delete(listener as Listener<unknown>);
        this.onceListeners.get(event)?.delete(listener as Listener<unknown>);
        return this;
    }

    once<K extends keyof EventMap & string>(event: K, listener: Listener<EventMap[K]>): this {
        if (!this.onceListeners.has(event)) this.onceListeners.set(event, new Set());
        this.onceListeners.get(event)!.add(listener as Listener<unknown>);
        return this;
    }

    emit<K extends keyof EventMap & string>(event: K, data?: EventMap[K]): this {
        this.listeners.get(event)?.forEach(l => l(data as unknown));
        const onceSet = this.onceListeners.get(event);
        if (onceSet) {
            onceSet.forEach(l => l(data as unknown));
            onceSet.clear();
        }
        return this;
    }

    removeAllListeners(event?: string): this {
        if (event) { this.listeners.delete(event); this.onceListeners.delete(event); }
        else { this.listeners.clear(); this.onceListeners.clear(); }
        return this;
    }
}
