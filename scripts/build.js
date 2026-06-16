// esbuild production build script
const esbuild = require('esbuild');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DIST_DIR = 'dist';

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

function copyFile(src, destDir, transform = null) {
    const fileName = path.basename(src);
    const dest = path.join(destDir, fileName);
    
    if (transform) {
        let content = fs.readFileSync(src, 'utf8');
        content = transform(content);
        fs.writeFileSync(dest, content, 'utf8');
    } else {
        fs.copyFileSync(src, dest);
    }
    console.log(`  Copied: ${src} → ${dest}`);
}

function copyDirRecursive(srcDir, destDir) {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
            console.log(`  Copied: ${srcPath} → ${destPath}`);
        }
    }
}

function fileContentHash(filePath) {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
}

function buildAssetVersions() {
    const versions = {};
    const bundles = ['flight-main.js', 'fabulus-main.js', 'mahjong-main.js'];
    for (const name of bundles) {
        const bundlePath = path.join(DIST_DIR, name);
        if (fs.existsSync(bundlePath)) {
            versions[name] = fileContentHash(bundlePath);
        }
    }
    return versions;
}

function transformHtml(content, versions) {
    let result = content.replace(/src="dist\//g, 'src="');
    for (const [file, hash] of Object.entries(versions)) {
        result = result.replace(
            new RegExp(`(${file.replace(/\./g, '\\.')})\\?v=dev`, 'g'),
            `$1?v=${hash}`,
        );
    }
    return result;
}

async function build() {
    console.log('Building JavaScript bundles...');
    
    await esbuild.build({
        entryPoints: ['src/main.ts', 'src/shooter-main.ts', 'src/rpg-main.ts', 'src/ocean-main.ts', 'src/gta-main.ts'],
        bundle: true,
        outdir: DIST_DIR,
        sourcemap: true,
        target: 'es2020',
        format: 'iife',
        minify: true,
        logLevel: 'info',
    });

    console.log('\nBuilding flight 3D bundle...');
    await esbuild.build({
        entryPoints: ['src/flight-main.ts', 'src/fabulus-main.ts', 'src/mahjong-main.ts'],
        bundle: true,
        outdir: DIST_DIR,
        sourcemap: true,
        target: 'es2022',
        format: 'esm',
        splitting: false,
        minify: true,
        logLevel: 'info',
        external: ['three', 'three/*'],
        define: {
            '__GOOGLE_MAPS_API_KEY__': JSON.stringify(process.env.GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_API_KEY || ''),
        },
    });

    console.log('\nCopying static files...');

    const assetVersions = buildAssetVersions();
    for (const [file, hash] of Object.entries(assetVersions)) {
        console.log(`  Asset version: ${file} → ?v=${hash}`);
    }

    const htmlFiles = ['index.html', 'rpg.html', 'shooter.html', 'galaxy.html', 'ocean.html', 'gta.html', 'flight.html', 'fabulus.html', 'mahjong.html'];
    for (const file of htmlFiles) {
        if (fs.existsSync(file)) {
            copyFile(file, DIST_DIR, (content) => transformHtml(content, assetVersions));
        }
    }

    const assetsDir = 'src/game/assets';
    if (fs.existsSync(assetsDir)) {
        const destAssetsDir = path.join(DIST_DIR, 'src/game/assets');
        copyDirRecursive(assetsDir, destAssetsDir);
    }

    const shadersDir = 'src/game/shaders';
    if (fs.existsSync(shadersDir)) {
        const destShadersDir = path.join(DIST_DIR, 'src/game/shaders');
        copyDirRecursive(shadersDir, destShadersDir);
    }

    const modelsDir = 'models';
    if (fs.existsSync(modelsDir)) {
        const destModelsDir = path.join(DIST_DIR, 'models');
        copyDirRecursive(modelsDir, destModelsDir);
    }

    console.log('\n✅ Build complete → dist/');
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
