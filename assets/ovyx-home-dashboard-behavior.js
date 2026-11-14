(() => {
  'use strict';
  if (window.__OVYX_HOME_DASHBOARD_BEHAVIOR_V1__) return;
  window.__OVYX_HOME_DASHBOARD_BEHAVIOR_V1__ = true;

  const byId = id => document.getElementById(id);
  const RESPONSE_DEPTH_KEY = 'ovyx.ws.responseDepth.v1';
  const MODE_TO_DEPTH = { fast: 1, balanced: 2, quality: 3 };
  const DEPTH_TO_MODE = { 1: 'fast', 2: 'balanced', 3: 'quality' };
  const MODE_LABELS = { fast: 'Fast', balanced: 'Standard', quality: 'Detailed' };
  const MODE_DESCRIPTIONS = {
    fast: 'Get results quickly for simple requests and small changes.',
    balanced: 'A balanced response for everyday tasks.',
    quality: 'More careful, thorough responses for complex projects.'
  };

  function activityTimestamp(project) {
    const value = project?.updatedAt ?? project?.modifiedAt ?? project?.updated_at
      ?? project?.createdAt ?? project?.created_at ?? 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = String(value || '').trim();
    if (!raw) return 0;
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : 0;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function sortProjects(projects) {
    return (Array.isArray(projects) ? projects : [])
      .map((project, index) => ({ project, index, activity: activityTimestamp(project) }))
      .sort((a, b) => b.activity - a.activity || a.index - b.index)
      .map(item => item.project);
  }

  function injectStyles() {
    if (byId('ovyx-home-dashboard-behavior-style')) return;
    const style = document.createElement('style');
    style.id = 'ovyx-home-dashboard-behavior-style';
    style.textContent = `
      #home-projects-grid .v59-recent-empty {
        display: flex; align-items: center; gap: 16px; min-height: 132px;
        padding: 20px; border: 1px dashed var(--app-border, rgba(255,255,255,.14));
        border-radius: 14px; background: var(--app-card, rgba(255,255,255,.025));
        color: var(--app-text, #f2f2f0);
      }
      #home-projects-grid .v59-recent-empty-mark {
        display: grid; place-items: center; flex: 0 0 42px; width: 42px; height: 42px;
        border: 1px solid color-mix(in srgb, var(--app-accent, #c2a36b) 28%, transparent);
        border-radius: 12px; color: var(--app-accent, #c2a36b); font-size: 25px;
        background: color-mix(in srgb, var(--app-accent, #c2a36b) 8%, transparent);
      }
      #home-projects-grid .v59-recent-empty > div { min-width: 0; flex: 1; }
      #home-projects-grid .v59-recent-empty strong { display: block; font: 750 12px/1.4 Inter, sans-serif; }
      #home-projects-grid .v59-recent-empty p { margin: 5px 0 0; color: var(--app-muted, #85858b); font: 500 10px/1.55 Inter, sans-serif; }
      #home-projects-grid .v59-recent-empty button {
        min-height: 38px; padding: 0 13px; border: 1px solid var(--app-accent, #c2a36b);
        border-radius: 9px; background: var(--app-accent, #c2a36b); color: #090909;
        font: 800 9px Inter, sans-serif; cursor: pointer; white-space: nowrap;
      }
      #home-projects-grid .v59-recent-empty button:focus-visible {
        outline: 2px solid var(--app-text, #fff); outline-offset: 3px;
      }
      @media(max-width:560px) {
        #home-projects-grid .v59-recent-empty { align-items: flex-start; flex-wrap: wrap; gap: 11px; padding: 15px; }
        #home-projects-grid .v59-recent-empty > div { flex-basis: calc(100% - 56px); }
        #home-projects-grid .v59-recent-empty button { width: 100%; }
      }
    `;
    document.head?.appendChild(style);
  }

  function installProjectBehavior() {
    const store = window.ProjectStore;
    if (!store || store.__ovyxHomeDashboardBehaviorV1) return;
    const originalList = typeof store.list === 'function' ? store.list.bind(store) : null;
    store.list = function () {
      const projects = originalList ? originalList() : window.KernelState?.projects;
      return sortProjects(projects);
    };
    store.renderHome = function () {
      const host = byId('home-projects-grid');
      if (!host) return;
      const items = this.list().slice(0, 3);
      if (!items.length) {
        host.innerHTML = '<div class="v59-recent-empty" role="status"><span class="v59-recent-empty-mark" aria-hidden="true">◇</span><div><strong>No projects yet</strong><p>Your saved websites and apps will appear here. Start your first project whenever you are ready.</p></div><button type="button" data-ovyx-home-create>Start a project <span aria-hidden="true">→</span></button></div>';
        return;
      }
      host.innerHTML = items.map(project => this.card(project, true)).join('');
    };
    store.__ovyxHomeDashboardBehaviorV1 = true;
    document.addEventListener('click', event => {
      const trigger = event.target?.closest?.('[data-ovyx-home-create]');
      if (!trigger) return;
      event.preventDefault?.();
      if (typeof window.ProjectStore?.createPromptModal === 'function') {
        window.ProjectStore.createPromptModal();
      } else {
        window.Router?.go?.('projects');
      }
    });
    store.renderHome();
  }

  function updateRoutingNote(mode) {
    const note = byId('v59-routing-note');
    const copy = note?.querySelector?.('span');
    if (!copy) return;
    const label = MODE_LABELS[mode] || MODE_LABELS.balanced;
    const detail = MODE_DESCRIPTIONS[mode] || MODE_DESCRIPTIONS.balanced;
    copy.textContent = label + ' · ' + detail;
  }

  function applyMode(mode, persist = true) {
    const selected = Object.prototype.hasOwnProperty.call(MODE_TO_DEPTH, mode) ? mode : 'balanced';
    const depth = MODE_TO_DEPTH[selected];
    const selector = byId('v59-ai-mode-select');
    if (selector) {
      if (selector.value !== selected) selector.value = selected;
      Array.from(selector.options || []).forEach(option => {
        if (Object.prototype.hasOwnProperty.call(MODE_LABELS, option.value)) option.textContent = MODE_LABELS[option.value];
      });
      selector.setAttribute?.('aria-label', 'Response detail');
      selector.title = MODE_DESCRIPTIONS[selected] || MODE_DESCRIPTIONS.balanced;
    }
    if (window.WebStudio) window.WebStudio.responseDepth = depth;
    const depthControl = byId('ws-brain-depth');
    if (depthControl && String(depthControl.value) !== String(depth)) {
      depthControl.value = String(depth);
      depthControl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (persist) {
      try { localStorage.setItem(RESPONSE_DEPTH_KEY, String(depth)); } catch (_) {}
    }
    updateRoutingNote(selected);
    return depth;
  }

  function syncModeFromDepth() {
    let depth = Number(window.WebStudio?.responseDepth || 0);
    if (![1, 2, 3].includes(depth)) {
      try { depth = Number(localStorage.getItem(RESPONSE_DEPTH_KEY)); } catch (_) {}
    }
    if (![1, 2, 3].includes(depth)) depth = 2;
    const mode = DEPTH_TO_MODE[depth] || 'balanced';
    applyMode(mode, false);
  }

  function onChange(event) {
    if (event.target?.id === 'v59-ai-mode-select') applyMode(event.target.value);
  }

  function onInput(event) {
    if (event.target?.id !== 'ws-brain-depth') return;
    const depth = Math.max(1, Math.min(3, Math.round(Number(event.target.value) || 2)));
    const mode = DEPTH_TO_MODE[depth] || 'balanced';
    const selector = byId('v59-ai-mode-select');
    if (selector) selector.value = mode;
    if (window.WebStudio) window.WebStudio.responseDepth = depth;
    try { localStorage.setItem(RESPONSE_DEPTH_KEY, String(depth)); } catch (_) {}
    updateRoutingNote(mode);
  }

  function boot() {
    installProjectBehavior();
    document.addEventListener('change', onChange, { passive: true });
    document.addEventListener('input', onInput, { passive: true });
    syncModeFromDepth();
    window.addEventListener('ovyx:view-changed', syncModeFromDepth, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.OVYXHomeDashboardBehavior = { activityTimestamp, sortProjects, applyMode, syncModeFromDepth };
})();
