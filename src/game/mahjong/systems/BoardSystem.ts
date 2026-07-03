/**
 * Builds and manages the 3D tile board: meshes, procedurally drawn tile faces,
 * free/blocked computation, hover/selection highlighting and removal animation.
 */
import * as BABYLON from '@babylonjs/core';
import type { MahjongScene } from '../MahjongScene.js';
import type { GeneratedLevel } from './LayoutSystem.js';
import { buildFilledCells, isSlotFree } from './LayoutSystem.js';
import { drawTileFace } from '../data/faceRenderer.js';
import { type SlotPosition, type Tile } from '../types/index.js';
import {
    CELL_HALF_X, CELL_HALF_Z, LAYER_HEIGHT, SYMBOL_SCALE, SYMBOL_TEXTURE_HEIGHT, SYMBOL_TEXTURE_WIDTH,
    TILE_CORNER_RADIUS, TILE_DEPTH, TILE_THICKNESS, TILE_WIDTH,
} from '../constants/gameConstants.js';
import {
    HINT_HIGHLIGHT_COLOR, SELECT_HIGHLIGHT_COLOR, TILE_BASE_COLOR, TILE_SPECULAR_POWER,
} from '../constants/graphicsConstants.js';

const REMOVE_ANIM_MS = 150;
const HINT_DURATION_MS = 900;

/** Screen-space info of a taken tile, for the DOM fly-to-tray animation. */
export interface TakenTileScreenInfo {
    x: number;
    y: number;
    widthPx: number;
    heightPx: number;
}

/** Number of segments used to round each of the 4 vertical tile corners. */
const CORNER_SEGMENTS = 6;

/** Builds the CCW outline (in the XZ plane) of a rounded rectangle centered at the origin. */
function buildRoundedRectOutline(width: number, depth: number, radius: number): { x: number; z: number }[] {
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const r = Math.min(radius, halfWidth, halfDepth);
    const corners = [
        { cx: halfWidth - r, cz: halfDepth - r, a0: 0 },
        { cx: -(halfWidth - r), cz: halfDepth - r, a0: Math.PI / 2 },
        { cx: -(halfWidth - r), cz: -(halfDepth - r), a0: Math.PI },
        { cx: halfWidth - r, cz: -(halfDepth - r), a0: (3 * Math.PI) / 2 },
    ];
    const pts: { x: number; z: number }[] = [];
    for (const c of corners) {
        for (let s = 0; s <= CORNER_SEGMENTS; s++) {
            const a = c.a0 + (s / CORNER_SEGMENTS) * (Math.PI / 2);
            pts.push({ x: c.cx + r * Math.cos(a), z: c.cz + r * Math.sin(a) });
        }
    }
    return pts;
}

