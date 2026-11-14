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
assert.ok(middleware.includes('/assets/ovyx-additional-ai-provider-diagnostics.js'), 'the Cloudflare AI diagnostics asset must be injected');
assert.ok(headers.includes('/assets/ovyx-additional-ai-provider-diagnostics.js'), 'the Cloudflare AI diagnostics asset must be served with explicit cache controls');
assert.ok(providerRouter.includes('OVYX_CLOUDFLARE_ONLY_PROVIDER'), 'the single model-routing boundary must identify Cloudflare Workers AI');
assert.doesNotMatch(providerRouter, /GEMINI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|OPENAI_API_KEY|GROQ_API_KEY|OPENROUTER_API_KEY/, 'the provider router must not read legacy third-party AI credentials');
assert.doesNotMatch(providerRouter, /openrouter\.ai|api\.anthropic\.com|api\.openai\.com|api\.deepseek\.com|api\.groq\.com|generativelanguage\.googleapis\.com/, 'the provider router must not contain third-party model endpoints');
assert.ok(health.includes('const aiReady = hasAiBinding;'), 'system health must report AI readiness only from the Cloudflare Workers AI binding');
assert.ok(!/id:\s*'openrouter'/.test(publicServiceStatus), 'legacy AI provider status must not appear in the public service status endpoint');

console.log('Native assistant response-action contracts passed: feedback, Support hand-off, copy/retry, private metadata, and Cloudflare-only routing diagnostics.');
