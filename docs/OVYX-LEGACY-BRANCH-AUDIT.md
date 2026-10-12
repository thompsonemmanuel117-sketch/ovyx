# OVYX Legacy Branch Audit — 12 October 2026

## Purpose

This audit compares the historical work in PRs #39, #35, #29, #21, and #17 with the current `main` implementation after the AI Assistant Workspace stages 1–6 were consolidated. The goal is to preserve useful functionality without blindly merging historical snapshots over newer code.

## Findings and disposition

### PR #39 — Web Studio multi-page generation

**Disposition: do not merge the historical branch wholesale.**

The current `main` already contains `functions/_lib/multi-page.js`, `functions/_lib/studio-multipage.js`, the multi-page routing in the current orchestrator and AI gateway, and dedicated multi-page tests. The current implementations differ from the older PR branch and have evolved since it diverged. Replacing them with the old orchestrator/gateway or old inline `index.html` patch risks removing later fixes. The prompt-route fix that defines `promptText` is already present in `functions/api/ai/assistant.js`.

Next verification is to keep running `npm test`, `npm run validate`, and the Web Studio browser/build checks on any further multi-page changes. This audit itself does not alter Web Studio generation code.

### PR #35 — Earlier native AI Assistant Workspace

**Disposition: no duplicate workspace runtime.**

The historical PR introduces a separate `assets/ovyx-ai-workspace.js` and `functions/api/ai/ovyx.js`. The current `main` uses the later `assets/ovyx-assistant-workspace.js`, the native assistant implementation under `functions/_lib/ovyx-native-ai.js`, and the authenticated workspace-tools API. The current runtime also includes the completed saved-project read-only tool loop and guarded patch/recovery path. Adding the old runtime alongside the new one would risk duplicate event handlers and competing UI behaviour. No file from PR #35 should be copied wholesale.

### PR #29 — Task-aware provider routing and provider availability

**Disposition: preserve current routing; reuse the safer current status route rather than duplicate the old endpoint.**

The current `functions/_lib/providers.js` already has deterministic task-based preferences in `taskProviderPreference()`, keeps explicit provider choices exclusive, observes configured provider order, and supports the current Groq/Workers AI paths. The current provider-routing tests also assert task-specific preferences and that an explicit selection cannot silently switch providers.

The old branch adds `functions/api/ai/provider-availability.js`. The current `functions/api/ai/status.js` already performs live provider checks and restricts platform-key checks to an administrator, while `functions/api/service-status.js` separately reports configuration-only status. The older endpoint would duplicate that function and its broader signed-in access model is not a safer replacement. Do not introduce a second provider-health surface unless a concrete current UI integration requires it.

### PR #21 — Authentication, Universal Connections, and encrypted secrets

**Disposition: preserve the newer current implementation; do not replace it with the historical route.**

The current `functions/_lib/universal-connections.js` already encrypts connection credentials using AES-GCM with `OVYX_CONNECTION_ENCRYPTION_KEY`, keeps encrypted values out of public connection objects, uses owner-scoped connection records, rejects credential-bearing URLs, and blocks common local/private network targets. The active `functions/api/settings/connections.js` calls this current helper. The current `functions/api/service-status.js` and `functions/api/health.js` already report encryption-key configuration.

The older PR #21 connection route is a divergent rewrite using an older module/API shape and would overwrite later protocol, ownership, and URL-safety functionality. It should not be merged. The remaining operational check is to verify that `OVYX_CONNECTION_ENCRYPTION_KEY` is configured in the live Cloudflare Pages environment and that existing connections can still be tested after deployment. No secret values belong in Git.

### PR #17 — Historical frontend recovery

**Disposition: do not restore an old `index.html` snapshot over current `main`.**

This branch is substantially behind the current project and predates many present-day UI, routing, provider-selection, and workspace changes. Its broad `index.html` replacement is not a safe way to recover one missing feature. Any specific regression should be fixed against the current main frontend with a narrow patch and the existing static and browser tests.

## Safety rules

1. Compare behaviour and tests, not only file names or commit counts.
2. Prefer the current implementation where an old branch is an obsolete duplicate.
3. Port a missing behaviour as a small, reviewable patch rather than copying a divergent file.
4. Never place real provider keys, Firebase credentials, or encryption material into source control.
5. Keep Web Studio generation/build code unchanged unless a specific Web Studio defect is identified and its narrow fix is tested.
6. A green mocked/unit/browser test is not proof that production secrets, authenticated accounts, or the live Cloudflare schedule are configured. Those still need environment-level verification.

## Result

No wholesale merge from these historical branches is justified by the inspected comparison. Several of their important features are already represented by newer code on `main`; the old provider availability route is functionally superseded by the current administrator-only live status route. The next concrete work should target verifiable gaps in current `main`, with tests and deployment checks, rather than merging stale snapshots merely to clear the branch list.
