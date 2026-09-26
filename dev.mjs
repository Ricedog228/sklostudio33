import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import lead from './.vercel/output/functions/api/lead.func/api/lead.js';
import status from './.vercel/output/functions/api/status.func/api/status.js';
import retry from './.vercel/output/functions/api/retry.func/api/retry.js';
const root = path.resolve(import.meta.dirname, './.vercel/output/static');
const handlers = { '/api/lead': lead, '/api/status': status, '/api/retry': retry };
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
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
      const content = await readFile(file); res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(req.method === 'HEAD' ? '' : content);
    } catch { res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await readFile(path.join(root, '404.html'))); }
  } catch { if (!res.headersSent) res.status(500).json({ error: 'Server error' }); }
}).listen(3000, '127.0.0.1', () => console.log('Preview: http://localhost:3000'));
