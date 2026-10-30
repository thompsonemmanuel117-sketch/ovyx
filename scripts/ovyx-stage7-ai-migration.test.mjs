import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const [
  packageSource, chatRoute, nativeAI, chatClient, generationRoute,
  orchestrator, providerRouter, assistantRoute, gatewayRoute,
  imageRoute, imageHelper, imageClient, middleware, indexHtml,
] = await Promise.all([
  read('../package.json'),
  read('../functions/api/ai/ovyx.js'),
  read('../functions/_lib/ovyx-native-ai.js'),
  read('../assets/ovyx-assistant-workspace.js'),
  read('../functions/api/generate.js'),
  read('../functions/_lib/orchestrator.js'),
  read('../functions/_lib/providers.js'),
  read('../functions/api/ai/assistant.js'),
  read('../functions/api/ai/gateway.js'),
  read('../functions/api/ai/image-generation.js'),
  read('../functions/_lib/cloudflare-free-ai.js'),
  read('../assets/ovyx-image-generation.js'),
  read('../functions/_middleware.js'),
  read('../index.html'),
]);

const packageJson = JSON.parse(packageSource);
const testCommand = packageJson.scripts?.test || '';
for (const testFile of [
  'ovyx-native-ai.test.mjs',
  'provider-routing.test.mjs',
  'ovyx-cloudflare-free-ai.test.mjs',
  'ovyx-stage5-intelligence.test.mjs',
  'ovyx-stage6-website-coding.test.mjs',
  'ovyx-stage7-ai-migration.test.mjs',
  'ovyx-image-generation.test.mjs',
]) {
  assert.ok(testCommand.includes('node scripts/' + testFile),
    'The existing registered test must remain in the full test suite: ' + testFile);
}

