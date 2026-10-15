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
    const pageErrors = [];
    const aiRequests = [];
    page.on('pageerror', error => {
      if (/Settings|OVYXAI|secureGenerate|ReferenceError/i.test(error.message)) pageErrors.push(error.message);
    });

    await installOwnerBrowserApiFixtures(page, {
      initialUser: {
        uid: 'settings-ai-browser-user',
        email: 'settings-ai-browser@example.test',
        token: 'settings-ai-browser-token',
      },
    });
    await page.route('**/api/ai/assistant', async route => {
      aiRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          text: 'Mock AI response for Settings preferences verification.',
          provider: 'gemini',
          model: 'mock-test-model',
        }),
      });
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app failed to load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && typeof window.OVYXAIService?.generate === 'function'
        && window.OVYXAIService.__ovyxSettingsPreferencesV1 === true,
      null,
      { timeout: 45000 },
    );
    await waitForRouteRestore(page);

    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('ai'));
    const panel = page.locator('[data-settings-panel="ai"]');
    await panel.locator('#set-ai-save').waitFor({ state: 'visible' });

    const key = await page.evaluate(() => window.OVYXAIStorageKey());
    await page.evaluate(key => localStorage.removeItem(key), key);
    await page.evaluate(() => window.OVYXSettings.show('ai'));
    await panel.locator('[data-ai-mode="quality"]').waitFor({ state: 'visible' });
    await panel.locator('[data-ai-mode="quality"]').click();
    await panel.locator('#set-provider').selectOption('openai');
    await panel.locator('#set-ai-model').selectOption('automatic');
    await panel.locator('details.ovyx-ai-advanced summary').click();
    await panel.locator('#set-ai-routing').selectOption('preferred-first');
    await panel.locator('#set-ai-fallback').selectOption('next');
    await panel.locator('#set-ai-context-limit').selectOption('conservative');
    await panel.locator('#set-ai-budget').selectOption('maximum');
    await panel.locator('[data-ai-pref="contextPage"]').setChecked(false);
    await panel.locator('[data-ai-pref="contextGithub"]').setChecked(false);

    // Count writes only after the individual controls have been set.
    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      window.__settingsAIKey = key;
      window.__settingsAIWriteCount = 0;
      Storage.prototype.setItem = function (name, value) {
        if (String(name) === window.__settingsAIKey) window.__settingsAIWriteCount += 1;
        return original.call(this, name, value);
      };
    }, key);
    await panel.locator('#set-ai-save').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-ai-preference-status')?.textContent?.includes('Preferences saved'),
      null,
      { timeout: 10000 },
    );
    const saved = await page.evaluate(key => ({
      preferences: JSON.parse(localStorage.getItem(key) || '{}'),
      writes: window.__settingsAIWriteCount,
    }), key);
    assert.equal(saved.writes, 1, '[' + target.name + '] one Save click must write the AI preferences key exactly once.');
    assert.equal(saved.preferences.mode, 'quality');
    assert.equal(saved.preferences.provider, 'openai');
    assert.equal(saved.preferences.model, 'automatic');
    assert.equal(saved.preferences.routing, 'preferred-first');
    assert.equal(saved.preferences.fallback, 'next');
    assert.equal(saved.preferences.contextLimit, 'conservative');
    assert.equal(saved.preferences.budget, 'maximum');
    assert.equal(saved.preferences.contextPage, false);
    assert.equal(saved.preferences.contextGithub, false);

    // Exercise the wrapped real AI service. The test intercepts the final HTTP
    // boundary, so it can distinguish saved preferences from UI/localStorage-only behavior.
    const generation = await page.evaluate(async () => {
      try {
        const result = await window.OVYXAIService.generate({
          mode: 'assistant',
          prompt: 'Confirm the active generation preferences.',
          provider: 'automatic',
          model: 'automatic',
          files: { 'src/main.js': 'x'.repeat(130000) },
          page: { id: 'settings-ai-page', name: 'Settings AI Test Page' },
          context: {
            currentPage: { id: 'settings-ai-page', name: 'Settings AI Test Page' },
            github: { repository: 'owner/private-test-repo' },
            activeView: 'home',
          },
        });
        return { ok: true, result };
      } catch (error) {
        return { ok: false, message: String(error?.message || error) };
      }
    });
    assert.equal(generation.ok, true, '[' + target.name + '] mocked AI request should complete: ' + generation.message);
    assert.equal(aiRequests.length, 1, '[' + target.name + '] one generation should make one assistant request.');
    const sent = aiRequests[0];
    assert.equal(sent.preferredProvider, 'openai',
      '[' + target.name + '] preferred provider must reach the authenticated AI backend, not remain local-only.');
    assert.equal(sent.providerRouting, 'preferred-first',
      '[' + target.name + '] model routing must reach the authenticated AI backend.');
    assert.equal(sent.model, 'automatic');
    assert.equal(sent.maxTokens, 16000,
      '[' + target.name + '] maximum budget must reach the AI backend in the request payload.');
    assert.match(sent.system, /prioritize thoroughness/i,
      '[' + target.name + '] Quality mode must affect the actual generation instructions.');
    assert.ok(sent.context?.files?.['src/main.js'], '[' + target.name + '] project files should be included when enabled.');
    assert.equal(sent.context.files['src/main.js'].length, 120000,
      '[' + target.name + '] conservative context limit should cap the file context.');
    assert.equal(sent.context.currentPage, undefined,
      '[' + target.name + '] disabled current-page context must be omitted from the request.');
    assert.equal(sent.context.github, undefined,
      '[' + target.name + '] disabled GitHub context must be omitted from the request.');

    // Reset must remove the stored override once and restore the real UI defaults.
    await page.evaluate(key => {
      const original = Storage.prototype.removeItem;
      window.__settingsAIRemoveCount = 0;
      Storage.prototype.removeItem = function (name) {
        if (String(name) === key) window.__settingsAIRemoveCount += 1;
        return original.call(this, name);
      };
    }, key);
    await page.locator('[data-settings-panel="ai"] #set-ai-reset').click();
    await page.waitForFunction(
      () => document.querySelector('[data-settings-panel="ai"] #set-ai-routing')?.value === 'automatic'
        && document.querySelector('[data-settings-panel="ai"] #set-ai-model')?.value === 'automatic'
        && document.querySelector('[data-settings-panel="ai"] #set-provider')?.value === 'gemini',
      null,
      { timeout: 10000 },
    );
    const reset = await page.evaluate(key => ({
      stored: localStorage.getItem(key),
      removes: window.__settingsAIRemoveCount,
    }), key);
    assert.equal(reset.stored, null, '[' + target.name + '] Reset must clear saved overrides.');
    assert.equal(reset.removes, 1, '[' + target.name + '] one Reset click must remove the preferences key exactly once.');
    assert.deepEqual(pageErrors, [], '[' + target.name + '] AI Preferences should not throw browser errors.');
    await context.close();
  }
  console.log('OVYX AI Preferences browser tests passed on desktop and mobile: one Save/Reset action, saved provider/model/routing/context/budget values propagated to the real AI request boundary, context exclusions and conservative limit verified.');
} finally {
  await browser.close();
}
