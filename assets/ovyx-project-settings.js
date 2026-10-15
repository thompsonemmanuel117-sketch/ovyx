(function () {
  'use strict';
  if (window.__OVYX_PROJECT_SETTINGS_V1__) return;
  window.__OVYX_PROJECT_SETTINGS_V1__ = true;

  const API = '/api/settings/preferences';
  const BASE = {
    version: 1,
    profile: { workspaceName: 'Creative Workspace' },
    workspace: { openBehavior: 'Web Studio', autosave: true, confirmDelete: true, inspector: true, livePreview: true, aiSafe: true, editorMode: 'Magic' },
    notifications: { projectActivity: true, generationCompleted: true, deploymentStatus: true, aiUsageWarnings: true, billing: true, emailProductUpdates: true, emailSecurityAlerts: true },
    ai: { mode: 'balanced', model: 'automatic', provider: 'gemini', explain: true, preserve: true, confirmDestructive: false, contextFiles: true, contextPage: true, contextGithub: true, routing: 'Automatic', fallback: 'Automatic', contextLimit: 'Automatic', budget: 'Automatic' },
    appearance: { mode: 'system', density: 'balanced', scale: 'balanced', motion: 'full' },
    theme: { active: 'obsidian', custom: { name: 'My OVYX Theme', bg: '#050505', panel: '#0b0b0c', elev: '#101012', text: '#f5f5f4', secondary: '#9a9aa0', muted: '#606067', accent: '#e8b64f' }, customThemes: {} }
  };
  const clean = (v, max = 500) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
  const uidOf = u => clean(u?.uid || u?.user?.uid, 180);
  const user = () => { try { return window.firebase?.auth?.().currentUser || null; } catch (_) { return null; } };
  const jsonRead = (key, fallback = {}) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback; } catch (_) { return fallback; } };
  const jsonWrite = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
  const key = (base, uid) => base + '.user.' + uid;
  let activeUid = '';
  let syncPromise = null;
  let saveQueue = Promise.resolve();
  let currentPreferences = structuredCloneSafe(BASE);
  let lastSyncAt = null;

  function structuredCloneSafe(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return v; } }
  function authToken(refresh = false) {
    const u = user();
    if (!u) throw Object.assign(new Error('Sign in to sync settings across devices.'), { code: 'AUTH_REQUIRED' });
    return u.getIdToken(!!refresh);
  }
  async function request(method = 'GET', payload = null) {
    const token = await authToken(false);
    const response = await fetch(API, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw Object.assign(new Error(data?.message || data?.error || 'Account settings sync failed.'), { status: response.status, code: data?.code || 'SETTINGS_SYNC_FAILED' });
    }
    return data;
  }
  function setStatus(message, kind = 'info') {
    const root = document.getElementById('view-settings');
    if (!root) return;
    let status = root.querySelector('#ovyx-project-settings-sync-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'ovyx-project-settings-sync-status';
      status.className = 'ovyx-project-settings-sync-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const top = root.querySelector('.ovyx-settings-top');
      if (top) top.insertAdjacentElement('afterend', status);
      else root.prepend(status);
    }
    status.dataset.state = kind;
    status.textContent = message;
  }
  function notify(message, kind = 'info') {
    try { (window.showToast || window.toast)?.(message, kind); } catch (_) {}
  }

  function snapshot(uid) {
    const p = jsonRead(key('ovyx.profile.v2', uid), {});
    const workspace = window.OVYXSettingsIntegrity?.load?.() || jsonRead(key('ovyx.settings.integrity.v83', uid), BASE.workspace);
    const notifications = jsonRead(key('ovyx.notifications.v1', uid), BASE.notifications);
    const aiKey = window.OVYXAIStorageKey?.() || key('ovyx.ai.preferences.v1', uid);
    const ai = jsonRead(aiKey, BASE.ai);
    const appearance = jsonRead('ovyx.appearance.v3', {});
    const themeContext = jsonRead('ovyx-theme', {});
    const theme = window.OVYXThemeLab?.state || jsonRead('ovyx.theme.lab.v1', BASE.theme);
    return {
      profile: { workspaceName: clean(p.workspace || document.getElementById('sidebar-workspace-label')?.textContent || BASE.profile.workspaceName, 60) || BASE.profile.workspaceName },
      workspace: { ...BASE.workspace, ...workspace },
      notifications: { ...BASE.notifications, ...notifications },
      ai: { ...BASE.ai, ...ai },
      appearance: {
        mode: appearance.mode || themeContext.mode || document.documentElement.dataset.ovyxAppearanceMode || document.documentElement.dataset.ovyxMode || BASE.appearance.mode,
        density: appearance.density || themeContext.density || document.documentElement.dataset.ovyxDensity || BASE.appearance.density,
        scale: appearance.scale || themeContext.scale || document.documentElement.dataset.ovyxScale || BASE.appearance.scale,
        motion: appearance.motion || themeContext.motion || document.documentElement.dataset.ovyxMotion || BASE.appearance.motion
      },
      theme: structuredCloneSafe(theme)
    };
  }

  function applyWorkspaceSideEffects(workspace) {
    window.OVYXProjectSettings = window.OVYXProjectSettings || {};
    window.OVYXProjectSettings.workspace = structuredCloneSafe(workspace);
    document.documentElement.dataset.ovyxLivePreview = workspace.livePreview ? 'enabled' : 'paused';
    document.documentElement.dataset.ovyxAutosave = workspace.autosave ? 'enabled' : 'manual';
    document.documentElement.dataset.ovyxDefaultStudioMode = String(workspace.editorMode || 'Magic').toLowerCase().replace(/[^a-z]/g, '');
    try {
      if (window.OVYXSettingsIntegrity?.save) window.OVYXSettingsIntegrity.save(workspace);
      else if (activeUid) jsonWrite(key('ovyx.settings.integrity.v83', activeUid), workspace);
      const toggles = window.OVYXSettingsToggles?.load?.() || {};
      window.OVYXSettingsToggles?.save?.({
        ...toggles,
        autosave: workspace.autosave,
        confirmDelete: workspace.confirmDelete,
        inspector: workspace.inspector,
        livePreview: workspace.livePreview,
        aiSafe: workspace.aiSafe
      });
    } catch (_) {}
    try { document.querySelectorAll('#app-node-inspector').forEach(el => { el.style.display = workspace.inspector ? '' : 'none'; }); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('ovyx:workspace-preferences-applied', { detail: structuredCloneSafe(workspace) })); } catch (_) {}
  }

  function applyTheme(theme, appearance) {
    if (activeUid) jsonWrite(key('ovyx.theme.lab.v1', activeUid), theme);
    if (window.OVYXThemeLab) {
      try {
        window.OVYXThemeLab.state = structuredCloneSafe(theme);
        window.OVYXThemeLab.apply?.();
        if (window.OVYXSettings?.current === 'appearance') window.OVYXSettings.renderThemeCards?.();
      } catch (_) {}
    }
    const appearanceValue = {
      mode: appearance.mode,
      density: appearance.density,
      scale: appearance.scale,
      motion: appearance.motion
    };
    jsonWrite('ovyx.appearance.v3', appearanceValue);
    const context = jsonRead('ovyx-theme', {});
    jsonWrite('ovyx-theme', { ...context, ...appearanceValue });
    try { window.ThemeContext?.apply?.(); } catch (_) {}
    try { window.OVYXSettings?.syncAppearance?.(); } catch (_) {}
    try { window.OVYXThemeLab?.apply?.(); } catch (_) {}
    try {
      const resolved = appearance.mode === 'system'
        ? (window.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark')
        : appearance.mode;
      document.documentElement.classList.toggle('ovyx-light', resolved === 'light');
      document.documentElement.dataset.ovyxMode = resolved;
      document.documentElement.dataset.ovyxDensity = appearance.density;
      document.documentElement.dataset.ovyxScale = appearance.scale;
      document.documentElement.dataset.ovyxMotion = appearance.motion;
    } catch (_) {}
  }

  function applyPreferences(value, uid) {
    if (!value || typeof value !== 'object') return;
    activeUid = uid || activeUid;
    currentPreferences = {
      ...structuredCloneSafe(BASE),
      ...value,
      profile: { ...BASE.profile, ...(value.profile || {}) },
      workspace: { ...BASE.workspace, ...(value.workspace || {}) },
      notifications: { ...BASE.notifications, ...(value.notifications || {}) },
      ai: { ...BASE.ai, ...(value.ai || {}) },
      appearance: { ...BASE.appearance, ...(value.appearance || {}) },
      theme: { ...BASE.theme, ...(value.theme || {}) }
    };
    if (!activeUid) return;
    jsonWrite(key('ovyx.profile.v2', activeUid), {
      ...jsonRead(key('ovyx.profile.v2', activeUid), {}),
      workspace: currentPreferences.profile.workspaceName || BASE.profile.workspaceName
    });
    jsonWrite(key('ovyx.settings.integrity.v83', activeUid), currentPreferences.workspace);
    jsonWrite(key('ovyx.notifications.v1', activeUid), currentPreferences.notifications);
    jsonWrite(key('ovyx.ai.preferences.v1', activeUid), currentPreferences.ai);
    if (typeof window.OVYXAIStorageKey !== 'function') {
      window.OVYXAIStorageKey = () => key('ovyx.ai.preferences.v1', uidOf(user()));
    }
    window.OVYXAI = { ...(window.OVYXAI || {}), ...structuredCloneSafe(currentPreferences.ai) };
    applyWorkspaceSideEffects(currentPreferences.workspace);
    applyTheme(currentPreferences.theme, currentPreferences.appearance);
    try { window.OVYXProfile?.render?.(); window.OVYXProfile?.applyAvatar?.(); } catch (_) {}
    try { window.OVYXSettingsIntegrity?.syncWorkspaceUI?.(); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('ovyx:project-settings-synced', { detail: { updatedAt: lastSyncAt, uid: activeUid } })); } catch (_) {}
  }

  async function initialSync(uid) {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      const loaded = await request('GET');
      if (loaded.saved) {
        lastSyncAt = loaded.updatedAt || null;
        applyPreferences(loaded.preferences, uid);
        setStatus('Settings synced to your OVYX account.', 'success');
      } else {
        const first = snapshot(uid);
        const saved = await request('PUT', { preferences: first });
        lastSyncAt = saved.updatedAt || null;
        applyPreferences(saved.preferences, uid);
        setStatus('Settings saved to your OVYX account.', 'success');
      }
      return currentPreferences;
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }

  function persist(section, value) {
    if (!activeUid || !user()) {
      setStatus('Changes are saved on this device. Sign in to sync settings across devices.', 'local');
      return Promise.resolve(false);
    }
    const patch = { [section]: structuredCloneSafe(value) };
    saveQueue = saveQueue.catch(() => false).then(async () => {
      try {
        const result = await request('PUT', { preferences: patch });
        lastSyncAt = result.updatedAt || null;
        applyPreferences(result.preferences, activeUid);
        setStatus('Settings saved to your account.', 'success');
        return true;
      } catch (error) {
        setStatus('Saved on this device, but account sync failed: ' + clean(error?.message || 'Try again.', 150), 'error');
        return false;
      }
    });
    return saveQueue;
  }

  function persistLocalSection(section) {
    if (!activeUid) return Promise.resolve(false);
    const value = snapshot(activeUid)[section];
    return persist(section, value);
  }

  function readAIControls() {
    const root = document.querySelector('#view-settings [data-settings-panel="ai"]');
    const saved = jsonRead(key('ovyx.ai.preferences.v1', activeUid), BASE.ai);
    if (!root) return saved;
    const selectedMode = root.querySelector('[data-ai-mode].selected')?.dataset.aiMode;
    const model = root.querySelector('#set-ai-model')?.value;
    const provider = root.querySelector('#set-provider')?.value;
    const routing = root.querySelector('#set-ai-routing')?.value;
    const fallback = root.querySelector('#set-ai-fallback')?.value;
    const contextLimit = root.querySelector('#set-ai-context-limit')?.value;
    const budget = root.querySelector('#set-ai-budget')?.value;
    const next = { ...BASE.ai, ...saved };
    if (selectedMode) next.mode = selectedMode;
    if (model) next.model = model;
    if (provider) next.provider = provider;
    if (routing) next.routing = routing;
    if (fallback) next.fallback = fallback;
    if (contextLimit) next.contextLimit = contextLimit;
    if (budget) next.budget = budget;
    ['explain', 'preserve', 'confirmDestructive', 'contextFiles', 'contextPage', 'contextGithub'].forEach(k => {
      const control = root.querySelector('[data-ai-pref="' + k + '"]');
      if (control) next[k] = !!control.checked;
    });
    return next;
  }

  async function saveProfile(button) {
    const root = document.querySelector('#view-settings');
    const nameInput = root?.querySelector('#set-profile-name');
    const workspaceInput = root?.querySelector('#set-workspace-name');
    const name = clean(nameInput?.value, 60);
    const workspaceName = clean(workspaceInput?.value, 60) || BASE.profile.workspaceName;
    if (!name) { notify('Display name cannot be empty.', 'error'); return; }
    const u = user();
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    const localKey = u?.uid ? key('ovyx.profile.v2', u.uid) : 'ovyx.profile.v2.guest';
    const profile = { ...jsonRead(localKey, {}), name, workspace: workspaceName };
    try {
      if (!u) {
        jsonWrite(localKey, profile);
        document.querySelectorAll('#settings-display-name-text,#sidebar-user-display-name,#profile-name-heading').forEach(el => { el.textContent = name; });
        const label = document.getElementById('sidebar-workspace-label'); if (label) label.textContent = workspaceName;
        setStatus('Profile saved locally. Sign in to sync it to your account.', 'local');
        notify('Profile saved on this device.', 'info');
        return;
      }
      try { if (u.displayName !== name) await u.updateProfile({ displayName: name }); }
      catch (error) { throw Object.assign(new Error('Firebase could not update your display name. ' + clean(error?.message, 140)), { code: error?.code || 'PROFILE_UPDATE_FAILED' }); }
      const result = await request('PUT', { preferences: { profile: { workspaceName } } });
      lastSyncAt = result.updatedAt || null;
      jsonWrite(localKey, profile);
      currentPreferences = result.preferences || currentPreferences;
      document.querySelectorAll('#settings-display-name-text,#sidebar-user-display-name,#profile-name-heading').forEach(el => { el.textContent = name; });
      const label = document.getElementById('sidebar-workspace-label'); if (label) label.textContent = workspaceName;
      try { window.OVYXProfile?.applyAvatar?.(); } catch (_) {}
      setStatus('Profile and workspace settings saved to your account.', 'success');
      notify('Profile settings saved.', 'success');
    } catch (error) {
      setStatus('Profile sync failed: ' + clean(error?.message || 'Try again.', 160), 'error');
      notify('Profile could not be fully saved. ' + clean(error?.message || '', 100), 'error');
    } finally {
      if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
    }
  }

  function handleAIRequest(payload) {
    const prefs = { ...BASE.ai, ...(window.OVYXAI || {}), ...jsonRead(key('ovyx.ai.preferences.v1', activeUid), {}) };
    const next = { ...(payload || {}) };
    const userText = clean(next.prompt || next.message || (Array.isArray(next.messages) ? next.messages.filter(x => x?.role === 'user').slice(-1)[0]?.content : ''), 24000);
    const destructive = /\b(delete|remove|wipe|erase|clear all|drop table|destroy|overwrite|replace all|rebuild from scratch|reset everything)\b/i.test(userText);
    if (prefs.aiSafe !== false && prefs.confirmDestructive !== false && destructive) {
      if (!window.confirm('This request appears to make destructive changes. Continue only if you intend to remove or overwrite existing work.')) {
        throw Object.assign(new Error('Destructive AI request cancelled. No request was sent.'), { code: 'AI_DESTRUCTIVE_CONFIRMATION_REQUIRED' });
      }
    } else if (prefs.aiSafe !== false && prefs.confirmDestructive === true && destructive) {
      if (!window.confirm('Confirm this destructive change before OVYX sends the request.')) {
        throw Object.assign(new Error('Destructive AI request cancelled. No request was sent.'), { code: 'AI_DESTRUCTIVE_CONFIRMATION_REQUIRED' });
      }
    }
    if (!next.provider || next.provider === 'automatic') next.provider = prefs.provider || 'automatic';
    if ((!next.model || next.model === 'automatic') && prefs.model && prefs.model !== 'automatic') next.model = prefs.model;
    if (!next.system) next.system = '';
    const guidance = [];
    if (prefs.mode === 'fast') guidance.push('USER AI PREFERENCE: Prioritize a fast, concise iteration. Avoid unnecessary elaboration.');
    if (prefs.mode === 'quality') guidance.push('USER AI PREFERENCE: Prefer a deliberate quality pass, consider edge cases and validate requirements before responding.');
    if (prefs.explain === false) guidance.push('USER AI PREFERENCE: Keep explanations minimal; provide actionable results first.');
    if (prefs.preserve === true) guidance.push('USER AI PREFERENCE: Preserve existing project structure and working code. Prefer localized edits over unnecessary rewrites.');
    if (prefs.confirmDestructive === true || prefs.aiSafe === true) guidance.push('USER AI PREFERENCE: Ask for confirmation before destructive edits that would delete or overwrite existing work.');
    if (prefs.contextLimit === 'Conservative') guidance.push('USER AI PREFERENCE: Use only the minimum relevant context needed for this task.');
    if (prefs.contextLimit === 'Expanded') guidance.push('USER AI PREFERENCE: Consider all relevant supplied project context, without pulling in unrelated projects.');
    if (prefs.budget === 'Efficient') guidance.push('USER AI PREFERENCE: Use an efficient generation strategy and avoid unrequested extra work.');
    if (prefs.budget === 'Maximum') guidance.push('USER AI PREFERENCE: Apply a comprehensive quality review while remaining within the user request.');
    if (guidance.length) next.system = (String(next.system || '') + '\n\nAI PREFERENCES (user-selected):\n' + guidance.join('\n')).slice(0, 14000);
    if (prefs.contextFiles === false) {
      delete next.files;
      if (next.context && typeof next.context === 'object') {
        next.context = { ...next.context };
        delete next.context.files;
        delete next.context.projectFiles;
        if (next.context.project && typeof next.context.project === 'object') {
          next.context.project = { ...next.context.project };
          delete next.context.project.files;
        }
      }
    }
    if (prefs.contextPage === false) {
      if (next.context && typeof next.context === 'object') {
        next.context = { ...next.context };
        ['page', 'pages', 'currentPage', 'activePage', 'pageContent', 'activePageContent'].forEach(k => { delete next.context[k]; });
        if (next.context.project && typeof next.context.project === 'object') {
          next.context.project = { ...next.context.project };
          delete next.context.project.pages;
          delete next.context.project.currentPage;
          delete next.context.project.activePage;
        }
      }
    }
    if (prefs.contextGithub === false) {
      ['github', 'repositories', 'repository', 'githubContext'].forEach(k => { delete next[k]; });
      if (next.context && typeof next.context === 'object') {
        next.context = { ...next.context };
        ['github', 'repositories', 'repository', 'githubContext'].forEach(k => { delete next.context[k]; });
      }
    }
    return next;
  }

  function installAIWrapper() {
    const service = window.OVYXAIService;
    if (!service || service.__ovyxUserPreferencesWrapped || typeof service.generate !== 'function') return false;
    const original = service.generate.bind(service);
    service.generate = async payload => original(handleAIRequest(payload));
    service.__ovyxUserPreferencesWrapped = true;
    return true;
  }

  function bindSettingsEvents() {
    document.addEventListener('click', event => {
      const profileButton = event.target?.closest?.('#profile-save-action');
      if (profileButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        saveProfile(profileButton);
        return;
      }
      const notifySave = event.target?.closest?.('#notify-save');
      const notifyReset = event.target?.closest?.('#notify-reset');
      if (notifySave || notifyReset) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setTimeout(async () => {
          if (notifyReset) {
            jsonWrite(key('ovyx.notifications.v1', activeUid), structuredCloneSafe(BASE.notifications));
            const result = await persist('notifications', BASE.notifications);
            try { window.OVYXSettings?.show?.('notifications'); } catch (_) {}
            if (result) notify('Notification preferences reset to defaults.', 'success');
          } else {
            const value = jsonRead(key('ovyx.notifications.v1', activeUid), BASE.notifications);
            const result = await persist('notifications', value);
            if (result) notify('Notification preferences saved to your account.', 'success');
          }
        }, 0);
        return;
      }
      const aiSave = event.target?.closest?.('#set-ai-save');
      const aiReset = event.target?.closest?.('#set-ai-reset');
      if (aiSave || aiReset) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setTimeout(async () => {
          const value = aiReset ? structuredCloneSafe(BASE.ai) : readAIControls();
          if (activeUid) jsonWrite(key('ovyx.ai.preferences.v1', activeUid), value);
          window.OVYXAI = { ...(window.OVYXAI || {}), ...value };
          const result = await persist('ai', value);
          try { window.OVYXSettings?.show?.('ai'); } catch (_) {}
          if (result) notify(aiReset ? 'AI preferences reset to defaults.' : 'AI preferences saved to your account.', aiReset ? 'info' : 'success');
        }, 0);
        return;
      }

      const workspaceButton = event.target?.closest?.('#set-autosave,#set-confirm-delete,#set-inspector,#set-live-preview,#set-ai-safe,[data-mode],[data-theme],[data-clear-appearance],[data-theme-save],[data-theme-duplicate],[data-theme-import],[data-theme-export],[data-theme-delete],[data-theme-reset]');
      if (workspaceButton) {
        setTimeout(() => {
          const section = workspaceButton.matches('[data-mode],[data-clear-appearance]') ? 'appearance'
            : workspaceButton.matches('[data-theme],[data-theme-save],[data-theme-duplicate],[data-theme-import],[data-theme-export],[data-theme-delete],[data-theme-reset]') ? 'theme'
            : 'workspace';
          if (section === 'appearance' || section === 'theme') {
            const snap = snapshot(activeUid);
            if (section === 'appearance') persist('appearance', snap.appearance);
            else persist('theme', snap.theme);
          } else persist('workspace', snapshot(activeUid).workspace);
        }, 0);
      }
      const aiMode = event.target?.closest?.('[data-ai-mode]');
      if (aiMode) setTimeout(() => persist('ai', readAIControls()), 0);
    }, true);

    document.addEventListener('change', event => {
      const target = event.target;
      if (!target?.closest?.('#view-settings')) return;
      if (target.matches('#set-open-behavior,#set-editor-mode')) {
        setTimeout(() => persist('workspace', snapshot(activeUid).workspace), 0);
      }
      if (target.matches('#set-density,#set-scale,#set-motion,#settings-color-mode,#settings-typography')) {
        setTimeout(() => {
          const snap = snapshot(activeUid);
          persist('appearance', snap.appearance);
        }, 0);
      }
      if (target.matches('#set-ai-model,#set-provider,#set-ai-routing,#set-ai-fallback,#set-ai-context-limit,#set-ai-budget,[data-ai-pref]')) {
        setTimeout(() => {
          const value = readAIControls();
          if (activeUid) jsonWrite(key('ovyx.ai.preferences.v1', activeUid), value);
          persist('ai', value);
        }, 0);
      }
      if (target.matches('[data-theme-field],[data-theme-hex]')) {
        setTimeout(() => persist('theme', snapshot(activeUid).theme), 250);
      }
    });
  }

  async function startSync(force = false) {
    const u = user();
    const uid = uidOf(u);
    if (!uid) {
      activeUid = '';
      currentPreferences = structuredCloneSafe(BASE);
      setStatus('Sign in to sync Settings across devices.', 'local');
      return false;
    }
    if (!force && uid === activeUid && syncPromise) return syncPromise;
    if (!force && uid === activeUid && lastSyncAt) return true;
    activeUid = uid;
    try {
      await initialSync(uid);
      installAIWrapper();
      setTimeout(installAIWrapper, 500);
      return true;
    } catch (error) {
      setStatus('Account sync unavailable; device settings remain available. ' + clean(error?.message || 'Retry when online.', 130), 'error');
      return false;
    }
  }

  window.OVYXProjectSettings = {
    api: API,
    get preferences() { return structuredCloneSafe(currentPreferences); },
    get lastSyncAt() { return lastSyncAt; },
    sync: () => startSync(true),
    save: (section, value) => persist(section, value),
    status: setStatus,
    workspaceEnabled: keyName => currentPreferences.workspace[keyName] !== false,
    notificationEnabled: keyName => currentPreferences.notifications[keyName] !== false
  };

  function boot() {
    bindSettingsEvents();
    startSync(false);
    let auth = null;
    try { auth = window.firebase?.auth?.(); } catch (_) {}
    auth?.onAuthStateChanged?.(nextUser => {
      const uid = uidOf(nextUser);
      if (uid !== activeUid) {
        activeUid = '';
        lastSyncAt = null;
        if (uid) startSync(true);
        else {
          currentPreferences = structuredCloneSafe(BASE);
          setStatus('Signed out. Account settings are no longer synced.', 'local');
        }
      }
    });
    window.addEventListener('firebase-auth-state-ready', () => startSync(true), { passive: true });
    window.addEventListener('ovyx:auth-ready', () => startSync(true), { passive: true });
    window.addEventListener('pageshow', () => { if (user() && !lastSyncAt) startSync(true); }, { passive: true });
    installAIWrapper();
    setTimeout(installAIWrapper, 250);
    setTimeout(installAIWrapper, 900);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  const style = document.createElement('style');
  style.textContent = `.ovyx-project-settings-sync-status{margin:8px 20px 12px;padding:9px 11px;border:1px solid var(--ov-line,rgba(255,255,255,.09));border-radius:8px;color:var(--ov-muted,#858990);font:600 9px/1.45 Inter,sans-serif}.ovyx-project-settings-sync-status[data-state="success"]{color:#58d49b;border-color:rgba(88,212,155,.25)}.ovyx-project-settings-sync-status[data-state="error"]{color:#fda4af;border-color:rgba(251,113,133,.32)}.ovyx-project-settings-sync-status[data-state="local"]{color:var(--ov-muted,#858990)}`;
  document.head.appendChild(style);
})();