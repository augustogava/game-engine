/**
 * MahjongScene — top-down 3D Mahjong Solitaire built on the shared Scene3D base.
 * Owns game state and orchestrates the board, rendering, input, audio and UI
 * systems. Infinite levels; points + IQ scored per win and shown on a leaderboard.
 */
import { Scene3D } from '../../engine/3d/Scene3D.js';
import type { InputManager } from '../../engine/input/InputManager.js';
import { MahjongApi } from './api/MahjongApi.js';
import { MahjongPrefs } from './MahjongPrefs.js';
import { LayoutSystem } from './systems/LayoutSystem.js';
import { BoardSystem } from './systems/BoardSystem.js';
import { CameraSystem } from './systems/CameraSystem.js';
import { LightingSystem } from './systems/LightingSystem.js';
import { RenderSystem } from './systems/RenderSystem.js';
import { VfxSystem } from './systems/VfxSystem.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { TileInputSystem } from './systems/TileInputSystem.js';
import { UiSystem } from './systems/UiSystem.js';
import { computeIq, computePoints } from './constants/scoreConstants.js';
import { HINTS_PER_LEVEL } from './constants/gameConstants.js';
import { GAME_STATE, type GameState, type LeaderboardEntry, type MahjongUser, type WinResult } from './types/index.js';

const USER_ID_KEY = 'mahjong_user_id';

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
    ui!: UiSystem;

    private levelTileCount = 0;
    private levelStartMs = 0;
    private elapsedMs = 0;
    private hintsRemaining = 0;

    onCreate(scene: any, _input: InputManager): void {
        this.bjs = scene;

        MahjongPrefs.load();

        this.lighting = new LightingSystem(this);
        this.camera = new CameraSystem(this);
        this.render = new RenderSystem(this);
        this.vfx = new VfxSystem(this);
        this.board = new BoardSystem(this);
        this.audio = new AudioSystem(this);
        this.tileInput = new TileInputSystem(this);
        this.ui = new UiSystem(this);

        this.lighting.init();
        this.camera.init();
        this.render.init();
        this.vfx.init();
        this.board.init();
        this.audio.init();
        this.tileInput.init();
        this.ui.init();

        void this.bootstrap();
    }

    private async bootstrap(): Promise<void> {
        this.ui.setLoading('Carregando...');
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
        this.beginLevel(1);
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
        this.camera.frameBoard(this.board.boardRadius);
        this.ui.setLevel(level);
        this.hintsRemaining = HINTS_PER_LEVEL;
        this.ui.setHints(this.hintsRemaining);
        this.levelStartMs = performance.now();
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

    notify(message: string): void {
        this.ui.notify(message);
    }

    onMatch(): void {
        // Per-match hook (reserved for future combo feedback).
    }

    async onWin(): Promise<void> {
        this.state = GAME_STATE.WON;
        this.elapsedMs = performance.now() - this.levelStartMs;
        const timeMs = Math.round(this.elapsedMs);
        const result: WinResult = {
            level: this.level,
            tiles: this.levelTileCount,
            timeMs,
            points: computePoints(this.level, this.levelTileCount, timeMs),
            iq: computeIq(this.level, this.levelTileCount, timeMs),
        };
        this.audio.win();

        if (this.user) {
            try {
                const totals = await MahjongApi.submitScore(this.user.userId, result);
                this.user.totalPoints = totals.totalPoints;
                this.user.bestIq = totals.bestIq;
                this.user.bestLevel = totals.bestLevel;
                this.ui.updateTotals(totals.totalPoints, totals.bestIq);
            } catch (err) {
                console.error('[MahjongScene] Failed to submit score:', err);
                this.notify('Não foi possível salvar a pontuação');
            }
        }

        let leaderboard: LeaderboardEntry[] = [];
        try {
            leaderboard = await MahjongApi.getLeaderboard(this.user ? this.user.userId : null);
        } catch (err) {
            console.error('[MahjongScene] Failed to load leaderboard:', err);
        }
        this.ui.showWin(result, leaderboard);
    }

    update(dt: number): void {
        this.camera?.update(dt);
        if (this.state === GAME_STATE.PLAYING) {
            this.elapsedMs = performance.now() - this.levelStartMs;
            this.ui.updateTimer(this.elapsedMs);
        }
    }

    onDispose(): void {
        this.tileInput?.dispose();
        this.audio?.dispose();
        this.vfx?.dispose();
        this.render?.dispose();
        this.board?.dispose();
        this.camera?.dispose();
        this.lighting?.dispose();
        this.ui?.dispose();
    }
}
