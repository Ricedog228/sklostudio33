import { reply, secretMatches, ready } from '../lib/core.js';
import { deliverOne } from '../lib/notifications.js';
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return reply(res, 405, { error: 'Method not allowed' });
  if (!secretMatches(req.headers.authorization, process.env.CRON_SECRET)) return reply(res, 401, { error: 'Unauthorized' });
  if (!ready()) return reply(res, 503, { error: 'Not configured' });
  try {
    const deadline = Date.now() + 40000;
    let processed = 0, sent = 0;
    while (processed < 20 && Date.now() < deadline) {
      const result = await deliverOne();
      if (result === null) break;
      processed++; if (result) sent++;
    }
    return reply(res, 200, { processed, sent });
  }
  catch { return reply(res, 503, { error: 'Retry unavailable' }); }
}
