import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-zygote'] });
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

    // The current account inbox is backed by the authenticated Notifications API.
    // Keep its response deterministic without relying on the retired Firestore inbox.
    await page.route('**/api/notifications', async route => {
      const request = route.request();
      notificationRequests.push({ method: request.method(), body: request.postDataJSON() });
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'cache-control': 'no-store' },
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
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
    await page.route('**/api/notifications/push', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: true, pushConfigured: false, reason: 'Phone alerts are not configured for this test.' }),
    }));
    await page.route('**/api/settings/profile', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({ ok: true, profile: { displayName: 'Maria Doe' } }),
    }));

    const response = await page.goto(baseURL, { waitUntil: 'commit', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX shell returned an HTTP error.');
    try {
      await page.waitForFunction(() =>
        typeof window.OVYXAccountNotifications?.open === 'function'
        && !!window.firebase?.auth?.()?.currentUser,
        null,
        { timeout: 60000 },
      );
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        notificationApi: typeof window.OVYXAccountNotifications?.open,
        firebase: typeof window.firebase,
        auth: typeof window.firebase?.auth,
        currentUser: !!window.firebase?.auth?.()?.currentUser,
        scripts: performance.getEntriesByType('resource').map(entry => entry.name)
          .filter(src => /account-notifications|firebase|auth/i.test(src)).slice(-30),
        pageTitle: document.title,
        bodyText: (document.body?.innerText || '').slice(0, 1200),
      })).catch(() => ({ diagnostic: 'page unavailable' }));
      console.error('[' + target.name + '] Notifications bootstrap diagnostic: ' + JSON.stringify(diagnostic));
      throw error;
    }

    await page.evaluate(() => window.OVYXAccountNotifications.open());
    const root = page.locator('#ovyx-account-notifications-root');
    await root.waitFor({ state: 'visible' });
    const panel = page.locator('#ovyx-notification-panel');
    await panel.waitFor({ state: 'visible' });
    const notification = page.locator('#ovyx-notification-list [data-ovyx-notification-id="broadcast-test-1"]');
    await notification.waitFor({ state: 'visible' });

    assert.equal((await notification.locator('.ovyx-notice-item-title').textContent()).trim(), 'A message from OVYX',
      '[' + target.name + '] the published broadcast title must be rendered.');
    assert.match((await notification.textContent()) || '', /Your account is ready for the next update/,
      '[' + target.name + '] the published broadcast body must be rendered.');
    assert.equal((await page.locator('#ovyx-notification-badge').textContent()).trim(), '1',
      '[' + target.name + '] one unread broadcast must show an unread count.');
    assert.equal(await notification.evaluate(node => node.classList.contains('is-unread')), true,
      '[' + target.name + '] unread broadcasts must retain their unread styling.');

    const readResponse = page.waitForResponse(response =>
      response.url().endsWith('/api/notifications')
      && response.request().method() === 'POST'
      && response.status() === 200,
      { timeout: 15000 },
    );
    await notification.click();
    await readResponse;
    assert.ok(notificationRequests.some(item =>
      item.method === 'POST' && item.body?.action === 'read' && item.body?.notificationId === 'broadcast-test-1'
    ), '[' + target.name + '] opening an unread broadcast must send the authenticated read action.');

    assert.deepEqual(pageErrors, [], '[' + target.name + '] account notifications must not throw browser errors.');
    console.log('OVYX authenticated account notification inbox passed on ' + target.name + '.');
    await page.close();
  }
} finally {
  await browser.close();
}
