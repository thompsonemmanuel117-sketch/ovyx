import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

async function waitForRouteRestore(page) {
  await page.waitForFunction(
    () => document.readyState === 'complete'
      && typeof window.__OVYX_BOOT_ROUTE === 'string'
      && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
    null,
    { timeout: 45000 },
  );
  await page.waitForTimeout(120);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', error => {
      if (/ProjectStore|OVYXSettings|WebStudio|undo|redo|shortcut/i.test(error.message)) errors.push(error.message);
    });
    await installOwnerBrowserApiFixtures(page, {
      initialUser: {
        uid: 'settings-shortcuts-browser-user',
        email: 'settings-shortcuts-browser@example.test',
        token: 'settings-shortcuts-browser-token',
      },
    });
    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app did not load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && typeof window.ProjectStore?.createPromptModal === 'function'
        && typeof window.ProjectStore?.save === 'function'
        && window.__OVYXSettingsProjectShortcutsV1 === true,
      null,
      { timeout: 45000 },
    );
    await waitForRouteRestore(page);

    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('shortcuts'));
    const panel = page.locator('[data-settings-panel="shortcuts"]');
    await panel.waitFor({ state: 'visible' });
    const shortcutCopy = await panel.innerText();
    assert.match(shortcutCopy, /Command palette/i,
      '[' + target.name + '] Ctrl/Command+K must be documented as opening the Command Palette.');
    assert.match(shortcutCopy, /App-wide/i,
      '[' + target.name + '] the Command Palette shortcut must remain documented as app-wide.');
    assert.match(shortcutCopy, /New project/i);
    assert.match(shortcutCopy, /Save project/i);
    assert.match(shortcutCopy, /Undo/i);
    assert.match(shortcutCopy, /Redo/i);
    assert.doesNotMatch(shortcutCopy, /Focus AI prompt/i);

    // New Project: accept a disposable prompt and verify one action plus a local saved snapshot.
    await page.evaluate(() => {
      const store = window.ProjectStore;
      const original = store.createPromptModal.bind(store);
      window.__settingsShortcutNewProjectCalls = 0;
      store.createPromptModal = function () {
        window.__settingsShortcutNewProjectCalls += 1;
        return original();
      };
    });
    page.once('dialog', async dialog => {
      assert.equal(dialog.type(), 'prompt', '[' + target.name + '] New Project should request the project name.');
      assert.match(dialog.message(), /Project name/i);
      await dialog.accept('Shortcut Browser Test Project');
    });
    await page.evaluate(() => {
      window.__settingsShortcutKeyEvents = [];
      document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'n') {
          window.__settingsShortcutKeyEvents.push({ defaultPrevented: event.defaultPrevented });
        }
      });
    });
    await page.keyboard.press('Control+n');
    await page.waitForFunction(
      () => window.KernelState?.activeProject?.name === 'Shortcut Browser Test Project',
      null,
      { timeout: 15000 },
    );
    const shortcutDiagnostics = await page.evaluate(() => ({
      calls: window.__settingsShortcutNewProjectCalls,
      activeProject: window.KernelState?.activeProject?.name || null,
      keyEvents: window.__settingsShortcutKeyEvents,
      activeView: window.KernelState?.activeView || null,
    }));
    assert.equal(shortcutDiagnostics.activeProject, 'Shortcut Browser Test Project',
      '[' + target.name + '] Ctrl/Command+N must create the prompted project; diagnostics=' + JSON.stringify(shortcutDiagnostics));
    assert.equal(await page.evaluate(() => window.__settingsShortcutNewProjectCalls), 1,
      '[' + target.name + '] Ctrl/Command+N should invoke New Project exactly once.');
    const created = await page.evaluate(() => {
      const key = 'ovyx.projects.v22.user.settings-shortcuts-browser-user';
      const projects = JSON.parse(localStorage.getItem(key) || '[]');
      const active = window.KernelState?.activeProject;
      return {
        activeId: active?.id || null,
        stored: projects.some(project => project.id === active?.id
          && project.name === 'Shortcut Browser Test Project'),
        activeView: window.KernelState?.activeView || null,
      };
    });
    assert.ok(created.activeId, '[' + target.name + '] New Project must create a real project id.');
    assert.equal(created.stored, true, '[' + target.name + '] New Project must be saved to this signed-in fixture’s local project store.');
    assert.equal(created.activeView, 'webstudio', '[' + target.name + '] a new project should open Web Studio by default.');

    // Save Project: verify a single save action writes the changed fixture back to local storage.
    await page.evaluate(() => {
      const store = window.ProjectStore;
      const original = store.save.bind(store);
      window.__settingsShortcutSaveCalls = 0;
      store.save = function () {
        window.__settingsShortcutSaveCalls += 1;
        return original();
      };
      window.KernelState.activeProject.description = 'Saved using Ctrl/Command+S browser shortcut.';
      window.KernelState.activeProject.updatedAt = Date.now();
    });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => {
      const projects = JSON.parse(localStorage.getItem('ovyx.projects.v22.user.settings-shortcuts-browser-user') || '[]');
      return projects.some(project => project.id === window.KernelState?.activeProject?.id
        && project.description === 'Saved using Ctrl/Command+S browser shortcut.');
    }, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__settingsShortcutSaveCalls), 1,
      '[' + target.name + '] Ctrl/Command+S must call the project save function exactly once.');
    const saveCopy = await page.evaluate(() => {
      const projects = JSON.parse(localStorage.getItem('ovyx.projects.v22.user.settings-shortcuts-browser-user') || '[]');
      return projects.find(project => project.id === window.KernelState?.activeProject?.id);
    });
    assert.equal(saveCopy?.description, 'Saved using Ctrl/Command+S browser shortcut.');

    // Ctrl/Command+K must open and focus the Command Palette, including from Web Studio.
    await page.waitForFunction(() => window.KernelState?.activeView === 'webstudio');
    const palette = page.locator('#cmd-palette-modal');
    await page.keyboard.press('Control+k');
    await palette.waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'cmd-input-field',
      '[' + target.name + '] Ctrl/Command+K must focus the visible Command Palette input.');
    await page.keyboard.press('Escape');
    await palette.waitFor({ state: 'hidden' });

    // Undo and Redo are Web Studio-only shortcuts. Count the real handlers on the disposable fixture.
    const undoRedoAvailable = await page.evaluate(() => ({
      undo: typeof window.WebStudio?.undo === 'function',
      redo: typeof window.WebStudio?.redo === 'function',
    }));
    assert.deepEqual(undoRedoAvailable, { undo: true, redo: true },
      '[' + target.name + '] Web Studio Undo/Redo handlers must be available.');
    await page.evaluate(() => {
      const studio = window.WebStudio;
      const undo = studio.undo.bind(studio);
      const redo = studio.redo.bind(studio);
      window.__settingsShortcutUndoCalls = 0;
      window.__settingsShortcutRedoCalls = 0;
      studio.undo = function () {
        window.__settingsShortcutUndoCalls += 1;
        return undo();
      };
      studio.redo = function () {
        window.__settingsShortcutRedoCalls += 1;
        return redo();
      };
    });
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => window.__settingsShortcutUndoCalls === 1, null, { timeout: 10000 });
    await page.keyboard.press('Control+Shift+z');
    await page.waitForFunction(() => window.__settingsShortcutRedoCalls === 1, null, { timeout: 10000 });
    assert.deepEqual(
      await page.evaluate(() => ({ undo: window.__settingsShortcutUndoCalls, redo: window.__settingsShortcutRedoCalls })),
      { undo: 1, redo: 1 },
      '[' + target.name + '] Undo/Redo keyboard actions must each invoke one real handler.',
    );

    assert.deepEqual(errors, [], '[' + target.name + '] shortcut actions must not throw relevant browser errors.');
    await context.close();
  }
  console.log('OVYX Settings Shortcuts browser tests passed on desktop and mobile: accurate Ctrl/Command+K label, single New Project and Save actions, saved local project snapshot, and Web Studio Undo/Redo handlers.');
} finally {
  await browser.close();
}
