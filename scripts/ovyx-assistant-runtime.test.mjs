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
assert.match(source, /\/api\/ai\/ovyx/);
assert.match(source, /SIGN IN REQUIRED/);
assert.match(native, /env\.AI\.run/);
assert.match(native, /No Gemini\/OpenAI\/Anthropic\/DeepSeek API key is used/);

console.log('OVYX assistant reliability, fallback-context, native AI and avatar tests passed.');
