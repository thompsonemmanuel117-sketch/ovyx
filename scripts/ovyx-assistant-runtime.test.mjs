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
assert.match(source, /LOCAL CONTEXT READY/);
assert.match(source, /do not say the workspace context is unavailable/i);
assert.match(source, /\/api\/ai\/ovyx/);
assert.match(source, /SIGN IN REQUIRED/);
assert.match(native, /env\.AI\.run/);
assert.match(native, /No Gemini\/OpenAI\/Anthropic\/DeepSeek API key is used/);

assert.match(source, /data-ovyx-native-action="undo-last-ai-edit"/);
assert.match(source, /data-ovyx-native-action="review-ai-edits"/);
assert.match(source, /function setWorkspaceTaskStatus\(status, message = ''\)/);
assert.match(source, /TASK RUNNING/);
assert.match(source, /PROJECT INSPECTED/);
assert.match(source, /APPROVAL NEEDED/);
assert.match(source, /APPLIED · VERIFIED/);
assert.match(source, /LOCAL CONTEXT READY/);
assert.match(source, /function recoverLatestWorkspaceEdit\(\)/);
assert.match(source, /type === 'workspace_undo'/);
assert.match(source, /function reviewWorkspaceEditHistory\(\)/);
assert.match(source, /The current file will be backed up first/);

console.log('OVYX assistant reliability, fallback-context, native AI and avatar tests passed.');
