/**
 * MahjongScene — top-down 3D Mahjong Solitaire built on the shared Scene3D base.
 * Owns game state and orchestrates the board, rendering, input, audio and UI
 * systems. Infinite levels; points + IQ scored per win and shown on a leaderboard.
 */
import { Scene3D } from '../../engine/3d/Scene3D.js';
import type { InputManager } from '../../engine/input/InputManager.js';
import { MahjongApi } from './api/MahjongApi.js';
import { MahjongPrefs } from './MahjongPrefs.js';
import { loadFaceArt } from './data/faceArt.js';
import { LayoutSystem } from './systems/LayoutSystem.js';
import { BoardSystem } from './systems/BoardSystem.js';
import { CameraSystem } from './systems/CameraSystem.js';
import { LightingSystem } from './systems/LightingSystem.js';
import { RenderSystem } from './systems/RenderSystem.js';
import { VfxSystem } from './systems/VfxSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { TileInputSystem } from './systems/TileInputSystem.js';
import { TraySystem } from './systems/TraySystem.js';
import { UiSystem } from './systems/UiSystem.js';
import { computeIqGain, computePoints, finalizeIq } from './constants/scoreConstants.js';
import { HINTS_PER_LEVEL, SHUFFLES_PER_LEVEL, UNDOS_PER_LEVEL } from './constants/gameConstants.js';
import { GAME_STATE, type GameState, type LeaderboardEntry, type MahjongUser, type SlotPosition, type WinResult } from './types/index.js';

const USER_ID_KEY = 'mahjong_user_id';

interface UndoState {
    slot: SlotPosition;
    faceId: number;
}

export class MahjongScene extends Scene3D {
    bjs!: any;

    onReady?: () => void;

    state: GameState = GAME_STATE.LOADING;
    level = 1;
    user: MahjongUser | null = null;

    private layout = new LayoutSystem();
    board!: BoardSystem;
    camera!: CameraSystem;
    private lighting!: LightingSystem;
    private render!: RenderSystem;
    vfx!: VfxSystem;
    audio!: AudioSystem;
    private tileInput!: TileInputSystem;
    tray!: TraySystem;
    ui!: UiSystem;

    private levelTileCount = 0;
    private levelStartMs = 0;
    private elapsedMs = 0;
    private hintsRemaining = 0;
    private shufflesRemaining = 0;
    private undosRemaining = 0;
    private undoState: UndoState | null = null;
    private liveIq = 0;
    private combo = 0;
    private lastMatchMs = 0;
    private scalingHandler: (() => void) | null = null;

    onCreate(scene: any, _input: InputManager): void {
        this.bjs = scene;

        this.applyDevicePixelRatio();
        this.scalingHandler = () => this.applyDevicePixelRatio();
        window.addEventListener('resize', this.scalingHandler);
        window.addEventListener('orientationchange', this.scalingHandler);

        MahjongPrefs.load();

        this.lighting = new LightingSystem(this);
        this.camera = new CameraSystem(this);
        this.render = new RenderSystem(this);
        this.vfx = new VfxSystem(this);
        this.board = new BoardSystem(this);
        this.audio = new AudioSystem(this);
        this.tileInput = new TileInputSystem(this);
        this.tray = new TraySystem(this);
        this.ui = new UiSystem(this);

        this.lighting.init();
        this.camera.init();
        this.render.init();
        this.vfx.init();
        this.board.init();
        this.audio.init();
        this.tileInput.init();
        this.tray.init();
        this.ui.init();

        void this.bootstrap();
    }

    /** Sharp rendering on Retina/mobile: render at full native device pixel ratio. */
    private applyDevicePixelRatio(): void {
        const engine = this.bjs?.getEngine?.();
        if (!engine) return;
        const dpr = window.devicePixelRatio || 1;
        engine.setHardwareScalingLevel(1 / dpr);
        engine.resize();
    }

    private async bootstrap(): Promise<void> {
        this.ui.setLoading('Carregando...');
        await loadFaceArt();
        const storedId = localStorage.getItem(USER_ID_KEY);
        if (storedId) {
            try {
                const user = await MahjongApi.getPlayer(storedId);
                this.user = user;
                this.ui.setUser(user);
                this.ui.hideLoading();
                this.signalReady();
                this.beginLevel(this.resumeLevel());
                return;
            } catch (err) {
                console.warn('[MahjongScene] Stored player not found, asking for email:', err);
                localStorage.removeItem(USER_ID_KEY);
            }
        }
        this.ui.hideLoading();
        this.state = GAME_STATE.EMAIL_GATE;
        this.ui.showEmailGate();
        this.signalReady();
    }

