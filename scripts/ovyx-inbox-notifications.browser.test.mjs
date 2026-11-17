import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ]) {
    const page = await browser.newPage({
      viewport: target.viewport,
      isMobile: !!target.isMobile,
      hasTouch: !!target.hasTouch,
    });
    page.setDefaultTimeout(20000);
    const requests = [];
    const errors = [];
    const readState = new Map();
    const firstPage = [
      {
        id: 'inbox-product-1',
        title: 'Your OVYX workspace is ready',
        body: 'The latest workspace update is available.',
        category: 'product',
        link: '/#inbox-product-1',
        createdAt: '2026-11-18T08:00:00.000Z',
        unread: true,
      },
      {
        id: 'inbox-account-1',
        title: 'Account settings updated',
        body: 'Your account preferences were saved.',
        category: 'account',
        link: '',
        createdAt: '2026-11-17T08:00:00.000Z',
        unread: false,
      },
    ];
    const olderPage = [
      {
        id: 'inbox-security-1',
        title: 'Security notice',
        body: 'A new security update is available.',
        category: 'security',
        link: '',
        createdAt: '2026-11-10T08:00:00.000Z',
        unread: true,
      },
    ];

    await installOwnerBrowserApiFixtures(page, {
      initialUser: {
        uid: 'ovyx-inbox-browser-user',
        email: 'inbox.user@example.test',
        displayName: 'Inbox User',
        token: 'ovyx-inbox-browser-token',
      },
    });

    await page.route('**/api/notifications**', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method().toUpperCase();
      requests.push({ method, url: url.pathname + url.search, headers: request.headers() });
      if (method === 'GET') {
        const older = url.searchParams.get('pageToken') === 'older-page';
        const rows = older ? olderPage : firstPage;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'cache-control': 'no-store' },
          body: JSON.stringify({
            ok: true,
            notifications: rows.map(item => ({
              ...item,
              unread: readState.has(item.id) ? readState.get(item.id) : item.unread,
            })),
            unreadCount: rows.filter(item => readState.has(item.id) ? readState.get(item.id) : item.unread).length,
            nextPageToken: older ? null : 'older-page',
          }),
        });
        return;
      }
      const payload = request.postDataJSON() || {};
      requests[requests.length - 1].payload = payload;
      if (payload.action === 'read' || payload.action === 'unread') {
        readState.set(String(payload.notificationId), payload.action === 'unread');
      }
      if (payload.action === 'read-all') {
        for (const id of payload.notificationIds || []) readState.set(String(id), false);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'no-store' },
        body: JSON.stringify({
          ok: true,
          action: payload.action,
          id: payload.notificationId || null,
          readAt: payload.action === 'unread' ? null : new Date().toISOString(),
          updatedCount: (payload.notificationIds || []).length,
        }),
      });
    });

    await page.route('**/api/notifications/push', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({
        ok: true,
        authority: 'SERVER',
        pushConfigured: false,
        vapidPublicKey: null,
        reason: 'Phone alerts are not configured for this test deployment.',
        activeDeviceCount: 0,
        deviceSubscribed: false,
      }),
    }));

    page.on('pageerror', error => {
      const detail = String(error?.stack || error?.message || error);
      if (/inbox|notification/i.test(detail)) errors.push(detail);
    });

    const response = await page.goto(baseURL, { waitUntil: 'commit', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX shell returned an HTTP error.');
    await page.waitForFunction(() =>
      typeof window.OVYXInboxExperience?.refresh === 'function'
      && typeof window.Router?.go === 'function'
      && !!window.firebase?.auth?.()?.currentUser,
      null,
      { timeout: 60000 },
    );

    await page.evaluate(() => window.Router.go('inbox'));
    await page.waitForFunction(() =>
      window.KernelState?.activeView === 'inbox'
      && !document.getElementById('view-inbox')?.classList.contains('hidden'),
      null,
      { timeout: 20000 },
    );
    await page.locator('[data-inbox-id="inbox-product-1"]').waitFor();
    assert.equal(await page.locator('.v34-inbox-item').count(), 2,
      '[' + target.name + '] the Inbox must render the authenticated notification records.');
    assert.equal(await page.locator('#v34-inbox-unread-count').textContent(), '1',
      '[' + target.name + '] the unread badge must reflect server read state.');
    assert.equal(await page.locator('#v34-inbox-connection').textContent(), 'LIVE',
      '[' + target.name + '] the connection state must reflect a successful server response.');

    await page.locator('[data-inbox-filter="unread"]').click();
    assert.equal(await page.locator('.v34-inbox-item').count(), 1,
      '[' + target.name + '] the Unread filter must only show unread notifications.');
    await page.locator('[data-inbox-read]').click();
    await page.waitForFunction(() => document.getElementById('v34-inbox-unread-count')?.textContent === '0');
    assert.equal(requests.some(item => item.method === 'POST' && item.payload?.action === 'read'),
      true, '[' + target.name + '] Mark read must persist through the authenticated notifications API.');

    await page.locator('[data-inbox-filter="all"]').click();
    await page.locator('[data-inbox-id="inbox-product-1"] [data-inbox-read]').click();
    await page.waitForFunction(() => document.getElementById('v34-inbox-unread-count')?.textContent === '1');
    assert.equal(requests.some(item => item.method === 'POST' && item.payload?.action === 'unread'),
      true, '[' + target.name + '] Mark unread must persist through the authenticated notifications API.');

    await page.locator('#ovyx-inbox-load-more').click();
    await page.locator('[data-inbox-id="inbox-security-1"]').waitFor();
    assert.equal(await page.locator('.v34-inbox-item').count(), 3,
      '[' + target.name + '] Load older must append the next server page without losing current records.');
    assert.equal(requests.some(item => item.method === 'GET' && item.url.includes('pageToken=older-page')),
      true, '[' + target.name + '] older notifications must use the server page token.');

    await page.locator('#v34-inbox-mark-all').click();
    await page.waitForFunction(() => document.getElementById('v34-inbox-unread-count')?.textContent === '0');
    const readAll = requests.find(item => item.method === 'POST' && item.payload?.action === 'read-all');
    assert.ok(readAll, '[' + target.name + '] Mark all read must call the server bulk action.');
    assert.deepEqual(new Set(readAll.payload.notificationIds), new Set([
      'inbox-product-1', 'inbox-account-1', 'inbox-security-1',
    ]), '[' + target.name + '] Mark all read must include all loaded notification IDs.');

    await page.locator('#ovyx-inbox-search').fill('security notice');
    assert.equal(await page.locator('.v34-inbox-item').count(), 1,
      '[' + target.name + '] Inbox search must filter the loaded notification list.');
    await page.locator('[data-inbox-filter="security"]').click();
    assert.equal(await page.locator('.v34-inbox-item').count(), 1,
      '[' + target.name + '] category filters must work alongside search.');
    await page.locator('#ovyx-inbox-search').fill('');
    await page.locator('[data-inbox-filter="all"]').click();

    assert.equal(await page.locator('#ovyx-inbox-push-toggle').isDisabled(), true,
      '[' + target.name + '] phone alerts must remain disabled when the server has no VAPID configuration.');
    assert.ok(requests.some(item => item.method === 'GET' && item.headers.authorization === 'Bearer ovyx-inbox-browser-token'),
      '[' + target.name + '] Inbox reads must use the signed-in Firebase ID token.');
    assert.deepEqual(errors, [], '[' + target.name + '] Inbox interactions must not throw browser errors.');

    const dimensions = await page.locator('#view-inbox').evaluate(node => ({
      width: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }));
    assert.ok(dimensions.scrollWidth <= dimensions.width + 1,
      '[' + target.name + '] the Inbox must not introduce horizontal page overflow.');
    const dashboardDock = page.locator('#ovyx-v52-bottom-bar');
    if (await dashboardDock.count()) {
      assert.equal(await dashboardDock.evaluate(node => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
      }), false, '[' + target.name + '] the dashboard-only bottom navigation must stay hidden on Inbox.');
    }

    console.log('OVYX server-backed Inbox, filters, pagination, read states and push configuration passed on ' + target.name + '.');
    await page.close();
  }
} finally {
  await browser.close();
}
