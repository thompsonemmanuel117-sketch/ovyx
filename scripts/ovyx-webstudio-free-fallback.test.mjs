import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /ovyx-webstudio-free-ai-fallback-v1/);
assert.match(html, /requiresUniversalConnectionFallback/);
assert.match(html, /useUniversalConnectionAfterCloudflareLimit/);
assert.match(html, /Continue with my own key/);
assert.match(html, /Open Settings & connections/);
assert.match(html, /This applies only to Web Studio/);
assert.match(html, /used your included monthly AI tokens and daily OVYX prompts/);
assert.match(html, /ovyx\.webstudio\.personal-connection-fallback\.v1/);
assert.match(html, /secureGenerate\(\{\.\.\.payload,useUniversalConnectionAfterCloudflareLimit:true\}/);
assert.match(html, /fallbackFeature==='webStudio'/);
const assistantRoute = readFileSync(new URL('../functions/api/ai/assistant.js', import.meta.url), 'utf8');
const gatewayRoute = readFileSync(new URL('../functions/api/ai/gateway.js', import.meta.url), 'utf8');
assert.match(assistantRoute, /webStudioUserConnectionFallback === true/);
assert.match(gatewayRoute, /webStudioUserConnectionFallback === true/);
const providerSource = readFileSync(new URL('../functions/_lib/providers.js', import.meta.url), 'utf8');
assert.match(providerSource, /getActiveWebStudioConnectionId\(env, options\.authUser\)/,
  'Explicit Web Studio continuation must use the separately assigned Web Studio connection, not the AI Brain selection.');
assert.match(providerSource, /No active Universal Connection is assigned to Web Studio/,
  'A missing Web Studio assignment must ask the user to assign one rather than borrow their Brain key.');
assert.match(assistantRoute, /const isWebStudioFallbackRequest = !isAppStudio/);
assert.match(gatewayRoute, /const isWebStudioFallbackRequest = !isAppStudio/);
assert.match(assistantRoute, /useUniversalConnectionAfterCloudflareLimit =\s*isWebStudioFallbackRequest/);
assert.match(gatewayRoute, /useUniversalConnectionAfterCloudflareLimit =\s*isWebStudioFallbackRequest/);
assert.match(assistantRoute, /countedAgainstOvyxMonthlyTokens: false/);
assert.match(gatewayRoute, /countedAgainstOvyxDailyPromptAllowance: false/);
console.log('OVYX Web Studio daily-limit popup and opt-in routing checks passed.');
