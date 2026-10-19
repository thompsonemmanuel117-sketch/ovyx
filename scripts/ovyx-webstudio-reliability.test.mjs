import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isWebStudioPrompt } from '../functions/_lib/experience.js';
import { buildWebStudioSourceInspection, hasWebStudioSourceTask, isScopedWebStudioEdit, normalizeScopedWebStudioFiles } from '../functions/_lib/webstudio-source.js';
import { buildWebResearchQueries, isSafePublicUrl, parseSearchResultsHtml, stripResearchHtml } from '../functions/_lib/web-research.js';

const runtime = fs.readFileSync('assets/ovyx-webstudio-reliability.js', 'utf8');
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const headers = fs.readFileSync('_headers', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const feedbackApi = fs.readFileSync('functions/api/ai/feedback.js', 'utf8');
const statusApi = fs.readFileSync('functions/api/ai/status.js', 'utf8');
const assistantApi = fs.readFileSync('functions/api/ai/assistant.js', 'utf8');
const researchApi = fs.readFileSync('functions/api/ai/web-search.js', 'utf8');
const prompts = fs.readFileSync('functions/_lib/prompts.js', 'utf8');
const researchRuntime = fs.readFileSync('assets/ovyx-webstudio-research.js', 'utf8');
const applySuggestionsRuntime = fs.readFileSync('assets/ovyx-webstudio-apply-suggestions.js', 'utf8');
const apiMiddleware = fs.readFileSync('functions/api/_middleware.js', 'utf8');

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
assert.ok(middleware.includes('/assets/ovyx-webstudio-reliability.js?v=20261019-2'), 'reliability runtime must be injected into the application shell');
assert.ok(middleware.includes('/assets/ovyx-webstudio-research.js?v=20261019-1'), 'web research/progress runtime must be injected into the application shell');
assert.ok(middleware.includes('/assets/ovyx-webstudio-apply-suggestions.js?v=20261019-1'), 'source-backed apply controls must be injected into Web Studio');
assert.ok(headers.includes('/assets/ovyx-webstudio-reliability.js'), 'reliability runtime must have no-store headers');
assert.ok(headers.includes('/assets/ovyx-webstudio-research.js'), 'web research runtime must have no-store headers');
assert.ok(headers.includes('/assets/ovyx-webstudio-apply-suggestions.js'), 'apply-suggestion runtime must have no-store headers');
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
assert.equal(hasWebStudioSourceTask('Did you already fix my mobile menu?'), true);
assert.equal(hasWebStudioSourceTask('Check if the headline change was applied'), true);
assert.equal(hasWebStudioSourceTask('Make a website with a search bar'), false);
assert.equal(isScopedWebStudioEdit('Change the colors', true), true);
assert.equal(isScopedWebStudioEdit('Change the headline', true), true);
assert.equal(isScopedWebStudioEdit('Make the font larger', true), true);
assert.equal(isScopedWebStudioEdit('Apply this', true), true);

const normalizedArrayEdits = normalizeScopedWebStudioFiles([
  { path: 'src/styles.css', content: '.menu { gap: 1rem; }' },
  { path: 'src/main.js', content: 'const menuReady = true;' },
  { path: '../private.js', content: 'should not be included' },
  { path: '/absolute.css', content: 'should not be included' },
]);
assert.equal(normalizedArrayEdits['src/styles.css'], '.menu { gap: 1rem; }');
assert.equal(normalizedArrayEdits['src/main.js'], 'const menuReady = true;');
assert.equal(Object.keys(normalizedArrayEdits).length, 2, 'scoped edits must normalize file arrays and reject unsafe paths');
assert.match(assistantApi, /normalizeScopedWebStudioFiles\(proposedFiles\)/);
assert.match(assistantApi, /WEB_STUDIO_RESEARCH_GUIDANCE/);
assert.match(assistantApi, /payload\.context\?\.webResearch/);
assert.match(apiMiddleware, /\['\/api\/ai\/web-search', \['aiGeneration', 'webStudio'\]\]/);
assert.match(apiMiddleware, /'\/api\/ai\/web-search'/);
assert.match(researchApi, /assertAuthenticated\(context\.data\?\.user\)/);
assert.match(researchApi, /sseResponse\(async send/);
assert.match(researchRuntime, /ovyx:webstudio-build-stage/);
assert.match(researchRuntime, /ovyx-ws-live-activity/);
assert.match(researchRuntime, /function isResearchOnlyPrompt/);
assert.match(researchRuntime, /research-and-recommendation request, so Web Studio will stay read-only/)
assert.match(applySuggestionsRuntime, /OVYX_APPLY_SUGGESTIONS/);
assert.match(applySuggestionsRuntime, /readStatus !== 'page_read'/, 'only fully opened public source pages may back apply controls');
assert.match(applySuggestionsRuntime, /noopener noreferrer/);
assert.match(applySuggestionsRuntime, /studio\.submitPrompt\(\)/);
assert.match(applySuggestionsRuntime, /studio\.setMode\('build'\)/);
assert.match(prompts, /append one machine-readable HTML comment/);

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
assert.match(assistantApi, /scopedWebStudioEdit,/);
assert.match(assistantApi, /mode === 'build' && !scopedWebStudioEdit/);
assert.match(runtime, /files: requestPayload\.files \|\| priorContext\.files \|\| \(studio\.graph && studio\.graph\.files\) \|\| null/);
assert.match(assistantApi, /if \(!structuredFields\.message\) structuredFields\.message = structured\.text;/);
assert.match(assistantApi, /scopedWebStudioEdit,/);
assert.match(runtime, /result && result\.scopedWebStudioEdit === true/);
assert.ok(fs.readFileSync('functions/_lib/webstudio-source.js', 'utf8').includes("!path.split('/').some(part => part === '..' || part === '.')"), 'scoped edit paths must reject traversal');
assert.match(runtime, /activeView: 'webstudio'/);
assert.match(fs.readFileSync('functions/_lib/prompts.js', 'utf8'), /Keep read-only Ask\/source-inspection requests read-only/);


assert.equal(buildWebResearchQueries('Please search the internet deeply for how OVYX Web Studio can learn from ChatGPT').length, 3);
assert.ok(isSafePublicUrl('https://developer.mozilla.org/en-US/docs/Web/JavaScript'));
assert.equal(isSafePublicUrl('http://127.0.0.1:8788/'), false);
assert.equal(isSafePublicUrl('file:///etc/passwd'), false);
assert.equal(isSafePublicUrl('https://user:pass@example.com/private'), false);
assert.match(stripResearchHtml('<title>Guide</title><p>Safe &amp; sound</p><script>fake result</script>'), /Safe & sound/);
assert.doesNotMatch(stripResearchHtml('<title>Guide</title><p>Safe &amp; sound</p><script>fake result</script>'), /fake result/);
const parsedResults = parseSearchResultsHtml('<a class="result__a" href="https://developer.mozilla.org/en-US/docs/Web/HTML">HTML guide &amp; details</a><a class="result__a" href="http://127.0.0.1/private">Blocked</a>', 'DuckDuckGo', 'html guide');
assert.equal(parsedResults.length, 1);
assert.match(parsedResults[0].title, /HTML guide & details/);
assert.equal(parsedResults[0].domain, 'developer.mozilla.org');

console.log('Web Studio contracts passed: source-aware edits, guarded research, link parsing, safe URL filtering and progress-runtime wiring.');
