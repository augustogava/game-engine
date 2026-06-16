/**
 * Shared tile-face drawing onto a 2D canvas context. Used by the 3D board
 * (via a Babylon DynamicTexture context) and the DOM tray (via a <canvas>),
 * so a tile looks identical wherever it is rendered.
 */
import { TILE_FACES } from './tileSet.js';
import { TILE_GROUP } from '../types/index.js';

const PIP_STEP = 0.16;
const BAR_STEP_X = 0.14;
const BAR_STEP_Y = 0.22;

function drawPips(ctx: CanvasRenderingContext2D, count: number, color: string, S: number): void {
    const cols = count <= 3 ? 1 : (count <= 6 ? 2 : 3);
    const rows = Math.ceil(count / cols);
    const r = S * 0.07;
    const marginY = S * 0.5 - ((rows - 1) * S * PIP_STEP) / 2;
    let drawn = 0;
    for (let row = 0; row < rows; row++) {
        const inThisRow = Math.min(cols, count - drawn);
        const rowStartX = S * 0.5 - ((inThisRow - 1) * S * PIP_STEP) / 2;
        for (let c = 0; c < inThisRow; c++) {
            const x = rowStartX + c * S * PIP_STEP;
            const y = marginY + row * S * PIP_STEP;
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

function drawBars(ctx: CanvasRenderingContext2D, count: number, color: string, S: number): void {
    const cols = count <= 3 ? count : (count <= 6 ? 3 : Math.ceil(count / 3));
    const rows = Math.ceil(count / cols);
    const barW = S * 0.05;
    const barH = S * 0.18;
    let drawn = 0;
    for (let row = 0; row < rows; row++) {
        const inThisRow = Math.min(cols, count - drawn);
        const rowStartX = S * 0.5 - ((inThisRow - 1) * S * BAR_STEP_X) / 2;
        const y = S * 0.5 - ((rows - 1) * S * BAR_STEP_Y) / 2 + row * S * BAR_STEP_Y;
        for (let c = 0; c < inThisRow; c++) {
            const x = rowStartX + c * S * BAR_STEP_X;
            ctx.fillStyle = color;
            ctx.fillRect(x - barW / 2, y - barH / 2, barW, barH);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(x - barW / 2, y - barH / 2, barW, barH * 0.18);
            drawn++;
        }
    }
}

/** Draws the face for `faceId` filling a square of side `S` at the origin. */
export function drawTileFace(ctx: CanvasRenderingContext2D, faceId: number, S: number): void {
    const face = TILE_FACES[faceId];
    if (!face) return;

    ctx.fillStyle = '#fbf6e7';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(60,50,30,0.25)';
    ctx.lineWidth = Math.max(2, S * 0.024);
    ctx.strokeRect(S * 0.03, S * 0.03, S - S * 0.06, S - S * 0.06);

    ctx.fillStyle = face.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (face.group === TILE_GROUP.SUIT_DOTS) {
        drawPips(ctx, face.pips, face.color, S);
    } else if (face.group === TILE_GROUP.SUIT_BAMBOO) {
        drawBars(ctx, face.bars, face.color, S);
    } else if (face.group === TILE_GROUP.SUIT_CHAR) {
        ctx.font = `bold ${Math.round(S * 0.5)}px serif`;
        ctx.fillText(face.glyph, S / 2, S * 0.4);
        ctx.font = `bold ${Math.round(S * 0.28)}px serif`;
        ctx.fillText('萬', S / 2, S * 0.78);
    } else {
        ctx.font = `bold ${Math.round(S * 0.62)}px serif`;
        ctx.fillText(face.glyph, S / 2, S / 2 + S * 0.04);
    }
}
