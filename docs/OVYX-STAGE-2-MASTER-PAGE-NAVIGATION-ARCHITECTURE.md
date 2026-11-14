# OVYX Stage 2 — Master Page and Navigation Architecture

**Status:** Architecture proposal / Stage 2 deliverable  
**Baseline:** `main` at `432fd40acb8c1052622a75c8661300d53220e03c`  
**Scope:** OVYX platform application experience (not the websites users create with OVYX)  
**Stage 1 inputs:** Full-platform audit, screen/action/design/preservation register, and Settings control inventory  
**Implementation in this stage:** None. This document defines the target information architecture and migration contract; it does not change runtime routes, markup, styling, permissions, or behaviour.

## 1. Architecture decisions

This blueprint establishes one consistent product hierarchy with clear separation between daily workspace work, building workspaces, connected services, published-site operations, account preferences, and owner-only administration.

The architecture adopts these decisions:

1. **One global application shell, several page families.** All authenticated destinations share one navigation model, breadcrumb contract, page header contract, responsive behaviour, and route lifecycle. Focused workspaces may use a denser, task-specific frame inside the global shell.
2. **Major capabilities own a page.** Projects, Templates, Inbox, App Studio, Personal Connections, Sites/Publishing, Settings, Pricing/Billing, Help, and every existing Admin destination are independently addressable pages. Their meaningful detail records may be nested child pages.
3. **Do not turn every control into a route.** Dialogs, confirmations, pickers, inspectors, command palette, small settings groups, and short-lived actions remain overlays or in-page panels. A page is warranted when the user has a sustained task, needs a stable deep link, or needs a meaningful navigation/breadcrumb context.
4. **Preserve the current route contract first.** All 19 current route IDs, aliases, gates, route-entry hooks, and `switchView()` compatibility remain valid during migration. New page IDs are additive and are introduced only with dedicated route tests.
5. **Web Studio is a frozen island in this programme.** Keep its current route, complete UI, editor, preview, code workspace/menu, runtime modules, and behaviour untouched. The global shell may continue to host the existing Web Studio destination, but no Stage 2 proposal authorises internal Web Studio changes.
6. **The existing OVYX logo is frozen.** Preserve the exact mark, geometry, wordmark, assets, and placement identity. Architecture does not authorise a redraw or replacement.
7. **Navigation is not authorization.** Hiding a link or guarding a client route never replaces Firebase identity checks, server-side authorization, owner/RBAC checks, project ownership, plan entitlements, or trial validation.
8. **Wide means useful space, not stretched content.** Work surfaces use available viewport width; reading forms and narrow settings controls retain a comfortable measure. No universal fixed max-width is imposed on every page.
9. **No feature is silently removed.** Every source-inventoried route and action family maps to a destination, a contextual action, or an explicitly frozen Web Studio location.
10. **Architecture before extraction.** The large `index.html` and modular `assets/` remain in place until later stages establish component ownership and regression coverage. This stage does not move files or split runtime code.

## 2. Product information architecture

### 2.1 Primary navigation groups

The left navigation is organised into stable groups. Group labels are navigation structure, not routes.

| Group | Primary destination | Purpose |
|---|---|---|
| **Workspace** | Overview | Start point, workspace health and recent activity |
|  | Projects | Project library, creation, selection and project detail |
|  | Templates | Discover and start from published templates |
|  | Inbox | Notifications and account/workspace activity |
| **Build** | Web Studio | Existing website editor; frozen and unchanged |
|  | App Studio | App/project analysis, brand intelligence, link building and release health |
|  | Assistant | Contextual AI workspace and supported workspace tools |
| **Connect** | Personal Connections | Discover, connect and manage provider/app/API-key connections |
| **Operate** | Sites & Publishing | Published websites, deployment lifecycle, domains and live-site management |
|  | Workspace Repair | Diagnose and repair supported workspace/project issues |
| **Account** | Plans & Billing | Plans, checkout entry points, billing history and token boosters |
|  | Settings | Profile, preferences, privacy, security and account configuration |
|  | Help & Support | FAQ, support and legal resources |
| **Administration** | Admin Overview | Owner-only platform control centre |
|  | Templates, Pricing, Users, AI Brain, Identity, Backend, Telemetry, Broadcasts | Existing dedicated owner pages, each independently addressable and server-authorized |

