import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
assert.match(api, /loadOwnedProject/);
assert.match(api, /ownerUid/);
assert.match(api, /ownerEmail/);
assert.match(api, /expectedUpdateTime/);
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
assert.match(client, /api\/projects/);
assert.match(client, /api\/site-management/);
assert.match(client, /Restore this earlier website version/);
assert.match(client, /does not claim to rewrite the published HTML/);
assert.match(client, /No estimated or invented traffic/);

console.log('OVYX Stage 8 website-management contracts passed.');
