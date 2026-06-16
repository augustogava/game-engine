/**
 * Shared tile-face drawing onto a 2D canvas context. Used by the 3D board
 * (via a Babylon DynamicTexture context) and the DOM tray (via a <canvas>),
 * so a tile looks identical wherever it is rendered.
 */
import { TILE_FACES } from './tileSet.js';
import { getFaceArt } from './faceArt.js';
import { TILE_GROUP } from '../types/index.js';

const PIP_STEP_X = 0.16;
const PIP_STEP_Y = 0.14;
const BAR_STEP_X = 0.14;
const BAR_STEP_Y = 0.18;

/** Fraction of the tile occupied by composited face art. */
const ART_FILL = 0.84;
/** Corner radius of the panel as a fraction of the shorter side (matches the tile mesh). */
const PANEL_RADIUS = 0.16;
/** Inset of the panel from the tile edge (0 = fills to the rounded border, no padding). */
const PANEL_PAD = 0;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Subtle per-group panel palette so the board reads colorful, not all-white. */
interface PanelPalette {
    base: string;
    top: string;
    mid: string;
    bottom: string;
    stroke: string;
}

function getPanelPalette(group: number): PanelPalette {
    switch (group) {
        case TILE_GROUP.SUIT_BAMBOO:
            return { base: '#e7f6ea', top: '#e2f6e6', mid: '#c2ead0', bottom: '#a4dcb6', stroke: 'rgba(36,92,54,0.32)' };
        case TILE_GROUP.SUIT_DOTS:
            return { base: '#eaf2ff', top: '#f4f9ff', mid: '#dce9ff', bottom: '#c2d8f6', stroke: 'rgba(40,78,140,0.30)' };
        case TILE_GROUP.SUIT_CHAR:
            return { base: '#fff4ec', top: '#fffaf4', mid: '#ffe9d6', bottom: '#f7d6bd', stroke: 'rgba(150,90,60,0.30)' };
        case TILE_GROUP.WIND:
            return { base: '#f0eefb', top: '#f7f5ff', mid: '#e4def6', bottom: '#cfc6ec', stroke: 'rgba(70,60,140,0.30)' };
        case TILE_GROUP.DRAGON:
            return { base: '#fdeef0', top: '#fff6f7', mid: '#f7dde2', bottom: '#eec6cd', stroke: 'rgba(140,60,70,0.30)' };
        case TILE_GROUP.FLOWER:
            return { base: '#fdecf5', top: '#fff5fb', mid: '#f9d9ea', bottom: '#f0c0db', stroke: 'rgba(150,50,100,0.30)' };
        case TILE_GROUP.SEASON:
            return { base: '#e8f7f8', top: '#f3fcfd', mid: '#d4eef0', bottom: '#b9e2e5', stroke: 'rgba(40,120,128,0.30)' };
        default:
            return { base: '#ffffff', top: '#ffffff', mid: '#f3f6fb', bottom: '#dfe6ef', stroke: 'rgba(120,132,154,0.32)' };
    }
}

