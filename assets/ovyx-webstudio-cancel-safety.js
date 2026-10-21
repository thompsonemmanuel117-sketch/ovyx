(function () {
  'use strict';
  if (window.__OVYX_WEBSTUDIO_CANCEL_SAFETY_V1__) return;
  window.__OVYX_WEBSTUDIO_CANCEL_SAFETY_V1__ = true;

  const clone = value => {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return value == null ? value : {}; }
  };
  const getStudio = () => window.WebStudio || null;
  const getState = () => window.KernelState || null;
  const cancelStyleId = 'ovyx-webstudio-task-cancel-style-v1';

  function ensureCancelStyle() {
    if (document.getElementById(cancelStyleId)) return;
    const style = document.createElement('style');
    style.id = cancelStyleId;
    style.textContent = [
      '#ws-task-cancel{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:68px;padding:0 12px;margin-right:8px;border:1px solid rgba(248,113,113,.38);border-radius:12px;background:rgba(248,113,113,.08);color:#fecaca;font:700 12px/1 Inter,system-ui,sans-serif;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
      '#ws-task-cancel:hover,#ws-task-cancel:focus-visible{outline:none;background:rgba(248,113,113,.15);border-color:rgba(248,113,113,.72)}',
      '#ws-task-cancel[hidden]{display:none!important}',
      '@media(max-width:767px){#ws-task-cancel{min-width:72px;min-height:44px;padding:0 13px;font-size:12px}}',
      '@media(prefers-reduced-motion:reduce){#ws-task-cancel{transition:none}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureCancelButton(studio) {
    ensureCancelStyle();
    const send = document.getElementById('ws-chat-send');
    const composer = document.getElementById('ws-chat-composer');
    if (!send || !composer) return null;
    let button = document.getElementById('ws-task-cancel');
    if (!button) {
      button = document.createElement('button');
      button.id = 'ws-task-cancel';
      button.type = 'button';
      button.textContent = 'Cancel';
      button.setAttribute('aria-label', 'Cancel current task and restore project changes');
      button.setAttribute('title', 'Cancel this task and keep the rest of your project');
      button.hidden = true;
      send.parentNode.insertBefore(button, send);
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        const activeStudio = getStudio();
        if (activeStudio && typeof activeStudio.cancelActiveTask === 'function') {
          activeStudio.cancelActiveTask();
        }
      });
    }
    syncCancelButton(studio);
    return button;
  }

  function syncCancelButton(studio) {
    const button = document.getElementById('ws-task-cancel');
    if (!button) return;
    const busy = !!(studio && studio.pendingBuild && studio.__ovyxTaskRollbackSnapshot);
    button.hidden = !busy;
    button.disabled = !busy;
    button.setAttribute('aria-hidden', String(!busy));
  }

  function captureSnapshot(studio) {
    const state = getState();
    const project = state && state.activeProject;
    if (!project || !project.id) return null;
    try { studio.ensureProjectGraph && studio.ensureProjectGraph(); } catch (_) {}
    let graph = null;
    try {
      graph = typeof studio.snapshotGraph === 'function'
        ? studio.snapshotGraph()
        : clone(studio.graph || project.ovyxGraph || {});
    } catch (_) { graph = clone(studio.graph || project.ovyxGraph || {}); }
    return {
      projectId: String(project.id),
      project: clone(project),
      graph: clone(graph || {}),
      startedAt: Date.now()
    };
  }

  function snapshotFromRepair(rollback) {
    if (!rollback || !rollback.projectId || !rollback.project || !rollback.graph) return null;
    return {
      projectId: String(rollback.projectId),
      project: clone(rollback.project),
      graph: clone(rollback.graph),
      startedAt: Date.now()
    };
  }

  function restoreProjectOnly(studio, snapshot, targetWasActiveAtCancel) {
    const state = getState();
    if (!state || !snapshot || !snapshot.projectId || !snapshot.project) return false;
    const targetId = String(snapshot.projectId);
    const activeIdBeforeRestore = String(state.activeProject && state.activeProject.id || '');
    // abortActiveAi() may update the active-project pointer. Decide whether to
    // restore the task as active using the state from the instant Cancel was
    // pressed, not the pointer after abort side effects.
    const shouldRestoreAsActive = typeof targetWasActiveAtCancel === 'boolean'
      ? targetWasActiveAtCancel
      : activeIdBeforeRestore === targetId;
    const projects = Array.isArray(state.projects) ? state.projects.slice() : [];
    const existingIndex = projects.findIndex(project => String(project && project.id || '') === targetId);
    const savedProject = clone(snapshot.project);
    const savedGraph = clone(snapshot.graph || savedProject.ovyxGraph || {});
    savedProject.ovyxGraph = clone(savedGraph);

    if (existingIndex >= 0) {
      projects[existingIndex] = savedProject;
    } else if (shouldRestoreAsActive) {
      // A transient active project can be missing from the collection before its first save.
      projects.push(savedProject);
    } else {
      // If the user explicitly removed a project while a request was pending, do not resurrect it.
      return false;
    }
    state.projects = projects;

    const targetIsStillActive = shouldRestoreAsActive;
    if (targetIsStillActive) {
      state.activeProject = savedProject;
      studio.graph = clone(savedGraph);
      try {
        const prefix = String(studio.graphKeyPrefix || 'ovyx.ws.graph.v2.');
        localStorage.setItem(prefix + targetId, JSON.stringify(studio.graph));
      } catch (_) {}
    }

    // Saving through ProjectStore preserves every other project as it exists now.
    // It must never replace the entire project list with an old request-time snapshot.
    try { window.ProjectStore && window.ProjectStore.save && window.ProjectStore.save(); }
    catch (error) { console.warn('[OVYX task rollback]', String(error && error.message || error).slice(0, 160)); }

    if (targetIsStillActive) {
      try { studio.renderPreview && studio.renderPreview(); } catch (_) {}
      try { studio.render && studio.render(); } catch (_) {}
    }
    return true;
  }

  function installTaskTracker(studio, methodName) {
    const original = studio[methodName];
    if (typeof original !== 'function' || original.__ovyxCancelSafetyWrapped) return;
    const wrapped = function () {
      const args = Array.from(arguments);
      const repairSnapshot = methodName === 'runBuildAgent' ? snapshotFromRepair(args[4]) : null;
      let ownsSnapshot = false;

      if (repairSnapshot) {
        if (!this.__ovyxTaskRollbackSnapshot) this.__ovyxTaskRollbackSnapshot = repairSnapshot;
      } else if (!this.pendingBuild || !this.__ovyxTaskRollbackSnapshot) {
        const fresh = captureSnapshot(this);
        if (fresh) {
          this.__ovyxTaskRollbackSnapshot = fresh;
          ownsSnapshot = true;
        }
      }

      const snapshot = this.__ovyxTaskRollbackSnapshot;
      this.__ovyxActiveTaskMethod = methodName;
      ensureCancelButton(this);
      syncCancelButton(this);

      let result;
      try { result = original.apply(this, args); }
      catch (error) {
        if (ownsSnapshot && this.__ovyxTaskRollbackSnapshot === snapshot) {
          this.__ovyxTaskRollbackSnapshot = null;
          this.__ovyxActiveTaskMethod = '';
        }
        syncCancelButton(this);
        throw error;
      }

      if (result && typeof result.then === 'function') {
        return result.finally(() => {
          if (ownsSnapshot && this.__ovyxTaskRollbackSnapshot === snapshot) {
            this.__ovyxTaskRollbackSnapshot = null;
            this.__ovyxActiveTaskMethod = '';
          }
          syncCancelButton(this);
        });
      }

      if (ownsSnapshot && this.__ovyxTaskRollbackSnapshot === snapshot) {
        this.__ovyxTaskRollbackSnapshot = null;
        this.__ovyxActiveTaskMethod = '';
      }
      syncCancelButton(this);
      return result;
    };
    wrapped.__ovyxCancelSafetyWrapped = true;
    wrapped.__ovyxCancelSafetyOriginal = original;
    studio[methodName] = wrapped;
  }

  function install(studio) {
    if (!studio || studio.__ovyxCancelSafetyInstalled) return;
    studio.__ovyxCancelSafetyInstalled = true;

    ['runBuildAgent', 'runFixAgent', 'askAgent'].forEach(name => installTaskTracker(studio, name));

    studio.cancelActiveTask = function () {
      const snapshot = this.__ovyxTaskRollbackSnapshot;
      if (!snapshot || !this.pendingBuild) {
        syncCancelButton(this);
        return false;
      }

      const method = String(this.__ovyxActiveTaskMethod || 'current');
      const stateAtCancel = getState();
      const taskProjectWasActive = String(stateAtCancel && stateAtCancel.activeProject && stateAtCancel.activeProject.id || '') === String(snapshot.projectId);
      try { this.abortActiveAi && this.abortActiveAi(); } catch (_) {}
      this.requestEpoch = Number(this.requestEpoch || 0) + 1;
      this.aiFrozen = false;
      this.pendingBuild = false;
      this.liveAiActive = false;

      const restored = restoreProjectOnly(this, snapshot, taskProjectWasActive);
      this.__ovyxTaskRollbackSnapshot = null;
      this.__ovyxActiveTaskMethod = '';
      syncCancelButton(this);

      const message = restored
        ? 'Cancelled safely. This task was rolled back to its starting point. Your project and other projects are still here.'
        : 'Cancelled safely. Your other projects were left untouched. The original project was not restored because it is no longer active.';
      try { this.appendMessage && this.appendMessage('agent', message); }
      catch (_) { try { this.renderThread && this.renderThread(); } catch (_) {} }
      try {
        const hint = document.getElementById('ws-mode-hint');
        if (hint) hint.textContent = 'Task cancelled. Your existing project is preserved.';
      } catch (_) {}
      try { window.showToast && window.showToast('Task cancelled safely. Existing project work was preserved.', 'info'); } catch (_) {}
      window.dispatchEvent(new CustomEvent('ovyx:webstudio-task-cancelled', {
        detail: { projectId: snapshot.projectId, method, restored }
      }));
      return true;
    };

    const originalRenderThread = typeof studio.renderThread === 'function' ? studio.renderThread : null;
    if (originalRenderThread && !originalRenderThread.__ovyxCancelSafetyWrapped) {
      const wrappedRenderThread = function () {
        const result = originalRenderThread.apply(this, arguments);
        ensureCancelButton(this);
        syncCancelButton(this);
        return result;
      };
      wrappedRenderThread.__ovyxCancelSafetyWrapped = true;
      wrappedRenderThread.__ovyxCancelSafetyOriginal = originalRenderThread;
      studio.renderThread = wrappedRenderThread;
    }

    ensureCancelButton(studio);
    syncCancelButton(studio);
  }

  function boot() {
    install(getStudio());
    // A shell may load its Web Studio controller after the first DOM-ready event.
    if (!getStudio()) {
      const observer = new MutationObserver(function () {
        const studio = getStudio();
        if (!studio) return;
        observer.disconnect();
        install(studio);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.addEventListener('pageshow', () => install(getStudio()), { passive: true });
  window.OVYXWebStudioCancelSafety = {
    install: () => install(getStudio()),
    cancel: () => getStudio() && getStudio().cancelActiveTask && getStudio().cancelActiveTask()
  };
})();
