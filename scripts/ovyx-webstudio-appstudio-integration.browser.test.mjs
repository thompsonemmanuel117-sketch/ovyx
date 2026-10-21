import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const indexHtml = read('index.html');

function extractBetween(source, startText, endText, label) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, 'Could not extract the live ' + label + ' from index.html.');
  return source.slice(start, end);
}

const convertRuntime = extractBetween(
  indexHtml,
  'async function handleConvertToMobileApp(){',
  'window.handleConvertToMobileApp=handleConvertToMobileApp;',
  'Web Studio-to-App Studio converter'
) + 'window.handleConvertToMobileApp=handleConvertToMobileApp;';
const codeNavigationRuntime = extractBetween(
  indexHtml,
  'window.openWebStudioCode=function(path){',
  'window.OVYXWebStudioLayout={',
  'Code navigation bridge'
);
const appRuntimeMatch = indexHtml.match(/<script id="ovyx-appstudio-phrase4-runtime"[^>]*>([\s\S]*?)<\/script>/i);
assert.ok(appRuntimeMatch, 'The live App Studio hydration runtime must remain present in index.html.');
const appRuntime = appRuntimeMatch[1];
const menuRuntimeMatch = indexHtml.match(/<script id="ovyx-convert-mobile-menu-final-guard"[^>]*>([\s\S]*?)<\/script>/i);
assert.ok(menuRuntimeMatch, 'The actual Convert to Mobile App menu wiring must remain present in index.html.');
const menuRuntime = menuRuntimeMatch[1];

for (const [label, source] of [
  ['conversion handoff', convertRuntime],
  ['Code navigation bridge', codeNavigationRuntime],
  ['App Studio runtime', appRuntime],
  ['conversion menu runtime', menuRuntime]
]) {
  assert.doesNotThrow(() => new Function(source), label + ' should parse as JavaScript.');
}

const fixture = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OVYX integration test</title></head><body>
<div id="view-router-viewport">
  <section id="view-webstudio" aria-hidden="false">
    <div id="ws-preview-menu" hidden><button type="button" data-ws-menu="delete">Delete Project</button></div>
    <section id="ws-code-workspace" hidden aria-hidden="true"><div id="ws-code-workspace-host"></div></section>
  </section>
  <section id="view-appstudio" class="hidden" aria-hidden="true"><div id="app-studio-clean-canvas"></div></section>
