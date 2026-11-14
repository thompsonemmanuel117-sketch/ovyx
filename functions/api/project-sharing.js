import { authenticateRequest } from '../_lib/firebase.js';
import {
  getFirestoreDocumentAtPath,
  createFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
  setFirestoreDocumentAtPath,
  deleteFirestoreDocumentAtPath,
  listFirestoreSubcollectionDocumentsAtPath,
  lookupFirebaseAccountByEmail,
} from './_lib/firebase-admin.js';
import { readJson, jsonResponse, requestId } from './_lib/http.js';

const clean = (value, max = 320) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const validEmail = value => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
const safeRole = value => value === 'editor' ? 'editor' : 'viewer';
const projectPath = (email, id) => ['users', email, 'projects', id];
const sharePath = (email, id, shareId) => [...projectPath(email, id), 'shares', shareId];

function fail(message, status = 400, code = 'PROJECT_SHARING_INVALID') {
  throw Object.assign(new Error(message), { status, code });
}
function projectId(value) {
  const id = clean(value, 120);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) fail('Choose a valid project.', 400, 'INVALID_PROJECT_ID');
  return id;
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function makeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function publicProject(project) {
  const publishedUrl = clean(project?.publishedUrl || project?.liveUrl || '', 1000);
  let safeUrl = null;
  try {
    const parsed = new URL(publishedUrl);
    if (parsed.protocol === 'https:') safeUrl = parsed.href;
  } catch {}
  const pages = Array.isArray(project?.pages) ? project.pages : [];
  return {
    id: clean(project?.id, 120),
    name: clean(project?.name || project?.title, 120) || 'Untitled project',
    description: clean(project?.description, 280),
    status: clean(project?.status, 40) || 'draft',
    pageCount: pages.length,
    pageNames: pages.slice(0, 30).map(page => clean(page?.name || page?.title, 80)).filter(Boolean),
    publishedUrl: safeUrl,
  };
}
async function ownerProject(env, uid, email, pid) {
  const path = projectPath(email, pid);
  const document = await getFirestoreDocumentAtPath(env, path);
  const project = document ? await getFirestoreDataAtPath(env, path) : null;
  if (!project || clean(project.ownerUid) !== uid || clean(project.ownerEmail).toLowerCase() !== email) {
    fail('Project not found.', 404, 'PROJECT_NOT_FOUND');
  }
  return { path, document, project };
}
async function recordActivity(env, ownerEmail, pid, event, actor) {
  const id = 'act_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  await setFirestoreDocumentAtPath(env, [...projectPath(ownerEmail, pid), 'activity', id], {
    event: clean(event, 48), actorUid: clean(actor?.uid, 256),
    actorEmail: clean(actor?.email, 320).toLowerCase(),
    actorName: clean(actor?.name || actor?.displayName || actor?.email, 100) || 'OVYX member',
    createdAt: new Date().toISOString(),
  }, { merge: false });
}
async function projectAccess(env, uid, email, pid) {
  const owned = await getFirestoreDataAtPath(env, projectPath(email, pid));
  if (owned && clean(owned.ownerUid) === uid && clean(owned.ownerEmail).toLowerCase() === email) return { ownerEmail: email, role: 'owner' };
  const memberships = await listFirestoreSubcollectionDocumentsAtPath(env, ['users', uid], 'shared_projects', 1000);
  const membership = memberships.find(row => row.data?.projectId === pid && row.data?.status === 'active')?.data;
  if (!membership) fail('Project not found.', 404, 'PROJECT_NOT_FOUND');
  const ownerEmail = clean(membership.ownerEmail, 320).toLowerCase();
  const project = await getFirestoreDataAtPath(env, projectPath(ownerEmail, pid));
  if (!project || clean(project.ownerUid) !== clean(membership.ownerUid) || clean(project.ownerEmail).toLowerCase() !== ownerEmail) fail('Shared project is no longer available.', 404, 'PROJECT_NOT_FOUND');
  return { ownerEmail, role: safeRole(membership.role) };
}
async function sendInvite(env, email, project, role, token, origin, ownerEmail, pid) {
  const apiKey = clean(env?.RESEND_API_KEY, 500);
  const from = clean(env?.RESEND_FROM_EMAIL || env?.RESEND_BROADCAST_FROM_EMAIL, 320);
  if (!apiKey || !from) fail('Email invitations are not configured yet. Add RESEND_API_KEY and RESEND_FROM_EMAIL in Cloudflare Pages.', 503, 'SHARING_EMAIL_NOT_CONFIGURED');
  const url = new URL('/', origin);
  url.searchParams.set('ovyx-share', token);
  url.searchParams.set('owner', ownerEmail);
  url.searchParams.set('projectId', pid);
  const safeName = clean(project.name || project.title, 120) || 'a project';
  const safeRole = role === 'editor' ? 'editor' : 'viewer';
  const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'You are invited to collaborate on an OVYX project',
      html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#171717"><p style="letter-spacing:2px;color:#9b762f;font-weight:bold">OVYX / PROJECT INVITATION</p><h1>You have been invited</h1><p>You have been invited to access <strong>' + escape(safeName) + '</strong> as a ' + safeRole + '.</p><p><a href="' + escape(url.href) + '" style="display:inline-block;padding:12px 18px;background:#171717;color:#fff;text-decoration:none;border-radius:8px">Review invitation</a></p><p style="color:#777;font-size:12px">Sign in with this invited email address to accept access.</p></div>',
      text: 'You have been invited to access ' + safeName + ' as a ' + safeRole + '. Sign in with this email address and open: ' + url.href,
      tags: [{ name: 'source', value: 'ovyx-project-sharing' }]
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[OVYX PROJECT INVITE]', response.status, clean(body?.message || body?.error, 180));
    fail('The invitation email could not be sent. Please try again.', 502, 'SHARING_EMAIL_FAILED');
  }
  return clean(body?.id, 200) || null;
}

