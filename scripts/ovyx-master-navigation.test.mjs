import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = fs.readFileSync(path.join(root, 'assets/ovyx-master-navigation.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/ovyx-master-navigation.css'), 'utf8');
const middleware = fs.readFileSync(path.join(root, 'functions/_middleware.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

for (const group of ['Workspace', 'Build', 'Connect', 'Operate', 'Account', 'Administration']) {
  assert.ok(runtime.includes("group('" + group + "'"), 'Missing master navigation group: ' + group);
}
for (const route of ['home', 'projects', 'templates', 'inbox', 'webstudio', 'appstudio', 'kernel-bot', 'pricing', 'settings', 'faq', 'admin-overview']) {
  assert.ok(runtime.includes(route), 'Missing existing route mapping: ' + route);
}
assert.match(runtime, /openSettingsSection\('connections'\)/, 'Personal Connections must open the existing Settings-owned connection centre.');
assert.match(runtime, /OVYXWebsiteManagement[\s\S]*openWorkspace/, 'Sites & Publishing must reuse the existing website-management entry point.');
assert.match(runtime, /OVYXAdminWorkspace[\s\S]*isAuthorized/, 'Mobile administration must remain hidden without verified owner authorization.');
assert.match(runtime, /header-ai-project-bot/, 'Assistant navigation must reuse the existing assistant control.');
assert.match(runtime, /ovyx:view-changed/, 'Breadcrumb and active navigation must follow the existing route event.');
assert.match(runtime, /mobile-current-view/, 'Mobile drawer context must stay synchronized with the active route.');
assert.match(runtime, /toggleOrOpen: function/, 'The existing top-bar menu button must open the mobile drawer or toggle the desktop sidebar.');
assert.match(runtime, /v34-sidebar-collapsed/, 'Desktop sidebar collapse must reuse the existing shell state and CSS contract.');
assert.match(runtime, /ovyx-primary-nav/);
assert.match(runtime, /mobile-drawer/);
assert.ok(!/window\.Router\s*=(?!=)|Router\.go\s*=(?!=)|window\.switchView\s*=(?!=)/.test(runtime), 'The navigation layer must not replace the existing router.');
assert.ok(!/view-webstudio[^\n]*classList|#view-webstudio/.test(runtime + css), 'The shell navigation must not modify or style Web Studio internals.');
assert.ok(css.includes('--ovyx-ds-'), 'The master navigation should consume the shared design-system tokens.');
assert.ok(middleware.includes('/assets/ovyx-master-navigation.js?v=20261107-1'), 'The navigation runtime must be injected into HTML responses.');
assert.ok(middleware.includes('/assets/css/ovyx-master-navigation.css?v=20261107-1'), 'The navigation styles must be injected into HTML responses.');
assert.ok(pkg.scripts.test.includes('scripts/ovyx-master-navigation.test.mjs'), 'The navigation contract must run in npm test.');

console.log('OVYX master navigation contracts passed: existing route reuse, account connections, owner-gated administration, mobile parity, breadcrumbs and router preservation.');
