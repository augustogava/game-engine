import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import { I18n } from '../../I18n.js';
import { isValidFlightLogId, publishAndShareFlightLog } from './FlightShareService.js';

const DEBRIEF_ID = 'flight-debrief';
const DEBRIEF_Z_INDEX = '8500';
const DEBRIEF_BUTTON_STYLE = 'flex:1;padding:9px 12px;background:rgba(0,40,28,.75);border:1px solid rgba(80,255,160,.45);color:#7df9c8;border-radius:6px;font-family:Inter,sans-serif;font-size:12px;cursor:pointer;touch-action:manipulation';
const DEBRIEF_ROW_STYLE = 'display:flex;justify-content:space-between;gap:16px;padding:4px 0;border-bottom:1px solid rgba(80,255,160,.12);font-size:12px';

interface DebriefRow {
    label: string;
    value: string;
}

export class FlightDebriefSystem {
    private readonly scene: any;
    private _root: HTMLDivElement | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
    }

    private formatConverted(conv: { value: number; unit: string } | null | undefined, decimals: number): string {
        if (!conv || !Number.isFinite(conv.value)) return '\u2014';
        return `${conv.value.toFixed(decimals)} ${conv.unit}`;
    }

    show(msg: any): void {
        try {
            const report = this.scene._hudSystem?.computeLandingReport?.(msg) ?? null;
            const rows: DebriefRow[] = [];
            if (report) {
                const vs = this.scene._convertVsFpm(report.fpm);
                rows.push({ label: I18n.t('landing.rate'), value: this.formatConverted(vs, Number.isInteger(vs.value) ? 0 : 2) });
                if (report.centerlineM != null) rows.push({ label: I18n.t('landing.centerline'), value: `${report.centerlineM.toFixed(0)} m` });
                if (report.speedKts != null) rows.push({ label: I18n.t('landing.speed'), value: this.formatConverted(this.scene._convertSpeedKts(report.speedKts), 0) });
            }
            const distanceNm = Number(msg?.distanceNm);
            if (Number.isFinite(distanceNm)) rows.push({ label: I18n.t('debrief.distance'), value: this.formatConverted(this.scene._convertDistanceNm(distanceNm), 1) });
            const maxAltFt = Number(msg?.maxAltitudeFt);
            if (Number.isFinite(maxAltFt)) rows.push({ label: I18n.t('debrief.maxAlt'), value: this.formatConverted(this.scene._convertAltitudeFt(maxAltFt), 0) });
            const avgSpeedKts = Number(msg?.avgSpeedKnots);
            if (Number.isFinite(avgSpeedKts)) rows.push({ label: I18n.t('debrief.avgSpeed'), value: this.formatConverted(this.scene._convertSpeedKts(avgSpeedKts), 0) });
            if (rows.length === 0) {
                console.debug('[Debrief] Nothing to show for landed message');
                return;
            }
            this.render(report ? I18n.t(report.gradeKey) : '', rows, Number(msg?.flightLogId));
            console.debug(`[Debrief] Shown (rows=${rows.length}, flightLogId=${msg?.flightLogId ?? 'n/a'})`);
        } catch (err) {
            console.warn('[Debrief] Failed to show:', err);
        }
    }

    private render(gradeText: string, rows: DebriefRow[], flightLogId: number): void {
        this.close();
        const root = document.createElement('div');
        root.id = DEBRIEF_ID;
        root.style.cssText = `position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,8,6,.35);z-index:${DEBRIEF_Z_INDEX}`;
        const card = document.createElement('div');
        card.style.cssText = 'min-width:280px;max-width:90vw;padding:18px 20px;background:rgba(0,20,15,.94);border:1px solid rgba(80,255,160,.4);border-radius:10px;color:rgba(255,255,255,.85);box-shadow:0 0 24px rgba(0,255,128,.15);font-family:Inter,sans-serif';

        const title = document.createElement('div');
        title.textContent = I18n.t('debrief.title');
        title.style.cssText = "font-family:'Orbitron',monospace;font-size:14px;letter-spacing:.2em;color:#40ffaa;text-align:center;margin-bottom:6px";
        card.appendChild(title);
        if (gradeText) {
            const grade = document.createElement('div');
            grade.textContent = gradeText;
            grade.style.cssText = 'font-size:16px;font-weight:700;color:#ffe27a;text-align:center;margin-bottom:10px';
            card.appendChild(grade);
        }
        for (const row of rows) {
            const line = document.createElement('div');
            line.style.cssText = DEBRIEF_ROW_STYLE;
            const label = document.createElement('span');
            label.textContent = row.label;
            label.style.color = 'rgba(200,255,230,.6)';
            const value = document.createElement('span');
            value.textContent = row.value;
            value.style.cssText = 'color:#fff;font-weight:600';
            line.appendChild(label);
            line.appendChild(value);
            card.appendChild(line);
        }

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:10px;margin-top:14px';
        if (isValidFlightLogId(flightLogId)) {
            const shareBtn = document.createElement('button');
            shareBtn.type = 'button';
            shareBtn.textContent = I18n.t('share.flight');
            shareBtn.style.cssText = DEBRIEF_BUTTON_STYLE;
            shareBtn.addEventListener('click', () => {
                shareBtn.disabled = true;
                void publishAndShareFlightLog(flightLogId, (m, d) => this.scene._showToast(m, d))
                    .finally(() => { shareBtn.disabled = false; });
            });
            actions.appendChild(shareBtn);
        }
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = I18n.t('debrief.close');
        closeBtn.style.cssText = DEBRIEF_BUTTON_STYLE;
        closeBtn.addEventListener('click', () => this.close());
        actions.appendChild(closeBtn);
        card.appendChild(actions);

        root.appendChild(card);
        root.addEventListener('click', (ev) => { if (ev.target === root) this.close(); });
        document.body.appendChild(root);
        this._root = root;
    }

    close(): void {
        this._root?.remove();
        this._root = null;
    }

    dispose(): void {
        this.close();
    }
}
