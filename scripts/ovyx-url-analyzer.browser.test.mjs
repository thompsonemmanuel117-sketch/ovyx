import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const runtimePath = fileURLToPath(new URL('../assets/ovyx-app-studio-url-analyzer.js', import.meta.url));
const runtimeSource = await readFile(runtimePath, 'utf8');
const requests = [];
const report = {
  schemaVersion: 1,
  source: { inputUrl: 'https://example.com/', canonicalUrl: 'https://example.com/', hostname: 'example.com', analyzedAt: '2026-10-18T00:00:00.000Z' },
  summary: { pagesDiscovered: 4, pagesInspected: 2, pagesBlocked: 1, internalLinksDiscovered: 3, assetsDiscovered: 3, pageLimitReached: false },
  siteMap: { rootUrl: 'https://example.com/', pages: [
    { url: 'https://example.com/', path: '/', title: 'Example Public Site', category: 'Home', depth: 0, status: 'inspected', httpStatus: 200, contentType: 'text/html' },
    { url: 'https://example.com/about', path: '/about', title: '<img src=x onerror=alert(1)>', category: 'About', depth: 1, status: 'inspected', httpStatus: 200, contentType: 'text/html' },
    { url: 'https://example.com/private', path: '/private', title: '', category: 'Other', depth: 1, status: 'robots-blocked', warning: 'Disallowed by robots.txt' }
  ] },
  branding: { name: 'Example Public Site', confidence: 'high',
    colors: { primary: '#D81B60', secondary: '#302060', accent: '#00A6A6', background: '#FFF9FC', text: '#17121A' },
    logo: { url: 'https://example.com/assets/logo.png', alt: 'Example logo' }, faviconUrl: 'https://example.com/favicon.svg' },
  assets: { total: 2, byType: { image: 1, stylesheet: 1 }, items: [
    { url: 'https://example.com/assets/logo.png', type: 'image', alt: 'Example logo', sameOrigin: true },
    { url: 'https://example.com/assets/site.css', type: 'stylesheet', sameOrigin: true }
  ] },
  capabilities: { can: ['Inspect public HTML', 'Discover same-origin links', 'Extract visible brand evidence'],
    cannot: ['Run source-site JavaScript', 'Verify real payments, forms, databases, or backend behavior'] },
  limitations: ['Asset binaries are listed by URL but are not downloaded or copied in this stage.'],
  warnings: ['One restricted page was not fetched.'], limits: { maxPagesInspected: 6 }
};
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
  '<main id="view-app-studio"><section id="ovyx-app-studio-brand-dna-panel">' +
  '<label>Brand name<input data-brand-app-name value="My App"></label>' +
  '<label>Primary<input type="color" data-brand-color="primary" value="#111111"></label>' +
  '<label>Secondary<input type="color" data-brand-color="secondary" value="#222222"></label>' +
  '<label>Accent<input type="color" data-brand-color="accent" value="#333333"></label>' +
  '<label>Background<input type="color" data-brand-color="background" value="#FFFFFF"></label>' +
  '<label>Surface<input type="color" data-brand-color="surface" value="#FFFFFF"></label>' +
  '<label>Text<input type="color" data-brand-color="text" value="#000000"></label>' +
  '<label>Muted<input type="color" data-brand-color="muted" value="#444444"></label>' +
  '</section></main><script>window.firebase={auth:function(){return {currentUser:{getIdToken:async function(){return "test-id-token";}}}}};</script>' +
  '<script defer src="/assets/ovyx-app-studio-url-analyzer.js"></script></body></html>';
