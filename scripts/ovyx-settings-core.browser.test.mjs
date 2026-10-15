import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

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

    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });

    // Appearance: one click must have one canonical owner, one preview, and no premature storage write.
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    const appearance = page.locator('[data-settings-panel="appearance"]');
    await appearance.locator('[data-appearance-save]').waitFor({ state: 'visible' });
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

    const relevantErrors = pageErrors.filter(message =>
      /ThemeContext|appearance|ReferenceError/i.test(message));
    assert.deepEqual(relevantErrors, [], '[' + target.name + '] Appearance actions must not throw browser errors.');

    await context.close();
  }
  console.log('OVYX Appearance single-owner browser tests passed on desktop and mobile Chromium: one preview per click, no premature writes, one canonical Save/Cancel/Reset action, and no Settings runtime errors.');
} finally {
  await browser.close();
}
