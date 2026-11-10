import * as BABYLON from '@babylonjs/core';

const FRAME_SPIKE_URL_PARAM = 'perfSpikes';
const FRAME_SPIKE_URL_ENABLED_VALUE = '1';
const FRAME_SPIKE_THRESHOLD_MS = 80;
const FRAME_SPIKE_IGNORE_ABOVE_MS = 5000;
const FRAME_SPIKE_LOG_MIN_INTERVAL_MS = 500;
const FRAME_SPIKE_MIN_SECTION_MS = 0.5;

export class FrameSpikeMonitor {
    private readonly _sections = new Map<string, number>();
    private _engineInstrumentation: BABYLON.EngineInstrumentation | null = null;
    private _sceneInstrumentation: BABYLON.SceneInstrumentation | null = null;
    private _lastFrameStartMs = 0;
    private _lastLogMs = 0;
    private _pickCount = 0;
    private _pickMs = 0;
    private _tilesLoaded = 0;
    private _tilesDisposed = 0;
    private _engine: BABYLON.AbstractEngine | null = null;
    private _lastRenderWidth = 0;
    private _lastRenderHeight = 0;

    static isRequested(): boolean {
        try {
            return new URLSearchParams(window.location.search).get(FRAME_SPIKE_URL_PARAM) === FRAME_SPIKE_URL_ENABLED_VALUE;
        } catch (_) {
            return false;
        }
    }

    constructor(scene: BABYLON.Scene) {
        try {
            this._engine = scene.getEngine();
            this._engineInstrumentation = new BABYLON.EngineInstrumentation(scene.getEngine());
            this._engineInstrumentation.captureShaderCompilationTime = true;
            this._sceneInstrumentation = new BABYLON.SceneInstrumentation(scene);
            this._sceneInstrumentation.captureRenderTime = true;
            this._sceneInstrumentation.captureActiveMeshesEvaluationTime = true;
        } catch (err) {
            console.warn('[FrameSpike] Babylon instrumentation unavailable:', err);
        }
        console.debug(`[FrameSpike] Monitor enabled (threshold=${FRAME_SPIKE_THRESHOLD_MS}ms)`);
    }

    beginFrame(tiles: any): number {
        const nowMs = performance.now();
        const intervalMs = this._lastFrameStartMs > 0 ? nowMs - this._lastFrameStartMs : 0;
        this._lastFrameStartMs = nowMs;
        const renderWidth = this._engine ? this._engine.getRenderWidth() : 0;
        const renderHeight = this._engine ? this._engine.getRenderHeight() : 0;
        const resized = this._lastRenderWidth > 0 && (renderWidth !== this._lastRenderWidth || renderHeight !== this._lastRenderHeight);
        this._lastRenderWidth = renderWidth;
        this._lastRenderHeight = renderHeight;
        if (intervalMs > FRAME_SPIKE_THRESHOLD_MS
            && intervalMs < FRAME_SPIKE_IGNORE_ABOVE_MS
            && nowMs - this._lastLogMs >= FRAME_SPIKE_LOG_MIN_INTERVAL_MS) {
            this._lastLogMs = nowMs;
            this._report(intervalMs, tiles, `${renderWidth}x${renderHeight}${resized ? ' (resized)' : ''}`);
        }
        this._sections.clear();
        this._pickCount = 0;
        this._pickMs = 0;
        this._tilesLoaded = 0;
        this._tilesDisposed = 0;
        return nowMs;
    }

    mark(label: string, startMs: number): number {
        const nowMs = performance.now();
        if (!Number.isFinite(startMs)) return nowMs;
        this._sections.set(label, (this._sections.get(label) ?? 0) + (nowMs - startMs));
        return nowMs;
    }

    recordPick(durationMs: number): void {
        this._pickCount++;
        if (Number.isFinite(durationMs) && durationMs > 0) this._pickMs += durationMs;
    }

    recordTileLoaded(): void {
        this._tilesLoaded++;
    }

    recordTileDisposed(): void {
        this._tilesDisposed++;
    }

    dispose(): void {
        try { this._engineInstrumentation?.dispose(); } catch (_) { /* ignore */ }
        try { this._sceneInstrumentation?.dispose(); } catch (_) { /* ignore */ }
        this._engineInstrumentation = null;
        this._sceneInstrumentation = null;
        this._engine = null;
        this._sections.clear();
    }

    private _report(intervalMs: number, tiles: any, renderSize: string): void {
        try {
            let updateMs = 0;
            const parts: string[] = [];
            const sorted = [...this._sections.entries()].sort((a, b) => b[1] - a[1]);
            for (const [label, ms] of sorted) {
                updateMs += ms;
                if (ms >= FRAME_SPIKE_MIN_SECTION_MS) parts.push(`${label}=${ms.toFixed(1)}`);
            }
            const renderMs = this._sceneInstrumentation?.renderTimeCounter?.current ?? Number.NaN;
            const activeMeshesMs = this._sceneInstrumentation?.activeMeshesEvaluationTimeCounter?.current ?? Number.NaN;
            const shaderMs = this._engineInstrumentation?.shaderCompilationTimeCounter?.current ?? Number.NaN;
            const stats = tiles?.stats;
            const lruSize = tiles?.lruCache?.itemList?.length;
            const tilesInfo = stats
                ? ` tiles(queued=${stats.queued ?? '?'} downloading=${stats.downloading ?? '?'} parsing=${stats.parsing ?? '?'} visible=${stats.visible ?? '?'} lru=${lruSize ?? '?'})`
                : '';
            const picksInfo = ` picks=${this._pickCount} pickMs=${this._pickMs.toFixed(1)} tilesLoaded=${this._tilesLoaded} tilesDisposed=${this._tilesDisposed} size=${renderSize}`;
            console.debug(`[FrameSpike] frame=${intervalMs.toFixed(0)}ms update=${updateMs.toFixed(1)}ms [${parts.join(' ')}] render=${renderMs.toFixed(1)}ms activeMeshes=${activeMeshesMs.toFixed(1)}ms shaderCompile=${shaderMs.toFixed(1)}ms${tilesInfo}${picksInfo}`);
        } catch (err) {
            console.warn('[FrameSpike] Report failed:', err);
        }
    }
}
