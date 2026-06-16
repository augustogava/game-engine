/** DOM HUD: email gate, top bar, tray, controls, toast, win/lose screens, menu leaderboard. */
import type { MahjongScene } from '../MahjongScene.js';
import type { LeaderboardEntry, MahjongUser, WinResult } from '../types/index.js';
import { MahjongPrefs } from '../MahjongPrefs.js';

const TOAST_DURATION_MS = 2200;
const IQ_DELTA_EPSILON = 0.05;
const MILESTONE_STEP = 10;

interface ResultTier {
    title: string;
    phrase: string;
}

function el<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`[UiSystem] Missing element #${id}`);
    return node as T;
}

function tierFor(iq: number): ResultTier {
    if (iq >= 160) return { title: 'Gênio!', phrase: 'Sua mente é simplesmente brilhante!' };
    if (iq >= 130) return { title: 'Brilhante!', phrase: 'Velocidade e estratégia em perfeita harmonia!' };
    if (iq >= 100) return { title: 'Destemido!', phrase: 'Níveis difíceis são só um aquecimento para você!' };
    if (iq >= 75) return { title: 'Afiado!', phrase: 'Bom raciocínio! Continue treinando.' };
    return { title: 'Mandou bem!', phrase: 'Cada partida deixa você mais rápido.' };
}

function milestoneInfo(level: number): { milestone: number; progressPct: number } {
    const milestone = (Math.floor(level / MILESTONE_STEP) + 1) * MILESTONE_STEP;
    const progressPct = Math.round(((level % MILESTONE_STEP) / MILESTONE_STEP) * 100);
    return { milestone, progressPct };
}

export class UiSystem {
    private game: MahjongScene;
    private lastTimeSec = -1;
    private toastTimer: number | null = null;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        el<HTMLButtonElement>('mj-btn-hint').addEventListener('click', () => this.game.requestHint());
        el<HTMLButtonElement>('mj-btn-restart').addEventListener('click', () => this.game.restartLevel());
        el<HTMLButtonElement>('mj-btn-sound').addEventListener('click', () => this.toggleSound());

        el<HTMLButtonElement>('mj-btn-menu').addEventListener('click', () => { void this.game.openLeaderboard(); });
        el<HTMLButtonElement>('mj-btn-menu-close').addEventListener('click', () => this.hideLeaderboardPanel());

        el<HTMLButtonElement>('mj-btn-next').addEventListener('click', () => {
            this.hideWin();
            this.game.nextLevel();
        });
        el<HTMLButtonElement>('mj-btn-replay').addEventListener('click', () => {
            this.hideWin();
            this.game.restartLevel();
        });
        el<HTMLButtonElement>('mj-btn-lose-retry').addEventListener('click', () => {
            this.hideLose();
            this.game.restartLevel();
        });

