import type * as BABYLON from '@babylonjs/core';

export type GpuTier = 'low' | 'medium' | 'high' | 'ultra';

const GPU_TIER_MIN_MEMORY_GB_HIGH = 8;
const GPU_TIER_MIN_MEMORY_GB_MEDIUM = 4;
const GPU_TIER_MIN_CORES_HIGH = 8;
const GPU_TIER_MIN_CORES_MEDIUM = 4;
const GPU_TIER_MIN_TEXTURE_SIZE_HIGH = 16384;
const GPU_TIER_MIN_TEXTURE_SIZE_MEDIUM = 8192;
const GPU_TIER_LOW_RENDERER_PATTERNS = [
    /swiftshader/i,
    /llvmpipe/i,
    /software/i,
    /intel\(r\) (hd|uhd) graphics [3-6]\d{2}\b/i,
    /mali-4\d{2}/i,
    /adreno \(tm\) [1-5]\d{2}/i,
    /powervr/i,
];
const GPU_TIER_ULTRA_RENDERER_PATTERNS = [
    /rtx (30|40|50)\d{2}/i,
    /radeon rx (6|7|8)\d{3}/i,
    /apple m[2-9]/i,
];
const GPU_TIER_HIGH_RENDERER_PATTERNS = [
    /rtx/i,
    /gtx 1[06]\d{2}/i,
    /radeon rx 5\d{3}/i,
    /apple m1/i,
    /apple gpu/i,
    /arc a\d{3}/i,
];

function getRendererString(engine: BABYLON.AbstractEngine): string {
    try {
        const engineAny = engine as any;
        const glInfo = typeof engineAny.getGlInfo === 'function' ? engineAny.getGlInfo() : null;
        const renderer = glInfo?.renderer || '';
        const vendor = glInfo?.vendor || '';
        return `${vendor} ${renderer}`.trim();
    } catch (_) {
        return '';
    }
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(text));
}

/**
 * Heuristic hardware tier used only to pick the initial graphics preset on first visit.
 * Combines the unmasked GL renderer string with memory/cores/texture-size caps; any
 * failure falls back to the mobile/desktop binary.
 */
export function detectGpuTier(engine: BABYLON.AbstractEngine | null | undefined, isMobile: boolean): GpuTier {
    if (!engine) return isMobile ? 'low' : 'high';

    const renderer = getRendererString(engine);
    let maxTextureSize = 0;
    try {
        const caps = engine.getCaps();
        maxTextureSize = Number.isFinite(caps?.maxTextureSize) ? caps.maxTextureSize : 0;
    } catch (_) { /* ignore */ }

    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    const memoryGb = nav && Number.isFinite(nav.deviceMemory) ? Number(nav.deviceMemory) : 0;
    const cores = nav && Number.isFinite(nav.hardwareConcurrency) ? Number(nav.hardwareConcurrency) : 0;

    if (renderer && matchesAny(renderer, GPU_TIER_LOW_RENDERER_PATTERNS)) return 'low';

    if (isMobile) {
        const strongMobile = maxTextureSize >= GPU_TIER_MIN_TEXTURE_SIZE_HIGH
            && (memoryGb === 0 || memoryGb >= GPU_TIER_MIN_MEMORY_GB_MEDIUM)
            && (cores === 0 || cores >= GPU_TIER_MIN_CORES_HIGH);
        return strongMobile ? 'medium' : 'low';
    }

    if (renderer && matchesAny(renderer, GPU_TIER_ULTRA_RENDERER_PATTERNS)) {
        const enoughSystem = (memoryGb === 0 || memoryGb >= GPU_TIER_MIN_MEMORY_GB_HIGH)
            && (cores === 0 || cores >= GPU_TIER_MIN_CORES_HIGH);
        return enoughSystem ? 'ultra' : 'high';
    }
    if (renderer && matchesAny(renderer, GPU_TIER_HIGH_RENDERER_PATTERNS)) return 'high';

    const weakSystem = (memoryGb > 0 && memoryGb < GPU_TIER_MIN_MEMORY_GB_MEDIUM)
        || (cores > 0 && cores < GPU_TIER_MIN_CORES_MEDIUM)
        || (maxTextureSize > 0 && maxTextureSize < GPU_TIER_MIN_TEXTURE_SIZE_MEDIUM);
    if (weakSystem) return 'low';

    const midSystem = (memoryGb > 0 && memoryGb < GPU_TIER_MIN_MEMORY_GB_HIGH)
        || (cores > 0 && cores < GPU_TIER_MIN_CORES_HIGH)
        || (maxTextureSize > 0 && maxTextureSize < GPU_TIER_MIN_TEXTURE_SIZE_HIGH);
    return midSystem ? 'medium' : 'high';
}