The Administration group is shown only when the server-verified owner/admin capability allows it. Its absence from an ordinary user's navigation must not be treated as an authorization control.

### 2.2 Navigation hierarchy

```text
OVYX
├── Workspace
│   ├── Overview
│   ├── Projects
│   │   └── Project detail / activity / project actions
│   ├── Templates
│   │   └── Template detail / start project
│   └── Inbox
├── Build
│   ├── Web Studio [FROZEN — existing destination]
│   ├── App Studio
│   └── Assistant
├── Connect
│   └── Personal Connections
│       └── Connection detail / permissions / project grants
├── Operate
│   ├── Sites & Publishing
│   │   ├── Site detail
│   │   ├── Deployment history / deployment detail
│   │   ├── Domains
│   │   └── Live-site update history
│   └── Workspace Repair
├── Account
│   ├── Plans & Billing
│   │   ├── Plan comparison
│   │   ├── Billing history / purchase detail
│   │   └── Token Boosters
│   ├── Settings
│   │   ├── General
│   │   ├── Profile
│   │   ├── Appearance
│   │   ├── Workspace
│   │   ├── Notifications
│   │   ├── Editor
│   │   ├── Shortcuts
│   │   ├── AI Preferences
│   │   ├── Privacy
│   │   ├── Security
│   │   ├── Plan
│   │   ├── AI Usage
│   │   └── Token Boosters
│   └── Help & Support
└── Administration [owner-only]
    ├── Admin Overview
    ├── Template Hub
    ├── Pricing & Entitlements
    ├── Users
    ├── AI Brain
    ├── Identity
    ├── Backend & Environment
    ├── Telemetry
    └── Broadcasts
```

The tree is a hierarchy of destinations and contextual child pages, not a requirement to show every child as a permanent sidebar item. Child pages appear in the local page navigation, tabs, or contextual links appropriate to their parent.

## 3. Route and page ownership contract

### 3.1 Existing destinations — retain identity

These route IDs remain canonical compatibility identifiers until a separately tested router migration is approved.

| Current route ID | Page name | Target navigation parent | Ownership and page boundary |
|---|---|---|---|
| `home` | Overview | Workspace | Workspace landing, summary and entry points |
| `projects` | Projects | Workspace | Project list, creation and project selection; project detail is contextual/nested |
| `templates` | Templates | Workspace | Published template catalogue and template detail |
| `inbox` | Inbox | Workspace | Account/workspace notification centre |
| `pricing` | Plans & Billing | Account | Plan comparison and existing pricing/checkout entry points |
| `faq` | Help & Support | Account | FAQ, help and legal/support entry points |
| `webstudio` | Web Studio | Build | Existing complete Web Studio destination; frozen |
| `appstudio` | App Studio | Build | App/project intelligence and release workflow |
| `kernel-bot` | Workspace Repair | Operate | Existing repair/diagnostic workspace |
| `admin-overview` | Admin Overview | Administration | Owner-only control centre |
| `admin-template-hub` | Admin Template Hub | Administration | Template catalogue administration |
| `admin-pricing` | Admin Pricing | Administration | Plans, pricing and feature-entitlement administration |
| `admin-users` | Admin Users | Administration | User and permitted account administration |
| `admin-brain` | Admin AI Brain | Administration | AI configuration and provider diagnostics |
| `admin-identity` | Admin Identity | Administration | Identity and authentication administration |
| `admin-backend` | Admin Backend | Administration | Backend and environment diagnostics |
| `admin-telemetry` | Admin Telemetry | Administration | Logs, measured telemetry and diagnostics |
| `admin-broadcasts` | Admin Broadcasts | Administration | Broadcast composition and delivery lifecycle |
| `settings` | Settings Centre | Account | One Settings destination with 13 independently addressable category sections |

