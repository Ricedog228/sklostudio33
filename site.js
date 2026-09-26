(() => {
  const menu = document.querySelector('.navlinks');
  const burger = document.querySelector('.burger');
  function closeMenu() { menu.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Відкрити меню'); }
  burger?.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню');
  });
  menu?.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) { closeMenu(); burger.focus(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.nav')) closeMenu(); });
  matchMedia('(min-width:1141px)').addEventListener('change', closeMenu);
  const attribution = {};
  const params = new URLSearchParams(location.search);
  // Kept in memory for this page only. No analytics cookies or contact data in analytics.
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) attribution[key] = (params.get(key) || '').slice(0, 200);
  try { attribution.referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch { attribution.referrer = ''; }
  attribution.page = location.pathname;
  const forms = document.querySelectorAll('[data-lead-form]');
  fetch('/api/status', { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject()).then(status => {
    forms.forEach(form => {
      form.querySelector('button[type=submit]').disabled = !status.enabled;
      form.querySelector('.form-availability').textContent = status.enabled ? '' : 'Тестова версія: прийом заявок ще не підключено.';
    });
  }).catch(() => forms.forEach(form => { form.querySelector('.form-availability').textContent = 'Форма тимчасово недоступна. Спробуйте оновити сторінку пізніше.'; }));
  forms.forEach(form => {
    let requestId, lastPayload;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector('button[type=submit]');
      if (button.disabled) return;
      const msg = form.querySelector('.formmsg');
      const payload = { ...Object.fromEntries(new FormData(form)), formType: form.dataset.leadForm, attribution, consent: form.elements.consent.checked };
      const serialized = JSON.stringify(payload);
      if (serialized !== lastPayload) { requestId = crypto.randomUUID(); lastPayload = serialized; }
      const label = button.textContent;
      button.disabled = true; button.textContent = 'Надсилаємо…';
      msg.style.display = 'none'; msg.classList.remove('error');
      try {
        const res = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId }, body: serialized, signal: AbortSignal.timeout(25000) });
        const data = await res.json();
        if (!res.ok || !data.ok || !data.id) throw new Error(data.error || 'Заявку не підтверджено. Спробуйте ще раз.');
        msg.textContent = `Дякуємо! Заявку збережено. Номер: ${data.id.slice(0, 8)}. Ми зв’яжемося з вами.`;
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'generate_lead', form_type: form.dataset.leadForm });
        form.reset(); lastPayload = null; requestId = null;
      } catch (err) {
        msg.classList.add('error');
        msg.textContent = err.name === 'TimeoutError' || err instanceof TypeError ? 'Не вдалося підтвердити відправлення. Дані залишилися у формі — спробуйте ще раз.' : err.message;
      } finally { button.disabled = false; button.textContent = label; msg.style.display = 'block'; msg.focus(); }
    });
  });
})();
