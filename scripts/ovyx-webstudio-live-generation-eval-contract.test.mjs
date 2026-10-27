import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeLiveGenerationFailureDetail } from '../functions/api/internal/live-generation-eval.js';

const liveGenerationRoute = fs.readFileSync('functions/api/internal/live-generation-eval.js', 'utf8');
const liveGenerationWorkflow = fs.readFileSync('.github/workflows/ovyx-webstudio-live-generation.yml', 'utf8');
assert.equal(
  safeLiveGenerationFailureDetail(Object.assign(new Error('test'), { code: 'OVYX_AI_BUDGET_LEDGER_STOP_HTTP_429', status: 503 })),
  'cloudflare-ai-budget-ledger-stop-http-429',
  'The acceptance report must preserve the safe stop-marker phase and Firestore throttling status.'
);
assert.equal(
  safeLiveGenerationFailureDetail(Object.assign(new Error('test'), { code: 'OVYX_AI_BUDGET_LEDGER_STOP_HTTP_404', status: 503 })),
  'cloudflare-ai-budget-ledger-stop-http-404',
  'The acceptance report must preserve otherwise-unclassified HTTP statuses rather than collapsing them into a generic ledger error.'
);
assert.equal(
  safeLiveGenerationFailureDetail(Object.assign(new Error('key import failed'), { name: 'DataError', code: 'OVYX_AI_BUDGET_LEDGER_READ_ERROR_DATAERROR' })),
  'cloudflare-ai-budget-ledger-read-error-dataerror',
  'Statusless cryptographic/runtime failures must retain a safe error class for diagnosis without exposing key material.'
);
assert.equal(
  safeLiveGenerationFailureDetail(Object.assign(new Error('oauth failed'), { code: 'OVYX_AI_BUDGET_LEDGER_READ_CAUSE_GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED' })),
  'cloudflare-ai-budget-ledger-read-cause-google-oauth-token-exchange-failed',
  'Known dependency failures should retain only an allowlisted cause identifier.'
);

for (const [cause, expected] of [
  ['FIREBASE_SERVICE_ACCOUNT_NOT_CONFIGURED', 'firebase-service-account-not-configured'],
  ['FIREBASE_SERVICE_ACCOUNT_INVALID_JSON', 'firebase-service-account-invalid-json'],
  ['FIREBASE_SERVICE_ACCOUNT_MISSING_FIELDS', 'firebase-service-account-missing-fields'],
  ['FIREBASE_JWT_SIGNING_FAILED', 'firebase-jwt-signing-failed'],
  ['FIREBASE_ACCESS_TOKEN_ACQUISITION_FAILED', 'firebase-access-token-acquisition-failed'],
  ['FIRESTORE_READ_TRANSPORT_FAILED', 'firestore-read-transport-failed'],
  ['FIRESTORE_READ_INVALID_JSON', 'firestore-read-invalid-json'],
]) {
  assert.equal(
    safeLiveGenerationFailureDetail(Object.assign(new Error('private details must never be exposed'), {
      code: 'OVYX_AI_BUDGET_LEDGER_READ_CAUSE_' + cause
    })),
    'cloudflare-ai-budget-ledger-read-cause-' + expected,
    'The live acceptance report should identify safe Firebase credential failures without revealing error messages or key material.'
  );
}

assert.ok(liveGenerationRoute.includes("OVYX_WEBSTUDIO_MAX_PAGES: isBudgetedStage4Smoke ? '2' : '8'"),
  'the full acceptance path keeps its eight-page ceiling; only the guarded site smoke is limited to two pages');
assert.ok(liveGenerationRoute.includes("OVYX_WEBSTUDIO_EXPLICIT_PAGE_MANIFEST_ONLY: isBudgetedStage4Smoke ? 'true' : 'false'"),
  'only the fixed budgeted smoke may narrow model-inferred routes to its explicit two-page manifest');
