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
const providers = read('functions/_lib/providers.js');
const assistant = read('functions/api/ai/assistant.js');
const gateway = read('functions/api/ai/gateway.js');
const multipage = read('functions/_lib/studio-multipage.js');
const packageJson = JSON.parse(read('package.json'));

for (const path of [
  'assets/ovyx-settings-reliability.js',
  'functions/api/settings/profile.js',
  'functions/api/settings/preferences.js',
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
assert.ok(html.includes('/assets/ovyx-settings-reliability.js?v=20261015-2'), 'The audited Settings runtime must load in the application shell.');
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
  'stopImmediatePropagation()',
  'installLivePreviewBridge',
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
assert.match(deletionApi, /deleteStoragePrefix\(context\.env, `users\/\$\{uid\}\/`\)/);
assert.match(deletionApi, /deleteStoragePrefix\(context\.env, `profile\/\$\{uid\}\/`\)/, 'Account deletion must remove profile avatars saved by Settings.');
assert.match(deletionApi, /assertFreshAuth/);
assert.match(deletionApi, /X-OVYX-Account-Deletion/);

assert.match(providers, /providerRouting/);
assert.match(providers, /preferredProvider/);
assert.match(assistant, /preferredProvider: String\(payload\.preferredProvider/);
assert.match(gateway, /preferredProvider: String\(payload\.preferredProvider/);
assert.match(multipage, /preferredProvider/);
assert.match(multipage, /providerRouting/);

assert.ok(packageJson.scripts.test.includes('scripts/ovyx-settings-actions.test.mjs'), 'Settings action regressions must run in the npm test chain.');
assert.doesNotMatch(runtime, /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i, 'The Settings runtime must not contain a literal access token.');
assert.doesNotMatch(runtime, /(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,})/, 'The Settings runtime must not contain provider credentials.');

console.log('OVYX Settings actions tests passed: server-backed profile and notification preferences, account cleanup, usage lookup, actual workspace toggle effects, editor mode, and AI preference routing.');
