import { rpc } from './core.js';
export async function deliverOne(leadId = null) {
  const jobs = await rpc('sklo_claim_notification', { p_lead_id: leadId });
  if (!jobs?.length) return null;
  const job = jobs[0], p = job.payload;
  const message = ['🚘 Нова заявка SKLO.STUDIO', `ID: ${job.lead_id}`, `Ім’я: ${p.name || '—'}`, `Телефон: ${p.phone}`, `Авто: ${[p.carBrand, p.carModel, p.year].filter(Boolean).join(' ') || '—'}`, `VIN: ${p.vin || '—'}`, `Запит: ${p.comment || '—'}`, `Форма: ${p.formType}`, `Джерело: ${p.attribution.utm_source || 'не вказано'}`, `Кампанія: ${p.attribution.utm_campaign || '—'}`].join('\n');
  let sent = false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: message, link_preview_options: { is_disabled: true } }), signal: AbortSignal.timeout(4000) });
    const result = await response.json(); sent = response.ok && result.ok === true;
  } catch { /* Keep a durable retry job; never log personal data or tokens. */ }
  await rpc('sklo_finish_notification', { p_id: job.id, p_lease: job.lease, p_sent: sent });
  return sent;
}
