import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [provision, status, middleware, engine, deploy, worker, plan, binding] = await Promise.all([
  read('functions/api/backend/provision.js'),
  read('functions/api/backend/status.js'),
  read('functions/api/_middleware.js'),
  read('functions/_lib/website-engine.js'),
  read('functions/api/deploy.js'),
  read('backend-runtime/src/index.js'),
  read('functions/_lib/backend-provisioning.js'),
  read('functions/_lib/backend-pages-preview-binding.js'),
]);

assert.ok(provision.includes('assertAuthenticated(context.data?.user)'), 'Provisioning must require the verified Firebase identity.');
assert.ok(provision.includes("['users', email, 'projects', projectId]"), 'Provisioning must load the canonical saved project.');
assert.ok(provision.includes('assertOwnedSavedProject'), 'Provisioning must enforce server-side project ownership.');
assert.ok(provision.includes('sourceHash'), 'Provisioning must fingerprint the exact saved project source snapshot.');
assert.ok(provision.includes('previewRecord.data.resourceIds?.sourceHash !== sourceHash'), 'Production must only promote the exact source snapshot verified in Preview.');
assert.ok(provision.includes('ovyx-backend-architecture.json'), 'Provisioning must load the saved architecture manifest.');
assert.ok(provision.includes('ovyx-qa-plan.json'), 'Provisioning must load the saved executable backend QA plan.');
assert.ok(provision.includes("callRuntime(context.env, '/evaluate'"), 'Backend acceptance must run before Cloudflare resources are created.');
assert.ok(provision.includes("callRuntime(context.env, '/build-pages'"), 'Pages Functions must be compiled in the isolated build runtime.');
assert.ok(provision.includes("body.environment === 'preview' ? 'preview'"), 'Preview is the default environment for automatic provisioning.');
assert.ok(provision.includes("targetEnvironment === 'production'"), 'Production must be a separate explicit environment path.');
assert.ok(provision.includes("previewRecord.data.state !== 'ready'"), 'Production promotion must require a verified Preview deployment.');
assert.ok(provision.includes('bindProductionD1'), 'Production D1 bindings must be handled by the separate environment adapter.');
assert.ok(provision.includes("form.append('branch'"), 'Preview deployments must use an explicit non-production branch.');
assert.ok(provision.includes('createCloudflareD1Adapter'), 'Database resources and migrations must use the Cloudflare D1 adapter.');
assert.ok(provision.includes('applyMigrations'), 'Versioned migrations must be applied before deployment.');
assert.ok(provision.includes('createCloudflarePagesPreviewBindingAdapter'), 'The customer Pages Preview environment must receive its D1 binding.');
assert.ok(provision.includes("form.append('_worker.bundle'"), 'The direct Pages deployment must include the compiled Worker bundle.');
assert.ok(provision.includes("form.append('_routes.json'"), 'The direct Pages deployment must include the generated Functions routes.');
assert.ok(provision.includes("nextState: 'verifying'"), 'A deployment must remain unready until independent status verification.');
assert.ok(provision.includes('recovery_required'), 'Ambiguous deployment failures must require recovery rather than blind retries.');
assert.ok(provision.includes("if (targetEnvironment === 'production')"), 'Production must require a separate explicit owner action and Preview-readiness gate.');

assert.ok(status.includes('assertOwnedSavedProject'), 'Status polling must re-check saved-project ownership.');
assert.ok(status.includes('current.data.ownerHash') && status.includes('current.data.projectHash'), 'Status polling must verify both owner and project hashes.');
assert.ok(status.includes("nextState: 'ready'"), 'A Preview deployment becomes ready only after verification.');
assert.ok(status.includes('fetch(url'), 'The final Preview URL must pass an independent HTTP smoke test.');
assert.ok(status.includes('applyMigrations'), 'The D1 migration ledger must be re-verified before readiness.');
assert.ok(status.includes("urlParams.get('environment')"), 'Status polling must be environment-specific.');
assert.ok(status.includes("current.data.environment || ''"), 'Status polling must match the durable operation environment.');
assert.ok(status.includes('current.data.resourceIds?.sourceHash !== sourceHash'), 'Status verification must match the deployed saved-project snapshot.');

assert.ok(middleware.includes("'/api/backend/provision'"), 'The provisioning route must be registered with shared API middleware.');
assert.ok(middleware.includes("'/api/backend/status'"), 'The status route must be registered with shared API middleware.');
assert.ok(middleware.includes("['/api/backend/provision', ['webStudio', 'cloudflareDeploy']]"), 'Provisioning must require both Web Studio and deploy entitlements.');

assert.ok(engine.includes("'ovyx-backend-architecture.json': backendArchitectureFile"), 'Generation must persist the trusted architecture manifest with the project files.');
assert.ok(engine.includes("'wrangler.jsonc': JSON.stringify"), 'Generation must persist the Pages Functions compatibility config.');
assert.ok(engine.includes("filePath === 'ovyx-qa-plan.json'"), 'The generated backend response must preserve the executable QA plan.');
assert.ok(engine.includes('Missing or invalid ovyx-qa-plan.json'), 'Missing backend acceptance checks must trigger a source-generation retry.');

assert.ok(deploy.includes("['ovyx-backend-architecture.json','ovyx-qa-plan.json','wrangler.jsonc','wrangler.json'].includes(String(rp))"), 'Static publishing must not expose internal backend manifests or Wrangler configuration.');
assert.ok(plan.includes("databaseBinding: architecture.capabilities.database ? 'DB' : null"), 'Generated Pages Functions must use the expected D1 binding name.');
assert.ok(binding.includes('deployment_configs: { [environment]: nextConfig }'), 'The D1 binding adapter must modify only the explicitly selected environment.');
assert.ok(binding.includes('bindProductionD1'), 'Production D1 binding must be a separate explicit operation.');

assert.ok(worker.includes("'/build-pages'"), 'The isolated runtime must expose the signed Pages build operation.');
assert.ok(worker.includes("await sandbox.removeAllowedHost('npm.registry')"), 'Package-registry egress must be closed before executing the Pages build.');
assert.ok(worker.includes('wrangler pages functions build'), 'The isolated runtime must compile the actual Pages Functions source.');
assert.ok(worker.includes("await sandbox.destroy()"), 'The isolated build sandbox must be destroyed after use.');
assert.ok(worker.includes('bundleBase64'), 'The isolated runtime must return the compiled Worker bundle.');
assert.ok(worker.includes('BUILD_MAX_OUTPUT_BYTES'), 'Worker bundle output must be size bounded.');

console.log('OVYX full-stack Preview provisioning orchestration contracts passed.');