// Ordinary chat preserves authentication, bounded input, quota accounting,
// conversation history and the separate native-assistant API contract.
assert.match(chatRoute, /assertAuthenticated\(context\.data\?\.user\)/);
assert.match(chatRoute, /readJson\(context\.request, 180_000\)/);
assert.match(chatRoute, /beginAIQuota\(context\.env, user\)/);
assert.match(chatRoute, /finalizeAIQuota\(/);
assert.match(chatRoute, /refundDailyPrompt\(/);
assert.match(chatRoute, /generateOvyxNativeAI\(withCloudflareAIOnly\(context\.env\)/);
assert.match(chatRoute, /saveChatTurn\(/);
assert.match(chatRoute, /plan: Array\.isArray\(result\.plan\)/);
assert.match(chatRoute, /routedProvider: result\.routedProvider \|\| 'cloudflare-workers-ai'/);
assert.doesNotMatch(chatRoute, /from ['"][^'"]*providers\.js['"]/);
assert.match(chatClient, /fetch\('\/api\/ai\/ovyx'/);
assert.match(chatClient, /recordAssistantPlan\(result\.plan\)/);

// The native assistant can only invoke the guarded Cloudflare inference seam.
// It must not resolve saved account AI Brain connections or accept a client model.
assert.match(nativeAI, /withCloudflareAIOnly\(env\)/);
assert.match(nativeAI, /runCloudflareFreeInference/);
assert.match(nativeAI, /cloudflareInference\s*=\s*runCloudflareFreeInference/);
assert.match(nativeAI, /model: selectedModel/);
assert.match(nativeAI, /routedProvider: 'cloudflare-workers-ai'/);
assert.match(nativeAI, /personalConnectionUsed: false/);
assert.doesNotMatch(nativeAI, /callSelectedUniversalBrain|universalBrainDependencies|selectedBrainResult/);
assert.match(nativeAI, /OVYX_NATIVE_AI_NOT_CONFIGURED/);
assert.match(nativeAI, /OVYX_NATIVE_AI_EMPTY_RESPONSE/);
assert.match(nativeAI, /You are OVYX AI/);

// All shared generation calls are pinned to Cloudflare at their server boundary.
// Caller provider preferences, model strings, personal Brain choices and old
// multi-provider environment flags cannot open another model route.
const callModelStart = providerRouter.indexOf('export async function callModel(');
const callModelEnd = providerRouter.indexOf('export async function callJsonModel(', callModelStart);
assert.ok(callModelStart >= 0 && callModelEnd > callModelStart);
const callModelBody = providerRouter.slice(callModelStart, callModelEnd);
assert.match(callModelBody, /withCloudflareAIOnly\(env\)/);
assert.match(callModelBody, /callCloudflareWorkersAI\(secureEnv/);
assert.match(callModelBody, /OVYX_CLOUDFLARE_FREE_MODEL/);
assert.match(callModelBody, /OVYX_CLOUDFLARE_ONLY_PROVIDER/);
assert.doesNotMatch(callModelBody, /callSelectedUniversalBrain|providerOrder\(|callGemini|callClaude|callDeepSeek|callOpenAI|callGroq|callOpenRouter/);

assert.match(assistantRoute, /cloudflareOnlyModelOptions\(options\)/);
assert.match(gatewayRoute, /cloudflareOnlyModelOptions\(options\)/);
assert.match(generationRoute, /runAgent/);
assert.match(generationRoute, /withCloudflareAIOnly\(context\.env\)/);
assert.match(generationRoute, /requestedProvider:\s*OVYX_CLOUDFLARE_ONLY_PROVIDER/);
assert.match(orchestrator, /callJsonModel\(/);

// Website/App Studio architecture, acceptance and guarded quota behaviour stay
// distinct from ordinary assistant chat.
assert.match(orchestrator, /Multi-page website generated in verified batches/);
assert.match(chatClient, /workspace_quality_check/);
assert.match(chatClient, /No source was changed/);
assert.match(chatClient, /preview.*explicit (?:user )?approval|explicit (?:user )?approval.*preview/i);
assert.doesNotMatch(providerRouter, /callSelectedUniversalBrain|getActiveBrainConnectionId|callUserUniversalConnection/);

// The admin and user settings surfaces must identify only Cloudflare Workers AI.
// The compatibility renderer may retain harmless old localStorage data, but no
// external vendor card or selection action may be presented as usable.
const adminGridStart = indexHtml.indexOf('<!-- OVYX single supported model engine: Cloudflare Workers AI -->');
const adminGridEnd = indexHtml.indexOf('</section>\n<!-- VIEW 12: AI IDENTITY STUDIO -->', adminGridStart);
assert.ok(adminGridStart >= 0 && adminGridEnd > adminGridStart, 'The admin provider grid must contain the single Cloudflare engine card.');
const adminGrid = indexHtml.slice(adminGridStart, adminGridEnd);
assert.match(adminGrid, /id="card-provider-cloudflare-workers-ai"/);
assert.doesNotMatch(adminGrid, /card-provider-(?:gemini|deepseek|anthropic|openai)/);
assert.doesNotMatch(adminGrid, /Google Gemini|DeepSeek Flash|Claude Sonnet|OpenAI GPT/);
const browserNormalizerStart = indexHtml.indexOf('function normalizeProvider(_value)');
const browserNormalizerEnd = indexHtml.indexOf('async function secureGenerate', browserNormalizerStart);
assert.ok(browserNormalizerStart >= 0 && browserNormalizerEnd > browserNormalizerStart);
assert.match(indexHtml.slice(browserNormalizerStart, browserNormalizerEnd), /return 'automatic'/);
assert.doesNotMatch(indexHtml.slice(browserNormalizerStart, browserNormalizerEnd), /connection:|gemini|deepseek|anthropic|openai/);
assert.match(indexHtml, /id="card-provider-cloudflare-workers-ai"/,
  'The main admin UI must show the single Cloudflare Workers AI engine card.');
assert.doesNotMatch(indexHtml, /Use for Web Studio|Use as AI Brain|Use for AI requests/);
assert.match(indexHtml, /id="ws-brain-label">Cloudflare<\\/span>/,
  'The Web Studio composer must identify the Cloudflare engine rather than an external Brain.');
assert.match(indexHtml, /Workspace response preferences\. OVYX uses Cloudflare Workers AI exclusively/);
assert.match(indexHtml, /this\.brain='automatic';try\{persistStateNow\('cloudflare-only-engine'\)/,
  'The legacy brain button must normalize old provider state to managed Cloudflare routing.');
assert.doesNotMatch(indexHtml, /const order = \['automatic','gemini','deepseek','anthropic','openai'\]/,
  'The shell must not retain an interactive cycle through third-party model providers.');
assert.doesNotMatch(indexHtml, /data-brain-choice="(?:gemini|deepseek|anthropic|openai)"/,
  'Web Studio Agent Settings must not expose third-party model buttons.');

// Platform project awareness remains available and grounded in source maps.
const platformKnowledge = await read('../functions/_lib/ovyx-project-knowledge.js');
const platformMapDoc = await read('../docs/OVYX-PLATFORM-MAP.md');
assert.match(nativeAI, /buildOvyxProjectKnowledge\(latestUserQuery\)/);
assert.match(nativeAI, /PLATFORM VS USER PROJECT/);
assert.match(platformKnowledge, /getOvyxProjectKnowledgeCatalog/);
assert.match(platformMapDoc, /not model fine-tuning/);

// Research remains a separately configured search integration, not a second
// model provider.
const researchClient = await read('../assets/ovyx-webstudio-research.js');
const researchRoute = await read('../functions/api/ai/web-search.js');
const researchModule = await read('../functions/_lib/web-research.js');
assert.match(researchClient, /fetch\('\/api\/ai\/web-search'/);
assert.match(researchRoute, /conductWebResearch/);
assert.match(researchModule, /TAVILY_API_KEY/);
assert.match(researchModule, /BRAVE_SEARCH_API_KEY/);
assert.match(researchModule, /SERPER_API_KEY/);

// Image generation and transcription are separate Cloudflare Workers AI
// modalities using the same guarded usage/budget infrastructure.
assert.match(imageRoute, /assertAuthenticated\(context\.data\?\.user\)/);
assert.match(imageRoute, /capabilities\?\.webStudio !== true/);
assert.match(imageRoute, /beginAIQuota\(env, user\)/);
assert.match(imageRoute, /finalizeAIQuota\(/);
assert.match(imageRoute, /refundDailyPrompt\(/);
assert.match(imageRoute, /runCloudflareFreeImageInference\(env, \{ authUser: user, prompt \}\)/);
assert.match(imageHelper, /@cf\/black-forest-labs\/flux-1-schnell/);
assert.match(imageHelper, /reserveDailyBudget\(env, estimate, snapshot\)/);
assert.match(imageHelper, /settleDailyBudget\(env, reservation, estimate\)/);
assert.match(imageHelper, /reserveUserMinute\(env, authUser\)/);
assert.match(imageClient, /fetch\('\/api\/ai\/image-generation'/);
assert.match(imageClient, /['"]Authorization['"]: 'Bearer ' \+ token/);
assert.match(imageClient, /ovyx-image-gen-download/);
assert.match(middleware, /ovyx-image-generation\.js\?v=20261027-1/);

console.log('OVYX Stage 7 migration contract tests passed: Cloudflare-only text, website, App Studio, Agent and image routes remain bounded and independently tested.');
