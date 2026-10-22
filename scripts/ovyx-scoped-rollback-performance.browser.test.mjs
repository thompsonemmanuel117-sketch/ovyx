import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local Pages app.');

const fixture = [
  '<!doctype html><html><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>OVYX scoped rollback performance fixture</title>',
  '<style>',
  'body{margin:0;background:#050607;color:#f8fafc;font:16px system-ui}',
  'main{padding:24px;display:grid;gap:12px}',
  'button{min-height:42px;padding:8px 12px}',
  '#project-editor[hidden]{display:none!important}',
  '#project-editor.open{display:block!important;position:fixed;inset:12px;z-index:5000;background:#111;padding:24px;border:1px solid #777}',
  '</style></head><body><main id="fixture-root">',
  '<button id="plain-action" type="button">Regular dashboard action</button>',
  '<button id="open-project-editor" type="button" data-rollback-capture="project">Open project editor</button>',
  '<div id="project-editor" data-rollback-scope="project" role="dialog" aria-modal="true" aria-hidden="true" hidden style="display:none">',
  '<label>Draft <input id="project-draft" value="Original draft"></label>',
  '<button id="cancel-project-editor" type="button" data-modal-cancel>Cancel</button>',
  '</div></main>',
  '<script>',
  'window.__projectCloneCount = 0;',
  'window.__normalActionCount = 0;',
  'const project = {id:"perf-project-1",name:"Baseline project",description:"Performance fixture",status:"draft",pages:[],assets:[],ovyxGraph:{version:1,entry:"src/main.html",files:{"src/main.html":{type:"text/html",content:"<main>Baseline</main>"}}}};',
  'project.toJSON = function(){ window.__projectCloneCount += 1; return {id:this.id,name:this.name,description:this.description,status:this.status,pages:this.pages,assets:this.assets,ovyxGraph:this.ovyxGraph}; };',
  'const testClone = value => JSON.parse(JSON.stringify(value));',
  'window.KernelState = {activeView:"home",projects:[project],activeProject:project};',
  'window.WebStudio = {project:project,graph:testClone(project.ovyxGraph),graphKeyPrefix:"ovyx.ws.graph.v2.",syncGraphToProject:function(){this.project.ovyxGraph=testClone(this.graph);},render:function(){},renderPreview:function(){},renderCodeTree:function(){}};',
  'window.ProjectStore = {save:function(){return true;},renderProjects:function(){}};',
  'window.Router = {go:function(route){window.KernelState.activeView=String(route||"home");}};',
  'document.getElementById("plain-action").addEventListener("click",function(){window.__normalActionCount += 1;});',
  'document.getElementById("open-project-editor").addEventListener("click",function(){',
  '  window.KernelState.activeProject.name = "Mutated while opening";',
  '  const editor = document.getElementById("project-editor");',
  '  editor.hidden = false; editor.classList.add("open"); editor.setAttribute("aria-hidden","false"); editor.style.display = "block";',
  '});',
  'document.getElementById("cancel-project-editor").addEventListener("click",function(){',
  '  const editor = document.getElementById("project-editor");',
  '  editor.classList.remove("open"); editor.hidden = true; editor.setAttribute("aria-hidden","true"); editor.style.display = "none";',
  '});',
  '</script>',
  '<script defer src="/assets/ovyx-scoped-rollback.js?v=20261022-13"></script>',
  '</body></html>',
].join('');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 }, isMobile: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
  ]) {
    const page = await browser.newPage({
      viewport: target.viewport,
      isMobile: target.isMobile,
      hasTouch: target.isMobile,
    });
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message + '\n' + String(error.stack || 'no stack')));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.isNavigationRequest() && url.pathname === '/') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: fixture,
        });
        return;
      }
      await route.continue();
    });

    const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.status() < 400, '[' + target.name + '] performance fixture failed to load.');
    await page.waitForFunction(() =>
      typeof window.OVYXScopedRollback?.performance === 'function'
      && typeof window.OVYXScopedRollback?.beforeClose === 'function',
    );

    const initial = await page.evaluate(() => window.OVYXScopedRollback.performance());
    await page.click('#plain-action');
    const ordinaryClick = await page.evaluate(() => ({
      clones: window.__projectCloneCount,
      clicks: window.__normalActionCount,
      perf: window.OVYXScopedRollback.performance(),
    }));
    assert.equal(ordinaryClick.clicks, 1, '[' + target.name + '] regular button handler must still run.');
    assert.equal(ordinaryClick.clones, 0,
      '[' + target.name + '] a regular dashboard click must not deep-clone the active project graph.');

    const beforeUnrelatedChurn = ordinaryClick.perf.scanCount;
    await page.evaluate(() => {
      const button = document.getElementById('plain-action');
      for (let i = 0; i < 300; i += 1) {
        button.classList.toggle('ordinary-style-churn');
        button.style.setProperty('--ordinary-style-churn', String(i));
      }
    });
    await page.waitForTimeout(80);
    const afterUnrelatedChurn = await page.evaluate(() => window.OVYXScopedRollback.performance());
    assert.ok(afterUnrelatedChurn.scanCount - beforeUnrelatedChurn <= 1,
      '[' + target.name + '] unrelated button style churn must not force repeated full-document modal scans.');

    const beforeOpenHistory = await page.evaluate(() => history.length);
    await page.click('#open-project-editor');
    await page.waitForFunction(beforeHistory =>
      document.getElementById('project-editor')?.hidden === false
      && document.getElementById('project-editor')?.getAttribute('aria-hidden') === 'false'
      && window.KernelState?.activeProject?.name === 'Mutated while opening'
      && window.OVYXScopedRollback.performance().trackedScopes > 0
      && history.length > beforeHistory,
    beforeOpenHistory);
    const opened = await page.evaluate(() => ({
      clones: window.__projectCloneCount,
      historyLength: history.length,
      perf: window.OVYXScopedRollback.performance(),
    }));
    assert.ok(opened.clones >= 1,
      '[' + target.name + '] opening a project editor must retain a pre-click rollback checkpoint.');
    assert.ok(opened.historyLength > beforeOpenHistory,
      '[' + target.name + '] user-opened dialog must have a browser Back entry.');

    const beforeRelevantChurn = opened.perf;
    await page.evaluate(() => {
      const editor = document.getElementById('project-editor');
      for (let i = 0; i < 240; i += 1) {
        editor.classList.toggle('stress-style-churn');
        editor.style.setProperty('--modal-style-churn', String(i));
        editor.setAttribute('data-state', i % 2 ? 'open' : 'active');
      }
    });
    await page.waitForTimeout(80);
    const afterRelevantChurn = await page.evaluate(() => window.OVYXScopedRollback.performance());
    assert.ok(afterRelevantChurn.scanCount - beforeRelevantChurn.scanCount <= 2,
      '[' + target.name + '] a burst of overlay mutations must be coalesced to at most two scans.');
    assert.ok(afterRelevantChurn.scheduledScanCount - beforeRelevantChurn.scheduledScanCount <= 2,
      '[' + target.name + '] repeated overlay mutations must share the same scheduled scan frame.');

    await page.click('#cancel-project-editor');
    await page.waitForFunction(() =>
      document.getElementById('project-editor')?.hidden === true
      && window.KernelState?.activeProject?.name === 'Baseline project',
    );
    const finalState = await page.evaluate(() => ({
      route: window.KernelState.activeView,
      projectName: window.KernelState.activeProject.name,
      hidden: document.getElementById('project-editor').hidden,
      perf: window.OVYXScopedRollback.performance(),
    }));
    assert.equal(finalState.projectName, 'Baseline project',
      '[' + target.name + '] scoped Cancel must restore the pre-click project checkpoint.');
    assert.equal(finalState.hidden, true, '[' + target.name + '] Cancel must close the editor surface.');

    // Reproduce the live failure: the editor graph changes, but the project
    // object in KernelState remains unchanged. Rollback must not return early.
    const graphOnlyRestore = await page.evaluate(() => {
      const state = window.KernelState;
      state.activeView = 'webstudio';
      const project = state.activeProject;
      const baseline = { version: 1, entry: 'src/main.html',
        files: { 'src/main.html': { type: 'text/html', content: '<main>Graph last-good baseline</main>' } } };
      project.ovyxGraph = JSON.parse(JSON.stringify(baseline));
      state.projects = state.projects.map(item => item.id === project.id ? project : item);
      window.WebStudio.project = project;
      window.WebStudio.graph = JSON.parse(JSON.stringify(baseline));
      const snapshot = window.OVYXScopedRollback.snapshotProject();
      window.WebStudio.graph.files['src/main.html'].content = '<main>Changed only in the live editor graph</main>';
      // Deliberately do not copy that mutation to KernelState.activeProject.
      const restored = window.OVYXScopedRollback.restoreProject(snapshot);
      const saved = JSON.parse(localStorage.getItem('ovyx.ws.graph.v2.' + project.id) || '{}');
      return {
        restored,
        graphHTML: window.WebStudio.graph.files['src/main.html'].content,
        projectHTML: window.KernelState.activeProject.ovyxGraph.files['src/main.html'].content,
        listedHTML: window.KernelState.projects.find(item => item.id === project.id).ovyxGraph.files['src/main.html'].content,
        storedHTML: saved.files?.['src/main.html']?.content || '',
      };
    });
    assert.equal(graphOnlyRestore.restored, true,
      '[' + target.name + '] graph-only divergence must trigger rollback even when project metadata is unchanged.');
    assert.match(graphOnlyRestore.graphHTML, /Graph last-good baseline/,
      '[' + target.name + '] rollback must restore the visible Web Studio graph.');
    assert.match(graphOnlyRestore.projectHTML, /Graph last-good baseline/,
      '[' + target.name + '] rollback must restore the active project graph mirror.');
    assert.match(graphOnlyRestore.listedHTML, /Graph last-good baseline/,
      '[' + target.name + '] rollback must restore the project-list graph mirror.');
    assert.match(graphOnlyRestore.storedHTML, /Graph last-good baseline/,
      '[' + target.name + '] rollback must persist the graph to the Web Studio graph cache.');
    assert.deepEqual(pageErrors, [], '[' + target.name + '] rollback performance test must not throw browser runtime errors.');

    console.log('[OVYX rollback performance] ' + target.name + ': ' + JSON.stringify({
      baseline: initial,
      ordinaryClickClones: ordinaryClick.clones,
      unrelatedScanDelta: afterUnrelatedChurn.scanCount - beforeUnrelatedChurn,
      openScanCount: opened.perf.scanCount,
      overlayMutationScanDelta: afterRelevantChurn.scanCount - beforeRelevantChurn.scanCount,
      overlayMutationScheduleDelta: afterRelevantChurn.scheduledScanCount - beforeRelevantChurn.scheduledScanCount,
      restoredProject: finalState.projectName,
      maxScanDurationMs: finalState.perf.maxScanDurationMs,
    }));
    await page.close();
  }
} finally {
  await browser.close();
}