        const submit = () => this.submitEmail();
        el<HTMLButtonElement>('mj-email-submit').addEventListener('click', submit);
        el<HTMLInputElement>('mj-email-input').addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Enter') submit();
        });

        this.updateSoundButton();
    }

    setLoading(text: string): void {
        const loading = el('mj-loading');
        loading.classList.remove('hidden');
        el('mj-loading-status').textContent = text;
    }

    hideLoading(): void {
        el('mj-loading').classList.add('hidden');
    }

    showEmailGate(): void {
        el('mj-email-gate').classList.remove('hidden');
        el<HTMLInputElement>('mj-email-input').focus();
    }

    hideEmailGate(): void {
        el('mj-email-gate').classList.add('hidden');
    }

    private submitEmail(): void {
        const input = el<HTMLInputElement>('mj-email-input');
        const error = el('mj-email-error');
        const email = input.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            error.textContent = 'Informe um e-mail válido';
            return;
        }
        error.textContent = '';
        el<HTMLButtonElement>('mj-email-submit').disabled = true;
        this.game.registerUser(email).catch((err) => {
            console.error('[UiSystem] Registration failed:', err);
            error.textContent = 'Falha ao registrar. Tente novamente.';
            el<HTMLButtonElement>('mj-email-submit').disabled = false;
        });
    }

    setUser(user: MahjongUser): void {
        el('mj-name').textContent = user.name;
        el('mj-points').textContent = String(user.totalPoints);
    }

    setLevel(level: number): void {
        el('mj-level').textContent = String(level);
        this.lastTimeSec = -1;
    }

    setHints(remaining: number): void {
        const btn = el<HTMLButtonElement>('mj-btn-hint');
        el('mj-hint-badge').textContent = String(remaining);
        btn.disabled = remaining <= 0;
        btn.classList.toggle('mj-disabled', remaining <= 0);
    }

    setLiveIq(value: number): void {
        el('mj-iq').textContent = value.toFixed(1);
    }

    updateTimer(timeMs: number): void {
        const sec = Math.floor(timeMs / 1000);
        if (sec === this.lastTimeSec) return;
        this.lastTimeSec = sec;
        el('mj-time').textContent = this.formatMs(timeMs);
    }

    updateTotals(totalPoints: number): void {
        el('mj-points').textContent = String(totalPoints);
    }

    notify(message: string): void {
        const toast = el('mj-toast');
        toast.textContent = message;
        toast.classList.add('show');
        if (this.toastTimer) window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => toast.classList.remove('show'), TOAST_DURATION_MS);
    }

    showWin(result: WinResult, iqDelta: number): void {
        const tier = tierFor(result.iq);
        el('mj-win-title').textContent = tier.title;
        el('mj-win-phrase').textContent = tier.phrase;
        el('mj-win-time').textContent = this.formatMs(result.timeMs);
        el('mj-win-iq').textContent = result.iq.toFixed(1);
        el('mj-win-combo').textContent = String(result.combo);

        const arrow = el('mj-win-iq-arrow');
        arrow.className = 'mj-arrow';
        if (iqDelta > IQ_DELTA_EPSILON) { arrow.classList.add('up'); arrow.textContent = '\u25B2'; }
        else if (iqDelta < -IQ_DELTA_EPSILON) { arrow.classList.add('down'); arrow.textContent = '\u25BC'; }
        else { arrow.textContent = ''; }

        const { milestone, progressPct } = milestoneInfo(result.level);
        el<HTMLDivElement>('mj-win-progress').style.width = `${progressPct}%`;
        el('mj-win-milestone').textContent = `Alcançar Nível ${milestone}`;

        el('mj-btn-next').textContent = `Nível ${result.level + 1}`;
        el('mj-win').classList.remove('hidden');
        this.spawnConfetti();
    }

    private spawnConfetti(): void {
        const host = el('mj-win');
        const colors = ['#e7c873', '#54c79a', '#e21030', '#0d74ff', '#d81b76', '#ffe6a0'];
        const COUNT = 48;
        const LIFETIME_MS = 3200;
        for (let i = 0; i < COUNT; i++) {
            const piece = document.createElement('div');
            piece.className = 'mj-confetti-piece';
            piece.style.left = `${Math.random() * 100}%`;
            piece.style.background = colors[i % colors.length];
            piece.style.animationDelay = `${Math.random() * 0.6}s`;
            piece.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
            host.appendChild(piece);
            window.setTimeout(() => { try { piece.remove(); } catch (_) { /* ignore */ } }, LIFETIME_MS);
        }
    }

    hideWin(): void {
        el('mj-win').classList.add('hidden');
    }

    showLose(result: WinResult): void {
        el('mj-lose-level').textContent = String(result.level);
        el('mj-lose-iq').textContent = result.iq.toFixed(1);
        el('mj-lose-combo').textContent = String(result.combo);
        el('mj-lose').classList.remove('hidden');
        const box = el('mj-lose-box');
        box.classList.remove('mj-shake');
        void box.offsetWidth;
        box.classList.add('mj-shake');
    }

    hideLose(): void {
        el('mj-lose').classList.add('hidden');
    }

    showLeaderboardPanel(): void {
        const tbody = el<HTMLTableSectionElement>('mj-leaderboard');
        tbody.innerHTML = '<tr><td colspan="4" class="mj-lb-empty">Carregando...</td></tr>';
        el('mj-menu').classList.remove('hidden');
    }

    hideLeaderboardPanel(): void {
        el('mj-menu').classList.add('hidden');
    }

    renderLeaderboard(leaderboard: LeaderboardEntry[]): void {
        const tbody = el<HTMLTableSectionElement>('mj-leaderboard');
        tbody.innerHTML = '';
        if (leaderboard.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="4" class="mj-lb-empty">Sem registros ainda</td>';
            tbody.appendChild(row);
            return;
        }
        for (const entry of leaderboard) {
            const row = document.createElement('tr');
            if (entry.isSelf) row.classList.add('mj-lb-self');
            row.innerHTML =
                `<td>${entry.rank}</td>` +
                `<td>${this.escape(entry.name)}</td>` +
                `<td>${entry.totalPoints}</td>` +
                `<td>${entry.iq.toFixed(1)}</td>`;
            tbody.appendChild(row);
        }
    }

    private toggleSound(): void {
        MahjongPrefs.soundEnabled = !MahjongPrefs.soundEnabled;
        this.updateSoundButton();
    }

    private updateSoundButton(): void {
        el('mj-sound-icon').textContent = MahjongPrefs.soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07';
    }

    private formatMs(ms: number): string {
        const sec = Math.floor(ms / 1000);
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        return `${mm}:${ss}`;
    }

    private escape(value: string): string {
        const div = document.createElement('div');
        div.textContent = value;
        return div.innerHTML;
    }

    dispose(): void {
        if (this.toastTimer) window.clearTimeout(this.toastTimer);
    }
}
