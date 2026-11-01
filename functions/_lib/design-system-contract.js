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
      rules: [
        explicitMotion
          ? 'Implement only the motion requested or clearly justified by the brief; use restrained timing and transform/opacity where appropriate.'
          : 'Use restrained motion only when it clarifies hierarchy, state or feedback.',
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
