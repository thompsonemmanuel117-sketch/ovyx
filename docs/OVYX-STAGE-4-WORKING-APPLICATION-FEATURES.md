# OVYX Stage 4 — Working application features

## Objective

Generated applications must implement connected business workflows, not merely render attractive feature screens. Stage 4 extends the shared Web Studio full-stack architecture compiler and backend-generation instructions. It does not create a second generation pipeline or change the OVYX platform's own subscription/payment system.

## Existing foundation retained

The Stage 3 engine already planned products, carts, orders, payments, bookings, forms, accounts, permissions, storage and delivery records. It also had order/payment/booking state machines, provider-neutral adapters, payment webhook safety requirements, outbox requirements and isolated local runtime tests. Existing provider integrations, Firebase identity, App Studio, admin controls, quota handling and deployment configuration remain protected.

Stage 4 adds explicit contracts for the following application-level capabilities:

1. **Commerce:** persistent cart read/add/update/remove; server-calculated quotes; inventory movement ledger; atomic stock reservations/releases; checkout; immutable order snapshots; customer order history; staff order/product/inventory management; promotion validation and usage limits; shipment tracking; payment refunds and reconciliation.
2. **Recurring subscriptions:** server-owned plan catalog; provider checkout; customer subscription and invoice records; renewals; payment failure and grace-period policy; cancellation/resume; server-enforced entitlements.
3. **Notifications:** owner-scoped in-app notification records; read/read-all actions; transactional outbox linkage; separate queued, provider-accepted, delivered, failed and read states.
4. **Dashboards:** tenant-scoped KPI summary and activity APIs; admin aggregate metrics; bounded date filters, explicit timezone, pagination and role-aware data access.
5. **Fulfillment and refunds:** server-owned promotion rules, usage limits, immutable shipment records, carrier tracking events, partial/full refund caps and provider-confirmed refund reconciliation.
6. **Integrations:** provider event ledger; server-only credential boundary; provider health and OAuth/setup/disconnect contracts for admin-managed connections; signature/timestamp/replay-protected inbound webhooks.
7. **Automation:** auditable workflow-run records; unique run keys; bounded retries, execution limits and dead-letter visibility; approval gates for financial or irreversible actions.

## Security and correctness rules

- All monetary values are integer minor units with an explicit ISO 4217 currency.
- Client-supplied price, tax, discounts, inventory, order status, payment status, subscription status, owner IDs and role claims are never authoritative.
- Inventory reservation/release is atomic, auditable and idempotent; available stock cannot become negative.
- Order fulfillment follows verified payment or an explicitly authorized offline/manual settlement policy.
- Paid subscription access changes only after authoritative provider reconciliation; a return URL is not payment proof.
- Cancellation-at-period-end and immediate cancellation are distinct; paid access ends at the authoritative period boundary or provider event.
- Notification reads and mutations are recipient-scoped. Queue acceptance is not proof of external delivery.
- Dashboard queries are tenant-scoped and role-aware; production metrics are never hard-coded or fabricated.
- Integration credentials remain server-only. Webhooks require provider-specific authenticity, timestamp/replay validation and deduplication.
- Background workflows use idempotency keys, bounded retries, timeouts, redacted logs and dead-letter visibility.
- Real external payments, subscription changes, email/push delivery and OAuth connections require configured credentials and explicit owner approval.

## Verification contracts

The architecture now plans feature-specific acceptance checks for:
- Persistent commerce/cart/order/inventory journeys.
- Subscription checkout, activation, renewal, failed payment, grace period, cancellation, resume, refund and entitlement reconciliation.
- Notification creation, owner-scoped read state and delivery-state correctness.
- Dashboard KPI correctness against persisted records, date/timezone behavior and tenant isolation.
- Integration authentication, webhook replay, timeout/rate-limit/retry handling and redacted health evidence.
- Automation idempotency, bounded retries and dead-letter recovery.

Every test contract begins as `planned-not-executed`. It is not runtime or provider evidence. The generated backend evaluator continues to distinguish source evidence from actual execution. The existing disposable Wrangler/D1/R2 runtime fixture does not certify every generated commerce, subscription or provider integration.

A new disposable Wrangler Pages/D1 reference-runtime acceptance test is included in the full repository test chain at `scripts/ovyx-stage4-business-runtime.test.mjs`. It exercises persistent cart totals, server-owned product pricing, checkout/order persistence, inventory oversell rejection, tenant isolation, fail-closed payment and subscription setup, signed webhook replay protection, subscription lifecycle reconciliation from signed events, notification ownership/read state, dashboard aggregates and automation idempotency. It is deliberately a reference implementation fixture: it validates the business API and persistence invariants under local D1, but it does not claim that every AI-generated project has identical runtime behavior or that a live payment/email/OAuth provider was contacted. Those remain release gates for each real generated project when credentials and owner approval are available.

## Acceptance criteria

Stage 4 is not complete until the generated source for each requested capability passes:
- API/schema/migration and state-machine contract checks.
- Real local database-backed integration tests for cart, inventory, orders, subscriptions, notification ownership and dashboard data.
- Negative authorization and cross-tenant tests.
- Browser journeys from actual UI controls through API and persisted state.
- Provider sandbox verification for payment, recurring billing, email/push and requested third-party integrations, where credentials are configured and owner-approved.
- Failure/retry/replay/concurrency tests.
- Build and deployment smoke tests on the exact release candidate.

Missing provider credentials or owner approvals must be reported as blocked, never silently replaced with fake success.

## Scope protection

This is a generated-application capability upgrade. It does not redesign OVYX's own dashboard, billing UI, App Studio, Firebase login, admin workspace, AI provider routing, project quota controls or production customer records.
