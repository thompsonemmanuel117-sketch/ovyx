import { buildMarketContext } from './market-context.js';
import { buildVisualAssetPlan } from './visual-asset-plan.js';

/**
 * OVYX Experience Intelligence
 *
 * Universal adaptive product-design intelligence used before the model writes code.
 * Every project is planned from its actual brief, audience, content, data and workflows;
 * no industry catalogue or vertical template determines what OVYX can build.
 */

const GLOBAL_ANTI_TEMPLATE_RULES = [
  'Do not default to a centered headline + two buttons + three cards composition.',
  'Do not make every section a repeated rounded-card grid.',
  'Do not use gradients or glow merely to signal “AI”.',
  'Do not repeat the same spacing, card geometry or heading scale in every section.',
  'Do not create decorative motion without a user-facing purpose.',
  'Do not hide the primary action behind clever navigation.',
  'Do not manufacture social proof, statistics, badges, awards or credentials.'
];

function clean(value) {
  return String(value || '').trim();
}

export function isWebStudioPrompt(prompt, mode = '', context = {}) {
  const m = clean(mode).toLowerCase();
  if (/^web-studio-(build|fix|plan|ask)$/.test(m)) return true;
  const activeView = clean(context && context.activeView).replace(/^view-/i, '').toLowerCase();
  if (activeView === 'webstudio') return true;
  const q = clean(prompt).toLowerCase();

  // Preserve explicit existing-project edit routing independently of any
  // vertical classification.
  const changeAction = /\\b(?:add|change|edit|update|fix|repair|improve|enhance|redesign|remove|delete|replace|refine|polish|optimi[sz]e|adjust|modify|implement|restyle|make|move|rearrange|resize|shrink|enlarge|increase|decrease|align|reposition)\\b/i.test(q);
  const existingWebArtifact = /\\b(?:my|this|the|current|existing|selected|active|a|an|that|those|these)\\s+(?:(?:[\\w-]+\\s+){0,2})(?:website|web site|site|web page|page|homepage|landing page|web app|app|project|layout|design|header|footer|hero|headline|heading|title|text|copy|navigation|nav|menu|button|form|section|component|card|grid|modal|dialog|tab|dropdown|sidebar|style|styling|stylesheet|css|html|script|link|image|font|typeface|typography|font size|colour|color|colours|colors|background|contrast|spacing|margin|padding|border|shadow|gradient|icon|logo|animation|transition|responsiveness|responsive|mobile|desktop|tablet|accessibility|seo|content|interaction|feature|control)\\b/i.test(q);
  if (changeAction && existingWebArtifact) return true;

  const explicitBuildAction = /\\b(?:build|create|design|make|generate|develop|launch|craft|produce|turn|transform)\\b/i.test(q);
  const naturalLanguageBuildRequest = /\\b(?:i|we)\\s+(?:want|need|would like|would love)\\s+(?:to\\s+(?:build|create|design|make|develop)\\s+)?(?:a|an|the|my|some kind of|something like)\\s*(?:website|site|web app|application|app|platform|portal|marketplace|online community|community|network|workspace|member area|customer portal|client portal|management system|booking system|interactive experience|digital product|web tool|tool|software product|creator platform|service platform|collaboration space|learning environment|resource hub)\\b/i.test(q);
  if (!explicitBuildAction && !naturalLanguageBuildRequest) return false;

  // This is an intent detector, not an industry classifier. Any stated digital
  // surface or software experience is valid; unfamiliar concepts are not rejected.
  const customDigitalProductIntent = /\\b(?:website|web site|site|web page|landing page|homepage|web app|application|app|platform|portal|marketplace|online store|online shop|storefront|shop|community|network|workspace|member area|customer portal|client portal|management system|booking system|interactive experience|experience|digital product|web tool|tool|software product|online community|creator platform|service platform|collaboration space|learning environment|resource hub|dashboard|admin panel|control centre|control center)\\b/i.test(q);
  return customDigitalProductIntent;
}

