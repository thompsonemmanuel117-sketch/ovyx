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
    const page = await browser.newPage({
      viewport: target.viewport,
      isMobile: !!target.isMobile,
      hasTouch: !!target.hasTouch
    });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => {
      const detail = String(error?.stack || error?.message || error);
      if (/ovyx-command-centre/i.test(detail)) errors.push(detail);
    });

    await installOwnerBrowserApiFixtures(page, {
      initialUser: {
        uid: 'ovyx-dashboard-dedupe-user',
        email: 'workspace.user@example.test',
        displayName: 'Workspace User',
        token: 'ovyx-dashboard-dedupe-token'
      }
    });

    await page.goto(baseURL, { waitUntil: 'commit', timeout: 60000 });
    await page.locator('#view-home .v59-dashboard-shell').waitFor({ state: 'attached', timeout: 45000 });
    assert.equal(await page.locator('#view-home .v59-hero').count(), 1,
      '[' + target.name + '] the original Home dashboard hero must remain.');
    assert.equal(await page.locator('#ovyx-command-centre').count(), 0,
      '[' + target.name + '] the duplicate Command Centre must not appear on the Home dashboard.');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('ovyx:view-changed', { detail: { view: 'home' } }));
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#ovyx-command-centre').count(), 0,
      '[' + target.name + '] Home navigation must never remount the removed Command Centre.');
    assert.deepEqual(errors, [], '[' + target.name + '] the dashboard-removal runtime must not throw browser errors.');

    console.log('OVYX Home dashboard de-duplication passed on ' + target.name + '.');
    await page.close();
  }
} finally {
  await browser.close();
}
