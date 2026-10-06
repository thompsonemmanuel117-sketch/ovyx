/**
 * OVYX Experience Intelligence
 *
 * Deterministic product-design intelligence used before the model writes code.
 * It gives Web Studio strong defaults for common website intents while preserving
 * the user's facts and never inventing business claims.
 */

const EXPERIENCE_ARCHITECTURES = {
  healthcare: {
    sections: [
      'orientation hero',
      'care-pathway or specialty explorer',
      'high-priority appointment/contact action',
      'trust and care-team story',
      'services or specialties',
      'patient resources',
      'locations/contact',
      'questions and next steps'
    ],
    interactionConcepts: [
      'specialty exploration that reveals the right pathway without a maze of menus',
      'provider or care-team cards that open useful details without losing context',
      'sticky mobile appointment/contact controls'
    ],
    motionChoreography: [
      'gentle content reveals',
      'high-confidence state changes on appointment actions',
      'reduced motion around urgent information'
    ],
    visualAvoid: [
      'cold generic medical stock aesthetic',
      'excessive glassmorphism',
      'decorative motion that competes with care actions'
    ]
  },
  church: {
    sections: [
      'immersive welcome hero',
      'next gathering spotlight',
      'what to expect / first-visit pathway',
      'sermon or media experience',
      'ministries and community discovery',
      'events and next steps',
      'pastor or leadership story when supplied',
      'prayer/giving/contact pathways when relevant'
    ],
    interactionConcepts: [
      'a warm next-gathering action that feels immediate',
      'sermon/media browsing that preserves editorial rhythm',
      'ministry discovery that helps different visitor types find their place'
    ],
    motionChoreography: [
      'cinematic but fast first impression',
      'soft section continuity',
      'ambient motion that never overwhelms content'
    ],
    visualAvoid: [
      'generic church-template hero photography layouts',
      'overused glowing crosses or decorative religious effects',
      'dense event grids without hierarchy'
    ]
  },
  restaurant: {
    sections: [
      'sensory hero',
      'signature dishes / menu discovery',
      'chef or story',
      'atmosphere / experience',
      'reservation or order path',
      'hours/location',
      'social proof when supplied',
      'visit CTA'
    ],
    interactionConcepts: [
      'menu reveals that feel physical rather than like a document dump',
      'dish storytelling with concise ingredients/context',
      'one-thumb reservation flow on mobile'
    ],
    motionChoreography: [
      'editorial image reveals',
      'tasteful parallax only where performant',
      'micro-interactions around menu and reservation actions'
    ],
    visualAvoid: [
      'generic three-card restaurant sections',
      'slow hero video that blocks first interaction',
      'tiny menu typography'
    ]
  },
  saas: {
    sections: [
      'positioning hero',
      'interactive product story',
      'workflow / how-it-works',
      'feature hierarchy',
      'evidence / proof when supplied',
      'pricing or activation path',
      'objection-handling FAQ',
      'conversion CTA'
    ],
    interactionConcepts: [
      'progressive product walkthrough',
      'feature comparison that reduces decision friction',
      'stateful demo-like interactions that explain behavior rather than decorate'
    ],
    motionChoreography: [
      'motion tied to product state',
      'crisp transitions between workflow stages',
      'restrained hover behavior'
    ],
    visualAvoid: [
      'hero-first template with no product explanation',
      'endless logo walls without evidence',
      'card grids with identical emphasis'
    ]
  },
  agency: {
    sections: [
      'distinctive positioning hero',
      'selected work / case-study index',
      'signature project story',
      'capabilities',
      'process',
      'proof when supplied',
      'about/team',
      'contact'
    ],
    interactionConcepts: [
      'project-first browsing',
      'case studies that transition as a continuous narrative',
      'editorial hover/tap previews that remain accessible'
    ],
    motionChoreography: [
      'art-directed transitions',
      'image continuity between sections',
      'controlled scroll choreography'
    ],
    visualAvoid: [
      'generic agency gradients',
      'case-study cards that all look identical',
      'motion for motion’s sake'
    ]
  },
  education: {
    sections: [
      'outcomes-led hero',
      'program/course explorer',
      'why this institution',
      'student/faculty story',
      'admission or enrollment path',
      'community/campus',
      'events/news when relevant',
      'contact/next step'
    ],
    interactionConcepts: [
      'program filtering or discovery without overwhelming first-time visitors',
      'student journey storytelling',
      'clear mobile application/enrollment actions'
    ],
    motionChoreography: [
      'optimistic page progression',
      'content reveals that support scanning',
      'low-friction state transitions'
    ],
    visualAvoid: [
      'dense catalog-style homepages',
      'tiny text-heavy cards',
      'decorative motion that hides information'
    ]
  },
  nonprofit: {
    sections: [
      'cause-centered hero',
      'mission and why now',
      'impact story',
      'programs/initiatives',
      'evidence when supplied',
      'supporter pathways',
      'volunteer/community path',
      'donate/contact'
    ],
    interactionConcepts: [
      'story-first impact browsing',
      'clear supporter choices',
      'mobile-first donation journey'
    ],
    motionChoreography: [
      'human-paced storytelling',
      'gentle emphasis on impact actions',
      'avoid sensational motion around sensitive content'
    ],
    visualAvoid: [
      'manipulative urgency without evidence',
      'invented counters or impact statistics',
      'crowded donation-first layouts'
    ]
  },
  portfolio: {
    sections: [
      'identity hero',
      'selected work',
      'project/case-study path',
      'process or craft story',
      'about',
      'contact'
    ],
    interactionConcepts: [
      'project-first navigation',
      'image transitions that preserve context',
      'touch-friendly previews'
    ],
    motionChoreography: [
      'expressive transitions',
      'strong image continuity',
      'minimal but authored movement'
    ],
    visualAvoid: [
      'template portfolios with identical project cards',
      'heavy motion that harms work visibility',
      'overloaded menus'
    ]
  }
};

