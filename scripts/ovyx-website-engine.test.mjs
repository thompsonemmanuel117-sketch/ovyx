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
assert.ok(plan.fullStackArchitecture.stateMachines.some(machine => machine.entity === 'Booking'));
assert.ok(plan.fullStackArchitecture.crossLayerContracts.dataConsistency);
assert.equal(websiteEngineClientSummary(plan).fullStackArchitecture.graph.valid, true);
assert.ok(websiteEngineClientSummary(plan).fullStackArchitecture.workflowStateMachineCount > 0);
assert.match(buildWebsiteEngineInstructions(plan), /AUTHORITATIVE PRE-GENERATION PLAN/);
assert.match(buildWebsiteEngineInstructions(plan), /FULL-STACK ARCHITECTURE CONTRACT/);
assert.match(buildWebsiteEngineInstructions(plan), /do not silently return a frontend-only site/i);
assert.match(buildWebsiteEngineInstructions(plan), /matching server route\/handler/i);
assert.match(buildWebsiteEngineInstructions(plan), /domain schema, relationships, constraints and indexes/i);
assert.match(buildWebsiteEngineInstructions(plan), /workflow state machines/i);
assert.match(buildWebsiteEngineInstructions(plan), /authorization-negative cases/i);
assert.equal(websiteEngineClientSummary(plan).pageCandidates, 6);
assert.equal(buildWebsiteEnginePlan('A simple one-page portfolio').strategy, 'single-page-or-context-derived');

const linePreservingBrief = [
  'Build a multi-page business website.',
  'Keep the existing user accounts and secure sessions.',
  'Persist enquiries and send them through the configured email integration.',
].join('\n');
assert.equal(
  buildWebsiteEnginePlan(linePreservingBrief).requirementManifest.total,
  3,
  'The website engine must preserve separate line-delimited requirements when building its prompt contract.',
);

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
assert.equal(parsedLongPlan.fullStackArchitecture.requirementTraceabilityGroups.reduce((sum, group) => sum + group.requirementIds.length, 0), 180);
assert.ok(serializedPlan.length <= 18000, 'The architecture contract must fit the same bounded model instruction budget.');

const longFullStackBrief = Array.from({ length: 180 }, (_, index) =>
  'Requirement ' + (index + 1) + ': Persist the order record, enforce account roles, validate checkout, reconcile payment events and verify the server API response for workflow step ' + (index + 1) + '.'
).join('\n');
const longFullStackPlan = buildWebsiteEnginePlan(longFullStackBrief);
const longFullStackInstructions = buildWebsiteEngineInstructions(longFullStackPlan);
const longFullStackSerialized = longFullStackInstructions.split(/\n\n/)[2];
assert.ok(longFullStackSerialized.length <= 18000, 'A complex full-stack architecture and all requirement IDs must fit the safe model instruction budget.');
const parsedLongFullStack = JSON.parse(longFullStackSerialized);
assert.equal(parsedLongFullStack.fullStackArchitecture.requirementTraceabilityGroups.reduce(
  (sum, group) => sum + group.requirementIds.length, 0
), 180);
assert.equal(parsedLongFullStack.fullStackArchitecture.graphIntegrity.valid, true);
assert.ok(parsedLongFullStack.fullStackArchitecture.apiContracts.some(route => route.path === '/api/payments/intents'));
assert.ok(parsedLongFullStack.fullStackArchitecture.security.controls.some(control => control[0] === 'payment-integrity'));
assert.ok(parsedLongFullStack.fullStackArchitecture.stateMachines.some(machine => machine.entity === 'PaymentAttempt'));
assert.ok(parsedLongFullStack.fullStackArchitecture.dataIntegrity.constraints.some(item => item[0] === 'money-minor-units'));


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


