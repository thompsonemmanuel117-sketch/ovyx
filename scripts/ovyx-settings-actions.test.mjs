import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeNotificationPreferences, NOTIFICATION_DEFAULTS } from '../functions/api/settings/preferences.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = read('assets/ovyx-settings-reliability.js');
const qualityRuntime = read('assets/ovyx-webstudio-quality.js');
const html = read('index.html');
const coreBrowser = read('scripts/ovyx-settings-core.browser.test.mjs');
const profileApi = read('functions/api/settings/profile.js');
const preferencesApi = read('functions/api/settings/preferences.js');
const deletionApi = read('functions/api/account/delete.js');
const brandProfileApi = read('functions/api/settings/brand-profile.js');
const connectionsApi = read('functions/api/settings/connections.js');
const revokeSessionsApi = read('functions/api/api/auth/revoke-sessions.js');
const providers = read('functions/_lib/providers.js');
const assistant = read('functions/api/ai/assistant.js');
const gateway = read('functions/api/ai/gateway.js');
const agentGenerate = read('functions/api/generate.js');
const multipage = read('functions/_lib/studio-multipage.js');
const packageJson = JSON.parse(read('package.json'));

for (const path of [
  'assets/ovyx-settings-reliability.js',
  'assets/ovyx-webstudio-quality.js',
  'functions/api/settings/profile.js',
  'functions/api/settings/preferences.js',
  'functions/api/account/delete.js',
  'functions/api/settings/brand-profile.js',
  'functions/api/settings/connections.js',
  'functions/api/api/auth/revoke-sessions.js',
  'functions/_lib/providers.js',
  'functions/_lib/studio-multipage.js',
  'functions/api/ai/assistant.js',
  'functions/api/ai/gateway.js',
  'functions/api/generate.js'
]) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../' + path, import.meta.url))], { stdio: 'pipe' });
}

