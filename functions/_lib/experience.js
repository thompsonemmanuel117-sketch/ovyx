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
    triggers: ['saas', 'software', 'product', 'startup', 'ai tool', 'b2b'],
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
    triggers: ['real estate', 'realty', 'property listing', 'property listings', 'property development', 'property management', 'estate agent', 'estate agency', 'realtor', 'homes for sale', 'commercial real estate', 'apartments for rent'],
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

export function isWebStudioPrompt(prompt, mode = '') {
  const m = clean(mode).toLowerCase();
  if (/^web-studio-(build|fix|plan|ask)$/.test(m)) return true;
  const q = clean(prompt).toLowerCase();
  if (/(website|web site|landing page|marketing site|homepage|portfolio site|church site|hospital site|clinic site|restaurant site|web app|dashboard|saas app|storefront)/.test(q)) return true;
  const buildIntent = /\b(?:build|create|design|make|generate|develop|launch|craft|produce)\b/i.test(q);
  return buildIntent && detectArchetype(q) !== 'generic';
}

function triggerMatches(prompt, trigger) {
  if (trigger.includes(' ')) return prompt.includes(trigger);
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\export function isWebStudioPrompt(prompt, mode = '') {
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
}');
  return new RegExp('(^|[^a-z0-9])' + escaped + '(?=$|[^a-z0-9])', 'i').test(prompt);
}

export function detectArchetype(prompt) {
  const q = clean(prompt).toLowerCase();
  let best = { id: 'generic', hits: 0, specificity: 0 };
  for (const archetype of ARCHETYPES) {
    const matched = archetype.triggers.filter(trigger => triggerMatches(q, trigger));
    const hits = matched.length;
    const specificity = matched.reduce((total, trigger) => total + trigger.length, 0);
    if (hits > best.hits || (hits === best.hits && specificity > best.specificity)) {
      best = { id: archetype.id, hits, specificity };
    }
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
