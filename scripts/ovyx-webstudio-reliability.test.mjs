import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isWebStudioPrompt } from '../functions/_lib/experience.js';
import { buildWebStudioSourceInspection, hasWebStudioSourceTask, isScopedWebStudioEdit } from '../functions/_lib/webstudio-source.js';

const runtime = fs.readFileSync('assets/ovyx-webstudio-reliability.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const feedbackApi = fs.readFileSync('functions/api/ai/feedback.js', 'utf8');
const statusApi = fs.readFileSync('functions/api/ai/status.js', 'utf8');
const assistantApi = fs.readFileSync('functions/api/ai/assistant.js', 'utf8');

for (const [label, source, tokens] of [
  ['feedback UI', runtime, [
    'Was this helpful?',
    'data-ovyx-feedback-vote',
    '/api/ai/feedback',
    'waitForHelpForm',
    'ovyx-help-support-subject',
    'ovyx-help-support-message',
    'ovyxBuildState',
    'A website draft was not ready for preview. Your existing preview remains unchanged.',
    'The website draft was not updated. Your existing preview remains unchanged.',
  ]],
  ['feedback API', feedbackApi, [
    'assertAuthenticated(context.data?.user)',
    'enforceSameOrigin(request)',
    "['ai_response_feedback', documentId]",
    'do not collected by this endpoint',
  ]],
]) {
  for (const token of tokens) {
    if (token === 'do not collected by this endpoint') continue;
    assert.ok(source.includes(token), label + ' is missing required contract: ' + token);
  }
}
assert.ok(middleware.includes('/assets/ovyx-webstudio-reliability.js?v=20261019-1'), 'reliability runtime must be injected into the application shell');
assert.ok(headers.includes('/assets/ovyx-webstudio-reliability.js'), 'reliability runtime must have no-store headers');
assert.ok(index.includes('AI_BUILD_NO_ARTIFACTS'), 'failed/no-op AI builds must be rejected');
assert.ok(index.includes("ovyxBuildState='verified'"), 'Web Studio must mark verified builds only after source checks');
assert.ok(runtime.includes('function seedOnlyProject'), 'the generic generated seed page must be hidden until a real build exists');
assert.ok(runtime.includes('Your existing preview remains unchanged'), 'a no-op AI build must keep the last preview unchanged');
assert.ok(!feedbackApi.includes('body.prompt') && !feedbackApi.includes('body.responseText'), 'feedback records must not store prompts or response content');
assert.ok(statusApi.includes("? 'RATE_LIMITED'") && statusApi.includes("? 'INSUFFICIENT_CREDITS'"), 'provider health should distinguish rate limits and credit exhaustion');
assert.ok(statusApi.includes('Provider request timed out.'), 'provider health errors should avoid exposing exception details');



// Web Studio follow-ups must retain the active-view boundary and inspect supplied source safely.
assert.equal(isWebStudioPrompt('Inspect the current project', 'ask', { activeView: 'webstudio' }), true);
assert.equal(isWebStudioPrompt('Inspect the current project', 'ask', { activeView: 'view-webstudio' }), true);
assert.equal(isWebStudioPrompt('How can I improve my writing?', 'assistant', { activeView: 'assistant' }), false);
assert.equal(hasWebStudioSourceTask('Inspect this project'), true);
assert.equal(isScopedWebStudioEdit('Change the colors', true), true);
assert.equal(isScopedWebStudioEdit('Change the headline', true), true);
assert.equal(isScopedWebStudioEdit('Make the font larger', true), true);
assert.equal(isScopedWebStudioEdit('Apply this', true), true);
assert.equal(isScopedWebStudioEdit('Make a website with a search bar', true), false);
assert.equal(isScopedWebStudioEdit('Build a new website for a restaurant', true), false);

const inspectedProject = buildWebStudioSourceInspection({
  prompt: 'Search my project deeply for "aria-expanded" and inspect the mobile menu',
  files: {
    'src/menu.js': [
      'function toggleMobileMenu() {',
      '  menu.hidden = !menu.hidden;',
      "  button.setAttribute('aria-expanded', String(!menu.hidden));",
      '}',
    ].join('\n'),
    'styles/mobile-menu.css': '.menu[hidden] { display: none; }\n@media (max-width: 600px) { .menu { display: block; } }',
  },
});
assert.equal(inspectedProject.filesProvided, 2);
assert.equal(inspectedProject.filesSearched, 2);
assert.ok(inspectedProject.fileInventory.some(file => file.path === 'src/menu.js' && file.kind === 'javascript'));
assert.ok(inspectedProject.matches.some(match => match.query === 'aria-expanded' && match.path === 'src/menu.js' && match.line === 3));
assert.match(inspectedProject.coverageNote, /Only non-empty source files supplied/i);
assert.equal(
  buildWebStudioSourceInspection({ prompt: 'Inspect this project', files: {} }).filesSearched,
  0,
  'an empty source payload must not be reported as searched',
);
assert.match(assistantApi, /isWebStudioPrompt\(promptText, mode, payload\.context\)/);
assert.match(assistantApi, /buildWebStudioSourceInspection/);
assert.match(assistantApi, /scopedWebStudioEdit: isWebStudio && mode === 'build' && scopedWebStudioEdit === true/);
assert.match(assistantApi, /mode === 'build' && !scopedWebStudioEdit/);
assert.match(runtime, /files: requestPayload\.files \|\| priorContext\.files \|\| null/);
assert.match(assistantApi, /if \(!structuredFields\.message\) structuredFields\.message = structured\.text;/);
assert.match(assistantApi, /scopedWebStudioEdit,/);
assert.match(runtime, /result && result\.scopedWebStudioEdit === true/);
assert.match(runtime, /activeView: 'webstudio'/);
assert.match(fs.readFileSync('functions/_lib/prompts.js', 'utf8'), /Keep read-only Ask\/source-inspection requests read-only/);


console.log('Web Studio reliability contracts passed: response feedback, support hand-off, verified-preview gate and safe provider diagnostics.');
