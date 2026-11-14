(function () {
  'use strict';
  if (window.__OVYX_CLOUDFLARE_AI_DIAGNOSTICS_V2__) return;
  window.__OVYX_CLOUDFLARE_AI_DIAGNOSTICS_V2__ = true;

  const $ = selector => document.querySelector(selector);
  const currentUser = () => {
    try { return window.firebase?.auth?.().currentUser || null; } catch (_) { return null; }
  };

  function addStyles() {
    if ($('#ovyx-cloudflare-ai-diagnostics-style')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-cloudflare-ai-diagnostics-style';
    style.textContent = [
      '#ovyx-cloudflare-ai-diagnostics{margin-top:18px;padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.018)}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-kicker{font:800 8px/1.4 monospace;letter-spacing:.13em;text-transform:uppercase;color:#e8b64f}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-title{margin-top:4px;color:var(--text,#fff);font:700 15px/1.35 Inter,system-ui,sans-serif}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-note{margin-top:4px;color:var(--muted,#8b929e);font:400 11px/1.5 Inter,system-ui,sans-serif}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-refresh{flex:0 0 auto;min-height:30px;padding:0 10px;border:1px solid var(--border,rgba(255,255,255,.15));border-radius:9px;background:transparent;color:var(--text,#eee);font:700 10px Inter,system-ui,sans-serif;cursor:pointer}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-card{padding:14px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(0,0,0,.12)}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-row{display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-provider{color:var(--text,#fff);font:700 12px Inter,system-ui,sans-serif}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-status{display:inline-flex;align-items:center;padding:5px 8px;border:1px solid rgba(255,255,255,.12);border-radius:999px;color:var(--muted,#aeb5c0);font:800 8px/1.2 monospace;text-align:center}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-status[data-status="READY"]{color:#6ee7b7;border-color:rgba(52,211,153,.28)}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-status[data-status="NOT_CONFIGURED"],#ovyx-cloudflare-ai-diagnostics .ocad-status[data-status="DEGRADED"]{color:#fda4af;border-color:rgba(251,113,133,.24)}',
      '#ovyx-cloudflare-ai-diagnostics .ocad-detail{margin-top:8px;color:var(--muted,#929aa5);font:450 10px/1.5 Inter,system-ui,sans-serif;overflow-wrap:anywhere}',
      '@media(max-width:640px){#ovyx-cloudflare-ai-diagnostics{padding:12px}}',
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureSection() {
    const admin = document.getElementById('view-admin-brain');
    const grid = document.getElementById('admin-brain-provider-grid');
    if (!admin || !grid) return null;
    let section = document.getElementById('ovyx-cloudflare-ai-diagnostics');
    if (!section) {
      section = document.createElement('section');
      section.id = 'ovyx-cloudflare-ai-diagnostics';
      section.setAttribute('aria-live', 'polite');
      const head = document.createElement('div');
      head.className = 'ocad-head';
      const heading = document.createElement('div');
      const kicker = document.createElement('div');
      kicker.className = 'ocad-kicker';
      kicker.textContent = 'OVYX model engine';
      const title = document.createElement('div');
      title.className = 'ocad-title';
      title.textContent = 'Cloudflare Workers AI';
      const note = document.createElement('div');
      note.className = 'ocad-note';
      note.textContent = 'Exclusive model provider for the assistant, website generation, App Studio and OVYX Agent. External AI providers are disabled.';
      heading.append(kicker, title, note);
      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.className = 'ocad-refresh';
      refresh.textContent = 'Check again';
      refresh.addEventListener('click', () => void load());
      head.append(heading, refresh);
      const card = document.createElement('article');
      card.className = 'ocad-card';
      const row = document.createElement('div');
      row.className = 'ocad-row';
      const name = document.createElement('div');
      name.className = 'ocad-provider';
      name.textContent = 'Cloudflare Pages · Workers AI binding';
      const status = document.createElement('span');
      status.className = 'ocad-status';
      status.dataset.status = 'CHECKING';
      status.id = 'ocad-cloudflare-status';
      status.textContent = 'CHECKING';
      row.append(name, status);
      const detail = document.createElement('div');
      detail.className = 'ocad-detail';
      detail.id = 'ocad-cloudflare-detail';
      detail.textContent = 'Waiting for a secure server-side binding check…';
      card.append(row, detail);
      section.append(head, card);
      grid.insertAdjacentElement('afterend', section);
    }
    addStyles();
    return section;
  }

  function update(status, message) {
    const badge = document.getElementById('ocad-cloudflare-status');
    const detail = document.getElementById('ocad-cloudflare-detail');
    if (badge) {
      badge.dataset.status = String(status || 'UNAVAILABLE').toUpperCase();
      badge.textContent = status === 'READY' ? 'Ready' : status === 'NOT_CONFIGURED' ? 'Binding missing' : 'Needs attention';
    }
    if (detail) detail.textContent = String(message || 'Cloudflare AI status is not available.').slice(0, 220);
  }

  async function load() {
    const section = ensureSection();
    if (!section || section.dataset.loading === '1') return;
    section.dataset.loading = '1';
    try {
      const user = currentUser();
      if (!user || typeof user.getIdToken !== 'function') {
        update('AUTH_REQUIRED', 'Sign in with an owner account to check the server-side Cloudflare AI binding.');
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
      if (!response.ok) throw new Error(data.message || 'Cloudflare AI status could not be checked. Please retry.');
      const engine = Array.isArray(data.providers)
        ? data.providers.find(row => row.provider === 'cloudflare-workers-ai')
        : null;
      if (!engine) throw new Error('The server did not return the Cloudflare Workers AI status.');
      update(engine.status, engine.status === 'READY'
        ? 'Cloudflare Workers AI binding is present. Inference remains protected by the server-side quota and request limits.'
        : 'Configure the Cloudflare Pages Workers AI binding named AI, then redeploy OVYX. No external AI provider will be used.');
      section.dataset.loaded = '1';
      section.dataset.checkedAt = String(data.checkedAt || new Date().toISOString());
    } catch (error) {
      update('UNAVAILABLE', String(error?.message || 'Cloudflare AI status could not be checked.').slice(0, 200));
    } finally {
      section.dataset.loading = '0';
    }
  }

  function visible() {
    const admin = document.getElementById('view-admin-brain');
    return Boolean(admin && !admin.classList.contains('hidden') && admin.getAttribute('aria-hidden') !== 'true' && admin.offsetParent !== null);
  }
  function boot() {
    const section = ensureSection();
    if (section && visible() && !section.dataset.loaded && !section.dataset.loading) void load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('ovyx:view-changed', event => {
    if (event.detail?.view === 'admin-brain') queueMicrotask(boot);
  }, { passive: true });
  window.addEventListener('firebase-auth-state-ready', () => queueMicrotask(boot), { passive: true });
})();