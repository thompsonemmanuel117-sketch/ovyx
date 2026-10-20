const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';
const MAX_BATCH = 100;
const MAX_SUBJECT = 180;

const clean = (value, max = 4000) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const escapeHtml = value => clean(value, 20000)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function displayNameOf(recipient) {
  const stored = clean(recipient?.displayName, 80);
  if (stored) return stored;
  const local = clean(String(recipient?.email || '').split('@')[0], 80).replace(/[._-]+/g, ' ').trim();
  return local || 'there';
}

function emailMessage(from, broadcast, recipient, logoUrl, origin) {
  const name = displayNameOf(recipient);
  const title = clean(broadcast?.title || 'OVYX Update', MAX_SUBJECT) || 'OVYX Update';
  const body = clean(broadcast?.body || '', 4000);
  const logo = escapeHtml(logoUrl);
  const safeName = escapeHtml(name);
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  let target = origin;
  try {
    const candidate = new URL(String(broadcast?.link || '/'), origin);
    if (candidate.protocol === 'https:' || candidate.protocol === 'http:') target = candidate.href;
  } catch (_) {}
  const safeTarget = escapeHtml(target);
  const html = [
    '<div style="margin:0;background:#f4f6fb;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#111827">',
    '<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden">',
    '<div style="padding:22px 26px;background:#0b1020;border-bottom:3px solid #d8b46a">',
    '<img src="', logo, '" alt="OVYX" width="112" style="display:block;width:112px;max-width:100%;height:auto">',
    '</div><div style="padding:28px 26px">',
    '<p style="margin:0 0 10px;color:#b28b42;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">A message from OVYX</p>',
    '<h1 style="font-size:25px;line-height:1.25;margin:0 0 20px;color:#111827">', safeTitle, '</h1>',
    '<p style="font-size:16px;line-height:1.6;margin:0 0 14px">Hello ', safeName, ',</p>',
    '<div style="font-size:15px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;color:#374151">', safeBody, '</div>',
    '<p style="margin:26px 0 0"><a href="', safeTarget, '" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#101828;color:#fff;text-decoration:none;font-weight:700">Open OVYX</a></p>',
    '<p style="font-size:12px;line-height:1.6;color:#6b7280;margin:26px 0 0">You received this update because you have an OVYX account and your email update preferences allow it. You can review preferences in your account settings.</p>',
    '</div></div><p style="max-width:600px;margin:14px auto 0;text-align:center;color:#9ca3af;font-size:11px">OVYX · Build something meaningful.</p></div>'
  ].join('');
  const text = [
    'OVYX — ' + title,
    '',
    'Hello ' + name + ',',
    '',
    body,
    '',
    'Open OVYX: ' + target,
    '',
    'You received this update because you have an OVYX account and your email update preferences allow it.'
  ].join('\n');
  return { from, to: [String(recipient.email)], subject: 'OVYX · ' + title, html, text, tags: [{ name: 'source', value: 'ovyx-broadcast' }, { name: 'broadcast', value: String(broadcast.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) }] };
}

export async function sendBroadcastEmails(env, { broadcast, recipients = [], logoUrl, origin } = {}) {
  const apiKey = String(env?.RESEND_API_KEY || '').trim();
  const from = String(env?.RESEND_BROADCAST_FROM_EMAIL || env?.RESEND_FROM_EMAIL || '').trim();
  if (!apiKey || !from) {
    return { configured: false, attemptedCount: 0, providerAcceptedCount: 0, failedCount: 0, skippedCount: recipients.length, reason: 'Email delivery is not configured. Set RESEND_API_KEY and RESEND_BROADCAST_FROM_EMAIL (or RESEND_FROM_EMAIL) in Cloudflare Pages.' };
  }
  const unique = new Map();
  for (const recipient of recipients) {
    const email = clean(recipient?.email, 320).toLowerCase();
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !unique.has(email)) unique.set(email, { ...recipient, email });
  }
  const list = [...unique.values()];
  const result = { configured: true, attemptedCount: list.length, providerAcceptedCount: 0, failedCount: 0, skippedCount: Math.max(0, recipients.length - list.length), batchCount: 0, failedBatches: [] };
  for (let offset = 0; offset < list.length; offset += MAX_BATCH) {
    const batch = list.slice(offset, offset + MAX_BATCH);
    const messages = batch.map(recipient => emailMessage(from, broadcast, recipient, logoUrl, origin));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(RESEND_BATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'ovyx-broadcast/' + String(broadcast?.id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100) + '/' + Math.floor(offset / MAX_BATCH)
        },
        body: JSON.stringify(messages),
        signal: controller.signal
      });
      const provider = await response.json().catch(() => ({}));
      result.batchCount += 1;
      if (response.ok) {
        const items = Array.isArray(provider?.data) ? provider.data : null;
        const accepted = items ? items.filter(item => item && !item.error && (item.id || item.messageId || item.success === true)).length : batch.length;
        result.providerAcceptedCount += items ? accepted : batch.length;
        result.failedCount += items ? Math.max(0, batch.length - accepted) : 0;
        if (items && accepted < batch.length) result.failedBatches.push({ batch: Math.floor(offset / MAX_BATCH) + 1, reason: 'The provider returned fewer accepted messages than requested.' });
      } else {
        result.failedCount += batch.length;
        result.failedBatches.push({ batch: Math.floor(offset / MAX_BATCH) + 1, status: response.status, reason: clean(provider?.message || provider?.error || 'Email provider rejected this batch.', 220) });
      }
    } catch (error) {
      result.batchCount += 1;
      result.failedCount += batch.length;
      result.failedBatches.push({ batch: Math.floor(offset / MAX_BATCH) + 1, reason: error?.name === 'AbortError' ? 'Email provider timed out.' : 'Email provider could not be reached.' });
    } finally {
      clearTimeout(timer);
    }
  }
  result.skipped = list.length === 0;
  result.scope = 'provider-accepted-not-inbox-confirmed';
  return result;
}
