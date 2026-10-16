import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local or deployed OVYX Pages app.');

async function waitForRouteRestore(page) {
  // The late V25 controller reapplies the stored route at load/pageshow. Do not
  // issue a test navigation until that boot restoration has finished.
  await page.waitForFunction(
    () => document.readyState === 'complete'
      && typeof window.__OVYX_BOOT_ROUTE === 'string'
      && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
    null,
    { timeout: 45000 },
  );
  await page.waitForTimeout(120);
  await page.waitForFunction(
    () => typeof window.__OVYX_BOOT_ROUTE === 'string'
      && window.KernelState?.activeView === window.__OVYX_BOOT_ROUTE,
    null,
    { timeout: 10000 },
  );
}


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

    await waitForRouteRestore(page);
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
      () => document.readyState === 'complete'
        && typeof window.Router?.go === 'function'
        && typeof window.OVYXSettings?.show === 'function'
        && !!window.OVYXDataLayerSettings,
      null,
      { timeout: 45000 },
    );
    // This assertion checks local preference persistence after reload; it does
    // not need the unrelated app-wide last-view restoration to equal Settings.
    // Wait for pageshow/late route guards to settle, then explicitly open Settings.
    await page.waitForTimeout(400);
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('workspace'));
    await page.locator('#ovyx-data-endpoint').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ovyx-data-endpoint').inputValue(), endpoint);
    const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx.data.layer.v1') || '{}'));
    assert.equal(afterReload.projectSync, false);

    // Exercise Appearance preview, save, cancel, and reset through the rendered UI.
    // Seed a known persisted baseline and reload so ThemeContext starts from that state.
    await page.evaluate(() => {
      const dark = {
        mode: 'dark',
        accentColor: '#F59E0B',
        backgroundColor: '#050607',
        sidebarColor: '#050607',
        cardColor: '#0B0D10',
        borderColor: '#1B222A',
        textColor: '#F8FAFC',
        mutedColor: '#94A3B8',
        density: 'balanced',
        scale: 'balanced',
        motion: 'full',
      };
      localStorage.setItem('ovyx-theme', JSON.stringify(dark));
      localStorage.setItem('ovyx.appearance.v3', JSON.stringify({ mode: 'dark', density: 'balanced', scale: 'balanced', motion: 'full' }));
      // Make the app's late route-restoration controller reopen Settings on reload.
      // Otherwise it can validly restore Home while this test expects Settings.
      localStorage.setItem('ovyx.runtime.route.v18', 'settings');
      localStorage.setItem('ovyx.settings.last-view.v1', 'settings');
      // The boot hint prioritizes the current session record. Seed all route
      // sources consistently so this reload tests Settings, not stale Home/Studio.
      const session = JSON.parse(localStorage.getItem('ovyx.runtime.session.v4') || '{}');
      localStorage.setItem('ovyx.runtime.session.v4', JSON.stringify({ ...session, route: 'settings' }));
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => typeof window.Router?.go === 'function' && typeof window.OVYXSettings?.show === 'function',
      null,
      { timeout: 45000 },
    );
    // The app may legitimately calculate a different boot hint during pageshow;
    // the test's assertions concern Settings persistence, not that global hint.
    // Wait for its late restoration pass to settle, then navigate directly.
    await page.waitForTimeout(400);
    await page.evaluate(() => window.Router.go('settings'));
    await page.locator('#view-settings').waitFor({ state: 'visible' });
    await page.evaluate(() => window.OVYXSettings.show('appearance'));
    const appearance = page.locator('[data-settings-panel="appearance"]');
    await appearance.waitFor({ state: 'visible' });
    await appearance.locator('[data-appearance-save]').waitFor({ state: 'visible' });
    await appearance.locator('[data-appearance-cancel]').waitFor({ state: 'visible' });

    const initialSavedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(initialSavedTheme.mode, 'dark', '[' + target.name + '] Appearance test baseline must be dark.');
    await appearance.locator('[data-mode="light"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.ovyxAppearanceMode === 'light');
    let savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'dark', '[' + target.name + '] selecting Light must preview without persisting before Save.');

    await appearance.locator('#set-density').selectOption('compact');
    await page.waitForFunction(() => window.ThemeContext?.get?.().density === 'compact');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.density, 'balanced', '[' + target.name + '] density changes must remain a preview until Save.');

    await appearance.locator('[data-appearance-cancel]').click();
    await page.waitForFunction(() => document.documentElement.dataset.ovyxAppearanceMode === 'dark'
      && window.ThemeContext?.get?.().density === 'balanced');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'dark', '[' + target.name + '] Cancel must retain the saved mode.');
    assert.equal(savedTheme.density, 'balanced', '[' + target.name + '] Cancel must retain saved density.');

    await appearance.locator('[data-mode="light"]').click();
    await appearance.locator('[data-appearance-save]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}').mode === 'light');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'light', '[' + target.name + '] Save Appearance must persist selected mode.');

    await page.evaluate(() => window.OVYXSettings.show('privacy'));
    const privacy = page.locator('[data-settings-panel="privacy"]');
    await privacy.locator('[data-clear-appearance]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}').mode === 'dark');
    savedTheme = await page.evaluate(() => JSON.parse(localStorage.getItem('ovyx-theme') || '{}'));
    assert.equal(savedTheme.mode, 'dark', '[' + target.name + '] Privacy reset must restore the dark appearance baseline.');
    assert.equal(savedTheme.density, 'balanced', '[' + target.name + '] Privacy reset must restore balanced density.');
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('ovyx.appearance.v3'))).mode, 'dark',
      '[' + target.name + '] Privacy reset must update the legacy appearance mirror too.');

    assert.deepEqual(settingsErrors, [], '[' + target.name + '] Settings controls should not throw browser errors.');
    await context.close();
  }
  console.log('OVYX Settings Data Layer browser tests passed on desktop and mobile: truthful status, local save/reload, sync toggle persistence, health-only request, omitted external cookies, and starter schema download.');
} finally {
  await browser.close();
}
