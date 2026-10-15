(function () {
  'use strict';
  if (window.__OVYX_SETTINGS_RELIABILITY_V1__) return;
  window.__OVYX_SETTINGS_RELIABILITY_V1__ = true;

  const PROFILE_ENDPOINT = '/api/settings/profile';
  const NOTIFICATIONS_ENDPOINT = '/api/settings/preferences';
  const QUOTA_ENDPOINT = '/api/tokens/balance';
  const NOTIFICATION_DEFAULTS = Object.freeze({
    projectActivity: true,
    generationCompleted: true,
    deploymentStatus: true,
    connectionFailures: true,
    aiUsageWarnings: true,
    billing: true,
    emailProductUpdates: true,
    emailSecurityAlerts: true
  });
  const TOGGLE_MAP = Object.freeze({
    'set-autosave': 'autosave',
    'set-confirm-delete': 'confirmDelete',
    'set-notify-build': 'notifyBuild',
    'set-notify-fail': 'notifyFail',
    'set-notify-usage': 'notifyUsage',
    'set-inspector': 'inspector',
    'set-live-preview': 'livePreview',
    'set-ai-safe': 'aiSafe'
  });
  const $ = id => document.getElementById(id);
  const notify = (message, kind) => {
    try {
      const fn = window.showToast || window.toast;
      if (typeof fn === 'function') fn(message, kind || 'info');
    } catch (_) {}
  };
  const safeJson = value => {
    try { return JSON.parse(value || '{}') || {}; } catch (_) { return {}; }
  };
  const currentUser = () => {
    try { return window.firebase && window.firebase.auth && window.firebase.auth().currentUser || null; }
    catch (_) { return null; }
  };
  async function api(path, options) {
    options = options || {};
    const user = currentUser();
    if (!user) throw Object.assign(new Error('Sign in to change account settings.'), { code: 'AUTH_REQUIRED' });
    const token = await user.getIdToken(false);
    const headers = Object.assign({
      Accept: 'application/json',
      Authorization: 'Bearer ' + token
    }, options.headers || {});
    const response = await fetch(path, Object.assign({
      credentials: 'same-origin',
      cache: 'no-store',
      headers
    }, options, { headers: headers }));
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw Object.assign(new Error(data.message || data.error || ('Request failed (HTTP ' + response.status + ').')), {
        code: data.code || 'SETTINGS_REQUEST_FAILED',
        status: response.status
      });
    }
    return data;
  }
  const jsonOptions = (method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  function settingsState() {
    const legacy = safeJson(localStorage.getItem('ovyx.settings.toggles.v34'));
    const integrity = safeJson(localStorage.getItem('ovyx.settings.integrity.v83'));
    return Object.assign({
      autosave: true, confirmDelete: true, notifyBuild: true, notifyFail: true,
      notifyUsage: true, inspector: true, livePreview: true, aiSafe: true
    }, legacy, integrity);
  }
  function writeSettingsState(patch) {
    const previous = settingsState();
    const next = Object.assign({}, previous, patch || {});
    try { localStorage.setItem('ovyx.settings.toggles.v34', JSON.stringify(next)); } catch (_) {}
    try {
      const old = safeJson(localStorage.getItem('ovyx.settings.integrity.v83'));
      localStorage.setItem('ovyx.settings.integrity.v83', JSON.stringify(Object.assign({}, old, next)));
    } catch (_) {}
    applySettingEffects(next, previous);
    syncToggleControls(next);
    return next;
  }
  let livePreviewOriginal = null;
  function installLivePreviewBridge() {
    const studio = window.WebStudio;
    if (!studio || typeof studio.renderPreview !== 'function' || studio.renderPreview.__ovyxSettingsReliabilityV1) return;
    livePreviewOriginal = studio.renderPreview.bind(studio);
    const wrapped = function () {
      if (settingsState().livePreview === false && window.__OVYX_FORCE_LIVE_PREVIEW__ !== true) {
        const frame = $('ws-canvas-iframe');
        if (frame) frame.dataset.ovyxLivePreviewPaused = 'true';
        const status = $('ws-preview-url');
        if (status && !status.dataset.ovyxPreviewPauseNote) {
          status.dataset.ovyxPreviewPauseNote = 'true';
          status.title = 'Automatic preview refresh is paused in Settings → Workspace.';
        }
        return false;
      }
      const result = livePreviewOriginal.apply(this, arguments);
      const frame = $('ws-canvas-iframe');
      if (frame) frame.dataset.ovyxLivePreviewPaused = 'false';
      return result;
    };
    wrapped.__ovyxSettingsReliabilityV1 = true;
    studio.renderPreview = wrapped;
    window.OVYXSettingsLivePreview = {
      refreshNow: function () {
        window.__OVYX_FORCE_LIVE_PREVIEW__ = true;
        try { return studio.renderPreview(); }
        finally { window.__OVYX_FORCE_LIVE_PREVIEW__ = false; }
      }
    };
  }
  function applySettingEffects(state, previous) {
    try {
      document.querySelectorAll('#app-node-inspector').forEach(el => {
        el.style.display = state.inspector === false ? 'none' : '';
      });
    } catch (_) {}
    try {
      const runtime = window.OVYXRuntimeSession;
      if (runtime && typeof runtime.save === 'function') runtime.save();
    } catch (_) {}
    try {
      installLivePreviewBridge();
      const frame = $('ws-canvas-iframe');
      if (frame) frame.dataset.ovyxLivePreviewPaused = state.livePreview === false ? 'true' : 'false';
      if (previous && previous.livePreview === false && state.livePreview !== false &&
          window.WebStudio && typeof window.WebStudio.renderPreview === 'function') {
        window.WebStudio.renderPreview();
      }
    } catch (_) {}
    try {
      const key = window.OVYXAIStorageKey ? window.OVYXAIStorageKey() : 'ovyx.ai.preferences.v1';
      const prefs = safeJson(localStorage.getItem(key));
      prefs.confirmDestructive = state.aiSafe !== false;
      localStorage.setItem(key, JSON.stringify(prefs));
      if (window.OVYXAI) window.OVYXAI.confirmDestructive = prefs.confirmDestructive;
    } catch (_) {}
  }
  function syncToggleControls(state) {
    Object.keys(TOGGLE_MAP).forEach(id => {
      const button = $(id);
      const key = TOGGLE_MAP[id];
      if (button && key in state) button.setAttribute('aria-checked', String(state[key] !== false));
    });
  }
  function addStatus(panel, id, text) {
    if (!panel) return null;
    let el = panel.querySelector('#' + id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'ovyx-settings-action-status';
      el.setAttribute('role', 'status');
      el.style.cssText = 'padding:9px 14px;color:var(--ov-muted,#858990);font:600 9px/1.5 JetBrains Mono,monospace;overflow-wrap:anywhere';
      panel.appendChild(el);
    }
    if (text) el.textContent = text;
    return el;
  }
  async function loadProfile() {
    const panel = document.querySelector('[data-settings-panel="profile"]');
    if (!panel || !currentUser()) return;
    const status = addStatus(panel, 'ovyx-profile-server-status', 'Loading saved profile from the server…');
    try {
      const data = await api(PROFILE_ENDPOINT);
      const profile = data.profile || {};
      const name = $('set-profile-name');
      const workspace = $('set-workspace-name');
      if (name && document.activeElement !== name && profile.displayName) name.value = profile.displayName;
      if (workspace && document.activeElement !== workspace && profile.workspaceName) workspace.value = profile.workspaceName;
      if (status) status.textContent = data.updatedAt ? 'Server profile last saved ' + new Date(data.updatedAt).toLocaleString() : 'No server profile saved yet.';
    } catch (error) {
      if (status) status.textContent = 'Server profile unavailable: ' + (error.message || 'request failed');
    }
  }
  async function saveProfile(button) {
    const panel = document.querySelector('[data-settings-panel="profile"]');
    const status = addStatus(panel, 'ovyx-profile-server-status', 'Saving account profile…');
    const name = $('set-profile-name') || $('set-profile-name-legacy');
    const workspace = $('set-workspace-name') || $('set-workspace-name-legacy');
    const displayName = String(name && name.value || '').trim();
    const workspaceName = String(workspace && workspace.value || 'Creative Workspace').trim();
    if (!displayName) throw new Error('Display name cannot be empty.');
    if (displayName.length > 60 || workspaceName.length > 60) throw new Error('Names must be 60 characters or fewer.');
    const original = button && button.textContent;
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const data = await api(PROFILE_ENDPOINT, jsonOptions('PUT', { profile: { displayName, workspaceName } }));
      const saved = data.profile || { displayName, workspaceName };
      const key = 'ovyx.profile.v2.user.' + String(currentUser().uid);
      const old = safeJson(localStorage.getItem(key));
      try { localStorage.setItem(key, JSON.stringify(Object.assign({}, old, { name: saved.displayName, workspace: saved.workspaceName }))); } catch (_) {}
      document.querySelectorAll('#settings-display-name-text,#sidebar-user-display-name').forEach(el => { el.textContent = saved.displayName; });
      const heading = $('profile-name-heading');
      if (heading) heading.textContent = saved.displayName;
      const label = $('sidebar-workspace-label');
      if (label) label.textContent = saved.workspaceName;
      const user = currentUser();
      if (user && user.displayName !== saved.displayName && typeof user.updateProfile === 'function') {
        try { await user.updateProfile({ displayName: saved.displayName }); }
        catch (error) { console.warn('[OVYX Settings] Firebase displayName sync failed; server profile remains saved.', String(error && error.message || error).slice(0, 120)); }
      }
      if (status) status.textContent = 'Verified on server at ' + (data.updatedAt || new Date().toISOString());
      notify('Profile saved to your OVYX account.', 'success');
      return data;
    } catch (error) {
      if (status) status.textContent = 'Save failed: ' + (error.message || 'server did not confirm the write');
      throw error;
    } finally {
      if (button) { button.disabled = false; button.textContent = original || 'Save Profile'; }
    }
  }
  let notificationDraft = null;
  let notificationLoadRevision = 0;
  function notificationPanel() { return document.querySelector('[data-settings-panel="notifications"]'); }
  function notificationStorageKey() {
    const user = currentUser();
    return user && user.uid ? 'ovyx.notifications.v1.user.' + String(user.uid) : 'ovyx.notifications.v1.guest';
  }
  function renderNotificationState(panel, values) {
    if (!panel) return;
    notificationDraft = Object.assign({}, NOTIFICATION_DEFAULTS, values || {});
    panel.querySelectorAll('[data-notify]').forEach(button => {
      const key = button.dataset.notify;
      if (key in notificationDraft) button.setAttribute('aria-checked', String(!!notificationDraft[key]));
    });
  }
  async function loadNotifications() {
    const panel = notificationPanel();
    const revision = ++notificationLoadRevision;
    if (!currentUser()) {
      notificationDraft = Object.assign({}, NOTIFICATION_DEFAULTS);
      window.OVYXSettingsNotificationPreferences = Object.assign({}, notificationDraft);
      renderNotificationState(panel, notificationDraft);
      if (panel) {
        const signedOutStatus = addStatus(panel, 'ovyx-notification-server-status', 'Sign in to load account notification preferences.');
        if (signedOutStatus) signedOutStatus.textContent = 'Sign in to load account notification preferences.';
      }
      return;
    }
    const status = panel ? addStatus(panel, 'ovyx-notification-server-status', 'Loading notification preferences…') : null;
    try {
      const data = await api(NOTIFICATIONS_ENDPOINT);
      if (revision !== notificationLoadRevision) return;
      renderNotificationState(panel, data.notifications || NOTIFICATION_DEFAULTS);
      window.OVYXSettingsNotificationPreferences = Object.assign({}, notificationDraft);
      try { localStorage.setItem(notificationStorageKey(), JSON.stringify(notificationDraft)); } catch (_) {}
      if (status) status.textContent = 'Preferences loaded from your account. Email delivery is not triggered by these preference switches.';
    } catch (error) {
      notificationDraft = Object.assign({}, NOTIFICATION_DEFAULTS, safeJson(localStorage.getItem(notificationStorageKey())));
      window.OVYXSettingsNotificationPreferences = Object.assign({}, notificationDraft);
      renderNotificationState(panel, notificationDraft);
      if (status) status.textContent = 'Could not reach the preference service: ' + (error.message || 'request failed') + '. Showing this account’s last saved browser copy.';
    }
  }
  async function saveNotifications(button, reset) {
    const panel = notificationPanel();
    const status = addStatus(panel, 'ovyx-notification-server-status', 'Saving notification preferences…');
    const next = reset ? Object.assign({}, NOTIFICATION_DEFAULTS) : Object.assign({}, notificationDraft || NOTIFICATION_DEFAULTS);
    if (button) { button.disabled = true; button.dataset.originalText = button.textContent; button.textContent = 'Saving…'; }
    try {
      const data = await api(NOTIFICATIONS_ENDPOINT, jsonOptions('PUT', { notifications: next }));
      renderNotificationState(panel, data.notifications || next);
      window.OVYXSettingsNotificationPreferences = Object.assign({}, notificationDraft);
      try { localStorage.setItem(notificationStorageKey(), JSON.stringify(notificationDraft)); } catch (_) {}
      if (status) status.textContent = 'Server confirmed account preferences saved. Email options are stored preferences; delivery still requires a configured mail channel.';
      notify(reset ? 'Notification preferences reset and saved to your account.' : 'Notification preferences saved to your account.', 'success');
    } catch (error) {
      if (status) status.textContent = 'Save failed: ' + (error.message || 'server did not confirm the write');
      notify(error.message || 'Notification preferences were not saved.', 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = button.dataset.originalText || (reset ? 'Reset' : 'Save Notification Preferences'); delete button.dataset.originalText; }
    }
  }
  async function loadUsage() {
    const panel = document.querySelector('[data-settings-panel="usage"]');
    const meter = $('set-token-meter');
    if (!panel || !meter || !currentUser()) {
      if (meter && !currentUser()) meter.textContent = 'Sign in to load usage';
      return;
    }
    meter.textContent = 'Loading server quota…';
    try {
      const data = await api(QUOTA_ENDPOINT);
      const limit = Number(data.monthlyLimit || data.monthlyLimitTokens || data.monthly_limit || 0);
      const remaining = Number(data.current_monthly_tokens ?? data.baseRemaining ?? data.remainingTokens ?? 0);
      if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(remaining)) throw new Error('The quota service returned invalid values.');
      const used = Math.max(0, limit - Math.max(0, remaining));
      meter.textContent = used.toLocaleString() + ' used / ' + limit.toLocaleString();
      meter.title = Math.max(0, remaining).toLocaleString() + ' monthly tokens remaining. Source: authenticated OVYX quota API.';
      const group = meter.closest('.ovyx-pref-group');
      let detail = group && group.querySelector('#ovyx-usage-server-detail');
      if (group && !detail) {
        detail = document.createElement('div');
        detail.id = 'ovyx-usage-server-detail';
        detail.className = 'ovyx-empty-state';
        group.appendChild(detail);
      }
      if (detail) detail.textContent = 'Plan: ' + String(data.plan || 'current').toUpperCase() + ' · Remaining: ' + Math.max(0, remaining).toLocaleString() + ' tokens · Daily prompts remaining: ' + Number(data.daily_prompts_allowance || 0).toLocaleString();
    } catch (error) {
      meter.textContent = 'Usage unavailable';
      meter.title = error.message || '';
    }
  }
  async function deleteAccount(button) {
    const user = currentUser();
    if (!user) throw new Error('Sign in to delete your account.');
    const confirmed = window.confirm('Delete your OVYX account and its cloud project data permanently? This cannot be undone.');
    if (!confirmed) return;
    const original = button && button.textContent;
    if (button) { button.disabled = true; button.textContent = 'Deleting…'; }
    try {
      const tokenResult = await user.getIdTokenResult(true);
      const authTime = Number(tokenResult && tokenResult.claims && tokenResult.claims.auth_time || 0);
      if (!authTime || Date.now() / 1000 - authTime > 240) {
        throw Object.assign(new Error('For security, sign in again before deleting your account, then complete deletion within four minutes.'), { code: 'REAUTH_REQUIRED' });
      }
      const token = await user.getIdToken(false);
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + token,
          'X-OVYX-Account-Deletion': 'CONFIRM'
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true || data.deleted !== true) {
        throw Object.assign(new Error(data.error || data.message || 'The server did not confirm account data cleanup.'), { code: data.code || 'ACCOUNT_DELETE_FAILED', status: response.status });
      }
      await user.delete();
      try { await window.firebase.auth().signOut(); } catch (_) {}
      try {
        const prefix = 'ovyx.profile.v2.user.' + String(user.uid);
        localStorage.removeItem(prefix);
        localStorage.removeItem('ovyx.profile.v1');
        localStorage.removeItem('ovyx.brand.v1.' + encodeURIComponent(String(user.email || '').trim().toLowerCase()));
        localStorage.removeItem('ovyx.ai.preferences.v1.user.' + String(user.uid));
        localStorage.removeItem('ovyx.notifications.v1.user.' + String(user.uid));
        localStorage.removeItem('ovyx.notifications.v1');
        localStorage.removeItem('ovyx.runtime.session.v4');
        localStorage.removeItem('ovyx.settings.integrity.v83');
        localStorage.removeItem('ovyx.settings.toggles.v34');
      } catch (_) {}
      window.__OVYX_AUTH_STATE_READY__ = false;
      notify('Account and server-side project data deleted.', 'success');
      window.Router && window.Router.go && window.Router.go('home');
      window.OVYXMasterAuth && window.OVYXMasterAuth.openAuth && window.OVYXMasterAuth.openAuth();
    } catch (error) {
      notify(error.message || 'Account deletion failed.', 'error');
      throw error;
    } finally {
      if (button) { button.disabled = false; button.textContent = original || 'Delete account'; }
    }
  }
  function shouldShowSettingsToast(args) {
    const preferences = Object.assign({}, NOTIFICATION_DEFAULTS,
      window.OVYXSettingsNotificationPreferences || safeJson(localStorage.getItem(notificationStorageKey())));
    const message = args.map(value => typeof value === 'string' ? value : '').join(' ').slice(0, 2000);
    const kinds = args.filter(value => typeof value === 'string').map(value => value.toLowerCase());
    const isError = kinds.includes('error');
    const categories = [
      ['projectActivity', /\b(?:project (?:saved|created|duplicated|updated|deleted|renamed)|saved project|project activity)\b/i],
      ['generationCompleted', /\b(?:generation|build|AI build)\s+(?:completed|finished|succeeded)\b|\b(?:live )?AI generation completed\b/i],
      ['deploymentStatus', /\bdeploy(?:ment)?\b.*\b(?:started|complete|completed|succeeded|failed|status|ready)\b|\b(?:deployment|deploy)\s+(?:was )?(?:successful|failed)\b/i],
      ['connectionFailures', /\b(?:connection|provider|backend|service|AI brain|GitHub|Cloudflare)\b.*\b(?:failed|unavailable|could not|couldn't|error|timed out|unreachable)\b/i],
      ['aiUsageWarnings', /\b(?:token|quota|usage|allocation)\b.*\b(?:low|remaining|limit|exhausted|ration|warning|approaching|left)\b/i],
      ['billing', /\b(?:payment|billing|subscription|token booster)\b/i]
    ];
    for (const [key, pattern] of categories) {
      if (preferences[key] === false && pattern.test(message)) {
        if (key === 'connectionFailures' || !isError) return false;
      }
    }
    return true;
  }
  function installNotificationToastFilters() {
    ['showToast', 'toast'].forEach(name => {
      const original = window[name];
      if (typeof original !== 'function' || original.__ovyxNotificationPreferenceV1) return;
      const wrapped = function () {
        const args = Array.from(arguments);
        if (!shouldShowSettingsToast(args)) return;
        return original.apply(this, args);
      };
      wrapped.__ovyxNotificationPreferenceV1 = true;
      window[name] = wrapped;
    });
  }
  function installProfileActions() {
    document.addEventListener('click', function (event) {
      const button = event.target && event.target.closest && event.target.closest('#profile-save-action, [data-save-profile]');
      if (!button) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      saveProfile(button).catch(error => notify(error.message || 'Profile save failed.', 'error'));
    }, true);
    document.addEventListener('click', function (event) {
      const button = event.target && event.target.closest && event.target.closest('#ovyx-security-delete, #profile-delete-action');
      if (!button) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      deleteAccount(button).catch(() => {});
    }, true);
  }
  function installNotificationActions() {
    document.addEventListener('click', function (event) {
      const toggle = event.target && event.target.closest && event.target.closest('[data-settings-panel="notifications"] [data-notify]');
      if (!toggle) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const key = toggle.dataset.notify;
      if (!notificationDraft) notificationDraft = Object.assign({}, NOTIFICATION_DEFAULTS, safeJson(localStorage.getItem(notificationStorageKey())));
      if (!(key in notificationDraft)) return;
      notificationDraft[key] = !notificationDraft[key];
      toggle.setAttribute('aria-checked', String(!!notificationDraft[key]));
      const panel = notificationPanel();
      const status = addStatus(panel, 'ovyx-notification-server-status', 'Unsaved change. Choose Save Notification Preferences to apply it to your account.');
      if (status) status.textContent = 'Unsaved change. Save to apply this preference to your account. Email options do not send emails by themselves.';
    }, true);
    document.addEventListener('click', function (event) {
      const save = event.target && event.target.closest && event.target.closest('#notify-save');
      const reset = event.target && event.target.closest && event.target.closest('#notify-reset');
      const button = save || reset;
      if (!button) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      saveNotifications(button, !!reset);
    }, true);
  }
  function installWorkspaceToggleActions() {
    document.addEventListener('click', function (event) {
      const button = event.target && event.target.closest && event.target.closest('.ovyx-toggle');
      if (!button || !(button.id in TOGGLE_MAP)) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const key = TOGGLE_MAP[button.id];
      const state = settingsState();
      state[key] = state[key] === false;
      const next = writeSettingsState({ [key]: state[key] });
      notify((key === 'aiSafe' ? 'Safe generation' : key.replace(/([A-Z])/g, ' $1')) + (next[key] ? ' enabled.' : ' disabled.'), 'success');
    }, true);
  }
  const MODELS_BY_PROVIDER = Object.freeze({
    gemini: ['gemini-3.8-flash'],
    anthropic: ['claude-opus-5'],
    deepseek: ['deepseek-flash'],
    openai: ['gpt-6.1-sol']
  });
  function syncModelOptions(provider, panel) {
    panel = panel || document.querySelector('[data-settings-panel="ai"]');
    if (!panel) return;
    const model = panel.querySelector('#set-ai-model');
    if (!model) return;
    const supported = MODELS_BY_PROVIDER[String(provider || 'gemini').toLowerCase()] || [];
    Array.from(model.options).forEach(option => {
      option.hidden = !!option.dataset.provider && option.dataset.provider !== String(provider || 'gemini').toLowerCase();
    });
    if (model.value !== 'automatic' && !supported.includes(model.value)) model.value = 'automatic';
  }
  function syncAISettingsControls() {
    const panel = document.querySelector('[data-settings-panel="ai"]');
    if (!panel) return;
    const key = window.OVYXAIStorageKey ? window.OVYXAIStorageKey() : 'ovyx.ai.preferences.v1';
    const prefs = safeJson(localStorage.getItem(key));
    const values = {
      'set-provider': prefs.provider || 'gemini',
      'set-ai-routing': prefs.routing || 'automatic',
      'set-ai-fallback': prefs.fallback || 'next',
      'set-ai-context-limit': prefs.contextLimit || 'automatic',
      'set-ai-budget': prefs.budget || 'automatic'
    };
    Object.keys(values).forEach(id => {
      const select = panel.querySelector('#' + id);
      if (select && Array.from(select.options).some(option => option.value === values[id])) select.value = values[id];
    });
    syncModelOptions(values['set-provider'], panel);
    const model = panel.querySelector('#set-ai-model');
    const preferredModel = String(prefs.model || 'automatic');
    if (model && Array.from(model.options).some(option => option.value === preferredModel)) {
      model.value = preferredModel;
      syncModelOptions(values['set-provider'], panel);
    }
  }
  function limitContextFiles(files, maxChars) {
    if (!files || typeof files !== 'object') return files;
    const output = Array.isArray(files) ? [] : {};
    let remaining = maxChars;
    const entries = Array.isArray(files) ? files.map((value, index) => [String(index), value]) : Object.entries(files);
    for (const [path, value] of entries) {
      if (remaining <= 0) break;
      if (typeof value === 'string') {
        output[path] = value.slice(0, remaining);
        remaining -= output[path].length;
      } else if (value && typeof value === 'object') {
        const clone = Object.assign({}, value);
        const field = ['content','text','source','code'].find(key => typeof clone[key] === 'string');
        if (field) {
          clone[field] = clone[field].slice(0, remaining);
          remaining -= clone[field].length;
        }
        output[path] = clone;
      } else {
        output[path] = value;
      }
    }
    return output;
  }
  function installAISettingsBridge() {
    window.addEventListener('ovyx-settings-rendered', syncAISettingsControls);
    document.addEventListener('change', function (event) {
      const target = event.target;
      if (!target || target.id !== 'set-provider') return;
      const panel = target.closest('[data-settings-panel="ai"]');
      syncModelOptions(target.value, panel);
    }, true);
    window.addEventListener('click', function (event) {
      const button = event.target && event.target.closest && event.target.closest('#set-ai-save');
      if (!button) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      try {
        const panel = document.querySelector('[data-settings-panel="ai"]');
        const key = window.OVYXAIStorageKey ? window.OVYXAIStorageKey() : 'ovyx.ai.preferences.v1';
        const prefs = Object.assign({
          mode: 'balanced', model: 'automatic', provider: 'gemini',
          explain: true, preserve: true, confirmDestructive: false,
          contextFiles: true, contextPage: true, contextGithub: true,
          routing: 'automatic', fallback: 'next', contextLimit: 'automatic', budget: 'automatic'
        }, safeJson(localStorage.getItem(key)));
        prefs.provider = String(panel && panel.querySelector('#set-provider') && panel.querySelector('#set-provider').value || 'gemini');
        const selectedModel = String(panel && panel.querySelector('#set-ai-model') && panel.querySelector('#set-ai-model').value || 'automatic');
        prefs.model = selectedModel === 'automatic' || (MODELS_BY_PROVIDER[prefs.provider] || []).includes(selectedModel) ? selectedModel : 'automatic';
        if (selectedModel !== prefs.model) notify('The model override did not match the selected provider; Automatic model selection was saved instead.', 'info');
        prefs.routing = String(panel && panel.querySelector('#set-ai-routing') && panel.querySelector('#set-ai-routing').value || 'automatic');
        prefs.fallback = String(panel && panel.querySelector('#set-ai-fallback') && panel.querySelector('#set-ai-fallback').value || 'next');
        prefs.contextLimit = String(panel && panel.querySelector('#set-ai-context-limit') && panel.querySelector('#set-ai-context-limit').value || 'automatic');
        prefs.budget = String(panel && panel.querySelector('#set-ai-budget') && panel.querySelector('#set-ai-budget').value || 'automatic');
        ['explain','preserve','confirmDestructive','contextFiles','contextPage','contextGithub'].forEach(name => {
          const input = panel && panel.querySelector('[data-ai-pref="' + name + '"]');
          if (input) prefs[name] = !!input.checked;
        });
        localStorage.setItem(key, JSON.stringify(prefs));
        window.OVYXAI = Object.assign({}, window.OVYXAI || {}, prefs);
        const status = addStatus(panel, 'ovyx-ai-preference-status', 'AI preferences saved on this device and account browser.');
        if (status) status.textContent = 'Preferences saved on this device. Provider selection will be used when automatic routing is requested.';
        notify('AI preferences saved.', 'success');
      } catch (error) {
        notify(error.message || 'AI preferences could not be saved.', 'error');
      }
    }, true);
    document.addEventListener('click', function (event) {
      const button = event.target && event.target.closest && event.target.closest('#set-ai-reset');
      if (!button) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      try {
        const key = window.OVYXAIStorageKey ? window.OVYXAIStorageKey() : 'ovyx.ai.preferences.v1';
        localStorage.removeItem(key);
        const settings = window.OVYXSettings;
        if (settings && typeof settings.show === 'function') settings.show('ai');
        notify('AI preferences reset to defaults.', 'info');
      } catch (error) { notify(error.message || 'AI preferences could not be reset.', 'error'); }
    }, true);
    const service = window.OVYXAIService;
    if (service && typeof service.generate === 'function' && !service.__ovyxSettingsPreferencesV1) {
      const original = service.generate.bind(service);
      service.generate = async function (payload, options) {
        payload = Object.assign({}, payload || {});
        const key = window.OVYXAIStorageKey ? window.OVYXAIStorageKey() : 'ovyx.ai.preferences.v1';
        const prefs = Object.assign({}, safeJson(localStorage.getItem(key)), window.OVYXAI || {});
        const requestedProvider = String(payload.provider || '').trim().toLowerCase();
        const validRouting = ['automatic','preferred-first','provider-priority'].includes(String(prefs.routing || 'automatic'))
          ? String(prefs.routing || 'automatic') : 'automatic';
        payload.providerRouting = validRouting;
        if ((!payload.model || String(payload.model).toLowerCase() === 'automatic') && prefs.model && String(prefs.model).toLowerCase() !== 'automatic') {
          payload.model = String(prefs.model);
          // A concrete model is provider-specific. Pin this request to its chosen provider
          // rather than sending a Claude model ID to Gemini (or vice versa).
          if ((!requestedProvider || requestedProvider === 'automatic' || requestedProvider === 'auto') && prefs.provider) {
            payload.provider = String(prefs.provider).toLowerCase();
          }
        }
        if ((!requestedProvider || requestedProvider === 'automatic' || requestedProvider === 'auto') && prefs.provider) {
          payload.preferredProvider = String(prefs.provider).toLowerCase();
          if (prefs.fallback === 'stop') payload.provider = String(prefs.provider).toLowerCase();
        }
        const instructions = [];
        if (prefs.mode === 'fast') instructions.push('Generation preference: prioritize concise, low-latency iterations.');
        if (prefs.mode === 'quality') instructions.push('Generation preference: prioritize thoroughness, completeness and careful validation.');
        if (prefs.explain) instructions.push('Briefly explain significant changes that are actually completed.');
        if (prefs.preserve) instructions.push('Preserve existing project structure and unrelated working code unless the user explicitly requests a restructure.');
        if (prefs.routing && prefs.routing !== 'automatic') instructions.push('Preferred routing strategy: ' + String(prefs.routing) + '.');
        if (prefs.fallback === 'stop') instructions.push('When the selected provider fails, report the failure rather than pretending success.');
        if (prefs.contextFiles === false) {
          delete payload.files;
          if (payload.project && typeof payload.project === 'object') {
            payload.project = Object.assign({}, payload.project);
            delete payload.project.files;
            delete payload.project.fileTree;
          }
          if (payload.context) {
            const context = Object.assign({}, payload.context);
            delete context.files; delete context.projectFiles; delete context.fileTree;
            if (context.project && typeof context.project === 'object') {
              context.project = Object.assign({}, context.project);
              delete context.project.files; delete context.project.fileTree;
            }
            payload.context = context;
          }
        }
        if (prefs.contextPage === false) {
          delete payload.page; delete payload.currentPage; delete payload.activePage;
          if (payload.context) {
            const context = Object.assign({}, payload.context);
            delete context.page; delete context.currentPage; delete context.section; delete context.activePage;
            payload.context = context;
          }
        }
        const contextLimit = prefs.contextLimit === 'conservative' ? 120000 : prefs.contextLimit === 'expanded' ? 650000 : 350000;
        if (prefs.contextFiles !== false) {
          if (payload.files && typeof payload.files === 'object') payload.files = limitContextFiles(payload.files, contextLimit);
          if (payload.context && payload.context.files && typeof payload.context.files === 'object') {
            payload.context = Object.assign({}, payload.context, { files: limitContextFiles(payload.context.files, contextLimit) });
          }
          if (payload.project && typeof payload.project === 'object' && payload.project.files && typeof payload.project.files === 'object') {
            payload.project = Object.assign({}, payload.project, { files: limitContextFiles(payload.project.files, contextLimit) });
          }
          if (payload.context && payload.context.project && typeof payload.context.project === 'object' && payload.context.project.files && typeof payload.context.project.files === 'object') {
            payload.context = Object.assign({}, payload.context, { project: Object.assign({}, payload.context.project, { files: limitContextFiles(payload.context.project.files, contextLimit) }) });
          }
        }
        if (prefs.budget === 'efficient' && !Number.isFinite(Number(payload.maxTokens))) payload.maxTokens = 4096;
        if (prefs.budget === 'maximum' && !Number.isFinite(Number(payload.maxTokens))) payload.maxTokens = 16000;
        if (prefs.contextGithub === false) {
          payload.contextGithub = false;
          if (payload.context && payload.context.github) {
            const context = Object.assign({}, payload.context);
            delete context.github;
            payload.context = context;
          }
        }
        const prompt = String(payload.prompt || payload.message || '');
        if (prefs.confirmDestructive && /\b(delete|remove|overwrite|replace all|clear all|reset all|drop table|destroy)\b/i.test(prompt)) {
          if (!window.confirm('This request may make destructive changes to project data or files. Continue with the AI request?')) {
            throw Object.assign(new Error('Cancelled before sending the AI request.'), { code: 'USER_CANCELLED' });
          }
        }
        if (instructions.length) payload.system = [String(payload.system || ''), instructions.join('\n')].filter(Boolean).join('\n\n').slice(0, 12000);
        return original(payload, options);
      };
      service.__ovyxSettingsPreferencesV1 = true;
    }
  }
  function applyEditorMode() {
    const state = safeJson(localStorage.getItem('ovyx.settings.integrity.v83'));
    const mode = ['build','plan','ask','fix'].includes(String(state.editorMode || '').toLowerCase())
      ? String(state.editorMode).toLowerCase() : 'build';
    if (state.editorMode !== mode) {
      state.editorMode = mode;
      try { localStorage.setItem('ovyx.settings.integrity.v83', JSON.stringify(state)); } catch (_) {}
    }
    const select = $('set-editor-mode');
    if (select && document.activeElement !== select) select.value = mode;
    const studio = window.WebStudio;
    if (studio && typeof studio.setMode === 'function') studio.setMode(mode);
  }
  function installEditorMode() {
    const select = $('set-editor-mode');
    if (select && !select.dataset.ovyxBound) {
      select.dataset.ovyxBound = '1';
      applyEditorMode();
      select.addEventListener('change', function () {
        const mode = String(select.value || 'build').toLowerCase();
        if (!['build','plan','ask','fix'].includes(mode)) {
          select.value = 'build';
          return;
        }
        const state = safeJson(localStorage.getItem('ovyx.settings.integrity.v83'));
        state.editorMode = mode;
        try { localStorage.setItem('ovyx.settings.integrity.v83', JSON.stringify(state)); } catch (_) {}
        if (window.WebStudio && typeof window.WebStudio.setMode === 'function') window.WebStudio.setMode(mode);
        notify('Default Web Studio mode saved.', 'success');
      });
    }
  }
  const THEME_LAB_KEY = 'ovyx.theme.lab.v1';
  const THEME_COLOR_RE = /^#[0-9a-f]{6}$/i;

  function themeLabState() {
    const lab = window.OVYXThemeLab;
    if (!lab || !lab.state || !window.ThemeContext) {
      throw new Error('The appearance editor is not ready yet. Reopen Settings and try again.');
    }
    if (!lab.state.customThemes || typeof lab.state.customThemes !== 'object') lab.state.customThemes = {};
    return lab;
  }

  function cleanThemeName(value, fallback = 'My OVYX Theme') {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) || fallback;
  }

  function themeColor(value, fallback) {
    const candidate = String(value || '').trim();
    if (THEME_COLOR_RE.test(candidate)) return candidate.toUpperCase();
    return fallback;
  }

  function themeNameInput() {
    return document.querySelector('#view-settings [data-theme-name]');
  }

  function currentAppearanceAsLabTheme(name) {
    const ctx = window.ThemeContext.get();
    return {
      name: cleanThemeName(name || themeNameInput()?.value || 'My OVYX Theme'),
      bg: themeColor(ctx.backgroundColor, '#050607'),
      panel: themeColor(ctx.cardColor, '#0B0D10'),
      elev: themeColor(ctx.cardColor, '#15100A'),
      text: themeColor(ctx.textColor, '#F8FAFC'),
      secondary: themeColor(ctx.mutedColor, '#C5CBD4'),
      muted: themeColor(ctx.mutedColor, '#737985'),
      accent: themeColor(ctx.accentColor, '#E8B64F'),
      border: themeColor(ctx.borderColor, '#1B222A'),
      mode: ['dark','light','system'].includes(ctx.mode) ? ctx.mode : 'dark',
      density: ['comfortable','balanced','compact'].includes(ctx.density) ? ctx.density : 'balanced',
      scale: ['small','balanced','large'].includes(ctx.scale) ? ctx.scale : 'balanced',
      motion: ['full','reduced','minimal'].includes(ctx.motion) ? ctx.motion : 'full'
    };
  }

  function appearanceFromLabTheme(theme) {
    const base = window.ThemeContext.get();
    return {
      ...base,
      mode: ['dark','light','system'].includes(theme.mode) ? theme.mode : base.mode,
      density: ['comfortable','balanced','compact'].includes(theme.density) ? theme.density : base.density,
      scale: ['small','balanced','large'].includes(theme.scale) ? theme.scale : base.scale,
      motion: ['full','reduced','minimal'].includes(theme.motion) ? theme.motion : base.motion,
      backgroundColor: themeColor(theme.bg || theme.backgroundColor, base.backgroundColor),
      sidebarColor: themeColor(theme.bg || theme.sidebarColor || theme.backgroundColor, base.sidebarColor),
      cardColor: themeColor(theme.panel || theme.cardColor, base.cardColor),
      borderColor: themeColor(theme.border || theme.borderColor, base.borderColor),
      textColor: themeColor(theme.text || theme.textColor, base.textColor),
      mutedColor: themeColor(theme.muted || theme.secondary || theme.mutedColor, base.mutedColor),
      accentColor: themeColor(theme.accent || theme.accentColor, base.accentColor)
    };
  }

  function persistThemeLab(lab) {
    if (Object.keys(lab.state.customThemes).length > 100) {
      throw new Error('The Theme Lab supports up to 100 saved custom themes. Delete one before adding another.');
    }
    localStorage.setItem(THEME_LAB_KEY, JSON.stringify(lab.state));
    try { window.OVYXSettings?.renderThemeCards?.(); } catch (error) {
      console.warn('[OVYX Settings] Theme gallery refresh failed:', String(error?.message || 'unavailable').slice(0, 120));
    }
    document.querySelectorAll('#view-settings .ovyx-theme-card').forEach(card => {
      card.classList.toggle('active', card.dataset.theme === lab.state.active);
    });
  }

  function createThemeId(name) {
    return 'custom_' + String(name || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) + '_' + Date.now().toString(36);
  }

  function saveCurrentAsCustomTheme(name) {
    const lab = themeLabState();
    if (Object.keys(lab.state.customThemes).length >= 100) {
      throw new Error('The Theme Lab supports up to 100 saved custom themes. Delete one before adding another.');
    }
    const theme = currentAppearanceAsLabTheme(name);
    const id = createThemeId(theme.name);
    lab.state.custom = { ...theme };
    lab.state.customThemes[id] = { ...theme };
    lab.state.active = id;
    persistThemeLab(lab);
    if (themeNameInput()) themeNameInput().value = theme.name;
    return id;
  }

  function setThemeActionStatus(message) {
    const panel = document.querySelector('#view-settings [data-settings-panel="appearance"]');
    const status = addStatus(panel, 'ovyx-theme-action-status', message);
    if (status) status.textContent = message;
  }

  function downloadTheme() {
    const ctx = window.ThemeContext.get();
    const name = cleanThemeName(themeNameInput()?.value || 'OVYX Theme');
    const payload = {
      schema: 'ovyx-theme',
      version: 1,
      name,
      mode: ctx.mode,
      density: ctx.density,
      scale: ctx.scale,
      motion: ctx.motion,
      backgroundColor: ctx.backgroundColor,
      sidebarColor: ctx.sidebarColor,
      cardColor: ctx.cardColor,
      borderColor: ctx.borderColor,
      textColor: ctx.textColor,
      mutedColor: ctx.mutedColor,
      accentColor: ctx.accentColor
    };
    const filename = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ovyx-theme';
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename + '.json';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setThemeActionStatus('Theme exported as ' + filename + '.json.');
    notify('Theme exported.', 'success');
  }

  function importThemeFile() {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.json,application/json';
    picker.setAttribute('aria-label', 'Import an OVYX theme JSON file');
    picker.style.display = 'none';
    document.body.appendChild(picker);
    picker.addEventListener('change', async function () {
      try {
        const file = picker.files && picker.files[0];
        if (!file) return;
        if (file.size > 100000) throw new Error('Theme files must be 100 KB or smaller.');
        const parsed = JSON.parse(await file.text());
        const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed.theme && typeof parsed.theme === 'object' ? parsed.theme : parsed)
          : null;
        if (!source) throw new Error('The selected file must contain a JSON theme object.');
        const hasBackground = typeof source.bg === 'string' || typeof source.backgroundColor === 'string';
        const hasText = typeof source.text === 'string' || typeof source.textColor === 'string';
        if (!hasBackground || !hasText) {
          throw new Error('The theme file must include background and text colors.');
        }
        const base = window.ThemeContext.get();
        const imported = {
          name: cleanThemeName(source.name || file.name.replace(/\.json$/i, ''), 'Imported OVYX Theme'),
          mode: ['dark','light','system'].includes(source.mode) ? source.mode : base.mode,
          density: ['comfortable','balanced','compact'].includes(source.density) ? source.density : base.density,
          scale: ['small','balanced','large'].includes(source.scale) ? source.scale : base.scale,
          motion: ['full','reduced','minimal'].includes(source.motion) ? source.motion : base.motion,
          bg: themeColor(source.bg || source.backgroundColor, base.backgroundColor),
          panel: themeColor(source.panel || source.cardColor, base.cardColor),
          elev: themeColor(source.elev || source.cardColor || source.panel, base.cardColor),
          text: themeColor(source.text || source.textColor, base.textColor),
          secondary: themeColor(source.secondary || source.mutedColor, base.mutedColor),
          muted: themeColor(source.muted || source.mutedColor || source.secondary, base.mutedColor),
          accent: themeColor(source.accent || source.accentColor, base.accentColor),
          border: themeColor(source.border || source.borderColor, base.borderColor)
        };
        const lab = themeLabState();
        if (Object.keys(lab.state.customThemes).length >= 100) {
          throw new Error('The Theme Lab supports up to 100 saved custom themes. Delete one before importing another.');
        }
        const id = createThemeId(imported.name);
        lab.state.custom = { ...imported };
        lab.state.customThemes[id] = { ...imported };
        lab.state.active = id;
        persistThemeLab(lab);
        window.ThemeContext.preview(appearanceFromLabTheme(imported));
        if (themeNameInput()) themeNameInput().value = imported.name;
        setThemeActionStatus('Imported "' + imported.name + '" as a preview. Click Save Appearance to keep it.');
        notify('Theme imported. Review it, then choose Save Appearance.', 'success');
      } catch (error) {
        setThemeActionStatus('Import failed: ' + String(error?.message || 'invalid theme file'));
        notify(error?.message || 'Theme import failed.', 'error');
      } finally {
        picker.remove();
      }
    }, { once: true });
    picker.click();
  }

  function handleThemeLabClick(event) {
    // Theme Lab action buttons are wired once by the Settings panel itself.
    // Do not stop the click in capture phase: doing so left Chromium waiting
    // for a click acknowledgement and prevented the real button action.
    const card = event.target?.closest?.('#view-settings .ovyx-theme-card');
    if (!card) return;
    const id = String(card.dataset.theme || '').trim();
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return;
    try {
      const lab = themeLabState();
      lab.state.active = id;
      const selected = lab.state.customThemes[id] || (id === 'custom' ? lab.state.custom : lab.activeTheme());
      if (selected?.name && themeNameInput()) themeNameInput().value = cleanThemeName(selected.name);
      persistThemeLab(lab);
    } catch (error) {
      console.warn('[OVYX Settings] Theme selection state could not be saved:', String(error?.message || 'unavailable').slice(0, 120));
    }
  }

  function handleThemeLabButtonClick(event) {
    const button = event.target?.closest?.('#view-settings [data-theme-save],#view-settings [data-theme-duplicate],#view-settings [data-theme-import],#view-settings [data-theme-export],#view-settings [data-theme-delete],#view-settings [data-theme-reset]');
    if (!button) return;
    event.preventDefault();
    try {
      const lab = themeLabState();
      if (button.hasAttribute('data-theme-save')) {
        saveCurrentAsCustomTheme();
        setThemeActionStatus('Custom theme saved in this browser. Click Save Appearance to commit the current preview.');
        notify('Custom theme saved.', 'success');
      } else if (button.hasAttribute('data-theme-duplicate')) {
        const currentName = cleanThemeName(themeNameInput()?.value || lab.activeTheme()?.name || 'OVYX Theme');
        saveCurrentAsCustomTheme(currentName + ' Copy');
        setThemeActionStatus('A copy of "' + currentName + '" was saved in your custom themes.');
        notify('Theme duplicated.', 'success');
      } else if (button.hasAttribute('data-theme-import')) {
        importThemeFile();
      } else if (button.hasAttribute('data-theme-export')) {
        downloadTheme();
      } else if (button.hasAttribute('data-theme-delete')) {
        const active = String(lab.state.active || '');
        if (!active.startsWith('custom_') || !lab.state.customThemes[active]) {
          setThemeActionStatus('Select a saved custom theme before deleting it. Built-in presets are protected.');
          notify('Built-in presets cannot be deleted.', 'info');
        } else {
          const name = cleanThemeName(lab.state.customThemes[active].name, 'Custom theme');
          if (!window.confirm('Delete the custom theme "' + name + '" from this browser?')) return;
          delete lab.state.customThemes[active];
          lab.state.active = 'obsidian';
          persistThemeLab(lab);
          window.ThemeContext.preview(appearanceFromLabTheme(lab.activeTheme()));
          setThemeActionStatus('Deleted "' + name + '". Click Save Appearance to keep the fallback appearance.');
          notify('Custom theme deleted.', 'success');
        }
      } else if (button.hasAttribute('data-theme-reset')) {
        if (!window.confirm('Reset the Theme Lab and remove saved custom themes?')) return;
        lab.reset();
        window.ThemeContext.reset();
        if (themeNameInput()) themeNameInput().value = 'My OVYX Theme';
        setThemeActionStatus('Theme Lab reset to OVYX defaults.');
      }
    } catch (error) {
      setThemeActionStatus('Theme action failed: ' + String(error?.message || 'could not complete'));
      notify(error?.message || 'Theme action failed.', 'error');
    }
  }

  function installThemeLabActions() {
    // Custom-theme buttons use one bubbling action handler. Keeping the handler
    // out of capture phase lets Chromium complete clicks and prevents duplicate
    // legacy direct handlers from running.
    document.addEventListener('click', handleThemeLabButtonClick, false);
    document.addEventListener('click', handleThemeLabClick, true);
  }


  function installAppearanceAndUsageHooks() {
    const settings = window.OVYXSettings;
    if (settings && typeof settings.show === 'function' && !settings.__ovyxSettingsReliabilityV1) {
      const originalShow = settings.show.bind(settings);
      settings.show = function (id) {
        const result = originalShow(id);
        if (id === 'profile') setTimeout(loadProfile, 0);
        if (id === 'notifications') setTimeout(loadNotifications, 0);
        if (id === 'usage') setTimeout(loadUsage, 0);
        if (id === 'workspace' || id === 'editor') setTimeout(installEditorMode, 0);
        if (id === 'ai') setTimeout(syncAISettingsControls, 0);
        return result;
      };
      settings.__ovyxSettingsReliabilityV1 = true;
    }
    if (settings && settings.current === 'profile') setTimeout(loadProfile, 0);
    if (settings && settings.current === 'notifications') setTimeout(loadNotifications, 0);
    if (settings && settings.current === 'usage') setTimeout(loadUsage, 0);
    if (settings && settings.current === 'ai') setTimeout(syncAISettingsControls, 0);
    window.addEventListener('ovyx:view-changed', function (event) {
      const view = String(event && event.detail && event.detail.view || '').replace(/^view-/, '');
      if (view === 'webstudio') setTimeout(function () { installLivePreviewBridge(); applyEditorMode(); applySettingEffects(settingsState()); }, 0);
    }, { passive: true });
    setTimeout(installEditorMode, 200);
  }
  function bindAuthenticationRefresh() {
    document.addEventListener('firebase-auth-state-ready', function () {
      setTimeout(function () {
        const settings = window.OVYXSettings;
        if (!settings) return;
        loadNotifications();
        if (settings.current === 'profile') loadProfile();
        if (settings.current === 'notifications') loadNotifications();
        if (settings.current === 'usage') loadUsage();
      }, 50);
      if (currentUser()) setTimeout(loadNotifications, 100);
    }, { passive: true });
    window.addEventListener('ovyx-settings-rendered', function () {
      setTimeout(function () {
        installEditorMode();
        const settings = window.OVYXSettings;
        if (!settings) return;
        if (settings.current === 'profile') loadProfile();
        if (settings.current === 'notifications') loadNotifications();
        if (settings.current === 'usage') loadUsage();
      }, 10);
    });
  }
  function installGlobalProjectShortcuts() {
    if (window.__OVYXSettingsProjectShortcutsV1) return;
    window.__OVYXSettingsProjectShortcutsV1 = true;

    function storageKey() {
      const user = currentUser();
      return user && user.uid
        ? 'ovyx.projects.v22.user.' + String(user.uid)
        : 'ovyx.projects.v22.guest';
    }
    function readStoredProjects() {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey()) || '[]');
        return Array.isArray(parsed) ? parsed : null;
      } catch (_) {
        return null;
      }
    }

    document.addEventListener('keydown', function (event) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.repeat || event.defaultPrevented) return;
      const key = String(event.key || '').toLowerCase();
      if (key !== 'n' && key !== 's') return;

      const store = window.ProjectStore;
      const state = window.KernelState;
      const currentProject = state && state.activeProject;

      if (key === 'n') {
        if (!store || typeof store.createPromptModal !== 'function') {
          event.preventDefault();
          notify('New Project is unavailable in this workspace.', 'error');
          return;
        }
        event.preventDefault();
        const previousId = String(currentProject && currentProject.id || '');
        try {
          store.createPromptModal();
          const nextProject = window.KernelState && window.KernelState.activeProject;
          const saved = readStoredProjects();
          if (!nextProject || !nextProject.id || String(nextProject.id) === previousId) return;
          if (!saved || !saved.some(project => String(project && project.id || '') === String(nextProject.id))) {
            notify('The new project was created in memory, but local persistence could not be confirmed.', 'error');
            return;
          }
          notify('New project created and saved on this device.', 'success');
        } catch (error) {
          notify(error && error.message || 'New project creation failed.', 'error');
        }
        return;
      }

      event.preventDefault();
      if (!currentProject || !currentProject.id) {
        notify('Open or create a project before saving.', 'info');
        return;
      }
      if (!store || typeof store.save !== 'function') {
        notify('Project saving is unavailable in this workspace.', 'error');
        return;
      }
      try {
        store.save();
        const saved = readStoredProjects();
        const storedProject = saved && saved.find(project => String(project && project.id || '') === String(currentProject.id));
        if (!storedProject || JSON.stringify(storedProject) !== JSON.stringify(currentProject)) {
          throw new Error('OVYX could not verify the project snapshot in local storage.');
        }
        notify('Project saved on this device.', 'success');
      } catch (error) {
        notify(error && error.message || 'Project save failed.', 'error');
      }
    }, true);
  }
  const DATA_LAYER_CONFIG_KEY = 'ovyx.data.layer.external.v1';
  let workspaceRecoveryObserver = null;
  let workspaceShowWrapped = false;
  let dataLayerSyncTimer = null;
  let dataLayerSyncInFlight = false;
  let dataLayerSyncPending = false;

  function readDataLayerConfig() {
    return Object.assign({ endpoint: '', projectSync: false }, safeJson(localStorage.getItem(DATA_LAYER_CONFIG_KEY)));
  }
  function saveDataLayerConfig(patch) {
    const next = Object.assign({}, readDataLayerConfig(), patch || {});
    try {
      localStorage.setItem(DATA_LAYER_CONFIG_KEY, JSON.stringify(next));
      return true;
    } catch (error) {
      console.warn('[OVYX Settings] Data Layer preferences could not be saved.', error);
      return false;
    }
  }
  function readNativeDataLayerConfig() {
    return Object.assign({ endpoint: '', projectSync: true }, safeJson(localStorage.getItem('ovyx.data.layer.v1')));
  }
  function saveNativeDataLayerConfig(patch) {
    const next = Object.assign({}, readNativeDataLayerConfig(), patch || {});
    try {
      localStorage.setItem('ovyx.data.layer.v1', JSON.stringify(next));
      return true;
    } catch (error) {
      console.warn('[OVYX Settings] Built-in cloud-sync preference could not be saved.', error);
      return false;
    }
  }
  function normaliseDataLayerEndpoint(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let url;
    try { url = new URL(raw); } catch (_) { throw new Error('Enter a complete HTTPS URL for your Data API.'); }
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) {
      throw new Error('The Data API must use HTTPS. HTTP is allowed only for localhost development.');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error('The Data API URL must not contain credentials, query parameters or a fragment.');
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href.replace(/\/$/, '');
  }
  function dataLayerFeedback(message, state, syncAt) {
    const text = String(message || 'No Data API operation has completed yet.');
    const cfg = readDataLayerConfig();
    cfg.lastSyncStatus = text;
    cfg.lastSyncState = String(state || 'info');
    if (syncAt) cfg.lastSyncAt = syncAt;
    saveDataLayerConfig(cfg);
    ['ovyx-data-result', 'ovyx-project-data-sync-status'].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      el.dataset.state = String(state || 'info');
      if (syncAt) el.title = 'Last successful metadata sync: ' + new Date(syncAt).toLocaleString();
    });
  }
  function ensureWorkspaceControls() {
    const root = window.OVYXSettings && window.OVYXSettings.root || document.getElementById('view-settings');
    const panel = root && root.querySelector('[data-settings-panel="workspace"]') || document.querySelector('#view-settings [data-settings-panel="workspace"]');
    if (!panel || panel.querySelector('.ovyx-settings-workspace-controls-v1')) return;
    // The original Workspace controls exist before the Data Layer renderer finishes.
    // Leave them in place during that short window rather than adding a duplicate copy.
    if (panel.querySelector('#set-open-behavior') &&
        panel.querySelector('#set-autosave') &&
        panel.querySelector('#set-confirm-delete')) return;
    const group = document.createElement('div');
    group.className = 'ovyx-pref-group ovyx-settings-workspace-controls-v1';
    group.innerHTML =
      '<div class="ovyx-pref-label">WORKSPACE PREFERENCES</div>' +
      '<div class="ovyx-pref-row"><div class="ovyx-pref-copy"><b>Open behavior</b><small>Choose where a selected project opens.</small></div><div class="ovyx-pref-control"><select id="set-open-behavior" class="ovyx-pref-select"><option value="Web Studio">Web Studio</option><option value="Last active view">Last active view</option><option value="Project overview">Project overview</option></select></div></div>' +
      '<div class="ovyx-pref-row"><div class="ovyx-pref-copy"><b>Autosave recovery snapshot</b><small>Keep a local recovery snapshot of the active project and current route.</small></div><div class="ovyx-pref-control"><button type="button" id="set-autosave" class="ovyx-toggle" role="switch" aria-label="Autosave recovery snapshot" aria-checked="true"><span></span></button></div></div>' +
      '<div class="ovyx-pref-row"><div class="ovyx-pref-copy"><b>Confirm destructive actions</b><small>Ask before deleting project data.</small></div><div class="ovyx-pref-control"><button type="button" id="set-confirm-delete" class="ovyx-toggle" role="switch" aria-label="Confirm destructive actions" aria-checked="true"><span></span></button></div></div>' +
      '<div id="ovyx-project-data-sync-status" class="ovyx-settings-action-status" role="status" style="padding:9px 0;color:var(--ov-muted,#858990);font:600 9px/1.5 JetBrains Mono,monospace;overflow-wrap:anywhere"></div>' +
      '<p class="ovyx-deep-note">Data API project sync sends project metadata only. Project source files and secrets are not uploaded by this optional integration. Enabling an external endpoint sends a Firebase ID token for authentication, so only enable an endpoint you trust.</p>';
    const result = panel.querySelector('#ovyx-data-result');
    if (result && result.parentNode) result.insertAdjacentElement('afterend', group);
    else panel.appendChild(group);

    const stored = settingsState();
    const open = group.querySelector('#set-open-behavior');
    if (open) open.value = ['Web Studio', 'Last active view', 'Project overview'].includes(stored.openBehavior) ? stored.openBehavior : 'Web Studio';
    syncToggleControls(settingsState());
    const cfg = readDataLayerConfig();
    const status = group.querySelector('#ovyx-project-data-sync-status');
    if (status) {
      status.textContent = cfg.lastSyncStatus || (cfg.endpoint
        ? 'Data API configured. Project metadata sync is ' + (cfg.projectSync === false ? 'disabled.' : 'enabled after a project save.')
        : 'No Data API endpoint configured. Built-in OVYX cloud project sync remains separate.');
      status.dataset.state = cfg.lastSyncState || 'info';
      if (cfg.lastSyncAt) status.title = 'Last successful metadata sync: ' + new Date(cfg.lastSyncAt).toLocaleString();
    }
  }
  function ensureDataLayerControls() {
    const root = window.OVYXSettings && window.OVYXSettings.root || document.getElementById('view-settings');
    const panel = root && root.querySelector('[data-settings-panel="workspace"]') ||
      document.querySelector('#view-settings [data-settings-panel="workspace"]');
    if (!panel) return;
    const cfg = readDataLayerConfig();

    // Workspace content is rendered by several legacy and reliability layers.
    // If the controls already exist, hydrate them from the saved settings instead
    // of returning early with stale values after a panel is revisited.
    const existingInput = panel.querySelector('#ovyx-data-endpoint');
    let existingSwitch = panel.querySelector('#ovyx-data-api-sync');
    if (existingInput) {
      // The external Data API and built-in OVYX cloud sync are separate features.
      // Keep their switches and persisted settings independent while sharing the endpoint field.
      if (document.activeElement !== existingInput) existingInput.value = cfg.endpoint || '';
      const group = existingInput.closest('.ovyx-pref-group') || panel.querySelector('.ovyx-pref-group');
      if (!existingSwitch && group && !panel.querySelector('.ovyx-settings-data-api-sync-row-v1')) {
        const row = document.createElement('div');
        row.className = 'ovyx-pref-row ovyx-settings-data-api-sync-row-v1';
        row.innerHTML = '<div class="ovyx-pref-copy"><b>External Data API metadata sync</b><small>Optional external sync sends project metadata only, never source files or secrets.</small></div><div class="ovyx-pref-control"><button type="button" class="ovyx-notify-toggle" id="ovyx-data-api-sync" role="switch" aria-checked="false"><span></span></button></div>';
        group.appendChild(row);
        existingSwitch = row.querySelector('#ovyx-data-api-sync');
      }
      if (existingSwitch) existingSwitch.setAttribute('aria-checked', String(cfg.projectSync === true));
      const existingResult = panel.querySelector('#ovyx-data-result');
      if (existingResult && document.activeElement !== existingInput) {
        existingResult.textContent = cfg.lastSyncStatus || (cfg.endpoint
          ? 'Data API configured. Use Test API to verify its health endpoint.'
          : 'No external Data API configured. Built-in OVYX cloud project sync is unaffected.');
        existingResult.dataset.state = cfg.lastSyncState || 'info';
      }
      return;
    }
    if (panel.querySelector('.ovyx-settings-data-layer-fallback-v1')) return;
    const escapeAttribute = value => String(value || '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    const section = document.createElement('section');
    section.className = 'ovyx-data-layer-section ovyx-settings-data-layer-fallback-v1';
    section.innerHTML =
      '<div class="ovyx-panel-head"><div class="ovyx-panel-kicker">WORKSPACE / DATA</div>' +
      '<h2>OVYX Data Layer</h2><p>Optional project-metadata integration for a trusted backend. Built-in OVYX project sync remains separate.</p></div>' +
      '<div class="ovyx-pref-group"><div class="ovyx-pref-label">BACKEND CONNECTION</div>' +
      '<div class="ovyx-pref-row"><div class="ovyx-pref-copy"><b>Data API endpoint</b><small>Use an HTTPS endpoint that implements the OVYX project metadata API.</small></div>' +
      '<div class="ovyx-pref-control"><input class="ovyx-pref-input" id="ovyx-data-endpoint" value="' + escapeAttribute(cfg.endpoint) + '" placeholder="https://your-domain.com/api/data" autocomplete="off"></div></div>' +
      '<div class="ovyx-pref-row"><div class="ovyx-pref-copy"><b>Project metadata sync</b><small>Disabled until explicitly enabled. Project source files and secrets are never uploaded by this integration.</small></div>' +
      '<div class="ovyx-pref-control"><button type="button" class="ovyx-notify-toggle" id="ovyx-data-api-sync" role="switch" aria-checked="' + String(cfg.projectSync === true) + '"><span></span></button></div></div></div>' +
      '<div class="ovyx-data-code">Recommended server contract: GET /health, POST /projects, PUT /projects/:projectId. The endpoint must verify the Firebase ID token and authorize the project owner.</div>' +
      '<div class="ovyx-data-actions"><button type="button" class="ovyx-settings-btn primary" id="ovyx-data-save">Save Data Settings</button>' +
      '<button type="button" class="ovyx-settings-btn" id="ovyx-data-test">Test API</button>' +
      '<button type="button" class="ovyx-settings-btn" id="ovyx-data-schema">Download PostgreSQL Schema</button></div>' +
      '<div id="ovyx-data-result" class="ovyx-connection-note" role="status" data-state="' +
      escapeAttribute(cfg.lastSyncState || 'info') + '">' +
      escapeAttribute(cfg.lastSyncStatus || (cfg.endpoint
        ? 'Data API configured. Save a project or use Test API to verify it.'
        : 'No external Data API configured. Built-in OVYX cloud project sync is unaffected.')) + '</div>';
    panel.appendChild(section);
  }
  function installWorkspaceControlRecovery() {
    ensureWorkspaceControls();
    ensureDataLayerControls();
    const settings = window.OVYXSettings;
    if (settings && typeof settings.show === 'function' && !workspaceShowWrapped) {
      const original = settings.show.bind(settings);
      settings.show = function (id) {
        const result = original(id);
        if (id === 'workspace') {
          [0, 80, 220, 500].forEach(function (delay) {
            setTimeout(ensureWorkspaceControls, delay);
            setTimeout(ensureDataLayerControls, delay);
          });
        }
        return result;
      };
      workspaceShowWrapped = true;
    }
    const root = document.getElementById('view-settings');
    if (root && !workspaceRecoveryObserver && typeof MutationObserver === 'function') {
      workspaceRecoveryObserver = new MutationObserver(function () {
        const panel = root.querySelector('[data-settings-panel="workspace"]');
        if (panel && !panel.querySelector('.ovyx-settings-workspace-controls-v1')) ensureWorkspaceControls();
        if (panel && !panel.querySelector('#ovyx-data-endpoint')) ensureDataLayerControls();
      });
      workspaceRecoveryObserver.observe(root, { childList: true, subtree: true });
    }
    document.addEventListener('change', function (event) {
      const control = event.target;
      if (!control || control.id !== 'set-open-behavior') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const value = ['Web Studio', 'Last active view', 'Project overview'].includes(control.value) ? control.value : 'Web Studio';
      const next = writeSettingsState({ openBehavior: value });
      control.value = next.openBehavior;
      const status = document.getElementById('ovyx-project-data-sync-status');
      if (status) status.textContent = 'Project open behavior saved on this device: ' + next.openBehavior + '.';
      notify('Project open behavior saved.', 'success');
    }, true);
    window.addEventListener('ovyx-settings-rendered', function () {
      setTimeout(ensureWorkspaceControls, 30);
      setTimeout(ensureDataLayerControls, 30);
    });
  }
  function installProjectOpenBehavior() {
    const store = window.ProjectStore;
    if (!store || typeof store.open !== 'function' || store.open.__ovyxSettingsOpenBehaviorV1) return;
    const original = store.open;
    const wrapped = function () {
      let previousRoute = '';
      try {
        previousRoute = String(window.KernelState && window.KernelState.activeView || localStorage.getItem('ovyx.settings.last-view.v1') || 'webstudio')
          .replace(/^view-/, '').toLowerCase();
      } catch (_) { previousRoute = 'webstudio'; }
      const result = original.apply(this, arguments);
      const applyBehavior = function (value) {
        if (value === false || !window.KernelState || !window.KernelState.activeProject) return value;
        const prefs = settingsState();
        let route = 'webstudio';
        if (prefs.openBehavior === 'Project overview') {
          route = 'projects';
        } else if (prefs.openBehavior === 'Last active view') {
          const allowed = ['home', 'projects', 'webstudio', 'appstudio', 'workspace', 'templates', 'pricing', 'faq', 'inbox'];
          route = allowed.includes(previousRoute) ? previousRoute : 'webstudio';
        }
        setTimeout(function () {
          try { if (window.Router && typeof window.Router.go === 'function') window.Router.go(route); }
          catch (error) { console.warn('[OVYX Settings] Project open behavior could not be applied.', error); }
        }, 0);
        return value;
      };
      if (result && typeof result.then === 'function') {
        return result.then(applyBehavior);
      }
      return applyBehavior(result);
    };
    wrapped.__ovyxSettingsOpenBehaviorV1 = true;
    store.open = wrapped;
  }

  function initialiseDataLayerConsent() {
    let raw = null;
    try { raw = localStorage.getItem(DATA_LAYER_CONFIG_KEY); }
    catch (_) { return; }
    if (raw === null) {
      if (!saveDataLayerConfig({ endpoint: '', projectSync: false })) return;
    }
    const switchButton = document.getElementById('ovyx-data-api-sync');
    if (switchButton) switchButton.setAttribute('aria-checked', String(readDataLayerConfig().projectSync === true));
  }
  function installDataLayerClickActions() {
    initialiseDataLayerConsent();
    window.addEventListener('ovyx-settings-rendered', function () { setTimeout(initialiseDataLayerConsent, 30); });
    window.addEventListener('ovyx:view-changed', function (event) {
      if (String(event && event.detail && event.detail.view || '').replace(/^view-/, '') === 'settings') {
        setTimeout(initialiseDataLayerConsent, 120);
      }
    }, { passive: true });
    document.addEventListener('click', async function (event) {
      const target = event.target && event.target.closest && event.target.closest('#ovyx-data-save, #ovyx-data-test, #ovyx-data-api-sync, #ovyx-data-schema');
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const output = document.getElementById('ovyx-data-result');
      const endpointInput = document.getElementById('ovyx-data-endpoint');
      const switchButton = document.getElementById('ovyx-data-api-sync');
      const nativeSwitchButton = document.getElementById('ovyx-data-sync');
      if (target.id === 'ovyx-data-api-sync') {
        const before = switchButton.getAttribute('aria-checked') === 'true';
        let endpoint = '';
        try { endpoint = normaliseDataLayerEndpoint(endpointInput && endpointInput.value); }
        catch (error) { dataLayerFeedback(error.message, 'error'); notify(error.message, 'error'); return; }
        if (!before && !endpoint) {
          const message = 'Save a valid Data API endpoint before enabling project metadata sync.';
          switchButton.setAttribute('aria-checked', 'false');
          dataLayerFeedback(message, 'error');
          notify(message, 'error');
          return;
        }
        const enabled = !before;
        if (enabled && endpoint && new URL(endpoint).origin !== window.location.origin) {
          const trusted = window.confirm('Enable Data API project sync for ' + new URL(endpoint).origin + '? OVYX will send a Firebase ID token for authentication and only project metadata (not project source files or secrets). Continue only if you trust this endpoint.');
          if (!trusted) return;
        }
        switchButton.setAttribute('aria-checked', String(enabled));
        const saved = saveDataLayerConfig({ endpoint: endpoint || readDataLayerConfig().endpoint, projectSync: enabled });
        if (!saved) {
          switchButton.setAttribute('aria-checked', String(before));
          dataLayerFeedback('Data API preferences could not be saved on this device.', 'error');
          return;
        }
        dataLayerFeedback('Project metadata sync ' + (enabled ? 'enabled. The next project save will send metadata only.' : 'disabled. Built-in OVYX cloud sync is unchanged.'), 'ok');
        notify('Project metadata sync ' + (enabled ? 'enabled.' : 'disabled.'), 'success');
        if (enabled) scheduleDataLayerProjectSync(100);
        return;
      }

      if (target.id === 'ovyx-data-save') {
        let endpoint = '';
        try { endpoint = normaliseDataLayerEndpoint(endpointInput && endpointInput.value); }
        catch (error) { dataLayerFeedback(error.message, 'error'); notify(error.message, 'error'); return; }
        const enabled = !!switchButton && switchButton.getAttribute('aria-checked') === 'true';
        const previousConfig = readDataLayerConfig();
        if (enabled && previousConfig.projectSync === true && previousConfig.endpoint &&
            endpoint && new URL(endpoint).origin !== new URL(previousConfig.endpoint).origin) {
          const trusted = window.confirm('Change the active Data API endpoint to ' + new URL(endpoint).origin +
            '? Future project metadata and a Firebase ID token will be sent to this new service. Continue only if you trust it.');
          if (!trusted) {
            if (endpointInput) endpointInput.value = previousConfig.endpoint;
            if (switchButton) switchButton.setAttribute('aria-checked', 'true');
            dataLayerFeedback('Data API endpoint change cancelled. The previously saved endpoint remains active.', 'info');
            return;
          }
        }
        if (enabled && !endpoint) {
          dataLayerFeedback('Enter a valid HTTPS Data API endpoint before enabling project metadata sync.', 'error');
          notify('A valid Data API endpoint is required before sync can be enabled.', 'error');
          return;
        }
        const previousNative = readNativeDataLayerConfig();
        const nativeEnabled = nativeSwitchButton
          ? nativeSwitchButton.getAttribute('aria-checked') !== 'false'
          : previousNative.projectSync !== false;
        if (!saveNativeDataLayerConfig({ endpoint: endpoint, projectSync: nativeEnabled })) {
          dataLayerFeedback('Built-in OVYX settings could not be saved on this device. Check browser storage permissions.', 'error');
          notify('Data API settings were not saved.', 'error');
          return;
        }
        if (!saveDataLayerConfig({ endpoint: endpoint, projectSync: enabled })) {
          saveNativeDataLayerConfig(previousNative);
          dataLayerFeedback('External Data API settings could not be saved on this device. Check browser storage permissions.', 'error');
          notify('Data API settings were not saved.', 'error');
          return;
        }
        if (previousNative.projectSync !== nativeEnabled) {
          window.OVYXDataLayerSettings?.changed?.(nativeEnabled);
        }
        if (endpointInput) endpointInput.value = endpoint;
        dataLayerFeedback(endpoint
          ? 'Data API settings saved on this device. Use Test API to verify its health endpoint.'
          : 'Data API settings saved with no endpoint. Built-in OVYX cloud project sync remains separate.', 'ok');
        notify('Data API settings saved.', 'success');
        if (enabled && endpoint) scheduleDataLayerProjectSync(100);
        return;
      }

      if (target.id === 'ovyx-data-schema') {
        const sql = [
          '-- OVYX PostgreSQL foundation schema',
          'create table if not exists ovyx_projects (',
          '  id text primary key,',
          '  owner_id text not null,',
          '  name text not null,',
          "  description text default '',",
          "  status text default 'draft',",
          '  schema_version integer default 1,',
          "  data jsonb not null default '{}'::jsonb,",
          '  created_at timestamptz not null default now(),',
          '  updated_at timestamptz not null default now()',
          ');',
          'create index if not exists ovyx_projects_owner_updated on ovyx_projects(owner_id, updated_at desc);',
          'create table if not exists ovyx_project_revisions (',
          '  id bigserial primary key,',
          '  project_id text not null references ovyx_projects(id) on delete cascade,',
          '  owner_id text not null,',
          '  snapshot jsonb not null,',
          '  created_at timestamptz not null default now()',
          ');',
          'create index if not exists ovyx_revisions_project_created on ovyx_project_revisions(project_id, created_at desc);',
          'create table if not exists ovyx_ai_usage (',
          '  id bigserial primary key,',
          '  owner_id text not null,',
          '  tokens integer not null default 0,',
          '  provider text,',
          '  model text,',
          '  created_at timestamptz not null default now()',
          ');',
          'create index if not exists ovyx_ai_usage_owner_created on ovyx_ai_usage(owner_id, created_at desc);',
          ''
        ].join('\n');
        const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'ovyx-postgresql-schema.sql';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
        dataLayerFeedback('PostgreSQL schema download started. Review and adapt ownership policies before applying it.', 'ok');
        notify('PostgreSQL schema downloaded.', 'success');
        return;
      }

      if (target.id === 'ovyx-data-test') {
        let endpoint = '';
        try { endpoint = normaliseDataLayerEndpoint(endpointInput && endpointInput.value); }
        catch (error) { dataLayerFeedback(error.message, 'error'); notify(error.message, 'error'); return; }
        if (!endpoint) {
          const message = 'Add and save your Data API endpoint first.';
          dataLayerFeedback(message, 'error');
          return;
        }
        if (output) output.textContent = 'Testing Data API health endpoint…';
        target.disabled = true;
        try {
          const response = await fetch(endpoint + '/health', {
            method: 'GET', headers: { Accept: 'application/json' },
            credentials: 'omit', cache: 'no-store'
          });
          if (!response.ok) throw new Error('Health check returned HTTP ' + response.status + '.');
          let data;
          try { data = await response.json(); }
          catch (_) { throw new Error('Health check returned a non-JSON response; connectivity could not be verified.'); }
          if (data && data.ok === false) throw new Error(String(data.message || data.error || 'The Data API reported that its health check failed.'));
          const db = data && data.database;
          const dbState = db && (db.status || db.state || (db.connected === true ? 'connected' : db.connected === false ? 'not connected' : 'reported'));
          const detail = dbState ? ' Database status reported by endpoint: ' + String(dbState) + '.' : ' Database connectivity was not independently confirmed by this response.';
          dataLayerFeedback('Data API health check succeeded.' + detail, 'ok');
          notify('Data API health check succeeded.', 'success');
        } catch (error) {
          dataLayerFeedback('Data API health check failed: ' + (error.message || 'Connection could not be verified.'), 'error');
          notify('Data API health check failed.', 'error');
        } finally {
          target.disabled = false;
        }
      }
    }, true);
  }
  function scheduleDataLayerProjectSync(delay) {
    if (dataLayerSyncTimer) clearTimeout(dataLayerSyncTimer);
    dataLayerSyncTimer = setTimeout(function () {
      dataLayerSyncTimer = null;
      syncActiveProjectMetadataToDataApi().catch(function () {});
    }, Math.max(100, Number(delay) || 650));
  }
  async function syncActiveProjectMetadataToDataApi() {
    const cfg = readDataLayerConfig();
    if (cfg.projectSync === false || !cfg.endpoint) return false;
    if (dataLayerSyncInFlight) { dataLayerSyncPending = true; return false; }
    const user = currentUser();
    const project = window.KernelState && window.KernelState.activeProject;
    if (!user || !user.uid) {
      dataLayerFeedback('Project metadata sync is enabled, but you must sign in before sending data to the configured endpoint.', 'error');
      return false;
    }
    if (!project || !project.id) return false;
    let endpoint;
    try { endpoint = normaliseDataLayerEndpoint(cfg.endpoint); }
    catch (error) { dataLayerFeedback(error.message, 'error'); return false; }

    const projectId = String(project.id);
    const metadata = {
      id: projectId,
      name: String(project.name || 'Untitled Project').slice(0, 160),
      description: String(project.description || '').slice(0, 2000),
      status: String(project.status || 'draft').slice(0, 40),
      schemaVersion: 1,
      updatedAt: String(project.updatedAt || project.updated_at || new Date().toISOString()),
      framework: String(project.framework || '').slice(0, 100),
      pageCount: Array.isArray(project.pages) ? project.pages.length : 0
    };
    const marker = 'ovyx.data.layer.synced.v1.' + encodeURIComponent(String(user.uid)) + '.' + encodeURIComponent(projectId);
    const previouslyCreated = !!safeJson(localStorage.getItem(marker));
    const url = endpoint + '/projects' + (previouslyCreated ? '/' + encodeURIComponent(projectId) : '');
    let method = previouslyCreated ? 'PUT' : 'POST';
    dataLayerSyncInFlight = true;
    try {
      const token = await user.getIdToken(false);
      const send = async function (requestMethod, requestUrl) {
        const response = await fetch(requestUrl, {
          method: requestMethod,
          credentials: 'omit',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token
          },
          body: JSON.stringify({ projectId: projectId, project: metadata })
        });
        let data = {};
        try { data = await response.json(); }
        catch (_) { if (response.ok) throw new Error('The Data API returned a non-JSON response; project metadata sync was not confirmed.'); }
        if (!response.ok) throw Object.assign(new Error(data.message || data.error || ('Data API returned HTTP ' + response.status + '.')), { status: response.status });
        if (data && data.ok === false) throw new Error(data.message || data.error || 'The Data API rejected project metadata.');
        return data;
      };
      try {
        await send(method, url);
      } catch (error) {
        if (!previouslyCreated && error.status === 409) {
          method = 'PUT';
          await send('PUT', endpoint + '/projects/' + encodeURIComponent(projectId));
        } else if (previouslyCreated && error.status === 404) {
          method = 'POST';
          await send('POST', endpoint + '/projects');
        } else {
          throw error;
        }
      }
      try { localStorage.setItem(marker, JSON.stringify({ syncedAt: new Date().toISOString() })); }
      catch (_) { throw new Error('The Data API accepted the metadata, but the browser could not record sync state.'); }
      const syncedAt = new Date().toISOString();
      dataLayerFeedback('Project metadata sync succeeded for "' + metadata.name + '". Source files and secrets were not uploaded.', 'ok', syncedAt);
      return true;
    } catch (error) {
      dataLayerFeedback('Project metadata sync failed: ' + (error.message || 'The endpoint did not confirm the write.'), 'error');
      notify('Project metadata sync failed. Check the Data API configuration and server logs.', 'error');
      return false;
    } finally {
      dataLayerSyncInFlight = false;
      if (dataLayerSyncPending) {
        dataLayerSyncPending = false;
        scheduleDataLayerProjectSync(650);
      }
    }
  }
  function installDataLayerProjectSync() {
    const store = window.ProjectStore;
    if (store && typeof store.save === 'function' && !store.save.__ovyxSettingsDataLayerSyncV1) {
      const original = store.save;
      const wrapped = function () {
        const result = original.apply(this, arguments);
        if (result !== false && currentUser() && window.KernelState && window.KernelState.activeProject) {
          scheduleDataLayerProjectSync(750);
        }
        return result;
      };
      wrapped.__ovyxSettingsDataLayerSyncV1 = true;
      store.save = wrapped;
    }
    document.addEventListener('firebase-auth-state-ready', function (event) {
      if (event && event.detail && event.detail.user) scheduleDataLayerProjectSync(900);
    }, { passive: true });
    window.addEventListener('ovyx:view-changed', function (event) {
      const view = String(event && event.detail && event.detail.view || '').replace(/^view-/, '');
      if (view === 'webstudio') scheduleDataLayerProjectSync(900);
    }, { passive: true });
    installDataLayerClickActions();
    if (currentUser() && window.KernelState && window.KernelState.activeProject) scheduleDataLayerProjectSync(1200);
  }
  function boot() {
    installGlobalProjectShortcuts();
    installWorkspaceControlRecovery();
    installProjectOpenBehavior();
    installDataLayerProjectSync();
    installProfileActions();
    installNotificationActions();
    installNotificationToastFilters();
    installWorkspaceToggleActions();
    installAISettingsBridge();
    installThemeLabActions();
    installAppearanceAndUsageHooks();
    bindAuthenticationRefresh();
    installLivePreviewBridge();
    if (currentUser()) setTimeout(loadNotifications, 80);
    writeSettingsState(settingsState());
    const notifyPanel = notificationPanel();
    if (notifyPanel) {
      const paragraph = notifyPanel.querySelector('.ovyx-panel-head p');
      if (paragraph) paragraph.textContent = 'Choose which activity preferences to save to your account. Email preferences are recorded, but they do not send email without a configured delivery integration.';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
