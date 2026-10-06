import type { FlightSceneSimple } from '../../FlightSceneSimple.js';
import type { ChatMessage } from '../../MultiplayerClient.js';
import { I18n } from '../../I18n.js';
import { InputBindings } from '../../InputBindings.js';
import { InputManager } from '../../../engine/input/InputManager.js';

const CHAT_ROOT_ID = 'mp-chat';
const CHAT_Z_INDEX = '30';
const CHAT_MAX_VISIBLE_MESSAGES = 6;
const CHAT_MESSAGE_VISIBLE_MS = 15000;
const CHAT_CLIENT_MIN_INTERVAL_MS = 1500;
const CHAT_MAX_LEN = 200;
const CHAT_TOAST_MS = 2500;
const CHAT_CLOSE_CODE = 'Escape';
const CHAT_SEND_CODE = 'Enter';
const CHAT_PRUNE_INTERVAL_MS = 1000;

interface ChatLine {
    el: HTMLDivElement;
    expiresAt: number;
}

export class ChatSystem {
    private readonly scene: any;
    private _root: HTMLDivElement | null = null;
    private _log: HTMLDivElement | null = null;
    private _input: HTMLInputElement | null = null;
    private _lines: ChatLine[] = [];
    private _lastSentMs = 0;
    private _lastPruneMs = 0;
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(scene: FlightSceneSimple) {
        this.scene = scene;
        this._keyHandler = (e: KeyboardEvent) => {
            if (e.repeat || e.code !== InputBindings.codeFor('chatOpen')) return;
            if (InputManager.isEditableTarget(e.target) || this.scene.spawned !== true || this.scene.isMobile === true) return;
            e.preventDefault();
            this.open();
        };
        window.addEventListener('keydown', this._keyHandler);
    }

    private ensureDom(): void {
        if (this._root) return;
        const root = document.createElement('div');
        root.id = CHAT_ROOT_ID;
        root.style.cssText = `position:fixed;left:12px;bottom:24%;width:min(340px,70vw);z-index:${CHAT_Z_INDEX};pointer-events:none;font-family:Inter,sans-serif;font-size:12px`;
        const log = document.createElement('div');
        log.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-bottom:6px';
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = CHAT_MAX_LEN;
        input.autocomplete = 'off';
        input.style.cssText = 'display:none;width:100%;box-sizing:border-box;padding:7px 9px;background:rgba(0,20,15,.88);border:1px solid rgba(80,255,160,.45);border-radius:6px;color:#e8fff4;font-size:12px;outline:none;pointer-events:auto';
        input.addEventListener('keydown', (ev) => {
            ev.stopPropagation();
            if (ev.code === CHAT_SEND_CODE) {
                ev.preventDefault();
                this.send(input.value);
            } else if (ev.code === CHAT_CLOSE_CODE) {
                ev.preventDefault();
                this.close();
            }
        });
        input.addEventListener('blur', () => { if (input.style.display !== 'none' && !input.value) this.close(); });
        root.appendChild(log);
        root.appendChild(input);
        document.body.appendChild(root);
        this._root = root;
        this._log = log;
        this._input = input;
    }

    open(): void {
        this.ensureDom();
        if (!this._input) return;
        this._input.placeholder = I18n.t('chat.placeholder');
        this._input.style.display = 'block';
        this._input.focus();
    }

    close(): void {
        if (!this._input) return;
        this._input.value = '';
        this._input.style.display = 'none';
        this._input.blur();
    }

    private send(rawText: string): void {
        const text = typeof rawText === 'string' ? rawText.trim().slice(0, CHAT_MAX_LEN) : '';
        if (!text) {
            this.close();
            return;
        }
        const now = Date.now();
        if (now - this._lastSentMs < CHAT_CLIENT_MIN_INTERVAL_MS) {
            this.scene._showToast(I18n.t('chat.rateLimited'), CHAT_TOAST_MS);
            return;
        }
        const sent = this.scene.mpClient?.sendChat?.(text) === true;
        if (!sent) {
            this.scene._showToast(I18n.t('chat.offline'), CHAT_TOAST_MS);
            console.warn('[Chat] Send failed: multiplayer not connected');
            return;
        }
        this._lastSentMs = now;
        this.close();
    }

    receive(msg: ChatMessage): void {
        if (!msg || typeof msg.text !== 'string' || !msg.text) return;
        this.ensureDom();
        if (!this._log) return;
        const ownId = String(this.scene.mpClient?.userId ?? '');
        const isOwn = ownId !== '' && String(msg.userId) === ownId;
        const line = document.createElement('div');
        line.style.cssText = 'align-self:flex-start;max-width:100%;padding:4px 8px;background:rgba(0,16,12,.72);border:1px solid rgba(80,255,160,.18);border-radius:5px;color:#e8fff4;word-break:break-word';
        const name = document.createElement('span');
        name.textContent = `${isOwn ? I18n.t('chat.you') : (msg.username || `Pilot ${String(msg.userId).slice(-4)}`)}: `;
        name.style.cssText = `font-weight:700;color:${isOwn ? '#ffe27a' : '#40ffaa'}`;
        const body = document.createElement('span');
        body.textContent = msg.text.slice(0, CHAT_MAX_LEN);
        line.appendChild(name);
        line.appendChild(body);
        this._log.appendChild(line);
        this._lines.push({ el: line, expiresAt: Date.now() + CHAT_MESSAGE_VISIBLE_MS });
        while (this._lines.length > CHAT_MAX_VISIBLE_MESSAGES) {
            this._lines.shift()?.el.remove();
        }
    }

    update(): void {
        if (this._lines.length === 0) return;
        const now = Date.now();
        if (now - this._lastPruneMs < CHAT_PRUNE_INTERVAL_MS) return;
        this._lastPruneMs = now;
        const inputOpen = this._input?.style.display === 'block';
        if (inputOpen) return;
        while (this._lines.length > 0 && this._lines[0].expiresAt <= now) {
            this._lines.shift()?.el.remove();
        }
    }

    dispose(): void {
        if (this._keyHandler) {
            try { window.removeEventListener('keydown', this._keyHandler); } catch (_) { /* ignore */ }
            this._keyHandler = null;
        }
        this._root?.remove();
        this._root = null;
        this._log = null;
        this._input = null;
        this._lines = [];
    }
}
