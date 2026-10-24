(function () {
  'use strict';
  if (window.__OVYX_AI_PREFERENCES_V1__) return;
  window.__OVYX_AI_PREFERENCES_V1__ = true;

  const DEFAULTS = Object.freeze({
    mode: 'balanced',
    model: 'automatic',
    provider: 'gemini',
    explain: true,
    preserve: true,
    confirmDestructive: false,
    contextFiles: true,
    contextPage: true,
    contextGithub: true,
    routing: 'automatic',
    fallback: 'next',
    contextLimit: 'automatic',
    budget: 'automatic'
  });
  const ENUMS = Object.freeze({
    mode: ['balanced', 'fast', 'quality'],
    model: ['automatic', 'gemini-3.8-flash', 'claude-opus-5', 'deepseek-flash', 'gpt-6.1-sol'],
    provider: ['gemini', 'anthropic', 'deepseek', 'openai'],
    routing: ['automatic', 'preferred-first', 'provider-priority'],
    fallback: ['automatic', 'next', 'stop'],
    contextLimit: ['automatic', 'conservative', 'expanded'],
    budget: ['automatic', 'efficient', 'maximum']
  });
  const BOOLEAN_KEYS = ['explain', 'preserve', 'confirmDestructive', 'contextFiles', 'contextPage', 'contextGithub'];
  const SELECT_IDS = Object.freeze({
    model: 'set-ai-model',
    provider: 'set-provider',
    routing: 'set-ai-routing',
    fallback: 'set-ai-fallback',
    contextLimit: 'set-ai-context-limit',
    budget: 'set-ai-budget'
  });

  let loadedUid = '';
  let cachedPreferences = null;
  let loadingPromise = null;
  let loadingUid = '';
  let showWrapped = false;
  let generateWrapped = false;

  function user() {
    try { return window.firebase?.auth?.().currentUser || null; } catch (_) { return null; }
  }

  function storageKey() {
    try {
      if (typeof window.OVYXAIStorageKey === 'function') return window.OVYXAIStorageKey();
    } catch (_) {}
    const current = user();
    return current?.uid
      ? 'ovyx.ai.preferences.v1.user.' + String(current.uid)
      : 'ovyx.ai.preferences.v1.guest';
  }

  function normalize(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = {};
    for (const key of BOOLEAN_KEYS) {
      result[key] = typeof source[key] === 'boolean' ? source[key] : DEFAULTS[key];
    }
    for (const [key, options] of Object.entries(ENUMS)) {
      result[key] = options.includes(String(source[key] ?? ''))
        ? String(source[key])
        : DEFAULTS[key];
    }
    return result;
  }

  function readLocal() {
    try { return normalize(JSON.parse(localStorage.getItem(storageKey()) || '{}')); }
    catch (_) { return { ...DEFAULTS }; }
  }

  function writeLocal(preferences) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(preferences));
      return true;
    } catch (_) {
      return false;
    }
  }

  function setStatus(panel, message, kind) {
    const status = panel?.querySelector('#ovyx-ai-preference-status');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = kind || 'info';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
  }

  function ensureStatus(panel) {
    let status = panel.querySelector('#ovyx-ai-preference-status');
    if (status) return status;
    status = document.createElement('p');
    status.id = 'ovyx-ai-preference-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = 'margin:10px 20px;padding:9px 11px;border:1px solid var(--ov-line,rgba(255,255,255,.12));border-radius:8px;color:var(--ov-muted,#a1a1aa);font:500 10px/1.5 Inter,system-ui,sans-serif;overflow-wrap:anywhere;';
    const actions = panel.querySelector('.ovyx-theme-actions');
    if (actions) panel.insertBefore(status, actions);
    else panel.appendChild(status);
    return status;
  }

  function applyControls(panel, value) {
    const preferences = normalize(value);
    window.OVYXAI = {
      ...(window.OVYXAI && typeof window.OVYXAI === 'object' ? window.OVYXAI : {}),
      ...preferences
    };
    panel.querySelectorAll('[data-ai-mode]').forEach(button => {
      button.classList.toggle('selected', button.dataset.aiMode === preferences.mode);
      button.setAttribute('aria-pressed', String(button.dataset.aiMode === preferences.mode));
    });
    const chip = panel.querySelector('.ovyx-health-chip');
    if (chip) chip.textContent = preferences.mode.toUpperCase();
    for (const [key, id] of Object.entries(SELECT_IDS)) {
      const control = panel.querySelector('#' + id);
      if (control) control.value = preferences[key];
    }
    for (const key of BOOLEAN_KEYS) {
      const control = panel.querySelector('[data-ai-pref="' + key + '"]');
      if (control) {
        control.checked = preferences[key];
        control.setAttribute('aria-checked', String(preferences[key]));
      }
    }
  }

  function controlsToPreferences(panel) {
    const base = normalize(readLocal());
    const chosenMode = panel.querySelector('[data-ai-mode].selected')?.dataset?.aiMode;
    if (chosenMode && ENUMS.mode.includes(chosenMode)) base.mode = chosenMode;
    for (const [key, id] of Object.entries(SELECT_IDS)) {
      const control = panel.querySelector('#' + id);
      if (control && ENUMS[key].includes(String(control.value))) base[key] = String(control.value);
    }
    for (const key of BOOLEAN_KEYS) {
      const control = panel.querySelector('[data-ai-pref="' + key + '"]');
      if (control) base[key] = !!control.checked;
    }
    return normalize(base);
  }

  function preferencesAbortError() {
    return Object.assign(new Error('Waiting for AI preferences was cancelled.'), {
      name: 'AbortError',
      code: 'AI_PREFERENCES_CANCELLED'
    });
  }

  function awaitWithSignal(promise, signal) {
    if (!signal) return Promise.resolve(promise);
    if (signal.aborted) return Promise.reject(preferencesAbortError());
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener('abort', onAbort);
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const onAbort = () => finish(reject, preferencesAbortError());
      signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve(promise).then(
        value => finish(resolve, value),
        error => finish(reject, error)
      );
    });
  }

  async function requestPreferences(method, preferences, externalSignal = null) {
    const current = user();
    if (!current || typeof current.getIdToken !== 'function') {
      throw new Error('Sign in to load and save AI preferences to your OVYX account.');
    }
    if (externalSignal?.aborted) throw preferencesAbortError();
    const token = await current.getIdToken();
    if (externalSignal?.aborted) throw preferencesAbortError();
    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = method === 'GET' ? 5000 : 15000;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortRequest = () => controller.abort();
    externalSignal?.addEventListener('abort', abortRequest, { once: true });
    try {
      const response = await fetch('/api/settings/ai', {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        ...(method === 'PUT' ? { body: JSON.stringify({ preferences }) } : {})
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok !== true || !body?.preferences || body?.authority !== 'SERVER') {
        const error = new Error(body?.message || 'OVYX could not confirm your account AI preferences.');
        error.status = response.status;
        error.code = body?.code || 'AI_PREFERENCES_REQUEST_FAILED';
        throw error;
      }
      return {
        preferences: normalize(body.preferences),
        updatedAt: body.updatedAt || null
      };
    } catch (error) {
      if (externalSignal?.aborted) throw preferencesAbortError();
      if (timedOut) {
        throw Object.assign(new Error('OVYX AI preferences request timed out.'), {
          code: 'AI_PREFERENCES_TIMEOUT'
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortRequest);
    }
  }

  async function loadPreferences(force, externalSignal = null) {
    const current = user();
    const uid = String(current?.uid || '');
    if (!uid) return readLocal();
    if (loadingPromise && loadingUid === uid) return awaitWithSignal(loadingPromise, externalSignal);
    if (!force && loadedUid === uid && cachedPreferences) return cachedPreferences;
    loadingUid = uid;
    loadingPromise = requestPreferences('GET', undefined, externalSignal).then(async serverState => {
      let preferences = serverState.preferences;
      if (!serverState.updatedAt) {
        let legacy = null;
        try {
          legacy = JSON.parse(localStorage.getItem(storageKey()) || 'null');
        } catch (_) {}
        if (legacy && typeof legacy === 'object' && !Array.isArray(legacy) && Object.keys(legacy).length) {
          // Preserve this account's old device-only settings the first time the
          // server preference document is created; never overwrite newer server data.
          const migrated = await requestPreferences('PUT', normalize(legacy), externalSignal);
          preferences = migrated.preferences;
        }
      }
      if (String(user()?.uid || '') === uid) {
        writeLocal(preferences);
        cachedPreferences = preferences;
        loadedUid = uid;
        window.OVYXAISettingsPreferences = preferences;
      }
      return preferences;
    }).finally(() => {
      if (loadingUid === uid) {
        loadingPromise = null;
        loadingUid = '';
      }
    });
    return awaitWithSignal(loadingPromise, externalSignal);
  }

  function setPanelBusy(panel, busy) {
    const selector = '[data-ai-mode],#set-ai-model,#set-provider,#set-ai-routing,#set-ai-fallback,#set-ai-context-limit,#set-ai-budget,[data-ai-pref],#set-ai-save,#set-ai-reset';
    panel.querySelectorAll(selector).forEach(control => {
      if (busy) {
        if (control.dataset.ovyxPreviousDisabled === undefined) {
          control.dataset.ovyxPreviousDisabled = String(!!control.disabled);
        }
        control.disabled = true;
      } else if (control.dataset.ovyxPreviousDisabled !== undefined) {
        control.disabled = control.dataset.ovyxPreviousDisabled === 'true';
        delete control.dataset.ovyxPreviousDisabled;
      }
    });
  }

  async function loadForPanel(panel) {
    if (!panel?.isConnected) return;
    ensureStatus(panel);
    if (!String(user()?.uid || '')) {
      const local = readLocal();
      cachedPreferences = local;
      loadedUid = '';
      window.OVYXAISettingsPreferences = local;
      applyControls(panel, local);
      setStatus(panel, 'Using settings saved on this device. Sign in to sync AI preferences to your OVYX account.', 'local');
      return;
    }
    setPanelBusy(panel, true);
    setStatus(panel, 'Loading AI preferences from your OVYX account…', 'loading');
    try {
      const preferences = await loadPreferences(true);
      if (!panel.isConnected) return;
      applyControls(panel, preferences);
      setStatus(panel, 'AI preferences loaded from your OVYX account.', 'ok');
    } catch (error) {
      if (!panel.isConnected) return;
      const local = readLocal();
      cachedPreferences = local;
      loadedUid = '';
      window.OVYXAISettingsPreferences = local;
      applyControls(panel, local);
      setStatus(panel, 'Could not verify account preferences. Showing saved device settings; changes will not be reported as saved until the server confirms them.', 'error');
      console.warn('[OVYX AI preferences] Account load failed:', error?.message || error);
    } finally {
      if (panel.isConnected) setPanelBusy(panel, false);
    }
  }

  async function persistFromPanel(panel, next, reset) {
    const save = panel.querySelector('#set-ai-save');
    const resetButton = panel.querySelector('#set-ai-reset');
    const activeButton = reset ? resetButton : save;
    if (activeButton?.disabled) return;
    if (activeButton) activeButton.disabled = true;
    setStatus(panel, reset ? 'Resetting AI preferences…' : 'Saving AI preferences…', 'loading');
    if (!String(user()?.uid || '')) {
      const local = normalize(next);
      const savedLocally = writeLocal(local);
      cachedPreferences = local;
      loadedUid = '';
      window.OVYXAISettingsPreferences = local;
      applyControls(panel, local);
      setStatus(panel, savedLocally
        ? (reset ? 'Preferences reset on this device. Sign in to sync defaults to your OVYX account.' : 'Preferences saved on this device. Sign in to sync them to your OVYX account.')
        : 'The browser could not save these preferences locally. Check device storage and retry.',
      savedLocally ? 'local' : 'error');
      if (activeButton?.isConnected) activeButton.disabled = false;
      return;
    }
    try {
      const savedState = await requestPreferences('PUT', normalize(next));
      const serverPreferences = savedState.preferences;
      const localSaved = writeLocal(serverPreferences);
      cachedPreferences = serverPreferences;
      loadedUid = String(user()?.uid || '');
      window.OVYXAISettingsPreferences = serverPreferences;
      applyControls(panel, serverPreferences);
      setStatus(panel, reset
        ? 'Preferences reset and saved to your OVYX account.'
        : (localSaved ? 'Preferences saved to your OVYX account.' : 'Preferences saved to your OVYX account, but this device could not update its local cache.'),
      localSaved ? 'ok' : 'warning');
    } catch (error) {
      setStatus(panel, 'Preferences were not confirmed as saved. ' + String(error?.message || 'Please retry.'), 'error');
      console.warn('[OVYX AI preferences] Save failed:', error?.message || error);
    } finally {
      if (activeButton?.isConnected) activeButton.disabled = false;
    }
  }

  let delegatedSettingsEventsBound = false;

  function installDelegatedSettingsEvents() {
    if (delegatedSettingsEventsBound) return;
    delegatedSettingsEventsBound = true;
    // The legacy Settings renderer replaces the whole AI panel asynchronously.
    // Delegation keeps Save/Reset/mode clicks reliable across those re-renders
    // and prevents the legacy local-only handlers from racing account-backed state.
    document.addEventListener('click', event => {
      const origin = event.target;
      const control = origin instanceof Element
        ? origin.closest('[data-ai-mode], #set-ai-save, #set-ai-reset')
        : null;
      const panel = control?.closest('[data-settings-panel="ai"]');
      if (!control || !panel) return;

      if (control.matches('[data-ai-mode]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const mode = String(control.dataset.aiMode || '');
        if (!ENUMS.mode.includes(mode)) return;
        panel.querySelectorAll('[data-ai-mode]').forEach(button => {
          const selected = button === control;
          button.classList.toggle('selected', selected);
          button.setAttribute('aria-pressed', String(selected));
        });
        const chip = panel.querySelector('.ovyx-health-chip');
        if (chip) chip.textContent = mode.toUpperCase();
        setStatus(panel, 'Mode changed. Select Save AI Preferences to keep this choice on your account.', 'info');
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      if (control.id === 'set-ai-save') {
        void persistFromPanel(panel, controlsToPreferences(panel), false);
      } else if (control.id === 'set-ai-reset') {
        void persistFromPanel(panel, { ...DEFAULTS }, true);
      }
    }, true);
  }

  function bindPanel(panel) {
    if (!panel?.isConnected) return;
    ensureStatus(panel);
    installDelegatedSettingsEvents();
  }

  function wrapSettings() {
    const settings = window.OVYXSettings;
    if (!settings || typeof settings.show !== 'function') {
      console.warn('[OVYX AI preferences] Settings module was not available at initialization.');
      return;
    }
    if (showWrapped) return;
    const originalShow = settings.show.bind(settings);
    settings.show = function (id) {
      const result = originalShow(id);
      if (String(id || '').toLowerCase() === 'ai') {
        window.setTimeout(() => {
          const panel = document.querySelector('[data-settings-panel="ai"]');
          if (!panel) return;
          bindPanel(panel);
          void loadForPanel(panel);
        }, 40);
      }
      return result;
    };
    showWrapped = true;
  }

  function capFileValue(value, maxChars) {
    if (typeof value === 'string') return value.slice(0, maxChars);
    if (Array.isArray(value)) return value.map(item => capFileValue(item, maxChars));
    if (!value || typeof value !== 'object') return value;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string') {
        result[key] = item.length > maxChars ? item.slice(0, maxChars) : item;
      } else if (item && typeof item === 'object') {
        result[key] = capFileValue(item, maxChars);
      } else {
        result[key] = item;
      }
    }
    return result;
  }

  function buildGenerationPayload(payload, preferences) {
    const result = { ...payload };
    const effective = normalize(preferences);
    const explicitProviderChoice = String(payload.provider || payload.requestedProvider || '').trim().toLowerCase();
    const requestedProvider = explicitProviderChoice || 'automatic';
    const isAutomatic = requestedProvider === 'automatic' || requestedProvider === 'auto';
    // The legacy global may mirror a saved preference; it is not a per-request
    // explicit selection. Force automatic unless the caller actually chose one.
    if (!explicitProviderChoice) result.provider = 'automatic';
    result.preferredProvider = payload.preferredProvider || (isAutomatic ? effective.provider : '');
    result.providerRouting = effective.routing;
    result.fallback = effective.fallback;
    if (!payload.model || payload.model === 'automatic') {
      result.model = effective.model || 'automatic';
    }

    const budgetCaps = { efficient: 2048, automatic: 4096, maximum: 16000 };
    const budgetCap = budgetCaps[effective.budget] || budgetCaps.automatic;
    const requestedMax = Number(payload.maxTokens);
    result.maxTokens = Number.isFinite(requestedMax) && requestedMax > 0
      ? Math.min(Math.floor(requestedMax), budgetCap)
      : budgetCap;

    const additions = [];
    if (effective.mode === 'quality') {
      additions.push('AI PREFERENCE — QUALITY: Prioritize thoroughness and complete reasoning. Be methodical, verify important details, and prefer a complete high-quality result over a short answer.');
    } else if (effective.mode === 'fast') {
      additions.push('AI PREFERENCE — FAST: Prioritize speed and concise output. Focus on the highest-value answer with minimal unnecessary explanation.');
    } else {
      additions.push('AI PREFERENCE — BALANCED: Balance output quality and completeness with response speed.');
    }
    if (effective.explain) additions.push('AI PREFERENCE — EXPLANATIONS: Briefly explain major structural or code changes and their important consequences.');
    if (effective.preserve) additions.push('AI PREFERENCE — PRESERVE: Prefer focused changes to the existing project and preserve working structure unless the request requires rebuilding.');
    if (effective.confirmDestructive) additions.push('AI PREFERENCE — DESTRUCTIVE CHANGES: Explain the impact and request user confirmation before destructive changes. Never bypass server-side authorization or tool safety checks.');
    result.system = [String(payload.system || '').trim(), ...additions].filter(Boolean).join('\n\n');

    const context = { ...(payload.context && typeof payload.context === 'object' ? payload.context : {}) };
    const maxFileChars = effective.contextLimit === 'conservative' ? 120000
      : effective.contextLimit === 'expanded' ? 240000
        : 180000;
    let files = payload.files || context.files || null;
    if (effective.contextFiles && files && typeof files === 'object') {
      files = capFileValue(files, maxFileChars);
      result.files = files;
      context.files = files;
    } else {
      delete result.files;
      delete context.files;
    }

    if (effective.contextPage) {
      if (!context.currentPage && payload.page) context.currentPage = payload.page;
    } else {
      delete context.currentPage;
      delete context.page;
      delete context.selectedElement;
    }

    if (!effective.contextGithub) {
      delete context.github;
      delete context.githubRepository;
      delete context.repository;
    }

    result.context = context;
    return result;
  }

  async function effectivePreferences(externalSignal = null) {
    const current = user();
    const uid = String(current?.uid || '');
    if (!uid) return readLocal();
    if (loadedUid === uid && cachedPreferences) return cachedPreferences;
    try { return await loadPreferences(false, externalSignal); }
    catch (_) { return readLocal(); }
  }

  function wrapGenerate() {
    const service = window.OVYXAIService;
    if (!service || typeof service.generate !== 'function') {
      console.warn('[OVYX AI preferences] AI generation service was not available at initialization.');
      return;
    }
    if (generateWrapped) return;
    const originalGenerate = service.generate.bind(service);
    service.generate = async function (payload = {}, options = {}) {
      const preferences = await effectivePreferences(options?.signal || null);
      const request = buildGenerationPayload(payload && typeof payload === 'object' ? payload : {}, preferences);
      return originalGenerate(request, options);
    };
    service.__ovyxSettingsPreferencesV1 = true;
    generateWrapped = true;
  }

  function init() {
    installDelegatedSettingsEvents();
    wrapSettings();
    wrapGenerate();
  }

  if (document.readyState === 'complete') window.setTimeout(init, 0);
  else window.addEventListener('load', () => window.setTimeout(init, 0), { once: true });

  window.OVYXAISettingsPreferencesClient = Object.freeze({
    defaults: { ...DEFAULTS },
    async reload() { return loadPreferences(true); },
    getCurrent() { return normalize(cachedPreferences || readLocal()); }
  });
})();