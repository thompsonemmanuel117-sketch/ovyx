import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.ok(html.includes('id="ovyx-webstudio-pulse-composer-v1"'), 'Web Studio Pulse styles must be installed.');
const runtimeStart = html.indexOf('<script id="ovyx-webstudio-pulse-composer-runtime-v1">');
assert.ok(runtimeStart >= 0, 'The Pulse composer runtime script must be present.');
const sourceStart = runtimeStart + '<script id="ovyx-webstudio-pulse-composer-runtime-v1">'.length;
const runtimeEnd = html.indexOf('</script>', sourceStart);
assert.ok(runtimeEnd > sourceStart, 'The Pulse composer runtime script must be closed.');
new vm.Script(html.slice(sourceStart, runtimeEnd), { filename: 'ovyx-webstudio-pulse-composer-runtime-v1.js' });

const requiredSource = [
  ["pulse.id='ws-pulse-trigger'", 'Pulse must be a separate, dedicated control.'],
  ["pulse.innerHTML='<i class=\"fa-solid fa-plus\" aria-hidden=\"true\"></i>';", 'Pulse must use a clear plus icon.'],
  ["mic.id='ws-composer-mic'", 'Microphone must be a separate control.'],
  ['id="ws-chat-send"', 'The existing send control must be preserved.'],
  ['id="ws-chat-input"', 'The existing prompt input must be preserved.'],
  ['width:min(248px,calc(100vw - 24px))!important;max-height:min(48dvh,360px)!important', 'Desktop Pulse menu must stay narrow.'],
  ['width:min(248px,calc(100vw - 24px))!important;max-height:min(46dvh,340px)!important', 'Mobile Pulse menu must stay narrow.'],
  ['grid-template-columns:minmax(0,1fr)!important', 'Pulse menu options must be a narrow vertical list.'],
  ["button.style.setProperty('width','34px','important')", 'Pulse and microphone controls must stay compact.'],
  ["fetch('/api/ai/image-generation'", 'Image requests must use the existing OVYX image endpoint.'],
  ['generatedImageId', 'Generated images must appear inside chat messages.'],
  ['data-ovyx-use-generated-image', 'Generated images must have a Use in website action.'],
  ['download.download=asset.name', 'Generated images must be downloadable.'],
  ['currentAttachments.concat(attachment)', 'Using an image must preserve existing attachments.'],
  ['var dataMatch=dataUrl.match(', 'Generated image data must be validated locally.'],
  ['currentAttachments.length>=6', 'The six-attachment limit must be preserved.'],
  ["input.style.height='42px'", 'The prompt must start compact.'],
  ['var max=180', 'The prompt must grow only up to a bounded height.'],
  ['W.pendingBuild=true;', 'Image generation must mark the composer busy.'],
  ['if(launch)launch.remove()', 'The separate floating image-generation launcher must be removed.']
];
for (const [source, message] of requiredSource) assert.ok(html.includes(source), message);

for (const mode of ['build', 'plan', 'ask', 'fix']) {
  assert.ok(html.includes('data-ws-mode="' + mode + '"'), 'Existing ' + mode + ' mode must remain available.');
}
for (const id of ['ws-attach-btn', 'ws-attach-input', 'ws-brain-btn', 'ws-context-btn']) {
  assert.ok(html.includes("'" + id + "'"), 'Existing control binding for ' + id + ' must remain in the source.');
}
assert.ok(html.includes('SpeechRecognition||window.webkitSpeechRecognition'), 'Voice input must use browser speech recognition with a supported-browser fallback.');
assert.ok(packageJson.scripts.test.includes('ovyx-webstudio-pulse-composer.test.mjs'), 'Pulse regression test must be included in npm test.');
console.log('OVYX Web Studio pulse composer contract passed.');
