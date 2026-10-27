import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const [packageSource, chatRoute, nativeAI, chatClient, generationRoute, orchestrator, providerRouter] = await Promise.all([
  read('../package.json'),
  read('../functions/api/ai/ovyx.js'),
  read('../functions/_lib/ovyx-native-ai.js'),
  read('../assets/ovyx-assistant-workspace.js'),
  read('../functions/api/generate.js'),
  read('../functions/_lib/orchestrator.js'),
  read('../functions/_lib/providers.js'),
]);

const packageJson = JSON.parse(packageSource);
const testCommand = packageJson.scripts?.test || '';
assert.match(testCommand, /node scripts\/ovyx-native-ai\.test\.mjs/, 'Existing ordinary-chat behavioral tests must remain registered.');
assert.match(testCommand, /node scripts\/provider-routing\.test\.mjs/, 'Existing provider-routing regressions must remain registered.');
assert.match(testCommand, /node scripts\/ovyx-cloudflare-free-ai\.test\.mjs/, 'Cloudflare quota and guarded-inference tests must remain registered.');
assert.match(testCommand, /node scripts\/ovyx-stage5-intelligence\.test\.mjs/, 'Stage 5 structured planning and tool-safety tests must remain registered.');
assert.match(testCommand, /node scripts\/ovyx-stage6-website-coding\.test\.mjs/, 'Stage 6 website quality-check tests must remain registered.');
assert.match(testCommand, /node scripts\/ovyx-stage7-ai-migration\.test\.mjs/, 'Stage 7 migration contract must run in the full test suite.');