assert.ok(brandProfileApi.includes("['users', identity.email, 'brand_profile', 'config']"), 'Brand Identity settings must use the canonical Firestore profile document.');
assert.ok(agentGenerate.includes("['users', userEmail, 'brand_profile', 'config']"), 'The Engineering Agent must load the same canonical saved brand profile document.');
assert.ok(gateway.includes("['users', userEmail, 'brand_profile', 'config']"), 'Web Studio fresh builds must automatically load saved branding when the request omits an in-session profile.');
assert.ok(gateway.includes('logoConfigured: Boolean(brandProfile.logoDataUrl)'), 'Web Studio must receive compact brand metadata without embedding a large base64 logo into its text prompt.');
assert.ok(gateway.includes('layoutRules: Array.isArray(brandProfile.layoutRules) ? brandProfile.layoutRules.slice(0, 50) : []'), 'Saved brand layout rules must reach the Web Studio build context within a bound.');
assert.deepEqual(normalizeNotificationPreferences({}), NOTIFICATION_DEFAULTS);
assert.deepEqual(
  normalizeNotificationPreferences({ projectActivity: false, billing: 'false', unexpected: false }),
  { ...NOTIFICATION_DEFAULTS, projectActivity: false },
  'Notification preference parsing must accept only known boolean fields.'
);
assert.ok(html.includes('/assets/ovyx-settings-reliability.js?v=20261018-1'), 'The audited Settings runtime must load in the application shell.');
assert.ok(html.includes('autosaveRecoveryEnabled'), 'Turning autosave off must remove saved recovery snapshots rather than merely change the toggle label.');
assert.ok(html.includes("layer.innerHTML=`"), 'The Data Layer renderer must append to its own container instead of replacing the Workspace panel.');
assert.ok(!html.includes("if(!p)return;const c=dbCfg();p.innerHTML=`"), 'The Data Layer renderer must not erase normal Workspace preferences.');
assert.ok(html.includes("window.OVYXDataLayerSettings={projectSyncEnabled()"), 'The Data Layer must expose the real project-sync preference to the sync runtime.');
assert.ok(html.includes("if(window.OVYXDataLayerSettings?.projectSyncEnabled?.()===false)return false;"), 'Paused project sync must block background project writes.');
assert.ok(html.includes("if(window.OVYXDataLayerSettings?.projectSyncEnabled?.()===false){"), 'Paused project sync must not load cloud projects over local state.');
assert.ok(html.includes("Date.now()/1000-authTime>240"), 'The legacy Profile deletion action must match the server four-minute recent-authentication limit.');
assert.ok(html.includes("does not create a database"), 'The custom data endpoint must not be presented as if it were the active project-sync backend.');
assert.ok(html.includes("if(el.matches('[data-theme-delete]')){\n      e.preventDefault();e.stopImmediatePropagation();"), 'Theme Lab delete must have one event owner.');
const themeLabDuplicateOwnerStart=html.indexOf("if(el.matches('[data-theme-duplicate]')){");
const themeLabDuplicateOwnerEnd=html.indexOf("if(el.matches('[data-theme-import]'))",themeLabDuplicateOwnerStart);
const themeLabDuplicateOwner=html.slice(themeLabDuplicateOwnerStart,themeLabDuplicateOwnerEnd);
assert.ok(themeLabDuplicateOwner.includes("const copy={...themeToLab(current(),name),name};") && themeLabDuplicateOwner.includes("localStorage.setItem(LAB_KEY,JSON.stringify(lab.state))") && !themeLabDuplicateOwner.includes('lab.duplicate('), 'Theme Lab Duplicate must create and persist one custom entry without invoking the overlapping legacy side-effect chain.');
assert.ok(html.includes('<script id="ovyx-theme-lab-reset-owner">') && html.includes("window.addEventListener('click',function(e){\n    const button=e.target?.closest?.('[data-theme-reset]');"), 'Theme Lab Reset must have an independent priority window-capture owner outside the guarded Appearance bridge.');
assert.ok(!html.includes("const el=e.target?.closest?.('[data-theme-reset]');\\n    if(!el)return;\\n    const panel=el.closest?.('[data-settings-panel=\"appearance\"]');\\n    if(!panel)return;"), 'Theme Lab Reset must not silently skip its action based on panel ancestry.');
assert.ok(html.includes("this.search('');\n      },\n      hide() {"), 'Command Palette show must leave the palette open after populating its actions.');
assert.ok(html.includes("function save(options){") && html.includes("if(!options?.silent)window.showToast?.('Appearance saved','success');"), 'Canonical appearance save must allow destructive Theme Lab actions to persist without a blocking success toast.');
assert.ok(html.includes("saveCanonical({silent:true});lab.renderState?.();window.OVYXSettings?.renderThemeCards?.();"), 'Theme Lab Delete must save quietly and report success inline.');
assert.ok(html.includes("context.preview(baselineAppearance);") && html.includes("appearanceSaved=context.save({silent:true})!==false;"), 'Theme Lab Reset must save the canonical Appearance baseline quietly and report success inline.');
assert.ok(html.includes("const resetState={active:'obsidian',custom:{...baselineLab},customThemes:{}};\n    lab.state=resetState;\n    try{localStorage.setItem(KEY,JSON.stringify(resetState));}"), 'Theme Lab Reset must persist the empty custom-theme list before applying the canonical baseline.');
assert.ok(html.includes("lab.state=resetState;\n    try{localStorage.setItem(KEY,JSON.stringify(resetState));}") && html.includes("grid?.querySelectorAll('.ovyx-theme-card[data-theme^=\"custom_\"]').forEach(card=>card.remove());"), 'Theme Lab Reset must make the empty custom list authoritative and remove stale Custom cards.');
assert.ok(!html.includes("window.showToast?.('Deleted '+name+'.','success')") && !html.includes("window.showToast?.('OVYX Theme Lab reset to the industrial dark baseline.','success')"), 'Theme Lab Delete/Reset success must avoid synchronous global toast rendering.');
assert.ok(!html.includes("this.root.querySelector('[data-theme-reset]')?.addEventListener('click',()=>ThemeLab.reset())"), 'Theme Lab Reset must not retain the stale legacy panel-level handler.');
assert.ok(html.includes('CommandPalette.init();'), 'Command Palette keyboard shortcuts must actually be registered during startup.');
assert.ok(html.includes("!event.shiftKey && event.key.toLowerCase() === 'z'"), 'Shift+Z must trigger Redo without also triggering Undo.');
assert.ok(!html.includes("this.search('');\n        this.hide();\n      },\n      hide() {"), 'Command Palette show must not immediately close the palette it just opened.');
assert.ok(coreBrowser.includes('active !== previousId') && coreBrowser.includes('previousId: duplicateId'), 'Theme Lab Import must wait for a newly created custom ID instead of accepting the existing duplicate with the same name.');
assert.ok(html.includes("preferredProvider:payload.preferredProvider||''"), 'The final AI request body must forward the saved preferred provider.');
assert.ok(html.includes("providerRouting:payload.providerRouting||'automatic'"), 'The final AI request body must forward the saved routing strategy.');
assert.ok(html.includes("maxTokens:payload.maxTokens||4096"), 'The assistant request must forward the saved generation budget.');
assert.ok(html.includes("maxTokens:payload.maxTokens||4096") && html.includes("preferredProvider:payload.preferredProvider||''"), 'AI preference fields must reach the authenticated API payload, not remain only in localStorage.');
assert.ok(html.includes('Service availability check: GET <endpoint>/health'), 'The Data Layer must describe its service availability check accurately.');
assert.ok(html.includes('Download SQL schema creates a starter file on this device.'), 'The schema download must be described as a starter file, not a live database migration.');
assert.ok(html.includes('Database setup') && html.includes('Not set up'), 'The Data Layer must not imply OVYX automatically provisions a database.');
assert.ok(!html.includes('Production-ready relational storage'), 'The Data Layer must not claim production-ready PostgreSQL before a connection is provisioned and verified.');
assert.ok(html.includes("credentials:'omit',cache:'no-store'"), 'External Data Layer health checks must omit third-party cookies and avoid cached results.');
assert.ok(html.includes('This check confirms only that the service responds. It does not verify data storage or app data operations.'), 'A health response must not be represented as proof of database connectivity or data operations.');
assert.ok(html.includes("'Not verified'") && html.includes("state==='connected'") && html.includes("connected?'Ready'"), 'Publishing readiness must require an explicit successful status, not just a status object.');
assert.ok(html.includes("EMAIL (PREFERENCES ONLY)") && html.includes('this panel does not send email.'), 'Notification email switches must be visibly described as saved preferences only.');
assert.ok(!html.includes('future booster products'), 'Token Boosters must not be labelled as future products while checkout controls exist.');
assert.ok(html.includes('Checkout requires sign-in and an available payment provider.'), 'Token Booster checkout requirements must be visible before purchase.');
assert.ok(html.includes('Availability is checked when you continue; errors stop the purchase.'), 'Token Booster provider availability must not be implied before the server responds.');
assert.match(html, /if\(panel\.dataset\.v65Rendered==='1'\)\{\s*if\(window\.OVYXSettings\?\.current==='boosters'\)syncBoosterBalance\(\);\s*return;\s*\}/, 'Opening an already-rendered Token Boosters panel must re-fetch the authenticated balance.');
assert.match(html, /addEventListener\('click',syncBoosterBalance\);\s*if\(window\.OVYXSettings\?\.current==='boosters'\)syncBoosterBalance\(\);/, 'Booster Refresh must stay wired while panel re-entry also refreshes its balance.');
assert.ok(html.includes("function refreshBillingMeter(){"), 'Billing quota updates must be implemented as an in-place meter refresh.');
assert.ok(html.includes("if(window.OVYXSettings?.current==='plan')refreshBillingMeter();"), 'Refreshing usage while the Billing panel is open must not rebuild the entire panel and detach controls.');
assert.ok(html.includes("${u?'● Signed in':'○ Not signed in'}"), 'Security must not label a merely signed-in user as fully protected.');
assert.ok(html.includes('data?.ok!==true||data?.revoked!==true'), 'Log Out All Devices must require explicit server confirmation of successful revocation.');
assert.ok(html.includes("function toast(message,type='info'){") && html.includes("node.className='ovyx-toast ovyx-toast--'+kind"), 'The Security and Billing runtime must own a scoped toast fallback so failures remain visible even without a shared toast global.');
assert.ok(html.includes("await firebase.auth().signOut();") && html.includes("toast('All devices have been logged out.','success');"), 'Security success feedback must be attached to the confirmed session-revocation path.');
assert.ok(html.includes("p.querySelector('#ovyx-signout-current')?.addEventListener('click',async()=>") && html.includes("toast('Signed out of OVYX.','success');Router.go('home')"), 'Sign out current session must call Firebase sign-out, show success, and return to Home.');
assert.ok(html.includes("${u?'No active authenticated session':'No authenticated session is active'}") === false || html.includes("${u?'Active in this browser':'No active authenticated session'}"), 'Security session status must reflect whether a user is signed in.');
assert.ok(html.includes("${u?'CURRENT':'INACTIVE'}"), 'The current-session badge must not appear active when signed out.');

