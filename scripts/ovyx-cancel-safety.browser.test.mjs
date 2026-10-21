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
  await page.setContent(`<!doctype html>
    <html><head></head><body>
      <div id="ws-chat-composer" aria-busy="true">
        <textarea id="ws-chat-input"></textarea>
        <button id="ws-chat-send" aria-busy="true" disabled>Send</button>
      </div>
      <div id="ws-mode-hint"></div>
    </body></html>`);

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
    const project = window.KernelState.activeProject;
    project.name = 'Partially overwritten project';
    project.pages.push({ id: 'temporary-page', name: 'Unexpected page', slug: '/temporary' });
    studio.graph.files['src/pages/Home.html'].content = '<!doctype html><html><body>Partial AI result</body></html>';
    project.ovyxGraph = JSON.parse(JSON.stringify(studio.graph));
    window.__epochBeforeCancel = studio.requestEpoch;
    window.__generationBeforeCancel = Number(studio.__ovyxTaskGeneration || 0);
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
      pageIds: (project && project.pages || []).map(page => page.id),
      html: studio.graph.files['src/pages/Home.html'].content,
      projectHtml: project && project.ovyxGraph.files['src/pages/Home.html'].content,
      pendingBuild: !!studio.pendingBuild,
      liveAiActive: !!studio.liveAiActive,
      inFlightCount: Number(studio.__ovyxTaskInFlightCount || 0),
      snapshotCleared: studio.__ovyxTaskRollbackSnapshot == null,
      abortCount: window.__cancelAbortCount,
      controllerCleared: studio.activeAbortController == null,
      epochAdvanced: Number(studio.requestEpoch || 0) > Number(window.__epochBeforeCancel || 0),
      generationAdvanced: Number(studio.__ovyxTaskGeneration || 0) > Number(window.__generationBeforeCancel || 0),
      sendBusy: document.getElementById('ws-chat-send').hasAttribute('aria-busy'),
      composerBusy: document.getElementById('ws-chat-composer').hasAttribute('aria-busy'),
    };
  });

  assert.equal(rolledBack.cancelHidden, true, 'A successful mobile cancel must close its Cancel control.');
  assert.equal(rolledBack.projectName, 'Last good project state', 'Cancel must restore the project snapshot captured before the task.');
  assert.deepEqual(rolledBack.pageIds, ['home'], 'Cancel must remove partial pages created by the cancelled task.');
  assert.match(rolledBack.html, /Last good work/, 'Cancel must restore the original project graph, not only its project metadata.');
  assert.match(rolledBack.projectHtml, /Last good work/, 'Cancel must persist the restored graph back onto the active project.');
  assert.equal(rolledBack.pendingBuild, false, 'Cancel must clear the stale pending-build flag.');
  assert.equal(rolledBack.liveAiActive, false, 'Cancel must clear the live-AI flag.');
  assert.equal(rolledBack.inFlightCount, 0, 'Cancel must immediately release its tracked in-flight task counter.');
  assert.equal(rolledBack.snapshotCleared, true, 'Cancel must release its rollback snapshot.');
  assert.equal(rolledBack.abortCount, 1, 'Cancel must abort the captured controller even if abortActiveAi clears its reference.');
  assert.equal(rolledBack.controllerCleared, true, 'Cancel must release the active abort-controller reference.');
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

  await context.close();
  console.log('OVYX mobile cancellation browser test passed: real touch tap, project rollback, request abort, busy-state release, and stale-promise isolation.');
} finally {
  await browser.close();
}
