# OVYX Full-Platform Audit — Stage 1

**Audit snapshot:** 2026-11-05  
**Repository:** `thompsonemmanuel117-sketch/ovyx`  
**Audited branch:** `main`  
**Audited commit:** `47a7cf3cbd2b5b21c4faa6b53f554220a6b652e2`  
**Audit mode:** read-only source and repository inventory  
**Product-code changes:** none  
**Protected scope:** the existing OVYX logo and the complete Web Studio experience are out of scope for this 12-stage programme.

## 1. Executive inventory

The recursive Git tree at the audited commit contains **486 tracked files** across the following top-level areas:

| Area | Responsibility |
|---|---|
| `index.html` | Main application shell, inline view markup, shared styles and browser runtime entry points |
| `assets/` | Modular browser-side feature runtimes and visual systems |
| `functions/api/` | Cloudflare Pages API handlers |
| `functions/_lib/` | Shared server-side services, auth, AI routing, quota, connection and generation logic |
| `scripts/` | Unit, contract, integration and Playwright browser tests |
| `.github/workflows/` | CI, browser verification, diagnostics and deployment workflows |
| `backend-runtime/` | Isolated generated-backend runtime support |
| `deployed-sites/` | Deployment/site support artifacts |
| `mobile-app/` | Mobile application source/configuration |
| `sentinel-worker/` | Sentinel worker source |
| `docs/` | Architecture, operating constraints, acceptance and work registers |
| `firebase-auth-blocking/` | Firebase authentication blocking extension |

Tracked file counts at this snapshot: **51 asset files**, **88 API JavaScript route files** (excluding shared `functions/_lib/` helpers), **144 `.test.mjs` test files**, and **18 GitHub Actions workflow files**.

These counts describe the tracked source tree, not the number of deployed routes, live services, or fully verified user journeys.

## 2. Application page and navigation inventory

The main router viewport contains these 19 route destinations:

| Area | Route IDs / page labels |
|---|---|
| Core workspace | `home` (Overview Engine), `projects` (Project Library), `templates`, `inbox`, `pricing`, `faq` |
| Building workspaces | `webstudio` (Web Studio), `appstudio` (App Studio), `kernel-bot` (Workspace repair) |
| Administration | `admin-overview`, `admin-template-hub`, `admin-pricing`, `admin-users`, `admin-brain`, `admin-identity`, `admin-backend`, `admin-telemetry`, `admin-broadcasts` |
| Account | `settings` |

The shell also contains `view-master-auth` and the `view-router-viewport` container. The router has explicit aliases for `help` → `faq`, `code` and `code-workspace` → `webstudio`, and `workspace` → `webstudio`. The aliases matter: the existing Code workspace is not a separate route in this router snapshot.

Router-level behaviour found in source:
- Route changes close the mobile drawer on narrow screens.
- Trial sessions are ended when switching away from the active trial route.
- Tier gating is evaluated before entering gated destinations, with an admin override path.
- Invalid/missing view containers fall back to Home.
- The active route is mirrored to `KernelState.activeView` and an `ovyx:view-changed` event is dispatched.
- Web Studio and Projects have route-entry render hooks.

This is a source-level route map. Browser verification of every navigation entry, deep link, gated route and responsive drawer remains part of final quality assurance.

## 3. Settings — complete source-visible category inventory

The active Settings navigation declares 13 categories:

1. General
2. Profile
3. Appearance
4. Workspace
5. Notifications
6. Editor
7. Shortcuts
8. AI Preferences
9. Privacy
10. Security
11. Plan
12. AI Usage
13. Token Boosters

The main HTML also contains 17 distinct `data-settings-panel` identifiers when the dynamic template marker is counted: `connected-accounts`, `data-layer`, `cloudflare`, `profile`, `ai`, `plan`, `security`, `notifications`, `admin`, `admin-preview`, `workspace`, `connections`, `appearance`, `boosters`, `privacy`, and `brand-identity`, plus a dynamic `${id}` template marker. These identifiers are not all top-level navigation categories; some are older, nested, or dynamically rendered panels.

A detailed control-by-control register already exists:
- [Settings audit checkpoint](SETTINGS-AUDIT-CHECKPOINT.md)
- [Settings control inventory](SETTINGS-CONTROL-INVENTORY.md)

Those documents map visible controls to intended effects, local or account/server persistence, API handlers, and known overlap risks. They remain important references; their original baseline is 2026-10-15 and they must not be mistaken for a browser-tested report of the entire current November build.

