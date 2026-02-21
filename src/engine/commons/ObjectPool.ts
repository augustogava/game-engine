/**
 * ObjectPool - Generic object pool to minimize GC pressure
 */
export class ObjectPool<T> {
    private pool: T[] = [];
    private factory: () => T;
    private reset: (obj: T) => void;
    private maxSize: number;

    constructor(factory: () => T, reset: (obj: T) => void, initialSize: number = 0, maxSize: number = 10000) {
        this.factory = factory;
        this.reset = reset;
        this.maxSize = maxSize;
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(factory());
        }
    }

    acquire(): T {
        if (this.pool.length > 0) {
            return this.pool.pop()!;
        }
        return this.factory();
    }

    release(obj: T): void {
        if (this.pool.length < this.maxSize) {
            this.reset(obj);
            this.pool.push(obj);
        }
    }

    get available(): number { return this.pool.length; }

    prewarm(count: number): void {
        for (let i = 0; i < count; i++) {
            this.pool.push(this.factory());
        }
    }

    clear(): void { this.pool.length = 0; }
}