assert.ok(liveGenerationRoute.includes("stage4SmokeQaFormAttributesRepaired: isBudgetedStage4Smoke && generated.stage4SmokeQaFormAttributesRepaired === true"),
  'live smoke evidence must explicitly report whether its local QA form contract required deterministic repair');
assert.match(liveGenerationWorkflow, /const browserSiteCount = Array\.isArray\(browser\.evaluatedSites\)[\s\S]*Number\.isSafeInteger\(browser\.evaluatedSites\)[\s\S]*Array\.isArray\(browser\.results\)/,
  'the smoke gate must accept both the browser evaluator’s current numeric evaluatedSites count and legacy array-shaped evidence');
assert.ok(liveGenerationWorkflow.includes('browserSiteCount !== 1') && liveGenerationWorkflow.includes('browserSites: browserSiteCount'),
  'the Stage 4 gate must compare and report the normalized browser site count');
assert.ok(liveGenerationRoute.includes("OVYX_WEBSTUDIO_EXPLICIT_PAGE_MANIFEST: isBudgetedStage4Smoke ? 'Home|Contact' : ''"),
  'the Stage 4 smoke must pass a fixed Home/Contact manifest so appended QA instructions cannot inflate the page count');
assert.ok(liveGenerationRoute.includes("OVYX_WEBSTUDIO_ENFORCE_BROWSER_RUNTIME: isBudgetedStage4Smoke ? 'true' : 'false'"),
  'strict generated-browser checks must run only for the protected one-site smoke profile');
assert.match(liveGenerationRoute, /Browser JavaScript must run directly in a real browser/,
  'the site-generation brief must explicitly forbid jsdom and Node-only APIs in browser JavaScript');
assert.match(liveGenerationRoute, /Each requested HTML file must contain exactly one complete document/,
  'the site-generation brief must prohibit concatenated documents and embedded model wrappers');
assert.match(liveGenerationRoute, /Create exactly TWO linked pages for a fictional Nigerian nursery-essentials retailer: Home and Contact/,
  'the smoke brief must not use generic “products”/“shop” nouns that the page-manifest extractor can mistake for extra requested routes');
assert.doesNotMatch(liveGenerationRoute, /Create exactly TWO linked pages for a fictional Nigerian baby-products shop/,
  'the smoke brief must avoid the industry-noun collision that can exceed its two-page budget');
assert.match(liveGenerationRoute, /Do not present any sample merchandise as available for purchase/,
  'the two-page smoke prompt must not accidentally infer a third Products page from ordinary merchandise wording');
assert.doesNotMatch(liveGenerationRoute, /Do not invent products as available for purchase/);
assert.ok(liveGenerationRoute.includes("payload?.profile === 'stage4-budgeted-smoke'"));
assert.ok(liveGenerationRoute.includes("requestedProvider === 'cloudflare-workers-ai'"));
assert.ok(liveGenerationRoute.includes("OVYX_WEBSTUDIO_POLISH_ENABLED: isBudgetedStage4Smoke ? 'false'"));
assert.ok(liveGenerationRoute.includes("OVYX_WEBSTUDIO_BATCH_TOKENS: '4200'"));
assert.ok(liveGenerationRoute.includes("evaluationProfile: isBudgetedStage4Smoke ? 'stage4-budgeted-smoke' : 'full-acceptance'"));

