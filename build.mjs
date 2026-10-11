import { cp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname);
const functions = { lead: 30, status: 10, retry: 60 };
const required = ['package.json', 'vercel.json', 'security-headers.json',
  'index.html', 'privacy.html', '404.html', 'robots.txt', 'results.json',
  'site.css', 'site.js', 'favicon.svg', 'studio-hero.webp', 'studio-detail.webp', 'studio-mobile.webp',
  'core.js', 'notifications.js', ...Object.keys(functions).map(name => `${name}.js`)];
const missing = [];
for (const file of required) {
  try { if (!(await stat(path.join(root, file))).isFile()) missing.push(file); }
  catch { missing.push(file); }
}
if (missing.length) throw new Error(`Incomplete project upload. Missing: ${missing.join(', ')}. Upload all extracted files next to package.json; do not upload only HTML or the ZIP.`);
const output = path.join(root, '.vercel/output');
const dist = path.join(output, 'static');
await rm(output, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const staticFiles = {
  'index.html': 'index.html', 'privacy.html': 'privacy.html', '404.html': '404.html',
  'robots.txt': 'robots.txt', 'site.css': 'assets/site.css',
  'site.js': 'assets/site.js', 'favicon.svg': 'assets/favicon.svg',
  'studio-hero.webp': 'assets/studio-hero.webp', 'studio-detail.webp': 'assets/studio-detail.webp',
  'studio-mobile.webp': 'assets/studio-mobile.webp'
};
// Publish only this explicit list. Never copy backend code or secrets as static files.
for (const [source, target] of Object.entries(staticFiles)) {
  await mkdir(path.dirname(path.join(dist, target)), { recursive: true });
  await cp(path.join(root, source), path.join(dist, target));
}
// Only explicitly referenced local photos and videos are published.
const results = JSON.parse(await readFile(path.join(root, 'results.json'), 'utf8'));
if (!Array.isArray(results)) throw new Error('results.json must contain an array of work entries');
const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const cards = [];
const categories = { process: 'Процес роботи', result: 'Результат' };
for (const [i, item] of results.entries()) {
  if (!item || typeof item.title !== 'string' || !item.title.trim() || typeof item.description !== 'string' || typeof item.image !== 'string' || !/^work-[a-z0-9-]+\.(?:jpe?g|png|webp|avif)$/.test(item.image)) {
    throw new Error(`results.json entry ${i + 1}: specify title, description and an image named work-01.jpg (or png, webp, avif)`);
  }
  if (!await stat(path.join(root, item.image)).then(file => file.isFile()).catch(() => false)) throw new Error(`Missing portfolio photo: ${item.image}`);
  const category = item.category ?? 'result';
  if (!Object.hasOwn(categories, category)) throw new Error(`results.json entry ${i + 1}: category must be process or result`);
  if (item.video !== undefined && (typeof item.video !== 'string' || !/^work-[a-z0-9-]+\.mp4$/.test(item.video))) throw new Error(`results.json entry ${i + 1}: video must be a local work-01.mp4 file`);
  for (const field of ['width', 'height', 'duration']) {
    if (item[field] !== undefined && (!Number.isInteger(item[field]) || item[field] < 1 || item[field] > 10000)) throw new Error(`results.json entry ${i + 1}: invalid ${field}`);
  }
  await cp(path.join(root, item.image), path.join(dist, 'assets', item.image));
  if (item.video) {
    if (!await stat(path.join(root, item.video)).then(file => file.isFile()).catch(() => false)) throw new Error(`Missing portfolio video: ${item.video}`);
    await cp(path.join(root, item.video), path.join(dist, 'assets', item.video));
  }
  const dimensions = item.width && item.height ? ` width="${item.width}" height="${item.height}"` : '';
  const time = item.video && item.duration ? `<span class="result-duration">${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}</span>` : '';
  const play = item.video ? '<span class="result-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z" fill="currentColor"/></svg><span>Дивитися відео</span></span>' : '<span class="result-play"><span>Переглянути фото</span></span>';
  const media = `/assets/${item.video || item.image}`;
  // No video element/source exists until the visitor opens one item.
  cards.push(`<figure class="glass result-card" data-result-card data-category="${category}"><a class="result-media" href="${media}" data-gallery-open data-kind="${item.video ? 'video' : 'photo'}" data-poster="/assets/${item.image}" data-title="${escapeHtml(item.title)}" aria-label="${item.video ? 'Дивитися відео' : 'Переглянути фото'}: ${escapeHtml(item.title)}"><img src="/assets/${item.image}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async"${dimensions}><span class="result-index">${String(i + 1).padStart(2, '0')}</span>${play}${time}</a><figcaption><span class="result-category">${categories[category]}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></figcaption></figure>`);
}
let page = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!page.includes('<!-- RESULTS_START -->') || !page.includes('<!-- RESULTS_END -->')) throw new Error('Missing portfolio markers in index.html');
if (cards.length) {
  page = page.replace(/<!-- RESULTS_START -->[\s\S]*?<!-- RESULTS_END -->/, () => `<div class="gallery-controls" data-gallery-controls hidden><div class="gallery-filters" role="group" aria-label="Категорії робіт"><button type="button" class="gallery-filter is-active" data-gallery-filter="all" aria-pressed="true">Усі роботи</button><button type="button" class="gallery-filter" data-gallery-filter="process" aria-pressed="false">Процес</button><button type="button" class="gallery-filter" data-gallery-filter="result" aria-pressed="false">Результат</button></div><span class="gallery-count" data-gallery-count role="status" aria-live="polite"></span></div><div class="results-grid" id="work-gallery">${cards.join('\n')}</div><div class="gallery-footer"><button type="button" class="btn btn-ghost" data-gallery-more aria-controls="work-gallery" hidden>Показати ще</button><a class="btn btn-primary" href="#pidbir">Обговорити ваше авто</a></div>`);
  await writeFile(path.join(dist, 'index.html'), page);
}
const indexable = process.env.SITE_INDEXABLE === 'true' && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === 'production');
if (indexable) {
  const origin = new URL(process.env.PUBLIC_SITE_URL).origin;
  if (!origin.startsWith('https://')) throw new Error('PUBLIC_SITE_URL must use HTTPS');
  let html = await readFile(path.join(dist, 'index.html'), 'utf8');
  if (/уточнюється перед запуском/.test(html)) throw new Error('Fill real contact details before enabling indexing');
  // Privacy copy is managed separately from production search indexing.
  html = html.replace('noindex, nofollow', 'index, follow').replace('</head>', `<link rel="canonical" href="${origin}/">\n<meta property="og:url" content="${origin}/">\n</head>`);
  await writeFile(path.join(dist, 'index.html'), html);
  await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
  await writeFile(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>\n`);
}
for (const [name, maxDuration] of Object.entries(functions)) {
  const directory = path.join(output, 'functions', 'api', `${name}.func`);
  await mkdir(path.join(directory, 'api'), { recursive: true });
  await cp(path.join(root, `${name}.js`), path.join(directory, 'api', `${name}.js`));
  await mkdir(path.join(directory, 'lib'), { recursive: true });
  for (const module of ['core.js', 'notifications.js']) {
    await cp(path.join(root, module), path.join(directory, 'lib', module));
  }
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await writeFile(path.join(directory, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs22.x', handler: `api/${name}.js`, launcherType: 'Nodejs',
    shouldAddHelpers: true, maxDuration
  }, null, 2));
}
const headers = JSON.parse(await readFile(path.join(root, 'security-headers.json'), 'utf8'));
await writeFile(path.join(output, 'config.json'), JSON.stringify({ version: 3, routes: [
  { src: '/(.*)', headers, continue: true },
  { src: '^/$', dest: '/index.html' },
  { handle: 'filesystem' },
  { src: '/(.*)', dest: '/404.html', status: 404 }
] }, null, 2));
console.log(`Build Output API v3 ready — /api/lead, /api/status, /api/retry; indexing ${indexable ? 'enabled' : 'disabled'}`);
