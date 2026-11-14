import { authenticateRequest, hasAdminClaim } from '../../_lib/firebase.js';
import { listFirestoreDocuments } from '../_lib/firebase-admin.js';
import { jsonResponse, requestId } from '../_lib/http.js';

const OWNER_EMAIL = 'ovyxsupportteam@gmail.com';

export async function onRequest(context) {
  const rid = requestId(context.request);

  try {
    const user =
      context.data?.user ||
      await authenticateRequest(
        context.request,
        context.env
      );

    const root =
      String(user?.email || '').toLowerCase() ===
      OWNER_EMAIL;

    if (!root && !hasAdminClaim(user)) {
      return jsonResponse(
        {
          ok: false,
          error: 'Administrator access required.',
          code: 'ADMIN_REQUIRED',
          requestId: rid,
        },
        403,
        {
          'X-OVYX-Request-ID': rid,
        }
      );
    }

    if (
      context.request.method.toUpperCase() !==
      'GET'
    ) {
      return jsonResponse(
        {
          ok: false,
          error: 'GET is required.',
          code: 'METHOD_NOT_ALLOWED',
          requestId: rid,
        },
        405,
        {
          'X-OVYX-Request-ID': rid,
        }
      );
    }

    const result =
      await listFirestoreDocuments(
        context.env,
        'support_tickets',
        100
      );

    const tickets =
      (result?.documents || [])
        .map(row => row || {})
        .sort(
          (a, b) =>
            String(b.createdAt || '').localeCompare(
              String(a.createdAt || '')
            )
        );

    return jsonResponse(
      {
        ok: true,
        tickets,
        nextPageToken:
          result?.nextPageToken || null,
      },
      200,
      {
        'X-OVYX-Request-ID': rid,
      }
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error:
          error?.message ||
          'Unable to load support tickets.',
        code:
          error?.code ||
          'SUPPORT_ADMIN_FAILED',
        requestId: rid,
      },
      error?.status || 500,
      {
        'X-OVYX-Request-ID': rid,
      }
    );
  }
}
