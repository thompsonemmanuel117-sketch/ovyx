import assert from 'node:assert/strict';
import fs from 'node:fs';

const quality = fs.readFileSync('assets/ovyx-webstudio-quality.js', 'utf8');
const middleware = fs.readFileSync('functions/api/_middleware.js', 'utf8');
const api = fs.readFileSync('functions/api/webstudio/backend-runtime.js', 'utf8');
const worker = fs.readFileSync('backend-runtime/src/index.js', 'utf8');
const workerConfig = fs.readFileSync('backend-runtime/wrangler.jsonc', 'utf8');
const dockerfile = fs.readFileSync('backend-runtime/Dockerfile', 'utf8');
const evaluator = fs.readFileSync('scripts/ovyx-generated-backend-runtime-eval.mjs', 'utf8');
const setup = fs.readFileSync('docs/OVYX-BACKEND-RUNTIME-SETUP.md', 'utf8');

assert.doesNotThrow(() => new Function(quality), 'The Web Studio inspector must parse after backend runtime integration.');
assert.ok(quality.includes("fetch('/api/webstudio/backend-runtime'"), 'The inspector must call the authenticated per-project backend runtime endpoint.');
assert.ok(quality.includes("user.getIdToken()"), 'The inspector must authenticate the backend runtime request with the current Firebase session.');
assert.ok(quality.includes("backendEvidence.status === 'passed'"), 'Backend evidence must be reported only when the isolated evaluator explicitly passes.');
assert.ok(quality.includes("backendEvidence.status === 'not-required'"), 'Static projects must not be forced through backend runtime execution.');
assert.ok(quality.includes("backendEvidence.status === 'failed' || backendEvidence.status === 'blocked'") === false, 'Do not silently convert blocked backend evidence to success.');
assert.ok(middleware.includes("'/api/webstudio/backend-runtime'"), 'The backend runtime route must be integration gated.');
assert.ok(middleware.includes("['/api/webstudio/backend-runtime', ['webStudio']]"), 'Only accounts entitled to Web Studio can run backend checks.');

assert.ok(api.includes('assertAuthenticated(context.data?.user)'), 'The API must require a verified Firebase user.');
assert.ok(api.includes('enforceSameOrigin(context.request)'), 'The API must enforce same-origin browser requests.');
assert.ok(api.includes('OVYX_BACKEND_RUNTIME_SECRET'), 'The Pages API must sign requests with a server-side secret.');
assert.ok(api.includes('x-ovyx-signature'), 'The Pages API must use a signed runtime request.');
assert.ok(api.includes('context.env.OVYX_BACKEND_RUNTIME'), 'The Pages API must support a Cloudflare service binding.');
assert.ok(api.includes('BACKEND_RUNTIME_NOT_CONFIGURED'), 'A missing runtime connection must fail closed and be reported clearly.');
assert.ok(!api.includes('Authorization: Bearer ' + 'token'), 'The Firebase bearer token must not be forwarded to the sandbox Worker.');

assert.ok(worker.includes('enableInternet = false'), 'Generated backend code must run with public Internet disabled.');
assert.ok(worker.includes("allowedHosts = ['npm.registry']"), 'Only the package registry may be allowed during dependency installation.');
assert.ok(worker.includes("request.method === 'GET' || request.method === 'HEAD'") || worker.includes("['GET', 'HEAD'].includes(request.method)"), 'The package registry proxy must be read-only.');
assert.ok(worker.includes('await sandbox.removeAllowedHost(\'npm.registry\')'), 'Package registry egress must be removed before backend tests execute.');
assert.ok(worker.includes('OVYX_QA_NETWORK_ISOLATION=cloudflare-sandbox-no-egress'), 'The evaluator must run only after sandbox egress has been closed.');
assert.ok(worker.includes('await sandbox.destroy()'), 'Each per-project sandbox must be destroyed after its report is returned.');
assert.ok(worker.includes('verifySignature(request, raw, env.OVYX_BACKEND_RUNTIME_SECRET)'), 'The runtime Worker must reject unsigned or stale requests.');
assert.ok(worker.includes('crypto.randomUUID()'), 'Each test run must receive a fresh sandbox identity.');
assert.ok(worker.includes('npm ci --ignore-scripts') && worker.includes('npm install --ignore-scripts'), 'Project dependencies must be installed with lifecycle scripts disabled.');

assert.ok(workerConfig.includes('"class_name": "OvyxBackendSandbox"'), 'Wrangler must register the sandbox Durable Object.');
assert.ok(workerConfig.includes('"image_build_context": ".."'), 'The container image must have the repository root as its build context.');
assert.ok(workerConfig.includes('"new_sqlite_classes": ["OvyxBackendSandbox"]'), 'The sandbox Durable Object must have SQLite-backed storage.');
assert.ok(dockerfile.includes('cloudflare/sandbox:0.12.14'), 'The container image and Sandbox SDK must use the same pinned version.');
assert.ok(dockerfile.includes('scripts/ovyx-generated-backend-runtime-eval.mjs'), 'The production sandbox image must contain the actual Pages/D1 evaluator.');
assert.ok(evaluator.includes("networkMode === 'cloudflare-sandbox-no-egress'"), 'The evaluator must recognize the trusted Cloudflare no-egress container mode.');
assert.ok(evaluator.includes('copyInstalledDependencies'), 'Installed project dependencies must be copied into the disposable Wrangler workspace.');
assert.ok(setup.includes('Workers Paid plan') && setup.includes('OVYX_BACKEND_RUNTIME_SECRET'), 'Deployment prerequisites and shared secret configuration must be documented.');

process.stdout.write('OVYX per-project backend runtime bridge contracts passed.\n');