### 3.2 Additive destination proposals

The following are architecture targets, not existing routes. They must not be linked until implemented with route registration, permissions, data ownership, loading/error/empty states, and route-level tests.

| Proposed page ID | Page | Why it earns a dedicated page | Existing capability/source owner to reuse |
|---|---|---|---|
| `connections` | Personal Connections | Sustained task: discover providers, connect credentials, review status and manage grants | Existing Personal Connections centre/catalogue, connection APIs and shared connection/auth helpers |
| `sites` | Sites & Publishing | Sustained operational task with publish lifecycle, active sites and deployment state | Existing publishing centre, website management and live-site updater |
| `assistant` | Assistant Workspace | Distinct conversational/workspace task with contextual project tools | Existing assistant workspace/runtime and supported workspace tools |
| `settings/:category` | Settings category page | Stable deep link and direct access to each of the 13 settings categories | Existing Settings panels, control IDs, persistence and APIs; no control may be dropped |
| `projects/:projectId` | Project detail | Project-specific overview and contextual project actions | Existing project store, cloud sync and ownership-scoped APIs |
| `templates/:templateId` | Template detail | Review a specific template and its start-project action | Existing published template catalogue/API |
| `connections/:connectionId` | Connection detail | Inspect one provider connection, status and permitted grants | Existing connection ownership/grant model |
| `sites/:siteId` | Site detail | One site's current domain, publish state and management actions | Existing site-management/publishing APIs |
| `sites/:siteId/deployments/:deploymentId` | Deployment detail | Durable deployment diagnostics and lifecycle detail | Existing deployment status and publishing records |
| `pricing/history/:purchaseId` | Purchase detail | Durable receipt/status view when supported by verified server records | Existing payment history/verification APIs; never treat local-only history as authoritative |

Do not add speculative pages for features not evidenced in the current product. In particular, do not invent team management, analytics, domains marketplace, app marketplace, or a new Game Studio. A future capability can earn a page when it has a real feature owner and a tested user journey.

### 3.3 Settings is one destination with 13 page-level sections

Settings remains one coherent centre, not 13 unrelated top-level sidebar links. Each category has its own stable section route/deep link, page heading, short purpose statement, and category-local save/error feedback.

| Category | Suggested child path | Required content boundary |
|---|---|---|
| General | `settings/general` | General application preferences |
| Profile | `settings/profile` | Profile identity and profile actions |
| Appearance | `settings/appearance` | Theme and appearance preferences |
| Workspace | `settings/workspace` | Workspace defaults, recovery, data-layer configuration and sync preferences |
| Notifications | `settings/notifications` | Notification preferences and save/reset lifecycle |
| Editor | `settings/editor` | Existing editor preferences; does not redesign Web Studio |
| Shortcuts | `settings/shortcuts` | Shortcut reference and supported keyboard actions |
| AI Preferences | `settings/ai-preferences` | Generation preferences and routing preferences |
| Privacy | `settings/privacy` | Privacy information and data/appearance reset actions with exact scope |
| Security | `settings/security` | Session, sign-out, revoke sessions and destructive account action |
| Plan | `settings/plan` | Current plan/entitlement view and upgrade navigation |
| AI Usage | `settings/ai-usage` | Authenticated token balance/usage view |
| Token Boosters | `settings/token-boosters` | Balance refresh and verified checkout flow |

Settings panels currently include additional dynamic/legacy panels such as Connected Accounts, Data Layer, Cloudflare, Connections, Admin Preview and Brand Identity. Their controls must be assigned to the correct category or to the dedicated Personal Connections page during the later Settings/Connections stages. This is a placement decision only: no existing panel or control is deleted by this architecture. The detailed Stage 1 control inventory remains the control-level source of truth.

