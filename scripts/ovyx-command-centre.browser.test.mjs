import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');
const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
  ]) {
    const page = await browser.newPage({ viewport: target.viewport, isMobile: !!target.isMobile, hasTouch: !!target.hasTouch });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => {
      const detail = String(error?.stack || error?.message || error);
      if (/ovyx-command-centre|ovyx-account-notifications/i.test(detail)) errors.push(detail);
    });
    await installOwnerBrowserApiFixtures(page, {
      initialUser: { uid: 'ovyx-command-centre-user', email: 'workspace.user@example.test', displayName: 'Workspace User', token: 'ovyx-command-centre-token' }
    });
    await page.route('**/api/health', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: true, status: 'healthy' }) });
    });
    await page.route('**/api/notifications', async route => {
      await route.fulfill({
        status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({ ok: true, unreadCount: 2, notifications: [
          { id: 'cc-notice-1', title: 'Workspace update', body: 'A new update is available.', category: 'product', link: '/#notice-one', createdAt: '2026-11-05T10:00:00.000Z', readAt: null, unread: true },
          { id: 'cc-notice-2', title: 'Platform news', body: 'Read the latest news.', category: 'product', link: '/#notice-two', createdAt: '2026-11-04T10:00:00.000Z', readAt: null, unread: true }
        ] })
      });
    });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('#ovyx-command-centre').waitFor({ state: 'visible', timeout: 45000 });
    await page.waitForFunction(() => !!window.ProjectStore && typeof window.ProjectStore.list === 'function');
    await page.evaluate(() => {
      const now = Date.now();
      const first = { id: 'cc-project-a', name: 'Aurora Commerce', description: 'A commerce workspace', status: 'draft', updatedAt: now - 60000, pages: [{ name: 'Home' }, { name: 'Products' }] };
      const second = { id: 'cc-project-b', name: 'Northstar Studio', description: 'A studio site', status: 'published', updatedAt: now - 3600000, pages: [{ name: 'Home' }] };
      window.KernelState.projects = [first, second];
      window.KernelState.activeProject = first;
      window.ProjectStore.save();
    });
    await page.waitForFunction(() => document.getElementById('ovyx-cc-metric-projects')?.textContent === '2'
      && document.getElementById('ovyx-cc-metric-drafts')?.textContent === '1'
      && document.getElementById('ovyx-cc-metric-pages')?.textContent === '3');
    await page.evaluate(() => {
      window.KernelState.projects.push({ id: 'cc-project-c', name: 'Meridian Portfolio', status: 'draft', updatedAt: Date.now(), pages: [{ name: 'Home' }] });
      window.ProjectStore.renderHome();
    });
    await page.waitForFunction(() => document.getElementById('ovyx-cc-metric-projects')?.textContent === '3'
      && document.getElementById('ovyx-cc-metric-pages')?.textContent === '4');
    assert.equal((await page.locator('#ovyx-cc-activity-list').innerText()).includes('Aurora Commerce'), true, '[' + target.name + '] activity must reflect the latest saved project.');
    assert.equal((await page.locator('#ovyx-cc-activity-list').innerText()).includes('Last active'), true, '[' + target.name + '] activity must use the truthful project update event.');
    await page.waitForFunction(() => document.getElementById('ovyx-cc-status-value')?.textContent === 'Platform available');
    await page.waitForFunction(() => document.getElementById('ovyx-cc-unread')?.textContent === '2'
      && document.querySelector('#ovyx-cc-notification-list')?.textContent.includes('Workspace update'));
    assert.equal((await page.locator('#ovyx-cc-notification-list').innerText()).includes('Platform news'), true,
      '[' + target.name + '] the dashboard must preview recent announcements from the existing inbox.');
    assert.equal(await page.locator('#ovyx-cc-metric-projects').textContent(), '2');
    assert.equal(await page.locator('#ovyx-cc-metric-pages').textContent(), '3');
    const layout = await page.locator('#ovyx-command-centre').evaluate(node => ({ width: node.clientWidth, scrollWidth: node.scrollWidth }));
    assert.ok(layout.scrollWidth <= layout.width + 1, '[' + target.name + '] Command Centre must not overflow its viewport.');
    await page.locator('[data-ovyx-cc-action="open-projects"]').click();
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'projects');
    assert.deepEqual(errors, [], '[' + target.name + '] Command Centre must not throw browser errors.');
    console.log('OVYX Command Centre workspace dashboard passed on ' + target.name + '.');
    await page.close();
  }
} finally {
  await browser.close();
}
