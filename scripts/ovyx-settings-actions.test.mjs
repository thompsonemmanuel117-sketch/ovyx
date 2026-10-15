import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeNotificationPreferences, NOTIFICATION_DEFAULTS } from '../functions/api/settings/preferences.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-settings-reliability.js');
const html = read('index.html');
const profileApi = read('functions/api/settings/profile.js');
const preferencesApi = read('functions/api/settings/preferences.js');
const deletionApi = read('functions/api/account/delete.js');
const brandProfileApi = read('functions/api/settings/brand-profile.js');
const connectionsApi = read('functions/api/settings/connections.js');
const revokeSessionsApi = read('functions/api/api/auth/revoke-sessions.js');
const providers = read('functions/_lib/providers.js');
const assistant = read('functions/api/ai/assistant.js');
const gateway = read('functions/api/ai/gateway.js');
const multipage = read('functions/_lib/studio-multipage.js');
const packageJson = JSON.parse(read('package.json'));

for (const path of [
  'assets/ovyx-settings-reliability.js',
  'functions/api/settings/profile.js',
  'functions/api/settings/preferences.js',
  'functions/api/account/delete.js',
  'functions/api/settings/brand-profile.js',
  'functions/api/settings/connections.js',
  'functions/api/api/auth/revoke-sessions.js',
  'functions/_lib/providers.js',
  'functions/_lib/studio-multipage.js',
  'functions/api/ai/assistant.js',
  'functions/api/ai/gateway.js'
]) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../' + path, import.meta.url))], { stdio: 'pipe' });
}

assert.deepEqual(normalizeNotificationPreferences({}), NOTIFICATION_DEFAULTS);
assert.deepEqual(
  normalizeNotificationPreferences({ projectActivity: false, billing: 'false', unexpected: false }),
  { ...NOTIFICATION_DEFAULTS, projectActivity: false },
  'Notification preference parsing must accept only known boolean fields.'
);
assert.ok(html.includes('/assets/ovyx-settings-reliability.js?v=20261015-6'), 'The audited Settings runtime must load in the application shell.');
assert.ok(html.includes('autosaveRecoveryEnabled'), 'Turning autosave off must remove saved recovery snapshots rather than merely change the toggle label.');
assert.equal((html.match(/ovyx-settings-reliability\.js/g) || []).length, 1, 'Settings reliability runtime must only be injected once.');
for (const section of ['general','profile','appearance','workspace','notifications','editor','shortcuts','ai','privacy','security','plan','usage','boosters']) {
  assert.ok(html.includes("['" + section + "'"), 'Settings navigation must retain the ' + section + ' section.');
}
assert.match(html, /id="set-editor-mode"/, 'Default editor mode select must have the same ID the handler reads.');
for (const id of ['set-ai-routing','set-ai-fallback','set-ai-context-limit','set-ai-budget']) {
  assert.ok(html.includes('id="' + id + '"'), 'Advanced AI preference must have a stable id: ' + id);
}

for (const requirement of [
  "api(PROFILE_ENDPOINT, jsonOptions('PUT'",
  "api(NOTIFICATIONS_ENDPOINT, jsonOptions('PUT'",
  "api(QUOTA_ENDPOINT)",
  "fetch('/api/account/delete'",
  "X-OVYX-Account-Deletion': 'CONFIRM'",
  "closest('#profile-save-action, [data-save-profile]')",
  'installGlobalProjectShortcuts',
  'store.createPromptModal',
  'store.save',
  'Project saved on this device.',
  'New project created and saved on this device.',
  "set-profile-name-legacy",
  "set-workspace-name-legacy",
  "ovyx.brand.v1.",
  'stopImmediatePropagation()',
  'installLivePreviewBridge',
  'installWorkspaceControlRecovery',
  'ensureWorkspaceControls',
  'installProjectOpenBehavior',
  'installDataLayerProjectSync',
  'syncActiveProjectMetadataToDataApi',
  'Data API project sync sends project metadata only',
  "const DATA_LAYER_CONFIG_KEY = 'ovyx.data.layer.v1'",
  "Object.assign({ endpoint: '', projectSync: false }",
  'initialiseDataLayerConsent',
  "credentials: 'omit'",
  "store.open = wrapped",
  'payload.preferredProvider',
  'payload.providerRouting',
  'payload.provider = String(prefs.provider).toLowerCase()',
  'limitContextFiles',
  'set-editor-mode'
]) assert.ok(runtime.includes(requirement), 'Settings runtime must have real behavior for: ' + requirement);

