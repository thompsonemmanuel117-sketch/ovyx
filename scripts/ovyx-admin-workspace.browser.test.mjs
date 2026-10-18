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
    const scriptTrace = [];
    const scriptMimeErrors = [];
    const ownerApiWrites = [];
    page.on('dialog', dialog => dialog.accept());
    page.on('request', request => {
      const url = request.url();
      if (request.resourceType() === 'script' || /\.(?:m?js|tsx)(?:\?|$)/i.test(url)) {
        scriptTrace.push({ url, resourceType: request.resourceType(), status: null, contentType: '', failure: '' });
      }
      if (request.method() === 'POST') {
        try {
          const parsed = new URL(url);
          if (parsed.pathname.startsWith('/api/admin/')) {
            ownerApiWrites.push({ path: parsed.pathname, body: request.postDataJSON() || {} });
          }
        } catch (_) {}
      }
    });
    page.on('console', message => {
      const location = message.location();
      const messageText = message.text();
      console.log('[' + target.name + ' browser console] ' + message.type() + (location?.url ? ' [' + location.url + ':' + (location.lineNumber || 0) + ']' : '') + ': ' + messageText);
      if (/unsupported MIME type/i.test(messageText)) {
        scriptMimeErrors.push(messageText);
        setTimeout(() => console.log('[' + target.name + ' script MIME diagnostic] ' + JSON.stringify(scriptTrace.filter(item =>
          item.failure || item.status === null || item.status >= 400 || /text\/html/i.test(item.contentType)
        ).slice(-20))), 80);
      }
    });
    page.on('requestfailed', request => {
      const record = [...scriptTrace].reverse().find(item => item.url === request.url() && !item.failure);
      if (record) record.failure = String(request.failure()?.errorText || 'unknown network error');
      if (request.resourceType() === 'script' || /\.(?:m?js|tsx)(?:\?|$)/i.test(request.url())) {
        console.log('[' + target.name + ' script request failed] ' + request.url() + ': ' + String(request.failure()?.errorText || 'unknown network error'));
      }
    });
    page.on('response', response => {
      const url = response.url();
      const contentType = String(response.headers()['content-type'] || '').toLowerCase();
      const record = [...scriptTrace].reverse().find(item => item.url === url && item.status === null);
      if (record) {
        record.status = response.status();
        record.contentType = contentType;
      }
      const isScript = response.request().resourceType() === 'script';
      if (!isScript && !/\.(?:m?js|tsx)(?:\?|$)/i.test(url)) return;
      if (!response.ok() || contentType.includes('text/html') || (isScript && !/(?:javascript|ecmascript)/i.test(contentType))) {
        console.log('[' + target.name + ' script response issue] HTTP ' + response.status() + ' ' + url + ' content-type=' + contentType);
      }
    });

    await installOwnerBrowserApiFixtures(page, { initialUser: { uid: 'ovyx-admin-root-fixture', email: 'ovyxsupportteam@gmail.com', token: 'ovyx-admin-root-test-token' } });

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
    // The local Firebase facade is installed before app scripts run, so the
    // isolated auth state cannot race an external Firebase CDN load.
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
      ['admin-brain', 'AI services'],
      ['admin-identity', 'AI Identity'],
      ['admin-backend', 'Service health'],
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
    await page.waitForFunction(() => /Updated pricing and usage limits are ready/.test(document.getElementById('ovyx-global-quota-status')?.textContent || ''), null, { timeout: 20000 });
    assert.equal(await page.locator('#ovyx-global-plan-features').count(), 1,
      '[' + target.name + '] the pricing editor must expose real per-plan feature selectors');
    assert.equal(await page.locator('#ovyx-global-plan-features input[data-v655-plan="pro"][value="webStudio"]').isChecked(), true,
      '[' + target.name + '] initial Pro capabilities must load from the server plan catalog');
    await page.locator('#adm-pro-ngn').fill('36000');
    await page.locator('#adm-pro-usd').fill('21');
    await page.locator('#ovyx-quota-tokens-pro').fill('600000');
    await page.locator('#ovyx-quota-daily-pro').fill('25');
    await page.locator('#ovyx-global-quota-save').click();
    await page.waitForFunction(() => /Pricing and plan settings saved/.test(document.getElementById('ovyx-global-quota-status')?.textContent || ''), null, { timeout: 20000 });
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
    await page.waitForFunction(() => /Global AI identity saved/.test(document.getElementById('ovyx-global-ai-status')?.textContent || ''), null, { timeout: 20000 });

    // Confirm user plan assignment and quota reset issue real owner-authenticated writes.
    await hub.locator('[data-ovyx-admin-workspace-route="admin-users"]').evaluate(button => button.click());
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-users');
    await page.locator('#ovyx-owner-users-panel').waitFor({ state: 'attached' });
    await page.waitForFunction(() => /Loaded 1 account/.test(document.getElementById('ovyx-owner-users-status')?.textContent || ''), null, { timeout: 20000 });
    let accountRow = page.locator('#ovyx-owner-users-body tr').first();
    await accountRow.locator('select').first().selectOption('pro');
    await accountRow.locator('button').filter({ hasText: 'Apply plan' }).click();
    await page.waitForFunction(() => document.querySelector('#ovyx-owner-users-body tr select')?.value === 'pro', null, { timeout: 20000 });
    assert.ok(ownerApiWrites.some(item => item.path === '/api/admin/users' && item.body.action === 'setPlan' && item.body.plan === 'pro'),
      '[' + target.name + '] Apply plan must write the selected user assignment through the server API.');
    accountRow = page.locator('#ovyx-owner-users-body tr').first();
    await accountRow.locator('button').filter({ hasText: 'Reset quota' }).click();
    assert.ok(ownerApiWrites.some(item => item.path === '/api/admin/users' && item.body.action === 'resetQuota'),
      '[' + target.name + '] Reset quota must call the server-owned quota action.');

    // Confirm AI Brain routing writes are issued to the protected server API.
    await hub.locator('[data-ovyx-admin-workspace-route="admin-brain"]').evaluate(button => button.click());
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-brain');
    await page.locator('#ovyx-global-ai-routing').waitFor({ state: 'attached' });
    await page.waitForFunction(() => /Loaded AI selection order:/.test(document.getElementById('ovyx-global-ai-route-status')?.textContent || ''), null, { timeout: 20000 });
    await page.locator('[data-provider-priority="openai"]').selectOption('1');
    await page.locator('[data-provider-priority="gemini"]').selectOption('2');
    await page.locator('#ovyx-global-ai-route-save').click();
    await page.waitForFunction(() => /AI selection preferences saved/.test(document.getElementById('ovyx-global-ai-route-status')?.textContent || ''), null, { timeout: 20000 });
    assert.ok(ownerApiWrites.some(item => item.path === '/api/admin/ai-config' && item.body.providerOrder?.[0] === 'openai'),
      '[' + target.name + '] AI Brain provider order must be saved via the protected server route.');

    // Confirm overview, backend and telemetry use live HTTP response measurements.
    await hub.locator('[data-ovyx-admin-workspace-route="admin-overview"]').evaluate(button => button.click());
    await page.locator('#ovyx-owner-live-overview').waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.querySelectorAll('#ovyx-owner-overview-cards .ovyx-owner-live-card').length >= 4, null, { timeout: 20000 });
    await hub.locator('[data-ovyx-admin-workspace-route="admin-backend"]').evaluate(button => button.click());
    await page.locator('#ovyx-owner-backend-live-checks').waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.querySelectorAll('#ovyx-owner-backend-cards .ovyx-owner-live-card').length >= 4, null, { timeout: 20000 });
    await hub.locator('[data-ovyx-admin-workspace-route="admin-telemetry"]').evaluate(button => button.click());
    await page.locator('#ovyx-owner-telemetry-note').waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.querySelectorAll('#telemetry-cards-grid .v0-card').length >= 4, null, { timeout: 20000 });
    // Confirm that global in-app broadcasts can be published and withdrawn.
    await hub.locator('[data-ovyx-admin-workspace-route="admin-broadcasts"]').evaluate(button => button.click());
    await page.locator('#ovyx-global-broadcast-registry').waitFor({ state: 'attached' });
    await page.locator('#v34-broadcast-title').fill('Owner browser test announcement');
    await page.locator('#v34-broadcast-body').fill('A global message from the automated Owner Tools test.');
    await page.locator('#v34-broadcast-category').selectOption('product');
    await page.locator('#v34-broadcast-publish').click();
    await page.waitForFunction(() => /Announcement published to signed-in OVYX users/.test(document.getElementById('v34-broadcast-status')?.textContent || ''), null, { timeout: 20000 });
    assert.ok(ownerApiWrites.some(item => item.path === '/api/admin/broadcasts' && item.body.message === 'A global message from the automated Owner Tools test.'),
      '[' + target.name + '] Broadcast publish must use the protected server route.');
    await page.locator('#ovyx-global-broadcast-refresh').click();
    await page.locator('#ovyx-global-broadcast-list [data-withdraw-broadcast]').waitFor({ state: 'attached' });
    await page.locator('#ovyx-global-broadcast-list [data-withdraw-broadcast]').click();
    await page.waitForFunction(() => /Loaded 0 active announcement/.test(document.getElementById('ovyx-global-broadcast-status')?.textContent || ''), null, { timeout: 20000 });
    assert.ok(ownerApiWrites.some(item => item.path === '/api/admin/broadcasts' && item.body.action === 'unpublish'),
      '[' + target.name + '] Broadcast withdrawal must use the protected server route.');

    await hub.locator('[data-ovyx-admin-workspace-route="admin-template-hub"]').evaluate(button => button.click());
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-template-hub');
    await page.locator('#view-admin-template-hub [data-ovyx-admin-workspace-back]').waitFor({ state: 'visible' });
    // Wait until the asynchronously mounted registry has attached its submit handler.
    await page.locator('#ovyx-global-template-registry[data-template-bound="1"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('#ovyx-global-template-title').fill('Owner Browser Published Template');
    await page.locator('#ovyx-global-template-category').selectOption('SaaS');
    await page.locator('#ovyx-global-template-preview').fill('');
    await page.locator('#ovyx-global-template-tier').selectOption('free');
    await page.locator('#ovyx-global-template-ast').fill('{"nodes":[{"id":"owner-browser-test-node","type":"section"}]}');
    // Exercise the visible owner control rather than invoking the form API directly.
    await page.locator('#ovyx-global-template-publish').click();
    await page.waitForFunction(() => {
      const status = document.getElementById('ovyx-global-template-publish-status');
      return status?.dataset.state === 'ok' || status?.dataset.state === 'error';
    }, null, { timeout: 20000 });
    const publishStatus = await page.locator('#ovyx-global-template-publish-status').textContent();
    assert.match(publishStatus || '', /Template published to the global catalogue/,
      '[' + target.name + '] Publish template globally did not confirm success. Actual status: ' + String(publishStatus || '').trim());
    assert.ok(ownerApiWrites.some(item => item.path === '/api/admin/templates' && item.body.action === 'publish' && item.body.title === 'Owner Browser Published Template'),
      '[' + target.name + '] Template publication must reach the protected server API.');
    await page.locator('#ovyx-global-template-refresh').click();
    await page.locator('#ovyx-global-template-list [data-withdraw-template]').waitFor({ state: 'attached' });
    await page.locator('#ovyx-global-template-list [data-withdraw-template]').click();
    await page.waitForFunction(() => /Loaded 0 currently published template/.test(document.getElementById('ovyx-global-template-status')?.textContent || ''), null, { timeout: 20000 });
    assert.ok(ownerApiWrites.some(item => item.path === '/api/admin/templates' && item.body.action === 'unpublish'),
      '[' + target.name + '] Template withdrawal must reach the protected server API.');

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

    const workerResponse = await page.evaluate(async () => {
      const response = await fetch('/sw.js', { cache: 'no-store' });
      const body = await response.text();
      return { status: response.status, contentType: response.headers.get('content-type') || '', hasNotificationClick: body.includes('notificationclick') };
    });
    assert.equal(workerResponse.status, 200, '[' + target.name + '] Push service-worker asset must be served successfully.');
    assert.match(workerResponse.contentType, /javascript/i, '[' + target.name + '] Push service-worker asset must use JavaScript MIME.');
    assert.equal(workerResponse.hasNotificationClick, true, '[' + target.name + '] Push service worker must handle notification clicks.');
    assert.deepEqual(scriptMimeErrors, [], '[' + target.name + '] Browser must not receive any script with an unsupported MIME type.');

    await page.close();
  }
  console.log('OVYX Admin Workspace browser tests passed in desktop and mobile Chromium: root-only access, nine modules, global owner actions, push worker MIME, broadcast/template publishing and fail-closed non-root state.');
} finally {
  await browser.close();
}