## 4. Page families and layout model

A shared shell provides consistency while page families use layouts suited to their work.

| Page family | Examples | Layout contract |
|---|---|---|
| Overview / library | Overview, Projects, Templates, Inbox | Full-width page canvas; clear title/description; responsive grid/list; filters and bulk actions stay close to their data |
| Focused workbench | App Studio, Assistant, Workspace Repair | Use the full available viewport; persistent local task context; keep primary work surface dominant; avoid narrow marketing-page columns |
| Provider management | Personal Connections | Wide catalogue/detail workspace; search/filter and category navigation; connection state and actions remain visible without crowding |
| Operations centre | Sites & Publishing, deployment detail | Wide data workspace; lifecycle status, site identity and next action are clear; tables adapt to cards on narrow screens |
| Account centre | Settings, Plans & Billing | Consistent account sub-navigation; readable forms; category-level deep links; sensitive actions visually and procedurally separated |
| Administration | All Admin pages | Dedicated owner workspace; consistent admin local navigation; dense data views may use full width; dangerous actions require confirmation and server authorization |
| Frozen specialist | Web Studio | Existing layout only; no change authorised |

### 4.1 Global shell regions

1. **Brand rail / sidebar:** existing OVYX logo unchanged; primary grouped navigation; active item; account/workspace context; collapse state on desktop; drawer on mobile.
2. **Top bar:** contextual breadcrumb, page-level utilities, command palette access where already supported, account/status affordances. Do not duplicate the OVYX wordmark in every breadcrumb.
3. **Page header:** title, concise description, optional status and one clear primary action. Secondary actions belong in an overflow menu or local toolbar.
4. **Local navigation:** tabs or section links only when a destination has meaningful sibling views. Keep it visually and semantically subordinate to global navigation.
5. **Content canvas:** page family controls density. Workbenches and operational tables can use nearly all available width; forms and reading content use readable line lengths.
6. **Feedback layer:** consistent toast, inline validation, empty/error/loading states and confirmation dialogs. Feedback must report the actual server or local operation result, not optimistic success.
7. **Mobile navigation:** accessible drawer with focus management, Escape handling, scroll locking, focus return, and close-on-navigation behaviour.

### 4.2 Full-screen and width rules

- The authenticated application occupies the available viewport; avoid a narrow centred dashboard card surrounded by unused space.
- Workspace pages default to a fluid content canvas with responsive gutters. Desktop gutters are generous but do not consume the working width.
- Workbench pages can use edge-to-edge internal regions where the task benefits from it; their controls must remain reachable at 320px and 390px.
- Data tables may scroll horizontally only when a card/list transformation would lose important relationships; provide clear mobile row summaries where possible.
- Forms use a readable measure (roughly 40–55rem for long form content) while their surrounding page shell remains wide.
- Page headings and primary actions remain visible at the top of long pages; sticky behaviour must not cover focus targets or content.
- Avoid nested scroll containers by default. Use a single primary page scroll region unless the task genuinely requires independent panes.
- Use consistent loading skeleton dimensions to prevent layout shift; empty, permission-denied and error states must be distinct.
- Full-screen means a deliberate application work surface, not forcing every modal or form to the entire screen.

### 4.3 Responsive breakpoints and behaviour

The architecture must be verified at the Stage 1 viewport matrix: 320px, 390px, 768px and 1440px.

| Width class | Navigation | Content |
|---|---|---|
| Small mobile (320–389) | Sidebar becomes a drawer; compact top bar; breadcrumb truncates safely | Single column; actions wrap; no clipped controls or horizontal page overflow |
| Mobile (390–767) | Drawer with touch-sized targets and clear close action | Single column or intentional stacked panels; tables become summaries/cards where practical |
| Tablet (768–1023) | Collapsible rail or drawer according to available space | Two columns only when each remains usable; avoid squeezed side-by-side forms |
| Desktop (1024–1439) | Persistent collapsible sidebar | Fluid workspace; page-specific split layouts |
| Wide desktop (1440+) | Persistent sidebar and full topbar | Use generous canvas; avoid excessive empty margins; constrain text, not the entire work surface |

