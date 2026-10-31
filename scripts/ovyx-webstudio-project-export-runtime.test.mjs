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
  'index.html': '<!doctype html><img src="https://firebasestorage.googleapis.com/v0/b/ovyx/o/hero.png?alt=media&token=secret-download-token"><source srcset="https://firebasestorage.googleapis.com/v0/b/ovyx/o/hero.png?alt=media&amp;token=secret-download-token">',
  '.env.example': 'DATABASE_URL=replace-me',
  '../escape.js': 'must not export',
  'CON.txt': 'reserved Windows device name',
  'bad:name.js': 'invalid Windows path character',
  'src/app.js': 'first case-collision path',
  'SRC/App.js': 'second case-collision path',
};

const assetUrl = 'https://firebasestorage.googleapis.com/v0/b/ovyx/o/hero.png?alt=media&token=secret-download-token';
let assetListCalls = 0;
const window = {
  WebStudio: { graph: { files }, ensureProjectGraph() {} },
  KernelState: { activeProject: { id: 'northstar-1', name: 'Northstar Platform' } },
  OVYXAssetStore: {
    async list(projectId) {
      assetListCalls += 1;
      assert.equal(projectId, 'northstar-1');
      return [{
        id: 'asset_12345678',
        name: 'hero.png',
        size: 4,
        contentType: 'image/png',
        storagePath: 'users/user-1/projects/northstar-1/assets/asset_12345678/hero.png',
      }];
    },
    async url(asset) {
      assert.equal(asset.id, 'asset_12345678');
      return assetUrl;
    },
  },
  async fetch(url, options) {
    assert.equal(url, assetUrl);
    assert.equal(options.credentials, 'omit');
    return {
      ok: true,
      status: 200,
      headers: { get() { return 'image/png'; } },
      async blob() { return new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' }); },
    };
  },
  addEventListener() {},
  setTimeout() {},
  showToast(message, kind) { window.lastToast = { message, kind }; },
};
let downloadedBlob = null;
let downloadedName = '';
const urlApi = {
  createObjectURL(blob) { downloadedBlob = blob; return 'blob:ovyx-export-test'; },
  revokeObjectURL() {},
};
const document = {
  readyState: 'loading',
  body: { appendChild() {} },
  addEventListener() {},
  getElementById() { return null; },
  createElement() {
    return {
      style: {},
      click() {},
      remove() {},
      set href(value) { this._href = value; },
      set download(value) { downloadedName = value; },
    };
  },
};
vm.runInNewContext(runtime, {
  window, document, URL: urlApi, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, DataView, Blob,
  Date, JSON, Object, String, Math, RegExp, Error, Promise, Number, Array, Set, Map,
});

const exporter = window.OVYXWebStudioProjectExport;
assert.ok(exporter, 'The project export API must be registered.');
assert.equal(exporter.version, '2.2.0');
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

const prepared = await exporter.prepare();
assert.equal(prepared.ok, true);
assert.equal(prepared.assetStorage.includedCount, 1);
assert.equal(prepared.assetStorage.excludedCount, 0);
assert.equal(prepared.assetStorage.rewrittenReferences, 2);
assert.ok(prepared.excluded.some(item => /duplicate or case-insensitive path collision/i.test(item.reason)));
assert.ok(prepared.excluded.some(item => item.path === '../escape.js'));
assert.ok(!prepared.files.some(file => file.path.includes('..') || file.path === 'CON.txt' || file.path === 'bad:name.js'));
assert.ok(prepared.files.some(file => file.path === 'assets/asset-12345678/hero.png' && file.size === 4));
assert.equal(prepared.assetStorage.files[0].referenceRewriteCount, 2);

const preparedWebsite = await exporter.prepare({ mode: 'website-only' });
assert.equal(preparedWebsite.ok, true);
assert.ok(preparedWebsite.files.some(file => file.path === 'assets/asset-12345678/hero.png'));
assert.ok(preparedWebsite.framework.warnings.some(item => /colocate server routes/i.test(item)));

const preparedBackend = await exporter.prepare({ mode: 'backend-only' });
assert.equal(preparedBackend.ok, true);
assert.equal(preparedBackend.assetStorage.status, 'excluded-by-design');
assert.ok(!preparedBackend.files.some(file => file.path.startsWith('assets/')));
assert.equal(assetListCalls, 2, 'Backend-only export must not fetch website media.');

await exporter.export({ mode: 'complete' });
assert.ok(downloadedBlob instanceof Blob, 'Complete export must create a ZIP Blob.');
assert.match(downloadedName, /-source-.*\.zip$/);
const archiveBytes = new Uint8Array(await downloadedBlob.arrayBuffer());
const archiveView = new DataView(archiveBytes.buffer);
assert.equal(archiveView.getUint32(0, true), 0x04034B50, 'ZIP must begin with a valid local file header.');
const archiveFiles = new Map();
let archiveOffset = 0;
while (archiveOffset + 30 <= archiveBytes.length && archiveView.getUint32(archiveOffset, true) === 0x04034B50) {
  const compressedSize = archiveView.getUint32(archiveOffset + 18, true);
  const nameLength = archiveView.getUint16(archiveOffset + 26, true);
  const extraLength = archiveView.getUint16(archiveOffset + 28, true);
  const nameStart = archiveOffset + 30;
  const dataStart = nameStart + nameLength + extraLength;
  const name = new TextDecoder().decode(archiveBytes.slice(nameStart, nameStart + nameLength));
  archiveFiles.set(name, archiveBytes.slice(dataStart, dataStart + compressedSize));
  archiveOffset = dataStart + compressedSize;
}
assert.ok(archiveFiles.has('assets/asset-12345678/hero.png'));
assert.ok(archiveFiles.has('OVYX_EXPORT_MANIFEST.json'));
assert.deepEqual(Array.from(archiveFiles.get('assets/asset-12345678/hero.png')), [137, 80, 78, 71]);
assert.equal(archiveView.getUint32(archiveBytes.length - 22, true), 0x06054B50, 'ZIP must end with a valid end-of-central-directory record.');
assert.equal(archiveView.getUint16(archiveBytes.length - 22 + 10, true), archiveFiles.size, 'ZIP central-directory entry count must match local entries.');
const archivedHtml = new TextDecoder().decode(archiveFiles.get('index.html'));
assert.match(archivedHtml, /assets\/asset-12345678\/hero\.png/);
assert.doesNotMatch(archivedHtml, /secret-download-token/, 'Firebase download tokens must not leak into exported source.');
const archivedManifest = JSON.parse(new TextDecoder().decode(archiveFiles.get('OVYX_EXPORT_MANIFEST.json')));
assert.equal(archivedManifest.framework.name, 'Next.js');
assert.equal(archivedManifest.assetStorage.includedCount, 1);
assert.equal(archivedManifest.assetStorage.rewrittenReferences, 2);

window.fetch = async () => ({ ok: false, status: 403 });
const failedAssetPreparation = await exporter.prepare();
assert.equal(failedAssetPreparation.ok, true, 'Text source export remains available when stored media cannot be retrieved.');
assert.equal(failedAssetPreparation.assetStorage.status, 'unavailable');
assert.equal(failedAssetPreparation.assetStorage.excludedCount, 1);
assert.ok(failedAssetPreparation.excluded.some(item => /HTTP 403/.test(item.reason)));

window.WebStudio.graph.files = {
  'package.json': JSON.stringify({
    name: 'static-next-site',
    scripts: { build: 'next build' },
    dependencies: { next: '15.0.0', react: '19.0.0', 'react-dom': '19.0.0' },
  }),
  'package-lock.json': '{}',
  'next.config.js': "module.exports = { output: 'export' };",
  'app/page.tsx': 'export default function Page(){return <main>Static page</main>}',
};
const staticNext = exporter.inspect();
assert.equal(staticNext.framework.name, 'Next.js');
assert.equal(staticNext.framework.runtimeProfile, 'static-site');
assert.equal(staticNext.framework.deploymentTarget, 'static-hosting-after-build');

const unsupported = exporter.inspect({ mode: 'framework-only' });
assert.equal(unsupported.ok, false);
assert.match(unsupported.error, /Unsupported export mode/);

console.log('OVYX framework-aware export preflight, Next.js detection, nested backend manifests, split ZIP boundaries and honest deployment guidance passed.');
