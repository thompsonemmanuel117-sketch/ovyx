import { authenticateRequest } from '../../_lib/firebase.js';
import { getFirestoreData, listFirestoreDocuments } from '../../_lib/firebase-admin.js';
import { errorResponse, jsonResponse, requestId } from '../_lib/http.js';
import { resolveEntitlements } from '../entitlements.js';

const COLLECTION = 'ovyx_templates';
const TIERS = Object.freeze({ free: 0, pro: 1, max: 2, root: 3 });
const CATEGORIES = new Set(['SaaS', 'Portfolio', 'Commerce']);
const clean = (value, limit = 500) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, limit);

function timestampMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') {
    const seconds = Number(value.seconds ?? value._seconds);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
    const date = String(value.toDate?.() || '');
    const parsedDate = Date.parse(date);
    return Number.isFinite(parsedDate) && parsedDate > 0 ? parsedDate : null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function requiredTierOf(value) {
  const tier = clean(value || 'free', 20).toLowerCase();
  return Object.prototype.hasOwnProperty.call(TIERS, tier) && tier !== 'root' ? tier : 'free';
}

function deployableNodes(ast) {
  if (!ast || typeof ast !== 'object' || Array.isArray(ast)) return null;
  if (Array.isArray(ast.canvas)) return ast.canvas;
  if (Array.isArray(ast.nodes)) return ast.nodes;
  if (Array.isArray(ast.sections)) return ast.sections;
  if (Array.isArray(ast.pages)) {
    const sections = ast.pages.flatMap(page => Array.isArray(page?.sections) ? page.sections : []);
    return sections.length ? sections : null;
  }
  return null;
}

function normalizeAst(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  try {
    if (JSON.stringify(raw).length > 850000) return null;
    const nodes = deployableNodes(raw);
    return Array.isArray(nodes) ? raw : null;
  } catch {
    return null;
  }
}

function buildProjectTemplate(template, ast, updatedAt) {
  const nodes = deployableNodes(ast) || [];
  let pages;
  if (Array.isArray(ast.pages) && ast.pages.length) {
    pages = ast.pages.slice(0, 80).map((page, index) => ({
      ...page,
      id: clean(page?.id || 'page_template_' + (index + 1), 180),
      name: clean(page?.name || (index === 0 ? 'Home' : 'Page ' + (index + 1)), 120),
      slug: clean(page?.slug || (index === 0 ? 'home' : 'page-' + (index + 1)), 120),
      sections: Array.isArray(page?.sections) ? page.sections : []
    }));
  } else {
    pages = [{ id: 'page_template_home', name: 'Home', slug: 'home', sections: nodes }];
  }
  return {
    name: template.title,
    description: clean(template.description || 'Started from an owner-published OVYX template.', 1000),
    status: 'draft',
    updatedAt: Date.now(),
    pages,
    canvas: Array.isArray(ast.canvas) ? ast.canvas : nodes,
    assets: [],
    revisions: [],
    templateSource: { id: template.id, title: template.title, version: updatedAt }
  };
}

export function normalizePublishedTemplate(row, entitlements) {
  if (!row || typeof row !== 'object' || row.published !== true) return null;
  const id = clean(row.id || row.templateId, 180);
  const title = clean(row.title || row.name, 120);
  const category = CATEGORIES.has(row.category) ? row.category : '';
  const requiredTier = requiredTierOf(row.requiredTier || row.tier);
  if (!id || !/^[A-Za-z0-9_-]{1,180}$/.test(id) || !title || !category) return null;

  const ast = normalizeAst(row.ast || row.blueprint || row.schema || row.structuralAst);
  const currentTier = clean(entitlements?.planTier || 'free', 20).toLowerCase();
  const currentRank = TIERS[currentTier] ?? 0;
  const requiredRank = TIERS[requiredTier] ?? 99;
  const accessible = entitlements?.capabilities?.templates === true &&
    currentRank >= requiredRank && Boolean(ast);
  const previewCandidate = clean(row.previewUrl || row.preview, 1000);
  let previewUrl = '';
  if (previewCandidate) {
    try {
      const url = new URL(previewCandidate);
      if (url.protocol === 'https:' && !url.username && !url.password) previewUrl = url.href;
    } catch { /* Optional preview URLs are ignored unless valid HTTPS URLs. */ }
  }
  const background = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(row.background || ''))
    ? String(row.background).toUpperCase() : '#080A10';
  const accent = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(row.accent || ''))
    ? String(row.accent).toUpperCase() : '#E8B64F';
  const createdAt = timestampMs(row.createdAt) || Date.now();
  const updatedAt = timestampMs(row.updatedAt || row.createdAt) || createdAt;
  const item = {
    id, title, name: title,
    description: clean(row.description || 'An owner-published OVYX blueprint.', 600),
    category, previewUrl, requiredTier, published: true,
    createdAt, updatedAt, background, accent, theme: [background, accent],
    accessible,
    ...(accessible ? { ast, project: buildProjectTemplate({ id, title, description: row.description }, ast, updatedAt) } : {})
  };
  return item;
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    if (!user) return errorResponse(401, 'AUTH_REQUIRED', 'Sign in to load the published template library.', id);
    const entitlements = await resolveEntitlements(context.env, user);
    const url = new URL(context.request.url);
    const selectedId = clean(url.searchParams.get('id'), 180);
    let rows;
    let nextPageToken = null;
    if (selectedId) {
      if (!/^[A-Za-z0-9_-]{1,180}$/.test(selectedId)) {
        return errorResponse(400, 'TEMPLATE_ID_INVALID', 'The template ID is invalid.', id);
      }
      const record = await getFirestoreData(context.env, COLLECTION, selectedId);
      rows = record ? [{ ...record, id: selectedId }] : [];
    } else {
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '100', 10) || 100));
      const result = await listFirestoreDocuments(context.env, COLLECTION, pageSize, clean(url.searchParams.get('pageToken'), 4000) || null);
      rows = result.documents || [];
      nextPageToken = result.nextPageToken || null;
    }
    const templates = rows
      .filter(row => row?.published === true)
      .map(row => normalizePublishedTemplate(row, entitlements))
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return jsonResponse({
      ok: true,
      templates,
      nextPageToken,
      scope: 'published-only',
      authority: 'SERVER',
      planTier: entitlements.planTier || 'free',
      checkedAt: new Date().toISOString()
    }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store, max-age=0' });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'PUBLISHED_TEMPLATES_UNAVAILABLE', 'The published template library is temporarily unavailable.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET is required.', requestId(context.request));
}
