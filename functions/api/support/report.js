import { assertAuthenticated } from '../../_lib/firebase.js';
import { setFirestoreDocumentAtPath } from '../../_lib/firebase-admin.js';
import {
  enforceSameOrigin,
  errorResponse,
  jsonResponse,
  readJson,
  requestId,
} from '../_lib/http.js';

const DEFAULT_SUPPORT_EMAIL = 'ovyxsupportteam@gmail.com';
const MAX_SUBJECT = 160;
const MAX_MESSAGE = 6000;
const ALLOWED_CATEGORIES = new Set(['bug', 'account', 'billing', 'feature', 'other']);

function cleanText(value, max, { multiline = false } = {}) {
  const source = String(value ?? '');
  const normalized = multiline
    ? source.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    : source.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return normalized.trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function validEmail(value) {
  const email = String(value || '').trim();
  return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

function validSender(value) {
  const sender = String(value || '').trim();
  if (!sender || sender.length > 180 || /[\r\n\u0000-\u001f]/.test(sender)) return false;
  return /^[^\s<>@]+@[^\s<>@]+$/.test(sender) ||
    /^[^<>]{1,100}<[^\s<>@]+@[^\s<>@]+>$/.test(sender);
}

async function saveReport(env, path, report) {
  await setFirestoreDocumentAtPath(env, path, report, { merge: true });
}

async function sendSupportEmail(env, { report, recipient, sender, replyTo, idempotencyKey }) {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  if (!apiKey || !validSender(sender)) {
    throw Object.assign(new Error('OVYX support email delivery is not configured.'), {
      code: 'SUPPORT_EMAIL_NOT_CONFIGURED',
    });
  }

  const subject = 'OVYX Support: ' + report.subject;
  const text = [
    'A new support report was submitted through OVYX.',
    '',
    'Report ID: ' + report.reportId,
    'Category: ' + report.category,
    'From: ' + (report.userEmail || 'Email unavailable'),
    'Account UID: ' + report.uid,
    'Page: ' + (report.page || 'Not provided'),
    '',
    report.message,
  ].join('\n');

  const html = [
    '<h2>New OVYX support report</h2>',
    '<p><strong>Report ID:</strong> ' + escapeHtml(report.reportId) + '</p>',
    '<p><strong>Category:</strong> ' + escapeHtml(report.category) + '</p>',
    '<p><strong>Account:</strong> ' + escapeHtml(report.userEmail || 'Email unavailable') + '</p>',
    '<p><strong>Page:</strong> ' + escapeHtml(report.page || 'Not provided') + '</p>',
    '<hr>',
    '<div style="white-space:pre-wrap;font:14px/1.6 sans-serif">' + escapeHtml(report.message) + '</div>',
  ].join('');

  const payload = { from: sender, to: [recipient], subject, text, html };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    // Provider response bodies may contain implementation details. Keep them
    // out of the browser response and application logs.
    throw Object.assign(new Error('OVYX could not deliver the support email.'), {
      code: 'SUPPORT_EMAIL_DELIVERY_FAILED',
      status: response.status,
    });
  }

  let result = {};
  try { result = await response.json(); } catch (_) {}
  return String(result?.id || '').slice(0, 160);
}

export async function onRequest(context) {
  const request = context.request;
  const id = requestId(request);

  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'POST is required.', id);
  }
  if (!enforceSameOrigin(request)) {
    return errorResponse(403, 'ORIGIN_REJECTED', 'Cross-origin support requests are not permitted.', id);
  }

  try {
    const user = assertAuthenticated(context.data?.user);
    const body = await readJson(request, 12_000);

    // A filled honeypot is silently accepted without storing or emailing it.
    if (cleanText(body.website, 200)) {
      return jsonResponse({ ok: true, message: 'Your report was received.' }, 202);
    }

    const reportId = cleanText(body.reportId, 80);
    if (!/^[a-zA-Z0-9_-]{12,80}$/.test(reportId)) {
      return errorResponse(400, 'SUPPORT_REPORT_ID_INVALID', 'Please refresh the form and try again.', id);
    }

    const subject = cleanText(body.subject, MAX_SUBJECT);
    const message = cleanText(body.message, MAX_MESSAGE, { multiline: true });
    if (subject.length < 4) {
      return errorResponse(400, 'SUPPORT_SUBJECT_REQUIRED', 'Add a short subject so the team knows what you need.', id);
    }
    if (message.length < 12) {
      return errorResponse(400, 'SUPPORT_MESSAGE_REQUIRED', 'Please describe the issue in a little more detail.', id);
    }

    const uid = cleanText(user.uid || user.sub, 128);
    if (!uid) return errorResponse(401, 'AUTH_REQUIRED', 'Sign in to contact OVYX Support.', id);

    const userEmail = validEmail(user.email) ? String(user.email).trim().toLowerCase() : '';
    const categoryValue = cleanText(body.category, 24).toLowerCase();
    const category = ALLOWED_CATEGORIES.has(categoryValue) ? categoryValue : 'other';
    const page = cleanText(body.page, 120);
    const recipientCandidate = String(context.env?.OVYX_SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL).trim();
    const recipient = validEmail(recipientCandidate) ? recipientCandidate : DEFAULT_SUPPORT_EMAIL;
    const sender = context.env?.OVYX_SUPPORT_FROM_EMAIL || context.env?.RESEND_FROM_EMAIL || '';
    const documentId = (uid + '_' + reportId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 220);
    const path = ['support_reports', documentId];
    const now = new Date().toISOString();
    const report = {
      reportId,
      uid,
      userEmail,
      subject,
      message,
      category,
      page,
      deliveryStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await saveReport(context.env || {}, path, report);

    try {
      const emailId = await sendSupportEmail(context.env || {}, {
        report,
        recipient,
        sender,
        replyTo: userEmail || '',
        idempotencyKey: ('ovyx-support-' + uid + '-' + reportId).slice(0, 240),
      });
      await saveReport(context.env || {}, path, {
        deliveryStatus: 'sent',
        emailId,
        deliveredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      await saveReport(context.env || {}, path, {
        deliveryStatus: 'failed',
        deliveryError: error?.code || 'SUPPORT_EMAIL_DELIVERY_FAILED',
        updatedAt: new Date().toISOString(),
      });
      return errorResponse(
        503,
        error?.code || 'SUPPORT_EMAIL_DELIVERY_FAILED',
        'Your report was saved, but the support email could not be delivered yet. Please try again shortly.',
        id,
      );
    }

    return jsonResponse({
      ok: true,
      reportId,
      message: 'Your report was emailed to OVYX Support.',
    }, 201, { 'X-OVYX-Request-ID': id });
  } catch (error) {
    return errorResponse(
      error?.status || 503,
      error?.code || 'SUPPORT_REPORT_FAILED',
      error?.status === 401
        ? 'Sign in to contact OVYX Support.'
        : 'OVYX could not submit your report right now. Please try again.',
      id,
    );
  }
}
