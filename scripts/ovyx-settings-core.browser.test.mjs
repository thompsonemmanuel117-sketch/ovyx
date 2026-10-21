import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

async function waitForRouteRestore(page) {
  // The late V25 controller reapplies the stored route at load/pageshow. Do not
  // issue a test navigation until that boot restoration has finished.
  await page.waitForFunction(
    () => document.readyState === 'complete'
      && typeof window.__OVYX_BOOT_ROUTE === 'string'
      && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
    null,
    { timeout: 45000 },
  );
  await page.waitForTimeout(120);
  await page.waitForFunction(
    () => typeof window.__OVYX_BOOT_ROUTE === 'string'
      && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
    null,
    { timeout: 10000 },
  );
}


const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const pageErrors = [];

    await page.addInitScript(() => {
      // Keep every late route-restoration source consistent for this Settings-only
      // test. The shell restores runtime.session.v4 again after initial boot; if
      // it still says Home/Web Studio, that valid restoration can hide Settings
      // after the test's own Router.go('settings').
      let session = {};
      try { session = JSON.parse(localStorage.getItem('ovyx.runtime.session.v4') || '{}'); } catch (_) {}
      localStorage.setItem('ovyx.runtime.route.v18', 'settings');
      localStorage.setItem('ovyx.settings.last-view.v1', 'settings');
      localStorage.setItem('ovyx.runtime.session.v4', JSON.stringify({ ...session, route: 'settings' }));

      if (localStorage.getItem('__ovyxSettingsCoreFixtureV1') !== '1') {
        const initialTheme = {
          mode: 'dark',
          accentColor: '#F59E0B',
          backgroundColor: '#050607',
          sidebarColor: '#050607',
          cardColor: '#0B0D10',
          borderColor: '#1B222A',
          textColor: '#F8FAFC',
          mutedColor: '#94A3B8',
          density: 'balanced',
          scale: 'balanced',
          motion: 'full',
        };
        localStorage.setItem('ovyx-theme', JSON.stringify(initialTheme));
        localStorage.removeItem('ovyx.appearance.v3');
        localStorage.removeItem('ovyx.theme.lab.v1');
        localStorage.setItem('__ovyxSettingsCoreFixtureV1', '1');
      }
      window.__settingsThemeAppliedEvents = [];
      window.__settingsAppearanceCanonicalizedEvents = [];
      document.addEventListener('ovyx:theme-applied', event => {
        window.__settingsThemeAppliedEvents.push(String(event.detail?.reason || ''));
      });
      window.addEventListener('ovyx:appearance-canonicalized', event => {
        window.__settingsAppearanceCanonicalizedEvents.push(String(event.detail?.reason || ''));
      });
    });

    page.on('pageerror', error => pageErrors.push(error.message));
    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app did not load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && typeof window.ThemeContext?.get === 'function',
      null,
      { timeout: 45000 },
    );

    await waitForRouteRestore(page);

    // Mobile Cancel must roll back only the current task's project snapshot and
    // preserve the other projects. Use temporary browser-local state and restore it
    // after the assertion so this test cannot contaminate later Settings cases.
    const cancelRun = await page.evaluate(() => {
      const studio = window.WebStudio;
      const button = document.getElementById('ws-task-cancel');
      const state = window.KernelState;
      if (!studio || typeof studio.cancelActiveTask !== 'function' || !button || !state) return { available: false };
      const clone = value => JSON.parse(JSON.stringify(value));
      const original = {
        projects: state.projects,
        activeProject: state.activeProject,
        graph: studio.graph,
        pendingBuild: studio.pendingBuild,
        liveAiActive: studio.liveAiActive,
        abort: studio.activeAbortController,
        snapshot: studio.__ovyxTaskRollbackSnapshot,
        method: studio.__ovyxActiveTaskMethod,
        thread: clone(studio.thread || []),
        requestEpoch: studio.requestEpoch,
        aiFrozen: studio.aiFrozen,
        activeMessageIndex: studio.activeMessageIndex,
        editingMessageIndex: studio.editingMessageIndex,
      };
      const storage = Array.from({ length: localStorage.length }, (_, i) => {
        const key = localStorage.key(i); return [key, key == null ? null : localStorage.getItem(key)];
      }).filter(pair => pair[0] != null);
      const testId = '__ovyx_cancel_safety_browser_test__';
      const otherSignature = projects => JSON.stringify((projects || [])
        .filter(project => String(project?.id || '') !== testId)
        .map(project => ({ id: project.id, name: project.name, updatedAt: project.updatedAt,
          pages: (project.pages || []).map(page => ({ id: page.id, name: page.name, slug: page.slug })) })));
      const otherBefore = otherSignature(original.projects);
      let summary = { available: true };
      try {
        const baselineGraph = { entry: 'index.html', files: {
          'index.html': { type: 'text/html', content: '<!doctype html><html><body>Project before task</body></html>' }
        }};
        const baselineProject = {
          id: testId, name: 'Baseline project', updatedAt: 100, pages: [], assets: [],
          ovyxGraph: clone(baselineGraph)
        };
        state.projects = [...(original.projects || []), baselineProject];
        state.activeProject = baselineProject;
        studio.graph = clone(baselineGraph);
        studio.pendingBuild = true;
        studio.liveAiActive = true;
        studio.requestEpoch = Number(studio.requestEpoch || 0) + 1;
        let abortCalled = false;
        studio.activeAbortController = { abort() { abortCalled = true; } };
        studio.__ovyxTaskRollbackSnapshot = {
          projectId: testId, project: clone(baselineProject), graph: clone(baselineGraph), startedAt: Date.now()
        };
        studio.__ovyxActiveTaskMethod = 'runBuildAgent';

        baselineProject.name = 'Partially changed project';
        baselineProject.pages.push({ id: 'temporary-page', name: 'Temporary page', slug: 'temporary' });
        studio.graph.files['index.html'].content = '<!doctype html><html><body>Partial AI output</body></html>';
        baselineProject.ovyxGraph = clone(studio.graph);

        studio.renderThread();
        summary.visibleWhileRunning = button.hidden === false;
        button.click();
        summary.hiddenAfterCancel = button.hidden;
        summary.abortCalled = abortCalled;
        summary.pendingAfterCancel = Boolean(studio.pendingBuild);
        summary.restoredActiveProject = state.activeProject?.name === 'Baseline project'
          && (state.activeProject?.pages || []).length === 0
          && String(studio.graph?.files?.['index.html']?.content || '').includes('Project before task');
        summary.otherProjectsPreserved = otherSignature(state.projects) === otherBefore;
        summary.cancelMethodReturnedSafely = studio.__ovyxTaskRollbackSnapshot == null;
      } finally {
        state.projects = original.projects;
        state.activeProject = original.activeProject;
        studio.graph = original.graph;
        studio.pendingBuild = original.pendingBuild;
        studio.liveAiActive = original.liveAiActive;
        studio.activeAbortController = original.abort;
        studio.__ovyxTaskRollbackSnapshot = original.snapshot;
        studio.__ovyxActiveTaskMethod = original.method;
        studio.thread = original.thread;
        studio.requestEpoch = original.requestEpoch;
        studio.aiFrozen = original.aiFrozen;
        studio.activeMessageIndex = original.activeMessageIndex;
        studio.editingMessageIndex = original.editingMessageIndex;
        try { studio.renderThread(); } catch (_) {}
        localStorage.clear();
        storage.forEach(([key, value]) => localStorage.setItem(key, value));
      }
      return summary;
    });
    assert.equal(cancelRun.available, true, '[' + target.name + '] The shared project-scoped Cancel module must be wired. Details: ' + JSON.stringify(cancelRun));
    assert.equal(cancelRun.visibleWhileRunning, true, '[' + target.name + '] Cancel must appear during an active task.');
    assert.equal(cancelRun.hiddenAfterCancel, true, '[' + target.name + '] Cancel must hide after stopping the task.');
    assert.equal(cancelRun.abortCalled, true, '[' + target.name + '] Cancel must abort the active AI request.');
    assert.equal(cancelRun.pendingAfterCancel, false, '[' + target.name + '] Cancel must clear the active task state.');
    assert.equal(cancelRun.restoredActiveProject, true, '[' + target.name + '] Cancel must restore the active project to its task-start snapshot.');
    assert.equal(cancelRun.otherProjectsPreserved, true, '[' + target.name + '] Cancel must preserve every other project.');
    assert.equal(cancelRun.cancelMethodReturnedSafely, true, '[' + target.name + '] Task rollback snapshot must be cleared after cancellation.');

    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });

    // The visible Settings Profile panel must have one renderer and one set of
    // identity fields; the retired form must not reappear after boot/refresh.
    await page.evaluate(() => window.OVYXSettings.show('profile'));
    await page.locator('#view-settings [data-settings-panel="profile"] #set-profile-name').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#view-settings [data-settings-panel="profile"]').count(), 1,
      '[' + target.name + '] Settings must contain exactly one Profile panel.');
    assert.equal(await page.locator('#view-settings [data-settings-panel="profile"] #set-profile-name').count(), 1,
      '[' + target.name + '] Profile must expose exactly one canonical display-name field.');
    assert.equal(await page.locator('#view-settings #set-profile-name-legacy').count(), 0,
      '[' + target.name + '] Retired legacy Profile field must not compete with the current Profile renderer.');
    await page.evaluate(() => window.OVYXSettings.show('general'));

    // Regression: Universal Connections must only occupy its own Settings
    // category and must release all special visibility state on every other tab.
    const settingsCategories = await page.locator('#view-settings [data-settings-nav]').evaluateAll(nodes =>
      Array.from(new Set(nodes.map(node => String(node.dataset.settingsNav || '').trim()).filter(Boolean)))
    );
    assert.ok(settingsCategories.includes('connections'), '[' + target.name + '] Universal Connections must remain available as a real Settings category.');
    for (const category of settingsCategories) {
      await page.evaluate(id => window.OVYXSettings.show(id), category);
      await page.waitForTimeout(110);
      const panelState = await page.evaluate(() => {
        const root = document.getElementById('view-settings');
        const connection = root?.querySelector('[data-settings-panel="connections"]');
        const activeNav = root?.querySelector('[data-settings-nav].active');
        return {
          current: String(window.OVYXSettings?.current || ''),
          activeNav: String(activeNav?.dataset.settingsNav || ''),
          connectionHidden: !!connection?.hidden,
          connectionActiveClass: !!connection?.classList.contains('is-v91-active'),
          connectionDisplay: connection ? getComputedStyle(connection).display : 'missing',
          connectionInlineDisplayPriority: connection?.style.getPropertyPriority('display') || ''
        };
      });
      assert.equal(panelState.current, category, '[' + target.name + '] Selecting ' + category + ' must preserve that selected Settings category.');
      assert.equal(panelState.activeNav, category, '[' + target.name + '] The active Settings nav must match ' + category + '.');
      const connectionShouldShow = category === 'connections';
      assert.equal(panelState.connectionHidden, !connectionShouldShow, '[' + target.name + '] Connections hidden state must match selection of ' + category + '.');
      assert.equal(panelState.connectionActiveClass, connectionShouldShow, '[' + target.name + '] Connections must not remain active beneath ' + category + '.');
      assert.equal(panelState.connectionDisplay !== 'none', connectionShouldShow, '[' + target.name + '] Universal Connections must not remain visible outside its own category.');
      assert.equal(panelState.connectionInlineDisplayPriority, '', '[' + target.name + '] The Connections guard must not pin display with an inline !important override.');
    }

    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    // Appearance: one click must have one canonical owner, one preview, and no premature storage write.
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    const appearance = page.locator('[data-settings-panel="appearance"]');
    await appearance.locator('[data-appearance-save]').waitFor({ state: 'visible' });
    // The Settings shell has delayed appearance-open synchronization. Let that
    // initial panel transition settle before counting events from a user click.
    await page.waitForFunction(
      () => window.__settingsThemeAppliedEvents?.includes('appearance-open'),
      null,
      { timeout: 10000 },
    );
    await page.waitForTimeout(350);
    const savedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    await page.evaluate(() => {
      window.__settingsThemeAppliedEvents.length = 0;
      window.__settingsAppearanceCanonicalizedEvents.length = 0;
      window.__settingsPreviewCallStacks = [];
      const context = window.ThemeContext;
      const originalPreview = context.preview.bind(context);
      context.preview = function (patch) {
        window.__settingsPreviewCallStacks.push(String(new Error('ThemeContext.preview call').stack || ''));
        return originalPreview(patch);
      };
    });
    await appearance.locator('[data-mode="light"]').click();
    await page.waitForFunction(() => window.ThemeContext?.get?.().mode === 'light', null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => window.ThemeContext.isDirty()), true,
      '[' + target.name + '] choosing a mode must create an unsaved preview.');
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).mode, savedBefore.mode,
      '[' + target.name + '] previewing a mode must not prematurely write saved appearance.');
    let events = await page.evaluate(() => ({
      applied: [...window.__settingsThemeAppliedEvents],
      canonicalized: [...window.__settingsAppearanceCanonicalizedEvents],
    }));
    const previewTraces = await page.evaluate(() => window.__settingsPreviewCallStacks || []);
    assert.equal(events.applied.filter(reason => reason === 'preview').length, 1,
      '[' + target.name + '] a single mode click must apply exactly one preview; details=' + JSON.stringify({ events, previewTraces }));
    assert.equal(events.canonicalized.filter(reason => reason === 'mode-change').length, 1,
      '[' + target.name + '] a single mode click must have one canonical appearance action.');

    await page.evaluate(() => {
      window.__settingsThemeAppliedEvents.length = 0;
      window.__settingsAppearanceCanonicalizedEvents.length = 0;
    });
    await appearance.locator('[data-appearance-cancel]').click();
    await page.waitForFunction(() => window.ThemeContext?.isDirty?.() === false, null, { timeout: 15000 });
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).mode, savedBefore.mode,
      '[' + target.name + '] Cancel must leave saved appearance unchanged.');
    assert.equal((await page.evaluate(() => window.ThemeContext.get().mode)), savedBefore.mode);
    events = await page.evaluate(() => ({
      applied: [...window.__settingsThemeAppliedEvents],
      canonicalized: [...window.__settingsAppearanceCanonicalizedEvents],
    }));
    assert.equal(events.applied.filter(reason => reason === 'cancel').length, 1,
      '[' + target.name + '] Cancel must restore the preview exactly once.');

    await page.evaluate(() => {
      window.__settingsThemeAppliedEvents.length = 0;
      window.__settingsAppearanceCanonicalizedEvents.length = 0;
    });
    await appearance.locator('[data-mode="light"]').click();
    await appearance.locator('[data-theme-hex="accent"]').fill('#12AB34');
    await appearance.locator('[data-theme-hex="accent"]').dispatchEvent('change');
    await page.waitForFunction(() => window.ThemeContext?.get?.().accentColor === '#12AB34', null, { timeout: 10000 });
    await appearance.locator('[data-appearance-save]').click();
    await page.waitForFunction(() => window.ThemeContext?.isDirty?.() === false
      && window.ThemeContext?.getSaved?.().mode === 'light'
      && window.ThemeContext?.getSaved?.().accentColor === '#12AB34', null, { timeout: 15000 });
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).mode, 'light',
      '[' + target.name + '] Save Appearance must persist the preview.');
    events = await page.evaluate(() => ({
      applied: [...window.__settingsThemeAppliedEvents],
      canonicalized: [...window.__settingsAppearanceCanonicalizedEvents],
    }));
    assert.equal(events.applied.filter(reason => reason === 'save').length, 1,
      '[' + target.name + '] Save Appearance must write/apply exactly once.');

    // Reopening Appearance must read the saved canonical theme instead of
    // forcing the previous Theme Lab preset over the user's custom colour.
    await page.evaluate(() => window.OVYXSettings.show('privacy'));
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    await page.waitForFunction(() => window.ThemeContext?.isDirty?.() === false
      && window.ThemeContext?.get?.().accentColor === '#12AB34', null, { timeout: 10000 });
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).accentColor, '#12AB34',
      '[' + target.name + '] Opening Appearance must preserve the saved custom accent.');
    await page.evaluate(() => window.OVYXSettings.show('privacy'));
    const resetButton = page.locator('[data-settings-panel="privacy"] [data-clear-appearance]');
    await resetButton.waitFor({ state: 'visible' });
    await page.evaluate(() => { window.__settingsThemeAppliedEvents.length = 0; });
    await resetButton.click();
    await page.waitForFunction(() => window.ThemeContext?.getSaved?.().mode === 'dark' && window.ThemeContext?.isDirty?.() === false, null, { timeout: 15000 });
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).mode, 'dark',
      '[' + target.name + '] Reset appearance must persist the default theme.');
    assert.equal(
      (await page.evaluate(() => window.__settingsThemeAppliedEvents)).filter(reason => reason === 'reset').length,
      1,
      '[' + target.name + '] Reset must apply exactly once.',
    );

    // Reset was tested from Privacy; return to Appearance before interacting with
    // the Theme Lab fields, which correctly remain hidden outside their category.
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    await appearance.locator('[data-theme-name]').waitFor({ state: 'visible' });

    // Theme Lab lifecycle: Save, Duplicate, Export, Import, Delete and Reset must
    // update persistent storage and preserve the custom theme's name and colors.
    await appearance.locator('[data-theme-name]').fill('OVYX Roundtrip QA');
    await appearance.locator('[data-theme-hex="bg"]').fill('#112233');
    await appearance.locator('[data-theme-hex="accent"]').fill('#445566');
    assert.equal(await appearance.locator('[data-theme-name]').inputValue(), 'OVYX Roundtrip QA',
      '[' + target.name + '] changing theme colors must not discard the custom theme name draft.');
    await appearance.locator('[data-theme-save]').click();
    await page.waitForFunction(() => Object.values(window.OVYXThemeLab?.state?.customThemes || {})
      .some(theme => theme.name === 'OVYX Roundtrip QA' && String(theme.bg).toUpperCase() === '#112233'), null, { timeout: 15000 });
    const savedId = await page.evaluate(() => window.OVYXThemeLab.state.active);
    assert.ok(savedId.startsWith('custom_'), '[' + target.name + '] Save Custom Theme must create a persisted Custom entry.');

    await appearance.locator('[data-theme-duplicate]').click();
    await page.waitForFunction(previousId => {
      const lab = window.OVYXThemeLab;
      return String(lab.state.active).startsWith('custom_')
        && lab.state.active !== previousId
        && lab.state.customThemes[lab.state.active]?.name === 'OVYX Roundtrip QA Copy';
    }, savedId, { timeout: 15000 });
    const duplicateId = await page.evaluate(() => window.OVYXThemeLab.state.active);
    const duplicateCount = await page.evaluate(() => Object.keys(window.OVYXThemeLab.state.customThemes || {}).length);
    assert.equal(duplicateCount, 2, '[' + target.name + '] Duplicate must create a second persisted Custom theme.');
    await page.evaluate(() => {
      window.__ovyxThemeExportText = null;
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = function (blob) {
        if (blob instanceof Blob && blob.type === 'application/json') blob.text().then(text => { window.__ovyxThemeExportText = text; });
        return original(blob);
      };
    });
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await appearance.locator('[data-theme-export]').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'ovyx-theme.json', '[' + target.name + '] Export must download a JSON theme file.');
    const downloadPath = await download.path();
    assert.ok(downloadPath, '[' + target.name + '] Export should produce a readable download.');
    const exported = JSON.parse(await readFile(downloadPath, 'utf8'));
    await page.waitForFunction(() => Boolean(window.__ovyxThemeExportText), null, { timeout: 15000 });
    const interceptedExport = JSON.parse(await page.evaluate(() => window.__ovyxThemeExportText));
    assert.equal(exported.name, 'OVYX Roundtrip QA Copy', '[' + target.name + '] Export must preserve the custom theme name.');
    assert.equal(exported.backgroundColor, '#112233', '[' + target.name + '] Export must preserve canonical background color.');
    assert.equal(interceptedExport.accentColor, '#445566', '[' + target.name + '] Exported Blob must preserve canonical accent color.');

    const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
    await appearance.locator('[data-theme-import]').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'ovyx-theme.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await page.waitForFunction(({ expectedName, previousId }) => {
      const lab = window.OVYXThemeLab;
      const active = String(lab?.state?.active || '');
      const status = document.getElementById('settings-save-status')?.textContent || '';
      return status.startsWith('Theme import failed:')
        || (active.startsWith('custom_')
          && active !== previousId
          && lab.state.customThemes?.[active]?.name === expectedName);
    }, { expectedName: exported.name, previousId: duplicateId }, { timeout: 15000 });
    const importState = await page.evaluate(() => ({
      active: String(window.OVYXThemeLab?.state?.active || ''),
      activeTheme: window.OVYXThemeLab?.state?.customThemes?.[window.OVYXThemeLab?.state?.active] || null,
      status: document.getElementById('settings-save-status')?.textContent || '',
    }));
    assert.ok(!importState.status.startsWith('Theme import failed:'),
      '[' + target.name + '] Theme import reported failure: ' + JSON.stringify(importState));
    assert.ok(importState.active.startsWith('custom_') && importState.active !== duplicateId
      && importState.activeTheme?.name === exported.name,
      '[' + target.name + '] Import must create a newly named custom theme. Actual: ' + JSON.stringify(importState));
    const importedId = await page.evaluate(() => window.OVYXThemeLab.state.active);
    assert.notEqual(importedId, duplicateId, '[' + target.name + '] Import must create a new Custom entry.');
    const imported = await page.evaluate(() => {
      const lab = window.OVYXThemeLab;
      return { ...lab.state.customThemes[lab.state.active] };
    });
    assert.equal(String(imported.bg).toUpperCase(), '#112233', '[' + target.name + '] Import must accept canonical backgroundColor.');
    assert.equal(String(imported.accent).toUpperCase(), '#445566', '[' + target.name + '] Import must accept canonical accentColor.');

    await appearance.locator('[data-theme-delete]').click();
    await page.waitForFunction(id => !window.OVYXThemeLab.state.customThemes?.[id]
      && window.OVYXThemeLab.state.active === 'obsidian', importedId, { timeout: 15000 });
    await appearance.locator('[data-theme-reset]').click();
    // Reset is a synchronous local action; capture its immediate result so a CI
    // failure reports the actual in-memory and persisted state instead of only timing out.
    const resetAfterClick = await page.evaluate(() => {
      let persisted = {};
      try { persisted = JSON.parse(localStorage.getItem('ovyx.theme.lab.v1') || '{}'); } catch (_) {}
      return {
        active: window.OVYXThemeLab?.state?.active ?? null,
        customIds: Object.keys(window.OVYXThemeLab?.state?.customThemes || {}),
        persistedActive: persisted.active ?? null,
        persistedCustomIds: Object.keys(persisted.customThemes || {}),
        status: document.getElementById('settings-save-status')?.textContent || '',
      };
    });
    assert.equal(resetAfterClick.active, 'obsidian',
      '[' + target.name + '] Reset Lab must immediately activate obsidian. Actual: ' + JSON.stringify(resetAfterClick));
    assert.deepEqual(resetAfterClick.customIds, [],
      '[' + target.name + '] Reset Lab must immediately clear in-memory custom themes. Actual: ' + JSON.stringify(resetAfterClick));
    assert.equal(resetAfterClick.persistedActive, 'obsidian',
      '[' + target.name + '] Reset Lab must persist the obsidian baseline. Actual: ' + JSON.stringify(resetAfterClick));
    assert.deepEqual(resetAfterClick.persistedCustomIds, [],
      '[' + target.name + '] Reset Lab must persist an empty custom-theme list. Actual: ' + JSON.stringify(resetAfterClick));
    await page.waitForFunction(() => window.OVYXThemeLab.state.active === 'obsidian'
      && Object.keys(window.OVYXThemeLab.state.customThemes || {}).length === 0, null, { timeout: 15000 });
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.theme.lab.v1') || '{}')).then(x => x.active)), 'obsidian');

    const relevantErrors = pageErrors.filter(message =>
      /ThemeContext|appearance|ReferenceError/i.test(message));
    assert.deepEqual(relevantErrors, [], '[' + target.name + '] Appearance actions must not throw browser errors.');

    await context.close();
  }
  console.log('OVYX Appearance single-owner browser tests passed on desktop and mobile Chromium: one preview per click, no premature writes, one canonical Save/Cancel/Reset action, and no Settings runtime errors.');
} finally {
  await browser.close();
}
