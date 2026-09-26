import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import lead from './.vercel/output/functions/api/lead.func/api/lead.js';
import retry from './.vercel/output/functions/api/retry.func/api/retry.js';
import status from './.vercel/output/functions/api/status.func/api/status.js';

const payload = { formType: 'glass_selection', phone: '067 123 45 67', carBrand: 'Toyota', carModel: 'Camry', year: '2020', consent: true, attribution: { utm_source: 'qa' } };
function configure() { Object.assign(process.env, { LEADS_ENABLED: 'true', SUPABASE_URL: 'https://database.test', SUPABASE_SECRET_KEY: 'sb_secret_fake', RATE_LIMIT_SALT: 'test-salt', TELEGRAM_BOT_TOKEN: 'fake', TELEGRAM_CHAT_ID: 'test-chat', CRON_SECRET: 'fake-secret', ALLOWED_ORIGINS: 'https://site.test' }); }
function request(body = payload) { return { method: 'POST', headers: { origin: 'https://site.test', 'content-type': 'application/json', 'idempotency-key': randomUUID() }, body, socket: { remoteAddress: '127.0.0.1' } }; }
function response() { return { headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } }; }

test('disabled forms do not report a successful submission', async () => {
  configure(); process.env.LEADS_ENABLED = 'false';
  const s = response(); status({ method:'GET' }, s); assert.equal(s.body.enabled, false);
  const r = response(); await lead(request(), r); assert.equal(r.code, 503); assert.equal(r.body.ok, false);
});
test('rejects missing consent, bad phone, VIN and required car fields before storage', async () => {
  configure();
  for (const change of [{consent:false},{phone:'invalid'},{vin:'short'},{carBrand:''},{year:'1800'}]) {
    const res = response(); await lead(request({...payload, ...change}), res); assert.equal(res.code,400);
  }
});
test('rejects forged origin, honeypot and oversized body', async () => {
  configure(); let req = request(); req.headers.origin = 'https://other.test'; let res = response(); await lead(req,res); assert.equal(res.code,403);
  res = response(); await lead(request({...payload,website:'spam'}),res); assert.equal(res.code,400);
  res = response(); await lead(request({...payload,comment:'x'.repeat(13000)}),res); assert.equal(res.code,413);
});
test('database failure never shows accepted and never sends a Telegram notification', async t => {
  configure(); let calls = 0;
  t.mock.method(globalThis,'fetch',async () => { calls++; return new Response('{}',{status:503}); });
  const res = response(); await lead(request(),res); assert.equal(res.code,503); assert.equal(res.body.ok,false); assert.equal(calls,1);
});
test('save happens before Telegram; failed delivery remains queued and the saved lead is accepted', async t => {
  configure(); const req = request(), calls = [];
  t.mock.method(globalThis,'fetch',async (url, options) => {
    calls.push(String(url)); const b = JSON.parse(options.body);
    if (url.endsWith('sklo_submit_lead')) { assert.equal(b.p_payload.phone,'+380671234567'); assert.ok(!JSON.stringify(b).includes('127.0.0.1')); return Response.json({id:req.headers['idempotency-key']}); }
    if (url.endsWith('sklo_claim_notification')) return Response.json([{id:'job',lead_id:req.headers['idempotency-key'],lease:'lease',payload:{...payload,attribution:{}}}]);
    if (url.includes('api.telegram.org')) return Response.json({ok:false},{status:500});
    if (url.endsWith('sklo_finish_notification')) { assert.equal(b.p_sent,false); return Response.json(null); }
    throw new Error('Unexpected call');
  });
  const res=response(); await lead(req,res); assert.equal(res.code,201); assert.equal(res.body.ok,true);
  assert.ok(calls[0].endsWith('sklo_submit_lead')); assert.ok(calls[2].includes('api.telegram.org'));
});
test('duplicate accepted id reuses saved lead and does not send again after job is sent', async t => {
  configure(); const req=request(); let calls=0;
  t.mock.method(globalThis,'fetch',async url => { calls++; if(url.endsWith('sklo_submit_lead')) return Response.json({id:req.headers['idempotency-key'],duplicate:true}); return Response.json([]); });
  const res=response(); await lead(req,res); assert.equal(res.code,200); assert.equal(calls,2);
});
test('rate limited request returns 429 without notification', async t => {
  configure(); let calls=0; t.mock.method(globalThis,'fetch',async () => {calls++;return Response.json({error:'rate_limit'});});
  const res=response();await lead(request(),res);assert.equal(res.code,429);assert.equal(calls,1);assert.equal(res.headers['Retry-After'],'900');
});
test('conflicting idempotency key returns 409', async t => {
  configure();t.mock.method(globalThis,'fetch',async () => Response.json({error:'conflict'}));
  const res=response();await lead(request(),res);assert.equal(res.code,409);
});
test('successful Telegram message is marked sent', async t => {
  configure(); const req=request(); let finished=false;
  t.mock.method(globalThis,'fetch',async (url,options) => {
    if(url.endsWith('sklo_submit_lead')) return Response.json({id:req.headers['idempotency-key']});
    if(url.endsWith('sklo_claim_notification')) return Response.json([{id:'job',lead_id:'lead',lease:'lease',payload:{...payload,attribution:{}}}]);
    if(url.includes('api.telegram.org')) return Response.json({ok:true});
    if(url.endsWith('sklo_finish_notification')) {finished=JSON.parse(options.body).p_sent;return Response.json(null);}
  });
  const res=response();await lead(req,res);assert.equal(res.code,201);assert.equal(finished,true);
});
test('retry endpoint is protected even when no secret is configured', async () => {
  configure();let res=response();await retry({method:'GET',headers:{}},res);assert.equal(res.code,401);
  delete process.env.CRON_SECRET;res=response();await retry({method:'GET',headers:{authorization:'Bearer undefined'}},res);assert.equal(res.code,401);
});
