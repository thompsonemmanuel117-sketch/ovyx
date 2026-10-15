import assert from 'node:assert/strict';
import { chromium } from 'playwright';

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
    page.on('pageerror', error => errors.push(error.message));

    await page.addInitScript(() => {
      localStorage.setItem('ovyx.runtime.route.v18', 'settings');
      localStorage.setItem('ovyx.settings.last-view.v1', 'settings');
      localStorage.setItem('ovyx.ai.preferences.v1', JSON.stringify({
        provider: 'gemini', model: 'automatic', routing: 'automatic',
        fallback: 'next', contextLimit: 'automatic', budget: 'automatic',
        explain: true, preserve: true, confirmDestructive: false,
        contextFiles: true, contextPage: true, contextGithub: true,
      }));
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app did not load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && typeof window.OVYXAIStorageKey === 'function',
      null,
      { timeout: 45000 },
    );
    await waitForRouteRestore(page);
    await page.evaluate(() => {
      window.Router.go('settings');
      window.OVYXSettings.show('ai');
    });
    const panel = page.locator('[data-settings-panel="ai"]');
    await panel.waitFor({ state: 'visible' });

    for (const id of ['set-provider','set-ai-model','set-ai-routing','set-ai-fallback','set-ai-context-limit','set-ai-budget','set-ai-save','set-ai-reset']) {
      assert.equal(await panel.locator('#' + id).count(), 1, '[' + target.name + '] missing or duplicate AI control: ' + id);
    }

    await page.locator('#set-provider').selectOption('anthropic');
    await page.locator('#set-ai-model').selectOption('claude-opus-5');
    await page.locator('#set-ai-routing').selectOption('preferred-first');
    await page.locator('#set-ai-fallback').selectOption('stop');
    await page.locator('#set-ai-context-limit').selectOption('conservative');
    await page.locator('#set-ai-budget').selectOption('efficient');
    await page.locator('#set-ai-save').click();

    await page.waitForFunction(() => {
      const prefs = JSON.parse(localStorage.getItem(window.OVYXAIStorageKey()) || '{}');
      return prefs.provider === 'anthropic' && prefs.model === 'claude-opus-5'
        && prefs.routing === 'preferred-first' && prefs.fallback === 'stop'
        && prefs.contextLimit === 'conservative' && prefs.budget === 'efficient';
    }, null, { timeout: 10000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(window.OVYXAIStorageKey()) || '{}'));
    assert.equal(saved.provider, 'anthropic');
    assert.equal(saved.model, 'claude-opus-5');
    assert.equal(saved.routing, 'preferred-first');
    assert.equal(saved.fallback, 'stop');
    assert.equal(saved.contextLimit, 'conservative');
    assert.equal(saved.budget, 'efficient');

    // Reset should remove the stored override and return visible controls to defaults.
    await page.locator('#set-ai-reset').click();
    await page.waitForFunction(() => {
      const key = window.OVYXAIStorageKey();
      return localStorage.getItem(key) === null
        && document.querySelector('#set-provider')?.value === 'gemini'
        && document.querySelector('#set-ai-routing')?.value === 'automatic'
        && document.querySelector('#set-ai-fallback')?.value === 'next'
        && document.querySelector('#set-ai-context-limit')?.value === 'automatic'
        && document.querySelector('#set-ai-budget')?.value === 'automatic';
    }, null, { timeout: 10000 });
    assert.equal(await page.locator('#set-ai-model').inputValue(), 'automatic');

    assert.deepEqual(errors.filter(message => /AI|settings|ReferenceError/i.test(message)), [],
      '[' + target.name + '] AI preferences must not throw Settings errors.');
    await context.close();
  }
  console.log('OVYX AI Preferences Save/Reset browser checks passed on desktop and mobile Chromium.');
} finally {
  await browser.close();
}
