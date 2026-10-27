import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const assistantRoute = readFileSync(new URL('../functions/api/ai/assistant.js', import.meta.url), 'utf8');
const gatewayRoute = readFileSync(new URL('../functions/api/ai/gateway.js', import.meta.url), 'utf8');
const providerSource = readFileSync(new URL('../functions/_lib/providers.js', import.meta.url), 'utf8');
const cloudflareSource = readFileSync(new URL('../functions/_lib/cloudflare-free-ai.js', import.meta.url), 'utf8');

assert.doesNotMatch(html, /ovyx-webstudio-free-ai-fallback-v1/);
assert.doesNotMatch(html, /Continue with my own key/);
assert.doesNotMatch(html, /useUniversalConnectionAfterCloudflareLimit/);
assert.doesNotMatch(html, /requiresUniversalConnectionFallback/);
assert.doesNotMatch(assistantRoute, /isWebStudioUniversalConnectionFallbackTrigger|requiresUniversalConnectionFallback|useUniversalConnectionAfterCloudflareLimit|webStudioUserConnectionFallback/);
assert.doesNotMatch(gatewayRoute, /isWebStudioUniversalConnectionFallbackTrigger|requiresUniversalConnectionFallback|useUniversalConnectionAfterCloudflareLimit|webStudioUserConnectionFallback/);
assert.doesNotMatch(providerSource, /isCloudflareFreeAllowanceExhausted\(env,? options|useUniversalConnectionAfterCloudflareLimit|webStudioUserConnectionFallback/);
assert.doesNotMatch(cloudflareSource, /isWebStudioUniversalConnectionFallbackTrigger/);
assert.match(assistantRoute, /const quota = await finalizeAIQuota/);
assert.match(gatewayRoute, /const quota = await finalizeAIQuota/);
console.log('OVYX Web Studio quota stop checks passed: exhausted allowances cannot trigger provider switching.');
