import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SRC_BASE = 'C:/Users/augus/.cursor/projects/d-Development-games-game-engine/assets/c__Users_augus_AppData_Roaming_Cursor_User_workspaceStorage_3e532e1fe0ad467cb190a3c8a1ed628e_images_';
const DEST_DIR = path.join(ROOT, 'src/game/assets/textures/trees');
const TARGET_HEIGHT = 512;

const JOBS = [
    { out: 'pine.png',  src: 'Screenshot_2026-05-18_101136-20cbf35d-5724-47a4-97bd-c8a23b5b8ee5.png', bg: 'white' },
    { out: 'shrub.png', src: 'Screenshot_2026-05-18_100828-dab36fcf-ef0b-40e8-a2f7-d2b8efea5742.png', bg: 'white' },
    { out: 'palm.png',  src: 'image-95431400-a00c-4142-b00f-0973b6482399.png',                        bg: 'white' },
    { out: 'oak.png',   src: 'image-452ac847-3cdf-4fcc-85d6-22b7d76530e9.png',                        bg: 'black' },
];

function keyWhite(data) {
    const FULL_BG_MIN = 250;
    const EDGE_BG_MIN = 225;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const mn = Math.min(r, g, b);
        if (mn >= FULL_BG_MIN) {
            data[i + 3] = 0;
        } else if (mn >= EDGE_BG_MIN) {
            const t = (FULL_BG_MIN - mn) / (FULL_BG_MIN - EDGE_BG_MIN);
            data[i + 3] = Math.round(t * 255);
        } else {
            data[i + 3] = 255;
        }
    }
}

function keyBlack(data) {
    const FULL_BG_MAX = 10;
    const EDGE_BG_MAX = 28;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const mx = Math.max(r, g, b);
        if (mx <= FULL_BG_MAX) {
            data[i + 3] = 0;
        } else if (mx <= EDGE_BG_MAX) {
            const t = (mx - FULL_BG_MAX) / (EDGE_BG_MAX - FULL_BG_MAX);
            data[i + 3] = Math.round(t * 255);
        } else {
            data[i + 3] = 255;
        }
    }
}

async function run() {
    for (const job of JOBS) {
        const srcPath = SRC_BASE + job.src;
        const { data, info } = await sharp(srcPath)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        if (job.bg === 'white') keyWhite(data);
        else if (job.bg === 'black') keyBlack(data);

        let pipeline = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });

        try {
            pipeline = pipeline.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 });
        } catch (e) {
            console.warn(`[trim] skipped for ${job.out}: ${e.message}`);
        }

        const trimmed = await pipeline.png().toBuffer();
        const trMeta = await sharp(trimmed).metadata();
        const newW = Math.max(1, Math.round((trMeta.width * TARGET_HEIGHT) / trMeta.height));

        const dst = path.join(DEST_DIR, job.out);
        await sharp(trimmed)
            .resize(newW, TARGET_HEIGHT, { fit: 'fill' })
            .png({ compressionLevel: 9 })
            .toFile(dst);

        console.log(`${job.out}: src ${info.width}x${info.height} -> trim ${trMeta.width}x${trMeta.height} -> out ${newW}x${TARGET_HEIGHT}  bg=${job.bg}`);
    }
    console.log('Done.');
}

run().catch((e) => { console.error(e); process.exit(1); });
