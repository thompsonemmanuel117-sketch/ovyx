(function () {
  'use strict';
  if (window.__OVYX_WEBSTUDIO_CANCEL_SAFETY_V2__) return;
  window.__OVYX_WEBSTUDIO_CANCEL_SAFETY_V2__ = true;

  const clone = value => {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return value == null ? value : {}; }
  };
  const getStudio = () => window.WebStudio || null;
  const getState = () => window.KernelState || null;
  const cancelStyleId = 'ovyx-webstudio-task-cancel-style-v2';
  const sessionKey = '__OVYX_WEBSTUDIO_TASK_SESSION_V2__';
  const taskSession = window[sessionKey] || (window[sessionKey] = {
    generation: 0,
    inFlightCount: 0,
    snapshot: null,
    activeMethod: '',
    activeStudio: null,
    controllers: new Set(),
  });
  if (!(taskSession.controllers instanceof Set)) taskSession.controllers = new Set();
  const knownStudios = new Set();
  const controllerFields = [
    'activeAbortController', 'abortController', 'aiAbortController',
    'requestAbortController', 'activeController', 'currentAbortController'
  ];

  function safeAssign(target, property, value) {
    try { target[property] = value; return true; }
    catch (_) { return false; }
  }

  function syncSessionFields(studio) {
    if (!studio || typeof studio !== 'object') return;
    knownStudios.add(studio);
    safeAssign(studio, '__ovyxTaskRollbackSnapshot', taskSession.snapshot);
    safeAssign(studio, '__ovyxTaskGeneration', Number(taskSession.generation || 0));
    safeAssign(studio, '__ovyxTaskInFlightCount', Number(taskSession.inFlightCount || 0));
    safeAssign(studio, '__ovyxActiveTaskMethod', String(taskSession.activeMethod || ''));
  }

  function syncAllSessionFields() {
    knownStudios.forEach(syncSessionFields);
    syncSessionFields(getStudio());
  }

  function clearTaskSession() {
    taskSession.snapshot = null;
    taskSession.activeMethod = '';
    taskSession.activeStudio = null;
    taskSession.inFlightCount = 0;
    taskSession.controllers.clear();
    syncAllSessionFields();
  }

  function captureControllers(studio) {
    if (!studio || typeof studio !== 'object') return;
    controllerFields.forEach(function (field) {
      let controller;
      try { controller = studio[field]; } catch (_) { controller = null; }
      if (controller && typeof controller.abort === 'function') taskSession.controllers.add(controller);
    });
  }

  function setBusyFlags(studio, busy) {
    if (!studio || typeof studio !== 'object') return;
    studio.pendingBuild = !!busy && !!studio.pendingBuild;
    studio.liveAiActive = !!busy && !!studio.liveAiActive;
  }

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
        // Use the shared coordinator first so a touch arriving during controller
        // replacement still reaches the saved task snapshot.
        const coordinator = window.OVYXWebStudioCancelSafety;
        if (coordinator && typeof coordinator.cancel === 'function') {
          coordinator.cancel();
        } else if (activeStudio && typeof activeStudio.cancelActiveTask === 'function') {
          activeStudio.cancelActiveTask();
        }
      });
    }
    syncCancelButton(studio);
    return button;
  }

  function taskIsRunning(studio) {
    if (Number(taskSession.inFlightCount || 0) > 0) return true;
    if (studio && (studio.pendingBuild || studio.liveAiActive)) return true;
    for (const candidate of knownStudios) {
      if (candidate && (candidate.pendingBuild || candidate.liveAiActive)) return true;
    }
    return false;
  }

  function syncCancelButton(studio) {
    const button = document.getElementById('ws-task-cancel');
    if (!button) return;
    const currentStudio = studio || getStudio();
    const snapshot = taskSession.snapshot || currentStudio && currentStudio.__ovyxTaskRollbackSnapshot;
    const busy = !!(snapshot && taskIsRunning(currentStudio));
    button.hidden = !busy;
    button.disabled = !busy;
    button.setAttribute('aria-hidden', String(!busy));
  }

  function releaseComposerBusyState() {
    const send = document.getElementById('ws-chat-send');
    const composer = document.getElementById('ws-chat-composer');
    if (composer) composer.removeAttribute('aria-busy');
    if (send) {
      send.removeAttribute('aria-busy');
      // The composer should be usable immediately after Cancel. Respect an empty
      // prompt instead of leaving the send button stuck disabled by the old task.
      const input = document.querySelector('#ws-chat-input, #ws-chat-composer textarea, #ws-chat-composer input:not([type="hidden"])');
      send.disabled = input ? !String(input.value || '').trim() : false;
    }
  }

  function captureSnapshot(studio) {
    const state = getState();
    const project = state && (state.activeProject || state.project) || studio && studio.project;
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
      safeAssign(studio, 'project', savedProject);
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
      // Rendering is allowed to normalize the preview/UI, but the renderer must
      // not become a second source of truth for a cancelled task. Reapply the
      // exact task-start project+graph after render so generated page files or
      // preview normalization cannot sneak partial AI changes back into storage.
      try { studio.renderPreview && studio.renderPreview(); } catch (_) {}
      try { studio.render && studio.render(); } catch (_) {}

      const finalProject = clone(snapshot.project);
      finalProject.ovyxGraph = clone(snapshot.graph || finalProject.ovyxGraph || {});
      // The render/preview path may replace window.KernelState while normalizing
      // project data. Re-resolve the live state every time we apply the snapshot;
      // writing through the pre-render object can restore the graph but leave the
      // actual workspace with an empty active-project pointer.
      const reapplyFinalSnapshot = () => {
        const currentState = getState() || state;
        const latestProjects = Array.isArray(currentState.projects) ? currentState.projects.slice() : [];
        const finalIndex = latestProjects.findIndex(project => String(project && project.id || '') === targetId);
        if (finalIndex >= 0) latestProjects[finalIndex] = finalProject;
        else latestProjects.push(finalProject);
        currentState.projects = latestProjects;
        currentState.activeProject = finalProject;
        // Several Web Studio render/build paths read this.project directly rather
        // than dereferencing KernelState. Restore both references, not just the
        // shell state, so mobile preview and subsequent saves see the same project.
        safeAssign(studio, 'project', finalProject);
        studio.graph = clone(savedGraph);
        try {
          const prefix = String(studio.graphKeyPrefix || 'ovyx.ws.graph.v2.');
          localStorage.setItem(prefix + targetId, JSON.stringify(studio.graph));
        } catch (_) {}
      };
      reapplyFinalSnapshot();
      try { window.ProjectStore && window.ProjectStore.save && window.ProjectStore.save(); } catch (_) {}
      try { studio.renderCodeTree && studio.renderCodeTree(); } catch (_) {}
      // Reapply once more after all renderers and persistence normalization so a
      // stale ProjectStore view cannot clear the active-project pointer. The prior
      // save has already captured the task snapshot; do not run another normalizer
      // after this final authoritative in-memory restoration.
      reapplyFinalSnapshot();
    }
    return true;
  }

  function installTaskTracker(studio, methodName) {
    const original = studio[methodName];
    if (typeof original !== 'function' || original.__ovyxCancelSafetyWrappedV2) return;
    const wrapped = function () {
      const args = Array.from(arguments);
      const repairSnapshot = methodName === 'runBuildAgent' ? snapshotFromRepair(args[4]) : null;
      const alreadyRunning = taskIsRunning(this);
      let ownsSnapshot = false;

      // The cancellation session is window-scoped, not bound to one controller
      // object. Web Studio may replace its object during hydration; retaining the
      // same task snapshot/generation prevents that replacement from orphaning Cancel.
      if (!taskSession.snapshot || (!alreadyRunning && Number(taskSession.inFlightCount || 0) === 0)) {
        const fresh = repairSnapshot || captureSnapshot(this);
        if (fresh) {
          taskSession.snapshot = fresh;
          taskSession.generation = Number(taskSession.generation || 0) + 1;
          taskSession.inFlightCount = 0;
          taskSession.controllers.clear();
          taskSession.activeStudio = this;
          ownsSnapshot = true;
        }
      }

      const snapshot = taskSession.snapshot;
      const generation = Number(taskSession.generation || 0);
      taskSession.activeStudio = this;
      taskSession.activeMethod = methodName;
      taskSession.inFlightCount = Math.max(0, Number(taskSession.inFlightCount || 0)) + 1;
      syncSessionFields(this);
      captureControllers(this);
      ensureCancelButton(this);
      syncCancelButton(this);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        // Cancellation or a newer task changes the shared generation. A late
        // promise-finally callback from the previous task then becomes a no-op.
        if (Number(taskSession.generation || 0) === generation) {
          taskSession.inFlightCount = Math.max(0, Number(taskSession.inFlightCount || 0) - 1);
          const activeTaskStillBusy = Array.from(knownStudios).some(candidate =>
            !!(candidate && (candidate.pendingBuild || candidate.liveAiActive))
          );
          if (
            ownsSnapshot &&
            snapshot &&
            taskSession.snapshot === snapshot &&
            taskSession.inFlightCount === 0 &&
            !activeTaskStillBusy
          ) {
            clearTaskSession();
          } else {
            syncAllSessionFields();
          }
        }
        syncCancelButton(getStudio() || this);
      };

      let result;
      try {
        result = original.apply(this, args);
        // The original method may create its AbortController synchronously.
        captureControllers(this);
      } catch (error) {
        finish();
        throw error;
      }

      if (result && typeof result.then === 'function') {
        return result.finally(finish);
      }
      // Non-promise entry points are used by some event-driven builds. Their
      // pending/live flags keep the snapshot available if the task continues.
      finish();
      return result;
    };
    wrapped.__ovyxCancelSafetyWrappedV2 = true;
    wrapped.__ovyxCancelSafetyOriginal = original;
    studio[methodName] = wrapped;
  }

  function install(studio) {
    if (!studio || typeof studio !== 'object') return;
    knownStudios.add(studio);

    // Do not use a permanent early return just because this object was installed
    // once. Core hydration can replace runBuildAgent/runFixAgent/askAgent later.
    if (taskSession.snapshot) syncSessionFields(studio);
    studio.__ovyxCancelSafetyInstalledV2 = true;
    ['runBuildAgent', 'runFixAgent', 'askAgent'].forEach(name => installTaskTracker(studio, name));

    if (!studio.cancelActiveTask || !studio.cancelActiveTask.__ovyxCancelSafetyOwnerV2) {
      const cancelActiveTask = function () {
        // Read the shared snapshot: the active window.WebStudio object might not
        // be the same instance that started the request and captured the state.
        const snapshot = taskSession.snapshot || this.__ovyxTaskRollbackSnapshot;
        if (!snapshot) {
          syncCancelButton(this);
          return false;
        }

        const method = String(taskSession.activeMethod || this.__ovyxActiveTaskMethod || 'current');
        const currentState = getState();
        const taskProjectWasActive = String(
          currentState && currentState.activeProject && currentState.activeProject.id || ''
        ) === String(snapshot.projectId);

        const studios = new Set(knownStudios);
        studios.add(this);
        if (getStudio()) studios.add(getStudio());
        studios.forEach(function (candidate) {
          captureControllers(candidate);
        });
        const controllers = Array.from(taskSession.controllers);

        // Invalidate the shared task generation first, then every controller
        // instance that participated. This prevents stale responses from writing
        // over the restored snapshot even if window.WebStudio was replaced.
        taskSession.generation = Number(taskSession.generation || 0) + 1;
        taskSession.inFlightCount = 0;
        taskSession.activeStudio = null;
        studios.forEach(function (candidate) {
          if (!candidate || typeof candidate !== 'object') return;
          safeAssign(candidate, '__ovyxTaskGeneration', taskSession.generation);
          safeAssign(candidate, '__ovyxTaskInFlightCount', 0);
          safeAssign(candidate, '__ovyxTaskRollbackSnapshot', snapshot);
          safeAssign(candidate, '__ovyxActiveTaskMethod', method);
          safeAssign(candidate, 'requestEpoch', Number(candidate.requestEpoch || 0) + 1);
          safeAssign(candidate, 'aiFrozen', false);
        });

        // Abort through the app's own helper while its busy flags still show an
        // active request, then directly abort captured controllers as a fallback.
        // Captured references survive helpers that clear their controller fields.
        studios.forEach(function (candidate) {
          try { candidate.abortActiveAi && candidate.abortActiveAi(); } catch (_) {}
        });
        controllers.forEach(function (controller) {
          try { controller && typeof controller.abort === 'function' && controller.abort(); } catch (_) {}
        });
        studios.forEach(function (candidate) {
          safeAssign(candidate, 'pendingBuild', false);
          safeAssign(candidate, 'liveAiActive', false);
        });
        studios.forEach(function (candidate) {
          controllerFields.forEach(function (field) {
            try {
              if (candidate[field] && controllers.includes(candidate[field])) candidate[field] = null;
            } catch (_) {}
          });
        });

        const activeStudio = getStudio() || this;
        const restored = restoreProjectOnly(activeStudio, snapshot, taskProjectWasActive);
        clearTaskSession();
        studios.forEach(function (candidate) {
          if (!candidate) return;
          safeAssign(candidate, '__ovyxTaskRollbackSnapshot', null);
          safeAssign(candidate, '__ovyxActiveTaskMethod', '');
          safeAssign(candidate, '__ovyxTaskGeneration', taskSession.generation);
          safeAssign(candidate, '__ovyxTaskInFlightCount', 0);
        });
        releaseComposerBusyState();
        syncCancelButton(activeStudio);

        const message = restored
          ? 'Cancelled safely. The affected project was restored to the state from before this task. Other projects were left untouched.'
          : 'Cancelled safely. The original project remains saved and other projects were left untouched, but it is no longer the active workspace.';
        try { activeStudio.appendMessage && activeStudio.appendMessage('agent', message); }
        catch (_) { try { activeStudio.renderThread && activeStudio.renderThread(); } catch (_) {} }
        try {
          const hint = document.getElementById('ws-mode-hint');
          if (hint) hint.textContent = restored
            ? 'Task cancelled. The previous working state has been restored.'
            : 'Task cancelled. Other projects were preserved.';
        } catch (_) {}
        try {
          window.showToast && window.showToast(
            restored ? 'Cancelled and restored the previous project state.' : 'Task cancelled. Other projects were preserved.',
            restored ? 'success' : 'warning'
          );
        } catch (_) {}
        window.dispatchEvent(new CustomEvent('ovyx:webstudio-task-cancelled', {
          detail: { projectId: snapshot.projectId, method, restored }
        }));
        return true;
      };
      cancelActiveTask.__ovyxCancelSafetyOwnerV2 = true;
      studio.cancelActiveTask = cancelActiveTask;
    }

    const originalRenderThread = typeof studio.renderThread === 'function' ? studio.renderThread : null;
    if (originalRenderThread && !originalRenderThread.__ovyxCancelSafetyWrappedV2) {
      const wrappedRenderThread = function () {
        const result = originalRenderThread.apply(this, arguments);
        ensureCancelButton(this);
        syncCancelButton(this);
        return result;
      };
      wrappedRenderThread.__ovyxCancelSafetyWrappedV2 = true;
      wrappedRenderThread.__ovyxCancelSafetyOriginal = originalRenderThread;
      studio.renderThread = wrappedRenderThread;
    }

    ensureCancelButton(studio);
    syncCancelButton(studio);
  }

  function boot() {
    install(getStudio());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  // Re-attach the guards if hydration replaces the global WebStudio object or
  // another runtime overwrites an agent method after the first installation.
  // A light idempotent check is safer than relying on a one-time DOM observer,
  // because changing window.WebStudio does not necessarily mutate the DOM.
  window.setInterval(function () {
    const studio = getStudio();
    if (studio) install(studio);
  }, 400);
  window.addEventListener('pageshow', () => install(getStudio()), { passive: true });
  window.OVYXWebStudioCancelSafety = {
    install: () => install(getStudio()),
    cancel: () => {
      const studio = getStudio();
      if (
        studio &&
        typeof studio.cancelActiveTask === 'function' &&
        studio.cancelActiveTask.__ovyxCancelSafetyOwnerV2 === true
      ) return studio.cancelActiveTask();
      const fallback = Array.from(knownStudios).find(candidate =>
        typeof candidate.cancelActiveTask === 'function' &&
        candidate.cancelActiveTask.__ovyxCancelSafetyOwnerV2 === true
      );
      return fallback ? fallback.cancelActiveTask() : false;
    }
  };
})();
