import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-template-library.js');
const middleware = read('functions/_middleware.js');
const publicRoute = read('functions/api/templates/published.js');
const projectRoute = read('functions/api/projects.js');

assert.match(middleware, /ovyx-template-library\.js\?v=/, 'The dedicated Templates runtime must load through the Pages middleware.');
assert.match(runtime, /fetch\('\/api\/templates\/published\?'|fetch\('\/api\/templates\/published\?'/, 'The gallery must use the published server catalogue.');
assert.match(runtime, /Authorization:\s*'Bearer '\s*\+\s*token/, 'Published catalogue requests must use the current Firebase identity.');
assert.match(runtime, /cache:\s*'no-store'/, 'Template entitlement data must not be cached in the browser.');
assert.match(runtime, /state\.category === 'All' \|\| item\.category === state\.category/, 'Category filters must apply to the server catalogue.');
assert.match(runtime, /state\.query/, 'The catalogue must support search.');
assert.match(runtime, /state\.pageToken/, 'The catalogue must support server pagination.');
assert.match(runtime, /item\.previewUrl/, 'The gallery must use the published preview media.');
assert.match(runtime, /data-ovyx-template-action="preview"/, 'Every template must expose a working preview action.');
assert.match(runtime, /function openPreview/, 'The preview action must open an accessible details surface.');
assert.match(runtime, /window\.ProjectStore\?\.save\?\.\(\)/, 'Using a template must use the canonical project save path.');
assert.match(runtime, /ProjectCloudSync\?\.scheduleSyncActive/, 'Using a template must schedule authenticated cloud sync.');
assert.doesNotMatch(runtime, /localStorage\.setItem\(['"]ovyx\.projects\.v21/, 'The Templates page must not write projects directly to the retired local-storage key.');
assert.match(runtime, /The template library could not load/, 'API failures must be distinguishable from an empty catalogue.');
assert.match(publicRoute, /resolveEntitlements/);
assert.match(publicRoute, /adaptTemplateForUser/);
assert.match(publicRoute, /if \(!locked\) result\.pages = legacyPages/, 'Locked templates must not disclose deployable page content.');
assert.match(projectRoute, /method==='POST'/, 'Template-created projects must persist through the existing authenticated Projects API.');
assert.match(projectRoute, /setFirestoreDocumentAtPath/, 'Project writes must use the existing server-owned Firestore path.');

console.log('OVYX template library contract passed: server-owned catalogue, search/filter/pagination, preview media, honest error states, and canonical project persistence.');
