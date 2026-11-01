/**
 * Deterministic design-system and interaction contract for Website Engine builds.
 *
 * This is an implementation brief, not a fixed visual template: the project brief
 * and supplied brand assets remain authoritative. The contract gives the planner
 * and generator concrete acceptance rules without forcing one industry or aesthetic.
 */
const clean = (value, max = 500) => String(value == null ? '' : value)
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

export function buildDesignSystemContract(prompt = '', context = {}) {
  const brief = clean(prompt, 80000);
  const brand = context && typeof context.brandProfile === 'object' ? context.brandProfile : {};
  const suppliedTokens = context && typeof context.designTokens === 'object' ? context.designTokens : {};
  const suppliedAssets = Array.isArray(context?.assets) ? context.assets.slice(0, 80) : [];
  const hasOrigin = /^https?:\/\//i.test(clean(context?.siteOrigin || context?.canonicalOrigin, 300));
  const isMultiPage = /\b(?:multi[- ]page|pages|about page|contact page|pricing page|blog|case studies|portfolio)\b/i.test(brief);
  const requestsForms = /\b(?:form|enquir(?:y|ies)|inquir(?:y|ies)|contact|application|newsletter|subscribe|submit)\b/i.test(brief);
  const requestsCommerce = /\b(?:cart|checkout|purchase|payment|order|e-?commerce|storefront)\b/i.test(brief);
  const requestsBooking = /\b(?:book(?:ing)?|appointment|reservation|schedule|availability|calendar)\b/i.test(brief);
  const requestsIdentity = /\b(?:sign ?in|log ?in|account|member|authentication|permission|role|invite)\b/i.test(brief);
  const explicitMotion = /\b(?:animation|animated|motion|parallax|scroll[- ]?reveal|microinteraction|cinematic|3d)\b/i.test(brief);
  const interactionVerificationPlan = [
    { id: 'primary-navigation', when: 'Always, when navigation is present', action: 'Activate each safe internal navigation item and verify the intended route/fragment and active state.', expected: 'The destination exists, the correct content is visible and keyboard focus remains predictable.', safety: 'Local navigation only; never trigger external side effects.' },
    { id: 'primary-action', when: 'Always, for each explicitly requested primary action', action: 'Exercise the action using isolated fixture data and inspect its observable state transition.', expected: 'The action produces the requested result or a truthful blocked/unconfigured state.', safety: 'Do not send real payments, messages, bookings, emails or destructive mutations.' },
    ...(requestsForms ? [{ id: 'form-validation', when: 'When forms or submissions are requested', action: 'Test empty, malformed and valid fixture inputs; verify inline errors, preserved values and pending/result states.', expected: 'Validation is associated with fields and no real submission occurs during the smoke test.', safety: 'Stub or intercept network submission; never deliver a real enquiry or newsletter signup.' }] : []),
    ...(requestsCommerce ? [{ id: 'commerce-cart', when: 'When product/cart/checkout behavior is requested', action: 'Change quantity, add/remove fixture items and verify subtotal/total recalculation.', expected: 'Cart state and totals remain consistent; checkout clearly distinguishes demo from configured payment.', safety: 'Never initiate a real payment or order.' }] : []),
    ...(requestsBooking ? [{ id: 'booking-selection', when: 'When booking or scheduling is requested', action: 'Select a fixture date/time and inspect review, pending and unavailable states.', expected: 'A request is never labelled confirmed without a real provider confirmation.', safety: 'Never reserve a real slot or notify a real person.' }] : []),
    ...(requestsIdentity ? [{ id: 'identity-permissions', when: 'When sign-in, accounts or permissions are requested', action: 'Exercise signed-out, authenticated-fixture, expired and denied states using test identities.', expected: 'Protected actions remain server-authorized and state labels are truthful.', safety: 'Never create, delete or mutate a real user account.' }] : []),
    (/\b(?:search|filter|sort|catalog|listing|results)\b/i.test(brief) ? { id: 'search-filter-sort', when: 'When search, filtering or sorting is requested', action: 'Run deterministic fixture queries, combine filters and change sort order.', expected: 'Results, empty states and reset behavior reflect the selected criteria.', safety: 'Use fixture records; do not imply live inventory or external search is connected.' } : null),
    (/\b(?:tab|tabs|accordion|disclosure|dropdown|dialog|modal|menu)\b/i.test(brief) ? { id: 'disclosure-and-overlays', when: 'When tabs, menus, dialogs or disclosures are requested', action: 'Open, switch, close and keyboard-navigate each safe disclosure/overlay.', expected: 'ARIA state, visibility and focus entry/return stay synchronized.', safety: 'Use local controls only; do not trigger external actions from menu items.' } : null),
  ].filter(Boolean);

  return {
    version: 1,
    authority: {
      sourceOfTruth: 'The original user brief, supplied brand profile and existing project design system.',
      suppliedBrandProfile: Object.keys(brand).length > 0,
      suppliedDesignTokens: Object.keys(suppliedTokens).length > 0,
      suppliedAssetCount: suppliedAssets.length,
      rule: 'Preserve explicit brand colors, typography, logos, imagery and existing project conventions unless the user asks to change them. Never replace supplied identity with a generic preset.',
    },
    visualSystem: {
      direction: 'Derive one distinctive art direction from purpose, audience, content, brand and market context. Explain the design rationale in the plan and apply it consistently across every route.',
      antiPatterns: [
        'Do not repeat the same hero, three-card grid, rounded-card layout or gradient treatment across unrelated sections.',
        'Do not add decoration, gradients, blur, glass, shadows or animation without a clear hierarchy or usability purpose.',
        'Do not use arbitrary colors when a supplied brand palette exists.',
        'Do not create visual density that hides the primary action or makes important content harder to scan.',
      ],
      semanticTokens: [
        'Define reusable semantic color roles for page, surface, elevated surface, text, muted text, border, primary action, secondary action, focus, success, warning and danger; map them to the actual brand palette.',
        'Define a coherent type scale, font roles, line-height, weight and readable measure; use supplied fonts when available and sensible fallbacks otherwise.',
        'Define spacing, content-width, grid, radius, border, elevation and motion tokens; use a consistent scale rather than unrelated one-off values.',
        'Expose tokens through CSS custom properties or the selected framework equivalent and consume them across shared components.',
      ],
      hierarchy: [
        'Give each page one clear primary heading and a deliberate heading hierarchy.',
        'Use content width, whitespace, alignment, scale and contrast to communicate priority before decorative effects.',
        'Keep page-specific content and visual rhythm distinct while retaining shared brand consistency.',
      ],
    },
    componentSystem: {
      strategy: 'Identify repeated UI patterns before abstraction. Build shared, named components only where reuse improves consistency, maintainability or behavior; keep genuinely unique compositions page-specific.',
      requirements: [
        'Define component purpose, inputs/props, variants, states, responsive behavior and accessibility contract.',
        'Use one source of truth for shared navigation, buttons, form controls, cards, dialogs and repeated site chrome.',
        'Prefer explicit variants and semantic props over duplicated markup or brittle CSS selectors.',
        'Track component-to-page usage and dependency edges so a shared change can report affected routes before applying.',
        'Do not replace project-specific content with generic placeholder components or over-abstract one-off sections.',
      ],
      changeSafety: 'Before changing a shared component, inspect its consumers, preserve unrelated variants and verify every affected route after the edit.',
    },
    interactionSystem: {
      requiredStates: ['idle', 'hover', 'focus-visible', 'active', 'disabled', 'loading', 'success', 'error', 'empty', 'validation'],
      verificationPlan: interactionVerificationPlan,
      rules: [
        'Every visible interactive control must have one intentional action, correct semantic element and observable result.',
        'Use buttons for actions and links for navigation; never use placeholder href values or clickable decoration.',
        'Provide clear inline validation, pending feedback, success confirmation, actionable errors and retry/recovery where relevant.',
        'Prevent duplicate submissions and race conditions; preserve user input when a recoverable request fails.',
        'Dialogs, menus, tabs and disclosure controls must support keyboard operation, correct ARIA state and predictable focus entry/return.',
        'Do not claim a payment, booking, email, enquiry, save or authentication action succeeded without the real service result.',
        ...(requestsForms ? ['Forms must have associated labels, correct input types, required-field validation, consent clarity and truthful submission states.'] : []),
        ...(requestsCommerce ? ['Commerce flows must show accurate item, quantity, subtotal, fees, total, currency and payment status; never fake a completed transaction.'] : []),
        ...(requestsBooking ? ['Booking flows must distinguish availability, selection, pending confirmation, confirmed booking and failure; never imply a slot is reserved before provider confirmation.'] : []),
        ...(requestsIdentity ? ['Identity flows must distinguish signed-out, authenticating, authenticated, expired and denied states; enforce permissions server-side.'] : []),
      ],
      requirementTraceability: [
        'Map each requested control to its owning route, component, intended action, state transition, visible feedback and recovery behavior.',
        'Prioritize the primary user journey and every explicitly requested interaction; do not substitute random control sampling for requirement coverage.',
        'For each critical journey, record the precondition, safe test action, expected observable result, cleanup/reset and evidence artifact.',
        'Test safe navigation, disclosure, tab, filter, sort, search and local state controls in isolation; use fixtures for destructive or external side effects.',
        'Never submit real payments, bookings, messages, emails, identity changes or destructive operations during routine browser QA.',
        'Mark a control unverified when its behavior cannot be safely exercised; never infer success from clickability alone.',
      ],
      evidenceContract: {
        fields: ['requirementId', 'route', 'component', 'control', 'action', 'expectedState', 'observedState', 'result', 'evidenceRef'],
        allowedResults: ['passed', 'failed', 'skipped', 'blocked', 'not-verified'],
        rule: 'A journey passes only when its expected observable state is verified; screenshots and source patterns alone do not prove interaction success.',
      },
    },
    responsiveSystem: {
      viewports: [
        { width: 320, height: 720 },
        { width: 360, height: 800 },
        { width: 375, height: 812 },
        { width: 390, height: 844 },
        { width: 430, height: 932 },
        { width: 540, height: 900 },
        { width: 640, height: 960 },
        { width: 768, height: 1024 },
        { width: 820, height: 1180 },
        { width: 1024, height: 768 },
        { width: 1280, height: 800 },
        { width: 1440, height: 900 },
        { width: 1920, height: 1080 },
      ],
      rules: [
        'Use fluid layout primitives and content-driven breakpoints; do not merely shrink the desktop composition.',
        'Recompose navigation, columns, media and action placement for narrow screens while preserving reading order and task priority.',
        'Prevent horizontal page overflow, clipped content, overlapping controls and fixed overlays that obstruct primary actions.',
        'Use responsive image sources/sizes and appropriately constrained media; keep tables and dense data usable on touch screens.',
        'Prefer at least 44 by 44 CSS pixels for primary touch targets; provide adequate spacing for smaller controls.',
      ],
    },
    imageSystem: {
      rules: [
        'Prefer supplied, project-owned or explicitly approved assets and preserve their identity and intended use.',
        'Never fabricate remote image URLs, invent people/product imagery as factual evidence, or claim licensing/source verification that did not occur.',
        'Use meaningful alt text for informative images and alt="" for purely decorative images.',
        'Provide intrinsic width/height or aspect-ratio to reduce layout shift; use srcset and sizes when multiple resolutions exist.',
        'Lazy-load below-the-fold media; do not lazy-load the primary above-the-fold hero/LCP image without a measured reason.',
        'Use deliberate object-fit/object-position and responsive crops; provide an honest designed fallback when an asset is unavailable.',
      ],
    },
    seoSystem: {
      rules: [
        'Give every indexable route a unique, accurate title and concise meta description aligned with that page content.',
        'Use semantic landmarks, one clear primary heading, logical heading order and descriptive internal link text.',
        'Add Open Graph and social preview metadata using real page titles, descriptions and project-owned imagery.',
        'Generate a canonical URL only when the authoritative site origin is known; never invent a production domain.',
        ...(isMultiPage ? ['Generate a sitemap containing only real canonical public routes and a robots.txt policy consistent with the requested launch/indexing intent.'] : []),
        'Use structured data only when the page content supports the schema with truthful, visible facts; never fabricate ratings, prices, reviews, addresses or organization details.',
        'Add hreflang only when real translated/localized route variants exist; do not emit empty or speculative alternates.',
        'Keep private, authenticated, preview and staging routes out of public indexing where the framework supports it.',
      ],
      canonicalOriginKnown: hasOrigin,
      multiPageIntent: isMultiPage,
    },
    accessibilitySystem: {
      target: 'WCAG 2.2 AA design and implementation target; automated source/browser checks are evidence, not a certification.',
      rules: [
        'Use semantic HTML and native controls first; add ARIA only when native semantics are insufficient.',
        'Maintain at least 4.5:1 contrast for normal text and 3:1 for large text and essential non-text UI boundaries/indicators.',
        'Ensure all functionality is keyboard operable with a visible focus indicator that is not obscured.',
        'Provide skip navigation, landmarks, meaningful headings, accessible names, form labels and useful error associations.',
        'Support screen-reader status announcements for asynchronous results and validation changes without excessive live-region noise.',
        'Respect prefers-reduced-motion and never make motion the only way to understand state or complete a task.',
        'Do not communicate status using color alone; pair color with text, shape or icon and an accessible name.',
        'Preserve zoom/reflow and avoid fixed-height text containers that clip enlarged text.',
      ],
    },
    motionSystem: {
      requested: explicitMotion,
      intensity: /\\b(?:high[- ]motion|motion[- ]rich|cinematic|immersive|expressive animation|advanced animation|rich motion|dynamic motion)\\b/i.test(brief)
        ? 'expressive'
        : explicitMotion ? 'purposeful' : 'restrained',
      direction: 'Create a coherent motion language that reinforces the product identity, hierarchy and user journey. Motion quality should feel intentional and polished, never like a collection of unrelated effects.',
      choreography: [
        { id: 'page-entry', trigger: 'Initial route render', treatment: 'Use a short, composed entrance for the primary content; avoid delaying first paint or hiding essential content.', preferredProperties: ['opacity', 'transform'], reducedMotion: 'Render content immediately without entrance movement.' },
        { id: 'section-reveal', trigger: 'Meaningful sections enter the viewport', treatment: 'Use subtle staggered reveals for related content groups; reveal each group once and keep text readable while scrolling.', preferredProperties: ['opacity', 'transform'], reducedMotion: 'Show all content immediately; no scroll-triggered hiding.' },
        { id: 'navigation-transition', trigger: 'Route or major view changes', treatment: 'Use a consistent, brief transition that preserves orientation and never blocks navigation or browser history.', preferredProperties: ['opacity', 'transform'], reducedMotion: 'Switch views immediately with focus moved to the destination heading when appropriate.' },
        { id: 'micro-interaction', trigger: 'Hover, focus, press, selection or toggle', treatment: 'Give controls crisp tactile feedback with clear active, focus and selected states; do not rely on hover for essential information.', preferredProperties: ['transform', 'opacity', 'color'], reducedMotion: 'Keep state changes immediate and clearly visible without movement.' },
        { id: 'workflow-feedback', trigger: 'Submit, save, load, success or error', treatment: 'Animate state changes only when it improves comprehension; pair motion with text and semantic status announcements.', preferredProperties: ['opacity', 'transform'], reducedMotion: 'Use immediate state changes and persistent text/status feedback.' },
        { id: 'signature-moment', trigger: 'One high-value brand or product moment', treatment: 'Design one distinctive, purpose-led motion moment when it supports the brief; do not repeat it on every section.', preferredProperties: ['transform', 'opacity', 'clip-path'], reducedMotion: 'Provide a complete static composition with the same information and affordance.' },
      ],
      timing: {
        tokenGuidance: 'Define shared CSS motion tokens for instant feedback, micro-interactions, standard transitions and deliberate entrances; use a consistent easing family rather than arbitrary durations.',
        microInteraction: '100–180ms',
        standardTransition: '180–320ms',
        entrance: '280–520ms',
        stagger: '40–90ms between related elements',
        easing: 'Use a refined ease-out for entrances, ease-in-out for state transitions and a restrained spring only for tactile controls.',
      },
      performance: [
        'Prefer transform and opacity; avoid animating layout properties such as width, height, top, left or margin.',
        'Avoid permanent will-change, expensive blur filters, large-area filters and continuous animation on low-value decoration.',
        'Use IntersectionObserver or the framework-native equivalent for scroll reveals; disconnect or unobserve completed one-shot reveals.',
        'Do not animate large media before it has dimensions; prevent layout shift and respect reduced data/performance preferences where available.',
        'Keep animation work interruptible, composited where practical and responsive to pointer, touch and keyboard input.',
      ],
      accessibility: [
        'Honor prefers-reduced-motion: reduce globally and provide a meaningful static alternative.',
        'Never hide essential content until an animation runs; content must remain available if scripts or observers fail.',
        'Never communicate state, errors or navigation exclusively through motion, color or sound.',
        'Do not auto-play flashing, rapid, looping or parallax motion that can cause discomfort; avoid vestibular-triggering movement.',
        'Ensure focus, keyboard interaction and reading order remain stable during transitions.',
      ],
      rules: [
        explicitMotion
          ? 'Implement the requested motion at the intensity justified by the brief, with coherent choreography and clear interaction purpose.'
          : 'Use refined motion by default for meaningful feedback and hierarchy; reserve prominent reveals and signature animation for moments that benefit from them.',
        'Treat the motion choreography as a system shared across routes, not isolated page effects.',
        'Respect prefers-reduced-motion with a usable reduced or static alternative.',
        'Keep motion interruptible and never block navigation, reading or primary actions.',
      ],
    },
    acceptance: [
      'Inspect all generated routes, not only the homepage.',
      'Capture and review screenshots at every declared viewport; record overflow, clipping, layout shift and obstructed actions.',
      'Exercise the primary requirement-derived user journey and verify observable state changes, validation, loading, success and failure behavior.',
      'Run automated accessibility checks, keyboard navigation and a screen-reader-oriented semantic review; document untested criteria.',
      'Verify page metadata, canonical origin, social previews, sitemap/robots policy and structured-data truthfulness.',
      'Report static checks, browser checks, external-service checks and human visual review as separate evidence levels.',
    ],
  };
}
