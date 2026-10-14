import assert from 'node:assert/strict';
import {
  containsGuardianCredential,
  guardianPatchablePath,
  createGuardianDiffPreview,
  prepareGuardianPatch,
  createGuardianPullRequest,
} from '../functions/_lib/ovyx-guardian-patch.js';
import { onRequest } from '../functions/api/admin/guardian-patch.js';

const sha = 'a'.repeat(40);
const mainSha = 'b'.repeat(40);
const original = "export function result() {\n  return 'old';\n}\n";
const replacement = "export function result() {\n  return 'new';\n}\n";
const readToken = 'guardian-read-only-test-token-long-enough';
const writeToken = 'guardian-write-token-test-long-enough';
const path = 'functions/api/admin/demo.js';

assert.equal(guardianPatchablePath(path), true);
assert.equal(guardianPatchablePath('.env.production'), false);
assert.equal(guardianPatchablePath('functions/.env.local'), false);
assert.equal(guardianPatchablePath('sentinel-worker/index.js'), false);
assert.equal(guardianPatchablePath('.github/workflows/deploy.yml'), false);
assert.equal(guardianPatchablePath('_headers'), false);
assert.equal(guardianPatchablePath('package-lock.json'), false);
assert.equal(guardianPatchablePath('package.json'), false);
assert.equal(guardianPatchablePath('config/cloudflare.yml'), false);
assert.equal(guardianPatchablePath('functions/api/_lib/auth.js'), false);
assert.equal(guardianPatchablePath('functions/_lib/firebase-admin.js'), false);
assert.equal(guardianPatchablePath('functions/_middleware.js'), false);
assert.equal(guardianPatchablePath('functions/api/admin/guardian-patch.js'), false);
assert.equal(guardianPatchablePath('functions/api/admin/guardian-repo.js'), false);
assert.equal(guardianPatchablePath('functions/_lib/ovyx-sentinel.js'), false);
assert.equal(containsGuardianCredential('const token = "ghp_123456789012345678901234567890123456";'), true);
assert.equal(containsGuardianCredential('const apiKey = "abcdef0123456789";'), true);
assert.equal(containsGuardianCredential('const apiKey = env.OPENAI_API_KEY;'), false);
assert.match(createGuardianDiffPreview(original, replacement, path), /-  return 'old';[\s\S]*\+  return 'new';/);

let requests = 0;
await assert.rejects(
  () => prepareGuardianPatch({ path, task: 'Fix the returned value safely', env: { AI: { run: async () => ({ response: '{}' }) } }, fetchImpl: async () => { requests += 1; throw new Error('must not fetch'); } }),
  error => error.code === 'GUARDIAN_REPO_READ_NOT_CONFIGURED' && error.status === 503,
);
assert.equal(requests, 0, 'missing read token must not call GitHub');

{
  let modelCalls = 0;
  const prepared = await prepareGuardianPatch({
    path,
    task: 'Fix the returned value safely',
    env: {
      OVYX_GUARDIAN_GITHUB_READ_TOKEN: readToken,
      AI: { run: async (_model, input) => {
        modelCalls += 1;
        const userMessage = input.messages.find(message => message.role === 'user');
        assert.equal(JSON.parse(userMessage.content).currentSource, original);
        return { response: JSON.stringify({ summary: 'Fix returned value', content: replacement }) };
      } },
    },
    fetchImpl: async (url, init = {}) => {
      requests += 1;
      const parsed = new URL(String(url));
      assert.equal(parsed.pathname, '/repos/thompsonemmanuel117-sketch/ovyx/contents/functions/api/admin/demo.js');
      assert.equal(parsed.searchParams.get('ref'), 'main');
      assert.equal(init.headers.Authorization, 'Bearer ' + readToken);
      return Response.json({
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(original).toString('base64'),
        sha,
      });
    },
    now: () => 1791972000000,
  });
  assert.equal(modelCalls, 1);
  assert.equal(prepared.path, path);
  assert.equal(prepared.baseSha, sha);
  assert.equal(prepared.summary, 'Fix returned value');
  assert.match(prepared.preview, /-  return 'old';[\s\S]*\+  return 'new';/);
  assert.equal(prepared.changesApplied, false);
  assert.equal(Date.parse(prepared.expiresAt) - Date.parse(prepared.createdAt), 15 * 60 * 1000);
}

{
  let modelCalls = 0;
  const secret = 'ghp_123456789012345678901234567890123456';
  await assert.rejects(
    () => prepareGuardianPatch({
      path,
      task: 'Fix the returned value safely',
      env: { OVYX_GUARDIAN_GITHUB_READ_TOKEN: readToken, AI: { run: async () => { modelCalls += 1; return { response: '{}' }; } } },
      fetchImpl: async () => Response.json({
        type: 'file', encoding: 'base64', content: Buffer.from('// ' + secret).toString('base64'), sha,
      }),
    }),
    error => error.code === 'GUARDIAN_SOURCE_SECRET_DETECTED' && error.status === 409,
  );
  assert.equal(modelCalls, 0, 'source with credential-like strings must never reach the model');
}

