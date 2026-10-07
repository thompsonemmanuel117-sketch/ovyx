import { authenticateRequest } from '../_lib/firebase.js';
import {
  setFirestoreDocumentAtPath,
} from './_lib/firebase-admin.js';
import {
  enforceSameOrigin,
  errorResponse,
  jsonResponse,
  readJson,
  requestId,
} from './_lib/http.js';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  bytesToBase64,
  cleanText,
  normalizeFilename,
} from './_lib/support-mailer.js';
import { sendSupportEmail } from './_lib/support-mailer.js';

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 3;

const recentSubmissions = new Map();

const ATTACHMENT_TYPES = Object.freeze({
  'application/json': {
    extensions: ['json'],
  },
  'application/pdf': {
    extensions: ['pdf'],
    signature: [0x25, 0x50, 0x44, 0x46],
  },
  'image/jpeg': {
    extensions: ['jpg', 'jpeg'],
    signature: [0xff, 0xd8, 0xff],
  },
  'image/png': {
    extensions: ['png'],
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  'image/webp': {
    extensions: ['webp'],
    signature: [0x52, 0x49, 0x46, 0x46],
  },
  'text/csv': {
    extensions: ['csv'],
  },
  'text/plain': {
    extensions: ['txt', 'log', 'md'],
  },
});

const MIME_BY_EXTENSION = new Map(
  Object.entries(ATTACHMENT_TYPES).flatMap(([mime, rule]) =>
    rule.extensions.map(extension => [extension, mime])
  )
);

function rateLimitKey(uid) {
  return String(uid || '').slice(0, 256);
}

function allowSubmission(uid) {
  const now = Date.now();
  const key = rateLimitKey(uid);
  const current = recentSubmissions.get(key) || [];

  const active = current.filter(
    timestamp => now - timestamp < RATE_WINDOW_MS
  );

  if (active.length >= RATE_LIMIT) {
    recentSubmissions.set(key, active);

    throw Object.assign(
      new Error('Please wait before sending another support request.'),
      {
        status: 429,
        code: 'SUPPORT_RATE_LIMITED',
      }
    );
  }

  active.push(now);
  recentSubmissions.set(key, active);

  if (recentSubmissions.size > 5000) {
    for (const [entryKey, timestamps] of recentSubmissions) {
      if (
        timestamps.every(
          timestamp => now - timestamp >= RATE_WINDOW_MS
        )
      ) {
        recentSubmissions.delete(entryKey);
      }
    }
  }
}

function extensionOf(filename) {
  const value = String(filename || '').toLowerCase();
  const index = value.lastIndexOf('.');
  return index >= 0 ? value.slice(index + 1) : '';
}

function inferMime(filename) {
  return MIME_BY_EXTENSION.get(extensionOf(filename)) || '';
}

function signatureMatches(bytes, signature) {
  if (!signature) return true;
  if (bytes.length < signature.length) return false;

  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return false;
  }

  return true;
}

function getFormString(form, name, maxLength) {
  const value = form.get(name);
  return cleanText(
    typeof value === 'string' ? value : '',
    maxLength
  );
}

function looksLikeFile(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    typeof value.arrayBuffer === 'function' &&
    typeof value.size === 'number'
  );
}

