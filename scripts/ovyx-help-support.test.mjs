import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('functions/api/support/report.js', 'utf8');
const client = fs.readFileSync('assets/ovyx-help-support.js', 'utf8');
const assistant = fs.readFileSync('assets/ovyx-assistant-workspace.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const knowledge = fs.readFileSync('functions/_lib/ovyx-project-knowledge.js', 'utf8');
const nativeAi = fs.readFileSync('functions/_lib/ovyx-native-ai.js', 'utf8');

for (const token of [
  'assertAuthenticated',
  'enforceSameOrigin',
  'readJson(request, 12_000)',
  "['support_reports', documentId]",
  "context.env?.OVYX_SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL",
  'ovyxsupportteam@gmail.com',
  "'OVYX Support <onboarding@resend.dev>'",
  "fetch('https://api.resend.com/emails'",
  "'Idempotency-Key': idempotencyKey",
  "deliveryStatus: 'pending'",
  "deliveryStatus: 'sent'",
  "deliveryStatus: 'failed'",
  "SUPPORT_EMAIL_NOT_CONFIGURED",
  "escapeHtml(report.message)",
]) {
  assert.ok(route.includes(token), 'Support endpoint is missing: ' + token);
}
assert.ok(client.includes("'/api/support/report'"), 'Support form must submit to the authenticated server endpoint.');
assert.ok(client.includes("getIdToken()"), 'Support submission must use the signed-in Firebase token.');
assert.ok(client.includes('stopImmediatePropagation()'), 'Support submission must prevent legacy duplicate form handlers.');
assert.ok(client.includes('ovyxSupportReportId'), 'Support retry must preserve its idempotency key.');
assert.ok(client.includes('ovyxSupportPayloadSignature'), 'A retry key must only be reused when the report payload is unchanged.');
assert.ok(!client.includes('new MutationObserver'), 'The Help runtime must not observe the entire OVYX application DOM.');
assert.ok(assistant.includes("window.Router.go('faq')"), 'AI feedback must continue to hand off to the dedicated Help/Support page.');
assert.ok(middleware.includes('/assets/ovyx-help-support.js?v=20261118-1'), 'The support submission runtime must be loaded by the app shell.');
assert.ok(knowledge.includes("id: 'help-support'"), 'The OVYX platform knowledge catalog must include Help and Support.');
assert.ok(nativeAi.includes('OVYX HELP BEHAVIOR:'), 'Native OVYX AI must have explicit Help Centre answer rules.');

console.log('OVYX Help Centre support-email contracts passed: authenticated submission, persisted reports, Resend idempotency, safe failure states, AI handoff and knowledge coverage.');
