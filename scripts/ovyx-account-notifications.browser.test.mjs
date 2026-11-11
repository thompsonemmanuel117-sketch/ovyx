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
    page.setDefaultTimeout(20000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));

    await installOwnerBrowserApiFixtures(page, {
      initialUser: {
        uid: 'ovyx-notification-user',
        email: 'maria.doe@example.test',
        displayName: 'Maria Doe',
        token: 'ovyx-notification-token',
      },
    });

    const response = await page.goto(baseURL, { waitUntil: 'commit', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX shell returned an HTTP error.');
    await page.waitForFunction(() => document.readyState !== 'loading' && !document.documentElement.hasAttribute('data-ovyx-stabilizing') && !document.getElementById('ovyx-first-paint-curtain') && !!window.OVYXNotifications && typeof window.OVYXRouteAuthority?.go === 'function', null, { timeout: 60000 });
    await page.evaluate(() => {
      const user = window.__setOVYXBrowserAuthUser?.({
        uid: 'ovyx-notification-user',
        email: 'maria.doe@example.test',
        displayName: 'Maria Doe',
        token: 'ovyx-notification-token',
      });
      if (!user || !window.firebase?.auth?.()?.currentUser) {
        throw new Error('The isolated Firebase browser fixture did not restore its signed-in test user after shell boot.');
      }
    });

    // The current product inbox is backed by the published Firestore announcement
    // stream. Supply one deterministic snapshot through the existing browser
    // Firebase facade instead of testing a retired REST-based notification panel.
    await page.evaluate(() => {
      window.__ovyxNotificationFixtureCalls = 0;
      const originalFirestore = window.firebase.firestore;
      window.firebase.firestore = function () {
        const db = originalFirestore();
        const originalCollection = db.collection.bind(db);
        db.collection = function (name) {
          if (name === 'ovyx_announcements') {
            return {
              where() { return this; },
              limit() { return this; },
              onSnapshot(callback) {
                window.__ovyxNotificationFixtureCalls += 1;
                const createdAt = {
                  toMillis: () => 1792486800000,
                  toDate: () => new Date('2026-10-20T09:00:00.000Z'),
                };
                callback({
                  docs: [{
                    id: 'broadcast-test-1',
                    data: () => ({
                      title: 'A message from OVYX',
                      body: 'Your account is ready for the next update.',
                      category: 'product',
                      link: '/#ovyx-broadcast-test',
                      published: true,
                      createdAt,
                    }),
                  }],
                });
                return () => {};
              },
            };
          }
          return originalCollection(name);
        };
        return db;
      };
      window.OVYXNotifications.subscribe();
      // V58 is the final route authority. Earlier legacy wrappers can still be
      // replaced during shell boot, so route only after that runtime is ready.
      window.OVYXRouteAuthority.go('inbox');
    });

    const inboxDiagnostic = await page.evaluate(() => ({
      route: window.KernelState?.activeView || null,
      user: window.firebase?.auth?.()?.currentUser?.uid || null,
      snapshotCalls: window.__ovyxNotificationFixtureCalls || 0,
      notificationDocs: (window.OVYXNotifications?.docs || []).map(item => ({ id: item.id, title: item.title, published: item.published })),
      listText: document.querySelector('#v34-inbox-list')?.innerText || null,
      listDisplay: document.querySelector('#v34-inbox-list') ? getComputedStyle(document.querySelector('#v34-inbox-list')).display : null,
      viewDisplay: document.getElementById('view-inbox') ? getComputedStyle(document.getElementById('view-inbox')).display : null,
      pageErrors,
    }));
    console.log('[' + target.name + '] inbox state after subscription: ' + JSON.stringify(inboxDiagnostic));
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'inbox' && getComputedStyle(document.getElementById('view-inbox')).display !== 'none' && !document.getElementById('view-inbox').classList.contains('hidden'), null, { timeout: 15000 });
    const list = page.locator('#view-inbox #v34-inbox-list');
    await list.waitFor({ state: 'visible' });
    const notification = list.locator('[data-inbox-id="broadcast-test-1"]');
    await notification.waitFor({ state: 'visible' });
    assert.equal((await notification.locator('b').first().textContent()).trim(), 'A message from OVYX',
      '[' + target.name + '] the published broadcast title must be rendered.');
    assert.match((await notification.textContent()) || '', /Your account is ready for the next update/,
      '[' + target.name + '] the published broadcast body must be rendered.');
    assert.equal((await page.locator('#v34-inbox-unread-count').textContent()).trim(), '1',
      '[' + target.name + '] one unread broadcast must show an unread count.');

    await notification.locator('[data-inbox-read]').click();
    await page.waitForFunction(() => document.querySelector('#v34-inbox-unread-count')?.textContent?.trim() === '0');
    assert.equal(await notification.evaluate(node => node.classList.contains('unread')), false,
      '[' + target.name + '] marking a broadcast read must clear its unread styling.');
    assert.deepEqual(pageErrors, [], '[' + target.name + '] inbox code should not throw browser errors.');
    console.log('OVYX published notification inbox passed on ' + target.name + '.');
    await page.close();
  }
} finally {
  await browser.close();
}
