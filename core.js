import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const GLASS_TYPES = Object.freeze({ windshield: 'Лобове', side: 'Бічне', rear: 'Заднє', roof: 'Панорамний дах / люк', other: 'Інше', unsure: 'Потрібна консультація' });
export function ready() {
  return process.env.LEADS_ENABLED === 'true' && ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'RATE_LIMIT_SALT', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'CRON_SECRET', 'ALLOWED_ORIGINS'].every(k => !!process.env[k]?.trim());
}
export function reply(res, status, body) { res.setHeader('Cache-Control', 'no-store'); res.status(status).json(body); }
export function authorizeOrigin(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(req.headers.origin)) throw new HttpError(403, 'Неприпустиме джерело запиту.');
}
export function secretMatches(value, secret) {
  if (!secret || typeof value !== 'string') return false;
  const a = Buffer.from(value), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function normalize(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Некоректні дані.');
  const text = (key, limit = 100) => {
    if (body[key] == null) return '';
    if (typeof body[key] !== 'string' || body[key].length > limit) throw new HttpError(400, 'Перевірте довжину та формат полів.');
    return body[key].trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
  };
  if (text('website')) throw new HttpError(400, 'Заявку не прийнято.');
  if (body.consent !== true) throw new HttpError(400, 'Потрібна згода на обробку даних.');
  const formType = text('formType');
  if (!['glass_selection', 'callback'].includes(formType)) throw new HttpError(400, 'Невідома форма.');
  let phone = text('phone').replace(/[\s()\-]/g, '');
  if (/^0\d{9}$/.test(phone)) phone = '+38' + phone;
  if (/^380\d{9}$/.test(phone)) phone = '+' + phone;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new HttpError(400, 'Вкажіть телефон у міжнародному форматі, наприклад +380…');
  const lead = { formType, phone, name: text('name'), carBrand: text('carBrand'), carModel: text('carModel'), year: text('year', 4), vin: text('vin', 17).toUpperCase(), comment: text('comment', 1000) };
  if (formType === 'glass_selection' && (!lead.carBrand || !lead.carModel)) throw new HttpError(400, 'Вкажіть марку та модель авто.');
  if (!lead.name) throw new HttpError(400, 'Вкажіть ім’я.');
  if (formType === 'glass_selection') {
    lead.glassType = text('glassType');
    if (!Object.hasOwn(GLASS_TYPES, lead.glassType)) throw new HttpError(400, 'Оберіть тип скла.');
  }
  if (lead.year && (!/^\d{4}$/.test(lead.year) || +lead.year < 1900 || +lead.year > new Date().getFullYear() + 2)) throw new HttpError(400, 'Перевірте рік випуску.');
  if (lead.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(lead.vin)) throw new HttpError(400, 'VIN повинен містити 17 символів без I, O, Q.');
  lead.attribution = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'page', 'referrer']) {
    const value = body.attribution?.[key];
    lead.attribution[key] = typeof value === 'string' ? value.slice(0, 200).replace(/[\u0000-\u001f]/g, '') : '';
  }
  lead.consentVersion = '2026-09-26';
  return lead;
}
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function clientHash(req) {
  const ip = process.env.VERCEL ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : req.socket?.remoteAddress;
  return createHmac('sha256', process.env.RATE_LIMIT_SALT).update(ip || 'unknown').digest('hex');
}
export async function rpc(name, body) {
  const key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // New sb_secret keys are not JWTs. Legacy service_role JWTs remain supported.
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('database_unavailable');
  return response.json();
}
