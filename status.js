import { ready, reply } from '../lib/core.js';
export default function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return reply(res, 405, { error: 'Method not allowed' }); }
  return reply(res, 200, { enabled: ready() });
}
