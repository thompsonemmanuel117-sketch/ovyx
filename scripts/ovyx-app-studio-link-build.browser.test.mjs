import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!base) throw new Error('OVYX_E2E_BASE_URL must point at the real OVYX Pages shell for this browser test.');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const relevantErrors = [];
  page.on('pageerror', error => {
    if (/ovyx-app-studio-link-builder|installAndOpenProject|normalizeGeneratedFiles/i.test(String(error?.stack || error?.message || ''))) {
      relevantErrors.push(String(error?.stack || error?.message || error));
    }
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.Router?.go && !!window.KernelState, null, { timeout: 30000 });
  await page.evaluate(() => window.Router.go('appstudio'));
  await page.locator('#ovyx-app-studio-url-analyzer-panel [data-ua-results]').waitFor({ state: 'attached', timeout: 30000 });
  await page.locator('#ovyx-app-studio-brand-dna-panel [data-brand-app-name]').waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => String(window.KernelState?.activeView || '').replace(/^view-/i, '').toLowerCase() === 'appstudio', null, { timeout: 15000 });

  const generatedHome = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Velora Link App</title></head><body><header><a class="brand" href="#home">Velora Link App</a><nav aria-label="Main navigation"><a href="#features">Features</a><a href="#about">About</a><a href="#contact">Contact</a></nav></header><main><section id="home"><h1>Find your next place to belong</h1><p>A responsive home screen generated from inspected source evidence.</p><a class="button" href="#features">Explore features</a></section><section id="features"><h2>Features</h2><p>Explore the essentials in one place.</p></section><section id="about"><h2>About</h2><p>Built with source-inspired colors and the selected app identity.</p></section><section id="contact"><h2>Contact</h2><p>Use a real contact channel configured by the project owner.</p></section></main><footer>Velora Link App</footer></body></html>';
  const generatedCss = '*,*::before,*::after{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#17121a;background:#fff9fc}header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px clamp(18px,5vw,64px);background:#d81b60;color:#fff}header a{color:inherit;text-decoration:none;font-weight:700}nav{display:flex;gap:18px;flex-wrap:wrap}main section{padding:clamp(44px,8vw,104px) clamp(18px,8vw,100px);scroll-margin-top:30px}main section:first-child{min-height:48vh;background:linear-gradient(135deg,#fff9fc,#ffe6ef)}h1{font-size:clamp(34px,6vw,64px);line-height:1.05;max-width:820px}.button{display:inline-block;padding:12px 18px;background:#302060;color:#fff;border-radius:999px;text-decoration:none;font-weight:800}footer{padding:24px;background:#17121a;color:#fff}@media(max-width:640px){header{align-items:flex-start;flex-direction:column}nav{gap:10px}}';
  const generatedJs = 'document.querySelectorAll(\'a[href^="#"]\').forEach(function(link){link.addEventListener("click",function(event){var target=document.querySelector(link.getAttribute("href"));if(target){event.preventDefault();target.scrollIntoView({behavior:"smooth",block:"start"});history.replaceState(null,"",link.getAttribute("href"));}})});';

  await page.evaluate(({ generatedHome, generatedCss, generatedJs }) => {
    const report = {
      schemaVersion: 1,
      source: { inputUrl: 'https://example.com/', canonicalUrl: 'https://example.com/', hostname: 'example.com', title: 'Example public website', analyzedAt: new Date().toISOString() },
      summary: { pagesInspected: 2, internalLinksDiscovered: 5, assetsDiscovered: 2, pagesBlocked: 0 },
      siteMap: { rootUrl: 'https://example.com/', pages: [
        { url: 'https://example.com/', path: '/', title: 'Example public website', category: 'Home', depth: 0, status: 'inspected', httpStatus: 200 },
        { url: 'https://example.com/about', path: '/about', title: 'About', category: 'About', depth: 1, status: 'inspected', httpStatus: 200 }
      ] },
      branding: { name: 'Velora Link App', confidence: 'high',
        colors: { primary: '#D81B60', secondary: '#302060', accent: '#00A6A6', background: '#FFF9FC', surface: '#FFFFFF', text: '#17121A', muted: '#5D4B56' },
        logo: { url: 'https://example.com/assets/logo.png', alt: 'Example logo' }, faviconUrl: 'https://example.com/favicon.ico' },
      assets: { items: [{ type: 'image', url: 'https://example.com/assets/logo.png', alt: 'Example logo' }] },
      capabilities: { can: ['Inspect public HTML'], cannot: ['Verify real account or payment integrations'] },
      limitations: ['Asset binaries are inventoried but not copied.']
    };
    window.__OVYX_URL_ANALYZER_LAST_REPORT__ = report;
    window.OVYXAIService = window.OVYXAIService || {};
    window.OVYXAIService.generate = async function (payload) {
      window.__OVYX_LINK_BUILD_TEST_REQUEST__ = payload;
      return {
        ok: true,
        summary: 'Built one validated Home page.',
        message: 'One-page website source generated.',
        project: payload.context.project,
        files: {
          'src/pages/Home.html': generatedHome,
          'src/styles.css': generatedCss,
          'src/main.js': generatedJs
        },
        siteMap: { architecture: 'App Studio one-page website', pages: [{ title: 'Home', path: 'src/pages/Home.html', url: '/' }] },
        qualityVerification: { status: 'passed', structuralChecksPassed: true, requirementsPassed: true },
        brandDNA: { active: true }
      };
    };
    const results = document.querySelector('#ovyx-app-studio-url-analyzer-panel [data-ua-results]');
    results.appendChild(document.createTextNode('Stage 3 browser fixture loaded.'));
  }, { generatedHome, generatedCss, generatedJs });

  await page.locator('#ovyx-app-studio-link-build [data-link-build-run]').waitFor({ timeout: 15000 });
  await page.locator('#ovyx-app-studio-link-build [data-link-build-run]').click();
  await page.waitForFunction(() => window.__OVYX_LAST_LINK_BUILD__?.previewRendered === true || document.querySelector('#ovyx-app-studio-link-build [data-link-build-status]')?.dataset.kind === 'error', null, { timeout: 30000 });
  const buildState = await page.locator('#ovyx-app-studio-link-build [data-link-build-status]').innerText();
  assert.equal(await page.evaluate(() => window.__OVYX_LAST_LINK_BUILD__?.previewRendered === true), true, 'Link-based build did not open the real preview: ' + buildState);

  const request = await page.evaluate(() => window.__OVYX_LINK_BUILD_TEST_REQUEST__);
  assert.equal(request.mode, 'app-build');
  assert.equal(request.context.activeView, 'appstudio');
  assert.equal(request.context.appStudioLinkBuild, true);
  assert.equal(request.context.urlAnalyzerSource.source.canonicalUrl, 'https://example.com/');
  assert.equal(request.context.urlAnalyzerSource.branding.name, 'Velora Link App');
  assert.equal(request.context.project.pages.length, 0, 'The first build request must begin with an empty page list.');
  const result = await page.evaluate(() => {
    const state = window.KernelState;
    const frame = document.getElementById('ws-canvas-iframe');
    const project = state?.activeProject;
    const doc = frame?.contentDocument;
    return {
      activeView: state?.activeView,
      projectName: project?.name,
      projectSaved: (state?.projects || []).some(item => item?.id === project?.id),
      entry: project?.ovyxGraph?.entry,
      filePaths: Object.keys(project?.ovyxGraph?.files || {}),
      frameSrcdoc: frame?.srcdoc || '',
      heading: doc?.querySelector('h1')?.textContent || '',
      sectionLinks: Array.from(doc?.querySelectorAll('nav a[href^="#"]') || []).map(a => a.getAttribute('href')),
      sectionIds: Array.from(doc?.querySelectorAll('main section[id]') || []).map(section => section.id),
      previewMark: window.__OVYX_LAST_LINK_BUILD__ || null,
      persistedResult: sessionStorage.getItem('ovyx.appstudio.link-build')
    };
  });
  assert.equal(result.activeView, 'webstudio', 'The generated project must open in the existing Web Studio route.');
  assert.equal(result.projectName, 'Velora Link App');
  assert.ok(result.projectSaved, 'The new editable project must be saved into the existing project store.');
  assert.equal(result.entry, 'src/pages/Home.html');
  assert.ok(result.filePaths.includes('src/pages/Home.html'));
  assert.ok(result.filePaths.includes('src/styles.css'));
  assert.ok(result.filePaths.includes('src/main.js'));
  assert.match(result.frameSrcdoc, /Find your next place to belong/);
  assert.equal(result.heading, 'Find your next place to belong', 'The actual iframe document must render HTML from the generated file map.');
  assert.deepEqual(result.sectionLinks, ['#features', '#about', '#contact'], 'The preview must render working in-page navigation targets.');
  assert.deepEqual(result.sectionIds, ['home', 'features', 'about', 'contact']);
  assert.equal(result.previewMark.previewRendered, true);
  assert.ok(result.persistedResult, 'The successful source-to-preview handoff must leave a session marker.');
  assert.deepEqual(relevantErrors, [], 'The Stage 3 live-preview handoff must not throw browser exceptions.');
  console.log('OVYX Stage 3 browser test passed: URL report → generator request → saved source project → actual Web Studio iframe preview with navigable page sections.');
} finally {
  await browser.close();
}
