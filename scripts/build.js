// esbuild production build script
const esbuild = require('esbuild');

esbuild.build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    outfile: 'dist/main.js',
    sourcemap: true,
    target: 'es2020',
    format: 'iife',
    minify: true,
    logLevel: 'info',
}).then(() => {
    console.log('✅ Build complete → dist/main.js');
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
