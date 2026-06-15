/**
 * Builds and manages the 3D tile board: meshes, procedurally drawn tile faces,
 * free/blocked computation, hover/selection highlighting and removal animation.
 */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import type { GeneratedLevel } from './LayoutSystem.js';
import { buildFilledCells, isSlotFree } from './LayoutSystem.js';
import { TILE_FACES } from '../data/tileSet.js';
import { TILE_GROUP, type Tile } from '../types/index.js';
import {
    HALF_CELL, LAYER_HEIGHT, SYMBOL_SCALE, SYMBOL_TEXTURE_SIZE,
    TILE_DEPTH, TILE_THICKNESS, TILE_WIDTH,
} from '../constants/gameConstants.js';
import {
    HINT_HIGHLIGHT_COLOR, SELECT_HIGHLIGHT_COLOR, TILE_BASE_COLOR,
} from '../constants/graphicsConstants.js';

const REMOVE_ANIM_MS = 260;
const HINT_DURATION_MS = 900;

export class BoardSystem {
    private game: MahjongScene;
    private bjs!: BABYLON.Scene;
    private root!: BABYLON.TransformNode;
    private highlight!: BABYLON.HighlightLayer;
    private tileMat!: BABYLON.StandardMaterial;
    private symbolMats: Map<number, BABYLON.StandardMaterial> = new Map();

    tiles: Tile[] = [];
    freeIds: Set<number> = new Set();
    boardRadius = 12;

    private hoverId: number | null = null;
    private selectedId: number | null = null;
    private hintTimer: number | null = null;
    private nextTileId = 1;

    constructor(game: MahjongScene) {
        this.game = game;
    }

    init(): void {
        this.bjs = this.game.bjs;
        this.root = new BABYLON.TransformNode('mahjong-board', this.bjs);
        this.highlight = new BABYLON.HighlightLayer('mahjong-hl', this.bjs, { blurHorizontalSize: 1.2, blurVerticalSize: 1.2 });
        this.highlight.innerGlow = false;

        // Single shared material for every tile so free/blocked tiles look identical
        // (no glow hint). Only the selected tile glows, via the highlight layer.
        this.tileMat = new BABYLON.StandardMaterial('tile-base', this.bjs);
        this.tileMat.diffuseColor = BABYLON.Color3.FromHexString(TILE_BASE_COLOR).scale(0.78);
        this.tileMat.specularColor = new BABYLON.Color3(0.12, 0.12, 0.1);
        this.tileMat.emissiveColor = new BABYLON.Color3(0.03, 0.028, 0.022);
    }

    buildLevel(level: GeneratedLevel): void {
        this.clear();

        const slots = level.slots;
        let sumX = 0;
        let sumZ = 0;
        let maxX = -Infinity;
        let minX = Infinity;
        let maxZ = -Infinity;
        let minZ = Infinity;
        for (const slot of slots) {
            const cx = (slot.gx + 1) * HALF_CELL;
            const cz = (slot.gy + 1) * HALF_CELL;
            sumX += cx; sumZ += cz;
            maxX = Math.max(maxX, cx); minX = Math.min(minX, cx);
            maxZ = Math.max(maxZ, cz); minZ = Math.min(minZ, cz);
        }
        const centerX = sumX / slots.length;
        const centerZ = sumZ / slots.length;
        this.boardRadius = Math.max(maxX - minX, maxZ - minZ) + HALF_CELL * 4;

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            const faceId = level.faceByIndex[i];
            const worldX = (slot.gx + 1) * HALF_CELL - centerX;
            const worldZ = (slot.gy + 1) * HALF_CELL - centerZ;
            const worldY = slot.layer * LAYER_HEIGHT + TILE_THICKNESS / 2;

            const box = BABYLON.MeshBuilder.CreateBox(`tile-${i}`, {
                width: TILE_WIDTH, depth: TILE_DEPTH, height: TILE_THICKNESS,
            }, this.bjs);
            box.parent = this.root;
            box.position.set(worldX, worldY, worldZ);
            box.material = this.tileMat;
            box.isPickable = true;

            const symbol = BABYLON.MeshBuilder.CreatePlane(`sym-${i}`, {
                size: TILE_WIDTH * SYMBOL_SCALE,
            }, this.bjs);
            symbol.parent = this.root;
            symbol.rotation.x = -Math.PI / 2;
            symbol.position.set(worldX, worldY + TILE_THICKNESS / 2 + 0.012, worldZ);
            symbol.material = this.getSymbolMaterial(faceId);
            symbol.isPickable = false;

            const tile: Tile = {
                id: this.nextTileId++,
                faceId,
                pos: slot,
                removed: false,
                mesh: box,
                symbolMesh: symbol,
            };
            box.metadata = { tileId: tile.id };
            this.tiles.push(tile);
        }

