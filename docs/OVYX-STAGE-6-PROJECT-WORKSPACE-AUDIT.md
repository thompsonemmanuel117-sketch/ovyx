# OVYX Stage 6 — Project and Workspace Management Audit

**Audit date:** 2026-11-06  
**Audited mainline:** `d30e17d42b6a2a2ce05ba116103b657b0f7feba4`  
**Scope:** Existing Projects route, active-project selector, project persistence/synchronisation, ownership boundaries, recovery and the workspace identity model.  
**Status:** Initial evidence-based audit. This is not Stage 6 completion.

## 1. Existing functionality to preserve

The current platform already contains:

- A dedicated Projects route with project cards, search and status/recent filters.
- Project creation, opening, duplication and deletion.
- Project page counts, status and update-date metadata.
- Local project persistence using account-scoped storage keys.
- Authenticated Firestore persistence through `/api/projects`.
- Local recovery snapshots for deleted projects and a restore path.
- Workspace-aware assistant context and project-source tooling.
- Settings controls for project-open behavior and autosave.

These are existing capabilities, not reasons to rebuild the Projects page or introduce another project store.

## 2. Confirmed implementation ownership

### Project model and local persistence

The foundation runtime in `index.html` owns `KernelState.projects`, `KernelState.activeProject` and `ProjectStore`. Its local cache keys are scoped by Firebase UID:

- `ovyx.projects.v22.user.<uid>`
- `ovyx.projects.v22.guest`

The existing client store and its wrappers must remain the source of truth until a deliberately tested migration replaces them.

### Server persistence and account ownership

`functions/api/projects.js` is the authenticated project persistence endpoint.

- It requires an authenticated Firebase user with a verified email identity.
- Documents are stored under `users/{email}/projects/{projectId}`.
- Reads filter both `ownerUid` and normalized `ownerEmail`.
- Updates reject an existing document owned by another UID/email pair.
- Deletes verify the same ownership pair before removing a document.
- Payload size is bounded at 950,000 bytes.
- Firestore writes use the existing document update-time precondition.

Do not weaken this boundary or move ownership checks into client-side UI.

### Project deletion and recovery

The existing project-list deletion confirmation snapshots the project through `OVYXProjectRecovery` before removing it from the local list. The authenticated cloud-sync layer then issues the owner-scoped server deletion. The separate active-project deletion flow also has its own recovery and remote-delete path.

Deletion and restore tests must use disposable project IDs and isolated accounts. A local recovery snapshot must never be presented as proof that the remote Firestore record was restored.

## 3. Confirmed Stage 6 gaps

1. **The sidebar control is labelled as a workspace selector but actually opens a project chooser.** Its final runtime implementation uses `window.prompt()` and a numeric list of only the first eight projects. It has no search, current-project indication, project metadata or accessible in-app dialog.
2. **Workspace identity and active-project identity are not clearly separated.** The sidebar's “Creative Workspace” text is a label, while the selection action chooses a project. The existing workspace activation API activates a user workspace profile; it is not evidence of a multi-workspace/team-membership selector.
3. **Project-management controls are distributed across several runtime generations.** The project card, create modal, open preferences, deletion modal, recovery and cloud sync are extended at different points in the large application shell. Any cleanup must preserve the final effective method wrappers and event order.
4. **More than one authenticated project-sync implementation is present.** The legacy `ProjectCloudSync` and the later `OVYXProjectCloudSync` both attach authentication behavior and persist to `/api/projects`. The v3 project-isolation layer also references the legacy sync contract. Removing or merging these systems without an explicit ownership/timing map could cause duplicate writes, stale cache restoration or lost updates.
5. **There is no evidence in the current route inventory of a complete multi-workspace management experience** covering workspace creation, membership, role assignment, switching and project membership. Do not invent those capabilities from the existing workspace activation/profile endpoint.

## 4. First Stage 6 implementation slice

PR #409 adds an accessible, responsive project picker while preserving the existing project model and open action.

- Reads the existing `ProjectStore.list()` result.
- Shows every project returned by that store rather than limiting the list to eight.
- Adds live search, active-project state, status and page metadata, empty and no-match states.
- Delegates selection to the existing `ProjectStore.open()`, preserving Settings' configured open behavior.
- Hands “Create project” to the existing creation flow.
- Does not modify the Firestore schema, project endpoint, cloud-sync engines, Firebase identity, Web Studio, App Studio, Admin permissions, AI routing or existing project data.

The selector is intentionally titled “Switch project” inside the dialog. The outer sidebar workspace label remains unchanged until workspace and active-project identity are designed together.

## 5. Next audit and implementation sequence

1. Test the new picker on desktop and mobile with multiple projects, filtering, empty results, keyboard Escape, focus restoration, current-project indication and the existing create/open actions.
2. Trace the exact initialization order and wrappers for `ProjectStore.save`, `ProjectStore.open`, `ProjectCloudSync`, `OVYXProjectCloudSync`, `OVYXDeepRepairV3` and `OVYXProjectRecovery`.
3. Add isolated account-boundary tests for sign-in, sign-out, account switching, empty remote inventory, stale local cache, concurrent writes, offline retry, deletion and restore.
4. Define whether OVYX supports one personal workspace per account or multiple workspaces with memberships. Only then design the workspace entity, switcher and role/membership operations.
5. Audit project rename, archive, status, ownership transfer and collaboration capabilities before adding UI. Do not add nonfunctional controls or duplicate existing actions.
6. Preserve all existing project data and use Firestore update-time preconditions for any server-side write changes.

## 6. Acceptance boundary

This first slice is not the whole Stage 6. Stage 6 remains open until project management, account isolation, synchronization reliability, workspace identity, desktop/mobile behavior and regression suites have been verified together. A successful PR merge alone does not complete the stage.


## 7. Workspace-management implementation candidate

The Stage 6 branch now adds a separate owner-managed workspace entity without replacing the existing project store.

- `functions/api/workspaces.js` provisions the deterministic personal workspace and supports authenticated list, create, rename/update, archive and restore operations.
- Workspace documents live at `users/{firebaseUid}/workspaces/{workspaceId}`; reads and writes require both the authenticated UID and normalized email to match the stored owner.
- The existing `functions/api/projects.js` contract now associates projects with a workspace. Legacy projects without an association are treated as personal, avoiding a bulk migration or destructive rewrite.
- Workspace-scoped project inventory and project-detail reads remain owner-verified. Archived workspace projects remain readable, but new writes to archived workspaces are rejected.
- The existing project picker and the existing Projects page renderer now both use the selected workspace. Workspace selection, create/rename/archive/restore, project filtering/search and project status/page-count/description/last-updated metadata are integrated while the full project store is restored after filtered rendering. Existing ProjectStore create/open/save methods remain the execution path.
- Workspace state is loaded at app startup and refreshed on Firebase auth changes; late responses from a previous account are ignored, and the preference is stored per Firebase UID.
- The active workspace preference is scoped to the signed-in Firebase UID. Opening a project restores its workspace; newly saved projects inherit the selected workspace.

### Collaboration boundary

The current repository still has no verified workspace membership/invitation/team-role model. This implementation does not claim team collaboration is available and does not add fake member controls. Only the authenticated owner can manage the new workspaces.

### Remaining verification before Stage 6 completion

The implementation candidate is not complete until the desktop/mobile browser workflow, workspace API integration tests, full repository regression suite, account-switching and project-sync behaviour all pass. The merged commit must also be deployed and its runtime health checked before Stage 6 is declared complete.
