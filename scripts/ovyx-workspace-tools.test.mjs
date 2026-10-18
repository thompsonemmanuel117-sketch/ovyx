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
const client = await readFile(new URL('../assets/ovyx-assistant-workspace.js', import.meta.url), 'utf8');
const nativeAi = await readFile(new URL('../functions/_lib/ovyx-native-ai.js', import.meta.url), 'utf8');
assert.match(route, /body\.confirm !== true/, 'Writes must require explicit approval.');
assert.match(route, /expectedUpdateTime/, 'Writes must be guarded by the captured project revision.');
assert.match(route, /ownerUid/, 'Projects must be scoped to the authenticated owner.');
assert.match(route, /originalContent: slot\.current/, 'A copy of the original source must be backed up before edits.');
assert.match(route, /PATCH_VERIFY_FAILED/, 'Writes must be checked by reading the project back.');
assert.doesNotMatch(route, /functions\/api\/ai\/assistant\.js/, 'The workspace tool route must stay separate from Web Studio build logic.');

assert.match(route, /MAX_BACKUP_SOURCE_BYTES/, 'Oversized source files must not be written without a safe backup.');
assert.match(route, /MAX_PROJECT_DOCUMENT_BYTES/, 'Project writes must be bounded before reaching Firestore.');
assert.match(client, /fetch\('\/api\/ai\/workspace-tools'/, 'The native assistant must call its dedicated tools endpoint.');
assert.match(client, /window\.confirm\(message\)/, 'Source changes must require explicit human confirmation.');
assert.match(client, /expectedUpdateTime: prepared\.revision/, 'The apply request must use the revision captured by the preview.');
assert.match(nativeAi, /'workspace_patch'/, 'The native model allowlist must include the constrained patch proposal.');
assert.match(client, /await runActions\(result\.actions\)/, 'Assistant tool actions must be awaited before idle.');

assert.match(route, /'prepare_restore'/, 'Recovery must have a distinct preview operation.');
assert.match(route, /operation === 'prepare_restore'/, 'Recovery preview must produce a meaningful diff before approval.');
assert.match(route, /operation === 'restore_revision'/, 'Recovery must use a dedicated restore operation.');
assert.match(route, /RESTORE_APPROVAL_REQUIRED/, 'The server must reject restore writes without explicit approval.');
assert.match(route, /expectedUpdateTime/, 'Recovery writes must reject stale project revisions.');
assert.match(route, /REVISION_NOT_FOUND/, 'Recovery versions must be checked against the signed-in owner and project.');
assert.match(route, /RESTORE_VERIFY_FAILED/, 'Recovery writes must be verified by reading the saved file back.');
assert.match(route, /listFirestoreSubcollectionDocumentsAtPath/, 'The backend must list only the active project revision subcollection.');
assert.match(client, /data-ovyx-native-action="undo-last-ai-edit"/, 'The assistant menu must expose the real undo action.');
assert.match(client, /data-ovyx-native-action="review-ai-edits"/, 'The assistant menu must expose edit history.');
assert.match(client, /operation: 'prepare_restore'/, 'Undo must preview the exact saved recovery version first.');
assert.match(client, /operation: 'restore_revision'/, 'Undo must call the authenticated restore operation.');
assert.match(client, /expectedUpdateTime: prepared\.revision/, 'Undo must send the preview revision to prevent overwriting newer work.');
assert.match(client, /Changes saved and verified/, 'The context indicator must distinguish verified writes.');
assert.match(client, /Working/, 'The context indicator must show running tasks.');
assert.match(client, /Approval needed/, 'The context indicator must show approval-required actions.');
assert.match(client, /Workspace details ready/, 'The context indicator must distinguish fallback context from a full scan.');
assert.match(nativeAi, /Never state that an action succeeded unless the relevant UI\/tool returned success/i, 'The assistant must not claim unverified actions succeeded.');

console.log('OVYX workspace tool tests passed.');
