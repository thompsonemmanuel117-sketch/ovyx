import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local Pages app.');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 } },
    { name: 'mobile', viewport: { width: 390, height: 844 } },
  ]) {
    const page = await browser.newPage({ viewport: target.viewport });
    page.setDefaultTimeout(15000);
    const errors = [];
    const calls = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.isNavigationRequest() && url.pathname === '/') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
            '<select id="v59-model-select"><option value="automatic">Old Automatic</option><option value="gemini">Old Gemini</option><option value="deepseek">Old DeepSeek</option><option value="anthropic">Old Claude</option><option value="openai">Old OpenAI</option></select>' +
            '<script>' +
            'let __currentUser={email:"owner@example.test",emailVerified:true,async getIdToken(){return "provider-test-token"}};' +
            'window.firebase={auth:()=>({get currentUser(){return __currentUser}})};' +
            'window.__toasts=[];window.showToast=(message,type)=>window.__toasts.push({message,type});' +
            'window.__setProviderUser=u=>{__currentUser=u};' +
            '</script><script defer src="/assets/ovyx-provider-availability.js?v=20261030-1"></script></body></html>',
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/ai/provider-availability*', async route => {
      const request = route.request();
      assert.equal(request.method(), 'GET');
      assert.equal(request.headers()['authorization'], 'Bearer provider-test-token',
        '[' + target.name + '] Cloudflare availability checks must use the signed-in token');
      assert.equal(request.headers()['cache-control'], undefined,
        '[' + target.name + '] do not send a caller cache preference that could override no-store handling');
      const url = new URL(request.url());
      const provider = url.searchParams.get('provider');
      calls.push(provider);
      assert.equal(provider, 'cloudflare-workers-ai',
        '[' + target.name + '] only Cloudflare Workers AI may be checked');
      await route.fulfill({
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          provider: 'cloudflare-workers-ai',
          label: 'Cloudflare Workers AI',
          status: 'READY',
          configured: true,
          connected: true,
          routingPolicy: 'cloudflare-only',
          message: 'OVYX AI is connected to Cloudflare Workers AI.',
        }),
      });
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.ok(), '[' + target.name + '] test shell failed to load');
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#v59-model-select').count(), 1,
      '[' + target.name + '] legacy selector fixture must be normalized rather than duplicated');
    assert.equal(await page.locator('script[src*="/assets/ovyx-provider-availability.js"]').count(), 1,
      '[' + target.name + '] provider availability asset did not load');

    const options = await page.locator('#v59-model-select option').evaluateAll(nodes =>
      nodes.map(node => ({ value: node.value, label: node.textContent }))
    );
    assert.deepEqual(options, [{ value: 'automatic', label: 'Cloudflare Workers AI' }],
      '[' + target.name + '] all third-party model choices must be removed from the live selector');
    assert.equal(await page.locator('#v59-model-select').getAttribute('aria-label'), 'AI engine: Cloudflare Workers AI');

    await page.evaluate(() => window.OVYXProviderAvailability.check());
    await page.waitForFunction(() => (window.__toasts || []).some(item =>
      item.type === 'success' && /OVYX AI is connected to Cloudflare Workers AI/.test(item.message)
    ));
    assert.deepEqual(calls, ['cloudflare-workers-ai']);

    await page.evaluate(() => window.OVYXProviderAvailability.check());
    await page.waitForFunction(() => (window.__toasts || []).filter(item =>
      item.type === 'success' && /OVYX AI is connected to Cloudflare Workers AI/.test(item.message)
    ).length >= 2);
    assert.deepEqual(calls, ['cloudflare-workers-ai', 'cloudflare-workers-ai'],
      '[' + target.name + '] repeated checks must stay on the Cloudflare binding and not probe vendor endpoints');

    await page.evaluate(() => window.__setProviderUser(null));
    await page.evaluate(() => window.OVYXProviderAvailability.check());
    await page.waitForFunction(() => (window.__toasts || []).some(item =>
      item.type === 'warning' && /Sign in to check Cloudflare AI availability/.test(item.message)
    ));
    assert.deepEqual(calls, ['cloudflare-workers-ai', 'cloudflare-workers-ai'],
      '[' + target.name + '] signed-out requests must not call the availability endpoint');
    assert.deepEqual(errors, [], '[' + target.name + '] provider availability browser errors: ' + errors.join('; '));

    console.log('PASS provider availability ' + target.name + ': Cloudflare-only selector, authenticated status check, repeated check and signed-out handling.');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('OVYX Cloudflare-only provider availability desktop/mobile tests passed.');
