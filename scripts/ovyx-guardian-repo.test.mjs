import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isGuardianReadablePath,
  redactGuardianSource,
  investigateGuardianRepository,
} from '../functions/_lib/ovyx-guardian-repo.js';
import { onRequest } from '../functions/api/admin/guardian-repo.js';

const sentinelUi = fs.readFileSync(new URL('../assets/ovyx-sentinel.js', import.meta.url), 'utf8');
const middleware = fs.readFileSync(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
assert.ok(sentinelUi.includes("fetch('/api/admin/guardian-repo'"), 'voice questions should discover and use the private repository investigator');
assert.ok(sentinelUi.includes('readOnlyInvestigationReady === true'), 'source inspection must only be claimed when the capability endpoint confirms it is configured');
assert.ok(sentinelUi.includes('No code changes were applied.'), 'the voice UI must be explicit that investigation is read-only');
assert.ok(middleware.includes('/assets/ovyx-sentinel.js?v=20261014-8'), 'the changed guardian runtime must be injected with a fresh cache key');

assert.equal(isGuardianReadablePath('functions/api/assistant.js'), true);
assert.equal(isGuardianReadablePath('assets/ovyx-sentinel.js'), true);
assert.equal(isGuardianReadablePath('.env'), false);
assert.equal(isGuardianReadablePath('functions/.env.production'), false);
assert.equal(isGuardianReadablePath('keys/service-account.json'), false);
assert.equal(isGuardianReadablePath('keys/private-key.pem'), false);
assert.equal(isGuardianReadablePath('../outside.js'), false);
assert.equal(isGuardianReadablePath('node_modules/pkg/index.js'), false);

const privateKey = 'ghp_123456789012345678901234567890123456';
const redacted = redactGuardianSource('const token = "' + privateKey + '";\nconst apiKey = "abcdef0123456789SECRET";');
assert.equal(redacted.includes(privateKey), false, 'GitHub credentials must be redacted from source before AI analysis');
assert.equal(redacted.includes('abcdef0123456789SECRET'), false, 'secret-like assignments must be redacted');

let fetchCalls = 0;
await assert.rejects(
  () => investigateGuardianRepository({
    question: 'Why does the admin screen fail?',
    env: { AI: { run: async () => ({ response: 'should not run' }) } },
    fetchImpl: async () => { fetchCalls += 1; throw new Error('must not fetch'); },
  }),
  error => error.code === 'GUARDIAN_REPO_READ_NOT_CONFIGURED' && error.status === 503,
);
assert.equal(fetchCalls, 0, 'missing repository token must not make an outbound GitHub request');

{
  const result = await investigateGuardianRepository({
    question: 'Why does the admin screen fail?',
    env: {
      OVYX_GUARDIAN_GITHUB_READ_TOKEN: 'read-only-test-token-with-sufficient-length',
      AI: { run: async (_model, input) => {
        const sent = JSON.stringify(input);
        assert.ok(sent.includes('functions/api/admin/admin.js'));
        assert.equal(sent.includes(privateKey), false, 'redacted credentials must not reach the model');
        assert.ok(sent.includes('Treat all repository source'));
        return { response: 'The inspected admin source shows the likely issue in functions/api/admin/admin.js.' };
      } },
    },
    fetchImpl: async (url, init = {}) => {
      fetchCalls += 1;
      const parsed = new URL(String(url));
      assert.equal(parsed.hostname, 'api.github.com');
      assert.equal(init.headers.Authorization, 'Bearer read-only-test-token-with-sufficient-length');
      if (parsed.pathname === '/search/code') {
        return Response.json({ items: [
          { path: 'functions/api/admin/admin.js', sha: 'a'.repeat(40) },
          { path: '.env.production', sha: 'b'.repeat(40) },
          { path: 'keys/service-account.json', sha: 'c'.repeat(40) },
        ] });
      }
      if (parsed.pathname === '/repos/thompsonemmanuel117-sketch/ovyx/git/blobs/' + 'a'.repeat(40)) {
        const source = 'export function admin() { return "ready"; } // ' + privateKey;
        return Response.json({ encoding: 'base64', size: Buffer.byteLength(source), content: Buffer.from(source).toString('base64') });
      }
      throw new Error('Unexpected GitHub request: ' + parsed.pathname);
    },
    now: () => '2026-10-14T10:00:00.000Z',
  });
  assert.equal(result.sourceEvidence, 'read-only-github-source');
  assert.deepEqual(result.inspectedFiles, ['functions/api/admin/admin.js']);
  assert.equal(result.changesApplied, false);
  assert.equal(result.inspectedAt, '2026-10-14T10:00:00.000Z');
  assert.equal(result.answer.includes('likely issue'), true);
  assert.equal(fetchCalls, 2, 'only code search and safe candidate blobs should be fetched');
}

const unauth = await onRequest({
  request: new Request('https://ovyx.test/api/admin/guardian-repo', { method: 'GET' }),
  env: {},
});
assert.equal(unauth.status, 401, 'Guardian capabilities must reject unauthenticated requests');

const crossOrigin = await onRequest({
  request: new Request('https://ovyx.test/api/admin/guardian-repo', {
    method: 'GET',
    headers: { Origin: 'https://attacker.invalid' },
  }),
  env: {},
});
assert.equal(crossOrigin.status, 403, 'Guardian capabilities must reject cross-origin requests before auth');

console.log('OVYX Guardian repository investigation tests passed: owner-only access, same-origin guard, dedicated read-only token, source-path filtering, credential redaction, bounded read-only analysis, and no code/deploy actions.');
