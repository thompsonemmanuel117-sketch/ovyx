import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('assets/ovyx-assistant-workspace.js', 'utf8');
const native = fs.readFileSync('functions/_lib/ovyx-native-ai.js', 'utf8');

assert.match(source, /data-ovyx-native-more/);
assert.match(source, /function bindMenuTrigger\(\)/);
assert.match(source, /trigger\.addEventListener\('click'/);
assert.match(source, /menu\.hidden = !opening/);
assert.match(source, /function localWorkspaceSnapshot\(\)/);
assert.match(source, /function resolveWorkspaceContext\(\)/);
assert.match(source, /setTimeout\(\(\) => resolve\(\{ value: null, timedOut: true \}\), 1800\)/);
assert.match(source, /Context scanning is optional/);
assert.match(source, /NATIVE_RESPONSE_BOT_MARK/);
assert.match(source, /function makeBotAvatar\(\)/);
assert.match(source, /row\.appendChild\(makeBotAvatar\(\)\)/);
assert.match(source, /\.ovyx-native-response-avatar/);
assert.match(source, /ovyxNativeResponseAwaken/);
assert.match(source, /data-ovyx-native-action="diagnose-project"/);
assert.match(source, /data-ovyx-native-action="repair-project"/);
assert.match(source, /data-ovyx-native-action="export-chat"/);
assert.match(source, /function askAssistantTask\(prompt\)/);
assert.match(source, /Workspace details ready/);
assert.match(source, /I inspected the saved project/);
assert.match(source, /saved-project scan was unavailable/);
assert.match(source, /No source changes have been applied/);
assert.match(source, /do not say the workspace context is unavailable/i);
assert.match(source, /\/api\/ai\/ovyx/);
assert.match(source, /Sign in required/);
assert.match(native, /env\.AI\.run/);
assert.match(native, /No Gemini\/OpenAI\/Anthropic\/DeepSeek API key is used/);

assert.match(source, /function snapshotAssets\(\.\.\.sources\)/);
assert.match(source, /function snapshotConnections\(\.\.\.sources\)/);
assert.match(source, /function snapshotRelevantSettings\(\.\.\.sources\)/);
assert.match(source, /function snapshotSelectedElement\(selected\)/);
assert.match(source, /contentState: dirtyState/);
assert.match(source, /sourceState/);
assert.match(source, /contextWarning: limited/);
assert.match(source, /priority\(item\) > priority\(current\)/);
assert.match(source, /const READ_ONLY_WORKSPACE_ACTIONS = new Set/);
assert.match(source, /async function executeWorkspaceReadAction\(action\)/);
assert.match(source, /workspaceToolResults: workspaceToolResults\.slice\(-3\)/);
assert.match(source, /while \(toolRounds < 3\)/);
assert.match(source, /toolCallCount >= 4|const remaining = 4 - toolCallCount/);
assert.match(source, /authenticated read-only workspace tools are now in context\.workspaceToolResults/i);
assert.match(source, /No source edit was applied/);
assert.match(native, /workspace_read_file/);
assert.match(native, /workspace_search/);
assert.match(native, /workspace_inspect/);
assert.match(native, /workspace_diagnose/);


assert.match(source, /data-ovyx-native-action="undo-last-ai-edit"/);
assert.match(source, /data-ovyx-native-action="review-ai-edits"/);
assert.match(source, /function setWorkspaceTaskStatus\(status, message = ''\)/);
assert.match(source, /Working/);
assert.match(source, /Workspace reviewed/);
assert.match(source, /Approval needed/);
assert.match(source, /Changes saved/);
assert.match(source, /Workspace details ready/);
assert.match(source, /function recoverLatestWorkspaceEdit\(\)/);
assert.match(source, /type === 'workspace_undo'/);
assert.match(source, /function reviewWorkspaceEditHistory\(\)/);
assert.match(source, /The current file will be backed up first/);

console.log('OVYX assistant reliability, fallback-context, native AI and avatar tests passed.');
