import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';

const WEEKLY_LIST_ID = 'weekly-list';
const WEEKLY_TITLE_ID = 'weekly-panel-title';
const WEEKLY_TOAST_MS = 3500;
const WEEKLY_REASON_MIN = 0;
const WEEKLY_REASON_MAX = 3;
const WEEKLY_METRIC_MIN = 0;
const WEEKLY_METRIC_MAX = 4;
const PERCENT = 100;
const BTN_BORDER_IDLE = 'rgba(80,255,160,.3)';
const BTN_BORDER_HOVER = 'rgba(80,255,160,.7)';
const BTN_BORDER_ACTIVE = 'rgba(80,255,160,.9)';
const BTN_SHADOW_HOVER = '0 0 8px rgba(0,255,128,.2)';
const BTN_SHADOW_ACTIVE = '0 0 12px rgba(0,255,128,.35)';

interface WeeklyChallenge {
    code: string;
    metric: number;
    target: number;
    progress: number;
    reward_credits: number;
    completed: boolean;
    claimed: boolean;
}

export class WeeklyChallengesSystem {
    private readonly scene: any;
    private _loading = false;
    private _claiming = new Set<string>();

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    setup(): void {
        const btn = this.scene._weeklyBtnEl as HTMLElement | null;
        const panel = this.scene._weeklyPanelEl as HTMLElement | null;
        if (!btn || !panel) {
            console.warn('[Weekly] Button or panel missing; weekly challenges disabled');
            return;
        }
        const title = document.getElementById(WEEKLY_TITLE_ID);
        if (title) title.textContent = I18n.t('weekly.title');
        btn.title = I18n.t('weekly.title');
        btn.addEventListener('mouseenter', () => { if (panel.style.display === 'none') { btn.style.borderColor = BTN_BORDER_HOVER; btn.style.boxShadow = BTN_SHADOW_HOVER; } });
        btn.addEventListener('mouseleave', () => { if (panel.style.display === 'none') { btn.style.borderColor = BTN_BORDER_IDLE; btn.style.boxShadow = 'none'; } });
        btn.addEventListener('click', () => {
            const visible = panel.style.display !== 'none';
            this.scene._closeAllPanels(visible ? null : panel);
            if (visible) {
                panel.style.display = 'none';
                btn.style.borderColor = BTN_BORDER_IDLE; btn.style.boxShadow = 'none';
            } else {
                panel.style.display = 'block';
                btn.style.borderColor = BTN_BORDER_ACTIVE; btn.style.boxShadow = BTN_SHADOW_ACTIVE;
                void this.load();
            }
        });
    }

    refreshIfVisible(): void {
        const panel = this.scene._weeklyPanelEl as HTMLElement | null;
        if (panel && panel.style.display !== 'none') void this.load();
    }

    async load(): Promise<void> {
        const listEl = document.getElementById(WEEKLY_LIST_ID);
        if (!listEl || this._loading) return;
        const token = localStorage.getItem('auth_token') || '';
        if (!token) {
            listEl.textContent = I18n.t('auth.loginRequired');
            return;
        }
        this._loading = true;
        listEl.textContent = I18n.t('menu.loading');
        try {
            const resp = await fetch('/api/flight-stats/weekly-challenges', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) {
                console.warn(`[Weekly] Load failed: HTTP ${resp.status}`);
                listEl.textContent = I18n.t('weekly.loadFailed');
                return;
            }
            const data = await resp.json();
            const challenges = this.normalize(data?.challenges);
            this.render(listEl, data?.week, challenges);
            console.debug(`[Weekly] Loaded ${challenges.length} challenges for week ${data?.week?.key ?? '?'}`);
        } catch (err) {
            console.warn('[Weekly] Load error:', err);
            listEl.textContent = I18n.t('weekly.loadFailed');
        } finally {
            this._loading = false;
        }
    }

    private normalize(raw: unknown): WeeklyChallenge[] {
        if (!Array.isArray(raw)) return [];
        return raw
            .map((c: any) => ({
                code: String(c?.code ?? ''),
                metric: Number(c?.metric),
                target: Number(c?.target) || 0,
                progress: Number(c?.progress) || 0,
                reward_credits: Number(c?.reward_credits) || 0,
                completed: c?.completed === true || Number(c?.completed) === 1,
                claimed: c?.claimed === true || Number(c?.claimed) === 1,
            }))
            .filter((c) => c.code.length > 0);
    }

    private render(listEl: HTMLElement, week: any, challenges: WeeklyChallenge[]): void {
        listEl.replaceChildren();
        if (week?.start && week?.end) {
            const header = document.createElement('div');
            header.style.cssText = 'font-family:Orbitron,monospace;font-size:10px;color:#40ffaa;letter-spacing:.1em;margin-bottom:8px';
            header.textContent = I18n.format('weekly.week', {
                start: new Date(week.start).toLocaleDateString(),
                end: new Date(week.end).toLocaleDateString(),
            });
            listEl.appendChild(header);
        }
        if (!challenges.length) {
            const empty = document.createElement('div');
            empty.style.color = 'rgba(255,255,255,.4)';
            empty.textContent = I18n.t('weekly.none');
            listEl.appendChild(empty);
            return;
        }
        for (const challenge of challenges) listEl.appendChild(this.renderChallenge(challenge));
    }

