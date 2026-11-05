# OVYX Stage 1 — Screen, Action, Design and Preservation Register

**Audit date:** 2026-11-05  
**Repository:** `thompsonemmanuel117-sketch/ovyx`  
**Branch baseline:** `main` at `3999224d8f287466960af797d551aff4f9da2ae5`  
**Method:** read-only source/tree inspection, existing test and workflow inventory, and review of existing architecture and Settings registers.  
**Product changes:** none.  
**Frozen areas:** existing OVYX logo and all Web Studio UI, editor, preview, code workspace/menu and runtime functionality.

This register supplements [the Stage 1 full-platform audit](OVYX-FULL-PLATFORM-AUDIT-2026-11-05.md) and [the Settings control inventory](SETTINGS-CONTROL-INVENTORY.md). It closes the missing *source-inventory* categories: screen ownership, action families, visible menu contracts, design/motion/responsive evidence, issue register and preservation traceability.

## 1. Current repository snapshot and scope

The current mainline recursive Git tree at the baseline contains **487 tracked files**: 51 files under `assets/`, 88 API JavaScript route files excluding shared `functions/api/_lib/`, 144 `.test.mjs` files and 18 workflow YAML files. The earlier audit's 486-file count was measured at its earlier source commit; the one-file difference is a later docs addition, not a product-code change.

The application shell has 19 routable destinations, two shell containers (`view-master-auth` and `view-router-viewport`), and route aliases. The route IDs and aliases in the main audit remain authoritative. This document maps what each destination owns; it does not convert subpanels or utilities into new routes.

## 2. Screen-by-screen workspace and action ownership

The following is the source-evidence inventory of each route's user-facing responsibilities and action families. “Action family” means the operations implemented by that screen/module, not a claim that every click was manually exercised against a live deployment.

| Screen / route | Feature and user action inventory | Existing evidence / boundary |
|---|---|---|
| Overview Engine / `home` | Workspace landing, account/plan context, project entry points, navigation to building and account areas, platform status/usage summaries | Main shell and global readiness/experience modules; verify live data freshness separately |
| Project Library / `projects` | Browse/open projects, create project flow, select active project, project actions including save/delete and workspace opening | Project store/reliability code and scoped rollback tests; deletion must respect confirmation preference and ownership |
| Templates / `templates` | Browse published templates/blueprints and choose a template to start a project | Published-template API and tests; publishing/availability is distinct from a local template card |
| Inbox / `inbox` | View account/workspace notifications and activity; notification state and navigation | Account notifications runtime, push APIs and notification browser tests; email preference is not email delivery |
| Pricing / `pricing` | View plan tiers, feature entitlements, checkout entry points and token booster purchase flow | Plan/payment/token APIs and webhook safety tests; UI click is not payment confirmation |
| FAQ / `faq` (alias `help`) | Help and support information; legal/support entry points where surfaced | Legal/support handlers; external mail client and legal navigation require browser confirmation |
| Web Studio / `webstudio` | Website creation/editing, preview, responsive viewport, page/section/assets/code/export/testing/console/history/deploy operations | **FROZEN.** Read-only inventory only. Preview menu contract is covered by `ovyx-preview-menu.test.mjs`; no Stage 1 changes allowed |
| App Studio / `appstudio` | App/project analysis and link building, brand DNA, project intelligence, release health and URL analysis | App Studio modules and unit/browser tests; distinguish analysis output from successful release/deployment |
| Workspace repair / `kernel-bot` | Diagnose workspace/project issues, inspect evidence and offer repair/verification workflows | Sentinel/Guardian/assistant diagnostics and endpoint tests; privileged repository actions remain owner-gated |
| Admin Overview / `admin-overview` | Owner operations overview, platform health and management entry points | Admin controls/workspace modules and owner-control tests; owner identity must be server-verified |
| Admin Template Hub / `admin-template-hub` | Review/manage template catalogue and publication lifecycle | Admin template APIs and published-template tests; verify authorization and resulting catalogue state |
| Admin Pricing / `admin-pricing` | Configure plan definitions, pricing and feature gates | Admin plan update/control APIs; preserve server-side entitlements and pricing authority |
| Admin Users / `admin-users` | Search/review users and perform permitted account/role/support actions | Admin users, identity, RBAC and account lifecycle APIs/tests; do not expose privileged controls to ordinary users |
| Admin AI Brain / `admin-brain` | Inspect AI configuration/provider status, run provider diagnostics and manage platform AI policy | Admin AI config, provider diagnostics, AI status and routing tests; product inference remains Cloudflare Workers AI |
| Admin Identity / `admin-identity` | Inspect identity/authentication and account controls | Firebase identity/auth helpers, admin identity API and security tests; do not bypass Firebase or server authorization |
| Admin Backend / `admin-backend` | Inspect backend/runtime/environment readiness and diagnostics | Admin environment, service status, Cloudflare diagnostics and backend runtime modules; configured is not equivalent to operational |
| Admin Telemetry / `admin-telemetry` | Inspect platform diagnostics, logs, latency/rate/health signals | Telemetry/logging/diagnostics modules; metrics must be measured, not fabricated |
| Admin Broadcasts / `admin-broadcasts` | Compose/manage broadcast notifications and delivery actions | Broadcast API/mailer/push tests; queued, accepted and delivered are distinct states |
| Settings / `settings` | Account profile, appearance, workspace/editor preferences, notifications, AI preferences, privacy/security, plan/usage/boosters and connection/config panels | 13 categories and detailed control register in `SETTINGS-CONTROL-INVENTORY.md`; Settings has known overlapping generations of handlers |

