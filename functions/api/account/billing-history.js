import { verifyFirebaseIdToken } from '../_lib/auth.js';
import {
  getFirestoreData,
  listFirestoreSubcollectionDocuments
} from '../_lib/firebase-admin.js';
import { errorResponse, jsonResponse, requestId, enforceSameOrigin } from './_lib/http.js';

const MAX_ROWS = 100;
const clean = (value, max = 240) => String(value ?? '').trim().slice(0, max);

function publicPayment(record, reference) {
  const createdAt = String(record.createdAt || record.created_at || '').slice(0, 40);
  const currency = clean(record.currency, 8).toUpperCase();
  const amount = Number(record.amount);
  const providerStatus = clean(record.lastQueriedStatus || record.providerStatus || record.status, 40).toLowerCase();
  const fulfilled = String(record.fulfillmentStatus || '').toLowerCase() === 'fulfilled' ||
    record.fulfilled === true;
  const status = fulfilled ? 'fulfilled' :
    ['failed', 'failure', 'cancelled', 'canceled', 'expired'].includes(providerStatus) ? providerStatus :
    ['success', 'succeeded', 'paid'].includes(providerStatus) ? 'payment-confirmed' : 'pending';
  const plan = clean(record.plan || record.productId || record.productType || 'OVYX purchase', 80);
  return {
    reference: clean(reference || record.orderNo || record.reference, 160),
    label: 'OVYX ' + plan.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 72),
    date: createdAt,
    createdAt,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    currency: ['NGN', 'USD'].includes(currency) ? currency : 'NGN',
    provider: clean(record.provider || record.paymentMethod || 'unknown', 32),
    productType: clean(record.productType || 'subscription', 32),
    productId: clean(record.productId || plan, 80),
    plan,
    status,
    fulfilled,
    fulfillmentStatus: clean(record.fulfillmentStatus || (fulfilled ? 'fulfilled' : 'unfulfilled'), 40)
  };
}

export async function onRequestGet(context) {
  const id = requestId(context.request);
  if (!enforceSameOrigin(context.request)) {
    return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin billing history requests are not permitted.', id);
  }

  try {
    const auth = await verifyFirebaseIdToken(context.request, context.env);
    if (!auth.ok) return auth.response;
    const uid = String(auth.user.uid || auth.user.sub || '').trim();
    if (!uid) return errorResponse(401, 'AUTH_IDENTITY_REQUIRED', 'A verified OVYX account is required.', id);

    const index = await listFirestoreSubcollectionDocuments(context.env, 'users', uid, 'billing_history', MAX_ROWS);
    const entries = await Promise.all((index || []).map(async row => {
      const reference = clean(row?.id, 160);
      if (!reference) return null;
      try {
        const payment = await getFirestoreData(context.env, 'payment_orders', reference);
        if (payment && String(payment.uid || '') === uid) return publicPayment(payment, reference);
      } catch {
        // A missing legacy order may still have a durable user-scoped index row.
      }
      const mirror = row?.data || {};
      if (String(mirror.uid || '') !== uid) return null;
      return publicPayment(mirror, reference);
    }));

    const payments = entries.filter(Boolean)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 50);

    return jsonResponse({
      ok: true,
      payments,
      count: payments.length,
      source: 'server',
      authority: 'SERVER',
      checkedAt: new Date().toISOString()
    }, 200, {
      'X-OVYX-Request-ID': id,
      'Cache-Control': 'no-store, max-age=0'
    });
  } catch (error) {
    return errorResponse(error?.status || 503, error?.code || 'BILLING_HISTORY_UNAVAILABLE', 'OVYX could not load server billing history. Retry when the account service is available.', id);
  }
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return onRequestGet(context);
  return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET is required.', requestId(context.request));
}
