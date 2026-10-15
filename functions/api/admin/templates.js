import { verifyFirebaseIdToken, normalizeEmail } from '../_lib/auth.js';
import { listFirestoreDocuments, getFirestoreData, setFirestoreDocumentAtPath } from '../../_lib/firebase-admin.js';
import { errorResponse, jsonResponse, readJson, requestId, enforceSameOrigin } from '../_lib/http.js';

const ROOT_EMAIL = 'ovyxsupportteam@gmail.com';
const CATEGORIES = new Set(['SaaS', 'Portfolio', 'Commerce']);
const TIERS = new Set(['free', 'pro', 'max']);
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

async function requireRoot(request, env, id) {
  if (!enforceSameOrigin(request)) return { response: errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin admin requests are not permitted.', id) };
  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return { response: auth.response };
  if (normalizeEmail(auth.user.email) !== ROOT_EMAIL) return { response: errorResponse(403, 'ROOT_REQUIRED', 'Root administrator access is required.', id) };
  return { user: auth.user };
}
function hasDeployableNodes(ast) {
  if (!ast || typeof ast !== 'object' || Array.isArray(ast)) return false;
  if (Array.isArray(ast.canvas) || Array.isArray(ast.nodes) || Array.isArray(ast.sections)) return true;
  return Array.isArray(ast.pages) && ast.pages.some(page => page && Array.isArray(page.sections));
}
function validPreviewUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href.slice(0, 1000) : null;
  } catch { return null; }
}
function normalizeTemplate(row) {
  return {
    id: clean(row.id, 180),
    title: clean(row.title, 120),
    category: CATEGORIES.has(row.category) ? row.category : 'SaaS',
    previewUrl: validPreviewUrl(clean(row.previewUrl, 1000)) || '',
    requiredTier: TIERS.has(row.requiredTier) ? row.requiredTier : 'free',
    ast: row.ast && typeof row.ast === 'object' && !Array.isArray(row.ast) ? row.ast : {},
    published: row.published === true,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    createdBy: row.createdBy || null
  };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const auth = await requireRoot(context.request, context.env, id);
    if (auth.response) return auth.response;
    const url = new URL(context.request.url);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '100', 10) || 100));
    const rows = await listFirestoreDocuments(context.env, 'ovyx_templates', pageSize);
    const templates = (rows.documents || []).map(row => normalizeTemplate(row)).filter(row => row.published);
    return jsonResponse({ ok: true, templates, nextPageToken: rows.nextPageToken || null, authority: 'SERVER' }, 200, {
      'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'ADMIN_TEMPLATES_UNAVAILABLE', 'The live template registry could not be loaded.', id);
  }
}

export async function onRequestPost(context) {
  const id = requestId(context.request);
  try {
    const auth = await requireRoot(context.request, context.env, id);
    if (auth.response) return auth.response;
    const payload = await readJson(context.request, 1_000_000);
    const action = clean(payload.action || 'publish', 40).toLowerCase();
    const now = new Date().toISOString();
    const uid = String(auth.user.uid || auth.user.sub || '').slice(0, 200);
    const email = normalizeEmail(auth.user.email);
    if (action === 'unpublish') {
      const templateId = clean(payload.id || payload.templateId, 180);
      if (!/^[A-Za-z0-9_-]{1,180}$/.test(templateId)) return errorResponse(400, 'TEMPLATE_ID_REQUIRED', 'A valid template ID is required.', id);
      const previous = await getFirestoreData(context.env, 'ovyx_templates', templateId);
      if (!previous) return errorResponse(404, 'TEMPLATE_NOT_FOUND', 'The template was not found.', id);
      await setFirestoreDocumentAtPath(context.env, ['ovyx_templates', templateId], {
        published: false, updatedAt: now, updatedBy: { uid, email }
      }, { merge: true });
      return jsonResponse({ ok: true, action, id: templateId, published: false, updatedAt: now, scope: 'global' }, 200, {
        'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
      });
    }
    if (action !== 'publish') return errorResponse(400, 'TEMPLATE_ACTION_NOT_ALLOWED', 'Supported actions: publish and unpublish.', id);
    const title = clean(payload.title, 120);
    const category = clean(payload.category, 30);
    const requiredTier = clean(payload.requiredTier, 20).toLowerCase();
    const previewUrl = validPreviewUrl(clean(payload.previewUrl, 1000));
    const ast = payload.ast;
    if (!title) return errorResponse(400, 'TEMPLATE_TITLE_REQUIRED', 'A template title is required.', id);
    if (!CATEGORIES.has(category)) return errorResponse(400, 'TEMPLATE_CATEGORY_INVALID', 'Choose SaaS, Portfolio or Commerce.', id);
    if (!TIERS.has(requiredTier)) return errorResponse(400, 'TEMPLATE_TIER_INVALID', 'Choose Free, Pro or Max.', id);
    if (previewUrl === null) return errorResponse(400, 'TEMPLATE_PREVIEW_URL_INVALID', 'Template preview images must use HTTPS.', id);
    if (!hasDeployableNodes(ast) || JSON.stringify(ast).length > 850000) {
      return errorResponse(400, 'TEMPLATE_AST_INVALID', 'The template must contain a deployable canvas/node/section/page structure under the size limit.', id);
    }
    const templateId = clean(payload.id, 180) || ('tpl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 28));
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(templateId)) return errorResponse(400, 'TEMPLATE_ID_INVALID', 'The template ID contains unsupported characters.', id);
    const previous = await getFirestoreData(context.env, 'ovyx_templates', templateId);
    const record = {
      id: templateId, title, category, previewUrl: previewUrl || '', requiredTier, ast,
      published: true, createdAt: previous?.createdAt || now, updatedAt: now,
      createdBy: previous?.createdBy || { uid, email }, updatedBy: { uid, email }
    };
    await setFirestoreDocumentAtPath(context.env, ['ovyx_templates', templateId], record, { merge: true });
    return jsonResponse({ ok: true, action, template: record, updatedAt: now, scope: 'global', authority: 'SERVER' }, 201, {
      'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(error?.status || 500, error?.code || 'ADMIN_TEMPLATE_WRITE_FAILED', error?.message || 'The template action failed.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  if (context.request.method === 'POST') return onRequestPost(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET or POST is required.', requestId(context.request));
}
