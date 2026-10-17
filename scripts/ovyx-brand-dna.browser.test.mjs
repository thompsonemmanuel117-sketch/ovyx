import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { normalizeBrandDNA, applyBrandDNAToGeneratedOutput, brandContrastRatio } from '../functions/_lib/brand-dna.js';

const root = new URL('../', import.meta.url);
const runtimePath = fileURLToPath(new URL('../assets/ovyx-app-studio-brand-dna.js', import.meta.url));
const runtimeSource = await readFile(runtimePath, 'utf8');
const profiles = new Map();
const generationRequests = [];
const profileOperations = [];
let sampleApp = null;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
  <main id="view-app-studio"><h1>App Studio fixture</h1></main>
  <script>window.firebase={auth:function(){return {currentUser:{getIdToken:async function(){return 'test-id-token';}}}}};window.showToast=function(){};</script>
  <script defer src="/assets/ovyx-app-studio-brand-dna.js"></script>
</body></html>`;

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
    if (url.pathname === '/sample-app/' || url.pathname === '/sample-app/properties/') {
      if (!sampleApp) return send(response, 503, 'Sample app not prepared.', 'text/plain; charset=utf-8');
      return send(response, 200, url.pathname === '/sample-app/' ? sampleApp.home : sampleApp.properties, 'text/html; charset=utf-8');
    }
    if (url.pathname === '/brand/app-icon.svg') {
      if (!sampleApp) return send(response, 503, 'Sample icon not prepared.', 'text/plain; charset=utf-8');
      return send(response, 200, sampleApp.icon, 'image/svg+xml; charset=utf-8');
    }
    if (url.pathname === '/brand/brand-manifest.json') {
      if (!sampleApp) return send(response, 503, 'Brand manifest not prepared.', 'text/plain; charset=utf-8');
      return send(response, 200, sampleApp.manifest, 'application/manifest+json; charset=utf-8');
    }
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
  // Multicolour 96×96 sample logo: magenta tile, teal roof, white house, gold windows and purple door.
  const logoBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAABsklEQVR42u3du40CURBE0ckDhxAIgVA2OlIgFQLBBwNzgfm97qpubknPRtzDT0gM08QYYz13O/w9OhxCA0N4KwiiiyCILIQgrBCBoEIEQgoRCChGIJ4QgHBiBKIJAQgmRiCWEIBQYgQiAQAAB4DZczr+PwAI41dBaB2/PEKH+BUQSgKsie+OUA5gulw2HwCE8V0RygCMiO+IUAJgZHw3BHuAiPhOCNYAkfFdEGwBMuI7IFgCZMZXI9gBKOIrEawAlPFVCDYADvEVCBYATvGzEeQAjvEzEWQAzuEzISQAleJHI6QDVIwfiZAKUDl+FEIaQIf4EQgpAO/uRKVFIoQDfHoUVQcYhRAK8O1p3AFgBEIYwNzraBeAvQghAEveyDoB7EEYDrD0k0Q3gK0IAADw2v16nj2jtvZ2AABg/KkE0PLraAAAAAAAAADYA7D0xxkAAOAPsGVbAdYOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEpfNQsA8TXjAADgtwE4AAAAAFdQ5/8DAACB/5ABAATv+AAYAIAgjg+CQXwQDOKDYBAfCIPwQJiEB8Ik/K/ATIwx1nNP64wWQGU0DtYAAAAASUVORK5CYII=', 'base64');
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
  assert.ok(logoNaturalSize.complete && logoNaturalSize.width === 96 && logoNaturalSize.height === 96, 'The upload preview must be a real 96px PNG, not a placeholder.');
  const dna = normalizeBrandDNA(saved, { appName: 'Velora Homes' });
  const homeSource = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Velora Homes</title><style>body{margin:0;font-family:Arial,sans-serif}header{display:flex;align-items:center;gap:16px;padding:20px}.brand-logo{width:64px;height:64px;object-fit:contain}.btn-primary{background:#111827;color:#fff;padding:12px 16px;border:0;border-radius:10px}.content{padding:24px}</style></head><body><header><img class="brand-logo" src="/old-logo.svg" alt="Old logo"><strong>Velora Homes</strong></header><main class="content"><h1>Find a home that feels like yours</h1><p>Browse trusted properties with clear details.</p><button class="btn-primary" type="button">Explore homes</button></main></body></html>';
  const propertiesSource = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Properties — Velora Homes</title><style>body{margin:0;font-family:Arial,sans-serif}header{padding:20px}.property-card{margin:18px;padding:18px;border:1px solid #ddd;border-radius:14px}</style></head><body><header><nav><a href="/">Home</a><a href="/properties/">Properties</a></nav></header><main><article class="property-card"><h1>Three-bedroom home</h1><p>Request a private viewing.</p><button class="btn-primary" type="button">Request viewing</button></article></main></body></html>';
  const generatedApp = applyBrandDNAToGeneratedOutput({
    project: { name: 'Velora Homes' },
    files: {
      'index.html': homeSource,
      'src/pages/Properties.html': propertiesSource,
      'src/styles.css': '.property-card{border-radius:14px}'
    }
  }, dna, { appName: 'Velora Homes' });
  sampleApp = {
    home: generatedApp.files['index.html'],
    properties: generatedApp.files['src/pages/Properties.html'],
    icon: generatedApp.files['public/brand/app-icon.svg'].content,
    manifest: generatedApp.files['public/brand/brand-manifest.json'].content
  };
  assert.ok(sampleApp.home.includes(saved.logoDataUrl), 'The sample homepage must embed the exact uploaded multicolour logo.');
  assert.ok(sampleApp.properties.includes(saved.logoDataUrl), 'Every generated screen must display the same original full-colour logo.');
  assert.equal((sampleApp.home.match(/id="ovyx-brand-dna"/g) || []).length, 1, 'The homepage must receive exactly one semantic theme block.');
  assert.equal((sampleApp.properties.match(/id="ovyx-brand-dna"/g) || []).length, 1, 'The properties page must receive exactly one semantic theme block.');
  assert.ok(sampleApp.icon.includes('#D81B60') && sampleApp.icon.includes('#00A6A6'), 'The standalone app icon must use this app’s palette.');
  const sampleManifest = JSON.parse(sampleApp.manifest);
  assert.equal(sampleManifest.name, 'Velora Homes');
  assert.equal(sampleManifest.theme_color, '#D81B60');
  assert.ok(brandContrastRatio(dna.palette.text, dna.palette.background) >= 4.5, 'Body text must meet AA contrast on the configured background.');
  assert.ok(brandContrastRatio(dna.palette.onPrimary, dna.palette.primary) >= 4.5, 'Primary controls must use a readable foreground.');
  const samplePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await samplePage.goto(origin + '/sample-app/', { waitUntil: 'load' });
  const sampleLogo = samplePage.locator('[data-ovyx-brand-logo]');
  const sampleLogoNatural = await sampleLogo.evaluate(img => ({ complete: img.complete, width: img.naturalWidth, height: img.naturalHeight }));
  assert.equal(sampleLogoNatural.width, 96, 'The rendered sample app must show the original 96px brand logo.');
  assert.equal(sampleLogoNatural.height, 96);
  const visibleColors = await sampleLogo.evaluate(img => {
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const unique = new Set();
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i+3] > 0) unique.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]);
    return unique.size;
  });
  assert.ok(visibleColors > 5, 'The sample app must render multicolour logo pixels, not a monochrome substitute.');
  assert.equal(await samplePage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ovyx-brand-primary').trim()), '#D81B60');
  assert.equal(await samplePage.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 249, 252)');
  assert.equal(await samplePage.locator('.btn-primary').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(216, 27, 96)');
  assert.equal(await samplePage.locator('link[rel="manifest"][data-ovyx-brand-manifest="true"]').count(), 1);
  const manifestResponse = await samplePage.evaluate(async () => { const response = await fetch('/brand/brand-manifest.json'); return { ok: response.ok, body: await response.json() }; });
  assert.ok(manifestResponse.ok);
  assert.equal(manifestResponse.body.theme_color, '#D81B60');
  const iconResponse = await samplePage.evaluate(async () => { const response = await fetch('/brand/app-icon.svg'); return { ok: response.ok, body: await response.text() }; });
  assert.ok(iconResponse.ok && iconResponse.body.includes('#D81B60') && iconResponse.body.includes('#00A6A6'));
  const propertiesPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await propertiesPage.goto(origin + '/sample-app/properties/', { waitUntil: 'load' });
  const propertiesLogo = propertiesPage.locator('[data-ovyx-brand-logo]');
  const propertiesLogoNatural = await propertiesLogo.evaluate(img => ({ complete: img.complete, width: img.naturalWidth, height: img.naturalHeight }));
  assert.equal(propertiesLogoNatural.width, 96, 'Every screen must use the same original logo.');
  assert.equal(propertiesLogoNatural.height, 96);
  assert.equal(await propertiesPage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ovyx-brand-primary').trim()), '#D81B60', 'All screens must share the same primary token.');
  assert.equal(await propertiesPage.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(255, 249, 252)', 'All screens must share the configured brand background.');
  assert.equal(await propertiesPage.locator('link[rel="manifest"][data-ovyx-brand-manifest="true"]').count(), 1);
  assert.ok((await propertiesPage.locator('body').innerText()).includes('Three-bedroom home'));
  await samplePage.close(); await propertiesPage.close();
  await desktop.evaluate(async () => fetch('/api/ai/gateway', {
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
    await live.waitForFunction(() => !!document.querySelector('#view-app-studio, #view-appstudio, [data-view="app-studio"], [data-view="appstudio"], [data-app-studio-root]'), null, { timeout:30000 });
    await live.waitForFunction(() => !!document.querySelector('#ovyx-app-studio-brand-dna-panel'), null, { timeout:30000 });
    assert.equal(await live.locator('#ovyx-app-studio-brand-dna-panel').count(), 1, 'The real Pages shell must inject one Brand DNA panel into App Studio.');
    await live.close();
  }
  console.log('OVYX App Studio Brand DNA browser checks passed: real PNG preview, saved app profiles, color/rule persistence, generation request scoping, second-app isolation and desktop/mobile layout.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
