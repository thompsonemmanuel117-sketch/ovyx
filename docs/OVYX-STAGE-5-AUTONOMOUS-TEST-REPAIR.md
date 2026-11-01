# OVYX Stage 5 — Autonomous Build, Test and Repair

**Roadmap stage:** 5 of 10  
**Product goal:** OVYX must inspect the actual website/application it has generated, execute meaningful browser and backend tests, repair failures safely, and repeat verification before reporting completion.  
**Status:** In progress — static generation-time repair and in-editor requirement-derived browser journey repair are integrated; per-generated-backend runtime verification and its repair/retest adapter remain outstanding.

## Important naming distinction

The repository already contains `docs/OVYX-STAGE-5-INTELLIGENCE.md` and `scripts/ovyx-stage5-intelligence.test.mjs`. Those refer to an earlier internal intelligence-layer milestone (structured task plans, tool allowlists, evidence and edit approvals). They are not this Stage 5 in the agreed 10-stage product roadmap. Keep both concepts separate; do not rename or remove the existing intelligence work.

## Existing capabilities verified on main

- `scripts/ovyx-webstudio-evaluation-runner.mjs`: bounded static artifact inspection for HTML structure, local references, accessibility signals, forms, placeholder copy, source-level functional evidence, deployment readiness and full-stack source contracts. It explicitly does not prove runtime behavior.
- `scripts/ovyx-webstudio-generated-site-browser-eval.mjs`: Playwright/Chromium inspection of supplied static artifacts at 320, 390, 768, 1024 and 1440 pixel widths. It checks page errors, console errors, failed requests, overflow, images, internal links, visible buttons, QA-only forms and screenshots.
- `functions/_lib/studio-singlepage.js`: one bounded AI source-repair attempt after deterministic single-page validation failures, with an allowlist, size limits, candidate checks and explicit failure states.
- `functions/_lib/studio-multipage.js`: bounded generation recovery and requirement-repair passes with scoped files and integrity checks.
- `scripts/ovyx-stage4-business-runtime.test.mjs`: local Wrangler/D1 reference-runtime acceptance for commerce, checkout, inventory concurrency, tenant isolation, payment/webhook fail-closed behavior, subscriptions, notifications, dashboards and automation.
- `functions/api/internal/live-generation-eval.js` and `.github/workflows/ovyx-webstudio-live-generation.yml`: trusted, OIDC-protected production-generation acceptance path, followed by browser, integration and acceptance audits for explicitly requested live runs.

These are useful foundations, but they do not yet form one general autonomous test/repair loop for every generated customer application.

## Gaps to close

1. **One evidence contract:** combine static, browser, backend-runtime and user-journey results into a single per-build report. A missing or unrun test must never count as passed.
2. **Requirement-derived tests:** turn the original brief and trusted architecture manifest into concrete page, control, form, API, database and end-to-end journey tests. Keep planned, executed, passed, failed and blocked states distinct.
3. **Real generated-app runtime:** run supported generated server routes and database migrations against isolated disposable test resources. Static-file hosting alone must not be described as backend testing.
4. **Meaningful browser journeys:** test expected outcomes and resulting state, not merely whether a click changed the DOM. Cover navigation, forms, authentication/authorization boundaries, commerce/booking/subscription flows where the generated app declares them, plus responsive and accessibility checks.
5. **Browser-feedback repair:** the in-editor preview now feeds failed requirement-derived UI journeys into its existing guarded one-attempt repair path and re-runs the same inspection. Sanitized backend-runtime feedback still needs to be connected to the server-side repair coordinator.
6. **Repair verification:** rerun the same failed tests after a repair. Accept a candidate only when it improves the reported failures and introduces no new blocker/regression. Cap retries and stop rather than loop indefinitely.
7. **Safe persistence:** generated-project edits must use existing owner-scoped project APIs, current revision checks, backups/recovery and the required approval boundary. Do not silently overwrite a user's saved project.
8. **Honest reporting:** separate local fixture evidence, generated-source evidence, isolated runtime evidence, external-provider receipts, human review and production deployment. Never claim real email, payment, OAuth, inventory or booking success from a mocked QA endpoint.

## Implementation sequence