/** Legacy-compatible name; OVYX no longer assigns projects to industry buckets. */
export function detectArchetype(_prompt) {
  return 'adaptive';
}

function genericBlueprint() {
  return {
    id: 'generic',
    mission: 'Turn the user-defined concept into a distinctive, usable digital experience shaped by its intended audience and core workflow.',
    mustHave: [
      'project-specific information architecture derived from the user’s concept',
      'the primary job-to-be-done and end-to-end core workflow',
      'navigation, routes or task surfaces appropriate to the requested product',
      'useful empty/loading/success/error states wherever interactions require them',
      'responsive, accessible UI with content density suited to the actual task',
      'help, trust, conversion or account patterns only when relevant to the request'
    ],
    delighters: [
      'signature art direction drawn from the project’s purpose and audience',
      'a guided first-use path when the concept benefits from onboarding',
      'a meaningful interaction that makes the core workflow easier',
      'clear feedback when the user changes, saves, filters or submits information',
      'mobile-specific convenience matched to the way the product will be used'
    ],
    motion: 'purposeful, state-aware, accessible and performance-conscious'
  };
}


function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const candidate = clean(value);
    if (candidate) return candidate;
  }
  return '';
}

function profileValue(profile, ...keys) {
  if (!profile || typeof profile !== 'object') return '';
  return firstNonEmpty(...keys.map(key => profile[key]));
}

function inferBrandPersonality(prompt, context, profile) {
  const supplied = firstNonEmpty(
    context?.brandPersonality,
    context?.brandTone,
    profileValue(profile, 'personality', 'brandPersonality', 'voice', 'tone', 'brandVoice')
  );
  if (supplied) {
    return { value: supplied, basis: 'supplied brand context' };
  }

  const q = clean(prompt).toLowerCase();
  const traits = [
    { pattern: /\b(?:ultra[- ]?luxury|luxury|premium|high[- ]end|bespoke|exclusive)\b/i, value: 'polished, confident and restrained' },
    { pattern: /\b(?:playful|fun|youthful|colourful|colorful|vibrant)\b/i, value: 'playful, expressive and energetic' },
    { pattern: /\b(?:bold|edgy|experimental|disruptive|avant[- ]garde)\b/i, value: 'bold, distinctive and expressive' },
    { pattern: /\b(?:warm|welcoming|friendly|community[- ]led|approachable)\b/i, value: 'warm, welcoming and human' },
    { pattern: /\b(?:minimal|minimalist|clean|understated|modern)\b/i, value: 'clean, modern and restrained' },
    { pattern: /\b(?:professional|corporate|trustworthy|reliable|established)\b/i, value: 'professional, clear and trust-led' }
  ];
  const inferred = [...new Set(traits.filter(item => item.pattern.test(q)).map(item => item.value))];
  return inferred.length
    ? {
        value: inferred.slice(0, 3).join('; '),
        basis: 'provisional direction inferred from explicit wording; not a verified brand fact'
      }
    : {
        value: 'Not specified; infer a coherent direction from the actual use case and intended audience',
        basis: 'not specified'
      };
}

