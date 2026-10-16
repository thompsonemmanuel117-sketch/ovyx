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
  await page.waitForFunction(
    () => typeof window.__OVYX_BOOT_ROUTE === 'string'
      && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
    null,
    { timeout: 10000 },
  );
}

const failures = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on('pageerror', error => {
      if (/CommandPalette|ProjectStore|OVYXSettingsProjectShortcuts|historyPointer|WebStudio/i.test(error.message)) {
        pageErrors.push(error.message);
      }
    });

    await installOwnerBrowserApiFixtures(page, {
      initialUser: {
        uid: 'settings-shortcuts-browser-user',
        email: 'settings-shortcuts-browser@example.test',
        token: 'settings-shortcuts-browser-token',
      },
    });

    try {
      const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app returned an HTTP error.');
      await waitForRouteRestore(page);
    } catch (error) {
      failures.push('[' + target.name + '] app startup/route restore: ' + error.message);
      await context.close();
      continue;
    }

    // Ctrl/Command+N: open the real project-creation dialog and persist a project.
    try {
      await page.keyboard.press('Control+n');
      const modal = page.locator('#ovyx-project-create-modal');
      await modal.waitFor({ state: 'visible' });
      await page.locator('#ovyx-project-name-input').fill('Settings Shortcut Browser Project');
      await page.locator('#ovyx-project-create-modal [data-modal-create]').click();
      await page.waitForFunction(
        () => window.KernelState?.activeProject?.name === 'Settings Shortcut Browser Project'
          && window.KernelState?.activeView === 'webstudio',
        null,
        { timeout: 20000 },
      );
      const stored = await page.evaluate(() => {
        const uid = window.firebase?.auth?.().currentUser?.uid;
        const key = uid ? 'ovyx.projects.v22.user.' + uid : 'ovyx.projects.v22.guest';
        const projects = JSON.parse(localStorage.getItem(key) || '[]');
        const active = window.KernelState?.activeProject;
        return { key, exists: Array.isArray(projects) && projects.some(p => p.id === active?.id && p.name === active?.name) };
      });
      assert.equal(stored.exists, true, '[' + target.name + '] Ctrl+N must create and persist the new project locally.');
      assert.match(stored.key, /ovyx\.projects\.v22\.(user\.settings-shortcuts-browser-user|guest)/);
    } catch (error) {
      failures.push('[' + target.name + '] Ctrl+N/new-project dialog: ' + error.message);
    }

    // Ctrl/Command+S: persist current local project state and report the actual scope.
    try {
      await page.evaluate(() => {
        if (!window.KernelState?.activeProject) throw new Error('No active project was created by Ctrl+N.');
        window.KernelState.activeProject.description = 'Updated by the Ctrl+S browser test.';
        window.KernelState.activeProject.updatedAt = Date.now();
      });
      await page.keyboard.press('Control+s');
      await page.waitForFunction(() => {
        const uid = window.firebase?.auth?.().currentUser?.uid;
        const key = uid ? 'ovyx.projects.v22.user.' + uid : 'ovyx.projects.v22.guest';
        const projects = JSON.parse(localStorage.getItem(key) || '[]');
        const active = window.KernelState?.activeProject;
        return Array.isArray(projects) && projects.some(p => p.id === active?.id && p.description === 'Updated by the Ctrl+S browser test.');
      }, null, { timeout: 15000 });
      const saved = await page.evaluate(() => {
        const uid = window.firebase?.auth?.().currentUser?.uid;
        const key = uid ? 'ovyx.projects.v22.user.' + uid : 'ovyx.projects.v22.guest';
        const projects = JSON.parse(localStorage.getItem(key) || '[]');
        const active = window.KernelState?.activeProject;
        return projects.find(p => p.id === active?.id)?.description || '';
      });
      assert.equal(saved, 'Updated by the Ctrl+S browser test.',
        '[' + target.name + '] Ctrl+S must write the latest project state to local storage.');
    } catch (error) {
      failures.push('[' + target.name + '] Ctrl+S/local persistence: ' + error.message);
    }

    // Ctrl+Z / Ctrl+Shift+Z: use real Web Studio history and confirm the source state changes.
    try {
      await page.evaluate(() => window.Router?.go?.('webstudio'));
      await page.waitForFunction(() => window.KernelState?.activeView === 'webstudio', null, { timeout: 15000 });
      await page.waitForTimeout(150);
      const prepared = await page.evaluate(() => {
        const studio = window.WebStudio;
        if (!studio || typeof studio.ensureProjectGraph !== 'function'
          || typeof studio.getActiveSection !== 'function'
          || typeof studio.setStyleParam !== 'function'
          || typeof studio.recordHistory !== 'function') {
          throw new Error('Web Studio history API is unavailable.');
        }
        studio.ensureProjectGraph();
        studio.historyStack = [];
        studio.historyPointer = -1;
        const page = studio.getActivePage();
        const section = page?.sections?.[0];
        if (!section) throw new Error('Web Studio has no page section available for history testing.');
        studio.selectedNodeId = section.id;
        const selected = studio.getActiveSection();
        if (!selected) throw new Error('Web Studio could not select the fixture section for history testing.');
        const before = String(selected.styles?.background || '');
        studio.recordHistory();
        studio.setStyleParam('background', '#1456a0');
        studio.recordHistory();
        const after = String(studio.getActiveSection()?.styles?.background || '');
        return { before, after, historyPointer: studio.historyPointer, activeView: String(window.KernelState?.activeView || '') };
      });
      assert.notEqual(prepared.after, prepared.before, '[' + target.name + '] test edit should change the active section before Undo.');
      assert.equal(prepared.after, '#1456a0');
      await page.evaluate(() => {
        const studio = window.WebStudio;
        const undo = studio.undo.bind(studio);
        const redo = studio.redo.bind(studio);
        window.__settingsShortcutUndoCalls = 0;
        window.__settingsShortcutRedoCalls = 0;
        studio.undo = function () { window.__settingsShortcutUndoCalls += 1; return undo(); };
        studio.redo = function () { window.__settingsShortcutRedoCalls += 1; return redo(); };
      });
      await page.keyboard.press('Control+z');
      const undone = await page.evaluate(() => ({
        background: String(window.WebStudio?.getActiveSection()?.styles?.background || ''),
        pointer: window.WebStudio?.historyPointer,
        activeView: String(window.KernelState?.activeView || ''),
        calls: window.__settingsShortcutUndoCalls || 0,
      }));
      assert.equal(undone.background, prepared.before, '[' + target.name + '] Ctrl+Z must restore the previous editor state (route=' + undone.activeView + ', historyPointer=' + undone.pointer + ', undoCalls=' + undone.calls + ').');
      await page.keyboard.press('Control+Shift+z');
      const redone = await page.evaluate(() => ({
        background: String(window.WebStudio?.getActiveSection()?.styles?.background || ''),
        pointer: window.WebStudio?.historyPointer,
        activeView: String(window.KernelState?.activeView || ''),
        calls: window.__settingsShortcutRedoCalls || 0,
      }));
      assert.equal(redone.background, '#1456a0', '[' + target.name + '] Ctrl+Shift+Z must reapply the edit after Undo (route=' + redone.activeView + ', historyPointer=' + redone.pointer + ', redoCalls=' + redone.calls + ').');
    } catch (error) {
      failures.push('[' + target.name + '] Undo/Redo: ' + error.message);
    }

    // Ctrl/Command+K: open, search, and execute the Settings command.
    try {
      await page.keyboard.press('Control+k');
      const palette = page.locator('#cmd-palette-modal');
      const visibleAfterHotkey = await palette.isVisible();
      if (!visibleAfterHotkey) {
        failures.push('[' + target.name + '] Ctrl+K did not leave the Command Palette visible.');
        // Keep probing search/dispatch independently so one broken layer does not
        // hide a second shortcut defect in the same diagnostic run.
        await palette.evaluate(el => el.classList.remove('hidden'));
      }
      await page.locator('#cmd-input-field').fill('Settings & Preferences');
      const result = page.locator('#cmd-items-feed > div').filter({ hasText: 'Settings & Preferences' }).first();
      await result.waitFor({ state: 'visible' });
      await result.click();
      await page.waitForTimeout(250);
      const activeRoute = await page.evaluate(() => String(window.KernelState?.activeView || ''));
      if (activeRoute !== 'settings') {
        failures.push('[' + target.name + '] Searching and executing “Settings & Preferences” routed to "' + activeRoute + '" instead of Settings.');
      }
      assert.equal(await palette.isVisible(), false, '[' + target.name + '] Command Palette should close after a command executes.');
    } catch (error) {
      failures.push('[' + target.name + '] Command Palette open/search/execute: ' + error.message);
    }

    for (const error of pageErrors) failures.push('[' + target.name + '] unexpected Settings shortcut page error: ' + error);
    await context.close();
  }

  if (failures.length) {
    console.error('OVYX Settings shortcut browser failures:\n' + failures.map((x, i) => (i + 1) + '. ' + x).join('\n'));
    assert.fail(failures.length + ' Settings shortcut browser assertion(s) failed; see the per-action diagnostics above.');
  }
  console.log('OVYX Settings shortcut browser tests passed on desktop and mobile: Ctrl/Command+K palette search/execute, Ctrl/Command+N new project, Ctrl/Command+S local save, and Web Studio Undo/Redo.');
} finally {
  await browser.close();
}
