import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/ovyx-webstudio-live-generation.yml', import.meta.url), 'utf8');
const client = await readFile(new URL('./ovyx-cloudflare-live-generation-client.mjs', import.meta.url), 'utf8');

// Keep the small provider check separate from the four potentially billable builds.
assert.match(workflow, /operation:\s*\n\s+description: Run only a small provider readiness check or the full four-site acceptance\s*\n\s+required: true\s*\n\s+type: choice\s*\n\s+options:\s*\n\s+- preflight-only\s*\n\s+- full-acceptance\s*\n\s+default: preflight-only/);
assert.match(workflow, /OVYX_EVAL_PREFLIGHT_ONLY:\s*\$\{\{\s*github\.event_name != 'workflow_dispatch' \|\| inputs\.operation == 'preflight-only'\s*\}\}/);
assert.match(workflow, /default: preflight-only/);
assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.operation == 'preflight-only'\)\)/);
const fullAcceptanceCondition = /if: always\(\) && github\.event_name == 'workflow_dispatch' && inputs\.operation == 'full-acceptance' && github\.ref == 'refs\/heads\/main'/g;
assert.equal((workflow.match(fullAcceptanceCondition) || []).length, 4,
  'browser, listing, enquiry and audit gates must run only after explicit full-acceptance dispatch');
assert.match(workflow, /Enforce provider-only preflight result[\s\S]*?GENERATION_OUTCOME: \$\{\{ steps\.generate\.outcome \}\}/);

const guard = client.indexOf("if (process.env.OVYX_EVAL_PREFLIGHT_ONLY === 'true')");
const sitesLoop = client.indexOf('  const sites = [];', guard);
const generateCall = client.indexOf('await generateOne(origin, provider, model, settings, caseId);');
assert.ok(guard > 0, 'client must recognize preflight-only mode');
assert.ok(sitesLoop > guard, 'the no-generation guard must run before the generation loop');
assert.ok(generateCall > sitesLoop, 'the normal site-generation loop remains after the guard');
assert.match(client, /status: 'provider-preflight-passed-no-sites-generated'/);
assert.match(client, /realSitesGenerated: 0/);

console.log('OVYX provider preflight-only safety tests passed.');
