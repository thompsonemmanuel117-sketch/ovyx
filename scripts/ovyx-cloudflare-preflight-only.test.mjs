import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/ovyx-webstudio-live-generation.yml', import.meta.url), 'utf8');
const client = await readFile(new URL('./ovyx-cloudflare-live-generation-client.mjs', import.meta.url), 'utf8');
const route = await readFile(new URL('../functions/api/internal/live-generation-eval.js', import.meta.url), 'utf8');

// Keep provider readiness, the budgeted one-site smoke, and full acceptance separate.
assert.match(workflow, /operation:\s*\n\s+description: Run a small readiness check, one budgeted site smoke, or full four-site acceptance\s*\n\s+required: true\s*\n\s+type: choice\s*\n\s+options:\s*\n\s+- preflight-only\s*\n\s+- stage4-site-smoke\s*\n\s+- full-acceptance\s*\n\s+default: preflight-only/);
assert.ok(workflow.includes("OVYX_EVAL_PREFLIGHT_ONLY: ${{ (github.event_name != 'workflow_dispatch' && !contains(github.event.head_commit.message, '[OVYX_FULL_ACCEPTANCE_ONCE]') && !contains(github.event.head_commit.message, '[OVYX_STAGE4_SITE_SMOKE_ONCE]')) || (github.event_name == 'workflow_dispatch' && inputs.operation == 'preflight-only') }}"), 'ordinary pushes must stay preflight-only, except explicit one-time full-acceptance or bounded-smoke markers');
assert.match(workflow, /default: preflight-only/);

const providerSelector = workflow.slice(workflow.indexOf('      provider:'), workflow.indexOf('\n  push:', workflow.indexOf('      provider:')));
assert.ok(providerSelector.includes('- cloudflare-workers-ai') && providerSelector.includes('default: cloudflare-workers-ai'),
  'the manual full-acceptance selector must offer the existing Cloudflare Workers AI runtime as its safe default, not a stale third-party provider');
assert.ok(providerSelector.includes('- automatic'),
  'operators must be able to test OVYX automatic routing when they explicitly choose it');

assert.ok(workflow.includes("if: github.ref == 'refs/heads/main' && ((github.event_name == 'push' && !contains(github.event.head_commit.message, '[OVYX_FULL_ACCEPTANCE_ONCE]') && !contains(github.event.head_commit.message, '[OVYX_STAGE4_SITE_SMOKE_ONCE]')) || (github.event_name == 'workflow_dispatch' && inputs.operation == 'preflight-only'))"), 'provider-only enforcement must exclude both one-time live generation markers');
const siteEvidenceCondition = /if: always\(\) && github\.ref == 'refs\/heads\/main' && \(\(github\.event_name == 'workflow_dispatch' && \(inputs\.operation == 'full-acceptance' \|\| inputs\.operation == 'stage4-site-smoke'\)\) \|\| \(github\.event_name == 'push' && \(contains\(github\.event\.head_commit\.message, '\[OVYX_FULL_ACCEPTANCE_ONCE\]'\) \|\| contains\(github\.event\.head_commit\.message, '\[OVYX_STAGE4_SITE_SMOKE_ONCE\]'\)\)\)\)/g;
assert.equal((workflow.match(siteEvidenceCondition) || []).length, 3,
  'browser, integration reporting and audit must run for full acceptance and explicitly requested site smoke');
const fullAcceptanceCondition = /if: always\(\) && github\.ref == 'refs\/heads\/main' && \(\(github\.event_name == 'workflow_dispatch' && inputs\.operation == 'full-acceptance'\) \|\| \(github\.event_name == 'push' && contains\(github\.event\.head_commit\.message, '\[OVYX_FULL_ACCEPTANCE_ONCE\]'\)\)\)/g;
assert.equal((workflow.match(fullAcceptanceCondition) || []).length, 1,
  'the strict listing/enquiry completion gate must remain exclusive to full acceptance');
assert.match(workflow, /Enforce routine no-inference check or explicit provider preflight result[\s\S]*?GENERATION_OUTCOME: \$\{\{ steps\.generate\.outcome \}\}/);
assert.ok(workflow.includes("OVYX_EVAL_SKIP_LIVE_INFERENCE: ${{ github.event_name == 'push' && !contains(github.event.head_commit.message, '[OVYX_FULL_ACCEPTANCE_ONCE]') && !contains(github.event.head_commit.message, '[OVYX_STAGE4_SITE_SMOKE_ONCE]') }}"),
  'ordinary main pushes must select the no-inference path while explicit full acceptance and bounded site smoke retain model calls');
assert.match(client, /const SKIP_LIVE_INFERENCE = process\.env\.OVYX_EVAL_SKIP_LIVE_INFERENCE === 'true'/);
assert.match(client, /if \(SKIP_LIVE_INFERENCE && !SITE_SMOKE && process\.env\.OVYX_EVAL_PREFLIGHT_ONLY !== 'true'\)/,
  'no-inference mode must be rejected for a generation run outside routine preflight-only checks');
