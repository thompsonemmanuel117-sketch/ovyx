# OVYX — Maximum Website Engine Upgrade

**Updated:** 2026-10-31  
**Repository:** `thompsonemmanuel117-sketch/ovyx`  
**Active implementation:** [PR #359 — Phase 1: unify OVYX website planning and generation lifecycle](https://github.com/thompsonemmanuel117-sketch/ovyx/pull/359)  
**Status at this revision:** Source changes are committed on the feature branch. PR is open and mergeable, but required GitHub Actions jobs have not completed. This document is an implementation/acceptance register, not a claim that all 43–75 capabilities are production-ready.

## Mission and protected boundaries

Build OVYX into a reliable end-to-end website engine that can understand a brief, plan the whole product, generate pages and working journeys, integrate real services where configured, test the result, repair defects, package the project and prepare a truthful deployment handoff.

The objective is the highest supportable engineering standard, not an unverifiable promise of absolute perfection.

The following are invariants for every phase:

- Keep Cloudflare Workers AI as OVYX's website-generation inference route. Preserve its current server routing, daily/per-user quota protections, authentication, plan entitlements, usage accounting, refund and failure behavior. Do not add a competing provider route or silently switch models after a provider/quota failure.
- Preserve the separate App Studio path, its UI, state, entitlement checks and project schema. This Website Engine program does not authorize App Studio redesign or migration.
- Preserve Firebase account identity, Firestore project data, storage ownership rules, conversation history and existing project files.
- Audit the current implementation before each change. Prefer the smallest compatible extension; do not create a second system merely to increase a feature count.
- A source implementation, local fixture, queued workflow or successful provider preflight is not proof of live integration or production acceptance.
- Never expose credentials in generated client files, logs, URLs, prompt text or artifacts. Never trigger a real payment, send an external enquiry/email or modify production secrets as an incidental CI action.
- Keep inspection read-only. Any proposed code repair must retain preview, approval, backup and rollback boundaries where the existing product requires them.
- Report “configured”, “connected”, “last check passed”, “live delivery verified” and “production ready” as separate states supported by actual evidence.

## Existing OVYX foundations (audit baseline)

| Capability | Existing implementation found | Honest verification boundary |
|---|---|---|
| Cloudflare AI and quotas | Shared provider adapter and guarded Cloudflare Workers AI path | Source and regression coverage exist; per-run live availability still depends on provider and Firestore budget ledger. |
| Website brief and requirements | Prompt contract, build-readiness questions, explicit page detection and output requirement checks | Deterministic source-level checks; not proof of perfect semantic understanding. |
| Brand, market and design intelligence | Experience, brand, market-context and visual-asset planning modules | Planning context exists; subjective art direction still needs rendered review. |
| Website structure and generation | Multi-page and single-page builders, route/sitemap planning, validator and repair helpers | Source/tests exist; real generation acceptance needs genuine outputs. |
| Existing-site edits | Project graph/source context, scoped edit normalization and rollback foundations | Preserve unaffected files; browser behavior must still be rechecked. |
| Research and imagery | Authenticated research and Cloudflare image-generation routes | Requires real configured services, quota and acceptance evidence. |
| Full-stack and integrations | Full-stack code-generation foundations, Universal Connections, auth and payment route foundations | Connection-specific setup and live success flows remain separate proof obligations. |
| Assets and storage | Firebase project-asset APIs, optimizer and exporter asset retrieval | Live Storage rules/deployment and authorized account behavior require environment-specific checks. |
| Quality and browser inspection | Source audits, isolated browser checks, five documented viewport widths and artifact evaluator | Bounded sandbox checks, not exhaustive journeys, full WCAG, live network or cross-browser proof. |
| Export and deployment | Three ZIP export modes and Cloudflare Pages deploy/status APIs | Export profile is advisory; build/install, real deployment and user-domain verification are separate. |
| Workspace, history and recovery | Saved-project tools, snapshots, scoped rollback and recovery | Source revisions, human approval and server read-back remain mandatory for writes. |

## Additional engineering checklist (43–75)

Statuses below mean: **Existing** = implementation found; **Partial** = useful foundation exists but listed behavior is not fully accepted; **Open** = not yet evidenced in the inspected production path; **PR pending** = code is in PR #359 but its checks have not passed yet.

| No. | Capability | Current evidence/status | Remaining acceptance work |
|---:|---|---|---|
| 43 | Unified Website Generation Engine | **PR pending.** Shared lifecycle now joins Assistant and Gateway planning/build paths, staged multi-page generation and single-page repair fallback. Both routes use bounded serialized instructions and a compact secondary plan summary; no raw plan is sliced inside JSON. | Run the dedicated engine suite, all route regressions and PR CI; confirm the exact deployed request path after merge. |
| 44 | Advanced AI Website Architect | **Partial / PR pending.** Plan carries mission, audience, market, requirements, pages, integrations, design direction and quality gates. | Test unfamiliar briefs, ambiguous workflows, long prompts, exclusions and multi-turn changes against real generated artifacts. |
| 45 | Intelligent Page Designer | **Partial.** Multi-page sitemap and per-page batching foundations exist. | Verify each page has its own clear purpose, content, layout and required functionality while preserving global consistency and shared navigation. |
| 46 | Premium Design Intelligence 2.0 | **Partial.** Adaptive experience, market/brand context and anti-template guidance exist. | Review real screenshots for typography, hierarchy, spacing, composition, image fit, originality and brand consistency; no static source score can replace this. |
| 47 | Advanced Component Intelligence | **Partial.** Page blueprints now include reusable component contracts, shared ownership, variants, declared dependencies and accessibility contracts. | Build and persist a project-wide component dependency/usage graph and verify safe cross-page updates with impact analysis. Per-page contracts are not yet a full dependency graph. |
| 48 | Real Functional Interaction Engine | **Partial.** Source checks and bounded safe-control smoke tests identify some dead controls and state changes. | Generate requirement-derived journeys and verify every relevant control, form, keyboard path, state, feedback, error and recovery flow; current sampling is not exhaustive. |
| 49 | Complete Backend Connection Engine | **Partial.** Full-stack code-generation foundations and server-side integration routes exist. | Validate each generated endpoint against a real configured service, authorization, failure handling, retries and data ownership. |
| 50 | Database Intelligence | **Partial.** Firebase/Firestore data paths and a Universal Connection type for databases exist. | Verify schema discovery/design, relationships, versioned migrations, CRUD behavior, validation and rollback for each supported backend. Do not imply arbitrary SQL/database migrations are already certified. |
| 51 | Authentication and Permission Intelligence | **Partial.** Firebase authentication, owner checks, route entitlements and role/permission foundations exist. | Browser-test generated user registration, sign-in/out, protected routes, role enforcement, session expiry and recovery against a configured identity service. |
| 52 | Payment and Commerce Integration | **Partial.** Paystack/OPay create, verify, status, webhook, idempotency and lifecycle code exists. | Safe end-to-end sandbox verification for amount/currency/reference, fulfillment, replay, idempotency, refund and failure paths. No real charge without explicit authorization. |
| 53 | Forms and Communication | **Partial.** Form-intent checks, form validation and mailer modules exist. | Prove actual owner-approved email/enquiry delivery with a controlled QA recipient and provider receipt; local form behavior or HTTP 2xx is insufficient. |
| 54 | Booking and Scheduling | **Partial.** Prompt recognition, page/control requirements and UI evidence checks exist. | Connect real availability, timezone-aware calendars, booking creation, conflict prevention, confirmation and cancellation; live booking provider is not yet proven. |
| 55 | Advanced Asset Pipeline | **PR pending / partial.** Firebase assets, image generation, local WebP optimization and binary ZIP inclusion are present in source. | Pass storage authorization, large/binary upload-retrieval, MIME/size, optimization, export and reload tests on authorized accounts and deployed rules. |
| 56 | AI Image Placement | **Partial.** Visual-asset planning and image generation foundations exist. | Verify generated assets are associated with the right project, semantically matched to page/section slots, responsive, licensed/attributed where needed and preserved on edit. Fully automatic placement is not yet proven. |
| 57 | Framework-Aware Export | **PR pending / partial.** Exporter detects Next.js, SvelteKit, Nuxt, Astro, Remix, Vite, Angular, React, Vue and static HTML and reports runtime/build guidance. | Add/verify framework scaffolds only where required, install/build in isolated CI, verify generated entry routes and dependencies, and report unsupported frameworks honestly. The current profile does not scaffold, install or run builds. |
| 58 | Advanced SEO | **Partial.** Metadata, semantic structure, route/resource and structured-data source signals exist. | Check canonical URLs, robots.txt, sitemap, schema validity, localization/hreflang and social previews across multi-page frameworks; verify deployed output. |
| 59 | Performance Optimization | **Partial.** Local image WebP optimization plus source-based lazy-image, responsive-image, script-blocking, fluid-type and network-hint diagnostics now contribute to Quality Score v2. | Measure real browser Core Web Vitals/LCP/INP/CLS under defined conditions; verify caching, code splitting, bundle size and image delivery after deploy. Static source signals are not runtime measurements. |
| 60 | Accessibility | **Partial.** Labels, accessible names, alt attributes, ARIA references, focus and reduced-motion checks exist. | Add standards-based automated WCAG checks, meaningful contrast computation, keyboard/screen-reader review and documented human accessibility acceptance. |
| 61 | Real Browser Testing | **Partial.** Chromium sandboxed inspection, viewport matrix and route/control sampling exist. | Turn every prompt requirement into route-specific journey tests; increase safe interaction coverage and keep external/destructive/payment tests explicitly gated. |
| 62 | Visual Regression Testing | **Open / not evidenced in inspected path.** Screenshot capture exists, but a stable pixel/region baseline comparison engine was not confirmed. | Add deterministic screenshot baselines, masking for dynamic regions, tolerances and reviewable diffs across the chosen viewport matrix. |
| 63 | Cross-Browser Compatibility | **Open / not evidenced in inspected path.** Chromium coverage is present; Firefox/WebKit acceptance was not verified. | Add Firefox and WebKit runs, supported-browser policy, screenshot/console/interaction comparisons and regression fixtures. |
| 64 | Security Intelligence | **Partial.** Secret screening, safe project paths, URL/private-network controls, integration credential protection and generated-site security findings exist. | Add dependency/SCA and static security scans for exported stacks, CSP validation, server input/authorization review and safe adversarial test cases. |
| 65 | Advanced Error Recovery | **Partial.** Validator, deterministic requirements checks, single-page repair fallback and project snapshot restore exist. | Demonstrate defect localization to the correct file/function, bounded patching, post-repair tests and no collateral changes across multi-page projects. |
| 66 | Smart Incremental Generation | **Partial.** Scoped edits bypass complete rebuilds. | Verify dependency-aware changed-file selection, cross-file impact analysis and regeneration only where needed; scoped-edit mode alone is not a full incremental dependency engine. |
| 67 | Advanced Version Control | **Partial.** Project snapshots, history and scoped rollback foundations exist. | Verify file-level diffs, revision history, merge/conflict handling, retention policy and exact restoration after failed edits/builds. |
| 68 | Deployment Intelligence | **Partial.** Cloudflare Pages deployment and status endpoints exist; export profiles describe hosting/runtime needs. | Verify preview and production deploys with correct entitlements, build artifacts, routing, redirects, secrets, domain/SSL and post-deploy health checks. |
| 69 | Integration Readiness Dashboard | **Partial.** Universal Connections and build-readiness questions expose some configuration/health state. | Ensure every required integration reports configured vs reachable vs last-check-passed vs delivery-verified, with missing permissions and safe setup guidance. |
| 70 | Build Observability | **Partial.** Cloudflare diagnostics, request tracing, quota usage and error records exist. | Unify per-build stage timings, model/routed-runtime identifiers, token usage, changed files, validator findings, retries and repair outcomes with secret/prompt redaction. |
| 71 | Automated Acceptance Testing | **Partial.** Prompt-contract checks, static evaluator, browser suites and live acceptance workflow exist. | Generate executable tests from each user requirement and run the full relevant page/interaction matrix, with explicit skipped and external-dependency states. |
| 72 | Website Quality Scoring 2.0 | **PR pending / partial.** Quality Score v2 adds weighted design, functionality, accessibility, SEO, performance, responsiveness, security and route-integrity dimensions, static evidence and a release gate distinguishing missing mapped requirements from unassessed requirements. | Pass evaluator CI; calibrate heuristic penalties against broader artifacts while keeping browser, human and live-integration evidence independent. |
| 73 | AI Self-Review Engine | **Partial.** Planning and generation instructions request requirement reconciliation. | Add an independently inspectable critic/test-evidence pass and deterministic acceptance gate; model self-assertion alone is not proof. |
| 74 | Advanced Project Packaging | **PR pending / partial.** Complete/website-only/backend-only ZIP, binary assets, secret filtering, framework profile and ZIP CRC tests exist in the feature branch. | Pass PR tests, then run install/build and archive extraction verification for each supported project type, preserving source and setup instructions. |
| 75 | Production Readiness Verification | **Partial.** Readiness questions, source checks, provider preflight and live acceptance workflow exist. | Require generated artifacts, successful build/load, five-width browser evidence, real configured integration receipts where requested and human visual/editorial approval before production-ready status. |

## Seven implementation phases

| Phase | Work boundary | Exit evidence |
|---|---|---|
| 1 — Deep repository audit and shared core | Trace actual routes, active dependencies, existing modules and interrupted PR #359; unify plan/build lifecycle and close long-brief/context truncation. | Source review, regression suites and all required PR checks passed; no duplicate route or broken existing binding. |
| 2 — Core architecture and generation | Strengthen prompt requirements, whole-product architecture, route/page planning, per-page responsibility, reusable component graph and file dependency management. | Long/complex briefs, named routes, exclusions, unfamiliar concepts and scoped edits pass requirement-derived tests. |
| 3 — Design and functionality | Improve art direction, assets, real interactions, responsiveness, SEO and accessibility. | Rendered screenshots, all relevant routes, keyboard/interaction tests, accessibility evidence and preserved content. |
| 4 — Full-stack capabilities | Strengthen server endpoints, database/schema workflows, auth/permissions, payments, forms, booking and integrations. | Each service reports its real configuration and passes sandbox/live tests with authorization, receipts and idempotency. |
| 5 — Quality and reliability | Expand browser coverage, visual diff, security/dependency scans, performance, error repair, incremental generation and rollback. | Reproducible test matrix, no unexplained regression, bounded recovery and honest skipped checks. |
| 6 — Export and deployment | Complete framework-specific packaging, dependency/build validation, preview and publishing verification. | ZIP extraction, dependency install, successful build, preview and authorized production deployment checks. |
| 7 — Final acceptance | Re-run affected and full regression checks, genuine live generation, route/browser/integration tests and human review. | Signed evidence report with passed/failed/skipped/blocked items, source SHA, artifact links and remaining owner configuration. |

## Current Phase 1 implementation and release gate

PR #359 contains the shared Website Engine, enhanced design architecture context, safe bounded plan serialization, Assistant/Gateway context deduplication, long-brief regression coverage, framework-aware exporter, binary asset collection, local image optimization and related regression suites.

At this document revision, the feature branch is `feat/ovyx-maximum-website-engine-phase-1` and the PR remains open. The latest PR head at this documentation revision is `5e13d6c736d97c139b5f4e83b4be9bf0bd1d07c6`. Eight GitHub Actions workflows were created for that head, but their jobs were still queued when checked. The source was inspected after commit; the tests were not executed in this environment. Do not merge or report CI success until the exact latest PR head completes all required checks successfully.

### Production acceptance blocker

The repository's latest recorded trusted production acceptance attempt is 2026-10-26 run [40405991196](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/40405991196): Cloudflare Workers AI preflight succeeded, but the first website build failed with HTTP 502 when Firestore could not read `system/ovyx-workers-ai-budget` due to `ECONNRESET` / `FIRESTORE_READ_TRANSPORT_FAILED`. No generated websites were available to evaluate. Authoritative property-feed and owner-approved public enquiry settings were also not configured, and human visual/editorial review remained outstanding.

The correct next production work is to diagnose Firestore ledger connectivity without weakening the guarded daily AI budget, then run the safe provider preflight and, only after explicit owner approval, the documented full-acceptance workflow. Real enquiry delivery and payment tests are separate, opt-in operations.

## Evidence and status vocabulary

- **Source present:** a code path exists; this alone proves neither that it is deployed nor that it works.
- **Unit/contract test passed:** the named command executed and returned success on the exact revision.
- **Browser-tested:** the named routes/viewports/interactions were actually executed and recorded; sampling limits must be shown.
- **Configured:** required settings/credentials are present in the authoritative runtime, without revealing them.
- **Connected/reachable:** a real health check recently succeeded.
- **Delivery/transaction verified:** the upstream provider or controlled recipient returned the required authoritative receipt and the result was reconciled server-side.
- **Production ready:** all requirements relevant to the release passed, no hard blockers remain, and human review required by the workflow is recorded.

A queued job is not a pass. A green fixture is not a live delivery. A generated file is not a successful build. A successful provider preflight is not a successful website build. A successful deploy API response is not proof that the deployed user journey works.
