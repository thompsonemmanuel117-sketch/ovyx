import { verifyFirebaseIdToken, normalizeEmail } from '../_lib/auth.js';
import { listFirestoreDocuments } from '../../_lib/firebase-admin.js';
import { errorResponse, jsonResponse, requestId, enforceSameOrigin } from '../_lib/http.js';
import { resolveEntitlements } from '../entitlements.js';

const TIERS = Object.freeze({ free: 0, pro: 1, max: 2, root: 3 });
const CATEGORIES = new Set(['SaaS', 'Portfolio', 'Commerce']);
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);

function safeColor(value, fallback) {
  const color = clean(value, 20);
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color.toUpperCase() : fallback;
}

function sectionTuple(section) {
  if (Array.isArray(section)) {
    return [clean(section[0] || 'section', 80), clean(section[1] || '', 200000)];
  }
  const item = section && typeof section === 'object' ? section : {};
  const rawContent = item.content ?? item.text ?? item.html ?? item.description ?? item.name ?? '';
  const content = typeof rawContent === 'string'
    ? rawContent.slice(0, 200000)
    : clean(rawContent?.text ?? rawContent?.value ?? JSON.stringify(rawContent), 200000);
  return [clean(item.type || item.kind || item.component || 'section', 80), content];
}

function normalizeSections(value) {
  return (Array.isArray(value) ? value : []).slice(0, 300).map(sectionTuple);
}

function legacyPages(ast, title) {
  if (Array.isArray(ast.pages) && ast.pages.length) {
    return ast.pages.slice(0, 100).map((page, index) => {
      if (Array.isArray(page)) {
        return [
          clean(page[0] || (index === 0 ? title : 'Page ' + (index + 1)), 120),
          clean(page[1] || (index === 0 ? '/' : '/page-' + (index + 1)), 180),
          normalizeSections(page[2])
        ];
      }
      const row = page && typeof page === 'object' ? page : {};
      return [
        clean(row.name || row.title || (index === 0 ? title : 'Page ' + (index + 1)), 120),
        clean(row.slug || (index === 0 ? '/' : '/page-' + (index + 1)), 180),
        normalizeSections(row.sections || row.nodes || row.canvas)
      ];
    });
  }

  const sections = Array.isArray(ast.sections) ? ast.sections
    : Array.isArray(ast.nodes) ? ast.nodes
    : Array.isArray(ast.canvas) ? ast.canvas
    : [];
  return [[title, '/', normalizeSections(sections)]];
}

/**
 * Adapt the root-owned Firestore record into the exact public gallery shape.
 * Paid template content is never sent to a user who does not currently qualify.
 */
export function adaptTemplateForUser(record, currentTier, canUseTemplates) {
  if (!record || record.published !== true) return null;
  const id = clean(record.id, 180);
  const title = clean(record.title, 120);
  if (!id || !title) return null;

  const requiredTier = Object.prototype.hasOwnProperty.call(TIERS, String(record.requiredTier || '').toLowerCase())
    ? String(record.requiredTier).toLowerCase()
    : 'free';
  const current = String(currentTier || 'free').toLowerCase();
  const locked = canUseTemplates !== true || (TIERS[current] ?? 0) < TIERS[requiredTier];
  const ast = record.ast && typeof record.ast === 'object' && !Array.isArray(record.ast)
    ? record.ast : {};
  const theme = Array.isArray(ast.theme) ? ast.theme : [];
  const background = safeColor(ast.background || ast.styles?.background || theme[0], '#050607');
  const accent = safeColor(ast.accent || ast.styles?.accent || theme[1], '#E8B64F');
  const previewUrl = (() => {
    try {
      const url = new URL(String(record.previewUrl || ''));
      return url.protocol === 'https:' && !url.username && !url.password ? url.href.slice(0, 1000) : '';
    } catch { return ''; }
  })();

  const result = {
    id,
    title,
    name: title,
    description: clean(record.description || ast.description || ast.project?.description || 'Published OVYX template.', 1000),
    category: CATEGORIES.has(record.category) ? record.category : 'SaaS',
    requiredTier,
    previewUrl,
    background,
    accent,
    theme: [background, accent],
    locked,
    published: true,
    updatedAt: record.updatedAt || null
  };

  // Keep locked cards discoverable, but never disclose their deployable project content.
  if (!locked) result.pages = legacyPages(ast, title);
  return result;
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  try {
    if (!enforceSameOrigin(context.request)) {
      return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin template requests are not permitted.', id);
    }
    const auth = await verifyFirebaseIdToken(context.request, context.env);
    if (!auth.ok) return auth.response;

    const identity = {
      ...auth.user,
      uid: String(auth.user.uid || auth.user.sub || '').trim(),
      sub: String(auth.user.sub || auth.user.uid || '').trim(),
      email: normalizeEmail(auth.user.email)
    };
    if (!identity.uid || !identity.email) {
      return errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'Please sign in again to verify your account.', id);
    }

    const entitlements = await resolveEntitlements(context.env, identity);
    const url = new URL(context.request.url);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '100', 10) || 100));
    const pageToken = clean(url.searchParams.get('pageToken') || '', 4000) || null;
    const rows = await listFirestoreDocuments(context.env, 'ovyx_templates', pageSize, pageToken);
    const templates = (rows.documents || [])
      .filter(row => row && row.published === true)
      .map(row => adaptTemplateForUser(row, entitlements.planTier, entitlements.capabilities?.templates === true))
      .filter(Boolean);

    return jsonResponse({
      ok: true,
      templates,
      currentTier: entitlements.planTier,
      templatesEnabled: entitlements.capabilities?.templates === true,
      nextPageToken: rows.nextPageToken || null,
      scope: 'global',
      authority: 'SERVER'
    }, 200, {
      'X-OVYX-Request-ID': id,
      'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(
      error?.status || 503,
      error?.code || 'PUBLISHED_TEMPLATES_UNAVAILABLE',
      'The published OVYX template catalogue could not be loaded. Please try again.',
      id
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET is required.', requestId(context.request));
}