const backendArchitecture = buildWebsiteEnginePlan(
  'Build a full-stack contact website with a contact form and database persistence.'
).fullStackArchitecture;
const workflowSource = 'export const workflowContracts = ' + JSON.stringify(backendArchitecture.stateMachines || []) + '; export function transitionContactSubmission(state, nextState) { return { state, nextState }; }';
const backendTestSource = "import { test } from 'node:test'; import assert from 'node:assert/strict'; test('authorization owner rate-limit idempotency workflow transition', () => { assert.ok(['authorization', 'owner', 'rate-limit', 'idempotency', 'transition'].length === 5); });";
let backendCalls = 0;
const backendBuild = await runWebsiteGeneration({
  env: {},
  shouldBuild: true,
  fullStackArchitecture: backendArchitecture,
  originalPrompt: 'Build a contact form that persists submissions.',
  modelOptions: { system: 'system' },
  callModel: async (_env, options) => {
    backendCalls += 1;
    assert.match(options.taskPrompt, /FULL-STACK SOURCE GENERATION/);
    return {
      text: JSON.stringify({
        files: {
          'functions/api/contact-submissions.js': 'export async function onRequestPost(context) { await enforceRateLimit(context.request); const result = await context.env.DB.prepare(\"INSERT INTO contact_submissions\").run(); return Response.json({ ok: true, result }); }',
          'db/schema.sql': 'CREATE TABLE contact_submissions (id TEXT PRIMARY KEY, name TEXT NOT NULL, reply_to TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);',
          'migrations/0001_initial.sql': 'CREATE TABLE contact_submissions (id TEXT PRIMARY KEY, name TEXT NOT NULL, reply_to TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);',
          'server/workflows/contact-submission.js': workflowSource,
          'tests/backend-contracts.test.js': backendTestSource,
        },
      }),
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    };
  },
  buildMultiPage: async () => ({
    text: 'frontend built',
    files: { 'index.html': '<!doctype html><html><body>Contact</body></html>' },
    rawUsage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
  }),
});
assert.equal(backendCalls, 1, 'A full-stack website build must run a distinct backend source-generation pass.');
assert.equal(backendBuild.result.fullStackGeneration.status, 'source-generated-runtime-unverified');
assert.equal(backendBuild.fullStackSourceEvidence.status, 'source-evidence-present-runtime-unverified');
assert.ok(backendBuild.result.files['functions/api/contact-submissions.js']);
assert.ok(backendBuild.result.files['db/schema.sql']);
assert.equal(backendBuild.fullStackSourceEvidence.runtimeBehaviorVerified, false);
assert.equal(backendBuild.fullStackSourceEvidence.databasePersistenceVerified, false);
assert.equal(backendBuild.fullStackSourceEvidence.workflowEvidenceCount, backendArchitecture.stateMachines.length);
assert.equal(backendBuild.fullStackSourceEvidence.generatedTestEvidence, true);
assert.equal(backendBuild.fullStackSourceEvidence.migrationEvidence, true);
assert.equal(backendBuild.fullStackSourceEvidence.databaseProvider, 'not-selected-by-architecture-planner');
assert.equal(backendBuild.fullStackSourceEvidence.indexEvidenceCount, backendArchitecture.dataIntegrity.indexes.length);
assert.equal(backendBuild.fullStackSourceEvidence.relationshipEvidenceCount, backendArchitecture.dataIntegrity.relationships.length);
assert.deepEqual(backendBuild.result.rawUsage, { prompt_tokens: 13, completion_tokens: 24, total_tokens: 37 }, 'Backend model usage must be added to frontend generation usage before quota settlement.');



