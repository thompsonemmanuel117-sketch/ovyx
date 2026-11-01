# OVYX Phase 4 — Full-stack capabilities

## Audit baseline

Phase 4 began from existing production code, not a blank backend. The repository already contains Cloudflare Pages API routing, Firebase ID-token verification, Firebase Admin/Firestore persistence, server-authoritative RBAC and entitlements, server-side pricing, OPay NGN checkout, Paystack USD checkout, payment status/history/verification and signed webhook processing. It also includes encrypted universal connections, GitHub OAuth/repository access and a global production-integration pause control.

The generated-website engine already has a deterministic full-stack architecture planner. It produces API contracts, data models, relationships, constraints, indexes, integration boundaries, security controls, state machines, requirement mappings and acceptance-test plans for capabilities inferred from the original brief.

## Phase 4 improvements in this change set

- Harden OPay and Paystack webhook signature comparisons with constant-time comparison.
- Preserve fulfilled OPay order state on duplicate webhook delivery; avoid duplicate work while a recent processing claim is active and allow recovery after a bounded stale-claim window.
- Ensure Paystack already-fulfilled orders return before creating a new event idempotency claim.
- Extend the generated-site architecture planner with schema-driven forms: versioned form definitions, validated submissions, consent evidence, idempotency, abuse controls, retention rules, indexes, API contracts, state machine and acceptance test.
- Wire payment and full-stack architecture regression tests into the browser-quality workflow.
- Strengthen the unified Website Engine so inferred backend capabilities (database, authentication, booking, forms, file storage, commerce, email and payments) remain consistent across integration planning and user-facing capability summaries.
- Add explicit backend-generation requirements for private owner-scoped asset storage, signed URLs, MIME/content and quota checks, server-owned form schemas, IANA-timezone booking with transactional conflict prevention, provider-backed sessions/CSRF protection, payment reconciliation and transactional notification outboxes.
- Add generated-site regression coverage for storage-provider detection, inferred database requirements and the secure backend-generation contract; run `scripts/ovyx-website-engine.test.mjs` in the browser-quality workflow.
- Strengthen booking contracts with scoped idempotency keys, expiring holds, conflict-safe rescheduling, customer/staff booking listing, cancellation replay safety, and bounded indexes for active holds and overlap checks.
- Strengthen asset contracts with quarantine/scan/publication states, verified content signatures/checksums, owner-scoped asset listing, idempotent deletion and indexes for owner pagination and quarantine cleanup.
- Add regression assertions for booking and asset lifecycle state machines, integrity constraints, indexes and API routes.
- Keep generated backend evidence explicitly `source-evidence-present-runtime-unverified` until the generated app is actually executed against its selected database and external providers.

## Capability map

| Area | Existing foundation | Phase 4 quality boundary |
|---|---|---|
| APIs | Cloudflare Pages Functions, shared request/response helpers, origin checks and middleware | Generated API contracts must map to real handlers and callers; validate inputs and authorization server-side |
| Database | Firebase/Firestore REST and Admin adapters, optimistic concurrency and server-side records | Explicit models, relationships, indexes, migration plan, ownership and transaction/concurrency rules |
| Authentication | Firebase ID-token verification and authenticated API middleware | Derive identity from verified sessions; never trust browser-supplied roles or owner IDs |
| Authorization | Server-side RBAC, plan entitlements, root-owner protection and object ownership checks | Deny by default and test anonymous, wrong-role and cross-owner access |
| Assets | Existing image-generation/optimization and project asset handling; generated architecture includes secure upload contracts | Private object storage, signed upload/download, MIME/size/quota checks, quarantine and publication policy are required when user uploads are requested |
| Payments | Server-authoritative price lookup, OPay/Paystack initialization, verification, webhook reconciliation and payment history | Idempotent state transitions, exact amount/currency/reference match, sandbox tests and no browser-authoritative success |
| Forms | Contact submissions and newsletter lifecycle contracts | Generic forms have versioned server schemas, field allowlists, consent, abuse protection and submission state |
| Booking | Generated architecture contracts for availability, bookings, cancellation and conflict prevention | Availability must be rechecked at commit; use transactional uniqueness/provider locks and timezone-aware UTC storage |
| External integrations | Encrypted universal connections, GitHub OAuth and global integration switch | Server-only credentials, adapter boundaries, bounded retries, verified receipts and explicit live-connection evidence |

## Evidence rules

- `planned-not-provisioned` means the architecture is described, not that a database, API, provider account or cloud resource has been created.
- A saved connection or configured secret is not proof that an external provider is reachable.
- A provider acceptance response is not proof of end-user delivery; use provider receipts and reconciliation.
- Payment and booking success must come from authoritative server/provider state.
- Production transactions, destructive migrations and account-impacting actions require explicit owner approval.
- CI can validate source contracts and isolated test fixtures. Live payment, booking, email, OAuth and production storage checks require the correct sandbox credentials and approved test actions.

## Release acceptance

1. Run the repository unit/static suite and generated-site architecture tests.
2. Run browser quality and cross-browser responsive checks.
3. Run provider sandbox tests only with explicit owner approval and isolated sandbox credentials.
4. Confirm deployment bindings without exposing secret values.
5. Perform a production health smoke test and verify rollback readiness before enabling live workflows.
