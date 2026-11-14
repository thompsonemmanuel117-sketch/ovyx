import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const forbiddenBrowserInference = [
  'local-ai-lab.html',
  'assets/ovyx-local-ai-prototype.js',
  'assets/ovyx-local-ai-worker.js',
  'assets/ovyx-local-ai-cpu-worker.js',
];
for (const file of forbiddenBrowserInference) {
  assert.equal(fs.existsSync(path.join(root, file)), false, file + ' must not ship in the Cloudflare-only product.');
}
const packageJson = JSON.parse(read('package.json'));
assert.doesNotMatch(packageJson.scripts.test, /local-ai/i);
assert.doesNotMatch(JSON.stringify(packageJson.dependencies || {}), /web-llm|transformers/i);
assert.doesNotMatch(JSON.stringify(packageJson.devDependencies || {}), /web-llm|transformers/i);

const routes = JSON.parse(read('_routes.json'));
assert.equal(routes.exclude.some(route => /local-ai/i.test(route)), false);
const middleware = read('functions/_middleware.js');
assert.doesNotMatch(middleware, /local-ai-lab|browser-local inference/i);

const routing = read('functions/_lib/cloudflare-routing.js');
assert.match(routing, /cloudflare-workers-ai/);
assert.match(routing, /fallback:\s*'stop'/);
assert.match(routing, /OVYX_ALLOW_PAID_PROVIDER_ROUTING:\s*'false'/);
const generation = read('functions/api/generate.js');
assert.match(generation, /withCloudflareAIOnly/);
assert.match(generation, /runAgent/);
const providerRoutingTest = read('scripts/provider-routing.test.mjs');
assert.match(providerRoutingTest, /No external provider endpoint may be contacted/);

console.log('OVYX Cloudflare-only product boundary tests passed.');
