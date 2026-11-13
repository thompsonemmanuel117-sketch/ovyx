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
    const context = await browser.newContext({ viewport: target.viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await installOwnerBrowserApiFixtures(page);
    await page.addInitScript(() => {
      // Pin every persisted route source to Settings before the shell boots.
      // Late route restoration must not overwrite the route while this suite
      // is checking the Settings navigation controls.
      let session = {};
      try { session = JSON.parse(localStorage.getItem('ovyx.runtime.session.v4') || '{}'); } catch (_) {}
      localStorage.setItem('ovyx.runtime.route.v18', 'settings');
      localStorage.setItem('ovyx.settings.last-view.v1', 'settings');
      localStorage.setItem('ovyx.runtime.session.v4', JSON.stringify({ ...session, route: 'settings' }));
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX must load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && !!window.OVYXSettings?.root,
      null,
      { timeout: 45000 },
    );
    await page.waitForFunction(
      () => document.readyState === 'complete'
        && window.__OVYX_BOOT_ROUTE === 'settings'
        && window.KernelState?.activeView === 'settings',
      null,
      { timeout: 45000 },
    );
    // Allow the late V25 pageshow restoration pass to settle before interacting.
    await page.waitForTimeout(120);
    await page.waitForFunction(
      () => window.__OVYX_BOOT_ROUTE === 'settings'
        && window.KernelState?.activeView === 'settings',
      null,
      { timeout: 10000 },
    );
    const root = page.locator('#view-settings');
    await root.waitFor({ state: 'visible' });
    const navItems = root.locator('.ovyx-settings-sidebar [data-settings-nav]');
    const count = await navItems.count();
    assert.ok(count >= 13, '[' + target.name + '] all existing Settings categories must remain available.');

    const first = await navItems.first().evaluate(el => ({
      height: el.getBoundingClientRect().height,
      pointerEvents: getComputedStyle(el).pointerEvents,
    }));
    assert.ok(first.height >= 44, '[' + target.name + '] Settings category buttons must have a 44px touch target.');
    assert.equal(first.pointerEvents, 'auto', '[' + target.name + '] Settings categories must accept pointer input.');

    for (let index = 0; index < count; index += 1) {
      const item = navItems.nth(index);
      const id = await item.getAttribute('data-settings-nav');
      await item.click();
      await page.waitForFunction(
        expected => document.querySelector('#view-settings [data-settings-nav].active')?.dataset.settingsNav === expected
          && document.querySelector('#view-settings [data-settings-panel].active')?.dataset.settingsPanel === expected,
        id,
        { timeout: 5000 },
      );
    }

    const layout = await root.locator('.ovyx-settings-main').evaluate(el => ({
      overflowX: getComputedStyle(el).overflowX,
      overflowY: getComputedStyle(el).overflowY,
      minHeight: el.getBoundingClientRect().height,
    }));
    assert.notEqual(layout.overflowY, 'hidden', '[' + target.name + '] Settings content must not be vertically clipped.');
    assert.ok(layout.minHeight >= 400, '[' + target.name + '] Settings content surface must not collapse to a short strip.');


    if (target.name === 'mobile') {
      const sidebar = root.locator('.ovyx-settings-sidebar');
      const metrics = await sidebar.evaluate(el => ({
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        overflowX: getComputedStyle(el).overflowX,
      }));
      const touchStyles = await sidebar.evaluate(el => ({
        position: getComputedStyle(el).position,
        touchAction: getComputedStyle(el).touchAction,
        overscrollY: getComputedStyle(el).overscrollBehaviorY,
      }));
      assert.notEqual(touchStyles.position, 'sticky', '[mobile] category navigation must not pin itself and obstruct natural page movement.');
      assert.match(touchStyles.touchAction, /pan-x/);
      assert.match(touchStyles.touchAction, /pan-y/);
      assert.equal(touchStyles.overscrollY, 'auto', '[mobile] vertical gestures must continue to the Settings page.');
      assert.equal(metrics.overflowX, 'auto', '[mobile] category strip must allow horizontal touch scrolling.');
      assert.ok(metrics.scrollWidth > metrics.clientWidth, '[mobile] every category must remain reachable in the scrollable strip.');
      await navItems.last().scrollIntoViewIfNeeded();
      await navItems.last().click();
      assert.ok(await navItems.last().evaluate(el => el.classList.contains('active')), '[mobile] the last category must remain tappable after scrolling.');
    }

    assert.deepEqual(errors, [], '[' + target.name + '] Settings navigation must not produce browser errors.');
    await context.close();
  }
  console.log('OVYX Settings navigation browser tests passed: every category opens on desktop/mobile and mobile touch scrolling remains usable.');
} finally {
  await browser.close();
}
