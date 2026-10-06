/**
 * OVYX Experience Intelligence
 *
 * Deterministic product-design intelligence used before the model writes code.
 * It gives Web Studio strong defaults for common website intents while preserving
 * the user's facts and never inventing business claims.
 */

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
      : 'Infer a restrained, coherent visual direction from the request and avoid generic AI-template styling.'
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
