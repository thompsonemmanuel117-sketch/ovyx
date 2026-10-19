import assert from 'node:assert/strict';
import {
  buildExperienceBrief,
  detectArchetype,
  isWebStudioPrompt
} from '../functions/_lib/experience.js';

const cases = [
  ['Build me a premium online fashion store with collection pages.', 'fashion'],
  ['Build a luxury hotel booking website with room details and guest selection.', 'hospitality'],
  ['Create a professional banking-style dashboard for customer accounts.', 'fintech'],
  ['Build a real-estate marketplace with property listings and agents.', 'realEstate'],
  ['Build a SaaS website with pricing, accounts and subscriptions.', 'saas'],
  ['Create a complete online shop with products and a cart.', 'ecommerce'],
  ['Design a website for a law firm with practice areas and attorney profiles.', 'legal'],
  ['Build a travel site for tours, destinations and trip itineraries.', 'travel'],
  ['Build a multi-vendor marketplace for independent makers.', 'marketplace'],
  ['Create a car dealership website with searchable vehicle listings.', 'automotive'],
  ['Build an event website for a conference with registration and schedule.', 'events'],
  ['Create a restaurant website with a menu and reservation form.', 'restaurant'],
  ['Build an analytics dashboard with reports and filterable records.', 'dashboard'],
  ['Build a multi-page creative agency website with case studies.', 'agency']
];

for (const [prompt, expected] of cases) {
  assert.equal(
    detectArchetype(prompt),
    expected,
    'The experience classifier should select the specific domain for: ' + prompt
  );
  const brief = buildExperienceBrief(prompt);
  assert.equal(brief.archetype, expected);
  assert.ok(brief.mission && brief.mission.length > 20, expected + ' needs a meaningful design mission');
  assert.ok(Array.isArray(brief.mustHave) && brief.mustHave.length >= 4, expected + ' needs domain-specific page/content requirements');
  assert.ok(Array.isArray(brief.delighters) && brief.delighters.length >= 3, expected + ' needs intentional experience ideas');
  assert.ok(Array.isArray(brief.architecture?.sections) && brief.architecture.sections.length >= 4, expected + ' needs a usable information architecture');
  assert.ok(Array.isArray(brief.architecture?.visualAvoid), expected + ' needs anti-pattern guidance');
  assert.ok(brief.qualityGates.includes('no dead controls, broken anchors or placeholder copy'));
}

assert.equal(detectArchetype('Please put a navigation bar above the main content.'), 'generic', 'A common navigation bar must not classify an unrelated request as a restaurant.');
assert.equal(detectArchetype('Build a fashion website with an online store.'), 'fashion', 'A specific brand category must win over the generic online-store phrase.');
assert.equal(detectArchetype('Build a real-estate marketplace for luxury homes.'), 'realEstate', 'The specific vertical should win over the generic marketplace label.');
assert.equal(detectArchetype('Build a banking-style dashboard.'), 'fintech', 'A domain-specific banking brief should win over the generic dashboard layout.');
assert.equal(isWebStudioPrompt('Design me a luxury hotel experience.'), true, 'Explicit creation intent for a supported website category should route to Web Studio.');
assert.equal(isWebStudioPrompt('How do hotel booking platforms work?'), false, 'A general question about an industry should not be mistaken for a website-build request.');
assert.equal(isWebStudioPrompt('Please create a marketplace for local artists.'), true);
assert.equal(isWebStudioPrompt('Build a five-page site for my business.', 'web-studio-build'), true);

console.log('OVYX experience intelligence tests passed for premium multi-industry website categories.');
