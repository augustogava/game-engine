import { I18n } from '../../I18n.js';

const GAME_REQUESTED_WITH_HEADER = 'SimFlightProGame';
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_CONFLICT = 409;

type ToastFn = (message: string, durationMs?: number) => void;

export function isValidFlightLogId(value: unknown): value is number {
    const id = Number(value);
    return Number.isInteger(id) && id > 0;
}

/**
 * Publishes a landed flight through the game proxy and returns the public URL.
 * Resolves to null on any failure; the reason is surfaced through the toast callback.
 */
export async function publishFlightLog(flightLogId: number, toast: ToastFn): Promise<string | null> {
    if (!isValidFlightLogId(flightLogId)) {
        console.warn(`[Share] Invalid flight log id: ${String(flightLogId)}`);
        return null;
    }
    const token = localStorage.getItem('auth_token') || '';
    if (!token) {
        toast(I18n.t('share.loginRequired'));
        return null;
    }
    try {
        const res = await fetch(`/api/flight-logs/${flightLogId}/share`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Requested-With': GAME_REQUESTED_WITH_HEADER,
            },
            body: JSON.stringify({ public: true }),
        });
        if (!res.ok) {
            console.warn(`[Share] Publish failed for flight log ${flightLogId}: HTTP ${res.status}`);
            if (res.status === HTTP_STATUS_UNAUTHORIZED) toast(I18n.t('share.loginRequired'));
            else if (res.status === HTTP_STATUS_NOT_FOUND) toast(I18n.t('share.notFound'));
            else if (res.status === HTTP_STATUS_CONFLICT) toast(I18n.t('share.notLanded'));
            else toast(I18n.t('share.failed'));
            return null;
        }
        const json = await res.json();
        const url = typeof json?.url === 'string' ? json.url : '';
        if (!url) {
            console.warn(`[Share] Publish response for flight log ${flightLogId} has no url`);
            toast(I18n.t('share.failed'));
            return null;
        }
        console.log(`[Share] Flight log ${flightLogId} published: ${url}`);
        return url;
    } catch (err) {
        console.error(`[Share] Publish error for flight log ${flightLogId}:`, err);
        toast(I18n.t('share.failed'));
        return null;
    }
}

/** Opens the native share sheet when available, otherwise copies the link to the clipboard. */
export async function shareFlightUrl(url: string, toast: ToastFn): Promise<void> {
    if (typeof url !== 'string' || !url) return;
    const nav = navigator as Navigator & { share?: (data: { url: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
        try {
            await nav.share({ url });
            return;
        } catch (err) {
            const aborted = err instanceof DOMException && err.name === 'AbortError';
            if (aborted) return;
            console.warn('[Share] Native share failed, falling back to clipboard:', err);
        }
    }
    try {
        await navigator.clipboard.writeText(url);
        toast(I18n.t('share.copied'));
    } catch (err) {
        console.warn('[Share] Clipboard write failed:', err);
        toast(url);
    }
}

/** Publishes the flight and immediately shares the returned link. */
export async function publishAndShareFlightLog(flightLogId: number, toast: ToastFn): Promise<void> {
    toast(I18n.t('share.publishing'));
    const url = await publishFlightLog(flightLogId, toast);
    if (url) await shareFlightUrl(url, toast);
}
