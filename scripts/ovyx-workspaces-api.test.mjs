import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_WORKSPACE_ID,
  normalizeWorkspaceId,
  normalizeWorkspaceName,
  isWorkspaceOwner,
} from '../functions/api/workspaces.js';

assert.equal(DEFAULT_WORKSPACE_ID, 'personal');
assert.equal(normalizeWorkspaceId('personal'), 'personal');
assert.equal(normalizeWorkspaceId('ws_project-123'), 'ws_project-123');
assert.throws(() => normalizeWorkspaceId('../private'), error => error.code === 'INVALID_WORKSPACE_ID');
assert.throws(() => normalizeWorkspaceId(''), error => error.code === 'INVALID_WORKSPACE_ID');
assert.equal(normalizeWorkspaceName('  Product   Studio  '), 'Product Studio');
assert.throws(() => normalizeWorkspaceName(' '), error => error.code === 'WORKSPACE_NAME_REQUIRED');
assert.throws(() => normalizeWorkspaceName('x'), error => error.code === 'WORKSPACE_NAME_REQUIRED');

const owner = { uid: 'workspace-owner-1', email: 'owner@example.test' };
assert.equal(isWorkspaceOwner({ ownerUid: owner.uid, ownerEmail: owner.email }, owner), true);
assert.equal(isWorkspaceOwner({ ownerUid: 'another-user', ownerEmail: owner.email }, owner), false);
assert.equal(isWorkspaceOwner({ ownerUid: owner.uid, ownerEmail: 'other@example.test' }, owner), false);
assert.equal(isWorkspaceOwner({ ownerUid: owner.uid, ownerEmail: owner.email }, { uid: owner.uid }), false);

const workspaceApi = await readFile(new URL('../functions/api/workspaces.js', import.meta.url), 'utf8');
const projectsApi = await readFile(new URL('../functions/api/projects.js', import.meta.url), 'utf8');
assert.match(workspaceApi, /listFirestoreSubcollectionDocumentsAtPath/);
assert.match(workspaceApi, /expectedUpdateTime/);
assert.match(workspaceApi, /WORKSPACE_OWNERSHIP_CONFLICT/);
assert.match(workspaceApi, /DEFAULT_WORKSPACE_REQUIRED/);
assert.match(workspaceApi, /Team membership and invitations are not configured/);
assert.match(projectsApi, /workspaceId/);
assert.match(projectsApi, /assertWorkspaceAccess/);
assert.match(projectsApi, /projectWorkspaceId/);
assert.match(projectsApi, /PROJECT_OWNERSHIP_CONFLICT/);

console.log('OVYX workspace management contract tests passed.');
