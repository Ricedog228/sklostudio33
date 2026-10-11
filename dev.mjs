import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import lead from './.vercel/output/functions/api/lead.func/api/lead.js';
import status from './.vercel/output/functions/api/status.func/api/status.js';
import retry from './.vercel/output/functions/api/retry.func/api/retry.js';
const root = path.resolve(import.meta.dirname, './.vercel/output/static');
const handlers = { '/api/lead': lead, '/api/status': status, '/api/retry': retry };
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4' };
createServer(async (req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (handlers[url.pathname]) {
      let data = ''; for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 12000) return res.status(413).json({ error: 'Request too large' }); }
      req.body = data;
      return await handlers[url.pathname](req, res);
    }
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) return res.status(403).end();
    try {
      if (path.extname(file) === '.mp4') {
        const { size } = await stat(file);
        res.setHeader('Content-Type', 'video/mp4'); res.setHeader('Accept-Ranges', 'bytes');
        const range = req.headers.range;
        let start = 0, end = size - 1;
        if (range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(range);
          if (!match) { res.setHeader('Content-Range', `bytes */${size}`); return res.status(416).end(); }
          start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : end;
          if (start > end || start >= size) { res.setHeader('Content-Range', `bytes */${size}`); return res.status(416).end(); }
          res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        }
        res.setHeader('Content-Length', end - start + 1);
        if (req.method === 'HEAD') return res.end();
        const stream = createReadStream(file, { start, end });
        res.on('close', () => stream.destroy()); stream.on('error', () => res.destroy());
        return stream.pipe(res);
      }
      const content = await readFile(file); res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(req.method === 'HEAD' ? '' : content);
    } catch { res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await readFile(path.join(root, '404.html'))); }
  } catch { if (!res.headersSent) res.status(500).json({ error: 'Server error' }); }
}).listen(3000, '127.0.0.1', () => console.log('Preview: http://localhost:3000'));
