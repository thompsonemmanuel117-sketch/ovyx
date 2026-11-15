import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const runtime = await readFile(fileURLToPath(new URL('../assets/ovyx-app-studio-design-system.js', import.meta.url)), 'utf8');
const html = \`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--bg:#f5f6f8;--card:#ffffff;--text:#20242b;--muted:#596273;--border:rgba(20,30,45,.18)}</style></head><body>
<section id="view-appstudio" style="display:flex;flex-direction:column;width:100%;gap:18px">
  <section id="ovyx-as-workspace-dock" class="ovyx-as-workspace-dock"><div class="ovyx-as-workspace-dock__heading"><p class="ovyx-as-kicker">APP WORKSPACE</p><h2 id="ovyx-as-workspace-title">Workspace overview</h2></div><div class="ovyx-as-workspace-overview"><div class="ovyx-as-project-state"><div class="ovyx-as-project-state__item"><span>Project</span><strong>Demo app</strong></div><div class="ovyx-as-project-state__item"><span>Quality</span><strong>Ready</strong></div><div class="ovyx-as-project-state__item"><span>Save</span><strong>Saved</strong></div><div class="ovyx-as-project-state__item"><span>Release</span><strong>Draft</strong></div></div><div class="ovyx-as-workspace-actions"><button class="ovyx-as-workspace-action is-primary">Open Projects</button><details class="ovyx-as-workspace-more"><summary>More actions</summary><button>Copy summary</button></details></div><p class="ovyx-as-workspace-status">Status</p></div></section>
  <section class="ovyx-as-hero"><div class="ovyx-as-hero__top"><div class="ovyx-as-hero__copy"><h1 id="ovyx-as-title">From website to working app.</h1><p class="ovyx-as-hero__desc">Long old description.</p></div><div class="ovyx-as-hero__mark"></div></div><nav class="ovyx-as-flow"><a data-ovyx-as-step="analyze"><span class="ovyx-as-flow__number">01</span><span class="ovyx-as-flow__copy"><b>Analyze</b><small>Inspect a public URL</small></span><span class="ovyx-as-flow__state">Start here</span></a><a data-ovyx-as-step="generate"><span class="ovyx-as-flow__number">02</span><span class="ovyx-as-flow__copy"><b>Build</b><small>Create your app</small></span><span class="ovyx-as-flow__state">Next</span></a><a data-ovyx-as-step="verify"><span class="ovyx-as-flow__number">03</span><span class="ovyx-as-flow__copy"><b>Verify</b><small>Test behaviour</small></span><span class="ovyx-as-flow__state">Next</span></a><a data-ovyx-as-step="release"><span class="ovyx-as-flow__number">04</span><span class="ovyx-as-flow__copy"><b>Release</b><small>Prepare launch</small></span><span class="ovyx-as-flow__state">Next</span></a></nav><p class="ovyx-as-hero__helper">Start here.</p></section>
  <section id="ovyx-app-studio-url-analyzer-panel" class="ovyx-ua-panel"><h3>Analyze</h3><label>Website URL<input class="ovyx-ua-input" placeholder="https://example.com"></label><button class="ovyx-ua-primary">Analyze website</button><button class="ovyx-ua-secondary">Other option</button></section>
  <section id="ovyx-app-studio-link-builder" class="ovyx-lb-panel"><h4>Build</h4><button class="ovyx-lb-generate">Generate app</button><button class="ovyx-lb-save">Save app</button></section>
  <section id="ovyx-app-studio-project-brain" class="ovyx-lb-brain"><h4>Verify</h4><button class="ovyx-lb-brain-run">Run checks</button></section>
  <section id="ovyx-app-studio-release" class="ovyx-lb-release"><h4>Release</h4><button class="ovyx-lb-release-btn publish">Publish</button><button class="ovyx-lb-release-btn secondary">Export</button></section>
  <details class="ovyx-as-disclosure"><summary class="ovyx-as-disclosure__summary"><span class="ovyx-as-disclosure__copy">Brand identity</span></summary><div>Logo and colours</div></details>
  <section class="ovyx-app-brand-dna"><input type="color" value="#c2a36b"><button data-brand-save>Save identity</button></section>
</section><script src="/design.js"></script></body></html>\`;
const server = createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); return res.end(html); }
  if (req.url === '/design.js') { res.writeHead(200, {'content-type':'text/javascript; charset=utf-8'}); return res.end(runtime); }
  res.writeHead(404); res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, {waitUntil:'load'});
  await page.waitForSelector('#ovyx-app-studio-design-system-style');
  const desktop = await page.evaluate(() => {
    const root = document.querySelector('#view-appstudio');
    const panel = document.querySelector('.ovyx-ua-panel');
    const primary = document.querySelector('.ovyx-ua-primary');
    return {
      title: document.querySelector('#ovyx-as-title').textContent,
      description: document.querySelector('.ovyx-as-hero__desc').textContent,
      workspaceTitle: document.querySelector('#ovyx-as-workspace-title').textContent,
      stages: root.querySelectorAll('[data-ovyx-as-step]').length,
      panels: ['#ovyx-app-studio-url-analyzer-panel','#ovyx-app-studio-link-builder','#ovyx-app-studio-project-brain','#ovyx-app-studio-release'].every(id => !!root.querySelector(id)),
      disclosure: !!root.querySelector('.ovyx-as-disclosure'),
      primaryColor: getComputedStyle(primary).color,
      panelText: getComputedStyle(panel).color,
      panelBackground: getComputedStyle(panel).backgroundImage,
      colorInput: getComputedStyle(root.querySelector('input[type=color]')).appearance,
      bottomPadding: getComputedStyle(root).paddingBottom
    };
  });
  assert.equal(desktop.title, 'Build apps. Beautifully.');
  assert.equal(desktop.description, 'Analyze a site, create your app, and get it ready to launch.');
  assert.equal(desktop.workspaceTitle, 'Your workspace');
  assert.equal(desktop.stages, 4);
  assert.equal(desktop.panels, true, 'All four original workflow panels must remain in the document.');
  assert.equal(desktop.disclosure, true, 'Advanced feature disclosures must remain available.');
  assert.equal(desktop.primaryColor, 'rgb(23, 20, 14)', 'Primary action text must remain readable.');
  assert.equal(desktop.panelText, 'rgb(32, 36, 43)', 'Panel text must follow the active light theme.');
  assert.notEqual(desktop.panelBackground, 'none');
  assert.equal(desktop.bottomPadding, '14px');
  const before = await page.locator('#view-appstudio').evaluate(root => [...root.children].map(node => node.id || node.className));
  await page.setViewportSize({width:360,height:800});
  const mobile = await page.evaluate(() => {
    const root = document.querySelector('#view-appstudio');
    return {scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,stages:getComputedStyle(root.querySelector('.ovyx-as-flow')).gridTemplateColumns,workspaceColumns:getComputedStyle(root.querySelector('.ovyx-as-workspace-overview')).gridTemplateColumns};
  });
  assert.ok(mobile.scrollWidth <= mobile.clientWidth + 1, 'The 360px App Studio view must not overflow horizontally.');
  assert.equal(mobile.stages.split(' ').length, 2, 'The four workflow stages should form a two-column mobile grid.');
  const after = await page.locator('#view-appstudio').evaluate(root => [...root.children].map(node => node.id || node.className));
  assert.deepEqual(after, before, 'The visual layer must not remove, reorder or replace App Studio feature sections.');
  assert.deepEqual(errors, [], 'The visual layer must not throw browser errors.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('OVYX App Studio visual redesign browser checks passed.');