import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimePath = path.join(root, 'assets/ovyx-webstudio-cancel-safety.js');
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  // Use a real HTTP origin: about:blank has an opaque origin and blocks the
  // project-scoped localStorage writes that this rollback regression must verify.
  await page.route('http://ovyx-cancel.test/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html>
      <html><head></head><body>
        <div id="ws-chat-composer" aria-busy="true">
          <textarea id="ws-chat-input"></textarea>
          <button id="ws-chat-send" aria-busy="true" disabled>Send</button>
        </div>
        <div id="ws-mode-hint"></div>
      </body></html>`,
  }));
  await page.goto('http://ovyx-cancel.test/');

  await page.evaluate(() => {
    const clone = value => JSON.parse(JSON.stringify(value));
    const baselineHtml = '<!doctype html><html><body><main>Last good work</main></body></html>';
    const graph = {
      version: 2,
      entry: 'src/pages/Home.html',
      files: {
        'src/pages/Home.html': { type: 'text/html', content: baselineHtml },
        'src/styles.css': { type: 'text/css', content: 'body{margin:0}' },
      },
    };
    const project = {
      id: 'mobile-cancel-test-project',
      name: 'Last good project state',
      description: 'Before the AI task',
      pages: [{ id: 'home', name: 'Home', slug: '/' }],
      assets: [],
      revisions: [],
      ovyxGraph: clone(graph),
    };
    window.KernelState = { projects: [project], activeProject: project };
    window.ProjectStore = { save() {} };
    window.__cancelResolvers = [];
    window.__cancelRawPromises = [];
    window.__cancelAbortCount = 0;
    window.WebStudio = {
      graph: clone(graph),
      pendingBuild: false,
      liveAiActive: false,
      aiFrozen: false,
      requestEpoch: 5,
      graphKeyPrefix: '__ovyx_cancel_test_graph_',
      ensureProjectGraph() {},
      snapshotGraph() { return clone(this.graph); },
      abortActiveAi() {
        // Simulate the production race: the helper clears the property first.
        this.activeAbortController = null;
      },
      renderPreview() {},
      render() {},
      renderCodeTree() {},
      renderThread() {},
      appendMessage() {},
      runBuildAgent() {
        this.pendingBuild = true;
        this.liveAiActive = true;
        this.activeAbortController = { abort() { window.__cancelAbortCount += 1; } };
        let resolve;
        const raw = new Promise(done => { resolve = done; });
        window.__cancelResolvers.push(resolve);
        window.__cancelRawPromises.push(raw);
        return raw;
      },
      runFixAgent() { return Promise.resolve(); },
      askAgent() { return Promise.resolve(); },
    };
  });
  await page.addScriptTag({ path: runtimePath });

  // Start the task; then emulate a mobile AI state transition that clears the
  // legacy pending flag before the underlying promise has really finished.
  await page.evaluate(() => {
    const studio = window.WebStudio;
    window.__firstTrackedPromise = studio.runBuildAgent('Build this site');
    studio.pendingBuild = false;
    studio.liveAiActive = false;

    // Reproduce the real boot/hydration race: the app replaces WebStudio and
    // overwrites an agent method while the first request still owns a snapshot.
    const replacement = Object.assign({}, studio);
    replacement.runBuildAgent = function () {
      this.pendingBuild = true;
      this.liveAiActive = true;
      let resolve;
      const raw = new Promise(done => { resolve = done; });
      window.__cancelResolvers.push(resolve);
      window.__cancelRawPromises.push(raw);
      return raw;
    };
    window.__replacedStudio = replacement;
    window.WebStudio = replacement;

    const project = window.KernelState.activeProject;
    project.name = 'Partially overwritten project';
    project.pages.push({ id: 'temporary-page', name: 'Unexpected page', slug: '/temporary' });
    studio.graph.files['src/pages/Home.html'].content = '<!doctype html><html><body>Partial AI result</body></html>';
    project.ovyxGraph = JSON.parse(JSON.stringify(studio.graph));
    window.__epochBeforeCancel = studio.requestEpoch;
    window.__generationBeforeCancel = Number(studio.__ovyxTaskGeneration || 0);
  });

  // Wait for the rebind guard to wrap the new controller/method before tapping Cancel.
  await page.waitForFunction(() => !!window.__replacedStudio
    && window.WebStudio === window.__replacedStudio
    && window.WebStudio.runBuildAgent.__ovyxCancelSafetyWrappedV2 === true
    && window.WebStudio.cancelActiveTask.__ovyxCancelSafetyOwnerV2 === true,
  null, { timeout: 5000 });
  await page.evaluate(() => {
    const coordinator = window.OVYXWebStudioCancelSafety;
    const originalCancel = coordinator.cancel.bind(coordinator);
    window.__cancelCoordinatorCalls = 0;
    coordinator.cancel = function () {
      window.__cancelCoordinatorCalls += 1;
      return originalCancel();
    };
  });
  const cancel = page.locator('#ws-task-cancel');
  await cancel.waitFor({ state: 'visible', timeout: 5000 });
  await cancel.tap();

  const rolledBack = await page.evaluate(() => {
    const studio = window.WebStudio;
    const state = window.KernelState;
    const project = state.activeProject;
    return {
      cancelHidden: document.getElementById('ws-task-cancel').hidden,
      projectName: project && project.name,
      studioProjectName: studio.project && studio.project.name,
      pageIds: (project && project.pages || []).map(page => page.id),
      html: studio.graph.files['src/pages/Home.html'].content,
      projectHtml: project && project.ovyxGraph.files['src/pages/Home.html'].content,
      storedHtml: (() => {
        try {
          const saved = JSON.parse(localStorage.getItem(studio.graphKeyPrefix + project.id) || '{}');
          return String(saved.files?.['src/pages/Home.html']?.content || '');
        } catch (_) { return ''; }
      })(),
      pendingBuild: !!studio.pendingBuild,
      liveAiActive: !!studio.liveAiActive,
      inFlightCount: Number(studio.__ovyxTaskInFlightCount || 0),
      snapshotCleared: studio.__ovyxTaskRollbackSnapshot == null,
      abortCount: window.__cancelAbortCount,
      controllerCleared: studio.activeAbortController == null,
      rebindOwnedCurrentStudio: window.WebStudio.cancelActiveTask.__ovyxCancelSafetyOwnerV2 === true,
      coordinatorCalls: Number(window.__cancelCoordinatorCalls || 0),
      sharedSnapshotCleared: window.__OVYX_WEBSTUDIO_TASK_SESSION_V2__?.snapshot == null,
      epochAdvanced: Number(studio.requestEpoch || 0) > Number(window.__epochBeforeCancel || 0),
      generationAdvanced: Number(studio.__ovyxTaskGeneration || 0) > Number(window.__generationBeforeCancel || 0),
      sendBusy: document.getElementById('ws-chat-send').hasAttribute('aria-busy'),
      composerBusy: document.getElementById('ws-chat-composer').hasAttribute('aria-busy'),
    };
  });

  assert.equal(rolledBack.cancelHidden, true, 'A successful mobile cancel must close its Cancel control.');
  assert.equal(rolledBack.projectName, 'Last good project state', 'Cancel must restore the project snapshot captured before the task.');
  assert.equal(rolledBack.studioProjectName, 'Last good project state', 'Cancel must restore this.project as well as KernelState.activeProject.');
  assert.deepEqual(rolledBack.pageIds, ['home'], 'Cancel must remove partial pages created by the cancelled task.');
  assert.match(rolledBack.html, /Last good work/, 'Cancel must restore the original project graph, not only its project metadata.');
  assert.match(rolledBack.projectHtml, /Last good work/, 'Cancel must persist the restored graph back onto the active project.');
  assert.match(rolledBack.storedHtml, /Last good work/, 'Cancel must write the restored graph to its project-scoped local storage key.');
  assert.equal(rolledBack.pendingBuild, false, 'Cancel must clear the stale pending-build flag.');
  assert.equal(rolledBack.liveAiActive, false, 'Cancel must clear the live-AI flag.');
  assert.equal(rolledBack.inFlightCount, 0, 'Cancel must immediately release its tracked in-flight task counter.');
  assert.equal(rolledBack.snapshotCleared, true, 'Cancel must release its rollback snapshot.');
  assert.equal(rolledBack.abortCount, 1, 'Cancel must abort the captured controller even if abortActiveAi clears its reference.');
  assert.equal(rolledBack.controllerCleared, true, 'Cancel must release the active abort-controller reference.');
  assert.equal(rolledBack.rebindOwnedCurrentStudio, true, 'Cancel must be reattached to the replacement WebStudio instance.');
  assert.equal(rolledBack.coordinatorCalls, 1, 'The touch Cancel control must dispatch through the shared cancellation coordinator.');
  assert.equal(rolledBack.sharedSnapshotCleared, true, 'The shared rollback session must clear after restoring the project even when Studio was replaced.');
  assert.equal(rolledBack.epochAdvanced, true, 'Cancel must invalidate in-flight responses from the cancelled request.');
  assert.equal(rolledBack.generationAdvanced, true, 'Cancel must invalidate finally handlers from the cancelled task.');
  assert.equal(rolledBack.sendBusy, false, 'Cancel must clear the stuck busy state from the send control.');
  assert.equal(rolledBack.composerBusy, false, 'Cancel must clear the stuck busy state from the mobile composer.');

  // Start a newer task before the old, aborted promise settles. Its snapshot and
  // running counter must survive the old task's finally callback.
  const overlapping = await page.evaluate(async () => {
    const studio = window.WebStudio;
    const state = window.KernelState;
    window.__secondTrackedPromise = studio.runBuildAgent('Start a newer task');
    const secondSnapshot = studio.__ovyxTaskRollbackSnapshot;
    state.activeProject.description = 'Changes belonging to the newer task';
    const countDuringSecondTask = Number(studio.__ovyxTaskInFlightCount || 0);
    window.__cancelResolvers[0]();
    await window.__firstTrackedPromise;
    const result = {
      countDuringSecondTask,
      countAfterOldPromiseSettles: Number(studio.__ovyxTaskInFlightCount || 0),
      secondSnapshotPreserved: studio.__ovyxTaskRollbackSnapshot === secondSnapshot,
      newerProjectWorkPreserved: state.activeProject.description === 'Changes belonging to the newer task',
    };
    studio.pendingBuild = false;
    studio.liveAiActive = false;
    window.__cancelResolvers[1]();
    await window.__secondTrackedPromise;
    result.newerSnapshotReleasedOnCompletion = studio.__ovyxTaskRollbackSnapshot == null;
    result.countAfterCompletion = Number(studio.__ovyxTaskInFlightCount || 0);
    return result;
  });

  assert.equal(overlapping.countDuringSecondTask, 1, 'The newer task must own one tracked in-flight slot.');
  assert.equal(overlapping.countAfterOldPromiseSettles, 1, 'A late old-task finally must not decrement the new task counter.');
  assert.equal(overlapping.secondSnapshotPreserved, true, 'A late old-task finally must not clear the newer rollback snapshot.');
  assert.equal(overlapping.newerProjectWorkPreserved, true, 'Settling the old promise must not roll the project back over new work.');
  assert.equal(overlapping.newerSnapshotReleasedOnCompletion, true, 'The current task snapshot must release once the current task completes.');
  assert.equal(overlapping.countAfterCompletion, 0, 'The task counter must return to zero on completion.');

  // Browser-connected recovery path: no runBuildAgent/askAgent wrappers are
  // provided. A real composer tap must snapshot the project in capture phase,
  // track the outgoing same-origin API request, and let Cancel abort + restore it.
  const browserFetchPage = await context.newPage();
  await browserFetchPage.route('http://ovyx-cancel.test/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html>
      <html><head></head><body>
        <div id="ws-chat-composer" aria-busy="false">
          <textarea id="ws-chat-input"></textarea>
          <button id="ws-chat-send" type="button">Send</button>
        </div>
        <div id="ws-mode-hint"></div>
      </body></html>`,
  }));
  await browserFetchPage.goto('http://ovyx-cancel.test/browser-fetch');
  await browserFetchPage.evaluate(() => {
    const clone = value => JSON.parse(JSON.stringify(value));
    const baselineHtml = '<!doctype html><html><body><main>Browser last-good work</main></body></html>';
    const graph = {
      version: 2,
      entry: 'src/pages/Home.html',
      files: {
        'src/pages/Home.html': { type: 'text/html', content: baselineHtml },
        'src/styles.css': { type: 'text/css', content: 'body{margin:0}' },
      },
    };
    const project = {
      id: 'browser-fetch-rollback-project',
      name: 'Browser baseline project',
      description: 'Persisted before mobile send',
      pages: [{ id: 'home', name: 'Home', slug: '/' }],
      assets: [],
      revisions: [],
      ovyxGraph: clone(graph),
    };
    window.KernelState = { projects: [project], activeProject: project };
    window.ProjectStore = { save() {} };
    window.WebStudio = {
      graph: clone(graph),
      pendingBuild: false,
      liveAiActive: false,
      aiFrozen: false,
      requestEpoch: 10,
      graphKeyPrefix: 'ovyx.ws.graph.v2.',
      project,
      ensureProjectGraph() {},
      snapshotGraph() { return clone(this.graph); },
      renderPreview() {},
      render() {},
      renderCodeTree() {},
      renderThread() {},
      appendMessage() {},
      abortActiveAi() {},
    };
    window.__browserApiStarted = false;
    window.__browserApiAborted = false;
    window.__browserApiSignal = null;
    window.fetch = function (_input, init) {
      window.__browserApiStarted = true;
      window.__browserApiSignal = init && init.signal;
      return new Promise((resolve, reject) => {
        const signal = init && init.signal;
        if (!signal) {
          reject(new Error('The browser Cancel wrapper did not supply an abort signal.'));
          return;
        }
        signal.addEventListener('abort', () => {
          window.__browserApiAborted = true;
          reject(new DOMException('Browser task cancelled', 'AbortError'));
        }, { once: true });
        window.__resolveBrowserApi = () => resolve(new Response('{"ok":true}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      });
    };
    document.getElementById('ws-chat-send').addEventListener('click', () => {
      window.fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: document.getElementById('ws-chat-input').value }),
      }).catch(() => {});
    });
  });
  await browserFetchPage.addScriptTag({ path: runtimePath });
  await browserFetchPage.locator('#ws-chat-input').fill('Build my site');
  await browserFetchPage.locator('#ws-chat-send').tap();

  await browserFetchPage.waitForFunction(() => window.__browserApiStarted === true
    && document.getElementById('ws-task-cancel')?.hidden === false,
  null, { timeout: 5000 });
  const browserSnapshotBeforeCancel = await browserFetchPage.evaluate(() => {
    const id = 'browser-fetch-rollback-project';
    const record = JSON.parse(localStorage.getItem('ovyx.webstudio.rollback.snapshot.v3.' + id) || 'null');
    return {
      projectName: record?.project?.name || '',
      graphHtml: record?.graph?.files?.['src/pages/Home.html']?.content || '',
      activeProjectKey: localStorage.getItem('ovyx.webstudio.rollback.active-project.v3'),
    };
  });
  assert.equal(browserSnapshotBeforeCancel.projectName, 'Browser baseline project',
    'The browser capture-phase snapshot must persist before the AI response can modify the project.');
  assert.match(browserSnapshotBeforeCancel.graphHtml, /Browser last-good work/,
    'The browser snapshot must contain the pre-request graph.');
  assert.equal(browserSnapshotBeforeCancel.activeProjectKey, 'browser-fetch-rollback-project',
    'The browser must remember which project the rollback snapshot belongs to.');

  await browserFetchPage.evaluate(() => {
    const studio = window.WebStudio;
    const project = window.KernelState.activeProject;
    project.name = 'Browser partial AI result';
    project.pages.push({ id: 'partial', name: 'AI partial page', slug: '/partial' });
    studio.graph.files['src/pages/Home.html'].content = '<!doctype html><html><body>Partial browser AI result</body></html>';
    project.ovyxGraph = JSON.parse(JSON.stringify(studio.graph));
  });
  await browserFetchPage.locator('#ws-task-cancel').tap();

  const browserRollback = await browserFetchPage.evaluate(() => {
    const studio = window.WebStudio;
    const project = window.KernelState.activeProject;
    const graphKey = studio.graphKeyPrefix + project.id;
    let persistedGraph = {};
    try { persistedGraph = JSON.parse(localStorage.getItem(graphKey) || '{}'); } catch (_) {}
    return {
      projectName: project.name,
      studioProjectName: studio.project && studio.project.name,
      pages: project.pages.map(page => page.id),
      graphHtml: studio.graph.files['src/pages/Home.html'].content,
      projectGraphHtml: project.ovyxGraph.files['src/pages/Home.html'].content,
      persistedGraphHtml: persistedGraph.files?.['src/pages/Home.html']?.content || '',
      requestAborted: window.__browserApiAborted,
      signalAborted: !!(window.__browserApiSignal && window.__browserApiSignal.aborted),
      cancelHidden: document.getElementById('ws-task-cancel').hidden,
      activeSnapshotRemoved: localStorage.getItem('ovyx.webstudio.rollback.active-project.v3') == null,
      snapshotRemoved: localStorage.getItem('ovyx.webstudio.rollback.snapshot.v3.browser-fetch-rollback-project') == null,
      composerBusy: document.getElementById('ws-chat-composer').hasAttribute('aria-busy'),
      sendBusy: document.getElementById('ws-chat-send').hasAttribute('aria-busy'),
    };
  });
  assert.equal(browserRollback.projectName, 'Browser baseline project',
    'Browser-connected Cancel must restore project metadata captured before sending.');
  assert.equal(browserRollback.studioProjectName, 'Browser baseline project',
    'Browser-connected Cancel must restore WebStudio.project as well as KernelState.');
  assert.deepEqual(browserRollback.pages, ['home'],
    'Browser-connected Cancel must remove partial pages created by the AI task.');
  assert.match(browserRollback.graphHtml, /Browser last-good work/,
    'Browser-connected Cancel must restore the in-memory graph.');
  assert.match(browserRollback.projectGraphHtml, /Browser last-good work/,
    'Browser-connected Cancel must restore the active project graph.');
  assert.match(browserRollback.persistedGraphHtml, /Browser last-good work/,
    'Browser-connected Cancel must restore the project-scoped browser storage graph.');
  assert.equal(browserRollback.requestAborted, true, 'The outgoing browser API request must be aborted by Cancel.');
  assert.equal(browserRollback.signalAborted, true, 'The outgoing request signal must be aborted.');
  assert.equal(browserRollback.cancelHidden, true, 'Cancel must return to its idle state after rollback.');
  assert.equal(browserRollback.activeSnapshotRemoved, true, 'The browser active-snapshot pointer must be cleared after rollback.');
  assert.equal(browserRollback.snapshotRemoved, true, 'The consumed persistent browser snapshot must be removed after rollback.');
  assert.equal(browserRollback.composerBusy, false, 'The mobile composer must not remain stuck busy after browser API cancellation.');
  assert.equal(browserRollback.sendBusy, false, 'The send button must be restored after browser API cancellation.');

  await browserFetchPage.close();
  await context.close();
  console.log('OVYX mobile cancellation browser test passed: real touch tap, project rollback, request abort, busy-state release, and stale-promise isolation.');
} finally {
  await browser.close();
}