### Cross-screen shell and navigation actions

| Control family | Expected action / contract | Risk or verification note |
|---|---|---|
| Primary sidebar navigation | Calls the router for a known route; applies access gates and active state | Keep existing route IDs/aliases compatible |
| Mobile navigation drawer | Opens/closes navigation; closes after route selection on narrow screens | Verify keyboard, focus return, scroll lock and small-screen overflow |
| Breadcrumb / workspace context | Identifies current route and parent context; navigates only where a real parent link exists | Avoid decorative text that looks clickable |
| Workspace selector / project context | Switches the active workspace/project context where supported | Must not silently change project ownership or persistence scope |
| Command palette and global keyboard shortcuts | Opens command/search and invokes supported navigation/project actions | Shortcut help is not proof the handler works on every platform keyboard |
| Toast/notification surface | Reports success, warning, error or progress from actual action outcomes | No optimistic “connected/saved/published” success before authoritative confirmation |
| Modal/dialog/drawer patterns | Confirm destructive actions, collect user input, or expose contextual workflows | Must trap/restore focus, support Escape where appropriate, and fit mobile viewport |
| Route gating and trial guard | Enforces tier/trial/admin conditions before entering a destination | Client-side visibility must not replace server-side authorization |
| Route fallback | Unknown/missing view falls back safely to Home | Do not create orphan routes or silently swallow navigation errors |

## 3. Known menu and action contracts

### 3.1 Settings

Settings has 13 categories: General, Profile, Appearance, Workspace, Notifications, Editor, Shortcuts, AI Preferences, Privacy, Security, Plan, AI Usage and Token Boosters. The control-by-control register remains the authoritative list for individual inputs, switches, save/reset buttons, profile photo, endpoint health test, schema download, session revocation, account deletion, checkout and usage views.

The Settings source has multiple generations of panel renderers and capture/event handlers. This is a known overlap, not a license to remove controls. Stage 10 must identify the active owner of each control and preserve all supported storage/API effects before consolidation.

### 3.2 Web Studio preview menu — inventory only; frozen

The existing preview menu test asserts this exact 17-action contract and stable order:

1. `mobile-chat`
2. `pages`
3. `sections`
4. `assets`
5. `viewport`
6. `starter-pages`
7. `export`
8. `code`
9. `files`
10. `visual`
11. `tests`
12. `console`
13. `history`
14. `download`
15. `deploy`
16. `convert-mobile-app`
17. `delete`

The same test checks dispatch to existing page/section/assets/viewport/export/code/file graph/test/console/history/download/deploy/mobile conversion/delete operations. This is included solely as a preservation contract. Do not redesign or modify this menu or any Web Studio implementation during the 12-stage platform programme.

### 3.3 Personal Connections

The current catalogue/centre modules own the connection discovery and management experience. The action families evidenced in the connection modules and tests include catalogue search/filter, provider selection, connect/authorize or credential setup where supported, connection status/readiness, disconnect/revoke, project grants/scoping, fallback diagnostics and branded status notifications. A provider being listed, a key being stored, an OAuth callback returning, and a successful authenticated provider operation are different states. Keep these statuses distinct. Existing connection ownership, encrypted credential handling, scopes/grants and project access checks are protected.

### 3.4 Projects, publishing and website management