function inferPricePositioning(prompt, context, profile) {
  const supplied = firstNonEmpty(
    context?.pricePoint,
    context?.pricePositioning,
    context?.pricingTier,
    profileValue(profile, 'pricePoint', 'pricePositioning', 'pricingTier', 'marketPosition')
  );
  if (supplied) {
    return { value: supplied, basis: 'supplied pricing or positioning context' };
  }

  const q = clean(prompt).toLowerCase();
  const signals = [
    { pattern: /\b(?:ultra[- ]?luxury|luxury|premium|high[- ]end|exclusive|bespoke)\b/i, value: 'premium / luxury' },
    { pattern: /\b(?:affordable|budget[- ]friendly|low[- ]cost|value[- ]for[- ]money|economy|budget)\b/i, value: 'value-conscious / budget' },
    { pattern: /\b(?:mid[- ]market|mid[- ]range|mainstream)\b/i, value: 'mid-market' },
    { pattern: /\b(?:high[- ]ticket|high ticket)\b/i, value: 'high-ticket' }
  ];
  const matches = [...new Set(signals.filter(item => item.pattern.test(q)).map(item => item.value))];
  if (matches.length) {
    return {
      value: matches.join(' and '),
      basis: matches.length > 1
        ? 'multiple explicit positioning signals; preserve the nuance and do not silently choose one'
        : 'explicit wording in the request; this is not permission to invent actual prices'
    };
  }
  if (/[\u20A6$€£]\s?\d|\b(?:NGN|USD|EUR|GBP)\s?\d/i.test(prompt || '')) {
    return {
      value: 'Exact price references appear in the original brief; preserve them without assuming a wider market tier',
      basis: 'explicit source brief'
    };
  }
  return {
    value: 'Not specified',
    basis: 'do not invent product prices or a market tier; use only conservative visual cues supported by the audience and offer'
  };
}

function inferPrimaryOutcome(prompt, archetypeId, context, profile) {
  const supplied = firstNonEmpty(
    context?.primaryOutcome,
    context?.businessGoal,
    context?.conversionGoal,
    profileValue(profile, 'primaryOutcome', 'businessGoal', 'conversionGoal')
  );
  if (supplied) {
    return { value: supplied, basis: 'supplied goal or brand context' };
  }

  const q = clean(prompt).toLowerCase();
  if (/\b(?:donat(?:e|ion|ions)|fundrais(?:e|ing)|give online)\b/i.test(q)) {
    return { value: 'complete a transparent donation or giving action', basis: 'inferred from the requested workflow' };
  }
  if (/\b(?:book(?:ing)?|reserve|reservation|appointment|schedule a (?:visit|call|viewing|session)|room availability|table booking)\b/i.test(q)) {
    return { value: 'complete a booking or reservation with clear availability and confirmation states', basis: 'inferred from an explicit booking action' };
  }
  if (archetypeId === 'realEstate' || /\b(?:real estate|real-estate|realtor|estate agent|property listings?|homes for sale)\b/i.test(q)) {
    return { value: 'help visitors discover relevant properties and make a qualified property enquiry', basis: 'inferred from the real-estate use case; do not imply listings are live unless connected' };
  }
  if (archetypeId === 'ecommerce' || /\b(?:e-?commerce|online store|online shop|shopping cart|add to cart|checkout|buy products|sell products)\b/i.test(q)) {
    return { value: 'help visitors choose suitable products and complete a transparent purchase journey', basis: 'inferred from the commerce workflow' };
  }
  if (/\b(?:apply now|application form|apply for|submit an application)\b/i.test(q)) {
    return { value: 'complete an application with clear requirements and honest submission feedback', basis: 'inferred from an explicit application workflow' };
  }
  if (/\b(?:sign ?up|register|join|subscribe|free trial|start a trial|create an account|enrol|enroll)\b/i.test(q)) {
    return { value: 'complete signup or activation with clear value, terms and next steps', basis: 'inferred from the requested activation path' };
  }
  if (/\b(?:request a quote|quote request|contact form|contact us|enquir(?:y|ies)|inquir(?:y|ies)|consultation|talk to sales|lead generation|get in touch)\b/i.test(q) ||
      /\b(?:agency|law firm|legal|consultant|consultancy|professional service|service business)\b/i.test(q)) {
    return { value: 'generate a relevant, qualified enquiry through a clear and trustworthy contact path', basis: 'inferred from the service or contact intent' };
  }
  if (/\b(?:dashboard|web app|web application|app|platform|portal|workspace|tool|management system|internal tool|admin panel|task management|productivity tool)\b/i.test(q)) {
    return { value: 'help users complete the core task accurately and recover clearly from errors', basis: 'inferred from the task-focused product type' };
  }
  return {
    value: 'derive the most relevant next step from the original brief; do not force a sales funnel onto a task-focused or informational experience',
    basis: 'not explicit; keep the goal faithful to the user request'
  };
}