### Settings source findings that must be preserved

- Profile and notifications have authenticated account-backed API paths.
- Appearance, Workspace and many AI/editor preferences are primarily browser-local; do not promise cross-device synchronisation unless separately proven.
- The Data Layer custom endpoint is a health-check configuration, not proof that OVYX provisions PostgreSQL or routes project CRUD through that endpoint. Project sync uses its separate existing authenticated project service.
- Notification email switches are preference storage only; they do not prove email delivery.
- Cloudflare/connection state must be derived from an actual verified state, not merely the presence of a configuration object.
- Profile save/delete, notifications, appearance/theme, Workspace preferences and AI settings have multiple generations of renderers or handlers. Do not add duplicate listeners or delete older paths until the effective event owner and regression coverage are established.
- Security actions include sign-out, session revocation and account deletion. Destructive paths require safe test accounts and mocked/rejected scenarios; never use a real user account for destructive QA.
- Plan and Token Booster screens include navigation, quota/balance reads and checkout paths. A visible purchase button or configured key is not evidence of a completed payment or credit fulfilment.

## 4. API and backend surface

The 88 API route files fall into these functional groups:

| API group | Coverage found |
|---|---|
| Root / platform | Middleware, assets, deploy, deployment status, entitlements, generation, health, identity, notifications, payments routing, plans, projects, publishing, service status, site management, support, provider testing and trials |
| Account | Account deletion |
| Admin | AI config, broadcasts, control, environment, Guardian repo/patch, identity, logs, plans, push, RBAC, Sentinel, support tickets, templates and users |
| Agent | Callback and status |
| AI | Assistant, feedback, gateway, image generation, OVYX native AI, provider availability, readiness, status, transcription, web search and workspace tools |
| App Studio | Brand profile, release health and URL analyzer |
| GitHub | OAuth and repository access |
| Global | Compatibility and readiness |
| Internal | Live-generation evaluation |
| Mobile | Build, build consumption, payload, quota, status and EAS webhook |
| Notifications | Push |
| Payments | Create, history, OPay webhook, Paystack webhook, refund, status, verify and webhook |
| Projects | Project connection action |
| Settings | AI, brand profile, connection grants, connections, preferences and profile |
| Templates | Published templates |
| Tokens | Balance |
| Web Studio | Backend runtime |
| Workspace | Workspace activation |

Security/architecture references inspected:
- Firebase is used for account identity and existing Firestore/Storage-backed flows.
- Cloudflare Pages Functions are the API boundary.
- AI routing policy and shared provider logic live in `functions/_lib/`; the project knowledge map documents the Cloudflare Workers AI product inference boundary.
- Connection ownership and credential handling are centralized in shared connection logic.
- Project workspace tools are distinct from root-admin-only repository inspection.
- Payment webhooks and refunds have dedicated handlers and regression tests.

A route existing in the repository does not establish that its provider secrets are configured, that the endpoint is deployed, or that an external operation succeeds in production.

## 5. Browser-side feature modules

The 51 tracked `assets/` files include modular runtimes for:
- Settings reliability and billing
- Personal Connections catalogue and centre
- App Studio and brand/project intelligence
- Admin and workspace experiences
- Assistant workspace and native assistant UI
- Publishing and website management
- Web Studio generation, preview, code search, quality, export, assets and visual editor
- Global readiness, diagnostics and supporting UI behaviour

The assets directory is modular, but the main HTML still contains substantial inline markup, styles and runtime code. Stage 2 should therefore define the target page architecture without assuming that every current page is already a standalone source module.

## 6. Quality and CI inventory

The repository contains 144 test files and 18 workflows. The current package scripts expose:
- `npm test`: a long, explicitly enumerated chain of unit and contract suites.
- `npm run validate`: `scripts/ovyx-static-verify.mjs`.
- `npm run build`: `scripts/ovyx-pages-build.mjs`.
- `npm run check`: Wrangler type generation/check.
- `npm run deploy`: Cloudflare Pages deploy command (not executed during this audit).

Relevant existing regression coverage includes Settings, account security, Admin, App Studio, Personal Connections, publishing, website management, Web Studio, AI routing, Cloudflare environment, payment webhook safety, global readiness, backend runtime and project workspace tools.

### CI evidence at the audit snapshot

