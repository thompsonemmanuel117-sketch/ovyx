import assert from 'node:assert/strict';
import fs from 'node:fs';

const client = fs.readFileSync('assets/ovyx-help-support.js', 'utf8');
const assistant = fs.readFileSync('assets/ovyx-assistant-workspace.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const supportRoute = fs.readFileSync('functions/api/support.js', 'utf8');
const mailer = fs.readFileSync('functions/api/_lib/support-mailer.js', 'utf8');
const knowledge = fs.readFileSync('functions/_lib/ovyx-project-knowledge.js', 'utf8');
const nativeAi = fs.readFileSync('functions/_lib/ovyx-native-ai.js', 'utf8');
const docs = fs.readFileSync('docs/OVYX-HELP-CENTRE-SUPPORT.md', 'utf8');

for (const token of [
  "authenticateRequest(request, context.env)",
  "enforceSameOrigin(request)",
  "['support_tickets', ticketId]",
  'allowSubmission(user.uid)',
  'prepareAttachments(',
  'MAX_ATTACHMENTS = 3',
  'MAX_TOTAL_ATTACHMENT_BYTES = 6 * 1024 * 1024',
  'sendSupportEmail(',
  "notificationStatus =\n        mailResult.sent ? 'sent' : 'failed'",
]) {
  assert.ok(supportRoute.includes(token), 'Existing support endpoint is missing: ' + token);
}
assert.ok(mailer.includes('env?.OVYX_SUPPORT_EMAIL || env?.RESEND_SUPPORT_TO_EMAIL'), 'Support inbox must support the OVYX override and existing compatibility variable.');
assert.ok(mailer.includes('DEFAULT_SUPPORT_RECIPIENT = \'ovyxsupportteam@gmail.com\''), 'Support email must have the established OVYX inbox as its default recipient.');
assert.ok(mailer.includes('env?.RESEND_API_KEY'), 'Resend credentials must remain server-side.');
assert.ok(mailer.includes('env?.RESEND_FROM_EMAIL'), 'Email sender must use the configured verified Resend sender.');
assert.ok(mailer.includes('Idempotency-Key'), 'Support email delivery must be idempotent per ticket.');
assert.ok(client.includes("fetch('/api/support'"), 'Support form must use the existing support ticket endpoint.');
assert.ok(client.includes('new FormData()'), 'Support submission must preserve multipart attachments.');
assert.ok(client.includes("body.append('attachments'"), 'Selected attachments must be submitted to the existing support endpoint.');
assert.ok(client.includes("result.ticket.notificationStatus === 'sent'"), 'The UI must only claim email delivery after server confirmation.');
assert.ok(client.includes('view-support'), 'Contact Support must have its own routed page.');
assert.ok(client.includes("router.go('support')") || client.includes("go?.('support')"), 'The Help Centre must navigate to the standalone support page.');
assert.ok(client.includes('appendChild(card)'), 'The existing support form must be moved, not duplicated or discarded.');
assert.ok(client.includes('ovyx-help-centre-intro'), 'The Help Centre must clearly identify the single OVYX AI entry point.');
assert.ok(client.includes('WorkspaceBrainBot.open'), 'The Help Centre must reuse the existing OVYX AI assistant.');
assert.ok(assistant.includes("window.Router.go('support')"), 'AI feedback must hand off to the dedicated Contact Support page.');
assert.ok(assistant.includes("'faq','support','inbox'"), 'OVYX AI navigation actions must allow the standalone support route.');
assert.ok(middleware.includes('/assets/ovyx-help-support.js?v=20261118-2'), 'The standalone support runtime must be loaded by the app shell.');
assert.ok(knowledge.includes("id: 'help-support'"), 'OVYX AI knowledge must include Help and Support.');
for (const id of ['projects-and-workspaces', 'publishing-and-sites', 'connections-and-inbox', 'settings-account-billing']) {
  assert.ok(knowledge.includes("id: '" + id + "'"), 'OVYX AI knowledge is missing platform topic: ' + id);
}
assert.ok(nativeAi.includes('OVYX HELP BEHAVIOR:'), 'Native OVYX AI must have explicit Help Centre answer rules.');
assert.ok(nativeAi.includes('Contact Support is a separate page'), 'OVYX AI must describe the separate human support destination.');
assert.ok(docs.includes('POST /api/support'), 'Operations documentation must name the existing support endpoint.');
assert.ok(docs.includes('RESEND_API_KEY') && docs.includes('RESEND_FROM_EMAIL'), 'Operations documentation must describe required email configuration.');
assert.ok(docs.includes('OVYX_SUPPORT_EMAIL'), 'Operations documentation must describe the support inbox override.');
assert.equal(fs.existsSync('functions/api/support/report.js'), false, 'The duplicate report endpoint must not remain beside the existing support ticket route.');

console.log('OVYX Help Centre contracts passed: one native AI, standalone support page, preserved attachments, existing ticket queue, verified email delivery states and expanded product knowledge.');
