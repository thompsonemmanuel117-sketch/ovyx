'use strict';

const { verifyFirebaseIdToken } = require('../_lib/auth.js');
const { enforceSameOrigin, errorResponse, jsonResponse, requestId } = require('../_lib/http.js');
const {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath
} = require('../_lib/firebase-admin.js');

const MAX_BODY_BYTES = 850_000;
const MAX_LOGO_BYTES = 600_000;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const COLOR_KEYS = new Set(['primary', 'secondary', 'accent', 'background', 'surface', 'text', 'muted']);

function clean(value, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}
function normalizeAppId(value) {
  const id = clean(value, 80);
  return /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(id) && !id.includes('..') ? id.toLowerCase() : '';
}
function normalizeColors(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(source).slice(0, 12)) {
    const key = clean(rawKey, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const value = clean(rawValue, 20).toUpperCase();
    if (COLOR_KEYS.has(key) && COLOR_RE.test(value)) output[key] = value;
  }
  return output;
}
function normalizeRules(input) {
  const source = Array.isArray(input) ? input : clean(input, 20_000).split(/\r?\n/);
  return source.slice(0, 50).map(value => clean(value, 500)).filter(Boolean);
}
function normalizeLogo(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw Object.assign(new Error('The app logo must be a valid PNG data asset.'), { status: 400, code: 'APP_BRAND_LOGO_PNG_REQUIRED' });
  }
  const base64 = value.slice('data:image/png;base64,'.length);
  if (Math.floor(base64.length * 0.75) > MAX_LOGO_BYTES) {
    throw Object.assign(new Error('The app logo must be 600 KB or smaller.'), { status: 413, code: 'APP_BRAND_LOGO_TOO_LARGE' });
  }
  return value;
}
async function readJson(request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw Object.assign(new Error('App Brand DNA payload is too large.'), { status: 413, code: 'APP_BRAND_PAYLOAD_TOO_LARGE' });
  }
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error('App Brand DNA payload must be valid JSON.'), { status: 400, code: 'INVALID_JSON' }); }
}
async function identityFor(request, env, id) {
  if (!enforceSameOrigin(request)) {
    return { response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin App Studio brand changes are not permitted.', id) };
  }
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { response: auth.response };
  const user = auth.user || {};
  const uid = clean(user.uid || user.sub, 180);
  const email = clean(user.email, 320).toLowerCase();
  if (!uid || !email) {
    return { response: errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'A verified Firebase account is required.', id) };
  }
  return { user, uid, email };
}
function profilePath(email, appId) {
  return ['users', email, 'app_studio_brands', appId];
}
async function onRequest(context) {
  const { request, env } = context;
  const id = requestId(request);
  try {
    const identity = await identityFor(request, env, id);
    if (identity.response) return identity.response;
    const url = new URL(request.url);
    const body = request.method === 'PUT' ? await readJson(request) : {};
    const appId = normalizeAppId(url.searchParams.get('id') || body.appId);
    if (!appId) return errorResponse(400, 'APP_BRAND_ID_REQUIRED', 'A valid app ID is required to read or save this brand profile.', id);
    const path = profilePath(identity.email, appId);
    if (request.method === 'GET') {
      const profile = await getFirestoreDataAtPath(env, path);
      return jsonResponse({ ok: true, appId, profile: profile || null, authority: 'SERVER', scope: 'app', requestId: id }, 200, {
        'Cache-Control': 'no-store, max-age=0', 'X-OVYX-Request-ID': id
      });
    }
    if (request.method === 'DELETE') {
      const current = await getFirestoreDocumentAtPath(env, path);
      if (current) await deleteFirestoreDocumentAtPath(env, path, current.updateTime);
      return jsonResponse({ ok: true, deleted: true, appId, scope: 'app' }, 200, {
        'Cache-Control': 'no-store, max-age=0', 'X-OVYX-Request-ID': id
      });
    }
    if (request.method !== 'PUT') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET, PUT or DELETE is required.', id);
    const appName = clean(body.appName || body.brandName, 100);
    if (!appName) return errorResponse(400, 'APP_BRAND_NAME_REQUIRED', 'Enter an app name so its brand can be saved separately.', id);
    const logoDataUrl = normalizeLogo(body.logoDataUrl);
    const colors = normalizeColors(body.colors);
    if (!Object.keys(colors).length) return errorResponse(400, 'APP_BRAND_COLORS_REQUIRED', 'Choose at least one valid brand colour before saving.', id);
    const layoutRules = normalizeRules(body.layoutRules);
    const current = await getFirestoreDocumentAtPath(env, path);
    const profile = {
      ownerUid: identity.uid,
      ownerEmail: identity.email,
      appId,
      appName,
      brandName: appName,
      logoDataUrl,
      colors,
      layoutRules,
      version: Number((await getFirestoreDataAtPath(env, path))?.version || 0) + 1,
      updatedAt: new Date().toISOString()
    };
    await setFirestoreDocumentAtPath(env, path, profile, { merge: true, expectedUpdateTime: current?.updateTime || null });
    const saved = await getFirestoreDataAtPath(env, path);
    if (!saved || saved.appId !== appId || saved.appName !== appName || JSON.stringify(saved.colors || {}) !== JSON.stringify(colors)) {
      return errorResponse(503, 'APP_BRAND_SAVE_UNCONFIRMED', 'OVYX could not verify that this app brand was saved. Retry before generating.', id);
    }
    return jsonResponse({ ok: true, appId, profile: saved, authority: 'SERVER', scope: 'app', requestId: id }, 200, {
      'Cache-Control': 'no-store, max-age=0', 'X-OVYX-Request-ID': id
    });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'APP_BRAND_PROFILE_FAILED', error?.message || 'App Brand DNA could not be saved.', id);
  }
}

module.exports = { onRequest };
