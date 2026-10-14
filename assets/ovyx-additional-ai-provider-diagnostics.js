(function () {
  'use strict';
  if (window.__OVYX_ADDITIONAL_AI_DIAGNOSTICS_V1__) return;
  window.__OVYX_ADDITIONAL_AI_DIAGNOSTICS_V1__ = true;
  const PROVIDERS = [
    { id: 'groq', label: 'Groq', key: 'GROQ_API_KEY' },
    { id: 'openrouter', label: 'OpenRouter', key: 'OPENROUTER_API_KEY' },
  ];
  const $ = selector => document.querySelector(selector);
  function currentUser() {
    try { return window.firebase?.auth?.().currentUser || null; } catch (_) { return null; }
  }
  function addStyles() {
    if ($('#ovyx-additional-ai-diagnostics-style')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-additional-ai-diagnostics-style';
    style.textContent = [
      '#ovyx-additional-ai-diagnostics{margin-top:18px;padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.018)}',
      '#ovyx-additional-ai-diagnostics .oad-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}',
      '#ovyx-additional-ai-diagnostics .oad-kicker{font:800 8px/1.4 monospace;letter-spacing:.13em;text-transform:uppercase;color:#e8b64f}',
      '#ovyx-additional-ai-diagnostics .oad-title{margin-top:4px;color:var(--text,#fff);font:700 15px/1.35 Inter,system-ui,sans-serif}',
      '#ovyx-additional-ai-diagnostics .oad-note{margin-top:4px;color:var(--muted,#8b929e);font:400 11px/1.5 Inter,system-ui,sans-serif}',
      '#ovyx-additional-ai-diagnostics .oad-refresh{flex:0 0 auto;min-height:30px;padding:0 10px;border:1px solid var(--border,rgba(255,255,255,.15));border-radius:9px;background:transparent;color:var(--text,#eee);font:700 10px Inter,system-ui,sans-serif;cursor:pointer}',
      '#ovyx-additional-ai-diagnostics .oad-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
      '#ovyx-additional-ai-diagnostics .oad-card{min-width:0;padding:13px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(0,0,0,.12)}',
      '#ovyx-additional-ai-diagnostics .oad-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}',
      '#ovyx-additional-ai-diagnostics .oad-provider{color:var(--text,#fff);font:700 12px Inter,system-ui,sans-serif}',
      '#ovyx-additional-ai-diagnostics .oad-key{margin-top:5px;color:var(--muted,#929aa5);font:500 9px/1.4 monospace;overflow-wrap:anywhere}',
      '#ovyx-additional-ai-diagnostics .oad-status{display:inline-flex;align-items:center;max-width:58%;padding:5px 7px;border:1px solid rgba(255,255,255,.12);border-radius:999px;color:var(--muted,#aeb5c0);font:800 8px/1.2 monospace;text-align:center;overflow-wrap:anywhere}',
      '#ovyx-additional-ai-diagnostics .oad-status[data-status="READY"]{color:#6ee7b7;border-color:rgba(52,211,153,.28)}',
      '#ovyx-additional-ai-diagnostics .oad-status[data-status="NOT_CONFIGURED"]{color:#9ca3af}',
      '#ovyx-additional-ai-diagnostics .oad-status[data-status="AUTH_FAILED"],#ovyx-additional-ai-diagnostics .oad-status[data-status="RATE_LIMITED"],#ovyx-additional-ai-diagnostics .oad-status[data-status="INSUFFICIENT_CREDITS"],#ovyx-additional-ai-diagnostics .oad-status[data-status="UNAVAILABLE"],#ovyx-additional-ai-diagnostics .oad-status[data-status="TIMEOUT"],#ovyx-additional-ai-diagnostics .oad-status[data-status="UPSTREAM_ERROR"]{color:#fda4af;border-color:rgba(251,113,133,.24)}',
      '#ovyx-additional-ai-diagnostics .oad-detail{margin-top:8px;color:var(--muted,#929aa5);font:450 10px/1.5 Inter,system-ui,sans-serif;overflow-wrap:anywhere}',
      '@media(max-width:640px){#ovyx-additional-ai-diagnostics{padding:12px}#ovyx-additional-ai-diagnostics .oad-grid{grid-template-columns:1fr}#ovyx-additional-ai-diagnostics .oad-status{max-width:62%}}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }
  function ensureSection() {
    const admin = document.getElementById('view-admin-brain');
    const grid = document.getElementById('admin-brain-provider-grid');
    if (!admin || !grid) return null;
    let section = document.getElementById('ovyx-additional-ai-diagnostics');
    if (!section) {
      section = document.createElement('section');
      section.id = 'ovyx-additional-ai-diagnostics';
      section.setAttribute('aria-live', 'polite');
      const head = document.createElement('div');
      head.className = 'oad-head';
      const heading = document.createElement('div');
      const kicker = document.createElement('div');
      kicker.className = 'oad-kicker';
      kicker.textContent = 'Extended provider checks';
      const title = document.createElement('div');
      title.className = 'oad-title';
      title.textContent = 'Groq & OpenRouter';
      const note = document.createElement('div');
      note.className = 'oad-note';
      note.textContent = 'Live server-side checks; secret values never appear here.';
      heading.append(kicker, title, note);
      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.className = 'oad-refresh';
      refresh.textContent = 'Check again';
      refresh.addEventListener('click', () => void load());
      head.append(heading, refresh);
      const gridEl = document.createElement('div');
      gridEl.className = 'oad-grid';
      PROVIDERS.forEach(provider => {
        const card = document.createElement('article');
        card.className = 'oad-card';
        card.dataset.provider = provider.id;
        const row = document.createElement('div');
        row.className = 'oad-row';
        const name = document.createElement('div');
        name.className = 'oad-provider';
        name.textContent = provider.label;
        const status = document.createElement('span');
        status.className = 'oad-status';
        status.dataset.status = 'CHECKING';
        status.textContent = 'CHECKING';
        status.id = 'oad-status-' + provider.id;
        row.append(name, status);
        const key = document.createElement('div');
        key.className = 'oad-key';
        key.textContent = 'Secret: ' + provider.key;
        const detail = document.createElement('div');
        detail.className = 'oad-detail';
        detail.id = 'oad-detail-' + provider.id;
        detail.textContent = 'Waiting for an authenticated server check.';
        card.append(row, key, detail);
        gridEl.appendChild(card);
      });
      section.append(head, gridEl);
      grid.insertAdjacentElement('afterend', section);
    }
    addStyles();
    return section;
  }
  async function load() {
    const section = ensureSection();
    if (!section || section.dataset.loading === '1') return;
    section.dataset.loading = '1';
    try {
      const user = currentUser();
      if (!user || typeof user.getIdToken !== 'function') {
        PROVIDERS.forEach(p => update(p.id, { status: 'AUTH_REQUIRED', message: 'Sign in as the owner to run live checks.' }));
        return;
      }
      const token = await user.getIdToken();
      const response = await fetch('/api/ai/status', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('Live diagnostics could not be loaded (HTTP ' + response.status + ').');
      const rows = Array.isArray(data.additionalProviders) ? data.additionalProviders : [];
      PROVIDERS.forEach(p => {
        const result = rows.find(row => String(row.provider || '').toLowerCase() === p.id);
        if (!result) update(p.id, { status: 'UNAVAILABLE', message: 'This provider was not returned by the server.' });
        else update(p.id, {
          status: String(result.status || 'UNAVAILABLE').toUpperCase(),
          message: result.error || (result.httpStatus ? 'Provider replied with HTTP ' + result.httpStatus + '.' : result.status === 'READY' ? 'Provider authentication succeeded.' : result.status === 'NOT_CONFIGURED' ? 'No secret value is available to this deployed runtime.' : 'Provider is not ready.'),
        });
      });
      if (!section.dataset.loaded) {
        section.dataset.loaded = '1';
        section.dataset.checkedAt = String(data.checkedAt || new Date().toISOString());
      }
    } catch (error) {
      PROVIDERS.forEach(p => update(p.id, { status: 'UNAVAILABLE', message: String(error?.message || 'Live check failed.').slice(0, 140) }));
    } finally {
      section.dataset.loading = '0';
    }
  }
  function update(id, data) {
    const status = document.getElementById('oad-status-' + id);
    const detail = document.getElementById('oad-detail-' + id);
    if (status) {
      status.textContent = String(data.status || 'UNAVAILABLE').replace(/_/g, ' ');
      status.dataset.status = String(data.status || 'UNAVAILABLE').toUpperCase();
    }
    if (detail) detail.textContent = String(data.message || 'No diagnostic details available.').slice(0, 180);
  }
  function adminBrainIsVisible() {
    const admin = document.getElementById('view-admin-brain');
    return Boolean(admin && !admin.classList.contains('hidden') && admin.getAttribute('aria-hidden') !== 'true' && admin.offsetParent !== null);
  }
  function boot() {
    const section = ensureSection();
    if (section && adminBrainIsVisible() && !section.dataset.loaded && !section.dataset.loading) void load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', event => {
    if (event.detail?.view === 'admin-brain') setTimeout(boot, 0);
  }, { passive: true });
  window.addEventListener('firebase-auth-state-ready', () => setTimeout(boot, 100), { passive: true });
})();