Project actions include create/open/save, project selection, local recovery/rollback and destructive delete. Publishing/website management actions include inspect active saved project, prepare project source, publish/deploy, inspect deployment status, manage existing site and request live-site updates. The publishing module requires a signed-in account and a saved project source graph before it can prepare the payload. A publish request, deployment accepted, deployment ready and live domain verified must remain distinct statuses.

### 3.5 App Studio and Assistant workspaces

App Studio action families are URL analysis, brand profile/brand DNA, project intelligence/link building and release-health inspection. Assistant workspace action families include prompt/workspace interaction, contextual project tools, menu navigation, feedback and diagnostics. Tests exist for App Studio browser flows and Assistant menu/workspace behavior. Treat analysis or generated recommendations as proposals until a validated action is completed.

### 3.6 Administration

Admin action families include user/identity review, plan and feature-gate configuration, AI configuration/diagnostics, backend/environment diagnostics, logs/telemetry, template management, broadcast/push operations and Sentinel/Guardian diagnostics/repair. Owner controls require both a verified server-side owner state and authenticated identity; client route visibility is not authority. Repository investigation/patch actions are especially privileged and must remain separately authorized.

## 4. Design system, visual language and motion inventory

The codebase has a shared design-contract layer and modular visual runtimes. Existing evidence includes:

- Design contract tests for component/page usage, component variants, focus-visible state, form labels, interaction-state contracts, traceability from requested controls to owning routes, and explicit verification outcomes.
- Motion contract tests for section reveal, navigation transition, a signature moment, six choreography entries, micro-interaction timing, transform/opacity performance preference and `prefers-reduced-motion` support.
- Launch-polish runtime styles for dark glass toast surfaces, semantic success/error/warning/info treatments, responsive toast width and entrance/exit motion.
- Personal Connections and Publishing modules use dark surfaces, fine translucent borders, muted text, restrained gold accents and flexible/wrapping action groups.
- Existing logo/brand lockup and brand mark assets are present. They are frozen and must not be redrawn or replaced in this programme.

### Visual inventory by concern

| Concern | Existing source evidence | Stage 2+ preservation / design requirement |
|---|---|---|
| Brand identity | Existing SVG/PNG logo, brand mark and lockup assets; inline shell mark | Freeze exact current mark, geometry and identity |
| Colour and surfaces | Dark shell/module surfaces, white/gray text, translucent borders, gold accent and semantic status colours | Establish tokens and contrast rules without changing logo/Web Studio |
| Typography | Shared font stylesheet and system/Inter fallbacks in modules | Define scale/weights and avoid inconsistent page-local typography |
| Cards and panels | Reusable card-like surfaces in Connections, Publishing, Admin and launch modules | Use consistent density, border, radius and spacing; avoid bulky shadow stacks |
| Interaction states | Design contract includes focus-visible and form labels; toast runtime has semantic statuses | Every control needs hover, focus, active, disabled, loading, success and error behavior as appropriate |
| Motion | Motion contract covers six choreography steps, navigation, section reveal and signature moment | Respect reduced motion; prefer transform/opacity; avoid blocking route changes |
| Responsive layout | Design contract explicitly includes a 320px viewport; responsive modules use `clamp`, flexible rows and wrapping | Validate narrow mobile, tablet and desktop; avoid horizontal overflow and clipped dialogs |
| Accessibility | Focus-visible, labels and reduced-motion are asserted by design contract tests | Add keyboard traversal, focus restoration, contrast and screen-reader checks to acceptance |
| Notifications | Launch toast is fixed-position, safe-area-aware and constrained to viewport width | Preserve safe-area offsets and prevent overlap with mobile controls |

This section documents existing design-system evidence and module patterns; it is not a claim that every page has identical polish or that visual acceptance has been completed.

## 5. Responsive and motion behaviour — route-level verification matrix

