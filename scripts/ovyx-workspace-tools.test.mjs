import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  diagnoseProject,
  validateOvyxSourcePath,
} from '../functions/api/ai/workspace-tools.js';

assert.equal(validateOvyxSourcePath('src/index.html'), 'src/index.html');
assert.equal(validateOvyxSourcePath('src/app/main.tsx'), 'src/app/main.tsx');
assert.throws(() => validateOvyxSourcePath('../index.html'), error => error.code === 'UNSAFE_FILE_PATH');
assert.throws(() => validateOvyxSourcePath('src/../../private.html'), error => error.code === 'UNSAFE_FILE_PATH');
assert.throws(() => validateOvyxSourcePath('src/.env.production'), error => error.code === 'UNSAFE_FILE_PATH');
assert.throws(() => validateOvyxSourcePath('id_rsa'), error => error.code === 'UNSAFE_FILE_PATH');
assert.throws(() => validateOvyxSourcePath('assets/logo.png'), error => error.code === 'UNSAFE_FILE_PATH');

const report = diagnoseProject({
  name: 'Example site',
  pages: [
    { id: 'home', name: 'Home', slug: 'home', sections: [{ title: 'Hero' }] },
    { id: 'copy', name: 'Duplicate Home', slug: 'home', sections: [{ title: 'Hero' }] },
  ],
  ovyxGraph: {
    files: {
      'index.html': { type: 'text/html', content: '<html><body><main id="hero"></main><section id="hero"></section>' },
      'package.json': '{ this is invalid JSON',
      '.env': 'API_KEY=do-not-return',
    },
  },
}, 'project-1');

assert.equal(report.projectId, 'project-1');
assert.ok(report.issues.some(issue => issue.code === 'DUPLICATE_PAGE_SLUG'));
assert.ok(report.issues.some(issue => issue.code === 'HTML_CLOSE_MISSING'));
assert.ok(report.issues.some(issue => issue.code === 'DUPLICATE_HTML_ID'));
assert.ok(report.issues.some(issue => issue.code === 'INVALID_PACKAGE_JSON'));

const route = await readFile(new URL('../functions/api/ai/workspace-tools.js', import.meta.url), 'utf8');
assert.match(route, /body\.confirm !== true/, 'Writes must require explicit approval.');
assert.match(route, /expectedUpdateTime/, 'Writes must be guarded by the captured project revision.');
assert.match(route, /ownerUid/, 'Projects must be scoped to the authenticated owner.');
assert.match(route, /originalContent: slot\.current/, 'A copy of the original source must be backed up before edits.');
assert.match(route, /PATCH_VERIFY_FAILED/, 'Writes must be checked by reading the project back.');
assert.doesNotMatch(route, /functions\/api\/ai\/assistant\.js/, 'The workspace tool route must stay separate from Web Studio build logic.');

console.log('OVYX workspace tool tests passed.');
