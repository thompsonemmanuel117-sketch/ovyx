(function () {
  'use strict';
  if (window.__OVYX_SCOPED_ROLLBACK_V1__) return;
  window.__OVYX_SCOPED_ROLLBACK_V1__ = true;

  const VERSION = '20261022-1';
  const snapshots = new WeakMap();
  const visibility = new WeakMap();
  const scopeSelector = '[data-rollback-scope], [role="dialog"], [aria-modal="true"], dialog, [id$="-modal"], .modal, .ovyx-modal, form, [data-settings-panel]';
  let pendingOpen = null;
  let restoring = false;

  const clone = value => {
    try { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    catch (_) { return value == null ? value : {}; }
  };
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const route = () => String(window.KernelState?.activeView ||
    document.querySelector('#view-router-viewport > section:not(.hidden)')?.id || 'home')
    .replace(/^view-/, '').trim().toLowerCase();

  function visible(scope) {
    if (!scope || scope.hidden || scope.getAttribute('aria-hidden') === 'true' || scope.hasAttribute('inert')) return false;
    if (scope.classList?.contains('hidden')) return false;
    try {
      const style = getComputedStyle(scope);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return scope.classList?.contains('open') ||
        scope.classList?.contains('is-open') ||
        scope.getAttribute('aria-modal') === 'true' ||
        scope.getAttribute('role') === 'dialog' ||
        (scope.tagName === 'DIALOG' && scope.open) ||
        scope.matches?.('[data-settings-panel].active');
    } catch (_) { return false; }
  }

  function snapshotProject() {
    const state = window.KernelState;
    if (!state || !Array.isArray(state.projects)) return null;
    const projects = state.projects;
    const active = state.activeProject && typeof state.activeProject === 'object' ? state.activeProject : null;
    const id = String(active?.id || '');
    const index = id ? projects.findIndex(item => String(item?.id || '') === id) : -1;
    return {
      route: route(),
      activeId: id,
      project: index >= 0 ? clone(projects[index]) : active ? clone(active) : null,
      projectIndex: index,
      projectIds: projects.map(item => String(item?.id || '')).filter(Boolean),
      capturedAt: Date.now()
    };
  }

  function fieldsFor(scope) {
    return Array.from(scope.querySelectorAll('input, textarea, select, [contenteditable="true"]'))
      .filter(el => el.type !== 'file')
      .map(el => ({
        el,
        value: 'value' in el ? el.value : undefined,
        checked: 'checked' in el ? el.checked : undefined,
        selectedIndex: 'selectedIndex' in el ? el.selectedIndex : undefined,
        text: el.isContentEditable ? el.textContent : undefined
      }));
  }

  function capture(scope, projectOverride) {
    if (!scope || restoring || snapshots.has(scope)) return false;
    snapshots.set(scope, {
      fields: fieldsFor(scope),
      project: projectOverride === undefined ? snapshotProject() : projectOverride,
      scopeId: String(scope.id || scope.dataset?.rollbackScope || scope.dataset?.settingsPanel || scope.tagName.toLowerCase()),
      route: route(),
      restoreScheduled: false
    });
    return true;
  }

  function restoreProject(snapshot) {
    if (!snapshot) return false;
    const state = window.KernelState;
    if (!state || !Array.isArray(state.projects)) return false;

    const knownIds = new Set(snapshot.projectIds || []);
    const currentId = String(state.activeProject?.id || '');
    const originalId = String(snapshot.activeId || '');
    let changed = false;

    // If Cancel created a new draft project, remove only that newly-created
    // active draft. Existing projects are never bulk-reset or deleted.
    if (currentId && !knownIds.has(currentId)) {
      const length = state.projects.length;
      state.projects = state.projects.filter(item => String(item?.id || '') !== currentId);
      changed = changed || length !== state.projects.length;
    }

    let original = null;
    if (originalId && snapshot.project) {
      original = clone(snapshot.project);
      const index = state.projects.findIndex(item => String(item?.id || '') === originalId);
      if (index >= 0) {
        if (JSON.stringify(state.projects[index]) !== JSON.stringify(original)) changed = true;
        state.projects[index] = original;
      } else {
        const insertAt = Number.isInteger(snapshot.projectIndex)
          ? Math.max(0, Math.min(snapshot.projectIndex, state.projects.length))
          : state.projects.length;
        state.projects.splice(insertAt, 0, original);
        changed = true;
      }
      if (currentId !== originalId || !state.activeProject ||
          JSON.stringify(state.activeProject) !== JSON.stringify(original)) {
        state.activeProject = original;
        changed = true;
      }
    } else if (!originalId && currentId && !knownIds.has(currentId)) {
      state.activeProject = null;
      changed = true;
    }

    if (!changed) return false;
    if (original?.ovyxGraph) {
      try { localStorage.setItem('ovyx.graph.' + originalId, JSON.stringify(original.ovyxGraph)); } catch (_) {}
    }
    // ProjectStore.save is account-gated. In OVYX's guest path it returns
    // false after intentionally clearing the in-memory list; that is valid for
    // a guest "save" attempt, but must never erase an existing rollback snapshot.
    const projectsBeforeSave = state.projects;
    const activeBeforeSave = state.activeProject;
    let projectSaveResult;
    try {
      projectSaveResult = window.ProjectStore?.save?.();
    } catch (error) {
      console.warn('[OVYX scoped rollback] ProjectStore save failed', error);
    }
    if (projectSaveResult === false ||
        (projectsBeforeSave.length > 0 && Array.isArray(state.projects) && state.projects.length === 0)) {
      state.projects = projectsBeforeSave;
      state.activeProject = activeBeforeSave;
      console.warn('[OVYX scoped rollback] Preserved the in-memory project checkpoint after a rejected save.');
    }
    // Restore editor-specific mirrors only when the restored project is the one
    // whose workspace is already mounted. Other project workspaces are untouched.
    if (originalId && route() === 'webstudio' && String(window.WebStudio?.project?.id || '') === originalId) {
      try {
        if (original.ovyxGraph) window.WebStudio.graph = clone(original.ovyxGraph);
        window.WebStudio.project = original;
        window.WebStudio.syncGraphToProject?.(true);
        window.WebStudio.render?.();
      } catch (error) { console.warn('[OVYX scoped rollback] Workspace mirror restore failed', error); }
    }
    try { window.OvyxProjectsUI?.render?.(); } catch (_) {}
    try { window.ProjectStore?.renderProjects?.(); } catch (_) {}
    window.dispatchEvent(new CustomEvent('ovyx:scoped-rollback', {
      detail: { scopeId: 'project', route: snapshot.route, projectId: originalId }
    }));
    return true;
  }

  function restore(scope, reason) {
    const record = scope && snapshots.get(scope);
    if (!record || restoring) return false;
    if (record.restoreScheduled) return true;
    record.restoreScheduled = true;
    restoring = true;
    try {
      record.fields.forEach(item => {
        const el = item.el;
        if (!el?.isConnected) return;
        try {
          if (item.value !== undefined && el.value !== item.value) {
            el.value = item.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (item.checked !== undefined && el.checked !== item.checked) {
            el.checked = item.checked;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (item.selectedIndex !== undefined && el.selectedIndex !== item.selectedIndex) {
            el.selectedIndex = item.selectedIndex;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (item.text !== undefined && el.textContent !== item.text) {
            el.textContent = item.text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } catch (_) {}
      });
    } finally { restoring = false; }

    // Run after the existing cancel/close handler so a legacy onClick cannot
    // overwrite the restored checkpoint later in the same event turn.
    window.setTimeout(() => {
      try { restoreProject(record.project); }
      finally {
        snapshots.delete(scope);
        window.dispatchEvent(new CustomEvent('ovyx:scoped-rollback', {
          detail: {
            scopeId: record.scopeId,
            route: record.route,
            reason: String(reason || 'cancel'),
            projectId: record.project?.activeId || ''
          }
        }));
      }
    }, 0);
    return true;
  }

  function findScope(target) {
    if (!target?.closest) return null;
    return target.closest('[data-rollback-scope], [role="dialog"], [aria-modal="true"], dialog, [id$="-modal"], .modal, .ovyx-modal, form, [data-settings-panel].active');
  }

  function labelOf(button) {
    return normalize(button?.getAttribute('aria-label') || button?.getAttribute('title') ||
      button?.dataset?.modalCancel || button?.textContent || '');
  }
  function isCancel(button) {
    if (!button) return false;
    if (button.matches('[data-modal-cancel], [data-support-cancel], [data-ovyx-cancel-back], [data-rollback-cancel]')) return true;
    const label = labelOf(button);
    if (/^(cancel|discard|revert)(\s|$)/.test(label)) return true;
    return /^(back|close|done|dismiss|×|✕|x)(\s|$)/.test(label) &&
      !!button.closest('[role="dialog"], [aria-modal="true"], dialog, [id$="-modal"], .modal, .ovyx-modal, [data-rollback-scope]');
  }

  function skipOpenSnapshot(button) {
    if (!button || button.closest('[role="dialog"], [aria-modal="true"], dialog, [id$="-modal"], .modal, .ovyx-modal, [data-rollback-scope]')) return true;
    if (button.matches('[data-nav], [data-mobile-nav], [data-view], [data-settings-nav], [data-jump], a[href], [data-rollback-ignore]')) return true;
    const action = String(button.getAttribute('onclick') || '');
    if (/Router\.go|switchView|data-nav|data-mobile-nav/.test(action)) return true;
    return false;
  }

  function onClickCapture(event) {
    if (restoring || !event.target?.closest) return;
    const button = event.target.closest('button, a, [role="button"], [data-modal-cancel], [data-ovyx-cancel-back]');
    if (!button) return;
    if (isCancel(button)) {
      const scope = findScope(button);
      if (scope) restore(scope, 'cancel-control');
      return;
    }
    if (skipOpenSnapshot(button)) return;
    pendingOpen = { project: snapshotProject(), at: Date.now() };
    const current = pendingOpen;
    window.setTimeout(() => { if (pendingOpen === current) pendingOpen = null; }, 800);
  }

  function scan() {
    const candidates = Array.from(document.querySelectorAll(scopeSelector));
    candidates.forEach(scope => {
      const now = visible(scope);
      const was = visibility.get(scope);
      if (now && was !== true && !snapshots.has(scope)) {
        const project = pendingOpen && Date.now() - pendingOpen.at < 800
          ? pendingOpen.project
          : snapshotProject();
        capture(scope, project);
        if (pendingOpen) pendingOpen = null;
      }
      visibility.set(scope, now);
    });
  }

  function install() {
    if (window.__OVYX_SCOPED_ROLLBACK_INSTALLED_V1__) return;
    window.__OVYX_SCOPED_ROLLBACK_INSTALLED_V1__ = true;
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('pointerdown', event => {
      const target = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (!target) return;
      const scope = findScope(target);
      if (scope && !snapshots.has(scope)) capture(scope);
    }, true);
    document.addEventListener('focusin', event => {
      const target = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (!target) return;
      const scope = findScope(target);
      if (scope && !snapshots.has(scope)) capture(scope);
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const scope = findScope(event.target || document.activeElement);
      if (scope) restore(scope, 'escape');
    }, true);
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'open', 'style', 'aria-hidden', 'aria-modal', 'inert', 'data-state']
    });
    scan();
  }

  window.OVYXScopedRollback = {
    version: VERSION,
    capture,
    restore,
    beforeClose: (scope, reason) => restore(scope, reason || 'system-back'),
    restoreProject,
    snapshotProject
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  [250, 1000].forEach(delay => window.setTimeout(install, delay));
})();