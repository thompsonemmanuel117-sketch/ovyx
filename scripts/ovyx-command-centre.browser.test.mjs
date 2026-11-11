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

    const response = await page.goto(baseURL, { waitUntil: 'commit', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX shell returned an HTTP error.');
    const bootstrapDiagnostic = await Promise.race([
      page.evaluate(() => ({
        readyState: document.readyState,
        bodyChildren: document.body?.children?.length || 0,
        homeMounted: !!document.getElementById('view-home'),
        dashboardShellMounted: !!document.querySelector('#view-home .v59-dashboard-shell'),
        scriptCount: document.scripts.length,
        pendingScripts: Array.from(document.scripts).filter(script => script.src && !script.dataset.ovyxExecuted).map(script => script.src).slice(0, 20),
        loadedResources: performance.getEntriesByType('resource').length,
      })),
      new Promise(resolve => setTimeout(() => resolve({ diagnostic: 'Renderer did not answer the bootstrap probe within 5 seconds.' }), 5000)),
    ]);
    console.log('[' + target.name + '] dashboard bootstrap diagnostic: ' + JSON.stringify(bootstrapDiagnostic));
    await page.waitForFunction(() => document.readyState !== 'loading'
      && !!document.querySelector('#view-home .v59-dashboard-shell'), null, { timeout: 60000, polling: 250 });
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
