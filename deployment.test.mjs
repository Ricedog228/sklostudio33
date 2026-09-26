import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname);

test('fresh upload builds self-contained Vercel functions and keeps backend files private', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'sklo-deployment-'));
  try {
    for (const file of ['lead.js', 'status.js', 'retry.js', 'core.js', 'notifications.js', 'index.html', 'privacy.html', '404.html', 'robots.txt', 'site.css', 'site.js', 'favicon.svg', 'security-headers.json', 'build.mjs', 'package.json', 'vercel.json']) await cp(path.join(root, file), path.join(temp, file), { recursive: true });
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
    await rm(path.join(temp, 'lead.js'));
    const failed = spawnSync(process.execPath, ['build.mjs'], { cwd: temp, env, encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Missing: lead\.js/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
