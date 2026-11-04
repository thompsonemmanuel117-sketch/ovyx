import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeSettings } from '../functions/api/site-management.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [api, client, middleware, packageSource] = await Promise.all([
  read('functions/api/site-management.js'),
  read('assets/ovyx-website-management.js'),
  read('functions/_middleware.js'),
  read('package.json'),
]);

assert.match(packageSource, /ovyx-website-management\.test\.mjs/);
assert.match(middleware, /ovyx-website-management\.js/);
assert.match(api, /authenticateRequest/);
assert.match(api, /from '\.\.\/_lib\/firebase-admin\.js'/, 'The endpoint must use the shared Firebase Admin helpers that support owner-scoped subcollections.');
assert.match(api, /loadOwnedProject/);
assert.match(api, /ownerUid/);
assert.match(api, /ownerEmail/);
assert.match(api, /expectedUpdateTime/);
assert.match(api, /listFirestoreSubcollectionDocumentsAtPath/);
assert.match(api, /setFirestoreDocumentAtPath/);
assert.match(api, /Before website settings update/);
assert.match(api, /Before restoring/);
assert.match(api, /MAX_BACKUPS = 20/);
assert.match(api, /BACKUP_TOO_LARGE/);
assert.match(api, /RESTORE_TOO_LARGE/);
assert.match(api, /not connected to this website yet/);
assert.match(client, /My Websites/);
assert.match(client, /Content/);
assert.match(client, /Media/);
assert.match(client, /Settings/);
assert.match(client, /Backups/);
assert.match(client, /Analytics/);
assert.match(client, /Publishing/);
assert.match(client, /OVYXAssetStore/);
assert.match(client, /function openWorkspace\(\)/, 'The sidebar entry must open the Manage Website hub rather than the source editor.');
assert.match(client, /ProjectStore\.open\(p\.id\)/, 'Selecting a website must activate that exact saved project.');
assert.match(client, /openCodeEditor\(path\)/, 'Manage Website must open the real source editor for the selected file.');
assert.doesNotMatch(client, /launcher\.id = ROOT \+ '-launcher'/, 'The old floating launcher must not remain as a duplicate entry point.');
assert.match(client, /api\/projects/);
assert.match(client, /api\/site-management/);
assert.match(client, /Restore this earlier website version/);
assert.match(client, /do not claim to rewrite the published HTML/);
assert.match(client, /No estimated or invented traffic/);

const normalized = normalizeSettings({
  title: '<script>alert(1)</script>',
  language: '../../invalid',
  navigation: [
    { label: 'Unsafe', path: 'javascript:alert(1)' },
    { label: 'Protocol relative', path: '//attacker.example' },
    { label: 'Traversal', path: '../private' },
    { label: 'Home', path: '/' },
    { label: 'About', path: 'about.html' },
  ],
});
assert.equal(normalized.language, 'en', 'Invalid language tags must normalize to a safe default.');
assert.deepEqual(normalized.navigation.map(item => item.path), ['/', 'about.html'],
  'Navigation must reject script URLs, protocol-relative URLs and path traversal.');
assert.equal(normalized.title, '<script>alert(1)</script>',
  'Settings are stored as text; consumers must escape them when rendering.');

console.log('OVYX Stage 8 website-management contracts passed.');
