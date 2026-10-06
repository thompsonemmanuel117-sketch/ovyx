import { authenticateRequest } from '../_lib/firebase.js';
import {
  setFirestoreDocumentAtPath,
  getFirestoreDataAtPath,
} from './_lib/firebase-admin.js';
import { readJson, jsonResponse, requestId } from './_lib/http.js';

const MAX_BYTES = 32_000;
const clean = (v, max=500) => String(v ?? '').trim().slice(0, max);
const email = v => clean(v, 320).toLowerCase();
const safeId = v => String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);

export async function onRequest(context) {
  const rid = requestId(context.request);
  try {
    const user = await authenticateRequest(context.request, context.env);
    if (!user?.uid) return jsonResponse({ok:false,error:'Authentication required.',code:'AUTH_REQUIRED'},401,{'X-OVYX-Request-ID':rid});
    if (context.request.method.toUpperCase() !== 'POST') {
      return jsonResponse({ok:false,error:'POST is required.',code:'METHOD_NOT_ALLOWED'},405,{'X-OVYX-Request-ID':rid});
    }
    const body = await readJson(context.request, MAX_BYTES);
    const subject = clean(body.subject, 180);
    const message = clean(body.message, 5000);
    const contactEmail = email(body.contactEmail || user.email);
    const userName = clean(body.userName || user.name || user.displayName, 160);
    if (!subject || !message) {
      return jsonResponse({ok:false,error:'Subject and message are required.',code:'SUPPORT_FIELDS_REQUIRED'},400,{'X-OVYX-Request-ID':rid});
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      return jsonResponse({ok:false,error:'A valid contact email is required.',code:'SUPPORT_EMAIL_INVALID'},400,{'X-OVYX-Request-ID':rid});
    }
    const ticketId = 'OVYX-' + crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase();
    const now = new Date().toISOString();
    const ticket = {
      ticketId, uid:String(user.uid), email:contactEmail, userName,
      subject, message,
      projectId:clean(body.projectId,120),
      route:clean(body.route,80),
      status:'open',
      priority:'normal',
      createdAt:now, updatedAt:now
    };
    await setFirestoreDocumentAtPath(context.env,['support_tickets',ticketId],ticket,{merge:false});
    return jsonResponse({ok:true,ticket:{ticketId,status:'open',createdAt:now},message:'Your support request has been received.'},201,{'X-OVYX-Request-ID':rid});
  } catch (error) {
    return jsonResponse({ok:false,error:error?.message||'Support request failed.',code:error?.code||'SUPPORT_FAILED'},error?.status||500,{'X-OVYX-Request-ID':rid});
  }
}