| Area | Source-level evidence | Must verify in real browser |
|---|---|---|
| Global shell | Router closes mobile drawer on narrow-screen route changes; mobile navigation test exists | Drawer open/close, route transition, focus, body scroll and no content clipping |
| Settings | Category navigation, search and responsive control groups are documented in Settings inventory | Every category at 320px/390px, long labels, save/error states, modal sizing |
| Project Library | Project store and scoped rollback tests | Grid/list overflow, menus, empty/loading/error states, create/open/delete |
| App Studio | Dedicated browser tests for link builder and premium polish | URL input, loading/error/result states, action feedback at mobile widths |
| Personal Connections | Responsive flexible tabs/search/action groups in centre module | Catalogue filters, connect/disconnect, dialogs, long provider names and success/error toasts |
| Publishing / website management | Modular publishing and live-site update runtimes | Saved project precondition, publish lifecycle, domain/status display and mobile action controls |
| Admin | Admin browser tests and owner-control tests | Role-gated visibility, data table overflow, dangerous-action confirmation and mobile layout |
| Assistant / Sentinel | Assistant menu/workspace and Sentinel browser tests | Menu focus/escape, long response scroll, action confirmation and reduced motion |
| Web Studio | Existing Web Studio quality/cross-browser/menu/editor suites | Preserve current existing test obligations; do not change its source in this programme |

### Required viewport set for the next visual acceptance pass

Use the existing design contract's 320px minimum viewport as a hard narrow-width case, and include 390px mobile, 768px tablet and 1440px desktop as practical regression checkpoints. Record screenshots and actual device/browser metadata when a browser runner is available. Do not label a source assertion as a screenshot or visual pass.

## 6. Broken, duplicated, inactive and incomplete functionality register

This register intentionally distinguishes confirmed source facts from risks that need runtime reproduction.

| ID | Finding | Evidence / classification | Safe handling |
|---|---|---|---|
| S1-01 | Settings has multiple generations of panel renderers and handlers | Confirmed source overlap; regression risk | Map effective handler and storage owner per control before refactor |
| S1-02 | Some Settings values are local/device scoped, not account synced | Confirmed in Settings control inventory | Label scope honestly; do not promise cross-device sync |
| S1-03 | Notification email switches store preferences but do not themselves send email | Confirmed control inventory | Keep preference and delivery capability separate |
| S1-04 | Data Layer “Test API” checks only configured endpoint health; schema download is static | Confirmed control inventory | Do not describe as database provisioning or CRUD connection |
| S1-05 | Plan/billing UI can display local history or open checkout without proving settlement | Confirmed control inventory | Use verified server payment/entitlement state for success |
| S1-06 | Provider configured/listed/readiness is not proof of a completed external operation | Confirmed architecture and connection module contract | Show truthful status and require an operation-level probe |
| S1-07 | Main shell is a large monolithic `index.html` with modular assets | Confirmed repository structure | Architecture first; avoid moving code until ownership and regression map exist |
| S1-08 | Code and workspace route aliases resolve to Web Studio in the router snapshot | Confirmed route mapping | Preserve aliases; do not create a duplicate route without approved architecture |
| S1-09 | Web Studio preview menu has 17 tested actions; Code sidebar entry has a separate Manage Website behavior in test contract | Confirmed preview-menu test | Preserve exact menu semantics; Web Studio frozen |
| S1-10 | Visual/motion contract tests assert design contract behavior but do not prove every page's rendered appearance | Confirmed test scope | Require real-browser screenshots and review |
| S1-11 | Existing browser suites cover selected journeys, not every route/control combination | Confirmed by test inventory | Build a route/action coverage matrix and add non-destructive tests before refactors |
| S1-12 | Live Firebase rules, OAuth, mail, payment, AI budgets, deployment and external APIs cannot be proven by mocks alone | Confirmed audit limitation | Use dedicated staging accounts and safe live acceptance |
| S1-13 | Repository is public and main branch protection was reported absent at the earlier audit snapshot | Operational risk; recheck repository settings before policy decisions | Never commit credentials; recommend owner-approved PR/check protection |
| S1-14 | Full manual click-through and real browser screenshot evidence were not captured as part of this source audit | Explicit evidence gap | Keep browser verification pending; do not claim it passed |

No row in this table asserts an unobserved broken click. Suspected issues must be reproduced with a failing test or browser trace before they are called confirmed defects.

## 7. Preservation checklist — feature-to-boundary traceability