Breakpoints are behavioural classes, not a mandate to use fixed pixel widths in every component. Respect browser zoom, keyboard navigation, safe areas and reduced-motion preferences.

## 5. Breadcrumb and navigation contract

### 5.1 Breadcrumb structure

Breadcrumbs reflect the actual page hierarchy and are built from route metadata, not manually typed strings scattered across views.

Examples:

- `OVYX / Workspace / Projects`
- `OVYX / Workspace / Projects / Project name`
- `OVYX / Connect / Personal Connections / Provider name`
- `OVYX / Operate / Sites & Publishing / Site name / Deployment`
- `OVYX / Account / Settings / Security`
- `OVYX / Administration / AI Brain`

Rules:

- The first crumb is the product context, not a repeated logo/brand lockup. Preserve the existing logo as-is in the sidebar.
- A crumb is clickable only if it resolves to a real parent destination. The current page is plain text and marked as current for assistive technology.
- Dynamic names are escaped and truncated visually without losing their accessible label.
- Breadcrumbs never reveal privileged route names or data to users without permission.
- If a page is reached from a command palette or notification, its breadcrumb still reflects canonical ownership, not the previous screen.
- Back navigation remains separate from breadcrumbs; browser history must not be faked by parent links.

### 5.2 Route metadata contract

Every route/page descriptor must define:

- Stable route ID and canonical destination.
- Human-readable title and navigation group.
- Parent route and breadcrumb labels.
- Owning feature/module and page family.
- Required authentication state.
- Required role/capability and plan entitlement (if any).
- Project/site/connection ownership requirements (if applicable).
- Route-entry and route-exit lifecycle hooks.
- Loading, empty, error, unavailable and permission-denied states.
- Mobile navigation title and active-navigation key.
- Analytics/telemetry event name only where the existing privacy/consent policy permits it.

Route metadata is the single source for sidebar labels, breadcrumbs, page titles, command-palette destination labels and deep-link handling. Do not infer access from navigation visibility.

### 5.3 Navigation behaviour

- Preserve `switchView()`, current route IDs, aliases, `KernelState.activeView`, `ovyx:view-changed`, existing tier/trial gating, admin override rules, and route-entry render hooks.
- Unknown routes resolve to a safe fallback with a recoverable message where appropriate; do not silently route a privileged deep link to a misleading page.
- On route change, close the mobile drawer, preserve expected focus, and restore scroll according to the destination's navigation semantics.
- Project/site/connection detail pages must validate the identifier and ownership before loading data.
- Deep links must survive reload and direct open. If a destination requires a selected project, show a clear project-selection state rather than silently changing the active project.
- The command palette, notifications and contextual links must use the same canonical route metadata.
- Keyboard navigation supports Tab/Shift+Tab, Enter/Space, Escape, visible focus and the existing shortcut policy.
- Navigation transitions use the shared motion contract and honour `prefers-reduced-motion`; route content must remain responsive and usable if animation is disabled.

## 6. Feature-to-destination traceability

This table ensures existing feature families do not become orphaned when the hierarchy is introduced.

