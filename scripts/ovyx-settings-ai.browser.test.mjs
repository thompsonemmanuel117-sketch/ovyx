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
    const gatewayRequests = [];
    page.on('pageerror', error => {
      if (/Settings|OVYXAI|secureGenerate|ReferenceError/i.test(error.message)) pageErrors.push(error.message);
    });

    // Seed the prior device-only preference document before any OVYX
    // scripts run, just as it would exist for a returning account after deploy.
    await page.addInitScript(() => {
      localStorage.setItem('ovyx.ai.preferences.v1.user.settings-ai-browser-user', JSON.stringify({
        mode: 'fast',
        provider: 'deepseek',
        model: 'automatic',
        routing: 'automatic',
        fallback: 'next',
        contextLimit: 'automatic',
        budget: 'automatic',
      }));
    });
    await installOwnerBrowserApiFixtures(page, {
      initialUser: {
        uid: 'settings-ai-browser-user',
        email: 'settings-ai-browser@example.test',
        token: 'settings-ai-browser-token',
      },
    });
    const aiPreferenceRequests = [];
    let failNextPreferencePut = false;
    let serverUpdatedAt = null;
    let serverPreferences = {
      mode: 'balanced', model: 'automatic', provider: 'gemini',
      explain: true, preserve: true, confirmDestructive: false,
      contextFiles: true, contextPage: true, contextGithub: true,
      routing: 'automatic', fallback: 'next', contextLimit: 'automatic', budget: 'automatic',
    };
    await page.route('**/api/settings/ai', async route => {
      const request = route.request();
      const body = request.method() === 'PUT' ? request.postDataJSON() : null;
      aiPreferenceRequests.push({
        method: request.method(),
        authorization: (await request.allHeaders()).authorization || '',
        body,
      });
      if (request.method() === 'PUT' && failNextPreferencePut) {
        failNextPreferencePut = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, code: 'AI_PREFERENCES_WRITE_UNCONFIRMED', message: 'Test server could not confirm preferences.' }),
        });
        return;
      }
      if (request.method() === 'PUT') {
        serverPreferences = { ...serverPreferences, ...(body?.preferences || {}) };
        serverUpdatedAt = '2026-10-24T05:00:00.000Z';
      }
      await route.fulfill({
        status: request.method() === 'GET' || request.method() === 'PUT' ? 200 : 405,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify({
          ok: true,
          preferences: serverPreferences,
          updatedAt: serverUpdatedAt,
          authority: 'SERVER',
          scope: 'account',
        }),
      });
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
    await page.route('**/api/ai/gateway', async route => {
      gatewayRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          text: 'Mock gateway response for Settings preferences verification.',
          provider: 'openai',
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
    // Wait for the authenticated account to be installed before opening settings.
    await page.waitForFunction(
      () => window.firebase?.auth?.().currentUser?.uid === 'settings-ai-browser-user',
      null,
      { timeout: 10000 },
    );
    await page.evaluate(() => window.OVYXSettings.show('ai'));
    const panel = page.locator('[data-settings-panel="ai"]');
    await panel.locator('#set-ai-save').waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => document.getElementById('ovyx-ai-preference-status')?.textContent?.includes('AI preferences loaded from your OVYX account.'),
      null,
      { timeout: 10000 },
    );
    assert.equal(serverPreferences.mode, 'fast', '[' + target.name + '] legacy local preferences must migrate when the account has no saved preferences.');
    assert.equal(serverPreferences.provider, 'deepseek', '[' + target.name + '] migration must preserve the account user’s existing local provider preference.');
    assert.ok(aiPreferenceRequests.some(request => request.method === 'PUT'), '[' + target.name + '] legacy migration must create the account-scoped preference document.');

    const key = await page.evaluate(() => window.OVYXAIStorageKey());
    await page.evaluate(key => localStorage.removeItem(key), key);
    const refreshPreferences = page.waitForResponse(response =>
      response.url().includes('/api/settings/ai') && response.request().method() === 'GET');
    await page.evaluate(() => window.OVYXSettings.show('ai'));
    await refreshPreferences;
    await page.waitForFunction(
      () => document.getElementById('ovyx-ai-preference-status')?.textContent?.includes('AI preferences loaded from your OVYX account.'),
      null,
      { timeout: 10000 },
    );
    await panel.locator('[data-ai-mode="quality"]').waitFor({ state: 'visible' });
    await panel.locator('[data-ai-mode="quality"]').click();
    await page.waitForFunction(
      () => document.querySelector('[data-settings-panel="ai"] [data-ai-mode="quality"]')?.getAttribute('aria-pressed') === 'true',
      null,
      { timeout: 5000 },
    );
    await panel.locator('#set-provider').selectOption('openai');
    await panel.locator('#set-ai-model').selectOption('automatic');
    await panel.locator('details.ovyx-ai-advanced summary').click();
    await panel.locator('#set-ai-routing').selectOption('preferred-first');
    await panel.locator('#set-ai-fallback').selectOption('stop');
    await panel.locator('#set-ai-context-limit').selectOption('conservative');
    await panel.locator('#set-ai-budget').selectOption('maximum');
    await panel.locator('[data-ai-pref="contextPage"]').setChecked(false);
    await panel.locator('[data-ai-pref="contextGithub"]').setChecked(false);
    const modeBeforeSave = await page.evaluate(() => ({
      selected: document.querySelector('[data-settings-panel="ai"] [data-ai-mode].selected')?.dataset?.aiMode || null,
      pressed: document.querySelector('[data-settings-panel="ai"] [data-ai-mode="quality"]')?.getAttribute('aria-pressed') || null,
      allModes: Array.from(document.querySelectorAll('[data-settings-panel="ai"] [data-ai-mode]')).map(button => ({
        mode: button.dataset.aiMode, selected: button.classList.contains('selected'), pressed: button.getAttribute('aria-pressed')
      })),
      status: document.getElementById('ovyx-ai-preference-status')?.textContent || '',
      globalMode: window.OVYXAI?.mode || null,
      stored: localStorage.getItem(window.OVYXAIStorageKey?.() || '') || null
    }));
    console.log('[OVYX AI mode before save]', target.name, JSON.stringify(modeBeforeSave));

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
    assert.equal(saved.preferences.fallback, 'stop');
    assert.equal(saved.preferences.contextLimit, 'conservative');
    assert.equal(saved.preferences.budget, 'maximum');
    assert.equal(saved.preferences.contextPage, false);
    assert.equal(saved.preferences.contextGithub, false);
    const serverSave = aiPreferenceRequests.filter(request => request.method === 'PUT').at(-1);
    assert.ok(serverSave, '[' + target.name + '] Save must reach the authenticated account AI-preference endpoint.');
    assert.equal(serverSave.authorization, 'Bearer settings-ai-browser-token');
    assert.deepEqual(serverSave.body.preferences, saved.preferences);
    assert.equal(serverPreferences.provider, 'openai');
    assert.equal(serverPreferences.routing, 'preferred-first');

    // Exercise the wrapped real AI service. The test intercepts the final HTTP
    // boundary, so it can distinguish saved preferences from UI/localStorage-only behavior.
    const generation = await page.evaluate(async () => {
      try {
        const result = await window.OVYXAIService.generate({
          mode: 'assistant',
          prompt: 'Confirm the active generation preferences.',
          // No per-request provider is chosen here; account preferences must
          // supply the preference without making it an exclusive provider call.
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
    assert.equal(sent.fallback, 'stop',
      '[' + target.name + '] fallback policy must reach the authenticated AI backend.');
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

    // Explicit provider choice must remain exclusive, while shared preferences
    // for routing, fallback, mode and budget still travel to the gateway route.
    const gatewayGeneration = await page.evaluate(async () => {
      try {
        const result = await window.OVYXAIService.generate({
          mode: 'assistant',
          prompt: 'Confirm explicit-provider preferences.',
          provider: 'openai',
          model: 'automatic',
        });
        return { ok: true, result };
      } catch (error) {
        return { ok: false, message: String(error?.message || error) };
      }
    });
    assert.equal(gatewayGeneration.ok, true, '[' + target.name + '] mocked gateway request should complete: ' + gatewayGeneration.message);
    assert.equal(gatewayRequests.length, 1, '[' + target.name + '] explicit provider choice must use the gateway route.');
    assert.equal(gatewayRequests[0].provider, 'openai');
    assert.equal(gatewayRequests[0].providerRouting, 'preferred-first');
    assert.equal(gatewayRequests[0].fallback, 'stop');
    assert.equal(gatewayRequests[0].model, 'automatic');
    assert.equal(gatewayRequests[0].maxTokens, 16000);
    assert.match(gatewayRequests[0].system, /prioritize thoroughness/i);

    // Reset must remove the stored override once and restore the real UI defaults.
    await page.evaluate(key => {
      const original = Storage.prototype.removeItem;
      window.__settingsAIRemoveCount = 0;
      Storage.prototype.removeItem = function (name) {
        if (String(name) === key) window.__settingsAIRemoveCount += 1;
        return original.call(this, name);
      };
    }, key);
    const resetResponse = page.waitForResponse(response =>
      response.url().includes('/api/settings/ai') && response.request().method() === 'PUT');
    await page.locator('[data-settings-panel="ai"] #set-ai-reset').click();
    const resetResponseResult = await resetResponse;
    assert.equal(resetResponseResult.status(), 200, '[' + target.name + '] Reset must persist defaults to the server.');
    await page.waitForFunction(
      () => document.querySelector('[data-settings-panel="ai"] #set-ai-routing')?.value === 'automatic'
        && document.querySelector('[data-settings-panel="ai"] #set-ai-model')?.value === 'automatic'
        && document.querySelector('[data-settings-panel="ai"] #set-provider')?.value === 'gemini',
      null,
      { timeout: 10000 },
    );
    const reset = await page.evaluate(key => ({
      stored: JSON.parse(localStorage.getItem(key) || '{}'),
      removes: window.__settingsAIRemoveCount,
    }), key);
    assert.equal(reset.stored.provider, 'gemini', '[' + target.name + '] Reset must persist server-confirmed defaults locally.');
    assert.equal(reset.stored.model, 'automatic');
    assert.equal(reset.stored.routing, 'automatic');
    assert.equal(reset.removes, 0, '[' + target.name + '] an account-backed Reset must save verified defaults rather than only deleting local state.');
    assert.equal(serverPreferences.provider, 'gemini', '[' + target.name + '] Reset must update the account preferences at the server boundary.');
    assert.equal(serverPreferences.routing, 'automatic');
    assert.equal(serverPreferences.fallback, 'next');

    // A failed write must not be reported as saved or optimistically replace
    // the last server-confirmed local preferences.
    await panel.locator('#set-provider').selectOption('openai');
    failNextPreferencePut = true;
    await panel.locator('#set-ai-save').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-ai-preference-status')?.textContent?.includes('not confirmed as saved'),
      null,
      { timeout: 10000 },
    );
    const afterFailedSave = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), key);
    assert.equal(afterFailedSave.provider, 'gemini', '[' + target.name + '] A failed account save must keep the last confirmed local preferences.');
    assert.equal(serverPreferences.provider, 'gemini', '[' + target.name + '] A failed account save must not mutate server preferences.');
    assert.deepEqual(pageErrors, [], '[' + target.name + '] AI Preferences should not throw browser errors.');
    await context.close();
  }
  console.log('OVYX AI Preferences browser tests passed on desktop and mobile: one Save/Reset action, saved provider/model/routing/context/budget values propagated to the real AI request boundary, context exclusions and conservative limit verified.');
} finally {
  await browser.close();
}
