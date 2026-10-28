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
assert.match(html, /current\.concat\(attachment\)/, 'Use in website must append the generated image as a normal attachment without replacing existing files.');
assert.match(html, /input\.style\.height='42px'/, 'The composer must reset to a compact one-line height.');
assert.match(html, /var max=200/, 'The composer must expand for longer prompts with a bounded maximum height.');
assert.match(html, /height:42px;max-height:200px!important;/, 'The compact default height must not lock the input against its inline auto-resize.');
assert.match(html, /for\(var i=0;i<event\.results\.length;i\+\+\)/, 'Speech dictation must retain the full transcript across recognition events.');
assert.match(html, /high-resolution/, 'Natural-language image prompts may include descriptive modifiers.');
assert.match(html, /Image generation is already running/, 'Concurrent sends must not bypass the image-generation busy guard.');
assert.match(html, /Quick actions/, 'The Pulse menu must expose the additional workspace quick actions.');
for (const action of ['Use selected element', 'Website brief', 'Paste clipboard text', 'Open Code editor', 'Clear draft']) {
  assert.match(html, new RegExp(action), 'Pulse quick action must be present: ' + action);
}
assert.equal(html.includes('/assets/ovyx-webstudio-pulse-composer.js'), false, 'The duplicate external Pulse runtime must not be loaded.');
assert.match(html, /current\.length>=6/, 'Use in website must respect the attachment count limit.');
assert.match(html, /if\(event\.key==='Enter'&&!event\.shiftKey&&!event\.ctrlKey&&!event\.metaKey&&!event\.isComposing\)/, 'Enter sends, Shift+Enter inserts a newline, and Ctrl/Meta+Enter avoids duplicate submissions.');
assert.match(html, /if\(launch\)launch\.remove\(\)/, 'The separate floating image-generation launcher must be removed from the Web Studio experience.');
assert.match(packageJson.scripts.test, /ovyx-webstudio-pulse-composer\.test\.mjs/, 'The new pulse composer regression test must be included in npm test.');
console.log('OVYX Web Studio pulse composer contract passed.');