async function parseSubmission(request) {
  const contentLength = Number(
    request.headers.get('content-length') || 0
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_REQUEST_BYTES
  ) {
    throw Object.assign(
      new Error('Support request is too large.'),
      {
        status: 413,
        code: 'SUPPORT_BODY_TOO_LARGE',
      }
    );
  }

  const contentType = String(
    request.headers.get('content-type') || ''
  ).toLowerCase();

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const form = await request.formData();

    const fields = {
      subject: getFormString(form, 'subject', MAX_SUBJECT_LENGTH),
      message: getFormString(form, 'message', MAX_BODY_LENGTH),
      projectId: getFormString(form, 'projectId', 120),
      route: getFormString(form, 'route', 120),
      website: getFormString(form, 'website', 120),
    };

    if (fields.website) {
      throw Object.assign(
        new Error('Support request rejected.'),
        {
          status: 400,
          code: 'SUPPORT_REQUEST_REJECTED',
        }
      );
    }

    const attachments = [];

    for (const [fieldName, value] of form.entries()) {
      if (!looksLikeFile(value)) continue;

      if (
        !['attachment', 'attachments', 'file', 'files'].includes(
          String(fieldName || '').toLowerCase()
        ) &&
        !String(fieldName || '').toLowerCase().includes('attach')
      ) {
        continue;
      }

      attachments.push(value);
    }

    return {
      ...fields,
      attachments,
    };
  }

  const body = await readJson(request, MAX_REQUEST_BYTES);

  return {
    subject: cleanText(body.subject, MAX_SUBJECT_LENGTH),
    message: cleanText(body.message, MAX_BODY_LENGTH),
    projectId: cleanText(body.projectId, 120),
    route: cleanText(body.route, 120),
    website: cleanText(body.website, 120),
    attachments: [],
  };
}

async function prepareAttachments(files) {
  if (files.length > MAX_ATTACHMENTS) {
    throw Object.assign(
      new Error(`A support request can include at most ${MAX_ATTACHMENTS} attachments.`),
      {
        status: 400,
        code: 'SUPPORT_ATTACHMENT_COUNT_LIMIT',
      }
    );
  }

  const prepared = [];
  let totalBytes = 0;

  for (const file of files) {
    const originalName = normalizeFilename(file.name);
    const inferredMime = inferMime(originalName);
    const declaredMime = String(file.type || '').toLowerCase();
    const contentType =
      ATTACHMENT_TYPES[declaredMime]
        ? declaredMime
        : inferredMime;

    if (
      !contentType ||
      !ATTACHMENT_TYPES[contentType]
    ) {
      throw Object.assign(
        new Error(
          `Attachment "${originalName}" uses a file type that OVYX support does not accept.`
        ),
        {
          status: 415,
          code: 'SUPPORT_ATTACHMENT_TYPE_NOT_ALLOWED',
        }
      );
    }

    if (
      declaredMime &&
      ATTACHMENT_TYPES[declaredMime] &&
      inferredMime &&
      declaredMime !== inferredMime
    ) {
      throw Object.assign(
        new Error(
          `Attachment "${originalName}" does not match its declared file type.`
        ),
        {
          status: 415,
          code: 'SUPPORT_ATTACHMENT_TYPE_MISMATCH',
        }
      );
    }

    const sizeBytes = Number(file.size || 0);

    if (
      !Number.isFinite(sizeBytes) ||
      sizeBytes <= 0 ||
      sizeBytes > MAX_ATTACHMENT_BYTES
    ) {
      throw Object.assign(
        new Error(
          `Attachment "${originalName}" must be between 1 byte and 5 MB.`
        ),
        {
          status: 413,
          code: 'SUPPORT_ATTACHMENT_SIZE_LIMIT',
        }
      );
    }

    totalBytes += sizeBytes;

    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw Object.assign(
        new Error('Combined support attachments are too large.'),
        {
          status: 413,
          code: 'SUPPORT_ATTACHMENT_TOTAL_LIMIT',
        }
      );
    }

    const bytes = new Uint8Array(
      await file.arrayBuffer()
    );
    const signature =
      ATTACHMENT_TYPES[contentType].signature;

    if (!signatureMatches(bytes, signature)) {
      throw Object.assign(
        new Error(
          `Attachment "${originalName}" failed its file signature check.`
        ),
        {
          status: 415,
          code: 'SUPPORT_ATTACHMENT_SIGNATURE_INVALID',
        }
      );
    }

    prepared.push({
      filename: originalName,
      contentType,
      sizeBytes,
      base64: bytesToBase64(bytes),
    });
  }

  return prepared;
}

