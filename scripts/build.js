// esbuild production build script
const esbuild = require('esbuild');
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
    
    const transformHtml = (content) => {
        return content.replace(/src="dist\//g, 'src="');
    };
    
    const htmlFiles = ['index.html', 'rpg.html', 'shooter.html', 'galaxy.html', 'ocean.html', 'gta.html', 'flight.html', 'fabulus.html', 'mahjong.html'];
    for (const file of htmlFiles) {
        if (fs.existsSync(file)) {
            copyFile(file, DIST_DIR, transformHtml);
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
