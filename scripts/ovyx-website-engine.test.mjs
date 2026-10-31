import assert from 'node:assert/strict';
import {
  buildWebsiteEnginePlan,
  buildWebsiteEngineInstructions,
  websiteEngineClientSummary,
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
assert.match(buildWebsiteEngineInstructions(plan), /AUTHORITATIVE PRE-GENERATION PLAN/);
assert.equal(websiteEngineClientSummary(plan).pageCandidates, 6);
assert.equal(buildWebsiteEnginePlan('A simple one-page portfolio').strategy, 'single-page-or-context-derived');

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
