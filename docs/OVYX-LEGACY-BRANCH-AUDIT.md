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

**Disposition: selectively port the missing user-facing feature; retain the newer current task classifier.**

The current `functions/_lib/providers.js` already has `taskProviderPreference()`, explicit-provider exclusivity, configured-order handling, and Groq/Workers AI paths. The older branch's alternative task-classifier should not replace it. However, the current router previously attempted providers even when their server credentials were absent, and its automatic route lacked the specific friendly error for an empty set of usable providers. The follow-up branch adds filtering to configured providers, preserves Workers AI as a real-binding-only final fallback, and adds regression tests for the zero-credentials and partially configured cases.

The old branch also adds `functions/api/ai/provider-availability.js` plus a selector UI check. The current `/api/ai/status` route is admin-only, so it is not a substitute for the signed-in user-facing availability check used when a user selects a provider. The follow-up branch selectively ports that authenticated, timeout-bounded endpoint and its UI wiring, with API keys held in request headers, never logged or returned, and a regression test for authentication, status mapping, and secret non-disclosure. It also carries over the safe notification DOM, toast motion, and accessible quota meter without replacing the whole historical `index.html`.

### PR #21 — Authentication, Universal Connections, and encrypted secrets

**Disposition: preserve the newer current implementation; do not replace it with the historical route.**

The current `functions/_lib/universal-connections.js` already encrypts connection credentials using AES-GCM with `OVYX_CONNECTION_ENCRYPTION_KEY`, keeps encrypted values out of public connection objects, uses owner-scoped connection records, rejects credential-bearing URLs, and blocks common local/private network targets. The active `functions/api/settings/connections.js` calls this current helper.

The historical PR #21 highlighted a real diagnostics gap: the current health route listed `OVYX_CONNECTION_ENCRYPTION_KEY` but did not treat a missing/short value as a required configuration problem, and the activation response did not clearly expose Universal Connections readiness. The follow-up branch makes the encryption key required, checks that it is at least 32 characters without exposing it, lists the connections/activation routes in health diagnostics, and exposes a non-secret Universal Connections readiness summary during workspace activation. It does **not** replace the newer connection handler.

The remaining operational check is to verify that the encryption secret is actually configured in the live Cloudflare Pages environment and existing connections can still be tested after release. No secret values belong in Git.

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
