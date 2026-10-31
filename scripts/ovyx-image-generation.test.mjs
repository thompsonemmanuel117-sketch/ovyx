import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [packageSource, route, helper, client, middleware, platformMap, stageDoc] = await Promise.all([
  read('../package.json'),
  read('../functions/api/ai/image-generation.js'),
  read('../functions/_lib/cloudflare-free-ai.js'),
  read('../assets/ovyx-image-generation.js'),
  read('../functions/_middleware.js'),
  read('../docs/OVYX-PLATFORM-MAP.md'),
  read('../docs/OVYX-STAGE-7-AI-MIGRATION.md'),
]);

const scripts = JSON.parse(packageSource).scripts || {};
assert.match(scripts.test || '', /node scripts\/ovyx-image-generation\.test\.mjs/,
  'Image-generation regression tests must be part of npm test.');

// Server boundary: no anonymous generation, no Web Studio entitlement bypass,
// no client-selected provider/model, and no skipping the shared OVYX quota.
assert.match(route, /assertAuthenticated\(context\.data\?\.user\)/);
assert.match(route, /capabilities\?\.webStudio !== true/);
assert.match(route, /readJson\(context\.request, 8_000\)/);
assert.match(route, /MAX_PROMPT_CHARS = 1800/);
assert.match(route, /beginAIQuota\(env, user\)/);
assert.match(route, /finalizeAIQuota\(/);
assert.match(route, /refundDailyPrompt\(/);
assert.match(route, /runCloudflareFreeImageInference\(env, \{ authUser: user, prompt \}\)/);
assert.doesNotMatch(route, /payload\.(?:provider|model)|requestedProvider/,
  'The browser must not choose a model or route around guarded Cloudflare mode.');
assert.match(route, /data:image\/jpeg;base64/);

// Model boundary: fixed Cloudflare model, fixed low-step inference, shared daily
// ledger reservation, per-user rate limiting, bounded image bytes and safe errors.
assert.match(helper, /OVYX_CLOUDFLARE_IMAGE_MODEL = '@cf\/black-forest-labs\/flux-1-schnell'/);
assert.match(helper, /OVYX_CLOUDFLARE_IMAGE_STEPS = 4/);
assert.match(helper, /OVYX_CLOUDFLARE_IMAGE_NEURON_ESTIMATE = 44/);
assert.match(helper, /isCloudflareWorkersAIGuardedMode\(env\)/);
assert.match(helper, /isCloudflareFreeAllowanceExhausted\(env, snapshot\)/);
assert.match(helper, /reserveUserMinute\(env, authUser\)/);
assert.match(helper, /reserveDailyBudget\(env, estimate, snapshot\)/);
assert.match(helper, /settleDailyBudget\(env, reservation, estimate\)/);
assert.match(helper, /candidate\.length > 8_000_000/);
assert.match(helper, /recordCloudflareFreeExhaustion\(env, 'cloudflare-daily-free-allocation'\)/);

// Browser boundary: same-origin authenticated generation, preview/download,
// and explicit user-triggered upload through the existing owner-scoped asset store.
assert.match(client, /activeWebStudio\(\)/);
assert.match(client, /fetch\('\/api\/ai\/image-generation'/);
assert.match(client, /['"]Authorization['"]: 'Bearer ' \+ token/);
assert.match(client, /preview\.src = data\.image/);
assert.match(client, /downloadLink\.href = data\.image/);
assert.match(client, /saveButton\.addEventListener\('click', saveGeneratedImage\)/);
assert.match(client, /var store = window\.OVYXAssetStore/);
assert.match(client, /await store\.upload\(file, project\.id/);
assert.match(client, /ovyx:webstudio-ai-asset-saved/);
assert.match(client, /does not insert it into a page automatically/);
assert.doesNotMatch(client, /firebase\.storage\(\)|\.putString\(|\.uploadBytes\(/,
  'Generated images must not be silently persisted to user storage.');

assert.match(middleware, /ovyx-image-generation\.js\?v=20261031-1/);
assert.match(platformMap, /POST \/api\/ai\/image-generation/);
assert.match(stageDoc, /flux-1-schnell/i);
assert.match(stageDoc, /live production acceptance/i);

console.log('OVYX image generation contract tests passed: authenticated UI, Cloudflare-only model, daily budget, quota, output bounds and explicit project-asset save and download.');
