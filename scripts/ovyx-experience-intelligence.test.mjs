import assert from 'node:assert/strict';
import {
  buildExperienceBrief,
  detectArchetype,
  isWebStudioPrompt
} from '../functions/_lib/experience.js';
import {
  WEB_STUDIO_EXCELLENCE,
  WEB_STUDIO_SYSTEM_PROMPT,
  executePrompt,
  planPrompt,
  polishPrompt
} from '../functions/_lib/prompts.js';

const cases = [
  ['Build me a premium online fashion store with collection pages.', 'fashion'],
  ['Build a premium fashion website with an online store and cart controls.', 'fashion'],
  ['Build an online store with product categories and a cart.', 'ecommerce'],
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

// Existing-site edits should route correctly even if the user omits "website".
const websiteEditRequests = [
  'Add a skip link to this project.',
  'Change the headline on this page.',
  'Fix my mobile menu.',
  'Improve the contrast of this layout.',
  'Update the navigation on my site.',
  'Remove that duplicate section from the current page.',
  'Make the font larger.',
  'Change the colors.',
  'Add a button here.',
  'Delete that section.',
  'Make this layout mobile friendly.',
  'Update the button color.',
  'Reposition the logo.',
  'Increase the spacing.',
  'Move that card below the form.',
  'Replace the hero image.',
  'Change the typography on this page.'
];
for (const prompt of websiteEditRequests) {
  assert.equal(isWebStudioPrompt(prompt), true, 'Existing-page edit intent should route to Web Studio: ' + prompt);
}
assert.equal(isWebStudioPrompt('How can I improve my writing?'), false, 'Unrelated writing advice must not be routed into Web Studio editing.');

// Unknown categories are valid custom briefs, not unsupported requests.
const openEndedPrompts = [
  'Build an online community where independent musicians share unfinished tracks, find collaborators, and schedule listening sessions.',
  'I need an online community where independent musicians can exchange drafts, request feedback and find collaborators.',
  'Create a mobile-friendly tool for neighborhood equipment lending with member profiles, due dates, renewal requests, and overdue reminders.',
  'Develop a digital platform for museum visitors to build accessible, multilingual self-guided tours with audio stops and map checkpoints.'
];
for (const prompt of openEndedPrompts) {
  assert.equal(detectArchetype(prompt), 'generic', 'This deliberately novel brief should not be mislabelled as a predefined vertical: ' + prompt);
  assert.equal(isWebStudioPrompt(prompt), true, 'Open-ended digital-product creation should route to the build experience: ' + prompt);
  const brief = buildExperienceBrief(prompt);
  assert.equal(brief.customizationMode, 'open-ended-custom-concept');
  assert.equal(brief.blueprintRole, 'advisory-only; never a required category, allowlist, or template');
  assert.ok(brief.customizationContract.some(rule => /never a list of supported or permitted categories/i.test(rule)));
  assert.ok(brief.mustHave.some(rule => /core workflow/i.test(rule)), 'Custom concepts should prioritize the request-specific workflow.');
  assert.ok(brief.architecture.sections.some(section => /core interface or workflow/i.test(section)), 'Custom concepts should not default to a marketing-hero sitemap.');
}

const novelBrief = openEndedPrompts[0];
const novelExperience = buildExperienceBrief(novelBrief);
assert.match(WEB_STUDIO_SYSTEM_PROMPT, /OPEN-ENDED CREATION POLICY/);
assert.match(WEB_STUDIO_SYSTEM_PROMPT, /EXISTING-SITE CHANGE REQUESTS \(NON-NEGOTIABLE\)/);
assert.match(WEB_STUDIO_SYSTEM_PROMPT, /concrete delta to the current site—not as permission to rebuild from scratch/i);
assert.match(WEB_STUDIO_SYSTEM_PROMPT, /Implement the requested change rather than replying with instructions only/i);
assert.match(WEB_STUDIO_EXCELLENCE, /EXISTING-SITE EDITS — APPLY THE REQUESTED DELTA/);
assert.match(WEB_STUDIO_EXCELLENCE, /Do not regenerate the whole site or replace unrelated pages/i);
assert.match(WEB_STUDIO_EXCELLENCE, /Distinguish requests to discuss\/recommend changes from requests to apply them/i);
assert.match(WEB_STUDIO_EXCELLENCE, /NO CLOSED CATEGORY LIST/);
const plan = planPrompt({ prompt: novelBrief, tree: 'index.html', hints: '{}', experience: novelExperience });
assert.match(plan, /FREE-FORM REQUEST RULES/);
assert.match(plan, /the user's own description defines the product/i);
const execution = executePrompt({
  prompt: novelBrief,
  plan: { summary: 'Build a custom community experience', siteMap: { pages: [] } },
  files: 'index.html: existing project context',
  hints: '{}',
  experience: novelExperience,
  allowDeletes: false,
  allowWorkflowChanges: false
});
assert.match(execution, /REQUEST FIDELITY AND CUSTOM-CREATION RULES/);
assert.match(execution, /must never restrict which ideas can be built/i);
const polish = polishPrompt({
  prompt: novelBrief,
  plan: {},
  experience: novelExperience,
  files: 'index.html',
  currentScore: 55,
  hints: '{}'
});
assert.match(polish, /archetype or blueprint is advisory, not a template/i);

console.log('OVYX experience intelligence tests passed for premium multi-industry and open-ended custom briefs.');