| Protected contract | Files / areas to preserve | Required regression evidence |
|---|---|---|
| Existing OVYX logo and brand lockup | Existing `assets/ovyx-*.svg/png` brand assets and shell markup | Brand asset and app-shell favicon/brand tests; no replacement |
| Web Studio UI and behavior | `view-web-studio`, Web Studio markup and all `assets/ovyx-webstudio-*.js` | Existing preview menu, reliability, visual editor, quality, export, code-search, cross-browser and generated-site tests |
| Route identity and aliases | Main router, `switchView()`, route IDs, aliases, `KernelState.activeView` | Navigation/router compatibility and mobile back/navigation tests |
| Firebase identity | Firebase initialization/auth state, `functions/api/_lib/auth.js`, identity/profile endpoints | Auth blocking, account lifecycle, security and Firebase storage-rules tests |
| Firestore/Storage ownership | Firebase admin/query/firestore/storage helpers and owner-scoped project paths | Firebase storage rules and account/project ownership tests |
| Cloudflare Pages API boundary | `functions/api/`, middleware and shared `functions/_lib/` | API middleware, build, static validation and Wrangler check |
| Workers AI inference policy | Shared brain/provider/routing modules and AI gateway | Cloudflare-only product, provider routing, budget ledger, AI readiness and fallback tests |
| Personal Connections security | Catalogue/center assets, connection API routes, shared connection/auth helpers | Catalogue, readiness, fallback, grants/ownership and browser connection tests |
| Payment and token integrity | Payment catalog/idempotency/lifecycle/provider modules, payment/token APIs | Payment webhook safety, verification, refund, plan gate and balance tests |
| Admin and root-owner authorization | Admin views, admin controls/workspace assets, RBAC/auth API | Admin hub/workspace, owner controls, RBAC and Guardian tests |
| Project data and recovery | Project store, project APIs, local recovery and scoped rollback | Project workspace, rollback graph/performance and account lifecycle tests |
| App Studio | App Studio view and `assets/ovyx-app-studio-*.js` | App Studio unit and browser tests |
| Publishing and website management | Publishing/site-management APIs and `assets/ovyx-publishing-center.js`, `assets/ovyx-website-management.js`, live updater | Publishing center, website management and live-site updater tests |
| Settings | Settings view, Settings runtime assets, Settings APIs and all 13 categories | Settings actions, core/account/security/workspace/AI/shortcuts browser tests |
| CI/test integrity | `scripts/`, `.github/workflows/`, package scripts | Never delete tests, reduce assertions, skip checks or change expected values to obtain a green result |

## 8. Existing test and workflow coverage map

The repository currently includes dedicated test families for:
- Settings actions and browser journeys (core, account, security, workspace, AI, shortcuts, notifications).
- App Studio brand DNA, link builder, premium polish, project brain, release health and URL analyzer.
- Personal Connections catalogue, readiness, provider fallback and browser connection flow.
- Assistant header/menu/runtime/workspace, feedback and workspace tools.
- Admin hub/workspace, owner controls, RBAC-adjacent actions, Guardian repo/patch, broadcasts and push.
- Publishing center, website management and live-site updater.
- Web Studio preview menu, visual editor, quality, reliability, code search, export, assets, generated-site evaluation and cross-browser smoke.
- Cloudflare middleware/diagnostics/environment/deployment, AI routing/budget/provider readiness, Firebase storage rules, account security/lifecycle and payment webhook safety.

The package `test` script is an explicit chain of suites. The audit must preserve the complete chain; a test file existing in the tree does not mean it is invoked by `npm test`, so Stage 2 must compare package-script membership and workflow execution before changing test organization.

## 9. CI status for the Stage 1 documentation merge

The prior Stage 1 audit PR #400 merge commit `3999224d8f287466960af797d551aff4f9da2ae5` has been rechecked. GitHub reports:
- Cloudflare Pages: **success**
- `verify`: **success**
- `diagnose`: **success**
- `callback`: **skipped** (not a failure)

The `main` branch pointed to this merge commit at the time this supplement was prepared. This is evidence for the documentation merge's checks, not a claim that every product browser journey or live integration has been manually accepted.

## 10. Stage 1 exit decision and explicit limitations

**Completed:** repository/source inventory; route and page map; workspace and feature ownership map; source-visible action/menu families; complete 13-category Settings inventory with separate control register; API/backend and service boundary map; design/motion/responsive source evidence; known duplication/incomplete-scope register; preservation checklist; CI/test inventory and current merge check status.

**Not claimed:** exhaustive real-browser clicking of every control; visual screenshot approval of every page; cross-device manual QA; production Firebase/OAuth/email/payment/provider verification; real user account deletion/session revocation; successful live publishing on a customer domain. These require a browser runner, safe staging accounts and configured external systems. They remain explicit acceptance work for the appropriate later QA stage, not hidden gaps in the source inventory.

**Stage 1 source-inventory exit: COMPLETE.** Stage 2 may begin with its architecture proposal only. It must not change the frozen logo or Web Studio, and must map all existing screen/action ownership before implementation.
