import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setContent('<!doctype html><html><head></head><body><main id="view-webstudio"><div id="ws-deploy-modal"><div id="ws-deploy-content"></div></div></main></body></html>');
  await page.evaluate(() => {
    window.KernelState = { activeView: 'webstudio', activeProject: { id: 'publishing-fixture', name: 'Publishing fixture' } };
    window.WebStudio = {
      graph: { entry: 'index.html', files: { 'index.html': { content: '<!doctype html><html><head></head><body><h1>Publishing fixture</h1></body></html>' } } },
      ensureProjectGraph() { return this.graph; },
      runTests() { return { ok: true }; },
      openEngineeringConsole() {},
      openDeployPanel() {
        const host = document.getElementById('ws-deploy-content');
        host.innerHTML = '<div class="ovyx-ws-plan-editor"><div><div class="ovyx-ws-plan-field"><label>Domain</label><input id="ws-deploy-domain" value="" placeholder="example.com"/></div><div class="ovyx-ws-plan-field"><label>Environment variables</label><textarea id="ws-deploy-env"></textarea></div></div></div><div class="ovyx-ws-plan-actions"><button type="button" id="ws-deploy-run">Run checks &amp; publish</button><button type="button" data-ws-close="deploy">Close</button></div>';
        document.getElementById('ws-deploy-modal').classList.add('open');
      }
    };
    window.firebase = { auth: () => ({ currentUser: { getIdToken: async () => 'fixture-firebase-token' } }) };
    window.confirm = () => true;
    window.showToast = () => {};
    window.__publishingCalls = [];
    window.fetch = async (url, init = {}) => {
      const parsed = new URL(String(url), 'https://ovyx.test');
      const method = String(init.method || 'GET').toUpperCase();
      const headers = init.headers || {};
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
      window.__publishingCalls.push({ path: parsed.pathname, method, body, authorization: headers.Authorization || headers.authorization || '' });
      if (parsed.pathname === '/api/deploy') {
        return Response.json({ success: true, deployment: { deploymentId: 'dep-fixture-12345678', environment: body.action === 'publish' ? 'production' : 'preview' } });
      }
      if (parsed.pathname === '/api/deployment-status') {
        return Response.json({ success: true, deployment: { deploymentId: parsed.searchParams.get('deploymentId'), stage: 'deploy', status: 'success', url: 'https://fixture.pages.dev' } });
      }
      if (parsed.pathname === '/api/publishing' && method === 'GET') {
        return Response.json({
          success: true,
          releases: [{ deploymentId: 'release-fixture-12345678', environment: 'production', stage: 'deploy', status: 'success', canRollback: true, createdAt: '2026-11-02T10:00:00.000Z', url: 'https://release-fixture.pages.dev' }],
          domains: [{ name: 'www.example.com', status: 'active', httpsReady: true, dns: { type: 'CNAME', name: 'www.example.com', target: 'fixture.pages.dev' } }]
        });
      }
      if (parsed.pathname === '/api/publishing' && method === 'POST') {
        return Response.json({ success: true, action: body.action, domain: { name: body.domain, status: 'pending', httpsReady: false } });
      }
      return Response.json({ success: false, error: 'Unexpected publishing test request.' }, { status: 404 });
    };
  });
  await page.addScriptTag({ path: path.join(root, 'assets/ovyx-publishing-center.js') });
  await page.waitForFunction(() => window.WebStudio.openDeployPanel.__ovyxPublishingCenterWrapped === true);
  await page.evaluate(() => window.WebStudio.openDeployPanel());
  await page.waitForSelector('#ws-deploy-content [data-ovyx-publishing-center]');
  await page.getByRole('button', { name: 'Create preview' }).waitFor();
  await page.getByRole('button', { name: 'Publish to production' }).waitFor();
  await page.getByRole('button', { name: 'Restore this release' }).waitFor();
  await page.getByText('www.example.com', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Create preview' }).click();
  await page.getByText('Open published website: https://fixture.pages.dev').waitFor();

  const domainInput = page.getByRole('textbox', { name: 'Custom domain name' });
  await domainInput.fill('myshop.com');
  await page.getByRole('button', { name: 'Connect domain' }).click();
  await page.getByText('Domain added. Follow the DNS instructions').waitFor();

  await page.getByRole('button', { name: 'Restore this release' }).click();
  await page.getByRole('button', { name: 'Publish to production' }).click();
  await page.getByText('Open published website: https://fixture.pages.dev').waitFor();

  const recorded = await page.evaluate(() => window.__publishingCalls);
  const deployCalls = recorded.filter(call => call.path === '/api/deploy');
  assert.equal(deployCalls.length, 2, 'Preview and production publishing must each call the existing deploy endpoint.');
  assert.equal(deployCalls[0].body.action, 'deploy');
  assert.equal(deployCalls[1].body.action, 'publish');
  assert.ok(deployCalls.every(call => call.authorization === 'Bearer fixture-firebase-token'), 'Deploy requests must carry a Firebase ID token.');
  assert.ok(recorded.some(call => call.path === '/api/deployment-status'), 'The UI must poll authoritative deployment status.');
  assert.ok(recorded.some(call => call.path === '/api/publishing' && call.method === 'POST' && call.body.action === 'add-domain' && call.body.domain === 'myshop.com'), 'The domain form must call the server-side domain API.');
  assert.ok(recorded.some(call => call.path === '/api/publishing' && call.method === 'POST' && call.body.action === 'rollback'), 'Rollback must call the server-side release API.');
  assert.equal(recorded.filter(call => call.path.startsWith('/api/')).every(call => call.authorization === 'Bearer fixture-firebase-token'), true);
  assert.equal(await page.locator('#ws-deploy-run').count(), 1, 'The existing deployment action must be reused, not replaced with a second publishing entry point.');
  console.log('OVYX publishing center browser tests passed.');
} finally {
  await browser.close();
}
