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
assert.ok(html.includes("pulse.innerHTML='<i class=\"fa-solid fa-plus\" aria-hidden=\"true\"></i>';"), 'Pulse must use a separate plus icon.');
assert.ok(html.includes('grid-template-columns:minmax(0,1fr)!important'), 'Pulse menu options must be stacked in one narrow column.');
assert.match(html, /mic\.id='ws-composer-mic'/, 'The microphone control must be created by the runtime.');
assert.match(html, /id="ws-chat-send"/, 'The existing send control must be preserved.');
assert.match(html, /id="ws-chat-input"/, 'The existing prompt input must be preserved.');
assert.match(html, /function installAttachmentPreview\(W\)/, 'Staged attachments must render in an expanded visual preview gallery.');
assert.match(html, /function openFilePreview\(W,index\)/, 'Attachments must open in a larger, focused preview surface.');
assert.match(html, /ws-file-preview-full-image/, 'Images must have a large full-view preview style.');
assert.match(html, /function installVoiceNoteUI\(W\)/, 'The microphone must expose voice-note recording controls.');
assert.match(html, /new MediaRecorder\(voiceStream/, 'Voice notes must record real microphone audio when supported.');
assert.match(html, /fetch\('\/api\/ai\/transcribe'/, 'Recorded voice notes must call the authenticated transcription endpoint.');
assert.match(html, /data-ws-voice-send/, 'Recorded voice notes must offer a send-to-AI action.');
assert.match(html, /data-ws-voice-transcribe/, 'Voice-note transcription must also support inserting editable text.');
assert.match(html, /function installStopBehavior\(W\)/, 'The composer must install request cancellation behavior.');
assert.match(html, /send\.dataset\.ovyxComposerState='stop'/, 'The send arrow must become a stop control while a request is active.');
assert.match(html, /W\.abortActiveAi\?\.\(\)/, 'Stop must abort the existing AI request controller.');
assert.match(html, /thisImageController\.signal/, 'Image-generation requests must be cancelable from the same stop control.');
const transcribeRoute = fs.readFileSync('functions/api/ai/transcribe.js', 'utf8');
const guardedAI = fs.readFileSync('functions/_lib/cloudflare-free-ai.js', 'utf8');
assert.match(transcribeRoute, /assertAuthenticated\(context\.data\?\.user\)/, 'Voice transcription must retain Firebase authentication.');
assert.match(transcribeRoute, /capabilities\?\.webStudio !== true/, 'Voice transcription must retain the Web Studio entitlement check.');
assert.match(transcribeRoute, /runCloudflareFreeTranscription\(env/, 'Voice transcription must use the guarded Cloudflare inference helper.');
assert.doesNotMatch(transcribeRoute, /env\.AI\.run\('@cf\/openai\/whisper'/, 'The transcription route must not bypass the guarded model helper.');
assert.match(guardedAI, /await reserveUserMinute\(env, authUser\)/, 'Voice transcription must share the per-user AI throttle.');
assert.match(guardedAI, /reserveDailyBudget\(env, estimate, snapshot\)/, 'Voice transcription must reserve from the protected daily AI budget.');
assert.match(guardedAI, /settleDailyBudget\(env, reservation, estimate\)/, 'Voice transcription must settle its budget reservation.');
assert.ok(html.includes('width:min(220px,calc(100vw - 24px))'), 'Pulse menu must be a compact 220px popover with safe viewport margins.');
assert.ok(html.includes('max-height:min(32dvh,290px)'), 'Desktop Pulse menu height must be bounded.');
assert.ok(html.includes('max-height:min(30dvh,255px)'), 'Mobile Pulse menu height must be bounded more tightly.');
assert.ok(html.includes('min-height:0!important;height:auto!important;max-height:none!important'), 'The composer must override the legacy tall minimum-height.');
assert.ok(html.includes('composer.prepend(menu);'), 'Pulse menu must anchor to the whole composer rather than the button row.');
assert.ok(html.includes('tools.insertBefore(pulse,tools.firstChild);'), 'Pulse insertion must reference the actual toolbar parent after the popover moves to the composer.');
assert.ok(html.includes('#ws-mode-menu [data-ws-mode] b{color:#f1f3f5!important'), 'Mode names must have readable light text against the dark menu.');
assert.ok(html.includes("button.style.setProperty('width','34px','important')"), 'Pulse and microphone controls must remain compact after runtime inline styling.');
assert.ok(!html.includes("button.style.setProperty('width','38px','important')"), 'Runtime must not override compact control sizing with oversized buttons.');
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
assert.ok(html.includes("var dataMatch=dataUrl.match(/^data:(image\\/"), 'Use in website must validate the generated image data URL directly instead of refetching it.');
assert.doesNotMatch(html, /fetch\(asset\.dataUrl\)\.blob\(\)/, 'Use in website must not refetch its own generated data URL.');
assert.match(html, /currentAttachments\.length>=6/, 'The generated image action must retain the six-attachment limit.');
assert.match(html, /attachInput\.removeAttribute\('accept'\)/, 'The upload picker must accept any file type instead of limiting uploads to images.');
assert.match(html, /addPulseTool\('code','fa-code','Open Code editor'\)/, 'The Code editor menu tool must be wired.');
assert.match(html, /addPulseTool\('selection','fa-wand-magic-sparkles','Use selected element'\)/, 'Selected-element helper must be available in Pulse.');
assert.match(html, /addPulseTool\('clear','fa-eraser','Clear draft and attachments'\)/, 'Clear draft must have a real action.');
assert.match(html, /W\.openCodeEditor\(typeof W\.entryFile==='function'\?W\.entryFile\(\):undefined\)/, 'Open Code editor must call the real Web Studio code editor.');
assert.ok(html.includes("function closePulsePopover(){var pulseMenu=document.getElementById('ws-pulse-popover'),trigger=document.getElementById('ws-pulse-trigger')"),
  'Opening Agent Settings or the Project Node Map must close Pulse instead of stacking overlapping menus.');
assert.ok(html.includes('function openSettings(ev){ev.preventDefault();ev.stopImmediatePropagation();closePulsePopover();closeOthers(settings);'),
  'The AI brain/settings control must open its dedicated settings popover.');
assert.ok(html.includes('function openMap(ev){ev.preventDefault();ev.stopImmediatePropagation();closePulsePopover();closeOthers(map);'),
  'Project context must open the dedicated project node map.');
assert.ok(html.includes("if(!composer||composer.dataset.ovyxShortcutBindings==='1')return;var brain=document.getElementById('ws-brain-btn'),context=document.getElementById('ws-context-btn');if(!brain||!context)return;composer.dataset.ovyxShortcutBindings='1';"),
  'Shortcut controls must not mark themselves bound before dynamic Web Studio controls exist.');
assert.ok(html.includes("if(r==='webstudio'){setTimeout(bindShortcutPopovers,30);setTimeout(syncStatusAndPersistence,40);setTimeout(restorePersistedState,80)}"),
  'Agent settings and project context handlers must retry after Web Studio is mounted.');
assert.ok(html.includes("depthInput.addEventListener('input',function(){syncResponseDepth(depthInput.value,true)})"),
  'The response-depth slider must have an input handler.');
assert.ok(html.includes("localStorage.setItem(depthKey,String(depth))"),
  'The response-depth preference must persist.');
assert.ok(html.includes('Response depth preference: ${responseDepthInstruction}'),
  'The stored response-depth choice must change the actual Engineering Brain system instruction.');
assert.ok(html.includes("W.handlePreviewMenu==='function')W.handlePreviewMenu('visual')"),
  'Use selected element must activate the existing Visual Select flow when there is no active selection.');
assert.ok(html.includes("setTimeout(function(){attachInput.value=''},0)"),
  'The file picker must reset after a selection so the same file can be attached again.');
assert.ok(html.includes("camera.addEventListener('change',function(){var files=[...(camera.files||[])];camera.value=''"),
  'Take photo must use the existing attachment pipeline and reset the native camera input.');
assert.ok(html.includes("if(attachInput)attachInput.value='';if(camera)camera.value=''"),
  'Clear draft must reset the file-picker state as well as staged attachments.');

assert.match(html, /if\(W\.attachmentsReady&&typeof W\.attachmentsReady\.then==='function'\)await W\.attachmentsReady;/, 'Use in website must wait for pending file reads before adding the generated image.');
assert.match(html, /input\.style\.setProperty\('height','32px','important'\)/, 'The composer must reset to a compact one-line height with priority over legacy handlers.');
assert.match(html, /var max=150/, 'The composer must expand for longer prompts with a bounded maximum height.');
assert.match(html, /Math\.min\(Math\.max\(contentHeight,32\),max\)/, 'The original Web Studio input handler must not force tall minimums after typing.');
assert.match(html, /W\.pendingBuild=true;[\s\S]{0,80}W\.liveAiActive=true;/, 'Image generation must show the in-chat processing state and block overlapping tasks.');
assert.match(html, /if\(composer\?\.dataset\.ovyxPulseComposer==='1'\)return true/, 'Composer boot retries must be idempotent instead of creating an endless retry loop.');
assert.match(html, /compactSetMode=function\(\)[\s\S]*?field\.placeholder='Message OVYX…'/, 'Web Studio renders and mode changes must preserve the compact mobile placeholder.');
assert.match(html, /if\(event\.key==='Enter'&&!event\.shiftKey&&!event\.isComposing\)/, 'Enter sends and Shift+Enter remains available for a newline.');
assert.match(html, /if\(launch\)launch\.remove\(\)/, 'The separate floating image-generation launcher must be removed from the Web Studio experience.');
assert.match(packageJson.scripts.test, /ovyx-webstudio-pulse-composer\.test\.mjs/, 'The new pulse composer regression test must be included in npm test.');
console.log('OVYX Web Studio pulse composer contract passed.');
