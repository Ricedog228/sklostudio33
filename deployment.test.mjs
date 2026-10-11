import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname);

test('fresh upload builds self-contained Vercel functions and keeps backend files private', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'sklo-deployment-'));
  try {
    for (const file of ['lead.js', 'status.js', 'retry.js', 'core.js', 'notifications.js', 'index.html', 'privacy.html', '404.html', 'robots.txt', 'site.css', 'site.js', 'favicon.svg', 'studio-hero.webp', 'studio-detail.webp', 'studio-mobile.webp', 'security-headers.json', 'build.mjs', 'package.json', 'vercel.json', 'results.json']) await cp(path.join(root, file), path.join(temp, file), { recursive: true });
    // A fresh fixture has no customer media, independent of the live portfolio.
    await writeFile(path.join(temp, 'results.json'), '[]');
    const env = { ...process.env, SITE_INDEXABLE: 'false', LEADS_ENABLED: 'false' };
    execFileSync(process.execPath, ['build.mjs'], { cwd: temp, env });
    const output = path.join(temp, '.vercel/output');
    const config = JSON.parse(await readFile(path.join(output, 'config.json')));
    assert.equal(config.version, 3);
    assert.equal(config.routes.at(-1).status, 404);
    assert.ok(config.routes[0].headers['Content-Security-Policy']);
    for (const name of ['lead', 'status', 'retry']) {
      const directory = path.join(output, 'functions/api', name + '.func');
      const settings = JSON.parse(await readFile(path.join(directory, '.vc-config.json')));
      assert.equal(settings.runtime, 'nodejs22.x');
      assert.equal(settings.launcherType, 'Nodejs');
      assert.equal(settings.shouldAddHelpers, true);
      const module = await import(pathToFileURL(path.join(directory, settings.handler)));
      assert.equal(typeof module.default, 'function');
      const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(body) { this.body = body; } };
      const old = process.env.LEADS_ENABLED; process.env.LEADS_ENABLED = 'false';
      try { await module.default({ method: name === 'lead' ? 'POST' : 'GET', headers: {} }, res); }
      finally { if (old === undefined) delete process.env.LEADS_ENABLED; else process.env.LEADS_ENABLED = old; }
      assert.equal(res.code, name === 'status' ? 200 : name === 'lead' ? 503 : 401);
    }
    for (const file of ['lead.js', 'core.js', 'api/lead.js', 'lib/core.js', '.env.local', 'setup.sql', 'package.json', 'build.mjs']) {
      await assert.rejects(readFile(path.join(output, 'static', file)), { code: 'ENOENT' });
    }
    // Real publication path: empty portfolio, escaped content, selected image, invalid file path.
    assert.match(await readFile(path.join(output, 'static/index.html'), 'utf8'), /results-empty/);
    await writeFile(path.join(temp, 'work-01.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/mkAAAAASUVORK5CYII=', 'base64'));
    const entry = { title: 'Toyota <test>', description: 'Before & after', image: 'work-01.png' };
    await writeFile(path.join(temp, 'results.json'), JSON.stringify([entry]));
    execFileSync(process.execPath, ['build.mjs'], { cwd: temp, env });
    const portfolio = await readFile(path.join(output, 'static/index.html'), 'utf8');
    assert.match(portfolio, /Toyota &lt;test&gt;/); assert.match(portfolio, /Before &amp; after/);
    assert.match(portfolio, /src="\/assets\/work-01.png"/); assert.doesNotMatch(portfolio, /results-empty/);
    assert.deepEqual(await readFile(path.join(output, 'static/assets/work-01.png')), await readFile(path.join(temp, 'work-01.png')));
    // A video is linked, never embedded/preloaded into the landing page.
    await writeFile(path.join(temp, 'work-01.mp4'), 'video fixture');
    await writeFile(path.join(temp, 'results.json'), JSON.stringify([{ ...entry, video: 'work-01.mp4', category: 'process', duration: 62, width: 464, height: 848 }]));
    execFileSync(process.execPath, ['build.mjs'], { cwd: temp, env });
    const videoPage = await readFile(path.join(output, 'static/index.html'), 'utf8');
    assert.match(videoPage, /href="\/assets\/work-01\.mp4"/);
    assert.match(videoPage, /data-category="process"/);
    assert.match(videoPage, /1:02/);
    assert.doesNotMatch(videoPage, /<video|<source|rel="preload"[^>]+mp4/);
    assert.equal(await readFile(path.join(output, 'static/assets/work-01.mp4'), 'utf8'), 'video fixture');
    await writeFile(path.join(temp, 'results.json'), JSON.stringify([{ ...entry, video: '../core.js' }]));
    const unsafeVideo = spawnSync(process.execPath, ['build.mjs'], { cwd: temp, env, encoding: 'utf8' });
    assert.notEqual(unsafeVideo.status, 0); assert.match(unsafeVideo.stderr, /local work-01.mp4/);
    await writeFile(path.join(temp, 'results.json'), JSON.stringify([{ ...entry, video: 'work-missing.mp4' }]));
    const missingVideo = spawnSync(process.execPath, ['build.mjs'], { cwd: temp, env, encoding: 'utf8' });
    assert.notEqual(missingVideo.status, 0); assert.match(missingVideo.stderr, /Missing portfolio video/);
    await writeFile(path.join(temp, 'results.json'), JSON.stringify([{ ...entry, image: '../core.js' }]));
    const unsafe = spawnSync(process.execPath, ['build.mjs'], { cwd: temp, env, encoding: 'utf8' });
    assert.notEqual(unsafe.status, 0); assert.match(unsafe.stderr, /results.json entry 1/);
    // Public SEO output belongs to Production; Preview must stay excluded.
    await writeFile(path.join(temp, 'results.json'), '[]');
    const publicEnv = { ...env, SITE_INDEXABLE: 'true', PUBLIC_SITE_URL: 'https://sklostudio.online', VERCEL_ENV: 'production' };
    execFileSync(process.execPath, ['build.mjs'], { cwd: temp, env: publicEnv });
    const publicPage = await readFile(path.join(output, 'static/index.html'), 'utf8');
    assert.match(publicPage, /<meta name="robots" content="index, follow">/);
    assert.match(publicPage, /<link rel="canonical" href="https:\/\/sklostudio\.online\/">/);
    assert.match(publicPage, /<meta property="og:url" content="https:\/\/sklostudio\.online\/">/);
    assert.equal(await readFile(path.join(output, 'static/robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://sklostudio.online/sitemap.xml\n');
    assert.match(await readFile(path.join(output, 'static/sitemap.xml'), 'utf8'), /<loc>https:\/\/sklostudio\.online\/<\/loc>/);
    assert.match(await readFile(path.join(output, 'static/privacy.html'), 'utf8'), /content="noindex,nofollow"/);
    execFileSync(process.execPath, ['build.mjs'], { cwd: temp, env: { ...publicEnv, VERCEL_ENV: 'preview' } });
    assert.match(await readFile(path.join(output, 'static/index.html'), 'utf8'), /content="noindex, nofollow"/);
    assert.match(await readFile(path.join(output, 'static/robots.txt'), 'utf8'), /Disallow: \//);
    await assert.rejects(readFile(path.join(output, 'static/sitemap.xml')), { code: 'ENOENT' });
    await rm(path.join(temp, 'lead.js'));
    const failed = spawnSync(process.execPath, ['build.mjs'], { cwd: temp, env, encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Missing: lead\.js/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