| Existing feature/action family | Target destination | Placement |
|---|---|---|
| Workspace summary and entry points | Overview | Primary page |
| Create/open/select/save/delete project | Projects | Page actions and project detail context |
| Template catalogue and start-from-template | Templates | Catalogue and template detail |
| Account/workspace notification activity | Inbox | Primary page |
| Website creation and editing | Web Studio | Existing frozen page; no changes |
| App analysis, brand DNA, link building, release health, URL analysis | App Studio | Existing dedicated page |
| Assistant prompts, contextual workspace tools and feedback | Assistant | Dedicated page proposal; reuse existing runtime |
| Provider discovery, OAuth/API-key connection, readiness and disconnect | Personal Connections | Dedicated page proposal; secure detail/permission context |
| Project-level connection grants | Personal Connections | Connection detail/context; project ownership and grants remain enforced |
| Publish, deploy, inspect deployment, manage existing site, live URL update | Sites & Publishing | Dedicated operations page proposal |
| Workspace diagnostics and supported repairs | Workspace Repair | Existing dedicated page |
| Plan comparison and checkout entry | Plans & Billing | Existing Pricing route under Account |
| Billing/purchase records and token booster purchase | Plans & Billing | Page sections/details; server-verified states only |
| General/profile/appearance/workspace/notifications/editor/shortcuts/AI/privacy/security/plan/usage/boosters | Settings | 13 category deep links |
| Template administration | Admin Template Hub | Existing owner page |
| Plan/feature-gate administration | Admin Pricing | Existing owner page |
| User and account administration | Admin Users | Existing owner page |
| AI configuration/provider tests | Admin AI Brain | Existing owner page |
| Identity/auth administration | Admin Identity | Existing owner page |
| Backend/environment diagnostics | Admin Backend | Existing owner page |
| Logs and measured platform telemetry | Admin Telemetry | Existing owner page |
| Broadcast composition and delivery status | Admin Broadcasts | Existing owner page |
| Platform owner overview | Admin Overview | Existing owner page |
| FAQ, legal and support entry points | Help & Support | Existing FAQ route under Account |

Web Studio's internal action/menu map remains exclusively in the Stage 1 preservation register and its existing tests. This Stage 2 map deliberately does not restate or redesign those internals.

## 7. Access, data and security boundaries

- **Authentication:** preserve Firebase authentication/session lifecycle. Signed-out users reach the existing auth gate; account pages must not load another user's data.
- **Authorization:** enforce owner/admin/RBAC checks on the server for every privileged operation. Admin navigation is a convenience, never the permission boundary.
- **Ownership:** project, site, connection and deployment detail routes validate user/workspace ownership before returning data.
- **Entitlements:** existing plan gates, trials, quota and usage rules remain authoritative. A route being visible does not grant a paid capability.
- **Connections:** secrets remain in the existing secure connection service; never expose API keys in route params, breadcrumbs, logs or browser-visible metadata.
- **Payments:** checkout return pages and purchase details rely on server verification/webhook state. A redirect or local history item is not payment proof.
- **AI:** preserve Cloudflare Workers AI as the OVYX product inference boundary and existing quotas/budget/refund rules. This architecture does not change provider configuration.
- **Data layer:** preserve the distinction between the custom endpoint health check and existing authenticated project sync. Do not imply that the Settings endpoint provisions a database.
- **Privacy:** route metadata and telemetry must not leak personal or sensitive values. Avoid logging full URLs containing identifiers or tokens.
- **Destructive actions:** deletion, session revocation, disconnect and role changes use explicit confirmation and clear outcome states.

## 8. Page chrome and interaction consistency

The global shell and each page family share these interaction rules:

- One primary action per page header where a clear primary task exists; additional actions are secondary or in a labelled overflow menu.
- Search, filter and sort controls stay near the collection they affect and preserve their state only when that improves return navigation.
- Save actions distinguish idle, dirty, saving, saved and failed states. A saved toast appears only after persistence succeeds.
- Long-running actions show progress and allow safe navigation where supported; do not report “complete” before server confirmation.
- Destructive actions identify the affected object and consequence; cancel is always available until the operation begins.
- Empty states explain what belongs here and offer the next valid action; they do not fabricate example records.
- Error states distinguish network failure, permission denial, validation failure, provider unavailability and server failure.
- Modal/dialog patterns are reserved for short, focused tasks. Multi-step or long-lived work belongs on a page.
- All controls have labels, keyboard support, visible focus and accessible status announcements.
- Motion is restrained and consistent; preserve reduced-motion support and avoid layout-affecting animation on large collections.

