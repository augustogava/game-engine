const esbuild = require('esbuild');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3002;

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    const vars = {};
    if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
            const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
            if (match) vars[match[1]] = match[2];
        });
    }
    return vars;
}
const env = loadEnv();

// ── 2D Games bundle (IIFE, existing) ────────────────────────────────────────
const ctx2D = esbuild.context({
    entryPoints: ['src/main.ts', 'src/shooter-main.ts', 'src/rpg-main.ts', 'src/ocean-main.ts', 'src/gta-main.ts'],
    bundle: true,
    outdir: 'dist',
    sourcemap: true,
    target: 'es2020',
    format: 'iife',
    logLevel: 'info',
});

// ── 3D Flight Game build options ─────────────────────────────────────────────
const flight3dOpts = {
    entryPoints: ['src/flight-main.ts'],
    bundle: true,
    outdir: 'dist',
    sourcemap: true,
    target: 'es2022',
    format: 'esm',
    splitting: false,
    logLevel: 'info',
    external: ['three', 'three/*'],
    define: {
        '__GOOGLE_MAPS_API_KEY__': JSON.stringify(env.GOOGLE_MAPS_API_KEY || ''),
    },
};

let building3D = false;
async function buildFlight() {
    if (building3D) return;
    building3D = true;
    try {
        await esbuild.build(flight3dOpts);
    } catch (e) {
        console.error('[3D build error]', e.message);
    }
    building3D = false;
}

ctx2D.then(async (c2D) => {
    await c2D.watch();
    await buildFlight();

    const srcDir = path.join(__dirname, '..', 'src');
    fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
        if (filename && /\.(ts|js)$/.test(filename)) {
            console.log(`[watch] build started (change: "src/${filename.replace(/\\/g, '/')}")`);
            buildFlight().then(() => console.log('[watch] build finished'));
        }
    });

    const server = http.createServer((req, res) => {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        const fullPath = path.join(__dirname, '..', decodeURIComponent(filePath.split('?')[0]));

        fs.readFile(fullPath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            const ext = path.extname(fullPath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.map': 'application/json',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.glb': 'model/gltf-binary',
                '.glb_file': 'model/gltf-binary',
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
            res.end(data);
        });
    });

    server.listen(PORT, () => {
        console.log(`\n🚀 Dev server running at http://localhost:${PORT}\n`);
    });
});
