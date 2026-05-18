#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const IF_MISSING = args.has('--if-missing');

const TREES_DIR = path.join(ROOT, 'src/game/assets/textures/trees');
const TREES_REQUIRED = ['oak.png', 'pine.png', 'palm.png', 'shrub.png'];

const ASSETS = {
    lut: path.join(ROOT, 'src/game/assets/luts/cinematic_warm.png'),
    noise3d: path.join(ROOT, 'src/game/assets/textures/cloud_noise_3d.png'),
};

const TAG = '[gen-visual-assets]';
function log(...a)  { console.log(TAG, ...a); }
function warn(...a) { console.warn(TAG, '[WARN]', ...a); }
function err(...a)  { console.error(TAG, '[ERROR]', ...a); }

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }
function existsOk(p) { try { return fs.existsSync(p) && fs.statSync(p).size > 0; } catch { return false; } }

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
    }
    const idat = zlib.deflateSync(raw, { level: 6 });
    return Buffer.concat([
        PNG_SIG,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', idat),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function genLut() {
    const w = 256, h = 16;
    const px = Buffer.alloc(w * h * 4);
    for (let s = 0; s < 16; s++) {
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                let r = x / 15, g = y / 15, b = s / 15;
                r = Math.pow(r, 0.95) * 1.06;
                g = Math.pow(g, 1.00) * 1.00;
                b = Math.pow(b, 1.05) * 0.94;
                const k = 1.06;
                r = (r - 0.5) * k + 0.5;
                g = (g - 0.5) * k + 0.5;
                b = (b - 0.5) * k + 0.5;
                r = Math.max(0, Math.min(1, r));
                g = Math.max(0, Math.min(1, g));
                b = Math.max(0, Math.min(1, b));
                const px_x = s * 16 + x;
                const i = (y * w + px_x) * 4;
                px[i]     = Math.round(r * 255);
                px[i + 1] = Math.round(g * 255);
                px[i + 2] = Math.round(b * 255);
                px[i + 3] = 255;
            }
        }
    }
    return encodePNG(w, h, px);
}

function hash3(x, y, z, seed) {
    let h = ((x | 0) * 73856093) ^ ((y | 0) * 19349663) ^ ((z | 0) * 83492791) ^ (seed | 0);
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}
function rng01(seed) {
    const s = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
}
function worley3d(x, y, z, freq, seed) {
    const X = x * freq, Y = y * freq, Z = z * freq;
    const cx = Math.floor(X), cy = Math.floor(Y), cz = Math.floor(Z);
    const fx = X - cx, fy = Y - cy, fz = Z - cz;
    let minDist = 4.0;
    for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const h = hash3(cx + dx, cy + dy, cz + dz, seed);
                const px = dx + rng01(h);
                const py = dy + rng01(h ^ 0x9e3779b1);
                const pz = dz + rng01(h ^ 0x85ebca77);
                const ddx = px - fx, ddy = py - fy, ddz = pz - fz;
                const d = ddx * ddx + ddy * ddy + ddz * ddz;
                if (d < minDist) minDist = d;
            }
        }
    }
    return Math.sqrt(minDist);
}
function fbmWorley(x, y, z, baseFreq, octaves, seed) {
    let v = 0, w = 0, amp = 1, freq = baseFreq;
    for (let o = 0; o < octaves; o++) {
        v += amp * (1.0 - Math.min(1.0, worley3d(x, y, z, freq, seed + o * 911)));
        w += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return v / w;
}
function genNoise3d() {
    const SIZE = 128;
    const SLICES = 128;
    const w = SIZE;
    const h = SIZE * SLICES;
    const px = Buffer.alloc(w * h * 4);
    const inv = 1 / SIZE;
    for (let z = 0; z < SLICES; z++) {
        const zn = z / SLICES;
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const xn = x * inv, yn = y * inv;
                const r = fbmWorley(xn, yn, zn, 4,  4, 1337);
                const g = fbmWorley(xn, yn, zn, 8,  3, 4242);
                const b = fbmWorley(xn, yn, zn, 16, 2, 7777);
                const i = ((z * SIZE + y) * w + x) * 4;
                px[i]     = Math.round(Math.max(0, Math.min(1, r)) * 255);
                px[i + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
                px[i + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
                px[i + 3] = 255;
            }
        }
        if ((z & 15) === 0) log(`  noise3d slice ${z}/${SLICES}`);
    }
    return encodePNG(w, h, px);
}

function reportTreeStatus() {
    const present = [];
    const missing = [];
    for (const name of TREES_REQUIRED) {
        const p = path.join(TREES_DIR, name);
        if (existsOk(p)) present.push(name);
        else missing.push(name);
    }
    if (missing.length === 0) {
        log(`Trees: all ${TREES_REQUIRED.length} PNGs present in ${path.relative(ROOT, TREES_DIR)}`);
        return;
    }
    warn(`Trees: ${missing.length} missing PNG(s) in ${path.relative(ROOT, TREES_DIR)}: ${missing.join(', ')}`);
    warn('Vegetation feature requires CC0/MIT tree PNGs. Download manually from https://kenney.nl/assets/foliage-sprites (or any source) and drop them with the exact filenames listed above.');
}

async function main() {
    log(`Running with ${IF_MISSING ? 'IF_MISSING flag (skip existing)' : 'full regenerate'}`);

    if (IF_MISSING && existsOk(ASSETS.lut)) {
        log('LUT exists, skipping');
    } else {
        ensureDir(ASSETS.lut);
        const t0 = Date.now();
        fs.writeFileSync(ASSETS.lut, genLut());
        log(`LUT generated in ${Date.now() - t0}ms -> ${path.relative(ROOT, ASSETS.lut)}`);
    }

    if (IF_MISSING && existsOk(ASSETS.noise3d)) {
        log('cloud_noise_3d exists, skipping');
    } else {
        ensureDir(ASSETS.noise3d);
        log('Generating 3D cloud noise (128 slices of 128x128, may take 30-60s)');
        const t0 = Date.now();
        fs.writeFileSync(ASSETS.noise3d, genNoise3d());
        log(`cloud_noise_3d generated in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${path.relative(ROOT, ASSETS.noise3d)}`);
    }

    reportTreeStatus();

    log('Done.');
}

main().catch((e) => {
    err(e && e.stack ? e.stack : String(e));
    process.exit(1);
});
