import assert from 'node:assert/strict';
import fs from 'node:fs';

const assistant = fs.readFileSync('assets/ovyx-assistant-workspace.js', 'utf8');
const feedbackApi = fs.readFileSync('functions/api/ai/feedback.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');
const providerRouter = fs.readFileSync('functions/_lib/providers.js', 'utf8');
const health = fs.readFileSync('functions/api/health.js', 'utf8');
const publicServiceStatus = fs.readFileSync('functions/api/service-status.js', 'utf8');

for (const token of [
  'data-ovyx-native-response-action',
  "['not-helpful', 'Not helpful']",
  "['helpful', 'Helpful']",
  "['copy', 'Copy']",
  "['retry', 'Retry']",
  'ovyxNativeRetryPrompt',
  "/api/ai/feedback",
  "route: 'assistant-workspace'",
  "window.Router.go('faq')",
  "ovyx-help-support-subject",
  "ovyx-help-support-message",
]) {
  assert.ok(assistant.includes(token), 'Native assistant responses are missing expected affordance: ' + token);
}
assert.ok(feedbackApi.includes("route !== 'web-studio' && route !== 'assistant-workspace'"), 'feedback API must allow only supported surfaces');
assert.ok(feedbackApi.includes('route,'), 'feedback record must retain the validated surface');
assert.ok(feedbackApi.includes("'native-ovyx-ai'"), 'feedback provider allowlist must accept the native assistant');
assert.ok(!feedbackApi.includes('body.prompt') && !feedbackApi.includes('body.responseText'), 'feedback metadata must not persist private prompt/response content');
assert.ok(middleware.includes('/assets/ovyx-additional-ai-provider-diagnostics.js?v=20261014-1'), 'extended diagnostics asset must be injected');
assert.ok(headers.includes('/assets/ovyx-additional-ai-provider-diagnostics.js'), 'extended diagnostics asset must be served with explicit cache controls');
assert.ok(providerRouter.includes('OPENROUTER_API_KEY'), 'OpenRouter must use its existing server environment key');
assert.ok(providerRouter.includes("'https://openrouter.ai/api/v1/chat/completions'"), 'OpenRouter must use the fixed official API origin');
assert.ok(providerRouter.includes("provider: 'openrouter'"), 'OpenRouter routing must identify the actual provider');
assert.ok(health.includes("'OPENROUTER_API_KEY'"), 'health diagnostics must report only OpenRouter key presence');
assert.ok(health.includes("'OPENROUTER_MODEL'"), 'health diagnostics must include OpenRouter model configuration name');
assert.ok(!/id:\s*'openrouter'/.test(publicServiceStatus), 'OpenRouter live/key-presence details must remain in the owner-only AI status route, not the legacy public status endpoint');

console.log('Native assistant response-action contracts passed: helpful/not-helpful, editable Support hand-off, copy/retry, private metadata, and OpenRouter key recognition.');