const keys=['GEMINI_API_KEY','ANTHROPIC_API_KEY','DEEPSEEK_API_KEY','OPENAI_API_KEY','OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL','OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY','OVYX_EVAL_PUBLIC_ENQUIRY_URL','OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE','OVYX_EVAL_ENQUIRY_TEST_RECIPIENT'];
const saved=Object.fromEntries([...keys,'OVYX_EVAL_PROVIDER','OVYX_EVAL_MODEL'].map(key=>[key,process.env[key]]));
for(const key of keys)delete process.env[key];
process.env.OVYX_EVAL_PROVIDER='gemini';
delete process.env.OVYX_EVAL_MODEL;
try{
  const module=await import('./ovyx-webstudio-live-generation-eval.mjs?contract-test');
  await assert.rejects(
    module.runLiveGenerationEvaluation(),
    error=>error?.code==='LIVE_GENERATION_BLOCKED_NO_PROVIDER_SECRET'&&/blocked, not passed/i.test(error.message)
  );
  process.env.OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL='https://feed.example.invalid/v1/properties';
  process.env.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY='authoritative';
  process.env.OVYX_EVAL_PUBLIC_ENQUIRY_URL='https://forms.example.invalid/ovyx-qa';
  process.env.OVYX_EVAL_ENABLE_EXTERNAL_ENQUIRY_PROBE='true';
  process.env.OVYX_EVAL_ENQUIRY_TEST_RECIPIENT='ovyx-owner-test@example.invalid';
  const configured=module.publicIntegrationSettings();
  assert.equal(configured.listingsUrl.href,'https://feed.example.invalid/v1/properties');
  const liveCopy={'index.html':'<main><h1>Live listings available now</h1><p>Explore verified property listings around Lagos.</p></main>'};
  assert.equal(module.inventoryHonesty({industry:'real-estate'},liveCopy,false).passesHonestyGate,false,
    'copy must not claim active inventory when no public feed is configured');
  const configuredFeedCopy=module.inventoryHonesty({industry:'real-estate'},liveCopy,true);
  assert.equal(configuredFeedCopy.passesHonestyGate,true,
    'configured feed should avoid a false copy-only failure while the separate live integration audit verifies actual records');
  assert.equal(configuredFeedCopy.status,'public-feed-configured-inventory-awaiting-live-integration-proof');
  assert.equal(configured.enquiryUrl.href,'https://forms.example.invalid/ovyx-qa');
  assert.match(module.makeEvaluationPrompt({industry:'saas',prompt:'A site prompt.'},configured),/dryRun:false/);
  assert.doesNotMatch(module.makeEvaluationPrompt({industry:'saas',prompt:'A site prompt.'},configured),/dryRun:true/);
  const generatedPrompt=module.makeEvaluationPrompt({
    industry:'real-estate',
    prompt:'No real property inventory feed or client contact details are supplied. Show a clear honest live-inventory-not-connected empty state, or only visibly labelled illustrative sample cards.'
  },configured);
  assert.match(generatedPrompt,/https:\/\/feed\.example\.invalid\/v1\/properties/);
  assert.match(generatedPrompt,/Fetch the supplied property feed/);
  assert.match(generatedPrompt,/primary Contact page form action/);
  assert.match(module.qualityContractFor(configured),/two separate forms/);
  process.env.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY='unverified';
  assert.equal(module.publicIntegrationSettings().listingsUrl,null,'An undeclared listing feed must not be passed off as authoritative.');
  process.env.OVYX_EVAL_LISTINGS_PUBLIC_BROWSER_URL='https://feed.example.invalid/v1/properties?api_key=must-not-appear';
  process.env.OVYX_EVAL_LISTINGS_SOURCE_AUTHORITY='authoritative';
  assert.equal(module.publicIntegrationSettings().listingsUrl,null,'Credential-bearing feed URLs must never be placed into generated browser code.');
  process.env.OVYX_EVAL_PUBLIC_ENQUIRY_URL='';
  assert.equal(module.publicIntegrationSettings().enquiryUrl,null,'Enquiry routing requires an owner-approved public destination.');
  console.log('Live-generation evaluation refuses to report success when no real AI provider secret is configured.');
} finally {
  for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  if(saved.OVYX_EVAL_PROVIDER===undefined)delete process.env.OVYX_EVAL_PROVIDER;else process.env.OVYX_EVAL_PROVIDER=saved.OVYX_EVAL_PROVIDER;
  if(saved.OVYX_EVAL_MODEL===undefined)delete process.env.OVYX_EVAL_MODEL;else process.env.OVYX_EVAL_MODEL=saved.OVYX_EVAL_MODEL;
}
