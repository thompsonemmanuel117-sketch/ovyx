import assert from 'node:assert/strict';
import {
  buildWebsiteEnginePlan,
  buildWebsiteEngineInstructions,
  websiteEngineClientSummary,
  buildWebsiteEngineReadiness,
  runWebsiteGeneration,
} from '../functions/_lib/website-engine.js';

const prompt = [
  'Build a premium multi-page website for a boutique hotel.',
  'Pages: Home, About, Services, Pricing.',
  'Include a reservation flow, contact form and email delivery.',
  'Do not invent room prices, guest reviews or availability.',
  'Use an editorial visual direction with responsive layouts.',
].join(' ');

const plan = buildWebsiteEnginePlan(prompt, {
  market: 'Nigeria',
  integrations: [{ provider: 'Resend', connected: true }],
});
assert.equal(plan.engine, 'ovyx-unified-website-engine');
assert.equal(plan.strategy, 'multi-page');
assert.deepEqual(plan.pageArchitecture.pages.map(page => page.title), ['Home', 'About', 'Services', 'Pricing', 'Reservations', 'Contact']);
assert.ok(plan.requirementManifest.total >= 4);
assert.ok(plan.requirementManifest.constraints.some(item => /do not invent/i.test(item)));
assert.ok(plan.interactionArchitecture.capabilities.includes('booking'));
assert.ok(plan.interactionArchitecture.capabilities.includes('forms'));
assert.ok(plan.integrations.some(item => item.capability === 'email' && item.connection === 'connected-in-context'));
assert.ok(plan.integrations.some(item => item.capability === 'booking' && item.connection === 'not-confirmed'));
assert.ok(plan.qualityGates.length > 0);
assert.equal(plan.fullStackArchitecture.engine, 'ovyx-fullstack-architecture');
assert.ok(plan.fullStackArchitecture.capabilities.frontend);
assert.ok(plan.fullStackArchitecture.capabilities.booking);
assert.ok(plan.fullStackArchitecture.apiContracts.some(route => route.path === '/api/bookings'));
assert.ok(plan.fullStackArchitecture.testPlan.some(test => test.id === 'booking-conflicts'));
assert.equal(websiteEngineClientSummary(plan).fullStackArchitecture.graph.valid, true);
assert.match(buildWebsiteEngineInstructions(plan), /AUTHORITATIVE PRE-GENERATION PLAN/);
assert.match(buildWebsiteEngineInstructions(plan), /FULL-STACK ARCHITECTURE CONTRACT/);
assert.equal(websiteEngineClientSummary(plan).pageCandidates, 6);
assert.equal(buildWebsiteEnginePlan('A simple one-page portfolio').strategy, 'single-page-or-context-derived');

// Long accepted briefs must never be cut in the middle of the model-facing JSON.
// The full brief remains in the task prompt; the bounded index preserves every
// requirement ID and explicitly labels excerpts as non-authoritative summaries.
const longBrief = Array.from({ length: 180 }, (_, index) =>
  'Requirement ' + (index + 1) + ': Preserve the full requested route content, meaningful interactions, accessible controls, responsive layout, trustworthy data handling and recovery states without inventing unsupported facts'
).join('\n');
const longPlan = buildWebsiteEnginePlan(longBrief);
assert.equal(longPlan.requirementManifest.total, 180);
const longInstructions = buildWebsiteEngineInstructions(longPlan);
const serializedPlan = longInstructions.split(/\n\n/)[2];
assert.ok(serializedPlan.length <= 18000, 'The serialized Website Engine plan must stay within its defined instruction budget.');
const parsedLongPlan = JSON.parse(serializedPlan);
assert.equal(parsedLongPlan.requirementManifest.requirements.length, 180);
assert.equal(parsedLongPlan.requirementManifest.requirements[0][0], 'R001');
assert.equal(parsedLongPlan.requirementManifest.requirements.at(-1)[0], 'R180');
assert.equal(parsedLongPlan.requirementManifest.sourcePromptRemainsAuthoritative, true);
assert.equal(parsedLongPlan.requirementManifest.indexEntriesAreExcerpts, true);
assert.ok(parsedLongPlan.designArchitecture.mustHave.length > 0);
assert.ok(parsedLongPlan.designArchitecture.conversionPrinciples.length > 0);
assert.ok(parsedLongPlan.fullStackArchitecture);
assert.equal(parsedLongPlan.fullStackArchitecture.requirementTraceability.length, 180);
assert.ok(serializedPlan.length <= 18000, 'The architecture contract must fit the same bounded model instruction budget.');

