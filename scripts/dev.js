// esbuild dev server script
const esbuild = require('esbuild');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const ctx = esbuild.context({
    entryPoints: ['src/main.ts'],
    bundle: true,
    outfile: 'dist/main.js',
    sourcemap: true,
    target: 'es2020',
    format: 'iife',
    logLevel: 'info',
});

ctx.then(async (context) => {
    await context.watch();

    const server = http.createServer((req, res) => {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        const fullPath = path.join(__dirname, '..', filePath.split('?')[0]);

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
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
            res.end(data);
        });
    });

    server.listen(PORT, () => {
        console.log(`\n🚀 Dev server running at http://localhost:${PORT}\n`);
    });
});