- [x] Audit existing static evaluator, Chromium evaluator, bounded generation repair, Stage 4 D1 runtime fixture and trusted live-generation workflow.
- [x] Add a normalized autonomous-QA report contract that combines evidence without promoting missing checks to passes.
- [x] Instruct the Website Engine to generate a bounded `ovyx-qa-plan.json` manifest from the original requirements and actual routes/controls.
- [ ] Add isolated generated-backend runtime execution for supported deployment targets and disposable databases.
- [x] Add requirement-aware browser journeys with explicit expected outcomes and state assertions, loaded from the generated `ovyx-qa-plan.json` manifest. Safe same-origin GET/HEAD API probes are supported.
- [x] Add one bounded in-editor browser-journey feedback repair attempt through the existing guarded AI provider and snapshot rollback boundary. Backend-runtime-feedback repair remains pending.
- [x] Re-run the same in-editor journey and responsive browser checks after repair; reject regressions and restore the previous snapshot when the repair does not pass. Server-side backend-runtime retesting remains pending.
- [ ] Integrate browser/backend runtime evidence and post-repair verification into the full Web Studio preview/project revision lifecycle. The generation response now includes static QA/repair evidence and explicitly blocked runtime channels.
- [ ] Add CI fixtures for clean, broken, security-sensitive and backend-connected generated apps.
- [ ] Run full repository tests, static validation, production build, browser/device checks and live acceptance where credentials and approvals exist.
- [ ] Merge Stage 5 into `main` only after all required automated checks pass and all external/human-only limitations are explicitly recorded.

## Current implementation update (PR #374)

The Stage 5 foundation now runs inside the shared Website Engine used by both authenticated Web Studio generation entry points. Every fresh non-scoped build with a file map receives deterministic static checks. Blocker findings may trigger one bounded model repair pass; only exact allowlisted complete source-file replacements can be accepted, and the static checks are rerun before the candidate replaces the in-memory generated files. Repair model usage is included in normal generation quota accounting. The API response returns an `autonomousQa` report. Browser, backend runtime and journey channels remain explicitly blocked until their isolated adapters have run; source audits and the generated-backend fixture are not mislabeled as real generated-app runtime evidence.

The real in-editor Web Studio quality runtime now reads `ovyx-qa-plan.json`, maps each journey to its actual page route, and executes bounded safe UI actions/assertions inside the existing network-isolated iframe. It records passed/failed/skipped journey evidence in the inspector report and downloadable client handoff. Failed journeys feed the existing single repair attempt; the same preview inspection reruns after repair, and the previous project snapshot is restored if defects remain. The generated-site Playwright evaluator also reads the plan and runs browser journeys plus same-origin GET/HEAD route probes. Those route probes run against the static artifact host and are explicitly labelled static-only; they do not execute generated backend functions or database bindings.

## Safety and execution limits

- Never run destructive migrations, real payments/refunds, real customer messages, or external provider actions as an incidental test.
- Use disposable databases, synthetic accounts and QA-only recipients. Require explicit owner opt-in for any external test endpoint.
- Never place provider secrets in browser bundles, generated source, test fixtures, screenshots, prompts, or reports.
- A successful HTTP response is not proof of payment settlement, email delivery, booking confirmation or database durability.
- Limit repair attempts (initially one repair pass per failed build), bound tokens/files/source context, preserve the original artifact and record every accepted/rejected change.
- If the app requires credentials or external resources that are not configured, report the exact test as blocked/unverified rather than fabricating success.

## Additional quality upgrades to include before declaring Stage 5 complete

- **Visual regression:** retain before/after screenshots and compare layout regions at mobile, tablet and desktop sizes. Ignore only explicitly approved dynamic regions; never hide a genuine layout regression.
- **Accessibility automation:** run axe-style rules plus keyboard-only navigation, focus order, modal focus trapping, labels, contrast and reduced-motion checks. Keep automated findings separate from human accessibility review.
- **Security regression suite:** exercise unauthenticated access, cross-tenant reads/writes, role escalation, CSRF, unsafe redirects, injection/XSS sinks, upload validation and rate-limit behavior using synthetic identities and disposable data.
- **Database lifecycle tests:** apply migrations to a fresh disposable database, test constraints/relationships, CRUD, transaction rollback, concurrency and tenant isolation, then destroy the database. Use framework/provider-specific adapters; never point QA at production.
- **Journey coverage map:** map every critical user requirement to one or more tests and show uncovered requirements explicitly. A green test suite with missing requirement coverage is not a full pass.
- **Failure classification:** distinguish product defects from unavailable credentials, provider outages, flaky infrastructure, unsupported frameworks and human-review tasks. Retry only transient infrastructure failures with a strict budget.
- **Repair diff and audit trail:** show the exact before/after file diff, tests that justified each change, repair attempt count and rollback reason. Preserve the original artifact until the candidate passes.
- **Release confidence gate:** block publish when required tests fail or are unrun; permit an owner-approved exception only with a recorded reason, scope and expiry.

## Completion definition

Stage 5 is complete only when a generated full-stack application can be built, have its requirement-derived browser and backend journeys executed in an isolated environment, receive a bounded repair for detected defects, and pass the same tests again—or return an honest, evidence-backed failure report. The complete cycle must be covered by automated regression tests and integrated into the actual Web Studio build/project lifecycle. A standalone test script or a passing static audit alone is not Stage 5 completion.
