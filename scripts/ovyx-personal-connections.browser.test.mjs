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
    await page.addInitScript(() => { window.__ovyxPersonalConnectionsPageErrors = []; window.addEventListener('error', event => window.__ovyxPersonalConnectionsPageErrors.push(event.message)); });

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
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });

    const connectionNavItems = page.locator('#view-settings [data-settings-nav="connections"]');
    assert.equal(await connectionNavItems.count(), 1, '[' + target.name + '] Personal Connections must have exactly one Settings navigation item.');
    const connectionsNav = connectionNavItems.first();
    await connectionsNav.waitFor({ state: 'visible' });
    assert.match(await connectionsNav.innerText(), /Personal Connections/);
    await connectionsNav.click();
    await page.waitForFunction(() => window.OVYXSettings?.current === 'connections', null, { timeout: 10000 });
    assert.equal(await page.locator('#view-settings [data-settings-panel="connections"]').count(), 1, '[' + target.name + '] Exactly one Personal Connections panel must exist.');

    await page.locator('#view-settings [data-settings-panel="connections"] .pc-hero').waitFor({ state: 'visible', timeout: 15000 });
    assert.match(await page.locator('#view-settings [data-settings-panel="connections"]').innerText(), /Your connections\\. One secure home\\./);
    const addConnection = page.locator('#view-settings [data-pc-add]');
    await addConnection.waitFor({ state: 'visible' });
    await addConnection.click();
    await page.locator('.pc-overlay .pc-dialog[aria-label="Add a Personal Connection"]').waitFor({ state: 'visible' });
    await page.locator('.pc-overlay [data-pc-cancel]').click();
    await page.locator('.pc-overlay').waitFor({ state: 'detached' });

    const personalAction = page.locator('#view-settings [data-ovyx-personal-ai-manager]');
    try {
      await personalAction.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => {
        const root = document.getElementById('view-settings');
        return {
          current: String(window.OVYXSettings?.current || ''),
          settingsRoot: String(window.OVYXSettings?.root?.id || ''),
          panels: Array.from(root?.querySelectorAll('[data-settings-panel="connections"]') || []).map(panel => ({
            id: panel.id,
            className: panel.className,
            hidden: panel.hidden,
            display: getComputedStyle(panel).display,
            hasAction: !!panel.querySelector('[data-ovyx-personal-ai-manager]'),
            html: panel.innerHTML.slice(0, 420)
          })),
          actionOutsideSettings: !!document.querySelector('body > [data-ovyx-personal-ai-manager]')
        };
      });
      throw new Error('Personal Connections panel did not render its inline AI action: ' + JSON.stringify(diagnostic) + ' | ' + error.message);
    }
    await personalAction.scrollIntoViewIfNeeded();
    const bounds = await personalAction.boundingBox();
    assert.ok(bounds && bounds.width >= 40 && bounds.height >= 36, '[' + target.name + '] Personal AI connection action must have a usable touch target.');
    const receivesTap = await page.evaluate(({ x, y }) => {
      const top = document.elementFromPoint(x, y);
      return !!top?.closest?.('[data-ovyx-personal-ai-manager]');
    }, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
    assert.equal(receivesTap, true, '[' + target.name + '] Another element must not cover the Personal AI connection action.');

    // Verify the real button opens its dialog. This interaction test deliberately
    // avoids mocking Firebase or the API: the dialog must appear before the
    // authenticated connection list is loaded.
    assert.equal(await page.evaluate(() => window.__OVYX_CONNECT_CONTROL_CENTER_V1__ === true), true, '[' + target.name + '] The Personal Connections action runtime must be loaded.');
    await personalAction.click();
    const dialog = page.locator('.ovyx-connect-overlay .ovyx-connect-dialog[aria-label="Personal AI connection"]');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    // In the unauthenticated local test shell, the dialog keeps its accessible
    // identity while replacing the heading with the sign-in-required message.
    await dialog.locator('.note').waitFor({ state: 'visible', timeout: 10000 });
    assert.match(await dialog.locator('.note').textContent(), /Sign in to manage your Personal Connections/);
    await page.keyboard.press('Escape');
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
