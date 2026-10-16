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

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const settingsErrors = [];
    page.on('pageerror', error => {
      if (/OVYXSettingsIntegrity|OVYXRuntimeSession|OVYXProjectDeletion|set-autosave|set-confirm-delete|set-editor-mode|renderPreview|inspector/i.test(error.message)) {
        settingsErrors.push(error.message);
      }
    });

    await installOwnerBrowserApiFixtures(page, {
      initialUser: {
        uid: 'settings-workspace-browser-user',
        email: 'settings-workspace-browser@example.test',
        token: 'settings-workspace-browser-token',
      },
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app failed to load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.ProjectStore?.open === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && typeof window.OVYXSettingsIntegrity?.save === 'function'
        && typeof window.OVYXRuntimeSession?.save === 'function'
        && typeof window.WebStudio?.renderPreview === 'function'
        && window.OVYXProjectDeletion?.__v83 === true
        && window.ProjectStore?.__v83Open === true,
      null,
      { timeout: 45000 },
    );
    await waitForRouteRestore(page);

    // Start with known preferences and a harmless local-only fixture project.
    const projectId = await page.evaluate(() => {
      localStorage.removeItem('ovyx.settings.toggles.v34');
      window.OVYXSettingsIntegrity.save({
        ...window.OVYXSettingsIntegrity.defaults,
        openBehavior: 'Web Studio',
        autosave: true,
        confirmDelete: true,
        inspector: true,
        livePreview: true,
        aiSafe: true,
        editorMode: 'build',
      });
      const id = 'settings-workspace-browser-project';
      const p = {
        id,
        name: 'Settings Workspace Browser Test',
        description: 'Disposable local-only browser fixture.',
        status: 'draft',
        updatedAt: Date.now(),
        pages: [{
          id: 'settings-test-home',
          name: 'Home',
          slug: '/',
          sections: [{
            id: 'settings-test-hero',
            type: 'hero',
            content: { heading: 'Settings browser fixture', subheading: 'A safe local test page.', cta: 'Preview' },
            styles: { display: 'flex', minHeight: '220px', padding: '24px', color: '#ffffff', background: '#090a0d' },
          }],
        }],
        assets: [],
        revisions: [],
        ovyxGraph: {
          version: 2,
          entry: 'src/pages/Home.html',
          files: {
            'src/pages/Home.html': {
              type: 'text/html',
              content: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Settings browser fixture</title></head><body><main><h1>Settings browser fixture</h1></main></body></html>',
              updatedAt: Date.now(),
            },
            'src/styles.css': { type: 'text/css', content: 'body{margin:0;font-family:Arial,sans-serif}', updatedAt: Date.now() },
            'src/main.js': { type: 'text/javascript', content: '// Disposable Settings browser fixture.\\n', updatedAt: Date.now() },
            'package.json': { type: 'application/json', content: JSON.stringify({ name: 'settings-browser-fixture', private: true, dependencies: {} }), updatedAt: Date.now() },
          },
          updatedAt: Date.now(),
        },
      };
      const state = window.KernelState;
      state.projects = Array.isArray(state.projects) ? state.projects.filter(item => item?.id !== id) : [];
      state.projects.unshift(p);
      state.activeProject = p;
      window.ProjectStore.save();
      return id;
    });

    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    const workspace = page.locator('[data-settings-panel="workspace"]');
    await workspace.locator('#set-open-behavior').waitFor({ state: 'visible' });

    // Open behavior must change the result of a real, safe local ProjectStore.open().
    await workspace.locator('#set-open-behavior').selectOption({ label: 'Project overview' });
    const savedOpenBehavior = await page.evaluate(
      () => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').openBehavior,
    );
    assert.equal(
      savedOpenBehavior,
      'Project overview',
      '[' + target.name + '] Project overview preference must be persisted.',
    );
    await page.evaluate(id => window.ProjectStore.open(id), projectId);
    await page.waitForFunction(() => window.KernelState?.activeView === 'projects', null, { timeout: 15000 });

    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    // Seed the last non-Settings route after opening Settings, which can itself
    // update the last-view key during route restoration.
    await page.evaluate(() => localStorage.setItem('ovyx.settings.last-view.v1', 'projects'));
    await workspace.locator('#set-open-behavior').selectOption({ label: 'Last active view' });
    await page.evaluate(id => window.ProjectStore.open(id), projectId);
    await page.waitForFunction(() => window.KernelState?.activeView === 'projects', null, { timeout: 15000 });

    // Autosave on/off must affect actual recovery snapshots, not only aria-checked.
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    await workspace.locator('#set-autosave').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXRuntimeSession.save());
    const beforeAutosave = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.runtime.session.v4') || '{}'));
    assert.equal(beforeAutosave.draft?.id, projectId, '[' + target.name + '] enabled autosave should store the active project snapshot.');

    await workspace.locator('#set-autosave').click();
    await page.waitForFunction(() => {
      const prefs = JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}');
      const session = JSON.parse(localStorage.getItem('ovyx.runtime.session.v4') || '{}');
      return prefs.autosave === false && session.autosaveRecoveryEnabled === false && session.draft === null;
    }, null, { timeout: 10000 });
    await page.evaluate(() => window.OVYXRuntimeSession.save());
    const disabledAutosave = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.runtime.session.v4') || '{}'));
    assert.equal(disabledAutosave.draft, null, '[' + target.name + '] disabled autosave must not leave a recovery draft.');
    assert.equal(await workspace.locator('#set-autosave').getAttribute('aria-checked'), 'false');

    await workspace.locator('#set-autosave').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').autosave === true);
    await page.evaluate(() => window.OVYXRuntimeSession.save());
    const reenabledAutosave = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.runtime.session.v4') || '{}'));
    assert.equal(reenabledAutosave.draft?.id, projectId, '[' + target.name + '] re-enabled autosave must restore snapshots.');

    // Test both confirmation paths without ever invoking destructive project deletion.
    const deleteChecks = await page.evaluate(id => {
      const deletion = window.OVYXProjectDeletion;
      const originalConfirm = deletion.confirm.bind(deletion);
      window.__settingsDeleteConfirmCalls = 0;
      deletion.confirm = function () {
        window.__settingsDeleteConfirmCalls += 1;
        return false;
      };
      deletion.open(id);
      const shownWhileEnabled = !!deletion.modal?.classList.contains('open');
      deletion.close();
      return { shownWhileEnabled, hasProject: window.ProjectStore.list().some(project => project.id === id), originalConfirm: typeof originalConfirm };
    }, projectId);
    assert.equal(deleteChecks.shownWhileEnabled, true, '[' + target.name + '] with confirmation enabled, Delete must open the confirmation UI.');
    await workspace.locator('#set-confirm-delete').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').confirmDelete === false);
    const disabledDelete = await page.evaluate(id => {
      const deletion = window.OVYXProjectDeletion;
      deletion.open(id);
      return {
        calls: window.__settingsDeleteConfirmCalls,
        modalOpen: !!deletion.modal?.classList.contains('open'),
        hasProject: window.ProjectStore.list().some(project => project.id === id),
      };
    }, projectId);
    assert.equal(disabledDelete.calls, 1, '[' + target.name + '] with confirmation disabled, delete should proceed straight to the confirmation function exactly once.');
    assert.equal(disabledDelete.modalOpen, false, '[' + target.name + '] disabled confirmation must not open the modal.');
    assert.equal(disabledDelete.hasProject, true, '[' + target.name + '] the mocked confirmation must preserve the test project.');
    await page.evaluate(() => {
      const deletion = window.OVYXProjectDeletion;
      deletion.confirm = function () { return false; };
      deletion.close();
    });
    await workspace.locator('#set-confirm-delete').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').confirmDelete === true);

    // Editor controls must change real state and persist across a page reload.
    const studioRouteResult = await page.evaluate(() => {
      try {
        window.Router.go('webstudio');
        return { ok: true, activeView: window.KernelState?.activeView || null };
      } catch (error) {
        return {
          ok: false,
          name: String(error?.name || 'Error'),
          message: String(error?.message || error),
          stack: String(error?.stack || '').split('\\n').slice(0, 18),
          activeView: window.KernelState?.activeView || null,
        };
      }
    });
    assert.equal(studioRouteResult.ok, true,
      '[' + target.name + '] Web Studio route threw: ' + JSON.stringify(studioRouteResult));
    await page.waitForFunction(() => window.KernelState?.activeView === 'webstudio');
    await page.locator('#ws-select-inspector').waitFor({ state: 'attached' });
    await page.locator('#ws-canvas-iframe').waitFor({ state: 'attached' });
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('editor'));
    const editor = page.locator('[data-settings-panel="editor"]');
    await editor.locator('#set-editor-mode').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('set-editor-mode')?.dataset.ovyxBound === '1');

    await editor.locator('#set-inspector').click({ force: true });
    await page.waitForFunction(() => document.querySelector('#ws-select-inspector')?.style.display === 'none');
    assert.equal(await editor.locator('#set-inspector').getAttribute('aria-checked'), 'false',
      '[' + target.name + '] inspector toggle should apply the hidden state.');
    await editor.locator('#set-inspector').click({ force: true });
    await page.waitForFunction(() => document.querySelector('#ws-select-inspector')?.style.display !== 'none');

    await editor.locator('#set-live-preview').click({ force: true });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').livePreview === false);
    const paused = await page.evaluate(() => ({
      result: window.WebStudio.renderPreview(),
      paused: document.getElementById('ws-canvas-iframe')?.dataset.ovyxLivePreviewPaused,
    }));
    assert.equal(paused.result, false, '[' + target.name + '] automatic preview render should be blocked while paused.');
    assert.equal(paused.paused, 'true', '[' + target.name + '] iframe should explicitly report paused preview state.');

    await editor.locator('#set-live-preview').click({ force: true });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').livePreview === true);
    assert.equal(await page.locator('#ws-canvas-iframe').getAttribute('data-ovyx-live-preview-paused'), 'false',
      '[' + target.name + '] re-enabling live preview should restore automatic preview state.');

    await page.evaluate(() => {
      const studio = window.WebStudio;
      const original = studio.setMode.bind(studio);
      window.__settingsEditorModeCalls = [];
      studio.setMode = function (mode) {
        window.__settingsEditorModeCalls.push(String(mode));
        return original(mode);
      };
    });
    await editor.locator('#set-editor-mode').selectOption('fix');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx.settings.integrity.v83') || '{}').editorMode === 'fix');
    const modeCalls = await page.evaluate(() => window.__settingsEditorModeCalls.filter(mode => mode === 'fix').length);
    assert.equal(modeCalls, 1, '[' + target.name + '] selecting Fix should call WebStudio.setMode exactly once.');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && typeof window.OVYXSettingsIntegrity?.load === 'function',
      null,
      { timeout: 45000 },
    );
    await waitForRouteRestore(page);
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('editor'));
    await page.locator('[data-settings-panel="editor"] #set-editor-mode').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-settings-panel="editor"] #set-editor-mode').inputValue(), 'fix',
      '[' + target.name + '] editor mode must persist after reload.');
    assert.deepEqual(settingsErrors, [], '[' + target.name + '] Workspace/Editor interactions should not throw runtime errors.');
    await context.close();
  }
  console.log('OVYX Editor and Workspace browser tests passed on desktop and mobile: open behavior route choice, autosave snapshots, delete-confirmation branching, inspector visibility, live-preview pause/resume, and editor-mode persistence.');
} finally {
  await browser.close();
}
