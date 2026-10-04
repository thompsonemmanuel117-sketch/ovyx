'use strict';

import { authenticateRequest } from '../_lib/firebase.js';
import {
  getFirestoreDocument,
  getFirestoreData,
  setFirestoreDocumentIfCurrent,
} from '../_lib/firebase-admin.js';
import { readJson, jsonResponse, requestId } from './_lib/http.js';

const MAX_BODY_BYTES = 8 * 1024;
const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const DISALLOWED = new Set([
  'appstudio',
  'admin-overview',
  'admin-pricing',
  'admin-users',
  'admin-brain',
  'admin-identity',
  'admin-backend',
  'admin-telemetry',
]);

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

export async function onRequest(context) {
  const id = requestId(context.request);

  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    const uid = clean(user?.uid || user?.sub, 180);
    const email = clean(user?.email, 320).toLowerCase();

    if (!uid || !email) {
      throw Object.assign(new Error('Authenticated user is required.'), {
        status: 401,
        code: 'AUTH_REQUIRED',
      });
    }

    if (email === ROOT_EMAIL) {
      return jsonResponse(
        { ok: true, used: false, bypass: true, active: false },
        200,
        { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' },
      );
    }

    const doc = await getFirestoreDocument(context.env, 'users', uid);
    const profile = doc ? (await getFirestoreData(context.env, 'users', uid) || {}) : {};
    const current = profile?.ovyxTrial && typeof profile.ovyxTrial === 'object'
      ? profile.ovyxTrial
      : {};
    const method = context.request.method.toUpperCase();

    if (method === 'GET') {
      return jsonResponse(
        {
          ok: true,
          used: current.used === true,
          usedAt: current.usedAt || null,
          viewId: current.viewId || null,
          active: false,
        },
        200,
        { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' },
      );
    }

    if (method !== 'POST') {
      return jsonResponse(
        { ok: false, error: 'GET or POST is required.', code: 'METHOD_NOT_ALLOWED' },
        405,
        { 'X-OVYX-Request-ID': id },
      );
    }

    const body = await readJson(context.request, MAX_BODY_BYTES);
    const viewId = clean(body?.viewId, 80).toLowerCase();

    if (!viewId || DISALLOWED.has(viewId) || viewId.startsWith('admin-')) {
      throw Object.assign(
        new Error('This workspace route is not eligible for the one-time free pass.'),
        { status: 403, code: 'TRIAL_ROUTE_NOT_ELIGIBLE' },
      );
    }

    if (current.used === true) {
      throw Object.assign(
        new Error('Your one-time OVYX trial pass has already been used.'),
        { status: 409, code: 'TRIAL_ALREADY_USED' },
      );
    }

    const next = {
      ...(profile.ovyxTrial || {}),
      used: true,
      viewId,
      usedAt: new Date().toISOString(),
    };

    await setFirestoreDocumentIfCurrent(
      context.env,
      'users',
      uid,
      { ovyxTrial: next },
      doc?.updateTime || null,
    );

    return jsonResponse(
      {
        ok: true,
        used: true,
        usedAt: next.usedAt,
        viewId,
        active: true,
      },
      200,
      { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error?.message || 'Trial state unavailable.',
        code: error?.code || 'TRIAL_STATE_FAILED',
      },
      error?.status || 500,
      { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' },
    );
  }
}
