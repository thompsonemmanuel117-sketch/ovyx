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
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });

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
    await page.waitForFunction(() => window.ThemeContext?.get?.().mode === 'light');
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
    await page.waitForFunction(() => window.ThemeContext?.isDirty?.() === false);
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
    await appearance.locator('[data-appearance-save]').click();
    await page.waitForFunction(() => window.ThemeContext?.isDirty?.() === false && window.ThemeContext?.getSaved?.().mode === 'light');
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).mode, 'light',
      '[' + target.name + '] Save Appearance must persist the preview.');
    events = await page.evaluate(() => ({
      applied: [...window.__settingsThemeAppliedEvents],
      canonicalized: [...window.__settingsAppearanceCanonicalizedEvents],
    }));
    assert.equal(events.applied.filter(reason => reason === 'save').length, 1,
      '[' + target.name + '] Save Appearance must write/apply exactly once.');

    await page.evaluate(() => window.OVYXSettings.show('privacy'));
    const resetButton = page.locator('[data-settings-panel="privacy"] [data-clear-appearance]');
    await resetButton.waitFor({ state: 'visible' });
    await page.evaluate(() => { window.__settingsThemeAppliedEvents.length = 0; });
    await resetButton.click();
    await page.waitForFunction(() => window.ThemeContext?.getSaved?.().mode === 'dark' && window.ThemeContext?.isDirty?.() === false);
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'))).mode, 'dark',
      '[' + target.name + '] Reset appearance must persist the default theme.');
    assert.equal(
      (await page.evaluate(() => window.__settingsThemeAppliedEvents)).filter(reason => reason === 'reset').length,
      1,
      '[' + target.name + '] Reset must apply exactly once.',
    );

    // Theme Lab lifecycle: Save, Duplicate, Export, Import, Delete and Reset must
    // update persistent storage and preserve the custom theme's name and colors.
    await appearance.locator('[data-theme-name]').fill('OVYX Roundtrip QA');
    await appearance.locator('[data-theme-hex="bg"]').fill('#112233');
    await appearance.locator('[data-theme-hex="accent"]').fill('#445566');
    await appearance.locator('[data-theme-save]').click();
    await page.waitForFunction(() => Object.values(window.OVYXThemeLab?.state?.customThemes || {})
      .some(theme => theme.name === 'OVYX Roundtrip QA' && String(theme.bg).toUpperCase() === '#112233'));
    const savedId = await page.evaluate(() => window.OVYXThemeLab.state.active);
    assert.ok(savedId.startsWith('custom_'), '[' + target.name + '] Save Custom Theme must create a persisted Custom entry.');

    await appearance.locator('[data-theme-duplicate]').click();
    await page.waitForFunction(previousId => {
      const lab = window.OVYXThemeLab;
      return String(lab.state.active).startsWith('custom_')
        && lab.state.active !== previousId
        && lab.state.customThemes[lab.state.active]?.name === 'OVYX Roundtrip QA Copy';
    }, savedId);
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
    const downloadPromise = page.waitForEvent('download');
    await appearance.locator('[data-theme-export]').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'ovyx-theme.json', '[' + target.name + '] Export must download a JSON theme file.');
    const downloadPath = await download.path();
    assert.ok(downloadPath, '[' + target.name + '] Export should produce a readable download.');
    const exported = JSON.parse(await readFile(downloadPath, 'utf8'));
    await page.waitForFunction(() => Boolean(window.__ovyxThemeExportText));
    const interceptedExport = JSON.parse(await page.evaluate(() => window.__ovyxThemeExportText));
    assert.equal(exported.name, 'OVYX Roundtrip QA Copy', '[' + target.name + '] Export must preserve the custom theme name.');
    assert.equal(exported.backgroundColor, '#112233', '[' + target.name + '] Export must preserve canonical background color.');
    assert.equal(interceptedExport.accentColor, '#445566', '[' + target.name + '] Exported Blob must preserve canonical accent color.');

    const chooserPromise = page.waitForEvent('filechooser');
    await appearance.locator('[data-theme-import]').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'ovyx-theme.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await page.waitForFunction(expectedName => {
      const lab = window.OVYXThemeLab;
      const active = String(lab?.state?.active || '');
      return active.startsWith('custom_') && lab.state.customThemes?.[active]?.name === expectedName;
    }, exported.name);
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
      && window.OVYXThemeLab.state.active === 'obsidian', importedId);
    await appearance.locator('[data-theme-reset]').click();
    await page.waitForFunction(() => window.OVYXThemeLab.state.active === 'obsidian'
      && Object.keys(window.OVYXThemeLab.state.customThemes || {}).length === 0);
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
