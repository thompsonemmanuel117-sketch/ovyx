import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/ovyx-webstudio-live-generation.yml', import.meta.url), 'utf8');
const client = await readFile(new URL('./ovyx-cloudflare-live-generation-client.mjs', import.meta.url), 'utf8');

// Keep provider readiness, the budgeted one-site smoke, and full acceptance separate.
assert.match(workflow, /operation:\s*\n\s+description: Run a small readiness check, one budgeted site smoke, or full four-site acceptance\s*\n\s+required: true\s*\n\s+type: choice\s*\n\s+options:\s*\n\s+- preflight-only\s*\n\s+- full-acceptance\s*\n\s+default: preflight-only/);
assert.ok(workflow.includes("OVYX_EVAL_PREFLIGHT_ONLY: ${{ (github.event_name != 'workflow_dispatch' && !contains(github.event.head_commit.message, '[OVYX_FULL_ACCEPTANCE_ONCE]')) || (github.event_name == 'workflow_dispatch' && inputs.operation == 'preflight-only') }}"), 'ordinary pushes must stay preflight-only, unless an explicit one-time acceptance marker is present');
assert.match(workflow, /default: preflight-only/);

const providerSelector = workflow.slice(workflow.indexOf('      provider:'), workflow.indexOf('\n  push:', workflow.indexOf('      provider:')));
assert.ok(providerSelector.includes('- cloudflare-workers-ai') && providerSelector.includes('default: cloudflare-workers-ai'),
  'the manual full-acceptance selector must offer the existing Cloudflare Workers AI runtime as its safe default, not a stale third-party provider');
assert.ok(providerSelector.includes('- automatic'),
  'operators must be able to test OVYX automatic routing when they explicitly choose it');

assert.ok(workflow.includes("if: github.ref == 'refs/heads/main' && ((github.event_name == 'push' && !contains(github.event.head_commit.message, '[OVYX_FULL_ACCEPTANCE_ONCE]')) || (github.event_name == 'workflow_dispatch' && inputs.operation == 'preflight-only'))"), 'the provider-only enforcement step must not run for the one-time full-acceptance push');
const siteEvidenceCondition = /if: always\(\) && github\.ref == 'refs\/heads\/main' && \(\(github\.event_name == 'workflow_dispatch' && \(inputs\.operation == 'full-acceptance' \|\| inputs\.operation == 'stage4-site-smoke'\)\) \|\| \(github\.event_name == 'push' && contains\(github\.event\.head_commit\.message, '\[OVYX_FULL_ACCEPTANCE_ONCE\]'\)\)\)/g;
assert.equal((workflow.match(siteEvidenceCondition) || []).length, 3,
  'browser, integration reporting and audit must run for full acceptance and explicitly requested site smoke');
const fullAcceptanceCondition = /if: always\(\) && github\.ref == 'refs\/heads\/main' && \(\(github\.event_name == 'workflow_dispatch' && inputs\.operation == 'full-acceptance'\) \|\| \(github\.event_name == 'push' && contains\(github\.event\.head_commit\.message, '\[OVYX_FULL_ACCEPTANCE_ONCE\]'\)\)\)/g;
assert.equal((workflow.match(fullAcceptanceCondition) || []).length, 1,
  'the strict listing/enquiry completion gate must remain exclusive to full acceptance');
assert.match(workflow, /Enforce provider-only preflight result[\s\S]*?GENERATION_OUTCOME: \$\{\{ steps\.generate\.outcome \}\}/);
assert.match(workflow, /OVYX_EVAL_SITE_SMOKE: .*inputs\.operation == 'stage4-site-smoke'/);
assert.match(workflow, /stage4-site-smoke-gate-report\.json/);

assert.match(client, /const SITE_SMOKE = process\.env\.OVYX_EVAL_SITE_SMOKE === 'true'/);
assert.match(client, /preflightSkippedToAvoidAnExtraBudgetedInference/);
assert.match(client, /stage4-budgeted-smoke/);

const guard = client.indexOf("if (process.env.OVYX_EVAL_PREFLIGHT_ONLY === 'true')");
const sitesLoop = client.indexOf('  const sites = [];', guard);
const generateCall = client.indexOf('await generateOne(origin, provider, model, settings, caseId);');
assert.ok(guard > 0, 'client must recognize preflight-only mode');
assert.ok(sitesLoop > guard, 'the no-generation guard must run before the generation loop');
assert.ok(generateCall > sitesLoop, 'the normal site-generation loop remains after the guard');
assert.match(client, /status: 'provider-preflight-passed-no-sites-generated'/);
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