assert.match(client, /routine-push-inference-skipped[\s\S]*?liveInferencePerformed: false[\s\S]*?await preflightProvider\(origin, provider, model\)/);
assert.match(client, /status: skippedInference \? 'deployment-and-config-verified-no-ai-inference' : 'provider-preflight-passed-no-sites-generated'/);
assert.match(client, /liveInferencePerformed: !skippedInference/);
assert.match(workflow, /Routine push deployment\/configuration check passed\. No AI inference was requested/);
assert.match(workflow, /OVYX_EVAL_SITE_SMOKE: .*inputs\.operation == 'stage4-site-smoke'/);
assert.ok(workflow.includes("contains(github.event.head_commit.message, '[OVYX_STAGE4_SITE_SMOKE_ONCE]')"),
  'the bounded smoke marker must select the one-site budgeted generation path without enabling full acceptance');
assert.match(workflow, /stage4-site-smoke-gate-report\.json/);

assert.match(client, /const SITE_SMOKE = process\.env\.OVYX_EVAL_SITE_SMOKE === 'true'/);
assert.match(client, /preflightSkippedToAvoidAnExtraBudgetedInference/);
assert.match(client, /stage4-budgeted-smoke/);
assert.match(client, /async function checkBudgetStatus\(origin, options = \{\}\)/);
assert.match(client, /JSON\.stringify\(\{ operation: 'budget-status' \}\)/);
assert.match(client, /stage4-budget-status-report\.json/);
assert.match(client, /budget-exhausted-no-inference/);
assert.ok(client.includes("budgetStatusReport = await checkBudgetStatus(origin);\n    await preflightProvider(origin, provider, model);"),
  'explicit model preflights and full-acceptance inference must check the protected daily ledger before calling a model');
assert.match(client, /budgetStatusReport = await checkBudgetStatus\(origin, \{ failClosed: false, stopIfExhausted: false \}\)/,
  'routine pushes should report ledger status but must not fail a no-inference check solely because the budget is exhausted');
assert.match(client, /budgetLedgerStatus: budgetStatusReport\?\.status/);
assert.match(client, /budgetLedgerResetsAtUtc: budgetStatusReport\?\.resetsAtUtc/);
const mainStart = client.indexOf('async function main()');
const smokeBranch = client.indexOf('if (SITE_SMOKE) {', mainStart);
const budgetCheck = client.indexOf('await checkBudgetStatus(origin);', smokeBranch);
const generateLoop = client.indexOf('const sites = [];', mainStart);
const smokeGenerationCall = client.indexOf('await generateOne(origin, provider, model, settings, caseId);', generateLoop);
assert.ok(smokeBranch > mainStart && budgetCheck > smokeBranch && generateLoop > budgetCheck && smokeGenerationCall > generateLoop,
  'the site smoke must check the guarded budget ledger before reaching its generation loop');
const budgetOperation = route.indexOf("const isBudgetStatus = operation === 'budget-status'");
const budgetHandler = route.indexOf('if (isBudgetStatus) {', budgetOperation);
const integrationStateRead = route.indexOf('let integrationState;', budgetHandler);
assert.ok(budgetOperation >= 0 && budgetHandler > budgetOperation && integrationStateRead > budgetHandler,
  'budget status must return before production integration/provider selection');
assert.match(route, /providerReadinessVerified: false/);
assert.match(route, /inferencePerformed: false/);
assert.match(route, /isCloudflareFreeAllowanceExhausted/);

const guard = client.indexOf("if (process.env.OVYX_EVAL_PREFLIGHT_ONLY === 'true')");
const sitesLoop = client.indexOf('  const sites = [];', guard);
const generateCall = client.indexOf('await generateOne(origin, provider, model, settings, caseId);');
assert.ok(guard > 0, 'client must recognize preflight-only mode');
assert.ok(sitesLoop > guard, 'the no-generation guard must run before the generation loop');
assert.ok(generateCall > sitesLoop, 'the normal site-generation loop remains after the guard');
assert.ok(client.includes("'provider-preflight-passed-no-sites-generated'"),
  'the explicit live preflight mode must keep its own distinct status');
assert.match(client, /realSitesGenerated: 0/);

assert.match(client, /findExactCommitDeployment/);
assert.match(client, /process\.env\.GITHUB_SHA/);
assert.match(client, /cloudflare-pages-exact-commit-deployment-selected/);
assert.match(client, /No successful production Cloudflare Pages deployment matching this exact GitHub commit was found/);
assert.doesNotMatch(client, /return 'https:\/\/' \+ subdomain/,
  'website acceptance must never fall back to the stable canonical hostname when an old release might still be serving');
const deploymentTargetTest = await readFile(new URL('./ovyx-cloudflare-deployment-target.test.mjs', import.meta.url), 'utf8');
assert.match(deploymentTargetTest, /older deployment must never be selected/);
assert.match(deploymentTargetTest, /stable canonical hostname is not an acceptable deployment-specific target/);


console.log('OVYX provider preflight-only safety tests passed.');
