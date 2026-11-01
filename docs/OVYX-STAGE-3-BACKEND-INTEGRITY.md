# OVYX Stage 3 — Complete backend generation

## Objective

Generate complete, connected application backends for OVYX-created websites. The generated frontend, API routes, server services, database schema, migrations, identity, authorization, external adapters, workflows and tests must implement one coherent project architecture.

## Existing foundation retained

The existing Unified Website Engine already provides requirement-to-architecture planning, API contracts, data models, relationships, constraints, indexes, state machines, integration boundaries, backend source generation, and source-evidence auditing. Existing Firebase identity, Firestore persistence, server-side authorization, D1 migration checks, storage rules, payment processing and webhook safety remain platform foundations. Stage 3 extends these systems; it does not create a competing generation path or change App Studio.

## Stage 3 integrity gates added

- A generated POST, PUT or PATCH route with declared model dependencies must contain detectable server-side request validation evidence.
- A generated route with declared model dependencies must contain provider-backed database read evidence for GET or database write evidence for mutating methods.
- The backend generation prompt explicitly requires real repository/service persistence operations and prohibits hard-coded arrays, in-memory maps, TODOs, mock repositories and success-shaped fake persistence.
- The source audit reports route-level request-validation and persistence evidence counts.
- Local relative imports are followed, with bounded depth, file count and total source size, so a route may delegate database work to a local server-only repository/service module.
- Existing source-evidence statuses remain explicit: passing static evidence does not prove runtime behavior or database persistence.

## Complete backend capability target

1. Database provisioning, versioned migrations, relations, indexes, CRUD repositories, transactions, backups and recovery.
2. Framework-native API handlers, request/response schemas, pagination, search, filtering and safe error contracts.
3. Provider-backed identity, registration, login, recovery, secure sessions, role/permission checks and tenant isolation.
4. Private object storage, signed upload/download, quotas, content verification, quarantine, scanning and publication controls.
5. Versioned forms, consent, validation, persisted submissions, administration and abuse protection.
6. Commerce, inventory, server-calculated orders, payment adapters, signed webhooks, idempotency and reconciliation.
7. Timezone-aware booking, transactional availability checks, conflict prevention, holds, cancellation and rescheduling.
8. Transactional outboxes, background jobs, notifications, bounded retries, dead-letter handling and webhook delivery tracking.
9. Provider-neutral integration adapters, server-only secrets, environment templates, API documentation and setup guides.
10. Isolated execution, database-backed integration tests, browser-to-API journeys, security tests, observability and deployment readiness.

## Verification levels

- `planned-not-provisioned`: architecture exists, but no database or provider resource is provisioned.
- `source-evidence-present-runtime-unverified`: required source patterns are present; runtime behavior and persistence remain unverified.
- `runtime-verified-local`: generated application has run in an isolated test environment and database-backed tests passed.
- `provider-sandbox-verified`: the configured provider's sandbox accepted and reconciled controlled test events.
- `production-verified`: approved production smoke checks and operational monitoring confirm the deployed path.

Never promote one level to another based only on source files, mocks, saved connection metadata or a successful deployment.

## Safety boundaries

Generated project code must not execute inside the OVYX production request process. Runtime verification must use an isolated disposable environment with bounded CPU, memory, time, filesystem and network access, no inherited OVYX secrets, and disposable test data. Production database migrations, real payments, external emails and customer-impacting actions require explicit owner approval.

## Current Stage 3 status

The first integrity-gate implementation is under review in PR #370. Runtime execution and provider sandbox verification are subsequent Stage 3 work; they are not claimed as completed by this source-level change.
