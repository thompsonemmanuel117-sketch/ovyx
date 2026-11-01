# OVYX Stage 5 — Autonomous Build, Test and Repair

**Roadmap stage:** 5 of 10  
**Product goal:** OVYX must inspect the actual website/application it has generated, execute meaningful browser and backend tests, repair failures safely, and repeat verification before reporting completion.  
**Status:** In progress — static generation-time repair, in-editor browser-journey repair, and a no-egress Cloudflare Pages/D1/KV/R2 runtime evaluator are implemented. Trusted live acceptance now performs one OIDC-protected backend repair attempt and reruns the exact same checks with rollback on failure. Ordinary user-project builds still need a dedicated isolated runtime service to invoke that backend cycle automatically.

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

## Backend runtime and repair boundary

The trusted acceptance workflow now has a complete one-pass backend loop for supported Cloudflare Pages projects:

1. Read the generated `ovyx-qa-plan.json` and require `backendRequired:true` plus exact source-file mappings for every backend check.
2. Copy only bounded project files into a temporary workspace; reject symlinks, environment files, secret-shaped source, unpinned package imports, unsafe migrations and unsupported remote bindings.
3. Build a disposable Pages runtime with fresh local D1 IDs/migrations and local KV/R2 bindings inside Docker `--network none`. The runner verifies that only loopback interfaces exist before executing generated code.
4. Run synthetic API checks, including expected HTTP status and JSON state assertions. No production database, provider credentials, external network, real payment or customer data is available.
5. If a check fails and its exact function source is mapped, request one OIDC-authenticated server-side AI repair for only those function files.
6. Rebuild the same disposable runtime and rerun the exact same check plan. Keep the candidate only when every check passes; otherwise restore the original files and original failure report.

This path is used by the trusted live-generation acceptance workflow. It is not yet a per-user service for arbitrary Firebase-saved projects or arbitrary framework outputs. The production Pages request cannot safely execute generated code itself; a dedicated remote sandbox service (or equivalent isolated runner integration) is still required before ordinary full-stack project generation can be called fully autonomous.

## Implementation sequence

- [x] Audit existing static evaluator, Chromium evaluator, bounded generation repair, Stage 4 D1 runtime fixture and trusted live-generation workflow.
- [x] Add a normalized autonomous-QA report contract that combines evidence without promoting missing checks to passes.
- [x] Instruct the Website Engine to generate a bounded `ovyx-qa-plan.json` manifest from the original requirements and actual routes/controls.
- [x] Add an isolated Cloudflare Pages Functions runtime adapter with disposable D1 migrations and local KV/R2 bindings. It requires a Docker container with `--network none`, a read-only repository mount, no production environment variables, and synthetic-only request data. Third-party packages, unsupported bindings and credentials are fail-closed.
- [ ] Add adapters for other generated frameworks and unsupported Cloudflare bindings (Durable Objects, Queues, services, Vectorize, Hyperdrive and external providers).
- [x] Add requirement-aware browser journeys with explicit expected outcomes and state assertions, loaded from the generated `ovyx-qa-plan.json` manifest. Safe same-origin GET/HEAD API probes are supported.
- [x] Add one bounded in-editor browser-journey feedback repair attempt through the existing guarded AI provider and snapshot rollback boundary. Backend-runtime-feedback repair remains pending.
- [x] Re-run the same in-editor journey and responsive browser checks after repair; reject regressions and restore the previous snapshot when the repair does not pass. Server-side backend-runtime retesting remains pending.
- [ ] Integrate backend runtime evidence and backend repair/retest into every ordinary Web Studio project revision lifecycle. The trusted live-generation acceptance workflow can execute and repair supported Cloudflare Pages backends, but the Cloudflare Pages app itself cannot launch this Docker sandbox. Ordinary in-product full-stack builds correctly remain `blocked` rather than claiming backend runtime tests passed until a dedicated remote sandbox service is deployed and connected.
- [x] Add a no-egress CI fixture that boots generated Cloudflare Pages Functions, applies a fresh D1 migration, and verifies synthetic authentication, API validation, CRUD persistence and tenant isolation.
- [x] Add fail-closed tests for missing backend plans, unsafe mutation declarations, sensitive request data, unsupported dependencies/bindings and unavailable network isolation.
- [ ] Add CI fixtures for supported KV/R2 data flows, concurrent backend mutations, role escalation, CSRF and unsupported framework adapters.
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

## Remaining backend-runtime adapter contract

The first adapter now targets Cloudflare Pages Functions with disposable D1 plus local KV/R2 bindings. It runs only inside a Docker container with outbound networking disabled (`--network none`); Cloudflare explicitly warns that local Wrangler/Miniflare execution is not a hardened sandbox for untrusted code. The adapter refuses to start without the no-egress marker, strips environment files and credentials, rejects secret-shaped source and unpinned third-party package imports, overrides D1 IDs with fresh local IDs, and runs only synthetic `/api/` checks. Other deployment targets and unsupported Cloudflare bindings remain blocked.

1. Copy only the generated project artifact into a temporary workspace. Exclude `.git`, `.env*`, `node_modules`, build caches and any owner credentials.
2. Start Wrangler Pages in local-only mode with a new disposable D1 database and local R2/KV bindings only when the generated project declares supported bindings.
3. Apply the generated migrations to the empty database. Migration failure is a blocker; never fall back to an existing database.
4. Read a bounded `backendChecks` section from `ovyx-qa-plan.json`. Use synthetic payloads and only the local runtime origin. Support response assertions, captured IDs, follow-up reads, ownership checks and read-only SQL assertions. Mutating API calls are allowed only against the disposable local database.
5. Authentication tests require an explicit test adapter with per-run synthetic identities and a random test-only secret. Do not bypass production auth, reuse Firebase credentials, or assume that a mocked token proves a real OAuth/Firebase provider integration.
6. Block or report as blocked any workflow requiring unavailable bindings, provider credentials, external delivery, production services or an unsupported framework adapter. Run the local worker with a sanitized environment and no production secrets; add outbound-network denial before accepting arbitrary generated code for runtime execution.
7. After tests, destroy the temporary database and workspace. Keep only sanitized test results, route/status evidence and redacted failure messages.
8. Feed eligible failures into the bounded repair coordinator, then rebuild the disposable runtime and rerun the same backend/browser journey suite. Reject any candidate that introduces a new failure or reduces coverage.

Only after this adapter is integrated into the Web Studio build/project-revision lifecycle can the backend channel move from blocked to passed. Next.js, Vite/Node servers and other targets must remain explicitly unsupported/blocked until their own isolated runtime adapters exist.

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
