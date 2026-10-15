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
    const context = await browser.newContext({ viewport: target.viewport, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const settingsErrors = [];
    page.on('pageerror', error => {
      if (/renderDataLayer|OVYXDataLayerSettings|ovyx-data-(?:endpoint|sync|test|save|schema)|dbCfg/i.test(error.message)) {
        settingsErrors.push(error.message);
      }
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX app did not load.');
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && !!window.OVYXDataLayerSettings,
      null,
      { timeout: 45000 },
    );

    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    const layer = page.locator('#ovyx-data-layer-panel');
    await layer.waitFor({ state: 'visible' });

    const initialCopy = await layer.innerText();
    assert.match(initialCopy, /Not provisioned here/i, '[' + target.name + '] must not imply OVYX provisions PostgreSQL.');
    assert.match(initialCopy, /Health check only/i, '[' + target.name + '] must explain the actual test scope.');
    assert.match(initialCopy, /Download PostgreSQL Schema creates a starter SQL file/i);
    assert.doesNotMatch(initialCopy, /Production-ready relational storage/i);

    // Missing configuration should produce a useful status without making a network request.
    await page.locator('#ovyx-data-test').click();
    assert.equal(
      (await page.locator('#ovyx-data-result').innerText()).trim(),
      'Add your secure data API endpoint first.',
      '[' + target.name + '] an empty endpoint must be handled clearly.',
    );

    const endpoint = 'https://data-api.example.test/api/data';
    await page.locator('#ovyx-data-endpoint').fill(endpoint);
    await page.locator('#ovyx-data-save').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}'));
    assert.equal(saved.endpoint, endpoint, '[' + target.name + '] external endpoint preference must be saved locally.');

    // Add a cookie for the external endpoint. The health test must deliberately omit it.
    await context.addCookies([{
      name: 'third_party_session',
      value: 'must-not-be-sent',
      url: 'https://data-api.example.test',
      sameSite: 'None',
      secure: true,
    }]);
    const healthRequests = [];
    await page.route('https://data-api.example.test/api/data/health', async route => {
      const request = route.request();
      healthRequests.push({
        method: request.method(),
        url: request.url(),
        headers: await request.allHeaders(),
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
        body: JSON.stringify({ ok: true, database: 'PostgreSQL' }),
      });
    });

    await page.locator('#ovyx-data-test').click();
    await page.waitForFunction(
      () => document.getElementById('ovyx-data-result')?.textContent?.includes('Health endpoint responded successfully'),
      null,
      { timeout: 20000 },
    );
    assert.equal(healthRequests.length, 1, '[' + target.name + '] Test API must make exactly one request in this interaction.');
    assert.equal(healthRequests[0].method, 'GET', '[' + target.name + '] Test API should only make the documented health GET.');
    assert.equal(healthRequests[0].url, endpoint + '/health');
    assert.equal(healthRequests[0].headers.cookie, undefined, '[' + target.name + '] external endpoint cookies must not be sent.');
    const resultText = await page.locator('#ovyx-data-result').innerText();
    assert.match(resultText, /backend-reported database: PostgreSQL/i);
    assert.match(resultText, /This verifies only the health endpoint, not PostgreSQL connectivity or project CRUD/i,
      '[' + target.name + '] a health response must not claim database/CRUD verification.');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#ovyx-data-schema').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'ovyx-postgresql-schema.sql',
      '[' + target.name + '] schema button should download the starter schema file.');

    const sync = page.locator('#ovyx-data-sync');
    await sync.click();
    assert.equal(await sync.getAttribute('aria-checked'), 'false',
      '[' + target.name + '] sync switch should reflect the off state after clicking.');
    const afterToggle = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}'));
    assert.equal(afterToggle.projectSync, false, '[' + target.name + '] sync switch should persist its state locally.');

    // Reopening the panel must not duplicate its injected container or lose settings.
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    await page.locator('#ovyx-data-endpoint').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ovyx-data-layer-panel').count(), 1,
      '[' + target.name + '] the injected Data Layer panel must not duplicate.');
    assert.equal(await page.locator('#ovyx-data-endpoint').inputValue(), endpoint);
    assert.equal(await page.locator('#ovyx-data-sync').getAttribute('aria-checked'), 'false');

    // Verify local persistence across an actual page reload as well.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && !!window.OVYXDataLayerSettings,
      null,
      { timeout: 45000 },
    );
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    await page.locator('#ovyx-data-endpoint').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ovyx-data-endpoint').inputValue(), endpoint);
    const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}'));
    assert.equal(afterReload.projectSync, false);

    assert.deepEqual(settingsErrors, [], '[' + target.name + '] Settings Data Layer should not throw browser errors.');
    await context.close();
  }
  console.log('OVYX Settings Data Layer browser tests passed on desktop and mobile: truthful status, local save/reload, sync toggle persistence, health-only request, omitted external cookies, and starter schema download.');
} finally {
  await browser.close();
}
