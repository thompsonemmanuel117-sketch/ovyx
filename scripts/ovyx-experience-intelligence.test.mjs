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

const formerlyCategorizedBriefs = [
  'Build me a premium online fashion store with collection pages.',
  'Build a premium fashion website with an online store and cart controls.',
  'Build an online store with product categories and a cart.',
  'Build a luxury hotel booking website with room details and guest selection.',
  'Create a professional banking-style dashboard for customer accounts.',
  'Build a real-estate marketplace with property listings and agents.',
  'Build a SaaS website with pricing, accounts and subscriptions.',
  'Create a complete online shop with products and a cart.',
  'Design a website for a law firm with practice areas and attorney profiles.',
  'Build a travel site for tours, destinations and trip itineraries.',
  'Build a multi-vendor marketplace for independent makers.',
  'Create a car dealership website with searchable vehicle listings.',
  'Build an event website for a conference with registration and schedule.',
  'Create a restaurant website with a menu and reservation form.',
  'Build an analytics dashboard with reports and filterable records.',
  'Build a multi-page creative agency website with case studies.',
];

for (const prompt of formerlyCategorizedBriefs) {
  assert.equal(detectArchetype(prompt), 'adaptive', 'No website industry is assigned: ' + prompt);
  const brief = buildExperienceBrief(prompt);
  assert.equal(brief.archetype, 'adaptive');
  assert.equal(brief.customizationMode, 'universal-adaptive');
  assert.match(brief.blueprintRole, /no industry classification/i);
  assert.match(brief.designIntelligence.industryOrUseCase, /not classified into an industry/i);
  assert.equal(brief.designIntelligence.projectIntent.value, prompt);
  assert.ok(brief.mission && brief.mission.length > 30, 'Every brief needs a meaningful mission.');
  assert.ok(Array.isArray(brief.mustHave) && brief.mustHave.length >= 4, 'Every brief needs a useful project plan.');
  assert.ok(Array.isArray(brief.delighters) && brief.delighters.length >= 3, 'Every brief needs optional experience improvements.');
  assert.ok(Array.isArray(brief.architecture?.sections) && brief.architecture.sections.length >= 4, 'Every brief needs an adaptive information architecture.');
  assert.ok(Array.isArray(brief.architecture?.visualAvoid), 'Every brief needs anti-template guidance.');
  assert.ok(brief.qualityGates.includes('no dead controls, broken anchors or placeholder copy'));
}

assert.equal(detectArchetype('Please put a navigation bar above the main content.'), 'adaptive');
assert.equal(isWebStudioPrompt('Design me a luxury hotel experience.'), true);
assert.equal(isWebStudioPrompt('How do hotel booking platforms work?'), false);
assert.equal(isWebStudioPrompt('Please create a marketplace for local artists.'), true);
assert.equal(isWebStudioPrompt('Build a five-page site for my business.', 'web-studio-build'), true);

// Existing-site edits must continue to route even when "website" is omitted.
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
assert.equal(isWebStudioPrompt('How can I improve my writing?'), false);

// Open-ended concepts remain first-class build requests without matching a
// fixed industry vocabulary.
const openEndedPrompts = [
  'Build an online community where independent musicians share unfinished tracks, find collaborators, and schedule listening sessions.',
  'I need an online community where independent musicians can exchange drafts, request feedback and find collaborators.',
  'Create a mobile-friendly tool for neighborhood equipment lending with member profiles, due dates, renewal requests, and overdue reminders.',
  'Develop a digital platform for museum visitors to build accessible, multilingual self-guided tours with audio stops and map checkpoints.'
];
for (const prompt of openEndedPrompts) {
  assert.equal(detectArchetype(prompt), 'adaptive');
  assert.equal(isWebStudioPrompt(prompt), true);
  const brief = buildExperienceBrief(prompt);
  assert.equal(brief.customizationMode, 'universal-adaptive');
  assert.match(brief.blueprintRole, /no industry classification/i);
  assert.ok(brief.customizationContract.some(rule => /no fixed industry category/i.test(rule)));
  assert.ok(brief.mustHave.some(rule => /core workflow/i.test(rule)), 'Custom concepts should prioritize the core workflow.');
  assert.ok(brief.architecture.sections.some(section => /core views|core workflow/i.test(section)), 'Custom concepts should derive their actual screens.');
}