/** Draws the glossy "glass" tile body: rounded portrait panel, vertical sheen, edge. */
function drawTileBackground(ctx: CanvasRenderingContext2D, W: number, H: number, group: number): void {
    const ref = Math.min(W, H);
    const r = ref * PANEL_RADIUS;
    const pad = ref * PANEL_PAD;
    const w = W - pad * 2;
    const h = H - pad * 2;
    const palette = getPanelPalette(group);

    ctx.clearRect(0, 0, W, H);

    roundRectPath(ctx, pad, pad, w, h, r);
    const grad = ctx.createLinearGradient(0, pad, 0, pad + h);
    grad.addColorStop(0, palette.top);
    grad.addColorStop(0.55, palette.mid);
    grad.addColorStop(1, palette.bottom);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    roundRectPath(ctx, pad, pad, w, h, r);
    ctx.clip();
    const gloss = ctx.createLinearGradient(0, pad, 0, pad + h * 0.55);
    gloss.addColorStop(0, 'rgba(255,255,255,0.85)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(pad, pad, w, h * 0.5);
    ctx.restore();

    const sw = Math.max(2, ref * 0.02);
    roundRectPath(ctx, pad + sw / 2, pad + sw / 2, w - sw, h - sw, Math.max(0, r - sw / 2));
    ctx.lineWidth = sw;
    ctx.strokeStyle = palette.stroke;
    ctx.stroke();
}

/** Composites a preloaded face-art image centered and aspect-fit on the tile. */
function drawArt(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number): void {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const maxW = W * ART_FILL;
    const maxH = H * ART_FILL;
    const scale = Math.min(maxW / iw, maxH / ih);
    const w = iw * scale;
    const h = ih * scale;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function drawPips(ctx: CanvasRenderingContext2D, count: number, color: string, W: number, H: number): void {
    const cols = count <= 3 ? 1 : (count <= 6 ? 2 : 3);
    const rows = Math.ceil(count / cols);
    const ref = Math.min(W, H);
    const r = ref * 0.07;
    const marginY = H * 0.5 - ((rows - 1) * H * PIP_STEP_Y) / 2;
    let drawn = 0;
    for (let row = 0; row < rows; row++) {
        const inThisRow = Math.min(cols, count - drawn);
        const rowStartX = W * 0.5 - ((inThisRow - 1) * W * PIP_STEP_X) / 2;
        for (let c = 0; c < inThisRow; c++) {
            const x = rowStartX + c * W * PIP_STEP_X;
            const y = marginY + row * H * PIP_STEP_Y;
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
}

function drawBars(ctx: CanvasRenderingContext2D, count: number, color: string, W: number, H: number): void {
    const cols = count <= 3 ? count : (count <= 6 ? 3 : Math.ceil(count / 3));
    const rows = Math.ceil(count / cols);
    const ref = Math.min(W, H);
    const barW = ref * 0.05;
    const barH = ref * 0.18;
    let drawn = 0;
    for (let row = 0; row < rows; row++) {
        const inThisRow = Math.min(cols, count - drawn);
        const rowStartX = W * 0.5 - ((inThisRow - 1) * W * BAR_STEP_X) / 2;
        const y = H * 0.5 - ((rows - 1) * H * BAR_STEP_Y) / 2 + row * H * BAR_STEP_Y;
        for (let c = 0; c < inThisRow; c++) {
            const x = rowStartX + c * W * BAR_STEP_X;
            ctx.fillStyle = color;
            ctx.fillRect(x - barW / 2, y - barH / 2, barW, barH);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(x - barW / 2, y - barH / 2, barW, barH * 0.18);
            drawn++;
        }
    }
}

/** Draws the face for `faceId` filling a portrait rectangle of size W x H. */
export function drawTileFace(ctx: CanvasRenderingContext2D, faceId: number, W: number, H: number): void {
    const face = TILE_FACES[faceId];
    if (!face) return;

    drawTileBackground(ctx, W, H, face.group);

    const art = getFaceArt(faceId);
    if (art) {
        drawArt(ctx, art, W, H);
        return;
    }

    const ref = Math.min(W, H);
    ctx.fillStyle = face.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (face.group === TILE_GROUP.SUIT_DOTS) {
        drawPips(ctx, face.pips, face.color, W, H);
    } else if (face.group === TILE_GROUP.SUIT_BAMBOO) {
        drawBars(ctx, face.bars, face.color, W, H);
    } else if (face.group === TILE_GROUP.SUIT_CHAR) {
        ctx.font = `bold ${Math.round(ref * 0.5)}px serif`;
        ctx.fillText(face.glyph, W / 2, H * 0.38);
        ctx.font = `bold ${Math.round(ref * 0.28)}px serif`;
        ctx.fillText('萬', W / 2, H * 0.74);
    } else {
        ctx.font = `bold ${Math.round(ref * 0.58)}px serif`;
        ctx.fillText(face.glyph, W / 2, H / 2 + ref * 0.02);
    }
}
