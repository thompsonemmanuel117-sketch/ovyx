(function () {
  'use strict';
  if (window.__OVYX_LAUNCH_POLISH__) return;
  window.__OVYX_LAUNCH_POLISH__ = true;

  var TOAST_HOST_ID = 'ovyx-launch-toasts';
  var ADMIN_PANEL_ID = 'ovyx-launch-quota-panel';
  var lastToastAt = Object.create(null);
  var css = [
    '#ovyx-launch-toasts{position:fixed;top:max(14px,env(safe-area-inset-top));right:max(14px,env(safe-area-inset-right));z-index:2147483600;display:flex;flex-direction:column;gap:10px;width:min(420px,calc(100vw - 28px));pointer-events:none}',
    '.ovyx-launch-toast{display:grid;grid-template-columns:38px minmax(0,1fr) 28px;align-items:center;gap:11px;padding:13px 12px 13px 13px;border:1px solid rgba(255,255,255,.13);border-left:3px solid #a1a1aa;border-radius:16px;background:rgba(12,14,18,.96);color:#f4f4f5;box-shadow:0 18px 55px rgba(0,0,0,.38);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);pointer-events:auto;opacity:1;transform:translateX(0) scale(1);animation:ovyxLaunchToastIn .34s cubic-bezier(.2,.8,.2,1) both}',
    '.ovyx-launch-toast[data-kind="success"]{border-color:rgba(52,211,153,.24);border-left-color:#34d399}.ovyx-launch-toast[data-kind="error"]{border-color:rgba(251,113,133,.28);border-left-color:#fb7185}.ovyx-launch-toast[data-kind="warning"]{border-color:rgba(251,191,36,.28);border-left-color:#fbbf24}.ovyx-launch-toast[data-kind="info"]{border-left-color:#60a5fa}',
    '.ovyx-launch-toast-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:12px;background:rgba(255,255,255,.06);font-size:18px;font-weight:900}.ovyx-launch-toast[data-kind="success"] .ovyx-launch-toast-icon{color:#6ee7b7;background:rgba(16,185,129,.12)}.ovyx-launch-toast[data-kind="error"] .ovyx-launch-toast-icon{color:#fda4af;background:rgba(244,63,94,.12)}.ovyx-launch-toast[data-kind="warning"] .ovyx-launch-toast-icon{color:#fcd34d;background:rgba(245,158,11,.12)}.ovyx-launch-toast[data-kind="info"] .ovyx-launch-toast-icon{color:#93c5fd;background:rgba(59,130,246,.12)}',
    '.ovyx-launch-toast-copy{min-width:0;font:500 13px/1.45 Inter,system-ui,sans-serif;overflow-wrap:anywhere}.ovyx-launch-toast-title{display:block;margin-bottom:2px;font-size:10px;font-weight:850;letter-spacing:.14em;text-transform:uppercase;opacity:.86}.ovyx-launch-toast-message{color:#e4e4e7}.ovyx-launch-toast-close{width:28px;height:28px;border:0;border-radius:9px;background:transparent;color:#a1a1aa;cursor:pointer;font-size:19px;line-height:1}.ovyx-launch-toast-close:hover{background:rgba(255,255,255,.08);color:#fff}.ovyx-launch-toast.is-leaving{animation:ovyxLaunchToastOut .22s ease-in both;pointer-events:none}',
    '@keyframes ovyxLaunchToastIn{from{opacity:0;transform:translate3d(26px,-6px,0) scale(.97);filter:blur(4px)}to{opacity:1;transform:translate3d(0,0,0) scale(1);filter:blur(0)}}@keyframes ovyxLaunchToastOut{to{opacity:0;transform:translate3d(22px,-4px,0) scale(.97);filter:blur(3px)}}',
    '.ovyx-launch-admin-quota{margin:18px 0;padding:20px;border:1px solid rgba(232,182,79,.22);border-radius:18px;background:linear-gradient(145deg,rgba(20,20,22,.98),rgba(8,9,11,.98));color:#f4f4f5;box-shadow:0 20px 60px rgba(0,0,0,.18);font-family:Inter,system-ui,sans-serif}.ovyx-launch-admin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}.ovyx-launch-kicker{font-size:10px;letter-spacing:.17em;text-transform:uppercase;color:#e8b64f;font-weight:850}.ovyx-launch-admin-title{font-size:19px;font-weight:800;letter-spacing:-.02em;margin-top:4px}.ovyx-launch-admin-subtitle{font-size:12px;color:#a1a1aa;margin-top:4px}.ovyx-launch-refresh{border:1px solid rgba(232,182,79,.34);border-radius:10px;padding:9px 12px;background:rgba(232,182,79,.09);color:#f7d98b;font-weight:750;font-size:12px;cursor:pointer}.ovyx-launch-refresh:disabled{opacity:.55;cursor:wait}',
    '.ovyx-launch-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}.ovyx-launch-summary-card{padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.025)}.ovyx-launch-summary-label{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:#a1a1aa}.ovyx-launch-summary-value{font-size:22px;font-weight:850;margin-top:5px}.ovyx-launch-user-list{display:grid;gap:10px}.ovyx-launch-user-row{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.025)}',
    '.ovyx-launch-user-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.ovyx-launch-user-name{font-size:13px;font-weight:750;overflow-wrap:anywhere}.ovyx-launch-user-email{font-size:11px;color:#a1a1aa;overflow-wrap:anywhere;margin-top:3px}.ovyx-launch-plan{white-space:nowrap;padding:4px 7px;border:1px solid rgba(255,255,255,.13);border-radius:7px;font-size:9px;letter-spacing:.08em;font-weight:850;text-transform:uppercase;color:#d4d4d8}.ovyx-launch-quota-line{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px;font-size:11px;color:#d4d4d8}.ovyx-launch-quota-value{font-weight:800;color:#f4f4f5}.ovyx-launch-meter{height:7px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.09);margin-top:8px}.ovyx-launch-meter-fill{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#34d399,#a3e635);transition:width .35s ease}.ovyx-launch-meter-fill.is-warning{background:linear-gradient(90deg,#fbbf24,#f59e0b)}.ovyx-launch-meter-fill.is-danger{background:linear-gradient(90deg,#fb7185,#ef4444)}.ovyx-launch-daily{margin-top:9px;font-size:11px;color:#a1a1aa;line-height:1.5}.ovyx-launch-blocked{color:#fda4af!important}.ovyx-launch-empty{padding:20px 12px;text-align:center;color:#a1a1aa;font-size:12px;border:1px dashed rgba(255,255,255,.12);border-radius:12px}',
    '@media(max-width:560px){#ovyx-launch-toasts{top:max(10px,env(safe-area-inset-top));right:10px;width:calc(100vw - 20px)}.ovyx-launch-toast{grid-template-columns:32px minmax(0,1fr) 25px;padding:10px;gap:9px}.ovyx-launch-toast-icon{width:32px;height:32px}.ovyx-launch-admin-quota{padding:13px;margin:12px 0}.ovyx-launch-summary{grid-template-columns:1fr 1fr}.ovyx-launch-summary-card:last-child{grid-column:1/-1}.ovyx-launch-admin-title{font-size:17px}}@media(prefers-reduced-motion:reduce){.ovyx-launch-toast,.ovyx-launch-toast.is-leaving,.ovyx-launch-meter-fill{animation:none!important;transition:none!important}}'
  ].join('');

  function installStyle() {
    if (document.getElementById('ovyx-launch-polish-style')) return;
    var style = document.createElement('style');
    style.id = 'ovyx-launch-polish-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function kindOf(type) {
    var value = String(type || 'info').toLowerCase();
    if (/success|saved|complete|connected|created|published/.test(value)) return 'success';
    if (/error|fail|danger|blocked|exhausted|invalid/.test(value)) return 'error';
    if (/warn|limit|quota|near/.test(value)) return 'warning';
    return 'info';
  }

  function iconOf(kind) {
    return kind === 'success' ? '✓' : kind === 'error' ? '×' : kind === 'warning' ? '!' : 'i';
  }

  function toastHost() {
    var host = document.getElementById(TOAST_HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = TOAST_HOST_ID;
      host.setAttribute('aria-label', 'OVYX notifications');
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-relevant', 'additions text');
      document.body.appendChild(host);
    }
    return host;
  }

  function dismissToast(node) {
    if (!node || node.classList.contains('is-leaving')) return;
    node.classList.add('is-leaving');
    window.setTimeout(function () { node.remove(); }, 260);
  }

  function launchToast(message, type, options) {
    var kind = kindOf(type);
    var text = String(message == null ? '' : message).trim();
    if (!text) text = kind === 'error' ? 'Something went wrong. Please try again.' : 'Done.';
    var key = kind + ':' + text;
    var now = Date.now();
    if (now - (lastToastAt[key] || 0) < 900) return null;
    lastToastAt[key] = now;

    installStyle();
    var host = toastHost();
    var card = document.createElement('div');
    card.className = 'ovyx-launch-toast';
    card.dataset.kind = kind;
    card.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    var icon = document.createElement('span');
    icon.className = 'ovyx-launch-toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconOf(kind);

    var copy = document.createElement('div');
    copy.className = 'ovyx-launch-toast-copy';
    var title = document.createElement('strong');
    title.className = 'ovyx-launch-toast-title';
    title.textContent = kind === 'success' ? 'Success' : kind === 'error' ? 'Action failed' : kind === 'warning' ? 'Attention' : 'OVYX';
    var body = document.createElement('div');
    body.className = 'ovyx-launch-toast-message';
    body.textContent = text;
    copy.appendChild(title);
    copy.appendChild(body);

    var close = document.createElement('button');
    close.className = 'ovyx-launch-toast-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    close.addEventListener('click', function () { dismissToast(card); });

    card.appendChild(icon);
    card.appendChild(copy);
    card.appendChild(close);
    host.appendChild(card);

    var duration = options && Number.isFinite(Number(options.duration))
      ? Math.max(1200, Math.min(15000, Number(options.duration)))
      : (kind === 'error' ? 7200 : 4800);
    window.setTimeout(function () { dismissToast(card); }, duration);
    while (host.children.length > 5) dismissToast(host.firstElementChild);
    return card;
  }

  function replaceToastFunction(name) {
    try {
      if (typeof window[name] === 'function' && window[name].__ovyxLaunchToast) return;
      var replacement = function (message, type, options) {
        return launchToast(message, type || 'info', options || {});
      };
      replacement.__ovyxLaunchToast = true;
      window[name] = replacement;
    } catch (_) {}
  }

  function legacyKind(node) {
    var cls = String(node.className || '');
    if (/emerald|green|success/i.test(cls)) return 'success';
    if (/rose|red|error|danger/i.test(cls)) return 'error';
    if (/amber|yellow|warning/i.test(cls)) return 'warning';
    var icon = node.querySelector('i,[class*="fa-"]');
    if (/check|circle-check|success/i.test(String(icon && icon.className || ''))) return 'success';
    if (/triangle-exclamation|times-circle|xmark|error/i.test(String(icon && icon.className || ''))) return 'error';
    return 'info';
  }

  function bridgeLegacyStack(stack) {
    if (!stack || stack.dataset.ovyxLaunchToastBridge === '1') return;
    stack.dataset.ovyxLaunchToastBridge = '1';
    stack.setAttribute('aria-hidden', 'true');
    stack.style.setProperty('display', 'none', 'important');
    var consume = function (node) {
      if (!(node instanceof HTMLElement) || node.id === TOAST_HOST_ID) return;
      var message = String(node.innerText || node.textContent || '').trim();
      if (message) launchToast(message, legacyKind(node));
      node.remove();
    };
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        Array.prototype.forEach.call(record.addedNodes, consume);
      });
    }).observe(stack, { childList: true });
    Array.prototype.slice.call(stack.children).forEach(consume);
  }

  function watchLegacyStacks() {
    var bind = function () {
      bridgeLegacyStack(document.getElementById('toast-stack'));
      bridgeLegacyStack(document.getElementById('notification-stack'));
      bridgeLegacyStack(document.getElementById('ovyx-toast-stack'));
    };
    bind();
    new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
  }

  function currentUser() {
    try {
      return window.firebase && typeof window.firebase.auth === 'function'
        ? window.firebase.auth().currentUser : null;
    } catch (_) { return null; }
  }

  async function authHeaders() {
    var user = currentUser();
    if (!user || typeof user.getIdToken !== 'function') return null;
    var token = await user.getIdToken();
    return token ? { Authorization: 'Bearer ' + token, Accept: 'application/json' } : null;
  }

  function numeric(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function fmt(value) {
    return Math.round(numeric(value)).toLocaleString();
  }

  async function loadPersonalQuota() {
    try {
      var headers = await authHeaders();
      if (!headers) return;
      var response = await fetch('/api/tokens/balance', {
        method: 'GET', headers: headers, credentials: 'same-origin', cache: 'no-store'
      });
      if (!response.ok) return;
      var data = await response.json();
      if (!data || data.ok !== true) return;

      var quota = data;
      var limit = Number(quota.monthlyLimit);
      var remaining = Number(quota.current_monthly_tokens);
      var bypass = quota.bypass === true || quota.mode === 'bypass';
      var valid = Number.isFinite(limit) && limit > 0 && Number.isFinite(remaining);
      var used = valid ? Math.max(0, Math.min(limit, limit - remaining)) : 0;
      var pct = valid ? Math.max(0, Math.min(100, used / limit * 100)) : 0;
      var ratio = document.getElementById('sidebar-token-ratio');
      var bar = document.getElementById('sidebar-token-bar');
      if (ratio) ratio.textContent = bypass ? 'Unlimited AI access' : (valid ? fmt(used) + ' / ' + fmt(limit) : 'Usage could not be loaded');
      if (bar) {
        bar.style.width = bypass ? '0%' : pct + '%';
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', '100');
        bar.setAttribute('aria-valuenow', String(Math.round(pct)));
        bar.setAttribute('aria-label', bypass ? 'Unlimited AI access' : Math.round(pct) + ' percent of monthly AI tokens used');
        bar.style.background = pct >= 100 ? 'linear-gradient(90deg,#fb7185,#ef4444)' : pct >= 80 ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,#34d399,#a3e635)';
      }
      var settingsMeter = document.getElementById('set-token-meter');
      if (settingsMeter) settingsMeter.textContent = bypass ? 'UNLIMITED' : (valid ? fmt(remaining) + ' / ' + fmt(limit) + ' left' : 'Unavailable');
    } catch (_) {}
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function quotaOf(user) {
    return user && (user.quota || user.aiUsage) || null;
  }

  function addSummaryCard(parent, label, value) {
    var card = el('div', 'ovyx-launch-summary-card');
    card.appendChild(el('div', 'ovyx-launch-summary-label', label));
    card.appendChild(el('div', 'ovyx-launch-summary-value', value));
    parent.appendChild(card);
  }

  function makeUserRow(user) {
    var quota = quotaOf(user);
    var row = el('article', 'ovyx-launch-user-row');
    row.dataset.userUid = String(user.uid || '');
    var head = el('div', 'ovyx-launch-user-head');
    var identity = el('div', '');
    identity.appendChild(el('div', 'ovyx-launch-user-name', user.displayName || user.email || user.uid || 'Unnamed user'));
    identity.appendChild(el('div', 'ovyx-launch-user-email', user.email || user.uid || 'No email'));
    head.appendChild(identity);
    head.appendChild(el('span', 'ovyx-launch-plan', user.plan || quota && quota.plan || 'free'));
    row.appendChild(head);

    if (!quota || quota.authority !== 'SERVER') {
      row.appendChild(el('div', 'ovyx-launch-empty', 'Usage details are not available for this account yet.'));
      return row;
    }
    if (quota.bypass) {
      row.appendChild(el('div', 'ovyx-launch-quota-line', 'Unlimited AI access · owner/admin quota bypass'));
      return row;
    }

    var limit = numeric(quota.monthlyLimit !== undefined ? quota.monthlyLimit : user.tokenLimit);
    var used = Math.min(limit, numeric(quota.monthlyUsed !== undefined ? quota.monthlyUsed : user.tokensUsed));
    var pct = Math.min(100, numeric(quota.monthlyUsagePercent !== undefined ? quota.monthlyUsagePercent : user.tokenUsagePercent));
    var monthly = el('div', 'ovyx-launch-quota-line');
    monthly.appendChild(el('span', '', 'Monthly AI tokens used'));
    monthly.appendChild(el('span', 'ovyx-launch-quota-value', fmt(used) + ' / ' + fmt(limit) + ' · ' + Math.round(pct) + '%'));
    row.appendChild(monthly);

    var track = el('div', 'ovyx-launch-meter');
    var fill = el('div', 'ovyx-launch-meter-fill' + (pct >= 100 ? ' is-danger' : pct >= 80 ? ' is-warning' : ''));
    fill.style.width = pct + '%';
    fill.setAttribute('role', 'progressbar');
    fill.setAttribute('aria-valuemin', '0');
    fill.setAttribute('aria-valuemax', '100');
    fill.setAttribute('aria-valuenow', String(Math.round(pct)));
    fill.setAttribute('aria-label', Math.round(pct) + ' percent of monthly tokens used');
    track.appendChild(fill);
    row.appendChild(track);

    var dailyLimit = quota.dailyPromptLimit;
    var dailyRemaining = quota.dailyPromptsRemaining;
    var note;
    if (quota.monthlyExhausted && Number(dailyRemaining) <= 0) {
      note = 'Build access blocked: daily allowance exhausted. User must wait for reset or upgrade.';
    } else if (quota.monthlyExhausted && Number(dailyRemaining) > 0) {
      note = fmt(dailyRemaining) + ' of ' + fmt(dailyLimit) + ' daily fallback prompts remain.';
    } else {
      note = fmt(quota.monthlyRemaining) + ' monthly tokens remain.';
      if (Number.isFinite(Number(dailyRemaining))) note += ' Daily fallback: ' + fmt(dailyRemaining) + ' / ' + fmt(dailyLimit) + ' prompts.';
    }
    row.appendChild(el('div', 'ovyx-launch-daily' + (quota.monthlyExhausted && Number(dailyRemaining) <= 0 ? ' ovyx-launch-blocked' : ''), note));
    return row;
  }

  function renderAdminQuota(users, message) {
    var view = document.getElementById('view-admin-users');
    if (!view) return;
    var panel = document.getElementById(ADMIN_PANEL_ID);
    if (!panel) {
      panel = el('section', 'ovyx-launch-admin-quota');
      panel.id = ADMIN_PANEL_ID;
      var titleBlock = view.firstElementChild;
      if (titleBlock && titleBlock.nextSibling) view.insertBefore(panel, titleBlock.nextSibling);
      else view.prepend(panel);
    }
    panel.replaceChildren();

    var header = el('div', 'ovyx-launch-admin-head');
    var title = el('div', '');
    title.appendChild(el('div', 'ovyx-launch-kicker', 'OVYX / ACCOUNT USAGE'));
    title.appendChild(el('div', 'ovyx-launch-admin-title', 'AI usage & limits'));
    title.appendChild(el('div', 'ovyx-launch-admin-subtitle', 'Monthly AI usage, daily allowances, and plan access by account.'));
    var refresh = el('button', 'ovyx-launch-refresh', 'Refresh usage');
    refresh.type = 'button';
    refresh.addEventListener('click', function () { loadAdminQuota(true); });
    header.appendChild(title);
    header.appendChild(refresh);
    panel.appendChild(header);

    if (message) {
      panel.appendChild(el('div', 'ovyx-launch-empty', message));
      return;
    }
    var safeUsers = Array.isArray(users) ? users : [];
    var exhausted = safeUsers.filter(function (user) {
      var q = quotaOf(user);
      return q && !q.bypass && q.monthlyExhausted && numeric(q.dailyPromptsRemaining) <= 0;
    }).length;
    var fallback = safeUsers.filter(function (user) {
      var q = quotaOf(user);
      return q && !q.bypass && q.monthlyExhausted && numeric(q.dailyPromptsRemaining) > 0;
    }).length;
    var summary = el('div', 'ovyx-launch-summary');
    addSummaryCard(summary, 'Accounts loaded', safeUsers.length);
    addSummaryCard(summary, 'Builds blocked', exhausted);
    addSummaryCard(summary, 'Using daily fallback', fallback);
    panel.appendChild(summary);

    var list = el('div', 'ovyx-launch-user-list');
    if (!safeUsers.length) list.appendChild(el('div', 'ovyx-launch-empty', 'No account records were found.'));
    else safeUsers.forEach(function (user) { list.appendChild(makeUserRow(user)); });
    panel.appendChild(list);
  }

  var adminLoadPromise = null;
  var adminLastLoadedAt = 0;
  async function loadAdminQuota(manual) {
    if (adminLoadPromise) return adminLoadPromise;
    var view = document.getElementById('view-admin-users');
    if (!view) return;
    var state = window.KernelState && window.KernelState.activeView;
    var visible = !view.classList.contains('hidden') || state === 'admin-users';
    if (!visible && !manual) return;
    if (!manual && Date.now() - adminLastLoadedAt < 45000) return;
    adminLastLoadedAt = Date.now();

    adminLoadPromise = (async function () {
      var headers = await authHeaders();
      if (!headers) {
        if (manual) launchToast('Sign in again to view account usage.', 'error');
        return;
      }
      var response = await fetch('/api/admin/users', {
        method: 'GET', headers: headers, credentials: 'same-origin', cache: 'no-store'
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok || payload.ok !== true) {
        var message = payload.error || (response.status === 403 ? 'Admin access is required to view user quotas.' : 'Your AI usage could not be loaded right now. Please try again.');
        renderAdminQuota([], message);
        if (manual) launchToast(message, 'error');
        return;
      }
      renderAdminQuota(payload.users || []);
      if (manual) launchToast('AI usage updated.', 'success');
    })().catch(function (error) {
      renderAdminQuota([], error && error.message || 'Unable to load AI usage.');
      if (manual) launchToast(error && error.message || 'Unable to load AI usage.', 'error');
    }).finally(function () { adminLoadPromise = null; });
    return adminLoadPromise;
  }

  function patchFetchForAIErrorToasts() {
    if (window.fetch.__ovyxLaunchFetch) return;
    var originalFetch = window.fetch.bind(window);
    var wrapped = async function (input, init) {
      var response = await originalFetch(input, init);
      try {
        var rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input && input.url;
        var url = new URL(rawUrl, window.location.href);
        if (!response.ok && /^\/api\/(?:ai\/assistant|ai\/gateway|generate)$/.test(url.pathname)) {
          response.clone().json().then(function (payload) {
            var code = String(payload && payload.code || '');
            var message = String(payload && (payload.error || payload.message) || '');
            if (code === 'DAILY_RATION_EXHAUSTED') {
              launchToast(message || 'Your daily AI allowance is exhausted. Wait for the daily reset or upgrade your plan.', 'error');
            } else if (code === 'AI_PROVIDER_NOT_CONFIGURED' || code === 'AI_PROVIDER_UNAVAILABLE') {
              launchToast(message || 'This AI option is not available right now. Try OVYX Auto or choose another option.', 'error');
            } else if (code === 'QUOTA_FINALIZE_FAILED' || code === 'QUOTA_STATE_CONFLICT') {
              launchToast(message || 'We could not update your AI usage. Try again before starting another build.', 'error');
            }
          }).catch(function () {});
        }
      } catch (_) {}
      return response;
    };
    wrapped.__ovyxLaunchFetch = true;
    window.fetch = wrapped;
  }

  function maybeLoadAdminQuota() {
    var view = document.getElementById('view-admin-users');
    var state = window.KernelState && window.KernelState.activeView;
    if (view && (!view.classList.contains('hidden') || state === 'admin-users')) loadAdminQuota(false);
  }

  function initialize() {
    installStyle();
    watchLegacyStacks();
    ['showToast', 'notify', 'toast'].forEach(replaceToastFunction);
    patchFetchForAIErrorToasts();
    maybeLoadAdminQuota();

    document.addEventListener('click', function (event) {
      var target = event.target instanceof Element ? event.target.closest('[data-admin-route], [data-view], button[onclick*="admin-users"]') : null;
      if (target && (target.getAttribute('data-admin-route') === 'admin-users' || target.getAttribute('data-view') === 'admin-users' || String(target.getAttribute('onclick') || '').includes('admin-users'))) {
        window.setTimeout(function () { loadAdminQuota(false); }, 80);
      }
    }, true);

    new MutationObserver(function () { maybeLoadAdminQuota(); }).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style']
    });
    window.setInterval(function () { loadPersonalQuota(); maybeLoadAdminQuota(); }, 45000);
    try {
      if (window.firebase && typeof window.firebase.auth === 'function') {
        window.firebase.auth().onAuthStateChanged(function () {
          window.setTimeout(maybeLoadAdminQuota, 250);
          window.setTimeout(loadPersonalQuota, 250);
        });
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();