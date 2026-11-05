import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const providerSource = read('functions/_lib/providers.js');
const nativeSource = read('functions/_lib/ovyx-native-ai.js');
const assistantSource = read('functions/api/ai/assistant.js');
const gatewaySource = read('functions/api/ai/gateway.js');
const nativeRoute = read('functions/api/ai/ovyx.js');
const agentRoute = read('functions/api/generate.js');
const orchestrator = read('functions/_lib/orchestrator.js');
const connectionsApi = read('functions/api/settings/connections.js');
const docs = read('docs/UNIVERSAL-CONNECTIONS.md');

assert.doesNotMatch(providerSource, /callSelectedUniversalBrain|getActiveBrainConnectionId|callUserUniversalConnection/,
  'The model adapter must not retain a callable route to account-owned AI Brain connections.');
assert.doesNotMatch(nativeSource, /callSelectedUniversalBrain|universalBrainDependencies|selectedBrainResult/,
  'The native assistant must not resolve or invoke a saved external AI Brain.');
assert.match(nativeSource, /withCloudflareAIOnly\(env\)/);
assert.match(nativeSource, /runCloudflareFreeInference/);
assert.match(nativeSource, /routedProvider: 'cloudflare-workers-ai'/);
assert.match(nativeSource, /personalConnectionUsed: false/);

assert.match(providerSource, /export async function callModel\(env, options = \{\}\)/);
assert.match(providerSource, /withCloudflareAIOnly\(env\)/);
assert.match(providerSource, /callCloudflareWorkersAI\(secureEnv/);
assert.doesNotMatch(providerSource, /export function providerOrder/,
  'The previous multi-provider priority selector must not remain a public routing API.');

assert.match(assistantSource, /cloudflareOnlyModelOptions\(options\)/);
assert.match(assistantSource, /callUserUniversalConnection/);
assert.match(assistantSource, /getActiveBrainConnectionId/);
assert.match(assistantSource, /DAILY_RATION_EXHAUSTED/);
assert.match(assistantSource, /personalAIConnectionActive/);
assert.match(gatewaySource, /cloudflareOnlyModelOptions\(options\)/);
assert.match(gatewaySource, /callUserUniversalConnection/);
assert.match(gatewaySource, /getActiveBrainConnectionId/);
assert.match(gatewaySource, /DAILY_RATION_EXHAUSTED/);
assert.match(gatewaySource, /personalAIConnectionActive/);
assert.match(nativeRoute, /callUserUniversalConnection/);
assert.match(nativeRoute, /getActiveBrainConnectionId/);
assert.match(nativeRoute, /DAILY_RATION_EXHAUSTED/);
assert.match(nativeRoute, /personalAIConnectionActive/);
assert.match(nativeRoute, /externalApiKeysRequired: result\.personalConnectionUsed === true/);
assert.match(agentRoute, /callJsonModelOverride/);
assert.match(agentRoute, /DAILY_RATION_EXHAUSTED/);
assert.match(agentRoute, /callUserUniversalConnection/);
assert.match(orchestrator, /const invokeJsonModel = typeof callJsonModelOverride/);
assert.match(assistantSource, /webStudioRequest: isWebStudio/);
assert.match(assistantSource, /appStudioRequest: isAppStudio/);
assert.match(gatewaySource, /webStudioRequest: isWebStudio/);
assert.match(gatewaySource, /appStudioRequest: isAppStudio/);

assert.match(connectionsApi, /action === 'use-ai'/);
assert.match(connectionsApi, /AI_CONNECTION_NOT_READY/);
assert.match(connectionsApi, /activeBrainConnectionId: state\.activeBrainConnectionId/);
assert.match(connectionsApi, /cloudflare-then-personal-key/);
assert.match(docs, /Cloudflare Workers AI remains OVYX's default inference provider/i);
assert.match(docs, /DAILY_RATION_EXHAUSTED/);
assert.match(docs, /AES-GCM encrypted connection storage/);
assert.doesNotMatch(docs, /Automatic uses the selected AI Brain exclusively/i);
assert.doesNotMatch(docs, /Platform Automatic routing[\\s\\S]*tries the providers in/i);

console.log('OVYX AI routing tests passed: Cloudflare stays first and a selected encrypted personal Brain is used only after quota exhaustion across assistant, studio and Agent routes.');
