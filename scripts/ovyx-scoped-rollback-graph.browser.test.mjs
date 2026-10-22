import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = String(process.env.OVYX_E2E_BASE_URL || '').trim();
if (!baseURL) throw new Error('OVYX_E2E_BASE_URL must point to the local Pages app.');

const fixture = [
  '<!doctype html><html><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>OVYX graph-only rollback regression</title>',
  '<style>',
  'body{margin:0;background:#050607;color:#f8fafc;font:16px system-ui}',
  'main{padding:24px;display:grid;gap:12px}',
  'button{min-height:44px;padding:8px 12px}',
  '.rollback-modal[hidden]{display:none!important}',
  '.rollback-modal.open{display:block!important;position:fixed;inset:12px;z-index:5000;background:#111;padding:24px;border:1px solid #777}',
  '</style></head><body><main>',
  '<button id="open-project-editor" type="button" data-rollback-capture="project">Open project editor</button>',
  '<div id="visible-editor-content"></div>',
  '<div id="project-editor" class="rollback-modal" data-rollback-scope="project" role="dialog" aria-modal="true" aria-hidden="true" hidden style="display:none">',
  '<p>Project editor</p><button id="cancel-project-editor" type="button" data-modal-cancel>Cancel</button>',
  '</div></main>',
  '<script defer src="/assets/ovyx-scoped-rollback.js?v=20261022-13"></script>',
  '</body></html>',
].join('');

