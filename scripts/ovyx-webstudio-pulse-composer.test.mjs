import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.match(html, /id="ovyx-webstudio-pulse-composer-v1"/, 'Web Studio pulse composer styles must be installed.');
assert.match(html, /id="ovyx-webstudio-pulse-composer-runtime-v1"/, 'Web Studio pulse composer runtime must be installed.');
assert.match(html, /id="ws-pulse-trigger"/, 'The pulse control must be created.');
assert.match(html, /id="ws-composer-mic"/, 'The microphone control must be created.');
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
assert.match(html, /setAttachments\(\[file\]\)/, 'Use in website must stage the generated image as a Web Studio attachment.');
assert.match(html, /input\.style\.height='42px'/, 'The composer must reset to a compact one-line height.');
assert.match(html, /var max=200/, 'The composer must expand for longer prompts with a bounded maximum height.');
assert.match(html, /if\(event\.key==='Enter'&&!event\.shiftKey&&!event\.isComposing\)/, 'Enter sends and Shift+Enter remains available for a newline.');
assert.match(html, /if\(launch\)launch\.remove\(\)/, 'The separate floating image-generation launcher must be removed from the Web Studio experience.');
assert.match(packageJson.scripts.test, /ovyx-webstudio-pulse-composer\.test\.mjs/, 'The new pulse composer regression test must be included in npm test.');
console.log('OVYX Web Studio pulse composer contract passed.');
