/** Pointer picking, selection, pair matching, hint and shuffle. */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import { facesMatch } from '../data/tileSet.js';
import { GAME_STATE } from '../types/index.js';

export class TileInputSystem {
    private game: MahjongScene;
    private observer: BABYLON.Nullable<BABYLON.Observer<BABYLON.PointerInfo>> = null;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        const bjs = this.game.bjs;
        this.observer = bjs.onPointerObservable.add((info: BABYLON.PointerInfo) => {
            if (this.game.state !== GAME_STATE.PLAYING) return;
            if (info.type === BABYLON.PointerEventTypes.POINTERTAP) {
                this.onTap();
            }
        });
    }

    private onTap(): void {
        const board = this.game.board;
        const id = board.pickTileId();
        if (id === null) return;

        if (!board.isFree(id)) {
            this.game.audio.error();
            return;
        }

        const selected = board.selected;
        if (selected === null) {
            board.setSelected(id);
            this.game.audio.select();
            return;
        }
        if (selected === id) {
            board.setSelected(null);
            return;
        }

        const a = board.getTile(selected);
        const b = board.getTile(id);
        if (!a || !b) {
            board.setSelected(id);
            return;
        }

        if (facesMatch(a.faceId, b.faceId)) {
            board.removeTiles(a.id, b.id, (positions) => {
                if (positions.length === 2) {
                    const mid = BABYLON.Vector3.Center(positions[0], positions[1]);
                    this.game.vfx.burst(mid);
                }
            });
            board.setSelected(null);
            this.game.audio.match();
            this.game.onMatch();

            if (board.remainingCount() === 0) {
                this.game.onWin();
            } else if (!this.hasAvailableMove()) {
                this.game.notify('Sem jogadas disponíveis — reinicie o nível');
            }
        } else {
            this.game.audio.error();
            board.setSelected(id);
            this.game.audio.select();
        }
    }

    /** Finds a matchable pair among free tiles. */
    findHint(): [number, number] | null {
        const board = this.game.board;
        const freeTiles = [...board.freeIds].map(id => board.getTile(id)).filter(Boolean) as Array<{ id: number; faceId: number }>;
        for (let i = 0; i < freeTiles.length; i++) {
            for (let j = i + 1; j < freeTiles.length; j++) {
                if (facesMatch(freeTiles[i].faceId, freeTiles[j].faceId)) {
                    return [freeTiles[i].id, freeTiles[j].id];
                }
            }
        }
        return null;
    }

    hasAvailableMove(): boolean {
        return this.findHint() !== null;
    }

    hint(): void {
        const pair = this.findHint();
        if (pair) {
            this.game.board.flashHint(pair);
        } else {
            this.game.notify('Sem jogadas disponíveis');
        }
    }

    dispose(): void {
        if (this.observer) {
            this.game.bjs.onPointerObservable.remove(this.observer);
            this.observer = null;
        }
    }
}
