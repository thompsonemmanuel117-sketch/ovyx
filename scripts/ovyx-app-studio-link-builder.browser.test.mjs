import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const read = path => readFile(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8');
const brandRuntime = await read('assets/ovyx-app-studio-brand-dna.js');
const analyzerRuntime = await read('assets/ovyx-app-studio-url-analyzer.js');
const builderRuntime = await read('assets/ovyx-app-studio-link-builder.js');
const requests = { analyzer: [], generation: [], profile: [] };
const eventOrder = [];
const existingLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8x8AAwMCAO+/g6sAAAAASUVORK5CYII=';
const profiles = new Map([['coastal-living', {
  appId: 'coastal-living', appName: 'Coastal Living', logoDataUrl: existingLogo,
  colors: { primary: '#111111', secondary: '#222222', accent: '#333333', background: '#FFFFFF', surface: '#FFFFFF', text: '#000000', muted: '#444444' },
  layoutRules: ['Preserve the original full-colour logo.'], version: 1
}]]);
const report = {
  schemaVersion: 1,
  source: { inputUrl: 'https://coastal.example/', canonicalUrl: 'https://coastal.example/', hostname: 'coastal.example', analyzedAt: '2026-10-18T00:00:00.000Z' },
  summary: { pagesDiscovered: 3, pagesInspected: 3, pagesBlocked: 0, internalLinksDiscovered: 2, assetsDiscovered: 2, pageLimitReached: false },
  siteMap: { rootUrl: 'https://coastal.example/', pages: [
    { url: 'https://coastal.example/', path: '/', title: 'Coastal Living', category: 'Home', depth: 0, status: 'inspected', httpStatus: 200, contentType: 'text/html', headings: ['Find your calm by the coast'], description: 'Thoughtful coastal homes and living.' },
    { url: 'https://coastal.example/collections', path: '/collections', title: 'Collections', category: 'Products', depth: 1, status: 'inspected', httpStatus: 200, contentType: 'text/html', headings: ['Curated homes'], description: 'Explore curated homes.' },
    { url: 'https://coastal.example/about', path: '/about', title: 'Our Story', category: 'About', depth: 1, status: 'inspected', httpStatus: 200, contentType: 'text/html', headings: ['A more considered way home'], description: 'Our story.' }
  ] },
  branding: { name: 'Coastal Living', confidence: 'high', colors: { primary: '#D81B60', secondary: '#302060', accent: '#00A6A6', background: '#FFF9FC', surface: '#FFFFFF', text: '#17121A', muted: '#5D4B56' }, logo: { url: 'https://coastal.example/assets/logo.png', alt: 'Coastal Living' }, faviconUrl: 'https://coastal.example/favicon.svg' },
  assets: { total: 2, byType: { image: 1, stylesheet: 1 }, items: [
    { url: 'https://coastal.example/assets/logo.png', type: 'image', alt: 'Coastal Living logo', sameOrigin: true },
    { url: 'https://coastal.example/assets/site.css', type: 'stylesheet', sameOrigin: true }
  ] },
  capabilities: { can: ['Inspect public HTML', 'Discover same-origin links', 'Extract visible brand evidence'], cannot: ['Run source-site JavaScript', 'Verify live payments or backend behavior'] },
  limitations: ['This fixture verifies only routes explicitly marked inspected.'],
  warnings: [], limits: { maxPagesInspected: 6 }
};
const generated = {
  summary: 'A responsive three-page coastal property app with working local navigation.',
  project: { name: 'Coastal Living', description: 'First link-based app with separate inspected routes.' },
  files: {
    'index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Coastal Living</title><link rel="stylesheet" href="styles.css"></head><body><header><nav aria-label="Main navigation"><a href="/">Home</a><a href="/collections/">Collections</a><a href="/about/">Our story</a></nav></header><main><section id="home"><h1>Find your calm by the coast</h1><p>Thoughtful homes, considered spaces and a clearer way to find your next chapter.</p><button id="counter" type="button">Tap 0</button></section></main><script src="app.js"></script></body></html>',
    'pages/collections.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Collections | Coastal Living</title><link rel="stylesheet" href="../styles.css"></head><body><header><nav aria-label="Main navigation"><a href="/">Home</a><a href="/collections/">Collections</a><a href="/about/">Our story</a></nav></header><main><section><h1>Curated coastal collections</h1><p>Explore spaces selected for light, warmth and everyday living.</p></section></main><script src="../app.js"></script></body></html>',
    'pages/about.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Our Story | Coastal Living</title><link rel="stylesheet" href="../styles.css"></head><body><header><nav aria-label="Main navigation"><a href="/">Home</a><a href="/collections/">Collections</a><a href="/about/">Our story</a></nav></header><main><section><h1>A more considered way home</h1><p>Built around calm service and useful details.</p></section></main><script src="../app.js"></script></body></html>',
    'styles.css': ':root{--ovyx-brand-primary:#D81B60;--ovyx-brand-secondary:#302060;--ovyx-brand-accent:#00A6A6;--ovyx-brand-background:#FFF9FC;--ovyx-brand-text:#17121A}body{margin:0;font-family:Arial,sans-serif;background:var(--ovyx-brand-background);color:var(--ovyx-brand-text)}header{padding:18px 5%;background:white}nav{display:flex;gap:18px;flex-wrap:wrap}nav a{color:var(--ovyx-brand-secondary);font-weight:700;text-decoration:none}main{max-width:900px;margin:auto;padding:34px 5%}section{padding:22px 0;scroll-margin-top:20px}button{padding:12px 16px;border:0;border-radius:999px;background:var(--ovyx-brand-primary);color:white;cursor:pointer}a:focus-visible,button:focus-visible{outline:3px solid var(--ovyx-brand-accent);outline-offset:3px}',
    'app.js': "let taps=0;document.querySelector('#counter')?.addEventListener('click',function(){taps+=1;this.textContent='Tap '+taps});"
  }
};
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' +
  '<main id="view-appstudio"><div id="app-studio-clean-canvas"></div></main>' +
  '<script>window.firebase={auth:function(){return {currentUser:{getIdToken:async function(){return "test-id-token";}}}}};' +
  'window.KernelState={activeProject:{id:"existing-project",name:"Do not replace me"}};' +
  'window.OVYXAIService={generate:async function(options){const response=await fetch("/api/ai/gateway",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Authorization:"Bearer test-id-token"},body:JSON.stringify(options)});const data=await response.json();if(!response.ok)throw new Error(data.message||"Gateway failed");return data;}};</script>' +
  '<script src="/assets/ovyx-app-studio-brand-dna.js"></script>' +
  '<script src="/assets/ovyx-app-studio-url-analyzer.js"></script>' +
  '<script src="/assets/ovyx-app-studio-link-builder.js"></script>' +
  '</body></html>';

function send(res, status, body, type) {
  res.writeHead(status, { 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(type && !type.includes('json') ? String(body) : JSON.stringify(body));
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') return send(res, 200, html, 'text/html; charset=utf-8');
  if (url.pathname === '/assets/ovyx-app-studio-brand-dna.js') return send(res, 200, brandRuntime, 'text/javascript; charset=utf-8');
  if (url.pathname === '/assets/ovyx-app-studio-url-analyzer.js') return send(res, 200, analyzerRuntime, 'text/javascript; charset=utf-8');
  if (url.pathname === '/assets/ovyx-app-studio-link-builder.js') return send(res, 200, builderRuntime, 'text/javascript; charset=utf-8');
  if (url.pathname === '/api/app-studio/url-analyzer') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.analyzer.push({ auth: req.headers.authorization, body });
    if (req.headers.authorization !== 'Bearer test-id-token') return send(res, 401, { ok: false, message: 'Sign in required.' });
    if (body.url !== 'https://coastal.example') return send(res, 400, { ok: false, message: 'Unexpected test URL.' });
    return send(res, 200, { ok: true, report, requestId: 'stage-3-analyzer-fixture' });
  }
  if (url.pathname === '/api/app-studio/brand-profile') {
    let raw = '';
    if (req.method === 'PUT') for await (const chunk of req) raw += chunk;
    const profileId = url.searchParams.get('id') || '';
    if (req.headers.authorization !== 'Bearer test-id-token') return send(res, 401, { ok: false, message: 'Sign in required.' });
    if (req.method === 'GET') {
      requests.profile.push({ method: 'GET', id: profileId });
      return send(res, 200, { ok: true, profile: profiles.get(profileId) || null });
    }
    if (req.method === 'PUT') {
      const body = JSON.parse(raw);
      requests.profile.push({ method: 'PUT', id: profileId, body });
      const saved = { ...body, id: profileId, version: 1 };
      profiles.set(profileId, saved);
      eventOrder.push('profile-save:' + profileId);
      return send(res, 200, { ok: true, profile: saved });
    }
    return send(res, 405, { ok: false, message: 'Unsupported method.' });
  }
  if (url.pathname === '/api/ai/gateway') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.generation.push({ auth: req.headers.authorization, body });
    eventOrder.push('gateway');
    if (req.headers.authorization !== 'Bearer test-id-token') return send(res, 401, { ok: false, message: 'Sign in required.' });
    return send(res, 200, { ok: true, text: JSON.stringify(generated), message: JSON.stringify(generated), answer: JSON.stringify(generated), provider: 'fixture', model: 'stage-3-test' });
  }
  return send(res, 404, { ok: false, message: 'Not found.' });
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const errors = [];
  desktop.on('pageerror', error => errors.push(error.message));
  await desktop.goto(base, { waitUntil: 'load' });
  await desktop.locator('#ovyx-app-studio-url-analyzer-panel').waitFor();
  await desktop.locator('[data-ua-url]').fill('https://coastal.example');
  await desktop.locator('[data-ua-analyze]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-ua-status]')?.textContent.includes('Analysis complete.'));
  await desktop.locator('#ovyx-app-studio-link-builder [data-lb-generate]').waitFor();
  assert.match(await desktop.locator('#ovyx-app-studio-link-builder').innerText(), /Generate your first link-based app/);
  assert.match(await desktop.locator('#ovyx-app-studio-link-builder').innerText(), /STAGE 03/);
  await desktop.locator('[data-lb-name]').fill('Coastal Living');
  await desktop.locator('[data-lb-generate]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-lb-status]')?.textContent.includes('opened in the live preview'), null, { timeout: 15000 });

  assert.equal(requests.analyzer.length, 1, 'The Stage 2 analyzer must perform the URL inspection first.');
  assert.equal(requests.analyzer[0].auth, 'Bearer test-id-token');
  assert.deepEqual(requests.analyzer[0].body, { url: 'https://coastal.example' });
  assert.equal(requests.generation.length, 1, 'The analyzed URL should reach the existing gateway exactly once.');
  const generation = requests.generation[0];
  assert.equal(generation.auth, 'Bearer test-id-token');
  assert.equal(generation.body.mode, 'app-build');
  assert.equal(generation.body.context.activeView, 'appstudio');
  assert.equal(generation.body.context.appName, 'Coastal Living');
  assert.equal(generation.body.context.appBrandId, 'coastal-living', 'The Stage 1 interceptor must persist and scope the app brand before generation.');
  assert.equal(generation.body.context.sourceBrandColors.primary, '#D81B60');
  assert.equal(generation.body.context.sourceBrandColors.accent, '#00A6A6');
  assert.ok(generation.body.context.sourceSiteMap.some(page => page.path === '/collections'));
  assert.ok(generation.body.prompt.includes('Coastal Living') && generation.body.prompt.includes('Curated homes'));
  assert.ok(requests.profile.some(item => item.method === 'PUT' && item.id === 'coastal-living'), 'Brand DNA must be saved before the app generation call.');
  assert.ok(profiles.get('coastal-living')?.colors?.primary === '#D81B60', 'Analyzed brand colors must persist as this app’s own Brand DNA profile.');
  assert.equal(profiles.get('coastal-living')?.logoDataUrl, existingLogo, 'Applying detected colors must preserve the saved original full-colour PNG logo.');
  assert.deepEqual(profiles.get('coastal-living')?.layoutRules, ['Preserve the original full-colour logo.'], 'Applying detected colors must preserve saved app layout rules.');
  assert.ok(eventOrder.indexOf('profile-save:coastal-living') >= 0 && eventOrder.indexOf('profile-save:coastal-living') < eventOrder.indexOf('gateway'), 'The app identity must be saved before the generator is called.');

  const preview = desktop.frameLocator('[data-lb-preview]');
  await preview.locator('h1').waitFor();
  assert.equal(await preview.locator('h1').innerText(), 'Find your calm by the coast');
  assert.equal(await preview.locator('nav a[href="/collections/"]').count(), 1, 'Generated navigation must link to the separate collections page.');
  assert.equal(await preview.locator('nav a[href="/about/"]').count(), 1, 'Generated navigation must link to the separate about page.');
  assert.equal(await preview.locator('style[data-ovyx-generated-css]').count(), 1, 'The returned CSS file must be bundled into the working preview.');

  await preview.locator('nav a[href="/collections/"]').click();
  await preview.getByRole('heading', { name: 'Curated coastal collections' }).waitFor();
  assert.equal(await preview.locator('h1').innerText(), 'Curated coastal collections', 'The collections route must load its own HTML file in the preview.');
  await desktop.waitForFunction(() => document.querySelector('[data-lb-route-indicator]')?.textContent.includes('/collections/'));
  await preview.locator('nav a[href="/about/"]').click();
  await preview.getByRole('heading', { name: 'A more considered way home' }).waitFor();
  assert.equal(await preview.locator('h1').innerText(), 'A more considered way home', 'The about route must load its own HTML file in the preview.');
  await preview.locator('nav a[href="/"]').click();
  await preview.getByRole('heading', { name: 'Find your calm by the coast' }).waitFor();
  assert.equal(await preview.locator('h1').innerText(), 'Find your calm by the coast', 'Navigation must return to the root HTML file.');
  await preview.locator('#counter').click();
  assert.equal(await preview.locator('#counter').innerText(), 'Tap 1', 'Generated JavaScript must remain active after route navigation.');

  await desktop.locator('#ovyx-app-studio-link-builder details summary').click();
  assert.ok((await desktop.locator('[data-lb-source]').innerText()).includes('index.html'));
  assert.ok((await desktop.locator('[data-lb-source]').innerText()).includes('pages/collections.html'));
  assert.ok((await desktop.locator('[data-lb-source]').innerText()).includes('pages/about.html'));
  assert.ok((await desktop.locator('[data-lb-source]').innerText()).includes('styles.css'));
  assert.ok((await desktop.locator('[data-lb-source]').innerText()).includes('app.js'));
  const artifact = await desktop.evaluate(() => window.__OVYX_APP_STUDIO_GENERATED_PROJECT__);
  assert.equal(artifact?.previewMode, 'sandboxed-srcdoc');
  assert.equal(artifact?.sourceUrl, 'https://coastal.example/');
  assert.equal(artifact?.pageCount, 3, 'Three inspected source pages must produce three local routes.');
  assert.equal(artifact?.routes?.['/collections/'], 'pages/collections.html');
  assert.equal(artifact?.routes?.['/about/'], 'pages/about.html');
  assert.ok(artifact?.files?.['index.html']);
  assert.equal(await desktop.evaluate(() => window.KernelState.activeProject.name), 'Do not replace me', 'Stage 3 must not overwrite the existing active project.');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(base, { waitUntil: 'load' });
  await mobile.locator('#ovyx-app-studio-url-analyzer-panel').waitFor();
  const metrics = await mobile.locator('#ovyx-app-studio-url-analyzer-panel').evaluate(el => ({ width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth, viewport: document.documentElement.clientWidth }));
  assert.ok(metrics.width > 0 && metrics.scrollWidth <= metrics.viewport + 1, 'Stage 3 controls must not introduce horizontal overflow on mobile.');
  await mobile.locator('[data-ua-url]').fill('https://coastal.example');
  await mobile.locator('[data-ua-analyze]').click();
  await mobile.waitForFunction(() => document.querySelector('[data-ua-status]')?.textContent.includes('Analysis complete.'));
  await mobile.locator('[data-lb-generate]').click();
  await mobile.waitForFunction(() => document.querySelector('[data-lb-status]')?.textContent.includes('opened in the live preview'), null, { timeout: 15000 });
  const mobilePreview = mobile.frameLocator('[data-lb-preview]');
  await mobilePreview.locator('#counter').click();
  assert.equal(await mobilePreview.locator('#counter').innerText(), 'Tap 1', 'The generated mobile-width preview must remain interactive.');
  assert.deepEqual(errors, [], 'The real browser handoff must not throw page exceptions.');
  console.log('OVYX Stage 3 browser checks passed: analyzer → per-app brand → existing AI gateway → three HTML routes → working cross-page navigation and interactive desktop/mobile live preview.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
