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
  function hydrateProfileForm(profile) {
    const name = $('set-profile-name') || $('set-profile-name-legacy');
    const workspace = $('set-workspace-name') || $('set-workspace-name-legacy');
    const displayName = String(profile?.displayName || '').trim();
    const workspaceName = String(profile?.workspaceName || '').trim();

    // The currently rendered Settings panel uses the legacy-suffixed field IDs.
    // Support both current and legacy IDs so a server read always hydrates the form.
    if (name && document.activeElement !== name && displayName) name.value = displayName;
    if (workspace && document.activeElement !== workspace && workspaceName) workspace.value = workspaceName;

    if (displayName) {
      document.querySelectorAll('#settings-display-name-text,#sidebar-user-display-name').forEach(el => {
        el.textContent = displayName;
      });
      const heading = $('profile-name-heading');
      if (heading) heading.textContent = displayName;
    }
    if (workspaceName) {
      const label = $('sidebar-workspace-label');
      if (label) label.textContent = workspaceName;
    }
  }

  async function loadProfile() {
    const panel = document.querySelector('[data-settings-panel="profile"]');
    if (!panel || !currentUser()) return;
    const status = addStatus(panel, 'ovyx-profile-server-status', 'Loading saved profile from the server…');
    try {
      const data = await api(PROFILE_ENDPOINT);
      hydrateProfileForm(data.profile || {});
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
      const button = event.target && event.target.closest && event.target.closest('#ovyx-security-delete');
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
    document.addEventListener('click', function (event) {
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
    const button = event.target?.closest?.('#view-settings [data-theme-save],#view-settings [data-theme-duplicate],#view-settings [data-theme-import],#view-settings [data-theme-export],#view-settings [data-theme-delete],#view-settings [data-theme-reset]');
    if (button) {
      event.preventDefault();
      event.stopImmediatePropagation();
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
      return;
    }

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

  function installThemeLabActions() {
    // The later ThemeContext runtime intercepts the legacy buttons on this same
    // document in capture phase. Register after it and finish those actions here.
    document.addEventListener('click', handleThemeLabClick, true);
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
  function boot() {
    installGlobalProjectShortcuts();
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
