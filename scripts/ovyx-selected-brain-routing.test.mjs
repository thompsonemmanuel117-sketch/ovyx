import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const providerSource = read('functions/_lib/providers.js');
const nativeSource = read('functions/_lib/ovyx-native-ai.js');
const assistantSource = read('functions/api/ai/assistant.js');
const gatewaySource = read('functions/api/ai/gateway.js');
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
assert.match(gatewaySource, /cloudflareOnlyModelOptions\(options\)/);
assert.match(assistantSource, /webStudioRequest: isWebStudio/);
assert.match(assistantSource, /appStudioRequest: isAppStudio/);
assert.match(gatewaySource, /webStudioRequest: isWebStudio/);
assert.match(gatewaySource, /appStudioRequest: isAppStudio/);

assert.match(connectionsApi, /AI_PROVIDER_DISABLED/);
assert.match(connectionsApi, /Saved external AI credentials are preserved but are not tested or called/);
assert.match(connectionsApi, /activeBrainConnectionId: null/);
assert.match(connectionsApi, /activeWebStudioConnectionId: null/);
assert.match(docs, /Cloudflare Workers AI is the only supported model provider/i);
assert.match(docs, /existing encrypted AI connection records are retained/i);
assert.match(docs, /HTTP, webhook, database and tool integrations remain available/i);
assert.doesNotMatch(docs, /Automatic uses the selected AI Brain exclusively/i);
assert.doesNotMatch(docs, /Platform Automatic routing[\\s\\S]*tries the providers in/i);

console.log('OVYX Cloudflare-only Brain routing tests passed: no selected external Brain route remains and generic service connections remain separate.');