## 9. Migration plan and compatibility safeguards

This Stage 2 document approves the intended information architecture as a proposal for the later implementation stages. It does not authorize a broad-bang route rewrite.

| Migration slice | Planned work | Required safeguards |
|---|---|---|
| A. Route registry foundation | Introduce a central route descriptor registry without changing rendered pages | Snapshot current IDs/aliases; test `switchView()`, fallback, active state, gates and route events |
| B. Global shell contract | Align sidebar grouping, topbar, breadcrumb and page-header contracts | Logo pixel/asset identity test; mobile drawer keyboard/focus tests; preserve Web Studio mount |
| C. Dedicated destinations | Add Personal Connections, Assistant and Sites & Publishing destinations around existing feature modules | No duplicate service logic; owner/permission checks; loading/error/empty states; deep-link tests |
| D. Settings deep links | Give the 13 categories stable child destinations/anchors under Settings | Trace every existing control, persistence key and API; no dropped panels; preserve legacy links |
| E. Contextual detail pages | Add project/template/connection/site/deployment/purchase detail routes where data supports them | Ownership validation, route parameter validation, safe back navigation and server-backed data |
| F. Legacy alias compatibility | Keep `help`, `code`, `code-workspace` and `workspace` aliases working | Regression tests and explicit Web Studio freeze check |
| G. Final navigation verification | Exercise direct links, reload, mobile, role/entitlement and route lifecycle matrix | Existing suite plus new route/navigation browser coverage; no fake click evidence |

Order of implementation should follow dependencies, not the table's visual order. No file extraction or runtime ownership change should happen until route registry and regression tests are in place.

### 9.1 Rollback strategy

- Keep the old route IDs and aliases operational while the new navigation is introduced.
- Gate additive routes behind their actual implementation and server-side permission checks.
- Prefer small, reversible route/shell changes over replacing the entire router.
- If a destination fails its acceptance tests, remove its navigation exposure and keep the existing feature entry point intact; do not delete the feature.
- Do not rewrite project/connection/site persistence to fit the navigation model.
- Any rollback must retain Firebase identity, entitlement checks, Cloudflare API boundary, Workers AI routing, Personal Connections grants, payment safety and existing Web Studio behaviour.

## 10. Stage 2 acceptance checklist

Stage 2 is complete when the architecture deliverable answers and records all of the following:

- [x] Every current route has an explicit parent, purpose and owner.
- [x] Every major current feature family has a destination or contextual placement.
- [x] Dedicated-page candidates are distinguished from dialogs, tabs and local panels.
- [x] All 13 Settings categories have stable page-level deep-link targets.
- [x] Personal Connections, Assistant and Sites & Publishing have explicit dedicated-page proposals tied to existing modules.
- [x] All nine existing Admin destinations remain separate, owner-only pages.
- [x] Current route IDs and aliases have a compatibility contract.
- [x] Breadcrumb hierarchy, page metadata and global navigation behaviour are defined.
- [x] Full-width/workbench and readable-form layout rules are defined.
- [x] Responsive behaviour is defined for 320, 390, 768 and 1440 pixel viewports.
- [x] Authentication, authorization, ownership, entitlements, connections, payments and AI boundaries are recorded.
- [x] Existing logo and complete Web Studio experience are explicitly frozen.
- [x] Migration order, tests and rollback strategy are specified.
- [x] No runtime/product code was changed by this architecture-only stage.

**Not claimed by this deliverable:** that proposed new routes already exist, that browser layouts have been implemented, or that a user interface has already been visually accepted. Those are later implementation and verification tasks.

## 11. Stage 3 handoff boundary

Stage 3 may define and implement the shared visual design system against this architecture. It must preserve the approved page hierarchy, exact existing logo, Web Studio freeze, responsive rules, accessibility contract, and the security/data boundaries above. Stage 3 should not silently expand into route implementation or change the feature ownership defined here.
