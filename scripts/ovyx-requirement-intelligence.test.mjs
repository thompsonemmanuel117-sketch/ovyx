import assert from 'node:assert/strict';
import { buildRequirementIntelligence } from '../functions/_lib/requirement-intelligence.js';

const contract = {
  requirementManifestComplete: true,
  omittedRequirementClauseCount: 0,
  allBriefClauses: [
    'R001: Include a customer login and account dashboard.',
    'R002: Do not include a customer login on the public website.',
    'R003: Persist customer records in the database.',
    'R004: Keep the layout responsive on mobile and desktop.',
    'R005: Use a premium editorial visual direction.',
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