</div>
<script>
window.__integrationEvents = [];
window.__codeOpenEvents = [];
window.showToast = function(message, kind) { window.__lastToast = {message, kind}; };
window.currentWebStudioSurface = function() { return 'split'; };
window.snapshotState = function() { return {activePageIndex: 0, selectedNodeId: 'hero', thread: []}; };
window.ThemeContext = { get: function(){ return {accent:'#E8B64F'}; }, getSaved: function(){ return {}; } };
window.OVYXThemeLab = { state: {}, activeTheme: function(){ return {}; } };
window.getLayoutMode = function(){ return 'desktop'; };
const project = {
  id: 'ovyx-integration-project-42',
  name: 'OVYX Shop Project',
  description: 'Shared project for the integration test',
  routes: {'/':'src/pages/Home.html','/about/':'src/pages/About.html'},
  apiKey: 'DO_NOT_TRANSFER_THIS_SECRET',
  pages: [
    {id:'home', name:'Home', slug:'home', html:'<main>Old HTML</main>', sections:[{id:'hero',type:'hero',content:{heading:'Home'}}]},
    {id:'about', name:'About', slug:'about', html:'<main>About page</main>', sections:[{id:'about-section',type:'content',content:{heading:'About'}}]}
  ],
  theme: {accent:'#E8B64F'}
};
window.KernelState = {activeView:'webstudio', activeProject:project, projects:[project]};
window.WebStudio = {
  graph: {
    version:2,
    entry:'src/pages/Home.html',
    files: {
      'src/pages/Home.html': {type:'text/html', content:'<!doctype html><html><body><main id="hero">Latest saved from Code workspace</main></body></html>', updatedAt:100},
      'src/pages/About.html': {type:'text/html', content:'<!doctype html><html><body><main>About page from same project</main></body></html>', updatedAt:90},
      'src/styles.css': {type:'text/css', content:'body{font-family:Inter}#hero{color:#e8b64f}', updatedAt:80},
      'src/main.js': {type:'text/javascript', content:"document.querySelector('#hero')?.setAttribute('data-ready','1')", updatedAt:70},
      'public/brand.svg': {type:'image/svg+xml', content:'<svg xmlns="http://www.w3.org/2000/svg"></svg>', updatedAt:60},
      '../private.txt': {type:'text/plain', content:'must be rejected', updatedAt:50},
      '/root/private.txt': {type:'text/plain', content:'must be rejected', updatedAt:40}
    }
  },
  activeCodeFile:'src/pages/Home.html',
  entryFile:function(){ return this.graph.entry; },
  ensureProjectGraph:function(){ this.KernelGraph = this.graph; project.ovyxGraph=this.graph; return this.graph; },
  openCodeEditor:function(file){ window.__codeOpenEvents.push({file, projectId:window.KernelState.activeProject.id}); return true; },
  mountFocusedCodeWorkspace:function(){ window.__codeOpenEvents.push({file:'(mount)', projectId:window.KernelState.activeProject.id}); return true; }
};
project.ovyxGraph = window.WebStudio.graph;
window.addEventListener('ovyx:active-web-payload-ready', function(event){ window.__integrationEvents.push(event.detail); });
window.Router = {
  go:function(view){
    window.KernelState.activeView = view;
    document.querySelectorAll('#view-router-viewport > section').forEach(function(section){
      const active = section.id === 'view-' + view;
      section.classList.toggle('hidden', !active);
      section.setAttribute('aria-hidden', String(!active));
    });
    window.dispatchEvent(new CustomEvent('ovyx:view-changed', {detail:{view:view}}));
    return view;
  }
};
</script></body></html>`;

const server = http.createServer((_request, response) => {
  response.writeHead(200, {'content-type':'text/html; charset=utf-8', 'cache-control':'no-store'});
  response.end(fixture);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900}});
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

try {
  await page.goto('http://127.0.0.1:' + address.port + '/', {waitUntil:'domcontentloaded'});
  await page.addScriptTag({content:appRuntime});
  await page.addScriptTag({content:convertRuntime});
  await page.addScriptTag({content:codeNavigationRuntime});
  await page.addScriptTag({content:menuRuntime});

  const convertButton = page.locator('#ws-preview-menu [data-ws-menu="convert-mobile-app"]');
  await convertButton.waitFor({state:'attached', timeout:5000});
  assert.equal(await convertButton.count(), 1, 'The actual Web Studio menu bridge must expose exactly one Convert to Mobile App action.');
  await page.locator('#ws-preview-menu').evaluate(node => { node.hidden = false; });
  await convertButton.click();

  await page.waitForFunction(() => window.KernelState?.activeView === 'appstudio' && !!document.querySelector('#as4-shell'), null, {timeout:8000});
  assert.equal(await page.locator('#view-appstudio').getAttribute('aria-hidden'), 'false', 'Conversion should navigate into App Studio.');
  assert.equal(await page.locator('#as4-display-name').inputValue(), 'OVYX Shop Project', 'App Studio should inherit the active website project name.');
  const sourceStatus = (await page.locator('#as4-shell .as4-status').innerText()).replace(/\s+/g, ' ');
  assert.match(sourceStatus, /WEBSITE PAYLOAD READY/, 'App Studio should explicitly show that the website source was transferred.');
  assert.match(sourceStatus, /2 PAGES/, 'Both source pages should arrive in App Studio.');
  assert.equal(await page.locator('#as4-shell .as4-subtitle').count(), 1);

  const transfer = await page.evaluate(() => {
    let persistedPayload = null;
    let storageReadError = '';
    try { persistedPayload = JSON.parse(localStorage.getItem('ovyx_active_web_payload') || 'null'); }
    catch (error) { storageReadError = String(error?.message || error); }
    const inMemoryPayload = window.OVYXActiveWebPayload || window.OVYXProjectContext?.activeWebPayload || null;
    return {
    payload: persistedPayload || inMemoryPayload,
    persistedPayload: persistedPayload,
    inMemoryPayload: !!inMemoryPayload,
    storageReadError,
    globalProjectId: window.KernelState.activeProject.id,
    appStudioProjectId: window.OVYXAppStudioPhrase4?.state?.payload?.source?.projectId,
    appStudioReady: window.OVYXAppStudioPhrase4?.state?.sourceReady,
    event: window.__integrationEvents[0] || null,
    toast: window.__lastToast || null
  }; });
  if (!transfer.persistedPayload) console.log('App Studio transfer persistence diagnostic: ' + JSON.stringify({memoryPayload:transfer.inMemoryPayload, persistedEvent:transfer.event?.persisted, eventBytes:transfer.event?.bytes, storageReadError:transfer.storageReadError, toast:transfer.toast}));
  assert.ok(transfer.payload, 'The live conversion function must expose a reusable App Studio project payload.');
  assert.equal(transfer.payload.kind, 'web-to-mobile-app');
  assert.equal(transfer.payload.source.projectId, 'ovyx-integration-project-42');
  assert.equal(transfer.payload.source.projectName, 'OVYX Shop Project');
  assert.equal(transfer.payload.target.runtimeRoute, 'appstudio');
  assert.equal(transfer.payload.website.graph.entry, 'src/pages/Home.html');
  assert.equal(transfer.payload.website.graph.files['src/pages/Home.html'].content.includes('Latest saved from Code workspace'), true,
    'App Studio must receive the current Code graph contents, not an unrelated placeholder project.');
  assert.equal(transfer.payload.website.graph.files['src/styles.css'].content, 'body{font-family:Inter}#hero{color:#e8b64f}');
  assert.equal(transfer.payload.website.project.ovyxGraph.files['src/pages/Home.html'].content.includes('Latest saved from Code workspace'), true,
    'The active project snapshot must also preserve the same file paths as the standalone graph.');
  assert.equal(transfer.payload.website.project.routes['/about/'], 'src/pages/About.html',
    'Route keys must not be rewritten into underscores during project serialization.');
  assert.equal(Object.keys(transfer.payload.website.graph.files).some(file => file.startsWith('/') || file.split('/').includes('..')), false,
    'Unsafe absolute and traversal file paths must be dropped while safe relative paths are preserved.');
  assert.equal(transfer.payload.website.graphHtmlTrees.length, 2, 'HTML files from the same project graph must be included.');
  assert.equal(transfer.payload.website.compiledHtmlTrees.length, 2, 'Page structure and HTML snapshots must be handed off.');
  assert.equal(transfer.payload.website.project.id, 'ovyx-integration-project-42');
  assert.equal(transfer.globalProjectId, transfer.payload.source.projectId, 'Navigating between studios must not replace the active project.');
  assert.equal(transfer.appStudioProjectId, transfer.payload.source.projectId, 'App Studio runtime state must hydrate from the same source project.');
  assert.equal(transfer.appStudioReady, true);
  assert.equal(transfer.event.projectId, 'ovyx-integration-project-42');
  assert.equal(transfer.event.persisted, true);
  assert.equal(JSON.stringify(transfer.payload).includes('DO_NOT_TRANSFER_THIS_SECRET'), false, 'Sensitive project keys must not be copied into the App Studio transfer payload.');

  // Use the real Code route helper to return from App Studio and prove it re-opens
  // the same active project's source file without losing the graph.
  await page.evaluate(() => window.openWebStudioCode('src/pages/Home.html'));
  await page.waitForFunction(() => window.KernelState?.activeView === 'webstudio' && window.__codeOpenEvents.length > 0, null, {timeout:5000});
  const codeReturn = await page.evaluate(() => ({
    activeView:window.KernelState.activeView,
    projectId:window.KernelState.activeProject.id,
    open:window.__codeOpenEvents[window.__codeOpenEvents.length-1],
    home:window.WebStudio.graph.files['src/pages/Home.html'].content,
    codeSurfaceHidden:document.getElementById('ws-code-workspace').hidden
  }));
  assert.equal(codeReturn.activeView, 'webstudio');
  assert.equal(codeReturn.projectId, 'ovyx-integration-project-42');
  assert.equal(codeReturn.open.file, 'src/pages/Home.html');
  assert.equal(codeReturn.open.projectId, 'ovyx-integration-project-42');
  assert.equal(codeReturn.home.includes('Latest saved from Code workspace'), true, 'Returning to Code must preserve the source file data.');
  assert.equal(codeReturn.codeSurfaceHidden, false, 'The Code surface should be restored when returning from App Studio.');
  assert.equal(pageErrors.length, 0, pageErrors.join('; '));
  console.log('OVYX Web Studio → App Studio → Code integration browser test passed.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
