import assert from 'node:assert/strict';
import {
  collectSentinelChecks,
  createSentinelReport,
  createSentinelFixPlan,
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
  if (['generativelanguage.googleapis.com', 'api.anthropic.com', 'api.deepseek.com', 'api.openai.com', 'api.groq.com', 'openrouter.ai'].includes(parsed.hostname)) return response({ data: [] });
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
  env: { OVYX_SENTINEL_GITHUB_TOKEN: 'read-only-test-token', GEMINI_API_KEY: 'test-gemini', ANTHROPIC_API_KEY: 'test-anthropic', DEEPSEEK_API_KEY: 'test-deepseek', OPENAI_API_KEY: 'test-openai', GROQ_API_KEY: 'test-groq', OPENROUTER_API_KEY: 'test-openrouter' },
  fetchImpl: fakeFetch,
  now: () => tick++,
});
assert.equal(scan.checks.length, 12, 'core endpoints, six configured AI provider checks, and optional GitHub Actions check must be represented');
assert.ok(scan.checks.find(item => item.id === 'app_shell')?.ok, 'HTML shell should be validated');
assert.ok(scan.checks.find(item => item.id === 'sentinel_asset')?.ok, 'Sentinel asset itself should be included in health checks');
assert.equal(scan.checks.filter(item => item.id.startsWith('ai_') && item.status === 'pass').length, 6, 'all configured provider credentials should be checked without generation calls');
assert.equal(JSON.stringify(scan).includes('test-openrouter'), false, 'provider secrets must never appear in Sentinel reports');
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
assert.equal(degraded.checks.filter(item => item.id.startsWith('ai_') && item.status === 'skipped').length, 6, 'missing optional AI keys should be visible as skipped, not false alarms');

const credentialFailures = await collectSentinelChecks({
  origin: 'https://ovyx.example',
  env: { GEMINI_API_KEY: 'bad-gemini', OPENAI_API_KEY: 'no-credit-openai', ANTHROPIC_API_KEY: 'restricted-anthropic' },
  fetchImpl: async (url) => {
    const host = new URL(String(url)).hostname;
    if (host === 'generativelanguage.googleapis.com') return response({ error: true }, { status: 401 });
    if (host === 'api.openai.com') return response({ error: true }, { status: 402 });
    if (host === 'api.anthropic.com') return response({ error: true }, { status: 403 });
    const path = new URL(String(url)).pathname;
    if (path === '/') return response('<html></html>', { contentType: 'text/html', rawBody: '<html></html>' });
    if (path === '/api/health') return response({ ok: true, status: 'healthy' });
    if (path === '/api/service-status') return response({ ok: true, connectionEncryption: { configured: true } });
    if (path.startsWith('/assets/')) return response('js', { contentType: 'application/javascript', rawBody: 'js' });
    return response({ data: [] });
  },
});
assert.equal(credentialFailures.checks.find(item => item.id === 'ai_gemini')?.code, 'PROVIDER_AUTH_FAILED');
assert.equal(credentialFailures.checks.find(item => item.id === 'ai_openai')?.code, 'PROVIDER_BILLING_OR_CREDITS_REQUIRED');
assert.equal(credentialFailures.checks.find(item => item.id === 'ai_anthropic')?.code, 'PROVIDER_PERMISSION_OR_ACCOUNT_RESTRICTED');
assert.equal(credentialFailures.checks.find(item => item.id === 'ai_deepseek')?.status, 'skipped');
assert.equal(JSON.stringify(credentialFailures).includes('bad-gemini'), false, 'rejected key values must never appear in reports');

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
assert.equal(report.checkedCount, 3, 'skipped optional checks do not count as checked endpoints');
assert.ok(!JSON.stringify(report).includes('sourceCode') && !JSON.stringify(report).includes('privateProjectContent'));

const scheduledScan = { ...failedChecks, finishedAt: new Date().toISOString() };
const scheduledReport = createSentinelReport({ scan: scheduledScan, id: 'run_cron', source: 'scheduled' });
assert.equal(scheduledReport.source, 'scheduled');
assert.equal(scheduledReport.checks.find(item => item.id === 'background_scheduler')?.status, 'pass');


const concurrencyState = { active: 0, maxActive: 0 };
const concurrencyScan = await collectSentinelChecks({
  origin: 'https://ovyx.example',
  fetchImpl: async url => {
    concurrencyState.active += 1;
    concurrencyState.maxActive = Math.max(concurrencyState.maxActive, concurrencyState.active);
    try {
      await new Promise(resolve => setTimeout(resolve, 12));
      const path = new URL(String(url)).pathname;
      if (path === '/') return response('<html></html>', { contentType: 'text/html', rawBody: '<html></html>' });
      if (path === '/api/health') return response({ ok: true, status: 'healthy' });
      if (path === '/api/service-status') return response({ ok: true, connectionEncryption: { configured: true } });
      if (path.startsWith('/assets/')) return response('js', { contentType: 'application/javascript', rawBody: 'js' });
      throw new Error('Unexpected test URL');
    } finally {
      concurrencyState.active -= 1;
    }
  },
});
assert.equal(concurrencyScan.checks.length, 12, 'five first-party checks, six skipped optional provider checks, and the optional GitHub status row should be represented');
assert.ok(concurrencyState.maxActive >= 5, 'the first-party health probes should run concurrently to stay within the Cron request budget');

const remediationPlan = createSentinelFixPlan({
  id: 'run_remediation_fixture',
  status: 'critical',
  checks: [
    { id: 'platform_health', status: 'warning', code: 'PLATFORM_HEALTH_DEGRADED', summary: 'Required configuration is degraded.', details: ['FIREBASE_PROJECT_ID', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'not a safe name', 'ghp_superSecretShouldNeverBeShown'] },
    { id: 'service_configuration', status: 'warning', code: 'CONNECTION_ENCRYPTION_NOT_CONFIGURED', summary: 'Connection encryption is not configured.' },
    { id: 'github_actions', status: 'fail', code: 'LATEST_CI_RUN_FAILED', summary: 'Recent CI failed.' },
  ],
});
assert.equal(remediationPlan.status, 'attention_required');
assert.equal(remediationPlan.automaticChanges, false);
assert.equal(remediationPlan.tasks.length, 3);
assert.deepEqual(remediationPlan.tasks[0].configurationNames, ['FIREBASE_PROJECT_ID', 'FIREBASE_SERVICE_ACCOUNT_JSON']);
assert.match(remediationPlan.tasks[1].steps.join(' '), /Do not replace or rotate an existing encryption key/i);
assert.doesNotMatch(JSON.stringify(remediationPlan), /ghp_superSecretShouldNeverBeShown/);
assert.match(remediationPlan.note, /does not edit source files/i);
assert.equal(createSentinelFixPlan({ id: 'run_healthy', status: 'healthy', checks: [{ id: 'health', status: 'pass', code: 'HTTP_OK' }] }).tasks.length, 0);
assert.equal(createSentinelFixPlan(null).status, 'no_report');

console.log('OVYX Sentinel unit tests passed: admin boundary, constant-time cron secret guard, health checks, optional GitHub authentication, stale workflow handling, degraded configuration, URL policy, and report classification.');