function send(res, status, body, type) {
  res.writeHead(status, { 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(type && !type.includes('json') ? String(body) : JSON.stringify(body));
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') return send(res, 200, html, 'text/html; charset=utf-8');
  if (url.pathname === '/assets/ovyx-app-studio-url-analyzer.js') return send(res, 200, runtimeSource, 'text/javascript; charset=utf-8');
  if (url.pathname === '/api/app-studio/url-analyzer') {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ auth: req.headers.authorization, origin: req.headers.origin, body: JSON.parse(body) });
    if (req.headers.authorization !== 'Bearer test-id-token') return send(res, 401, { ok: false, message: 'Sign in required.' });
    return send(res, 200, { ok: true, report, requestId: 'url-analyzer-browser-test' });
  }
  return send(res, 404, { ok: false, message: 'Not found.' });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  desktop.on('pageerror', error => errors.push(error.message));
  await desktop.goto(base, { waitUntil: 'load' });
  await desktop.locator('#ovyx-app-studio-url-analyzer-panel').waitFor();
  await desktop.locator('[data-ua-url]').fill('https://example.com');
  await desktop.locator('[data-ua-analyze]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-ua-status]')?.textContent.includes('Analysis complete.'));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].auth, 'Bearer test-id-token');
  assert.deepEqual(requests[0].body, { url: 'https://example.com' });
  const reportText = await desktop.locator('[data-ua-results]').innerText();
  assert.match(reportText, /Example Public Site/);
  assert.match(reportText, /\/about/);
  assert.match(reportText, /robots-blocked/);
  assert.match(reportText, /D81B60/);
  assert.match(reportText, /not downloaded or copied/i);
  assert.match(reportText, /Run source-site JavaScript/);
  assert.match(reportText, /<img src=x onerror=alert\(1\)>/, 'Remote title markup must be plain text.');
  assert.equal(await desktop.locator('[data-ua-results] img[src="x"]').count(), 0, 'Remote title markup must not create elements or execute a handler.');
  assert.equal(await desktop.locator('[data-ua-results] a[target="_blank"]:not([rel*="noopener"])').count(), 0, 'Report links must isolate the opener.');
  assert.equal(await desktop.evaluate(() => window.__OVYX_URL_ANALYZER_LAST_REPORT__?.branding?.name), 'Example Public Site');
  await desktop.locator('[data-ua-results] button').filter({ hasText: 'Use detected palette' }).click();
  await desktop.waitForFunction(() => document.querySelector('#ovyx-app-studio-brand-dna-panel [data-brand-app-name]')?.value === 'Example Public Site');
  assert.equal(await desktop.locator('#ovyx-app-studio-brand-dna-panel [data-brand-color="primary"]').inputValue(), '#d81b60');
  assert.equal(await desktop.locator('#ovyx-app-studio-brand-dna-panel [data-brand-color="accent"]').inputValue(), '#00a6a6');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(base, { waitUntil: 'load' });
  await mobile.locator('#ovyx-app-studio-url-analyzer-panel').waitFor();
  const metrics = await mobile.locator('#ovyx-app-studio-url-analyzer-panel').evaluate(el => ({
    width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth, viewport: document.documentElement.clientWidth
  }));
  assert.ok(metrics.width > 0 && metrics.scrollWidth <= metrics.viewport + 1, 'Mobile analyzer must not overflow horizontally.');
  const liveBase = String(process.env.OVYX_E2E_BASE_URL || '').trim();
  if (liveBase) {
    const live = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await live.goto(liveBase, { waitUntil: 'domcontentloaded' });
    await live.waitForFunction(() => !!document.querySelector('#view-app-studio,#view-appstudio,[data-view="app-studio"],[data-view="appstudio"],[data-app-studio-root]'), null, { timeout: 30000 });
    await live.waitForFunction(() => !!document.querySelector('#ovyx-app-studio-url-analyzer-panel'), null, { timeout: 30000 });
    assert.equal(await live.locator('#ovyx-app-studio-url-analyzer-panel').count(), 1);
    await live.close();
  }
  assert.deepEqual(errors, [], 'The analyzer UI must not produce browser exceptions.');
  console.log('OVYX URL Analyzer browser checks passed: authenticated request, sitemap/branding/asset report, safe text rendering, Brand DNA palette transfer, and desktop/mobile layout.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
