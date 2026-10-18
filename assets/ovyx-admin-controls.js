(function () {
  'use strict';

  if (window.__OVYX_GLOBAL_OWNER_CONTROLS__) return;
  window.__OVYX_GLOBAL_OWNER_CONTROLS__ = true;

  const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
  const PROVIDERS = [
    { id: 'gemini', label: 'Google Gemini' },
    { id: 'deepseek', label: 'DeepSeek' },
    { id: 'claude', label: 'Anthropic Claude' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'groq', label: 'Groq' },
    { id: 'openrouter', label: 'OpenRouter' }
  ];
  const PLAN_FEATURES = [
    { id: 'webStudio', label: 'Web Studio' },
    { id: 'advancedWebStudio', label: 'Advanced Web Studio' },
    { id: 'appStudio', label: 'App Studio' },
    { id: 'gameStudio', label: 'Game Studio' },
    { id: 'aiGeneration', label: 'AI Generation' },
    { id: 'github', label: 'Source management' },
    { id: 'cloudflareDeploy', label: 'Website publishing' },
    { id: 'teamWorkspace', label: 'Team Workspace' },
    { id: 'templates', label: 'Blueprint Templates' }
  ];
  const DEFAULT_PLAN_FEATURES = {
    pro: ['webStudio', 'appStudio', 'aiGeneration', 'github', 'cloudflareDeploy', 'templates'],
    max: ['webStudio', 'advancedWebStudio', 'appStudio', 'aiGeneration', 'github', 'cloudflareDeploy', 'teamWorkspace', 'templates']
  };
  const $ = id => document.getElementById(id);
  const owner = () => window.OVYXServerOwner?.active === true && window.__OVYX_ROOT_AUTH_VERIFIED === true;
  const currentUser = () => {
    try { return window.firebase?.auth?.().currentUser || null; } catch (_) { return null; }
  };
  const currentView = () => String(window.KernelState?.activeView || document.querySelector('[id^="view-"]:not(.hidden)')?.id || '')
    .replace(/^view-/, '').trim().toLowerCase();
  const safeNumber = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const money = (value, currency) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(n); }
    catch (_) { return String(n) + ' ' + currency; }
  };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  async function idToken(force) {
    const user = currentUser();
    if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in with the owner account to continue.');
    return user.getIdToken(force === true);
  }

  async function api(path, options) {
    if (!owner()) throw new Error('Owner access could not be verified.');
    const config = Object.assign({ method: 'GET' }, options || {});
    const token = await idToken(false);
    const headers = Object.assign({ Accept: 'application/json', Authorization: 'Bearer ' + token }, config.headers || {});
    if (config.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, Object.assign({}, config, {
      headers: headers, credentials: 'same-origin', cache: 'no-store'
    }));
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(String(data.message || data.error || data.code || ('HTTP ' + response.status)).slice(0, 320));
    }
    return { data: data, status: response.status };
  }

  async function timedRequest(path, authenticated) {
    const started = performance.now();
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;
    try {
      const headers = { Accept: 'application/json' };
      if (authenticated) headers.Authorization = 'Bearer ' + await idToken(false);
      const response = await fetch(path, {
        method: 'GET', headers: headers, credentials: 'same-origin', cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok && data.ok !== false, status: response.status, duration: Math.max(0, Math.round(performance.now() - started)), data: data };
    } catch (error) {
      return { ok: false, status: 0, duration: Math.max(0, Math.round(performance.now() - started)), error: String(error?.name === 'AbortError' ? 'Timed out' : (error?.message || 'Request failed')).slice(0, 180), data: null };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function statusText(node, message, state) {
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state || 'neutral';
  }

  function notify(message, kind) {
    try {
      if (typeof window.showToast === 'function') window.showToast(message, kind || 'info');
    } catch (_) {}
  }

  function addStyles() {
    if ($('ovyx-owner-controls-styles')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-owner-controls-styles';
    style.textContent = [
      '.ovyx-owner-live-panel{margin:18px 0;padding:18px;border:1px solid rgba(255,255,255,.11);border-radius:15px;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.014));color:#f4f4f5}',
      '.ovyx-owner-live-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}',
      '.ovyx-owner-live-head h3{margin:0;font-size:14px;font-weight:800;letter-spacing:.02em;color:#f5f5f5}',
      '.ovyx-owner-live-head p{margin:5px 0 0;color:#a1a1aa;font-size:11px;line-height:1.6}',
      '.ovyx-owner-live-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px}',
      '.ovyx-owner-live-card{padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:rgba(0,0,0,.22);min-width:0}',
      '.ovyx-owner-live-label{font-size:9px;color:#a1a1aa;letter-spacing:.13em;text-transform:uppercase;font-weight:800}',
      '.ovyx-owner-live-value{margin-top:8px;font-size:14px;font-weight:850;overflow-wrap:anywhere;color:#fafafa}',
      '.ovyx-owner-live-detail{margin-top:5px;font-size:10px;line-height:1.55;color:#a1a1aa;overflow-wrap:anywhere}',
      '.ovyx-owner-live-status{margin-top:12px;min-height:18px;font-size:11px;color:#a1a1aa;white-space:pre-wrap;overflow-wrap:anywhere}',
      '.ovyx-owner-live-status[data-state="ok"]{color:#86efac}.ovyx-owner-live-status[data-state="error"]{color:#fca5a5}.ovyx-owner-live-status[data-state="warn"]{color:#fcd34d}',
      '.ovyx-owner-live-button{border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:8px 11px;background:#f4f4f5;color:#111827;font-weight:800;font-size:10px;cursor:pointer}',
      '.ovyx-owner-live-button:disabled{opacity:.45;cursor:not-allowed}',
      '.ovyx-owner-live-input,.ovyx-owner-live-select{width:100%;min-width:0;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:#08090b;color:#f4f4f5;padding:9px;font:500 12px/1.3 ui-monospace,monospace}',
      '.ovyx-owner-live-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}',
      '.ovyx-owner-live-field{display:block;font-size:10px;line-height:1.6;color:#c4c4cc}.ovyx-owner-live-field input,.ovyx-owner-live-field select,.ovyx-owner-live-field textarea{margin-top:5px}',
      '.ovyx-owner-user-table-wrap{width:100%;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:10px}',
      '.ovyx-owner-user-table{width:100%;min-width:720px;border-collapse:collapse;font-size:11px}.ovyx-owner-user-table th,.ovyx-owner-user-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left;vertical-align:middle}.ovyx-owner-user-table th{color:#a1a1aa;font-size:9px;letter-spacing:.09em;text-transform:uppercase;background:rgba(255,255,255,.03)}.ovyx-owner-user-table tr:last-child td{border-bottom:0}',
      '.ovyx-owner-user-actions{display:flex;gap:5px;flex-wrap:wrap}.ovyx-owner-user-actions button{border:1px solid rgba(255,255,255,.17);border-radius:6px;padding:6px 8px;font-size:9px;font-weight:800;color:#f4f4f5;background:#18181b}.ovyx-owner-user-actions button:disabled{opacity:.4}.ovyx-owner-user-muted{display:block;color:#a1a1aa;font-size:9px;margin-top:4px}',
      '.ovyx-owner-provider-row{display:grid;grid-template-columns:minmax(130px,1fr) 70px;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07)}.ovyx-owner-provider-row:last-child{border-bottom:0}',
      '@media(max-width:520px){.ovyx-owner-live-panel{padding:12px}.ovyx-owner-live-value{font-size:12px}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function panel(view, id, title, description, markup) {
    if (!view) return null;
    let host = $(id);
    if (host) return host;
    host = document.createElement('section');
    host.className = 'ovyx-owner-live-panel';
    host.id = id;
    host.innerHTML = '<div class="ovyx-owner-live-head"><div><h3>' + esc(title) + '</h3><p>' + esc(description) + '</p></div></div>' + markup;
    view.appendChild(host);
    return host;
  }

  function setGlobalIdentity(identity) {
    if (!identity) return;
    const name = String(identity.assistantName || 'OVYX AI').slice(0, 60);
    const color = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(identity.markColor || '')) ? String(identity.markColor).toUpperCase() : '#E8B64F';
    document.documentElement.style.setProperty('--ovyx-global-mark-color', color);
    document.documentElement.style.setProperty('--ovyx-global-ai-mark-color', color);
    document.documentElement.dataset.ovyxAssistantName = name;
    document.querySelectorAll('[data-ovyx-global-ai-name]').forEach(node => { node.textContent = name; });
    document.querySelectorAll('[data-ovyx-global-ai-mark]').forEach(node => {
      node.style.setProperty('--ovyx-global-mark-color', color);
      node.style.boxShadow = '0 0 18px ' + color + '55';
    });
    const preview = $('ovyx-global-mark-preview');
    if (preview) preview.style.background = 'radial-gradient(circle,' + color + ' 0%, #111827 78%)';
  }

  function applyPublicPlanCatalog(data) {
    if (!data || data.ok !== true || !data.pricing || typeof data.pricing !== 'object') return false;
    const validMoney = value => Number.isFinite(Number(value)) && Number(value) > 0;
    const pricing = {
      pro: {
        ngn: validMoney(data.pricing.pro?.ngn) ? Number(data.pricing.pro.ngn) : 33500,
        usd: validMoney(data.pricing.pro?.usd) ? Number(data.pricing.pro.usd) : 20
      },
      max: {
        ngn: validMoney(data.pricing.max?.ngn) ? Number(data.pricing.max.ngn) : 209375,
        usd: validMoney(data.pricing.max?.usd) ? Number(data.pricing.max.usd) : 120
      }
    };
    const AC = window.AdminConfigurator;
    if (AC) {
      AC.pricing = Object.assign({}, AC.pricing || {}, {
        pro: Object.assign({}, AC.pricing?.pro || {}, pricing.pro),
        max: Object.assign({}, AC.pricing?.max || {}, pricing.max)
      });
      if (data.gating && typeof data.gating === 'object') AC.gating = Object.assign({}, AC.gating || {}, data.gating);
      AC.updateLockIcons?.();
      try { localStorage.setItem('ovyx_pricing_matrix', JSON.stringify(AC.pricing)); } catch (_) {}
      const fields = [
        ['adm-pro-ngn', pricing.pro.ngn], ['adm-pro-usd', pricing.pro.usd],
        ['adm-max-ngn', pricing.max.ngn], ['adm-max-usd', pricing.max.usd]
      ];
      for (const [id, value] of fields) {
        const input = $(id);
        if (input && document.activeElement !== input) input.value = String(value);
      }
    }
    const quota = data.tokenQuotas || {};
    const Q = window.TokenQuotaRegistry;
    if (Q) {
      Q.tiers = Object.assign({}, Q.tiers || {}, {
        free: Object.assign({}, Q.tiers?.free || {}, { maxTokens: Number(quota.free || 50000) }),
        pro: Object.assign({}, Q.tiers?.pro || {}, { maxTokens: Number(quota.pro || 500000) }),
        max: Object.assign({}, Q.tiers?.max || {}, { maxTokens: Number(quota.max || 5000000) })
      });
      Q.serverTokenQuotas = { free: Number(quota.free || 50000), pro: Number(quota.pro || 500000), max: Number(quota.max || 5000000) };
      Q.renderMeter?.();
    }
    window.OVYXPlanCatalog = data;
    window.OvyxCurrencyEngine?.renderFormattedPrices?.();
    try { window.dispatchEvent(new CustomEvent('ovyx:plan-catalog-updated', { detail: { updatedAt: data.updatedAt || null, source: 'server' } })); } catch (_) {}
    return true;
  }

  async function syncPublicPlanCatalog() {
    try {
      const response = await fetch('/api/plans', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return false;
      const data = await response.json().catch(() => ({}));
      return applyPublicPlanCatalog(data);
    } catch (_) {
      // Keep the last server-confirmed catalog during transient network outages.
      return false;
    }
  }

  async function loadPublicIdentity() {
    try {
      const response = await fetch('/api/identity', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      if (data.ok && data.identity) setGlobalIdentity(data.identity);
    } catch (_) {}
  }

  function mountIdentityEditor() {
    const view = $('view-admin-identity');
    if (!view || !owner()) return;
    const host = panel(view, 'ovyx-global-identity-editor',
      'Global AI identity · Server settings',
      'These settings define the shared OVYX AI identity used across conversations and website creation.',
      '<div class="ovyx-owner-live-form-grid">' +
        '<label class="ovyx-owner-live-field">Assistant display name<input class="ovyx-owner-live-input" id="ovyx-global-ai-name" maxlength="60" value="OVYX AI" /></label>' +
        '<label class="ovyx-owner-live-field">Global mark color (hex)<input class="ovyx-owner-live-input" id="ovyx-global-ai-color" maxlength="7" value="#E8B64F" placeholder="#E8B64F" /></label>' +
      '</div>' +
      '<label class="ovyx-owner-live-field" style="display:block;margin-top:12px">Global persona instructions<textarea class="ovyx-owner-live-input" id="ovyx-global-ai-persona" maxlength="3000" rows="5" placeholder="Warm, friendly, professional, helpful…"></textarea></label>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px"><span id="ovyx-global-mark-preview" style="width:28px;height:28px;border-radius:50%;background:radial-gradient(circle,#E8B64F,#111827);border:1px solid rgba(255,255,255,.16)"></span><button type="button" class="ovyx-owner-live-button" id="ovyx-global-ai-save">Save identity globally</button></div>' +
      '<div class="ovyx-owner-live-status" id="ovyx-global-ai-status">Loading global AI identity…</div>');
    if (host.dataset.bound === '1') return;
    host.dataset.bound = '1';
    const oldTextarea = $('ident-mark-code');
    const oldApply = view.querySelector('button[onclick*="Custom SVG mark updated"]') || Array.from(view.querySelectorAll('button')).find(button => /Apply Mark/i.test(button.textContent || ''));
    if (oldTextarea) {
      oldTextarea.value = '#E8B64F';
      oldTextarea.rows = 1;
      oldTextarea.setAttribute('aria-label', 'Global mark color in hexadecimal format');
      const label = oldTextarea.closest('.v0-panel')?.querySelector('span');
      if (label) label.textContent = 'Global AI Mark Color (hex; safe value only)';
    }
    if (oldApply) {
      oldApply.removeAttribute('onclick');
      oldApply.onclick = null;
      oldApply.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const colorInput = $('ovyx-global-ai-color');
        const value = String(colorInput?.value || oldTextarea?.value || '').trim();
        if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) && colorInput) colorInput.value = value.toUpperCase();
        saveIdentity();
      }, true);
    }
    const colorInput = $('ovyx-global-ai-color');
    if (colorInput) colorInput.addEventListener('input', () => {
      const value = String(colorInput.value || '').trim();
      if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) setGlobalIdentity({ assistantName: $('ovyx-global-ai-name')?.value || 'OVYX AI', markColor: value });
    });
    $('ovyx-global-ai-save')?.addEventListener('click', saveIdentity);
    loadIdentityEditor();
  }

  async function loadIdentityEditor() {
    const status = $('ovyx-global-ai-status');
    try {
      const result = await api('/api/admin/identity');
      const identity = result.data.identity || {};
      if ($('ovyx-global-ai-name')) $('ovyx-global-ai-name').value = identity.assistantName || 'OVYX AI';
      if ($('ovyx-global-ai-color')) $('ovyx-global-ai-color').value = identity.markColor || '#E8B64F';
      if ($('ident-mark-code')) $('ident-mark-code').value = identity.markColor || '#E8B64F';
      if ($('ovyx-global-ai-persona')) $('ovyx-global-ai-persona').value = identity.persona || '';
      setGlobalIdentity(identity);
      statusText(status, 'Settings loaded. Last updated: ' + (result.data.updatedAt || 'not yet customized') + '.', 'ok');
    } catch (error) {
      statusText(status, 'We could not load these settings: ' + error.message, 'error');
    }
  }

  async function saveIdentity() {
    const status = $('ovyx-global-ai-status');
    const name = String($('ovyx-global-ai-name')?.value || 'OVYX AI').trim();
    const persona = String($('ovyx-global-ai-persona')?.value || '').trim();
    const markColor = String($('ovyx-global-ai-color')?.value || $('ident-mark-code')?.value || '#E8B64F').trim();
    if (!name || name.length > 60) return statusText(status, 'Assistant name must contain 1–60 characters.', 'error');
    if (persona.length > 3000) return statusText(status, 'Persona instructions are limited to 3,000 characters.', 'error');
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(markColor)) return statusText(status, 'Use a valid hexadecimal color such as #E8B64F. Raw HTML/SVG is not accepted.', 'error');
    const button = $('ovyx-global-ai-save');
    if (button) button.disabled = true;
    statusText(status, 'Saving global AI identity…');
    try {
      const result = await api('/api/admin/identity', {
        method: 'POST',
        body: JSON.stringify({ action: 'saveIdentity', identity: { assistantName: name, persona: persona, markColor: markColor.toUpperCase() } })
      });
      setGlobalIdentity(result.data.identity);
      if ($('ident-mark-code')) $('ident-mark-code').value = result.data.identity.markColor;
      statusText(status, 'Global AI identity saved. Last updated ' + result.data.updatedAt + '. New AI requests will use these settings; open pages may take a moment to update the visual mark.', 'ok');
      notify('Global AI identity saved for OVYX accounts.', 'success');
      await loadPublicIdentity();
    } catch (error) {
      statusText(status, 'Your changes could not be saved: ' + error.message, 'error');
      notify('Global AI identity was not saved: ' + error.message, 'error');
    } finally { if (button) button.disabled = false; }
  }

  let currentUserPageToken = '';
  async function loadUsers(pageToken) {
    const status = $('ovyx-owner-users-status');
    const body = $('ovyx-owner-users-body');
    const next = $('ovyx-owner-users-next');
    if (!body) return;
    if (!owner()) return statusText(status, 'Owner access could not be verified.', 'error');
    body.replaceChildren();
    statusText(status, 'Loading account records…');
    const refresh = $('ovyx-owner-users-refresh');
    if (refresh) refresh.disabled = true;
    try {
      const query = new URLSearchParams({ pageSize: '50' });
      if (pageToken) query.set('pageToken', pageToken);
      const result = await api('/api/admin/users?' + query.toString());
      const data = result.data;
      currentUserPageToken = data.nextPageToken || '';
      if (next) next.disabled = !currentUserPageToken;
      (Array.isArray(data.users) ? data.users : []).forEach(user => {
        const isRoot = String(user.email || '').toLowerCase() === ROOT_EMAIL || user.plan === 'root' || String(user.role || '').toUpperCase() === 'ROOT_SUPERUSER';
        const row = document.createElement('tr');
        const account = document.createElement('td');
        account.textContent = user.displayName || user.email || '(email not set)';
        const detail = document.createElement('span');
        detail.className = 'ovyx-owner-user-muted';
        detail.textContent = String(user.email || '') + ' · UID: ' + String(user.uid || '').slice(0, 16);
        account.appendChild(detail);
        const planCell = document.createElement('td');
        const plan = document.createElement('select');
        plan.className = 'ovyx-owner-live-select';
        ['free', 'pro', 'max'].forEach(value => {
          const option = document.createElement('option'); option.value = value; option.textContent = value.toUpperCase(); plan.appendChild(option);
        });
        plan.value = ['free','pro','max'].includes(user.plan) ? user.plan : 'free';
        plan.disabled = isRoot || user.disabled;
        planCell.appendChild(plan);
        const term = document.createElement('select');
        term.className = 'ovyx-owner-live-select';
        [{v:'30',t:'30 days'},{v:'90',t:'90 days'},{v:'365',t:'1 year'},{v:'730',t:'2 years'}].forEach(item => {
          const option = document.createElement('option'); option.value = item.v; option.textContent = item.t; term.appendChild(option);
        });
        const expiry = document.createElement('td');
        term.disabled = isRoot || user.disabled;
        expiry.appendChild(term);
        const quotaCell = document.createElement('td');
        const quota = user.quota || user.aiUsage || {};
        quotaCell.textContent = quota.bypass ? 'Owner bypass' : (String(quota.monthlyRemaining ?? '—') + ' / ' + String(quota.monthlyLimit ?? '—') + ' tokens');
        const daily = document.createElement('span');
        daily.className = 'ovyx-owner-user-muted';
        daily.textContent = quota.bypass ? 'Unlimited owner quota' : (String(quota.dailyPromptsRemaining ?? '—') + ' / ' + String(quota.dailyPromptLimit ?? '—') + ' daily prompts');
        quotaCell.appendChild(daily);
        const statusCell = document.createElement('td');
        const disabledText = user.disabled ? 'SUSPENDED' : (isRoot ? 'ROOT' : 'ACTIVE');
        const statusLabel = document.createElement('span');
        statusLabel.textContent = disabledText;
        statusLabel.style.color = user.disabled ? '#fca5a5' : (isRoot ? '#fcd34d' : '#86efac');
        statusCell.appendChild(statusLabel);
        const actionsCell = document.createElement('td');
        const actions = document.createElement('div'); actions.className = 'ovyx-owner-user-actions';
        const setPlan = document.createElement('button'); setPlan.textContent = 'Apply plan'; setPlan.disabled = isRoot || user.disabled;
        setPlan.addEventListener('click', async () => {
          if (plan.value === 'free' && !window.confirm('Downgrade this account to Free and remove its paid access?')) return;
          setPlan.disabled = true;
          try {
            await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ action: 'setPlan', uid: user.uid, plan: plan.value, durationDays: Number(term.value) }) });
            statusText(status, 'Plan updated for ' + (user.email || user.uid) + '. Feature access and usage limits now reflect this plan.', 'ok');
            await loadUsers('');
          } catch (error) {
            statusText(status, 'The plan could not be updated. Please try again.', 'error');
          } finally { setPlan.disabled = false; }
        });
        const changeStatus = document.createElement('button');
        changeStatus.textContent = user.disabled ? 'Enable account' : 'Suspend account';
        changeStatus.disabled = isRoot;
        changeStatus.addEventListener('click', async () => {
          const disable = !user.disabled;
          if (disable && !window.confirm('Suspend ' + (user.email || user.uid) + ' across OVYX? They will be unable to use authenticated services until re-enabled.')) return;
          changeStatus.disabled = true;
          try {
            const response = await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ action: 'setAccountStatus', uid: user.uid, disabled: disable }) });
            statusText(status, disable
              ? (response.data.refreshTokensRevoked ? 'Account suspended. Existing sessions have been revoked.' : 'Account suspended. Some existing sessions may remain active until they expire.')
              : 'Account re-enabled.', 'ok');
            await loadUsers('');
          } catch (error) {
            statusText(status, 'The account status could not be updated. Please try again.', 'error');
          } finally { changeStatus.disabled = false; }
        });
        const resetQuota = document.createElement('button');
        resetQuota.textContent = 'Reset quota';
        resetQuota.disabled = isRoot || user.disabled;
        resetQuota.addEventListener('click', async () => {
          if (!window.confirm('Reset this user’s monthly tokens and daily AI prompts to the current plan allowance?')) return;
          resetQuota.disabled = true;
          try {
            await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ action: 'resetQuota', uid: user.uid }) });
            statusText(status, 'Usage allowance reset for ' + (user.email || user.uid) + '.', 'ok');
            await loadUsers('');
          } catch (error) { statusText(status, 'The usage allowance could not be reset. Please try again.', 'error'); }
          finally { resetQuota.disabled = false; }
        });
        actions.append(setPlan, changeStatus, resetQuota);
        actionsCell.appendChild(actions);
        [account, planCell, expiry, quotaCell, statusCell, actionsCell].forEach(cell => row.appendChild(cell));
        body.appendChild(row);
      });
      statusText(status, 'Loaded ' + (data.users || []).length + ' account(s)' + (data.nextPageToken ? '. More accounts are available on the next page.' : '. All matching accounts are shown.'), 'ok');
    } catch (error) {
      statusText(status, 'The account list could not be loaded. Please try again.', 'error');
    } finally { if (refresh) refresh.disabled = false; }
  }

  function mountUsers() {
    const view = $('view-admin-users');
    if (!view || !owner()) return;
    const host = panel(view, 'ovyx-owner-users-panel', 'Live user registry · Account actions',
      'These actions update account access and saved records. The owner account is protected from account-management actions.',
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button type="button" class="ovyx-owner-live-button" id="ovyx-owner-users-refresh">Refresh accounts</button><button type="button" class="ovyx-owner-live-button" id="ovyx-owner-users-next" disabled>Next page</button></div>' +
      '<div class="ovyx-owner-user-table-wrap"><table class="ovyx-owner-user-table"><thead><tr><th>Account</th><th>Plan</th><th>Plan term</th><th>AI quota</th><th>Status</th><th>Account actions</th></tr></thead><tbody id="ovyx-owner-users-body"></tbody></table></div>' +
      '<div id="ovyx-owner-users-status" class="ovyx-owner-live-status">Waiting for owner authorization…</div>');
    if (host.dataset.bound === '1') return;
    host.dataset.bound = '1';
    $('ovyx-owner-users-refresh')?.addEventListener('click', () => loadUsers(''));
    $('ovyx-owner-users-next')?.addEventListener('click', () => { if (currentUserPageToken) loadUsers(currentUserPageToken); });
    loadUsers('');
  }

  let latestPlans = null;
  function syncPlanFeatureControls(data) {
    const features = data && data.features || {};
    for (const tier of ['pro', 'max']) {
      const values = Array.isArray(features[tier]) ? features[tier] : DEFAULT_PLAN_FEATURES[tier];
      const selected = new Set(values.map(item => String(typeof item === 'string' ? item : (item?.id || item?.key || '')).trim()).filter(Boolean));
      document.querySelectorAll('input[data-v655-plan="' + tier + '"]').forEach(input => {
        input.checked = selected.has(input.value);
      });
    }
  }
  async function loadPlansCatalog() {
    const response = await fetch('/api/plans', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || data.code || 'Pricing and plan details are not available right now.');
    latestPlans = data;
    syncPlanFeatureControls(data);
    applyPublicPlanCatalog(data);
    const saveButton = $('ovyx-global-quota-save');
    if (saveButton) saveButton.disabled = false;
    if (data.gating && typeof data.gating === 'object') {
      Object.entries(data.gating).forEach(([key, tier]) => {
        const control = $('gate-' + key);
        if (control && document.activeElement !== control) control.value = tier;
      });
    }
    const q = data.tokenQuotas || {};
    const d = data.dailyPromptQuotas || {};
    ['free','pro','max'].forEach(tier => {
      const tokens = $('ovyx-quota-tokens-' + tier);
      const daily = $('ovyx-quota-daily-' + tier);
      if (tokens && document.activeElement !== tokens) tokens.value = String(q[tier] || ({free:50000,pro:500000,max:5000000})[tier]);
      if (daily && document.activeElement !== daily) daily.value = String(d[tier] || ({free:4,pro:20,max:100})[tier]);
    });
    return data;
  }

  async function savePlanConfiguration() {
    const status = $('ovyx-global-quota-status') || $('ovyx-v655-plan-status');
    if (!owner()) return statusText(status, 'Owner access could not be verified.', 'error');
    const readInt = id => {
      const node = $(id);
      const value = Number(node?.value);
      if (!node || !Number.isSafeInteger(value) || value < 1 || value > 1000000000) throw new Error('Every quota must be a positive whole number.');
      return value;
    };
    const featureList = tier => Array.from($('ovyx-global-plan-features')?.querySelectorAll('input[data-v655-plan="' + tier + '"]:checked') || []).map(input => input.value);
    if (!latestPlans) {
      statusText(status, 'The latest plan details have not loaded. Refresh the catalogue before saving to avoid unintentionally changing paid-plan access.', 'error');
      return;
    }
    if (!document.querySelector('input[data-v655-plan="pro"]') || !document.querySelector('input[data-v655-plan="max"]')) {
      statusText(status, 'Paid-plan settings are not available right now. Nothing was saved.', 'error');
      return;
    }
    const current = latestPlans || {};
    const gating = Object.assign({}, current.gating || {}, window.AdminConfigurator?.gating || {});
    ['webstudio','advancedwebstudio','appstudio','gamestudio','aigeneration','github','cloudflaredeploy','teamworkspace','workspace','templates','admin-identity'].forEach(key => {
      const control = $('gate-' + key);
      const value = String(control?.value || '').trim().toLowerCase();
      if (control && ['free','pro','max','root'].includes(value)) gating[key] = value;
    });
    const pricing = {
      pro: { ngn: safeNumber($('adm-pro-ngn')?.value, Number(current.pricing?.pro?.ngn || 33500)), usd: safeNumber($('adm-pro-usd')?.value, Number(current.pricing?.pro?.usd || 20)) },
      max: { ngn: safeNumber($('adm-max-ngn')?.value, Number(current.pricing?.max?.ngn || 209375)), usd: safeNumber($('adm-max-usd')?.value, Number(current.pricing?.max?.usd || 120)) }
    };
    let button = $('ovyx-global-quota-save');
    if (button) button.disabled = true;
    statusText(status, 'Saving pricing, usage limits, and feature access…');
    try {
      const result = await api('/api/admin/plans/update', {
        method: 'POST',
        body: JSON.stringify({
          pricing: pricing,
          tokenQuotas: { free: readInt('ovyx-quota-tokens-free'), pro: readInt('ovyx-quota-tokens-pro'), max: readInt('ovyx-quota-tokens-max') },
          dailyPromptQuotas: { free: readInt('ovyx-quota-daily-free'), pro: readInt('ovyx-quota-daily-pro'), max: readInt('ovyx-quota-daily-max') },
          features: { pro: featureList('pro'), max: featureList('max') },
          gating: gating,
          accessRules: Array.isArray(current.accessRules) ? current.accessRules : []
        })
      });
      await loadPlansCatalog();
      if (window.TokenQuotaRegistry) {
        window.TokenQuotaRegistry.serverTokenQuotas = Object.assign({}, result.data.config?.tokenQuotas || {});
        window.TokenQuotaRegistry.renderMeter?.();
      }
      statusText(status, 'Pricing and plan settings saved. Public prices, usage limits, and paid-plan access now follow these settings.', 'ok');
      notify('Global pricing, quota and feature settings saved.', 'success');
    } catch (error) {
      statusText(status, 'Your changes could not be saved. Please try again.', 'error');
      notify('Global plan settings were not saved: ' + error.message, 'error');
    } finally { if (button) button.disabled = false; }
  }

  function mountPlanControls() {
    const view = $('view-admin-pricing');
    if (!view || !owner()) return;
    const host = panel(view, 'ovyx-global-quota-panel', 'Global plan rules',
      'These usage limits apply across accounts. Feature selections determine which capabilities are included in Pro and Max plans.',
      '<div class="ovyx-owner-live-form-grid">' +
        '<label class="ovyx-owner-live-field">Free monthly AI tokens<input class="ovyx-owner-live-input" id="ovyx-quota-tokens-free" type="number" min="1" step="1" value="50000"/></label>' +
        '<label class="ovyx-owner-live-field">Pro monthly AI tokens<input class="ovyx-owner-live-input" id="ovyx-quota-tokens-pro" type="number" min="1" step="1" value="500000"/></label>' +
        '<label class="ovyx-owner-live-field">Max monthly AI tokens<input class="ovyx-owner-live-input" id="ovyx-quota-tokens-max" type="number" min="1" step="1" value="5000000"/></label>' +
        '<label class="ovyx-owner-live-field">Free daily prompts<input class="ovyx-owner-live-input" id="ovyx-quota-daily-free" type="number" min="1" step="1" value="4"/></label>' +
        '<label class="ovyx-owner-live-field">Pro daily prompts<input class="ovyx-owner-live-input" id="ovyx-quota-daily-pro" type="number" min="1" step="1" value="20"/></label>' +
        '<label class="ovyx-owner-live-field">Max daily prompts<input class="ovyx-owner-live-input" id="ovyx-quota-daily-max" type="number" min="1" step="1" value="100"/></label>' +
      '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:13px"><button class="ovyx-owner-live-button" id="ovyx-global-quota-save" type="button" disabled>Save global plan rules</button><span id="ovyx-global-quota-status" class="ovyx-owner-live-status" style="margin:0;flex:1;min-width:180px">Loading plan details…</span></div>');
    if (!host) return;
    const hideLegacyPlanControls = () => {
      const legacy = $('ovyx-v655-plan-control');
      if (legacy && !host.contains(legacy)) {
        legacy.hidden = true;
        legacy.setAttribute('aria-hidden', 'true');
        legacy.style.setProperty('display', 'none', 'important');
      }
    };
    hideLegacyPlanControls();
    let featuresHost = $('ovyx-global-plan-features');
    if (!featuresHost) {
      const featurePanel = document.createElement('section');
      featurePanel.id = 'ovyx-global-plan-features';
      featurePanel.className = 'ovyx-owner-live-panel';
      featurePanel.style.marginTop = '14px';
      const heading = document.createElement('h4');
      heading.className = 'ovyx-owner-live-label';
      heading.textContent = 'Included features per paid plan';
      const description = document.createElement('p');
      description.className = 'ovyx-owner-live-detail';
      description.textContent = 'Choose the features included with Pro and Max plans. These settings apply to all accounts on the selected plan.';
      featurePanel.append(heading, description);
      const grid = document.createElement('div');
      grid.className = 'ovyx-owner-live-form-grid';
      grid.style.marginTop = '10px';
      for (const tier of ['pro', 'max']) {
        const card = document.createElement('div');
        card.className = 'ovyx-owner-live-card';
        const tierTitle = document.createElement('div');
        tierTitle.className = 'ovyx-owner-live-label';
        tierTitle.textContent = tier.toUpperCase() + ' PLAN';
        const list = document.createElement('div');
        list.style.display = 'grid';
        list.style.gap = '8px';
        list.style.marginTop = '10px';
        for (const feature of PLAN_FEATURES) {
          const label = document.createElement('label');
          label.style.display = 'flex';
          label.style.alignItems = 'center';
          label.style.gap = '8px';
          label.style.color = '#d4d4d8';
          label.style.fontSize = '11px';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.dataset.v655Plan = tier;
          checkbox.value = feature.id;
          checkbox.checked = DEFAULT_PLAN_FEATURES[tier].includes(feature.id);
          const text = document.createElement('span');
          text.textContent = feature.label;
          label.append(checkbox, text);
          list.appendChild(label);
        }
        card.append(tierTitle, list);
        grid.appendChild(card);
      }
      featurePanel.appendChild(grid);
      host.appendChild(featurePanel);
      featuresHost = featurePanel;
    }
    let gatesHost = $('ovyx-global-gates-controls');
    if (!gatesHost) {
      const gatePanel = document.createElement('div');
      gatePanel.className = 'ovyx-owner-live-panel';
      gatePanel.style.marginTop = '14px';
      const title = document.createElement('h4');
      title.className = 'ovyx-owner-live-label';
      title.textContent = 'Global feature gates';
      const description = document.createElement('p');
      description.className = 'ovyx-owner-live-detail';
      description.textContent = 'Choose the minimum plan required for each feature. These rules apply to all accounts; owner access remains protected.';
      gatesHost = document.createElement('div');
      gatesHost.id = 'ovyx-global-gates-controls';
      gatesHost.className = 'ovyx-owner-live-form-grid';
      gatesHost.style.marginTop = '10px';
      const gateRows = [
        ['webstudio', 'Web Studio'],
        ['advancedwebstudio', 'Advanced Web Studio'],
        ['appstudio', 'App Studio'],
        ['aigeneration', 'AI Generation'],
        ['github', 'GitHub Integration'],
        ['cloudflaredeploy', 'Website publishing'],
        ['teamworkspace', 'Team Workspace'],
        ['templates', 'Blueprint Templates']
      ];
      const defaultGates = {
        webstudio: 'pro',
        advancedwebstudio: 'max',
        appstudio: 'max',
        aigeneration: 'free',
        github: 'pro',
        cloudflaredeploy: 'pro',
        teamworkspace: 'max',
        templates: 'free'
      };
      const savedGates = window.AdminConfigurator?.gating || {};
      for (const [key, label] of gateRows) {
        const field = document.createElement('label');
        field.className = 'ovyx-owner-live-field';
        field.textContent = label + ' requires';
        const select = document.createElement('select');
        select.id = 'gate-' + key;
        select.className = 'ovyx-owner-live-select';
        select.setAttribute('data-ovyx-global-feature-gate', key);
        for (const tier of ['free', 'pro', 'max', 'root']) {
          const option = document.createElement('option');
          option.value = tier;
          option.textContent = tier.toUpperCase();
          select.appendChild(option);
        }
        const initialGate = String(savedGates[key] || defaultGates[key] || 'free').toLowerCase();
        select.value = ['free', 'pro', 'max', 'root'].includes(initialGate) ? initialGate : 'free';
        field.appendChild(select);
        gatesHost.appendChild(field);
      }
      gatePanel.append(title, description, gatesHost);
      host.appendChild(gatePanel);
    }
    if (host.dataset.bound === '1') { hideLegacyPlanControls(); return; }
    host.dataset.bound = '1';
    if (!window.__OVYX_HIDE_LEGACY_PLAN_FEATURES__) {
      window.__OVYX_HIDE_LEGACY_PLAN_FEATURES__ = new MutationObserver(hideLegacyPlanControls);
      window.__OVYX_HIDE_LEGACY_PLAN_FEATURES__.observe(view, { childList: true, subtree: true });
    }
    $('ovyx-global-quota-save')?.addEventListener('click', savePlanConfiguration);
    loadPlansCatalog().then(() => statusText($('ovyx-global-quota-status'), 'Updated pricing and usage limits are ready.', 'ok'))
      .catch(error => statusText($('ovyx-global-quota-status'), 'Pricing and plan details could not be loaded. Please try again.', 'error'));
    if (window.OVYXPlanAdmin && !window.OVYXPlanAdmin.__globalSaveWrapped) {
      window.OVYXPlanAdmin.save = savePlanConfiguration;
      window.OVYXPlanAdmin.__globalSaveWrapped = true;
    }
  }

  let latestAIConfig = null;
  function mountBrainControls() {
    const view = $('view-admin-brain');
    if (!view || !owner()) return;
    const host = panel(view, 'ovyx-global-ai-routing', 'AI selection preferences',
      'Set the preferred order for AI options used by OVYX Auto. Explicit choices for an individual request and users’ own connected options take priority.',
      '<div id="ovyx-global-ai-priority-rows"></div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button type="button" class="ovyx-owner-live-button" id="ovyx-global-ai-route-save">Save AI selection order</button><button type="button" class="ovyx-owner-live-button" id="ovyx-global-ai-status-refresh">Check AI availability</button></div><div id="ovyx-global-ai-route-status" class="ovyx-owner-live-status">Loading AI selection preferences…</div><div id="ovyx-global-ai-provider-status-note" class="ovyx-owner-live-status" aria-live="polite">AI availability has not been checked yet.</div><div id="ovyx-global-ai-provider-status" class="ovyx-owner-live-grid" style="margin-top:10px"></div>');
    if (host.dataset.bound === '1') return;
    host.dataset.bound = '1';
    const rows = $('ovyx-global-ai-priority-rows');
    PROVIDERS.forEach(provider => {
      const line = document.createElement('label');
      line.className = 'ovyx-owner-provider-row';
      const title = document.createElement('span');
      title.className = 'ovyx-owner-live-field';
      title.textContent = provider.label;
      const select = document.createElement('select');
      select.className = 'ovyx-owner-live-select';
      select.dataset.providerPriority = provider.id;
      for (let n = 1; n <= PROVIDERS.length; n++) {
        const option = document.createElement('option'); option.value = String(n); option.textContent = 'Priority ' + n; select.appendChild(option);
      }
      line.append(title, select); rows.appendChild(line);
    });
    $('ovyx-global-ai-route-save')?.addEventListener('click', saveAIProviderOrder);
    $('ovyx-global-ai-status-refresh')?.addEventListener('click', loadProviderStatus);
    loadAIProviderOrder();
  }

  async function loadAIProviderOrder() {
    const status = $('ovyx-global-ai-route-status');
    try {
      const result = await api('/api/admin/ai-config');
      latestAIConfig = result.data.config || {};
      const order = Array.isArray(latestAIConfig.providerOrder) ? latestAIConfig.providerOrder : PROVIDERS.map(item => item.id);
      PROVIDERS.forEach(item => {
        const select = document.querySelector('[data-provider-priority="' + item.id + '"]');
        if (select) select.value = String(Math.max(1, order.indexOf(item.id) + 1));
      });
      statusText(status, 'AI selection order: ' + order.join(' → '), 'ok');
      await loadProviderStatus();
    } catch (error) {
      statusText(status, 'AI selection settings could not be loaded. Please try again.', 'error');
    }
  }

  async function saveAIProviderOrder() {
    const status = $('ovyx-global-ai-route-status');
    const button = $('ovyx-global-ai-route-save');
    if (button) button.disabled = true;
    try {
      const order = PROVIDERS.map(item => ({
        id: item.id,
        priority: Number(document.querySelector('[data-provider-priority="' + item.id + '"]')?.value || 99)
      })).sort((a, b) => a.priority - b.priority).map(item => item.id);
      const result = await api('/api/admin/ai-config', { method: 'POST', body: JSON.stringify({ providerOrder: order }) });
      latestAIConfig = result.data.config;
      statusText(status, 'AI selection preferences saved: ' + latestAIConfig.providerOrder.join(' → ') + '. OVYX Auto will follow this order when choosing an AI option.', 'ok');
      notify('Global AI selection order saved.', 'success');
    } catch (error) {
      statusText(status, 'AI selection preferences could not be saved. Please try again.', 'error');
    } finally { if (button) button.disabled = false; }
  }

  async function loadProviderStatus() {
    const grid = $('ovyx-global-ai-provider-status');
    if (!grid) return;
    grid.replaceChildren();
    statusText($('ovyx-global-ai-provider-status-note'), 'Checking AI availability…');
    const result = await timedRequest('/api/ai/status', true);
    if (!result.ok) {
      statusText($('ovyx-global-ai-provider-status-note'), 'AI availability could not be checked right now. Please try again.', 'error');
      return;
    }
    const entries = (Array.isArray(result.data.providers) ? result.data.providers : []).concat(Array.isArray(result.data.additionalProviders) ? result.data.additionalProviders : []);
    entries.forEach(item => {
      const card = document.createElement('div'); card.className = 'ovyx-owner-live-card';
      const label = document.createElement('div'); label.className = 'ovyx-owner-live-label'; label.textContent = String(item.label || item.provider || item.name || 'AI option');
      const value = document.createElement('div'); value.className = 'ovyx-owner-live-value';
      value.textContent = item.connected === true ? 'Ready' : (item.configured === true ? 'Check failed' : 'Setup required');
      value.style.color = item.connected === true ? '#86efac' : (item.configured === true ? '#fcd34d' : '#fca5a5');
      const detail = document.createElement('div'); detail.className = 'ovyx-owner-live-detail';
      detail.textContent = item.connected ? 'Ready to handle AI requests.' : (item.configured ? 'This option needs attention.' : 'Setup is required before use.');
      card.append(label, value, detail); grid.appendChild(card);
    });
    const cf = result.data.cloudflare || {};
    const cfCard = document.createElement('div'); cfCard.className = 'ovyx-owner-live-card';
    cfCard.innerHTML = '<div class="ovyx-owner-live-label">Native AI service</div><div class="ovyx-owner-live-value">' + (cf.workersAiBinding ? 'Available' : 'Setup required') + '</div><div class="ovyx-owner-live-detail">Setup is present, but this check does not run an AI request.</div>';
    grid.appendChild(cfCard);
    const activeOrder = Array.isArray(latestAIConfig?.providerOrder) ? latestAIConfig.providerOrder : [];
    statusText($('ovyx-global-ai-provider-status-note'), 'AI availability check completed in ' + result.duration + ' ms.', 'ok');
  }

  async function runLiveOverview() {
    const host = $('ovyx-owner-live-overview');
    if (!host || !owner()) return;
    statusText($('ovyx-owner-overview-status'), 'Checking key service components…');
    const [health, plans, registry, sentinel] = await Promise.all([
      timedRequest('/api/health', false),
      timedRequest('/api/plans', false),
      timedRequest('/api/admin/users?pageSize=1', true),
      timedRequest('/api/admin/sentinel', true)
    ]);
    const cards = $('ovyx-owner-overview-cards');
    if (!cards) return;
    cards.replaceChildren();
    function add(label, value, detail, state) {
      const card = document.createElement('div'); card.className = 'ovyx-owner-live-card';
      const a = document.createElement('div'); a.className = 'ovyx-owner-live-label'; a.textContent = label;
      const b = document.createElement('div'); b.className = 'ovyx-owner-live-value'; b.textContent = value;
      b.style.color = state === 'bad' ? '#fca5a5' : state === 'warn' ? '#fcd34d' : state === 'ok' ? '#86efac' : '#fafafa';
      const d = document.createElement('div'); d.className = 'ovyx-owner-live-detail'; d.textContent = detail;
      card.append(a, b, d); cards.appendChild(card);
    }
    add('Platform health', health.ok ? 'Available' : (health.status ? 'Needs attention' : 'Unavailable'),
      health.ok ? 'Health check completed in ' + health.duration + ' ms.' : 'The platform health check could not be completed.', health.ok ? 'ok' : 'bad');
    const pricing = plans.data?.pricing || {};
    add('Global Pro price', plans.ok ? money(pricing.pro?.ngn, 'NGN') : 'Unavailable',
      plans.ok ? money(pricing.pro?.usd, 'USD') + ' · current plan details' : 'Current plan details could not be loaded.', plans.ok ? 'ok' : 'bad');
    add('Global Max price', plans.ok ? money(pricing.max?.ngn, 'NGN') : 'Unavailable',
      plans.ok ? money(pricing.max?.usd, 'USD') + ' · current plan details' : 'Current plan details could not be loaded.', plans.ok ? 'ok' : 'bad');
    add('Accounts', registry.ok ? 'Available' : 'Unavailable',
      registry.ok ? 'Reviewed ' + String(registry.data.users?.length || 0) + ' account record(s) in ' + registry.duration + ' ms. This is a sample, not a total count.' : 'The account list could not be loaded.', registry.ok ? 'ok' : 'bad');
    const report = sentinel.data?.latestReport || {};
    const critical = safeNumber(report.criticalCount ?? report.summary?.critical ?? report.counts?.critical, NaN);
    const reportStatus = String(report.status || report.result || 'No report yet').toUpperCase();
    add('Health review', sentinel.ok ? reportStatus : 'Unavailable',
      sentinel.ok ? (Number.isFinite(critical) ? String(critical) + ' critical finding(s); ' : '') + 'Last reviewed: ' + String(sentinel.data.lastScanAt || report.finishedAt || 'not recorded') : 'The latest health report could not be loaded.', sentinel.ok && reportStatus !== 'CRITICAL' ? 'ok' : 'warn');
    statusText($('ovyx-owner-overview-status'), 'Checks completed at ' + new Date().toLocaleString() + '. A successful status check does not guarantee every payment, publishing, or email workflow is working.', health.ok && plans.ok && registry.ok ? 'ok' : 'warn');
  }

  function mountOverview() {
    const view = $('view-admin-overview');
    if (!view || !owner()) return;
    const host = panel(view, 'ovyx-owner-live-overview', 'Service health overview',
      'Review service availability, pricing, account access, and the latest health report. Each check reports only the component tested.',
      '<div class="ovyx-owner-live-grid" id="ovyx-owner-overview-cards"></div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><button type="button" class="ovyx-owner-live-button" id="ovyx-owner-overview-refresh">Refresh live overview</button><div class="ovyx-owner-live-status" id="ovyx-owner-overview-status">Ready to check services.</div></div>');
    if (host.dataset.bound === '1') return;
    host.dataset.bound = '1';
    $('ovyx-owner-overview-refresh')?.addEventListener('click', runLiveOverview);
    runLiveOverview();
  }

  async function runBackendChecks() {
    const grid = $('ovyx-owner-backend-cards');
    if (!grid || !owner()) return;
    statusText($('ovyx-owner-backend-status'), 'Checking core services…');
    const checks = [
      { label: 'Platform health', url: '/api/health', auth: false },
      { label: 'Feature availability', url: '/api/service-status', auth: true },
      { label: 'Owner access', url: '/api/entitlements', auth: true },
      { label: 'Health report storage', url: '/api/admin/sentinel', auth: true }
    ];
    const outcomes = await Promise.all(checks.map(item => timedRequest(item.url, item.auth)));
    grid.replaceChildren();
    outcomes.forEach((outcome, index) => {
      const card = document.createElement('div'); card.className = 'ovyx-owner-live-card';
      const label = document.createElement('div'); label.className = 'ovyx-owner-live-label'; label.textContent = checks[index].label;
      const value = document.createElement('div'); value.className = 'ovyx-owner-live-value'; value.textContent = outcome.ok ? 'Available' : (outcome.status ? 'Needs attention' : 'Unavailable');
      value.style.color = outcome.ok ? '#86efac' : '#fca5a5';
      const detail = document.createElement('div'); detail.className = 'ovyx-owner-live-detail'; detail.textContent = outcome.ok ? 'Responded in ' + outcome.duration + ' ms.' : 'This service could not be reached.';
      card.append(label, value, detail); grid.appendChild(card);
    });
    statusText($('ovyx-owner-backend-status'), 'Each check covers only the component tested. Payment, publishing and email workflows need separate end-to-end verification.', outcomes.every(item => item.ok) ? 'ok' : 'warn');
  }

  function mountBackendChecks() {
    const view = $('view-admin-backend');
    if (!view || !owner()) return;
    const host = panel(view, 'ovyx-owner-backend-live-checks', 'Service checks',
      'Run read-only checks of key platform services. A successful check confirms only the component reviewed.',
      '<div class="ovyx-owner-live-grid" id="ovyx-owner-backend-cards"></div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><button type="button" class="ovyx-owner-live-button" id="ovyx-owner-backend-refresh">Check services</button><div id="ovyx-owner-backend-status" class="ovyx-owner-live-status">Ready to check services.</div></div>');
    if (host.dataset.bound === '1') return;
    host.dataset.bound = '1';
    $('ovyx-owner-backend-refresh')?.addEventListener('click', runBackendChecks);
    runBackendChecks();
  }

  async function runTelemetryProbe() {
    const grid = $('telemetry-cards-grid');
    if (!grid || !owner()) return;
    grid.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'col-span-full ovyx-owner-live-status';
    loading.textContent = 'Checking key service components…';
    grid.appendChild(loading);
    const outcomes = await Promise.all([
      timedRequest('/api/health', false),
      timedRequest('/api/entitlements', true),
      timedRequest('/api/ai/status', true),
      timedRequest('/api/admin/sentinel', true)
    ]);
    grid.replaceChildren();
    function card(name, state, detail, color) {
      const box = document.createElement('div'); box.className = 'v0-card rounded-xl p-4 flex flex-col justify-between min-h-24';
      const title = document.createElement('span'); title.className = 'ovyx-owner-live-label'; title.textContent = name;
      const value = document.createElement('span'); value.className = 'ovyx-owner-live-value'; value.textContent = state; value.style.color = color || '#f4f4f5';
      const info = document.createElement('span'); info.className = 'ovyx-owner-live-detail'; info.textContent = detail;
      box.append(title, value, info); grid.appendChild(box);
    }
    const health = outcomes[0], auth = outcomes[1], ai = outcomes[2], sentinel = outcomes[3];
    card('Website service', health.ok ? 'Available' : 'Unavailable', health.ok ? 'Availability check completed in ' + health.duration + ' ms.' : 'The website service could not be reached.', health.ok ? '#86efac' : '#fca5a5');
    card('Account access', auth.ok ? 'Available' : 'Unavailable', auth.ok ? 'Owner access check completed in ' + auth.duration + ' ms.' : auth.error || 'Account access could not be verified.', auth.ok ? '#86efac' : '#fca5a5');
    if (ai.ok) {
      const providers = (Array.isArray(ai.data.providers) ? ai.data.providers : []).concat(Array.isArray(ai.data.additionalProviders) ? ai.data.additionalProviders : []);
      providers.forEach(item => {
        const ready = item.connected === true;
        const configured = item.configured === true;
        card(String(item.label || item.provider || item.name || 'AI option'),
          ready ? 'Ready' : (configured ? 'Check failed' : 'Setup required'),
          'Availability check completed in ' + ai.duration + ' ms. ' + (ready ? 'Ready to handle AI requests.' : configured ? 'This option needs attention.' : 'Setup is required before use.'),
          ready ? '#86efac' : (configured ? '#fcd34d' : '#fca5a5'));
      });
      card('Native AI service', ai.data.cloudflare?.workersAiBinding ? 'Setup detected' : 'Setup required',
        'Setup status only; this check does not run an AI request.', ai.data.cloudflare?.workersAiBinding ? '#fcd34d' : '#fca5a5');
    } else {
      card('AI service status', 'Unavailable', ai.error || ('The AI availability check could not be completed.'), '#fca5a5');
    }
    const report = sentinel.data?.latestReport || {};
    const reportStatus = sentinel.ok ? String(report.status || 'No report yet').toUpperCase() : 'Unavailable';
    const checkList = Array.isArray(report.checks) ? report.checks : (Array.isArray(report.findings) ? report.findings : []);
    const critical = checkList.filter(item => String(item.severity || item.status || '').toLowerCase() === 'critical').length;
    card('OVYX Sentinel', reportStatus, sentinel.ok
      ? (critical ? critical + ' critical item(s) in report. ' : '') + 'Last reviewed: ' + String(sentinel.data.lastScanAt || report.finishedAt || 'not recorded')
      : 'The latest health report could not be loaded.', sentinel.ok && reportStatus === 'healthy' ? '#86efac' : '#fcd34d');
    const allUp = health.ok && auth.ok && ai.ok && sentinel.ok;
    if (window.AdminTelemetry) window.AdminTelemetry.lastVerifiedAt = new Date().toISOString();
    document.documentElement.dataset.ovyxTelemetryCheckedAt = new Date().toISOString();
    const existingStatus = $('ovyx-owner-telemetry-status');
    statusText(existingStatus, 'Service checks completed at ' + new Date().toLocaleString() + '. AI status reflects a configuration check; the timing shown here does not measure response generation speed.', allUp ? 'ok' : 'warn');
  }

  function mountTelemetry() {
    const view = $('view-admin-telemetry');
    if (!view || !owner()) return;
    const host = panel(view, 'ovyx-owner-telemetry-note', 'Service health',
      'Review service availability, response times, AI status, and the latest health report. These checks show only the components tested.',
      '<div id="ovyx-owner-telemetry-status" class="ovyx-owner-live-status">Ready to run live checks.</div><button type="button" class="ovyx-owner-live-button" id="ovyx-owner-telemetry-refresh" style="margin-top:9px">Check service health</button>');
    if (host.dataset.bound !== '1') {
      host.dataset.bound = '1';
      $('ovyx-owner-telemetry-refresh')?.addEventListener('click', runTelemetryProbe);
    }
    if (window.AdminTelemetry) window.AdminTelemetry.probe = runTelemetryProbe;
    runTelemetryProbe();
  }

  function bindGlobalBroadcast() {
    const button = $('v34-broadcast-publish');
    if (!button || button.dataset.serverOwnerBound === '1') return;
    button.dataset.serverOwnerBound = '1';
    button.addEventListener('click', async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const status = $('v34-broadcast-status');
      if (!owner()) return statusText(status, 'Owner access could not be verified.', 'error');
      const message = String($('v34-broadcast-body')?.value || '').trim();
      const title = String($('v34-broadcast-title')?.value || 'OVYX Update').trim() || 'OVYX Update';
      const category = String($('v34-broadcast-category')?.value || 'product');
      const link = String($('v34-broadcast-link')?.value || '').trim();
      const wantsEmail = $('v34-broadcast-email')?.checked === true;
      if (!message) return statusText(status, 'Write an announcement before publishing.', 'error');
      if (link && !/^(?:https:\/\/|\/)/i.test(link)) return statusText(status, 'The optional link must be an HTTPS URL or a local OVYX path.', 'error');
      button.disabled = true;
      statusText(status, 'Publishing announcement…');
      try {
        const result = await api('/api/admin/broadcasts', {
          method: 'POST',
          body: JSON.stringify({ title: title, message: message, category: category, link: link })
        });
        statusText(status, 'Announcement published to signed-in OVYX users.' + (wantsEmail ? ' Email notifications were not sent by this action.' : ''), 'ok');
        notify('In-app announcement published.', 'success');
        if ($('v34-broadcast-body')) $('v34-broadcast-body').value = '';
        const host = $('v34-broadcast-history');
        if (host) {
          const entry = document.createElement('div'); entry.className = 'v34-history-item';
          const main = document.createElement('div');
          const heading = document.createElement('b'); heading.textContent = title;
          const sub = document.createElement('small'); sub.textContent = message + ' · ' + category;
          main.append(heading, sub);
          const time = document.createElement('time'); time.textContent = new Date().toLocaleString();
          entry.append(main, time); host.prepend(entry);
        }
      } catch (error) {
        statusText(status, 'The announcement could not be published. Please try again.', 'error');
        notify('Announcement could not be published: ' + error.message, 'error');
      } finally { button.disabled = false; }
    }, true);
  }

  function bindTemplatePublisher() {
    const form = $('v43-template-form');
    if (!form || form.dataset.serverPublisherBound === '1') return;
    form.dataset.serverPublisherBound = '1';
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const status = $('v43-template-form-status');
      if (!owner()) return statusText(status, 'Owner access could not be verified.', 'error');
      const title = String($('v43-template-title')?.value || '').trim();
      const category = String($('v43-template-category')?.value || '');
      const previewUrl = String($('v43-template-preview')?.value || '').trim();
      const requiredTier = String($('v43-template-tier')?.value || 'free');
      const raw = String($('v43-template-ast')?.value || '').trim();
      if (!title || !raw) return statusText(status, 'Enter a template title and valid template structure.', 'error');
      let ast;
      try { ast = JSON.parse(raw); } catch (_) { return statusText(status, 'The template structure must be valid JSON.', 'error'); }
      const hasNodes = ast && typeof ast === 'object' && !Array.isArray(ast) &&
        (Array.isArray(ast.canvas) || Array.isArray(ast.nodes) || Array.isArray(ast.sections) ||
          (Array.isArray(ast.pages) && ast.pages.some(page => page && Array.isArray(page.sections))));
      if (!hasNodes) return statusText(status, 'The template must include a canvas or page with at least one section.', 'error');
      const publish = $('v43-template-publish');
      if (publish) publish.disabled = true;
      statusText(status, 'Publishing template…');
      try {
        const result = await api('/api/admin/templates', {
          method: 'POST',
          body: JSON.stringify({ action: 'publish', title: title, category: category, previewUrl: previewUrl, requiredTier: requiredTier, ast: ast })
        });
        const record = result.data.template;
        if (record) {
          window.__OVYX_TEMPLATE_LIVE__ = (Array.isArray(window.__OVYX_TEMPLATE_LIVE__) ? window.__OVYX_TEMPLATE_LIVE__.filter(item => item.id !== record.id) : []).concat([record]);
          try { window.dispatchEvent(new CustomEvent('ovyx:templates-live-cache', { detail: { source: 'server-owner-publisher', count: window.__OVYX_TEMPLATE_LIVE__.length } })); } catch (_) {}
          try { window.dispatchEvent(new CustomEvent('ovyx:template-released', { detail: { template: record } })); } catch (_) {}
        }
        const count = $('v43-template-count');
        if (count && record) count.textContent = String(Math.max(0, Number(count.textContent) || 0) + 1);
        const channel = $('v43-template-channel');
        if (channel) channel.textContent = 'PUBLISHED';
        statusText(status, 'Template published to the global catalogue: ' + String(record?.title || title) + '. Published galleries will refresh automatically.', 'ok');
        notify('Template published to the global catalog.', 'success');
        form.reset();
      } catch (error) {
        statusText(status, 'The template could not be published. Please try again.', 'error');
        notify('Template could not be published: ' + error.message, 'error');
      } finally { if (publish) publish.disabled = false; }
    }, true);
  }


  /* The production integration toggle is persisted on the server and enforced by /api middleware. */
  function patchProductionSwitch() {
    const sw = window.MasterProductionSwitch;
    if (sw && !sw.__ovyxGlobalIntegrationControl) {
      sw.__ovyxGlobalIntegrationControl = true;
      sw.loadFirestoreState = async function () {
        if (!owner()) throw new Error('Owner access could not be verified.');
        const result = await api('/api/admin/control');
        const config = result.data.config || {};
        this.isLive = typeof config.liveDeploy === 'boolean' ? config.liveDeploy :
          (typeof config.productionLive === 'boolean' ? config.productionLive : true);
        try { localStorage.setItem('ovyx_master_production_live', String(this.isLive)); } catch (_) {}
        const ac = window.AdminConfigurator;
        if (ac) {
          if (config.pricing) ac.pricing = Object.assign({}, ac.pricing || {}, config.pricing);
          if (config.gating) ac.gating = Object.assign({}, ac.gating || {}, config.gating);
          // Master Admin Override is a local owner-preview affordance, never a global entitlement.
          ac.adminOverride = owner() && config.masterAdminOverride === true;
          ['pro','max'].forEach(tier => {
            ['ngn','usd'].forEach(currency => {
              const input = $('adm-' + tier + '-' + currency);
              if (input && config.pricing && config.pricing[tier] && config.pricing[tier][currency] != null) input.value = config.pricing[tier][currency];
            });
          });
          Object.entries(config.gating || {}).forEach(([key, tier]) => {
            const input = $('gate-' + key);
            if (input) input.value = tier;
          });
          ac.updateLockIcons?.();
          const override = $('admin-override-toggle');
          if (override) override.checked = owner() && config.masterAdminOverride === true;
          const badge = $('admin-override-badge');
          if (badge) badge.textContent = owner() && config.masterAdminOverride === true ? 'ON (OWNER UI ONLY)' : 'OFF (ENFORCING)';
        }
        this.renderUI?.();
        const status = $('ovyx-global-integration-status');
        statusText(status, this.isLive ? 'LIVE: new AI work, agent runs, deployment, repository access and checkout creation are enabled globally.' :
          'PAUSED: new AI work, agent runs, deployment, repository access and checkout creation are blocked globally.', this.isLive ? 'ok' : 'warn');
        return config;
      };
      sw.toggle = async function () {
        if (!owner()) return notify('Owner access could not be verified.', 'error');
        const next = this.isLive !== true;
        if (!next && !window.confirm('Pause new AI generation, agent runs, deployment, repository access and payment checkout for EVERY OVYX account? Login, health checks and verification of payments already started remain available.')) return;
        const button = $('master-switch-toggle-btn') || $('ovyx-global-integration-toggle');
        if (button) button.disabled = true;
        try {
          const result = await api('/api/admin/control', {
            method: 'POST',
            body: JSON.stringify({ action: 'setProductionState', live: next })
          });
          const config = result.data.config || {};
          this.isLive = typeof config.liveDeploy === 'boolean' ? config.liveDeploy : next;
          try { localStorage.setItem('ovyx_master_production_live', String(this.isLive)); } catch (_) {}
          this.renderUI?.();
          const status = $('ovyx-global-integration-status');
          statusText(status, this.isLive ? 'Platform integrations are enabled for all accounts.' :
            'Platform integrations are paused for all accounts.', this.isLive ? 'ok' : 'warn');
          notify(this.isLive ? 'Platform integrations enabled for all accounts.' : 'Platform integrations paused for all accounts.', this.isLive ? 'success' : 'info');
        } catch (error) {
          statusText($('ovyx-global-integration-status'), 'These platform settings could not be saved. Please try again.', 'error');
          notify('Platform integration settings could not be updated. Please try again.', 'error');
        } finally { if (button) button.disabled = false; }
      };
    }
    const ac = window.AdminConfigurator;
    if (ac && !ac.__ovyxGlobalConfigRead) {
      ac.__ovyxGlobalConfigRead = true;
      ac.loadFirestoreState = async function () {
        const result = await api('/api/admin/control');
        const config = result.data.config || {};
        this.pricing = Object.assign({}, this.pricing || {}, config.pricing || {});
        this.gating = Object.assign({}, this.gating || {}, config.gating || {});
        this.adminOverride = config.masterAdminOverride === true;
        this.updateLockIcons?.();
        const toggle = $('admin-override-toggle');
        if (toggle) toggle.checked = this.adminOverride;
        const badge = $('admin-override-badge');
        if (badge) badge.textContent = this.adminOverride ? 'ON (OWNER UI ONLY)' : 'OFF (ENFORCING)';
        const sw = window.MasterProductionSwitch;
        if (sw) {
          sw.isLive = typeof config.liveDeploy === 'boolean' ? config.liveDeploy :
            (typeof config.productionLive === 'boolean' ? config.productionLive : true);
          sw.renderUI?.();
        }
        return { config: config, controls: { masterAdminOverride: this.adminOverride } };
      };
    }
    if (sw && owner() && !sw.__ovyxGlobalStateLoaded) {
      sw.__ovyxGlobalStateLoaded = true;
      sw.loadFirestoreState().catch(error => {
        sw.__ovyxGlobalStateLoaded = false;
        statusText($('ovyx-global-integration-status'), 'Platform integration status could not be loaded. Please try again.', 'error');
      });
    }
  }

  function mountProductionControlPanel() {
    const view = $('view-admin-pricing');
    if (!view || !owner()) return;
    const host = panel(view, 'ovyx-global-integration-control', 'Platform integration controls',
      'ON enables new AI generation, agent runs, deployments, repository access and payment checkout. OFF pauses those operations for every user; authentication, diagnostics and verification of already-started payments stay available.',
      '<div class="ovyx-owner-live-grid" id="ovyx-global-integration-cards"><div class="ovyx-owner-live-card"><div class="ovyx-owner-live-label">Current status</div><div id="ovyx-global-integration-value" class="ovyx-owner-live-value">Loading…</div><div class="ovyx-owner-live-detail">Read from system/config, not local storage.</div></div></div>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><button type="button" class="ovyx-owner-live-button" id="ovyx-global-integration-toggle">Toggle global integrations</button><div id="ovyx-global-integration-status" class="ovyx-owner-live-status">Loading integration settings…</div></div>');
    if (host.dataset.integrationBound === '1') return;
    host.dataset.integrationBound = '1';
    $('ovyx-global-integration-toggle')?.addEventListener('click', () => window.MasterProductionSwitch?.toggle?.());
    const refreshState = async () => {
      try {
        const config = await window.MasterProductionSwitch?.loadFirestoreState?.();
        const live = config ? (config.liveDeploy !== false && config.productionLive !== false) : window.MasterProductionSwitch?.isLive === true;
        const value = $('ovyx-global-integration-value');
        if (value) {
          value.textContent = live ? 'LIVE / ON' : 'PAUSED / OFF';
          value.style.color = live ? '#86efac' : '#fcd34d';
        }
        statusText($('ovyx-global-integration-status'), live ?
          'Platform integrations are enabled for all accounts.' :
          'Platform integrations are paused for all accounts.', live ? 'ok' : 'warn');
      } catch (error) {
        statusText($('ovyx-global-integration-status'), 'The current status could not be loaded. Please try again.', 'error');
      }
    };
    refreshState();
  }

  function mountBroadcastRegistry() {
    const view = $('view-admin-broadcasts');
    if (!view || !owner()) return;
    const host = panel(view, 'ovyx-global-broadcast-registry', 'Published global broadcasts',
      'Withdraw an active announcement from all future user inbox requests. The underlying record remains for audit history.',
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="ovyx-owner-live-button" id="ovyx-global-broadcast-refresh" type="button">Refresh broadcasts</button></div><div id="ovyx-global-broadcast-list" class="ovyx-owner-live-grid"></div><div id="ovyx-global-broadcast-status" class="ovyx-owner-live-status">Loading saved records…</div>');
    if (host.dataset.broadcastBound === '1') return;
    host.dataset.broadcastBound = '1';
    $('ovyx-global-broadcast-refresh')?.addEventListener('click', loadBroadcastRegistry);
    $('ovyx-global-broadcast-list')?.addEventListener('click', withdrawBroadcast);
    loadBroadcastRegistry();
  }

  async function loadBroadcastRegistry() {
    const grid = $('ovyx-global-broadcast-list');
    if (!grid || !owner()) return;
    statusText($('ovyx-global-broadcast-status'), 'Loading published broadcasts…');
    try {
      const result = await api('/api/admin/broadcasts');
      const items = Array.isArray(result.data.broadcasts) ? result.data.broadcasts : [];
      grid.replaceChildren();
      if (!items.length) {
        const empty = document.createElement('div'); empty.className = 'ovyx-owner-live-card'; empty.textContent = 'No active global broadcasts.';
        grid.appendChild(empty);
      }
      items.forEach(item => {
        const card = document.createElement('div'); card.className = 'ovyx-owner-live-card';
        const title = document.createElement('div'); title.className = 'ovyx-owner-live-label'; title.textContent = String(item.title || 'OVYX Update');
        const body = document.createElement('div'); body.className = 'ovyx-owner-live-detail'; body.textContent = String(item.body || '').slice(0, 500);
        const meta = document.createElement('div'); meta.className = 'ovyx-owner-live-detail'; meta.textContent = String(item.category || 'product') + ' · ' + String(item.createdAt || '');
        const button = document.createElement('button'); button.type = 'button'; button.className = 'ovyx-owner-live-button'; button.dataset.withdrawBroadcast = String(item.id || ''); button.textContent = 'Withdraw from users';
        card.append(title, body, meta, button); grid.appendChild(card);
      });
      statusText($('ovyx-global-broadcast-status'), 'Loaded ' + items.length + ' active announcement(s).', 'ok');
    } catch (error) {
      statusText($('ovyx-global-broadcast-status'), 'Announcements could not be loaded. Please try again.', 'error');
    }
  }

  async function withdrawBroadcast(event) {
    const button = event.target.closest('button[data-withdraw-broadcast]');
    if (!button) return;
    const id = button.dataset.withdrawBroadcast || '';
    if (!id || !window.confirm('Withdraw this announcement from all future authenticated user inbox responses?')) return;
    button.disabled = true;
    try {
      await api('/api/admin/broadcasts', { method: 'POST', body: JSON.stringify({ action: 'unpublish', id: id }) });
      statusText($('ovyx-global-broadcast-status'), 'Announcement withdrawn. Its record has been retained for reference.', 'ok');
      await loadBroadcastRegistry();
    } catch (error) {
      statusText($('ovyx-global-broadcast-status'), 'The announcement could not be withdrawn. Please try again.', 'error');
    } finally { button.disabled = false; }
  }

  function mountTemplateRegistry() {
    const view = $('view-admin-template-hub');
    if (!view || !owner()) return;
    const host = panel(view, 'ovyx-global-template-registry', 'Published template registry', 
      'Publish a reusable template for all accounts. Withdrawing a template removes it from the catalogue without changing apps that already use it.',
      '<form id="ovyx-global-template-publish-form" class="ovyx-owner-live-publish-form">' +
        '<div class="ovyx-owner-live-form-grid">' +
          '<label class="ovyx-owner-live-field">Template title<input class="ovyx-owner-live-input" id="ovyx-global-template-title" required maxlength="120" placeholder="Premium SaaS landing page"/></label>' +
          '<label class="ovyx-owner-live-field">Category<select class="ovyx-owner-live-select" id="ovyx-global-template-category" required><option value="SaaS">SaaS</option><option value="Portfolio">Portfolio</option><option value="Commerce">Commerce</option></select></label>' +
          '<label class="ovyx-owner-live-field">Required account plan<select class="ovyx-owner-live-select" id="ovyx-global-template-tier" required><option value="free">Free</option><option value="pro">Pro</option><option value="max">Max</option></select></label>' +
          '<label class="ovyx-owner-live-field">Preview image URL (optional)<input class="ovyx-owner-live-input" id="ovyx-global-template-preview" type="url" placeholder="https://…"/></label>' +
        '</div>' +
        '<label class="ovyx-owner-live-field" style="display:block;margin-top:12px">Deployable template AST (JSON)<textarea class="ovyx-owner-live-input" id="ovyx-global-template-ast" required rows="7" spellcheck="false">{"nodes":[{"id":"hero-section","type":"section","name":"Hero"}]}</textarea></label>' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><button class="ovyx-owner-live-button" id="ovyx-global-template-publish" type="submit">Publish template globally</button><span id="ovyx-global-template-publish-status" class="ovyx-owner-live-status" style="margin:0;flex:1">Ready to publish.</span></div>' +
      '</form>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 10px"><button class="ovyx-owner-live-button" id="ovyx-global-template-refresh" type="button">Refresh published templates</button></div><div id="ovyx-global-template-list" class="ovyx-owner-live-grid"></div><div id="ovyx-global-template-status" class="ovyx-owner-live-status">Loading saved records…</div>');
    if (host.dataset.templateBound === '1') return;
    host.dataset.templateBound = '1';
    $('ovyx-global-template-publish-form')?.addEventListener('submit', publishTemplateFromOwnerForm);
    $('ovyx-global-template-refresh')?.addEventListener('click', loadTemplateRegistry);
    $('ovyx-global-template-list')?.addEventListener('click', withdrawTemplate);
    loadTemplateRegistry();
  }

  async function publishTemplateFromOwnerForm(event) {
    event.preventDefault();
    const status = $('ovyx-global-template-publish-status');
    const form = $('ovyx-global-template-publish-form');
    const button = $('ovyx-global-template-publish');
    if (!owner()) return statusText(status, 'Owner access could not be verified.', 'error');
    const title = String($('ovyx-global-template-title')?.value || '').trim();
    const category = String($('ovyx-global-template-category')?.value || '');
    const requiredTier = String($('ovyx-global-template-tier')?.value || 'free');
    const previewUrl = String($('ovyx-global-template-preview')?.value || '').trim();
    const rawAst = String($('ovyx-global-template-ast')?.value || '').trim();
    if (!title) return statusText(status, 'Enter a title for this template.', 'error');
    if (!['SaaS', 'Portfolio', 'Commerce'].includes(category)) return statusText(status, 'Choose a supported category.', 'error');
    if (!['free', 'pro', 'max'].includes(requiredTier)) return statusText(status, 'Choose a supported account plan.', 'error');
    if (previewUrl && (!/^https:\/\//i.test(previewUrl) || previewUrl.length > 1000)) return statusText(status, 'The preview image must be an HTTPS URL under 1,000 characters.', 'error');
    let ast;
    try { ast = JSON.parse(rawAst); } catch (_) { return statusText(status, 'The template structure must be valid JSON.', 'error'); }
    const hasNodes = ast && typeof ast === 'object' && !Array.isArray(ast) &&
      (Array.isArray(ast.canvas) || Array.isArray(ast.nodes) || Array.isArray(ast.sections) ||
        (Array.isArray(ast.pages) && ast.pages.some(page => page && Array.isArray(page.sections))));
    if (!hasNodes || rawAst.length > 850000) return statusText(status, 'The template must include at least one page or section and remain within the supported size limit.', 'error');
    if (button) button.disabled = true;
    statusText(status, 'Publishing template…');
    try {
      const result = await api('/api/admin/templates', {
        method: 'POST',
        body: JSON.stringify({ action: 'publish', title, category, previewUrl, requiredTier, ast })
      });
      const record = result.data.template;
      if (!record?.id) throw new Error('The template could not be confirmed as published.');
      const existing = Array.isArray(window.__OVYX_TEMPLATE_LIVE__) ? window.__OVYX_TEMPLATE_LIVE__ : [];
      window.__OVYX_TEMPLATE_LIVE__ = existing.filter(item => item.id !== record.id).concat([record]);
      try { window.dispatchEvent(new CustomEvent('ovyx:templates-live-cache', { detail: { source: 'server-owner-publisher', count: window.__OVYX_TEMPLATE_LIVE__.length } })); } catch (_) {}
      try { window.dispatchEvent(new CustomEvent('ovyx:template-released', { detail: { template: record } })); } catch (_) {}
      statusText(status, 'Template published to the global catalogue: ' + String(record.title || title) + '.', 'ok');
      notify('Template published to the global catalogue.', 'success');
      await loadTemplateRegistry();
      form?.reset();
    } catch (error) {
      statusText(status, 'The template could not be published. Please try again.', 'error');
      notify('Template could not be published: ' + error.message, 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadTemplateRegistry() {
    const grid = $('ovyx-global-template-list');
    if (!grid || !owner()) return;
    statusText($('ovyx-global-template-status'), 'Loading published templates…');
    try {
      const result = await api('/api/admin/templates');
      const templates = Array.isArray(result.data.templates) ? result.data.templates : [];
      grid.replaceChildren();
      if (!templates.length) {
        const empty = document.createElement('div'); empty.className = 'ovyx-owner-live-card'; empty.textContent = 'No published templates.';
        grid.appendChild(empty);
      }
      templates.forEach(item => {
        const card = document.createElement('div'); card.className = 'ovyx-owner-live-card';
        const title = document.createElement('div'); title.className = 'ovyx-owner-live-label'; title.textContent = String(item.title || 'Untitled');
        const detail = document.createElement('div'); detail.className = 'ovyx-owner-live-detail'; detail.textContent = String(item.category || '') + ' · ' + String(item.requiredTier || 'free') + ' · updated ' + String(item.updatedAt || '');
        const button = document.createElement('button'); button.type = 'button'; button.className = 'ovyx-owner-live-button'; button.dataset.withdrawTemplate = String(item.id || ''); button.textContent = 'Withdraw publication';
        card.append(title, detail, button); grid.appendChild(card);
      });
      statusText($('ovyx-global-template-status'), 'Loaded ' + templates.length + ' currently published template(s).', 'ok');
    } catch (error) {
      statusText($('ovyx-global-template-status'), 'The template catalogue could not be loaded. Please try again.', 'error');
    }
  }

  async function withdrawTemplate(event) {
    const button = event.target.closest('button[data-withdraw-template]');
    if (!button) return;
    const id = button.dataset.withdrawTemplate || '';
    if (!id || !window.confirm('Withdraw this template from the shared OVYX catalogue for every user? Existing projects remain unchanged.')) return;
    button.disabled = true;
    try {
      await api('/api/admin/templates', { method: 'POST', body: JSON.stringify({ action: 'unpublish', id: id }) });
      statusText($('ovyx-global-template-status'), 'Template withdrawn from the published catalogue.', 'ok');
      await loadTemplateRegistry();
      try { window.OVYXTemplateHub?.render?.(); } catch (_) {}
    } catch (error) {
      statusText($('ovyx-global-template-status'), 'The template could not be withdrawn. Please try again.', 'error');
    } finally { button.disabled = false; }
  }

  function bindTemplateAccessGuard() {
    const hub = window.OVYXTemplateHub;
    if (!hub || typeof hub.deploy !== 'function' || hub.__ovyxServerEntitlementGuard === true) return;
    const originalDeploy = hub.deploy.bind(hub);
    hub.deploy = function (templateId) {
      const user = window.firebase?.auth?.().currentUser;
      if (!user) {
        notify('Sign in before deploying a shared template.', 'error');
        return false;
      }
      return (async () => {
        try {
          const response = await fetch('/api/entitlements', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json', Authorization: 'Bearer ' + await user.getIdToken(false) }
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || String(data.uid || user.uid) !== String(user.uid)) {
            throw new Error(String(data.message || data.error || 'Account entitlements could not be verified.'));
          }
          if (data.capabilities?.templates !== true) {
            notify('Shared templates are not included in your current plan.', 'error');
            return false;
          }
          return originalDeploy(templateId);
        } catch (error) {
          notify('Template access could not be verified: ' + error.message, 'error');
          return false;
        }
      })();
    };
    hub.__ovyxServerEntitlementGuard = true;
  }

  async function onView() {
    loadPublicIdentity();
    if (!owner()) return;
    patchProductionSwitch();
    const view = currentView();
    if (view === 'admin-overview') mountOverview();
    if (view === 'admin-pricing') mountPlanControls();
    if (view === 'admin-users') mountUsers();
    if (view === 'admin-brain') mountBrainControls();
    if (view === 'admin-identity') mountIdentityEditor();
    if (view === 'admin-backend') mountBackendChecks();
    if (view === 'admin-telemetry') mountTelemetry();
    bindGlobalBroadcast();
    bindTemplatePublisher();
    if (view === 'admin-pricing') { mountProductionControlPanel(); patchProductionSwitch(); }
    if (view === 'admin-broadcasts') mountBroadcastRegistry();
    if (view === 'admin-template-hub') mountTemplateRegistry();
    if (view === 'admin-template-hub') {
      const authBadge = $('v43-template-admin-auth');
      if (authBadge) authBadge.textContent = 'OWNER ACCESS VERIFIED';
    }
  }

  function boot() {
    addStyles();
    loadPublicIdentity();
    syncPublicPlanCatalog();
    bindTemplateAccessGuard();
    window.addEventListener('ovyx:templates-live-cache', bindTemplateAccessGuard, { passive: true });
    [250, 900, 1800].forEach(ms => setTimeout(bindTemplateAccessGuard, ms));
    window.addEventListener('ovyx-owner-state', event => {
      if (event.detail?.root === true && owner()) {
        patchProductionSwitch();
        setTimeout(onView, 50);
        return;
      }
      // Do not let a stale owner-preview toggle remain active after sign-out or account switch.
      if (!owner() && window.AdminConfigurator) {
        window.AdminConfigurator.adminOverride = false;
        window.AdminConfigurator.updateLockIcons?.();
        const toggle = $('admin-override-toggle');
        if (toggle) toggle.checked = false;
        const badge = $('admin-override-badge');
        if (badge) badge.textContent = 'OFF (ENFORCING)';
      }
    });
    window.addEventListener('ovyx:view-changed', () => setTimeout(onView, 0));
    window.addEventListener('firebase-auth-state-ready', () => setTimeout(onView, 100));
    window.addEventListener('pageshow', () => setTimeout(onView, 150));
    setInterval(loadPublicIdentity, 60000);
    setInterval(syncPublicPlanCatalog, 60000);
    window.addEventListener('pageshow', () => { syncPublicPlanCatalog(); }, { passive: true });
    setInterval(() => {
      if (owner() && currentView() === 'admin-overview') runLiveOverview();
    }, 60000);
    setInterval(() => {
      if (owner() && currentView() === 'admin-identity') loadIdentityEditor();
    }, 60000);
    setTimeout(onView, 300);
    setTimeout(onView, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
