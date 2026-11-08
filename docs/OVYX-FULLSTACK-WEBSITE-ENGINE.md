# OVYX Full-Stack Website Engine

**Program:** OVYX Maximum Website Engine — Phase 2 and onward  
**Phase 1 merge:** PR #359, merge commit \`ed990654cea6b5b75291aec94c9de5050839237e\`  
**Phase 2 branch:** \`feat/ovyx-fullstack-website-engine-phase-2\`  
**Status:** First cross-layer architecture contract implemented in the shared Web Studio planner. This is a foundation, not a claim that all generated backend services already work.

## Product target

OVYX must generate coherent web applications, not just frontend pages and disconnected demo interactions. A full-stack build is one product whose frontend, server routes, data model, identity and authorization rules, provider adapters, background work, tests and deployment configuration share explicit contracts.

The six product layers are:

1. **Frontend:** routes, responsive pages, shared components, forms, dashboards, accessible interaction state and typed API clients.
2. **Backend:** server endpoints, domain services, validation, business rules, authorization, concurrency and background jobs.
3. **Database:** domain schemas, relations, constraints, indexes, migrations, seed/test fixtures, data ownership and recovery.
4. **Security:** authentication, role and object-level permissions, secret isolation, input/output safety, abuse protection, audit and privacy.
5. **Integrations:** payment, email, booking, storage and other external services behind server-side adapters with explicit health and delivery evidence.
6. **Verification:** unit/contract/integration/browser/security/performance/deployment tests generated from the user's requirements.

These layers must be connected by a project-wide architecture/dependency graph. A page must know which API contracts it consumes; an API must know which schema, authorization rule and provider adapter it uses; and a generated test must verify the complete path and resulting state.

## Protected platform invariants

- Website-generation inference remains on the existing Cloudflare Workers AI route. Preserve authentication, entitlements, budget ledger, quota reservation/finalization/refund and failure behavior. Do not introduce a competing model-provider path.
- App Studio remains a separate product and generation pipeline. This program does not authorize App Studio redesign, schema migration or feature changes.
- Preserve Firebase identity, Firestore project ownership, existing saved project data, storage rules, chat history and project revisions.
- Never expose secrets in prompts, generated client bundles, browser storage, URLs, screenshots, logs or exported source.
- Never silently convert a disconnected integration into a fake success flow. UI-only, configured, reachable, delivery-verified and production-ready are distinct states.
- Never perform a real payment, send an external enquiry or email, or run a destructive migration as an incidental CI side effect.
- All changes remain reviewable and recoverable. Existing-site edits must preserve unrelated files and use the project's approval/rollback boundary.

## Phase 2 implementation already added

### Deterministic cross-layer architecture compiler

The shared engine in \`functions/_lib/website-engine.js\` now calls \`functions/_lib/fullstack-architecture.js\` for every Web Studio planning request. Both the authenticated Assistant and Gateway already consume the shared Website Engine instructions, so the new architecture contract follows the existing path without creating another AI route.

The planner currently creates:

- Capability flags derived from the complete original brief (frontend, backend, database, identity, authorization, commerce, payments, contact, email, booking, storage, administration, search and background work).
- Per-page nodes and reusable frontend component contracts.
- API route contracts with method, path, authorization policy, strict server validation, safe error envelope, idempotency and rate-limit expectations.
- Domain-model candidates with field lists and data sensitivity classifications.
- Provider-neutral integration contracts that distinguish saved connection metadata from live delivery/transaction verification.
- Security controls for secret isolation, deny-by-default authorization, object ownership, payment/booking integrity, upload isolation, audit redaction and recovery.
- Migration safety rules: additive/backward-compatible by default; destructive changes require explicit approval, restore point, dry-run and rollback plan.
- Background outbox/queue requirements with idempotency, bounded retries, dead-letter visibility and auditable manual replay.
- Cross-layer contracts for typed API boundaries, data consistency, transactions, privacy, observability, environment isolation and rollback.
- Requirement-to-architecture traceability plus graph integrity checks for missing nodes, duplicate IDs, disconnected nodes and API references to nonexistent data models.
- A test plan that separates planned checks from executed evidence. Payment/email sandbox tests require explicit owner approval.

The full contract is bounded before being sent to the model. The original brief remains authoritative, and all 180 accepted requirement IDs must survive serialization. The client response exposes summary counts only; it does not expose server credentials or raw connection secrets.

### Domain integrity and business-state contracts added

The Phase 2 planner now also defines relational integrity instead of listing isolated tables:

- Relationships connect role grants to accounts, bookings to reservable resources, cart items to carts/products, order lines to orders/products, payment attempts to orders, private assets to owners, audit events to verified actors, and email delivery records to their source submissions/subscriptions where applicable.
- Constraints specify server-calculated integer minor-unit money, ISO currency, immutable purchase snapshots, unique/idempotent provider events, legal state transitions, booking-overlap protection, and consent/unsubscribe requirements.
- Index contracts describe high-value lookup paths such as account identity, owner order history, booking availability, provider payment references, delivery queues, subscription email/list pairs and asset storage keys.
- The dependency graph now includes explicit data-relation edges and rejects missing relationship endpoints as well as missing API model references.
- Explicit state machines cover orders, payment attempts, bookings, contact delivery, newsletter consent, and private asset ingestion. Transitions carry an authority condition and side-effect/audit expectation; they are contracts, not a substitute for implementation.
- The generated verification plan includes business-state transition tests. The full-stack evaluator and website-engine regression tests now assert that relational and state-machine contracts survive into the bounded model-facing architecture payload.

The full-stack planner distinguishes a newsletter from a contact form, a product catalogue from a payment-enabled checkout, and a payment-only billable action from a commerce order. These boundaries are regression-tested to reduce accidental over-generation.

The shared Website Engine now appends explicit implementation rules after the bounded architecture JSON. It tells the model not to return a frontend-only result when backend capability is requested, to create matching method-specific server route handlers, connect frontend consumers to those exact routes, produce the declared schema/relations/indexes, enforce server-authoritative state transitions and generate relevant tests. It also keeps the original brief authoritative and prohibits simulated provider success.

### Generated source contract audit

`scripts/ovyx-fullstack-source-contracts.mjs` is now used by the Web Studio artifact evaluator when a trusted architecture manifest is included in `run-metadata.json`. It checks bounded source evidence for:
- framework-specific route file and HTTP method declarations across Cloudflare Pages Functions, Next.js, SvelteKit, Remix, Nuxt and Node server layouts,
- authenticated identity, role/permission checks, object/tenant ownership scope, credential-provider verification and signed unsubscribe/webhook verification,
- public-route rate limits, consent evidence, upload quarantine and published-asset resolution policies,
- declared data-model/schema evidence, versioned SQL migration or explicit Firestore schema artifacts,
- relationship endpoints and foreign-key/reference declarations,
- SQL/Prisma/Drizzle/Firestore index declarations and unique-value enforcement evidence,
- every declared business state machine, its states and transition implementation evidence,
- generated backend regression tests covering authorization, idempotency and workflow transitions.

The report separates missing route/method/auth/schema/migration/relationship/index/workflow/test evidence from evidence that is merely present in source. Even when all source evidence exists, it explicitly keeps runtime behavior, database persistence, integration delivery and deployment unverified. It leaves query performance and live integrity unverified, and does not claim that a generated migration has been applied. Login/session authentication is modeled separately from role/permission authorization; public upload flows without accounts are explicitly quarantined and only published assets may be publicly resolved. Architecture metadata is accepted only when it has the expected engine identifier, stays within a bounded size and passes secret-pattern screening; it is not copied into the public client response.


### Full-stack source-generation stage added

The shared `runWebsiteGeneration` lifecycle now performs a separate backend-source generation pass after a full-stack website build when the trusted architecture marks backend capability as requested. Both the authenticated Assistant and Gateway pass the server-derived architecture object into this stage; client-provided architecture is not used as the authority.

The backend pass asks the existing guarded model route to return complete source files for the declared API contracts, domain models, database schema/migrations, relationships, constraints, indexes, authorization boundaries, workflow services and safe tests. It preserves detected project paths/frameworks and uses Cloudflare Pages Functions with D1-compatible migrations only as the no-existing-framework target. It does not introduce a new AI provider route.

Returned files are constrained to backend/server/schema/migration/test locations, bounded in size, and filtered against traversal and secret-bearing paths. A bounded source audit checks each planned API route's handler file and method, identity/role/owner scope, public abuse and consent controls, signature/replay protection, model schema, versioned migration, relationship/index declarations, state-machine evidence and safe generated tests. One targeted repair generation is attempted when source evidence is incomplete. A single-page HTML result is packaged as `index.html` alongside generated backend files so the API source is not lost on the non-multi-page path. If the second pass still misses required contracts, the full-stack build fails rather than silently presenting a frontend-only site as complete.

The repository test suite now includes a local Wrangler D1 migration smoke test that applies a versioned SQL migration and checks table creation, foreign-key integrity, idempotency uniqueness and invalid-state rejection. This validates the local D1 migration path; it does not provision or migrate a user's remote database.

Successful output is explicitly labelled `source-generated-runtime-unverified`. This is real generated source, not database provisioning: the pass does not create Cloudflare D1 resources, configure bindings or credentials, run migrations, prove database persistence, establish external provider delivery, or certify a production deployment. Those remain separate release and acceptance gates.


This is an architecture and code-generation contract. It does **not** provision a database, create provider credentials, run migrations, prove endpoint behavior or certify generated applications. The route/model/provider records are plans until generated source is inspected and the actual tests pass.

## Engineering roadmap

### A. Close the architecture-to-source gap
- [x] Add first-pass route-to-file, HTTP-method, schema, migration, relationship, index, workflow and test evidence for Cloudflare Pages Functions, Next.js App Router/Pages Router, SvelteKit, Remix, Nuxt and Node server layouts.
- [ ] Strengthen exact requirement-to-handler traceability and verify every frontend consumer uses the exact API contract or an explicit server-action equivalent.
- Check that UI calls the exact route contract and that API request/response shapes agree with the shared domain schema.
- Keep unresolved or unassessable requirements visible. Do not let a generic page reference count as proof of a backend feature.

### B. Domain data engine
- Derive entities, relations, required/optional fields, unique constraints, indexes and ownership from the user brief.
- Generate versioned migrations and safe rollback scripts for supported databases.
- Support additive expand/migrate/contract changes; detect breaking schema changes before editing files.
- Generate CRUD repositories/services, query pagination, validation and transaction boundaries from one schema source.
- Use server-side integer minor-unit money plus an explicit ISO currency; store time in UTC with IANA timezone context.
- Generate fixture and seed data only when clearly marked as test/demo data. Never invent production customer, inventory, price or availability records.

### C. Identity and permissions engine
- Keep identity verification distinct from authorization.
- Generate protected route middleware, role policies, tenant/resource ownership checks and permission tests.
- Prevent client-supplied user IDs, role names, ownership fields or hidden UI controls from granting access.
- Verify sign-up/sign-in/session expiry/logout/recovery against the selected identity service.
- Include cross-tenant negative tests for every protected data boundary.

### D. Business workflow and integration engine
- Generate explicit state machines for orders, payments, bookings, subscriptions, enquiries and delivery.
- Use server-side provider adapters, signature validation, idempotency, replay protection, bounded retries and reconciliation.
- For payment: calculate amount/currency on the server, verify provider references and webhook signatures, and only fulfill after authoritative confirmation.
- For booking: query authoritative availability and re-check at commit time to prevent double booking.
- For email: persist an outbox event and reconcile an actual provider receipt; HTTP 200 alone is not delivery proof.
- For uploads: authorize ownership, sniff content, enforce size/quota, randomize object keys and keep private files private.
- Expose connection setup, reachability, last successful check and live delivery as separate dashboard states.

### E. Verification compiler
- Convert every requirement ID into executable test intent where technically possible.
- Generate unit, schema, API contract, integration, browser journey, authorization-negative, concurrency, failure-recovery and deployment smoke tests.
- Run test journeys through the actual frontend, server, database and provider sandbox; assert persistent outcome, not just button clicks or response text.
- Mark third-party tests blocked/skipped when credentials or explicit approval are missing; never silently replace them with mocks and report success.
- Measure real Core Web Vitals and record browser/device/network conditions separately from static source scores.
- Expand browser coverage, visual regression baselines and supported Firefox/WebKit checks.

### F. Build, packaging and deployment
- Produce a reproducible complete project with server/runtime config, migrations, lockfile, environment-variable template, tests, setup guide and API/schema documentation.
- Install dependencies and run the actual framework production build in an isolated environment.
- Detect unsupported runtime bindings and secrets before deployment.
- Separate development, preview and production resources, domains, credentials and callback URLs.
- Deploy preview first; run route and user-journey smoke tests; then allow an owner-authorized production release.
- Keep the last known-good build and test rollback of code and data independently.

### G. Self-healing and long-term project intelligence
- Compare architecture graph before and after every edit; show impacted pages, routes, schemas, providers and tests before applying broad changes.
- Prefer targeted repairs and regenerate only affected files while preserving unrelated work.
- Re-run all impacted contract and browser tests after repair.
- Add build traces with stage timing, model/runtime identifiers, file changes, test results, retries and repair summaries while redacting prompts and private data.
- Provide a developer handover pack: architecture map, API reference, ER diagram, migrations, environment setup, integration checklist, test instructions and known limitations.

## Additional differentiators worth building

1. **Requirement-to-runtime traceability:** every brief requirement maps to source files, API/schema contracts, browser steps and a final evidence record.
2. **Architecture impact simulator:** before an edit, show downstream pages/routes/models/integrations/tests that could change.
3. **Business workflow simulator:** replay order, booking, subscription and delivery state transitions locally with deterministic fixtures.
4. **Data-integrity sentinel:** detect orphan records, impossible state transitions, duplicate payment events, booking overlaps and broken foreign-key assumptions.
5. **Integration contract sandbox:** test provider payloads, signatures, retry scenarios and error mappings without creating real transactions.
6. **Tenant isolation tester:** generate adversarial cross-account and wrong-role requests automatically.
7. **Deployment drift detector:** compare expected bindings, environment variables, migrations and runtime config with the deployed revision without exposing their values.
8. **Visual-plus-functional acceptance:** keep design, accessibility, responsiveness, behavior, data, security and deployment scores separate so a beautiful but broken site cannot pass.
9. **Operational readiness pack:** health probes, log correlation, alert thresholds, retry/dead-letter queue visibility, backup/restore drills and rollback procedures.
10. **Project portability:** export a complete source project with no OVYX runtime dependency unless the user explicitly chooses an OVYX-managed service.

## Phase 2 acceptance checklist

Phase 2 must not be closed until all of the following are evidenced on the exact revision:

- [ ] Unified architecture compiler is wired into Assistant and Gateway only for Web Studio; App Studio remains unchanged.
- [ ] Requirement IDs and complete original brief survive bounded prompt serialization.
- [ ] Every full-stack API contract maps to implementation source or an explicit unresolved reason.
- [ ] The artifact evaluator reports missing route, method, authorization, schema and relationship source evidence against the exact architecture manifest, while keeping runtime verification separate.
- [ ] Every API contract maps to existing data models and server authorization policy.
- [ ] Frontend components call the matching backend contracts with typed request/response/error states.
- [ ] Database schemas, constraints, migrations and rollback behavior are validated in an isolated test database.
- [ ] Authentication and object-level permissions pass positive and negative tests.
- [ ] Payment, email, booking and storage use real sandbox/controlled-service evidence where requested.
- [ ] No real side effect runs without explicit owner approval.
- [ ] Requirement-derived browser journeys verify persisted outcomes at all target viewports.
- [ ] Security, dependency, accessibility and performance checks are independently recorded.
- [ ] Supported framework projects install, build, extract and smoke-test successfully.
- [ ] Preview deployment passes and the production handoff clearly lists any remaining owner configuration.
- [ ] Existing OVYX routes, quota controls, project data, App Studio and browser navigation regressions remain green.

**Release vocabulary:** architecture planned ≠ source implemented ≠ build passed ≠ browser tested ≠ integration delivered ≠ production ready. Reports must keep these states separate.


This is an architecture and code-generation contract. It does **not** provision a database, create provider credentials, run migrations, prove endpoint behavior or certify generated applications. The route/model/provider records are plans until generated source is inspected and the actual tests pass.


## Customer backend provisioning — Phase 1 safety foundation

The first customer-backend provisioning increment is implemented in `functions/_lib/backend-provisioning.js`. It creates a deterministic, owner-scoped provisioning manifest from the trusted full-stack architecture and generated backend source. It is deliberately a planning contract only: it does not call Cloudflare, create Worker or D1 resources, apply migrations, or access secret values.

The manifest currently enforces:

- A verified owner UID and saved project ID are required; the generated namespace is a one-way SHA-256-derived value, so raw owner and project identifiers are not emitted.
- Preview and production receive distinct deterministic Worker/database resource names.
- Backend API route contracts must be present and structurally valid.
- Source paths are restricted to backend source and versioned SQL migration locations; traversal, duplicate paths, oversized files and secret-like source values are rejected.
- Database-enabled architectures must include versioned SQL migrations. Migrations are limited to additive table/index/column operations; potentially destructive statements are blocked from automatic provisioning.
- Migration hashes and source paths are included for later idempotency and drift checks, but source contents and credentials are not included in the plan.
- The lifecycle gate list requires owner/project verification, idempotent operation reservation, resource verification, preview migration, server-only bindings, Worker deployment, API/database/isolation verification and explicit owner approval before production promotion.

The safety contract tests are run by the isolated backend-runtime workflow. This phase does **not** claim that customer Workers or D1 databases are provisioned or deployed. The next increment must implement the Cloudflare resource adapter and durable lifecycle registry, then exercise it against isolated preview resources before any production promotion is enabled.


## Customer backend provisioning — Phase 2 D1 resource adapter

The Phase 2 increment adds a server-only Cloudflare D1 adapter in `functions/_lib/backend-cloudflare-adapter.js`. It uses the Cloudflare account D1 REST API with a narrowly scoped API token supplied through the server environment. It never returns or logs the token.

The adapter:
- Accepts only deterministic OVYX resource names derived from the verified owner/project namespace and target environment.
- Reconciles by exact database name before creation, verifies the returned database ID/name with a separate GET, and handles the create race by re-reading the exact name.
- Applies versioned migrations through the D1 query API with a private `_ovyx_migrations` ledger, SHA-256 source-to-manifest verification, drift detection, and transactional D1 batch requests.
- Allows only additive `CREATE TABLE`, `CREATE INDEX`, and `ALTER TABLE ADD COLUMN` statements; rejects DML, destructive DDL, triggers, PRAGMA changes, and use of the reserved ledger table.
- Treats a matching already-applied migration as idempotent and refuses a changed checksum for an applied version.

The adapter is not yet wired to a customer-facing route and has not been run against the live Cloudflare account. It creates/verifies D1 resources only: it does not upload or deploy Worker code, bind a D1 database to a Worker, provision R2/KV/Queues/Durable Objects, create customer domains, or promote production. No live customer resources are created by CI. Before enabling the adapter, the next increment must add a durable provisioning-operation registry with crash recovery, a project-owner authorization boundary, an audited preview-only execution route, and an end-to-end isolated Cloudflare acceptance test. Worker upload must use the documented module multipart API and must be independently verified before any publishing path is changed.

Cloudflare API references:
- D1 create/list/get/query: https://developers.cloudflare.com/api/resources/d1/
- D1 query and migration/batch behavior: https://developers.cloudflare.com/d1/worker-api/d1-database/
- Worker secret bindings: https://developers.cloudflare.com/workers/configuration/secrets/
- Worker module upload and D1 binding metadata: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/

## Deployment ownership boundary — preview foundation

The existing Pages publishing endpoint now loads the saved project from its canonical Firestore path, `users/{authenticated-email}/projects/{projectId}`, using the server-side Firebase Admin REST layer. Before it creates or uploads a Pages deployment, it requires the stored `ownerUid` and normalized `ownerEmail` to match the verified Firebase identity. The request's project ID is validated against the existing project-store format; client-supplied owner fields are not accepted as evidence. Missing records and cross-account attempts fail closed before any Cloudflare deployment request. This closes the authorization gap between the existing project-management API and the publishing endpoint; it does not yet provision a backend or change the static publishing format.

## Durable provisioning operation registry — preview safety foundation

The next increment adds a server-side Firestore registry for provisioning operations. A record is keyed by the deterministic owner/project namespace and environment, and stores only one-way owner/project hashes, resource names and IDs, operation ID, state, attempt count, lease timestamps, applied migration versions, deployment ID and sanitized error codes. It never stores raw owner UID, raw project ID, credentials, API tokens or secret values.

The Firestore adapter uses an `exists=false` precondition for first reservation and an `updateTime` precondition for compare-and-set updates. This prevents two concurrent requests from both claiming the same operation and prevents stale workers from overwriting newer state. The lifecycle has explicit states from `reserved` through `verifying` to `ready`, plus `failed` and `recovery_required`. An expired in-flight lease is deliberately marked for recovery rather than blindly rerunning resource creation or deployment, because an external side effect may have succeeded before the worker crashed. Failed or rolled-back operations can be retried with a new operation ID after reconciliation.

The registry is now used by the authenticated customer provisioning and status routes. It remains the source of truth for one operation per owner/project/environment. The state machine uses compare-and-set writes and expired in-flight leases move to `recovery_required` rather than repeating uncertain external side effects.

## Customer full-stack Preview and Production provisioning

The customer workflow is connected through `/api/backend/provision` and `/api/backend/status`, and is exposed in the Web Studio Publishing panel when a saved project contains the generated architecture and backend QA manifests.

### Preview flow

1. The route authenticates the Firebase user, loads the canonical saved project from Firestore and verifies its stored owner UID/email. Client-supplied owner fields are never trusted.
2. The saved architecture, backend source files, migrations and executable `ovyx-qa-plan.json` are validated. Automatic provisioning currently accepts Cloudflare Pages Functions with Cloudflare D1. Unsupported frameworks and a selected non-D1 database provider fail closed.
3. The backend QA plan runs in a fresh isolated Sandbox with local D1. Provisioning does not create customer resources unless this acceptance suite passes.
4. Wrangler compiles the Pages Functions in the isolated Sandbox. The package-registry egress allowlist is removed before the build; the returned Worker bundle and routes manifest are size-bounded.
5. OVYX reserves the owner/project/Preview operation in Firestore, reconciles or creates the deterministic D1 database, applies only validated additive versioned migrations, and records the applied versions.
6. The Pages project is resolved from the deterministic owner/project namespace. The D1 binding is added to Preview only; existing settings and unrelated bindings are preserved, conflicting bindings are rejected, and a fresh GET verifies the result.
7. Static website assets, `_worker.bundle` and `_routes.json` are direct-uploaded as a Pages Preview deployment. The internal architecture/QA/Wrangler manifests are excluded from public assets.
8. The operation remains `verifying` until the status route confirms Cloudflare's deployment stage, performs an HTTP smoke test against the Preview URL and re-verifies the D1 migration ledger. Only then is it marked `ready`.

### Production flow

Production is a separate explicit owner action in the Publishing panel. It is blocked unless that project's Preview operation is already `ready`. Production receives its own deterministic D1 database and migrations, and the adapter patches only `deployment_configs.production`. The Production deployment uses the configured production branch; Preview settings and database remain unchanged. The status route independently verifies the Production deployment before it is marked ready.

### Safety and current supported boundary

- Static-only sites continue through the existing static publishing route.
- Automatic backend provisioning supports Cloudflare Pages Functions + D1. It does not silently convert Next.js, SvelteKit, Remix, Firestore, Supabase or another provider to D1.
- The source generator must persist a valid architecture manifest, a Wrangler config and a disposable backend acceptance plan. Missing manifests or failing acceptance tests block provisioning.
- D1 migrations are additive-only and checksum-verified. Code rollback does not automatically reverse database migrations; schema rollback needs a separate owner-approved migration/restore plan.
- Firestore registry records contain hashes and resource IDs, not raw UID/project IDs, API tokens or secret values.
- Production promotion requires a separate explicit confirmation and a verified Preview; the Preview route itself never changes Production.
- External payment, email, identity-provider, object-storage and other third-party secrets/adapters are not provisioned by this D1 path. Those capabilities remain pending until their own secure adapters and live verification are implemented.
- The isolated Pages build and runtime QA are tested in CI, including a no-egress Wrangler bundle build. Live customer provisioning still requires the runtime Worker and Pages Service binding/secret to be deployed and configured as described in `OVYX-BACKEND-RUNTIME-SETUP.md`.
