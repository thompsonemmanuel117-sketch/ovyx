import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const runtime = await readFile(new URL('../assets/ovyx-webstudio-project-export.js', import.meta.url), 'utf8');
const files = {
  'package.json': JSON.stringify({
    name: 'northstar-platform',
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '15.0.0', react: '19.0.0', 'react-dom': '19.0.0' },
  }),
  'package-lock.json': '{}',
  'app/page.tsx': 'export default function Page(){return <main><h1>Northstar</h1></main>}',
  'app/api/contact/route.ts': 'export async function POST(){return Response.json({ok:true})}',
  'server/package.json': JSON.stringify({ name: 'northstar-api', scripts: { start: 'node index.js' } }),
  'server/index.js': 'export function handler(){return true}',
  'public/brand.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  '.env.example': 'DATABASE_URL=replace-me',
};

const window = {
  WebStudio: { graph: { files }, ensureProjectGraph() {} },
  KernelState: { activeProject: { id: 'northstar-1', name: 'Northstar Platform' } },
  addEventListener() {},
};
const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; } };
vm.runInNewContext(runtime, {
  window, document, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, DataView, Blob,
  Date, JSON, Object, String, Math, RegExp, Error, Promise, Number, Array, Set, Map,
});

const exporter = window.OVYXWebStudioProjectExport;
assert.ok(exporter, 'The project export API must be registered.');
assert.equal(exporter.version, '2.1.0');
assert.deepEqual(Array.from(exporter.modes), ['complete', 'website-only', 'backend-only']);

const complete = exporter.inspect();
assert.equal(complete.ok, true);
assert.equal(complete.mode, 'complete');
assert.equal(complete.framework.name, 'Next.js');
assert.equal(complete.framework.confidence, 'high');
assert.equal(complete.framework.installCommand, 'npm ci');
assert.equal(complete.framework.packageManager, 'npm');
assert.equal(complete.framework.recommendedBuildCommand, 'next build');
assert.equal(complete.framework.scripts.start, 'next start');
assert.equal(complete.framework.runtimeProfile, 'framework-or-node-server-runtime');
assert.equal(complete.framework.deploymentTarget, 'hosting-with-compatible-framework-or-server-runtime');
assert.equal(complete.framework.frameworkScaffoldGenerated, false);
assert.ok(complete.framework.packageManifests.includes('server/package.json'));

const website = exporter.inspect({ mode: 'website-only' });
assert.equal(website.ok, true);
assert.ok(website.framework.frontendPathsIncluded.includes('app/page.tsx'));
assert.ok(!website.framework.backendPathsIncluded.includes('app/api/contact/route.ts'));
assert.ok(website.framework.warnings.some(item => /colocate server routes/i.test(item)));

const backend = exporter.inspect({ mode: 'backend-only' });
assert.equal(backend.ok, true);
assert.ok(backend.framework.backendPathsIncluded.includes('app/api/contact/route.ts'));
assert.ok(backend.framework.backendPathsIncluded.includes('server/index.js'));
assert.ok(backend.framework.packageManifests.includes('server/package.json'));

const unsupported = exporter.inspect({ mode: 'framework-only' });
assert.equal(unsupported.ok, false);
assert.match(unsupported.error, /Unsupported export mode/);

console.log('OVYX framework-aware export preflight, Next.js detection, nested backend manifests, split ZIP boundaries and honest deployment guidance passed.');