assert.match(profileApi, /request\.method === 'GET'/);
assert.match(profileApi, /request\.method !== 'PUT'/);
assert.match(profileApi, /setFirestoreDocumentAtPath/);
assert.match(profileApi, /PROFILE_WRITE_UNCONFIRMED/);
assert.match(profileApi, /enforceSameOrigin/);
assert.match(preferencesApi, /request\.method === 'GET'/);
assert.match(preferencesApi, /request\.method !== 'PUT'/);
assert.match(preferencesApi, /PREFERENCES_WRITE_UNCONFIRMED/);
assert.match(preferencesApi, /enforceSameOrigin/);
assert.match(deletionApi, /deleteFirestoreDocumentTree/);
assert.ok(deletionApi.includes("deleteFirestoreDocumentTree(context.env, 'users', email)"), 'Deletion removes email-keyed Settings data for brand identity and Universal Connections.');
assert.match(deletionApi, /emailScopedDocumentsDeleted/);
assert.match(deletionApi, /deleteStoragePrefix\(context\.env, `users\/\$\{uid\}\/`\)/);
assert.match(deletionApi, /deleteStoragePrefix\(context\.env, `profile\/\$\{uid\}\/`\)/, 'Account deletion must remove profile avatars saved by Settings.');
assert.match(deletionApi, /assertFreshAuth/);
assert.ok(deletionApi.includes('const RECENT_AUTH_SECONDS = 4 * 60'), 'Server account deletion must use a conservative recent-auth window.');
assert.ok(runtime.includes('Date.now() / 1000 - authTime > 240'), 'Client account deletion must enforce the same recent-auth window before erasing cloud data.');
assert.match(deletionApi, /X-OVYX-Account-Deletion/);
assert.match(brandProfileApi, /setFirestoreDocumentAtPath/);
assert.match(brandProfileApi, /deleteFirestoreDocumentAtPath/);
assert.ok(brandProfileApi.includes("['users', identity.email, 'brand_profile', 'config']"));
assert.match(connectionsApi, /testUserConnection/);
assert.match(connectionsApi, /setFirestoreDocumentAtPath/);
assert.ok(connectionsApi.includes("['users', auth.email, 'universal_connections']"));
assert.match(revokeSessionsApi, /enforceSameOrigin/);
assert.match(revokeSessionsApi, /revokeFirebaseRefreshTokens/);
assert.ok(runtime.includes("event.target.closest('#ovyx-security-delete, #profile-delete-action')"), 'Profile and Security deletion buttons must share the same server-confirmed deletion path.');
assert.ok(runtime.includes('Date.now() / 1000 - authTime > 240'), 'Account deletion must enforce the server-matched four-minute recent-authentication window.');
assert.ok(runtime.includes('[data-settings-panel="workspace"]'), 'Recovered workspace controls must target the actual Workspace settings panel.');
assert.ok(runtime.includes("saveDataLayerConfig({ endpoint: endpoint, projectSync: enabled })"), 'The Data API sync switch must persist before reporting success.');
assert.ok(runtime.includes("The Data API returned a non-JSON response"), 'The Data API must not report a successful project write when it cannot verify a JSON response.');
assert.ok(runtime.includes("projectSync === false"), 'Disabling Data API project sync must prevent metadata upload.');
assert.ok(runtime.includes("Project source files and secrets are not uploaded"), 'The optional Data API feature must disclose its metadata-only transfer scope.');

assert.match(providers, /providerRouting/);
assert.match(providers, /preferredProvider/);
assert.match(assistant, /preferredProvider: String\(payload\.preferredProvider/);
assert.match(gateway, /preferredProvider: String\(payload\.preferredProvider/);
assert.match(multipage, /preferredProvider/);
assert.match(multipage, /providerRouting/);

assert.ok(packageJson.scripts.test.includes('scripts/ovyx-settings-actions.test.mjs'), 'Settings action regressions must run in the npm test chain.');
assert.doesNotMatch(runtime, /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i, 'The Settings runtime must not contain a literal access token.');
assert.doesNotMatch(runtime, /(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,})/, 'The Settings runtime must not contain provider credentials.');

console.log('OVYX Settings actions tests passed: server-backed profile and notifications, account and email-scoped cleanup, Brand Identity, live Universal Connection tests, session revocation, usage, workspace toggles, editor mode and AI routing.');
