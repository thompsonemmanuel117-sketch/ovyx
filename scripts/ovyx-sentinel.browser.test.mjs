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
      const requestedUrl = new URL(request.url());
      if (request.isNavigationRequest() && requestedUrl.pathname === '/') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="sentinel-test-fixture">Sentinel test fixture</div>' +
            '<script>' +
            'let __currentUser=null;const __authListeners=[];window.__setSentinelUser=u=>{__currentUser=u;__authListeners.forEach(cb=>cb(u))};' +
            'window.firebase={auth:()=>({get currentUser(){return __currentUser},onAuthStateChanged:cb=>{__authListeners.push(cb);cb(__currentUser);return ()=>{}}})};' +
            'window.Router={go:view=>{window.__openedRoute=view;return view}};window.__allowAdminNavigation=true;window.__adminRefreshCalls=0;window.OVYXAdminWorkspace={refresh:async()=>{window.__adminRefreshCalls++;return window.__allowAdminNavigation},isAuthorized:()=>window.__allowAdminNavigation===true,open:async view=>{window.__openedRoute=view;return true}};' +
            'window.__recognizer=null;window.SpeechRecognition=class{start(){window.__recognizer=this}stop(){if(this.onend)this.onend()}};' +
            'Object.defineProperty(window,"SpeechSynthesisUtterance",{configurable:true,value:class{constructor(text){this.text=text}}});window.__spoken=[];Object.defineProperty(window,"speechSynthesis",{configurable:true,value:{cancel(){},speak(u){window.__spoken.push(u.text);if(u.onend)u.onend()}}});' +
            '</script><script defer src="/assets/ovyx-sentinel.js?v=20261018-4"></script><script defer src="/assets/ovyx-sentinel-avatar-3d.js?v=20261018-1"></script></body></html>',
        });
        return;
      }
      await route.continue();
    });

    // Force external 3D dependencies offline in this test: the visible fallback must remain usable.
    await page.route('https://esm.sh/**', route => route.abort());
    await page.route('https://models.codelove.in/**', route => route.abort());

    const calls = [];
    const companionCalls = [];
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
    const savedDiagnosis = {
      id: 'diag_old',
      reportId: latestReport.id,
      generatedAt: '2026-10-12T19:00:00.000Z',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      diagnosis: 'Historical diagnosis: previous saved check showed a resolved network timeout.',
      changesApplied: false,
      evidenceScope: 'latest-saved-sentinel-report-and-optional-read-only-ci-metadata',
      ciEvidenceStatus: 'skipped',
      historySaved: true,
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

    await page.route('**/api/admin/sentinel-companion', async route => {
      const req = route.request();
      assert.equal(req.method(), 'POST', '[' + target.name + '] Guardian chat must use POST');
      assert.equal(req.headers()['authorization'], 'Bearer sentinel-test-token', '[' + target.name + '] Guardian chat must send the signed-in owner token');
      const payload = req.postDataJSON();
      assert.equal(payload.action, 'chat', '[' + target.name + '] Guardian chat must use the explicit chat action');
      assert.ok(Array.isArray(payload.messages) && payload.messages.length > 0, '[' + target.name + '] Guardian chat must send the bounded conversation turns');
      companionCalls.push({ payload, authorization: req.headers()['authorization'] });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          text: 'Hey boss, I’m happy to help. I’m here and ready to work through OVYX with you.',
          provider: 'cloudflare-workers-ai',
          historySaved: false,
          sessionOnly: true,
        }),
      });
    });
    await page.route('**/api/admin/guardian-patch', async route => {
      const req = route.request();
      assert.equal(req.headers()['authorization'], 'Bearer sentinel-test-token', '[' + target.name + '] patch capability requests must use the signed-in owner token');
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'GUARDIAN_ADMIN_REQUIRED', message: 'Test owner verification denied; patch controls must fail closed.' })
      });
    });
    await page.route('**/api/admin/sentinel-diagnose', async route => {
      const req = route.request();
      assert.equal(req.method(), 'POST', '[' + target.name + '] AI diagnosis must use POST');
      assert.equal(req.headers()['authorization'], 'Bearer sentinel-test-token', '[' + target.name + '] AI diagnosis must send the signed-in owner token');
      calls.push({ method: req.method(), payload: { diagnosis: true } });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          reportId: 'run_scan',
          generatedAt: '2026-10-12T21:01:00.000Z',
          model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          diagnosis: 'Findings: the schedule warning is evidence. Likely cause: the last scheduled scan is not recent. Next safe step: check the Cron deployment workflow. No repair was applied.',
          changesApplied: false,
          evidenceScope: 'latest-saved-sentinel-report-and-optional-read-only-ci-metadata',
          id: 'diag_new',
          historySaved: true
        })
      });
    });
    await page.route('**/api/admin/sentinel', async route => {
      const req = route.request();
      const authorization = req.headers()['authorization'];
      assert.equal(authorization, 'Bearer sentinel-test-token', '[' + target.name + '] Sentinel API must send the signed-in user token');
      const payload = req.method() === 'POST' ? req.postDataJSON() : null;
      calls.push({ method: req.method(), payload });
      if (req.method() === 'GET') {
        const activeReport = scanCount > 0 ? scannedReport : latestReport;
        const fixPlan = scanCount > 0 ? {
          sourceReportId: scannedReport.id,
          generatedAt: '2026-10-12T21:00:01.000Z',
          status: 'attention_required',
          summary: 'Prepared 1 reviewable task from 0 critical findings and 1 warning.',
          automaticChanges: false,
          tasks: [{
            id: 'background_scheduler:SCHEDULE_NOT_RECENTLY_CONFIRMED',
            checkId: 'background_scheduler',
            code: 'SCHEDULE_NOT_RECENTLY_CONFIRMED',
            priority: 'warning',
            title: 'Verify background Sentinel scheduling',
            issue: 'A recent scheduled Sentinel run has not been recorded.',
            steps: ['Confirm the separate ovyx-sentinel-scheduler Worker is deployed with the 30-minute Cron Trigger.'],
          }],
          note: 'Advisory only. No changes have been applied.',
        } : {
          sourceReportId: latestReport.id,
          status: 'clear',
          summary: 'No remediation steps are indicated by the latest saved checks.',
          automaticChanges: false,
          tasks: [],
          note: 'Advisory only. No changes have been applied.',
        };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, latestReport: activeReport, latestDiagnosis: savedDiagnosis, diagnoses: [savedDiagnosis], fixPlan, lastScanAt: activeReport.finishedAt, lastDiagnosisAt: savedDiagnosis.generatedAt, reports: [activeReport] }) });
        return;
      }
      assert.equal(payload.action, 'scan', '[' + target.name + '] scan requests must use the allowlisted scan action');
      scanCount += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, report: scannedReport, message: 'Sentinel checks completed.' }) });
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.ok(), '[' + target.name + '] fixture shell failed to load');
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#sentinel-test-fixture').count(), 1, '[' + target.name + '] intercepted fixture page was not used');

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
    await page.locator('#ovyx-sentinel-avatar-stage').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#ovyx-sentinel-avatar-stage .ovsx3-status')?.textContent.includes('Voice chat is still available'), null, { timeout: 10000 });
    assert.match(await page.locator('#ovyx-sentinel-avatar-stage .ovsx3-status').innerText(), /Voice chat is still available/i, '[' + target.name + '] Sentinel must remain usable when remote 3D assets are unavailable');
    await page.waitForFunction(() => document.querySelector('#ovyx-sentinel-panel [data-ovsx-report]')?.textContent.includes('Latest report'), null, { timeout: 10000 }).catch(() => {});
    assert.match(await page.locator('#ovyx-sentinel-panel [data-ovsx-status]').innerText(), /Sentinel is ready|Last saved scan|last health review|latest scan|Sentinel server|administrator/i, '[' + target.name + '] Sentinel report bootstrap failed: ' + await page.locator('#ovyx-sentinel-panel [data-ovsx-status]').innerText());
    assert.match(await page.locator('#ovyx-sentinel-panel [data-ovsx-report]').innerText(), /Latest report · HEALTHY/i, '[' + target.name + '] saved report was not rendered');
    await page.locator('[data-ovsx-diagnosis-history]').waitFor({ state: 'visible' });
    assert.match(await page.locator('[data-ovsx-diagnosis-history] summary').innerText(), /Previous diagnoses \(1\)/i, '[' + target.name + '] previous diagnosis history should load from the saved report endpoint');
    await page.locator('[data-ovsx-diagnosis-history] summary').click();
    await page.locator('[data-ovsx-history-id]').click();
    assert.match(await page.locator('[data-ovsx-diagnosis]').innerText(), /Historical diagnosis: previous saved check/i, '[' + target.name + '] the owner should be able to reopen a saved diagnosis');

    await page.locator('[data-ovsx="wake"]').click();
    assert.match(await page.locator('[data-ovsx-status]').innerText(), /Voice activation is on/i);
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

    await page.locator('[data-ovsx="plan"]').click();
    await page.locator('[data-ovsx-plan]').waitFor({ state: 'visible' });
    assert.match(await page.locator('[data-ovsx-plan]').innerText(), /Safe remediation plan/i, '[' + target.name + '] the fix plan panel should be shown');
    assert.match(await page.locator('[data-ovsx-plan]').innerText(), /Verify background Sentinel scheduling/i, '[' + target.name + '] the saved warning should produce a relevant remediation checklist');
    assert.match(await page.locator('[data-ovsx-plan]').innerText(), /Advisory only/i, '[' + target.name + '] the plan must clearly state that it does not apply changes');

    await page.locator('[data-ovsx="diagnose"]').click();
    await page.locator('[data-ovsx-diagnosis]').waitFor({ state: 'visible' });
    assert.match(await page.locator('[data-ovsx-diagnosis]').innerText(), /AI-assisted incident review/i, '[' + target.name + '] the AI diagnostic result should be shown separately from a rule-based plan');
    assert.match(await page.locator('[data-ovsx-diagnosis]').innerText(), /schedule warning is evidence/i, '[' + target.name + '] the diagnostic result should be visible as plain text');
    assert.match(await page.locator('[data-ovsx-diagnosis]').innerText(), /This is a read-only review\. No code, settings, credentials, or live releases were changed/i, '[' + target.name + '] the UI must disclose the diagnosis-only boundary');
    assert.match(await page.locator('[data-ovsx-diagnosis-history] summary').innerText(), /Previous diagnoses \(2\)/i, '[' + target.name + '] a newly saved diagnosis must join prior history');

    await page.locator('[data-ovsx="patch"]').click();
    await page.locator('[data-ovsx-patch-tools]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('[data-ovsx="patch-prepare"]')?.disabled === true, null, { timeout: 10000 });
    assert.match(await page.locator('[data-ovsx-patch-tools]').innerText(), /Reviewable code fix/i, '[' + target.name + '] Guardian patch review panel should be visible to the authenticated owner');
    assert.equal(await page.locator('[data-ovsx="patch-prepare"]').isDisabled(), true, '[' + target.name + '] patch preparation must stay disabled when the server cannot verify the owner credentials');
    assert.equal(await page.locator('[data-ovsx="patch-apply"]').isDisabled(), true, '[' + target.name + '] pull-request creation must remain disabled without server-confirmed capabilities');

    // The conversation is multi-turn, spoken aloud, and authenticated. Follow-up
    // messages should include only the recent session conversation, not server-persisted chat.
    await page.waitForFunction(() => !!window.__recognizer, null, { timeout: 10000 });
    await page.evaluate(() => {
      const item = [{ transcript: 'OVYX how are you today' }];
      item.isFinal = true;
      const results = [item];
      results.item = i => results[i];
      window.__recognizer.onresult({ resultIndex: 0, results });
    });
    await page.waitForFunction(() => window.__spoken.some(text => /happy to help/i.test(text)), null, { timeout: 10000 });
    assert.equal(companionCalls.length, 1, '[' + target.name + '] casual speech should open a natural conversational response');
    assert.equal(companionCalls[0].payload.messages.at(-1).role, 'user');
    assert.match(companionCalls[0].payload.messages.at(-1).content, /how are you today/i);
    assert.ok(companionCalls[0].authorization.includes('sentinel-test-token'));

    await page.waitForFunction(() => !!window.__recognizer, null, { timeout: 10000 });
    await page.locator('[data-ovsx-chat-input]').fill('What did I just ask you?');
    await page.locator('[data-ovsx-chat-form] button[type="submit"]').click();
    await page.waitForFunction(() => window.__spoken.filter(text => /happy to help/i.test(text)).length >= 2, null, { timeout: 10000 });
    assert.equal(companionCalls.length, 2, '[' + target.name + '] the text fallback should use the same companion endpoint');
    assert.ok(companionCalls[1].payload.messages.some(item => item.role === 'user' && /how are you today/i.test(item.content)), '[' + target.name + '] follow-up conversation should include the previous user turn');
    assert.ok(companionCalls[1].payload.messages.some(item => item.role === 'assistant' && /happy to help/i.test(item.content)), '[' + target.name + '] follow-up conversation should include the prior Guardian reply');

    await page.waitForFunction(() => !!window.__recognizer, null, { timeout: 10000 });
    await page.evaluate(() => {
      const item = [{ transcript: 'OVYX open Web Studio' }];
      item.isFinal = true;
      const results = [item];
      results.item = i => results[i];
      window.__recognizer.onresult({ resultIndex: 0, results });
    });
    await page.waitForFunction(() => window.__openedRoute === 'webstudio', null, { timeout: 10000 });
    assert.ok((await page.evaluate(() => window.__spoken)).some(text => /Opening Web Studio/i.test(text)), '[' + target.name + '] Guardian should speak a confirmation after a supported navigation action');

    await page.waitForFunction(() => !!window.__recognizer, null, { timeout: 10000 });
    await page.evaluate(() => {
      const item = [{ transcript: 'OVYX open Admin Pricing' }];
      item.isFinal = true;
      const results = [item];
      results.item = i => results[i];
      window.__recognizer.onresult({ resultIndex: 0, results });
    });
    await page.waitForFunction(() => window.__openedRoute === 'admin-pricing', null, { timeout: 10000 });
    assert.ok(await page.evaluate(() => window.__adminRefreshCalls > 0), '[' + target.name + '] Admin navigation must ask the real owner workspace to verify access');
    assert.ok((await page.evaluate(() => window.__spoken)).some(text => /Opening Admin Pricing and Plans/i.test(text)), '[' + target.name + '] Guardian should speak a confirmation after authorized Admin navigation');

    await page.waitForFunction(() => !!window.__recognizer, null, { timeout: 10000 });
    await page.evaluate(() => { window.__allowAdminNavigation = false; window.__openedRoute = null; });
    await page.evaluate(() => {
      const item = [{ transcript: 'OVYX open Admin Brain' }];
      item.isFinal = true;
      const results = [item];
      results.item = i => results[i];
      window.__recognizer.onresult({ resultIndex: 0, results });
    });
    await page.waitForFunction(() => document.querySelector('#ovyx-sentinel-panel [data-ovsx-status]')?.textContent.includes('verify owner access'), null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__openedRoute), null, '[' + target.name + '] an unverified Admin navigation request must not open a protected route');
    assert.ok((await page.evaluate(() => window.__spoken)).some(text => /could not safely open that area/i.test(text)), '[' + target.name + '] blocked Admin navigation must give a spoken explanation');

    await page.waitForFunction(() => !!window.__recognizer, null, { timeout: 10000 });
    await page.evaluate(() => { window.__allowAdminNavigation = true; });
    await page.evaluate(() => {
      const item = [{ transcript: 'go to sleep' }];
      item.isFinal = true;
      const results = [item];
      results.item = i => results[i];
      window.__recognizer.onresult({ resultIndex: 0, results });
    });
    await page.waitForFunction(() => document.querySelector('#ovyx-sentinel-panel')?.hidden === true && document.querySelector('#ovyx-sentinel-root')?.getAttribute('data-ovyx-sleeping') === '1', null, { timeout: 10000 });
    assert.equal(await page.locator('#ovyx-sentinel-launch').isVisible(), false, '[' + target.name + '] sleep should hide the Guardian character while leaving an enabled wake word active');

    await page.waitForFunction(() => !!window.__recognizer, null, { timeout: 10000 });
    await page.evaluate(() => {
      const item = [{ transcript: 'OVYX' }];
      item.isFinal = true;
      const results = [item];
      results.item = i => results[i];
      window.__recognizer.onresult({ resultIndex: 0, results });
    });
    await page.locator('#ovyx-sentinel-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ovyx-sentinel-launch').isVisible(), true, '[' + target.name + '] wake word should bring the Guardian back');

    await page.locator('[data-ovsx="wake"]').click();
    assert.match(await page.locator('[data-ovsx-status]').innerText(), /Wake word disabled/i);
    assert.deepEqual(errors, [], '[' + target.name + '] Sentinel/Guardian runtime errors: ' + errors.join('; '));
    assert.ok(calls.some(call => call.method === 'GET') && calls.some(call => call.method === 'POST'), '[' + target.name + '] saved-report, scan and diagnosis routes should be exercised');
    assert.ok(calls.some(call => call.payload && call.payload.diagnosis === true), '[' + target.name + '] the explicit AI diagnosis route should be exercised');
    console.log('PASS Sentinel ' + target.name + ': admin-only visibility, authenticated API, report rendering, opt-in wake word, scan command, voice reply, and pause controls.');
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('OVYX Sentinel desktop/mobile browser tests passed.');
