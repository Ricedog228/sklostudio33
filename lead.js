import { ready, reply, authorizeOrigin, normalize, HttpError, digest, clientHash, rpc } from '../lib/core.js';
import { deliverOne } from '../lib/notifications.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { error: 'Method not allowed' }); }
  try {
    if (!ready()) throw new HttpError(503, 'Прийом заявок ще не підключено.');
    authorizeOrigin(req);
    if (!String(req.headers['content-type']).toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Потрібен формат JSON.');
    if (Number(req.headers['content-length'] || 0) > 12000 || Buffer.byteLength(JSON.stringify(req.body) || '') > 12000) throw new HttpError(413, 'Завеликий запит.');
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Некоректний JSON.'); } }
    const payload = normalize(body), id = req.headers['idempotency-key'];
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(400, 'Невірний ідентифікатор запиту.');
    const result = await rpc('sklo_submit_lead', { p_id: id, p_payload: payload, p_hash: digest(payload), p_client_hash: clientHash(req) });
    if (result.error === 'rate_limit') { res.setHeader('Retry-After', '900'); throw new HttpError(429, 'Забагато запитів. Спробуйте через 15 хвилин.'); }
    if (result.error === 'conflict') throw new HttpError(409, 'Дані запиту змінилися. Оновіть сторінку.');
    if (!result.id) throw new Error('invalid_database_response');
    try { await deliverOne(result.id); } catch { console.warn('notification_pending'); }
    return reply(res, result.duplicate ? 200 : 201, { ok: true, id: result.id });
  } catch (err) {
    if (!(err instanceof HttpError)) console.error('lead_storage_unavailable');
    return reply(res, err.status || 503, { ok: false, error: err instanceof HttpError ? err.message : 'Не вдалося підтвердити збереження заявки. Спробуйте ще раз.' });
  }
}
