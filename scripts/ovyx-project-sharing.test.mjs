import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [api, projects, helper, asset, middleware, html, css] = await Promise.all([
  read('functions/api/project-sharing.js'),
  read('functions/api/projects.js'),
  read('functions/api/_lib/firebase-admin.js'),
  read('assets/ovyx-project-sharing.js'),
  read('functions/_middleware.js'),
  read('index.html'),
  read('assets/css/ovyx-project-sharing.css'),
]);

assert.match(api, /export async function onRequest/, 'The sharing API must expose its Pages handler.');
assert.match(projects, /export async function onRequest/, 'The projects API must expose its Pages handler.');
assert.doesNotThrow(() => new vm.Script(asset), 'The sharing UI must parse.');
assert.match(api, /authenticateRequest/, 'All owner actions must require Firebase authentication.');
assert.match(api, /tokenHash/, 'Only a one-way token digest may be stored.');
assert.match(api, /crypto\.subtle\.digest\('SHA-256'/, 'Share tokens must be hashed before storage.');
assert.match(api, /status: 'revoked'/, 'Revocation must disable access.');
assert.match(api, /expiresAt/, 'View-only links must expire.');
assert.match(api, /INVITE_EMAIL_MISMATCH/, 'Invitations must be accepted by the invited email only.');
assert.match(api, /RESEND_API_KEY/, 'Email delivery must use server-side provider credentials.');
assert.match(api, /listFirestoreSubcollectionDocumentsAtPath/, 'Sharing records must be stored in the project-owned Firestore subcollection.');
assert.match(helper, /export async function listFirestoreSubcollectionDocumentsAtPath/, 'Nested share records need a server-side Firestore list helper.');
assert.match(projects, /sharedProjectMembership/, 'Project reads and writes must resolve accepted collaborators.');
assert.match(projects, /membership\.role!=='editor'/, 'Viewer access must not authorize project writes.');
assert.match(projects, /sharingAccess:\{role:membership\.role,owner:false/, 'Shared projects must carry server-authorized role metadata.');
assert.match(api, /publicProject\(project\)/, 'Public share links must return a safe project summary rather than raw project data.');
assert.match(asset, /data-share-create/, 'Owners must be able to create view-only links.');
assert.match(asset, /data-share-invite-form/, 'Owners must be able to invite by email.');
assert.match(asset, /data-revoke/, 'Owners must be able to revoke access.');
assert.match(asset, /data-role/, 'Owners must be able to change invitation permissions.');
assert.match(asset, /accept-invite/, 'Invitees need an authenticated acceptance flow.');
assert.match(html, /id="view-sharing"/, 'Sharing must be a dedicated routed page.');
assert.match(html, /data-nav="sharing"/, 'Sharing must have its own sidebar navigation item.');
assert.match(middleware, /ovyx-project-sharing\.js\?v=20261114-1/, 'The sharing runtime must load from the app shell.');
assert.match(middleware, /ovyx-project-sharing\.css\?v=20261114-1/, 'The sharing page stylesheet must load from the app shell.');
assert.match(css, /prefers-reduced-motion/, 'The sharing page must respect reduced-motion preferences.');

console.log('OVYX project sharing security and UI contract checks passed.');