const GLOBAL_ANTI_TEMPLATE_RULES = [
  'Do not default to a centered headline + two buttons + three cards composition.',
  'Do not make every section a repeated rounded-card grid.',
  'Do not use gradients or glow merely to signal “AI”.',
  'Do not repeat the same spacing, card geometry or heading scale in every section.',
  'Do not create decorative motion without a user-facing purpose.',
  'Do not hide the primary action behind clever navigation.',
  'Do not manufacture social proof, statistics, badges, awards or credentials.'
];

const ARCHETYPES = [
  {
    id: 'healthcare',
    triggers: ['hospital', 'clinic', 'healthcare', 'medical', 'doctor', 'dentist', 'pharmacy', 'health'],
    mission: 'Make care easier to understand, trust, access and act on.',
    mustHave: [
      'clear care navigation',
      'services or specialties',
      'doctor or care-team discovery when relevant',
      'appointment/contact pathway',
      'urgent or emergency pathway only when the prompt provides one',
      'locations and contact information when supplied',
      'insurance/payment information only when supplied',
      'patient resources and accessibility cues'
    ],
    delighters: [
      'specialty explorer',
      'care-pathway storytelling',
      'doctor profile interactions',
      'sticky appointment action',
      'calm motion with strong hierarchy',
      'mobile-first quick-contact behavior'
    ],
    motion: 'calm, reassuring, precise micro-interactions; no distracting motion around urgent actions'
  },
  {
    id: 'church',
    triggers: ['church', 'ministry', 'chapel', 'congregation', 'worship', 'sermon', 'pastor'],
    mission: 'Make a first visit feel welcoming and make participation effortless.',
    mustHave: [
      'welcoming introduction',
      'service or gathering information when supplied',
      'ministries or community pathways',
      'sermons or media pathway when supplied',
      'events or next-step pathway',
      'visit/contact/location information when supplied',
      'giving/prayer pathways only when relevant to the prompt'
    ],
    delighters: [
      'immersive welcome sequence',
      'next-gathering spotlight',
      'sermon/media storytelling',
      'ministry discovery cards',
      'prayer or connection call-to-action',
      'warm editorial motion and subtle ambient transitions'
    ],
    motion: 'warm, cinematic, human; use motion to guide attention rather than decorate'
  },
  {
    id: 'restaurant',
    triggers: ['restaurant', 'cafe', 'coffee', 'bar', 'bakery', 'food', 'dining', 'chef'],
    mission: 'Turn appetite and curiosity into a visit, reservation or order.',
    mustHave: [
      'menu discovery',
      'signature offerings',
      'hours and location when supplied',
      'reservation/order pathway when relevant',
      'atmosphere storytelling',
      'contact and social discovery when relevant'
    ],
    delighters: [
      'menu reveal interactions',
      'dish storytelling',
      'reservation-first mobile behavior',
      'subtle image reveal choreography',
      'location/hours quick panel'
    ],
    motion: 'sensory, editorial and restrained; prioritize fast image loading and touch-friendly controls'
  },
  {
    id: 'saas',
    triggers: ['saas', 'software', 'platform', 'dashboard', 'product', 'startup', 'ai tool', 'app', 'b2b'],
    mission: 'Make value obvious quickly, then move serious users toward activation.',
    mustHave: [
      'clear positioning',
      'feature hierarchy',
      'proof or evidence when supplied',
      'workflow explanation',
      'pricing/plan pathway when relevant',
      'strong activation CTA',
      'FAQ and objection handling'
    ],
    delighters: [
      'interactive product story',
      'feature comparison',
      'workflow animation',
      'progressive disclosure',
      'trust-building proof modules',
      'conversion-focused responsive navigation'
    ],
    motion: 'confident, crisp and purposeful; motion should explain product behavior'
  },
  {
    id: 'agency',
    triggers: ['agency', 'studio', 'consulting', 'creative agency', 'design studio', 'marketing agency'],
    mission: 'Demonstrate taste, capability, credibility and a clear path to contact.',
    mustHave: [
      'distinct positioning',
      'work/case-study narrative',
      'services',
      'approach/process',
      'proof or testimonials when supplied',
      'contact conversion path'
    ],
    delighters: [
      'signature case-study transitions',
      'editorial project index',
      'before/after storytelling',
      'scroll choreography',
      'high-craft typography and image composition'
    ],
    motion: 'art-directed and confident; use transitions to create continuity between ideas'
  },
  {
    id: 'education',
    triggers: ['school', 'college', 'university', 'academy', 'education', 'course', 'training'],
    mission: 'Help visitors understand outcomes, trust the institution and find the right next step.',
    mustHave: [
      'program/course discovery',
      'outcomes or value proposition',
      'admission/enrollment pathway when relevant',
      'faculty/community information when supplied',
      'events/news when relevant',
      'contact/location information when supplied'
    ],
    delighters: [
      'program explorer',
      'student journey storytelling',
      'faculty spotlight',
      'application progress cues',
      'mobile-first information architecture'
    ],
    motion: 'clear, optimistic and informative; prioritize readable density'
  },
  {
    id: 'nonprofit',
    triggers: ['nonprofit', 'charity', 'ngo', 'foundation', 'cause', 'donate', 'community organization'],
    mission: 'Connect the visitor to the cause, proof of impact and a concrete action.',
    mustHave: [
      'mission',
      'impact storytelling',
      'programs or initiatives',
      'evidence when supplied',
      'donate/volunteer/contact pathway when relevant'
    ],
    delighters: [
      'impact counter only with supplied data',
      'story-driven program sections',
      'supporter pathways',
      'strong mobile donation flow'
    ],
    motion: 'human and story-led; avoid exploitative or sensational presentation'
  },
  {
    id: 'portfolio',
    triggers: ['portfolio', 'photographer', 'architect', 'designer', 'artist', 'developer portfolio'],
    mission: 'Make the work unmistakable and the person or studio memorable.',
    mustHave: [
      'hero identity',
      'selected work',
      'case-study or project detail pathway',
      'about/process',
      'contact'
    ],
    delighters: [
      'project-first navigation',
      'full-bleed editorial layouts',
      'smooth image transitions',
      'hover previews that also work by touch'
    ],
    motion: 'minimal but expressive; motion supports authorship and visual rhythm'
  }
];

