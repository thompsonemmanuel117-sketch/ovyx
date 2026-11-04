import { authenticateRequest } from '../_lib/firebase.js';
import {
  getFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath,
  listFirestoreSubcollectionDocumentsAtPath,
} from '../_lib/firebase-admin.js';
import { readJson, jsonResponse, requestId } from './_lib/http.js';

const MAX_BODY_BYTES = 900_000;
const MAX_BACKUPS = 20;
const BACKUP_COLLECTION = 'website_backups';

function clean(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function fail(message, status = 400, code = 'SITE_MANAGEMENT_INVALID') {
  return Object.assign(new Error(message), { status, code });
}
function safeProjectId(value) {
  const id = clean(value, 120);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw fail('Choose a valid saved website.', 400, 'INVALID_PROJECT_ID');
  return id;
}
function identityOf(user) {
  const uid = clean(user?.uid || user?.sub, 180);
  const email = clean(user?.email, 320).toLowerCase();
  if (!uid || !email) throw fail('Sign in with your verified email address first.', 401, 'AUTH_IDENTITY_REQUIRED');
  return { uid, email };
}
async function loadOwnedProject(env, email, uid, projectId) {
  const path = ['users', email, 'projects', projectId];
  const document = await getFirestoreDocumentAtPath(env, path);
  if (!document) throw fail('This saved website could not be found.', 404, 'PROJECT_NOT_FOUND');
  const project = await getFirestoreDataAtPath(env, path) || {};
  if (clean(project.ownerUid) !== uid || clean(project.ownerEmail, 320).toLowerCase() !== email) {
    throw fail('You do not have permission to manage this website.', 403, 'PROJECT_ACCESS_DENIED');
  }
  return { path, document, project };
}
function utf8Size(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
function publicBackup(row) {
  const data = row?.data || {};
  return {
    id: row.id,
    label: clean(data.label || 'Website backup', 100),
    kind: clean(data.kind || 'manual', 24),
    createdAt: data.createdAt || null,
    bytes: Number(data.bytes) || 0,
  };
}
async function createBackup(env, owner, projectId, project, kind = 'manual', label = '') {
  const snapshot = JSON.parse(JSON.stringify(project));
  delete snapshot.ownerUid;
  delete snapshot.ownerEmail;
  const bytes = utf8Size(snapshot);
  if (bytes > 850_000) {
    throw fail('This website is too large for a safe built-in backup. No changes were made. Export a project ZIP before continuing.', 413, 'BACKUP_TOO_LARGE');
  }
  const id = 'backup_' + crypto.randomUUID().replace(/-/g, '');
  const createdAt = new Date().toISOString();
  const record = {
    id,
    projectId,
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    label: clean(label || (kind === 'automatic' ? 'Automatic safety backup' : 'Manual website backup'), 100),
    kind: kind === 'automatic' ? 'automatic' : 'manual',
    createdAt,
    bytes,
    snapshot,
  };
  await setFirestoreDocumentAtPath(env, ['users', owner.email, 'projects', projectId, BACKUP_COLLECTION, id], record, { merge: false });
  const rows = await listFirestoreSubcollectionDocumentsAtPath(env, ['users', owner.email, 'projects', projectId], BACKUP_COLLECTION, 1000);
  const excess = rows
    .filter(row => row.id !== id && clean(row.data?.ownerUid) === owner.uid)
    .sort((a, b) => String(b.data?.createdAt || '').localeCompare(String(a.data?.createdAt || '')))
    .slice(MAX_BACKUPS - 1);
  await Promise.all(excess.map(row => deleteFirestoreDocumentAtPath(env, ['users', owner.email, 'projects', projectId, BACKUP_COLLECTION, row.id])));
  return publicBackup({ id, data: record });
}
function normalizeSettings(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const navigation = Array.isArray(input.navigation) ? input.navigation.slice(0, 30).map((item, index) => {
    const path = clean(item?.path, 180);
    const safePath = /^(?:\/(?!\/)|#|\?)[A-Za-z0-9._~!function normalizeSettings(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const navigation = Array.isArray(input.navigation) ? input.navigation.slice(0, 30).map((item, index) => ({
    label: clean(item?.label, 60),
    path: clean(item?.path, 180),
    order: index,
  })).filter(item => item.label && item.path && !/[\u0000-\u001f]/.test(item.path)) : [];
  return {
    title: clean(input.title, 120),
    description: clean(input.description, 320),
    language: clean(input.language || 'en', 12).toLowerCase(),
    navigation,
    updatedAt: new Date().toISOString(),
  };
}()*+,;=:@%/?#-]*$/.test(path) ||
      /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path);
    return { label: clean(item?.label, 60), path: safePath && !path.split('/').includes('..') ? path : '', order: index };
  }).filter(item => item.label && item.path) : [];
  const requestedLanguage = clean(input.language || 'en', 12).toLowerCase();
  return {
    title: clean(input.title, 120),
    description: clean(input.description, 320),
    language: /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(requestedLanguage) ? requestedLanguage : 'en',
    navigation,
    updatedAt: new Date().toISOString(),
  };
}
export async function onRequest(context) {
  const id = requestId(context.request);
  try {
    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    const owner = identityOf(user);
    const url = new URL(context.request.url);
    const method = context.request.method.toUpperCase();
    const projectId = safeProjectId(url.searchParams.get('projectId') || '');
    const { path, document, project } = await loadOwnedProject(context.env, owner.email, owner.uid, projectId);

    if (method === 'GET') {
      const view = clean(url.searchParams.get('view') || 'settings', 24).toLowerCase();
      if (view === 'backups') {
        const rows = await listFirestoreSubcollectionDocumentsAtPath(context.env, path, BACKUP_COLLECTION, 1000);
        const backups = rows
          .filter(row => clean(row.data?.ownerUid) === owner.uid && clean(row.data?.ownerEmail, 320).toLowerCase() === owner.email)
          .sort((a, b) => String(b.data?.createdAt || '').localeCompare(String(a.data?.createdAt || '')))
          .map(publicBackup);
        return jsonResponse({ ok: true, projectId, backups }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'private, no-store' });
      }
      if (view === 'analytics') {
        return jsonResponse({
          ok: true,
          projectId,
          available: false,
          totals: null,
          message: 'Verified visitor analytics are not connected to this website yet. OVYX will not guess or invent visit numbers.',
        }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'private, no-store' });
      }
      if (view !== 'settings') throw fail('Choose a supported website-management view.', 400, 'INVALID_VIEW');
      return jsonResponse({ ok: true, projectId, settings: project.siteSettings || { title: '', description: '', language: 'en', navigation: [] } }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'private, no-store' });
    }

    if (method !== 'POST') throw fail('Use GET to view website details or POST to make a change.', 405, 'METHOD_NOT_ALLOWED');
    const body = await readJson(context.request, MAX_BODY_BYTES);
    if (safeProjectId(body.projectId || '') !== projectId) throw fail('Website identity did not match the request.', 400, 'PROJECT_ID_MISMATCH');
    const action = clean(body.action, 24).toLowerCase();

    if (action === 'backup') {
      const backup = await createBackup(context.env, owner, projectId, project, 'manual', body.label);
      return jsonResponse({ ok: true, backup }, 201, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' });
    }

    if (action === 'settings') {
      const settings = normalizeSettings(body.settings);
      await createBackup(context.env, owner, projectId, project, 'automatic', 'Before website settings update');
      await setFirestoreDocumentAtPath(context.env, path, { siteSettings: settings, updatedAt: new Date().toISOString() }, {
        merge: true,
        expectedUpdateTime: document.updateTime || null,
      });
      return jsonResponse({ ok: true, settings }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' });
    }

    if (action === 'restore') {
      const backupId = clean(body.backupId, 120);
      if (!/^backup_[a-f0-9]{32}$/.test(backupId)) throw fail('Choose a valid backup to restore.', 400, 'INVALID_BACKUP_ID');
      const selectedPath = [...path, BACKUP_COLLECTION, backupId];
      const selectedDoc = await getFirestoreDocumentAtPath(context.env, selectedPath);
      if (!selectedDoc) throw fail('That backup no longer exists.', 404, 'BACKUP_NOT_FOUND');
      const selected = await getFirestoreDataAtPath(context.env, selectedPath);
      if (clean(selected?.ownerUid) !== owner.uid || clean(selected?.ownerEmail, 320).toLowerCase() !== owner.email || selected?.projectId !== projectId || !selected?.snapshot || typeof selected.snapshot !== 'object') {
        throw fail('This backup does not belong to your website.', 403, 'BACKUP_ACCESS_DENIED');
      }
      await createBackup(context.env, owner, projectId, project, 'automatic', 'Before restoring ' + clean(selected.label, 60));
      const restored = {
        ...selected.snapshot,
        id: projectId,
        ownerUid: owner.uid,
        ownerEmail: owner.email,
        createdAt: project.createdAt || selected.snapshot.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (utf8Size(restored) > 950_000) throw fail('This backup is too large to restore safely. Your current website was not changed.', 413, 'RESTORE_TOO_LARGE');
      await setFirestoreDocumentAtPath(context.env, path, restored, { merge: false, expectedUpdateTime: document.updateTime || null });
      return jsonResponse({ ok: true, restored: true, projectId, backupId }, 200, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' });
    }

    throw fail('Supported actions are backup, settings and restore.', 400, 'INVALID_ACTION');
  } catch (error) {
    const status = Number(error?.status) >= 400 && Number(error?.status) <= 599 ? Number(error.status) : 500;
    return jsonResponse({ ok: false, error: clean(error?.message || 'Website management could not be completed.', 400), code: error?.code || 'SITE_MANAGEMENT_FAILED' }, status, { 'X-OVYX-Request-ID': id, 'Cache-Control': 'no-store' });
  }
}
