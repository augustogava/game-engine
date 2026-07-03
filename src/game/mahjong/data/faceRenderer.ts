/**
 * Shared tile-face drawing onto a 2D canvas context. Used by the 3D board
 * (via a Babylon DynamicTexture context) and the DOM tray (via a <canvas>),
 * so a tile looks identical wherever it is rendered.
 */
import { TILE_FACES } from './tileSet.js';
import { getFaceArt } from './faceArt.js';
import { TILE_GROUP } from '../types/index.js';

const PIP_STEP_X = 0.26;
const PIP_STEP_Y = 0.22;
const BAR_STEP_X = 0.24;
const BAR_STEP_Y = 0.28;

/** Fraction of the tile occupied by composited face art (near full-bleed like the reference). */
const ART_FILL = 0.97;
/** Corner radius of the panel as a fraction of the shorter side (matches the tile mesh). */
const PANEL_RADIUS = 0.16;
/** Inset of the panel from the tile edge (0 = fills to the rounded border, no padding). */
const PANEL_PAD = 0;

/** White-dragon slot renders as the gold treasure tile (reference gold tiles). */
const GOLD_FACE_ID = 33;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** Panel palette: white glossy for regular tiles, solid green / gold for special ones. */
interface PanelPalette {
    top: string;
    mid: string;
    bottom: string;
    stroke: string;
}

const PANEL_WHITE: PanelPalette = { top: '#ffffff', mid: '#f6f8fb', bottom: '#e4e9f1', stroke: 'rgba(120,132,154,0.28)' };
const PANEL_GREEN: PanelPalette = { top: '#8ce464', mid: '#43c341', bottom: '#1f9a34', stroke: 'rgba(18,88,30,0.5)' };
const PANEL_GOLD: PanelPalette = { top: '#ffe9a8', mid: '#f7cd54', bottom: '#dfa72c', stroke: 'rgba(142,96,12,0.45)' };

function getPanelPalette(faceId: number): PanelPalette {
    if (faceId === GOLD_FACE_ID) return PANEL_GOLD;
    return PANEL_WHITE;
}

/** Draws the glossy tile body: rounded portrait panel, vertical sheen, edge. */
function drawTilePanel(ctx: CanvasRenderingContext2D, W: number, H: number, palette: PanelPalette): void {
    const ref = Math.min(W, H);
    const r = ref * PANEL_RADIUS;
    const pad = ref * PANEL_PAD;
    const w = W - pad * 2;
    const h = H - pad * 2;

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

/** Inner bevel highlight for the face-down green back. */
function drawBlockBevel(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const ref = Math.min(W, H);
    const inset = ref * 0.09;
    const r = ref * (PANEL_RADIUS * 0.8);
    roundRectPath(ctx, inset, inset, W - inset * 2, H - inset * 2, r);
    ctx.lineWidth = Math.max(2, ref * 0.03);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
}

/** Draws the green face-down back (hidden tiles that flip to reveal their face). */
export function drawTileBack(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    drawTilePanel(ctx, W, H, PANEL_GREEN);
    drawBlockBevel(ctx, W, H);
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
    const r = count === 1 ? ref * 0.24 : ref * 0.105;
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
            ctx.lineWidth = Math.max(2, ref * 0.016);
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
    const barW = ref * 0.1;
    const barH = ref * 0.26;
    let drawn = 0;
    for (let row = 0; row < rows; row++) {
        const inThisRow = Math.min(cols, count - drawn);
        const rowStartX = W * 0.5 - ((inThisRow - 1) * W * BAR_STEP_X) / 2;
        const y = H * 0.5 - ((rows - 1) * H * BAR_STEP_Y) / 2 + row * H * BAR_STEP_Y;
        for (let c = 0; c < inThisRow; c++) {
            const x = rowStartX + c * W * BAR_STEP_X;
            ctx.fillStyle = color;
            ctx.beginPath();
            roundRectPath(ctx, x - barW / 2, y - barH / 2, barW, barH, barW * 0.4);
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.fillRect(x - barW / 2, y - barH * 0.08, barW, barH * 0.16);
            drawn++;
        }
    }
}

/** Draws the face for `faceId` filling a portrait rectangle of size W x H. */
export function drawTileFace(ctx: CanvasRenderingContext2D, faceId: number, W: number, H: number): void {
    const face = TILE_FACES[faceId];
    if (!face) return;

    drawTilePanel(ctx, W, H, getPanelPalette(faceId));

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
        ctx.font = `bold ${Math.round(ref * 0.62)}px serif`;
        ctx.fillText(face.glyph, W / 2, H * 0.34);
        ctx.font = `bold ${Math.round(ref * 0.34)}px serif`;
        ctx.fillText('萬', W / 2, H * 0.76);
    } else {
        ctx.font = `bold ${Math.round(ref * 0.8)}px serif`;
        ctx.fillText(face.glyph, W / 2, H / 2 + ref * 0.03);
    }
}