    private signalReady(): void {
        if (this.onReady) {
            try { this.onReady(); } catch (err) { console.warn('[MahjongScene] onReady failed:', err); }
        }
    }

    async registerUser(email: string): Promise<void> {
        const user = await MahjongApi.register(email, null);
        this.user = user;
        localStorage.setItem(USER_ID_KEY, user.userId);
        this.ui.setUser(user);
        this.ui.hideEmailGate();
        this.beginLevel(this.resumeLevel());
    }

    /** Resume on the first level the player has not yet cleared. */
    private resumeLevel(): number {
        const best = this.user?.bestLevel ?? 0;
        return Math.max(1, best + 1);
    }

    private beginLevel(level: number): void {
        this.state = GAME_STATE.LOADING;
        this.level = level;
        const generated = this.layout.generate(level);
        this.levelTileCount = generated.slots.length;
        this.board.buildLevel(generated);
        this.reframeBoard();
        this.tray.clear();
        this.ui.setLevel(level);
        this.hintsRemaining = HINTS_PER_LEVEL;
        this.ui.setHints(this.hintsRemaining);
        this.shufflesRemaining = SHUFFLES_PER_LEVEL;
        this.ui.setShuffles(this.shufflesRemaining);
        this.undosRemaining = UNDOS_PER_LEVEL;
        this.ui.setUndos(this.undosRemaining);
        this.undoState = null;
        this.liveIq = 0;
        this.combo = 0;
        this.ui.setLiveIq(0);
        this.levelStartMs = performance.now();
        this.lastMatchMs = this.levelStartMs;
        this.elapsedMs = 0;
        this.ui.updateTimer(0);
        this.state = GAME_STATE.PLAYING;
        console.debug(`[MahjongScene] Level ${level} started with ${this.levelTileCount} tiles`);
    }

    restartLevel(): void {
        this.beginLevel(this.level);
    }

    nextLevel(): void {
        this.beginLevel(this.level + 1);
    }

    requestHint(): void {
        if (this.state !== GAME_STATE.PLAYING) return;
        if (this.hintsRemaining <= 0) {
            this.notify('Dica esgotada neste nível (em breve: comprar mais)');
            return;
        }
        this.hintsRemaining--;
        this.ui.setHints(this.hintsRemaining);
        this.tileInput.hint();
    }

    /** Reassigns the faces of the remaining tiles; the deal stays solvable. */
    requestShuffle(): void {
        if (this.state !== GAME_STATE.PLAYING) return;
        if (this.shufflesRemaining <= 0) {
            this.notify('Sem embaralhadas neste nível');
            return;
        }
        const live = this.board.liveTiles();
        if (live.length === 0) return;
        const faces = this.layout.reshuffleFaces(live.map(t => t.pos), this.tray.faces(), this.level);
        if (!faces) {
            this.notify('Não foi possível embaralhar agora');
            return;
        }
        this.board.applyFaces(faces);
        this.shufflesRemaining--;
        this.ui.setShuffles(this.shufflesRemaining);
        this.undoState = null;
        this.audio.select();
        console.debug('[MahjongScene] Board reshuffled');
    }

    /** Returns the last unmatched tray tile back to its board slot. */
    requestUndo(): void {
        if (this.state !== GAME_STATE.PLAYING) return;
        if (this.undosRemaining <= 0) {
            this.notify('Sem desfazer neste nível');
            return;
        }
        if (!this.undoState) {
            this.notify('Nada para desfazer');
            return;
        }
        const faceId = this.tray.removeLast();
        if (faceId === null) {
            this.undoState = null;
            return;
        }
        this.board.restoreTile(this.undoState.slot, this.undoState.faceId);
        this.undoState = null;
        this.undosRemaining--;
        this.ui.setUndos(this.undosRemaining);
        this.reframeBoard();
        this.audio.select();
    }

    notify(message: string): void {
        this.ui.notify(message);
    }

    onMatch(): void {
        // Per-match hook (reserved for future combo feedback).
    }

    /** Haptic feedback on match; stronger pattern on high combos. */
    private vibrate(combo: number): void {
        if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
        try {
            navigator.vibrate(combo >= 5 ? [30, 40, 30] : 20);
        } catch (_) { /* ignore */ }
    }

    /** Recenters and zooms the camera to fit the tiles still on the board. */
    private reframeBoard(): void {
        const bounds = this.board.getActiveBounds();
        if (!bounds) return;
        this.camera.frameBoard(bounds.width, bounds.depth, bounds.center);
    }

