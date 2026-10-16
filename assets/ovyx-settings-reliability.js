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
    if (!studio || typeof studio.renderPreview !== 'function') return;

    // Preserve one raw renderer reference before any optional wrapper is added.
    // Quality and Settings both delegate to this base so wrappers cannot recurse.
    if (typeof studio.__ovyxRawRenderPreviewV1 !== 'function') {
      const current = studio.renderPreview;
      studio.__ovyxRawRenderPreviewV1 =
        current.__ovyxRawRenderPreviewV1 ||
        current.__ovyxPreviewBaseV1 ||
        current;
    }
    const rawPreview = studio.__ovyxRawRenderPreviewV1;

    const shouldPause = function () {
      if (settingsState().livePreview !== false || window.__OVYX_FORCE_LIVE_PREVIEW__ === true) return false;
      const frame = $('ws-canvas-iframe');
      if (frame) frame.dataset.ovyxLivePreviewPaused = 'true';
      const status = $('ws-preview-url');
      if (status && !status.dataset.ovyxPreviewPauseNote) {
        status.dataset.ovyxPreviewPauseNote = 'true';
        status.title = 'Automatic preview refresh is paused in Settings → Workspace.';
      }
      return true;
    };
    const previewRendered = function () {
      const frame = $('ws-canvas-iframe');
      if (frame) frame.dataset.ovyxLivePreviewPaused = 'false';
    };
    studio.__ovyxShouldPauseLivePreviewV1 = shouldPause;
    studio.__ovyxLivePreviewRenderedV1 = previewRendered;
    window.OVYXSettingsLivePreview = {
      shouldPause,
      refreshNow: function () {
        window.__OVYX_FORCE_LIVE_PREVIEW__ = true;
        try { return studio.renderPreview(); }
        finally { window.__OVYX_FORCE_LIVE_PREVIEW__ = false; }
      }
    };

    // The quality wrapper owns renderPreview when present. Register the Settings
    // gate above instead of wrapping that wrapper.
    if (studio.renderPreview.__ovyxQualityEvents || studio.renderPreview.__ovyxSettingsReliabilityV1) return;

    livePreviewOriginal = rawPreview.bind(studio);
    const wrapped = function () {
      if (shouldPause()) return false;
      const result = livePreviewOriginal.apply(this, arguments);
      previewRendered();
      return result;
    };
    wrapped.__ovyxSettingsReliabilityV1 = true;
    wrapped.__ovyxPreviewBaseV1 = rawPreview;
    wrapped.__ovyxRawRenderPreviewV1 = rawPreview;
    studio.renderPreview = wrapped;
  }
  function applySettingEffects(state, previous) {
    try {
      document.querySelectorAll('#app-node-inspector, #ws-select-inspector').forEach(el => {
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
      const activeView = String(window.KernelState?.activeView || '').replace(/^view-/, '');
      if (previous && previous.livePreview === false && state.livePreview !== false &&
          activeView === 'webstudio' &&
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
  function installWorkspaceOpenBehaviorActions() {
    document.addEventListener('change', function (event) {
      const select = event.target && event.target.closest && event.target.closest('[data-settings-panel="workspace"] #set-open-behavior');
      if (!select) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const value = String(select.value || '');
      const allowed = ['Web Studio', 'Last active view', 'Project overview'];
      if (!allowed.includes(value)) {
        const saved = window.OVYXSettingsIntegrity?.load?.() || safeJson(localStorage.getItem('ovyx.settings.integrity.v83'));
        select.value = allowed.includes(saved.openBehavior) ? saved.openBehavior : 'Web Studio';
        notify('Choose a valid project open behavior.', 'error');
        return;
      }
      const store = window.OVYXSettingsIntegrity;
      const current = store && typeof store.load === 'function'
        ? store.load()
        : safeJson(localStorage.getItem('ovyx.settings.integrity.v83'));
      const next = Object.assign({}, current, { openBehavior: value });
      let saved = false;
      try {
        if (store && typeof store.save === 'function') saved = store.save(next) === true;
        else {
          localStorage.setItem('ovyx.settings.integrity.v83', JSON.stringify(next));
          saved = true;
        }
      } catch (_) { saved = false; }
      if (!saved) {
        notify('Project open behavior could not be saved on this device.', 'error');
        return;
      }
      select.value = value;
      const status = $('settings-save-status');
      if (status) status.textContent = 'Project open behavior saved.';
      notify('Project open behavior saved.', 'success');
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
    installWorkspaceOpenBehaviorActions();
    installWorkspaceToggleActions();
    installAISettingsBridge();
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
