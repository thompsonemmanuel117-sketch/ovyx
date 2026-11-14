import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures, startBrowserStartupProfiler } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport });
    page.setDefaultTimeout(20000);
    const pageErrors = [];
    const notificationRequests = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
    await installOwnerBrowserApiFixtures(page, {
      initialUser: {
        uid: 'ovyx-notification-user',
        email: 'maria.doe@example.test',
        displayName: 'Maria Doe',
        token: 'ovyx-notification-token',
      },
    });
    const stopStartupProfiler = await startBrowserStartupProfiler(page, target.name + ' Notifications');
    await page.route('**/api/notifications', async route => {
      notificationRequests.push(route.request().method());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify({
          ok: true,
          unreadCount: 1,
          notifications: [{
            id: 'broadcast-test-1',
            title: 'A message from OVYX',
            body: 'Your account is ready for the next update.',
            category: 'product',
            link: '/#ovyx-broadcast-test',
            createdAt: '2026-10-20T09:00:00.000Z',
            unread: true,
          }],
        }),
      });
    });
    await page.route('**/api/settings/profile', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: true, profile: { displayName: 'Maria Doe' } }),
    }));

    const response = await page.goto(baseURL, { waitUntil: 'commit', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX shell returned an HTTP error.');
    await page.waitForFunction(() =>
      typeof window.OVYXAccountNotifications?.refresh === 'function'
      && typeof window.OVYXAccountNotifications?.unreadCount === 'function'
      && !!window.firebase?.auth?.()?.currentUser
      && window.OVYXAccountNotifications.unreadCount() === 1
      && !!document.getElementById('ovyx-welcome-overlay'),
      null,
      { timeout: 60000 },
    );
    await stopStartupProfiler();

    const ui = await page.evaluate(() => ({
      root: !!document.getElementById('ovyx-account-notifications-root'),
      bell: !!document.getElementById('ovyx-notification-bell'),
      panel: !!document.getElementById('ovyx-notification-panel'),
      badge: !!document.getElementById('ovyx-notification-badge'),
      welcome: !!document.getElementById('ovyx-welcome-overlay'),
      unreadCount: window.OVYXAccountNotifications.unreadCount(),
      recent: window.OVYXAccountNotifications.recent(),
    }));
    assert.deepEqual(
      { root: ui.root, bell: ui.bell, panel: ui.panel, badge: ui.badge },
      { root: false, bell: false, panel: false, badge: false },
      '[' + target.name + '] the retired floating notification UI must not be mounted anywhere in the application.',
    );
    assert.equal(ui.welcome, true, '[' + target.name + '] the existing account welcome experience must remain available.');
    assert.equal(ui.unreadCount, 1, '[' + target.name + '] authenticated notification data must continue syncing.');
    assert.equal(ui.recent[0]?.title, 'A message from OVYX',
      '[' + target.name + '] the notification data API must remain available for the future inbox.');
    assert.ok(notificationRequests.includes('GET'),
      '[' + target.name + '] the authenticated notifications endpoint must still be queried.');

    await page.evaluate(() => window.OVYXAccountNotifications.open());
    assert.equal(await page.locator('#ovyx-notification-bell, #ovyx-notification-panel').count(), 0,
      '[' + target.name + '] legacy open calls must not recreate the retired floating UI.');
    assert.deepEqual(pageErrors, [], '[' + target.name + '] notification bootstrap must not throw browser errors.');
    console.log('OVYX notification UI retirement and retained data sync passed on ' + target.name + '.');
    await page.close();
  }
} finally {
  await browser.close();
}