    private renderChallenge(challenge: WeeklyChallenge): HTMLElement {
        const card = document.createElement('div');
        card.style.cssText = `border:1px solid ${challenge.completed ? 'rgba(80,255,160,.5)' : 'rgba(255,255,255,.1)'};border-radius:6px;padding:8px 10px;margin-bottom:6px;background:${challenge.completed ? 'rgba(0,40,30,.5)' : 'rgba(0,20,15,.35)'}`;

        const title = document.createElement('div');
        title.style.cssText = 'display:flex;justify-content:space-between;gap:8px;font-weight:600';
        const name = document.createElement('span');
        const metricKey = Number.isInteger(challenge.metric) && challenge.metric >= WEEKLY_METRIC_MIN && challenge.metric <= WEEKLY_METRIC_MAX
            ? `weekly.metric.${challenge.metric}`
            : '';
        name.textContent = metricKey ? I18n.t(metricKey) : challenge.code;
        const reward = document.createElement('span');
        reward.style.cssText = 'font-size:9px;color:#ffe27a;white-space:nowrap';
        reward.textContent = `+${challenge.reward_credits} cr`;
        title.append(name, reward);
        card.appendChild(title);

        const ratio = challenge.target > 0 ? Math.min(1, challenge.progress / challenge.target) : 0;
        const bar = document.createElement('div');
        bar.style.cssText = 'height:5px;border-radius:3px;background:rgba(255,255,255,.1);margin:6px 0 4px;overflow:hidden';
        const fill = document.createElement('div');
        fill.style.cssText = `height:100%;width:${Math.round(ratio * PERCENT)}%;background:${challenge.completed ? '#40ffaa' : '#2a8f5a'}`;
        bar.appendChild(fill);
        card.appendChild(bar);

        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10px;color:rgba(255,255,255,.6)';
        const progress = document.createElement('span');
        progress.textContent = `${Math.round(challenge.progress)}/${Math.round(challenge.target)}`;
        footer.appendChild(progress);
        if (challenge.claimed) {
            const claimed = document.createElement('span');
            claimed.style.color = '#40ffaa';
            claimed.textContent = I18n.t('weekly.claimed');
            footer.appendChild(claimed);
        } else if (challenge.completed) {
            const claimBtn = document.createElement('button');
            claimBtn.type = 'button';
            claimBtn.disabled = this._claiming.has(challenge.code);
            claimBtn.style.cssText = 'padding:3px 8px;border:1px solid rgba(255,210,80,.6);border-radius:4px;background:rgba(40,32,0,.6);color:#ffe27a;font-size:10px;cursor:pointer';
            claimBtn.textContent = I18n.format('weekly.claim', { credits: challenge.reward_credits });
            claimBtn.addEventListener('click', () => void this.claim(challenge.code));
            footer.appendChild(claimBtn);
        } else {
            const pending = document.createElement('span');
            pending.textContent = I18n.t('weekly.inProgress');
            footer.appendChild(pending);
        }
        card.appendChild(footer);
        return card;
    }

    private async claim(code: string): Promise<void> {
        if (!code || this._claiming.has(code)) return;
        const token = localStorage.getItem('auth_token') || '';
        if (!token) return;
        this._claiming.add(code);
        try {
            const resp = await fetch(`/api/flight-stats/weekly-challenges/${encodeURIComponent(code)}/claim`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            if (!resp.ok) {
                console.warn(`[Weekly] Claim ${code} failed: HTTP ${resp.status}`);
                this.toast(I18n.t('weekly.claimFailed'));
                return;
            }
            const data = await resp.json();
            const reasonCode = Number(data?.reason_code);
            const validReason = Number.isInteger(reasonCode) && reasonCode >= WEEKLY_REASON_MIN && reasonCode <= WEEKLY_REASON_MAX;
            console.log(`[Weekly] Claim ${code}: claimed=${data?.claimed} reason_code=${data?.reason_code}`);
            this.toast(validReason ? I18n.t(`weekly.reason.${reasonCode}`) : I18n.t('weekly.claimFailed'));
        } catch (err) {
            console.warn(`[Weekly] Claim ${code} error:`, err);
            this.toast(I18n.t('weekly.claimFailed'));
        } finally {
            this._claiming.delete(code);
            void this.load();
        }
    }

    private toast(message: string): void {
        try { this.scene._showToast(message, WEEKLY_TOAST_MS); } catch (err) { console.warn('[Weekly] Toast failed:', err); }
    }
}
