# OVYX Phase 3 — Design and Functionality Upgrade

**Baseline:** `main` at `410d484d67dd0b6cb5b37d894337992e043d1dd5` (2026-11-01)
**Working branch:** `feat/ovyx-phase-3-design-functionality-maximum`
**Tracking PR:** [#366](https://github.com/thompsonemmanuel117-sketch/ovyx/pull/366)
**Status:** In progress. This document is a work register, not a completion claim.

## Protected boundaries

- Cloudflare Workers AI remains the only OVYX product inference runtime. Do not add local/browser inference, another provider, or a silent fallback.
- Preserve App Studio and its existing state, entitlement checks and project schema.
- Preserve Firebase identity, Firestore data, project assets, quotas, project history, website routes and the shared generation lifecycle.
- Extend the existing experience, asset, source-integrity, quality and browser-evaluation systems; do not create competing parallel pipelines.
- Keep external forms, payments, bookings, email and account actions safe and truthful. No real external side effect without explicit authorization.
- A design contract or static score is not proof of rendered quality, WCAG conformance, live SEO, service delivery or production readiness.

## Mainline audit — existing foundations

| Area | Existing source on baseline | Honest status |
|---|---|---|
| Design intelligence | `functions/_lib/experience.js`, `functions/_lib/market-context.js`, `functions/_lib/prompts.js` | Strong adaptive foundation; generated visual quality still needs broader artifact review. |
| Visual assets | `functions/_lib/visual-asset-plan.js`, `functions/api/ai/image-generation.js`, `assets/ovyx-image-generation.js` | Planning and Cloudflare image-generation paths exist; semantic placement and production asset provenance need more evidence. |
| Reusable components | `functions/_lib/fullstack-architecture.js`, `functions/_lib/website-file-graph.js`, component contracts in experience planning | Partial; a complete component-to-page usage/impact graph and safe cross-page update acceptance remain open. |
| Interactions | `assets/ovyx-webstudio-quality.js`, `scripts/ovyx-webstudio-generated-site-browser-eval.mjs` | Source checks and bounded safe-control probes exist; exhaustive requirement-derived journeys and all workflow states remain open. |
| Responsive behavior | Five viewport targets in visual planning, quality runtime and generated-site browser evaluator | Source/browser sampling exists; all routes and real generated artifacts need complete review. |
| SEO and document integrity | `functions/_lib/site-integrity.js`, Web Studio quality runtime/evaluator | Titles, descriptions, language, landmarks, route/resource integrity, canonical cardinality, Open Graph/Twitter presence, robots/sitemap presence and typed JSON-LD structure are checked; canonical-origin, hreflang and live indexing behavior remain outside static proof. |
| Accessibility | Source and browser checks for alt text, names, labels, ARIA references, contrast samples, focus and reduced motion | Partial; automated samples are not a WCAG 2.2 AA audit or screen-reader acceptance. |
| Visual regression | Browser screenshot capture in existing evaluation workflow | Open as a stable baseline/diff system with deterministic masking and tolerances. |
| Cross-browser | Chromium Playwright suites | Open; Firefox and WebKit coverage is not evidenced on the baseline. |
| Image optimization | `assets/ovyx-webstudio-asset-optimizer.js` | Local WebP optimization and fallback exist; this is asset processing, not AI inference. |

## Initial implementation in PR #366

- Added `functions/_lib/design-system-contract.js`, an adaptive design contract with semantic token roles, project-specific art direction, component governance, interaction states, responsive rules, image semantics, SEO rules and WCAG 2.2 AA implementation guidance.
- Attached the contract to `buildExperienceBrief()` in `functions/_lib/experience.js`, which is already supplied to the existing planning and implementation prompts.
- Added `scripts/ovyx-design-system-contract.test.mjs` and included it in `npm test`.
- The contract preserves supplied brand context and does not force a universal palette, component library or canonical domain.

## Additional implemented tranche

- Added `functions/_lib/experience-quality.js`, an evidence-aware source audit for page metadata, document language, primary heading/landmark and heading order, image alternatives/dimensions, accessible button/link names, anchor destinations, form-control naming, responsive media rules, reduced-motion support and visible focus rules.
- Integrated the source audit into `auditWebsiteIntegrity()` as the additive `experienceQuality` report. It also detects duplicate page titles/descriptions, canonical-link cardinality/hrefs and JSON-LD syntax, and reports missing Open Graph title/description and root robots/sitemap artifacts as actionable findings. It explicitly marks rendered visuals, browser interactions, responsive rendering, WCAG conformance, external assets, live integrations and search rankings as `not-verified` until independent evidence exists.
- Added `scripts/ovyx-experience-quality.test.mjs` to the complete `npm test` chain.
- Expanded design-system, visual-asset planning and Web Studio inspector responsive targets from five to thirteen widths: 320, 360, 375, 390, 430, 540, 640, 768, 820, 1024, 1280, 1440 and 1920 px. The source audit also flags missing responsive image sources and missing sizes hints without treating every image as a release blocker.

## Additional component dependency coverage

- Extended the existing bounded website file graph with a static route-to-component usage map. It identifies exported uppercase component symbols, traces module dependencies from HTML, Next-style app/page and pages entrypoints, and recognizes Vue, Svelte and Astro single-file component candidates.
- Page entrypoints are excluded from the reusable-component orphan list to avoid misclassifying route modules as unused shared components.
- The graph reports unreferenced component candidates and affected routes from `analyzeWebsiteFileImpact()`.
- Regression fixtures prove shared React-style and Vue/Svelte component imports are attributed to the correct page entrypoint. This remains static import evidence; dynamic imports, runtime registries and implicit framework usage may not be visible.

## Additional browser and accessibility coverage

- Added `scripts/ovyx-webstudio-cross-browser.smoke.mjs`, a generated-site fixture suite that checks responsive overflow at all thirteen viewport widths plus a real disclosure interaction and keyboard probe in Chromium, Firefox and WebKit.
- Extended the Web Studio inspector browser acceptance to all thirteen widths for its three core routes (39 checks), and all thirteen widths plus mobile/desktop samples for additional routes (e.g. 69 checks for an 18-route site).
- Added per-control focus-cue comparison and a visible-center obstruction probe to the isolated browser accessibility audit. A page-wide authored focus rule no longer masks individual controls that have no computed focus-state change.
- The source SEO audit validates typed JSON-LD nodes (including inherited-context graph structures), Open Graph image presence, Twitter/X card presence, and responsive-image srcset/sizes opportunities.
- Extended the dedicated browser workflow to install all three engines and run the cross-browser smoke suite. The workflow also runs `npm test`, `npm run validate` and `npm run build` before focused Web Studio browser checks.

## Remaining acceptance work and evidence boundaries

1. **Functional journeys:** broaden requirement-derived journeys for navigation, search/filter, tabs, dialogs, forms, and state changes with observed before/after evidence. Payment, booking, account mutation, and real external submission remain explicitly gated.
2. **SEO integrity:** verify canonical-origin correctness, sitemap route coverage, robots policy consistency, hreflang/localized alternates, and live indexing only when a production origin is configured.
3. **Responsive and image quality:** inspect real generated artifacts for art direction, crop quality, image loading priority, intrinsic dimensions, layout shift, and external asset availability. Source hints alone do not prove actual image delivery.
4. **Visual regression:** generated-site screenshots are captured as evidence by the existing evaluator; a cross-run golden-image diff system with dynamic-region masks and calibrated thresholds is not yet claimed.
5. **Generated-artifact acceptance:** run real Cloudflare Workers AI generation through the guarded workflow when Firestore budget connectivity and owner-approved settings permit. External credentials, budget access, and real service delivery must be marked blocked or unverified rather than simulated as passed.
6. **Human-only evidence:** screen-reader certification and subjective editorial/brand review remain explicitly outside automated claims; these are reported as limitations, not prerequisites for the user to manually test every code change.

## Exit criteria

Phase 3 is ready to merge when the exact final commit passes the repository test suite, static validation, production build, focused Web Studio browser checks, cross-browser responsive smoke suite, and relevant PR regression workflows. Automated safe interaction and accessibility evidence must be recorded. Any live-service or human-only evidence that cannot be obtained in the guarded environment must be labelled blocked/not-verified; it must never be fabricated. User manual testing is not a merge gate.