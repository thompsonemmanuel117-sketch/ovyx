const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

const DEFAULT_SUPPORT_RECIPIENT = 'ovyxsupportteam@gmail.com';
const MAX_TO_RECIPIENTS = 5;
const MAX_SUBJECT_LENGTH = 180;
const MAX_BODY_LENGTH = 5000;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function cleanText(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function cleanEmail(value) {
  return cleanText(value, 320).toLowerCase();
}

function escapeHtml(value) {
  return cleanText(value, 20_000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSubject(value) {
  return cleanText(value, MAX_SUBJECT_LENGTH)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRecipients(value) {
  const raw = String(value || DEFAULT_SUPPORT_RECIPIENT)
    .split(',')
    .map(cleanEmail)
    .filter(Boolean);

  const unique = [...new Set(raw)].slice(0, MAX_TO_RECIPIENTS);

  if (
    unique.length === 0 ||
    unique.some(email => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
  ) {
    throw Object.assign(
      new Error('Support mail recipient configuration is invalid.'),
      {
        status: 500,
        code: 'SUPPORT_MAIL_CONFIGURATION_ERROR'
      }
    );
  }

  return unique;
}

function normalizeFilename(value) {
  const filename =
    String(value || 'attachment')
      .replace(/[\\/]/g, '_')
      .replace(/[^A-Za-z0-9._ -]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);

  return filename || 'attachment';
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, Math.min(index + chunkSize, bytes.length))
    );
  }

  return btoa(binary);
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

function htmlList(items) {
  if (!items.length) {
    return '<p>No attachments.</p>';
  }

  return (
    '<ul>' +
    items
      .map(
        item =>
          `<li>${escapeHtml(item.filename)} — ${escapeHtml(
            item.contentType
          )} — ${item.sizeBytes} bytes</li>`
      )
      .join('') +
    '</ul>'
  );
}

export async function sendSupportEmail(
  env,
  {
    ticketId,
    subject,
    message,
    userName,
    contactEmail,
    projectId,
    route,
    attachments = []
  }
) {
  const apiKey = String(env?.RESEND_API_KEY || '').trim();
  const from = String(env?.RESEND_FROM_EMAIL || '').trim();
  const to = parseRecipients(env?.RESEND_SUPPORT_TO_EMAIL);

  if (!apiKey || !from) {
    throw Object.assign(
      new Error(
        'Support mail delivery is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL in Cloudflare Pages environment settings.'
      ),
      {
        status: 503,
        code: 'SUPPORT_MAIL_NOT_CONFIGURED'
      }
    );
  }

  if (!ticketId) {
    throw Object.assign(
      new Error('Support ticket ID is required for email delivery.'),
      {
        status: 400,
        code: 'SUPPORT_MAIL_TICKET_REQUIRED'
      }
    );
  }

  const safeSubject =
    normalizeSubject(subject) || 'OVYX Support Request';
  const safeMessage = cleanText(message, MAX_BODY_LENGTH);
  const safeName = cleanText(userName, 160) || 'OVYX user';
  const safeEmail = cleanEmail(contactEmail);
  const safeProject = cleanText(projectId, 120);
  const safeRoute = cleanText(route, 120);

  const payload = {
    from,
    to,
    reply_to: safeEmail,
    subject: `[${ticketId}] ${safeSubject}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111">
        <h2 style="margin:0 0 16px">OVYX Support Ticket</h2>
        <p><strong>Ticket:</strong> ${escapeHtml(ticketId)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(safeSubject)}</p>
        <p><strong>User:</strong> ${escapeHtml(safeName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(safeEmail)}</p>
        <p><strong>Project:</strong> ${escapeHtml(safeProject || 'Not specified')}</p>
        <p><strong>Route:</strong> ${escapeHtml(safeRoute || 'Not specified')}</p>
        <p><strong>Message:</strong></p>
        <div style="white-space:pre-wrap;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa">${escapeHtml(
          safeMessage
        )}</div>
        <p><strong>Attachments:</strong></p>
        ${htmlList(attachments)}
      </div>
    `,
    text:
      [
        'OVYX Support Ticket',
        `Ticket: ${ticketId}`,
        `Subject: ${safeSubject}`,
        `User: ${safeName}`,
        `Email: ${safeEmail}`,
        `Project: ${safeProject || 'Not specified'}`,
        `Route: ${safeRoute || 'Not specified'}`,
        '',
        safeMessage,
        '',
        'Attachments:',
        ...attachments.map(
          item =>
            `- ${item.filename} (${item.contentType}, ${item.sizeBytes} bytes)`
        )
      ].join('\n'),
    tags: [
      { name: 'source', value: 'ovyx-support' },
      { name: 'ticket', value: String(ticketId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) }
    ],
    attachments: attachments.map(item => ({
      filename: item.filename,
      content: item.base64,
      content_type: item.contentType
    }))
  };

  let response;

  try {
    response = await fetch(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `ovyx-support/${String(ticketId).replace(
          /[^A-Za-z0-9_-]/g,
          ''
        )}`
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw Object.assign(
      new Error('Support mail provider could not be reached.'),
      {
        status: 503,
        code: 'SUPPORT_MAIL_PROVIDER_UNAVAILABLE'
      }
    );
  }

  const providerBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    const providerMessage =
      cleanText(
        providerBody?.message ||
          providerBody?.error ||
          providerBody?.name ||
          '',
        240
      );

    console.error(
      '[OVYX SUPPORT MAIL]',
      response.status,
      providerMessage || 'provider request failed'
    );

    throw Object.assign(
      new Error('Support email could not be delivered.'),
      {
        status: response.status === 429 ? 503 : 502,
        code: 'SUPPORT_MAIL_PROVIDER_FAILED'
      }
    );
  }

  return {
    sent: true,
    provider: 'resend',
    messageId: cleanText(providerBody?.id, 200) || null
  };
}

export {
  MAX_ATTACHMENT_BYTES,
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  cleanText,
  normalizeFilename,
  bytesToBase64,
  fileToBase64,
  escapeHtml
};
