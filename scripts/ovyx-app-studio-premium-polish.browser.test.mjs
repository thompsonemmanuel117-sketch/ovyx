import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const runtime = await readFile(fileURLToPath(new URL('../assets/ovyx-app-studio-premium-polish.js', import.meta.url)), 'utf8');
const requests = [];
const report = {
  source: { inputUrl: 'https://coastal.example/', canonicalUrl: 'https://coastal.example/', analyzedAt: '2026-10-18T00:00:00Z' },
  summary: { pagesDiscovered: 3, pagesInspected: 2, assetsDiscovered: 4, pagesBlocked: 0 },
  branding: { name: 'Coastal Living', confidence: 'high', colors: { primary: '#D81B60', secondary: '#302060' } }
};
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
<section id="view-appstudio" class="flex flex-col">
  <section id="ovyx-app-studio-brand-dna-panel" class="ovyx-app-brand-dna">
    <div class="ovyx-app-brand-dna__heading"><h3>Brand DNA</h3></div>
    <div class="ovyx-app-brand-dna__grid"><label>App name<input data-brand-app-name value="Coastal Living"></label></div>
    <button data-brand-save>Save identity</button>
  </section>
  <section id="ovyx-app-studio-url-analyzer-panel" class="ovyx-ua-panel">
    <form><label>Website URL<input data-ua-url type="url" value="https://coastal.example"></label><button data-ua-analyze>Analyze website</button></form>
    <div data-ua-results>
      <div class="ovyx-ua-stats"><div class="ovyx-ua-stat"><strong>2</strong><span>Pages inspected</span></div></div>
      <section class="ovyx-ua-section"><h4>Detected identity</h4><button class="ovyx-ua-secondary" data-ua-palette>Use detected palette in Brand DNA</button></section>
      <section class="ovyx-ua-section"><h4>Site map</h4><ul class="ovyx-ua-pages"><li>Home</li><li>About</li></ul></section>
      <section class="ovyx-ua-section"><h4>Assets discovered</h4><ul><li>Logo URL</li><li>Stylesheet URL</li></ul></section>
      <section class="ovyx-ua-section"><h4>What this report can and cannot tell us</h4><p>Known inspection limits</p></section>
      <p class="ovyx-ua-report-foot">Source report is held in this tab.</p>
      <section id="ovyx-app-studio-link-builder" class="ovyx-lb-panel"><h4>Generate your first link-based app</h4><button data-lb-generate>Generate first app</button></section>
    </div>
  </section>
  <div id="app-studio-clean-canvas"><div id="as4-shell">Existing Web Studio mobile conversion form</div></div>
  <section id="ovyx-app-studio-project-brain" class="ovyx-lb-brain">
    <p data-lb-brain-status>STATIC CHECKS ONLY</p>
    <details class="ovyx-lb-brain-findings" open><summary>Failures, warnings and evidence</summary><ul><li>Fixture evidence</li></ul></details>
  </section>
  <section id="ovyx-app-studio-release" class="ovyx-lb-release"><button data-lb-publish>Publish production</button></section>
