import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

async function waitForBootRoute(page, expected) {
  await page.waitForFunction(
    () => document.readyState === 'complete'
      && typeof window.__OVYX_BOOT_ROUTE === 'string'
      && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
    null,
    { timeout: 45000 },
  );
  await page.waitForFunction(route => window.KernelState?.activeView === route, expected, {
    timeout: 15000,
  });
}

async function triggerHistoryBack(page) {
  const count = await page.evaluate(() => Number(window.__ovyxBackTestPopCount || 0));
  await page.evaluate(() => window.history.back());
  await page.waitForFunction(previous => Number(window.__ovyxBackTestPopCount || 0) > previous, count, {
    timeout: 10000,
  });
  // Let every application listener and route render finish before reading state.
  await page.waitForTimeout(60);
}

async function triggerHistoryForward(page) {
  const count = await page.evaluate(() => Number(window.__ovyxBackTestPopCount || 0));
  await page.evaluate(() => window.history.forward());
  await page.waitForFunction(previous => Number(window.__ovyxBackTestPopCount || 0) > previous, count, {
    timeout: 10000,
  });
  await page.waitForTimeout(60);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.addInitScript(() => {
    // Start from a clean Home route so the test exercises only same-document
    // navigation entries rather than a prior session or restored editor focus.
    localStorage.setItem('ovyx.runtime.route.v18', 'home');
    localStorage.setItem('ovyx.settings.last-view.v1', 'home');
    localStorage.setItem('ovyx.runtime.session.v4', JSON.stringify({ route: 'home' }));
    localStorage.removeItem('ovyx.webstudio.session.v5');
    localStorage.removeItem('ovyx.webstudio.active.v5');
    localStorage.removeItem('ovyx.ws.code-focus.v1');
    localStorage.removeItem('ovyx.ws.code-file.v1');
    localStorage.removeItem('ovyx.ws.code-focus-project.v1');
  });

  const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.ok(response && response.status() < 400, 'OVYX app failed to load in mobile Chromium.');
  await page.waitForFunction(
    () => typeof window.Router?.go === 'function'
      && typeof window.OVYXNavigation?.back === 'function'
      && typeof window.WebStudio?.runBuildAgent === 'function'
      && typeof window.OVYXWebStudioCancelSafety?.cancel === 'function',
    null,
    { timeout: 45000 },
  );
  await waitForBootRoute(page, 'home');
  // The existing history wrapper intentionally ignores the very early boot
  // window. Wait until normal user navigation is being recorded.
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    const clone = value => JSON.parse(JSON.stringify(value));
    const baselineHtml = '<!doctype html><html><body><main id="baseline-work">BASELINE WORK MUST SURVIVE</main></body></html>';
    const graph = {
      version: 2,
      entry: 'src/pages/Home.html',
      files: {
        'src/pages/Home.html': { type: 'text/html', content: baselineHtml },
        'src/styles.css': { type: 'text/css', content: 'body{margin:0}' },
      },
    };
    const id = 'ovyx-mobile-back-regression-project';
    const otherId = 'ovyx-mobile-back-regression-other-project';
    const baseline = {
      id,
      name: 'Back Safety Baseline Project',
      description: 'Disposable browser regression fixture.',
      status: 'draft',
      updatedAt: Date.now(),
      pages: [{ id: 'home', name: 'Home', slug: '/', sections: [] }],
      assets: [],
      revisions: [],
      ovyxGraph: clone(graph),
    };
    const other = {
      id: otherId,
      name: 'Unrelated Project Must Stay Untouched',
      description: 'Second disposable fixture project.',
      status: 'draft',
      updatedAt: Date.now(),
      pages: [{ id: 'other-home', name: 'Home', slug: '/', sections: [] }],
      assets: [],
      revisions: [],
      ovyxGraph: {
        version: 2,
        entry: 'src/pages/Home.html',
        files: {
          'src/pages/Home.html': {
            type: 'text/html',
            content: '<!doctype html><html><body>UNRELATED PROJECT</body></html>',
          },
        },
      },
    };
    const state = window.KernelState || (window.KernelState = {});
    const projects = Array.isArray(state.projects) ? state.projects : [];
    state.projects = [baseline, other, ...projects.filter(project => ![id, otherId].includes(String(project?.id || '')))];
    state.activeProject = baseline;
    try { localStorage.setItem('ovyx.graph.' + id, JSON.stringify(graph)); } catch (_) {}
    try { window.ProjectStore?.save?.(); } catch (_) {}
    const studio = window.WebStudio;
    studio.graph = clone(graph);
    studio.project = baseline;
    studio.pendingBuild = false;
    studio.liveAiActive = false;
    studio.activeAbortController = null;
    window.__ovyxBackTestFixture = { id, otherId, baselineHtml };
    window.__ovyxBackTestPopCount = 0;
    window.addEventListener('popstate', () => {
      window.__ovyxBackTestPopCount = Number(window.__ovyxBackTestPopCount || 0) + 1;
    });
  });

  await page.evaluate(() => window.Router.go('settings'));
  await waitForBootRoute(page, 'settings');
  await page.waitForFunction(() => window.history.state?.ovyxRoute === 'settings', null, { timeout: 10000 });
  await page.evaluate(() => window.Router.go('webstudio'));
  await waitForBootRoute(page, 'webstudio');
  await page.waitForFunction(() => window.history.state?.ovyxRoute === 'webstudio', null, { timeout: 10000 });

  // Scenario 1: Android/browser Back while the mobile Preview is open must
  // close that local surface first. It must not route away from Web Studio.
  await page.evaluate(() => {
    const studio = window.WebStudio;
    const originalAbort = studio.abortActiveAi?.bind(studio);
    window.__ovyxBackTestAbortCalls = 0;
    studio.abortActiveAi = function () {
      window.__ovyxBackTestAbortCalls += 1;
      return originalAbort?.();
    };
    window.OVYXMobilePreviewRouting?.open?.();
  });
  assert.equal(await page.evaluate(() => document.body.classList.contains('ovyx-ws-mobile-preview-open')), true,
    'The mobile Preview fixture must open before the system Back test.');
  await triggerHistoryBack(page);
  const previewBack = await page.evaluate(() => ({
    route: window.KernelState?.activeView,
    previewOpen: document.body.classList.contains('ovyx-ws-mobile-preview-open'),
    projectId: window.KernelState?.activeProject?.id,
    projectName: window.KernelState?.activeProject?.name,
    abortCalls: Number(window.__ovyxBackTestAbortCalls || 0),
    historyRoute: window.history.state?.ovyxRoute,
  }));
  assert.equal(previewBack.route, 'webstudio',
    'Back from mobile Preview must stay in Web Studio instead of leaving the entire workspace.');
  assert.equal(previewBack.previewOpen, false, 'Back must close the mobile Preview surface.');
  assert.equal(previewBack.projectId, 'ovyx-mobile-back-regression-project',
    'Closing Preview must preserve the active project.');
  assert.equal(previewBack.projectName, 'Back Safety Baseline Project',
    'Closing Preview must preserve the project metadata.');
  assert.equal(previewBack.abortCalls, 0,
    'Closing Preview must not abort or cancel an AI task just because the user pressed Back.');
  assert.equal(previewBack.historyRoute, 'webstudio',
    'The current route must be re-established after Back closes a nested surface.');

  // A second Back now leaves Web Studio normally, proving that the first Back
  // was consumed by the nested Preview state instead of eating the whole route.
  await page.evaluate(() => {
    const studio = window.WebStudio;
    const originalAbort = studio.abortActiveAi;
    if (originalAbort) studio.abortActiveAi = originalAbort;
  });
  await triggerHistoryBack(page);
  assert.equal(await page.evaluate(() => window.KernelState?.activeView), 'settings',
    'The next Back should navigate to the previous app view after Preview has closed.');
  await triggerHistoryForward(page);
  assert.equal(await page.evaluate(() => window.KernelState?.activeView), 'webstudio',
    'Forward should restore Web Studio after the previous-view Back test.');

  // Scenario 2: if Back is pressed while an AI build is actually in flight,
  // invoke the existing scoped cancellation coordinator and keep the user in
  // the workspace. The test AI call never reaches a provider or mutates a real project.
  await page.evaluate(() => {
    const studio = window.WebStudio;
    const clone = value => JSON.parse(JSON.stringify(value));
    const fixture = window.__ovyxBackTestFixture;
    const project = window.KernelState.projects.find(item => item.id === fixture.id);
    window.KernelState.activeProject = project;
    studio.project = project;
    studio.graph = clone(project.ovyxGraph);
    studio.callAI = () => new Promise(() => {});
    window.__ovyxBackTestTaskPromise = studio.runBuildAgent('Build only the disposable Back-navigation fixture.');
    return true;
  });
  await page.waitForFunction(() => {
    const studio = window.WebStudio;
    const session = window.__OVYX_WEBSTUDIO_TASK_SESSION_V2__;
    return !!(studio && (studio.pendingBuild || studio.liveAiActive)
      && session?.snapshot
      && Number(session.inFlightCount || 0) > 0);
  }, null, { timeout: 10000 });
  await page.evaluate(() => {
    const clone = value => JSON.parse(JSON.stringify(value));
    const fixture = window.__ovyxBackTestFixture;
    const project = window.KernelState.activeProject;
    const studio = window.WebStudio;
    studio.graph.files['src/pages/Home.html'].content = '<!doctype html><html><body>PARTIAL AI OUTPUT</body></html>';
    project.name = 'Partially Changed Name';
    project.pages.push({ id: 'temporary-page', name: 'Temporary Page', slug: '/temporary' });
    project.ovyxGraph = clone(studio.graph);
    window.ProjectStore?.save?.();
  });

  await triggerHistoryBack(page);
  const taskBack = await page.evaluate(() => {
    const fixture = window.__ovyxBackTestFixture;
    const state = window.KernelState;
    const studio = window.WebStudio;
    const project = state?.projects?.find(item => item.id === fixture.id);
    const other = state?.projects?.find(item => item.id === fixture.otherId);
    const html = studio?.graph?.files?.['src/pages/Home.html']?.content || '';
    const persisted = (() => {
      try {
        const saved = JSON.parse(localStorage.getItem((studio?.graphKeyPrefix || '__ovyx_cancel_test_graph_') + fixture.id) || '{}');
        return String(saved.files?.['src/pages/Home.html']?.content || '');
      } catch (_) { return ''; }
    })();
    return {
      route: state?.activeView,
      projectId: state?.activeProject?.id,
      projectName: project?.name,
      pageIds: (project?.pages || []).map(page => page.id),
      html,
      projectHtml: project?.ovyxGraph?.files?.['src/pages/Home.html']?.content || '',
      persisted,
      otherName: other?.name,
      pendingBuild: !!studio?.pendingBuild,
      liveAiActive: !!studio?.liveAiActive,
      taskCount: Number(studio?.__ovyxTaskInFlightCount || 0),
      sharedTaskCount: Number(window.__OVYX_WEBSTUDIO_TASK_SESSION_V2__?.inFlightCount || 0),
      snapshotCleared: window.__OVYX_WEBSTUDIO_TASK_SESSION_V2__?.snapshot == null,
      historyRoute: window.history.state?.ovyxRoute,
    };
  });

  assert.equal(taskBack.route, 'webstudio',
    'Back during an AI task must keep the user in Web Studio after the task is cancelled.');
  assert.equal(taskBack.projectId, 'ovyx-mobile-back-regression-project',
    'Scoped rollback must retain the project that owns the task.');
  assert.equal(taskBack.projectName, 'Back Safety Baseline Project',
    'Back during a task must restore the project metadata snapshot from before that task.');
  assert.deepEqual(taskBack.pageIds, ['home'],
    'Back must remove only the partial page produced by the cancelled task.');
  assert.match(taskBack.html, /BASELINE WORK MUST SURVIVE/,
    'Back must restore the previous source graph instead of leaving partial AI output.');
  assert.match(taskBack.projectHtml, /BASELINE WORK MUST SURVIVE/,
    'The in-memory project graph must match the last-good source after Back rollback.');
  assert.match(taskBack.persisted, /BASELINE WORK MUST SURVIVE/,
    'The last-good graph must be written to project storage during Back rollback.');
  assert.equal(taskBack.otherName, 'Unrelated Project Must Stay Untouched',
    'Back rollback must not reset or rename another project.');
  assert.equal(taskBack.pendingBuild, false, 'The cancelled task must leave no pending-build flag.');
  assert.equal(taskBack.liveAiActive, false, 'The cancelled task must leave no live-AI flag.');
  assert.equal(taskBack.taskCount, 0, 'The cancelled task must release its tracked task count.');
  assert.equal(taskBack.sharedTaskCount, 0, 'The shared cancellation session must be cleared.');
  assert.equal(taskBack.snapshotCleared, true, 'The consumed rollback snapshot must be released.');
  assert.equal(taskBack.historyRoute, 'webstudio',
    'The history entry must remain on Web Studio while the task snapshot is restored.');

  // Once rollback finishes, Back should work as ordinary route navigation and
  // leave the restored project available if the user returns later.
  await triggerHistoryBack(page);
  assert.equal(await page.evaluate(() => window.KernelState?.activeView), 'settings',
    'After the active task is safely rolled back, the next Back should leave Web Studio.');
  const finalProject = await page.evaluate(() => ({
    name: window.KernelState?.projects?.find(item => item.id === window.__ovyxBackTestFixture.id)?.name,
    html: window.KernelState?.projects?.find(item => item.id === window.__ovyxBackTestFixture.id)?.ovyxGraph?.files?.['src/pages/Home.html']?.content || '',
  }));
  assert.equal(finalProject.name, 'Back Safety Baseline Project',
    'Leaving Web Studio after cancellation must not undo the scoped rollback.');
  assert.match(finalProject.html, /BASELINE WORK MUST SURVIVE/,
    'The restored source must remain available after navigating away from Web Studio.');

  assert.deepEqual(pageErrors, [], 'Mobile Back and scoped rollback must not throw browser runtime errors.');
  await context.close();
  console.log('OVYX mobile Back navigation and project-scoped task rollback passed in mobile Chromium.');
} finally {
  await browser.close();
}