function decisionQuestionsForOutcome(outcome) {
  const value = String(outcome || '').toLowerCase();
  if (/purchase|product/.test(value)) {
    return [
      'Can visitors understand product fit, specifications, variants and actual price?',
      'Are delivery, returns, fees and checkout terms shown only when known?',
      'Can visitors correct cart or form mistakes before committing?'
    ];
  }
  if (/booking|reservation/.test(value)) {
    return [
      'Can visitors understand the service, location, date or time choices, and relevant terms?',
      'Is availability real or clearly marked as unavailable/unconnected?',
      'Does the result distinguish a request from a confirmed booking?'
    ];
  }
  if (/property/.test(value)) {
    return [
      'Can visitors filter or compare relevant property details and understand the stated guide price?',
      'Are listing status and property facts grounded rather than fabricated?',
      'Can a visitor enquire about a specific property without losing context?'
    ];
  }
  if (/enquir|contact/.test(value)) {
    return [
      'Can visitors quickly understand the service, fit and next step?',
      'Does the form request only useful information and explain what happens after submission?',
      'Are trust claims, location, pricing and response expectations grounded in supplied facts?'
    ];
  }
  if (/signup|activation/.test(value)) {
    return [
      'Is the value clear before asking for personal information?',
      'Are plan limits, pricing and consent choices transparent when relevant?',
      'Does the UI distinguish a real account or subscription from a local preview?'
    ];
  }
  if (/task/.test(value)) {
    return [
      'Can users identify and complete the main task without navigating a generic marketing funnel?',
      'Are input, empty, loading, validation, success and error states understandable where applicable?',
      'Can users recover from mistakes without losing avoidable work?'
    ];
  }
  return [
    'Can the intended visitor understand the purpose and most useful next step quickly?',
    'Does each major section or control support the original user goal?',
    'Are decisions and claims supported by supplied facts or clearly labelled assumptions?'
  ];
}

function journeyForOutcome(outcome) {
  const value = String(outcome || '').toLowerCase();
  if (/purchase|product/.test(value)) {
    return ['orient to the offer', 'discover and filter relevant products', 'review useful details and actual prices', 'select variants and edit cart', 'complete or clearly identify the checkout boundary'];
  }
  if (/booking|reservation/.test(value)) {
    return ['understand the service', 'choose service and date/time options', 'review availability and terms', 'submit a request or complete the real booking', 'show an honest confirmation or error'];
  }
  if (/property/.test(value)) {
    return ['understand the agency and locations served', 'search or browse suitable properties', 'compare grounded facts and guide prices', 'enquire about a selected property', 'show honest follow-up state'];
  }
  if (/enquir|contact/.test(value)) {
    return ['understand the offer', 'review services and supporting facts', 'resolve relevant questions', 'send a concise enquiry through a real configured path', 'show an honest result'];
  }
  if (/task/.test(value)) {
    return ['enter the workspace', 'provide or select required information', 'complete the core action', 'review the result', 'recover or continue from errors and empty states'];
  }
  return ['orient around the stated need', 'explore the most relevant content or options', 'answer the decision questions that matter', 'complete the primary action or next step', 'show a truthful outcome'];
}

