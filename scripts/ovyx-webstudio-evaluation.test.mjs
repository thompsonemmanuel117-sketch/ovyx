import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildExperienceBrief, detectArchetype } from '../functions/_lib/experience.js';

const fixturePath = 'scripts/ovyx-webstudio-evaluation-cases.json';
const suite = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const runtime = fs.readFileSync('assets/ovyx-webstudio-quality.js', 'utf8');

const experienceExamples = [
  ['property-search', 'Create a luxury real estate website with search and property listings.'],
  ['fashion-collections', 'Design an editorial fashion brand website with seasonal collections and a lookbook.'],
  ['online-store', 'Build an e-commerce online store with a shopping cart and add to cart buttons.'],
  ['appointment-booking', 'Create an appointment booking platform with an availability calendar and service scheduling.'],
  ['analytics-workspace', 'Build an analytics dashboard with metrics and data visualization.'],
  ['team-software', 'Create a SaaS software platform for business teams with product workflows.'],
  ['restaurant-experience', 'Design a restaurant website with menu discovery and dining experience.'],
  ['creative-studio', 'Create a creative agency website with selected work and case studies.'],
  ['professional-portfolio', 'Build a developer portfolio with project case studies.'],
];
for (const [id, prompt] of experienceExamples) {
  assert.equal(detectArchetype(prompt), 'adaptive', id + ' must remain an open-ended adaptive experience, not a fixed industry category.');
  const brief = buildExperienceBrief(prompt);
  assert.equal(brief.archetype, 'adaptive', id + ' must not be assigned a predefined industry archetype.');
  assert.equal(brief.customizationMode, 'universal-adaptive');
  assert.match(brief.blueprintRole, /no industry classification/i);
  assert.ok(brief.architecture.sections.length >= 5, id + ' needs a complete project-specific information architecture.');
  assert.ok(brief.architecture.visualAvoid.length >= 2, id + ' needs explicit anti-template guidance.');
  assert.ok(brief.mustHave.length >= 4, id + ' needs a useful task and user-journey checklist.');
  assert.ok(brief.delighters.length >= 3, id + ' needs concrete design/interaction opportunities.');
}

const dashboardBrief = buildExperienceBrief('Build an analytics dashboard for inventory operations.');
assert.equal(dashboardBrief.archetype, 'adaptive');
assert.ok(dashboardBrief.mustHave.some(item => /reporting is requested/i.test(item)), 'The requested reporting workflow should be inferred without classifying the project.');
const clinicAppointmentBrief = buildExperienceBrief('Build a clinic website that lets visitors schedule appointments and choose from available dates and times.');
assert.equal(clinicAppointmentBrief.archetype, 'adaptive', 'A clinic is not assigned a fixed healthcare archetype.');
assert.equal(clinicAppointmentBrief.customizationMode, 'universal-adaptive');
assert.ok(clinicAppointmentBrief.mustHave.some(item => /scheduling is requested.*availability.*confirmation/i.test(item)), 'Appointment workflows must include availability and honest confirmation states without assigning an industry category.');
assert.ok(clinicAppointmentBrief.architecture.interactionConcepts.some(item => /scheduling is requested/i.test(item)), 'Appointment interaction guidance must be derived from the actual brief.');
const commerceBrief = buildExperienceBrief('Build an online store where people can add items to a cart.');
assert.equal(commerceBrief.archetype, 'adaptive');
assert.ok(commerceBrief.architecture.interactionConcepts.some(item => /commerce is requested.*cart/i.test(item)), 'Commerce/cart behavior should be inferred from the requested workflow, not an industry preset.');

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
  'international-property-marketplace',
  'animated-restaurant-experience',
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
assert.equal(suite.siteCategories.length, 11, 'The evaluation set must cover all eleven website categories.');
assert.equal(suite.failureScenarios.length, 9, 'The evaluation set must cover all nine failure/regression scenarios.');
assert.deepEqual(suite.siteCategories.map(item => item.id).sort(), [...requiredCategories].sort(), 'Every requested site category must have one unique evaluation prompt.');
assert.deepEqual(suite.failureScenarios.map(item => item.id).sort(), [...requiredFailureCases].sort(), 'Every high-risk or failure case must have explicit expected behavior.');
assert.deepEqual(suite.requiredResponsiveWidths, [320, 390, 768, 1024, 1440], 'The evaluation viewport sizes must match the actual browser matrix.');
assert.ok(runtime.includes('WIDTHS = [' + suite.requiredResponsiveWidths.join(', ') + ']'), 'The evaluation viewport matrix must stay aligned with the inspector.');
assert.ok(suite.acceptanceCriteria.length >= 9, 'Evaluation must cover more than visual appearance.');
assert.ok(suite.acceptanceCriteria.some(item => /integration/i.test(item) && /unverified/i.test(item)), 'Live integrations must be evaluated truthfully.');
assert.ok(suite.acceptanceCriteria.some(item => /unrelated pages/i.test(item)), 'Targeted edits must check preservation of existing functionality.');
assert.ok(suite.acceptanceCriteria.some(item => /horizontal overflow/i.test(item)), 'Responsive quality must be evaluated.');
assert.ok(suite.acceptanceCriteria.some(item => /mature, specific/i.test(item) && /placeholder/i.test(item)), 'Editorial copy quality must be an explicit acceptance criterion.');
assert.ok(suite.acceptanceCriteria.some(item => /typography/i.test(item) && /clipped or overlapping/i.test(item)), 'Responsive typography must be an explicit acceptance criterion.');
for (const item of suite.siteCategories) {
  assert.ok(item.prompt.length > 150, item.id + ' needs a meaningful repeatable prompt.');
  assert.ok(Array.isArray(item.mustExercise) && item.mustExercise.length >= 4, item.id + ' needs concrete interaction coverage.');
  assert.ok(Array.isArray(item.integrationTruth) && item.integrationTruth.length >= 1, item.id + ' needs explicit integration verification targets.');
}
for (const item of suite.failureScenarios) {
  assert.ok(item.input.length > 15, item.id + ' needs a reproducible failure input.');
  assert.ok(Array.isArray(item.expected) && item.expected.length >= 3, item.id + ' needs concrete expected behavior.');
}

console.log('Web Studio evaluation suite validated: eleven site categories, nine failure/regression cases, responsive matrix, integration truthfulness, and existing-feature preservation.');