export async function onRequest(context) {
  const request = context.request;
  const rid = requestId(request);

  if (request.method.toUpperCase() !== 'POST') {
    return errorResponse(
      405,
      'METHOD_NOT_ALLOWED',
      'POST is required.',
      rid
    );
  }

  if (!enforceSameOrigin(request)) {
    return errorResponse(
      403,
      'ORIGIN_REJECTED',
      'Cross-origin support requests are not permitted.',
      rid
    );
  }

  try {
    const user =
      context.data?.user ||
      await authenticateRequest(request, context.env);

    if (!user?.uid) {
      return errorResponse(
        401,
        'AUTH_REQUIRED',
        'A verified OVYX account is required.',
        rid
      );
    }

    allowSubmission(user.uid);

    const submission = await parseSubmission(request);

    if (!submission.subject || !submission.message) {
      return errorResponse(
        400,
        'SUPPORT_FIELDS_REQUIRED',
        'Subject and message are required.',
        rid
      );
    }

    const contactEmail =
      String(user.email || '').trim().toLowerCase();

    if (
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)
    ) {
      return errorResponse(
        400,
        'SUPPORT_ACCOUNT_EMAIL_INVALID',
        'Your verified account email could not be used for support.',
        rid
      );
    }

    const userName =
      cleanText(
        user.displayName ||
        user.name ||
        'OVYX User',
        160
      ) || 'OVYX User';

    const preparedAttachments =
      await prepareAttachments(
        submission.attachments
      );

    const ticketId =
      'OVYX-' +
      crypto.randomUUID()
        .replace(/-/g, '')
        .slice(0, 12)
        .toUpperCase();

    const now = new Date().toISOString();

    const ticket = {
      ticketId,
      uid: String(user.uid),
      email: contactEmail,
      userName,
      subject: submission.subject,
      message: submission.message,
      projectId: submission.projectId,
      route: submission.route,
      attachments: preparedAttachments.map(
        item => ({
          filename: item.filename,
          contentType: item.contentType,
          sizeBytes: item.sizeBytes,
        })
      ),
      attachmentCount: preparedAttachments.length,
      status: 'open',
      priority: 'normal',
      notificationStatus: 'pending',
      notificationProvider: 'resend',
      createdAt: now,
      updatedAt: now,
    };

    await setFirestoreDocumentAtPath(
      context.env,
      ['support_tickets', ticketId],
      ticket,
      { merge: false }
    );

    let notificationStatus = 'failed';
    let notificationMessageId = null;

    try {
      const mailResult =
        await sendSupportEmail(
          context.env,
          {
            ticketId,
            subject: submission.subject,
            message: submission.message,
            userName,
            contactEmail,
            projectId: submission.projectId,
            route: submission.route,
            attachments: preparedAttachments,
          }
        );

      notificationStatus =
        mailResult.sent ? 'sent' : 'failed';
      notificationMessageId =
        mailResult.messageId || null;
    } catch (mailError) {
      console.error(
        '[OVYX SUPPORT MAIL DELIVERY]',
        mailError?.code || 'SUPPORT_MAIL_FAILED'
      );
    }

    await setFirestoreDocumentAtPath(
      context.env,
      ['support_tickets', ticketId],
      {
        notificationStatus,
        notificationMessageId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return jsonResponse(
      {
        ok: true,
        ticket: {
          ticketId,
          status: 'open',
          createdAt: now,
          notificationStatus,
          attachmentCount: preparedAttachments.length,
        },
        message:
          'Your support request has been saved for the OVYX support team.',
      },
      201,
      {
        'X-OVYX-Request-ID': rid,
      }
    );
  } catch (error) {
    const status =
      Number.isInteger(error?.status)
        ? error.status
        : 500;

    return errorResponse(
      status,
      error?.code || 'SUPPORT_FAILED',
      error?.message || 'Support request failed.',
      rid
    );
  }
}
