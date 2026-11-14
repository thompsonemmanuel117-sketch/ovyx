import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { onRequest } from '../functions/api/admin/sentinel-companion.js';
import { OVYX_CLOUDFLARE_FREE_MODEL } from '../functions/_lib/cloudflare-free-ai.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const projectId = 'ovyx-companion-test-project';
const rootUid = 'ovyx-root-test-user';
const guestUid = 'ovyx-guest-test-user';
const now = Math.floor(Date.now() / 1000);
const keyPair = await crypto.subtle.generateKey({
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}, true, ['sign', 'verify']);
const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
const spkiBase64 = Buffer.from(spki).toString('base64').match(/.{1,64}/g).join('\n');
const publicPem = '-----BEGIN PUBLIC KEY-----\n' + spkiBase64 + '\n-----END PUBLIC KEY-----';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}
async function makeToken(uid, email, emailVerified = true) {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: 'ovyx-test-kid', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    aud: projectId,
    iss: 'https://securetoken.google.com/' + projectId,
    sub: uid,
    uid,
    email,
    email_verified: emailVerified,
    auth_time: now,
    iat: now,
    exp: now + 3600,
    firebase: { sign_in_provider: 'password' },
  }));
  const message = header + '.' + payload;
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(message)));
  return message + '.' + base64url(signature);
}

