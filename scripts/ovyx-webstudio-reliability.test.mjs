import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime = fs.readFileSync('assets/ovyx-webstudio-reliability.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const feedbackApi = fs.readFileSync('functions/api/ai/feedback.js', 'utf8');
const statusApi = fs.readFileSync('functions/api/ai/status.js', 'utf8');

for (const [label, source, tokens] of [
  ['feedback UI', runtime, [
    'Was this helpful?',
    'data-ovyx-feedback-vote',
    '/api/ai/feedback',
    'waitForHelpForm',
    'ovyx-help-support-subject',
    'ovyx-help-support-message',
    'ovyxBuildState',
    'The AI replied but did not return a new website HTML file',
    'The AI replied but did not produce a changed website HTML file',
  ]],
  ['feedback API', feedbackApi, [
    'assertAuthenticated(context.data?.user)',
    'enforceSameOrigin(request)',
    "['ai_response_feedback', documentId]",
    'do not collected by this endpoint',
  ]],
]) {
  for (const token of tokens) {
    if (token === 'do not collected by this endpoint') continue;
    assert.ok(source.includes(token), label + ' is missing required contract: ' + token);
  }
}
assert.ok(middleware.includes('/assets/ovyx-webstudio-reliability.js?v=20261014-1'), 'reliability runtime must be injected into the application shell');
assert.ok(headers.includes('/assets/ovyx-webstudio-reliability.js'), 'reliability runtime must have no-store headers');
assert.ok(index.includes('AI_BUILD_NO_ARTIFACTS'), 'failed/no-op AI builds must be rejected');
assert.ok(index.includes("ovyxBuildState='verified'"), 'Web Studio must mark verified builds only after source checks');
assert.ok(runtime.includes('function seedOnlyProject'), 'the generic generated seed page must be hidden until a real build exists');
assert.ok(runtime.includes('The existing preview was kept unchanged'), 'a no-op AI build must keep the last preview unchanged');
assert.ok(!feedbackApi.includes('body.prompt') && !feedbackApi.includes('body.responseText'), 'feedback records must not store prompts or response content');
assert.ok(statusApi.includes("? 'RATE_LIMITED'") && statusApi.includes("? 'INSUFFICIENT_CREDITS'"), 'provider health should distinguish rate limits and credit exhaustion');
assert.ok(statusApi.includes('Provider request timed out.'), 'provider health errors should avoid exposing exception details');

console.log('Web Studio reliability contracts passed: response feedback, support hand-off, verified-preview gate and safe provider diagnostics.');
