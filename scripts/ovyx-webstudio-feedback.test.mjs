import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/ai/feedback.js';

async function call(method, options = {}) {
  const headers = new Headers(options.headers || {});
  const request = new Request('https://ovyx.test/api/ai/feedback', {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const response = await onRequest({
    request,
    env: options.env || {},
    data: options.user ? { user: options.user } : {},
  });
  return { response, body: await response.json() };
}

{
  const result = await call('GET');
  assert.equal(result.response.status, 405);
  assert.equal(result.body.error, 'METHOD_NOT_ALLOWED');
}
{
  const result = await call('POST', {
    headers: { Origin: 'https://attacker.invalid' },
    body: { vote: 'up', messageId: 'msg_123' },
    user: { uid: 'test-user' },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.body.error, 'ORIGIN_REJECTED');
}
{
  const result = await call('POST', { body: { vote: 'up', messageId: 'msg_123' } });
  assert.equal(result.response.status, 401);
  assert.equal(result.body.error, 'AUTH_REQUIRED');
}
{
  const result = await call('POST', {
    body: { vote: 'skip', messageId: 'msg_123' },
    user: { uid: 'test-user', sub: 'test-user' },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error, 'FEEDBACK_VOTE_REQUIRED');
}
{
  const result = await call('POST', {
    body: { vote: 'up', messageId: '../../unsafe' },
    user: { uid: 'test-user', sub: 'test-user' },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error, 'FEEDBACK_MESSAGE_ID_INVALID');
}
{
  const result = await call('POST', {
    body: { vote: 'up', messageId: 'msg_123', model: 'test-model', provider: 'gemini', projectId: 'project-1' },
    user: { uid: 'test-user', sub: 'test-user' },
  });
  assert.ok(result.response.status >= 400, 'without Firestore configuration a vote must not claim it was saved');
  assert.notEqual(result.body.ok, true);
  assert.match(result.body.message, /could not save/i);
  assert.equal(JSON.stringify(result.body).includes('GEMINI_API_KEY'), false);
}

console.log('Web Studio AI feedback tests passed: method/origin/auth guards, vote and ID validation, and fail-closed storage.');
