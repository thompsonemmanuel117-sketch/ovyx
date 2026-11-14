# OVYX Stage 5 — Dashboard consolidation and owner overview

## Current Home dashboard

The additional Stage 5 “Your Command Centre” section has been removed after a duplicate-feature audit. The everyday Home dashboard now uses its existing built-in overview, build composer, workspace quick actions, Projects library and notification entry points without inserting a second dashboard panel.

The removal is deliberate and limited to the duplicate Home section:
- No second project-count, draft-count or page-count panel is mounted.
- No duplicate recent-activity or notification preview is rendered.
- No extra Home-only health polling or project-store refresh hook is installed.
- Existing Home dashboard content and its original project, navigation and notification flows remain in place.

## Existing owner-only Admin Overview

The existing `admin-overview` remains inside the server-verified Admin Workspace. The owner overview presentation safeguards are retained:
- The hard-coded `Total Projects = 1` card is removed because it was not a platform-wide project count.
- The hard-coded `Security Isolate = ACTIVE` card is removed because a static label is not a live security verification.
- The AI status-check metric remains connected to the existing owner-authorized status runtime and is labelled accordingly.
- Account telemetry remains labelled as an account sample, not a total account count.
- Existing live health, plan catalog, account sample and Sentinel report checks remain in place.
- The Admin overview retains its responsive content layout and existing module directory/routes.

The removal does not add routes, change Firebase identity, broaden owner authorization, or replace the Admin Workspace.

## Verification

The dashboard de-duplication contract remains part of `npm test`. The dedicated Chromium workflow checks desktop and mobile Home dashboards, verifies the original Home hero remains present, and proves that Home navigation does not recreate the removed duplicate. Existing Admin Workspace and owner-controls regression workflows remain independent.
