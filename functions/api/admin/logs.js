import {
  jsonResponse,
  errorResponse,
  getRequestId,
  getBearerToken,
  enforceSameOrigin
} from '../../_lib/http.js';
import { verifyFirebaseIdToken, normalizeEmail } from '../../_lib/auth.js';
import { listFirestoreDocuments } from '../../_lib/firebase-admin.js';
import { ROOT_EMAIL } from '../../_lib/brain/registry.js';

const PAGE_SIZE = 50;
const MAX_PAGE_TOKEN_LENGTH = 4000;

function cleanText(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, maxLength);
}

function formatAuditLog(document) {
  const item = document && typeof document === 'object' ? document : {};
  return {
    id: cleanText(item.id, 160),
    user: cleanText(item.user || item.email || item.actorEmail || 'N/A', 200),
    action: cleanText(item.action || item.adminAction || 'UNKNOWN', 160),
    resource: cleanText(item.resource || item.target || 'SYSTEM', 200),
    timestamp: cleanText(item.timestamp || item.createdAt || item.adminActionAt || '', 100),
    requestId: cleanText(item.requestId || '', 160),
    ipAddress: cleanText(item.ipAddress || '', 100),
    result: cleanText(item.result || item.status || 'RECORDED', 80)
  };
}

export async function onRequestGet(context) {
  const request = context.request;
  const env = context.env || {};
  const requestId = getRequestId(request);

  if (!enforceSameOrigin(request)) {
    return errorResponse(
      'Cross-origin administrative log requests are not permitted.',
      403,
      'ORIGIN_REJECTED',
      { requestId }
    );
  }

  if (!getBearerToken(request)) {
    return errorResponse(
      'Authentication is required to view administrative logs.',
      401,
      'AUTH_REQUIRED',
      { requestId }
    );
  }

  const auth = await verifyFirebaseIdToken(request, env);
  if (!auth.ok) return auth.response;

  // The configured administrator email is the access identity. No
  // first-registration/bootstrap privilege is created by this endpoint.
  if (normalizeEmail(auth.user.email) !== ROOT_EMAIL) {
    return errorResponse(
      'Only the configured OVYX administrator can view administrative logs.',
      403,
      'ADMIN_REQUIRED',
      { requestId }
    );
  }

  const url = new URL(request.url);
  const rawPageToken = String(url.searchParams.get('pageToken') || '').trim();
  if (rawPageToken.length > MAX_PAGE_TOKEN_LENGTH) {
    return errorResponse(
      'The audit-log page token is invalid.',
      400,
      'INVALID_PAGE_TOKEN',
      { requestId }
    );
  }

  try {
    const result = await listFirestoreDocuments(
      env,
      'audit_logs',
      PAGE_SIZE,
      rawPageToken || null
    );
    const logs = (Array.isArray(result.documents) ? result.documents : [])
      .map(formatAuditLog);

    return jsonResponse({
      ok: true,
      logs,
      pageSize: PAGE_SIZE,
      nextPageToken: result.nextPageToken || null,
      authority: 'SERVER'
    }, 200, {
      'X-OVYX-Request-ID': requestId,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
  } catch (error) {
    console.error(
      '[OVYX ADMIN AUDIT LOGS ' + requestId + ']',
      String(error?.code || error?.status || 'AUDIT_LOG_READ_FAILED').slice(0, 100)
    );
    return errorResponse(
      'Administrative logs are temporarily unavailable.',
      503,
      'AUDIT_LOGS_UNAVAILABLE',
      { requestId }
    );
  }
}
