const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.map': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    
    if (urlPath === '/') {
        urlPath = '/index.html';
    }

    const filePath = path.join(DIST_DIR, urlPath);
    const ext = path.extname(filePath).toLowerCase();

    if (!filePath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - Not Found</h1>');
            } else {
                res.writeHead(500);
                res.end('Internal Server Error');
            }
            return;
        }

        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        const headers = {
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
        };

        if (ext === '.html') {
            headers['Cache-Control'] = 'no-cache';
        } else if (['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2'].includes(ext)) {
            headers['Cache-Control'] = 'public, max-age=31536000, immutable';
        }

        res.writeHead(200, headers);
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Production server running on port ${PORT}`);
});
