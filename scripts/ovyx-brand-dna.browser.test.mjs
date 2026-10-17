import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const runtimePath = fileURLToPath(new URL('../assets/ovyx-app-studio-brand-dna.js', import.meta.url));
const runtimeSource = await readFile(runtimePath, 'utf8');
const profiles = new Map();
const generationRequests = [];
const profileOperations = [];
const html = \`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
  <main id="view-app-studio"><h1>App Studio fixture</h1></main>
  <script>window.firebase={auth:function(){return {currentUser:{getIdToken:async function(){return 'test-id-token';}}}}};window.showToast=function(){};</script>
  <script defer src="/assets/ovyx-app-studio-brand-dna.js"></script>
</body></html>\`;

function send(response, status, data, contentType = 'application/json') {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(contentType === 'application/json' ? JSON.stringify(data) : String(data));
}
async function bodyOf(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  try {
    if (url.pathname === '/') return send(response, 200, html, 'text/html; charset=utf-8');
    if (url.pathname === '/assets/ovyx-app-studio-brand-dna.js') return send(response, 200, runtimeSource, 'text/javascript; charset=utf-8');
    if (url.pathname === '/api/app-studio/brand-profile') {
      if (request.headers.authorization !== 'Bearer test-id-token') return send(response, 401, { ok:false, error:'Test auth required.' });
      const id = url.searchParams.get('id');
      if (request.method === 'GET') {
        profileOperations.push({ method:'GET', id });
        return send(response, 200, { ok:true, appId:id, profile:profiles.get(id) || null });
      }
      if (request.method === 'PUT') {
        const data = JSON.parse(await bodyOf(request));
        profileOperations.push({ method:'PUT', id, logoConfigured:Boolean(data.logoDataUrl), colors:data.colors });
        if (!id || data.appId !== id || !data.appName || !data.colors?.primary) return send(response, 400, { ok:false, error:'Invalid test profile.' });
        const profile = { ...data, version: (profiles.get(id)?.version || 0) + 1 };
        profiles.set(id, profile);
        return send(response, 200, { ok:true, appId:id, profile });
      }
      if (request.method === 'DELETE') {
        profiles.delete(id);
        return send(response, 200, { ok:true, appId:id, deleted:true });
      }
      return send(response, 405, { ok:false, error:'Unsupported test method.' });
    }
    if (url.pathname === '/api/ai/gateway') {
      if (request.method !== 'POST') return send(response, 405, { ok:false });
      const payload = JSON.parse(await bodyOf(request));
      generationRequests.push(payload);
      return send(response, 200, { ok:true, brandDNA:{ active:true, applied:true } });
    }
    return send(response, 404, { ok:false, error:'Not found.' });
  } catch (error) {
    return send(response, 500, { ok:false, error:String(error?.message || error) });
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless:true });
try {
  const desktop = await browser.newPage({ viewport:{ width:1280, height:900 } });
  const errors = [];
  desktop.on('pageerror', error => errors.push(error.message));
  await desktop.goto(origin, { waitUntil:'load' });
  await desktop.locator('#ovyx-app-studio-brand-dna-panel').waitFor();
  assert.equal(await desktop.locator('[data-brand-color]').count(), 7, 'The panel must expose all seven editable semantic colors.');
  await desktop.locator('[data-brand-app-name]').fill('Velora Homes');
  for (const [key, value] of Object.entries({
    primary:'#D81B60', secondary:'#302060', accent:'#00A6A6',
    background:'#FFF9FC', surface:'#FFFFFF', text:'#17121A', muted:'#5D4B56'
  })) {
    await desktop.locator('[data-brand-color="' + key + '"]').evaluate((input, next) => {
      input.value = next;
      input.dispatchEvent(new Event('input', { bubbles:true }));
    }, value);
  }
  await desktop.locator('[data-brand-layout-rules]').fill('Keep the logo full colour. Use readable forms and rounded property cards.');
  const logoBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/g6sAAAAASUVORK5CYII=', 'base64');
  await desktop.locator('[data-brand-logo-file]').setInputFiles({ name:'velora-logo.png', mimeType:'image/png', buffer:logoBuffer });
  await desktop.waitForFunction(() => document.querySelector('[data-brand-logo-preview]')?.src.startsWith('data:image/png;base64,'));
  await desktop.locator('[data-brand-save]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-brand-status]')?.textContent.includes('Saved and verified on the server.'));
  const saved = profiles.get('velora-homes');
  assert.ok(saved, 'The real UI must create an owner/app-scoped profile.');
  assert.ok(saved.logoDataUrl.startsWith('data:image/png;base64,'), 'The original PNG data must be persisted.');
  assert.equal(saved.colors.primary, '#D81B60');
  assert.equal(saved.colors.background, '#FFF9FC');
  assert.ok(saved.layoutRules[0].includes('full colour'), 'Brand layout rules must be persisted with the app.');
  const logoNaturalSize = await desktop.locator('[data-brand-logo-preview]').evaluate(img => ({ complete:img.complete, width:img.naturalWidth, height:img.naturalHeight }));
  assert.ok(logoNaturalSize.complete && logoNaturalSize.width > 0 && logoNaturalSize.height > 0, 'The full-colour preview must be a decodable real PNG.');
  await desktop.evaluate(async () => fetch('/api/ai/gateway', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ mode:'app-build', prompt:'Build a premium property app with multiple screens.', context:{ activeView:'appstudio', project:{ name:'Velora Homes' } } })
  }));
  assert.equal(generationRequests.length, 1, 'The actual fetch bridge must leave one generation call.');
  assert.equal(generationRequests[0].context.appBrandId, 'velora-homes', 'Generation must pass the selected per-app brand ID.');
  assert.equal(generationRequests[0].context.appName, 'Velora Homes');
  assert.equal(generationRequests[0].context.activeView, 'appstudio');
  assert.ok(errors.length === 0, 'The branding controls must not create browser errors: ' + errors.join('; '));

  const mobile = await browser.newPage({ viewport:{ width:390, height:844 } });
  await mobile.goto(origin, { waitUntil:'load' });
  await mobile.locator('#ovyx-app-studio-brand-dna-panel').waitFor();
  const mobileMetrics = await mobile.locator('#ovyx-app-studio-brand-dna-panel').evaluate(el => ({ width:el.getBoundingClientRect().width, scrollWidth:el.scrollWidth, viewport:document.documentElement.clientWidth }));
  assert.ok(mobileMetrics.width > 0 && mobileMetrics.scrollWidth <= mobileMetrics.viewport + 1, 'Brand controls must not create horizontal overflow on mobile.');
  const oldDefaultPrimary = await mobile.locator('[data-brand-color="primary"]').inputValue();
  await mobile.locator('[data-brand-app-name]').fill('Nova Health');
  const newDefaultPrimary = await mobile.locator('[data-brand-color="primary"]').inputValue();
  assert.notEqual(newDefaultPrimary, oldDefaultPrimary, 'Entering a different app name must derive a fresh palette when the user has not manually overridden colours.');
  await mobile.locator('[data-brand-save]').click();
  await mobile.waitForFunction(() => document.querySelector('[data-brand-status]')?.textContent.includes('Saved and verified on the server.'));
  assert.ok(profiles.has('nova-health'), 'A second app name must store a separate profile.');
  assert.notEqual(profiles.get('nova-health').colors.primary, profiles.get('velora-homes').colors.primary, 'New apps get their own default palette instead of inheriting a previous app palette.');
  assert.equal(profiles.get('nova-health').logoDataUrl, null, 'A second app must not inherit the first app uploaded logo.');
  assert.equal(profiles.get('velora-homes').logoDataUrl, saved.logoDataUrl, 'Changing the second app must not mutate the first app logo.');

  const liveBase = String(process.env.OVYX_E2E_BASE_URL || '').trim();
  if (liveBase) {
    const live = await browser.newPage({ viewport:{ width:1280, height:900 } });
    await live.goto(liveBase, { waitUntil:'domcontentloaded' });
    await live.waitForFunction(() => !!document.querySelector('#view-app-studio'), null, { timeout:30000 });
    await live.waitForFunction(() => !!document.querySelector('#ovyx-app-studio-brand-dna-panel'), null, { timeout:30000 });
    assert.equal(await live.locator('#ovyx-app-studio-brand-dna-panel').count(), 1, 'The real Pages shell must inject one Brand DNA panel into App Studio.');
    await live.close();
  }
  console.log('OVYX App Studio Brand DNA browser checks passed: real PNG preview, saved app profiles, color/rule persistence, generation request scoping, second-app isolation and desktop/mobile layout.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
