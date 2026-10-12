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

    await page.route(baseURL.replace(/\/+$/, '') + '/', route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' +
        '<script>' +
        'let __currentUser=null;const __authListeners=[];window.__setSentinelUser=u=>{__currentUser=u;__authListeners.forEach(cb=>cb(u))};' +
        'window.firebase={auth:()=>({get currentUser(){return __currentUser},onAuthStateChanged:cb=>{__authListeners.push(cb);cb(__currentUser);return ()=>{}}})};' +
        'window.__recognizer=null;window.SpeechRecognition=class{start(){window.__recognizer=this}stop(){if(this.onend)this.onend()}};' +
        'window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};window.__spoken=[];window.speechSynthesis={cancel(){},speak(u){window.__spoken.push(u.text);if(u.onend)u.onend()}};' +
        '</script><script defer src="/assets/ovyx-sentinel.js?v=20261012-1"></script></body></html>',
    }));

    const calls = [];
    let scanCount = 0;
    const latestReport = {
      id: 'run_initial',
      status: 'healthy',
      finishedAt: '2026-10-12T20:00:00.000Z',
      checkedCount: 5,
      passedCount: 5,
      criticalCount: 0,
      warningCount: 0,
      checks: [
        { id: 'app_shell', path: '/', status: 'pass', summary: 'Application shell returned HTML.' },
        { id: 'health', path: '/api/health', status: 'pass', summary: 'Platform health is healthy.' },
      ],
    };
    const scannedReport = {
      ...latestReport,
      id: 'run_scan',
      status: 'needs_attention',
      finishedAt: '2026-10-12T21:00:00.000Z',
      passedCount: 4,
      warningCount: 1,
      checks: [...latestReport.checks, { id: 'sentinel', path: 'Scheduler', status: 'warning', summary: 'No recent scheduled run is confirmed.' }],
    };

    await page.route('**/api/admin/sentinel', async route => {
      const req = route.request();
      const authorization = req.headers()['authorization'];
      assert.equal(authorization, 'Bearer sentinel-test-token', '[' + target.name + '] Sentinel API must send the signed-in user token');
      const payload = req.method() === 'POST' ? req.postDataJSON() : null;
      calls.push({ method: req.method(), payload });
      if (req.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, latestReport, lastScanAt: latestReport.finishedAt, reports: [latestReport] }) });
        return;
      }
      assert.equal(payload.action, 'scan', '[' + target.name + '] scan requests must use the allowlisted scan action');
      scanCount += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, report: scannedReport, message: 'Sentinel checks completed.' }) });
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.ok(), '[' + target.name + '] fixture shell failed to load');
    await page.waitForLoadState('networkidle');

    assert.equal(await page.locator('#ovyx-sentinel-launch').count(), 0, '[' + target.name + '] Sentinel must stay hidden before authenticated admin identity exists');
    await page.evaluate(() => window.__setSentinelUser({ email: 'other@example.test', emailVerified: true, async getIdToken() { return 'not-admin-token'; } }));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#ovyx-sentinel-launch').count(), 0, '[' + target.name + '] Sentinel must remain hidden from normal users');

    await page.evaluate(() => window.__setSentinelUser({ email: 'ovyxsupportteam@gmail.com', emailVerified: true, async getIdToken() { return 'sentinel-test-token'; } }));
    await page.locator('#ovyx-sentinel-launch').waitFor({ state: 'visible' });
    const script = page.locator('script[src*="/assets/ovyx-sentinel.js"]');
    assert.equal(await script.count(), 1, '[' + target.name + '] Sentinel browser runtime should be loaded once');
    await page.locator('#ovyx-sentinel-launch').click();
    await page.locator('#ovyx-sentinel-panel').waitFor({ state: 'visible' });
    await page.getByText('Latest report · HEALTHY').waitFor({ state: 'visible' });

    await page.locator('[data-ovsx="wake"]').click();
    assert.match(await page.locator('[data-ovsx-status]').innerText(), /Wake word enabled/i);
    await page.evaluate(() => {
      const item = [{ transcript: 'OVYX scan now' }];
      item.isFinal = true;
      const results = [item];
      results.item = i => results[i];
      window.__recognizer.onresult({ resultIndex: 0, results });
    });
    await page.waitForFunction(() => document.querySelector('#ovyx-sentinel-panel [data-ovsx-status]')?.textContent.includes('Sentinel scan finished'), null, { timeout: 15000 });
    assert.equal(scanCount, 1, '[' + target.name + '] saying the wake word and scan command should trigger a single authenticated scan');
    await page.getByText('Latest report · NEEDS ATTENTION').waitFor({ state: 'visible' });
    assert.ok((await page.evaluate(() => window.__spoken)).some(text => /scan finished/i.test(text)), '[' + target.name + '] wake-word command should speak the result when speech synthesis exists');

    await page.locator('[data-ovsx="wake"]').click();
    assert.match(await page.locator('[data-ovsx-status]').innerText(), /Wake word paused/i);
    assert.deepEqual(errors, [], '[' + target.name + '] Sentinel runtime errors: ' + errors.join('; '));
    assert.ok(calls.some(call => call.method === 'GET') && calls.some(call => call.method === 'POST'), '[' + target.name + '] both saved-report and scan routes should be exercised');
    console.log('PASS Sentinel ' + target.name + ': admin-only visibility, authenticated API, report rendering, opt-in wake word, scan command, voice reply, and pause controls.');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('OVYX Sentinel desktop/mobile browser tests passed.');