const rootToken = await makeToken(rootUid, 'ovyxsupportteam@gmail.com');
const guestToken = await makeToken(guestUid, 'guest@example.test');
const requestsToFirebase = [];
let aiCalls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init = {}) => {
  const parsed = new URL(String(url));
  requestsToFirebase.push({ url: parsed.toString(), method: init.method || 'GET' });
  if (parsed.hostname === 'www.googleapis.com' && parsed.pathname.includes('securetoken@system.gserviceaccount.com')) {
    return Response.json({ 'ovyx-test-kid': publicPem }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  }
  if (parsed.hostname === 'identitytoolkit.googleapis.com' && parsed.pathname.endsWith('/accounts:lookup')) {
    const body = JSON.parse(String(init.body || '{}'));
    if (body.idToken === rootToken) {
      return Response.json({ users: [{ localId: rootUid, email: 'ovyxsupportteam@gmail.com', emailVerified: true, disabled: false }] });
    }
    if (body.idToken === guestToken) {
      return Response.json({ users: [{ localId: guestUid, email: 'guest@example.test', emailVerified: true, disabled: false }] });
    }
    return Response.json({ error: { message: 'INVALID_ID_TOKEN' } }, { status: 400 });
  }
  throw new Error('Unexpected external request: ' + parsed.origin + parsed.pathname);
};

function makeContext(method, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.token) headers.set('Authorization', 'Bearer ' + options.token);
  if (options.origin !== null) headers.set('Origin', options.origin || 'https://ovyx.test');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const request = new Request('https://ovyx.test/api/admin/sentinel-companion', {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  return {
    request,
    env: options.env || {
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_WEB_API_KEY: 'fake-test-web-api-key',
      OVYX_AI_ENGINE_MODE: 'legacy-provider-routing',
      OVYX_ALLOW_PAID_PROVIDER_ROUTING: 'true',
      AI: {
        async run(model, input) {
          aiCalls.push({ model, input });
          return {
            response: 'Welcome back. I am here to help you with OVYX.',
            usage: { prompt_tokens: 14, completion_tokens: 19, total_tokens: 33 },
          };
        },
      },
    },
  };
}

try {
  {
    const before = requestsToFirebase.length;
    const response = await onRequest(makeContext('GET'));
    assert.equal(response.status, 405, 'read-only methods must not be accepted by the conversation route');
    assert.equal(requestsToFirebase.length, before, 'method guard runs before authentication');
  }

  {
    const before = requestsToFirebase.length;
    const response = await onRequest(makeContext('POST', { origin: 'https://attacker.invalid', body: { action: 'chat', messages: [{ role: 'user', content: 'hello' }] } }));
    assert.equal(response.status, 403, 'cross-origin requests must be rejected before identity lookup');
    assert.equal(requestsToFirebase.length, before);
  }

  {
    const response = await onRequest(makeContext('POST', { body: { action: 'chat', messages: [{ role: 'user', content: 'hello' }] } }));
    assert.equal(response.status, 401, 'chat must require a verified Firebase session');
  }

  {
    const response = await onRequest(makeContext('POST', {
      token: guestToken,
      body: { action: 'chat', messages: [{ role: 'user', content: 'hello' }] },
    }));
    assert.equal(response.status, 403, 'a normal signed-in user must not access the private owner companion');
    assert.equal((await response.json()).error, 'SENTINEL_ADMIN_REQUIRED');
  }

  {
    const response = await onRequest(makeContext('POST', {
      token: rootToken,
      body: { action: 'delete', messages: [{ role: 'user', content: 'hello' }] },
    }));
    assert.equal(response.status, 400, 'only the explicit chat action is allowed');
    assert.equal((await response.json()).error, 'GUARDIAN_ACTION_INVALID');
    assert.equal(aiCalls.length, 0, 'invalid action must not call the model');
  }

  {
    const secret = 'sk-test-NEVER-ECHO-this-private-string';
    const context = makeContext('POST', {
      token: rootToken,
      body: {
        action: 'chat',
        messages: [
          { role: 'user', content: 'Can you help with OVYX?' },
          { role: 'assistant', content: 'Of course, boss.' },
          { role: 'user', content: 'Continue our conversation, and note this fake token ' + secret },
        ],
        latestReport: {
          status: 'needs_attention',
          finishedAt: new Date().toISOString(),
          criticalCount: 0,
          warningCount: 1,
          checks: [{ path: 'Cloudflare Workers AI', status: 'fail', code: 'CLOUDFLARE_AI_UNAVAILABLE', summary: 'Cloudflare AI is temporarily unavailable.' }],
        },
      },
    });
    context.__ovyxTestDependencies = {
      // Mock the shared model boundary so this unit test never reads the
      // protected daily neuron ledger or spends real Cloudflare inference.
      callModel: async (_env, options) => {
        aiCalls.push({
          model: OVYX_CLOUDFLARE_FREE_MODEL,
          input: { messages: [{ role: 'system', content: options.system }, { role: 'user', content: options.user }] },
          options,
        });
        return {
          text: 'Welcome back. I am here to help you with OVYX.',
          provider: 'cloudflare-workers-ai',
          routedProvider: 'cloudflare-workers-ai',
        };
      },
    };
    const response = await onRequest(context);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify({ body, modelCalls: aiCalls.length }));
    assert.equal(body.ok, true);
    assert.match(body.text, /welcome back/i);
    assert.equal(body.historySaved, false, 'chat must not be persisted server-side');
    assert.equal(body.sessionOnly, true);
    assert.equal(JSON.stringify(body).includes(secret), false, 'credential-like content must never be echoed in the response');
    assert.equal(aiCalls.length, 1, 'a valid root-owner chat calls exactly one configured AI path');
    const call = aiCalls[0];
    assert.match(call.model, /^@cf\//);
    assert.match(call.input.messages[0].content, /friendly colleague/i);
    assert.match(call.input.messages[0].content, /UNTRUSTED LATEST HEALTH SUMMARY/i);
    assert.match(call.input.messages[1].content, /Can you help with OVYX\?/);
    assert.match(call.input.messages[1].content, /Of course, boss/);
    assert.match(call.input.messages[1].content, /Continue our conversation/);
    assert.equal(JSON.stringify(call.input).includes(secret), false, 'credential-like content must be redacted before sending conversation context to the model');
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('OVYX Guardian companion tests passed: signed-in owner authorization, cross-origin and method guards, chat action allowlist, natural voice-chat prompt, bounded context, and session-only conversation handling.');
