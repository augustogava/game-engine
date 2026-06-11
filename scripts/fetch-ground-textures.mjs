#!/usr/bin/env node
// Downloads CC0 PBR ground texture sets from ambientCG into
// src/game/assets/textures/ground/. The ambient occlusion map is
// pre-multiplied into the color map (via sharp), so the runtime material
// gets baked AO without extra shader samplers.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const IF_MISSING = args.has('--if-missing');

const GROUND_DIR = path.join(ROOT, 'src/game/assets/textures/ground');
const QUALITY = '2K-JPG';
const DOWNLOAD_BASE_URL = 'https://ambientcg.com/get?file=';
const USER_AGENT = 'game-engine-asset-fetch';
const JPEG_QUALITY = 88;

// CC0 assets from https://ambientcg.com (no attribution required).
const TEXTURE_SETS = [
    { assetId: 'Ground037', name: 'forest_floor' },
    { assetId: 'Grass004', name: 'grass' },
    { assetId: 'Ground048', name: 'dirt_path' },
    { assetId: 'Rock035', name: 'rock' },
];

const MAPS = [
    { suffix: 'Color', out: 'color' },
    { suffix: 'NormalGL', out: 'normal' },
];
const AO_SUFFIX = 'AmbientOcclusion';

const TAG = '[fetch-ground-textures]';
function log(...a) { console.log(TAG, ...a); }
function err(...a) { console.error(TAG, '[ERROR]', ...a); }

function existsOk(p) { try { return fs.existsSync(p) && fs.statSync(p).size > 0; } catch { return false; } }

// Minimal ZIP reader: walks the central directory and inflates requested entries.
const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function readZipEntries(buf) {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP: end of central directory not found');
    const count = buf.readUInt16LE(eocd + 10);
    let offset = buf.readUInt32LE(eocd + 16);

    const entries = [];
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(offset) !== CDIR_SIG) throw new Error('ZIP: bad central directory entry');
        const method = buf.readUInt16LE(offset + 10);
        const compSize = buf.readUInt32LE(offset + 20);
        const nameLen = buf.readUInt16LE(offset + 28);
        const extraLen = buf.readUInt16LE(offset + 30);
        const commentLen = buf.readUInt16LE(offset + 32);
        const localOffset = buf.readUInt32LE(offset + 42);
        const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);
        entries.push({ name, method, compSize, localOffset });
        offset += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

function extractZipEntry(buf, entry) {
    if (buf.readUInt32LE(entry.localOffset) !== LOCAL_SIG) throw new Error(`ZIP: bad local header for ${entry.name}`);
    const nameLen = buf.readUInt16LE(entry.localOffset + 26);
    const extraLen = buf.readUInt16LE(entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + entry.compSize);
    if (entry.method === 0) return Buffer.from(data);
    if (entry.method === 8) return zlib.inflateRawSync(data);
    throw new Error(`ZIP: unsupported compression method ${entry.method} for ${entry.name}`);
}

async function downloadZip(assetId) {
    const url = `${DOWNLOAD_BASE_URL}${assetId}_${QUALITY}.zip`;
    log(`Downloading ${url}`);
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
    return Buffer.from(await res.arrayBuffer());
}

async function fetchSet(set) {
    const targets = MAPS.map(m => ({
        ...m,
        dest: path.join(GROUND_DIR, `${set.name}_${m.out}.jpg`),
    }));
    if (IF_MISSING && targets.every(t => existsOk(t.dest))) {
        log(`${set.name}: all maps present, skipping`);
        return;
    }

    const zip = await downloadZip(set.assetId);
    const entries = readZipEntries(zip);
    const findEntry = (suffix) => entries.find(e => e.name === `${set.assetId}_${QUALITY}_${suffix}.jpg`);

    const aoEntry = findEntry(AO_SUFFIX);
    for (const t of targets) {
        const entry = findEntry(t.suffix);
        if (!entry) {
            throw new Error(`${set.name}: '${t.suffix}' map not found in zip (entries: ${entries.map(e => e.name).join(', ')})`);
        }
        let data = extractZipEntry(zip, entry);
        if (t.suffix === 'Color' && aoEntry) {
            // Bake AO into the albedo: crevices stay dark with no runtime cost.
            const ao = extractZipEntry(zip, aoEntry);
            data = await sharp(data)
                .composite([{ input: ao, blend: 'multiply' }])
                .jpeg({ quality: JPEG_QUALITY })
                .toBuffer();
        } else if (t.suffix === 'Color') {
            log(`  ${set.name}: no AO map in this set, keeping plain color`);
        } else if (t.suffix === 'NormalGL') {
            // Re-encode: the source normals ship near-lossless (~10MB each at 2K).
            data = await sharp(data)
                .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: '4:4:4' })
                .toBuffer();
        }
        fs.writeFileSync(t.dest, data);
        log(`  ${set.name}: wrote ${path.relative(ROOT, t.dest)}${t.suffix === 'Color' && aoEntry ? ' (AO baked)' : ''} (${(fs.statSync(t.dest).size / 1024).toFixed(0)} KB)`);
    }
}

async function main() {
    log(`Target dir: ${path.relative(ROOT, GROUND_DIR)} (${IF_MISSING ? 'skip existing' : 'full download'})`);
    fs.mkdirSync(GROUND_DIR, { recursive: true });
    for (const set of TEXTURE_SETS) {
        await fetchSet(set);
    }
    log('Done.');
}

main().catch((e) => {
    err(e && e.stack ? e.stack : String(e));
    process.exit(1);
});
