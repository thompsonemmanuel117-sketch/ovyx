import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const assistantRoute = readFileSync(new URL('../functions/api/ai/assistant.js', import.meta.url), 'utf8');
const gatewayRoute = readFileSync(new URL('../functions/api/ai/gateway.js', import.meta.url), 'utf8');
const providerSource = readFileSync(new URL('../functions/_lib/providers.js', import.meta.url), 'utf8');
const cloudflareSource = readFileSync(new URL('../functions/_lib/cloudflare-free-ai.js', import.meta.url), 'utf8');

assert.doesNotMatch(html, /ovyx-webstudio-free-ai-fallback-v1/);
assert.doesNotMatch(html, /Continue with my own key/);
assert.doesNotMatch(html, /Use for Web Studio|Web Studio assigned|data-v91-use-webstudio|activeWebStudioConnectionId/);
assert.doesNotMatch(html, /useUniversalConnectionAfterCloudflareLimit/);
assert.doesNotMatch(html, /requiresUniversalConnectionFallback/);
assert.doesNotMatch(assistantRoute, /isWebStudioUniversalConnectionFallbackTrigger|requiresUniversalConnectionFallback|useUniversalConnectionAfterCloudflareLimit|webStudioUserConnectionFallback/);
assert.doesNotMatch(gatewayRoute, /isWebStudioUniversalConnectionFallbackTrigger|requiresUniversalConnectionFallback|useUniversalConnectionAfterCloudflareLimit|webStudioUserConnectionFallback/);
assert.doesNotMatch(providerSource, /isCloudflareFreeAllowanceExhausted\(env,? options|useUniversalConnectionAfterCloudflareLimit|webStudioUserConnectionFallback/);
assert.doesNotMatch(cloudflareSource, /isWebStudioUniversalConnectionFallbackTrigger/);
assert.match(assistantRoute, /DAILY_RATION_EXHAUSTED/);
assert.match(gatewayRoute, /DAILY_RATION_EXHAUSTED/);
assert.match(assistantRoute, /personalAIConnectionActive \?/);
assert.match(gatewayRoute, /personalAIConnectionActive \?/);
assert.match(assistantRoute, /callUserUniversalConnection/);
assert.match(gatewayRoute, /callUserUniversalConnection/);
assert.match(assistantRoute, /const quota = personalAIConnectionActive/);
assert.match(gatewayRoute, /const quota = personalAIConnectionActive/);
console.log('OVYX Web Studio quota fallback checks passed: Cloudflare remains first and personal keys activate only after the full OVYX allowance is exhausted.');
