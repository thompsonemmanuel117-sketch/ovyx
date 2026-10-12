import assert from 'node:assert/strict';
import {
  collectSentinelChecks,
  createSentinelReport,
  isSentinelAdmin,
  sentinelCronSecretMatches,
} from '../functions/_lib/ovyx-sentinel.js';

function response(body, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('content-type')) headers.set('content-type', options.contentType || 'application/json');
  return new Response(options.rawBody || JSON.stringify(body), { status: options.status || 200, headers });
}

const verifiedOwner = { email: 'ovyxsupportteam@gmail.com', emailVerified: true };
assert.equal(isSentinelAdmin(verifiedOwner), true);
assert.equal(isSentinelAdmin({ email: 'ovyxsupportteam@gmail.com', emailVerified: false }), false);
assert.equal(isSentinelAdmin({ email: 'other@example.com', emailVerified: true }), false);
assert.equal(isSentinelAdmin(null), false);

const secret = 'sentinel-secret-test-value-with-more-than-32-chars';
assert.equal(sentinelCronSecretMatches(secret, secret), true);
assert.equal(sentinelCronSecretMatches(secret, secret + 'x'), false);
assert.equal(sentinelCronSecretMatches('short', 'short'), false);
assert.equal(sentinelCronSecretMatches(secret, 'different-secret-test-value-with-more-than-32-chars'), false);

const env = {};
const calls = [];
const fakeFetch = async (url, init = {}) => {
  const parsed = new URL(String(url));
  calls.push({ url: parsed.toString(), headers: new Headers(init.headers || {}) });
  if (parsed.hostname === 'api.github.com') {
    return response({
      workflow_runs: [
        { workflow_id: 1, name: 'Build', status: 'completed', conclusion: 'failure', created_at: '2026-10-12T08:00:00Z' },
        { workflow_id: 1, name: 'Build', status: 'completed', conclusion: 'success', created_at: '2026-10-12T09:00:00Z' },
        { workflow_id: 2, name: 'Security check', status: 'completed', conclusion: 'failure', created_at: '2026-10-12T09:30:00Z' },
      ],
    });
  }
  if (parsed.pathname === '/') return response('<!doctype html><html></html>', { contentType: 'text/html', rawBody: '<!doctype html><html></html>' });
  if (parsed.pathname === '/api/health') return response({ ok: true, status: 'healthy' });
  if (parsed.pathname === '/api/service-status') return response({ ok: true, connectionEncryption: { configured: true } });
  if (parsed.pathname.startsWith('/assets/')) return response('/* sentinel asset */', { contentType: 'application/javascript', rawBody: '/* sentinel asset */' });
  return response({ ok: false }, { status: 404 });
};

let tick = Date.now();
const scan = await collectSentinelChecks({
  origin: 'https://ovyx.example',
  env: { OVYX_SENTINEL_GITHUB_TOKEN: 'read-only-test-token' },
  fetchImpl: fakeFetch,
  now: () => tick++,
});
assert.equal(scan.checks.length, 6, 'all core endpoints plus optional GitHub Actions check must be represented');
assert.ok(scan.checks.find(item => item.id === 'app_shell')?.ok, 'HTML shell should be validated');
assert.ok(scan.checks.find(item => item.id === 'sentinel_asset')?.ok, 'Sentinel asset itself should be included in health checks');
assert.ok(scan.checks.find(item => item.id === 'github_actions')?.status === 'fail', 'latest failed workflow should be reported even if an older run failed too');
assert.deepEqual(scan.checks.find(item => item.id === 'github_actions')?.details, ['Security check'], 'only the latest completed run per workflow should determine health');
const githubRequest = calls.find(item => new URL(item.url).hostname === 'api.github.com');
assert.equal(githubRequest?.headers.get('authorization'), 'Bearer read-only-test-token', 'the optional GitHub credential must actually be sent server-side');
assert.equal(githubRequest?.headers.get('x-github-api-version'), '2022-11-28');

const degraded = await collectSentinelChecks({
  origin: 'https://ovyx.example',
  env: {},
  fetchImpl: async url => {
    const path = new URL(String(url)).pathname;
    if (path === '/') return response('<html></html>', { contentType: 'text/html', rawBody: '<html></html>' });
    if (path === '/api/health') return response({ ok: false, status: 'degraded', missingRequiredEnvironment: ['FIREBASE_PROJECT_ID'], invalidRequiredEnvironment: [{ key: 'FIREBASE_SERVICE_ACCOUNT_JSON' }] });
    if (path === '/api/service-status') return response({ ok: true, connectionEncryption: { configured: false } });
    if (path.startsWith('/assets/')) return response('js', { contentType: 'application/javascript', rawBody: 'js' });
    throw new Error('Unexpected test URL');
  },
});
assert.equal(degraded.checks.find(item => item.id === 'platform_health')?.status, 'warning');
assert.deepEqual(degraded.checks.find(item => item.id === 'platform_health')?.details, ['FIREBASE_PROJECT_ID', 'FIREBASE_SERVICE_ACCOUNT_JSON']);
assert.equal(degraded.checks.find(item => item.id === 'service_configuration')?.code, 'CONNECTION_ENCRYPTION_NOT_CONFIGURED');
assert.equal(degraded.checks.find(item => item.id === 'github_actions')?.status, 'skipped');

await assert.rejects(
  () => collectSentinelChecks({ origin: 'http://ovyx.example', fetchImpl: fakeFetch }),
  error => error.code === 'HTTPS_REQUIRED',
);
await assert.rejects(
  () => collectSentinelChecks({ origin: 'https://user:pass@ovyx.example', fetchImpl: fakeFetch }),
  error => error.code === 'INVALID_SITE_ORIGIN',
);

const failedChecks = {
  startedAt: '2026-10-12T10:00:00.000Z',
  finishedAt: '2026-10-12T10:00:08.000Z',
  checks: [
    { id: 'health', path: '/api/health', status: 'fail', ok: false, code: 'HTTP_503', summary: 'Health endpoint failed.' },
    { id: 'provider', path: '/api/service-status', status: 'warning', ok: false, code: 'CONFIG_MISSING', summary: 'Configuration is missing.' },
    { id: 'github', path: 'GitHub Actions', status: 'skipped', ok: true, code: 'NOT_CONFIGURED', summary: 'Optional check skipped.' },
  ],
};
const report = createSentinelReport({ scan: failedChecks, id: 'run_fixture', source: 'manual', previousScheduledAt: null });
assert.equal(report.status, 'critical');
assert.equal(report.criticalCount, 1);
assert.equal(report.warningCount, 2, 'a missing recent scheduler confirmation is a warning on manual runs');
assert.equal(report.checkedCount, 4);
assert.ok(!JSON.stringify(report).includes('sourceCode') && !JSON.stringify(report).includes('privateProjectContent'));

const scheduledReport = createSentinelReport({ scan: failedChecks, id: 'run_cron', source: 'scheduled' });
assert.equal(scheduledReport.source, 'scheduled');
assert.equal(scheduledReport.checks.find(item => item.id === 'background_scheduler')?.status, 'pass');

console.log('OVYX Sentinel unit tests passed: admin boundary, constant-time cron secret guard, health checks, optional GitHub authentication, stale workflow handling, degraded configuration, URL policy, and report classification.');