export function buildExperienceBrief(prompt, context = {}) {
  const archetypeId = detectArchetype(prompt);
  const source = ARCHETYPES.find(item => item.id === archetypeId) || genericBlueprint();
  const brand = context?.brandProfile || null;
  const audience = firstNonEmpty(context?.audience, context?.targetAudience, profileValue(brand, 'targetAudience', 'audience')) || 'infer the primary visitor from the prompt without inventing unsupported facts';
  const brandPersonality = inferBrandPersonality(prompt, context, brand);
  const pricePositioning = inferPricePositioning(prompt, context, brand);
  const primaryOutcome = inferPrimaryOutcome(prompt, archetypeId, context, brand);

  return {
    archetype: archetypeId,
    mission: source.mission,
    audience,
    experiencePrinciples: [
      'build the whole user journey, not only the hero',
      'make important actions obvious within one or two interaction steps',
      'use a strong visual system instead of random decorative effects',
      'make desktop, tablet and mobile feel intentionally designed',
      'use motion to communicate hierarchy and state',
      'prefer progressive disclosure over visual clutter',
      'never invent business facts, prices, reviews, credentials, schedules or statistics'
    ],
    conversionPrinciples: [
      'derive one primary business or user outcome from the brief; for task-focused apps optimize task completion rather than forcing sales patterns',
      'communicate a clear, specific value proposition and audience-relevant benefits early',
      'create one primary action with useful secondary paths and accurate action labels',
      'remove avoidable steps, fields, ambiguity, and mobile interaction friction while preserving user choice',
      'resolve relevant decision objections with supplied facts, clear policies, and useful product or service details',
      'place authentic proof and trust information near the decisions they support; never invent testimonials, metrics, credentials, inventory, guarantees, or claims',
      'keep commerce totals, terms, variants, cart changes, and checkout state transparent',
      'make forms accessible, minimal, easy to recover from, and honest about what submission does',
      'use ethical persuasion only; no fake scarcity, hidden fees, deceptive consent, confirm-shaming, or false urgency',
      'do not promise a conversion lift; treat design as one contributor and use real, privacy-respecting measurement only when supported'
    ],
    conversionAudit: [
      'A new visitor can understand the offer or product purpose and intended audience within seconds.',
      'The primary action is visually obvious, accurately labelled, functional, and reachable on mobile and by keyboard.',
      'The path to the primary goal avoids unnecessary steps without hiding important terms or choices.',
      'Important objections and trust questions are answered with grounded facts rather than invented proof.',
      'Forms, cart, booking, signup, and confirmation states represent actual behavior honestly.',
      'The design does not rely on dark patterns, fake reviews, pressure tactics, or unsupported results.'
    ],
    mustHave: source.mustHave,
    delighters: source.delighters,
    motion: source.motion,
    marketContext: buildMarketContext(prompt, context),
    visualAssetPlan: buildVisualAssetPlan(prompt, context, archetypeId),
    signatureMoments: [
      'one memorable above-the-fold composition',
      'one interactive or motion-led storytelling moment',
      'one high-confidence conversion moment',
      'one mobile-specific convenience improvement'
    ],
    qualityGates: [
      'semantic and accessible markup',
      'responsive behavior without horizontal overflow',
      'keyboard-visible focus states',
      'reduced-motion support',
      'fast-loading and dependency-conscious implementation',
      'SEO title, description and viewport metadata where relevant',
      'no dead controls, broken anchors or placeholder copy',
      'every visible control has an intentional, traceable action; noninteractive decoration is not presented as a control',
      'business-specific workflows use real logic or a connected integration, with demo-only boundaries clearly disclosed',
      'the primary journey is checked across relevant validation, empty, loading, success and error states',
      'routes, anchors, form labels, dialog keyboard behavior and visible state announcements are checked where relevant',
      'mobile, tablet and desktop layouts are reviewed for overflow, clipping and obstructed primary actions'
    ],
    contentRules: [
      'use supplied facts verbatim when they are provided',
      'when a fact is missing, build a finished structure without inventing the fact',
      'write specific copy appropriate to the requested organization/product rather than generic filler'
    ],
    brandDirection: brand
      ? 'Use the supplied brand profile as the visual authority.'
      : 'Infer a restrained, coherent visual direction from the request and avoid generic AI-template styling.',
    designIntelligence: {
      industryOrUseCase: archetypeId === 'generic'
        ? 'User-defined concept; derive the structure from the original brief instead of forcing a predefined template'
        : archetypeId,
      targetAudience: audience,
      brandPersonality,
      pricePositioning,
      primaryOutcome,
      decisionQuestions: decisionQuestionsForOutcome(primaryOutcome.value),
      customerJourney: journeyForOutcome(primaryOutcome.value),
      visualDirectionRule: brand
        ? 'Respect the supplied brand profile, existing brand assets and stated constraints; refine them rather than overwriting them.'
        : 'Derive a distinctive visual system from the requested industry, audience, intended emotion and explicit positioning. Treat inferred personality as a design hypothesis, not an established brand fact.',
      pricingTruthRule: 'Use explicit prices and supplied price positioning exactly. If price positioning is unspecified, do not invent product prices, discounts, package tiers or scarcity; keep any visual inference provisional.'
    },
    blueprintRole: 'advisory-only; never a required category, allowlist, or template',
    customizationMode: archetypeId === 'generic' ? 'open-ended-custom-concept' : 'domain-guided-custom-concept',
    customizationContract: [
      'The original user request is the source of truth; this blueprint is advisory guidance only.',
      'Predefined industry archetypes are optional hints, never a list of supported or permitted categories.',
      'For an unfamiliar or unmatched idea, derive the audience, information architecture, routes, data concepts, key workflows, visual direction and interaction states from the user’s own description.',
      'Do not force marketing sections such as pricing, testimonials, FAQs or conversion banners onto a task-focused application unless they serve the stated goal.',
      'For a recognized archetype, adapt selectively to the requested brand, audience, differentiators, features and constraints instead of copying a preset.'
    ],
    architecture: EXPERIENCE_ARCHITECTURES[archetypeId] || {
      sections: [
        'entry point shaped around the user’s primary goal',
        'the core interface or workflow explicitly requested',
        'navigation between the product’s actual tasks or content areas',
        'supporting information, tools or records that the workflow requires',
        'loading, empty, validation, success and error states where relevant',
        'help, settings or next steps only when they serve this concept'
      ],
      interactionConcepts: [
        'a meaningful, testable interaction derived directly from the user’s described workflow',
        'clear feedback for the important actions and state changes in this specific product'
      ],
      motionChoreography: [
        'purposeful transitions that clarify task or navigation changes',
        'state-driven micro-interactions with reduced-motion support'
      ],
      visualAvoid: [
        'forcing a generic marketing landing page, repeated card grid or irrelevant conversion sections onto a different kind of product'
      ]
    },
    antiTemplateRules: GLOBAL_ANTI_TEMPLATE_RULES
  };
}

