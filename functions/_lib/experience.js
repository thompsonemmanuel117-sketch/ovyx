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
      'appointment date/time selection with honest slot state when scheduling is requested',
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
  fashion: {
    sections: [
      'editorial campaign hero',
      'collection-led discovery',
      'lookbook or seasonal story',
      'product detail and fit/material information only when supplied',
      'brand craft and origin story when supplied',
      'shop or enquiry call-to-action',
      'shipping, returns and support details when supplied'
    ],
    interactionConcepts: [
      'image-forward collection browsing with purposeful crop and rhythm',
      'variant/favorite controls with clear selected state when relevant',
      'a continuous editorial path from campaign story into shoppable pieces'
    ],
    motionChoreography: [
      'restrained editorial image transitions',
      'quick tactile state feedback on collection controls',
      'reduced motion without hiding product information'
    ],
    visualAvoid: [
      'a generic wall of identical product cards',
      'invented sustainability, material or ethical claims',
      'fake sale badges, countdowns or scarcity messages'
    ]
  },
  ecommerce: {
    sections: [
      'shop-by-intent or collection orientation',
      'high-signal category navigation',
      'product discovery with supplied details only',
      'functional filtering/sorting and a useful empty state',
      'product details with variant and quantity controls where relevant',
      'cart/checkout path with truthful integration state',
      'shipping, returns and support details when supplied'
    ],
    interactionConcepts: [
      'add-to-cart feedback that updates visible cart state',
      'filtering and sorting that actually change the result set',
      'empty, populated, unavailable and error states for cart/product flows',
      'a one-thumb mobile shopping journey'
    ],
    motionChoreography: [
      'fast state transitions around cart actions',
      'subtle product-image transitions',
      'no decorative delays before a shopping action can be used'
    ],
    visualAvoid: [
      'fake checkout completion or fake payment confirmations',
      'invented discounts, inventory counts, reviews or delivery promises',
      'filters that change appearance but not results'
    ]
  },
  realEstate: {
    sections: [
      'location- or intent-led introduction',
      'property search/discovery controls',
      'featured listings with supplied facts only',
      'property detail paths with photos and attributes when provided',
      'agent/developer credibility and process',
      'viewing enquiry or appointment pathway',
      'location/contact details when supplied',
      'financing/legal information only when supplied'
    ],
    interactionConcepts: [
      'filters for the actual property attributes present in the data',
      'listing cards with clear price/location/availability hierarchy when supplied',
      'a listing detail path that preserves search context',
      'mobile-friendly viewing/contact actions'
    ],
    motionChoreography: [
      'calm image-led transitions',
      'immediate feedback on search/filter state',
      'no motion that interferes with comparing listings'
    ],
    visualAvoid: [
      'invented property prices, addresses, availability or investment returns',
      'fake map pins or listing counts presented as live data',
      'repetitive property cards without meaningful hierarchy'
    ]
  },
  booking: {
    sections: [
      'service/event selection and clear eligibility information',
      'availability selection with disabled/unavailable states',
      'time and date review with timezone clarity when relevant',
      'short guest/contact details step',
      'review/confirm step',
      'truthful confirmation or pending state',
      'rescheduling/support path when supplied'
    ],
    interactionConcepts: [
      'a keyboard-accessible date/time picker or clear native fallback',
      'a visible step indicator and back navigation that preserves entries',
      'validation beside the field that needs attention',
      'confirmation UI that does not claim server success prematurely'
    ],
    motionChoreography: [
      'subtle step transitions that preserve orientation',
      'instant feedback when a time slot is selected',
      'respectful reduced motion and no countdown pressure'
    ],
    visualAvoid: [
      'fake availability or fabricated calendar slots presented as live',
      'success messages before a booking request actually succeeds',
      'long forms before users understand the service or available times'
    ]
  },
  dashboard: {
    sections: [
      'workspace orientation and task-focused navigation',
      'summary metrics with clear date/context labels',
      'searchable/filterable data table or record list',
      'record detail and next-step actions',
      'helpful empty/loading/error states',
      'accessible visualizations with a text/table alternative',
      'account/settings and permissions surfaces only when relevant'
    ],
    interactionConcepts: [
      'filters, sorting and pagination that change the displayed data',
      'keyboard-friendly command and table navigation',
      'detail drawers or inline editing that preserve list context',
      'clear loading, empty, success and error feedback for asynchronous work'
    ],
    motionChoreography: [
      'low-motion feedback tied to state changes',
      'fast transitions that protect information density',
      'reduced-motion support for live or frequently updating displays'
    ],
    visualAvoid: [
      'invented live metrics represented as customer data',
      'chart-only communication without a readable alternative',
      'decorative metric cards that hide priority tasks',
      'tiny text and low-contrast dense tables'
    ]
  },
  fintech: {
    sections: [
      'clear financial product positioning and the intended customer outcome',
      'how the account, product or service works',
      'fees, rates, eligibility and limitations only when supplied or computed from explicit inputs',
      'privacy, security and risk information based on verified facts',
      'transparent onboarding and account-access pathways',
      'comparison or calculator tools with visible assumptions where useful',
      'support, FAQs and clear next steps'
    ],
    interactionConcepts: [
      'financial calculators that expose assumptions and update from user inputs',
      'comparison controls that make trade-offs and fees understandable',
      'account or transaction demonstrations clearly marked as sample data',
      'accessible charts accompanied by meaningful text or tables',
      'forms that validate sensitive inputs without pretending to open real accounts'
    ],
    motionChoreography: [
      'quiet, precise transitions that support trust',
      'immediate feedback for calculations and form state',
      'reduced motion and strong focus visibility around financial actions'
    ],
    visualAvoid: [
      'invented yields, interest rates, returns, balances or transaction histories',
      'fake bank security seals, regulatory approvals or deposit-protection claims',
      'dark patterns, urgency pressure or misleading financial advice',
      'a real login or money transfer claim when no authenticated service is connected'
    ]
  },
  hospitality: {
    sections: [
      'distinctive destination and hospitality-led introduction',
      'room, suite or stay discovery',
      'amenities and experience storytelling using supplied details',
      'date, guest and availability selection when booking is requested',
      'room detail and inclusions/exclusions',
      'location, access and transport information when supplied',
      'booking review, support and truthful confirmation state'
    ],
    interactionConcepts: [
      'a date-and-guest selector with clear unavailable states',
      'room or suite cards that open detailed amenities and image galleries',
      'a booking review step that preserves dates and guest choices',
      'mobile-first reservation controls with visible validation',
      'sample rates and availability labelled as demonstration data unless connected'
    ],
    motionChoreography: [
      'cinematic but restrained image transitions',
      'tactile gallery and room-selection feedback',
      'fast access to dates, rates and essential booking details'
    ],
    visualAvoid: [
      'invented room rates, occupancy, amenities, ratings or availability',
      'fake guest reviews or claims of awards and certifications',
      'full-screen motion that delays the reservation journey',
      'confirmation language before the booking provider confirms success'
    ]
  },
  travel: {
    sections: [
      'destination or travel-purpose discovery',
      'curated destination and itinerary pathways',
      'tour, activity or package details with clear inclusions and exclusions',
      'dates, travellers and preferences when relevant',
      'practical travel information only when supplied or sourced',
      'booking or enquiry review step',
      'support, cancellation and next-step information when supplied'
    ],
    interactionConcepts: [
      'destination filters that act on the displayed destinations',
      'itinerary steps with duration and logistics only when grounded',
      'traveller/date selections that persist while browsing',
      'a comparison view for trips or packages where useful',
      'booking states that clearly separate sample results from live availability'
    ],
    motionChoreography: [
      'editorial transitions that communicate place and mood',
      'lightweight map or itinerary reveals when data is available',
      'reduced-motion support and immediate travel-control feedback'
    ],
    visualAvoid: [
      'fabricated destinations, schedules, prices, visa guidance or travel restrictions',
      'fake availability, ratings, map data or booking confirmations',
      'hidden fees or unclear package inclusions',
      'heavy media that blocks essential details on mobile'
    ]
  },
  legal: {
    sections: [
      'clear practice focus and client audience',
      'practice areas and services',
      'team biographies and qualifications only when supplied',
      'process and what a first consultation involves',
      'client resources or frequently asked questions',
      'consultation or enquiry pathway with appropriate privacy messaging',
      'office and contact details only when supplied'
    ],
    interactionConcepts: [
      'practice-area discovery that leads to relevant service information',
      'a concise enquiry form with accessible validation',
      'attorney profiles that use verified supplied biographies',
      'clear consultation steps and realistic response expectations when supplied'
    ],
    motionChoreography: [
      'restrained transitions that signal clarity and confidence',
      'subtle focus and disclosure states',
      'no animation that obscures legal information or form errors'
    ],
    visualAvoid: [
      'invented lawyer credentials, case wins, client logos or success rates',
      'guarantees of legal outcomes or unsupported legal advice',
      'fake confidentiality, accreditation or regulatory claims',
      'intimidating walls of text without accessible headings and summaries'
    ]
  },
  marketplace: {
    sections: [
      'explain what is exchanged and who the platform serves',
      'search and category discovery for real listing attributes',
      'filterable listing results and useful no-result states',
      'listing detail pages with seller/provider information when supplied',
      'buyer and seller/provider pathways when relevant',
      'enquiry, booking or purchase steps with honest integration state',
      'trust, dispute, support and platform-policy information when supplied'
    ],
    interactionConcepts: [
      'search, filters and sorting that actually change the visible results',
      'listing details that preserve search and filter context',
      'clear buyer/seller or customer/provider role selection where needed',
      'saved-item or comparison interactions with visible state',
      'transaction steps that never simulate payment, escrow or fulfilment as real'
    ],
    motionChoreography: [
      'fast transitions between results and item details',
      'immediate feedback when filters or roles change',
      'subtle listing imagery and clear navigation continuity'
    ],
    visualAvoid: [
      'invented sellers, reviews, transaction counts or verification badges',
      'fake escrow, payments, messaging or identity checks',
      'filters that only change their own styling',
      'one generic repeated card layout for every platform role'
    ]
  },
  automotive: {
    sections: [
      'vehicle or automotive-service discovery',
      'search and filters for attributes present in the listing data',
      'vehicle details with supplied specifications and image galleries',
      'inspection, test-drive or enquiry pathway when relevant',
      'dealer, service centre or seller information when supplied',
      'financing, warranties and service claims only when supplied',
      'contact and next steps'
    ],
    interactionConcepts: [
      'filters for price, body type, make or model only where those data exist',
      'vehicle comparison and detail navigation that preserves context',
      'test-drive or service-request forms with honest pending states',
      'clear distinction between sample inventory and connected live inventory'
    ],
    motionChoreography: [
      'confident image-led transitions and practical galleries',
      'immediate filter and comparison feedback',
      'mobile-friendly controls for browsing vehicle details'
    ],
    visualAvoid: [
      'invented vehicle specifications, prices, mileage, stock or warranty terms',
      'fake financing approvals, inventory status or confirmed test drives',
      'misleading comparison figures',
      'slow full-screen effects that make inventory difficult to browse'
    ]
  },
  events: {
    sections: [
      'event identity and audience',
      'upcoming events or schedule using supplied dates',
      'event detail with time, location and accessibility information when supplied',
      'speakers, performers, agenda or programme when relevant',
      'registration or ticket selection when requested',
      'review and truthful registration/checkout state',
      'attendee information, FAQs and support when supplied'
    ],
    interactionConcepts: [
      'event filters that change the results shown',
      'date and session selection with timezone clarity where relevant',
      'accessible ticket or registration options with quantity validation',
      'calendar export only when accurate event details are available',
      'clear distinction between a local demo registration and a confirmed booking'
    ],
    motionChoreography: [
      'energetic but purposeful transitions suited to the event brand',
      'immediate feedback for schedule and ticket selections',
      'reduced-motion support and no distracting countdown pressure'
    ],
    visualAvoid: [
      'invented event dates, speakers, venue addresses or ticket inventory',
      'fake registration success or ticket issuance',
      'unverified sponsorship or attendance claims',
      'motion that hides event details or purchase controls'
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
    triggers: ['restaurant', 'cafe', 'coffee', 'cocktail bar', 'wine bar', 'pub', 'bakery', 'food', 'dining', 'chef'],
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
    triggers: ['saas', 'software', 'startup', 'ai tool', 'b2b', 'saas platform', 'business software', 'developer tool'],
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
    id: 'fintech',
    triggers: ['fintech', 'digital banking', 'banking', 'bank', 'credit union', 'wealth management', 'investment platform', 'trading platform', 'personal finance', 'financial services', 'loan application', 'insurance portal'],
    mission: 'Make financial products understandable, transparent and safe to evaluate without inventing claims.',
    mustHave: [
      'clear product positioning and intended audience',
      'transparent rates, fees and eligibility only when supplied',
      'security/privacy information grounded in verified facts',
      'onboarding or account-access pathway when requested',
      'clear explanation of assumptions and limitations',
      'support and next steps'
    ],
    delighters: [
      'interactive calculators with explicit user-editable assumptions',
      'accessible account/product comparisons',
      'sample transactions clearly marked as demo data',
      'readable charts with text or table alternatives'
    ],
    motion: 'precise, reassuring and restrained; feedback is immediate around financial controls'
  },
  {
    id: 'fashion',
    triggers: ['fashion brand', 'fashion label', 'clothing brand', 'fashion', 'apparel', 'lookbook', 'boutique', 'streetwear', 'couture', 'designer collection'],
    mission: 'Make the brand world memorable and make collection discovery feel intentional.',
    mustHave: [
      'distinct brand point of view',
      'collection or lookbook discovery',
      'product/fit/material details only when supplied',
      'clear shop or enquiry path',
      'brand story and craft details when supplied',
      'shipping/returns/support details when supplied'
    ],
    delighters: [
      'editorial image rhythm',
      'collection transitions that lead into products',
      'mobile-first product variant selection',
      'strong typography and art direction without fake luxury signals'
    ],
    motion: 'editorial and tactile, but fast and accessible; product details remain usable with reduced motion'
  },
  {
    id: 'marketplace',
    triggers: ['marketplace platform', 'multi-vendor marketplace', 'multivendor marketplace', 'two-sided marketplace', 'seller marketplace', 'service marketplace', 'vendor directory', 'freelance marketplace', 'creator marketplace', 'marketplace'],
    mission: 'Help distinct sides of a platform find each other and complete clear, trustworthy journeys.',
    mustHave: [
      'clear explanation of platform roles and value',
      'searchable listings or service discovery',
      'filters and sorting that reflect actual data',
      'listing details and seller/provider information when supplied',
      'buyer/seller or customer/provider paths when relevant',
      'truthful enquiry, booking or transaction states'
    ],
    delighters: [
      'role-aware onboarding and listing discovery',
      'saved-item or compare interactions with visible state',
      'seller/provider profile paths',
      'useful empty, error and unavailable states'
    ],
    motion: 'efficient and state-driven; prioritise discovery, context preservation and trust'
  },
  {
    id: 'ecommerce',
    triggers: ['e-commerce', 'ecommerce', 'online store', 'online shop', 'shopping cart', 'product catalog', 'product catalogue', 'retail store', 'marketplace', 'shopify', 'add to cart', 'cart', 'storefront'],
    mission: 'Help shoppers find the right item, trust the details and complete a clear purchase journey.',
    mustHave: [
      'category and product discovery',
      'useful product details',
      'working filter/sort controls when offered',
      'cart state and empty/populated feedback',
      'checkout path with truthful payment status',
      'shipping/returns/support details only when supplied'
    ],
    delighters: [
      'responsive filters with clear active state',
      'useful empty and unavailable states',
      'cart feedback that preserves shopping context',
      'cross-sells only where relevant to the selected product'
    ],
    motion: 'fast, tactile and low-friction; never delay the main purchase path'
  },
  {
    id: 'realEstate',
    triggers: ['real estate', 'real-estate', 'realty', 'property listing', 'property listings', 'property development', 'property management', 'estate agent', 'estate agency', 'realtor', 'homes for sale', 'commercial real estate', 'apartments for rent'],
    mission: 'Help visitors compare properties, understand the next step and enquire with confidence.',
    mustHave: [
      'property search/discovery',
      'clear listing information sourced from the brief',
      'individual property detail path when listings are requested',
      'viewing/enquiry CTA',
      'agent/developer story when supplied',
      'contact/location information when supplied'
    ],
    delighters: [
      'filters matched to actual listing attributes',
      'listing comparison cues without invented claims',
      'fast image-led browsing',
      'mobile-friendly viewing requests'
    ],
    motion: 'calm, confident and comparison-friendly; state changes should be immediate'
  },
  {
    id: 'hospitality',
    triggers: ['hospitality', 'hotel', 'hotels', 'luxury hotel', 'boutique hotel', 'hotel booking', 'resort', 'lodging', 'guesthouse', 'inn', 'vacation rental', 'serviced apartment', 'bed and breakfast'],
    mission: 'Turn a sense of place and stay into a clear, trustworthy guest journey.',
    mustHave: [
      'room or stay discovery',
      'amenities and inclusions only when supplied',
      'date/guest selection and honest availability states when booking is requested',
      'room or property details',
      'location and travel information when supplied',
      'booking review and truthful confirmation state'
    ],
    delighters: [
      'editorial room galleries and carefully paced imagery',
      'date and guest controls designed for mobile',
      'room comparison and amenity exploration',
      'a booking flow that preserves selections'
    ],
    motion: 'premium, sensory and calm; booking controls remain fast and accessible'
  },
  {
    id: 'travel',
    triggers: ['travel', 'tourism', 'destination guide', 'travel agency', 'tour operator', 'tour package', 'tour packages', 'travel itinerary', 'travel guide', 'adventure travel', 'trip planner'],
    mission: 'Help people discover a suitable trip, understand its details and plan the next step.',
    mustHave: [
      'destination and itinerary discovery',
      'package or activity details with clear inclusions',
      'date/traveller choices when relevant',
      'practical travel details only when supplied',
      'a booking or enquiry path with honest availability state'
    ],
    delighters: [
      'destination filtering and itinerary storytelling',
      'trip comparisons that preserve context',
      'mobile-friendly traveller/date selection',
      'map or route experiences only when grounded data are available'
    ],
    motion: 'editorial and lightweight; use motion to convey place without delaying trip details'
  },
  {
    id: 'booking',
    triggers: ['booking platform', 'booking system', 'appointment system', 'appointment scheduling', 'service scheduling', 'reservation system', 'availability calendar', 'event booking', 'hotel booking', 'salon scheduling', 'class booking', 'booking app', 'scheduling platform'],
    mission: 'Help users choose a valid slot, complete required details and understand whether the booking actually succeeded.',
    mustHave: [
      'service/event selection',
      'availability selection with honest slot state',
      'short details and validation step',
      'review before confirmation',
      'truthful success/pending/error states',
      'rescheduling/support path when supplied'
    ],
    delighters: [
      'clear multi-step progress',
      'keyboard-accessible date/time selection',
      'preserved entries when going back',
      'inline field feedback'
    ],
    motion: 'purposeful and reassuring, with no fake countdowns or premature success states'
  },
  {
    id: 'dashboard',
    triggers: ['dashboard', 'analytics dashboard', 'data dashboard', 'admin panel', 'operations console', 'reporting dashboard', 'metrics dashboard', 'analytics portal', 'data visualization'],
    mission: 'Turn dense information into clear decisions and safe, efficient next actions.',
    mustHave: [
      'clear workspace hierarchy',
      'contextual metrics with dates/units',
      'search/filter/sort for dense data where relevant',
      'table or record navigation',
      'loading/empty/error states',
      'keyboard and screen-reader support'
    ],
    delighters: [
      'data visualizations with accessible alternatives',
      'preserved context when opening record details',
      'fast command and table navigation',
      'responsive density that remains readable on mobile'
    ],
    motion: 'functional and restrained; use motion only to signal state or changes in data'
  },
  {
    id: 'legal',
    triggers: ['law firm', 'law office', 'legal practice', 'legal services', 'legal website', 'lawyer', 'attorney', 'solicitor', 'barrister'],
    mission: 'Build confidence through clear practice information, verified credentials and an accessible enquiry path.',
    mustHave: [
      'practice areas and service information',
      'team qualifications only when supplied',
      'consultation or enquiry pathway',
      'process and client expectations without unsupported promises',
      'contact details only when supplied',
      'appropriate privacy and informational disclaimers where relevant'
    ],
    delighters: [
      'practice-area discovery',
      'attorney profiles based on supplied biographies',
      'clear consultation steps',
      'accessible enquiry forms with useful validation'
    ],
    motion: 'confident, restrained and legible; motion never obscures important information'
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
    id: 'automotive',
    triggers: ['automotive', 'car dealership', 'auto dealer', 'vehicle listings', 'car listings', 'cars for sale', 'used cars', 'vehicle showroom', 'auto service', 'car service centre'],
    mission: 'Make vehicle or automotive-service discovery clear, detailed and action-oriented.',
    mustHave: [
      'vehicle or service discovery',
      'filters matched to actual listing attributes',
      'vehicle details using supplied facts only',
      'inspection, test-drive or service enquiry when relevant',
      'dealer or service contact details when supplied',
      'financing and warranty claims only when supplied'
    ],
    delighters: [
      'vehicle comparison and detail journeys',
      'responsive image galleries',
      'mobile-first test-drive/enquiry requests',
      'clear demo-versus-live inventory state'
    ],
    motion: 'confident and practical; quick, useful feedback beats decorative animation'
  },
  {
    id: 'events',
    triggers: ['event website', 'event platform', 'conference', 'festival', 'concert', 'event registration', 'ticketing', 'ticket sales', 'event calendar', 'summit', 'exhibition'],
    mission: 'Help audiences discover events, understand the programme and register with confidence.',
    mustHave: [
      'event schedule with supplied dates and details',
      'event detail and programme where relevant',
      'accessible registration or ticket path when requested',
      'date/time and location clarity where supplied',
      'truthful pending, success and error states',
      'attendee support information when supplied'
    ],
    delighters: [
      'filterable event discovery',
      'accessible schedule/session selection',
      'calendar actions based on verified dates',
      'mobile ticket/registration flow'
    ],
    motion: 'energetic but accessible; no fabricated urgency or ticket availability'
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

export function isWebStudioPrompt(prompt, mode = '', context = {}) {
  const m = clean(mode).toLowerCase();
  if (/^web-studio-(build|fix|plan|ask)$/.test(m)) return true;
  const activeView = clean(context && context.activeView).replace(/^view-/i, '').toLowerCase();
  if (activeView === 'webstudio') return true;
  const q = clean(prompt).toLowerCase();
  if (/(website|web site|landing page|marketing site|homepage|portfolio site|church site|hospital site|clinic site|restaurant site|web app|dashboard|saas app|storefront)/.test(q)) return true;

  // Treat clear edit requests against an existing page or interface element as
  // Web Studio work even when the user does not repeat the word "website".
  // This catches concise requests like "fix my mobile menu" and "improve the
  // contrast of this layout" without rerouting unrelated writing or Q&A tasks.
  const changeAction = /\b(?:add|change|edit|update|fix|repair|improve|enhance|redesign|remove|delete|replace|refine|polish|optimi[sz]e|adjust|modify|implement|restyle|make|move|rearrange|resize|shrink|enlarge|increase|decrease|align|reposition)\b/i.test(q);
  const existingWebArtifact = /\b(?:my|this|the|current|existing|selected|active|a|an|that|those|these)\s+(?:(?:[\w-]+\s+){0,2})(?:website|web site|site|web page|page|homepage|landing page|web app|app|project|layout|design|header|footer|hero|headline|heading|title|text|copy|navigation|nav|menu|button|form|section|component|card|grid|modal|dialog|tab|dropdown|sidebar|style|styling|stylesheet|css|html|script|link|image|font|typeface|typography|font size|colour|color|colours|colors|background|contrast|spacing|margin|padding|border|shadow|gradient|icon|logo|animation|transition|responsiveness|responsive|mobile|desktop|tablet|accessibility|seo|content|interaction|feature|control)\b/i.test(q);
  if (changeAction && existingWebArtifact) return true;

  const explicitBuildAction = /\b(?:build|create|design|make|generate|develop|launch|craft|produce|turn|transform)\b/i.test(q);
  const naturalLanguageBuildRequest = /\b(?:i|we)\s+(?:want|need|would like|would love)\s+(?:to\s+(?:build|create|design|make|develop)\s+)?(?:a|an|the|my|some kind of|something like)\s*(?:website|site|web app|application|app|platform|portal|marketplace|online community|community|network|workspace|member area|customer portal|client portal|management system|booking system|interactive experience|digital product|web tool|tool|software product|creator platform|service platform|collaboration space|learning environment|resource hub)\b/i.test(q);
  if (!explicitBuildAction && !naturalLanguageBuildRequest) return false;

  // Known industry blueprints improve defaults, but they are not the boundary
  // of what a customer may ask OVYX to create.
  const customDigitalProductIntent = /\b(?:website|site|web app|application|app|platform|portal|marketplace|community|network|workspace|member area|customer portal|client portal|management system|booking system|interactive experience|digital product|web tool|tool|software product|online community|creator platform|service platform|collaboration space|learning environment|resource hub)\b/i.test(q);
  return detectArchetype(q) !== 'generic' || customDigitalProductIntent;
}

function triggerMatches(prompt, trigger) {
  if (trigger.includes(' ') || /[^a-z0-9]/i.test(trigger)) return prompt.includes(trigger);
  return prompt.split(/[^a-z0-9]+/).includes(trigger);
}

const BROAD_ARCHETYPE_TRIGGERS = new Set([
  'online store', 'online shop', 'marketplace', 'storefront', 'retail store',
  'shopping cart', 'cart', 'product',
  'dashboard', 'analytics dashboard', 'data dashboard', 'admin panel',
  'operations console', 'reporting dashboard', 'metrics dashboard',
  'analytics portal', 'data visualization', 'agency', 'studio'
]);

export function detectArchetype(prompt) {
  const q = clean(prompt).toLowerCase();
  let best = { id: 'generic', specificHits: 0, specificWeight: 0, broadHits: 0 };
  for (const archetype of ARCHETYPES) {
    const matched = archetype.triggers.filter(trigger => triggerMatches(q, trigger));
    const specific = matched.filter(trigger => !BROAD_ARCHETYPE_TRIGGERS.has(trigger));
    const broadHits = matched.length - specific.length;
    const specificHits = specific.length;
    const specificWeight = specific.reduce((total, trigger) => total + trigger.length + 10, 0);

    // A clear industry signal outranks generic patterns such as "dashboard",
    // "online store", or "marketplace", even when those generic words repeat.
    if (
      specificHits > best.specificHits ||
      (specificHits === best.specificHits && specificWeight > best.specificWeight) ||
      (specificHits === best.specificHits && specificWeight === best.specificWeight && broadHits > best.broadHits)
    ) {
      best = { id: archetype.id, specificHits, specificWeight, broadHits };
    }
  }
  return best.id;
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
