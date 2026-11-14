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
assert.match(projects, /sharedMembership\.role!=='editor'/, 'Viewer access must not authorize project writes.');
assert.match(projects, /sharingAccess:\{role:membership\.role,owner:false/, 'Shared projects must carry server-authorized role metadata.');
assert.match(api, /publicProject\(project\)/, 'Public share links must return a safe project summary rather than raw project data.');
assert.match(api, /recordActivity/, 'Sharing actions must be recorded in the project activity timeline.');
assert.match(api, /action === 'presence'/, 'Collaborators must be able to send an authenticated presence heartbeat.');
assert.match(api, /lastSeenAt/, 'Presence must expose a last-seen timestamp.');
assert.match(projects, /event:'project_updated'/, 'Project saves must appear in the activity timeline.');
assert.match(asset, /data-activity-list/, 'The Sharing page must render recent project activity.');
assert.match(asset, /data-presence-list/, 'The Sharing page must show collaborator presence.');
assert.match(asset, /LIVE WEBSITE PREVIEW/, 'Public links must show a read-only preview for published sites.');
assert.match(asset, /data-share-create/, 'Owners must be able to create view-only links.');
assert.match(asset, /current\.reload\(\)/, 'Sharing must reload Firebase account verification state when a token is stale.');
assert.match(asset, /current\.getIdToken\(true\)/, 'Sharing must retry once with a refreshed Firebase ID token after email verification.');
assert.match(asset, /result\.body\.code === 'EMAIL_NOT_VERIFIED'/, 'Sharing must keep the server-side verified-email requirement and show a clear message.');
assert.match(asset, /data-share-invite-form/, 'Owners must be able to invite by email.');
assert.match(asset, /data-revoke/, 'Owners must be able to revoke access.');
assert.match(asset, /data-role/, 'Owners must be able to change invitation permissions.');
assert.match(asset, /accept-invite/, 'Invitees need an authenticated acceptance flow.');
assert.match(html, /id="view-sharing"/, 'Sharing must be a dedicated routed page.');
assert.match(html, /data-nav="sharing"/, 'Sharing must have its own sidebar navigation item.');
assert.match(html, /data-mobile-nav="sharing"/, 'Sharing must also appear in the dedicated mobile drawer navigation.');
assert.match(middleware, /ovyx-project-sharing\.js\?v=20261114-6/, 'The sharing runtime must load from the app shell.');
assert.match(middleware, /ovyx-project-sharing\.css\?v=20261114-6/, 'The sharing page stylesheet must load from the app shell.');
assert.match(css, /prefers-reduced-motion/, 'The sharing page must respect reduced-motion preferences.');

console.log('OVYX project sharing security and UI contract checks passed.');

assert.match(api, /const validEmail = value => \/\^\[\^@\\s\]\+@\[\^@\\s\]\+\\\.\[\^@\\s\]\+\$\//, 'Email validation must accept normal email addresses.');
assert.match(api, /btoa\(binary\)\.replace\(\/\\\+\/g/, 'Share tokens must be base64url normalized.');

assert.match(api, /action === 'send-member-request'/, 'Owners must be able to send direct member requests.');
assert.match(api, /action === 'accept-member-request'/, 'Direct member access must require recipient acceptance.');
assert.match(api, /action === 'decline-member-request'/, 'Recipients must be able to decline direct requests.');
assert.match(api, /share_requests/, 'Direct requests must be stored in a recipient-specific inbox.');
assert.match(api, /targetUid, targetEmail, role, status: 'pending'/, 'A direct request must remain pending before acceptance.');
assert.match(api, /lookupFirebaseAccountByEmail/, 'Target UIDs must be resolved by the server.');
assert.match(helper, /export async function lookupFirebaseAccountByEmail/, 'Firebase Admin must resolve target accounts by email.');
assert.match(helper, /accounts:lookup/, 'Target lookup must use the Firebase Admin Identity Toolkit endpoint.');
assert.match(asset, /data-share-member-form/, 'Owners need a direct member request form.');
assert.match(asset, /data-member-inbox/, 'Recipients need an in-app request inbox.');
assert.match(asset, /data-member-accept/, 'Recipients must be able to accept a direct request.');
assert.match(asset, /data-member-decline/, 'Recipients must be able to decline a direct request.');
assert.match(asset, /send-member-request/, 'The Sharing page must submit direct member requests.');

assert.match(asset, /window\.ProjectStore\?\.list\?\.\(\)/, 'Sharing must read projects from the canonical ProjectStore inventory.');
assert.match(asset, /function requireProject\(\)/, 'Sharing actions must explain when no project is selected instead of silently doing nothing.');
assert.match(asset, /if \(selected && projects\.some\(item => String\(item\.id\) === selected\)\) \{ state\.projectId = selected; select\.value = selected; \}/, 'A project already selected in the dropdown must also populate the action state.');
assert.match(asset, /if \(!requireProject\(\)\) return;/, 'Link, email and direct-member actions must require a selected project with visible feedback.');

assert.match(api, /OWNER_EMAIL_INVALID/, 'A malformed signed-in owner email must be distinguished from a missing session.');
assert.match(api, /error: code, message, code/, 'Sharing API errors must expose a stable code and a separate human-readable message.');
assert.match(asset, /result\.body\.message \|\| result\.body\.error/, 'Sharing UI must display the API explanation instead of an opaque error code.');
assert.match(asset, /message \+ ' \(' \+ code \+ '\)'/, 'Sharing UI must include a safe diagnostic code for support.');
