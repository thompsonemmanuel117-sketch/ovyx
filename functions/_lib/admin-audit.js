import { addFirestoreDocument } from './firebase-admin.js';

const clean = (value, limit = 240) => String(value ?? '')
  .replace(/[\u0000-\u001F\u007F]/g, '')
  .trim()
  .slice(0, limit);

/**
 * Best-effort immutable activity record for successful platform-admin changes.
 * Audit storage failure must never roll back or falsely fail the primary action.
 */
export async function recordAdminAuditEvent(env, event = {}) {
  const actor = event.actor || {};
  const email = clean(actor.email, 200).toLowerCase();
  const uid = clean(actor.uid || actor.sub, 180);
  const action = clean(event.action, 160);
  const resource = clean(event.resource, 240);

  if (!email || !action || !resource) return false;

  try {
    await addFirestoreDocument(env, 'audit_logs', {
      user: email,
      actorUid: uid,
      action,
      resource,
      timestamp: new Date().toISOString(),
      requestId: clean(event.requestId, 160),
      result: 'SUCCESS'
    });
    return true;
  } catch (error) {
    console.warn(
      '[OVYX ADMIN AUDIT]',
      String(error?.code || error?.status || 'AUDIT_WRITE_UNAVAILABLE').slice(0, 100)
    );
    return false;
  }
}
