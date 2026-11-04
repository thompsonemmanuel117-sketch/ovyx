# OVYX Stage 9 — Security, Reliability & Real Integration Gates

**Status:** Implementation in progress on `feat/stage-9-security-live-integration-gates`.  
**Scope:** Websites and full-stack applications generated and managed by OVYX. This does not redesign OVYX Admin, App Studio or the platform dashboard.

## Product guarantee

A generated backend must be honest about what is actually connected. Source code, a saved connection row, a successful static check, a local migration, a UI animation or a mocked API response is not proof of a live service.

Every requested capability must be classified as one of:

- **Connect required:** no matching saved connection metadata exists. Ask the site owner to connect a provider or select a recommended option.
- **Configured, unverified:** connection metadata exists, but no live provider-specific test has proved reachability and the resulting workflow.
- **Internal database-backed option:** a real first-party workflow can operate without an external vendor, but still requires a provisioned database and runtime verification.
- **Live verified:** reserved for a provider-specific successful check plus the relevant persisted business-state or delivery evidence. This state must never be inferred from connection metadata.

Production gates remain closed until their required evidence exists. Never display a fake payment success, sent email, confirmed booking, saved record, authenticated session or completed external action.

## Provider handoff recommendations

| Capability | Suggested starting points | Required owner action |
|---|---|---|
| Payments | Paystack or OPay for eligible Nigerian NGN businesses; Stripe where the business/country is supported | Configure server-side keys, verify webhook signatures/replay protection, complete sandbox checkout and reconcile the resulting order |
| Transactional email | Resend, Postmark, Mailgun | Connect credentials, verify sending domain, send a real test message and confirm delivery evidence |
| Customer identity | Firebase Authentication, Supabase Auth, or application-managed sessions | Choose the customer identity system; OVYX workspace login is not automatically the generated site's customer identity |
| Database | Cloudflare D1, Firebase Firestore, Supabase Postgres | Provision/select the actual project database, configure server-side bindings and apply reviewed migrations |
| Booking | Built-in database-backed booking; Cal.com/Google Calendar only for requested external sync | Verify persistent booking writes and transactional conflict prevention; connect external calendar only when needed |
| File storage | Cloudflare R2, Firebase Storage, Amazon S3 | Provision bucket, configure private access and test signed upload/download and ownership isolation |
| Subscriptions | Paystack, Stripe, Paddle (subject to country/provider eligibility) | Verify recurring billing, signed webhooks and sandbox lifecycle before granting entitlements |
| Notifications | Resend/Postmark for email; Twilio/Africa's Talking for SMS | Connect the selected channel and verify delivery to an owner-controlled recipient |
| Background work | Cloudflare Queues, Workflows, Cron Triggers | Configure bindings and verify synthetic job, bounded retry and dead-letter handling |

Provider suggestions are guidance, not claims that an account exists, a provider is available in every country, or a key has been provisioned.

## Security and reliability controls

- Keep credentials in server-side bindings or encrypted server-side connection storage; never in browser bundles, URLs, screenshots, logs or exported client code.
- Preserve Firebase identity and ownership checks, deny-by-default authorization, object/tenant isolation, server-authoritative money and workflow state, idempotency, webhook signature/replay checks and audit redaction.
- Reject generated backend source containing known credential formats or unsafe dynamic execution primitives before it is accepted.
- Enforce bounded request sizes, timeouts, retries, resource budgets and safe error responses.
- Treat local runtime evidence as local-only. It does not provision a remote database or verify a production provider.
- Never run live charges, refunds, real customer emails, destructive migrations or external side effects as incidental CI.
- Keep the existing Cloudflare Workers AI-only inference boundary and existing provider environment values untouched.

## Acceptance evidence

A full-stack project may be described as production-ready only after all applicable checks are complete:

1. Framework-native backend routes and exact frontend-to-route contracts exist.
2. Server validation, authentication, authorization and tenant/object ownership checks pass positive and negative tests.
3. The actual project database is provisioned; migrations, constraints, relationships and persistence tests pass against the intended environment.
4. External provider credentials are connected server-side; provider-specific health checks and sandbox/live-safe workflow evidence pass.
5. Payment, booking, email, upload, subscription and notification states are reconciled from authoritative server/provider evidence.
6. Browser journeys, responsive behavior, accessibility, security and deployment smoke tests pass.
7. Unverified, unsupported or owner-action-required capabilities remain visible as blockers with clear setup instructions.

The generation planner may generate complete backend source while a deployment binding is not yet provisioned. It must label that state accurately and guide the owner to connect the required service rather than fabricating a working integration.