{
  const calls = [];
  const proposal = {
    id: 'c'.repeat(32),
    path,
    baseSha: sha,
    summary: 'Fix returned value',
    content: replacement,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    status: 'pending',
    userId: 'owner-uid',
  };
  const result = await createGuardianPullRequest({
    proposal,
    userId: 'owner-uid',
    env: { OVYX_GUARDIAN_GITHUB_READ_TOKEN: readToken, OVYX_GUARDIAN_GITHUB_WRITE_TOKEN: writeToken },
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(String(url));
      const method = init.method || 'GET';
      calls.push({ path: parsed.pathname, method, auth: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : null });
      if (parsed.pathname.endsWith('/contents/functions/api/admin/demo.js') && method === 'GET') {
        assert.equal(init.headers.Authorization, 'Bearer ' + readToken);
        return Response.json({ type: 'file', encoding: 'base64', content: Buffer.from(original).toString('base64'), sha });
      }
      if (parsed.pathname.endsWith('/git/ref/heads/main') && method === 'GET') {
        assert.equal(init.headers.Authorization, 'Bearer ' + writeToken);
        return Response.json({ ref: 'refs/heads/main', object: { sha: mainSha } });
      }
      if (parsed.pathname.endsWith('/git/refs') && method === 'POST') {
        assert.equal(init.headers.Authorization, 'Bearer ' + writeToken);
        assert.equal(init.body ? JSON.parse(init.body).sha : '', mainSha);
        assert.match(JSON.parse(init.body).ref, /^refs\/heads\/ovyx\/guardian\/fix-/);
        return Response.json({ ref: JSON.parse(init.body).ref }, { status: 201 });
      }
      if (parsed.pathname.endsWith('/contents/functions/api/admin/demo.js') && method === 'PUT') {
        assert.equal(init.headers.Authorization, 'Bearer ' + writeToken);
        assert.match(JSON.parse(init.body).branch, /^ovyx\/guardian\/fix-/);
        assert.notEqual(JSON.parse(init.body).branch, 'main', 'Guardian must never write directly to main');
        assert.equal(JSON.parse(init.body).sha, sha);
        assert.equal(Buffer.from(JSON.parse(init.body).content, 'base64').toString('utf8'), replacement);
        return Response.json({ content: { path }, commit: { sha: 'd'.repeat(40) } });
      }
      if (parsed.pathname.endsWith('/pulls') && method === 'POST') {
        const body = JSON.parse(init.body);
        assert.equal(body.base, 'main');
        assert.match(body.head, /^ovyx\/guardian\/fix-/);
        assert.match(body.body, /did not merge the change or deploy production/i);
        assert.equal(body.body.includes('owner-uid'), false, 'private account identifiers must not be exposed in public PR text');
        return Response.json({ html_url: 'https://github.com/thompsonemmanuel117-sketch/ovyx/pull/123', number: 123 }, { status: 201 });
      }
      throw new Error('Unexpected GitHub request ' + method + ' ' + parsed.pathname);
    },
  });
  assert.equal(result.pullRequestNumber, 123);
  assert.equal(result.pullRequestUrl, 'https://github.com/thompsonemmanuel117-sketch/ovyx/pull/123');
  assert.equal(result.mainBranchChanged, false);
  assert.equal(result.reviewBranchCreated, true);
  assert.equal(result.deployed, false);
  assert.equal(calls.some(call => call.method === 'PUT' && call.body?.branch === 'main'), false);
}

{
  let calls = 0;
  await assert.rejects(
    () => createGuardianPullRequest({
      proposal: { id: 'c'.repeat(32), path, baseSha: sha, summary: 'Fix', content: replacement, expiresAt: new Date(Date.now() + 60_000).toISOString(), status: 'pending', userId: 'owner-uid' },
      userId: 'owner-uid',
      env: { OVYX_GUARDIAN_GITHUB_READ_TOKEN: readToken, OVYX_GUARDIAN_GITHUB_WRITE_TOKEN: readToken },
      fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); },
    }),
    error => error.code === 'GUARDIAN_GITHUB_TOKENS_MUST_BE_SEPARATE' && error.status === 400,
  );
  assert.equal(calls, 0, 'read and write credentials must be separate');
}

{
  let writes = 0;
  await assert.rejects(
    () => createGuardianPullRequest({
      proposal: { id: 'c'.repeat(32), path, baseSha: sha, summary: 'Fix', content: replacement, expiresAt: new Date(Date.now() + 60_000).toISOString(), status: 'pending', userId: 'owner-uid' },
      userId: 'owner-uid',
      env: { OVYX_GUARDIAN_GITHUB_READ_TOKEN: readToken, OVYX_GUARDIAN_GITHUB_WRITE_TOKEN: writeToken },
      fetchImpl: async url => {
        writes += 1;
        const parsed = new URL(String(url));
        if (parsed.pathname.endsWith('/contents/functions/api/admin/demo.js')) {
          return Response.json({ type: 'file', encoding: 'base64', content: Buffer.from(original).toString('base64'), sha: 'e'.repeat(40) });
        }
        throw new Error('Writes must not start for a stale proposal');
      },
    }),
    error => error.code === 'GUARDIAN_PATCH_STALE' && error.status === 409,
  );
  assert.equal(writes, 1, 'stale proposals must stop before branch creation');
}

const unauth = await onRequest({
  request: new Request('https://ovyx.test/api/admin/guardian-patch', { method: 'GET' }),
  env: {},
});
assert.equal(unauth.status, 401, 'patch capabilities must reject unauthenticated requests');

const crossOrigin = await onRequest({
  request: new Request('https://ovyx.test/api/admin/guardian-patch', {
    method: 'GET',
    headers: { Origin: 'https://attacker.invalid' },
  }),
  env: {},
});
assert.equal(crossOrigin.status, 403, 'patch capabilities must reject cross-origin requests');

console.log('OVYX Guardian patch tests passed: credential boundaries, source-path allowlist, bounded preview, secret rejection, stale-file checks, separate tokens, branch-only writes, and review-only pull requests.');