    /** Routes a tile tapped off the board into the tray and reacts to the result.
     *  Sounds, VFX and win/lose overlays are deferred until the fly-to-tray
     *  animation lands, so the presentation follows the visible tile. */
    handleTrayAdd(faceId: number): void {
        if (this.state !== GAME_STATE.PLAYING) return;
        this.reframeBoard();
        const origin = this.board.lastTakenScreen;
        const takenPos = this.board.lastTakenPos ? this.board.lastTakenPos.clone() : null;
        const fx = { combo: 0, gain: 0 };

        const result = this.tray.add(faceId, origin, (settled) => {
            if (this.state !== GAME_STATE.PLAYING) return;
            if (settled === 'match') {
                if (takenPos) this.vfx.burst(takenPos, fx.combo);
                this.audio.match(fx.combo);
                this.vibrate(fx.combo);
                this.ui.showIqGain(fx.gain);
                this.ui.showComboPraise(fx.combo);
                this.ui.comboCelebrate(fx.combo);
                this.onMatch();
                if (this.board.remainingCount() === 0 && this.tray.isEmpty()) {
                    void this.onWin();
                }
            } else if (settled === 'overflow') {
                this.audio.error();
                void this.onLose();
            } else {
                this.audio.select();
            }
        });

        if (result === 'match') {
            this.combo++;
            const now = performance.now();
            const sinceLastMatch = now - this.lastMatchMs;
            this.lastMatchMs = now;
            const gain = computeIqGain(this.level, sinceLastMatch, this.combo);
            this.liveIq += gain;
            this.ui.setLiveIq(this.liveIq);
            fx.combo = this.combo;
            fx.gain = gain;
            this.undoState = null;
            return;
        }

        if (result === 'added' && this.board.lastTakenSlot) {
            this.undoState = { slot: this.board.lastTakenSlot, faceId };
        }
    }

    async onWin(): Promise<void> {
        this.state = GAME_STATE.WON;
        this.elapsedMs = performance.now() - this.levelStartMs;
        const timeMs = Math.round(this.elapsedMs);
        const previousBestIq = this.user?.bestIq ?? 0;
        const result: WinResult = {
            level: this.level,
            tiles: this.levelTileCount,
            timeMs,
            points: computePoints(this.level, this.levelTileCount, timeMs),
            iq: finalizeIq(this.liveIq),
            combo: this.combo,
        };
        this.audio.win();
        this.vfx.celebrate();
        await this.submitResult(result, true);
        this.ui.showWin(result, result.iq - previousBestIq, this.user?.rank ?? null);
    }

    async onLose(): Promise<void> {
        this.state = GAME_STATE.LOST;
        this.elapsedMs = performance.now() - this.levelStartMs;
        const timeMs = Math.round(this.elapsedMs);
        const result: WinResult = {
            level: this.level,
            tiles: this.levelTileCount,
            timeMs,
            points: 0,
            iq: finalizeIq(this.liveIq),
            combo: this.combo,
        };
        await this.submitResult(result, false);
        this.ui.showLose(result, this.user?.rank ?? null);
    }

    /** Persists a finished game (win or loss) and refreshes the cached totals. */
    private async submitResult(result: WinResult, won: boolean): Promise<void> {
        if (!this.user) return;
        try {
            const totals = await MahjongApi.submitScore(this.user.userId, result, won);
            this.user.totalPoints = totals.totalPoints;
            this.user.bestIq = totals.bestIq;
            this.user.bestLevel = totals.bestLevel;
            this.user.rank = totals.rank;
            this.ui.updateTotals(totals.totalPoints);
        } catch (err) {
            console.error('[MahjongScene] Failed to submit score:', err);
            this.notify('Não foi possível salvar a pontuação');
        }
    }

    /** Opens the leaderboard panel and loads the latest ranking. */
    async openLeaderboard(): Promise<void> {
        this.ui.showLeaderboardPanel();
        try {
            const leaderboard: LeaderboardEntry[] = await MahjongApi.getLeaderboard(this.user ? this.user.userId : null);
            this.ui.renderLeaderboard(leaderboard);
        } catch (err) {
            console.error('[MahjongScene] Failed to load leaderboard:', err);
            this.ui.renderLeaderboard([]);
        }
    }

    update(dt: number): void {
        this.camera?.update(dt);
        if (this.state === GAME_STATE.PLAYING) {
            this.elapsedMs = performance.now() - this.levelStartMs;
            this.ui.updateTimer(this.elapsedMs);
        }
    }

    onDispose(): void {
        if (this.scalingHandler) {
            window.removeEventListener('resize', this.scalingHandler);
            window.removeEventListener('orientationchange', this.scalingHandler);
            this.scalingHandler = null;
        }
        this.tileInput?.dispose();
        this.tray?.dispose();
        this.audio?.dispose();
        this.vfx?.dispose();
        this.render?.dispose();
        this.board?.dispose();
        this.camera?.dispose();
        this.lighting?.dispose();
        this.ui?.dispose();
    }
}
