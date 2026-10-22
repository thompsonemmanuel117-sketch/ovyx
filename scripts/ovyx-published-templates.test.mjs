import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptTemplateForUser } from '../functions/api/templates/published.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const template = {
  id: 'global-template-1',
  title: 'Launch Page',
  category: 'SaaS',
  requiredTier: 'pro',
  published: true,
  updatedAt: '2026-10-22T10:00:00.000Z',
  ast: {
    theme: ['#101010', '#E8B64F'],
    pages: [{
      name: 'Home',
      slug: '/',
      sections: [
        { id: 'hero', type: 'hero', content: 'Build with OVYX' },
        { id: 'features', type: 'section', text: 'Features' }
      ]
    }]
  }
};

const locked = adaptTemplateForUser(template, 'free', true);
assert.equal(locked.locked, true, 'A Free account should see that a Pro template is locked.');
assert.equal(Object.hasOwn(locked, 'pages'), false, 'Locked paid template content must not be sent to Free accounts.');
assert.equal(Object.hasOwn(locked, 'ast'), false, 'The raw paid template AST must never be returned to the public client.');

const available = adaptTemplateForUser(template, 'pro', true);
assert.equal(available.locked, false);
assert.equal(available.title, 'Launch Page');
assert.equal(available.theme[0], '#101010');
assert.deepEqual(available.pages, [['Home', '/', [['hero', 'Build with OVYX'], ['section', 'Features']]]]);
assert.equal(available.published, true);

const disabledTemplates = adaptTemplateForUser(template, 'max', false);
assert.equal(disabledTemplates.locked, true, 'A globally disabled Templates capability must take precedence over plan tier.');
assert.equal(Object.hasOwn(disabledTemplates, 'pages'), false);

assert.equal(adaptTemplateForUser({ ...template, published: false }, 'max', true), null);
assert.equal(adaptTemplateForUser({ ...template, id: '' }, 'max', true), null);

const route = read('functions/api/templates/published.js');
const ownerRoute = read('functions/api/admin/templates.js');
const frontend = read('index.html');
assert.match(route, /verifyFirebaseIdToken/);
assert.match(route, /resolveEntitlements/);
assert.match(route, /listFirestoreDocuments\(context\.env, 'ovyx_templates'/);
assert.match(route, /row\.published === true/);
assert.match(route, /Cache-Control': 'no-store, max-age=0'/);
assert.match(frontend, /fetch\('\/api\/templates\/published'/);
assert.match(frontend, /locked=t\\.locked===true/, 'The gallery must respect server-computed capability locks.');
assert.match(frontend, /if\\(t\\.locked===true\\|\\|/, 'The Use Template action must not bypass server-computed locks.');
assert.match(ownerRoute, /async function requireRoot/);
assert.match(ownerRoute, /ROOT_REQUIRED/);
assert.match(ownerRoute, /setFirestoreDocumentAtPath\(context\.env, \['ovyx_templates', templateId\]/);
assert.doesNotMatch(route, /setFirestoreDocumentAtPath|setFirestoreDocument\(/, 'Public catalog reads must not gain write capability.');

console.log('OVYX published template contract passed: shared catalogue reads, account-aware plan locking, no paid AST leakage, root-only publishing, and public gallery route alignment.');
