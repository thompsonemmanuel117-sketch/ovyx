(function () {
  'use strict';
  if (window.__OVYX_AI_TRUST_V1__) return;
  window.__OVYX_AI_TRUST_V1__ = true;

  const VALID_MODES = new Set(['balanced', 'fast', 'quality']);
  let readinessSnapshot = null;
  let checkedAt = 0;
  let pendingCheck = null;
  let observer = null;
  let lastTargetCount = 0;

  const STYLE = [
    '.ovyx-ai-readiness{margin:12px 20px 18px;padding:14px 15px;border:1px solid rgba(255,255,255,.12);border-radius:13px;background:rgba(255,255,255,.025);color:var(--ov-text,#f3f4f6)}',
    '.ovyx-ai-readiness-head{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:750;letter-spacing:.01em}',
    '.ovyx-ai-readiness-dot{display:inline-block;width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:#c49a45;box-shadow:0 0 0 3px rgba(196,154,69,.12)}',
    '.ovyx-ai-readiness[data-state=configured] .ovyx-ai-readiness-dot{background:#58d7b5;box-shadow:0 0 0 3px rgba(88,215,181,.12)}',
    '.ovyx-ai-readiness[data-state=attention] .ovyx-ai-readiness-dot{background:#e8b64f}',
    '.ovyx-ai-readiness[data-state=error] .ovyx-ai-readiness-dot{background:#f87185}',
    '.ovyx-ai-readiness p{margin:8px 0 0;color:var(--ov-muted,#9ca3af);font:500 11px/1.6 Inter,system-ui,sans-serif}',
    '.ovyx-ai-readiness-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '.ovyx-ai-readiness-actions[hidden],.ovyx-ai-readiness-actions button[hidden]{display:none!important}',
    '.ovyx-ai-readiness .ovyx-settings-btn{font-size:11px;min-height:31px}',
    '.ovyx-ai-routing-note{margin:10px 0 2px;padding:11px 12px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:rgba(255,255,255,.018);color:var(--ov-muted,#9ca3af);font:500 11px/1.6 Inter,system-ui,sans-serif}',
    '.ovyx-ai-routing-note b{display:block;margin-bottom:3px;color:var(--ov-text,#f3f4f6)}',
    '.ovyx-ai-readiness-chip{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:3px 7px;border:1px solid rgba(255,255,255,.13);border-radius:999px;color:#cbd5e1;font:600 9px/1.3 Inter,system-ui,sans-serif;vertical-align:middle;white-space:normal}',
    '.ovyx-ai-readiness-chip[data-state=configured]{border-color:rgba(88,215,181,.3);color:#9be6d1}',
    '.ovyx-ai-readiness-chip[data-state=attention]{border-color:rgba(232,182,79,.34);color:#f2d69b}',
    '.ovyx-ai-readiness-chip[data-state=error]{border-color:rgba(248,113,133,.3);color:#fecdd3}',
    '.v59-home-ai-status{display:flex;justify-content:flex-end;padding:0 13px 8px}',
    '.v59-home-ai-status .ovyx-ai-readiness-chip{margin-left:0;max-width:100%}',
    '@media(max-width:580px){.v59-home-ai-status{justify-content:flex-start}}',
    '.ovyx-ai-choice-grid{grid-template-columns:repeat(3,minmax(0,1fr))}',
    '.ovyx-ai-choice b{font-size:11px!important;font-family:Inter,system-ui,sans-serif!important}',
    '.ovyx-ai-choice small{font-size:9px!important;font-family:Inter,system-ui,sans-serif!important;line-height:1.45!important}',
    '@media(max-width:580px){.ovyx-ai-choice-grid{grid-template-columns:1fr!important}.ovyx-ai-readiness{margin-left:12px;margin-right:12px}.ovyx-ai-readiness-chip{max-width:180px}}',
    'html.ovyx-light .ovyx-ai-readiness{border-color:rgba(15,23,42,.13);background:rgba(15,23,42,.02)}',
    'html.ovyx-light .ovyx-ai-routing-note{border-color:rgba(15,23,42,.1);background:rgba(15,23,42,.02)}'
  ].join('');
  function installStyles() {
    if (document.getElementById('ovyx-ai-trust-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-ai-trust-v1-style';
    style.textContent = STYLE;
    (document.head || document.documentElement).appendChild(style);
  }

  function currentUser() {
    try { return window.firebase?.auth?.().currentUser || null; } catch (_) { return null; }
  }

  function safeMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return VALID_MODES.has(mode) ? mode : 'balanced';
  }

  function loadPreferences() {
    let saved = {};
    try {
      const key = typeof window.OVYXAIStorageKey === 'function' ? window.OVYXAIStorageKey() : '';
      if (key) saved = JSON.parse(localStorage.getItem(key) || '{}') || {};
    } catch (_) {}
    return { ...saved, mode: safeMode(window.OVYXAI?.mode || saved.mode), provider: 'automatic', model: 'automatic' };
  }

  const MODE_LABELS = Object.freeze({
    balanced: 'OVYX Everyday',
    fast: 'OVYX Quick',
    quality: 'OVYX Deep'
  });

  function syncModeSelector(modeOverride) {
    const mode = safeMode(modeOverride || loadPreferences().mode);
    const selector = document.getElementById('v59-ai-mode-select');
    if (selector && selector.value !== mode) selector.value = mode;
    const note = document.getElementById('v59-routing-note');
    if (note) {
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-route';
      icon.setAttribute('aria-hidden', 'true');
      const detail = document.createElement('span');
      detail.textContent = MODE_LABELS[mode] + ' selected · OVYX manages AI routing. Usage and safety limits remain active.';
      note.replaceChildren(icon, detail);
    }
    return mode;
  }

  async function setMode(value) {
    const mode = safeMode(value);
    const user = currentUser();
    if (!user || typeof user.getIdToken !== 'function') {
      throw new Error('Sign in to save your OVYX mode. No AI request was sent.');
    }
    const token = await user.getIdToken();
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    };
    const loaded = await fetch('/api/settings/ai', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers
    });
    const existing = await loaded.json().catch(() => ({}));
    if (!loaded.ok || existing?.ok !== true || existing?.authority !== 'SERVER' || !existing.preferences) {
      throw new Error(loaded.status === 401
        ? 'Your sign-in session expired. Sign in again, then save your OVYX mode.'
        : 'OVYX could not verify your saved AI preferences. Nothing was changed; open Settings → AI Preferences and retry.');
    }
    const next = {
      ...existing.preferences,
      mode,
      provider: 'automatic',
      model: 'automatic',
      routing: 'automatic',
      fallback: 'automatic'
    };
    const savedResponse = await fetch('/api/settings/ai', {
      method: 'PUT',
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      body: JSON.stringify({ preferences: next })
    });
    const saved = await savedResponse.json().catch(() => ({}));
    if (!savedResponse.ok || saved?.ok !== true || saved?.authority !== 'SERVER' ||
        !saved.preferences || safeMode(saved.preferences.mode) !== mode ||
        saved.preferences.provider !== 'automatic' || saved.preferences.model !== 'automatic') {
      throw new Error(saved?.code === 'AI_PREFERENCES_WRITE_UNCONFIRMED'
        ? 'OVYX could not confirm that your mode was saved. Your last confirmed settings remain in effect. Please try again.'
        : 'OVYX could not save this mode securely. Your last confirmed settings remain in effect. Please try again.');
    }
    const key = typeof window.OVYXAIStorageKey === 'function'
      ? window.OVYXAIStorageKey()
      : 'ovyx.ai.preferences.v1';
    try { localStorage.setItem(key, JSON.stringify(saved.preferences)); } catch (_) {}
    window.OVYXAI = {
      ...(window.OVYXAI || {}),
      ...saved.preferences,
      mode,
      provider: 'automatic',
      model: 'automatic'
    };
    syncModeSelector(mode);
    window.dispatchEvent(new CustomEvent('ovyx:ai-preferences-changed', { detail: { mode } }));
    return { ok: true, mode, label: MODE_LABELS[mode] };
  }

  function applyReadinessToTarget(target, snapshot) {
    if (!target || !snapshot) return;
    const status = String(snapshot.status || 'check_failed');
    const userLabel = !currentUser() ? 'Sign in to check AI setup' : '';
    const labelByStatus = {
      selected_brain_configured: 'AI Brain selected · not live-tested',
      cloudflare_configured: 'Cloudflare AI configured · not live-tested',
      not_configured: 'AI setup needed',
      check_failed: 'Could not check AI setup',
      sign_in_required: 'Sign in to check AI setup',
      checking: 'Checking AI setup…'
    };
    const label = userLabel || labelByStatus[status] || 'Could not check AI setup';
    const detailByStatus = {
      selected_brain_configured: snapshot.message || 'An AI Brain is selected, but this check did not send a model request. A failed selected connection will be reported rather than silently replaced.',
      cloudflare_configured: snapshot.message || 'Cloudflare Workers AI is configured. This check does not run a model or spend AI usage; quota and live availability are checked when you send a request.',
      not_configured: snapshot.message || 'OVYX could not find an AI engine. Ask the platform administrator to configure Cloudflare Workers AI or check your AI Brain connection.',
      check_failed: snapshot.message || 'OVYX could not verify the AI setup. No AI request was sent; check the connection and try again.',
      sign_in_required: 'Sign in to your OVYX account to check AI setup.',
      checking: 'Checking configuration only. No AI request is sent and no AI usage is spent.'
    };
    target.dataset.state = status === 'selected_brain_configured' || status === 'cloudflare_configured'
      ? 'configured'
      : status === 'not_configured' || status === 'sign_in_required'
        ? 'attention'
        : status === 'checking'
          ? 'checking'
          : 'error';
    target.setAttribute('aria-label', label + '. ' + (detailByStatus[status] || ''));
    if (target.matches('[data-ovyx-ai-readiness="settings"]')) {
      const labelNode = target.querySelector('[data-ai-readiness-label]');
      const detailNode = target.querySelector('[data-ai-readiness-detail]');
      if (labelNode) labelNode.textContent = label;
      if (detailNode) detailNode.textContent = detailByStatus[status] || detailByStatus.check_failed;
      const openSettings = target.querySelector('[data-ai-readiness-open-settings]');
      if (openSettings) openSettings.hidden = status !== 'not_configured' && status !== 'selected_brain_configured';
    } else if (target.matches('[data-ovyx-ai-readiness="welcome"]')) {
      target.textContent = 'OVYX AI · ' + label;
      target.title = detailByStatus[status] || detailByStatus.check_failed;
    } else {
      target.textContent = label;
      target.title = detailByStatus[status] || '';
    }
  }

  function renderAll(snapshot) {
    document.querySelectorAll('[data-ovyx-ai-readiness]').forEach(target => applyReadinessToTarget(target, snapshot));
  }

  async function checkReadiness(force = false) {
    if (pendingCheck) return pendingCheck;
    if (!force && readinessSnapshot && Date.now() - checkedAt < 30000) {
      renderAll(readinessSnapshot);
      return readinessSnapshot;
    }
    const user = currentUser();
    if (!user || typeof user.getIdToken !== 'function') {
      readinessSnapshot = { ok: false, status: 'sign_in_required', liveInferenceTested: false };
      checkedAt = Date.now();
      renderAll(readinessSnapshot);
      return readinessSnapshot;
    }
    const targets = Array.from(document.querySelectorAll('[data-ovyx-ai-readiness]'));
    targets.forEach(target => applyReadinessToTarget(target, { status: 'checking' }));
    pendingCheck = (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/ai/readiness', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          readinessSnapshot = {
            ok: false,
            status: response.status === 401 ? 'sign_in_required' : 'check_failed',
            message: response.status === 401
              ? 'Sign in again to check AI setup.'
              : 'OVYX could not verify AI setup. No AI request was sent. Check your connection and try again.'
          };
        } else {
          readinessSnapshot = data;
        }
      } catch (_) {
        readinessSnapshot = {
          ok: false,
          status: 'check_failed',
          message: 'OVYX could not reach the readiness check. No AI request was sent. Check your internet connection and try again.'
        };
      } finally {
        checkedAt = Date.now();
        renderAll(readinessSnapshot);
        pendingCheck = null;
      }
      return readinessSnapshot;
    })();
    return pendingCheck;
  }

  function openConnectionSettings() {
    try {
      if (window.Router && typeof window.Router.go === 'function') window.Router.go('settings');
      window.setTimeout(() => {
        try { window.OVYXSettings?.show?.('connections'); } catch (_) {}
      }, 120);
    } catch (_) {}
  }

  function bindActions() {
    if (window.__OVYX_AI_TRUST_ACTIONS_BOUND__) return;
    window.__OVYX_AI_TRUST_ACTIONS_BOUND__ = true;
    document.addEventListener('click', event => {
      const refresh = event.target?.closest?.('[data-ai-readiness-refresh]');
      if (refresh) {
        event.preventDefault();
        refresh.disabled = true;
        checkReadiness(true).finally(() => { refresh.disabled = false; });
        return;
      }
      const open = event.target?.closest?.('[data-ai-readiness-open-settings]');
      if (open) {
        event.preventDefault();
        openConnectionSettings();
      }
    });
    document.addEventListener('change', event => {
      const selector = event.target?.closest?.('#v59-ai-mode-select');
      if (!selector || selector.disabled) return;
      const priorMode = safeMode(window.OVYXAI?.mode || loadPreferences().mode);
      const nextMode = safeMode(selector.value);
      selector.disabled = true;
      const note = document.getElementById('v59-routing-note');
      if (note) note.textContent = 'Saving ' + MODE_LABELS[nextMode] + ' to your OVYX account…';
      setMode(nextMode).then(result => {
        if (typeof window.showToast === 'function') window.showToast(result.label + ' saved to your OVYX account.', 'success');
      }).catch(error => {
        selector.value = priorMode;
        syncModeSelector(priorMode);
        const message = String(error?.message || 'OVYX could not save this mode. Your previous mode remains active.');
        const currentNote = document.getElementById('v59-routing-note');
        if (currentNote) {
          const icon = document.createElement('i');
          icon.className = 'fa-solid fa-circle-exclamation';
          icon.setAttribute('aria-hidden', 'true');
          const detail = document.createElement('span');
          detail.textContent = message;
          currentNote.replaceChildren(icon, detail);
        }
        if (typeof window.showToast === 'function') window.showToast(message, 'error');
      }).finally(() => { selector.disabled = false; });
    });
    window.addEventListener('ovyx:ai-preferences-changed', event => {
      const mode = safeMode(event.detail?.mode || loadPreferences().mode);
      window.OVYXAI = { ...(window.OVYXAI || {}), ...loadPreferences(), mode, provider: 'automatic', model: 'automatic' };
      syncModeSelector(mode);
    });
    window.addEventListener('storage', event => {
      if (event.key && /ovyx\.ai\.preferences\.v1/.test(event.key)) {
        window.OVYXAI = { ...(window.OVYXAI || {}), ...loadPreferences() };
        syncModeSelector(window.OVYXAI.mode);
      }
    });
    window.addEventListener('firebase-auth-ready', () => checkReadiness(true), { passive: true });
    window.addEventListener('ovyx-auth-state-ready', () => checkReadiness(true), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkReadiness(false);
    });
  }

  function observeTargets() {
    if (observer || !document.body || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(() => {
      const targets = Array.from(document.querySelectorAll('[data-ovyx-ai-readiness]'));
      const count = targets.length;
      lastTargetCount = count;
      if (!count) return;
      // Settings renders its AI panel dynamically. A newly-created target can
      // replace an old target without changing the count, so also detect nodes
      // that still carry their initial checking state.
      if (readinessSnapshot && targets.some(target => target.dataset.state === 'checking')) {
        renderAll(readinessSnapshot);
      } else if (!readinessSnapshot && count) {
        checkReadiness(false);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function start() {
    installStyles();
    bindActions();
    observeTargets();
    const initialPrefs = loadPreferences();
    window.OVYXAI = { ...(window.OVYXAI || {}), ...initialPrefs, provider: 'automatic', model: 'automatic' };
    syncModeSelector(initialPrefs.mode);
    checkReadiness(true);
  }

  window.OVYXAITrust = Object.assign(window.OVYXAITrust || {}, {
    checkReadiness,
    refreshReadiness: () => checkReadiness(true),
    syncModeSelector,
    setMode
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();