import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport });
    page.setDefaultTimeout(20000);
    await installOwnerBrowserApiFixtures(page, {
      initialUser: {
        uid: 'ovyx-ai-assistant-page-user',
        email: 'assistant-page@example.test',
        token: 'ovyx-ai-assistant-page-token',
      },
    });

    const errors = [];
    page.on('pageerror', error => {
      if (/ovyx-ai-assistant-page|WorkspaceBrainBot|view-ai-assistant/i.test(error.message + ' ' + (error.stack || ''))) errors.push(error.message);
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, `[${target.name}] OVYX shell did not load.`);

    await page.waitForFunction(() =>
      window.WorkspaceBrainBot?.__ovyxNativeOpen === true &&
      window.WorkspaceBrainBot?.__OVYX_AI_ASSISTANT_PAGE_WRAPPED === true &&
      window.OVYXAIService?.__ovyxNativeWorkspaceRoute === true &&
      document.getElementById('view-ai-assistant') &&
      document.getElementById('kernel-brain-bot-panel')?.parentElement?.id === 'view-ai-assistant',
      null,
      { timeout: 60000 },
    );

    if (target.name === 'desktop') {
      await page.evaluate(() => window.Router.go('projects'));
      await page.waitForFunction(() => window.KernelState?.activeView === 'projects');
      await page.locator('#desktop-ai-assistant').click();
    } else {
      await page.evaluate(() => window.MobileDrawer?.open?.());
      await page.locator('[data-v52-account="ai"]').click();
    }

    await page.waitForFunction(() => window.KernelState?.activeView === 'ai-assistant');
    const surface = page.locator('#view-ai-assistant');
    const panel = page.locator('#kernel-brain-bot-panel');
    await surface.waitFor({ state: 'visible' });
    await panel.waitFor({ state: 'visible' });

    const geometry = await page.evaluate(() => {
      const surface = document.getElementById('view-ai-assistant');
      const panel = document.getElementById('kernel-brain-bot-panel');
      const s = surface.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const dock = document.getElementById('ovyx-v52-bottom-bar');
      return {
        route: window.KernelState?.activeView,
        panelParent: panel.parentElement?.id,
        panelPosition: getComputedStyle(panel).position,
        surface: { x: Math.round(s.x), y: Math.round(s.y), width: Math.round(s.width), height: Math.round(s.height) },
        panel: { x: Math.round(p.x), y: Math.round(p.y), width: Math.round(p.width), height: Math.round(p.height) },
        dockDisplay: dock ? getComputedStyle(dock).display : 'missing',
        bodyPageActive: document.body.classList.contains('ovyx-ai-assistant-page-active'),
      };
    });

    assert.equal(geometry.route, 'ai-assistant', `[${target.name}] Assistant entry did not navigate to its own route.`);
    assert.equal(geometry.panelParent, 'view-ai-assistant', `[${target.name}] existing panel was not mounted inside the dedicated page.`);
    assert.equal(geometry.panelPosition, 'relative', `[${target.name}] Assistant is still behaving like a floating overlay.`);
    assert.equal(geometry.panel.x, geometry.surface.x, `[${target.name}] Assistant does not begin at the page's left edge.`);
    assert.equal(geometry.panel.y, geometry.surface.y, `[${target.name}] Assistant does not begin at the page's top edge.`);
    assert.equal(geometry.panel.width, geometry.surface.width, `[${target.name}] Assistant does not fill the page width.`);
    assert.equal(geometry.panel.height, geometry.surface.height, `[${target.name}] Assistant does not fill the page height.`);
    assert.equal(geometry.bodyPageActive, true, `[${target.name}] page state was not synchronized with the shell.`);
    if (target.name === 'mobile') {
      assert.equal(geometry.dockDisplay, 'none', '[mobile] dashboard bottom navigation must remain hidden on the Assistant page.');
    }

    await panel.locator('.ovyx-ai-assistant-close').click();
    const expectedReturn = target.name === 'desktop' ? 'projects' : 'home';
    await page.waitForFunction(route => window.KernelState?.activeView === route, expectedReturn);
    await panel.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#view-ai-assistant').evaluate(node => node.classList.contains('hidden')), true,
      `[${target.name}] closing the Assistant must leave the dedicated page.`);

    if (target.name === 'mobile') {
      await page.waitForFunction(() => {
        const dock = document.getElementById('ovyx-v52-bottom-bar');
        return dock && getComputedStyle(dock).display === 'grid';
      }, null, { timeout: 8000 });
    }

    assert.deepEqual(errors, [], `[${target.name}] Assistant page browser errors: ${errors.join('; ')}`);
    console.log(`PASS ${target.name}: Assistant opens as a full routed page, fills its content viewport, and closes back to the prior route.`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('OVYX AI Assistant full-page browser regressions passed.');
