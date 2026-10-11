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
  const gallery = document.querySelector('#results');
  const cards = [...(gallery?.querySelectorAll('[data-result-card]') || [])];
  if (cards.length) {
    const filters = [...gallery.querySelectorAll('[data-gallery-filter]')];
    const more = gallery.querySelector('[data-gallery-more]');
    const count = gallery.querySelector('[data-gallery-count]');
    let category = 'all', limit = 6;
    const matching = () => cards.filter(card => category === 'all' || card.dataset.category === category);
    function renderGallery() {
      const matches = matching();
      const visible = new Set(matches.slice(0, limit));
      cards.forEach(card => { card.hidden = !visible.has(card); });
      more.hidden = matches.length <= limit;
      count.textContent = `${Math.min(limit, matches.length)} / ${matches.length}`;
      filters.forEach(button => {
        const active = button.dataset.galleryFilter === category;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
    gallery.querySelector('[data-gallery-controls]').hidden = false;
    filters.forEach(button => button.addEventListener('click', () => {
      category = button.dataset.galleryFilter; limit = 6; renderGallery();
    }));
    more.addEventListener('click', () => {
      const next = matching()[limit];
      limit += 6; renderGallery();
      next?.querySelector('[data-gallery-open]')?.focus({ preventScroll: true });
    });
    renderGallery();
    // Native dialog keeps focus inside the viewer. Older browsers use the media link.
    if (typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function') {
      const dialog = document.createElement('dialog');
      dialog.className = 'gallery-dialog';
      dialog.setAttribute('aria-labelledby', 'gallery-viewer-title');
      const header = document.createElement('div'); header.className = 'gallery-dialog-header';
      const heading = document.createElement('h3'); heading.id = 'gallery-viewer-title';
      const close = document.createElement('button'); close.type = 'button'; close.className = 'gallery-close';
      close.setAttribute('aria-label', 'Закрити перегляд'); close.textContent = '×';
      header.append(heading, close);
      const stage = document.createElement('div'); stage.className = 'gallery-stage';
      const status = document.createElement('p'); status.className = 'gallery-status'; status.setAttribute('role', 'status');
      const fallback = document.createElement('a'); fallback.className = 'gallery-original'; fallback.textContent = 'Відкрити окремо';
      fallback.target = '_blank'; fallback.rel = 'noopener';
      dialog.append(header, stage, status, fallback); document.body.append(dialog);
      let activeMedia, opener;
      function releaseMedia() {
        if (activeMedia instanceof HTMLVideoElement) {
          activeMedia.pause(); activeMedia.removeAttribute('src'); activeMedia.load();
        }
        activeMedia = null; stage.replaceChildren();
      }
      close.addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', event => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
      });
      dialog.addEventListener('close', () => {
        releaseMedia(); document.body.classList.remove('gallery-open');
        fallback.removeAttribute('href'); opener?.focus({ preventScroll: true });
      });
      gallery.addEventListener('click', event => {
        const link = event.target.closest('[data-gallery-open]');
        if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
        event.preventDefault(); releaseMedia(); opener = link;
        heading.textContent = link.dataset.title;
        fallback.href = link.href; status.textContent = '';
        if (link.dataset.kind === 'video') {
          const video = document.createElement('video');
          video.controls = true; video.playsInline = true; video.preload = 'none'; video.poster = link.dataset.poster;
          video.setAttribute('aria-label', link.dataset.title);
          status.textContent = 'Завантажуємо відео…';
          video.addEventListener('playing', () => { if (activeMedia === video) status.textContent = ''; });
          video.addEventListener('waiting', () => { if (activeMedia === video) status.textContent = 'Завантажуємо відео…'; });
          video.addEventListener('error', () => { if (activeMedia === video) status.textContent = 'Не вдалося завантажити відео. Спробуйте відкрити його окремо.'; });
          activeMedia = video; stage.append(video);
          dialog.showModal(); document.body.classList.add('gallery-open'); close.focus();
          video.src = link.href;
          video.play().catch(() => { if (activeMedia === video && !video.error) status.textContent = 'Натисніть ▶ у плеєрі, щоб почати перегляд.'; });
        } else {
          const photo = document.createElement('img'); photo.alt = link.dataset.title; photo.src = link.href;
          activeMedia = photo; stage.append(photo);
          dialog.showModal(); document.body.classList.add('gallery-open'); close.focus();
        }
      });
    }
  }
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
