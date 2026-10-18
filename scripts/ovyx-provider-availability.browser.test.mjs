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
    page.on('pageerror', error => errors.push(error.message));

    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.isNavigationRequest() && url.pathname === '/') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
            '<select id="v59-model-select"><option value="automatic">OVYX Auto</option><option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option><option value="anthropic">Claude</option><option value="openai">OpenAI</option></select>' +
            '<script>' +
            'let __currentUser={email:"owner@example.test",emailVerified:true,async getIdToken(){return "provider-test-token"}};' +
            'window.firebase={auth:()=>({get currentUser(){return __currentUser}})};' +
            'window.__toasts=[];window.showToast=(message,type)=>window.__toasts.push({message,type});' +
            'window.__setProviderUser=u=>{__currentUser=u};' +
            '</script><script defer src="/assets/ovyx-provider-availability.js?v=20261018-1"></script></body></html>',
        });
        return;
      }
      await route.continue();
    });

    const calls = [];
    await page.route('**/api/ai/provider-availability*', async route => {
      const request = route.request();
      assert.equal(request.method(), 'GET');
      assert.equal(request.headers()['authorization'], 'Bearer provider-test-token', '[' + target.name + '] availability checks must use the signed-in token');
      const url = new URL(request.url());
      const provider = url.searchParams.get('provider');
      calls.push(provider);
      if (provider === 'gemini') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true, provider, label: 'Gemini', status: 'READY', configured: true, connected: true, message: 'Gemini is ready to use.',
        }) });
      } else if (provider === 'anthropic') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: false, provider, label: 'Claude', status: 'NOT_CONFIGURED', configured: false, connected: false, message: 'Claude isn’t available right now. Try OVYX Auto or choose another available AI option.',
        }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: false, provider, label: provider, status: 'RATE_LIMITED', configured: true, connected: false, message: provider + ' is not available right now. Try again later.',
        }) });
      }
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.ok(), '[' + target.name + '] test shell failed to load');
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#v59-model-select').count(), 1, '[' + target.name + '] provider selector fixture is missing');
    assert.equal(await page.locator('script[src*="/assets/ovyx-provider-availability.js"]').count(), 1, '[' + target.name + '] provider availability asset did not load');

    await page.locator('#v59-model-select').selectOption('gemini');
    await page.waitForFunction(() => (window.__toasts || []).some(item => item.type === 'success' && /Gemini is ready to use/.test(item.message)));
    assert.deepEqual(calls, ['gemini']);

    await page.locator('#v59-model-select').selectOption('anthropic');
    await page.waitForFunction(() => (window.__toasts || []).some(item => item.type === 'warning' && /Claude is not available/.test(item.message)));
    assert.deepEqual(calls, ['gemini', 'anthropic'], '[' + target.name + '] selector must recheck provider availability on each change');

    await page.locator('#v59-model-select').selectOption('automatic');
    await page.waitForFunction(() => (window.__toasts || []).some(item => item.type === 'info' && /OVYX Auto selects/.test(item.message)));
    assert.deepEqual(calls, ['gemini', 'anthropic'], '[' + target.name + '] Automatic mode should not ping a single provider endpoint');

    await page.evaluate(() => window.__setProviderUser(null));
    await page.locator('#v59-model-select').selectOption('openai');
    await page.waitForFunction(() => (window.__toasts || []).some(item => item.type === 'warning' && /Please sign in/.test(item.message)));
    assert.deepEqual(calls, ['gemini', 'anthropic'], '[' + target.name + '] signed-out selection must not call the availability API');
    assert.deepEqual(errors, [], '[' + target.name + '] provider availability browser errors: ' + errors.join('; '));

    console.log('PASS provider availability ' + target.name + ': authenticated READY status, missing-key messaging, repeated checks, Automatic mode, and signed-out handling.');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('OVYX provider availability desktop/mobile tests passed.');