const novelBrief = openEndedPrompts[0];
const novelExperience = buildExperienceBrief(novelBrief);
assert.match(WEB_STUDIO_SYSTEM_PROMPT, /OPEN-ENDED CREATION POLICY/);
assert.match(WEB_STUDIO_SYSTEM_PROMPT, /DESIGN INTELLIGENCE AND FUNCTIONAL QA/);
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

assert.match(WEB_STUDIO_EXCELLENCE, /STRUCTURED DESIGN INTELLIGENCE/);
assert.match(WEB_STUDIO_EXCELLENCE, /INTERACTION LEDGER AND ACCEPTANCE CHECKS/);
assert.match(plan, /designIntelligence/);
assert.match(execution, /end-to-end acceptance path/i);
assert.match(polish, /interaction ledger and acceptance checks/i);

// Context and user facts remain first-class inputs to the adaptive engine.
const premiumPropertyBrief = buildExperienceBrief(
  'Build a luxury real-estate website with high-end homes and a clear property enquiry path.',
  {
    audience: 'High-intent home buyers',
    brandProfile: { personality: 'quietly confident and architectural', pricePositioning: 'premium homes' }
  }
);
assert.equal(premiumPropertyBrief.designIntelligence.targetAudience, 'High-intent home buyers');
assert.equal(premiumPropertyBrief.designIntelligence.brandPersonality.value, 'quietly confident and architectural');
assert.equal(premiumPropertyBrief.designIntelligence.brandPersonality.basis, 'supplied brand context');
assert.equal(premiumPropertyBrief.designIntelligence.pricePositioning.value, 'premium homes');
assert.match(premiumPropertyBrief.designIntelligence.primaryOutcome.value, /qualified property enquiry/i);
assert.ok(premiumPropertyBrief.designIntelligence.customerJourney.length >= 4);
assert.ok(premiumPropertyBrief.qualityGates.some(rule => /business-specific workflows use real logic/i.test(rule)));
assert.ok(premiumPropertyBrief.qualityGates.some(rule => /primary journey is checked/i.test(rule)));

const bookingBrief = buildExperienceBrief('Create a boutique hotel website that lets visitors book a room.');
assert.match(bookingBrief.designIntelligence.primaryOutcome.value, /booking or reservation/i);
assert.ok(bookingBrief.designIntelligence.adaptiveWorkflowRequirements.some(rule => /scheduling is requested/i));

const taskBrief = buildExperienceBrief('Build a neighborhood equipment-lending management tool.');
assert.match(taskBrief.designIntelligence.primaryOutcome.value, /core task/i);
assert.match(taskBrief.designIntelligence.pricePositioning.value, /Not specified/i);
assert.equal(taskBrief.customizationMode, 'universal-adaptive');

const commerceBrief = buildExperienceBrief('Create a custom digital store with products, cart and checkout.');
assert.ok(commerceBrief.designIntelligence.adaptiveWorkflowRequirements.some(rule => /commerce is requested/i));

const fileBrief = buildExperienceBrief('Create a workspace where users upload and organize project documents.');
assert.ok(fileBrief.designIntelligence.adaptiveWorkflowRequirements.some(rule => /files or media are requested/i));

const inferredLuxury = buildExperienceBrief('Create a premium fashion store with an elegant, minimal brand direction.');
assert.match(inferredLuxury.designIntelligence.brandPersonality.value, /polished, confident and restrained/i);
assert.match(inferredLuxury.designIntelligence.pricePositioning.value, /premium \/ luxury/i);
assert.match(inferredLuxury.designIntelligence.brandPersonality.basis, /provisional/i);

console.log('OVYX adaptive experience intelligence tests passed: arbitrary concepts, no industry buckets, and workflow requirements inferred only from the brief.');