const freshBuildReadiness = buildWebsiteEngineReadiness(
  'Build a business website with a real contact form and email delivery.',
  {},
  { mode: 'build', conversationText: 'We need messages to reach the business owner.' },
);
assert.equal(freshBuildReadiness.type, 'build_readiness');
assert.ok(freshBuildReadiness.questions.some(question => /public email address/i.test(question)));
const existingHtml = {
  'index.html': '<!doctype html><html><head><title>Existing</title></head><body>' + 'Existing project content '.repeat(40) + '</body></html>',
};
assert.equal(buildWebsiteEngineReadiness(
  'Fix the hero spacing and align the navigation.',
  { files: existingHtml },
  { mode: 'build', files: existingHtml },
), null, 'Routine existing-site edits should not be interrupted by fresh-build intake questions.');
assert.ok(buildWebsiteEngineReadiness(
  'Add real Paystack checkout to this existing website.',
  { files: existingHtml },
  { mode: 'build', files: existingHtml },
), 'Adding a real integration to an existing site must still trigger readiness checks.');
assert.equal(buildWebsiteEngineReadiness(
  'Build a business website with a contact form.',
  {},
  { mode: 'assistant' },
), null, 'Readiness questions only gate actual website builds.');

let multiPageCalls = 0;
let modelCalls = 0;
let repairCalls = 0;
const multiPage = await runWebsiteGeneration({
  env: {},
  callModel: async () => { modelCalls += 1; return { text: 'unused' }; },
  shouldBuild: true,
  initialQuotaInputText: 'initial',
  multiPageOptions: { prompt: 'brief' },
  buildMultiPage: async options => {
    multiPageCalls += 1;
    assert.equal(options.prompt, 'brief');
    assert.equal(typeof options.callModel, 'function');
    return { text: 'built', files: { 'index.html': '<!doctype html>' }, quotaInputText: 'builder-input', quotaOutputText: 'builder-output' };
  },
  repairSinglePage: async () => { repairCalls += 1; return null; },
});
assert.equal(multiPage.multiPageBuild, true);
assert.equal(multiPage.result.text, 'built');
assert.equal(multiPage.quotaInputText, 'builder-input');
assert.equal(multiPage.quotaOutputText, 'builder-output');
assert.equal(multiPageCalls, 1);
assert.equal(modelCalls, 0);
assert.equal(repairCalls, 0);

const fallback = await runWebsiteGeneration({
  env: {},
  callModel: async (_env, options) => { modelCalls += 1; assert.equal(options.system, 'system'); return { text: 'raw' }; },
  shouldBuild: true,
  modelOptions: { system: 'system' },
  singlePageOptions: { prompt: 'brief' },
  buildMultiPage: async () => null,
  repairSinglePage: async options => {
    repairCalls += 1;
    assert.equal(options.result.text, 'raw');
    assert.equal(options.prompt, 'brief');
    return { result: { text: 'repaired' }, quotaInputText: 'repair-input', quotaOutputText: 'repair-output' };
  },
});
assert.equal(fallback.multiPageBuild, false);
assert.equal(fallback.result.text, 'repaired');
assert.equal(fallback.quotaInputText, 'repair-input');
assert.equal(fallback.quotaOutputText, 'repair-output');

let scopedBuildCalls = 0;
let scopedRepairCalls = 0;
const scoped = await runWebsiteGeneration({
  env: {},
  callModel: async () => ({ text: 'scoped edit' }),
  shouldBuild: true,
  scopedEdit: true,
  buildMultiPage: async () => { scopedBuildCalls += 1; return null; },
  repairSinglePage: async () => { scopedRepairCalls += 1; return null; },
});
assert.equal(scoped.result.text, 'scoped edit');
assert.equal(scopedBuildCalls, 0);
assert.equal(scopedRepairCalls, 0);

await assert.rejects(() => runWebsiteGeneration({ shouldBuild: true }), /requires a model caller/);
console.log('OVYX unified website engine tests passed.');
