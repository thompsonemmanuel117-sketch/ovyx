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

### Important current boundary

This is an architecture and code-generation contract. It does **not** provision a database, create provider credentials, run migrations, prove endpoint behavior or certify generated applications. The route/model/provider records are plans until generated source is inspected and the actual tests pass.

## Engineering roadmap

### A. Close the architecture-to-source gap
- Add route-to-file and schema-to-model evidence for supported framework layouts: Cloudflare Pages Functions, Next.js App Router/Pages Router, Vite/Node, Remix, SvelteKit, Nuxt and other supported frameworks.
- Check that every requested API contract has a matching implementation or an explicit server-action equivalent.
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