// Phase 1: ordinary chat already uses the native assistant API. Keep its
// authentication, request bounds, quota accounting and conversation history.
assert.match(chatRoute, /assertAuthenticated\(context\.data\?\.user\)/);
assert.match(chatRoute, /readJson\(context\.request, 180_000\)/);
assert.match(chatRoute, /beginAIQuota\(context\.env, user\)/);
assert.match(chatRoute, /finalizeAIQuota\(/);
assert.match(chatRoute, /refundDailyPrompt\(/);
assert.match(chatRoute, /generateOvyxNativeAI\(context\.env/);
assert.match(chatRoute, /saveChatTurn\(/);
assert.match(chatRoute, /plan: Array\.isArray\(result\.plan\)/);
assert.match(chatRoute, /routedProvider: result\.routedProvider \|\| 'cloudflare-workers-ai'/);
assert.doesNotMatch(chatRoute, /from ['"][^'"]*providers\.js['"]/, 'The HTTP chat route must not bypass the native AI service and call provider APIs itself.');
assert.match(chatClient, /fetch\('\/api\/ai\/ovyx'/, 'The workspace assistant must use the native chat route.');
assert.match(chatClient, /recordAssistantPlan\(result\.plan\)/, 'Validated plans must continue to be rendered in the activity log.');

// The native service uses the Cloudflare Workers AI binding for platform
// inference. An account-selected Universal Connection is an explicit choice,
// not an automatic quota fallback; a selected connection failure must stay
// fail-closed (covered behaviorally by ovyx-native-ai.test.mjs).
assert.match(nativeAI, /env\.AI\.run\(selectedModel/);
assert.match(nativeAI, /runCloudflareFreeInference\(env/);
assert.match(nativeAI, /if \(authUser\)\s*\{\s*selectedBrainResult = await callSelectedUniversalBrain/s);
assert.match(nativeAI, /if \(selectedBrainResult\)\s*\{[\s\S]*?\} else if \(!env\?\.AI/s);
assert.match(nativeAI, /personalConnectionUsed: Boolean\(selectedBrainResult\)/);
assert.match(nativeAI, /routedProvider: selectedBrainResult \? 'universal-connection' : 'cloudflare-workers-ai'/);
assert.match(nativeAI, /OVYX_NATIVE_AI_NOT_CONFIGURED/);
assert.match(nativeAI, /OVYX_NATIVE_AI_EMPTY_RESPONSE/);

// Phase 2: coding/reasoning use the shared model adapter through the agent
// orchestrator. Guarded Cloudflare mode must ignore caller-selected external
// providers; the existing provider-routing tests exercise that behavior.
assert.match(generationRoute, /runAgent/);
assert.match(generationRoute, /requestedProvider:/);
assert.match(orchestrator, /callJsonModel\(/);
assert.match(providerRouter, /if \(isCloudflareWorkersAIGuardedMode\(env\)\)/);
assert.match(providerRouter, /if \(!isLegacyProviderRoutingEnabled\(env\)\)/);
assert.match(providerRouter, /No AI provider was called/);
assert.match(providerRouter, /return \{ \.\.\.result, requestedProvider: 'cloudflare-workers-ai', routedProvider: 'cloudflare-workers-ai' \}/);

// Phase 3: website/app generation are not replaced by a generic chat prompt.
// The shared orchestration and the Web Studio QA tool remain distinct contracts.
assert.match(orchestrator, /Multi-page website generated in verified batches/);
assert.match(chatClient, /workspace_quality_check/);
assert.match(chatClient, /No source was changed/);
assert.match(chatClient, /preview.*explicit (?:user )?approval|explicit (?:user )?approval.*preview/i);

// Quota exhaustion must never trigger a Universal Connection escape hatch.
// This is checked here as well as by the focused Web Studio quota-stop suite.
const guardedRouter = await read('../functions/_lib/providers.js');
const assistantRoute = await read('../functions/api/ai/assistant.js');
const gatewayRoute = await read('../functions/api/ai/gateway.js');
assert.doesNotMatch(guardedRouter, /useUniversalConnectionAfterCloudflareLimit|webStudioUserConnectionFallback/);
assert.doesNotMatch(assistantRoute, /requiresUniversalConnectionFallback|useUniversalConnectionAfterCloudflareLimit/);
assert.doesNotMatch(gatewayRoute, /requiresUniversalConnectionFallback|useUniversalConnectionAfterCloudflareLimit/);
const page = await read('../index.html');
assert.doesNotMatch(page, /Continue with my own key|Use for Web Studio|data-v91-use-webstudio|activeWebStudioConnectionId/);

// Source-grounded project awareness must stay in the regular native chat prompt.
const platformKnowledge = await read('../functions/_lib/ovyx-project-knowledge.js');
const platformMapDoc = await read('../docs/OVYX-PLATFORM-MAP.md');
assert.match(nativeAI, /buildOvyxProjectKnowledge\(latestUserQuery\)/);
assert.match(nativeAI, /PLATFORM VS USER PROJECT/);
assert.match(platformKnowledge, /getOvyxProjectKnowledgeCatalog/);
assert.match(platformMapDoc, /not model fine-tuning/);

// Research has a separate endpoint: distinguish a live-capable search pipeline
// from a mere research suggestion in a text prompt.
const researchClient = await read('../assets/ovyx-webstudio-research.js');
const researchRoute = await read('../functions/api/ai/web-search.js');
const researchModule = await read('../functions/_lib/web-research.js');
assert.match(researchClient, /fetch\('\/api\/ai\/web-search'/);
assert.match(researchRoute, /conductWebResearch/);
assert.match(researchModule, /TAVILY_API_KEY/);
assert.match(researchModule, /BRAVE_SEARCH_API_KEY/);
assert.match(researchModule, /SERPER_API_KEY/);

// Specialized modalities are intentionally not declared migrated by a text
// model contract. They require their own capability and regression audit.
assert.match(nativeAI, /You are OVYX AI/);
assert.match(packageSource, /benchmark:cloudflare-ai-stage4/);

console.log('OVYX Stage 7 AI migration contract tests passed: ordinary chat, shared guarded routing, generation boundaries and modality scope.');
