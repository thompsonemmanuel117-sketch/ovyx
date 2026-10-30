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
  const changeAction = /\b(?:add|change|edit|update|fix|repair|improve|enhance|redesign|remove|delete|replace|refine|polish|optimi[sz]e|adjust|modify|implement|restyle|make|move|rearrange|resize|shrink|enlarge|increase|decrease|align|reposition)\b/i.test(q);
  const existingWebArtifact = /\b(?:my|this|the|current|existing|selected|active|a|an|that|those|these)\s+(?:(?:[\w-]+\s+){0,2})(?:website|web site|site|web page|page|homepage|landing page|web app|app|project|layout|design|header|footer|hero|headline|heading|title|text|copy|navigation|nav|menu|button|form|section|component|card|grid|modal|dialog|tab|dropdown|sidebar|style|styling|stylesheet|css|html|script|link|image|font|typeface|typography|font size|colour|color|colours|colors|background|contrast|spacing|margin|padding|border|shadow|gradient|icon|logo|animation|transition|responsiveness|responsive|mobile|desktop|tablet|accessibility|seo|content|interaction|feature|control)\b/i.test(q);
  if (changeAction && existingWebArtifact) return true;

  const explicitBuildAction = /\b(?:build|create|design|make|generate|develop|launch|craft|produce|turn|transform)\b/i.test(q);
  const naturalLanguageBuildRequest = /\b(?:i|we)\s+(?:want|need|would like|would love)\s+(?:to\s+(?:build|create|design|make|develop)\s+)?(?:a|an|the|my|some kind of|something like)\s*(?:website|site|web app|application|app|platform|portal|marketplace|online community|community|network|workspace|member area|customer portal|client portal|management system|booking system|interactive experience|digital product|web tool|tool|software product|creator platform|service platform|collaboration space|learning environment|resource hub)\b/i.test(q);
  if (!explicitBuildAction && !naturalLanguageBuildRequest) return false;

  // This is an intent detector, not an industry classifier. Any stated digital
  // surface or software experience is valid; unfamiliar concepts are not rejected.
  return /\b(?:website|web site|site|web page|landing page|homepage|web app|application|app|platform|portal|marketplace|online store|online shop|storefront|shop|community|network|workspace|member area|customer portal|client portal|management system|booking system|interactive experience|experience|digital product|web tool|tool|software product|online community|creator platform|service platform|collaboration space|learning environment|resource hub|dashboard|admin panel|control centre|control center)\b/i.test(q);
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
  const archetypeId = 'adaptive';
  const source = genericBlueprint();
  const brand = context?.brandProfile || null;
  const audience = firstNonEmpty(
    context?.audience,
    context?.targetAudience,
    profileValue(brand, 'targetAudience', 'audience')
  ) || 'infer the intended user from the brief; do not invent demographic or market facts';
  const brandPersonality = inferBrandPersonality(prompt, context, brand);
  const pricePositioning = inferPricePositioning(prompt, context, brand);
  const primaryOutcome = inferPrimaryOutcome(prompt, archetypeId, context, brand);
  const briefText = clean(prompt);
  const workflowRequirements = [];
  const addWhen = (pattern, requirement) => {
    if (pattern.test(briefText)) workflowRequirements.push(requirement);
  };

  // These are workflow capabilities, not website-industry categories. Add them
  // only where the actual request signals that the workflow is needed.
  addWhen(/\b(?:book(?:ing)?|reserve|reservation|appointment|availability|schedule|calendar|time slot)\b/i,
    'When scheduling is requested, represent real availability, validation, review, confirmation and failure states; never fake a confirmed booking.');
  addWhen(/\b(?:cart|checkout|purchase|buy|sell|payment|order|product variant)\b/i,
    'When commerce is requested, keep products, variants, totals, terms, cart edits and checkout boundaries explicit and testable.');
  addWhen(/\b(?:form|enquiry|inquiry|application|submit|contact|newsletter|subscribe)\b/i,
    'When information submission is requested, validate inputs, protect user consent, disclose where data goes and show honest submission status.');
  addWhen(/\b(?:sign ?in|log ?in|authentication|account|member|permission|role|invite)\b/i,
    'When identity or access is requested, model authentication, ownership, role permissions, session states and recovery without pretending a provider is connected.');
  addWhen(/\b(?:search|filter|sort|compare|browse|discover)\b/i,
    'When discovery is requested, provide relevant search/filter/sort controls, useful result states and clear ways to recover or refine a query.');
  addWhen(/\b(?:upload|file|document|media library|asset library|attachment)\b/i,
    'When files or media are requested, include truthful upload, progress, preview, validation, storage and error states; never claim remote persistence without a configured service.');
  addWhen(/\b(?:chat|message|notification|comment|collaborat|share|invite)\b/i,
    'When collaboration is requested, make message ownership, recipients, unread/read states, permissions and delivery status explicit.');
  addWhen(/\b(?:report|analytics|metric|chart|dashboard|activity log|audit log)\b/i,
    'When reporting is requested, state metric definitions, dates, units and empty/loading/error states; do not invent data.');
  
  const mustHave = [
    ...source.mustHave,
    'a project-specific route and screen plan that follows the exact pages, tasks, content and constraints in the brief',
    'the actual data concepts, relationships, ownership and state transitions required by the requested workflow',
    'a complete primary user journey with appropriate validation, empty, loading, success and failure states',
    ...workflowRequirements,
  ];
  const delighters = [
    ...source.delighters,
    'a useful shortcut, contextual action or progressive disclosure pattern based on the real task',
    'a polished state transition that gives clear feedback without slowing the user down',
  ];
  const customerJourney = journeyForOutcome(primaryOutcome.value);
  const architecture = {
    sections: [
      'An entry point that explains or exposes the project’s actual purpose and primary task; do not assume a marketing hero is needed',
      'The exact core views, routes or screens implied by the requested content and workflows',
      'A clear navigation and information hierarchy that reflects how the intended users move through this specific experience',
      'The relevant data, records, details or tools needed to complete the primary workflow',
      'Contextual validation, empty, loading, success, failure and recovery states wherever the interactions require them',
      'Account, help, trust, policy or settings surfaces only when they serve a stated requirement or necessary user need',
    ],
    interactionConcepts: [
      'a complete and testable primary workflow derived from the brief, with no dead-end controls',
      'clear feedback, undo/recovery and preserved context for meaningful user actions',
      ...workflowRequirements,
    ],
    motionChoreography: [
      source.motion + '; motion must support the task rather than define the page',
      'use state-aware transitions for navigation, feedback and progressive disclosure',
      'respect prefers-reduced-motion and keep every control usable without animation',
    ],
    visualAvoid: [
      'no industry-specific preset, mandatory page list or vertical-specific layout is applied',
      'do not force a generic hero, repeated card grid, pricing table, testimonial strip or sales funnel onto a product that does not need it',
      'do not invent business facts, data, people, prices, credentials, stock, customer logos or integrations',
    ],
  };

  return {
    archetype: archetypeId,
    mission: 'Create the most useful, coherent and distinctive digital experience for the exact purpose described by the user. Derive the structure from its audience, content, data, workflows and constraints rather than classifying it into an industry.',
    audience,
    experiencePrinciples: [
      'treat the supplied brief as the source of truth; do not classify the project into a fixed website-industry list',
      'design the whole journey and all necessary states, not only an opening screen',
      'make the primary action and navigation obvious without adding unnecessary interface elements',
      'derive information architecture and visual direction from the actual content, audience and task',
      'make desktop, tablet and mobile feel intentionally designed',
      'use motion only to communicate hierarchy, state or feedback',
      'prefer progressive disclosure over visual clutter',
      'never invent business facts, prices, reviews, credentials, schedules, people or statistics',
    ],
    conversionPrinciples: [
      'derive the primary outcome from the requested user or business goal; do not assume every experience is a sales funnel',
      'make the next useful action clear and accurately labelled',
      'remove unnecessary steps, fields, ambiguity and mobile interaction friction while preserving user choice',
      'surface only the information needed to make the next decision',
      'keep any explicitly requested commerce, booking, account or submission states transparent and accurate',
      'make forms accessible, minimal, recoverable and honest about what submission does',
      'use ethical persuasion only; no fake scarcity, hidden fees, deceptive consent, confirm-shaming or false urgency',
      'do not promise a conversion lift; use real, privacy-respecting measurement only when supported',
    ],
    conversionAudit: [
      'Can the intended user understand the purpose of this experience and the next useful action?',
      'Does the information architecture reflect the exact needs and terminology in the source brief?',
      'Are primary actions obvious, accurately labelled, functional and reachable by keyboard and on mobile?',
      'Are important data, decisions and claims grounded in supplied facts or labelled assumptions?',
      'Do interactive workflows distinguish local/demo behavior from real connected services?',
      'Are validation, empty, loading, success, failure and recovery states honest and understandable?',
      'Does the design avoid dark patterns, fabricated social proof and irrelevant marketing sections?',
    ],
    mustHave,
    delighters,
    motion: source.motion,
    marketContext: buildMarketContext(prompt, context),
    visualAssetPlan: buildVisualAssetPlan(prompt, context),
    signatureMoments: [
      'one memorable interaction or reveal that belongs to the project’s actual purpose, not automatically a hero animation',
      'one high-confidence moment in the primary workflow, supported by accurate state and feedback',
      'one context-aware detail that makes the main task faster or clearer',
      'one mobile-specific convenience improvement based on the expected use of the interface',
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
      'mobile, tablet and desktop layouts are reviewed for overflow, clipping and obstructed primary actions',
    ],
    contentRules: [
      'use supplied facts verbatim when they are provided',
      'when a fact is missing, build a finished structure without inventing the fact',
      'write specific copy using the terminology, purpose and audience actually described by the user',
      'do not add industry clichés, unrequested sections or unsupported claims',
    ],
    brandDirection: brand
      ? 'Use the supplied brand profile as the visual authority.'
      : 'Derive a distinctive visual direction from the project’s purpose, audience, content and explicit preferences; treat inferred brand traits as hypotheses, not facts.',
    designIntelligence: {
      industryOrUseCase: 'Not classified into an industry; derive the project intent directly from the user’s brief.',
      projectIntent: {
        value: briefText.slice(0, 800),
        basis: 'original user brief; no industry classification applied',
      },
      targetAudience: audience,
      brandPersonality,
      pricePositioning,
      primaryOutcome,
      decisionQuestions: decisionQuestionsForOutcome(primaryOutcome.value),
      customerJourney,
      adaptiveWorkflowRequirements: workflowRequirements,
      visualDirectionRule: brand
        ? 'Respect the supplied brand profile, existing brand assets and stated constraints; refine them rather than overwriting them.'
        : 'Derive the visual system from the actual project purpose, audience, intended emotion and explicit positioning. Do not use industry-based presets.',
      pricingTruthRule: 'Use explicit prices and supplied price positioning exactly. If pricing is unspecified, do not invent prices, discounts, package tiers or scarcity.',
    },
    blueprintRole: 'universal-adaptive; no industry classification, allowlist or required template',
    customizationMode: 'universal-adaptive',
    customizationContract: [
      'The original user request is the source of truth; no fixed industry category selects the experience.',
      'Every website, application, portal, dashboard, store, community, tool or unfamiliar concept is interpreted individually from its own brief.',
      'Derive audience, information architecture, routes, data concepts, key workflows, visual direction and interaction states from the supplied description and project context.',
      'Do not force marketing sections such as pricing, testimonials, FAQs or conversion banners onto a task-focused product unless they directly serve its stated goal.',
      'Preserve explicit requirements, pages, exclusions, brand constraints and user terminology; ask for missing critical facts rather than inventing them.',
    ],
    architecture,
    antiTemplateRules: GLOBAL_ANTI_TEMPLATE_RULES,
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
