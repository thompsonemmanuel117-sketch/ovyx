import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const asset = await readFile(new URL('../assets/ovyx-project-workspace-picker.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');

assert.doesNotThrow(() => new Function(asset), 'The project picker runtime must parse as JavaScript.');

assert.match(asset, /showWorkspacePicker\s*=\s*function/);
assert.match(asset, /ProjectStore\.list|STORE\(\)\.list/);
assert.match(asset, /STORE\(\)\.open\(selectedId\)/);
assert.match(asset, /createPromptModal/);
assert.match(asset, /showModal\(\)/);
assert.match(asset, /aria-labelledby/);
assert.match(asset, /aria-live="polite"/);
assert.match(asset, /prefers-reduced-motion/);
assert.match(asset, /\/api\/workspaces/, 'The workspace switcher must use the authenticated workspace API.');
assert.match(asset, /data-workspace-new/, 'Users must be able to create a workspace from the picker.');
assert.match(asset, /data-workspace-archive/, 'Users must be able to archive a non-default workspace.');
assert.match(asset, /button.disabled = archivedWorkspace/, 'Archived workspace projects must not open until the workspace is restored.');
assert.match(asset, /owningWorkspace\?\.status === 'archived'/, 'ProjectStore.open must block archived projects from all entry points.');
assert.match(asset, /projectWorkspace\(project\) === selectedWorkspaceId/, 'Project listings must be scoped to the selected workspace.');
assert.match(asset, /projectActivityTimestamp\(b\) - projectActivityTimestamp\(a\)/, 'Project listings must be ordered by recent activity.');
assert.match(asset, /__OVYXWorkspaceRenderProjectsV1/, 'The existing Projects page must render only the selected workspace projects.');
assert.match(asset, /syncActiveProjectWorkspace/, 'The opened active-project object must retain its workspace association.');
assert.match(asset, /__OVYXWorkspaceOpenV1/, 'Opening a saved project must restore its owning workspace selection.');
assert.match(asset, /__OVYXWorkspaceSaveV1/, 'New projects must inherit the selected workspace.');
assert.match(asset, /activeProjectInSelectedWorkspace/, 'An active project must not be stranded by archiving its workspace.');
assert.match(asset, /workspaceLoadGeneration/, 'Late workspace responses must not cross Firebase account switches.');
assert.match(asset, /const targetWorkspaceId = selectedWorkspaceId/, 'Workspace mutation responses must not overwrite a later selection.');
assert.match(asset, /ovyx\.active-workspace\.v1\./, 'Workspace selection must be scoped to the signed-in account.');
assert.doesNotMatch(asset, /window\.prompt\s*\(/, 'The new project picker must not use a browser prompt.');
assert.match(middleware, /ovyx-project-workspace-picker\.js\?v=20261106-19/, 'The project picker runtime must be injected into the production app shell.');

console.log('OVYX project workspace picker contract tests passed.');