assert.equal((html.match(/ovyx-settings-reliability\.js/g) || []).length, 1, 'Settings reliability runtime must only be injected once.');
assert.ok(runtime.includes('studio.__ovyxShouldPauseLivePreviewV1 = shouldPause'), 'Settings must publish a live-preview pause gate instead of wrapping the quality wrapper.');
const previewEffect = runtime.slice(runtime.indexOf('function applySettingEffects'), runtime.indexOf('function syncToggleControls'));
const workspaceToggleEffect = runtime.slice(runtime.indexOf('function installWorkspaceToggleActions'), runtime.indexOf('const MODELS_BY_PROVIDER'));
assert.ok(workspaceToggleEffect.includes("const status = $('settings-save-status')"), 'Workspace switches must confirm the saved state in Settings.');
assert.ok(!workspaceToggleEffect.includes('notify('), 'Workspace toggle clicks must not synchronously render global toast UI.');

assert.ok(previewEffect.includes("frame.dataset.ovyxLivePreviewPaused = state.livePreview === false ? 'true' : 'false'"), 'The Live Preview switch must update the pause state immediately.');
assert.ok(!previewEffect.includes('window.WebStudio.renderPreview()'), 'Settings toggles must never force a synchronous Web Studio render from inside the click handler.');
assert.ok(previewEffect.includes('previous.autosave !== state.autosave'), 'Only autosave changes may synchronously snapshot the whole project session; other Settings toggles must stay responsive.');
assert.ok(previewEffect.includes("typeof window.WebStudio?.__ovyxShouldPauseLivePreviewV1 !== 'function'"), 'The live-preview pause gate must be reused rather than reinstalled on every toggle.');
assert.ok(qualityRuntime.includes('studio.__ovyxRawRenderPreviewV1 ||'), 'Web Studio quality must reuse a stable raw preview renderer.');
assert.ok(qualityRuntime.includes("typeof shouldPause === 'function' && shouldPause()"), 'Web Studio quality must honor the Settings pause gate while preserving the quality gate.');
assert.ok(qualityRuntime.includes('studio.renderPreview.__ovyxRawRenderPreviewV1'), 'Quality must not capture another live-preview wrapper as its base renderer.');

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
  'installWorkspaceOpenBehaviorActions',
  'store.createPromptModal',
  'store.save',
  'Project saved on this device.',
  'New project created and saved on this device.',
  "set-profile-name-legacy",
  "set-workspace-name-legacy",
  "ovyx.brand.v1.",
  'stopImmediatePropagation()',
  'installLivePreviewBridge',
  '#ws-select-inspector',
  '__ovyxShouldPauseLivePreviewV1',
  '__ovyxRawRenderPreviewV1',
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
assert.ok(runtime.includes("if (!confirmed) return;"), 'Cancelling the Delete Account confirmation must not send a request or erase account state.');
assert.ok(runtime.includes("closest('#ovyx-security-delete')"), 'The visible Security Delete Account button must be connected to the guarded deletion action.');
assert.match(deletionApi, /X-OVYX-Account-Deletion/);
assert.match(brandProfileApi, /setFirestoreDocumentAtPath/);
assert.match(brandProfileApi, /deleteFirestoreDocumentAtPath/);
assert.ok(brandProfileApi.includes("['users', identity.email, 'brand_profile', 'config']"));
assert.match(connectionsApi, /testUserConnection/);
assert.match(connectionsApi, /setFirestoreDocumentAtPath/);
assert.ok(connectionsApi.includes("['users', auth.email, 'universal_connections']"));
assert.match(revokeSessionsApi, /enforceSameOrigin/);
assert.match(revokeSessionsApi, /revokeFirebaseRefreshTokens/);

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
