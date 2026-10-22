(function () {
  'use strict';
  if (window.__OVYX_SCOPED_ROLLBACK_V1__) return;
  window.__OVYX_SCOPED_ROLLBACK_V1__ = true;

  const VERSION = '20261022-10';
  const snapshots = new WeakMap();
  const visibility = new WeakMap();
  const inlineDisplayBeforeClose = new WeakMap();
  const scopeSelector = '[data-rollback-scope], [role="dialog"], [aria-modal="true"], dialog, [id$="-modal"], .modal, .ovyx-modal, .ovyx-ws-plan-modal, .ovyx-ws-history-modal, .ovyx-preview-portal-modal, .ovyx-v655-support-shell, .ovyx-v84-support-modal';
  let pendingOpen = null;
  let restoring = false;
  let overlayHistoryOpen = false;
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

  function shouldRestoreProjectScope(scope) {
    if (!scope) return false;
    // Full-project rollback is opt-in for project/workspace editing scopes.
    // Dismissing a transient menu, preview portal, settings panel, or generic
    // dialog must never rewind legitimate project changes that happened while
    // that surface was open.
    if (scope.matches?.('[data-rollback-scope="project"], [data-rollback-project="true"]') ||
        scope.dataset?.rollbackScope === 'project' ||
        scope.dataset?.rollbackProject === 'true') return true;
    const identity = normalize([
      scope.id,
      typeof scope.className === 'string' ? scope.className : '',
      scope.getAttribute('aria-label'),
      scope.getAttribute('data-dialog-type')
    ].filter(Boolean).join(' '));
    if (/\b(?:preview|menu|history|command|support|appearance|settings|security|profile|billing|notifications?|export|share|checkout)\b/.test(identity)) {
      return false;
    }
    return /\b(?:project|workspace)\b/.test(identity);
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

    // Capture the decision before the overlay is detached. Form controls are
    // restored for this scope, but the project snapshot is only eligible when
    // this is explicitly (or clearly by identity) a project/workspace editor.
    const restoreProjectCheckpoint = shouldRestoreProjectScope(scope);
    // Run after the existing cancel/close handler so a legacy onClick cannot
    // overwrite the restored checkpoint later in the same event turn.
    window.setTimeout(() => {
      try {
        if (restoreProjectCheckpoint) restoreProject(record.project);
      } finally {
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
    // Prefer the overlay/backdrop root over a nested role=dialog content sheet.
    // Closing only a nested sheet leaves its backdrop open and causes the next
    // Android Back press to be consumed by the same stale overlay again.
    const explicit = target.closest('[data-rollback-scope]');
    if (explicit) return explicit;
    const overlayRoot = target.closest('.ovyx-ws-plan-modal, .ovyx-ws-history-modal, .ovyx-preview-portal-modal, .ovyx-v655-support-shell, .ovyx-v84-support-modal');
    if (overlayRoot) return overlayRoot;
    // Settings panels have their own transactional Cancel semantics (notably
    // ThemeContext preview/Cancel). Do not let generic form rollback override
    // those domain-specific handlers. Only real dialog scopes are handled here.
    return target.closest('[role="dialog"], [aria-modal="true"], dialog, [id$="-modal"], .modal, .ovyx-modal');
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
      !!button.closest('[role="dialog"], [aria-modal="true"], dialog, [id$="-modal"], .modal, .ovyx-modal, .ovyx-ws-plan-modal, .ovyx-ws-history-modal, .ovyx-preview-portal-modal, .ovyx-v655-support-shell, .ovyx-v84-support-modal, [data-rollback-scope]');
  }

  function skipOpenSnapshot(button) {
    if (!button || button.closest('[role="dialog"], [aria-modal="true"], dialog, [id$="-modal"], .modal, .ovyx-modal, .ovyx-ws-plan-modal, .ovyx-ws-history-modal, .ovyx-preview-portal-modal, .ovyx-v655-support-shell, .ovyx-v84-support-modal, [data-rollback-scope]')) return true;
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

  function closeLocalSurfaceForBack() {
    const current = route();
    const body = document.body;
    const studio = window.WebStudio;
    if (current !== 'webstudio') {
      const drawer = document.getElementById('mobile-drawer');
      if (drawer && (
        drawer.classList.contains('open') ||
        drawer.classList.contains('is-open') ||
        body.classList.contains('ovyx-drawer-open') ||
        !drawer.classList.contains('-translate-x-full')
      )) {
        try { window.MobileDrawer?.close?.(); } catch (_) {}
        body.classList.remove('ovyx-drawer-open');
        return true;
      }
      return false;
    }

    const modeMenu = document.getElementById('ws-mode-menu');
    if (modeMenu && !modeMenu.hidden) {
      try { studio?.closeModeMenu?.(); } catch (_) {}
      modeMenu.hidden = true;
      return true;
    }
    const previewMenu = document.getElementById('ws-preview-menu');
    if (previewMenu && !previewMenu.hidden) {
      try { studio?.closePreviewMenu?.(); } catch (_) {}
      previewMenu.hidden = true;
      return true;
    }
    if (body.classList.contains('ovyx-ws-nav-open') ||
        body.classList.contains('ovyx-ws-mobile-nav-open')) {
      try { window.OVYXWebStudioNavigation?.close?.(); } catch (_) {}
      try { studio?.closeProjectNavigation?.(); } catch (_) {}
      body.classList.remove('ovyx-ws-nav-open', 'ovyx-ws-mobile-nav-open');
      return true;
    }
    const ws = document.getElementById('view-webstudio');
    if (ws?.getAttribute('data-ws-code-open') === '1') {
      const back = document.getElementById('ovyx-code-back');
      if (back) {
        try { back.click(); return true; } catch (_) {}
      }
      try { studio?.syncGraphToProject?.(true); } catch (_) {}
      ws.setAttribute('data-ws-code-open', '0');
      const code = document.getElementById('ws-code-workspace');
      if (code) { code.hidden = true; code.setAttribute('aria-hidden', 'true'); }
      document.documentElement.classList.remove('ovyx-code-focused-route');
      try { studio?.render?.(); } catch (_) {}
      try { window.persistStateNow?.('shared-back-close-code'); } catch (_) {}
      return true;
    }
    if (body.classList.contains('ovyx-ws-mobile-preview-open')) {
      try {
        if (typeof window.OVYXMobilePreviewRouting?.close === 'function') window.OVYXMobilePreviewRouting.close();
        else studio?.closeMobilePreview?.();
      } catch (_) {}
      body.classList.remove('ovyx-ws-mobile-preview-open', 'ovyx-ws-preview-full', 'ovyx-ws-preview-collapsed', 'ovyx-preview-expanded');
      const preview = document.getElementById('ws-mobile-preview');
      if (preview) { preview.hidden = true; preview.setAttribute('aria-hidden', 'true'); }
      try { window.persistStateNow?.('shared-back-close-mobile-preview'); } catch (_) {}
      return true;
    }
    if (body.classList.contains('ovyx-ws-preview-full')) {
      try { studio?.returnToChat?.(); } catch (_) {}
      body.classList.remove('ovyx-ws-preview-full');
      body.classList.add('ovyx-ws-preview-collapsed');
      try { window.persistStateNow?.('shared-back-close-preview'); } catch (_) {}
      return true;
    }
    if (body.classList.contains('ovyx-ws-chat-focus') ||
        body.classList.contains('ovyx-ws-preview-collapsed') ||
        ws?.classList.contains('ovyx-preview-expanded')) {
      try { studio?.returnToSplit?.(); } catch (_) {}
      body.classList.remove('ovyx-ws-chat-focus', 'ovyx-ws-preview-collapsed', 'ovyx-ws-preview-full');
      ws?.classList.remove('ovyx-preview-expanded');
      try { studio?.updateDesktopSplitControls?.(); } catch (_) {}
      try { window.persistStateNow?.('shared-back-restore-split'); } catch (_) {}
      return true;
    }
    return false;
  }

  function hasActiveStudioTask() {
    if (route() !== 'webstudio') return false;
    const studio = window.WebStudio || {};
    const session = window.__OVYX_WEBSTUDIO_TASK_SESSION_V2__ || {};
    return !!(
      studio.pendingBuild ||
      studio.liveAiActive ||
      Number(studio.__ovyxTaskInFlightCount || 0) > 0 ||
      Number(session.inFlightCount || 0) > 0 ||
      Number(session.fetchInFlightCount || 0) > 0
    );
  }

  function cancelStudioTaskSafely() {
    try {
      const coordinator = window.OVYXWebStudioCancelSafety;
      if (coordinator && typeof coordinator.cancel === 'function' && coordinator.cancel() === true) return true;
    } catch (error) {
      console.warn('[OVYX shared Back cancellation]', error);
    }
    try {
      const studio = window.WebStudio;
      if (studio && typeof studio.cancelActiveTask === 'function' && studio.cancelActiveTask() === true) return true;
    } catch (error) {
      console.warn('[OVYX shared Back rollback]', error);
    }
    return false;
  }

  function consumeHistoryBack(event, reason, scope, closed) {
    saveCurrentRouteEntry(event?.state);
    lastPopstateResult = {
      at: Date.now(),
      handled: true,
      reason: String(reason || 'local-surface-close'),
      route: route(),
      scopeId: String(scope?.id || scope?.dataset?.rollbackScope || scope?.className || scope?.tagName || ''),
      closed: !!closed,
      hidden: !!scope?.hidden,
      hasOpenClass: !!scope?.classList?.contains('open')
    };
    try { event?.stopImmediatePropagation?.(); event?.stopPropagation?.(); } catch (_) {}
    return true;
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

    // The foremost transient surface wins over a dialog that happens to be
    // mounted behind it. In particular, a mobile Preview/Code/Settings drawer
    // must close before an underlying modal can consume the same Back press.
    // This ordering also matches the explicit OVYXNavigation.back control.
    if (closeLocalSurfaceForBack()) {
      return consumeHistoryBack(event, 'local-surface-close', null, true);
    }

    const scope = topOpenScope();
    if (scope) {
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
      return consumeHistoryBack(event,
        restored ? 'overlay-rollback-and-close' : 'overlay-close-no-snapshot-change',
        scope,
        !!closed && !visible(scope));
    }

    if (hasActiveStudioTask()) {
      const cancelled = cancelStudioTaskSafely();
      if (!cancelled) {
        try { window.WebStudio?.persistState?.('shared-back-protect-work'); } catch (_) {}
        try { window.showToast?.('OVYX kept your workspace open to protect this task. Use the task Cancel control when it is available.', 'warning'); } catch (_) {}
      }
      return consumeHistoryBack(event, cancelled ? 'active-task-scoped-rollback' : 'active-task-preserved', null, cancelled);
    }

    // Route ownership can be split across legacy shell listeners. If another
    // listener fails to complete a same-document Back traversal, handle the
    // destination here instead of leaving the app on the old route or requiring
    // repeated taps. This runs only after local overlays and task cancellation
    // have had first priority.
    const targetRoute = normalize(event?.state?.ovyxRoute || history.state?.ovyxRoute);
    const currentRoute = route();
    if (targetRoute === 'settings' && currentRoute === 'settings') {
      const targetPanel = normalize(event?.state?.ovyxSettingsPanel || history.state?.ovyxSettingsPanel);
      const activePanel = normalize(window.OVYXSettings?.current ||
        document.querySelector('#view-settings [data-settings-panel].active')?.dataset?.settingsPanel || '');
      if (targetPanel && targetPanel !== activePanel) {
        try {
          if (typeof window.OVYXSettings?.show === 'function') {
            const previousSuppression = window.__OVYXV665_SUPPRESS_HISTORY;
            window.__OVYXV665_SUPPRESS_HISTORY = true;
            try {
              window.OVYXSettings.show(targetPanel);
            } finally {
              if (previousSuppression === undefined) delete window.__OVYXV665_SUPPRESS_HISTORY;
              else window.__OVYXV665_SUPPRESS_HISTORY = previousSuppression;
            }
            lastPopstateResult = { at: Date.now(), handled: true, reason: 'settings-panel-history-fallback',
              route: currentRoute, scopeId: targetPanel, closed: false };
            event?.stopImmediatePropagation?.();
            event?.stopPropagation?.();
            return true;
          }
        } catch (error) { console.warn('[OVYX settings Back fallback]', error); }
      }
    }
    // Some older OVYX runtimes can leave adjacent same-route SPA entries
    // behind even when the visible route didn't change. If Back lands on an
    // earlier OVYX shell entry for the route already on screen, consume that
    // duplicate silently and continue to the next distinct app route. This
    // prevents a second Back press from appearing to do nothing on Projects,
    // App Studio, or any other view. Only tagged OVYX shell states are skipped;
    // external/document history entries are left to the browser.
    if (targetRoute && targetRoute === currentRoute &&
        event?.state?.ovyxShell === true) {
      lastPopstateResult = {
        at: Date.now(), handled: true, reason: 'duplicate-route-entry-skipped',
        route: currentRoute, scopeId: '', closed: false
      };
      try { event?.stopImmediatePropagation?.(); event?.stopPropagation?.(); } catch (_) {}
      window.setTimeout(() => {
        try { window.history.back(); } catch (error) {
          console.warn('[OVYX duplicate route Back]', error);
        }
      }, 0);
      return true;
    }

    if (targetRoute && targetRoute !== currentRoute && typeof window.Router?.go === 'function') {
      const previousSuppression = window.__OVYXV665_SUPPRESS_HISTORY;
      // The popped entry already represents targetRoute. Router.go is used only
      // to reconcile the visible SPA route; it must not push a second identical
      // history entry while its legacy/canonical wrappers emit view-changed.
      window.__OVYXV665_SUPPRESS_HISTORY = true;
      try {
        window.Router.go(targetRoute);
        lastPopstateResult = { at: Date.now(), handled: true, reason: 'route-history-fallback',
          route: targetRoute, scopeId: '', closed: false };
        event?.stopImmediatePropagation?.();
        event?.stopPropagation?.();
        return true;
      } catch (error) {
        console.warn('[OVYX route Back fallback]', error);
      } finally {
        if (previousSuppression === undefined) delete window.__OVYXV665_SUPPRESS_HISTORY;
        else window.__OVYXV665_SUPPRESS_HISTORY = previousSuppression;
      }
    }
    return false;
  }

  function wrapNavigationBack() {
    const navigation = window.OVYXNavigation;
    if (!navigation || typeof navigation.back !== 'function' || navigation.back.__ovyxScopedRollbackWrapped) return;
    const original = navigation.back.bind(navigation);
    const wrapped = function () {
      if (closeLocalSurfaceForBack()) return true;
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

  function pushOverlayHistoryEntry() {
    try {
      const state = history.state && typeof history.state === 'object' ? history.state : {};
      history.pushState(Object.assign({}, state, {
        ovyxRoute: route(),
        ovyxShell: true
      }), document.title, location.href);
      return true;
    } catch (error) {
      console.warn('[OVYX scoped rollback] Could not add a browser Back entry for an overlay', error);
      return false;
    }
  }

  function scan() {
    const candidates = Array.from(document.querySelectorAll(scopeSelector));
    let hasOpenScope = false;
    candidates.forEach(scope => {
      restoreDisplayIfReopened(scope);
      const now = visible(scope);
      if (now) hasOpenScope = true;
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
    // Native/browser Back only emits popstate when there is a same-document
    // history entry to traverse. Add one on the first visible-overlay edge,
    // rather than relying on tests or individual overlay handlers to seed it.
    if (hasOpenScope && !overlayHistoryOpen) pushOverlayHistoryEntry();
    overlayHistoryOpen = hasOpenScope;
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
    closeLocalSurfaceForBack,
    diagnostics: () => ({ ...lastPopstateResult }),
    restoreProject,
    snapshotProject
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  [250, 1000].forEach(delay => window.setTimeout(install, delay));
})();