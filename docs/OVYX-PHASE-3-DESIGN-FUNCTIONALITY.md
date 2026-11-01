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
| SEO and document integrity | `functions/_lib/site-integrity.js`, Web Studio quality runtime/evaluator | Titles, descriptions, language, landmarks, route/resource integrity and some structured-data signals exist; canonical/robots/sitemap/social/localization checks need completion. |
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

- Added `functions/_lib/experience-quality.js`, an evidence-aware source audit for page metadata, document language, primary heading/landmark, image alternatives/dimensions, accessible button names, anchor destinations, form-control naming, responsive media rules, reduced-motion support and visible focus rules.
- Integrated the source audit into `auditWebsiteIntegrity()` as the additive `experienceQuality` report. It also detects duplicate page titles/descriptions and reports missing Open Graph title/description and root robots/sitemap artifacts as actionable findings. It explicitly marks rendered visuals, browser interactions, responsive rendering, WCAG conformance, external assets, live integrations and search rankings as `not-verified` until independent evidence exists.
- Added `scripts/ovyx-experience-quality.test.mjs` to the complete `npm test` chain.
- Expanded design-system and visual-asset responsive targets from five to thirteen widths: 320, 360, 375, 390, 430, 540, 640, 768, 820, 1024, 1280, 1440 and 1920 px.

## Additional component dependency coverage

- Extended the existing bounded website file graph with a static route-to-component usage map. It identifies exported uppercase component symbols, traces their module dependencies from HTML/framework page entrypoints, reports unreferenced component candidates and exposes affected routes from `analyzeWebsiteFileImpact()`.
- Added regression fixtures proving a shared component change identifies the page that imports it. This remains static import evidence; dynamic imports and implicit framework registries are explicitly outside the guarantee.

## Additional browser coverage

- Added `scripts/ovyx-webstudio-cross-browser.smoke.mjs`, a generated-site fixture suite that checks responsive overflow at all thirteen viewport widths plus a real disclosure interaction and keyboard probe in Chromium, Firefox and WebKit.
- Extended the dedicated browser workflow to install all three engines and run the cross-browser smoke suite. The workflow also runs `npm test`, `npm run validate` and `npm run build` before the focused Web Studio browser checks.

## Remaining implementation tranches

1. **Component intelligence:** inspect framework-specific component definitions/imports/usages, build route-to-component edges, expose shared-change impact and add regression fixtures for safe variants.
2. **Functional journeys:** derive safe, requirement-specific browser journeys; exercise navigation, search/filter, tabs, dialogs, forms and state changes with before/after evidence. Keep payment, booking, account and external submission probes gated.
3. **SEO integrity:** validate unique titles/descriptions per public route, canonical-origin correctness, Open Graph/Twitter metadata, robots and sitemap consistency, structured-data validity/truthfulness and real localized route alternates.
4. **Accessibility:** expand WCAG-oriented source/browser checks for heading order, landmarks, names, labels, keyboard paths, focus visibility/obscuration, contrast and reflow; record manual screen-reader checks separately.
5. **Responsive and image quality:** evaluate all routes at the thirteen declared widths from 320 through 1920 px, including overflow, media aspect/crops, srcset/sizes, intrinsic dimensions, loading priority and layout shift.
6. **Visual regression:** create stable per-route/per-viewport screenshots, dynamic-region masks, deterministic comparison thresholds and reviewable diffs.
7. **Cross-browser:** run generated-site responsive and interaction smoke checks in Chromium, Firefox and WebKit through the dedicated Playwright workflow.
8. **Generated-artifact acceptance:** run real Cloudflare Workers AI generation through the guarded production workflow when Firestore budget connectivity and owner-approved settings permit; inspect generated files/screenshots and record human visual/editorial review.

## Exit criteria

Phase 3 is not complete until the relevant implementation and regression suites pass on the exact final commit, generated websites are reviewed across all declared viewports and relevant routes, keyboard/accessibility evidence is recorded, SEO artifacts are validated, safe user journeys are exercised, and remaining live/external/human checks are explicitly passed, blocked or skipped. Merge to `main` only after review and required checks pass.
