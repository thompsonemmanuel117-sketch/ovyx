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
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(js, /removeDuplicateHomeOverview/, 'The runtime must remove any stale duplicate Home overview.');
assert.match(js, /byId\('ovyx-command-centre'\)\?\.remove\(\)/, 'The duplicate Home section must be removed from the DOM.');
assert.doesNotMatch(js, /function createShell|function renderWorkspace|function renderMetrics|function renderActivity|function renderNotifications/, 'The duplicate Home dashboard UI and render pipeline must be removed.');
assert.doesNotMatch(js, /ProjectStore|OVYXAccountNotifications|\/api\/health|setInterval/, 'Removing the duplicate must also remove its project polling, notification preview and health polling.');
assert.doesNotMatch(css, /#view-home|ovyx-cc-metrics|ovyx-cc-activity|ovyx-cc-status-dot/, 'Home dashboard-only styles must be removed.');
assert.match(css, /#view-admin-overview\.ovyx-cc-admin-view/, 'The existing owner-only Admin Overview layout must remain supported.');
assert.match(js, /OVYXAdminWorkspace\?\.isAuthorized\?\.\(\)/, 'Owner overview enhancement must still require verified Admin Workspace authorization.');
assert.match(js, /Security Isolate/, 'The owner overview must continue removing the unverified static security-isolate claim.');
assert.match(js, /adm-stat-projects/, 'The owner overview must continue removing the hard-coded project total.');
assert.match(admin, /Account sample/, 'Admin account telemetry must remain labelled as a sample, not a total count.');
assert.ok(middleware.includes('/assets/ovyx-command-centre.js?v=20261107-1'), 'The retained owner-overview runtime must use a fresh asset version.');
assert.ok(middleware.includes('/assets/css/ovyx-command-centre.css?v=20261107-1'), 'The retained owner-overview styles must use a fresh asset version.');
assert.ok(headers.includes('/assets/ovyx-command-centre.js') && headers.includes('Cache-Control: no-store'), 'The owner-overview runtime must not be served stale.');
assert.ok(pkg.scripts.test.includes('scripts/ovyx-command-centre.test.mjs'), 'Dashboard-removal contracts must run in npm test.');

console.log('OVYX dashboard de-duplication contracts passed: no Home Command Centre, no duplicate polling, and owner-only Admin Overview protections preserved.');
