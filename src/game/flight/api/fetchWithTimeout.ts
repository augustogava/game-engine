export class FetchTimeoutError extends Error {
    constructor(url: string, timeoutMs: number) {
        super(`Request to ${url} timed out after ${timeoutMs}ms`);
        this.name = 'FetchTimeoutError';
    }
}

export interface JsonFetchResult {
    ok: boolean;
    status: number;
    data: any;
    headers: Headers | null;
}

export async function fetchJsonWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    externalSignal?: AbortSignal | null,
): Promise<JsonFetchResult> {
    const controller = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
        if (externalSignal.aborted) controller.abort();
        else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs)
        : null;
    try {
        const resp = await fetch(url, { ...init, signal: controller.signal });
        if (!resp.ok) return { ok: false, status: resp.status, data: null, headers: resp.headers };
        const data = await resp.json();
        return { ok: true, status: resp.status, data, headers: resp.headers };
    } catch (err) {
        if (timedOut) throw new FetchTimeoutError(url, timeoutMs);
        throw err;
    } finally {
        if (timer !== null) clearTimeout(timer);
        externalSignal?.removeEventListener('abort', onExternalAbort);
    }
}
