import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.OVYX_TEST_BASE_URL || 'http://127.0.0.1:8789';
const origin = new URL(baseUrl).origin;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const response = await page.goto(new URL('/', origin).href, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  assert.ok(response, 'The local Pages app shell must return a navigation response.');
  assert.equal(response.status(), 200, 'The local Pages app shell must load successfully.');

  const iconLinks = page.locator('head link[rel~="icon"]');
  await page.waitForFunction(() => {
    const icons = Array.from(document.head.querySelectorAll('link[rel~="icon"]'));
    return icons.some(link => (link.getAttribute('href') || '').includes('/assets/ovyx-brand-mark.svg'));
  }, null, { timeout: 10000 });

  // Let deferred application scripts run, then simulate an old/late script
  // trying to replace the tab icon. The shell lock must remove the competing
  // declaration and restore the canonical OVYX diamond, not merely pass on load.
  await page.waitForFunction(() => !!window.OVYXShellFavicon, null, { timeout: 10000 });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const competing = document.createElement('link');
    competing.rel = 'shortcut icon';
    competing.type = 'image/png';
    competing.href = '/assets/ovyx-logo.svg?stale-favicon-regression';
    document.head.appendChild(competing);
    const canonical = document.querySelector('head link[rel~="icon"]');
    if (canonical) canonical.href = '/assets/ovyx-logo.svg?mutated-favicon-regression';
  });
  await page.waitForFunction(() => {
    const icons = Array.from(document.head.querySelectorAll('link[rel]')).filter(link =>
      String(link.rel || '').toLowerCase().split(/\s+/).includes('icon'));
    return icons.length === 1 &&
      icons[0].getAttribute('rel') === 'icon' &&
      icons[0].getAttribute('type') === 'image/svg+xml' &&
      icons[0].getAttribute('href') === '/assets/ovyx-brand-mark.svg?v=20261021-5';
  }, null, { timeout: 10000 });

  const icons = await iconLinks.evaluateAll(nodes => nodes.map(node => ({
    rel: node.getAttribute('rel'),
    type: node.getAttribute('type'),
    href: node.getAttribute('href'),
  })));

  assert.equal(icons.length, 1, 'The app shell must expose exactly one browser-tab favicon.');
  assert.equal(icons[0].rel, 'icon', 'The app-shell favicon must use the icon relation.');
  assert.equal(icons[0].type, 'image/svg+xml', 'The app-shell favicon must be the SVG brand mark.');
  assert.equal(
    icons[0].href,
    '/assets/ovyx-brand-mark.svg?v=20261021-5',
    'The browser-tab favicon must resolve to the real OVYX brand-mark SVG cache key.'
  );

  assert.equal(
    await page.locator('head link[rel~="icon"][href*="ovyx-app-favicon.svg"]').count(),
    0,
    'The app shell must not retain the obsolete app-favicon asset as its tab icon.'
  );
  assert.equal(
    await page.locator('script[src*="ovyx-app-favicon-guard.js"]').count(),
    0,
    'The removed global favicon override must not be loaded.'
  );

  const iconUrl = new URL(icons[0].href, origin).href;
  const iconResponse = await page.request.get(iconUrl);
  assert.equal(iconResponse.status(), 200, 'The actual favicon asset must be served successfully.');
  assert.ok(
    (iconResponse.headers()['content-type'] || '').toLowerCase().includes('image/svg+xml'),
    'The actual favicon response must have an SVG content type.'
  );

  const svg = await iconResponse.text();
  assert.ok(svg.startsWith('<svg xmlns='), 'The linked favicon must return valid SVG source.');
  assert.ok(svg.includes('<title id="title">OVYX</title>'), 'The linked SVG must carry the real OVYX brand title.');
  assert.ok(
    svg.includes('M32 5L55 18.5V45.5L32 59L9 45.5V18.5L32 5Z'),
    'The linked SVG must contain the real OVYX double-hexagon brand-mark geometry.'
  );

  const manifestResponse = await page.request.get(new URL('/manifest.json', origin).href);
  assert.equal(manifestResponse.status(), 200, 'The app manifest must load successfully.');
  const manifest = await manifestResponse.json();
  assert.ok(
    manifest.icons?.some(icon => icon.src === '/assets/ovyx-brand-mark.svg' && icon.type === 'image/svg+xml'),
    'The PWA manifest must use the same real OVYX brand mark.'
  );

  assert.equal(await page.locator('script[src*="ovyx-shell-favicon-lock.js"]').count(), 1, 'The authoritative shell favicon lock must load exactly once.');
  assert.ok(
    /no-store|no-cache/.test(response.headers()['cache-control'] || ''),
    'The HTML shell response must not reuse a cached page containing an old favicon reference.'
  );

  // The browser may request /favicon.ico implicitly when it has stored an older
  // tab icon. That route must return the same actual OVYX brand mark as the link.
  const implicitFavicon = await page.request.get(new URL('/favicon.ico', origin).href);
  assert.equal(implicitFavicon.status(), 200, 'The fallback /favicon.ico request must never return a stale/404 icon.');
  assert.ok(
    (implicitFavicon.headers()['content-type'] || '').toLowerCase().includes('image/svg+xml'),
    'The implicit favicon route must return a real SVG image.'
  );
  assert.ok(
    /no-store|no-cache/.test(implicitFavicon.headers()['cache-control'] || ''),
    'The implicit favicon must not be cached under the legacy /favicon.ico path.'
  );
  const fallbackSvg = await implicitFavicon.text();
  assert.ok(fallbackSvg.includes('M32 5L55 18.5V45.5L32 59L9 45.5V18.5L32 5Z'),
    'The fallback favicon route must return the same OVYX double-hexagon mark.');

  // Reproduce the user's exact failure: reload the app after another icon was
  // introduced, then require the same one-icon invariant from a fresh document.
  const refreshed = await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.ok(refreshed && refreshed.status() === 200, 'The app shell must refresh successfully.');
  await page.waitForFunction(() => !!window.OVYXShellFavicon, null, { timeout: 10000 });
  await page.waitForFunction(() => {
    const icons = Array.from(document.head.querySelectorAll('link[rel]')).filter(link =>
      String(link.rel || '').toLowerCase().split(/\s+/).includes('icon'));
    return icons.length === 1 &&
      icons[0].getAttribute('href') === '/assets/ovyx-brand-mark.svg?v=20261021-5';
  }, null, { timeout: 10000 });
  const afterRefresh = await page.evaluate(() => ({
    icons: Array.from(document.head.querySelectorAll('link[rel]')).filter(link =>
      String(link.rel || '').toLowerCase().split(/\s+/).includes('icon'))
      .map(link => ({ rel: link.getAttribute('rel'), href: link.getAttribute('href'), type: link.getAttribute('type') })),
    lockAtHeadStart: !!document.head.querySelector('script[src*="ovyx-shell-favicon-lock.js"]'),
  }));
  assert.equal(afterRefresh.icons.length, 1, 'A refresh must not resurrect a second/legacy favicon declaration.');
  assert.equal(afterRefresh.icons[0].href, '/assets/ovyx-brand-mark.svg?v=20261021-5',
    'The refreshed browser tab must still declare the current real OVYX logo.');
  assert.equal(afterRefresh.lockAtHeadStart, true, 'The favicon lock must reload with the refreshed shell.');

  console.log('OVYX app-shell favicon browser test passed: root load, explicit fallback, late override resistance, and clean refresh.');
} finally {
  await browser.close();
}
