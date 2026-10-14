# OVYX Legacy Branch Audit — 12 October 2026

## Purpose

This audit compares historical PRs #39, #35, #29, #21, and #17 with the current `main` after the AI Assistant Workspace stages 1–6 were consolidated. Historical PRs were not merged wholesale. The missing behaviour that was still useful was ported into current code with focused regression tests; all five older PRs are now closed with an explanation.

## Findings and disposition

### PR #39 — Web Studio multi-page generation

**Disposition: closed without merge; keep the newer Web Studio implementation.**

The current `main` contains `functions/_lib/multi-page.js`, `functions/_lib/studio-multipage.js`, maintained multi-page orchestration and dedicated tests. The current implementations evolved beyond the older PR. Replacing them with the old orchestrator/gateway or inline `index.html` patch risks removing later fixes. The prompt-route fix that defines `promptText` is already present in `functions/api/ai/assistant.js`.

This audit and the AI Assistant Workspace work do not change Web Studio generation/build code.

### PR #35 — Earlier native AI Assistant Workspace

**Disposition: closed without merge; no duplicate workspace runtime.**

The historical PR introduces an older `assets/ovyx-ai-workspace.js` and a competing version of `functions/api/ai/ovyx.js`. Current `main` uses `assets/ovyx-assistant-workspace.js`, the native implementation under `functions/_lib/ovyx-native-ai.js`, and authenticated workspace tools. The current experience includes read-only source inspection, the bounded tool loop, guarded patch approval, backup/read-back verification, recovery history and undo safeguards. Copying the old runtime alongside the newer one could create duplicate event handlers and conflicting UI behaviour.

### PR #29 — Task-aware provider routing, availability, quota feedback and notifications

**Disposition: closed after its missing behaviour was selectively ported.**

Current `functions/_lib/providers.js` retains task-based preferences and explicit-provider isolation. Automatic routing now skips providers without configured server credentials and only uses Workers AI when its real binding exists; if no provider is available it returns a clear configuration error.

The missing selected-provider check was added as authenticated `/api/ai/provider-availability` with the browser integration in `assets/ovyx-provider-availability.js` (PR #53). It probes fixed provider endpoints with a timeout, puts keys in server-side authorization headers only, does not include secrets in responses, and handles stale selector requests. Safe notification rendering, motion and accessible quota-meter attributes were also ported to the current `index.html` (commit `eee6dcec`). Tests cover provider routing, the availability endpoint and desktop/mobile selector behaviour.

The historical branch's full frontend snapshot is still not safe to merge.

### PR #21 — Authentication, Universal Connections and encrypted secrets

**Disposition: closed without replacing the current connection API; missing readiness checks were ported in PR #56.**

The maintained `functions/_lib/universal-connections.js` uses AES-GCM encryption, owner-scoped records, redaction of encrypted credential data from public responses, and URL/target safety checks. `functions/api/settings/connections.js` uses that helper; the historical PR contains a divergent route that would overwrite newer protocol and ownership safeguards.

Current `functions/api/health.js` now checks that `OVYX_CONNECTION_ENCRYPTION_KEY` is present and at least 32 characters, without returning its value. Workspace activation reports only non-secret readiness metadata. The most recent completed production diagnostics before the Sentinel scan-budget refinement reported Cloudflare Pages deployment success, zero detected deployment-log errors, and `/api/health` healthy (HTTP 200). This verifies the health/configuration path, **not** a full signed-in test of every saved Universal Connection.

An existing encryption key must not be rotated without a migration/recovery plan for previously saved encrypted credentials.

### PR #17 — Historical frontend recovery

**Disposition: closed without restoring the old `index.html` snapshot.**

This branch predates substantial current UI, routing, provider-selection and workspace changes. A broad frontend replacement is not a safe method of fixing an individual regression. Any specific missing behaviour must be patched against current `main` with static and browser tests.

## OVYX Sentinel and remaining live setup

The administrator-only Sentinel panel, saved health reports, explicit opt-in wake word and safe voice responses are in current `main` (PR #51). The **Prepare fix plan** action converts saved status codes into a bounded advisory checklist. It does not edit source, change settings, rotate secrets or deploy (PR #57). First-party health probes run concurrently so serial timeouts cannot consume the separate Cron Worker's full request budget (PR #58).

The separate `ovyx-sentinel-scheduler` Worker was deployed and verified on October 13, 2026, by the [Deploy OVYX Sentinel Scheduler workflow](https://github.com/thompsonemmanuel117-sketch/ovyx/actions/runs/38478170471). The workflow confirmed the `*/30 * * * *` Cron trigger and completed an authenticated scheduled scan stored with `status=healthy`, `critical=0`, and `warnings=0`. It configured only the Sentinel-specific `OVYX_SENTINEL_CRON_SECRET` for the existing Pages endpoint and the separate Worker, then deployed the current application source; it did not reset other Cloudflare secrets or modify AI-provider availability configuration. Continue checking the owner-only Sentinel panel for fresh scheduled reports: a previously successful deployment does not guarantee that every future run remains healthy. The optional read-only `OVYX_SENTINEL_GITHUB_TOKEN` enables GitHub Actions status checks; it is not required for core endpoint checks. No secret values belong in Git.

## Safety and verification rules

1. Compare behaviour and tests, not only file names or commit counts.
2. Prefer current implementations where an old branch is a superseded duplicate.
3. Port missing behaviour as a small, reviewable patch rather than copying a divergent file.
4. Never commit provider keys, Firebase credentials, GitHub tokens or encryption material.
5. Keep Web Studio generation/build code unchanged unless a specific Web Studio defect is identified and its narrow fix is tested.
6. Do not claim production account flows or background scheduling are complete solely because unit and browser tests pass; confirm the applicable environment and saved runtime state.

## Result

All five audited historical PRs (#39, #35, #29, #21 and #17) have been closed with a comment explaining why their stale snapshots should not be merged. Useful gaps were selectively ported and tested in current `main`; no wholesale historical snapshot was merged. The AI Assistant Workspace stages 4–6 remain separate from Web Studio, and current desktop/mobile browser tests exercise the workspace, Sentinel and provider-availability UI. The remaining external setup is deployment/configuration of the separate scheduled Sentinel Worker.
