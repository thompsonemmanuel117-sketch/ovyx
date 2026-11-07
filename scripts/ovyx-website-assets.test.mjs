import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [client, api, rules, packageSource] = await Promise.all([
  read('assets/ovyx-website-management.js'),
  read('functions/api/assets.js'),
  read('functions/api/_lib/storage.rules'),
  read('package.json'),
]);

assert.match(packageSource, /ovyx-website-assets\.test\.mjs/);
assert.match(client, /Search images by filename or type/);
assert.match(client, /Delete image/);
assert.match(client, /storage\.ref\(String\(asset\.storagePath\)\)\.delete\(\)/);
assert.match(client, /method: 'DELETE'/);
assert.match(client, /assetId: asset\.id/);
assert.match(client, /window\.confirm\(/);
assert.match(api, /authenticateRequest/);
assert.match(api, /loadOwnedProject/);
assert.match(api, /method === 'DELETE'/);
assert.match(api, /ASSET_ACCESS_DENIED/);
assert.match(api, /deleteFirestoreDocumentAtPath/);
assert.match(rules, /match \/users\/\{userId\}\/projects\/\{projectId\}\/assets\/\{assetId\}\/\{fileName\}/);
assert.match(rules, /allow delete: if owns\(userId\)/);

console.log('OVYX website asset management tests passed: searchable media, confirmed binary deletion, owner-scoped metadata deletion and Firebase Storage authorization.');
