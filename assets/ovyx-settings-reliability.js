(function () {
  'use strict';
  if (window.__OVYX_SETTINGS_RELIABILITY_V1__) return;
  window.__OVYX_SETTINGS_RELIABILITY_V1__ = true;

  const PROFILE_ENDPOINT = '/api/settings/profile';
  const NOTIFICATIONS_ENDPOINT = '/api/settings/preferences';
  const AI_PREFERENCES_ENDPOINT = '/api/settings/ai';
  const AI_PREFERENCE_DEFAULTS = Object.freeze({ mode: 'balanced', model: 'automatic', provider: 'gemini', explain: true, preserve: true, confirmDestructive: false, contextFiles: true, contextPage: true, contextGithub: true, routing: 'automatic', fallback: 'next', contextLimit: 'automatic', budget: 'automatic' });
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
      // RuntimeSession.save() deep-clones the active project for recovery. That
      // snapshot is necessary when autosave changes, not on every inspector,
      // preview, notification or safety toggle; avoid blocking unrelated clicks.
      if (runtime && typeof runtime.save === 'function' &&
          previous && previous.autosave !== state.autosave) {
        runtime.save();
      }
    } catch (_) {}
    try {
      // The view-change hook installs this shared pause gate. Reuse it instead
      // of repeatedly replacing preview wrappers on every Settings toggle.
      if (typeof window.WebStudio?.__ovyxShouldPauseLivePreviewV1 !== 'function') {
        installLivePreviewBridge();
      }
      const frame = $('ws-canvas-iframe');
      if (frame) frame.dataset.ovyxLivePreviewPaused = state.livePreview === false ? 'true' : 'false';
      // Keep the Settings click handler non-blocking. The wrapper above the preview
      // reads the persisted livePreview preference on every render, so toggling here
      // is enough to pause/resume future automatic refreshes. Never force a full
      // Web Studio render synchronously from inside a Settings click.
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
    // The server-backed account profile is authoritative for identity fields.
    // Mirror those same fields into the profile renderer's UID-scoped cache so a
    // refresh or delayed profile render cannot resurrect an older local identity.
    const user = currentUser();
    if (user && user.uid && (displayName || workspaceName)) {
      const key = 'ovyx.profile.v2.user.' + String(user.uid);
      const cached = safeJson(localStorage.getItem(key));
      try {
        localStorage.setItem(key, JSON.stringify(Object.assign({}, cached,
          displayName ? { name: displayName } : {},
          workspaceName ? { workspace: workspaceName } : {})));
      } catch (_) {}
    }
    if (name && document.activeElement !== name && displayName) name.value = displayName;
    if (workspace && document.activeElement !== workspace && workspaceName) workspace.value = workspaceName;
    if (displayName) {
      document.querySelectorAll('#settings-display-name-text,#sidebar-user-display-name').forEach(el => { el.textContent = displayName; });
      const heading = $('profile-name-heading');
      if (heading) heading.textContent = displayName;
    }
    if (workspaceName) {
      const label = $('sidebar-workspace-label');
      if (label) label.textContent = workspaceName;
    }
  }
  function syncLocalProfileCache(profile, updatedAt, user) {
    user = user || currentUser();
    if (!user || !user.uid) return;
    const key = 'ovyx.profile.v2.user.' + String(user.uid);
    const cached = safeJson(localStorage.getItem(key));
    const remoteName = String(profile && profile.displayName || '').trim();
    const remoteWorkspace = String(profile && profile.workspaceName || '').trim();
    // The server profile is canonical after a confirmed save. Before the first
    // server save, preserve an existing local profile as a one-time migration
    // source so a refresh does not replace a long-standing workspace name.
    const name = remoteName || String(cached.name || user.displayName || 'Guest Account').trim();
    const workspace = updatedAt
      ? (remoteWorkspace || 'Creative Workspace')
      : (String(cached.workspace || remoteWorkspace || 'Creative Workspace').trim());
    try {
      localStorage.setItem(key, JSON.stringify(Object.assign({}, cached, {
        name: name || 'Guest Account',
        workspace: workspace || 'Creative Workspace'
      })));
    } catch (_) {}
  }

  async function loadProfile() {
    const panel = document.querySelector('[data-settings-panel="profile"]');
    const requestedUser = currentUser();
    if (!panel || !requestedUser || !requestedUser.uid) return;
    const status = addStatus(panel, 'ovyx-profile-server-status', 'Loading your saved profile…');
    try {
      const data = await api(PROFILE_ENDPOINT);
      // Never hydrate a different account if the user switches while this request is in flight.
      if (!currentUser() || String(currentUser().uid) !== String(requestedUser.uid)) return;
      const profile = data.profile || {};
      syncLocalProfileCache(profile, data.updatedAt, requestedUser);
      hydrateProfileForm(profile);
      if (status) status.textContent = data.updatedAt ? 'Profile last saved ' + new Date(data.updatedAt).toLocaleString() : 'Your profile is ready.';
    } catch (error) {
      if (status) status.textContent = 'We could not load your saved profile. Please try again.';
    }
  }
  async function saveProfile(button) {
    const panel = document.querySelector('[data-settings-panel="profile"]');
    const status = addStatus(panel, 'ovyx-profile-server-status', 'Saving your profile…');
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
      syncLocalProfileCache(saved, data.updatedAt || new Date().toISOString(), currentUser());
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
      if (status) status.textContent = 'Profile saved to your OVYX account. Last updated ' + new Date(data.updatedAt || Date.now()).toLocaleString();
      notify('Profile saved to your OVYX account.', 'success');
      return data;
    } catch (error) {
      if (status) status.textContent = 'Your profile was not saved. Please try again.';
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
      if (status) status.textContent = 'Your notification preferences are ready. Email notifications are sent only when that delivery option is available.';
    } catch (error) {
      notificationDraft = Object.assign({}, NOTIFICATION_DEFAULTS, safeJson(localStorage.getItem(notificationStorageKey())));
      window.OVYXSettingsNotificationPreferences = Object.assign({}, notificationDraft);
      renderNotificationState(panel, notificationDraft);
      if (status) status.textContent = 'We could not load your saved notification preferences. Showing the last version available on this device.';
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
      if (status) status.textContent = 'Your notification preferences have been saved. Email notifications will be available when delivery is enabled.';
      notify(reset ? 'Notification preferences reset and saved to your account.' : 'Notification preferences saved to your account.', 'success');
    } catch (error) {
      if (status) status.textContent = 'Your notification preferences could not be saved. Please try again.';
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
    meter.textContent = 'Loading your AI allowance…';
    try {
      const data = await api(QUOTA_ENDPOINT);
      const limit = Number(data.monthlyLimit || data.monthlyLimitTokens || data.monthly_limit || 0);
      const remaining = Number(data.current_monthly_tokens ?? data.baseRemaining ?? data.remainingTokens ?? 0);
      if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(remaining)) throw new Error('Your usage details could not be verified.');
      const used = Math.max(0, limit - Math.max(0, remaining));
      meter.textContent = used.toLocaleString() + ' used / ' + limit.toLocaleString();
      meter.title = Math.max(0, remaining).toLocaleString() + ' monthly AI tokens remaining.';
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
    const confirmed = window.confirm('Permanently delete your OVYX account and saved app data? This action cannot be undone.');
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
        throw Object.assign(new Error(data.error || data.message || 'We could not confirm that all saved account data was deleted.'), { code: data.code || 'ACCOUNT_DELETE_FAILED', status: response.status });
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
      notify('Your account and saved app data have been deleted.', 'success');
      window.Router && window.Router.go && window.Router.go('home');
      window.OVYXMasterAuth && window.OVYXMasterAuth.openAuth && window.OVYXMasterAuth.openAuth();
    } catch (error) {
      notify(error.message || 'Your account could not be deleted. Please try again.', 'error');
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
      ['connectionFailures', /\b(?:connection|provider|backend|service|AI brain|GitHub|Cloudflare)\b.*\b(?:failed|unavailable|could not|could not|error|timed out|unreachable)\b/i],
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
      const status = addStatus(panel, 'ovyx-notification-server-status', 'Unsaved changes. Save to apply your notification preferences.');
      if (status) status.textContent = 'Unsaved changes. Save to apply this preference. Email notifications will not be sent until delivery is available.';
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
      const message = (key === 'aiSafe' ? 'Safe generation' : key.replace(/([A-Z])/g, ' $1')) + (next[key] ? ' enabled.' : ' disabled.');
      // Global toast rendering can block this delegated click path in the Web Studio
      // shell. Use the persistent Settings status region for non-blocking feedback.
      const status = $('settings-save-status');
      if (status) status.textContent = message;
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
    const prefs = Object.assign({}, AI_PREFERENCE_DEFAULTS, safeJson(localStorage.getItem(key)));
    ['explain','preserve','confirmDestructive','contextFiles','contextPage','contextGithub'].forEach(name => {
      const input = panel.querySelector('[data-ai-pref="' + name + '"]');
      if (input) input.checked = !!prefs[name];
    });
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
  let aiPreferencesLoadPromise = null;
  function setAIPreferenceStatus(message, state) {
    const panel = document.querySelector('[data-settings-panel="ai"]');
    const status = addStatus(panel, 'ovyx-ai-preference-status', message);
    if (!status) return;
    status.textContent = String(message || '');
    status.dataset.state = String(state || 'info');
  }
  async function loadAIPreferencesFromServer() {
    if (!currentUser()) return null;
    if (aiPreferencesLoadPromise) return aiPreferencesLoadPromise;
    const key = window.OVYXAIStorageKey ? window.OVYXAIStorageKey() : 'ovyx.ai.preferences.v1';
    const cached = safeJson(localStorage.getItem(key));
    aiPreferencesLoadPromise = (async function () {
      try {
        const data = await api(AI_PREFERENCES_ENDPOINT);
        let preferences = Object.assign({}, AI_PREFERENCE_DEFAULTS, data.preferences || {});
        if (!data.updatedAt && Object.keys(cached).length) {
          const migrated = Object.assign({}, AI_PREFERENCE_DEFAULTS, cached);
          const saved = await api(AI_PREFERENCES_ENDPOINT, jsonOptions('PUT', { preferences: migrated }));
          if (saved?.authority !== 'SERVER' || !saved.preferences) throw new Error('The server did not confirm migration of the saved AI preferences.');
          preferences = Object.assign({}, AI_PREFERENCE_DEFAULTS, saved.preferences);
          setAIPreferenceStatus('Existing AI preferences were migrated to your account and verified by the server.', 'ok');
        } else {
          setAIPreferenceStatus(data.updatedAt
            ? 'AI preferences loaded from your OVYX account.'
            : 'No account AI preferences have been saved yet. Your device preferences are ready to save.', 'info');
        }
        localStorage.setItem(key, JSON.stringify(preferences));
        window.OVYXAI = Object.assign({}, window.OVYXAI || {}, preferences);
        syncAISettingsControls();
        return preferences;
      } catch (error) {
        setAIPreferenceStatus('Account AI preferences could not be verified. The existing device copy was kept: ' + String(error?.message || 'server unavailable'), 'warning');
        syncAISettingsControls();
        return null;
      } finally {
        aiPreferencesLoadPromise = null;
      }
    })();
    return aiPreferencesLoadPromise;
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
    document.addEventListener('click', async function (event) {
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
        if (selectedModel !== prefs.model) notify('The selected model is not supported by this AI option. Automatic model selection was saved instead.', 'info');
        prefs.routing = String(panel && panel.querySelector('#set-ai-routing') && panel.querySelector('#set-ai-routing').value || 'automatic');
        prefs.fallback = String(panel && panel.querySelector('#set-ai-fallback') && panel.querySelector('#set-ai-fallback').value || 'next');
        prefs.contextLimit = String(panel && panel.querySelector('#set-ai-context-limit') && panel.querySelector('#set-ai-context-limit').value || 'automatic');
        prefs.budget = String(panel && panel.querySelector('#set-ai-budget') && panel.querySelector('#set-ai-budget').value || 'automatic');
        ['explain','preserve','confirmDestructive','contextFiles','contextPage','contextGithub'].forEach(name => {
          const input = panel && panel.querySelector('[data-ai-pref="' + name + '"]');
          if (input) prefs[name] = !!input.checked;
        });
        let serverError = '';
        let savedPreferences = prefs;
        try {
          const saved = await api(AI_PREFERENCES_ENDPOINT, jsonOptions('PUT', { preferences: prefs }));
          if (saved?.authority !== 'SERVER' || !saved.preferences) throw new Error('The server did not confirm the saved preferences.');
          savedPreferences = Object.assign({}, AI_PREFERENCE_DEFAULTS, saved.preferences);
        } catch (error) {
          serverError = String(error?.message || 'account preference sync failed');
        }
        localStorage.setItem(key, JSON.stringify(savedPreferences));
        window.OVYXAI = Object.assign({}, window.OVYXAI || {}, savedPreferences);
        syncAISettingsControls();
        const status = addStatus(panel, 'ovyx-ai-preference-status', 'AI preference status');
        if (status) {
          status.textContent = serverError
            ? 'Preferences saved on this device only. Account sync could not be verified: ' + serverError
            : 'Preferences saved to your OVYX account and verified by the server.';
          status.dataset.state = serverError ? 'warning' : 'ok';
        }
        notify(serverError ? 'AI preferences were saved locally, but account sync needs attention.' : 'AI preferences saved to your OVYX account.', serverError ? 'warning' : 'success');
      } catch (error) {
        notify(error.message || 'AI preferences could not be saved.', 'error');
      }
    }, true);
    document.addEventListener('click', async function (event) {
      const button = event.target && event.target.closest && event.target.closest('#set-ai-reset');
      if (!button) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      try {
        const key = window.OVYXAIStorageKey ? window.OVYXAIStorageKey() : 'ovyx.ai.preferences.v1';
        let serverError = '';
        let defaults = Object.assign({}, AI_PREFERENCE_DEFAULTS);
        try {
          const saved = await api(AI_PREFERENCES_ENDPOINT, jsonOptions('PUT', { preferences: defaults }));
          if (saved?.authority !== 'SERVER' || !saved.preferences) throw new Error('The server did not confirm the reset.');
          defaults = Object.assign({}, AI_PREFERENCE_DEFAULTS, saved.preferences);
          localStorage.setItem(key, JSON.stringify(defaults));
          window.OVYXAI = Object.assign({}, window.OVYXAI || {}, defaults);
        } catch (error) {
          serverError = String(error?.message || 'account reset could not be verified');
          localStorage.removeItem(key);
        }
        const settings = window.OVYXSettings;
        if (settings && typeof settings.show === 'function') settings.show('ai');
        const status = addStatus(document.querySelector('[data-settings-panel="ai"]'), 'ovyx-ai-preference-status', 'AI preference reset status');
        if (status) {
          status.textContent = serverError
            ? 'Device preferences were reset, but the account reset could not be verified: ' + serverError
            : 'AI preferences reset to defaults and verified by the server.';
          status.dataset.state = serverError ? 'warning' : 'ok';
        }
        notify(serverError ? 'Device AI preferences were reset, but the account reset needs attention.' : 'AI preferences reset on your account.', serverError ? 'warning' : 'success');
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
        // Appearance has one source of truth: ThemeContext (the saved appearance
        // plus its in-progress draft). The older Theme Lab renderer used to apply
        // its active preset every time the tab opened, overwriting custom colours.
        const lab = window.OVYXThemeLab;
        const originalLabApply = lab && typeof lab.apply === 'function' ? lab.apply : null;
        const protectAppearance = id === 'appearance' && !!window.ThemeContext
          && typeof window.ThemeContext.apply === 'function' && !!originalLabApply;
        if (protectAppearance) {
          lab.apply = function () {
            try { window.ThemeContext.apply(); } catch (_) {}
            try { lab.renderState && lab.renderState(); } catch (_) {}
          };
        }
        let result;
        try {
          result = originalShow(id);
        } finally {
          if (protectAppearance && lab) lab.apply = originalLabApply;
        }

        // Always reveal the same Profile renderer. The legacy shell markup is kept
        // only as a migration fallback; it must never return as a second profile UI.
        if (id === 'profile' && typeof window.OVYXProfile?.render === 'function') {
          try { window.OVYXProfile.render(); } catch (_) {}
        }
        if (id === 'profile') setTimeout(loadProfile, 0);
        if (id === 'notifications') setTimeout(loadNotifications, 0);
        if (id === 'usage') setTimeout(loadUsage, 0);
        if (id === 'workspace' || id === 'editor') setTimeout(installEditorMode, 0);
        if (id === 'ai') {
          setTimeout(syncAISettingsControls, 0);
          setTimeout(loadAIPreferencesFromServer, 0);
        }
        return result;
      };
      settings.__ovyxSettingsReliabilityV1 = true;
    }
    if (settings && settings.current === 'profile') setTimeout(loadProfile, 0);
    if (settings && settings.current === 'notifications') setTimeout(loadNotifications, 0);
    if (settings && settings.current === 'usage') setTimeout(loadUsage, 0);
    if (settings && settings.current === 'ai') {
      setTimeout(syncAISettingsControls, 0);
      setTimeout(loadAIPreferencesFromServer, 0);
    }
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
        if (settings.current === 'ai') loadAIPreferencesFromServer();
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
        if (settings.current === 'ai') loadAIPreferencesFromServer();
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
          notify('Creating a new project is not available in this workspace yet.', 'error');
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
  function installDestructiveConfirmationPreference() {
    const deletion = window.OVYXProjectDeletion;
    if (!deletion || typeof deletion.open !== 'function' ||
        deletion.open.__ovyxSettingsConfirmDeleteV1) return;
    const originalOpen = deletion.open.bind(deletion);
    const openWithPreference = function (projectId) {
      if (settingsState().confirmDelete !== false) return originalOpen(projectId);
      const id = String(projectId || '').trim();
      const listed = window.ProjectStore?.list?.();
      const state = window.KernelState;
      const inStore = Array.isArray(listed) && listed.some(project => String(project?.id || '') === id);
      const inState = Array.isArray(state?.projects) && state.projects.some(project => String(project?.id || '') === id);
      if (!id || !inStore || !inState || typeof this.confirm !== 'function') return originalOpen(projectId);
      this.target = id;
      return this.confirm();
    };
    openWithPreference.__ovyxSettingsConfirmDeleteV1 = true;
    deletion.open = openWithPreference;
    window.__OVYX_SETTINGS_CONFIRM_DELETE_INSTALLED__ = true;
  }
  const EXTERNAL_DATA_LAYER_CONFIG_KEY = 'ovyx.data.layer.external.v1';
  let externalDataLayerTimer = null;
  let externalDataLayerInFlight = false;
  let externalDataLayerPending = false;

  function readExternalDataLayerConfig() {
    return Object.assign({ endpoint: '', projectSync: false, consentedOrigin: '' }, safeJson(localStorage.getItem(EXTERNAL_DATA_LAYER_CONFIG_KEY)));
  }
  function saveExternalDataLayerConfig(patch) {
    const next = Object.assign({}, readExternalDataLayerConfig(), patch || {});
    try {
      localStorage.setItem(EXTERNAL_DATA_LAYER_CONFIG_KEY, JSON.stringify(next));
      return true;
    } catch (_) {
      externalDataLayerStatus('External Data API settings could not be saved on this device.', 'error');
      return false;
    }
  }
  function normaliseExternalDataLayerEndpoint(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let url;
    try { url = new URL(raw); } catch (_) { throw new Error('Enter a complete HTTPS URL for your external Data API.'); }
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) {
      throw new Error('The external Data API must use HTTPS. HTTP is allowed only for localhost development.');
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error('The Data API URL must not contain credentials, query parameters or a fragment.');
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href.replace(/\/$/, '');
  }
  function externalDataLayerStatus(message, state, syncedAt) {
    const text = String(message || 'No external metadata sync has completed.').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 420);
    const config = readExternalDataLayerConfig();
    config.lastSyncStatus = text;
    config.lastSyncState = String(state || 'info');
    if (syncedAt) config.lastSyncAt = syncedAt;
    try { localStorage.setItem(EXTERNAL_DATA_LAYER_CONFIG_KEY, JSON.stringify(config)); } catch (_) {}
    const panel = document.querySelector('[data-settings-panel="workspace"]');
    const status = panel && panel.querySelector('#ovyx-project-data-sync-status');
    if (status) {
      status.textContent = text;
      status.dataset.state = String(state || 'info');
      if (syncedAt) status.title = 'Last successful metadata sync: ' + new Date(syncedAt).toLocaleString();
    }
  }
  function ensureExternalDataLayerControls() {
    const panel = document.querySelector('[data-settings-panel="workspace"]');
    const endpointInput = panel && panel.querySelector('#ovyx-data-endpoint');
    if (!panel || !endpointInput) return false;
    const config = readExternalDataLayerConfig();
    if (config.endpoint && document.activeElement !== endpointInput) endpointInput.value = config.endpoint;

    let toggle = panel.querySelector('#ovyx-data-api-sync');
    if (!toggle) {
      const group = endpointInput.closest('.ovyx-pref-group') || endpointInput.parentElement || panel;
      const row = document.createElement('div');
      row.className = 'ovyx-pref-row ovyx-settings-data-api-sync-row-v1';
      row.innerHTML = '<div class="ovyx-pref-copy"><b>External Data API metadata sync</b><small>Optional. Sends project metadata only to the endpoint you approve; source files and secrets are not uploaded.</small></div><div class="ovyx-pref-control"><button type="button" class="ovyx-notify-toggle" id="ovyx-data-api-sync" role="switch" aria-checked="false" aria-label="External Data API metadata sync"><span></span></button></div>';
      group.appendChild(row);
      toggle = row.querySelector('#ovyx-data-api-sync');
    }
    if (toggle) toggle.setAttribute('aria-checked', String(config.projectSync === true));
    let status = panel.querySelector('#ovyx-project-data-sync-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'ovyx-project-data-sync-status';
      status.className = 'ovyx-connection-note';
      status.setAttribute('role', 'status');
      status.dataset.state = 'info';
      const row = toggle && toggle.closest('.ovyx-pref-row');
      (row && row.parentElement || panel).appendChild(status);
    }
    if (status && document.activeElement !== endpointInput) {
      const message = config.lastSyncStatus || (config.projectSync
        ? 'External metadata sync is enabled. Project source files and secrets are excluded.'
        : 'External metadata sync is off. Built-in OVYX cloud sync is separate.');
      if (status.textContent !== message) status.textContent = message;
      status.dataset.state = config.lastSyncState || 'info';
      if (config.lastSyncAt) status.title = 'Last successful metadata sync: ' + new Date(config.lastSyncAt).toLocaleString();
    }
    return true;
  }
  async function syncExternalProjectMetadata() {
    const config = readExternalDataLayerConfig();
    if (config.projectSync !== true || !config.endpoint) return false;
    if (externalDataLayerInFlight) {
      externalDataLayerPending = true;
      return false;
    }
    const user = currentUser();
    const project = window.KernelState && window.KernelState.activeProject;
    if (!user || !user.uid || typeof user.getIdToken !== 'function') {
      externalDataLayerStatus('External metadata sync is enabled, but sign-in is required before data can be sent.', 'error');
      return false;
    }
    if (!project || !project.id) return false;

    let endpoint;
    let endpointUrl;
    try {
      endpoint = normaliseExternalDataLayerEndpoint(config.endpoint);
      endpointUrl = new URL(endpoint);
    } catch (error) {
      externalDataLayerStatus(error.message || 'The external Data API URL is invalid.', 'error');
      return false;
    }
    const localOrigin = window.location.origin;
    if (endpointUrl.origin !== localOrigin && config.consentedOrigin !== endpointUrl.origin) {
      externalDataLayerStatus('Sync stopped because this endpoint has not been approved for sending a Firebase ID token. Turn sync on again to review the destination.', 'warning');
      return false;
    }

    const id = String(project.id).slice(0, 180);
    const metadata = {
      id,
      name: String(project.name || 'Untitled Project').slice(0, 160),
      description: String(project.description || '').slice(0, 2000),
      status: String(project.status || 'draft').slice(0, 40),
      schemaVersion: 1,
      updatedAt: String(project.updatedAt || project.updated_at || new Date().toISOString()).slice(0, 80),
      framework: String(project.framework || '').slice(0, 100),
      pageCount: Array.isArray(project.pages) ? Math.min(project.pages.length, 1000) : 0
    };
    const syncMarker = 'ovyx.data.layer.synced.v1.' + encodeURIComponent(String(user.uid)) + '.' + encodeURIComponent(id);
    const previouslyCreated = !!safeJson(localStorage.getItem(syncMarker)).syncedAt;
    const projectUrl = endpoint + '/projects' + (previouslyCreated ? '/' + encodeURIComponent(id) : '');
    let method = previouslyCreated ? 'PUT' : 'POST';
    externalDataLayerInFlight = true;
    externalDataLayerStatus('Sending project metadata to the approved Data API. Source files and secrets are excluded.', 'running');
    try {
      const token = await user.getIdToken(false);
      if (!token || typeof token !== 'string') throw new Error('The signed-in session did not provide an authentication token.');
      const send = async (requestMethod, requestUrl) => {
        const response = await fetch(requestUrl, {
          method: requestMethod,
          credentials: 'omit',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token
          },
          body: JSON.stringify({ projectId: id, project: metadata })
        });
        let data = null;
        try { data = await response.json(); }
        catch (_) { throw new Error('The Data API returned a non-JSON response; metadata sync was not confirmed.'); }
        if (!response.ok) throw Object.assign(new Error(String(data && (data.message || data.error) || ('Data API returned HTTP ' + response.status + '.')).slice(0, 240)), { status: response.status });
        if (!data || data.ok !== true) throw new Error(String(data && (data.message || data.error) || 'The Data API did not explicitly confirm the metadata write.').slice(0, 240));
        return data;
      };
      try {
        await send(method, projectUrl);
      } catch (error) {
        if (!previouslyCreated && error.status === 409) {
          method = 'PUT';
          await send('PUT', endpoint + '/projects/' + encodeURIComponent(id));
        } else if (previouslyCreated && error.status === 404) {
          method = 'POST';
          await send('POST', endpoint + '/projects');
        } else {
          throw error;
        }
      }
      const syncedAt = new Date().toISOString();
      try { localStorage.setItem(syncMarker, JSON.stringify({ syncedAt })); }
      catch (_) { throw new Error('The Data API accepted the metadata, but the browser could not record sync state.'); }
      externalDataLayerStatus('Project metadata sync succeeded for "' + metadata.name + '". Only the bounded project metadata was sent.', 'ok', syncedAt);
      return true;
    } catch (error) {
      externalDataLayerStatus('Project metadata sync failed: ' + String(error && error.message || 'The endpoint did not confirm the write.').slice(0, 260), 'error');
      notify('Project metadata sync failed. Check the configured Data API and its logs.', 'error');
      return false;
    } finally {
      externalDataLayerInFlight = false;
      if (externalDataLayerPending) {
        externalDataLayerPending = false;
        scheduleExternalProjectMetadataSync(650);
      }
    }
  }
  function scheduleExternalProjectMetadataSync(delay) {
    if (externalDataLayerTimer) clearTimeout(externalDataLayerTimer);
    externalDataLayerTimer = setTimeout(function () {
      externalDataLayerTimer = null;
      syncExternalProjectMetadata().catch(function () {});
    }, Math.max(100, Number(delay) || 650));
  }
  function installExternalDataLayerSync() {
    ensureExternalDataLayerControls();
    if (!document.documentElement.dataset.ovyxExternalDataLayerBound) {
      document.documentElement.dataset.ovyxExternalDataLayerBound = '1';
      window.addEventListener('click', function (event) {
        const toggle = event.target && event.target.closest && event.target.closest('#ovyx-data-api-sync');
        if (!toggle) return;
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        const before = toggle.getAttribute('aria-checked') === 'true';
        const input = document.querySelector('[data-settings-panel="workspace"] #ovyx-data-endpoint');
        let endpoint;
        try { endpoint = normaliseExternalDataLayerEndpoint(input && input.value); }
        catch (error) { externalDataLayerStatus(error.message, 'error'); return; }
        if (!before && !endpoint) {
          toggle.setAttribute('aria-checked', 'false');
          externalDataLayerStatus('Save a valid Data API endpoint before enabling external metadata sync.', 'error');
          return;
        }
        const next = !before;
        const nextConfig = Object.assign({}, readExternalDataLayerConfig(), { endpoint: endpoint || readExternalDataLayerConfig().endpoint });
        if (next && endpoint) {
          const destination = new URL(endpoint);
          if (destination.origin !== window.location.origin) {
            const accepted = window.confirm('Enable external metadata sync for ' + destination.origin + '? OVYX will send a Firebase ID token to this destination for authentication and send only project metadata, not source files or secrets. Continue only if you trust this endpoint.');
            if (!accepted) return;
            nextConfig.consentedOrigin = destination.origin;
          } else {
            nextConfig.consentedOrigin = destination.origin;
          }
        }
        nextConfig.projectSync = next;
        if (!saveExternalDataLayerConfig(nextConfig)) return;
        toggle.setAttribute('aria-checked', String(next));
        externalDataLayerStatus(next
          ? 'External metadata sync enabled. A project save will sync bounded project metadata only.'
          : 'External metadata sync disabled. Built-in OVYX cloud sync is unchanged.', 'ok');
        if (next) scheduleExternalProjectMetadataSync(120);
        else if (externalDataLayerTimer) { clearTimeout(externalDataLayerTimer); externalDataLayerTimer = null; }
      }, true);
      window.addEventListener('click', function (event) {
        const save = event.target && event.target.closest && event.target.closest('#ovyx-data-save');
        if (!save) return;
        const input = document.querySelector('[data-settings-panel="workspace"] #ovyx-data-endpoint');
        let endpoint;
        try { endpoint = normaliseExternalDataLayerEndpoint(input && input.value); }
        catch (_) { return; } // Let the main Data Layer action explain invalid endpoint input.
        const previous = readExternalDataLayerConfig();
        const nextConfig = Object.assign({}, previous, { endpoint });
        if (previous.projectSync === true) {
          if (!endpoint) {
            event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
            externalDataLayerStatus('The active Data API endpoint cannot be cleared while external metadata sync is enabled. Disable sync first.', 'error');
            return;
          }
          const destination = new URL(endpoint);
          if (destination.origin !== window.location.origin && previous.consentedOrigin !== destination.origin) {
            const accepted = window.confirm('Change the active Data API endpoint to ' + destination.origin + '? Future project metadata and a Firebase ID token will be sent to this destination. Continue only if you trust it.');
            if (!accepted) {
              event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
              if (input) input.value = previous.endpoint;
              externalDataLayerStatus('Endpoint change cancelled. The previously approved endpoint remains active.', 'info');
              return;
            }
            nextConfig.consentedOrigin = destination.origin;
          } else if (destination.origin === window.location.origin) {
            nextConfig.consentedOrigin = destination.origin;
          }
        } else {
          nextConfig.consentedOrigin = '';
        }
        if (!saveExternalDataLayerConfig(nextConfig)) {
          event.preventDefault(); event.stopImmediatePropagation();
          return;
        }
        if (nextConfig.projectSync === true) scheduleExternalProjectMetadataSync(120);
      }, true);
      document.addEventListener('firebase-auth-state-ready', function (event) {
        ensureExternalDataLayerControls();
        if (event && event.detail && event.detail.user) scheduleExternalProjectMetadataSync(900);
      }, { passive: true });
      window.addEventListener('ovyx:view-changed', function (event) {
        ensureExternalDataLayerControls();
        const view = String(event && event.detail && event.detail.view || '').replace(/^view-/, '');
        if (view === 'webstudio') scheduleExternalProjectMetadataSync(900);
      }, { passive: true });
      window.addEventListener('ovyx-settings-rendered', function () { setTimeout(ensureExternalDataLayerControls, 30); });
      const root = document.getElementById('view-settings');
      if (root && typeof MutationObserver === 'function') {
        const observer = new MutationObserver(function () { ensureExternalDataLayerControls(); });
        observer.observe(root, { childList: true, subtree: true });
      }
    }

    const store = window.ProjectStore;
    if (store && typeof store.save === 'function' && !store.save.__ovyxExternalDataLayerSyncV1) {
      const original = store.save;
      const wrapped = function () {
        const result = original.apply(this, arguments);
        const schedule = function (success) {
          if (success !== false && currentUser() && window.KernelState && window.KernelState.activeProject) scheduleExternalProjectMetadataSync(750);
        };
        if (result && typeof result.then === 'function') result.then(schedule).catch(function () {});
        else schedule(result);
        return result;
      };
      wrapped.__ovyxExternalDataLayerSyncV1 = true;
      store.save = wrapped;
    }
    const settings = window.OVYXSettings;
    if (settings && typeof settings.show === 'function' && !settings.__ovyxExternalDataLayerSyncV1) {
      const originalShow = settings.show.bind(settings);
      settings.show = function (id) {
        const result = originalShow(id);
        if (id === 'workspace') setTimeout(ensureExternalDataLayerControls, 25);
        return result;
      };
      settings.__ovyxExternalDataLayerSyncV1 = true;
    }
    if (currentUser() && window.KernelState && window.KernelState.activeProject) scheduleExternalProjectMetadataSync(1200);
  }

  function boot() {
    installGlobalProjectShortcuts();
    installExternalDataLayerSync();
    installProfileActions();
    installNotificationActions();
    installNotificationToastFilters();
    installWorkspaceOpenBehaviorActions();
    installWorkspaceToggleActions();
    installDestructiveConfirmationPreference();
    installAISettingsBridge();
    installAppearanceAndUsageHooks();
    bindAuthenticationRefresh();
    installLivePreviewBridge();
    if (currentUser()) {
      setTimeout(loadNotifications, 80);
      setTimeout(loadAIPreferencesFromServer, 120);
    }
    writeSettingsState(settingsState());
    const notifyPanel = notificationPanel();
    if (notifyPanel) {
      const paragraph = notifyPanel.querySelector('.ovyx-panel-head p');
      if (paragraph) paragraph.textContent = 'Choose which activity preferences to save to your account. Email preferences are saved, but email notifications will be available when delivery is enabled.';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
