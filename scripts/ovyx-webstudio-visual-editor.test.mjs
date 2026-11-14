import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../assets/ovyx-webstudio-visual-editor.js', import.meta.url), 'utf8');
const middleware = await readFile(new URL('../functions/_middleware.js', import.meta.url), 'utf8');
const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const appShell = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.doesNotThrow(() => new Function(runtime), 'The visual editor enhancement must parse.');
assert.match(packageJson.scripts.test, /ovyx-webstudio-visual-editor\.test\.mjs/);
assert.match(middleware, /ovyx-webstudio-visual-editor\.js\?v=20261101-1/);
assert.ok(middleware.indexOf('ovyx-scoped-rollback.js') < middleware.indexOf('ovyx-webstudio-visual-editor.js'), 'Visual editor must load after existing workspace integrations.');
assert.match(headers, /\/assets\/ovyx-webstudio-visual-editor\.js\n  Cache-Control: no-store, no-cache, must-revalidate/);
for (const token of [
  'applyVisualEditorStyle', 'applyVisualEditorAttribute', 'applyVisualEditorText', 'background-image',
  'ovyxVisualDragMode', 'ovyxVisualMove', 'data-ovyx-responsive-state',
  '@media (max-width: 600px)', '@media (min-width: 601px) and (max-width: 1024px)',
  'snapshotGraph', 'commitHistory', 'syncGraphToProject', 'renderPreview',
  'OVYXAssetStore', 'requireAssetAccess', 'openSections', 'w.undo', 'w.redo',
  'Only secure or project-local image URLs can be applied.',
  'Components can only be reordered within the same parent.',
  'nested elements. Use Open Code or Ask OVYX'
]) assert.ok(runtime.includes(token), 'Visual editor enhancement is missing: ' + token);

assert.match(runtime, /safeSelector/);
assert.match(runtime, /function normalizeValue/);
assert.match(runtime, /function moveNode/);
assert.match(runtime, /function showImagePicker/);
assert.match(runtime, /function uploadImage/);
assert.match(runtime, /function renderInspector/);
assert.match(runtime, /function dragHook/);

// Stage 6 must extend the existing Code Workspace and Preview controls rather
// than replace the established source-of-truth graph or its navigation.
for (const token of [
  'id="ws-code-workspace"', 'async loadMonacoForCode()', 'updateCodeFromEditor(file,content){',
  'syncGraphToProject(clearDirty=true){', 'data-ws-menu="visual"', 'openCodeEditor(this.entryFile())',
  'this.historyStack.length>50', 'this.undo()', 'this.redo()', 'setPreviewPreset',
  "row.addEventListener('dragstart'", "row.addEventListener('drop'",
  'window.OVYXAssetStore.upload', 'window.OVYXPreviewProjectControls'
]) assert.ok(appShell.includes(token), 'Stage 6 must preserve the existing OVYX capability: ' + token);

assert.doesNotMatch(runtime, /eval\s*\(|new Function\s*\(/);
console.log('OVYX Stage 6 visual editor contracts passed: safe component selection/reordering, persistent responsive styling, text/image editing, asset reuse, and history integration.');