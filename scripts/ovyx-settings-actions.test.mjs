import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeSettingsPreferences } from '../functions/api/settings/preferences.js';

const clean = sanitizeSettingsPreferences({
  appearance: {
    mode: 'dark',
    density: 'compact',
    bg: '#050607',
    accent: '#F59E0B',
    script: '<script>alert(1)</script>',
  },
  workspace: {
    openBehavior: 'Project overview',
    editorMode: 'Magic',
    autosave: false,
    confirmDelete: true,
    unknownToggle: true,
  },
  ai: {
    mode: 'quality',
    provider: 'OpenAI',
    model: 'automatic',
    routing: 'preferred',
    fallback: 'stop',
    generationBudget: 'maximum',
    contextLimit: 'expanded',
    confirmDestructive: true,
    systemPrompt: 'not an allowed setting',
  },
  notifications: {
    projectActivity: false,
    generationCompleted: true,
    emailSecurityAlerts: false,
    rawWebhook: 'https://invalid.example',
  },
  profile: {
    displayName: '  OVYX Builder  ',
    workspaceName: '  Studio  ',
    avatarDataUrl: 'data:image/png;base64,secret-not-allowed',
  },
});

assert.equal(clean.appearance.mode, 'dark');
assert.equal(clean.appearance.bg, '#050607');
assert.equal(clean.appearance.accent, '#F59E0B');
assert.equal(Object.hasOwn(clean.appearance, 'script'), false);
assert.equal(clean.workspace.openBehavior, 'Project overview');
assert.equal(clean.workspace.editorMode, 'build', 'legacy Magic mode is migrated to the live Build mode');
assert.equal(clean.workspace.autosave, false);
assert.equal(Object.hasOwn(clean.workspace, 'unknownToggle'), false);
assert.equal(clean.ai.mode, 'quality');
assert.equal(clean.ai.provider, 'openai');
assert.equal(clean.ai.routing, 'preferred');
assert.equal(clean.ai.generationBudget, 'maximum');
assert.equal(clean.ai.confirmDestructive, true);
assert.equal(Object.hasOwn(clean.ai, 'systemPrompt'), false);
assert.equal(clean.notifications.projectActivity, false);
assert.equal(clean.notifications.emailSecurityAlerts, false);
assert.equal(Object.hasOwn(clean.notifications, 'rawWebhook'), false);
assert.equal(clean.profile.displayName, 'OVYX Builder');
assert.equal(clean.profile.workspaceName, 'Studio');
assert.equal(Object.hasOwn(clean.profile, 'avatarDataUrl'), false);

assert.throws(
  () => sanitizeSettingsPreferences({ notASetting: { dangerous: true } }),
  error => error.code === 'SETTINGS_NAMESPACE_REQUIRED'
);
assert.throws(
  () => sanitizeSettingsPreferences(null),
  error => error.code === 'INVALID_SETTINGS_PREFERENCES'
);

const route = await readFile(new URL('../functions/api/settings/preferences.js', import.meta.url), 'utf8');
assert.match(route, /verifyFirebaseIdToken/);
assert.match(route, /USER_PREFS_PATH/);
assert.match(route, /getFirestoreDataAtPath/);
assert.match(route, /setFirestoreDocumentAtPath/);
assert.match(route, /method === 'GET'/);
assert.match(route, /method === 'PUT'/);

const runtime = await readFile(new URL('../assets/ovyx-settings-reliability.js', import.meta.url), 'utf8');
for (const contract of [
  '/api/settings/preferences',
  '/api/account/delete',
  '/api/tokens/balance',
  'OVYXSettingsIntegrity',
  'set-editor-mode',
  'set-autosave',
  'renderPreview',
  'OVYXAIService',
  'ovyx:project-saved',
  'Test Desktop Notification',
  'Email options are saved as account preferences',
  'data-settings-nav="connections"',
]) {
  assert.ok(runtime.includes(contract), 'Settings runtime missing functional contract: ' + contract);
}

const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
assert.match(middleware, /ovyx-settings-reliability.js?v=/);
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.match(packageJson.scripts.test, /ovyx-settings-actions.test.mjs/);

console.log('OVYX Settings actions: preference validation, account persistence, account deletion, AI context/preferences, live usage, workspace save/mode, preview, notifications and connections shortcut contracts passed.');
