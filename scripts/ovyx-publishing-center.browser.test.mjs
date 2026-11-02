import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const calls = [];
  await page.setContent('<!doctype html><html><head></head><body><main id="view-web-studio"></main></body></html>');
  await page.evaluate(() => {
    window.KernelState = { activeProject: { id: 'publishing-fixture', name: 'Publishing fixture' } };
    window.WebStudio = {
      graph: { entry: 'index.html', files: { 'index.html': { content: '<!doctype html><html><head></head><body><h1>Publishing fixture</h1></body></html>' } } },
      ensureProjectGraph() { return this.graph; }
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
  await page.waitForSelector('#ovyx-publishing-center .ovyx-pub-trigger');
  await page.getByRole('button', { name: 'Publish website' }).click();
  await page.getByRole('button', { name: 'Create preview' }).waitFor();
  await page.getByRole('button', { name: 'Publish to production' }).waitFor();
  await page.getByRole('button', { name: 'Restore this release' }).waitFor();
  await page.getByText('www.example.com').waitFor();

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
  console.log('OVYX publishing center browser tests passed.');
} finally {
  await browser.close();
}
