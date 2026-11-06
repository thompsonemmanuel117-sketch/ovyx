# OVYX Stage 5 — Command Centre and dashboards

## Scope

Stage 5 upgrades the everyday Home experience into an account-scoped Command Centre and clarifies the owner-only Platform Command Centre. It builds on the existing Home composer, Workspace quick-action cards, Projects library, notification bell, Admin Workspace, design system and motion system.

The existing OVYX logo and the complete Web Studio surface remain unchanged.

## Everyday workspace Command Centre

The Home dashboard now adds a responsive overview after the existing build composer:

- Project count, draft count and saved page count are derived from the current account's existing \`ProjectStore.list()\` data.
- Latest project update is derived from the saved project's \`updatedAt\` timestamp.
- Recent activity lists saved projects with timestamps as **project updates**. It does not invent edits, publishes, deployments or user actions.
- Notification count reuses the existing \`OVYXAccountNotifications\` runtime and its authenticated broadcast inbox; it does not create a second notification store.
- Platform status reads only the public health endpoint's \`ok\` and \`status\` fields. The interface explicitly states that this is a platform health check, not proof that every integration works.
- Create Project, Projects, Web Studio and App Studio actions use existing project and router APIs.
- Metrics refresh after the existing project save flow, on Home navigation, when the page regains visibility and when the user requests a refresh.

Project figures are intentionally account-scoped. They are not presented as platform-wide totals.

## Owner-only Platform Command Centre

The existing \`admin-overview\` remains inside the existing server-verified Admin Workspace. The enhancement does not add admin routes or broaden authorization.

- The heading and description now clearly identify the owner-only Platform Command Centre.
- The hard-coded \`Total Projects = 1\` card is removed because it was not a platform-wide project count.
- The hard-coded \`Security Isolate = ACTIVE\` card is removed because a static label is not a live security verification.
- The AI status-check metric remains connected to the existing owner-authorized AI status runtime and is labelled accordingly.
- Account telemetry is labelled as an account sample, consistent with the endpoint's page-size-one request; it is not represented as a total account count.
- Existing live health, plan catalog, account sample and Sentinel report checks remain in place. Their copy continues to limit each claim to the component actually tested.
- The Admin overview receives a wider responsive content area while the owner module directory and all existing module routes remain intact.

No owner-only APIs are called from the ordinary user dashboard.

## Reliability and accessibility

- DOM text is written with \`textContent\`; project names are not interpolated into dashboard HTML.
- Health checks are bounded by a timeout, use \`cache: no-store\`, and have explicit loading, success and failure states.
- Health polling is limited to the Home route and pauses while the document is hidden.
- The layout adapts to desktop and mobile widths, supports keyboard focus and respects reduced-motion preferences.
- No charts are fabricated: the current product does not expose a trustworthy time-series activity/usage data contract for the everyday dashboard. A chart can be added when a real, authorized aggregation API exists.

## Verification

The Stage 5 contract test is part of \`npm test\`. The dedicated Chromium workflow exercises desktop and mobile Home dashboards, real project-store data flow, activity, platform health, notifications and existing route navigation. Existing Admin Workspace/owner-controls browser regressions continue to run independently.
