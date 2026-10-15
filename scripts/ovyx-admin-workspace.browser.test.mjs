import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport });
    page.setDefaultTimeout(15000);
    page.on('console', message => console.log('[' + target.name + ' browser console] ' + message.type() + ': ' + message.text()));

    await installOwnerBrowserApiFixtures(page);

    let entitlementCalls = 0;
    await page.route('**/api/entitlements', async route => {
      entitlementCalls += 1;
      const authorization = String(route.request().headers().authorization || '');
      const isRoot = authorization === 'Bearer ovyx-admin-root-test-token';
      const body = isRoot
        ? {
            ok: true, uid: 'ovyx-admin-root-fixture', email: 'ovyxsupportteam@gmail.com',
            role: 'ROOT_SUPERUSER', owner: true, admin: true, bypass: true, isRoot: true,
            planTier: 'root', planTierState: 'active', capabilities: {},
            entitlements: { role: 'ROOT_SUPERUSER', owner: true, admin: true, bypass: true },
          }
        : {
            ok: true, uid: 'ovyx-admin-free-fixture', email: 'ovyxsupportteam@gmail.com',
            role: 'FREE_USER', owner: false, admin: false, bypass: false, isRoot: false,
            planTier: 'free', planTierState: 'free', capabilities: {},
            entitlements: { role: 'FREE_USER', owner: false, admin: false, bypass: false },
          };
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX shell returned an HTTP error');
    await page.waitForFunction(() => !!window.OVYXAdminWorkspace, null, { timeout: 45000 });
    // Let the real Firebase loader finish before installing the isolated auth fixture;
    // otherwise a late SDK load can overwrite the mock and make this test flaky.
    await page.waitForFunction(() => typeof window.__OVYX_FIREBASE_READY__ === 'boolean', null, { timeout: 15000 });

    await page.evaluate(() => {
      const listeners = new Set();
      const root = { uid: 'ovyx-admin-root-fixture', email: 'ovyxsupportteam@gmail.com', getIdToken: async () => 'ovyx-admin-root-test-token' };
      const free = { uid: 'ovyx-admin-free-fixture', email: 'ovyxsupportteam@gmail.com', getIdToken: async () => 'ovyx-admin-free-test-token' };
      const auth = {
        currentUser: root,
        onAuthStateChanged(callback) {
          listeners.add(callback);
          queueMicrotask(() => callback(auth.currentUser));
          return () => listeners.delete(callback);
        },
      };
      window.firebase = { auth: () => auth };
      window.__setOVYXAdminTestIdentity = mode => {
        auth.currentUser = mode === 'root' ? root : mode === 'free' ? free : null;
        for (const callback of listeners) callback(auth.currentUser);
        window.dispatchEvent(new Event('firebase-auth-state-ready'));
      };
      window.__setOVYXAdminTestIdentity('root');
    });

    const refreshResult = await page.evaluate(() => window.OVYXAdminWorkspace.refresh());
    console.log('[' + target.name + '] admin auth fixture', JSON.stringify(await page.evaluate(() => ({
      authorized: window.OVYXAdminWorkspace.isAuthorized(),
      hasUser: !!window.firebase?.auth?.()?.currentUser,
      uid: window.firebase?.auth?.()?.currentUser?.uid || null,
      firebaseReady: window.__OVYX_FIREBASE_READY__,
    }))), 'refreshResult=' + refreshResult, 'entitlementCalls=' + entitlementCalls);
    await page.waitForFunction(() => window.OVYXAdminWorkspace.isAuthorized() === true);
    assert.ok(await page.locator('#' + 'ovyx-admin-workspace-entry-desktop').count(), '[' + target.name + '] desktop owner entry was not created');
    assert.ok(await page.locator('#ovyx-admin-workspace-entry-mobile').count(), '[' + target.name + '] mobile owner entry group was not created');
    assert.ok(await page.locator('#ovyx-admin-workspace-entry-mobile-button').count(), '[' + target.name + '] mobile owner action was not created');

    // Open the actual workspace, then verify every restored module and search behavior.
    const workspaceEntry = target.name === 'mobile' ? '#ovyx-admin-workspace-entry-mobile-button' : '#ovyx-admin-workspace-entry-desktop';
    await page.locator(workspaceEntry).evaluate(button => button.click());
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-overview');
    const hub = page.locator('#ovyx-admin-workspace-hub');
    await hub.waitFor({ state: 'visible' });
    assert.equal(await hub.locator('[data-ovyx-admin-workspace-route]').count(), 9, '[' + target.name + '] Admin Workspace must list all nine existing modules');

    const expected = [
      ['admin-overview', 'System Overview'],
      ['admin-pricing', 'Pricing & Plans'],
      ['admin-users', 'Users & Roles'],
      ['admin-brain', 'AI Brain'],
      ['admin-identity', 'AI Identity'],
      ['admin-backend', 'Backend'],
      ['admin-telemetry', 'Telemetry'],
      ['admin-broadcasts', 'Broadcasts'],
      ['admin-template-hub', 'Template Matrix'],
    ];
    for (const [route, label] of expected) {
      const button = hub.locator('[data-ovyx-admin-workspace-route="' + route + '"]');
      assert.equal(await button.count(), 1, '[' + target.name + '] missing/duplicate module ' + route);
      assert.equal((await button.innerText()).includes(label), true, '[' + target.name + '] incorrect label for ' + route);
    }

    await hub.locator('#ovyx-admin-workspace-search-input').fill('template');
    assert.equal(await hub.locator('[data-ovyx-admin-workspace-route="admin-template-hub"]').isVisible(), true, '[' + target.name + '] template module should match search');
    assert.equal(await hub.locator('[data-ovyx-admin-workspace-route="admin-pricing"]').isVisible(), false, '[' + target.name + '] search must hide non-matching modules');
    await hub.locator('#ovyx-admin-workspace-search-input').fill('');

    // Exercise a real owner save through the routed API fixture and verify
    // that a fresh public catalog read updates the app-wide visible prices.
    await hub.locator('[data-ovyx-admin-workspace-route="admin-pricing"]').evaluate(button => button.click());
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-pricing');
    await page.locator('#ovyx-global-quota-panel').waitFor({ state: 'attached' });
    await page.locator('#adm-pro-ngn').fill('36000');
    await page.locator('#adm-pro-usd').fill('21');
    await page.locator('#ovyx-quota-tokens-pro').fill('600000');
    await page.locator('#ovyx-quota-daily-pro').fill('25');
    await page.locator('#ovyx-global-quota-save').click();
    await page.waitForFunction(() => /Saved globally/.test(document.getElementById('ovyx-global-quota-status')?.textContent || ''), null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => Number(window.OVYXPlanCatalog?.pricing?.pro?.ngn)), 36000,
      '[' + target.name + '] a saved Pro price must be reflected in the server catalog');
    assert.equal(await page.evaluate(() => Number(window.OVYXPlanCatalog?.pricing?.pro?.usd)), 21,
      '[' + target.name + '] public catalog refresh must propagate USD pricing too');
    assert.equal(await page.evaluate(() => Number(window.OVYXPlanCatalog?.tokenQuotas?.pro)), 600000,
      '[' + target.name + '] saved monthly quota should be read back from the catalog');
    await page.evaluate(() => window.OvyxCurrencyEngine?.setCurrency?.('USD'));
    assert.equal(await page.locator('#price-pro-display').evaluate(node => node.textContent).catch(() => ''), '$21.00',
      '[' + target.name + '] the visible Pro price should update to the saved USD amount after selecting USD');

    await hub.locator('[data-ovyx-admin-workspace-route="admin-identity"]').evaluate(button => button.click());
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-identity');
    await page.locator('#ovyx-global-identity-editor').waitFor({ state: 'attached' });
    await page.locator('#ovyx-global-ai-name').fill('OVYX Browser Fixture AI');
    await page.locator('#ovyx-global-ai-persona').fill('Be friendly and professionally helpful in the isolated browser test.');
    await page.locator('#ovyx-global-ai-save').click();
    await page.waitForFunction(() => /Saved globally/.test(document.getElementById('ovyx-global-ai-status')?.textContent || ''), null, { timeout: 20000 });

    await hub.locator('[data-ovyx-admin-workspace-route="admin-template-hub"]').evaluate(button => button.click());
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-template-hub');
    await page.locator('#view-admin-template-hub [data-ovyx-admin-workspace-back]').waitFor({ state: 'visible' });
    await page.locator('#view-admin-template-hub [data-ovyx-admin-workspace-back]').evaluate(button => button.click());
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-overview');
    assert.equal(await page.locator('#ovyx-admin-workspace-hub').count(), 1, '[' + target.name + '] hub must not duplicate after route changes');

    // A signed-in account, even one whose visible email looks like the owner,
    // must lose the admin entry when the server does not authorize ROOT_SUPERUSER.
    await page.evaluate(() => window.__setOVYXAdminTestIdentity('free'));
    await page.waitForFunction(() => window.OVYXAdminWorkspace.isAuthorized() === false);
    await page.waitForFunction(() => !document.getElementById('ovyx-admin-workspace-entry-desktop') && !document.getElementById('ovyx-admin-workspace-entry-mobile') && !document.getElementById('ovyx-admin-workspace-hub'));
    assert.equal(await page.locator('#ovyx-admin-workspace-entry-desktop').count(), 0, '[' + target.name + '] admin entry must be removed for non-root role');
    assert.equal(await page.locator('#ovyx-admin-workspace-hub').count(), 0, '[' + target.name + '] admin hub must be removed for non-root role');

    await page.close();
  }
  console.log('OVYX Admin Workspace browser tests passed in desktop and mobile Chromium: root-only entry, nine module routes, search, navigation, no duplicate hub, and fail-closed non-root state.');
} finally {
  await browser.close();
}
