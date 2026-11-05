import { authenticateRequest } from '../../_lib/firebase.js';
import { readJson, jsonResponse } from '../../_lib/http.js';
import { getFirestoreDataAtPath, setFirestoreDocumentAtPath, listFirestoreSubcollectionDocumentsAtPath } from '../../_lib/firebase-admin.js';
const ALLOWED = new Set(['read', 'write', 'delete', 'execute']);
const clean = (value, max = 320) => String(value ?? '').trim().slice(0, max);
const safeId = value => { const id = clean(value, 120); if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw Object.assign(new Error('The selected project or connection is invalid.'), { status: 400, code: 'INVALID_CONNECTION_GRANT_TARGET' }); return id; };
async function onRequest(context) {
  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    const uid = clean(user?.uid || user?.sub, 180); const email = clean(user?.email, 320).toLowerCase();
    if (!uid || !email) return jsonResponse({ ok: false, code: 'AUTH_IDENTITY_REQUIRED', error: 'Please sign in with a verified email address.' }, 401);
    const url = new URL(context.request.url); const body = context.request.method === 'POST' ? await readJson(context.request, 20000) : {};
    const projectId = safeId(body.projectId || url.searchParams.get('projectId')); const projectPath = ['users', email, 'projects', projectId];
    const project = await getFirestoreDataAtPath(context.env, projectPath);
    if (!project || project.ownerUid !== uid || clean(project.ownerEmail, 320).toLowerCase() !== email) return jsonResponse({ ok: false, code: 'PROJECT_NOT_FOUND', error: 'Project not found.' }, 404);
    if (context.request.method === 'GET') {
      const rows = await listFirestoreSubcollectionDocumentsAtPath(context.env, projectPath, 'connection_grants', 100);
      return jsonResponse({ ok: true, projectId, grants: rows.map(row => ({ id: row.id, connectionId: row.data?.connectionId || row.id, connectionName: clean(row.data?.connectionName, 120), permissions: Array.isArray(row.data?.permissions) ? row.data.permissions.filter(x => ALLOWED.has(x)) : [], active: row.data?.active === true, createdAt: row.data?.createdAt || null, updatedAt: row.data?.updatedAt || null })) }, 200);
    }
    if (context.request.method !== 'POST') return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'GET or POST is required.' }, 405);
    const action = clean(body.action, 20).toLowerCase(); const connectionId = safeId(body.connectionId); const grantPath = [...projectPath, 'connection_grants', connectionId];
    if (action === 'revoke') {
      const grant = await getFirestoreDataAtPath(context.env, grantPath);
      if (!grant || grant.ownerUid !== uid) return jsonResponse({ ok: false, code: 'PROJECT_CONNECTION_GRANT_NOT_FOUND', error: 'This project connection grant was not found.' }, 404);
      await setFirestoreDocumentAtPath(context.env, grantPath, { active: false, revokedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
      return jsonResponse({ ok: true, revoked: true, projectId, connectionId }, 200);
    }
    if (action !== 'grant') return jsonResponse({ ok: false, code: 'INVALID_GRANT_ACTION', error: 'Choose grant or revoke.' }, 400);
    const connection = await getFirestoreDataAtPath(context.env, ['users', email, 'universal_connections', connectionId]);
    if (!connection || connection.ownerUid !== uid || clean(connection.ownerEmail, 320).toLowerCase() !== email || connection.active !== true) return jsonResponse({ ok: false, code: 'CONNECTION_NOT_AVAILABLE', error: 'Choose an active connection owned by this account.' }, 404);
    if (connection.type === 'ai' || ['openai-chat', 'anthropic-messages', 'gemini-generate-content'].includes(connection.protocol)) return jsonResponse({ ok: false, code: 'AI_CONNECTION_PROJECT_SCOPE_BLOCKED', error: 'Personal AI Brain credentials cannot be shared with generated projects.' }, 403);
    const permissions = Array.isArray(body.permissions) ? [...new Set(body.permissions.map(x => clean(x, 20)).filter(x => ALLOWED.has(x)))] : [];
    if (!permissions.length) return jsonResponse({ ok: false, code: 'CONNECTION_PERMISSIONS_REQUIRED', error: 'Choose at least one permission.' }, 400);
    const existing = await getFirestoreDataAtPath(context.env, grantPath); const now = new Date().toISOString();
    await setFirestoreDocumentAtPath(context.env, grantPath, { ownerUid: uid, ownerEmail: email, projectId, connectionId, connectionName: clean(connection.name, 120), permissions, active: true, createdAt: existing?.createdAt || now, updatedAt: now, revokedAt: null }, { merge: false });
    return jsonResponse({ ok: true, granted: true, projectId, connectionId, permissions }, 200);
  } catch (error) { return jsonResponse({ ok: false, code: error?.code || 'CONNECTION_GRANTS_FAILED', error: error?.message || 'The project connection grant could not be saved.' }, error?.status || 500); }
}
export { onRequest };
