import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const expected = [
  ['admin-overview', 'Overview'],
  ['admin-pricing', 'Pricing & Plans'],
  ['admin-users', 'Users'],
  ['admin-brain', 'AI Brain'],
  ['admin-identity', 'AI Identity'],
  ['admin-backend', 'Backend'],
  ['admin-telemetry', 'Telemetry'],
  ['admin-broadcasts', 'Broadcasts'],
  ['admin-template-hub', 'Template Matrix'],
];

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport });
    page.setDefaultTimeout(20000);

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] app shell failed to load');

    // On localhost the owner UI preview is intentionally available for layout
    // inspection; server-backed admin actions remain protected by their APIs.
    await page.waitForFunction(
      () => window.OVYX_ADMIN_UI_PREVIEW === true && typeof window.Router?.go === 'function',
      undefined,
      { timeout: 45000 },
    );

    await page.evaluate(() => window.Router.go('admin-overview'));
    const overview = page.locator('#view-admin-overview');
    await overview.waitFor({ state: 'visible' });

    const hub = page.locator('#ovyx-admin-module-directory');
    await hub.waitFor({ state: 'visible' });
    assert.match(await hub.innerText(), /Admin Modules/i, '[' + target.name + '] hub heading is missing');
    assert.equal(await hub.locator('[data-admin-module]').count(), expected.length,
      '[' + target.name + '] the module hub must contain all nine expected entries');

    for (const [route, title] of expected) {
      const entry = hub.locator('[data-admin-module="' + route + '"]');
      assert.equal(await entry.count(), 1, '[' + target.name + '] module entry missing or duplicated: ' + route);
      assert.ok(await entry.isVisible(), '[' + target.name + '] module entry is hidden: ' + route);
      assert.match(await entry.innerText(), new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        '[' + target.name + '] incorrect label for ' + route);
    }

    // Verify the two missing sections that the owner specifically remembered.
    await hub.locator('[data-admin-module="admin-pricing"]').click();
    await page.locator('#view-admin-pricing').waitFor({ state: 'visible' });
    assert.equal(await hub.isVisible(), false, '[' + target.name + '] hub should remain within Overview, not overlay every admin page');

    await page.evaluate(() => window.Router.go('admin-overview'));
    await hub.waitFor({ state: 'visible' });
    await hub.locator('[data-admin-module="admin-template-hub"]').click();
    await page.locator('#view-admin-template-hub').waitFor({ state: 'visible' });

    console.log('PASS Admin Modules ' + target.name + ': owner-preview entry, all nine links, Pricing & Plans and Template Matrix routes.');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('OVYX Admin hub desktop/mobile browser tests passed.');
