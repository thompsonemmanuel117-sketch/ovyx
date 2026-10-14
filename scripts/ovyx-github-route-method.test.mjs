import assert from 'node:assert/strict';
import { onRequest as githubOAuth } from '../functions/api/github/oauth.js';
import { onRequest as githubRepos } from '../functions/api/github/repos.js';

const routes = [
  ['GitHub OAuth', githubOAuth, 'https://ovyx.test/api/github/oauth'],
  ['GitHub repositories', githubRepos, 'https://ovyx.test/api/github/repos'],
];

for (const [label, handler, url] of routes) {
  const allowed = await handler({
    request: new Request(url, { method: 'GET' }),
    env: {},
  });
  assert.ok(allowed instanceof Response, label + ': a permitted GET must return a Response, never a boolean');
  assert.equal(allowed.status, 500, label + ': absent server configuration should fail closed through a normal HTTP response');
  const failure = await allowed.json();
  assert.equal(failure.ok, false);
  assert.equal(failure.error, 'GitHub authentication could not be completed.', 'public OAuth error messages must remain generic');

  const denied = await handler({
    request: new Request(url, { method: 'POST' }),
    env: {},
  });
  assert.ok(denied instanceof Response, label + ': disallowed methods must return a Response');
  assert.equal(denied.status, 405, label + ': unsupported methods must be rejected before configuration/auth work');
  assert.equal(denied.headers.get('allow'), 'GET');
  const deniedBody = await denied.json();
  assert.equal(deniedBody.ok, false);
}

console.log('GitHub route contract tests passed: valid methods return HTTP Responses, unsupported methods return 405, and OAuth failure messages remain generic.');