function clean(value) {
  return String(value || '').trim();
}

export function isWebStudioPrompt(prompt, mode = '') {
  const m = clean(mode).toLowerCase();
  if (/^web-studio-(build|fix|plan|ask)$/.test(m)) return true;
  const q = clean(prompt).toLowerCase();
  return /(website|web site|landing page|marketing site|homepage|portfolio site|church site|hospital site|clinic site|restaurant site|web app|dashboard|saas app|storefront)/.test(q);
}

export function detectArchetype(prompt) {
  const q = clean(prompt).toLowerCase();
  let best = { id: 'generic', hits: 0 };
  for (const archetype of ARCHETYPES) {
    const hits = archetype.triggers.reduce((count, trigger) => (
      q.includes(trigger) ? count + 1 : count
    ), 0);
    if (hits > best.hits) best = { id: archetype.id, hits };
  }
  return best.id;
}

function genericBlueprint() {
  return {
    id: 'generic',
    mission: 'Create a memorable, useful and conversion-aware experience around the user’s actual goal.',
    mustHave: [
      'clear positioning',
      'scannable information architecture',
      'primary user journey',
      'proof or trust content when supplied',
      'responsive navigation',
      'strong conversion or contact pathway',
      'FAQ/objection handling when useful'
    ],
    delighters: [
      'signature visual moment',
      'scroll-linked storytelling',
      'purposeful micro-interactions',
      'adaptive CTA hierarchy',
      'premium responsive behavior'
    ],
    motion: 'subtle, coherent and performance-aware'
  };
}

export function buildExperienceBrief(prompt, context = {}) {
  const archetypeId = detectArchetype(prompt);
  const source = ARCHETYPES.find(item => item.id === archetypeId) || genericBlueprint();
  const audience = clean(context?.audience) || 'infer the primary visitor from the prompt without inventing unsupported facts';
  const brand = context?.brandProfile || null;

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
    mustHave: source.mustHave,
    delighters: source.delighters,
    motion: source.motion,
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
      'no dead controls, broken anchors or placeholder copy'
    ],
    contentRules: [
      'use supplied facts verbatim when they are provided',
      'when a fact is missing, build a finished structure without inventing the fact',
      'write specific copy appropriate to the requested organization/product rather than generic filler'
    ],
    brandDirection: brand
      ? 'Use the supplied brand profile as the visual authority.'
      : 'Infer a restrained, coherent visual direction from the request and avoid generic AI-template styling.',
    architecture: EXPERIENCE_ARCHITECTURES[archetypeId] || {
      sections: [
        'orientation hero',
        'core value proposition',
        'primary user journey',
        'supporting proof or information',
        'conversion/contact path',
        'FAQ or next steps'
      ],
      interactionConcepts: [
        'one interaction that improves understanding',
        'one interaction that improves conversion'
      ],
      motionChoreography: [
        'purposeful entry transitions',
        'state-driven micro-interactions'
      ],
      visualAvoid: []
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
