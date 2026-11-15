import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { installOwnerBrowserApiFixtures } from './ovyx-owner-browser-api-fixtures.mjs';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local OVYX Pages app.');

const templates = [
  {
    id: 'tpl-saas', title: 'Atlas SaaS', name: 'Atlas SaaS',
    description: 'A product website with a home page, feature sections and pricing.',
    category: 'SaaS', requiredTier: 'free', previewUrl: 'https://cdn.example.test/atlas.png',
    background: '#101820', accent: '#E8B64F', theme: ['#101820', '#E8B64F'],
    locked: false, published: true, updatedAt: 300,
    pages: [['Home', '/', [['hero', 'Build a better product'], ['features', 'Everything in one place']]],
      ['Pricing', '/pricing', [['pricing', 'Plans for every team']]]]
  },
  {
    id: 'tpl-commerce', title: 'Storefront', name: 'Storefront',
    description: 'A focused commerce experience for growing brands.',
    category: 'Commerce', requiredTier: 'free', previewUrl: '',
    background: '#111111', accent: '#E8B64F', theme: ['#111111', '#E8B64F'],
    locked: false, published: true, updatedAt: 200,
    pages: [['Home', '/', [['hero', 'A better way to shop']]]]
  },
  {
    id: 'tpl-portfolio', title: 'Studio Portfolio', name: 'Studio Portfolio',
    description: 'A portfolio foundation for independent creatives.',
    category: 'Portfolio', requiredTier: 'pro', previewUrl: '',
    background: '#0b0b0b', accent: '#8FD7FF', theme: ['#0b0b0b', '#8FD7FF'],
    locked: true, published: true, updatedAt: 100
  }
];

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } }
  ]) {
    const page = await browser.newPage({ viewport: target.viewport });
    const projectWrites = [];
    await installOwnerBrowserApiFixtures(page, {
      initialUser: { uid: 'ovyx-template-browser-user', email: 'builder@example.test', token: 'ovyx-template-browser-token' }
    });
    await page.route('**/api/templates/published**', async route => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          ok: true, templates, currentTier: 'free', templatesEnabled: true,
          nextPageToken: null, scope: 'global', authority: 'SERVER'
        })
      });
    });
    await page.route('**/api/projects**', async route => {
      const request = route.request();
      if (request.method() === 'POST') {
        projectWrites.push(request.postDataJSON() || {});
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, project: request.postDataJSON()?.project || {} }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, projects: [], nextPageToken: null }) });
    });
    await page.route('https://cdn.example.test/**', route => route.fulfill({
      status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p8sAAAAASUVORK5CYII=', 'base64')
    }));

    const response = await page.goto(baseURL, { waitUntil: 'commit', timeout: 60000 });
    assert.ok(response && response.status() < 400, '[' + target.name + '] OVYX shell returned an HTTP error.');
    await page.waitForFunction(() => !!window.OVYXTemplateLibrary && typeof window.__OVYX_FIREBASE_READY__ === 'boolean', null, { timeout: 45000 });
    await page.waitForFunction(() => !!window.ProjectCloudSync, null, { timeout: 30000 });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('firebase-auth-state-ready'));
      window.Router?.go?.('templates');
    });
    await page.waitForFunction(() => document.querySelectorAll('#templates-catalog-feed [data-template-card]').length === 3, null, { timeout: 20000 });
    await page.locator('#templates-catalog-feed').waitFor({ state: 'visible' });

    assert.equal(await page.locator('#view-templates h3').first().textContent(), 'Find your next starting point',
      '[' + target.name + '] Templates page must show the upgraded library heading.');
    assert.equal(await page.locator('#templates-catalog-feed [data-template-card]').count(), 3,
      '[' + target.name + '] all published templates should appear.');

    const layout = await page.evaluate(() => {
      const feed = document.getElementById('templates-catalog-feed');
      const cards = feed?.querySelector('.ovyx-template-cards');
      const card = feed?.querySelector('[data-template-card]');
      const bounds = card?.getBoundingClientRect();
      const dock = document.getElementById('ovyx-v52-bottom-bar');
      return {
        viewport: window.innerWidth,
        feedWidth: feed?.clientWidth || 0,
        feedScrollWidth: feed?.scrollWidth || 0,
        cardWidth: bounds?.width || 0,
        columns: cards ? getComputedStyle(cards).gridTemplateColumns.split(' ').length : 0,
        dockDisplay: dock ? getComputedStyle(dock).display : 'none'
      };
    });
    assert.ok(layout.feedScrollWidth <= layout.feedWidth + 1,
      '[' + target.name + '] the template gallery must not create horizontal page overflow.');
    assert.ok(layout.cardWidth <= layout.viewport - 24,
      '[' + target.name + '] template cards must fit the viewport.');
    assert.equal(layout.columns, target.name === 'mobile' ? 1 : 3,
      '[' + target.name + '] the template grid must adapt to the viewport.');
    assert.equal(layout.dockDisplay, 'none',
      '[' + target.name + '] the dashboard-only bottom dock must stay hidden on Templates.');

    await page.evaluate(() => { document.documentElement.dataset.ovyxMode = 'light'; });
    const lightThemeText = await page.locator('[data-ovyx-template-action="use"][data-template-id="tpl-saas"]').evaluate(button => getComputedStyle(button).color);
    assert.equal(lightThemeText, 'rgb(248, 250, 252)', '[' + target.name + '] primary template actions must retain readable contrast in light mode.');
    await page.evaluate(() => { document.documentElement.dataset.ovyxMode = 'dark'; });

    // Simulate the old Firestore/local TemplateStore renderer racing the public gallery.
    await page.evaluate(() => { document.getElementById('templates-catalog-feed').innerHTML = '<article class="v0-template-card">legacy renderer</article>'; });
    await page.waitForFunction(() => document.querySelectorAll('#templates-catalog-feed [data-template-card]').length === 3, null, { timeout: 10000 });
    assert.equal(await page.locator('#templates-catalog-feed').getByText('legacy renderer').count(), 0,
      '[' + target.name + '] a legacy renderer must not replace the server-backed public catalogue.');
    await page.evaluate(() => window.OVYXTemplateHub?.render?.());
    await page.waitForFunction(() => document.querySelectorAll('#templates-catalog-feed [data-template-card]').length === 3, null, { timeout: 10000 });

    await page.locator('#template-filters [data-template-filter="SaaS"]').click();
    assert.equal(await page.locator('#templates-catalog-feed [data-template-card]').count(), 1,
      '[' + target.name + '] SaaS filter must return only SaaS templates.');
    assert.equal(await page.locator('#templates-catalog-feed [data-template-card]').first().getAttribute('data-template-card'), 'tpl-saas');

    await page.locator('#template-filters [data-template-filter="Commerce"]').click();
    assert.equal(await page.locator('#templates-catalog-feed [data-template-card]').count(), 1,
      '[' + target.name + '] Commerce filter must return only Commerce templates.');
    await page.locator('#template-filters [data-template-filter="All"]').click();

    await page.locator('#ovyx-template-search-input').fill('storefront');
    assert.equal(await page.locator('#templates-catalog-feed [data-template-card]').count(), 1,
      '[' + target.name + '] search must filter the published catalogue.');
    await page.locator('#ovyx-template-search-input').fill('');
    await page.locator('#template-filters [data-template-filter="All"]').click();

    await page.locator('[data-ovyx-template-action="preview"][data-template-id="tpl-saas"]').click();
    await page.locator('#ovyx-template-preview-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ovyx-template-preview-dialog img').getAttribute('src'), 'https://cdn.example.test/atlas.png',
      '[' + target.name + '] preview must use the published preview media.');
    assert.equal(await page.locator('#ovyx-template-preview-dialog').getByText('Pricing · /pricing').count(), 1,
      '[' + target.name + '] preview must show the actual included page list.');
    await page.locator('#ovyx-template-preview-dialog [data-close-preview]').first().click();

    await page.waitForFunction(() => window.ProjectCloudSync.activeUid === 'ovyx-template-browser-user', null, { timeout: 20000 });
    const saveResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/projects' && response.request().method() === 'POST', { timeout: 20000 });
    await page.locator('[data-ovyx-template-action="use"][data-template-id="tpl-saas"]').click();
    const saved = await saveResponse;
    assert.ok(saved.ok(), '[' + target.name + '] template copy must persist through the Projects API.');
    await page.waitForFunction(() => window.KernelState?.activeProject?.templateSource?.id === 'tpl-saas', null, { timeout: 10000 });
    assert.equal(projectWrites.some(entry => entry.project?.templateSource?.id === 'tpl-saas'), true,
      '[' + target.name + '] the cloud project write must contain the copied template source.');
    assert.equal(await page.evaluate(() => window.KernelState.activeProject.name), 'Atlas SaaS');

    await page.evaluate(() => window.Router?.go?.('templates'));
    await page.waitForFunction(() => document.querySelectorAll('#templates-catalog-feed [data-template-card]').length === 3, null, { timeout: 15000 });
    await page.locator('[data-ovyx-template-action="use"][data-template-id="tpl-portfolio"]').click();
    await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/, '') === 'pricing', null, { timeout: 10000 });

    console.log('[' + target.name + '] template library passed: browse, filter, search, preview, plan lock and cloud-backed project creation.');
    await page.close();
  }
} finally {
  await browser.close();
}