The latest visible Actions run for commit `47a7cf3cbd2b5b21c4faa6b53f554220a6b652e2` showed:
- Full repository test step: completed successfully.
- Static validation: completed successfully.
- Production build validation: completed successfully.
- Payment webhook safety and full-stack architecture contract steps: completed successfully.
- The Web Studio quality browser workflow was still **in progress** at the time of inspection, installing Chromium, Firefox and WebKit; its later browser steps had not yet run. It must not be reported as fully passed from this snapshot.

A successful unit/build stage is not equivalent to a completed browser or production acceptance run.

## 7. Preservation checklist and constraints for the 12-stage programme

| Protected item | Audit decision |
|---|---|
| Existing OVYX logo / inline SVG brand mark | **Freeze.** Do not redraw, replace, rename or alter its geometry. |
| Web Studio | **Freeze.** Do not redesign its interface, editor, preview, code workspace, menus or functionality in this programme. Its existing route and modules remain intact. |
| Firebase authentication and account schema | Preserve existing identity, profile and authorization contracts. |
| Firebase/Firestore/Storage | Preserve current owner scoping, data paths and rules; verify live deployment separately. |
| Cloudflare Pages and Functions | Preserve existing deployment/runtime boundary during this experience programme. |
| Cloudflare Workers AI inference | Preserve the current product inference boundary, authentication, quotas, budget ledger, entitlements and refunds. |
| Personal Connections | Preserve secure credential handling, ownership, grants, project permissions and honest adapter readiness. |
| Payments and token balances | Preserve webhook signature/idempotency, verification, refunds and authoritative server-side entitlement/balance checks. |
| Admin authorization | Preserve root-admin checks, RBAC, first-user protection and owner-only repository investigation. |
| Project store and workspace routing | Preserve existing project persistence, trial gating, route aliases and active-view state. |
| Tests | Do not delete tests, lower assertions, bypass CI or change expected results just to make checks green. |

## 8. Risks and unresolved evidence

1. **Repository exposure:** GitHub reports this repository as public at the audit snapshot. This requires an owner decision and a credential/history review. Never commit secrets; a public repository makes secret scanning and history hygiene particularly important.
2. **Branch protection:** GitHub reports `main` as not protected. This is an operational governance risk because direct pushes are not blocked by branch protection. Recommend requiring PRs and required checks before merging, subject to owner approval.
3. **Settings handler overlap:** multiple generations of Settings renderers and event handlers remain a regression risk. Stage 10 must consolidate only after browser evidence and must preserve every supported setting.
4. **Monolithic application shell:** a large `index.html` plus modular assets increases the risk of duplicate IDs, handler order dependencies and CSS/runtime coupling. Stage 2 should define clear ownership boundaries before any restructuring.
5. **Status truthfulness:** configuration, source presence, a successful health probe, adapter registration and a completed real external operation are different states. UI labels must continue to distinguish them.
6. **Live services:** CI fixtures/mocks do not prove production Firebase rules, OAuth, email, payment, AI budget ledger, deployment or generated-site runtime behaviour.
7. **Visual verification:** this audit did not capture a real browser screenshot or perform a full manual click-through. The active browser workflow was still running. No visual acceptance claim is made.

## 9. Stage 1 exit decision

**Source inventory: complete.** The current mainline file tree, application routes, Settings navigation, API surface, feature-module areas, test/workflow inventory, protected boundaries and major known risks are documented.

**Runtime verification: explicitly deferred.** Stage 1 is an inventory and preservation phase. Exhaustive button-by-button, cross-browser, live-provider and production acceptance belongs in the dedicated test work and Stage 12. The currently running browser workflow must be checked before any claim that its browser matrix passed.

**No product code, logo, Web Studio code, configuration or runtime behaviour was changed by this audit.**

## 10. Stage 2 entry requirements

Stage 2 may begin with an architecture proposal only. Before implementation, produce a page/navigation blueprint that:
- distinguishes dedicated pages from existing modal/drawer/subpanel flows;
- defines route ownership, breadcrumb hierarchy, sidebar/topbar rules and mobile navigation;
- specifies full-screen/wide layout behaviour without making every utility panel a separate top-level route;
- maps each existing feature/action to its destination so none becomes orphaned;
- preserves current route IDs/aliases and access gates until compatibility tests prove a safe migration;
- treats Settings as a dedicated centre with all 13 categories accounted for;
- keeps the OVYX logo and Web Studio as explicit frozen boundaries;
- does not move or rewrite source files during architecture approval.

**Recommended Stage 2 deliverable:** a page architecture and navigation contract, plus a route/action mapping and migration plan. No interface redesign or code migration should start until that blueprint is reviewed.