export function scoreWebStudioChanges(changes = []) {
  const content = changes
    .filter(item => item.action !== 'delete')
    .map(item => String(item.content || ''))
    .join('\n');
  if (!content) return 0;

  let score = 45;
  const add = (re, points) => { if (re.test(content)) score += points; };
  const subtract = (re, points) => { if (re.test(content)) score -= points; };

  add(/<title\b/i, 4);
  add(/name=["']description["']/i, 4);
  add(/name=["']viewport["']/i, 3);
  add(/<nav\b/i, 3);
  add(/<main\b/i, 3);
  add(/<section\b/i, 3);
  add(/@media\b/i, 6);
  add(/prefers-reduced-motion/i, 5);
  add(/transition:|animation:|@keyframes/i, 5);
  add(/aria-|role=["']/i, 4);
  add(/:focus-visible|outline:/i, 4);
  add(/<form\b|type=["']submit["']/i, 3);
  add(/<meta[^>]+og:/i, 2);
  add(/application\/ld\+json/i, 2);
  add(/--[a-z0-9_-]+:/i, 2);
  add(/backdrop-filter|clip-path|mask-image/i, 2);
  add(/scroll-behavior|scroll-snap/i, 2);
  subtract(/lorem ipsum/i, 12);
  subtract(/TODO|FIXME|coming soon|under construction/i, 10);
  subtract(/href=["']#["']/i, 4);
  subtract(/href=["']javascript:/i, 8);

  return Math.max(0, Math.min(100, score));
}
