import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildExperienceBrief, detectArchetype } from '../functions/_lib/experience.js';

const fixturePath = 'scripts/ovyx-webstudio-evaluation-cases.json';
const suite = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const runtime = fs.readFileSync('assets/ovyx-webstudio-quality.js', 'utf8');

const archetypeCases = [
  ['luxury-real-estate', 'Create a luxury real estate website with search and property listings.', 'realEstate'],
  ['fashion-brand', 'Design an editorial fashion brand website with seasonal collections and a lookbook.', 'fashion'],
  ['ecommerce-store', 'Build an e-commerce online store with a shopping cart and add to cart buttons.', 'ecommerce'],
  ['booking-platform', 'Create an appointment booking platform with an availability calendar and service scheduling.', 'booking'],
  ['data-dashboard', 'Build an analytics dashboard with metrics and data visualization.', 'dashboard'],
  ['saas-platform', 'Create a SaaS software platform for business teams with product workflows.', 'saas'],
  ['restaurant', 'Design a restaurant website with menu discovery and dining experience.', 'restaurant'],
  ['agency', 'Create a creative agency website with selected work and case studies.', 'agency'],
  ['portfolio', 'Build a developer portfolio with project case studies.', 'portfolio'],
];
for (const [id, prompt, expected] of archetypeCases) {
  assert.equal(detectArchetype(prompt), expected, id + ' must select its dedicated experience archetype.');
  const brief = buildExperienceBrief(prompt);
  assert.equal(brief.archetype, expected, id + ' must receive its matching experience brief.');
  assert.ok(brief.architecture.sections.length >= 5, id + ' needs industry-specific information architecture.');
  assert.ok(brief.architecture.visualAvoid.length >= 2, id + ' needs explicit anti-template guidance.');
  assert.ok(brief.mustHave.length >= 4, id + ' needs a visitor-journey checklist.');
  assert.ok(brief.delighters.length >= 3, id + ' needs concrete design/interaction opportunities.');
}

const dashboardBrief = buildExperienceBrief('Build an analytics dashboard for inventory operations.');
assert.ok(dashboardBrief.architecture.sections.some(item => /table|record|data/i.test(item)), 'Dashboards should prioritize usable data workflows.');
const bookingBrief = buildExperienceBrief('Create an appointment scheduling platform for a clinic.');
assert.equal(bookingBrief.archetype, 'healthcare', 'Mixed clinic-booking briefs should preserve the healthcare context instead of losing it to a generic booking template.');
assert.ok(bookingBrief.architecture.sections.some(item => /availability|slot|date|time/i.test(item)), 'Mixed clinic-booking briefs must also plan explicit appointment availability selection.');
const commerceBrief = buildExperienceBrief('Build an online store where people can add items to a cart.');
assert.ok(commerceBrief.architecture.interactionConcepts.some(item => /cart/i.test(item)), 'E-commerce briefs should receive cart-specific interaction guidance.');

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
