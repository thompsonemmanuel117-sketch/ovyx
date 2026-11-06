import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = fs.readFileSync(path.join(root, 'assets/ovyx-command-centre.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/ovyx-command-centre.css'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'functions/_middleware.js'), 'utf8');
const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'assets/ovyx-admin-controls.js'), 'utf8');
const notifications = fs.readFileSync(path.join(root, 'assets/ovyx-account-notifications.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

for (const selector of ['#view-home .ovyx-command-centre', '.ovyx-cc-metrics', '.ovyx-cc-lower', '.ovyx-cc-activity-item', '.ovyx-cc-status-dot', '#view-admin-overview.ovyx-cc-admin-view']) {
  assert.ok(css.includes(selector), 'Missing Command Centre style: ' + selector);
}
assert.match(css, /@media\s*\(max-width:\s*760px\)/, 'The dashboard must adapt to mobile widths.');
assert.match(css, /prefers-reduced-motion:\s*reduce/, 'Dashboard motion must respect reduced-motion preferences.');
assert.match(js, /ProjectStore\?\.list\?\.\(\)/, 'Workspace metrics must come from the account project store.');
assert.match(js, /project\.pages\.length/, 'Page counts must be derived from saved project pages.');
assert.match(js, /Project updated/, 'Activity must be described as project updates, not fabricated events.');
assert.match(js, /OVYXAccountNotifications\?\.unreadCount/, 'The dashboard must reuse the existing notifications runtime.');
assert.match(js, /OVYXAccountNotifications\?\.recent/, 'The dashboard must preview notifications from the existing inbox.');
assert.match(notifications, /recent: \(\) => currentNotifications\.slice\(0, 3\)/, 'The notification runtime must expose only a small sanitized preview.');
assert.match(js, /fetch\('\/api\/health'/, 'Platform status must use the health endpoint.');
assert.match(js, /payload\?\.ok === true/, 'Platform health must require an explicit successful response.');
assert.match(js, /This is a platform check, not an integration test/, 'The UI must clearly scope what the status check proves.');
assert.match(js, /createPromptModal/, 'Create Project must invoke the existing project flow.');
assert.match(js, /Router\?\.go\?\.\('webstudio'\)/, 'Web Studio quick action must use the existing router.');
assert.match(js, /Router\?\.go\?\.\('appstudio'\)/, 'App Studio quick action must use the existing router.');
assert.match(js, /ovyx-owner-state/, 'Owner dashboard enhancement must wait for owner-state changes.');
assert.match(js, /OVYXAdminWorkspace\?\.isAuthorized\?\.\(\)/, 'Owner overview enhancement must require verified Admin Workspace authorization.');
assert.match(js, /Security Isolate/, 'The owner dashboard must explicitly remove the unverified static security-isolate claim.');
assert.match(js, /adm-stat-projects/, 'The owner dashboard must remove the hard-coded project total.');
assert.match(admin, /Account sample/, 'Admin account telemetry must be labelled as a sample, not a total count.');
assert.ok(middleware.includes('/assets/ovyx-command-centre.js?v=20261106-1'), 'The Command Centre runtime must load in the shell.');
assert.ok(middleware.includes('/assets/css/ovyx-command-centre.css?v=20261106-1'), 'The Command Centre stylesheet must load in the shell.');
assert.ok(headers.includes('/assets/ovyx-command-centre.js') && headers.includes('Cache-Control: no-store'), 'The runtime must not be served stale.');
assert.ok(pkg.scripts.test.includes('scripts/ovyx-command-centre.test.mjs'), 'Command Centre contracts must run in npm test.');

console.log('OVYX Command Centre contracts passed: account-scoped project summaries, honest activity, existing notifications, scoped health checks, owner authorization and dashboard safety.');
