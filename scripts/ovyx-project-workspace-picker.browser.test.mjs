import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  ]) {
    const context = await browser.newContext({ viewport: target.viewport, isMobile: !!target.isMobile, hasTouch: !!target.hasTouch });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => {
      if (/OVYXWorkspacePicker|project-workspace-picker/i.test(String(error?.stack || error?.message || error))) errors.push(String(error));
    });
    await installOwnerBrowserApiFixtures(page, {
      initialUser: { uid: 'ovyx-project-picker-user', email: 'project-picker@example.test', displayName: 'Project Picker User', token: 'ovyx-project-picker-token' },
    });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof window.ProjectStore?.showWorkspacePicker === 'function'
      && window.OVYXWorkspacePicker?.version === 1, null, { timeout: 45000 });

    await page.evaluate(() => {
      const now = Date.now();
      const first = { id: 'picker-project-aurora', name: 'Aurora Commerce', description: 'Commerce project', status: 'draft', updatedAt: now, pages: [{ name: 'Home' }, { name: 'Products' }] };
      const second = { id: 'picker-project-northstar', name: 'Northstar Studio', description: 'Studio website', status: 'published', updatedAt: now - 60000, pages: [{ name: 'Home' }] };
      const third = { id: 'picker-project-meridian', name: 'Meridian Portfolio', description: 'Portfolio website', status: 'draft', updatedAt: now - 120000, pages: [{ name: 'Home' }] };
      window.KernelState.projects = [first, second, third];
      window.KernelState.activeProject = first;
      window.ProjectStore.renderHome();
      window.ProjectStore.renderProjects();
    });

    await page.evaluate(() => window.ProjectStore.showWorkspacePicker());
    const dialog = page.locator('#ovyx-project-workspace-picker');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.getAttribute('open') !== null, true, '[' + target.name + '] picker must use a real modal dialog.');
    assert.equal(await dialog.locator('[data-project-id]').count(), 3, '[' + target.name + '] picker must list all current saved projects.');
    assert.equal(await dialog.locator('[data-project-id="picker-project-aurora"]').getAttribute('aria-current'), 'true');
    assert.equal(await dialog.locator('.ovx-picker-search').evaluate(el => document.activeElement === el), true,
      '[' + target.name + '] opening the picker must move focus to search.');

    await dialog.locator('.ovx-picker-search').fill('northstar');
    assert.equal(await dialog.locator('[data-project-id]').count(), 1, '[' + target.name + '] search must filter the project list.');
    assert.equal(await dialog.locator('[data-project-id]').first().getAttribute('data-project-id'), 'picker-project-northstar');
    await dialog.locator('.ovx-picker-search').fill('no-such-project');
    assert.equal(await dialog.locator('.ovx-picker-empty').innerText().then(text => text.includes('No matching projects')), true,
      '[' + target.name + '] no-result state must explain the empty search.');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('ovyx-project-workspace-picker')?.open);
    await page.evaluate(() => window.ProjectStore.showWorkspacePicker());
    await dialog.locator('[data-project-id="picker-project-northstar"]').click();
    await page.waitForFunction(() => window.KernelState?.activeProject?.id === 'picker-project-northstar');
    await page.waitForFunction(() => !document.getElementById('ovyx-project-workspace-picker')?.open);

    await page.evaluate(() => window.ProjectStore.showWorkspacePicker());
    await dialog.locator('[data-picker-create]').click();
    const createDialog = page.locator('#ovyx-project-create-modal');
    await createDialog.waitFor({ state: 'visible' });
    assert.equal(await createDialog.getAttribute('aria-hidden'), 'false',
      '[' + target.name + '] Create project must hand off to the existing project creation flow.');
    await page.keyboard.press('Escape');

    const layout = await dialog.evaluate(node => ({ width: node.getBoundingClientRect().width, viewport: window.innerWidth, scrollWidth: node.scrollWidth }));
    assert.ok(layout.width <= layout.viewport, '[' + target.name + '] picker must fit inside the viewport.');
    assert.ok(layout.scrollWidth <= layout.width + 1, '[' + target.name + '] picker must not overflow horizontally.');
    assert.deepEqual(errors, [], '[' + target.name + '] project picker must not throw browser errors.');
    console.log('OVYX project workspace picker passed on ' + target.name + '.');
    await context.close();
  }
} finally {
  await browser.close();
}
