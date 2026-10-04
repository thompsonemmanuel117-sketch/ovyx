'use strict';

const { verifyFirebaseIdToken } = require('../_lib/auth.js');
const { errorResponse, jsonResponse } = require('../_lib/http.js');
const {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath
} = require('../_lib/firebase-admin.js');

const MAX_BODY_BYTES = 720_000;
const MAX_LOGO_BYTES = 600_000;

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function userId(user) {
  return clean(user?.uid || user?.sub, 180);
}

function email(user) {
  return clean(user?.email, 320).toLowerCase();
}

function parseBody(request) {
  return request.text().then(raw => {
    const bytes = new TextEncoder().encode(raw).byteLength;
    if (bytes > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Brand profile payload is too large.'), {
        status: 413,
        code: 'BRAND_PROFILE_TOO_LARGE'
      });
    }
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw Object.assign(new Error('Brand profile payload must be valid JSON.'), {
        status: 400,
        code: 'INVALID_JSON'
      });
    }
  });
}

function normalizeColors(input) {
  const source = input && typeof input === 'object' ? input : {};
  const colors = {};
  for (const [key, value] of Object.entries(source).slice(0, 12)) {
    const k = clean(key, 40).replace(/[^a-zA-Z0-9_-]/g, '');
    const v = clean(value, 20);
    if (k && /^#[0-9a-f]{6}$/i.test(v)) colors[k] = v.toUpperCase();
  }
  return colors;
}

function normalizeRules(input) {
  if (Array.isArray(input)) {
    return input
      .slice(0, 50)
      .map(value => clean(value, 500))
      .filter(Boolean);
  }
  return clean(input, 20_000)
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeLogo(input) {
  if (!input || typeof input !== 'string') return null;
  const logo = input.trim();
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(logo)) {
    throw Object.assign(new Error('Brand Asset Logo must be a PNG data asset.'), {
      status: 400,
      code: 'BRAND_LOGO_PNG_REQUIRED'
    });
  }
  const base64 = logo.slice('data:image/png;base64,'.length);
  const estimatedBytes = Math.floor(base64.length * 0.75);
  if (estimatedBytes > MAX_LOGO_BYTES) {
    throw Object.assign(new Error('Brand Asset Logo must be 600 KB or smaller.'), {
      status: 413,
      code: 'BRAND_LOGO_TOO_LARGE'
    });
  }
  return logo;
}

async function getIdentity(request, env) {
  const identity = await verifyFirebaseIdToken(request, env);
  if (!identity.ok) return identity;
  const uid = userId(identity.user);
  const userEmail = email(identity.user);
  if (!uid || !userEmail) {
    return {
      ok: false,
      response: errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'A verified Firebase identity is required.')
    };
  }
  return { ok: true, user: identity.user, uid, email: userEmail };
}

async function onRequest(context) {
  const request = context.request;
  const identity = await getIdentity(request, context.env);
  if (!identity.ok) return identity.response;

  const path = ['users', identity.email, 'brand_profile', 'config'];

  try {
    if (request.method === 'GET') {
      const data = await getFirestoreDataAtPath(context.env, path);
      return jsonResponse({
        ok: true,
        profile: data || {
          logoDataUrl: null,
          colors: {},
          layoutRules: [],
          version: 1
        },
        owner: { uid: identity.uid, email: identity.email }
      });
    }

    if (request.method === 'DELETE') {
      const current = await getFirestoreDocumentAtPath(context.env, path);
      if (current) {
        await deleteFirestoreDocumentAtPath(context.env, path, current.updateTime);
      }
      return jsonResponse({ ok: true, deleted: true });
    }

    if (request.method !== 'PUT') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET, PUT or DELETE is required.');
    }

    const body = await parseBody(request);
    const logoDataUrl = body.logoDataUrl == null
      ? null
      : normalizeLogo(body.logoDataUrl);
    const colors = normalizeColors(body.colors);
    const layoutRules = normalizeRules(body.layoutRules);

    const now = new Date().toISOString();
    const current = await getFirestoreDocumentAtPath(context.env, path);

    const profile = {
      ownerUid: identity.uid,
      ownerEmail: identity.email,
      logoDataUrl,
      colors,
      layoutRules,
      version: Number(current ? (await getFirestoreDataAtPath(context.env, path))?.version : 0) + 1 || 1,
      updatedAt: now
    };

    await setFirestoreDocumentAtPath(
      context.env,
      path,
      profile,
      {
        merge: true,
        expectedUpdateTime: current?.updateTime || null
      }
    );

    const saved = await getFirestoreDataAtPath(context.env, path);
    return jsonResponse({
      ok: true,
      profile: saved || profile
    });
  } catch (error) {
    return errorResponse(
      error?.status || 500,
      error?.code || 'BRAND_PROFILE_FAILED',
      error?.message || 'Brand profile operation failed.'
    );
  }
}

module.exports = { onRequest };
