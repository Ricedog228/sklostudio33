import { cp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const functions = { lead: 30, status: 10, retry: 60 };
const required = ['package.json', 'vercel.json', 'scripts/security-headers.json',
  'public/index.html', 'public/privacy.html', 'public/404.html', 'public/robots.txt',
  'public/assets/site.css', 'public/assets/site.js', 'public/assets/favicon.svg',
  'lib/core.js', 'lib/notifications.js', ...Object.keys(functions).map(name => `api/${name}.js`)];
const missing = [];
for (const file of required) {
  try { if (!(await stat(path.join(root, file))).isFile()) missing.push(file); }
  catch { missing.push(file); }
}
if (missing.length) throw new Error(`Incomplete project upload. Missing: ${missing.join(', ')}. Upload all extracted files and folders next to package.json; do not upload only HTML or the ZIP.`);
const output = path.join(root, '.vercel/output');
const dist = path.join(output, 'static');
await rm(output, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
const indexable = process.env.SITE_INDEXABLE === 'true' && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production');
if (indexable) {
  const origin = new URL(process.env.PUBLIC_SITE_URL).origin;
  if (!origin.startsWith('https://')) throw new Error('PUBLIC_SITE_URL must use HTTPS');
  let html = await readFile(path.join(dist, 'index.html'), 'utf8');
  if (/уточнюється перед запуском/.test(html)) throw new Error('Fill real contact details before enabling indexing');
  const privacy = await readFile(path.join(dist, 'privacy.html'), 'utf8');
  if (/DRAFT_POLICY/.test(privacy)) throw new Error('Finalize privacy.html before enabling indexing');
  html = html.replace('noindex, nofollow', 'index, follow').replace('</head>', `<link rel="canonical" href="${origin}/">\n<meta property="og:url" content="${origin}/">\n</head>`);
  await writeFile(path.join(dist, 'index.html'), html);
  await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
  await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>\n`);
}
for (const [name, maxDuration] of Object.entries(functions)) {
  const directory = path.join(output, 'functions', 'api', `${name}.func`);
  await mkdir(path.join(directory, 'api'), { recursive: true });
  await cp(path.join(root, 'api', `${name}.js`), path.join(directory, 'api', `${name}.js`));
  await cp(path.join(root, 'lib'), path.join(directory, 'lib'), { recursive: true });
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await writeFile(path.join(directory, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs22.x', handler: `api/${name}.js`, launcherType: 'Nodejs',
    shouldAddHelpers: true, maxDuration
  }, null, 2));
}
const headers = JSON.parse(await readFile(path.join(root, 'scripts/security-headers.json'), 'utf8'));
await writeFile(path.join(output, 'config.json'), JSON.stringify({ version: 3, routes: [
  { src: '/(.*)', headers, continue: true },
  { src: '^/$', dest: '/index.html' },
  { handle: 'filesystem' },
  { src: '/(.*)', dest: '/404.html', status: 404 }
] }, null, 2));
console.log(`Build Output API v3 ready — /api/lead, /api/status, /api/retry; indexing ${indexable ? 'enabled' : 'disabled'}`);
