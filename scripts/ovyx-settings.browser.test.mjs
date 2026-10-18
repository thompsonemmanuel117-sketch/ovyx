import assert from 'node:assert/strict';
import { chromium } from 'playwright';

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
    const settingsErrors = [];
    page.on('pageerror', error => {
      if (/renderDataLayer|OVYXDataLayerSettings|ovyx-data-(?:endpoint|sync|test|save|schema)|dbCfg/i.test(error.message)) {
        settingsErrors.push(error.message);
      }
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app did not load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && !!window.OVYXDataLayerSettings,
      null,
      { timeout: 45000 },
    );

    await waitForRouteRestore(page);
    await page.evaluate(() => window.Router.go('settings'));
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'settings', null, { timeout: 15000 });
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    const layer = page.locator('#ovyx-data-layer-panel');
    await layer.waitFor({ state: 'visible' });

    const initialCopy = await layer.innerText();
    assert.match(initialCopy, /does not create databases or run migrations automatically/i, '[' + target.name + '] must not imply OVYX provisions PostgreSQL.');
    assert.match(initialCopy, /Health check only/i, '[' + target.name + '] must explain the actual test scope.');
    assert.match(initialCopy, /Download SQL schema creates a starter file on this device/i);
    assert.doesNotMatch(initialCopy, /Production-ready relational storage/i);

    // Missing configuration should produce a useful status without making a network request.
    await page.locator('#ovyx-data-test').click();
    assert.equal(
      (await page.locator('#ovyx-data-result').innerText()).trim(),
      'Add your secure data API endpoint first.',
      '[' + target.name + '] an empty endpoint must be handled clearly.',
    );

    const endpoint = 'https://data-api.example.test/api/data';
    await page.locator('#ovyx-data-endpoint').fill(endpoint);
    await page.locator('#ovyx-data-save').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}'));
    assert.equal(saved.endpoint, endpoint, '[' + target.name + '] external endpoint preference must be saved locally.');

    // Add a cookie for the external endpoint. The health test must deliberately omit it.
    await context.addCookies([{
      name: 'third_party_session',
      value: 'must-not-be-sent',
      url: 'https://data-api.example.test',
      sameSite: 'None',
      secure: true,
    }]);
    const healthRequests = [];
    await page.route('https://data-api.example.test/api/data/health', async route => {
      const request = route.request();
      healthRequests.push({
        method: request.method(),
        url: request.url(),
        headers: await request.allHeaders(),
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
        body: JSON.stringify({ ok: true, database: 'PostgreSQL' }),
      });
    });

    await page.locator('#ovyx-data-test').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-data-result')?.textContent?.includes('Service check completed successfully'),
      null,
      { timeout: 20000 },
    );
    assert.equal(healthRequests.length, 1, '[' + target.name + '] Test API must make exactly one request in this interaction.');
    assert.equal(healthRequests[0].method, 'GET', '[' + target.name + '] Test API should only make the documented health GET.');
    assert.equal(healthRequests[0].url, endpoint + '/health');
    assert.equal(healthRequests[0].headers.cookie, undefined, '[' + target.name + '] external endpoint cookies must not be sent.');
    const resultText = await page.locator('#ovyx-data-result').innerText();
    assert.match(resultText, /Service check completed successfully/i);
    assert.match(resultText, /This check confirms only that the service responds/i);
    assert.match(resultText, /does not verify data storage or app data operations/i,
      '[' + target.name + '] a health response must not claim database/CRUD verification.');
    assert.doesNotMatch(resultText, /backend-reported database|PostgreSQL/i,
      '[' + target.name + '] a health response must not imply the database vendor or CRUD operations were verified.');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#ovyx-data-schema').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'ovyx-postgresql-schema.sql',
      '[' + target.name + '] schema button should download the starter schema file.');

    const sync = page.locator('#ovyx-data-sync');
    await sync.click();
    assert.equal(await sync.getAttribute('aria-checked'), 'false',
      '[' + target.name + '] sync switch should reflect the off state after clicking.');
    const afterToggle = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}'));
    assert.equal(afterToggle.projectSync, false, '[' + target.name + '] sync switch should persist its state locally.');

    // Reopening the panel must not duplicate its injected container or lose settings.
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    await page.locator('#ovyx-data-endpoint').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ovyx-data-layer-panel').count(), 1,
      '[' + target.name + '] the injected Data Layer panel must not duplicate.');
    assert.equal(await page.locator('#ovyx-data-endpoint').inputValue(), endpoint);
    assert.equal(await page.locator('#ovyx-data-sync').getAttribute('aria-checked'), 'false');

    // Verify local persistence across an actual page reload as well.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => document.readyState === 'complete'
        && typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && !!window.OVYXDataLayerSettings,
      null,
      { timeout: 45000 },
    );
    // This assertion checks local preference persistence after reload; it does
    // not need the unrelated app-wide last-view restoration to equal Settings.
    // Wait for pageshow/late route guards to settle, then explicitly open Settings.
    await page.waitForTimeout(400);
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    await page.locator('#ovyx-data-endpoint').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ovyx-data-endpoint').inputValue(), endpoint);
    const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}'));
    assert.equal(afterReload.projectSync, false);

    // Exercise Appearance preview, save, cancel, and reset through the rendered UI.
    // Seed a known persisted baseline and reload so ThemeContext starts from that state.
    await page.evaluate(() => {
      const dark = {
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
      localStorage.setItem('ovyx-theme', JSON.stringify(dark));
      localStorage.setItem('ovyx.appearance.v3', JSON.stringify({ mode: 'dark', density: 'balanced', scale: 'balanced', motion: 'full' }));
      // Make the app's late route-restoration controller reopen Settings on reload.
      // Otherwise it can validly restore Home while this test expects Settings.
      localStorage.setItem('ovyx.runtime.route.v18', 'settings');
      localStorage.setItem('ovyx.settings.last-view.v1', 'settings');
      // The boot hint prioritizes the current session record. Seed all route
      // sources consistently so this reload tests Settings, not stale Home/Studio.
      const session = JSON.parse(localStorage.getItem('ovyx.runtime.session.v4') || '{}');
      localStorage.setItem('ovyx.runtime.session.v4', JSON.stringify({ ...session, route: 'settings' }));
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function' && typeof window.OVYXSettings?.show === 'function',
      null,
      { timeout: 45000 },
    );
    // The app may legitimately calculate a different boot hint during pageshow;
    // the test's assertions concern Settings persistence, not that global hint.
    // Wait for its late restoration pass to settle, then navigate directly.
    await page.waitForTimeout(400);
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    const appearance = page.locator('[data-settings-panel="appearance"]');
    await appearance.waitFor({ state: 'visible' });
    await appearance.locator('[data-appearance-save]').waitFor({ state: 'visible' });
    await appearance.locator('[data-appearance-cancel]').waitFor({ state: 'visible' });

    const initialSavedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(initialSavedTheme.mode, 'dark', '[' + target.name + '] Appearance test baseline must be dark.');
    await appearance.locator('[data-mode="light"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.ovyxAppearanceMode === 'light');
    let savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'dark', '[' + target.name + '] selecting Light must preview without persisting before Save.');

    await appearance.locator('#set-density').selectOption('compact');
    await page.waitForFunction(() => window.ThemeContext?.get?.().density === 'compact');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.density, 'balanced', '[' + target.name + '] density changes must remain a preview until Save.');

    await appearance.locator('[data-appearance-cancel]').click();
    await page.waitForFunction(() => document.documentElement.dataset.ovyxAppearanceMode === 'dark'
      && window.ThemeContext?.get?.().density === 'balanced');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'dark', '[' + target.name + '] Cancel must retain the saved mode.');
    assert.equal(savedTheme.density, 'balanced', '[' + target.name + '] Cancel must retain saved density.');

    await appearance.locator('[data-mode="light"]').click();
    await appearance.locator('[data-appearance-save]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}').mode === 'light');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'light', '[' + target.name + '] Save Appearance must persist selected mode.');

    await page.evaluate(() => window.OVYXSettings.show('privacy'));
    const privacy = page.locator('[data-settings-panel="privacy"]');
    await privacy.locator('[data-clear-appearance]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}').mode === 'dark');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'dark', '[' + target.name + '] Privacy reset must restore the dark appearance baseline.');
    assert.equal(savedTheme.density, 'balanced', '[' + target.name + '] Privacy reset must restore balanced density.');
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('ovyx.appearance.v3'))).mode, 'dark',
      '[' + target.name + '] Privacy reset must update the legacy appearance mirror too.');


    // Notifications must show only the current account-backed control set.
    await page.evaluate(() => window.OVYXSettings.show('notifications'));
    const notifications = page.locator('[data-settings-panel="notifications"]');
    await page.waitForFunction(() => {
      const p = document.querySelector('[data-settings-panel="notifications"]');
      return !!p && !!p.querySelector('#notify-save')
        && p.querySelectorAll('[data-notify]').length === 8
        && !p.querySelector('#set-notify-build');
    });
    assert.equal(await notifications.locator('[data-notify]').count(), 8,
      '[' + target.name + '] the old 3-switch notification panel must not appear alongside the new 8 preferences.');
    assert.equal(await notifications.locator('#set-notify-build, #set-notify-fail, #set-notify-usage').count(), 0,
      '[' + target.name + '] legacy notification controls must be removed from the rendered panel.');
    const notificationCopy = await notifications.innerText();
    assert.match(notificationCopy, /EMAIL \(PREFERENCES ONLY\)/i);
    assert.equal((notificationCopy.match(/this panel does not send email\./gi) || []).length, 2,
      '[' + target.name + '] both email preference switches must explain that they do not send email.');

    // When the optional server-connection card is mounted, verify its labels. The source contract is also guarded in npm test.
    const hasConnectionCard = await page.evaluate(() => !!window.OVYXConnections && !!document.getElementById('ovyx-cloudflare-status'));
    if (hasConnectionCard) {
      const connectionLabels = await page.evaluate(() => {
        const status = document.getElementById('ovyx-cloudflare-status');
        const values = [];
        for (const state of ['unknown', 'available', 'auth_required', 'unavailable', 'connected']) {
          window.OVYXConnections.cloudflare = { server: true, status: state };
          window.OVYXConnections.render();
          values.push(status.textContent.trim());
        }
        return values;
      });
      assert.deepEqual(connectionLabels, ['NOT VERIFIED', 'AVAILABLE', 'AUTH REQUIRED', 'UNAVAILABLE', 'CONNECTED · SERVER'],
        '[' + target.name + '] Cloudflare state labels must never claim connected for unknown/unavailable state.');
    }

    // Verify that server quota refreshes on Usage panel entry and that failures remain honest/recoverable.
    await page.evaluate(() => {
      const user = {
        uid: 'settings-balance-e2e',
        email: 'settings-balance-e2e@example.test',
        async getIdToken() { return 'test-only-browser-token'; },
      };
      const auth = () => ({ currentUser: user });
      const firebaseStub = window.firebase || {};
      try { Object.defineProperty(firebaseStub, 'auth', { configurable: true, enumerable: true, writable: true, value: auth }); }
      catch (_) { firebaseStub.auth = auth; }
      try { Object.defineProperty(window, 'firebase', { configurable: true, enumerable: true, writable: true, value: firebaseStub }); }
      catch (_) { window.firebase = firebaseStub; }
    });
    let balanceReply = {
      status: 200,
      body: { ok: true, monthlyLimit: 100, current_monthly_tokens: 80, baseRemaining: 80, boosterTokens: 11, daily_prompts_allowance: 4, plan: 'free' },
    };
    const balanceRequests = [];
    await page.route('**/api/tokens/balance', async route => {
      const request = route.request();
      balanceRequests.push({ method: request.method(), headers: await request.allHeaders() });
      await route.fulfill({
        status: balanceReply.status,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify(balanceReply.body),
      });
    });

    let beforeQuotaLoad = balanceRequests.length;
    await page.evaluate(() => window.OVYXSettings.show('usage'));
    await page.waitForFunction(() => document.getElementById('set-token-meter')?.textContent?.trim() === '20 used / 100');
    assert.ok(balanceRequests.length > beforeQuotaLoad, '[' + target.name + '] opening Usage must request server quota.');
    assert.ok(balanceRequests.every(r => r.method === 'GET' && r.headers.authorization === 'Bearer test-only-browser-token'),
      '[' + target.name + '] Usage quota refresh must be an authenticated GET.');
    assert.match(await page.locator('#ovyx-usage-server-detail').innerText(), /Remaining: 80 tokens/i);

    balanceReply = {
      status: 503,
      body: { ok: false, error: 'Simulated quota balance outage' },
    };
    await page.evaluate(() => window.OVYXSettings.show('privacy'));
    beforeQuotaLoad = balanceRequests.length;
    await page.evaluate(() => window.OVYXSettings.show('usage'));
    await page.waitForFunction(() => document.getElementById('set-token-meter')?.textContent?.trim() === 'Usage unavailable');
    assert.ok(balanceRequests.length > beforeQuotaLoad, '[' + target.name + '] re-opening Usage must retry the server quota request.');
    assert.equal(await page.locator('#set-token-meter').getAttribute('title'), 'Simulated quota balance outage',
      '[' + target.name + '] quota failures must preserve an actionable error instead of showing a stale success value.');

    balanceReply = {
      status: 200,
      body: { ok: true, monthlyLimit: 100, current_monthly_tokens: 65, baseRemaining: 65, boosterTokens: 18, daily_prompts_allowance: 3, plan: 'free' },
    };
    await page.evaluate(() => window.OVYXSettings.show('privacy'));
    beforeQuotaLoad = balanceRequests.length;
    await page.evaluate(() => window.OVYXSettings.show('usage'));
    await page.waitForFunction(() => document.getElementById('set-token-meter')?.textContent?.trim() === '35 used / 100');
    assert.ok(balanceRequests.length > beforeQuotaLoad, '[' + target.name + '] Usage must recover when the server returns a valid quota again.');
    assert.match(await page.locator('#ovyx-usage-server-detail').innerText(), /Remaining: 65 tokens/i);

    await page.evaluate(() => window.OVYXSettings.show('boosters'));
    const boosters = page.locator('[data-settings-panel="boosters"]');
    await page.waitForFunction(() => !!document.querySelector('[data-settings-panel="boosters"] #ovyx-v65-booster-balance')
      && document.querySelectorAll('[data-settings-panel="boosters"] [data-boost-pack]').length === 3);
    const boosterCopy = await boosters.innerText();
    assert.match(boosterCopy, /Checkout requires sign-in and an available payment provider/i);
    assert.match(boosterCopy, /credited only after server verification/i);
    assert.equal(await boosters.locator('[data-boost-pack]').count(), 3,
      '[' + target.name + '] Starter, Builder and Studio purchase actions must all be rendered.');
    assert.doesNotMatch(boosterCopy, /future booster products/i);
    const balanceLabel = page.locator('#ovyx-v65-booster-balance');
    await page.waitForFunction(() => document.getElementById('ovyx-v65-booster-balance')?.textContent?.trim() === '18 extra tokens',
      null, { timeout: 15000 });
    assert.ok(balanceRequests.length > 0, '[' + target.name + '] opening Boosters after sign-in must refresh the existing panel balance.');
    assert.ok(balanceRequests.every(r => r.method === 'GET' && r.headers.authorization === 'Bearer test-only-browser-token'),
      '[' + target.name + '] Booster balance must use the authenticated balance endpoint.');

    balanceReply = {
      status: 200,
      body: { ok: true, monthlyLimit: 100, current_monthly_tokens: 63, baseRemaining: 63, boosterTokens: 42, daily_prompts_allowance: 3, plan: 'free' },
    };
    let beforeBalanceRefresh = balanceRequests.length;
    await boosters.locator('#ovyx-v65-booster-refresh').click();
    await page.waitForFunction(() => document.getElementById('ovyx-v65-booster-balance')?.textContent?.trim() === '42 extra tokens');
    assert.ok(balanceRequests.length > beforeBalanceRefresh, '[' + target.name + '] Refresh balance must issue a new server request.');
    assert.equal(await page.evaluate(() => window.TokenQuotaRegistry?.boosterTokens), 42,
      '[' + target.name + '] refreshed balance must update the shared quota meter state.');

    balanceReply = {
      status: 503,
      body: { ok: false, error: 'Simulated booster balance outage' },
    };
    beforeBalanceRefresh = balanceRequests.length;
    await boosters.locator('#ovyx-v65-booster-refresh').click();
    await page.waitForFunction(() => document.getElementById('ovyx-v65-booster-balance')?.textContent?.trim() === 'Balance unavailable');
    assert.ok(balanceRequests.length > beforeBalanceRefresh, '[' + target.name + '] failed balance refresh must still call the server.');
    assert.notEqual((await balanceLabel.innerText()).trim(), '0 extra tokens',
      '[' + target.name + '] a failed balance refresh must not turn an unknown balance into a false zero.');

    balanceReply = {
      status: 200,
      body: { ok: true, monthlyLimit: 100, current_monthly_tokens: 62, baseRemaining: 62, boosterTokens: 43, daily_prompts_allowance: 3, plan: 'free' },
    };
    beforeBalanceRefresh = balanceRequests.length;
    await boosters.locator('#ovyx-v65-booster-refresh').click();
    await page.waitForFunction(() => document.getElementById('ovyx-v65-booster-balance')?.textContent?.trim() === '43 extra tokens');
    assert.ok(balanceRequests.length > beforeBalanceRefresh, '[' + target.name + '] Refresh balance must recover after a service error.');

    // Open the checkout UI but never use a real payment provider: the API is mocked to fail.
    await boosters.locator('[data-boost-pack="starter"]').click();
    const boosterModal = page.locator('#ovyx-v65-booster-modal');
    await boosterModal.waitFor({ state: 'visible' });
    assert.match(await boosterModal.innerText(), /credited only after the payment provider confirms and the OVYX server verifies/i);
    await boosterModal.locator('[data-pack="builder"]').click();
    await boosterModal.locator('[data-currency]').selectOption('USD');
    await page.waitForFunction(() => document.querySelector('#ovyx-v65-booster-modal [data-provider]')?.value === 'paystack');
    assert.equal(await boosterModal.locator('[data-provider]').inputValue(), 'paystack');
    await page.waitForFunction(() => document.querySelector('#ovyx-v65-booster-modal [data-provider-note]')?.textContent?.includes('International USD checkout attempts the configured Paystack provider'));
    assert.match(await boosterModal.locator('[data-provider-note]').innerText(), /Availability is checked when you continue; errors stop the purchase/i);

    await page.evaluate(() => {
      const fakeUser = { uid: 'settings-booster-e2e', email: 'settings-booster@example.test', emailVerified: true, getIdToken: async () => 'test-only-browser-token' };
      try { Object.defineProperty(window, 'firebase', { configurable: true, writable: true, value: { auth: () => ({ currentUser: fakeUser }) } }); }
      catch (_) { window.firebase = { auth: () => ({ currentUser: fakeUser }) }; }
    });
    let paymentCreatePayload = null;
    await page.route('**/api/payments/create', async route => {
      paymentCreatePayload = route.request().postDataJSON();
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MOCKED_PROVIDER_UNAVAILABLE' }) });
    });
    await boosterModal.locator('[data-pay]').click();
    await page.waitForFunction(() => document.querySelector('#ovyx-v65-booster-modal [data-status]')?.textContent?.includes('MOCKED_PROVIDER_UNAVAILABLE'));
    assert.deepEqual(paymentCreatePayload, {
      productType: 'token_booster', productId: 'builder', currency: 'USD', provider: 'paystack',
    }, '[' + target.name + '] checkout must send the selected pack and server-controlled provider choice.');
    assert.equal(await boosterModal.locator('[data-pay]').isEnabled(), true,
      '[' + target.name + '] failed checkout initialization must re-enable the button for retry.');
    assert.doesNotMatch(await boosterModal.locator('[data-status]').innerText(), /Payment confirmed|tokens have been added/i,
      '[' + target.name + '] failed checkout must never claim the tokens were credited.');
    await boosterModal.locator('[data-close]').click();

    await page.evaluate(() => window.OVYXSettings.show('plan'));
    const planPanel = page.locator('[data-settings-panel="plan"]');
    // The Billing layer replaces the initial Plan shell asynchronously; test its final visible control.
    const upgradeToPro = await planPanel.locator('#ovyx-upgrade-btn').elementHandle();
    assert.ok(upgradeToPro, '[' + target.name + '] the final Billing action must render.');
    await page.evaluate(() => window.TokenQuotaRegistry?.renderMeter?.());
    assert.equal(await upgradeToPro.evaluate(element => element.isConnected), true,
      '[' + target.name + '] a quota refresh must not detach the visible Upgrade to Pro control.');
    await upgradeToPro.click();
    await page.waitForFunction(() => window.KernelState?.activeView === 'pricing', null, { timeout: 15000 });
    await page.locator('#view-pricing').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#view-pricing').getAttribute('aria-label'), 'OVYX Plans',
      '[' + target.name + '] Upgrade to Pro must navigate to the Plans view.');
    await page.evaluate(() => window.Router.go('settings'));
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'settings', null, { timeout: 15000 });
    await page.locator('#view-settings').waitFor({ state: 'visible' });

    // Clear the payment-only identity fixture before verifying signed-out Security state.
    await page.evaluate(() => {
      Object.defineProperty(window, 'firebase', { configurable: true, writable: true, value: { auth: () => ({ currentUser: null }) } });
    });

    await page.evaluate(() => window.OVYXSettings.show('security'));
    await page.waitForFunction(() => !!document.querySelector('[data-settings-panel="security"] #ovyx-revoke-all-devices'));
    const securityCopy = await page.locator('[data-settings-panel="security"]').innerText();
    assert.match(securityCopy, /Not signed in/i);
    assert.match(securityCopy, /No active authenticated session/i);
    assert.match(securityCopy, /INACTIVE/i);
    assert.doesNotMatch(securityCopy, /● Protected/i,
      '[' + target.name + '] signing out must not be shown as a protected/active session.');

    assert.deepEqual(settingsErrors, [], '[' + target.name + '] Settings controls should not throw browser errors.');
    await context.close();
  }
  console.log('OVYX Settings browser tests passed on desktop and mobile: Data Layer, Appearance, Notifications, connection/security statuses, and mocked Token Booster failure handling.');
} finally {
  await browser.close();
}
