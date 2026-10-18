import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

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

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport });
    page.setDefaultTimeout(20000);
    await installOwnerBrowserApiFixtures(page);

    let entitlementCalls = 0;
    await page.route('**/api/entitlements', async route => {
      entitlementCalls += 1;
      const authorization = String(route.request().headers().authorization || '');
      const isRoot = authorization === 'Bearer ovyx-admin-root-test-token';
      const body = isRoot
        ? { ok: true, uid: 'ovyx-admin-root-fixture', email: 'ovyxsupportteam@gmail.com', role: 'ROOT_SUPERUSER', owner: true, admin: true, isRoot: true, entitlements: { role: 'ROOT_SUPERUSER', owner: true, admin: true } }
        : { ok: true, uid: 'ovyx-admin-free-fixture', email: 'free-user@example.test', role: 'FREE_USER', owner: false, admin: false, isRoot: false, entitlements: { role: 'FREE_USER', owner: false, admin: false } };
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] app shell failed to load');
    await page.waitForFunction(() => !!window.OVYXAdminWorkspace, undefined, { timeout: 45000 });
    await page.waitForFunction(() => typeof window.__OVYX_FIREBASE_READY__ === 'boolean', undefined, { timeout: 15000 });

    await page.evaluate(() => {
      const root = { uid: 'ovyx-admin-root-fixture', email: 'ovyxsupportteam@gmail.com', emailVerified: true, getIdToken: async () => 'ovyx-admin-root-test-token' };
      const free = { uid: 'ovyx-admin-free-fixture', email: 'free-user@example.test', emailVerified: true, getIdToken: async () => 'ovyx-admin-free-test-token' };
      const auth = { currentUser: root, onAuthStateChanged(callback) { queueMicrotask(() => callback(auth.currentUser)); return () => {}; } };
      window.firebase = { auth: () => auth };
      window.__setOVYXAdminTestIdentity = value => { auth.currentUser = value === 'root' ? root : value === 'free' ? free : null; };
    });

    assert.equal(await page.evaluate(() => window.OVYXAdminWorkspace.refresh()), true, '[' + target.name + '] server-verified root fixture should be authorized');
    assert.ok(entitlementCalls > 0, '[' + target.name + '] root access must be checked against the server endpoint');
    assert.ok(await page.locator('#ovyx-admin-workspace-entry-desktop').count(), '[' + target.name + '] desktop owner entry missing');
    assert.ok(await page.locator('#ovyx-admin-workspace-entry-mobile-button').count(), '[' + target.name + '] mobile owner entry missing');

    const entry = target.name === 'mobile' ? '#ovyx-admin-workspace-entry-mobile-button' : '#ovyx-admin-workspace-entry-desktop';
    await page.locator(entry).evaluate(button => button.click());
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-overview');
    const hub = page.locator('#ovyx-admin-workspace-hub');
    await hub.waitFor({ state: 'visible' });
    assert.equal(await hub.locator('[data-ovyx-admin-workspace-route]').count(), expected.length,
      '[' + target.name + '] the owner hub must contain all nine expected modules');

    for (const [route, title] of expected) {
      const entryButton = hub.locator('[data-ovyx-admin-workspace-route="' + route + '"]');
      assert.equal(await entryButton.count(), 1, '[' + target.name + '] module entry missing or duplicated: ' + route);
      assert.ok(await entryButton.isVisible(), '[' + target.name + '] module entry is hidden: ' + route);
      assert.match(await entryButton.innerText(), new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        '[' + target.name + '] incorrect label for ' + route);
    }

    await hub.locator('[data-ovyx-admin-workspace-route="admin-pricing"]').click();
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-pricing');
    await page.evaluate(() => window.Router.go('admin-overview'));
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-overview');
    await hub.locator('[data-ovyx-admin-workspace-route="admin-template-hub"]').click();
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'admin-template-hub');

    await page.evaluate(async () => {
      window.__setOVYXAdminTestIdentity('free');
      await window.OVYXAdminWorkspace.refresh();
    });
    await page.waitForFunction(() => window.OVYXAdminWorkspace.isAuthorized() === false);
    await page.waitForFunction(() => !document.getElementById('ovyx-admin-workspace-entry-desktop') && !document.getElementById('ovyx-admin-workspace-entry-mobile') && !document.getElementById('ovyx-admin-workspace-hub'));
    assert.equal(await page.locator('#ovyx-admin-module-directory').count(), 0,
      '[' + target.name + '] the legacy preview hub must not survive the server-authoritative admin gate');

    console.log('PASS Admin Modules ' + target.name + ': server-authorized hub, all nine modules, Pricing & Plans, Template Matrix, and fail-closed access.');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('OVYX Admin hub desktop/mobile browser tests passed with server-verified owner fixtures.');
