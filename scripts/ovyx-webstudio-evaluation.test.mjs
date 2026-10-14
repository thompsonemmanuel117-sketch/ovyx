import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixturePath = 'scripts/ovyx-webstudio-evaluation-cases.json';
const suite = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const runtime = fs.readFileSync('assets/ovyx-webstudio-quality.js', 'utf8');

const requiredCategories = [
  'luxury-real-estate',
  'fashion-brand',
  'saas-platform',
  'restaurant',
  'ecommerce-store',
  'booking-platform',
  'agency',
  'portfolio',
  'data-dashboard',
];
const requiredFailureCases = [
  'vague-prompt',
  'long-prompt',
  'provider-failure',
  'interrupted-build',
  'missing-integration',
  'malformed-source',
  'targeted-edit',
  'oversized-project',
  'secret-exposure',
];

assert.equal(suite.version, 1, 'Evaluation fixture version must be explicit.');
assert.equal(suite.siteCategories.length, 9, 'The evaluation set must cover all nine website categories.');
assert.equal(suite.failureScenarios.length, 9, 'The evaluation set must cover all nine failure/regression scenarios.');
assert.deepEqual(suite.siteCategories.map(item => item.id).sort(), [...requiredCategories].sort(), 'Every requested site category must have one unique evaluation prompt.');
assert.deepEqual(suite.failureScenarios.map(item => item.id).sort(), [...requiredFailureCases].sort(), 'Every high-risk or failure case must have explicit expected behavior.');
assert.deepEqual(suite.requiredResponsiveWidths, [320, 390, 768, 1024, 1440], 'The evaluation viewport sizes must match the actual browser matrix.');
assert.ok(runtime.includes('WIDTHS = [' + suite.requiredResponsiveWidths.join(', ') + ']'), 'The evaluation viewport matrix must stay aligned with the inspector.');
assert.ok(suite.acceptanceCriteria.length >= 9, 'Evaluation must cover more than visual appearance.');
assert.ok(suite.acceptanceCriteria.some(item => /integration/i.test(item) && /unverified/i.test(item)), 'Live integrations must be evaluated truthfully.');
assert.ok(suite.acceptanceCriteria.some(item => /unrelated pages/i.test(item)), 'Targeted edits must check preservation of existing functionality.');
assert.ok(suite.acceptanceCriteria.some(item => /horizontal overflow/i.test(item)), 'Responsive quality must be evaluated.');
for (const item of suite.siteCategories) {
  assert.ok(item.prompt.length > 150, item.id + ' needs a meaningful repeatable prompt.');
  assert.ok(Array.isArray(item.mustExercise) && item.mustExercise.length >= 4, item.id + ' needs concrete interaction coverage.');
  assert.ok(Array.isArray(item.integrationTruth) && item.integrationTruth.length >= 1, item.id + ' needs explicit integration verification targets.');
}
for (const item of suite.failureScenarios) {
  assert.ok(item.input.length > 15, item.id + ' needs a reproducible failure input.');
  assert.ok(Array.isArray(item.expected) && item.expected.length >= 3, item.id + ' needs concrete expected behavior.');
}

console.log('Web Studio evaluation suite validated: nine site categories, nine failure/regression cases, responsive matrix, integration truthfulness, and existing-feature preservation.');
