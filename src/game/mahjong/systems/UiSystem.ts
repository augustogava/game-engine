/** DOM HUD: email gate, top bar, controls, toast, win screen and leaderboard. */
import type { MahjongScene } from '../MahjongScene.js';
import type { LeaderboardEntry, MahjongUser, WinResult } from '../types/index.js';
import { MahjongPrefs } from '../MahjongPrefs.js';

const TOAST_DURATION_MS = 2200;

function el<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`[UiSystem] Missing element #${id}`);
    return node as T;
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

        el<HTMLButtonElement>('mj-btn-next').addEventListener('click', () => {
            this.hideWin();
            this.game.nextLevel();
        });
        el<HTMLButtonElement>('mj-btn-replay').addEventListener('click', () => {
            this.hideWin();
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
        const loading = el('mj-loading');
        loading.classList.add('hidden');
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
        el('mj-iq').textContent = String(user.bestIq || '-');
    }

    setLevel(level: number): void {
        el('mj-level').textContent = String(level);
        this.lastTimeSec = -1;
    }

    setHints(remaining: number): void {
        const btn = el<HTMLButtonElement>('mj-btn-hint');
        btn.textContent = `Dica (${remaining})`;
        btn.disabled = remaining <= 0;
        btn.classList.toggle('mj-disabled', remaining <= 0);
    }

    updateTimer(timeMs: number): void {
        const sec = Math.floor(timeMs / 1000);
        if (sec === this.lastTimeSec) return;
        this.lastTimeSec = sec;
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        el('mj-time').textContent = `${mm}:${ss}`;
    }

    updateTotals(totalPoints: number, bestIq: number): void {
        el('mj-points').textContent = String(totalPoints);
        el('mj-iq').textContent = String(bestIq || '-');
    }

    notify(message: string): void {
        const toast = el('mj-toast');
        toast.textContent = message;
        toast.classList.add('show');
        if (this.toastTimer) window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => toast.classList.remove('show'), TOAST_DURATION_MS);
    }

    showWin(result: WinResult, leaderboard: LeaderboardEntry[]): void {
        el('mj-win-level').textContent = String(result.level);
        el('mj-win-points').textContent = `+${result.points}`;
        el('mj-win-iq').textContent = String(result.iq);
        el('mj-win-time').textContent = this.formatMs(result.timeMs);

        const tbody = el<HTMLTableSectionElement>('mj-leaderboard');
        tbody.innerHTML = '';
        if (leaderboard.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="4" class="mj-lb-empty">Sem registros ainda</td>';
            tbody.appendChild(row);
        }
        for (const entry of leaderboard) {
            const row = document.createElement('tr');
            if (entry.isSelf) row.classList.add('mj-lb-self');
            row.innerHTML =
                `<td>${entry.rank}</td>` +
                `<td>${this.escape(entry.name)}</td>` +
                `<td>${entry.totalPoints}</td>` +
                `<td>${entry.iq}</td>`;
            tbody.appendChild(row);
        }

        el('mj-win').classList.remove('hidden');
    }

    hideWin(): void {
        el('mj-win').classList.add('hidden');
    }

    private toggleSound(): void {
        MahjongPrefs.soundEnabled = !MahjongPrefs.soundEnabled;
        this.updateSoundButton();
    }

    private updateSoundButton(): void {
        el<HTMLButtonElement>('mj-btn-sound').textContent = MahjongPrefs.soundEnabled ? 'Som: ON' : 'Som: OFF';
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