let singlePageBackendCalls = 0;
const singlePageHtml = '<!doctype html><html><body>Single page contact</body></html>';
const singlePageBackend = await runWebsiteGeneration({
  env: {},
  shouldBuild: true,
  fullStackArchitecture: backendArchitecture,
  originalPrompt: 'Build a single-page full-stack contact website.',
  modelOptions: { system: 'system' },
  callModel: async (_env, options) => {
    singlePageBackendCalls += 1;
    if (!options.taskPrompt || !options.taskPrompt.includes('FULL-STACK SOURCE GENERATION')) {
      return { text: singlePageHtml, rawUsage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } };
    }
    return {
      text: JSON.stringify({
        files: {
          'functions/api/contact-submissions.js': 'export async function onRequestPost(context) { await enforceRateLimit(context.request); const result = await context.env.DB.prepare("INSERT INTO contact_submissions").run(); return Response.json({ ok: true, result }); }',
          'db/schema.sql': 'CREATE TABLE IF NOT EXISTS contact_submissions (id TEXT PRIMARY KEY, name TEXT NOT NULL, reply_to TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);',
          'migrations/0001_initial.sql': 'CREATE TABLE IF NOT EXISTS contact_submissions (id TEXT PRIMARY KEY, name TEXT NOT NULL, reply_to TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);',
          'server/workflows/contact-submission.js': workflowSource,
          'tests/backend-contracts.test.js': backendTestSource,
        },
      }),
      usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
    };
  },
  buildMultiPage: async () => null,
  repairSinglePage: async ({ result }) => ({ result, quotaInputText: 'single page prompt', quotaOutputText: result.text }),
});
assert.equal(singlePageBackendCalls, 2);
assert.equal(singlePageBackend.multiPageBuild, true, 'A single-page frontend must be packaged with its generated backend files.');
assert.equal(singlePageBackend.result.files['index.html'], singlePageHtml);
assert.ok(singlePageBackend.result.files['functions/api/contact-submissions.js']);
assert.deepEqual(singlePageBackend.result.rawUsage, { prompt_tokens: 6, completion_tokens: 9, total_tokens: 15 });

let secureBackendAttempts = 0;
const secureBackendBuild = await runWebsiteGeneration({
  env: {},
  shouldBuild: true,
  fullStackArchitecture: backendArchitecture,
  originalPrompt: 'Build a full-stack contact website.',
  callModel: async () => {
    secureBackendAttempts += 1;
    const routeSource = secureBackendAttempts === 1
      ? 'export async function onRequestPost(context) { await enforceRateLimit(context.request); const key = "sk_live_12345678901234567890"; return Response.json({ key }); }'
      : 'export async function onRequestPost(context) { await enforceRateLimit(context.request); const result = await context.env.DB.prepare("INSERT INTO contact_submissions").run(); return Response.json({ ok: true, result }); }';
    return {
      text: JSON.stringify({
        files: {
          'functions/api/contact-submissions.js': routeSource,
          'functions/api/unsafe-runtime.js': "export async function onRequestGet() { return Response.json({ value: eval('1 + 1') }); }",
          'db/schema.sql': 'CREATE TABLE IF NOT EXISTS contact_submissions (id TEXT PRIMARY KEY, name TEXT NOT NULL, reply_to TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);',
          'migrations/0001_initial.sql': 'CREATE TABLE IF NOT EXISTS contact_submissions (id TEXT PRIMARY KEY, name TEXT NOT NULL, reply_to TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);',
          'server/workflows/contact-submission.js': workflowSource,
          'tests/backend-contracts.test.js': backendTestSource,
        },
      }),
    };
  },
  buildMultiPage: async () => ({ text: 'frontend built', files: { 'index.html': '<!doctype html>' } }),
});
assert.equal(secureBackendAttempts, 2, 'Credential-shaped generated source must be rejected and repaired once.');
assert.equal(secureBackendBuild.fullStackSourceEvidence.status, 'source-evidence-present-runtime-unverified');
assert.doesNotMatch(secureBackendBuild.result.files['functions/api/contact-submissions.js'], /sk_live_/);
assert.equal(secureBackendBuild.result.files['functions/api/unsafe-runtime.js'], undefined, 'Unsafe dynamic execution must be filtered from generated backend files.');

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


const filePlan = buildWebsiteEnginePlan('Update the existing site header and preserve every other route.', {
  files: {
    'index.html': '<script type="module" src="./src/main.js"></script>',
    'src/main.js': "import './header.js';",
    'src/header.js': 'export const header = true;',
  },
  changedPaths: ['src/header.js'],
});
assert.equal(filePlan.fileArchitecture.status, 'analyzed');
assert.equal(filePlan.fileArchitecture.fileCount, 3);
assert.deepEqual(filePlan.fileArchitecture.impactAnalysis.impactedPaths, ['index.html', 'src/main.js']);
assert.ok(buildWebsiteEngineInstructions(filePlan).includes('fileArchitecture'));
assert.equal(websiteEngineClientSummary(filePlan).fileArchitecture.dependencyCount, 2);