/** Creates a centered box mesh with rounded vertical corners (flat top/bottom caps). */
function createRoundedTileMesh(name: string, width: number, depth: number, height: number, radius: number, scene: BABYLON.Scene): BABYLON.Mesh {
    const outline = buildRoundedRectOutline(width, depth, radius);
    const n = outline.length;
    const hy = height / 2;
    const positions: number[] = [];
    const indices: number[] = [];

    for (const p of outline) positions.push(p.x, hy, p.z);
    for (const p of outline) positions.push(p.x, -hy, p.z);
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const top0 = i;
        const top1 = next;
        const bot0 = n + i;
        const bot1 = n + next;
        indices.push(top0, bot0, top1);
        indices.push(top1, bot0, bot1);
    }

    const topCenter = positions.length / 3;
    positions.push(0, hy, 0);
    const topRingStart = positions.length / 3;
    for (const p of outline) positions.push(p.x, hy, p.z);
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        indices.push(topCenter, topRingStart + i, topRingStart + next);
    }

    const botCenter = positions.length / 3;
    positions.push(0, -hy, 0);
    const botRingStart = positions.length / 3;
    for (const p of outline) positions.push(p.x, -hy, p.z);
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        indices.push(botCenter, botRingStart + next, botRingStart + i);
    }

    const normals: number[] = [];
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    const mesh = new BABYLON.Mesh(name, scene);
    vertexData.applyToMesh(mesh);
    return mesh;
}

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

    /** World position of the most recently taken tile (for match VFX). */
    lastTakenPos: BABYLON.Vector3 | null = null;

    /** Screen-space position of the most recently taken tile (for the fly-to-tray animation). */
    lastTakenScreen: TakenTileScreenInfo | null = null;

    /** Slot of the most recently taken tile (for undo). */
    lastTakenSlot: SlotPosition | null = null;

    private hoverId: number | null = null;
    private selectedId: number | null = null;
    private hintTimer: number | null = null;
    private nextTileId = 1;
    private centerX = 0;
    private centerZ = 0;

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
        // Bright white body with a strong specular highlight + edge Fresnel rim for
        // a glossy "glass" look.
        this.tileMat = new BABYLON.StandardMaterial('tile-base', this.bjs);
        this.tileMat.diffuseColor = BABYLON.Color3.FromHexString(TILE_BASE_COLOR);
        this.tileMat.specularColor = new BABYLON.Color3(0.6, 0.64, 0.7);
        this.tileMat.specularPower = TILE_SPECULAR_POWER;
        this.tileMat.emissiveColor = new BABYLON.Color3(0.04, 0.045, 0.05);
        const rim = new BABYLON.FresnelParameters();
        rim.bias = 0.12;
        rim.power = 2;
        rim.leftColor = new BABYLON.Color3(0.75, 0.88, 1.0);
        rim.rightColor = BABYLON.Color3.Black();
        this.tileMat.emissiveFresnelParameters = rim;
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
            const cx = (slot.gx + 1) * CELL_HALF_X;
            const cz = (slot.gy + 1) * CELL_HALF_Z;
            sumX += cx; sumZ += cz;
            maxX = Math.max(maxX, cx); minX = Math.min(minX, cx);
            maxZ = Math.max(maxZ, cz); minZ = Math.min(minZ, cz);
        }
        this.centerX = sumX / slots.length;
        this.centerZ = sumZ / slots.length;
        this.boardRadius = Math.max(maxX - minX, maxZ - minZ) + CELL_HALF_X * 4;

        for (let i = 0; i < slots.length; i++) {
            this.createTile(slots[i], level.faceByIndex[i]);
        }

        this.recomputeFree();
    }

    /** Creates one tile (body + symbol) at its slot and registers it. */
    private createTile(slot: SlotPosition, faceId: number): Tile {
        const worldX = (slot.gx + 1) * CELL_HALF_X - this.centerX;
        const worldZ = (slot.gy + 1) * CELL_HALF_Z - this.centerZ;
        const worldY = slot.layer * LAYER_HEIGHT + TILE_THICKNESS / 2;
        const id = this.nextTileId++;

        const box = createRoundedTileMesh(`tile-${id}`, TILE_WIDTH, TILE_DEPTH, TILE_THICKNESS, TILE_CORNER_RADIUS, this.bjs);
        box.parent = this.root;
        box.position.set(worldX, worldY, worldZ);
        box.material = this.tileMat;
        box.isPickable = true;

        const symbol = BABYLON.MeshBuilder.CreatePlane(`sym-${id}`, {
            width: TILE_WIDTH * SYMBOL_SCALE,
            height: TILE_DEPTH * SYMBOL_SCALE,
        }, this.bjs);
        symbol.parent = this.root;
        symbol.rotation.x = -Math.PI / 2;
        symbol.position.set(worldX, worldY + TILE_THICKNESS / 2 + 0.012, worldZ);
        symbol.material = this.getSymbolMaterial(faceId);
        symbol.isPickable = false;

        const tile: Tile = { id, faceId, pos: slot, removed: false, mesh: box, symbolMesh: symbol };
        box.metadata = { tileId: tile.id };
        this.tiles.push(tile);
        return tile;
    }

    /** Puts a previously taken tile back on its slot (undo). */
    restoreTile(slot: SlotPosition, faceId: number): void {
        this.createTile(slot, faceId);
        this.recomputeFree();
    }

    /** Live (non-removed) tiles in board order. */
    liveTiles(): Tile[] {
        return this.tiles.filter(t => !t.removed);
    }

    /** Swaps the faces of live tiles in place (shuffle). Order matches liveTiles(). */
    applyFaces(faceByLiveIndex: number[]): void {
        const live = this.liveTiles();
        if (faceByLiveIndex.length !== live.length) {
            console.warn('[BoardSystem] applyFaces length mismatch, skipping');
            return;
        }
        for (let i = 0; i < live.length; i++) {
            const tile = live[i];
            tile.faceId = faceByLiveIndex[i];
            tile.symbolMesh.material = this.getSymbolMaterial(tile.faceId);
        }
    }

    private getSymbolMaterial(faceId: number): BABYLON.StandardMaterial {
        const cached = this.symbolMats.get(faceId);
        if (cached) return cached;

        const tex = new BABYLON.DynamicTexture(`sym-tex-${faceId}`, { width: SYMBOL_TEXTURE_WIDTH, height: SYMBOL_TEXTURE_HEIGHT }, this.bjs, true);
        tex.hasAlpha = true;
        const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
        drawTileFace(ctx, faceId, SYMBOL_TEXTURE_WIDTH, SYMBOL_TEXTURE_HEIGHT);
        tex.update(false);

        const mat = new BABYLON.StandardMaterial(`sym-mat-${faceId}`, this.bjs);
        mat.diffuseTexture = tex;
        mat.emissiveTexture = tex;
        mat.emissiveColor = new BABYLON.Color3(0.85, 0.85, 0.85);
        mat.diffuseColor = new BABYLON.Color3(1.0, 1.0, 1.0);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mat.useAlphaFromDiffuseTexture = true;
        mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        mat.backFaceCulling = false;
        this.symbolMats.set(faceId, mat);
        return mat;
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
        return this.pickTileIdAt(this.bjs.pointerX, this.bjs.pointerY);
    }

    /** Picks a tile at client (screen) coordinates; reliable for touch taps. */
    pickTileIdAt(clientX: number, clientY: number): number | null {
        const canvas = this.bjs.getEngine().getRenderingCanvas();
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const pick = this.bjs.pick(x, y, (m) => !!(m.metadata && m.metadata.tileId));
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

    /**
     * Removes a single tile from the board (it "flies" to the tray) and returns
     * its faceId, or null when the tile is no longer present.
     */
    takeTile(tileId: number): number | null {
        const tile = this.getTile(tileId);
        if (!tile) return null;
        tile.removed = true;
        this.lastTakenPos = tile.mesh.getAbsolutePosition().clone();
        this.lastTakenScreen = this.projectTileToScreen(tile);
        this.lastTakenSlot = tile.pos;
        this.highlight.removeMesh(tile.mesh);
        if (this.selectedId === tileId) this.selectedId = null;
        if (this.hoverId === tileId) this.hoverId = null;
        this.animateOut(tile);
        this.recomputeFree();
        return tile.faceId;
    }

    /** Projects a tile's center to client (CSS pixel) coordinates for DOM animations. */
    private projectTileToScreen(tile: Tile): TakenTileScreenInfo | null {
        const engine = this.bjs.getEngine();
        const canvas = engine.getRenderingCanvas();
        const camera = this.bjs.activeCamera;
        if (!canvas || !camera) return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const renderW = engine.getRenderWidth();
        const renderH = engine.getRenderHeight();

        const world = tile.mesh.getAbsolutePosition();
        const project = (p: BABYLON.Vector3) => BABYLON.Vector3.Project(
            p,
            BABYLON.Matrix.Identity(),
            this.bjs.getTransformMatrix(),
            camera.viewport.toGlobal(renderW, renderH),
        );
        const center = project(world);
        const edge = project(world.add(new BABYLON.Vector3(TILE_WIDTH / 2, 0, 0)));
        const widthPx = Math.abs(edge.x - center.x) * 2 / renderW * rect.width;
        return {
            x: rect.left + (center.x / renderW) * rect.width,
            y: rect.top + (center.y / renderH) * rect.height,
            widthPx: Math.max(12, widthPx),
            heightPx: Math.max(12, widthPx * (TILE_DEPTH / TILE_WIDTH)),
        };
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

    /** Quick pickup pop: the DOM clone flying to the tray takes over visually. */
    private animateOut(tile: Tile): void {
        const frames = 12;
        const fps = frames / (REMOVE_ANIM_MS / 1000);
        const ease = new BABYLON.QuadraticEase();
        ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEIN);

        for (const mesh of [tile.mesh, tile.symbolMesh]) {
            const scaleAnim = new BABYLON.Animation('rm-scale', 'scaling', fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
            scaleAnim.setKeys([
                { frame: 0, value: mesh.scaling.clone() },
                { frame: frames * 0.35, value: mesh.scaling.scale(1.08) },
                { frame: frames, value: new BABYLON.Vector3(0.01, 0.01, 0.01) },
            ]);
            scaleAnim.setEasingFunction(ease);
            const posAnim = new BABYLON.Animation('rm-pos', 'position.y', fps, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
            posAnim.setKeys([
                { frame: 0, value: mesh.position.y },
                { frame: frames, value: mesh.position.y + 0.5 },
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

    /**
     * Center and framing radius of the tiles still on the board, so the camera can
     * recenter/zoom closer as tiles are removed. Returns null when the board is empty.
     */
    getActiveBounds(): { center: BABYLON.Vector3; width: number; depth: number } | null {
        let sumX = 0;
        let sumZ = 0;
        let count = 0;
        let maxX = -Infinity;
        let minX = Infinity;
        let maxZ = -Infinity;
        let minZ = Infinity;
        for (const tile of this.tiles) {
            if (tile.removed) continue;
            const p = tile.mesh.position;
            sumX += p.x; sumZ += p.z; count++;
            if (p.x > maxX) maxX = p.x;
            if (p.x < minX) minX = p.x;
            if (p.z > maxZ) maxZ = p.z;
            if (p.z < minZ) minZ = p.z;
        }
        if (count === 0) return null;
        const center = new BABYLON.Vector3(sumX / count, 0, sumZ / count);
        // Full visual span on each axis (tile extents reach half a tile beyond the
        // outermost tile centers).
        const width = (maxX - minX) + TILE_WIDTH;
        const depth = (maxZ - minZ) + TILE_DEPTH;
        return { center, width, depth };
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
        this.lastTakenPos = null;
        this.lastTakenScreen = null;
        this.lastTakenSlot = null;
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
