import assert from 'node:assert/strict';
import { buildRequirementIntelligence } from '../functions/_lib/requirement-intelligence.js';
import { buildWebsiteEnginePlan, buildWebsiteEngineInstructions } from '../functions/_lib/website-engine.js';

const contract = {
  requirementManifestComplete: true,
  omittedRequirementClauseCount: 0,
  allBriefClauses: [
    'R001: Include a customer login and account dashboard.',
    'R002: Do not include a customer login and account dashboard.',
    'R003: Persist customer records in the database.',
    'R004: Keep the layout responsive on mobile and desktop.',
    'R005: A premium editorial visual direction is preferred.',
  ],
};
const architecture = {
  requirementMappings: [
    { requirementId: 'R001', targetNodeIds: ['page-account','component-auth'], assessment: 'mapped-to-auth' },
    { requirementId: 'R003', targetNodeIds: ['model-customer'], assessment: 'mapped-to-data' },
  ],
};
const ledger = buildRequirementIntelligence('Build a customer portal', contract, architecture);
assert.equal(ledger.engine, 'ovyx-requirement-intelligence');
assert.equal(ledger.counts.total, 5);
assert.equal(ledger.counts.required, 3);
assert.equal(ledger.counts.prohibited, 1);
assert.equal(ledger.counts.preferences, 1);
assert.equal(ledger.counts.mapped, 2);
assert.equal(ledger.counts.unmapped, 3);
assert.equal(ledger.conflicts.length, 1);
assert.deepEqual(ledger.conflicts[0].requirementIds, ['R001','R002']);
assert.ok(ledger.unmappedRequirementIds.includes('R004'));
assert.equal(ledger.requirements[0].priority, 'critical');
assert.equal(ledger.requirements[1].polarity, 'prohibited');
assert.ok(ledger.requirements.every(item => item.acceptanceEvidence === 'not-generated'));
const empty = buildRequirementIntelligence('', { allBriefClauses: [] }, {});
assert.equal(empty.counts.total, 0);
console.log('OVYX requirement intelligence tests passed.');

const boundedLedger = buildRequirementIntelligence('', {
  requirementManifestComplete: false,
  omittedRequirementClauseCount: 20,
  allBriefClauses: Array.from({ length: 180 }, (_, index) => 'R' + String(index + 1).padStart(3, '0') + ': Build an explicit section ' + (index + 1) + '.'),
}, {});
assert.equal(boundedLedger.status, 'bounded-partial');
assert.equal(boundedLedger.counts.total, 180);
assert.equal(boundedLedger.counts.sourceOmitted, 20);

const nuanceLedger = buildRequirementIntelligence('', {
  requirementManifestComplete: true,
  omittedRequirementClauseCount: 0,
  allBriefClauses: [
    'R001: Do not forget to include keyboard navigation and visible focus states.',
    'R002: The page must not include third-party tracking scripts.',
    'R003: Keep the checkout flow accessible to keyboard users.',
    'R004: Do not include the checkout flow for keyboard users.',
    'R005: Keep the layout no more than 1200 pixels wide.',
    'R006: Not only should the site be responsive, but do not include third-party tracking.',
    'R007: No third-party tracking scripts should be included.',
  ],
}, {
  requirementMappings: [
    { requirementId: 'R001', targetNodeIds: ['component-navigation'], dependencyRequirementIds: ['R003', 'R999'], acceptanceCriteria: ['Tab reaches every interactive control.'] },
  ],
});
assert.equal(nuanceLedger.requirements[0].polarity, 'required', '“Do not forget to” is an affirmative requirement, not an exclusion.');
assert.deepEqual(nuanceLedger.requirements[0].negationEvidence, []);
assert.equal(nuanceLedger.requirements[0].confidence, 'high');
assert.deepEqual(nuanceLedger.requirements[0].dependencyRequirementIds, ['R003'], 'Unknown and self dependency IDs must be discarded.');
assert.deepEqual(nuanceLedger.requirements[0].acceptanceCriteria, ['Tab reaches every interactive control.']);
assert.equal(nuanceLedger.requirements[1].polarity, 'prohibited');
assert.equal(nuanceLedger.requirements[4].polarity, 'required', 'A positive bounded-layout constraint remains required, not a feature exclusion.');
assert.deepEqual(nuanceLedger.requirements[4].negationEvidence, [], 'Comparative “no more than” must not be mistaken for prohibition.');
assert.equal(nuanceLedger.requirements[5].polarity, 'prohibited', 'A negation later in a compound clause must not be hidden by an earlier “not only” phrase.');
assert.equal(nuanceLedger.requirements[6].polarity, 'prohibited', 'Explicit no-feature constraints must be recognized even when they do not start the clause.');
assert.ok(nuanceLedger.conflicts.some(item => item.requirementIds.includes('R003') && item.requirementIds.includes('R004')),
  'Near-identical positive and prohibited requirements must be surfaced even when their wording differs.');


// Stage 1 integration: ensure the model-facing website plan receives a
// compact, per-requirement semantic signal for required, prohibited and
// preferred instructions, including criticality and traceability status.
const understandingPlan = buildWebsiteEnginePlan([
  'Build a customer portal for small business owners.',
  'Must include customer login and order history.',
  'Do not include third-party tracking scripts.',
  'A minimal visual direction is preferred.',
].join('\n'));
const modelInstructions = buildWebsiteEngineInstructions(understandingPlan);
assert.match(modelInstructions, /"requirementSignals":\[/,
  'The generation model must receive classified signals for the brief requirements.');
assert.match(modelInstructions, /"requirementSignals":\["\+C:ic:[MU]"/,
  'Critical identity and commerce requirements must be marked as required.');
assert.match(modelInstructions, /"requirementSignals":\[[^\]]*"!H:xq:[MU]"/,
  'Explicit third-party tracking exclusions must be marked as prohibited.');
assert.match(modelInstructions, /"requirementSignals":\[[^\]]*"~N:v:[MU]"/,
  'Design preferences must not be promoted to mandatory requirements.');
assert.match(modelInstructions, /Polarity \+ means required, ! means prohibited and must remain excluded, ~ means preference/i,
  'The model must receive the meaning of each requirement signal.');
assert.match(modelInstructions, /These are deterministic signals, not a substitute for reading the complete brief/i,
  'The complete original brief must remain authoritative.');

console.log('OVYX Stage 1 model-facing requirement understanding tests passed.');