const browser = await chromium.launch({ headless: true });
try {
  for (const target of [
    { name: 'desktop', viewport: { width: 1280, height: 900 }, isMobile: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true },
  ]) {
    for (const closeMethod of ['cancel', 'back']) {
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
          await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture });
          return;
        }
        await route.continue();
      });

      const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
      assert.ok(response && response.status() < 400, '[' + target.name + '/' + closeMethod + '] fixture failed to load.');
      await page.waitForFunction(() =>
        typeof window.OVYXScopedRollback?.snapshotProject === 'function'
        && typeof window.OVYXScopedRollback?.restoreProject === 'function'
        && typeof window.OVYXScopedRollback?.performance === 'function'
        && window.__OVYX_SCOPED_ROLLBACK_INSTALLED_V1__ === true
      );

      // Create the fixture state via Playwright's execution context instead of
      // inline HTML. OVYX's production CSP intentionally blocks inline scripts,
      // so relying on an inline fixture can leave WebStudio undefined.
      await page.evaluate(() => {
        const cloneGraph = value => JSON.parse(JSON.stringify(value));
        const baselineGraph = { version: 1, entry: 'src/main.html',
          files: { 'src/main.html': { type: 'text/html', content: '<main>Last-good graph baseline</main>' } } };
        const project = { id: 'graph-only-rollback-project', name: 'Baseline project',
          description: 'Graph-only fixture', pages: [], assets: [], ovyxGraph: cloneGraph(baselineGraph) };
        window.KernelState = { activeView: 'webstudio', projects: [project], activeProject: project };
        const paintEditor = () => {
          const content = document.getElementById('visible-editor-content');
          if (content) content.textContent = String(window.WebStudio?.graph?.files?.['src/main.html']?.content || '');
        };
        window.WebStudio = { project, graph: cloneGraph(baselineGraph), graphKeyPrefix: 'ovyx.ws.graph.v2.',
          syncGraphToProject() { this.project.ovyxGraph = cloneGraph(this.graph); },
          render: paintEditor, renderPreview: paintEditor, renderCodeTree() {} };
        window.ProjectStore = { save() { return true; }, renderProjects() {} };
        window.Router = { go(view) { window.KernelState.activeView = String(view || 'home'); } };
        document.getElementById('open-project-editor').addEventListener('click', () => {
          // Change only WebStudio.graph; leave KernelState.project mirror unchanged.
          window.WebStudio.graph.files['src/main.html'].content = '<main>Mutated only in live graph</main>';
          paintEditor();
          const modal = document.getElementById('project-editor');
          modal.hidden = false;
          modal.classList.add('open');
          modal.setAttribute('aria-hidden', 'false');
          modal.style.display = 'block';
        });
        document.getElementById('cancel-project-editor').addEventListener('click', () => {
          const modal = document.getElementById('project-editor');
          modal.classList.remove('open');
          modal.hidden = true;
          modal.setAttribute('aria-hidden', 'true');
          modal.style.display = 'none';
        });
        paintEditor();
      });
      const beforeHistory = await page.evaluate(() => history.length);
      await page.click('#open-project-editor');
      try {
        await page.waitForFunction(() =>
          !document.getElementById('project-editor').hidden
          && window.WebStudio.graph.files['src/main.html'].content.includes('Mutated only in live graph')
          && document.getElementById('visible-editor-content').textContent.includes('Mutated only in live graph'),
          null,
          { timeout: 5000 }
        );
      } catch (error) {
        const diagnostic = await page.evaluate(() => ({
          installed: window.__OVYX_SCOPED_ROLLBACK_INSTALLED_V1__ === true,
          hasStudio: !!window.WebStudio,
          graphContent: window.WebStudio?.graph?.files?.['src/main.html']?.content || '',
          visibleContent: document.getElementById('visible-editor-content')?.textContent || '',
          modalHidden: document.getElementById('project-editor')?.hidden,
          modalClass: document.getElementById('project-editor')?.className || '',
          historyLength: history.length,
          cloneAPI: typeof window.OVYXScopedRollback?.snapshotProject,
        }));
        throw new Error('Could not open the graph-only editor fixture: ' + JSON.stringify(diagnostic) + '; ' + error.message);
      }
      await page.waitForFunction(before => history.length > before, beforeHistory);

      if (closeMethod === 'cancel') {
        await page.click('#cancel-project-editor');
      } else {
        await page.evaluate(() => history.back());
      }

      await page.waitForFunction(() => {
        const modal = document.getElementById('project-editor');
        return modal.hidden
          && window.WebStudio.graph.files['src/main.html'].content.includes('Last-good graph baseline')
          && document.getElementById('visible-editor-content').textContent.includes('Last-good graph baseline')
          && window.KernelState.activeProject.ovyxGraph.files['src/main.html'].content.includes('Last-good graph baseline')
          && window.KernelState.projects.find(item => item.id === 'graph-only-rollback-project').ovyxGraph.files['src/main.html'].content.includes('Last-good graph baseline')
          && (JSON.parse(localStorage.getItem('ovyx.ws.graph.v2.graph-only-rollback-project') || '{}').files?.['src/main.html']?.content || '').includes('Last-good graph baseline');
      });

      const final = await page.evaluate(() => ({
        visible: document.getElementById('visible-editor-content').textContent,
        graph: window.WebStudio.graph.files['src/main.html'].content,
        activeProject: window.KernelState.activeProject.ovyxGraph.files['src/main.html'].content,
        listedProject: window.KernelState.projects.find(item => item.id === 'graph-only-rollback-project').ovyxGraph.files['src/main.html'].content,
        storedGraph: JSON.parse(localStorage.getItem('ovyx.ws.graph.v2.graph-only-rollback-project') || '{}').files?.['src/main.html']?.content || '',
        rollback: window.OVYXScopedRollback.diagnostics(),
      }));
      assert.match(final.visible, /Last-good graph baseline/, '[' + target.name + '/' + closeMethod + '] visible editor must immediately return to the baseline.');
      assert.match(final.graph, /Last-good graph baseline/, '[' + target.name + '/' + closeMethod + '] live graph must be restored.');
      assert.match(final.activeProject, /Last-good graph baseline/, '[' + target.name + '/' + closeMethod + '] active project mirror must be restored.');
      assert.match(final.listedProject, /Last-good graph baseline/, '[' + target.name + '/' + closeMethod + '] project list mirror must be restored.');
      assert.match(final.storedGraph, /Last-good graph baseline/, '[' + target.name + '/' + closeMethod + '] graph cache must contain the baseline.');
      assert.deepEqual(pageErrors, [], '[' + target.name + '/' + closeMethod + '] rollback must not throw browser runtime errors.');
      console.log('[OVYX graph-only rollback] ' + target.name + '/' + closeMethod + ': restored all live and persisted mirrors.');
      await page.close();
    }
  }
} finally {
  await browser.close();
}