        this.recomputeFree();
    }

    private getSymbolMaterial(faceId: number): BABYLON.StandardMaterial {
        const cached = this.symbolMats.get(faceId);
        if (cached) return cached;

        const tex = new BABYLON.DynamicTexture(`sym-tex-${faceId}`, SYMBOL_TEXTURE_SIZE, this.bjs, true);
        tex.hasAlpha = false;
        this.drawFace(tex, faceId);

        const mat = new BABYLON.StandardMaterial(`sym-mat-${faceId}`, this.bjs);
        mat.diffuseTexture = tex;
        mat.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.48);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.backFaceCulling = false;
        this.symbolMats.set(faceId, mat);
        return mat;
    }

    private drawFace(tex: BABYLON.DynamicTexture, faceId: number): void {
        const face = TILE_FACES[faceId];
        const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
        const S = SYMBOL_TEXTURE_SIZE;

        ctx.fillStyle = '#fbf6e7';
        ctx.fillRect(0, 0, S, S);
        ctx.strokeStyle = 'rgba(60,50,30,0.25)';
        ctx.lineWidth = 6;
        ctx.strokeRect(8, 8, S - 16, S - 16);

        ctx.fillStyle = face.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (face.group === TILE_GROUP.SUIT_DOTS) {
            this.drawPips(ctx, face.pips, face.color, S);
        } else if (face.group === TILE_GROUP.SUIT_BAMBOO) {
            this.drawBars(ctx, face.bars, face.color, S);
        } else if (face.group === TILE_GROUP.SUIT_CHAR) {
            ctx.font = `bold ${Math.round(S * 0.5)}px serif`;
            ctx.fillText(face.glyph, S / 2, S * 0.4);
            ctx.font = `bold ${Math.round(S * 0.28)}px serif`;
            ctx.fillText('萬', S / 2, S * 0.78);
        } else {
            ctx.font = `bold ${Math.round(S * 0.62)}px serif`;
            ctx.fillText(face.glyph, S / 2, S / 2 + S * 0.04);
        }

        tex.update(false);
    }

    private drawPips(ctx: CanvasRenderingContext2D, count: number, color: string, S: number): void {
        const cols = count <= 3 ? 1 : (count <= 6 ? 2 : 3);
        const rows = Math.ceil(count / cols);
        const r = S * 0.07;
        const marginX = S * 0.5 - ((cols - 1) * S * 0.16) / 2;
        const marginY = S * 0.5 - ((rows - 1) * S * 0.16) / 2;
        let drawn = 0;
        for (let row = 0; row < rows; row++) {
            const inThisRow = Math.min(cols, count - drawn);
            const rowStartX = S * 0.5 - ((inThisRow - 1) * S * 0.16) / 2;
            for (let c = 0; c < inThisRow; c++) {
                const x = rowStartX + c * S * 0.16;
                const y = marginY + row * S * 0.16;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0,0,0,0.25)';
                ctx.stroke();
                drawn++;
            }
        }
        void marginX;
    }

    private drawBars(ctx: CanvasRenderingContext2D, count: number, color: string, S: number): void {
        const cols = count <= 3 ? count : (count <= 6 ? 3 : Math.ceil(count / 3));
        const rows = Math.ceil(count / cols);
        const barW = S * 0.05;
        const barH = S * 0.18;
        let drawn = 0;
        for (let row = 0; row < rows; row++) {
            const inThisRow = Math.min(cols, count - drawn);
            const rowStartX = S * 0.5 - ((inThisRow - 1) * S * 0.14) / 2;
            const y = S * 0.5 - ((rows - 1) * S * 0.22) / 2 + row * S * 0.22;
            for (let c = 0; c < inThisRow; c++) {
                const x = rowStartX + c * S * 0.14;
                ctx.fillStyle = color;
                ctx.fillRect(x - barW / 2, y - barH / 2, barW, barH);
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(x - barW / 2, y - barH / 2, barW, barH * 0.18);
                drawn++;
            }
        }
    }

    /** Recomputes which tiles are free (selectable). No visual change: free and
     *  blocked tiles look identical so the board gives no glow hint. */
    recomputeFree(): void {
        const live = this.tiles.filter(t => !t.removed);
        const filled = buildFilledCells(live.map(t => t.pos));
        this.freeIds = new Set();
        for (const tile of live) {
            if (isSlotFree(tile.pos, filled)) this.freeIds.add(tile.id);
        }
    }

    isFree(tileId: number): boolean {
        return this.freeIds.has(tileId);
    }

    getTile(tileId: number): Tile | undefined {
        return this.tiles.find(t => t.id === tileId && !t.removed);
    }

    pickTileId(): number | null {
        const pick = this.bjs.pick(this.bjs.pointerX, this.bjs.pointerY, (m) => !!(m.metadata && m.metadata.tileId));
        if (pick && pick.hit && pick.pickedMesh && pick.pickedMesh.metadata) {
            return pick.pickedMesh.metadata.tileId as number;
        }
        return null;
    }

    setSelected(tileId: number | null): void {
        if (this.selectedId !== null) {
            const prev = this.getTile(this.selectedId);
            if (prev) this.highlight.removeMesh(prev.mesh);
        }
        this.selectedId = tileId;
        if (tileId !== null) {
            const tile = this.getTile(tileId);
            if (tile) this.highlight.addMesh(tile.mesh, BABYLON.Color3.FromHexString(SELECT_HIGHLIGHT_COLOR));
        }
    }

    get selected(): number | null { return this.selectedId; }

    flashHint(tileIds: number[]): void {
        const color = BABYLON.Color3.FromHexString(HINT_HIGHLIGHT_COLOR);
        const meshes: BABYLON.Mesh[] = [];
        for (const id of tileIds) {
            const tile = this.getTile(id);
            if (tile) { this.highlight.addMesh(tile.mesh, color); meshes.push(tile.mesh); }
        }
        if (this.hintTimer) window.clearTimeout(this.hintTimer);
        this.hintTimer = window.setTimeout(() => {
            for (const m of meshes) {
                const stillSelected = this.selectedId !== null && this.getTile(this.selectedId)?.mesh === m;
                if (!stillSelected) this.highlight.removeMesh(m);
            }
        }, HINT_DURATION_MS);
    }

    removeTiles(idA: number, idB: number, onMidpoint?: (positions: BABYLON.Vector3[]) => void): void {
        const positions: BABYLON.Vector3[] = [];
        for (const id of [idA, idB]) {
            const tile = this.getTile(id);
            if (!tile) continue;
            tile.removed = true;
            this.highlight.removeMesh(tile.mesh);
            positions.push(tile.mesh.getAbsolutePosition().clone());
            this.animateOut(tile);
        }
        if (this.hoverId === idA || this.hoverId === idB) this.hoverId = null;
        if (onMidpoint) onMidpoint(positions);
        this.recomputeFree();
    }

    private animateOut(tile: Tile): void {
        const frames = 30;
        const fps = frames / (REMOVE_ANIM_MS / 1000);
        const ease = new BABYLON.QuadraticEase();
        ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEIN);

        for (const mesh of [tile.mesh, tile.symbolMesh]) {
            const scaleAnim = new BABYLON.Animation('rm-scale', 'scaling', fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
            scaleAnim.setKeys([
                { frame: 0, value: mesh.scaling.clone() },
                { frame: frames, value: new BABYLON.Vector3(0.01, 0.01, 0.01) },
            ]);
            scaleAnim.setEasingFunction(ease);
            const posAnim = new BABYLON.Animation('rm-pos', 'position.y', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
            posAnim.setKeys([
                { frame: 0, value: mesh.position.y },
                { frame: frames, value: mesh.position.y + 1.2 },
            ]);
            const isBase = mesh === tile.mesh;
            this.bjs.beginDirectAnimation(mesh, [scaleAnim, posAnim], 0, frames, false, 1, () => {
                if (isBase) {
                    tile.mesh.dispose();
                    tile.symbolMesh.dispose();
                }
            });
        }
    }

    remainingCount(): number {
        return this.tiles.reduce((n, t) => n + (t.removed ? 0 : 1), 0);
    }

    clear(): void {
        if (this.hintTimer) { window.clearTimeout(this.hintTimer); this.hintTimer = null; }
        for (const tile of this.tiles) {
            try { tile.mesh.dispose(); } catch (_) { /* ignore */ }
            try { tile.symbolMesh.dispose(); } catch (_) { /* ignore */ }
        }
        this.tiles = [];
        this.freeIds = new Set();
        this.hoverId = null;
        this.selectedId = null;
    }

    dispose(): void {
        this.clear();
        this.highlight?.dispose();
        this.tileMat?.dispose();
        for (const mat of this.symbolMats.values()) mat.dispose();
        this.symbolMats.clear();
        this.root?.dispose();
    }
}
