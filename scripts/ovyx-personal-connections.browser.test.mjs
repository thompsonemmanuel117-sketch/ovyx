import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.addInitScript(() => {
      let session = {};
      try { session = JSON.parse(localStorage.getItem('ovyx.runtime.session.v4') || '{}'); } catch (_) {}
      localStorage.setItem('ovyx.runtime.route.v18', 'settings');
      localStorage.setItem('ovyx.settings.last-view.v1', 'settings');
      localStorage.setItem('ovyx.runtime.session.v4', JSON.stringify({ ...session, route: 'settings' }));
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app did not load.');
    await page.waitForFunction(
      () => document.readyState === 'complete'
        && typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function',
      null,
      { timeout: 45000 },
    );
    await page.waitForFunction(
      () => typeof window.__OVYX_BOOT_ROUTE === 'string'
        && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
      null,
      { timeout: 45000 },
    );
    await page.locator('#view-settings').waitFor({ state: 'visible' });

    const connectionsNav = page.locator('#view-settings [data-settings-nav="connections"]').first();
    await connectionsNav.waitFor({ state: 'visible' });
    await connectionsNav.click();
    await page.waitForFunction(() => window.OVYXSettings?.current === 'connections', null, { timeout: 10000 });

    const personalAction = page.locator('#view-settings [data-ovyx-personal-ai-manager]');
    await personalAction.waitFor({ state: 'visible', timeout: 10000 });
    await personalAction.scrollIntoViewIfNeeded();
    const bounds = await personalAction.boundingBox();
    assert.ok(bounds && bounds.width >= 40 && bounds.height >= 36, '[' + target.name + '] Personal AI connection action must have a usable touch target.');
    const receivesTap = await page.evaluate(({ x, y }) => {
      const top = document.elementFromPoint(x, y);
      return !!top?.closest?.('[data-ovyx-personal-ai-manager]');
    }, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
    assert.equal(receivesTap, true, '[' + target.name + '] Another element must not cover the Personal AI connection action.');

    // Stub only this authenticated settings read; no credentials or live user data
    // are used by this browser regression.
    await page.evaluate(() => {
      const firebase = window.firebase || (window.firebase = {});
      const originalAuth = firebase.auth;
      firebase.auth = () => ({ currentUser: { getIdToken: async () => 'browser-test-token' } });
      window.__personalConnectionsTestRestoreAuth = () => {
        if (originalAuth) firebase.auth = originalAuth;
      };
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
        if (url.pathname === '/api/settings/connections') {
          return new Response(JSON.stringify({ ok: true, connections: [], activeBrainConnectionId: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(input, init);
      };
    });

    await personalAction.click();
    await page.locator('.ovyx-connect-overlay .ovyx-connect-dialog #ovyx-ai-choice').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.ovyx-connect-dialog h2').textContent(), 'Personal AI connection');
    await page.locator('.ovyx-connect-dialog [data-cancel]').click();
    await page.locator('.ovyx-connect-overlay').waitFor({ state: 'detached' });

    const generalNav = page.locator('#view-settings [data-settings-nav="general"]').first();
    await generalNav.click();
    await page.waitForFunction(() => window.OVYXSettings?.current === 'general', null, { timeout: 10000 });
    assert.equal(await page.locator('.ovyx-connect-cta').count(), 0, '[' + target.name + '] No floating connection CTA may remain over the app.');
    assert.deepEqual(pageErrors, [], '[' + target.name + '] Personal Connections interactions must not produce browser errors.');

    await context.close();
  }
  console.log('OVYX Personal Connections browser interactions passed on desktop and mobile: Settings navigation, tappable inline AI connection action, dialog open/close, and no floating overlay.');
} finally {
  await browser.close();
}
