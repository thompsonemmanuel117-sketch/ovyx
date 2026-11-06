import { verifyFirebaseIdToken } from '../_lib/auth.js';
import { jsonResponse, readJson, enforceSameOrigin } from '../_lib/http.js';
import {
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath
} from '../../_lib/firebase-admin.js';
import { buildConnectionRecord, encryptSecret } from '../../_lib/universal-connections.js';
import {
  getOAuthService,
  getOAuthClientConfig,
  buildOAuthAuthorizationUrl,
  exchangeOAuthCode,
  identifyOAuthAccount,
  OAUTH_SERVICE_IDS
} from '../../_lib/connection-oauth.js';
import {
  changeActiveCount,
  resolveConnectionTier,
  UNIVERSAL_CONNECTION_LIMITS
} from './connections.js';

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const statePath = state => ['connection_oauth_states', state];

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function pkcePair() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge:base64Url(new Uint8Array(digest)) };
}

async function authenticated(request, env) {
  const result = await verifyFirebaseIdToken(request, env);
  if (!result.ok) return { ok:false, response:result.response };
  const uid = clean(result.user?.uid || result.user?.sub, 180);
  const email = clean(result.user?.email, 320).toLowerCase();
  if (!uid || !email) return { ok:false, response:jsonResponse({ ok:false, code:'AUTH_IDENTITY_REQUIRED', error:'Please sign in again to verify your account.' }, 401) };
  return { ok:true, user:result.user, uid, email };
}

function popupResponse(origin, payload) {
  const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const safeOrigin = JSON.stringify(origin || '');
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OVYX connection</title><body style="margin:0;background:#08090b;color:#f4f4f5;font:14px system-ui;display:grid;min-height:100vh;place-items:center"><main style="max-width:420px;padding:32px;text-align:center"><h1 style="font-size:22px">OVYX · Personal Connections</h1><p id="status" style="color:#a1a1aa">Finishing your secure connection…</p></main><script>const message=' + safePayload + ';const target=' + safeOrigin + ';if(window.opener&&target){window.opener.postMessage(message,target);window.close()}else{document.getElementById("status").textContent=message.ok?"Connection saved. You can close this window.":"Connection could not be completed. Return to OVYX and try again."}</script></body></html>';
  return new Response(html, { status:200, headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store, no-cache, must-revalidate',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
  }});
}

async function readiness(context) {
  const auth = await authenticated(context.request, context.env);
  if (!auth.ok) return auth.response;
  const services = {};
  for (const id of OAUTH_SERVICE_IDS) {
    const service = getOAuthService(id);
    const config = getOAuthClientConfig(service.provider, context.env);
    services[id] = {
      supported:true,
      configured:config.configured,
      missing:config.missing,
      provider:service.provider,
      refreshSupported:service.provider !== 'notion'
    };
  }
  return jsonResponse({ ok:true, services });
}

async function start(context) {
  const { request, env } = context;
  if (!enforceSameOrigin(request)) return jsonResponse({ ok:false, code:'OAUTH_ORIGIN_INVALID', error:'OAuth setup must start from the OVYX application.' }, 403);
  const auth = await authenticated(request, env);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 4000);
  const serviceId = clean(body.service, 40).toLowerCase();
  const service = getOAuthService(serviceId);
  if (!service) return jsonResponse({ ok:false, code:'OAUTH_SERVICE_UNSUPPORTED', error:'This service does not have an OAuth connector yet.' }, 400);
  const config = getOAuthClientConfig(service.provider, env);
  if (!config.configured) return jsonResponse({ ok:false, code:'OAUTH_PROVIDER_NOT_CONFIGURED', error:'This OAuth provider is not configured on the OVYX server yet.', missing:config.missing }, 503);
  const origin = new URL(request.url).origin;
  if (new URL(config.redirectUri).origin !== origin) return jsonResponse({ ok:false, code:'OAUTH_REDIRECT_ORIGIN_MISMATCH', error:'The configured OAuth callback must use this OVYX application origin.' }, 409);
  const state = randomState();
  const pair = service.provider === 'google' || service.provider === 'discord' ? await pkcePair() : null;
  const now = Date.now();
  await setFirestoreDocumentAtPath(env, statePath(state), {
    state,
    serviceId,
    provider:service.provider,
    ownerUid:auth.uid,
    ownerEmail:auth.email,
    origin,
    redirectUri:config.redirectUri,
    codeVerifier:pair?.verifier || null,
    createdAt:new Date(now).toISOString(),
    expiresAt:new Date(now + 10 * 60 * 1000).toISOString()
  }, { merge:false });
  return jsonResponse({
    ok:true,
    authorizationUrl:buildOAuthAuthorizationUrl(serviceId, config, state, pair?.challenge || ''),
    expiresIn:600
  });
}

