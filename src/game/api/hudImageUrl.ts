export const HUD_IMAGE_PLACEHOLDER =
    'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">' +
        '<rect width="120" height="80" fill="#0a1620"/>' +
        '<path d="M60 18 L38 52 L60 44 L82 52 Z" fill="#1a4a3a" stroke="#40ffaa" stroke-width="1.5"/>' +
        '</svg>',
    );

export type HudImageItem = {
    image_url?: string | null;
    mission?: { image_url?: string; image_base64?: string };
    aircraft?: { thumbnail_url?: string };
};

export function resolveHudImageUrl(item: HudImageItem): string | null {
    const url =
        item.image_url ??
        item.mission?.image_url ??
        item.mission?.image_base64 ??
        item.aircraft?.thumbnail_url ??
        null;
    if (url && /^https?:\/\//i.test(url) && url.includes('/api/uploads/')) {
        console.warn('[HUD] image_url contains /api/uploads — expected API origin without /api prefix:', url);
    }
    return url;
}

export function hudImgOnError(el: HTMLImageElement): void {
    if (el.dataset.hudPlaceholder === '1') return;
    el.dataset.hudPlaceholder = '1';
    el.src = HUD_IMAGE_PLACEHOLDER;
}

export function renderHudThumbHtml(
    item: HudImageItem,
    alt: string,
    size: { w: number; h: number } = { w: 72, h: 48 },
): string {
    const src = resolveHudImageUrl(item);
    const style = `width:${size.w}px;height:${size.h}px;object-fit:cover;border-radius:4px;border:1px solid rgba(80,255,160,.25);flex-shrink:0;background:#0a1620`;
    if (!src) {
        return `<img src="${HUD_IMAGE_PLACEHOLDER}" alt="${escapeHtml(alt)}" style="${style}" loading="lazy" decoding="async"/>`;
    }
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="${style}" loading="lazy" decoding="async" onerror="this.dataset.hudPlaceholder='1';this.src='${HUD_IMAGE_PLACEHOLDER}'"/>`;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
