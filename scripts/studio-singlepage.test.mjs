import assert from 'node:assert/strict';
import { validateOrRepairSinglePageBuild } from '../functions/_lib/studio-singlepage.js';

const portfolioHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Photographer portfolio"><title>Studio Portfolio</title><link rel="stylesheet" href="styles.css"></head><body><nav><a href="#work">Selected work</a></nav><main><h1>Photographs with feeling</h1><section id="work"><h2>Selected work</h2><p>Stories in light and texture.</p></section></main></body></html>';
const portfolioPayload = {
  summary: 'A considered portfolio website.',
  files: [
    { path: 'index.html', language: 'html', content: portfolioHtml },
    { path: 'styles.css', language: 'css', content: 'body{margin:0;font-family:serif} main{max-width:72rem;margin:auto}' },
  ],
};

const validBuild = await validateOrRepairSinglePageBuild({
  env: {},
  prompt: 'Build a one-page portfolio website for a photographer.',
  result: {
    text: JSON.stringify(portfolioPayload),
    provider: 'gemini',
    model: 'test-model',
    rawUsage: { prompt_tokens: 7, completion_tokens: 13, total_tokens: 20 },
  },
  quotaInputText: 'Build a one-page portfolio website for a photographer.',
  quotaOutputText: JSON.stringify(portfolioPayload),
});
assert.equal(validBuild.evaluated, true);
assert.equal(validBuild.qualityVerification.status, 'passed');
assert.equal(validBuild.qualityVerification.structuralChecksPassed, true);
assert.equal(validBuild.qualityVerification.requirementsPassed, true);
assert.equal(validBuild.siteIntegrity.totalFindings, 0, JSON.stringify(validBuild.siteIntegrity.findings));
const validPayload = JSON.parse(validBuild.result.text);
assert.equal(validPayload.qualityVerification.status, 'passed');
assert.equal(validPayload.files.length, 2, 'The existing array file contract should be preserved.');
assert.equal(validPayload.files.find(file => file.path === 'index.html').content, portfolioHtml);

const warningPayload = {
  summary: 'Portfolio with source-integrity warnings.',
  files: [
    { path: 'index.html', language: 'html', content: portfolioHtml.replace('</section>', '<img src="assets/missing.webp"></section>') },
    { path: 'styles.css', language: 'css', content: 'body{margin:0;font-family:serif} main{max-width:72rem;margin:auto}' },
  ],
};
const warningBuild = await validateOrRepairSinglePageBuild({
  env: {},
  prompt: 'Build a one-page portfolio website for a photographer.',
  result: { text: JSON.stringify(warningPayload), rawUsage: null },
  quotaInputText: 'portfolio request',
  quotaOutputText: JSON.stringify(warningPayload),
});
assert.equal(warningBuild.qualityVerification.status, 'passed-with-integrity-warnings');
assert.ok(warningBuild.siteIntegrity.totalFindings >= 2, 'Missing local image files and missing alt attributes must remain visible as source-integrity findings.');

const bookingHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Restaurant reservations"><title>Harbour House</title></head><body><nav><a href="#reservations">Reservations</a></nav><main><h1>Harbour House</h1><section id="reservations"><h2>Reservations</h2><p>Plan a meal by the water.</p></section></main></body></html>';
const bookingPayload = {
  summary: 'Restaurant landing page.',
  files: [
    { path: 'index.html', language: 'html', content: bookingHtml },
  ],
};
const repairCalls = [];
const repairedBuild = await validateOrRepairSinglePageBuild({
  env: {},
  prompt: 'Create a one-page restaurant landing page with a button to book a table.',
  result: {
    text: JSON.stringify(bookingPayload),
    provider: 'gemini',
    model: 'test-model',
    rawUsage: { prompt_tokens: 7, completion_tokens: 13, total_tokens: 20 },
  },
  quotaInputText: 'Original user prompt.',
  quotaOutputText: JSON.stringify(bookingPayload),
  provider: 'gemini',
  model: 'test-model',
  authUser: { sub: 'test-user' },
  system: 'OVYX_TEST_QUALITY_CONTRACT',
  callModel: async (_env, options) => {
    repairCalls.push(options);
    const match = String(options.user).match(/REPAIR CURRENT FILE CONTENTS JSON:\n([\s\S]*?)\n\nREPAIR ALLOWLIST JSON:/);
    assert(match, 'The repair prompt must include bounded current file contents and an explicit allowlist.');
    assert.ok(String(options.user).includes('FAILED PROMPT REQUIREMENT CHECKS JSON'));
    const files = JSON.parse(match[1]);
    assert.deepEqual(Object.keys(files), ['index.html']);
    files['index.html'] = String(files['index.html']).replace(
      '</section>',
      '<button type="button">Reserve a table</button></section>',
    );
    return {
      text: JSON.stringify({
        summary: 'Added the missing reservation action.',
        files: [{ path: 'index.html', language: 'html', content: files['index.html'] }],
      }),
      provider: 'gemini',
      model: 'test-model',
      rawUsage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 },
    };
  },
});
assert.equal(repairCalls.length, 1, 'The single-page quality gate should make at most one repair attempt.');
assert.equal(repairedBuild.requirementRepair.status, 'applied');
assert.equal(repairedBuild.qualityVerification.status, 'repaired-and-passed');
assert.equal(repairedBuild.qualityVerification.requirementsPassed, true);
assert.equal(repairedBuild.result.rawUsage.prompt_tokens, 9);
assert.equal(repairedBuild.result.rawUsage.completion_tokens, 17);
assert.equal(repairedBuild.result.rawUsage.total_tokens, 26);
assert.ok(JSON.parse(repairedBuild.result.text).files[0].content.includes('Reserve a table'));
assert.ok(repairedBuild.quotaInputText.includes('REPAIR CURRENT FILE CONTENTS JSON'));
assert.ok(repairedBuild.quotaOutputText.includes('Added the missing reservation action.'));

const rejectedBuild = await validateOrRepairSinglePageBuild({
  env: {},
  prompt: 'Create a one-page restaurant landing page with a button to book a table.',
  result: {
    text: JSON.stringify(bookingPayload),
    provider: 'gemini',
    model: 'test-model',
    rawUsage: { prompt_tokens: 7, completion_tokens: 13, total_tokens: 20 },
  },
  quotaInputText: 'Original user prompt.',
  quotaOutputText: JSON.stringify(bookingPayload),
  callModel: async () => ({
    text: JSON.stringify({ files: [{ path: 'src/private.html', language: 'html', content: '<!doctype html><html><head><title>Private</title></head><body><h1>Unauthorized</h1></body></html>' }] }),
    rawUsage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 },
  }),
}).then(() => null, error => error);
assert.ok(rejectedBuild);
assert.equal(rejectedBuild.code, 'WEBSTUDIO_SINGLE_PAGE_QUALITY_FAILED');
assert.equal(rejectedBuild.requirementRepair.status, 'rejected');
assert.equal(rejectedBuild.qualityVerification.requirementsPassed, false);
assert.equal(rejectedBuild.partialUsage.total_tokens, 26, 'Failed repairs must still be included in usage accounting.');

const noHtml = await validateOrRepairSinglePageBuild({
  result: { text: JSON.stringify({ summary: 'No HTML emitted', files: [{ path: 'styles.css', language: 'css', content: 'body{margin:0}' }] }) },
  prompt: 'Build a one-page website.',
});
assert.equal(noHtml.evaluated, false);
assert.equal(noHtml.qualityVerification.status, 'not-evaluated');
assert.equal(noHtml.requirementRepair.status, 'not-attempted');

const unsafePath = await validateOrRepairSinglePageBuild({
  result: { text: JSON.stringify({ files: [{ path: '../index.html', language: 'html', content: portfolioHtml }] }) },
  prompt: 'Build a one-page website.',
}).then(() => null, error => error);
assert.ok(unsafePath);
assert.equal(unsafePath.code, 'WEBSTUDIO_SINGLE_PAGE_PATH_NOT_ALLOWED');

console.log('Web Studio single-page QA/repair tests passed.');