async function callback(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const state = clean(url.searchParams.get('state'), 64);
  if (!/^[a-f0-9]{64}$/.test(state)) return popupResponse('', { type:'ovyx-connection-oauth', ok:false, error:'OAUTH_STATE_INVALID' });
  // State is a one-time server-side capability bound to the initiating account.
  const stateRecord = await findState(env, state);
  if (!stateRecord) return popupResponse('', { type:'ovyx-connection-oauth', ok:false, error:'OAUTH_STATE_EXPIRED' });
  const origin = clean(stateRecord.origin, 500);
  await deleteFirestoreDocumentAtPath(env, statePath(state));
  if (Date.parse(stateRecord.expiresAt || '') <= Date.now()) return popupResponse(origin, { type:'ovyx-connection-oauth', ok:false, error:'OAUTH_STATE_EXPIRED' });
  if (url.searchParams.get('error')) return popupResponse(origin, { type:'ovyx-connection-oauth', ok:false, error:'OAUTH_ACCESS_DENIED' });
  const code = clean(url.searchParams.get('code'), 2048);
  if (!code) return popupResponse(origin, { type:'ovyx-connection-oauth', ok:false, error:'OAUTH_CODE_MISSING' });
  const service = getOAuthService(stateRecord.serviceId);
  const config = getOAuthClientConfig(stateRecord.provider, env);
  if (!service || !config.configured || config.redirectUri !== stateRecord.redirectUri) return popupResponse(origin, { type:'ovyx-connection-oauth', ok:false, error:'OAUTH_CONFIGURATION_CHANGED' });
  let reservation = null;
  let limit = UNIVERSAL_CONNECTION_LIMITS.free;
  try {
    const token = await exchangeOAuthCode(service.id, config, code, stateRecord.codeVerifier || '');
    const identity = await identifyOAuthAccount(service.id, token);
    const profile = await getFirestoreDataAtPath(env, ['users', stateRecord.ownerUid]) || {};
    const tier = resolveConnectionTier(profile, stateRecord.ownerEmail);
    limit = UNIVERSAL_CONNECTION_LIMITS[tier] ?? UNIVERSAL_CONNECTION_LIMITS.free;
    reservation = await changeActiveCount(env, stateRecord.ownerUid, stateRecord.ownerEmail, 1, limit);
    if (!reservation.ok) throw Object.assign(new Error('Your Personal Connections plan limit has been reached.'), { code:'CONNECTION_LIMIT_REACHED', status:409 });
    const record = await buildConnectionRecord(env, {
      name:service.name + ' · ' + identity.name,
      type:'http',
      endpoint:service.endpoint,
      healthUrl:service.healthUrl,
      authMode:'bearer',
      secret:token.access_token,
      active:true
    }, { uid:stateRecord.ownerUid, email:stateRecord.ownerEmail });
    const now = new Date().toISOString();
    record.oauthProvider = service.provider;
    record.oauthService = service.id;
    record.oauthAccount = { id:identity.id, name:identity.name, email:identity.email || null };
    record.oauthScopes = clean(token.scope || (Array.isArray(token.scope) ? token.scope.join(' ') : ''), 2000).split(/[ ,]+/).filter(Boolean).slice(0, 80);
    record.oauthTokenExpiresAt = Number(token.expires_in) > 0 ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null;
    record.encryptedRefreshToken = token.refresh_token ? await encryptSecret(env, token.refresh_token) : null;
    record.oauthConnectedAt = now;
    record.oauthStatus = 'connected';
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 28);
    await setFirestoreDocumentAtPath(env, ['users', stateRecord.ownerEmail, 'universal_connections', id], record, { merge:false });
    return popupResponse(origin, { type:'ovyx-connection-oauth', ok:true, service:service.id, connection:{ id, name:record.name, account:identity.name } });
  } catch (error) {
    if (reservation?.changed) {
      try { await changeActiveCount(env, stateRecord.ownerUid, stateRecord.ownerEmail, -1, limit); } catch (_) {}
    }
    console.error('[OVYX CONNECTION OAUTH]', clean(error?.code || 'OAUTH_CALLBACK_FAILED', 80));
    return popupResponse(origin, { type:'ovyx-connection-oauth', ok:false, error:clean(error?.code || 'OAUTH_CALLBACK_FAILED', 80) });
  }
}

async function findState(env, state) {
  const record = await getFirestoreDataAtPath(env, statePath(state));
  return record?.state === state ? record : null;
}

export async function onRequest(context) {
  const { request } = context;
  const method = String(request.method || '').toUpperCase();
  const action = new URL(request.url).searchParams.get('action') || '';
  if (method === 'GET' && action === 'callback') return callback(context);
  if (method === 'GET' && action === 'readiness') return readiness(context);
  if (method === 'POST' && !action) {
    try { return await start(context); }
    catch (error) { return jsonResponse({ ok:false, code:error?.code || 'OAUTH_START_FAILED', error:error?.message || 'OAuth could not be started.' }, error?.status || 500); }
  }
  return jsonResponse({ ok:false, code:'METHOD_NOT_ALLOWED', error:'Use POST to start OAuth or GET for callback/readiness.' }, 405, { Allow:'GET, POST' });
}
