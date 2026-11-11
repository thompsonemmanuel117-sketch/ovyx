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
    let profileName = '';
    let isRead = false;
    let readPosts = 0;
    const ownErrors = [];
    page.on('pageerror', error => {
      const detail = String(error?.stack || error?.message || error);
      if (/ovyx-account-notifications|ovyx-notification|ovyx-welcome/i.test(detail)) ownErrors.push(detail);
    });

    await installOwnerBrowserApiFixtures(page, {
      initialUser: { uid: 'ovyx-notification-user', email: 'maria.doe@example.test', displayName: ' ', token: 'ovyx-notification-token' }
    });
    // The fixture defaults blank names for other account tests; this workflow explicitly
    // verifies the email-local-name fallback for a brand-new email/password account.
    await page.addInitScript(() => {
      try { window.firebase?.auth?.()?.currentUser && (window.firebase.auth().currentUser.displayName = ''); } catch (_) {}
    });
    await page.route('**/api/notifications', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() || {};
        if (body.action === 'read' && body.notificationId === 'broadcast-test-1') {
          isRead = true;
          readPosts += 1;
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: body.notificationId, readAt: '2026-10-20T10:00:00.000Z' }) });
          return;
        }
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Unexpected notification test action.' }) });
        return;
      }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          unreadCount: isRead ? 0 : 1,
          notifications: [{
            id: 'broadcast-test-1',
            title: 'A message from OVYX',
            body: 'Your account is ready for the next update.',
            category: 'product',
            link: '/#ovyx-broadcast-test',
            createdAt: '2026-10-20T09:00:00.000Z',
            readAt: isRead ? '2026-10-20T10:00:00.000Z' : null,
            unread: !isRead
          }]
        })
      });
    });
    await page.route('**/api/settings/profile', async route => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, profile: { displayName: profileName, workspaceName: 'Creative Workspace' }, updatedAt: profileName ? '2026-10-20T09:45:00.000Z' : null })
      });
    });
    await page.route('**/api/notifications/push', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, pushConfigured: false, reason: 'Push is intentionally disabled in this browser fixture.' }) });
    });

    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.locator('#ovyx-account-notifications-root').waitFor({ state: 'visible' });
    await page.locator('#ovyx-welcome-name').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.ovyx-welcome-logo').getAttribute('src'), '/assets/ovyx-brand-mark.svg', '[' + target.name + '] welcome overlay must use canonical OVYX brand mark');
    assert.equal((await page.locator('#ovyx-welcome-name').textContent()).trim(), 'Maria Doe', '[' + target.name + '] new account should use the email name until a saved profile name exists');
    await page.locator('#ovyx-notification-bell').click();
    await page.locator('[data-ovyx-notification-id="broadcast-test-1"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.ovyx-notice-head img').getAttribute('src'), '/assets/ovyx-brand-mark.svg', '[' + target.name + '] notification panel must use canonical OVYX brand mark');
    assert.equal((await page.locator('#ovyx-notification-badge').textContent()).trim(), '1', '[' + target.name + '] one unread broadcast should show a badge');
    await page.locator('[data-ovyx-notification-id="broadcast-test-1"]').click();
    await page.waitForFunction(() => window.location.hash === '#ovyx-broadcast-test');
    assert.equal(readPosts, 1, '[' + target.name + '] opening a broadcast should persist its read state');
    assert.equal((await page.locator('#ovyx-notification-badge').textContent()).trim(), '0', '[' + target.name + '] reading a broadcast should clear the unread count');

    profileName = 'Mariam Ovyx';
    await page.evaluate(() => {
      window.__setOVYXBrowserAuthUser(null);
      window.__setOVYXBrowserAuthUser({ uid: 'ovyx-notification-user', email: 'maria.doe@example.test', displayName: 'Temporary Auth Name', token: 'ovyx-notification-token' });
    });
    await page.waitForFunction(() => document.querySelector('#ovyx-welcome-name')?.textContent?.trim() === 'Mariam Ovyx');
    assert.equal((await page.locator('#ovyx-welcome-name').textContent()).trim(), 'Mariam Ovyx', '[' + target.name + '] saved profile name must replace the email-name fallback on next sign-in');
    assert.deepEqual(ownErrors, [], '[' + target.name + '] notification/welcome code should not throw browser errors');
    console.log('OVYX personalized welcome and broadcast inbox passed on ' + target.name + '.');
    await page.close();
  }
} finally {
  await browser.close();
}
