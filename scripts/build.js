// esbuild production build script
const esbuild = require('esbuild');

esbuild.build({
    entryPoints: ['src/main.ts', 'src/shooter-main.ts', 'src/rpg-main.ts'],
    bundle: true,
    outdir: 'dist',
    sourcemap: true,
    target: 'es2020',
    format: 'iife',
    minify: true,
    logLevel: 'info',
}).then(() => {
    console.log('✅ Build complete → dist/');
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
