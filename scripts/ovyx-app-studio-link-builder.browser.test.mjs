import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const read = path => readFile(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8');
const brandRuntime = await read('assets/ovyx-app-studio-brand-dna.js');
const analyzerRuntime = await read('assets/ovyx-app-studio-url-analyzer.js');
const builderRuntime = await read('assets/ovyx-app-studio-link-builder.js');
const projectBrainRuntime = await read('assets/ovyx-app-studio-project-brain.js');
const premiumPolishRuntime = await read('assets/ovyx-app-studio-premium-polish.js');
const requests = { analyzer: [], generation: [], profile: [], api: [], cloudSave: [], deploy: [], webStatus: [], releaseHealth: [], mobileBuild: [], mobileStatus: [] };
const eventOrder = [];
const existingLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/g6sAAAAASUVORK5CYII=';
const profiles = new Map([['coastal-living', {
  appId: 'coastal-living', appName: 'Coastal Living', logoDataUrl: existingLogo,
  colors: { primary: '#111111', secondary: '#222222', accent: '#333333', background: '#FFFFFF', surface: '#FFFFFF', text: '#000000', muted: '#444444' },
  layoutRules: ['Preserve the original full-colour logo.'], version: 1
}]]);
const report = {
  schemaVersion: 1,
  source: { inputUrl: 'https://coastal.example/', canonicalUrl: 'https://coastal.example/', hostname: 'coastal.example', analyzedAt: '2026-10-18T00:00:00.000Z' },
  summary: { pagesDiscovered: 4, pagesInspected: 3, pagesBlocked: 0, internalLinksDiscovered: 3, assetsDiscovered: 2, pageLimitReached: false },
  siteMap: { rootUrl: 'https://coastal.example/', pages: [
    { url: 'https://coastal.example/', path: '/', title: 'Coastal Living', category: 'Home', depth: 0, status: 'inspected', httpStatus: 200, contentType: 'text/html', headings: ['Find your calm by the coast'], description: 'Thoughtful coastal homes and living.' },
    { url: 'https://coastal.example/collections', path: '/collections', title: 'Collections', category: 'Products', depth: 1, status: 'inspected', httpStatus: 200, contentType: 'text/html', headings: ['Curated homes'], description: 'Explore curated homes.' },
    { url: 'https://coastal.example/about', path: '/about', title: 'Our Story', category: 'About', depth: 1, status: 'inspected', httpStatus: 200, contentType: 'text/html', headings: ['A more considered way home'], description: 'Our story.' },
    { url: 'https://coastal.example/account', path: '/account', title: 'Account', category: 'account', depth: 1, status: 'not-inspected', headings: [], description: '' }
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
    'index.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Coastal Living</title><link rel="stylesheet" href="styles.css"></head><body><header><nav aria-label="Main navigation"><a href="/">Home</a><a href="/collections/">Collections</a><a href="/about/">Our story</a></nav></header><main><section id="home"><h1>Find your calm by the coast</h1><p>Thoughtful homes, considered spaces and a clearer way to find your next chapter.</p><button id="counter" type="button">Tap 0</button><form id="lead-form" aria-label="Coastal enquiry"><label>Email <input name="email" type="email" required></label><label>Password <input name="password" type="password" value="do-not-store-this"></label><button type="submit">Save enquiry</button></form></section></main><script src="app.js"></script></body></html>',
    'pages/collections.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Collections | Coastal Living</title><link rel="stylesheet" href="../styles.css"></head><body><header><nav aria-label="Main navigation"><a href="/">Home</a><a href="/collections/">Collections</a><a href="/about/">Our story</a></nav></header><main><section><h1>Curated coastal collections</h1><p>Explore spaces selected for light, warmth and everyday living.</p></section></main><script src="../app.js"></script></body></html>',
    'pages/about.html': '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Our Story | Coastal Living</title><link rel="stylesheet" href="../styles.css"></head><body><header><nav aria-label="Main navigation"><a href="/">Home</a><a href="/collections/">Collections</a><a href="/about/">Our story</a></nav></header><main><section><h1>A more considered way home</h1><p>Built around calm service and useful details.</p></section></main><script src="../app.js"></script></body></html>',
    'styles.css': ':root{--ovyx-brand-primary:#D81B60;--ovyx-brand-secondary:#302060;--ovyx-brand-accent:#00A6A6;--ovyx-brand-background:#FFF9FC;--ovyx-brand-text:#17121A}body{margin:0;font-family:Arial,sans-serif;background:var(--ovyx-brand-background);color:var(--ovyx-brand-text)}header{padding:18px 5%;background:white}nav{display:flex;gap:18px;flex-wrap:wrap}nav a{color:var(--ovyx-brand-secondary);font-weight:700;text-decoration:none}main{max-width:900px;margin:auto;padding:34px 5%}section{padding:22px 0;scroll-margin-top:20px}button{padding:12px 16px;border:0;border-radius:999px;background:var(--ovyx-brand-primary);color:white;cursor:pointer}a:focus-visible,button:focus-visible{outline:3px solid var(--ovyx-brand-accent);outline-offset:3px}',
    'app.js': "let taps=0;document.querySelector('#counter')?.addEventListener('click',function(){taps+=1;this.textContent='Tap '+taps});",
    'public/brand/app-icon.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#D81B60"/></svg>',
    'public/brand/brand-manifest.json': JSON.stringify({ name: 'Coastal Living', theme_color: '#D81B60' })
  }
};
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' +
  '<main id="view-appstudio"><div id="app-studio-clean-canvas"></div></main>' +
  '<script>window.firebase={auth:function(){return {currentUser:{uid:"test-owner-uid",email:"owner@example.test",displayName:"Test Owner",getIdToken:async function(){return "test-id-token";}}}}};' +
  'window.KernelState={activeProject:{id:"existing-project",name:"Do not replace me"}};' +
  'window.OVYXAIService={generate:async function(options){const response=await fetch("/api/ai/gateway",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Authorization:"Bearer test-id-token"},body:JSON.stringify(options)});const data=await response.json();if(!response.ok)throw new Error(data.message||"Gateway failed");return data;}};</script>' +
  '<script src="/assets/ovyx-app-studio-brand-dna.js"></script>' +
  '<script src="/assets/ovyx-app-studio-url-analyzer.js"></script>' +
  '<script src="/assets/ovyx-app-studio-link-builder.js"></script>' +
  '<script src="/assets/ovyx-app-studio-project-brain.js"></script>' +
  '<script src="/assets/ovyx-app-studio-premium-polish.js"></script>' +
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
  if (url.pathname === '/assets/ovyx-app-studio-project-brain.js') return send(res, 200, projectBrainRuntime, 'text/javascript; charset=utf-8');
  if (url.pathname === '/assets/ovyx-app-studio-premium-polish.js') return send(res, 200, premiumPolishRuntime, 'text/javascript; charset=utf-8');
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
  if (url.pathname === '/api/entitlements' || url.pathname === '/api/tokens/balance' || url.pathname === '/api/projects') {
    if (req.headers.authorization !== 'Bearer test-id-token') return send(res, 401, { ok: false, error: 'Authentication required.' });
    requests.api.push({ path: url.pathname, method: req.method, auth: req.headers.authorization });
    if (url.pathname === '/api/entitlements') return send(res, 200, { ok: true, planTier: 'pro', capabilities: { appStudio: true, webStudio: true }, featureRules: [] });
    if (url.pathname === '/api/tokens/balance') return send(res, 200, { ok: true, current_monthly_tokens: 123, monthly_token_limit: 5000, boosterTokens: 12, mobileBuildsRemaining: 4, checkedAt: '2026-10-18T00:00:00.000Z' });
    if (req.method === 'GET') return send(res, 200, { ok: true, projects: [{ id: 'existing-1', name: 'Existing Project', description: 'Saved fixture' }] });
    if (req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      requests.cloudSave.push({ auth: req.headers.authorization, body });
      return send(res, 200, { ok: true, project: { id: body.projectId, name: body.project?.name, updatedAt: '2026-10-18T00:00:00.000Z' } });
    }
    return send(res, 405, { ok: false, error: 'Unsupported fixture method.' });
  }
  if (url.pathname === '/api/deploy') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (req.headers.authorization !== 'Bearer test-id-token') return send(res, 401, { success: false, error: 'Authentication required.' });
    requests.deploy.push({ auth: req.headers.authorization, body });
    return send(res, 200, {
      success: true, authoritative: true, requestId: 'release-deploy-' + requests.deploy.length,
      uploaded: { total: Object.keys(body.files || {}).length },
      deployment: {
        deploymentId: 'deployment-' + requests.deploy.length, pagesProjectName: 'ovyx-coastal-fixture',
        action: body.action, environment: body.action === 'publish' ? 'production' : 'preview',
        status: 'queued', stage: 'upload', url: 'https://coastal-preview.pages.dev', createdAt: '2026-10-18T12:00:00.000Z'
      }
    });
  }
  if (url.pathname === '/api/deployment-status') {
    if (req.headers.authorization !== 'Bearer test-id-token') return send(res, 401, { success: false, error: 'Authentication required.' });
    requests.webStatus.push({ auth: req.headers.authorization, query: Object.fromEntries(url.searchParams.entries()) });
    return send(res, 200, {
      success: true, authoritative: true,
      deployment: {
        deploymentId: url.searchParams.get('deploymentId'), pagesProjectName: 'ovyx-coastal-fixture',
        status: 'active', stage: 'deploy',
        environment: url.searchParams.get('deploymentId') === 'deployment-2' ? 'production' : 'preview',
        url: 'https://coastal-preview.pages.dev', aliases: ['https://coastal-preview.pages.dev']
      }
    });
  }
  if (url.pathname === '/api/app-studio/release-health') {
    if (req.headers.authorization !== 'Bearer test-id-token') return send(res, 401, { ok: false, error: 'Authentication required.' });
    requests.releaseHealth.push({ auth: req.headers.authorization, query: Object.fromEntries(url.searchParams.entries()) });
    return send(res, 200, {
      ok: true, authoritative: true, checkedAt: '2026-10-18T12:05:00.000Z',
      deployment: {
        deploymentId: url.searchParams.get('deploymentId'), pagesProjectName: 'ovyx-coastal-fixture',
        status: 'active', stage: 'deploy', environment: url.searchParams.get('deploymentId') === 'deployment-2' ? 'production' : 'preview',
        url: 'https://coastal-preview.pages.dev', aliases: ['https://coastal-preview.pages.dev']
      },
      health: { status: 'healthy', checked: true, reachable: true, httpStatus: 200, contentType: 'text/html; charset=utf-8', message: 'The published Pages URL returned a successful HTTP response.' }
    });
  }
  if (url.pathname === '/api/mobile/build' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (req.headers.authorization !== 'Bearer test-id-token') return send(res, 401, { ok: false, error: 'Authentication required.' });
    requests.mobileBuild.push({ auth: req.headers.authorization, body });
    return send(res, 202, { ok: true, jobId: 'mobile-job-123', status: 'queued', workflowRunId: 'eas-run-123', workflowUrl: 'https://expo.dev/workflows/eas-run-123' });
  }
  if (url.pathname === '/api/mobile/build/status') {
    if (req.headers.authorization !== 'Bearer test-id-token') return send(res, 401, { ok: false, error: 'Authentication required.' });
    requests.mobileStatus.push({ auth: req.headers.authorization, query: Object.fromEntries(url.searchParams.entries()) });
    return send(res, 200, {
      ok: true, jobId: url.searchParams.get('jobId'), status: 'completed', workflowStatus: 'success',
      workflowUrl: 'https://expo.dev/workflows/eas-run-123',
      artifacts: { android: { url: 'https://downloads.example/app.apk', downloadUrl: 'https://downloads.example/app.apk', detailsUrl: 'https://expo.dev/builds/android', status: 'finished' } },
      builds: [{ platform: 'android', status: 'finished', detailsUrl: 'https://expo.dev/builds/android' }],
      error: null, updatedAt: '2026-10-18T12:06:00.000Z'
    });
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
  desktop.on('dialog', dialog => dialog.accept());
  await desktop.goto(base, { waitUntil: 'load' });
  await desktop.locator('#ovyx-as-title').waitFor();
  assert.equal(await desktop.locator('[data-ovyx-as-step]').count(), 4, 'The premium guided flow must be mounted in the real Stage 3–6 test fixture.');
  assert.equal(await desktop.locator('#ovyx-as-identity-details').evaluate(el => el.open), false, 'The large Brand DNA editor should be collapsed by default.');
  assert.equal(await desktop.locator('#ovyx-as-existing-conversion').evaluate(el => el.open), false, 'The distinct legacy Web Studio conversion route should remain available but not compete with the link-based flow.');
  await desktop.locator('#ovyx-app-studio-url-analyzer-panel').waitFor();
  await desktop.locator('[data-ua-url]').fill('https://coastal.example');
  await desktop.locator('[data-ua-analyze]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-ua-status]')?.textContent.includes('Analysis complete.'));
  await desktop.locator('#ovyx-app-studio-link-builder [data-lb-generate]').waitFor();
  await desktop.locator('#ovyx-app-studio-url-analyzer-panel .ovyx-as-report-details').waitFor();
  assert.equal(await desktop.locator('#ovyx-app-studio-url-analyzer-panel .ovyx-as-report-details').evaluate(el => el.open), false, 'Detailed sitemap/assets/limitations are collapsed until needed.');
  assert.match(await desktop.locator('#ovyx-app-studio-link-builder').innerText(), /Create an app from a website/);
  await desktop.locator('#ovyx-app-studio-url-analyzer-panel [data-ua-palette], #ovyx-app-studio-url-analyzer-panel .ovyx-ua-secondary').first().click();
  assert.equal(await desktop.locator('#ovyx-as-identity-details').evaluate(el => el.open), true, 'Palette transfer opens Brand DNA so users can review the change.');
  await desktop.locator('#ovyx-as-identity-details > summary').click();
  await desktop.locator('[data-lb-name]').fill('Coastal Living');
  await desktop.locator('[data-lb-generate]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-lb-status]')?.textContent.includes('Your app is ready in the live preview'), null, { timeout: 15000 });
  await desktop.waitForFunction(() => window.__OVYX_PROJECT_BRAIN_REPORT__?.summary?.runtimeChecked === true, null, { timeout: 10000 });
  await desktop.locator('#ovyx-app-studio-project-brain [data-lb-brain-run]').waitFor();
  const firstBrainReport = await desktop.evaluate(() => window.__OVYX_PROJECT_BRAIN_REPORT__);
  assert.ok(firstBrainReport?.summary?.files >= 5, 'Project Brain must inventory the actual generated HTML/CSS/JS files.');
  assert.ok(firstBrainReport?.summary?.componentDependencies >= 1, 'Project Brain must connect component selectors to actual page elements.');
  assert.equal(firstBrainReport?.summary?.failures, 0, 'The fixture project should have no dependency or route failures: ' + JSON.stringify(firstBrainReport?.checks?.filter(item => item.severity === 'error')));
  assert.ok(firstBrainReport?.checks?.some(item => item.code === 'LIVE_PREVIEW_LOADED'), 'The report must use a real preview DOM handshake.');
  assert.ok(firstBrainReport?.checks?.some(item => item.code === 'LIVE_LINKS_INSPECTED'), 'The report must include rendered links inspected inside the preview.');
  assert.ok(firstBrainReport?.checks?.some(item => item.code === 'LIVE_CONTROLS_INSPECTED'), 'The report must include rendered controls inspected inside the preview.');
  assert.ok(firstBrainReport?.graph?.edges?.some(edge => edge.type === 'navigation'), 'The dependency graph must capture internal navigation edges.');
  assert.ok(firstBrainReport?.graph?.edges?.some(edge => edge.type === 'stylesheet'), 'The dependency graph must capture stylesheet edges.');
  assert.ok(firstBrainReport?.graph?.edges?.some(edge => edge.type === 'script-hook'), 'The dependency graph must capture component-to-JavaScript hooks.');
  const badAudit = await desktop.evaluate(() => window.OVYXProjectBrain.analyze({
    id: 'test-broken-project', name: 'Broken test fixture',
    routes: { '/': 'index.html' },
    files: { 'index.html': '<html><head><title>Broken test</title></head><body><a href="/missing/">Missing route</a><a href="#absent">Missing section</a><link rel="stylesheet" href="missing.css"></body></html>' }
  }));
  assert.equal(badAudit.status, 'failed', 'Project Brain must fail an intentionally broken route/dependency fixture, not blindly report success.');
  assert.ok(badAudit.checks.some(item => item.code === 'BROKEN_INTERNAL_ROUTE'));
  assert.ok(badAudit.checks.some(item => item.code === 'BROKEN_FRAGMENT'));
  assert.ok(badAudit.checks.some(item => item.code === 'STYLESHEET_DEPENDENCY_MISSING'));
  const repairedAudit = await desktop.evaluate(() => window.OVYXProjectBrain.analyze({
    id: 'test-repaired-project', name: 'Repaired test fixture',
    routes: { '/': 'index.html', '/missing/': 'pages/missing.html' },
    files: {
      'index.html': '<html><head><title>Repaired test</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body><a href="/missing/">Missing route</a><a href="#absent">Missing section</a><section id="absent">Now present</section></body></html>',
      'pages/missing.html': '<html><head><title>Missing route page</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Now present</h1></body></html>',
      'styles.css': 'body{font-family:Arial}'
    }
  }));
  assert.equal(repairedAudit.status, 'passed', 'After correcting the paths and anchor, the exact engine must retest the repaired fixture cleanly.');

  await desktop.locator('#ovyx-app-studio-project-brain [data-lb-brain-run]').click();
  await desktop.waitForFunction(() => window.__OVYX_PROJECT_BRAIN_REPORT__?.summary?.runtimeChecked === true, null, { timeout: 5000 });

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

  // Stage 4: forms produce a real, explicitly local outcome; passwords and secrets are not stored.
  await preview.locator('#lead-form input[name="email"]').fill('visitor@example.test');
  await preview.locator('#lead-form button[type="submit"]').click();
  await preview.locator('#lead-form [data-ovyx-form-status]').filter({ hasText: 'Saved in this browser only' }).waitFor({ timeout: 5000 });
  const formNotice = await preview.locator('#lead-form [data-ovyx-form-status]').innerText();
  assert.match(formNotice, /Saved in this browser only/);
  assert.match(formNotice, /password\/secret fields were not stored/);

  const storageSet = await preview.locator('body').evaluate(async () => await window.OVYXApp.storage.set('favorite-color', 'teal'));
  assert.equal(storageSet, true, 'OVYXApp.storage.set must resolve after persistence succeeds.');
  assert.equal(await preview.locator('body').evaluate(async () => await window.OVYXApp.storage.get('favorite-color')), 'teal');
  assert.ok((await preview.locator('body').evaluate(async () => await window.OVYXApp.storage.keys())).includes('favorite-color'));
  const authState = await preview.locator('body').evaluate(async () => await window.OVYXApp.auth.currentUser());
  assert.equal(authState.signedIn, true);
  assert.equal(authState.email, 'owner@example.test');

  const usage = await preview.locator('body').evaluate(async () => await window.OVYXApp.api.get('usage'));
  assert.equal(usage.current_monthly_tokens, 123, 'Approved read-only APIs must return actual API results.');
  assert.ok(requests.api.some(item => item.path === '/api/tokens/balance' && item.auth === 'Bearer test-id-token'));
  assert.equal(await preview.locator('body').evaluate(async () => { try { await fetch('/api/not-allowed'); return false; } catch (_) { return true; } }), true, 'Direct arbitrary API calls must be blocked by the preview CSP.');

  const localStateKey = 'ovyx.link-app-state.v1.test-owner-uid.link-coastal-living';
  const storedLocalState = await desktop.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), localStateKey);
  assert.equal(storedLocalState.values['favorite-color'], 'teal');
  assert.equal(storedLocalState.submissions.length, 1);
  assert.equal(storedLocalState.submissions[0].fields.email, 'visitor@example.test');
  assert.ok(!JSON.stringify(storedLocalState).includes('do-not-store-this'), 'Password values must not enter local preview persistence.');

  await desktop.locator('[data-lb-save]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-lb-save-status]')?.textContent.includes('App saved to OVYX Projects'));
  assert.equal(requests.cloudSave.length, 1, 'The explicit cloud save button must POST the project through the existing Projects API.');
  assert.equal(requests.cloudSave[0].auth, 'Bearer test-id-token');
  assert.equal(requests.cloudSave[0].body.projectId, 'link-coastal-living');
  assert.equal(requests.cloudSave[0].body.project.projectType, 'link-based-app');
  assert.ok(requests.cloudSave[0].body.project.files['pages/collections.html']);
  assert.equal((await desktop.evaluate(() => window.__OVYX_APP_STUDIO_GENERATED_PROJECT__)).savedToProjects, true);

  await desktop.locator('#ovyx-app-studio-link-builder .ovyx-lb-files > summary').click();
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
  assert.equal(artifact?.routes?.['/account/'], undefined, 'Discovered but uninspected routes must not be presented as generated pages.');
  assert.ok(artifact?.files?.['index.html']);
  assert.equal(await desktop.evaluate(() => window.KernelState.activeProject.name), 'Do not replace me', 'Stage 3 must not overwrite the existing active project.');

  // Stage 06: export files, call the existing Pages and EAS APIs, and diagnose the returned release.
  await desktop.locator('#ovyx-app-studio-release').waitFor();
  const [sourceJsonDownload] = await Promise.all([desktop.waitForEvent('download'), desktop.locator('[data-lb-export-json]').click()]);
  assert.match(sourceJsonDownload.suggestedFilename(), /coastal-living-source\.json$/);
  const sourceJson = JSON.parse(await readFile(await sourceJsonDownload.path(), 'utf8'));
  assert.equal(sourceJson.kind, 'ovyx-link-based-app-source');
  assert.equal(sourceJson.id, 'link-coastal-living');
  assert.ok(sourceJson.files['pages/collections.html']);

  const [zipDownload] = await Promise.all([desktop.waitForEvent('download'), desktop.locator('[data-lb-export-zip]').click()]);
  assert.match(zipDownload.suggestedFilename(), /coastal-living-deployable\.zip$/);
  const zipBytes = await readFile(await zipDownload.path());
  assert.equal(zipBytes[0], 0x50, 'Deployable ZIP must have a real ZIP signature.');
  assert.equal(zipBytes[1], 0x4b, 'Deployable ZIP must have a real ZIP signature.');
  const zipText = zipBytes.toString('utf8');
  assert.ok(zipText.includes('collections/index.html'), 'The ZIP must include an entry file for the generated collections route.');
  assert.ok(zipText.includes('brand/app-icon.svg'), 'The ZIP must publish public/brand assets at the site-root path expected by generated HTML.');
  assert.ok(zipText.includes('brand/brand-manifest.json'), 'The ZIP must publish the app manifest at the URL referenced by generated HTML.');
  assert.ok(!zipText.includes('public/brand/app-icon.svg'), 'The ZIP must not leave public/ prefixed paths that break the generated asset URLs.');
  assert.ok(zipText.includes('ovyx-release-manifest.json'), 'The ZIP must include a release limitations manifest.');
  assert.ok(zipText.includes('connect-src'), 'Static output must include its explicit CSP network boundary.');

  const previewDeployButton = desktop.locator('[data-lb-deploy-preview]');
  const previewWasDisabled = await previewDeployButton.isDisabled();
  await previewDeployButton.click();
  await desktop.waitForFunction(() => {
    const target = document.querySelector('[data-lb-web-status]');
    return target && (target.dataset.kind === 'error' || target.textContent.includes('Latest preview deploy: active'));
  }, null, { timeout: 10000 }).catch(() => {});
  const previewDeployStatus = await desktop.locator('[data-lb-web-status]').innerText();
  assert.match(previewDeployStatus, /Latest preview deploy: active/, 'Preview deployment did not reach the active provider stage; button disabled before click=' + previewWasDisabled + '; status=' + previewDeployStatus);
  assert.equal(requests.deploy.length, 1, 'Preview deploy must call the existing Cloudflare route.');
  assert.equal(requests.deploy[0].auth, 'Bearer test-id-token');
  assert.equal(requests.deploy[0].body.action, 'deploy');
  assert.ok(requests.deploy[0].body.files['index.html']);
  assert.ok(requests.deploy[0].body.files['collections/index.html']);
  assert.ok(requests.deploy[0].body.files['about/index.html']);
  assert.ok(requests.deploy[0].body.files['ovyx-release-manifest.json']);
  assert.ok(requests.webStatus.some(item => item.query.deploymentId === 'deployment-1'));

  await desktop.locator('[data-lb-release-health]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-lb-web-status]')?.textContent.includes('Website health: healthy'), null, { timeout: 10000 });
  assert.equal(requests.releaseHealth.length, 1, 'The release-health control must call the authenticated health endpoint.');
  assert.equal(requests.releaseHealth[0].auth, 'Bearer test-id-token');
  assert.equal(requests.releaseHealth[0].query.deploymentId, 'deployment-1');
  assert.equal(await desktop.locator('[data-lb-release-link]').isVisible(), true);
  assert.equal(await desktop.locator('[data-lb-release-link]').getAttribute('href'), 'https://coastal-preview.pages.dev/');

  await desktop.locator('[data-lb-publish]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-lb-web-status]')?.textContent.includes('Latest production publish: active'), null, { timeout: 10000 });
  assert.equal(requests.deploy.length, 2, 'Production publish must dispatch a separate request.');
  assert.equal(requests.deploy[1].body.action, 'publish');
  assert.ok(requests.webStatus.some(item => item.query.deploymentId === 'deployment-2'));
  await desktop.locator('[data-lb-release-health]').click();
  await desktop.waitForFunction(() => {
    const target = document.querySelector('[data-lb-web-status]');
    return target && (target.dataset.kind === 'error' || target.textContent.includes('Website health: healthy'));
  }, null, { timeout: 10000 }).catch(() => {});
  const productionHealthStatus = await desktop.locator('[data-lb-web-status]').innerText();
  assert.match(productionHealthStatus, /Website health: healthy/, 'Production health check did not complete; status=' + productionHealthStatus + '; release-health requests=' + JSON.stringify(requests.releaseHealth));
  assert.equal(requests.releaseHealth.length, 2, 'The production release must get its own post-release health check.');
  assert.equal(requests.releaseHealth[1].query.deploymentId, 'deployment-2');

  const mobileStartButton = desktop.locator('[data-lb-mobile-build]');
  const mobileStartWasDisabled = await mobileStartButton.isDisabled();
  await mobileStartButton.click();
  await desktop.waitForFunction(() => {
    const target = document.querySelector('[data-lb-mobile-status]');
    return target && (target.dataset.kind === 'error' || target.textContent.includes('Mobile build status: Complete'));
  }, null, { timeout: 10000 }).catch(() => {});
  const mobileStartStatus = await desktop.locator('[data-lb-mobile-status]').innerText();
  assert.match(mobileStartStatus, /Mobile build status: Complete/, 'Mobile build did not complete; button disabled before click=' + mobileStartWasDisabled + '; status=' + mobileStartStatus + '; dispatchRequests=' + requests.mobileBuild.length);
  assert.equal(requests.mobileBuild.length, 1, 'The mobile UI must call the existing EAS build API.');
  assert.equal(requests.mobileBuild[0].auth, 'Bearer test-id-token');
  assert.deepEqual(requests.mobileBuild[0].body.platforms, ['android']);
  const mobileBundle = requests.mobileBuild[0].body.payload.website.compiledHtmlTrees[0];
  assert.ok(mobileBundle.includes('ovyx-mobile-route-runtime'), 'The Android WebView payload must include local route switching.');
  assert.ok(mobileBundle.includes('Curated coastal collections') && mobileBundle.includes('A more considered way home'), 'The mobile bundle must include inspected routes.');
  assert.ok(mobileBundle.includes('connect-src'), 'The mobile bundle must retain its network restriction.');
  assert.ok(requests.mobileStatus.some(item => item.query.jobId === 'mobile-job-123'));
  assert.ok((await desktop.locator('[data-lb-mobile-links]').innerText()).includes('https://downloads.example/app.apk'), 'Completed mobile status must expose the returned download URL.');

  await desktop.locator('[data-lb-mobile-refresh]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-lb-mobile-status]')?.textContent.includes('Mobile build status: Complete'), null, { timeout: 10000 });
  assert.equal(requests.mobileStatus.length, 2, 'Manual refresh must re-query the mobile build status endpoint.');

  await desktop.locator('[data-lb-save-release]').click();
  await desktop.waitForFunction(() => document.querySelector('[data-lb-web-status]')?.textContent.includes('Release details saved to OVYX Projects'), null, { timeout: 10000 });
  assert.equal(requests.cloudSave.length, 2, 'The release record action must save through the existing OVYX Projects API.');
  const releaseSave = requests.cloudSave[1];
  assert.equal(releaseSave.auth, 'Bearer test-id-token');
  assert.equal(releaseSave.body.projectId, 'link-coastal-living');
  assert.ok(releaseSave.body.project.releaseHistory.web.preview.deploymentId);
  assert.ok(releaseSave.body.project.releaseHistory.web.production.deploymentId);
  assert.equal(releaseSave.body.project.releaseHistory.mobile.jobId, 'mobile-job-123');

  const releaseState = await desktop.evaluate(() => window.__OVYX_APP_STUDIO_GENERATED_PROJECT__?.releaseState);
  assert.equal(releaseState.web.preview.status, 'active');
  assert.equal(releaseState.web.production.status, 'active');
  assert.equal(releaseState.web.production.health.status, 'healthy');
  assert.equal(releaseState.mobile.status, 'completed');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(base, { waitUntil: 'load' });
  await mobile.locator('#ovyx-app-studio-url-analyzer-panel').waitFor();
  const metrics = await mobile.locator('#ovyx-app-studio-url-analyzer-panel').evaluate(el => ({ width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth, viewport: document.documentElement.clientWidth }));
  assert.ok(metrics.width > 0 && metrics.scrollWidth <= metrics.viewport + 1, 'Stage 3 controls must not introduce horizontal overflow on mobile.');
  await mobile.locator('[data-ua-url]').fill('https://coastal.example');
  await mobile.locator('[data-ua-analyze]').click();
  await mobile.waitForFunction(() => document.querySelector('[data-ua-status]')?.textContent.includes('Analysis complete.'));
  await mobile.locator('[data-lb-generate]').click();
  await mobile.waitForFunction(() => document.querySelector('[data-lb-status]')?.textContent.includes('Your app is ready in the live preview'), null, { timeout: 15000 });
  await mobile.waitForFunction(() => window.__OVYX_PROJECT_BRAIN_REPORT__?.summary?.runtimeChecked === true, null, { timeout: 10000 });
  const mobileBrain = await mobile.evaluate(() => window.__OVYX_PROJECT_BRAIN_REPORT__);
  assert.ok(mobileBrain?.summary?.runtimeChecked && mobileBrain.summary.files >= 5, 'Project Brain must inspect the live mobile preview too.');
  const brainMetrics = await mobile.locator('#ovyx-app-studio-project-brain').evaluate(el => ({ width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth, viewport: document.documentElement.clientWidth }));
  assert.ok(brainMetrics.width > 0 && brainMetrics.scrollWidth <= brainMetrics.viewport + 1, 'Project Brain results must fit mobile width.');
  const mobilePreview = mobile.frameLocator('[data-lb-preview]');
  assert.equal(await mobilePreview.locator('nav a[href="/collections/"]').count(), 1, 'The mobile preview must expose cross-page navigation too.');
  await mobilePreview.locator('nav a[href="/collections/"]').click();
  await mobilePreview.getByRole('heading', { name: 'Curated coastal collections' }).waitFor();
  assert.equal(await mobilePreview.locator('h1').innerText(), 'Curated coastal collections', 'Multi-page route navigation must work at mobile width.');
  assert.deepEqual(errors, [], 'The real browser handoff must not throw page exceptions.');
  console.log('OVYX Stage 6 + Stage 5/4 browser checks passed: export ZIP/JSON, Cloudflare preview and production status, live release health, EAS mobile artifact polling, release history, Project Brain and generated-app functionality.');
  console.log('OVYX Stage 5 + 4 browser checks passed: component dependency graph, broken-route regression and repair re-test, real preview DOM/error probe, multi-page navigation, form outcomes, per-user persistence, sensitive-field filtering, authorized read-only APIs, network blocking and confirmed cloud save.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