</section>
<script>window.__OVYX_URL_ANALYZER_LAST_REPORT__=${JSON.stringify(report)};window.__OVYX_APP_STUDIO_GENERATED_PROJECT__=null;window.__OVYX_PROJECT_BRAIN_REPORT__=null;</script>
<script src="/assets/ovyx-app-studio-premium-polish.js"></script>
</body></html>`;

function send(res, status, body, type='application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type.includes('json') ? JSON.stringify(body) : String(body));
}
const server = createServer((req, res) => {
  if (req.url === '/') return send(res, 200, html, 'text/html; charset=utf-8');
  if (req.url === '/assets/ovyx-app-studio-premium-polish.js') return send(res, 200, runtime, 'text/javascript; charset=utf-8');
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  requests.push(req.url);
  return send(res, 404, { ok: false });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  desktop.on('pageerror', error => errors.push(error.message));
  await desktop.goto(base, { waitUntil: 'load' });
  await desktop.locator('#ovyx-as-title').waitFor();

  assert.equal(await desktop.locator('#view-appstudio > #ovyx-app-studio-experience').count(), 1, 'The new guided workspace header must be mounted once at the top.');
  assert.match(await desktop.locator('#ovyx-as-title').innerText(), /From website to working app/);
  assert.equal(await desktop.locator('[data-ovyx-as-step]').count(), 4, 'The workspace should present one clear analyze → generate → verify → release path.');
  assert.ok(await desktop.locator('[data-ovyx-as-step="analyze"]').evaluate(el => el.classList.contains('is-complete')));
  assert.ok(await desktop.locator('[data-ovyx-as-step="generate"]').evaluate(el => el.classList.contains('is-current')));

  const identity = desktop.locator('#ovyx-as-identity-details');
  assert.equal(await identity.count(), 1);
  assert.equal(await identity.evaluate(el => el.open), false, 'Detailed brand editing should not dominate the first view.');
  assert.ok(await identity.locator('#ovyx-app-studio-brand-dna-panel').count());
  const legacy = desktop.locator('#ovyx-as-existing-conversion');
  assert.equal(await legacy.evaluate(el => el.open), false, 'The older Web Studio conversion wizard must remain available but tucked away.');
  assert.match(await legacy.locator('summary').innerText(), /Convert a Web Studio design/);
  await legacy.locator('summary').click();
  assert.equal(await legacy.evaluate(el => el.open), true);
  assert.match(await legacy.innerText(), /Existing Web Studio mobile conversion form/);
  await legacy.locator('summary').click();

  const reportDetails = desktop.locator('#ovyx-app-studio-url-analyzer-panel .ovyx-as-report-details');
  await reportDetails.waitFor();
  assert.equal(await reportDetails.evaluate(el => el.open), false, 'The deep site map/assets/limitations should be progressive-disclosure content.');
  assert.match(await reportDetails.locator('summary').innerText(), /3 pages reviewed/);
  assert.equal(await desktop.locator('[data-ua-results] > .ovyx-ua-stats').count(), 1);
  assert.equal(await desktop.locator('[data-ua-results] > .ovyx-ua-section').count(), 1, 'The key detected identity remains visible above the detailed report.');
  assert.equal(await desktop.locator('[data-ua-results] > #ovyx-app-studio-link-builder').count(), 1, 'The generator stays prominent beside the summary, not hidden in detailed scan output.');

  await desktop.locator('[data-ua-palette]').click();
  assert.equal(await identity.evaluate(el => el.open), true, 'Palette transfer must open Brand DNA before asking the user to review it.');
  await identity.locator('summary').click();

  assert.equal(await desktop.locator('#ovyx-app-studio-project-brain .ovyx-lb-brain-findings').evaluate(el => el.open), false, 'Detailed test evidence should start collapsed, while the Project Brain status stays visible.');
  await desktop.evaluate(() => {
    window.__OVYX_APP_STUDIO_GENERATED_PROJECT__ = { id: 'link-coastal', name: 'Coastal Living', releaseState: { web: {}, mobile: null } };
    window.__OVYX_PROJECT_BRAIN_REPORT__ = { status: 'passed', summary: { runtimeChecked: true, failures: 0, warnings: 0, passed: 20 } };
    window.dispatchEvent(new CustomEvent('ovyx:link-app-generated'));
    window.dispatchEvent(new CustomEvent('ovyx:project-brain-updated'));
  });
  await desktop.waitForFunction(() => document.querySelector('[data-ovyx-as-step="verify"]')?.classList.contains('is-complete'));
  assert.ok(await desktop.locator('[data-ovyx-as-step="release"]').evaluate(el => el.classList.contains('is-current')));

  await desktop.locator('[data-ovyx-as-step="release"]').click();
  assert.ok(await desktop.locator('#ovyx-app-studio-release').isVisible(), 'The guided release step must scroll to the real release controls.');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.emulateMedia({ reducedMotion: 'reduce' });
  await mobile.goto(base, { waitUntil: 'load' });
  await mobile.locator('#ovyx-as-title').waitFor();
  const metrics = await mobile.evaluate(() => {
    const root = document.getElementById('view-appstudio');
    return {
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      appWidth: root.clientWidth,
      appScrollWidth: root.scrollWidth,
      overflowingChildren: Array.from(root.children).map(child => ({
        id: child.id || '',
        className: String(child.className || '').slice(0, 120),
        width: Math.round(child.getBoundingClientRect().width),
        clientWidth: child.clientWidth,
        scrollWidth: child.scrollWidth,
        overflowNodes: Array.from(child.querySelectorAll('*')).filter(node => node.scrollWidth > node.clientWidth + 2).slice(0, 8).map(node => ({
          tag: node.tagName.toLowerCase(),
          id: node.id || '',
          className: String(node.className || '').slice(0, 100),
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          width: Math.round(node.getBoundingClientRect().width)
        }))
      })).filter(child => child.scrollWidth > child.clientWidth + 2 || child.width > root.clientWidth + 2)
    };
  });
  assert.ok(metrics.appWidth > 0 && metrics.documentWidth <= metrics.viewport + 1 && metrics.appScrollWidth <= metrics.appWidth + 1,
    'The premium App Studio layout must not create mobile horizontal overflow: ' + JSON.stringify(metrics));
  const animation = await mobile.locator('#ovyx-app-studio-experience').evaluate(el => getComputedStyle(el).animationDuration);
  assert.ok(['1e-05s', '0.00001s', '0.01ms'].includes(animation) || parseFloat(animation) <= 0.00001,
    'Reduced-motion users must not receive decorative entrance animation; got ' + animation);
  assert.equal(await mobile.locator('[data-ovyx-as-step]').count(), 4);
  assert.deepEqual(errors, [], 'The workspace design runtime must not throw browser errors.');
  assert.ok(requests.every(path => !path.startsWith('/api/')), 'Visual enhancements must not trigger or duplicate network/API requests.');
  console.log('OVYX App Studio premium polish browser checks passed: guided four-step flow, compact brand/report disclosures, retained conversion path, working palette transfer, desktop/mobile fit and reduced-motion support.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