export async function onRequest(context) {
  const rid = requestId(context.request);
  try {
    const url = new URL(context.request.url);
    const method = context.request.method.toUpperCase();

    // A share token is a capability: only its SHA-256 digest is stored.
    if (method === 'GET' && url.searchParams.has('token')) {
      const token = clean(url.searchParams.get('token'), 128);
      if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) fail('This share link is invalid or has expired.', 404, 'SHARE_NOT_FOUND');
      const tokenHash = await digest(token);
      const ownerEmail = clean(url.searchParams.get('owner'), 320).toLowerCase();
      const pid = projectId(url.searchParams.get('projectId'));
      if (!validEmail(ownerEmail)) fail('This share link is invalid or has expired.', 404, 'SHARE_NOT_FOUND');
      const rows = await listFirestoreSubcollectionDocumentsAtPath(context.env, projectPath(ownerEmail, pid), 'shares', 200);
      const match = rows.find(row => row.data?.tokenHash === tokenHash);
      if (!match || match.data?.status !== 'active' || (match.data?.expiresAt && Date.parse(match.data.expiresAt) <= Date.now())) {
        fail('This share link is no longer available.', 404, 'SHARE_REVOKED');
      }
      const project = await getFirestoreDataAtPath(context.env, projectPath(ownerEmail, pid));
      if (!project || clean(project.ownerEmail).toLowerCase() !== ownerEmail) fail('This share link is no longer available.', 404, 'SHARE_REVOKED');
      return jsonResponse({ ok: true, share: { id: match.id, type: match.data.type, role: match.data.role, status: match.data.status, inviteEmail: match.data.type === 'invite' ? match.data.email : null }, project: publicProject(project) }, 200, { 'X-OVYX-Request-ID': rid });
    }

    const user = context.data?.user || await authenticateRequest(context.request, context.env);
    const uid = clean(user?.uid || user?.sub, 256);
    const email = clean(user?.email, 320).toLowerCase();
    if (!uid || !validEmail(email)) fail('Please sign in with a verified email address.', 401, 'AUTH_REQUIRED');

    if (method === 'GET' && url.searchParams.get('inbox') === '1') {
      const rows = await listFirestoreSubcollectionDocumentsAtPath(context.env, ['users', uid], 'share_requests', 100);
      const requests = [];
      for (const row of rows) {
        const item = row.data || {};
        if (item.status !== 'pending' || clean(item.targetUid, 256) !== uid || clean(item.targetEmail, 320).toLowerCase() !== email) continue;
        const pid = projectId(item.projectId);
        const ownerEmail = clean(item.ownerEmail, 320).toLowerCase();
        if (!validEmail(ownerEmail)) continue;
        const share = await getFirestoreDataAtPath(context.env, sharePath(ownerEmail, pid, clean(item.shareId, 120)));
        const project = await getFirestoreDataAtPath(context.env, projectPath(ownerEmail, pid));
        if (!share || share.type !== 'member' || share.status !== 'pending' || share.targetUid !== uid || !project || clean(project.ownerUid, 256) !== clean(item.ownerUid, 256) || clean(project.ownerEmail, 320).toLowerCase() !== ownerEmail) continue;
        requests.push({ id: row.id, shareId: clean(item.shareId, 120), projectId: pid, projectName: clean(project.name || project.title, 120) || 'Shared project', ownerEmail, ownerName: clean(project.ownerName || project.ownerDisplayName, 100) || ownerEmail, role: safeRole(share.role), createdAt: clean(share.createdAt, 40) || null });
      }
      requests.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return jsonResponse({ ok: true, requests }, 200, { 'X-OVYX-Request-ID': rid, 'Cache-Control': 'no-store' });
    }

    if (method === 'GET') {
      const pid = projectId(url.searchParams.get('projectId'));
      const { project } = await ownerProject(context.env, uid, email, pid);
      const rows = await listFirestoreSubcollectionDocumentsAtPath(context.env, projectPath(email, pid), 'shares', 200);
      const activityRows = await listFirestoreSubcollectionDocumentsAtPath(context.env, projectPath(email, pid), 'activity', 40);
      const presenceRows = await listFirestoreSubcollectionDocumentsAtPath(context.env, projectPath(email, pid), 'presence', 100);
      const activeAfter = Date.now() - 90 * 1000;
      const activity = activityRows.map(row => ({ id: row.id, event: clean(row.data?.event, 48), actorName: clean(row.data?.actorName, 100) || 'OVYX member', actorEmail: clean(row.data?.actorEmail, 320), createdAt: clean(row.data?.createdAt, 40) || null })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 20);
      const collaborators = presenceRows.map(row => ({ uid: clean(row.data?.uid, 256), name: clean(row.data?.name || row.data?.email, 100) || 'OVYX member', email: clean(row.data?.email, 320), role: row.data?.role === 'owner' ? 'owner' : safeRole(row.data?.role), lastSeenAt: clean(row.data?.lastSeenAt, 40) || null, active: Date.parse(row.data?.lastSeenAt || '') > activeAfter })).filter(item => item.uid);

      const items = rows.map(row => ({
        id: row.id,
        type: row.data?.type === 'invite' ? 'invite' : row.data?.type === 'member' ? 'member' : 'link',
        email: clean(row.data?.email || row.data?.targetEmail, 320) || null,
        role: safeRole(row.data?.role),
        status: clean(row.data?.status, 24) || 'revoked',
        createdAt: clean(row.data?.createdAt, 40) || null,
        expiresAt: clean(row.data?.expiresAt, 40) || null,
        acceptedAt: clean(row.data?.acceptedAt, 40) || null,
      })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return jsonResponse({ ok: true, project: publicProject(project), shares: items, activity, collaborators }, 200, { 'X-OVYX-Request-ID': rid });
    }

    if (method !== 'POST') fail('GET or POST is required.', 405, 'METHOD_NOT_ALLOWED');
    const body = await readJson(context.request, 12000);
    const action = clean(body.action, 32).toLowerCase();

    if (action === 'accept-invite') {
      const token = clean(body.token, 128);
      if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) fail('This invitation is invalid or has expired.', 404, 'INVITE_NOT_FOUND');
      const tokenHash = await digest(token);
      const pid = projectId(body.projectId);
      const ownerEmail = clean(body.ownerEmail, 320).toLowerCase();
      if (!validEmail(ownerEmail)) fail('This invitation is invalid or has expired.', 404, 'INVITE_NOT_FOUND');
      const rows = await listFirestoreSubcollectionDocumentsAtPath(context.env, projectPath(ownerEmail, pid), 'shares', 200);
      const match = rows.find(row => row.data?.tokenHash === tokenHash && row.data?.type === 'invite');
      if (!match || match.data.status !== 'active' || clean(match.data.email).toLowerCase() !== email) fail('This invitation is not valid for the signed-in email address.', 403, 'INVITE_EMAIL_MISMATCH');
      const path = sharePath(ownerEmail, pid, match.id);
      const acceptedAt = new Date().toISOString();
      await setFirestoreDocumentAtPath(context.env, path, { acceptedAt, acceptedUid: uid, status: 'accepted' }, { merge: true });
      const sharedProject = await getFirestoreDataAtPath(context.env, projectPath(ownerEmail, pid));
      const membershipId = 'sp_' + (await digest(ownerEmail + ':' + pid)).slice(0, 24);
      await setFirestoreDocumentAtPath(context.env, ['users', uid, 'shared_projects', membershipId], {
        projectId: pid,
        projectName: clean(sharedProject?.name || sharedProject?.title, 120) || 'Shared project',
        ownerUid: clean(sharedProject?.ownerUid, 256),
        ownerEmail,
        role: safeRole(match.data.role),
        status: 'active',
        invitationId: match.id,
        acceptedAt,
        updatedAt: acceptedAt,
      }, { merge: false });
      await recordActivity(context.env, ownerEmail, pid, 'invitation_accepted', { uid, email, name: user.name || user.displayName });
      return jsonResponse({ ok: true, accepted: true, role: safeRole(match.data.role), project: publicProject(sharedProject) }, 200, { 'X-OVYX-Request-ID': rid });
    }

    if (action === 'accept-member-request' || action === 'decline-member-request') {
      const pid = projectId(body.projectId);
      const shareId = clean(body.shareId, 120);
      if (!/^mem_[A-Za-z0-9_-]{20,32}$/.test(shareId)) fail('This member request is invalid or unavailable.', 404, 'MEMBER_REQUEST_NOT_FOUND');
      const requestPath = ['users', uid, 'share_requests', shareId];
      const requestDocument = await getFirestoreDocumentAtPath(context.env, requestPath);
      const requestData = requestDocument ? await getFirestoreDataAtPath(context.env, requestPath) : null;
      if (!requestData || !['pending', 'accepted'].includes(requestData.status) || clean(requestData.targetUid, 256) !== uid || clean(requestData.targetEmail, 320).toLowerCase() !== email || clean(requestData.projectId, 120) !== pid || clean(requestData.shareId, 120) !== shareId) fail('This member request is no longer available.', 404, 'MEMBER_REQUEST_NOT_FOUND');
      const ownerEmail = clean(requestData.ownerEmail, 320).toLowerCase();
      if (!validEmail(ownerEmail)) fail('This member request is no longer available.', 404, 'MEMBER_REQUEST_NOT_FOUND');
      const ownerPath = projectPath(ownerEmail, pid);
      const ownerDocument = await getFirestoreDocumentAtPath(context.env, ownerPath);
      const owner = ownerDocument ? await getFirestoreDataAtPath(context.env, ownerPath) : null;
      if (!owner || clean(owner.ownerUid, 256) !== clean(requestData.ownerUid, 256) || clean(owner.ownerEmail, 320).toLowerCase() !== ownerEmail) fail('This project is no longer available.', 404, 'PROJECT_NOT_FOUND');
      const memberPath = sharePath(ownerEmail, pid, shareId);
      const memberDocument = await getFirestoreDocumentAtPath(context.env, memberPath);
      const member = memberDocument ? await getFirestoreDataAtPath(context.env, memberPath) : null;
      if (!member || member.type !== 'member' || clean(member.targetUid, 256) !== uid || clean(member.targetEmail, 320).toLowerCase() !== email || !['pending', 'accepted'].includes(member.status)) fail('This member request is no longer available.', 404, 'MEMBER_REQUEST_NOT_FOUND');
      const now = new Date().toISOString();
      if (action === 'decline-member-request') {
        if (member.status !== 'pending') fail('This member request has already been answered.', 409, 'MEMBER_REQUEST_ALREADY_ANSWERED');
        await setFirestoreDocumentAtPath(context.env, memberPath, { status: 'declined', declinedAt: now, declinedByUid: uid }, { merge: true, expectedUpdateTime: memberDocument.updateTime });
        await setFirestoreDocumentAtPath(context.env, requestPath, { status: 'declined', respondedAt: now }, { merge: true, expectedUpdateTime: requestDocument.updateTime });
        await recordActivity(context.env, ownerEmail, pid, 'member_request_declined', { uid, email, name: user.name || user.displayName });
        return jsonResponse({ ok: true, declined: true }, 200, { 'X-OVYX-Request-ID': rid });
      }
      if (member.status === 'pending') {
        await setFirestoreDocumentAtPath(context.env, memberPath, { status: 'accepted', acceptedAt: now, acceptedUid: uid }, { merge: true, expectedUpdateTime: memberDocument.updateTime });
        await setFirestoreDocumentAtPath(context.env, requestPath, { status: 'accepted', respondedAt: now }, { merge: true, expectedUpdateTime: requestDocument.updateTime });
        await recordActivity(context.env, ownerEmail, pid, 'member_request_accepted', { uid, email, name: user.name || user.displayName });
      } else if (clean(member.acceptedUid, 256) !== uid) fail('This member request cannot be accepted by this account.', 403, 'MEMBER_REQUEST_FORBIDDEN');
      const membershipId = 'sp_' + (await digest(ownerEmail + ':' + pid)).slice(0, 24);
      await setFirestoreDocumentAtPath(context.env, ['users', uid, 'shared_projects', membershipId], { projectId: pid, projectName: clean(owner.name || owner.title, 120) || 'Shared project', ownerUid: clean(owner.ownerUid, 256), ownerEmail, role: safeRole(member.role), status: 'active', invitationId: shareId, acceptedAt: clean(member.acceptedAt, 40) || now, updatedAt: now }, { merge: false });
      return jsonResponse({ ok: true, accepted: true, role: safeRole(member.role), project: publicProject(owner) }, 200, { 'X-OVYX-Request-ID': rid });
    }

    const pid = projectId(body.projectId);
    if (action === 'presence') {
      const access = await projectAccess(context.env, uid, email, pid);
      const now = new Date().toISOString();
      await setFirestoreDocumentAtPath(context.env, [...projectPath(access.ownerEmail, pid), 'presence', uid], {
        uid, email, name: clean(user.name || user.displayName || email, 100), role: access.role, lastSeenAt: now,
      }, { merge: true });
      return jsonResponse({ ok: true, lastSeenAt: now }, 200, { 'X-OVYX-Request-ID': rid });
    }
    const { path, document, project } = await ownerProject(context.env, uid, email, pid);
    const now = new Date().toISOString();

    if (action === 'send-member-request') {
      const targetEmail = clean(body.email, 320).toLowerCase();
      const role = safeRole(body.role);
      if (!validEmail(targetEmail) || targetEmail === email) fail('Enter a valid OVYX member email address.', 400, 'MEMBER_EMAIL_INVALID');
      const account = await lookupFirebaseAccountByEmail(context.env, targetEmail);
      if (!account || !account.localId || account.disabled === true || account.emailVerified !== true || String(account.email || '').trim().toLowerCase() !== targetEmail || String(account.localId) === uid) return jsonResponse({ ok: true, requestQueued: false, message: 'If this is an eligible verified OVYX account, an access request will appear in its inbox.' }, 202, { 'X-OVYX-Request-ID': rid, 'Cache-Control': 'no-store' });
      const targetUid = clean(account.localId, 256);
      const shareId = 'mem_' + (await digest(email + ':' + pid + ':' + targetUid)).slice(0, 24);
      const memberPath = [...path, 'shares', shareId];
      const existingMemberDocument = await getFirestoreDocumentAtPath(context.env, memberPath);
      const existingMember = existingMemberDocument ? await getFirestoreDataAtPath(context.env, memberPath) : null;
      if (existingMember && ['pending', 'accepted'].includes(existingMember.status)) return jsonResponse({ ok: true, requestQueued: false, message: 'If this is an eligible verified OVYX account, an access request will appear in its inbox.' }, 202, { 'X-OVYX-Request-ID': rid, 'Cache-Control': 'no-store' });
      const now = new Date().toISOString();
      const memberRecord = { id: shareId, type: 'member', targetUid, targetEmail, role, status: 'pending', createdByUid: uid, createdByEmail: email, createdAt: now };
      let savedMemberDocument = null;
      if (existingMemberDocument) savedMemberDocument = await setFirestoreDocumentAtPath(context.env, memberPath, memberRecord, { merge: false, expectedUpdateTime: existingMemberDocument.updateTime });
      else {
        try { savedMemberDocument = await createFirestoreDocumentAtPath(context.env, memberPath, memberRecord); }
        catch (error) { if (error?.code === 'FIRESTORE_CREATE_CONFLICT') return jsonResponse({ ok: true, requestQueued: false, message: 'If this is an eligible verified OVYX account, an access request will appear in its inbox.' }, 202, { 'X-OVYX-Request-ID': rid, 'Cache-Control': 'no-store' }); throw error; }
      }
      const requestPath = ['users', targetUid, 'share_requests', shareId];
      const existingRequestDocument = await getFirestoreDocumentAtPath(context.env, requestPath);
      try {
        await setFirestoreDocumentAtPath(context.env, requestPath, { shareId, projectId: pid, projectName: clean(project.name || project.title, 120) || 'Shared project', ownerUid: uid, ownerEmail: email, targetUid, targetEmail, role, status: 'pending', createdAt: now }, { merge: false, expectedUpdateTime: existingRequestDocument?.updateTime || null });
      } catch (error) {
        if (existingMemberDocument) await setFirestoreDocumentAtPath(context.env, memberPath, existingMember, { merge: false, expectedUpdateTime: savedMemberDocument?.updateTime || null }).catch(() => {});
        else await deleteFirestoreDocumentAtPath(context.env, memberPath).catch(() => {});
        throw error;
      }
      await recordActivity(context.env, email, pid, 'member_request_sent', { uid, email, name: user.name || user.displayName });
      return jsonResponse({ ok: true, requestQueued: true, message: 'If this is an eligible verified OVYX account, an access request will appear in its inbox.' }, 202, { 'X-OVYX-Request-ID': rid, 'Cache-Control': 'no-store' });
    }

    if (action === 'create-link' || action === 'invite') {
      const role = action === 'create-link' ? 'viewer' : safeRole(body.role);
      const inviteEmail = clean(body.email, 320).toLowerCase();
      if (action === 'invite' && (!validEmail(inviteEmail) || inviteEmail === email)) fail('Enter a valid email address different from your own.', 400, 'INVITE_EMAIL_INVALID');
      const token = makeToken();
      const tokenHash = await digest(token);
      const shareId = 'sh_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      const share = {
        id: shareId,
        type: action === 'invite' ? 'invite' : 'link',
        tokenHash,
        email: action === 'invite' ? inviteEmail : null,
        role,
        status: 'active',
        createdByUid: uid,
        createdByEmail: email,
        createdAt: now,
        expiresAt: action === 'create-link' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
      };
      await setFirestoreDocumentAtPath(context.env, [...path, 'shares', shareId], share, { merge: false });
      let emailMessageId = null;
      if (action === 'invite') {
        try { emailMessageId = await sendInvite(context.env, inviteEmail, project, role, token, url.origin, email, pid); }
        catch (error) {
          await deleteFirestoreDocumentAtPath(context.env, [...path, 'shares', shareId]);
          throw error;
        }
      }
      const shareUrl = new URL('/', url.origin);
      shareUrl.searchParams.set('ovyx-share', token);
      shareUrl.searchParams.set('owner', email);
      shareUrl.searchParams.set('projectId', pid);
      await recordActivity(context.env, email, pid, action === 'invite' ? 'invitation_sent' : 'share_link_created', { uid, email, name: user.name || user.displayName });
      return jsonResponse({ ok: true, share: { id: shareId, type: share.type, email: share.email, role, status: share.status, createdAt: now, expiresAt: share.expiresAt }, shareUrl: shareUrl.href, emailMessageId }, 201, { 'X-OVYX-Request-ID': rid });
    }

    const shareId = clean(body.shareId, 120);
    if (!/^(?:sh_[A-Za-z0-9_-]{12,40}|mem_[A-Za-z0-9_-]{20,32})$/.test(shareId)) fail('Choose a valid sharing record.', 400, 'INVALID_SHARE_ID');
    const sharePathValue = [...path, 'shares', shareId];
    const shareDocument = await getFirestoreDocumentAtPath(context.env, sharePathValue);
    const share = shareDocument ? await getFirestoreDataAtPath(context.env, sharePathValue) : null;
    if (!share) fail('Sharing record not found.', 404, 'SHARE_NOT_FOUND');

    if (action === 'revoke') {
      await setFirestoreDocumentAtPath(context.env, sharePathValue, { status: 'revoked', revokedAt: now, revokedByUid: uid }, { merge: true, expectedUpdateTime: shareDocument.updateTime });
      if ((share.type === 'invite' && share.acceptedUid) || (share.type === 'member' && share.targetUid)) {
        const membershipId = 'sp_' + (await digest(email + ':' + pid)).slice(0, 24);
        const memberUid = share.type === 'member' ? share.targetUid : share.acceptedUid;
        await setFirestoreDocumentAtPath(context.env, ['users', clean(memberUid, 256), 'shared_projects', membershipId], { status: 'revoked', revokedAt: now }, { merge: true });
        if (share.type === 'member') await setFirestoreDocumentAtPath(context.env, ['users', clean(share.targetUid, 256), 'share_requests', shareId], { status: 'revoked', respondedAt: now }, { merge: true }).catch(() => {});
      }
      await recordActivity(context.env, email, pid, 'access_revoked', { uid, email, name: user.name || user.displayName });
      return jsonResponse({ ok: true, revoked: true, shareId }, 200, { 'X-OVYX-Request-ID': rid });
    }
    if (action === 'change-role') {
      if (!['invite', 'member'].includes(share.type)) fail('This sharing record does not support editable roles.', 400, 'SHARE_ROLE_NOT_EDITABLE');
      const role = safeRole(body.role);
      await setFirestoreDocumentAtPath(context.env, sharePathValue, { role, updatedAt: now }, { merge: true, expectedUpdateTime: shareDocument.updateTime });
      const acceptedUid = share.type === 'member' ? share.targetUid : share.acceptedUid;
      if (acceptedUid && share.status === 'accepted') {
        const membershipId = 'sp_' + (await digest(email + ':' + pid)).slice(0, 24);
        await setFirestoreDocumentAtPath(context.env, ['users', clean(acceptedUid, 256), 'shared_projects', membershipId], { role, updatedAt: now }, { merge: true });
      }
      if (share.type === 'member') await setFirestoreDocumentAtPath(context.env, ['users', clean(share.targetUid, 256), 'share_requests', shareId], { role, updatedAt: now }, { merge: true }).catch(() => {});
      await recordActivity(context.env, email, pid, 'permission_changed', { uid, email, name: user.name || user.displayName });
      return jsonResponse({ ok: true, updated: true, role, shareId }, 200, { 'X-OVYX-Request-ID': rid });
    }
    fail('Use create-link, invite, send-member-request, accept-invite, accept-member-request, decline-member-request, change-role or revoke.', 400, 'INVALID_SHARING_ACTION');
  } catch (error) {
    return jsonResponse({ ok: false, error: error?.message || 'Project sharing could not be completed.', code: error?.code || 'PROJECT_SHARING_FAILED' }, error?.status || 500, { 'X-OVYX-Request-ID': rid });
  }
}
