import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.match(html, /id="ovyx-webstudio-pulse-composer-v1"/, 'Web Studio pulse composer styles must be installed.');
assert.match(html, /id="ovyx-webstudio-pulse-composer-runtime-v1"/, 'Web Studio pulse composer runtime must be installed.');
const runtime = html.match(/<script id="ovyx-webstudio-pulse-composer-runtime-v1">([\s\S]*?)<\/script>/);
assert.ok(runtime, 'The pulse composer runtime script must be present.');
new vm.Script(runtime[1], { filename: 'ovyx-webstudio-pulse-composer-runtime-v1.js' });
assert.match(html, /pulse\.id='ws-pulse-trigger'/, 'The pulse control must be created by the runtime.');
assert.match(html, /mic\.id='ws-composer-mic'/, 'The microphone control must be created by the runtime.');
assert.match(html, /id="ws-chat-send"/, 'The existing send control must be preserved.');
assert.match(html, /id="ws-chat-input"/, 'The existing prompt input must be preserved.');
for (const mode of ['build', 'plan', 'ask', 'fix']) {
  assert.match(html, new RegExp('data-ws-mode="' + mode + '"'), 'Existing ' + mode + ' mode must remain available.');
}
for (const id of ['ws-attach-btn', 'ws-attach-input', 'ws-brain-btn', 'ws-context-btn']) {
  assert.match(html, new RegExp('getElementById\\(\'' + id + '\'\\)'), 'Existing control binding for ' + id + ' must remain in the source.');
}
assert.match(html, /SpeechRecognition\|\|window\.webkitSpeechRecognition/, 'Voice input must use browser speech recognition with a supported-browser fallback.');
assert.match(html, /fetch\('\/api\/ai\/image-generation'/, 'Image requests must use the existing authenticated image-generation endpoint.');
assert.match(html, /generatedImageId/, 'Generated images must be attached to chat messages.');
assert.match(html, /data-ovyx-use-generated-image/, 'Generated images must have a Use in website action.');
assert.match(html, /download\.download=asset\.name/, 'Generated images must be downloadable.');
assert.match(html, /currentAttachments\.concat\(attachment\)/, 'Use in website must append the generated image without dropping existing attachments.');
assert.match(html, /dataMatch=dataUrl\.match\(\/\^data:\(image\\\/\[a-z0-9\.\+\\-\]\+\);base64,/, 'Use in website must validate the generated image data URL directly instead of refetching it.');
assert.doesNotMatch(html, /fetch\(asset\.dataUrl\)\.blob\(\)/, 'Use in website must not refetch its own generated data URL.');
assert.match(html, /currentAttachments\.length>=6/, 'The generated image action must retain the six-attachment limit.');
assert.match(html, /if\(W\.attachmentsReady&&typeof W\.attachmentsReady\.then==='function'\)await W\.attachmentsReady;/, 'Use in website must wait for pending file reads before adding the generated image.');
assert.match(html, /input\.style\.height='42px'/, 'The composer must reset to a compact one-line height.');
assert.match(html, /var max=180/, 'The composer must expand for longer prompts with a bounded maximum height.');
assert.match(html, /Math\.min\(Math\.max\(contentHeight, 42\), 180\)/, 'The original Web Studio input handler must not force tall minimums after typing.');
assert.match(html, /W\.pendingBuild=true;[\s\S]{0,80}W\.liveAiActive=true;/, 'Image generation must show the in-chat processing state and block overlapping tasks.');
assert.match(html, /if\(composer\?\.dataset\.ovyxPulseComposer==='1'\)return true/, 'Composer boot retries must be idempotent instead of creating an endless retry loop.');
assert.match(html, /compactSetMode=function\(\)[\s\S]*?field\.placeholder='Message OVYX…'/, 'Web Studio renders and mode changes must preserve the compact mobile placeholder.');
assert.match(html, /if\(event\.key==='Enter'&&!event\.shiftKey&&!event\.isComposing\)/, 'Enter sends and Shift+Enter remains available for a newline.');
assert.match(html, /if\(launch\)launch\.remove\(\)/, 'The separate floating image-generation launcher must be removed from the Web Studio experience.');
assert.match(packageJson.scripts.test, /ovyx-webstudio-pulse-composer\.test\.mjs/, 'The new pulse composer regression test must be included in npm test.');
console.log('OVYX Web Studio pulse composer contract passed.');
