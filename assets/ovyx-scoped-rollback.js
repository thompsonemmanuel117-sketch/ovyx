(function () {
  'use strict';
  if (window.__OVYX_SCOPED_ROLLBACK_V1__) return;
  window.__OVYX_SCOPED_ROLLBACK_V1__ = true;

  const VERSION = '20261022-3';
  const snapshots = new WeakMap();
  const visibility = new WeakMap();
  const inlineDisplayBeforeClose = new WeakMap();
  const scopeSelector = '[data-rollback-scope], [role="dialog"], [aria-modal="true"], dialog, [id$="-modal"], .modal, .ovyx-modal';
  let pendingOpen = null;
  let restoring = false;
  let lastPopstateResult = {
    at: 0,
    handled: false,
    reason: 'not-called',
    route: '',
    scopeId: '',
    closed: false
  };

  const clone = value => {
    try { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    catch (_) { return value == null ? value : {}; }
  };
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const route = () => String(window.KernelState?.activeView ||
    document.querySelector('#view-router-viewport > section:not(.hidden)')?.id || 'home')
    .replace(/^view-/, '').trim().toLowerCase();

  function visible(scope) {
    if (!scope || !scope.isConnected) return false;
    // A modal inside a hidden route is not the top layer. Walk its ancestors
    // so stale dialogs in inactive views cannot steal the next Back press.
    for (let parent = scope; parent && parent !== document.documentElement; parent = parent.parentElement) {
      if (parent.hidden || parent.hasAttribute('inert') || parent.getAttribute('aria-hidden') === 'true' ||
          parent.classList?.contains('hidden')) return false;
      try {
        const parentStyle = getComputedStyle(parent);
        if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') return false;
      } catch (_) { return false; }
    }
    try {
      const style = getComputedStyle(scope);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return scope.classList?.contains('open') ||
        scope.classList?.contains('is-open') ||
        scope.getAttribute('aria-modal') === 'true' ||
        scope.getAttribute('role') === 'dialog' ||
        (scope.tagName === 'DIALOG' && scope.open) ||
        scope.matches?.('[data-rollback-scope]');
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
      // Keep references (not deep copies) to existing project records. If a
      // guest save guard clears the array, these references let rollback put
      // missing unrelated projects back without overwriting their newer edits.
      projectList: projects.map((item, index) => ({
        id: String(item?.id || ''),
        index,
        ref: item
      })).filter(item => item.id),
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

    // Discard an active project created during this scoped draft, but never
    // remove an older project just because account/session hydration replaced
    // the in-memory collection.
    if (currentId && !knownIds.has(currentId)) {
      const length = state.projects.length;
      state.projects = state.projects.filter(item => String(item?.id || '') !== currentId);
      changed = changed || length !== state.projects.length;
    }

    // Restore any pre-existing project records that disappeared while the
    // scoped dialog was active. Keep current records as-is; only reinsert IDs
    // that are missing, using their existing object references.
    (Array.isArray(snapshot.projectList) ? snapshot.projectList : []).forEach(record => {
      const id = String(record?.id || record?.ref?.id || '');
      const projectRef = record?.ref;
      if (!id || !projectRef || typeof projectRef !== 'object' ||
          state.projects.some(item => String(item?.id || '') === id)) return;
      const insertAt = Number.isInteger(record.index)
        ? Math.max(0, Math.min(record.index, state.projects.length))
        : state.projects.length;
      state.projects.splice(insertAt, 0, projectRef);
      changed = true;
    });

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
    // Settings panels have their own transactional Cancel semantics (notably
    // ThemeContext preview/Cancel). Do not let generic form rollback override
    // those domain-specific handlers. Only explicit rollback scopes and true
    // overlay containers are owned by this shared layer.
    return target.closest('[data-rollback-scope], [role="dialog"], [aria-modal="true"], dialog, [id$="-modal"], .modal, .ovyx-modal');
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

  function topOpenScope() {
    const candidates = Array.from(document.querySelectorAll(scopeSelector));
    candidates.forEach(restoreDisplayIfReopened);
    const openCandidates = candidates.filter(visible);
    openCandidates.sort((a, b) => {
      const za = Number.parseInt(getComputedStyle(a).zIndex || '0', 10) || 0;
      const zb = Number.parseInt(getComputedStyle(b).zIndex || '0', 10) || 0;
      if (za !== zb) return za - zb;
      const relation = a.compareDocumentPosition(b);
      return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : relation & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    });
    return openCandidates[openCandidates.length - 1] || null;
  }

  function restoreDisplayIfReopened(scope) {
    const previous = inlineDisplayBeforeClose.get(scope);
    if (!previous || !scope || scope.hidden || scope.hasAttribute('inert') ||
        scope.getAttribute('aria-hidden') === 'true') return false;
    const opening = scope.classList?.contains('open') ||
      scope.classList?.contains('is-open') ||
      scope.getAttribute('aria-modal') === 'true' ||
      scope.getAttribute('role') === 'dialog' ||
      (scope.tagName === 'DIALOG' && scope.open) ||
      scope.matches?.('[data-rollback-scope]');
    if (!opening) return false;
    if (previous.value) scope.style.setProperty('display', previous.value, previous.priority);
    else scope.style.removeProperty('display');
    inlineDisplayBeforeClose.delete(scope);
    return true;
  }

  function closeScope(scope) {
    if (!scope) return false;
    try {
      if (scope.tagName === 'DIALOG' && scope.open && typeof scope.close === 'function') {
        scope.close();
      } else {
        if (!inlineDisplayBeforeClose.has(scope)) {
          inlineDisplayBeforeClose.set(scope, {
            value: scope.style.getPropertyValue('display'),
            priority: scope.style.getPropertyPriority('display')
          });
        }
        scope.classList?.remove('open', 'is-open');
        scope.hidden = true;
        scope.setAttribute('aria-hidden', 'true');
        // Some legacy modals use inline display styles that outrank [hidden].
        // Preserve the original style and restore it if the same modal opens again.
        scope.style.setProperty('display', 'none', 'important');
      }
      return true;
    } catch (error) {
      console.warn('[OVYX scoped rollback] Could not close overlay', error);
      return false;
    }
  }

  function saveCurrentRouteEntry(stateHint) {
    try {
      const state = history.state && typeof history.state === 'object'
        ? history.state
        : (stateHint && typeof stateHint === 'object' ? stateHint : {});
      history.pushState(Object.assign({}, state, {
        ovyxRoute: route(),
        ovyxShell: true
      }), document.title, location.href);
    } catch (error) {
      console.warn('[OVYX scoped rollback] Could not retain current route after overlay Back', error);
    }
  }

  function handleHistoryPop(event) {
    lastPopstateResult = {
      at: Date.now(),
      handled: false,
      reason: restoring ? 'rollback-already-running' : 'no-visible-overlay',
      route: route(),
      scopeId: '',
      closed: false
    };
    if (restoring) return false;
    const scope = topOpenScope();
    if (!scope) return false;
    lastPopstateResult.scopeId = String(scope.id || scope.dataset?.rollbackScope || scope.className || scope.tagName || 'overlay');

    if (!snapshots.has(scope)) {
      const openingProject = pendingOpen && Date.now() - pendingOpen.at < 800
        ? pendingOpen.project
        : snapshotProject();
      capture(scope, openingProject);
      pendingOpen = null;
    }

    const restored = restore(scope, 'system-back');
    const closed = closeScope(scope);
    // A dialog Back belongs to the current view. Restore that route entry so a
    // second Back navigates away normally instead of resetting the SPA.
    saveCurrentRouteEntry(event?.state);
    lastPopstateResult = {
      at: Date.now(),
      handled: true,
      reason: restored ? 'overlay-rollback-and-close' : 'overlay-close-no-snapshot-change',
      route: route(),
      scopeId: String(scope.id || scope.dataset?.rollbackScope || scope.className || scope.tagName || 'overlay'),
      closed: !!closed && !visible(scope),
      hidden: !!scope.hidden,
      hasOpenClass: !!scope.classList?.contains('open')
    };
    try { event?.stopImmediatePropagation?.(); event?.stopPropagation?.(); } catch (_) {}
    return true;
  }

  function wrapNavigationBack() {
    const navigation = window.OVYXNavigation;
    if (!navigation || typeof navigation.back !== 'function' || navigation.back.__ovyxScopedRollbackWrapped) return;
    const original = navigation.back.bind(navigation);
    const wrapped = function () {
      const scope = topOpenScope();
      if (scope) {
        if (!snapshots.has(scope)) {
          const openingProject = pendingOpen && Date.now() - pendingOpen.at < 800
            ? pendingOpen.project
            : snapshotProject();
          capture(scope, openingProject);
          pendingOpen = null;
        }
        restore(scope, 'system-back');
        closeScope(scope);
        saveCurrentRouteEntry();
        return true;
      }
      return original.apply(this, arguments);
    };
    wrapped.__ovyxScopedRollbackWrapped = true;
    wrapped.__ovyxScopedRollbackOriginal = original;
    navigation.back = wrapped;
  }

  function scan() {
    const candidates = Array.from(document.querySelectorAll(scopeSelector));
    candidates.forEach(scope => {
      restoreDisplayIfReopened(scope);
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
    // Capture phase runs before the shell's broader route popstate handler.
    // Overlay Back is consumed here; ordinary app-route Back continues through
    // the existing canonical OVYX router. Settings subpanel history also stays
    // with the existing Settings route owner.
    window.addEventListener('popstate', handleHistoryPop, true);
    wrapNavigationBack();
    scan();
  }

  window.OVYXScopedRollback = {
    version: VERSION,
    capture,
    restore,
    beforeClose: (scope, reason) => restore(scope, reason || 'system-back'),
    handleHistoryPop,
    topOpenScope,
    diagnostics: () => ({ ...lastPopstateResult }),
    restoreProject,
    snapshotProject
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  [250, 1000].forEach(delay => window.setTimeout(install, delay));
})();