(function () {
  'use strict';
  if (window.__OVYX_SETTINGS_RELIABILITY_V1__) return;
  window.__OVYX_SETTINGS_RELIABILITY_V1__ = true;

  const WORKSPACE_KEY = 'ovyx.settings.integrity.v83';
  const NOTIFY_KEY = 'ovyx.notifications.v1';
  const AI_PREFIX = 'ovyx.ai.preferences.v1';
  const PROFILE_PREFIX = 'ovyx.profile.v2';
  const PROJECT_PREFIX = 'ovyx.projects.v22';
  const GRAPH_PREFIX = 'ovyx.ws.graph.v2.';
  const LEGACY_GRAPH_PREFIX = 'ovyx.graph.';
  const STUDIO_SESSION_PREFIX = 'ovyx.webstudio.session.v5:';
  const RUNTIME_SESSION_KEY = 'ovyx.runtime.session.v4';
  const THEME_KEY = 'ovyx-theme';
  const APPEARANCE_KEY = 'ovyx.appearance.v3';
  const THEME_LAB_KEY = 'ovyx.theme.lab.v1';
  const DEFAULT_WORKSPACE = {
    openBehavior: 'Web Studio',
    autosave: true,
    confirmDelete: true,
    inspector: true,
    livePreview: true,
    aiSafe: true,
    editorMode: 'build'
  };
  const DEFAULT_AI = {
    mode: 'balanced',
    model: 'automatic',
    explain: true,
    preserve: true,
    confirmDestructive: false,
    contextFiles: true,
    contextPage: true,
    contextGithub: true,
    provider: 'gemini',
    routing: 'preferred',
    fallback: 'stop',
    contextLimit: 'automatic',
    generationBudget: 'automatic'
  };
  const DEFAULT_NOTIFICATIONS = {
    projectActivity: true,
    generationCompleted: true,
    deploymentStatus: true,
    aiUsageWarnings: true,
    billing: true,
    emailProductUpdates: true,
    emailSecurityAlerts: true
  };
  const $ = id => document.getElementById(id);
  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const clone = value => { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; } };
  const parse = raw => { try { const value = JSON.parse(raw || 'null'); return isObject(value) ? value : null; } catch (_) { return null; } };
  const local = key => { try { return parse(window.localStorage.getItem(key)); } catch (_) { return null; } };
  const localWrite = (key, value) => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { console.warn('[OVYX Settings] Local preference write failed:', String(error && error.message || error).slice(0, 120)); return false; }
  };
  const currentUser = () => { try { return window.firebase && window.firebase.auth && window.firebase.auth().currentUser || null; } catch (_) { return null; } };
  const toast = (message, type) => {
    try { if (typeof window.showToast === 'function') window.showToast(message, type || 'info'); else if (typeof window.toast === 'function') window.toast(message, type || 'info'); } catch (_) {}
  };
  const safeText = (value, max) => String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max || 200);
  const aiKey = () => {
    try { if (typeof window.OVYXAIStorageKey === 'function') return window.OVYXAIStorageKey(); } catch (_) {}
    const user = currentUser();
    return user && user.uid ? AI_PREFIX + '.user.' + String(user.uid) : AI_PREFIX + '.guest';
  };
  const profileKey = () => {
    const user = currentUser();
    return user && user.uid ? PROFILE_PREFIX + '.user.' + String(user.uid) : PROFILE_PREFIX + '.guest';
  };
  const normalizeEditorMode = value => {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'magic' || mode === 'build') return 'build';
    if (mode === 'advanced') return 'last-used';
    return ['plan', 'ask', 'fix', 'last-used'].includes(mode) ? mode : 'build';
  };
  function workspaceState() {
    const raw = local(WORKSPACE_KEY) || {};
    let runtime = {};
    try { runtime = window.OVYXSettingsIntegrity && typeof window.OVYXSettingsIntegrity.load === 'function' ? window.OVYXSettingsIntegrity.load() : {}; } catch (_) {}
    const state = Object.assign({}, DEFAULT_WORKSPACE, runtime, raw);
    state.editorMode = normalizeEditorMode(state.editorMode);
    state.autosave = state.autosave !== false;
    state.confirmDelete = state.confirmDelete !== false;
    state.inspector = state.inspector !== false;
    state.livePreview = state.livePreview !== false;
    state.aiSafe = state.aiSafe !== false;
    if (!['Web Studio', 'Last active view', 'Project overview'].includes(state.openBehavior)) state.openBehavior = 'Web Studio';
    return state;
  }
  function writeWorkspace(value) {
    const next = Object.assign({}, DEFAULT_WORKSPACE, isObject(value) ? value : {});
    next.editorMode = normalizeEditorMode(next.editorMode);
    if (window.OVYXSettingsIntegrity && typeof window.OVYXSettingsIntegrity.save === 'function') {
      try { window.OVYXSettingsIntegrity.save(next); } catch (_) { localWrite(WORKSPACE_KEY, next); }
    } else localWrite(WORKSPACE_KEY, next);
    const legacy = window.OVYXSettingsToggles;
    if (legacy && typeof legacy.load === 'function' && typeof legacy.save === 'function') {
      try {
        const old = legacy.load();
        const map = { autosave: 'autosave', confirmDelete: 'confirmDelete', inspector: 'inspector', livePreview: 'livePreview', aiSafe: 'aiSafe' };
        Object.keys(map).forEach(key => { old[map[key]] = next[key]; });
        legacy.save(old);
      } catch (_) {}
    }
    return next;
  }
  function aiState() {
    const raw = local(aiKey()) || (isObject(window.OVYXAI) ? window.OVYXAI : {});
    const out = Object.assign({}, DEFAULT_AI, raw);
    if (!['balanced', 'fast', 'quality'].includes(out.mode)) out.mode = 'balanced';
    if (!['automatic', 'gemini', 'anthropic', 'claude', 'deepseek', 'openai', 'groq', 'openrouter'].includes(String(out.provider || '').toLowerCase())) out.provider = 'automatic';
    if (!['automatic', 'gemini', 'anthropic', 'claude', 'deepseek', 'openai', 'groq', 'openrouter'].includes(String(out.model || '').toLowerCase())) out.model = 'automatic';
    if (!['automatic', 'preferred'].includes(out.routing)) out.routing = 'preferred';
    if (!['automatic', 'stop'].includes(out.fallback)) out.fallback = 'stop';
    if (!['automatic', 'conservative', 'expanded'].includes(out.contextLimit)) out.contextLimit = 'automatic';
    if (!['automatic', 'efficient', 'maximum'].includes(out.generationBudget)) out.generationBudget = 'automatic';
    ['explain', 'preserve', 'confirmDestructive', 'contextFiles', 'contextPage', 'contextGithub'].forEach(key => { out[key] = out[key] !== false; });
    return out;
  }
  function notificationState() {
    return Object.assign({}, DEFAULT_NOTIFICATIONS, local(NOTIFY_KEY) || {});
  }
  function profileState() {
    const raw = local(profileKey()) || {};
    const user = currentUser();
    return {
      displayName: safeText(raw.name || user && user.displayName || '', 60),
      workspaceName: safeText(raw.workspace || 'Creative Workspace', 60)
    };
  }
  function collectLocalSettings() {
    let appearance = local(THEME_KEY);
    if (!appearance) appearance = local(APPEARANCE_KEY);
    if (!appearance && window.ThemeContext && typeof window.ThemeContext.get === 'function') {
      try { appearance = window.ThemeContext.get(); } catch (_) {}
    }
    let themeLab = local(THEME_LAB_KEY);
    if (!themeLab && window.OVYXThemeLab && isObject(window.OVYXThemeLab.state)) themeLab = window.OVYXThemeLab.state;
    const workspace = workspaceState();
    const ai = aiState();
    const notifications = notificationState();
    const profile = profileState();
    const bundle = {};
    if (isObject(appearance)) bundle.appearance = appearance;
    if (isObject(themeLab)) bundle.themeLab = themeLab;
    if (isObject(workspace)) bundle.workspace = workspace;
    if (isObject(ai)) bundle.ai = ai;
    if (isObject(notifications)) bundle.notifications = notifications;
    if (profile.displayName || profile.workspaceName) bundle.profile = profile;
    return bundle;
  }

  let remoteSyncing = false;
  let remoteUserId = '';
  let syncPromise = null;
  let saveTimer = null;
  let manualProjectWriteDepth = 0;
  let pendingProjectSave = false;
  let previewPending = false;
  let forcePreviewRefresh = false;
  let aiWrapperInstalled = false;
  let previewWrapperInstalled = false;
  let setModeWrapperInstalled = false;
  let usageWarningDay = '';
  const syncStatus = () => $('ovyx-settings-sync-status');
  function setSyncStatus(message, state) {
    const el = syncStatus();
    if (el) {
      el.textContent = message;
      el.dataset.state = state || 'info';
      el.setAttribute('aria-live', 'polite');
    }
    const legacy = $('settings-save-status');
    if (legacy && message) legacy.textContent = message;
  }
  async function getToken(user) {
    if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in to sync Settings to your account.');
    return user.getIdToken(false);
  }
  async function requestPreferences(method, preferences) {
    const user = currentUser();
    if (!user) throw new Error('Settings are saved on this device. Sign in to sync them to your account.');
    const token = await getToken(user);
    const response = await fetch('/api/settings/preferences', {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
        ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {})
      },
      ...(method === 'PUT' ? { body: JSON.stringify({ preferences: preferences }) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      const message = data.message || data.error || ('Settings sync failed with HTTP ' + response.status + '.');
      throw Object.assign(new Error(message), { status: response.status, code: data.code || 'SETTINGS_SYNC_FAILED' });
    }
    return data;
  }
  function applyRemotePreferences(preferences) {
    if (!isObject(preferences)) return;
    remoteSyncing = true;
    try {
      if (isObject(preferences.appearance)) {
        localWrite(THEME_KEY, preferences.appearance);
        localWrite(APPEARANCE_KEY, {
          mode: preferences.appearance.mode || 'dark',
          density: preferences.appearance.density || 'balanced',
          scale: preferences.appearance.scale || 'balanced',
          motion: preferences.appearance.motion || 'full'
        });
      }
      if (isObject(preferences.themeLab)) {
        localWrite(THEME_LAB_KEY, preferences.themeLab);
        if (window.OVYXThemeLab) {
          window.OVYXThemeLab.state = clone(preferences.themeLab) || preferences.themeLab;
          try { window.OVYXThemeLab.renderState && window.OVYXThemeLab.renderState(); } catch (_) {}
        }
      }
      if (isObject(preferences.workspace)) {
        const mergedWorkspace = Object.assign({}, workspaceState(), preferences.workspace);
        writeWorkspace(mergedWorkspace);
      }
      if (isObject(preferences.ai)) {
        const mergedAI = Object.assign({}, aiState(), preferences.ai);
        localWrite(aiKey(), mergedAI);
        window.OVYXAI = mergedAI;
      }
      if (isObject(preferences.notifications)) {
        localWrite(NOTIFY_KEY, Object.assign({}, notificationState(), preferences.notifications));
      }
      if (isObject(preferences.profile)) {
        const key = profileKey();
        const stored = local(key) || {};
        const mergedProfile = Object.assign({}, stored);
        if (preferences.profile.displayName) mergedProfile.name = safeText(preferences.profile.displayName, 60);
        if (preferences.profile.workspaceName) mergedProfile.workspace = safeText(preferences.profile.workspaceName, 60);
        localWrite(key, mergedProfile);
        const u = currentUser();
        if (u && preferences.profile.displayName && u.displayName !== preferences.profile.displayName && typeof u.updateProfile === 'function') {
          u.updateProfile({ displayName: preferences.profile.displayName }).catch(error => {
            console.warn('[OVYX Settings] Firebase display-name sync failed:', String(error && error.message || error).slice(0, 120));
          });
        }
      }
      try {
        if (window.ThemeContext && typeof window.ThemeContext.set === 'function' && isObject(preferences.appearance)) {
          window.ThemeContext.set(preferences.appearance);
          if (typeof window.ThemeContext.save === 'function') window.ThemeContext.save();
        } else if (window.ThemeContext && typeof window.ThemeContext.apply === 'function') window.ThemeContext.apply();
      } catch (error) { console.warn('[OVYX Settings] Theme restoration failed:', String(error && error.message || error).slice(0, 120)); }
      try { window.OVYXSettings && window.OVYXSettings.syncAppearance && window.OVYXSettings.syncAppearance(); } catch (_) {}
      try { window.OVYXSettings && window.OVYXSettings.renderThemeCards && window.OVYXSettings.renderThemeCards(); } catch (_) {}
      window.OVYXAI = aiState();
      refreshSettingsControls();
      applyInspectorPreference();
      applyEditorMode();
      refreshTokenMeter();
    } finally {
      remoteSyncing = false;
    }
  }
  async function syncAccountSettings(force) {
    const user = currentUser();
    const uid = safeText(user && user.uid || '', 180);
    if (!uid) {
      remoteUserId = '';
      setSyncStatus('Saved on this device. Sign in to sync Settings across devices.', 'local');
      return false;
    }
    if (!force && uid === remoteUserId && syncPromise) return syncPromise;
    if (!force && uid === remoteUserId && remoteUserId) return true;
    remoteUserId = uid;
    syncPromise = (async function () {
      try {
        const data = await requestPreferences('GET');
        if (data.found && isObject(data.preferences)) applyRemotePreferences(data.preferences);
        const localBundle = collectLocalSettings();
        if (Object.keys(localBundle).length) {
          const saved = await requestPreferences('PUT', localBundle);
          if (isObject(saved.preferences)) applyRemotePreferences(saved.preferences);
        }
        setSyncStatus('Settings saved on this device and synced to your OVYX account.', 'success');
        return true;
      } catch (error) {
        setSyncStatus('Settings are saved on this device, but account sync failed: ' + String(error && error.message || 'try again'), 'error');
        console.warn('[OVYX Settings] Account sync failed:', String(error && (error.code || error.message) || 'unavailable').slice(0, 180));
        return false;
      } finally {
        syncPromise = null;
      }
    })();
    return syncPromise;
  }
  async function saveAccountSettings() {
    if (remoteSyncing) return false;
    const user = currentUser();
    if (!user) {
      setSyncStatus('Settings saved on this device. Sign in to sync them to your account.', 'local');
      return false;
    }
    try {
      const result = await requestPreferences('PUT', collectLocalSettings());
      if (isObject(result.preferences)) {
        // Keep server-normalized values authoritative without generating another save loop.
        applyRemotePreferences(result.preferences);
      }
      setSyncStatus('Settings saved on this device and synced to your OVYX account.', 'success');
      return true;
    } catch (error) {
      setSyncStatus('Local Settings remain available, but account sync failed: ' + String(error && error.message || 'retry from Settings'), 'error');
      console.warn('[OVYX Settings] Save failed:', String(error && (error.code || error.message) || 'unavailable').slice(0, 180));
      return false;
    }
  }
  function scheduleAccountSave(delay) {
    if (remoteSyncing) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      saveAccountSettings();
    }, Number.isFinite(delay) ? delay : 650);
  }

  function findEditorModeSelect() {
    const panel = document.querySelector('#view-settings [data-settings-panel="editor"]');
    if (!panel) return null;
    let select = panel.querySelector('#set-editor-mode');
    if (select) return select;
    const rows = Array.from(panel.querySelectorAll('.ovyx-pref-row'));
    const row = rows.find(item => /default web studio mode/i.test(item.textContent || ''));
    select = row && row.querySelector('select');
    if (!select) return null;
    select.id = 'set-editor-mode';
    return select;
  }
  function ensureEditorModeControl() {
    const select = findEditorModeSelect();
    if (!select) return;
    const expected = [
      ['build', 'Build (Magic)'],
      ['plan', 'Plan'],
      ['ask', 'Ask'],
      ['fix', 'Fix'],
      ['last-used', 'Last used']
    ];
    const current = normalizeEditorMode(workspaceState().editorMode);
    if (select.dataset.ovyxSettingsModeVersion !== '1') {
      select.innerHTML = expected.map(item => '<option value="' + item[0] + '">' + item[1] + '</option>').join('');
      select.dataset.ovyxSettingsModeVersion = '1';
    }
    select.value = current;
    const row = select.closest('.ovyx-pref-row');
    if (row) {
      const small = row.querySelector('small');
      if (small) small.textContent = 'Choose the default Build, Plan, Ask or Fix mode. Last used restores the most recent Web Studio mode.';
    }
    if (!select.dataset.ovyxSettingsBound) {
      select.dataset.ovyxSettingsBound = '1';
      select.addEventListener('change', function () {
        const state = workspaceState();
        state.editorMode = normalizeEditorMode(select.value);
        writeWorkspace(state);
        applyEditorMode();
        scheduleAccountSave();
        setWorkspaceStatus(state.editorMode === 'last-used' ? 'Web Studio will restore the last mode you used.' : 'Default Web Studio mode saved.');
      });
    }
  }
  function activeView() {
    return String(window.KernelState && window.KernelState.activeView || '').replace(/^view-/, '');
  }
  function lastStudioMode() {
    try {
      const value = window.localStorage.getItem('ovyx.settings.last-ws-mode.v1');
      return ['build', 'plan', 'ask', 'fix'].includes(value) ? value : 'build';
    } catch (_) { return 'build'; }
  }
  function applyEditorMode() {
    const state = workspaceState();
    const mode = state.editorMode === 'last-used' ? lastStudioMode() : state.editorMode;
    const studio = window.WebStudio;
    if (studio && typeof studio.setMode === 'function' && activeView() === 'webstudio' && ['build', 'plan', 'ask', 'fix'].includes(mode)) {
      try { studio.setMode(mode); } catch (error) { console.warn('[OVYX Settings] Default editor mode could not be applied:', String(error && error.message || error).slice(0, 100)); }
    }
    const select = findEditorModeSelect();
    if (select) select.value = state.editorMode;
  }
  function installStudioModeHook() {
    const studio = window.WebStudio;
    if (!studio || typeof studio.setMode !== 'function' || setModeWrapperInstalled || studio.setMode.__ovyxSettingsModeWrapped) return;
    const original = studio.setMode;
    const wrapped = function (mode) {
      const result = original.apply(this, arguments);
      const next = String(this.mode || mode || '').toLowerCase();
      if (['build', 'plan', 'ask', 'fix'].includes(next)) {
        try { window.localStorage.setItem('ovyx.settings.last-ws-mode.v1', next); } catch (_) {}
        if (!applyingDefaultEditorMode) {
          const state = workspaceState();
          if (state.editorMode === 'last-used') {
            refreshSettingsControls();
            scheduleAccountSave();
          }
        }
      }
      return result;
    };
    wrapped.__ovyxSettingsModeWrapped = true;
    studio.setMode = wrapped;
    setModeWrapperInstalled = true;
  }
  let applyingDefaultEditorMode = false;
  function setDefaultEditorMode() {
    ensureEditorModeControl();
    installStudioModeHook();
    if (activeView() !== 'webstudio') return;
    applyingDefaultEditorMode = true;
    try { applyEditorMode(); } finally { applyingDefaultEditorMode = false; }
  }

  function setWorkspaceStatus(message) {
    const status = $('ovyx-settings-workspace-status');
    if (status) status.textContent = message;
  }
  function refreshWorkspaceControls() {
    const state = workspaceState();
    const map = {
      'set-autosave': 'autosave',
      'set-confirm-delete': 'confirmDelete',
      'set-inspector': 'inspector',
      'set-live-preview': 'livePreview',
      'set-ai-safe': 'aiSafe'
    };
    Object.keys(map).forEach(id => {
      const button = $(id);
      if (button) {
        button.setAttribute('aria-checked', String(Boolean(state[map[id]])));
        button.setAttribute('aria-label', map[ id ] === 'autosave' ? 'Automatically save project changes' : button.getAttribute('aria-label') || map[id]);
      }
    });
    const saveButton = $('ovyx-settings-save-now');
    if (saveButton) saveButton.textContent = 'Save Project Now';
    const note = $('ovyx-settings-workspace-status');
    if (note) {
      note.textContent = state.autosave
        ? 'Autosave is ON. You can still save a project manually.'
        : (pendingProjectSave ? 'Autosave is OFF. Unsaved project changes are pending; use Save Project Now before refreshing.' : 'Autosave is OFF. Project-list and Web Studio graph writes are paused until you save manually.');
    }
  }
  function ensureWorkspaceControls() {
    const panel = document.querySelector('#view-settings [data-settings-panel="workspace"]');
    if (!panel) return;
    let wrap = $('ovyx-settings-manual-save');
    if (!wrap || !panel.contains(wrap)) {
      wrap = document.createElement('div');
      wrap.id = 'ovyx-settings-manual-save';
      wrap.className = 'ovyx-pref-group';
      wrap.innerHTML = '<div class="ovyx-pref-label">PROJECT PERSISTENCE</div><div class="ovyx-pref-row"><div class="ovyx-pref-copy"><b>Manual save</b><small>Persist the active project and Web Studio graph to this device.</small></div><div class="ovyx-pref-control"><button type="button" id="ovyx-settings-save-now" class="ovyx-settings-btn primary">Save Project Now</button></div></div><p id="ovyx-settings-workspace-status" class="ovyx-health-chip" aria-live="polite"></p>';
      panel.appendChild(wrap);
      wrap.querySelector('#ovyx-settings-save-now').addEventListener('click', saveProjectNow);
    }
    refreshWorkspaceControls();
  }
  let nativeStorageSetItem = null;
  function isProjectPersistenceKey(key) {
    return key === PROJECT_PREFIX + '.guest' ||
      key.indexOf(PROJECT_PREFIX + '.user.') === 0 ||
      key.indexOf(GRAPH_PREFIX) === 0 ||
      key.indexOf(LEGACY_GRAPH_PREFIX) === 0 ||
      key.indexOf(STUDIO_SESSION_PREFIX) === 0 ||
      key === RUNTIME_SESSION_KEY;
  }
  function installAutosavePolicy() {
    if (nativeStorageSetItem || !window.Storage || !window.Storage.prototype) return;
    nativeStorageSetItem = window.Storage.prototype.setItem;
    window.Storage.prototype.setItem = function (key, value) {
      try {
        if (this === window.localStorage && manualProjectWriteDepth === 0 && isProjectPersistenceKey(String(key)) && workspaceState().autosave === false) {
          pendingProjectSave = true;
          refreshWorkspaceControls();
          return;
        }
      } catch (_) {}
      return nativeStorageSetItem.call(this, key, value);
    };
  }
  function saveProjectNow() {
    const state = window.KernelState;
    if (!state || !Array.isArray(state.projects)) {
      setWorkspaceStatus('There is no loaded project list to save.');
      toast('Project data is not ready to save.', 'error');
      return false;
    }
    manualProjectWriteDepth += 1;
    try {
      const studio = window.WebStudio;
      if (studio && typeof studio.syncGraphToProject === 'function' && state.activeProject) {
        try { studio.syncGraphToProject(false); } catch (error) { console.warn('[OVYX Settings] Graph snapshot failed:', String(error && error.message || error).slice(0, 120)); }
      }
      if (state.activeProject && studio && studio.graph) state.activeProject.ovyxGraph = clone(studio.graph) || studio.graph;
      if (window.ProjectStore && typeof window.ProjectStore.save === 'function') window.ProjectStore.save();
      const user = currentUser();
      const key = user && user.uid ? PROJECT_PREFIX + '.user.' + user.uid : PROJECT_PREFIX + '.guest';
      nativeStorageSetItem ? nativeStorageSetItem.call(window.localStorage, key, JSON.stringify(state.projects)) : window.localStorage.setItem(key, JSON.stringify(state.projects));
      if (state.activeProject && studio && studio.graph) {
        const graphKey = GRAPH_PREFIX + String(state.activeProject.id || 'unknown');
        const graphValue = JSON.stringify(studio.graph);
        nativeStorageSetItem ? nativeStorageSetItem.call(window.localStorage, graphKey, graphValue) : window.localStorage.setItem(graphKey, graphValue);
      }
      try { window.OVYXRuntimeSession && window.OVYXRuntimeSession.save && window.OVYXRuntimeSession.save(); } catch (_) {}
      pendingProjectSave = false;
      refreshWorkspaceControls();
      setWorkspaceStatus('Project and Web Studio graph saved to this device.');
      toast('Project saved to this device.', 'success');
      scheduleAccountSave(50);
      return true;
    } catch (error) {
      setWorkspaceStatus('Project save failed: ' + String(error && error.message || error).slice(0, 120));
      toast('Project save failed. Check device storage and try again.', 'error');
      return false;
    } finally {
      manualProjectWriteDepth = Math.max(0, manualProjectWriteDepth - 1);
    }
  }
  function applyInspectorPreference() {
    const element = $('ws-select-inspector');
    if (!element) return;
    const enabled = workspaceState().inspector !== false;
    element.hidden = !enabled;
    element.style.display = enabled ? '' : 'none';
    element.setAttribute('aria-hidden', String(!enabled));
  }
  function updatePreviewButton() {
    const button = $('ovyx-settings-refresh-preview');
    const state = workspaceState();
    if (button) {
      button.hidden = state.livePreview !== false;
      button.textContent = previewPending ? 'Refresh Preview Now (updates pending)' : 'Refresh Preview Now';
    }
  }
  function installLivePreviewPolicy() {
    const studio = window.WebStudio;
    if (!studio || typeof studio.renderPreview !== 'function' || previewWrapperInstalled || studio.renderPreview.__ovyxSettingsPreviewWrapped) return;
    const original = studio.renderPreview;
    const wrapped = function () {
      if (workspaceState().livePreview === false && !forcePreviewRefresh) {
        previewPending = true;
        updatePreviewButton();
        return false;
      }
      const result = original.apply(this, arguments);
      previewPending = false;
      updatePreviewButton();
      return result;
    };
    wrapped.__ovyxSettingsPreviewWrapped = true;
    wrapped.__ovyxSettingsPreviewOriginal = original;
    studio.renderPreview = wrapped;
    previewWrapperInstalled = true;
    updatePreviewButton();
  }
  function refreshPreviewNow() {
    const studio = window.WebStudio;
    if (!studio || typeof studio.renderPreview !== 'function') {
      toast('Web Studio preview is not ready yet.', 'error');
      return false;
    }
    forcePreviewRefresh = true;
    try {
      const wrapped = studio.renderPreview;
      const original = wrapped.__ovyxSettingsPreviewOriginal || wrapped;
      original.call(studio);
      previewPending = false;
      updatePreviewButton();
      toast('Web Studio preview refreshed.', 'success');
      return true;
    } catch (error) {
      toast('Preview refresh failed: ' + String(error && error.message || error).slice(0, 100), 'error');
      return false;
    } finally {
      forcePreviewRefresh = false;
    }
  }
  function applyWorkspaceMode() {
    applyInspectorPreference();
    if (workspaceState().livePreview !== false && previewPending) refreshPreviewNow();
    refreshWorkspaceControls();
    updatePreviewButton();
  }
  function handleWorkspaceToggle(event) {
    const button = event.target && event.target.closest && event.target.closest('#view-settings .ovyx-toggle');
    if (!button) return;
    const mapping = {
      'set-autosave': 'autosave',
      'set-confirm-delete': 'confirmDelete',
      'set-inspector': 'inspector',
      'set-live-preview': 'livePreview',
      'set-ai-safe': 'aiSafe'
    };
    const key = mapping[button.id];
    if (!key) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const state = workspaceState();
    state[key] = !Boolean(state[key]);
    writeWorkspace(state);
    button.setAttribute('aria-checked', String(state[key]));
    if (key === 'autosave') {
      if (state.autosave && pendingProjectSave) saveProjectNow();
      else setWorkspaceStatus(state.autosave
        ? 'Autosave enabled. Future project changes will be stored automatically.'
        : 'Autosave disabled. Use Save Project Now to keep pending changes before refreshing.');
    }
    if (key === 'confirmDelete') setWorkspaceStatus(state.confirmDelete ? 'Project deletion confirmation is enabled.' : 'Project deletion confirmation is disabled. Deletion actions may proceed without a second confirmation.');
    if (key === 'aiSafe') setWorkspaceStatus(state.aiSafe ? 'AI safe-generation preference enabled.' : 'AI safe-generation preference disabled; platform security restrictions still apply.');
    applyWorkspaceMode();
    scheduleAccountSave();
    toast(key.replace(/([A-Z])/g, ' $1') + (state[key] ? ' enabled.' : ' disabled.'), 'success');
  }

  function ensureAIControlOptions() {
    const panel = document.querySelector('#view-settings [data-settings-panel="ai"]');
    if (!panel) return;
    const labels = Array.from(panel.querySelectorAll('.ovyx-pref-row'));
    const modelRow = panel.querySelector('#set-ai-model') && panel.querySelector('#set-ai-model').closest('.ovyx-pref-row');
    if (modelRow) {
      const strong = modelRow.querySelector('b');
      const small = modelRow.querySelector('small');
      if (strong) strong.textContent = 'Preferred AI engine';
      if (small) small.textContent = 'Select a provider route; Automatic uses OVYX server routing.';
    }
    const routing = panel.querySelector('#set-ai-routing');
    if (routing) {
      routing.innerHTML = '<option value="automatic">Automatic server routing</option><option value="preferred">Preferred provider only</option>';
      routing.value = aiState().routing;
    }
    const fallback = panel.querySelector('#set-ai-fallback');
    if (fallback) {
      fallback.innerHTML = '<option value="automatic">Use server-managed fallback</option><option value="stop">Stop on provider failure</option>';
      fallback.value = aiState().fallback;
    }
    const advanced = panel.querySelector('.ovyx-ai-advanced-body');
    if (advanced) {
      const selects = Array.from(advanced.querySelectorAll('select'));
      if (selects[2]) {
        selects[2].id = 'set-ai-context-limit';
        selects[2].innerHTML = '<option value="automatic">Automatic</option><option value="conservative">Conservative</option><option value="expanded">Expanded</option>';
        selects[2].value = aiState().contextLimit;
      }
      if (selects[3]) {
        selects[3].id = 'set-ai-generation-budget';
        selects[3].innerHTML = '<option value="automatic">Automatic</option><option value="efficient">Efficient</option><option value="maximum">Maximum</option>';
        selects[3].value = aiState().generationBudget;
      }
    }
  }
  function syncAIControls() {
    const state = aiState();
    const panel = document.querySelector('#view-settings [data-settings-panel="ai"]');
    if (!panel) return;
    const model = panel.querySelector('#set-ai-model');
    if (model) model.value = state.model;
    const provider = panel.querySelector('#set-provider');
    if (provider) provider.value = state.provider;
    const routing = panel.querySelector('#set-ai-routing');
    if (routing) routing.value = state.routing;
    const fallback = panel.querySelector('#set-ai-fallback');
    if (fallback) fallback.value = state.fallback;
    const context = panel.querySelector('#set-ai-context-limit');
    if (context) context.value = state.contextLimit;
    const budget = panel.querySelector('#set-ai-generation-budget');
    if (budget) budget.value = state.generationBudget;
  }
  function saveAIControls() {
    const panel = document.querySelector('#view-settings [data-settings-panel="ai"]');
    if (!panel) return;
    const state = aiState();
    const model = panel.querySelector('#set-ai-model');
    const provider = panel.querySelector('#set-provider');
    const routing = panel.querySelector('#set-ai-routing');
    const fallback = panel.querySelector('#set-ai-fallback');
    const context = panel.querySelector('#set-ai-context-limit');
    const budget = panel.querySelector('#set-ai-generation-budget');
    if (model) state.model = model.value || 'automatic';
    if (provider) state.provider = provider.value || 'automatic';
    if (routing) state.routing = routing.value || 'preferred';
    if (fallback) state.fallback = fallback.value || 'stop';
    if (context) state.contextLimit = context.value || 'automatic';
    if (budget) state.generationBudget = budget.value || 'automatic';
    ['explain', 'preserve', 'confirmDestructive', 'contextFiles', 'contextPage', 'contextGithub'].forEach(key => {
      const input = panel.querySelector('[data-ai-pref="' + key + '"]');
      if (input) state[key] = Boolean(input.checked);
    });
    localWrite(aiKey(), state);
    window.OVYXAI = state;
    scheduleAccountSave();
    toast('AI preferences saved and applied to new AI requests.', 'success');
  }
  function addNotificationTestControl() {
    const panel = document.querySelector('#view-settings [data-settings-panel="notifications"]');
    if (!panel) return;
    const actions = panel.querySelector('.ovyx-theme-actions');
    if (actions && !panel.querySelector('#ovyx-settings-test-notification')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'ovyx-settings-test-notification';
      button.className = 'ovyx-settings-btn';
      button.textContent = 'Test Desktop Notification';
      actions.appendChild(button);
      button.addEventListener('click', testDesktopNotification);
    }
    let note = panel.querySelector('#ovyx-settings-email-delivery-note');
    if (!note) {
      note = document.createElement('p');
      note.id = 'ovyx-settings-email-delivery-note';
      note.className = 'ovyx-health-chip';
      note.textContent = 'Email options are saved as account preferences. Actual email delivery requires a configured OVYX mail service.';
      const emailGroup = Array.from(panel.querySelectorAll('.ovyx-pref-group')).find(group => /EMAIL/.test(group.querySelector('.ovyx-pref-label') && group.querySelector('.ovyx-pref-label').textContent || ''));
      if (emailGroup) emailGroup.appendChild(note);
    }
  }
  async function testDesktopNotification() {
    if (!('Notification' in window)) {
      toast('This browser does not support desktop notifications. Your in-app settings remain saved.', 'error');
      return false;
    }
    let permission = window.Notification.permission;
    if (permission !== 'granted') {
      try { permission = await window.Notification.requestPermission(); }
      catch (_) { permission = 'denied'; }
    }
    if (permission !== 'granted') {
      toast('Desktop notifications are blocked by browser permission settings.', 'error');
      return false;
    }
    try {
      const notification = new window.Notification('OVYX Notifications Are Working', {
        body: 'This is a test notification from your Settings preferences.',
        tag: 'ovyx-settings-test'
      });
      notification.onclick = function () { try { window.focus(); } catch (_) {} };
      toast('Test desktop notification sent.', 'success');
      return true;
    } catch (error) {
      toast('The browser could not show a desktop notification: ' + String(error && error.message || error).slice(0, 100), 'error');
      return false;
    }
  }
  function notify(category, title, message, options) {
    const prefs = notificationState();
    if (prefs[category] !== true) return false;
    if (typeof window.Notification !== 'function' || window.Notification.permission !== 'granted') return false;
    if (document.visibilityState !== 'hidden' && !(options && options.force)) return false;
    try {
      const notification = new window.Notification(safeText(title || 'OVYX Update', 120), {
        body: safeText(message || '', 500),
        tag: 'ovyx-' + category,
        ...(options && options.data ? { data: options.data } : {})
      });
      notification.onclick = function () { try { window.focus(); } catch (_) {} };
      return true;
    } catch (_) { return false; }
  }
  async function warnUsageIfNeeded(result) {
    const prefs = notificationState();
    if (!prefs.aiUsageWarnings) return;
    let quota = result && result.quota && isObject(result.quota) ? result.quota : null;
    if (!quota || quota.monthlyLimit == null) {
      const user = currentUser();
      if (!user) return;
      try {
        const token = await getToken(user);
        const response = await fetch('/api/tokens/balance', {
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
          credentials: 'same-origin',
          cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok !== true) return;
        quota = data;
      } catch (_) { return; }
    }
    const limit = Number(quota.monthlyLimit || quota.monthlyTokenLimit || 0);
    const remaining = Number(quota.current_monthly_tokens != null ? quota.current_monthly_tokens : quota.baseRemaining);
    const daily = Number(quota.daily_prompts_allowance);
    if (!limit || !Number.isFinite(remaining)) return;
    const ratio = Math.max(0, Math.min(1, remaining / limit));
    if (ratio > 0.2 && !(Number.isFinite(daily) && daily <= 1)) return;
    const day = new Date().toISOString().slice(0, 10);
    const warnKey = 'ovyx.settings.quota-warning.v1';
    let prior = '';
    try { prior = window.localStorage.getItem(warnKey) || ''; } catch (_) {}
    if (prior === day) return;
    try { window.localStorage.setItem(warnKey, day); } catch (_) {}
    const label = Math.round(ratio * 100) + '% of monthly AI tokens remain' + (Number.isFinite(daily) ? '; ' + daily + ' daily prompts remain.' : '.');
    if (!notify('aiUsageWarnings', 'OVYX AI usage warning', label, { force: document.visibilityState !== 'hidden' })) {
      if (document.visibilityState !== 'hidden') toast(label, 'info');
    }
  }
  function installNotificationEvents() {
    if (window.__OVYX_SETTINGS_NOTIFICATION_EVENTS__) return;
    window.__OVYX_SETTINGS_NOTIFICATION_EVENTS__ = true;
    window.addEventListener('ovyx:project-saved', function () {
      notify('projectActivity', 'OVYX project saved', 'Your current project was saved.', {});
    });
    window.addEventListener('ovyx:deployment-started', function (event) {
      notify('deploymentStatus', 'OVYX deployment started', safeText(event && event.detail && event.detail.message || 'A deployment has started.', 500), {});
    });
    window.addEventListener('ovyx:deployment-succeeded', function (event) {
      notify('deploymentStatus', 'OVYX deployment succeeded', safeText(event && event.detail && event.detail.message || 'Your deployment completed successfully.', 500), {});
    });
    window.addEventListener('ovyx:deployment-failed', function (event) {
      notify('deploymentStatus', 'OVYX deployment failed', safeText(event && event.detail && event.detail.message || 'A deployment failed. Open OVYX to review the details.', 500), {});
    });
  }
  function installAISettingsWrapper() {
    const service = window.OVYXAIService;
    if (!service || typeof service.generate !== 'function' || service.generate.__ovyxSettingsWrapped || aiWrapperInstalled) return;
    const original = service.generate.bind(service);
    const wrapped = async function (payload, options) {
      const incoming = isObject(payload) ? payload : {};
      const preferences = aiState();
      const next = Object.assign({}, incoming);
      const selectedProvider = String(preferences.model && preferences.model !== 'automatic' ? preferences.model : preferences.provider || 'automatic').toLowerCase();
      const requested = String(incoming.provider || incoming.requestedProvider || '').toLowerCase();
      if (!requested || requested === 'automatic' || requested === 'auto') {
        next.provider = (preferences.routing === 'preferred' || preferences.fallback === 'stop')
          ? (selectedProvider || 'automatic')
          : 'automatic';
      } else {
        next.provider = incoming.provider || incoming.requestedProvider;
      }
      if ((!incoming.model || incoming.model === 'automatic') && preferences.model && preferences.model !== 'automatic' && ['gemini', 'anthropic', 'claude', 'deepseek', 'openai', 'groq', 'openrouter'].indexOf(preferences.model) < 0) {
        next.model = preferences.model;
      }
      if (preferences.contextFiles === false) {
        next.files = null;
      }
      if (isObject(incoming.context)) {
        const context = Object.assign({}, incoming.context);
        if (preferences.contextFiles === false) {
          delete context.files;
          delete context.projectFiles;
          delete context.sourceFiles;
          delete context.fileGraph;
        }
        if (preferences.contextPage === false) {
          ['activePage', 'currentPage', 'page', 'activePageId', 'activePageSlug', 'selectedPage'].forEach(key => { delete context[key]; });
        }
        if (preferences.contextGithub === false) {
          ['github', 'repository', 'repo', 'repositoryContext', 'githubContext', 'branches', 'pullRequests'].forEach(key => { delete context[key]; });
        }
        next.context = context;
      }
      const instructions = [
        'OVYX ACCOUNT AI PREFERENCES:',
        'Generation style: ' + preferences.mode + '.',
        preferences.preserve ? 'Preserve existing project structure and unrelated working code unless the user explicitly asks to replace it.' : 'Make the requested changes directly while still preserving unrelated user data and following platform safety rules.',
        preferences.explain ? 'After significant edits, briefly explain what changed and what was actually verified.' : 'Keep change explanations brief and focus on the deliverable.',
        preferences.confirmDestructive ? 'Before destructive edits, deleting files, or irreversible project changes, describe the impact and ask the user to confirm.' : 'Still respect platform safeguards and never claim destructive operations happened unless they were actually performed.',
        preferences.contextFiles ? 'Use supplied project files when relevant.' : 'Do not depend on project file contents in your reasoning; ask for the required details instead of inventing file state.',
        preferences.contextPage ? 'Use the current page context when it is supplied.' : 'Do not assume an active page from context.',
        preferences.contextGithub ? 'Use connected repository context only when it is present and relevant.' : 'Do not rely on GitHub/repository context for this request.',
        preferences.generationBudget === 'efficient' ? 'Prefer a compact implementation and concise output.' : preferences.generationBudget === 'maximum' ? 'Use additional reasoning and detail for a thorough implementation when the task warrants it.' : '',
        preferences.contextLimit === 'conservative' ? 'Keep supplied context narrowly focused on the files and requirements needed for this task.' : preferences.contextLimit === 'expanded' ? 'Use all relevant supplied context, but do not fabricate missing information.' : ''
      ].filter(Boolean).join('\n');
      next.system = [String(incoming.system || '').trim(), instructions].filter(Boolean).join('\n\n').slice(0, 18000);
      if (preferences.generationBudget === 'efficient') next.maxTokens = Math.min(Number(incoming.maxTokens) || 4096, 2048);
      else if (preferences.generationBudget === 'maximum') next.maxTokens = Math.max(Number(incoming.maxTokens) || 4096, 8192);
      else if (preferences.mode === 'fast') next.maxTokens = Math.min(Number(incoming.maxTokens) || 4096, 2048);
      else if (preferences.mode === 'quality') next.maxTokens = Math.max(Number(incoming.maxTokens) || 4096, 8192);
      if (preferences.mode === 'fast') next.temperature = typeof incoming.temperature === 'number' ? Math.min(incoming.temperature, 0.25) : 0.2;
      if (preferences.mode === 'quality') next.temperature = typeof incoming.temperature === 'number' ? Math.min(incoming.temperature, 0.4) : 0.35;
      const result = await original(next, options);
      if (result && result.ok !== false && String(next.mode || '') !== 'template-preview') {
        if (notificationState().generationCompleted) notify('generationCompleted', 'OVYX AI finished', 'Your AI request has completed. Open OVYX to review the result.', {});
        await warnUsageIfNeeded(result);
      }
      return result;
    };
    wrapped.__ovyxSettingsWrapped = true;
    wrapped.__ovyxSettingsOriginal = original;
    service.generate = wrapped;
    aiWrapperInstalled = true;
  }
  function refreshTokenMeter() {
    const panel = document.querySelector('#view-settings [data-settings-panel="usage"]');
    if (!panel) return;
    let meter = panel.querySelector('#set-token-meter');
    if (!meter) {
      const values = Array.from(panel.querySelectorAll('.ovyx-pref-row'));
      const row = values.find(item => /current token balance|monthly tokens|token balance/i.test(item.textContent || ''));
      meter = row && row.querySelector('.ovyx-pref-control');
      if (meter) meter.id = 'set-token-meter';
    }
    if (!meter) return;
    let refresh = panel.querySelector('#ovyx-settings-refresh-quota');
    if (!refresh) {
      refresh = document.createElement('button');
      refresh.id = 'ovyx-settings-refresh-quota';
      refresh.type = 'button';
      refresh.className = 'ovyx-settings-btn';
      refresh.textContent = 'Refresh Live Usage';
      meter.parentElement && meter.parentElement.appendChild(refresh);
      refresh.addEventListener('click', () => refreshTokenMeter(true));
    }
    const user = currentUser();
    if (!user) {
      meter.textContent = 'Sign in to load live token usage.';
      return;
    }
    if (refreshTokenMeter.inFlight) return;
    refreshTokenMeter.inFlight = true;
    meter.textContent = 'Loading usage from the server…';
    getToken(user).then(token => fetch('/api/tokens/balance', {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
      credentials: 'same-origin',
      cache: 'no-store'
    })).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) throw new Error(data.message || data.error || ('HTTP ' + response.status));
      const limit = Number(data.monthlyLimit || 0);
      const remaining = Number(data.current_monthly_tokens || 0);
      const used = Math.max(0, limit - remaining);
      const daily = Number(data.daily_prompts_allowance || 0);
      meter.textContent = limit
        ? used.toLocaleString() + ' used / ' + limit.toLocaleString() + ' monthly tokens · ' + remaining.toLocaleString() + ' remain · ' + daily + ' daily prompts'
        : (String(data.plan || 'account').toUpperCase() + ' · server quota bypass');
      meter.dataset.source = 'server';
      meter.title = 'Last checked ' + String(data.checkedAt || new Date().toISOString());
      const status = panel.querySelector('[data-usage-status]');
      if (status) status.textContent = 'Live server balance checked ' + new Date(data.checkedAt || Date.now()).toLocaleTimeString();
    }).catch(error => {
      meter.textContent = 'Live balance unavailable: ' + String(error && error.message || 'retry');
      meter.dataset.source = 'unavailable';
    }).finally(() => { refreshTokenMeter.inFlight = false; });
  }
  refreshTokenMeter.inFlight = false;

  function makeShortcutToConnections(kind) {
    if (kind !== 'connectors' && kind !== 'connections') return null;
    const nav = document.querySelector('#view-settings [data-settings-nav="connections"]');
    if (nav) {
      nav.click();
      return true;
    }
    if (window.OVYXSettings && typeof window.OVYXSettings.show === 'function') {
      window.OVYXSettings.show('connections');
      const panel = document.querySelector('#view-settings [data-settings-panel="connections"]');
      if (panel) {
        panel.hidden = false;
        panel.style.setProperty('display', 'block', 'important');
        panel.style.setProperty('visibility', 'visible', 'important');
      }
      return true;
    }
    return false;
  }
  function fixSettingsShortcuts() {
    const shortcuts = window.UserSettings;
    if (shortcuts && typeof shortcuts.openPanel === 'function' && !shortcuts.openPanel.__ovyxConnectionsShortcut) {
      const original = shortcuts.openPanel.bind(shortcuts);
      const wrapped = function (kind) {
        if (kind === 'connectors' || kind === 'connections') return makeShortcutToConnections(kind);
        if (kind === 'models') return window.OVYXSettings && window.OVYXSettings.show ? window.OVYXSettings.show('ai') : original(kind);
        if (kind === 'permissions') return window.OVYXSettings && window.OVYXSettings.show ? window.OVYXSettings.show('security') : original(kind);
        return original(kind);
      };
      wrapped.__ovyxConnectionsShortcut = true;
      shortcuts.openPanel = wrapped;
    }
  }
  function refreshSettingsControls() {
    ensureEditorModeControl();
    ensureWorkspaceControls();
    ensureAIControlOptions();
    syncAIControls();
    addNotificationTestControl();
    refreshTokenMeter();
  }

  async function saveProfileFromSettings() {
    const root = document.querySelector('#view-settings');
    const name = safeText(root && root.querySelector('#set-profile-name') && root.querySelector('#set-profile-name').value, 60);
    const workspaceName = safeText(root && root.querySelector('#set-workspace-name') && root.querySelector('#set-workspace-name').value, 60) || 'Creative Workspace';
    if (!name) {
      toast('Display name cannot be empty.', 'error');
      return false;
    }
    const user = currentUser();
    if (user && typeof user.updateProfile === 'function' && user.displayName !== name) {
      try { await user.updateProfile({ displayName: name }); }
      catch (error) {
        toast('Firebase could not update the display name: ' + String(error && error.message || error).slice(0, 120), 'error');
        setSyncStatus('Profile changes were not fully applied. Check your connection and try again.', 'error');
        return false;
      }
    }
    const key = profileKey();
    const stored = local(key) || {};
    const next = Object.assign({}, stored, { name: name, workspace: workspaceName });
    if (!localWrite(key, next)) {
      toast('Profile could not be saved on this device.', 'error');
      return false;
    }
    document.querySelectorAll('#settings-display-name-text,#sidebar-user-display-name').forEach(node => { node.textContent = name; });
    const heading = $('profile-name-heading');
    if (heading) heading.textContent = name;
    const label = $('sidebar-workspace-label');
    if (label) label.textContent = workspaceName;
    if (window.OVYXSettings && typeof window.OVYXSettings.syncAppearance === 'function') {
      try { window.OVYXSettings.syncAppearance(); } catch (_) {}
    }
    scheduleAccountSave(50);
    toast('Profile saved to this device and account.', 'success');
    return true;
  }
  async function deleteCurrentAccount() {
    const user = currentUser();
    if (!user) {
      toast('Sign in to manage account deletion.', 'error');
      return;
    }
    if (!window.confirm('Delete your OVYX account and its server-stored project data? This cannot be undone.')) return;
    try {
      const token = await user.getIdToken(true);
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + token,
          'X-OVYX-Account-Deletion': 'CONFIRM'
        },
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) {
        throw Object.assign(new Error(data.error || data.message || 'Account data cleanup was not completed.'), { status: response.status, code: data.code });
      }
      try {
        if (typeof user.delete === 'function') await user.delete();
        if (window.firebase && window.firebase.auth) await window.firebase.auth().signOut();
        [AI_PREFIX + '.user.' + user.uid, PROFILE_PREFIX + '.user.' + user.uid, PROJECT_PREFIX + '.user.' + user.uid].forEach(key => {
          try { window.localStorage.removeItem(key); } catch (_) {}
        });
        [WORKSPACE_KEY, NOTIFY_KEY, THEME_KEY, APPEARANCE_KEY, THEME_LAB_KEY].forEach(key => {
          try { window.localStorage.removeItem(key); } catch (_) {}
        });
        try { window.Router && window.Router.go && window.Router.go('home'); } catch (_) {}
        toast('Account data and Firebase login were deleted.', 'success');
      } catch (clientError) {
        toast('OVYX server data was deleted, but Firebase could not finish deleting the login: ' + String(clientError && clientError.message || clientError).slice(0, 140) + '. Sign in again or contact support.', 'error');
        try { await window.firebase.auth().signOut(); } catch (_) {}
      }
    } catch (error) {
      const message = String(error && error.message || 'Account deletion failed.');
      if (error && error.code === 'REAUTH_REQUIRED') toast('For security, sign in again, then retry account deletion.', 'error');
      else toast(message, 'error');
    }
  }
  function interceptSensitiveSettingsActions() {
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest && event.target.closest('#view-settings #profile-delete-action');
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      deleteCurrentAccount();
    }, true);
    document.addEventListener('click', function (event) {
      const target = event.target && event.target.closest && event.target.closest('#view-settings #profile-save-action,#view-settings [data-save-profile]');
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      saveProfileFromSettings();
    }, true);
  }
  function handlePreferenceMutation(event) {
    if (remoteSyncing) return;
    const target = event.target;
    if (!target || !target.closest) return;
    if (!target.closest('#view-settings')) return;
    const match = target.closest('input,select,textarea,[data-theme-save],[data-theme-duplicate],[data-theme-import],[data-theme-export],[data-theme-delete],[data-theme-reset],[data-mode],[data-appearance-save],[data-appearance-cancel],[data-clear-appearance],.ovyx-theme-card,.ovyx-toggle,[data-notify],#set-ai-save,#set-ai-reset,#notify-save,#notify-reset,#profile-save-action,[data-save-profile],#ovyx-settings-save-now,#ovyx-settings-test-notification,#ovyx-settings-refresh-quota');
    if (!match) return;
    scheduleAccountSave(800);
  }
  function installUserStoragePolicy() {
    installAutosavePolicy();
    const store = window.ProjectStore;
    if (store && typeof store.save === 'function' && !store.save.__ovyxSettingsSaveWrapped) {
      const originalSave = store.save.bind(store);
      const wrappedSave = function () {
        const result = originalSave.apply(this, arguments);
        if (workspaceState().autosave !== false || manualProjectWriteDepth > 0) {
          pendingProjectSave = false;
          try {
            window.dispatchEvent(new CustomEvent('ovyx:project-saved', {
              detail: { projectId: window.KernelState && window.KernelState.activeProject && window.KernelState.activeProject.id || null, source: manualProjectWriteDepth > 0 ? 'manual-save' : 'autosave' }
            }));
          } catch (_) {}
        } else {
          pendingProjectSave = true;
        }
        refreshWorkspaceControls();
        return result;
      };
      wrappedSave.__ovyxSettingsSaveWrapped = true;
      store.save = wrappedSave;
    }
  }
  function installAccountDeletionApiHint() {
    const button = $('profile-delete-action');
    if (button) {
      const small = button.querySelector('small');
      if (small) small.textContent = 'Delete account data and Firebase login; recent authentication is required.';
    }
  }
  function install() {
    installUserStoragePolicy();
    interceptSensitiveSettingsActions();
    installNotificationEvents();
    refreshSettingsControls();
    fixSettingsShortcuts();
    installAISettingsWrapper();
    installLivePreviewPolicy();
    installStudioModeHook();
    setDefaultEditorMode();
    installAccountDeletionApiHint();
    if (activeView() === 'webstudio') applyEditorMode();
    const notifications = window.OVYXSettings && window.OVYXSettings.show;
    if (notifications && typeof notifications === 'function') {
      // Keep the current panel visible; only refresh dynamic controls.
      setTimeout(refreshSettingsControls, 0);
    }
    scheduleAccountSave(1200);
  }

  document.addEventListener('click', handleWorkspaceToggle, true);
  document.addEventListener('change', function (event) {
    const target = event.target;
    if (target && target.id === 'set-editor-mode') {
      const state = workspaceState();
      state.editorMode = normalizeEditorMode(target.value);
      writeWorkspace(state);
      scheduleAccountSave();
      setDefaultEditorMode();
    }
    if (target && target.id === 'set-ai-model') {
      const state = aiState();
      state.model = target.value || 'automatic';
      localWrite(aiKey(), state);
      window.OVYXAI = state;
      syncAIControls();
      scheduleAccountSave();
    }
    if (target && target.id === 'set-provider') {
      const state = aiState();
      state.provider = target.value || 'automatic';
      localWrite(aiKey(), state);
      window.OVYXAI = state;
      scheduleAccountSave();
    }
    if (target && target.id === 'set-ai-routing') {
      const state = aiState();
      state.routing = target.value || 'preferred';
      localWrite(aiKey(), state);
      window.OVYXAI = state;
      scheduleAccountSave();
    }
    if (target && target.id === 'set-ai-fallback') {
      const state = aiState();
      state.fallback = target.value || 'stop';
      localWrite(aiKey(), state);
      window.OVYXAI = state;
      scheduleAccountSave();
    }
    if (target && target.id === 'set-ai-context-limit') {
      const state = aiState();
      state.contextLimit = target.value || 'automatic';
      localWrite(aiKey(), state);
      window.OVYXAI = state;
      scheduleAccountSave();
    }
    if (target && target.id === 'set-ai-generation-budget') {
      const state = aiState();
      state.generationBudget = target.value || 'automatic';
      localWrite(aiKey(), state);
      window.OVYXAI = state;
      scheduleAccountSave();
    }
    if (target && target.matches && target.matches('[data-ai-pref]')) {
      // Persist checkboxes only through the explicit Save AI Preferences action.
      return;
    }
    if (target && target.id === 'set-open-behavior') {
      scheduleAccountSave();
    }
  }, true);
  document.addEventListener('click', function (event) {
    const target = event.target && event.target.closest && event.target.closest('#view-settings #set-ai-save');
    if (target) {
      setTimeout(function () {
        saveAIControls();
      }, 0);
    }
  }, true);
  document.addEventListener('click', function (event) {
    const target = event.target && event.target.closest && event.target.closest('#view-settings #ovyx-settings-save-now');
    if (target) {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveProjectNow();
    }
  }, true);
  document.addEventListener('click', function (event) {
    const target = event.target && event.target.closest && event.target.closest('#view-settings #ovyx-settings-refresh-preview');
    if (target) {
      event.preventDefault();
      event.stopImmediatePropagation();
      refreshPreviewNow();
    }
  }, true);
  document.addEventListener('click', handlePreferenceMutation, true);
  document.addEventListener('change', handlePreferenceMutation, true);
  document.addEventListener('input', function (event) {
    const target = event.target;
    if (target && target.closest && target.closest('#view-settings') && target.matches && target.matches('[data-theme-field],[data-theme-hex],[data-theme-name]')) scheduleAccountSave(900);
  }, true);
  window.addEventListener('ovyx:appearance-canonicalized', function () { scheduleAccountSave(250); });
  window.addEventListener('ovyx:theme-applied', function () { scheduleAccountSave(350); });
  window.addEventListener('ovyx-settings-rendered', function () { setTimeout(refreshSettingsControls, 0); });
  window.addEventListener('ovyx:view-changed', function () {
    setTimeout(function () {
      refreshSettingsControls();
      fixSettingsShortcuts();
      installLivePreviewPolicy();
      installStudioModeHook();
      setDefaultEditorMode();
      applyWorkspaceMode();
      installAccountDeletionApiHint();
    }, 0);
  }, { passive: true });
  window.addEventListener('firebase-auth-state-ready', function () {
    remoteUserId = '';
    syncAccountSettings(true);
  }, { passive: true });
  window.addEventListener('ovyx:auth-ready', function () {
    remoteUserId = '';
    syncAccountSettings(true);
  }, { passive: true });
  window.addEventListener('pageshow', function () {
    installAISettingsWrapper();
    applyWorkspaceMode();
    if (currentUser()) syncAccountSettings(false);
  }, { passive: true });
  try {
    const auth = window.firebase && window.firebase.auth && window.firebase.auth();
    if (auth && typeof auth.onAuthStateChanged === 'function') auth.onAuthStateChanged(function (user) {
      if (!user || String(user.uid || '') !== remoteUserId) remoteUserId = '';
      if (user) syncAccountSettings(false);
      else setSyncStatus('Saved on this device. Sign in to sync Settings across devices.', 'local');
    });
  } catch (_) {}
  window.OVYXSettingsReliability = {
    sync: () => syncAccountSettings(true),
    save: saveAccountSettings,
    saveProjectNow: saveProjectNow,
    refreshPreview: refreshPreviewNow,
    refreshTokenMeter: refreshTokenMeter,
    testDesktopNotification: testDesktopNotification,
    notify: notify,
    getWorkspacePreferences: workspaceState,
    getAIPreferences: aiState,
    getNotificationPreferences: notificationState,
    get pendingProjectSave() { return pendingProjectSave; },
    get previewPending() { return previewPending; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  [150, 500, 1100, 2100].forEach(delay => setTimeout(function () {
    refreshSettingsControls();
    fixSettingsShortcuts();
    installAISettingsWrapper();
    installLivePreviewPolicy();
    installStudioModeHook();
    installAccountDeletionApiHint();
  }, delay));
  syncAccountSettings(false);
})();