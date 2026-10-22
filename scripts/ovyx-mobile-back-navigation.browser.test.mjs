import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

async function waitForBoot(page) {
  await page.waitForFunction(
    () => document.readyState === 'complete'
      && typeof window.__OVYX_BOOT_ROUTE === 'string'
      && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
    null,
    { timeout: 45000 },
  );
}

async function waitForRoute(page, expected) {
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
      && typeof window.OVYXWebStudioCancelSafety?.cancel === 'function'
      && typeof window.OVYXScopedRollback?.beforeClose === 'function',
    null,
    { timeout: 45000 },
  );
  await waitForBoot(page);
  await waitForRoute(page, 'home');
  // The existing history wrapper intentionally ignores the very early boot
  // window. Wait until normal user navigation is being recorded.
  await page.waitForTimeout(2000);

  // Keep this history test deterministic: application boot may preserve an
  // assistant/modal overlay from a device session. Back must close a genuinely
  // open overlay first, so dismiss boot-time overlays before testing settings tabs.
  await page.evaluate(() => {
    for (let i = 0; i < 8 && window.OVYXNavigation.closeTopOverlay(); i += 1) {}
    // Register the history observer before the first Back press. It belongs to
    // the whole test session, not only to the later Web Studio fixture setup.
    window.__ovyxBackTestPopCount = 0;
    window.__ovyxBackTestPopStates = [];
    window.addEventListener('popstate', event => {
      window.__ovyxBackTestPopCount = Number(window.__ovyxBackTestPopCount || 0) + 1;
      window.__ovyxBackTestPopStates.push(event.state || null);
    });
  });

  // Verify the same route history works outside Web Studio as well.
  await page.evaluate(() => window.Router.go('appstudio'));
  await waitForRoute(page, 'appstudio');
  await page.waitForFunction(() => window.history.state?.ovyxRoute === 'appstudio', null, { timeout: 10000 });
  await page.evaluate(() => window.Router.go('projects'));
  await waitForRoute(page, 'projects');
  await page.waitForFunction(() => window.history.state?.ovyxRoute === 'projects', null, { timeout: 10000 });
  const routeHistoryDebug = await page.evaluate(() => ({
    length: window.history.length,
    state: window.history.state,
    route: window.KernelState?.activeView,
    popCount: Number(window.__ovyxBackTestPopCount || 0),
    href: window.location.href,
  }));
  console.log('[OVYX Back test] route history before Projects Back:', JSON.stringify(routeHistoryDebug));
  await triggerHistoryBack(page);
  assert.equal(await page.evaluate(() => window.KernelState?.activeView), 'appstudio',
    'Back from Projects must return to App Studio, not reset or skip the prior view.');
  await triggerHistoryBack(page);
  assert.equal(await page.evaluate(() => window.KernelState?.activeView), 'home',
    'A second Back must return from App Studio to the previous Home view.');

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
  });

  await page.evaluate(() => window.Router.go('settings'));
  await waitForRoute(page, 'settings');
  await page.waitForFunction(() => window.history.state?.ovyxRoute === 'settings', null, { timeout: 10000 });

  // App-wide nested navigation: Settings categories must participate in the
  // same Back history without leaving Settings or touching saved preferences.
  await page.evaluate(() => {
    window.OVYXSettings.show('general');
    window.OVYXSettings.show('appearance');
    window.OVYXSettings.show('profile');
  });
  const settingHistoryBeforeBack = await page.evaluate(() => ({
    length: window.history.length,
    state: window.history.state,
    current: window.OVYXSettings.current,
    route: window.KernelState?.activeView,
  }));
  console.log('[OVYX Back test] Settings history before first Back:', JSON.stringify(settingHistoryBeforeBack));
  assert.equal(settingHistoryBeforeBack.current, 'profile', 'The nested Settings fixture must end on Profile.');
  assert.equal(settingHistoryBeforeBack.state?.ovyxSettingsPanel, 'profile',
    'Each Settings category transition must get its own history entry.');
  await triggerHistoryBack(page);
  const settingHistoryAfterBack = await page.evaluate(() => ({
    length: window.history.length,
    state: window.history.state,
    current: window.OVYXSettings.current,
    route: window.KernelState?.activeView,
    popped: window.__ovyxBackTestPopStates?.slice(-1)[0] || null,
  }));
  console.log('[OVYX Back test] Settings history after first Back:', JSON.stringify(settingHistoryAfterBack));
  assert.equal(settingHistoryAfterBack.route, 'settings',
    'Back through Settings must stay on the Settings route.');
  assert.equal(settingHistoryAfterBack.current, 'appearance',
    'Back must return from Profile to the previous Settings category. Actual: '+JSON.stringify(settingHistoryAfterBack));
  await triggerHistoryBack(page);
  assert.equal(await page.evaluate(() => window.OVYXSettings.current), 'general',
    'A second Back must return to the previous Settings category again.');

  // Route hydration is allowed to replace the active-project pointer. Rebuild
  // only the disposable regression fixtures and explicitly reselect the test
  // project immediately before the Web Studio checks, so this test doesn't
  // accidentally depend on a prior route's in-memory object identity.
  await page.evaluate(() => {
    const clone = value => JSON.parse(JSON.stringify(value));
    const fixture = window.__ovyxBackTestFixture;
    const oldProjects = Array.isArray(window.KernelState?.projects) ? window.KernelState.projects : [];
    const baselineHtml = String(fixture?.baselineHtml || '');
    const graph = {
      version: 2,
      entry: 'src/pages/Home.html',
      files: {
        'src/pages/Home.html': { type: 'text/html', content: baselineHtml },
        'src/styles.css': { type: 'text/css', content: 'body{margin:0}' },
      },
    };
    const project = {
      id: fixture.id,
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
      id: fixture.otherId,
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
    window.KernelState.projects = [
      project,
      other,
      ...oldProjects.filter(item => ![fixture.id, fixture.otherId].includes(String(item?.id || ''))),
    ];
    window.KernelState.activeProject = project;
    window.WebStudio.project = project;
    window.WebStudio.graph = clone(graph);
    window.WebStudio.pendingBuild = false;
    window.WebStudio.liveAiActive = false;
    window.WebStudio.activeAbortController = null;
    localStorage.setItem('ovyx.graph.' + fixture.id, JSON.stringify(graph));
    window.ProjectStore?.save?.();
  });

  // App-wide rollback coverage outside Web Studio: while the user is in
  // App Studio, Back must close a local project-edit dialog and restore only
  // that dialog's project checkpoint. It must not reset unrelated projects.
  await page.evaluate(() => window.Router.go('appstudio'));
  await waitForRoute(page, 'appstudio');
  await page.waitForFunction(() => window.history.state?.ovyxRoute === 'appstudio', null, { timeout: 10000 });
  // App Studio route hydration can replace the in-memory project collection.
  // Re-seed only disposable browser fixtures after that hydration, then take
  // the modal checkpoint from the stable, selected baseline project.
  await page.evaluate(() => {
    const clone = value => JSON.parse(JSON.stringify(value));
    const fixture = window.__ovyxBackTestFixture;
    const oldProjects = Array.isArray(window.KernelState?.projects) ? window.KernelState.projects : [];
    const graph = {
      version: 2,
      entry: 'src/pages/Home.html',
      files: {
        'src/pages/Home.html': {
          type: 'text/html',
          content: String(fixture?.baselineHtml || '<!doctype html><html><body>BASELINE WORK MUST SURVIVE</body></html>'),
        },
        'src/styles.css': { type: 'text/css', content: 'body{margin:0}' },
      },
    };
    const baseline = {
      id: fixture.id,
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
      id: fixture.otherId,
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
    window.KernelState.projects = [
      baseline,
      other,
      ...oldProjects.filter(item => ![fixture.id, fixture.otherId, 'ovyx-back-test-new-draft'].includes(String(item?.id || ''))),
    ];
    window.KernelState.activeProject = baseline;
    window.WebStudio.project = baseline;
    window.WebStudio.graph = clone(graph);
    try { localStorage.setItem('ovyx.graph.' + fixture.id, JSON.stringify(graph)); } catch (_) {}
    try { window.ProjectStore?.save?.(); } catch (_) {}
  });
  await page.evaluate(() => {
    const dialog = document.createElement('div');
    dialog.id = 'ovyx-mobile-back-project-modal';
    dialog.className = 'modal open';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.style.cssText = 'position:fixed;inset:15%;z-index:2147483646;background:#080808;color:white;display:block';
    dialog.innerHTML = '<label>Project title <input id="ovyx-back-test-project-title" value="Baseline title"></label><button type="button" data-modal-close>Close</button>';
    document.body.appendChild(dialog);
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const fixture = window.__ovyxBackTestFixture;
    const project = window.KernelState.projects.find(item => item.id === fixture.id);
    project.name = 'Dirty project name from cancelled dialog';
    project.pages.push({ id: 'cancelled-page', name: 'Cancelled Page', slug: '/cancelled' });
    const draft = {
      id: 'ovyx-back-test-new-draft',
      name: 'Temporary draft must be removed on Cancel',
      pages: [{ id: 'draft-home', name: 'Home', slug: '/' }],
      assets: [],
      revisions: [],
    };
    window.KernelState.projects.push(draft);
    window.KernelState.activeProject = draft;
    const field = document.getElementById('ovyx-back-test-project-title');
    if (field) field.value = 'Dirty field value';
    window.ProjectStore?.save?.();
  });
  await triggerHistoryBack(page);
  const globalRollback = await page.evaluate(() => {
    const fixture = window.__ovyxBackTestFixture;
    const state = window.KernelState;
    const project = state.projects.find(item => item.id === fixture.id);
    const other = state.projects.find(item => item.id === fixture.otherId);
    return {
      route: state.activeView,
      modalOpen: (() => {
        const dialog = document.getElementById('ovyx-mobile-back-project-modal');
        return !!dialog && !dialog.hidden && getComputedStyle(dialog).display !== 'none' && dialog.classList.contains('open');
      })(),
      fieldValue: document.getElementById('ovyx-back-test-project-title')?.value || '',
      activeProjectId: state.activeProject?.id || '',
      projectName: project?.name || '',
      pageIds: (project?.pages || []).map(item => item.id),
      draftStillExists: state.projects.some(item => item.id === 'ovyx-back-test-new-draft'),
      otherName: other?.name || '',
      historyRoute: window.history.state?.ovyxRoute,
    };
  });
  assert.equal(globalRollback.route, 'appstudio',
    'Back from an App Studio dialog must stay in App Studio.');
  assert.equal(globalRollback.modalOpen, false,
    'Back must close the project-edit dialog in a non-Web-Studio surface.');
  assert.equal(globalRollback.fieldValue, 'Baseline title',
    'The dialog field must return to its saved pre-edit value.');
  assert.equal(globalRollback.activeProjectId, 'ovyx-mobile-back-regression-project',
    'Cancel rollback must restore the project that was active before the dialog opened.');
  assert.equal(globalRollback.projectName, 'Back Safety Baseline Project',
    'App-wide rollback must restore only the affected project metadata.');
  assert.deepEqual(globalRollback.pageIds, ['home'],
    'App-wide rollback must remove only the uncommitted page added inside the dialog.');
  assert.equal(globalRollback.draftStillExists, false,
    'A newly-created draft project owned by the cancelled dialog must be discarded.');
  assert.equal(globalRollback.otherName, 'Unrelated Project Must Stay Untouched',
    'App-wide rollback must preserve unrelated projects.');
  assert.equal(globalRollback.historyRoute, 'appstudio',
    'Closing the dialog must preserve the current route history entry.');

  await page.evaluate(() => document.getElementById('ovyx-mobile-back-project-modal')?.remove());
  await page.evaluate(() => window.Router.go('webstudio'));
  await waitForRoute(page, 'webstudio');
  await page.waitForFunction(() => window.history.state?.ovyxRoute === 'webstudio', null, { timeout: 10000 });

  // Scenario 1: the shared Back layer must dismiss an open dialog in any
  // product area before it changes routes.
  await page.evaluate(() => {
    // These are disposable browser-only fixtures; close any boot-time dialogs
    // so this scenario can assert the precise overlay it opens below.
    for (let i = 0; i < 8 && window.OVYXNavigation.closeTopOverlay(); i += 1) {}
    const dialog = document.createElement('div');
    dialog.id = 'ovyx-mobile-back-regression-modal';
    dialog.className = 'modal open';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.style.cssText = 'position:fixed;inset:15%;z-index:2147483646;background:#080808;color:white;display:block';
    dialog.innerHTML = '<div><p>Temporary test dialog</p><button type="button" data-modal-close>Close</button></div>';
    document.body.appendChild(dialog);
  });
  await triggerHistoryBack(page);
  const modalBack = await page.evaluate(() => ({
    route: window.KernelState?.activeView,
    modalOpen: !!document.getElementById('ovyx-mobile-back-regression-modal')
      && !document.getElementById('ovyx-mobile-back-regression-modal').hidden
      && getComputedStyle(document.getElementById('ovyx-mobile-back-regression-modal')).display !== 'none'
      && document.getElementById('ovyx-mobile-back-regression-modal').classList.contains('open'),
    historyRoute: window.history.state?.ovyxRoute,
  }));
  assert.equal(modalBack.route, 'webstudio',
    'Back from a generic dialog must not leave the active workspace.');
  assert.equal(modalBack.modalOpen, false,
    'The shared Back layer must dismiss generic modal overlays across OVYX.');
  assert.equal(modalBack.historyRoute, 'webstudio',
    'Dismissing a generic dialog must re-establish the current route history entry.');

  // Scenario 2: Android/browser Back while the mobile Preview is open must
  // close that local surface first. It must not route away from Web Studio.
  await page.evaluate(() => {
    const dialog = document.getElementById('ovyx-mobile-back-regression-modal');
    dialog?.remove();
    const mode = document.getElementById('ws-mode-menu');
    const menu = document.getElementById('ws-preview-menu');
    if (mode) mode.hidden = true;
    if (menu) menu.hidden = true;
    const ws = document.getElementById('view-webstudio');
    ws?.setAttribute('data-ws-code-open', '0');
    document.body.classList.remove('ovyx-ws-nav-open', 'ovyx-ws-mobile-nav-open');
    const studio = window.WebStudio;
    const originalAbort = studio.abortActiveAi;
    window.__ovyxBackTestOriginalAbort = originalAbort;
    window.__ovyxBackTestAbortCalls = 0;
    studio.abortActiveAi = function () {
      window.__ovyxBackTestAbortCalls += 1;
      return originalAbort?.apply(this, arguments);
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
    if (window.__ovyxBackTestOriginalAbort) studio.abortActiveAi = window.__ovyxBackTestOriginalAbort;
  });
  await triggerHistoryBack(page);
  assert.equal(await page.evaluate(() => window.KernelState?.activeView), 'settings',
    'The next Back should navigate to the previous app view after Preview has closed.');
  await triggerHistoryForward(page);
  assert.equal(await page.evaluate(() => window.KernelState?.activeView), 'webstudio',
    'Forward should restore Web Studio after the previous-view Back test.');

  // Scenario 3: if Back is pressed while an AI build is actually in flight,
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
