# OVYX Stage 10 — Safe provider retirement and dependency audit

**Audit scope:** current `main` source tree as inspected for Stage 10, plus the isolated branch `stage10-provider-retirement-safe-audit`.

## Decision

**The user-facing selector retirement is already in place through Stage 8. Full integration retirement is not yet authorized.** Keep the currently deployed production secrets untouched and retain the legacy adapter as a deliberate rollback option until the guarded engine has passed real deployed acceptance for every dependent feature and the production mode has been confirmed through the owner-only diagnostics path.

This is a release gate, not permission to delete provider integrations based on names or a green mocked test. No production secret values were read, changed, rotated or removed by this work.

## Dependency map

| Surface | Current source/reference | Stage 10 disposition |
|---|---|---|
| Ordinary OVYX assistant | `assets/ovyx-assistant-workspace.js` → `POST /api/ai/ovyx` → `functions/_lib/ovyx-native-ai.js` | Uses Cloudflare Workers AI in guarded mode. A signed-in user's explicitly selected Universal Connection may still be honored for ordinary assistant chat; it is not an implicit fallback and must remain explicit/exclusive. |
| Web Studio and App Studio | `functions/api/ai/assistant.js` and `functions/api/ai/gateway.js` import `functions/_lib/providers.js`; generation helpers receive its model-call function | Active compatibility seam shared by website/app generation. Do not delete or change until real per-feature acceptance proves guarded generation works and output/validation/repair flows pass. |
| Agent Mode | `functions/api/generate.js` → `functions/_lib/orchestrator.js` → `callJsonModel` in `functions/_lib/providers.js` | Active dependency seam. Keep orchestration, multi-call usage accounting, cancellation/streaming and rollback controls; require an actual accepted Agent run before retiring provider adapters. |
| Main provider adapter | `functions/_lib/providers.js` | In guarded modes it routes through the Cloudflare Workers AI path before considering legacy routing. Legacy provider calls are enabled only when `OVYX_AI_ENGINE_MODE=legacy-provider-routing` **and** `OVYX_ALLOW_PAID_PROVIDER_ROUTING=true`. Retain this path temporarily for deliberate rollback; never infer its production state from source alone. |
| Legacy/duplicate adapter family | `functions/_lib/brain/providers.js`, `functions/api/_lib/brain/providers.js`, `functions/api/_lib/providers.js` | Similar adapters exist. Keep until an exhaustive import/route map proves each is unused in current and supported rollback paths. A nested API route and historical shell references make a name-only deletion unsafe. |
| Owner AI diagnostics and direct probes | `functions/api/ai/status.js`, `functions/api/ai/provider-availability.js`, `functions/api/test-provider.js`, `assets/ovyx-additional-ai-provider-diagnostics.js`, `assets/ovyx-provider-availability.js`, `functions/api/service-status.js`, `functions/api/health.js` | Status and config endpoints are not proof of inference. The owner AI status, provider-availability, and provider-test endpoints now mirror the runtime mode gate: guarded and unconfigured/disabled modes do not probe external provider APIs. Health/service-status may still report whether old secret names are present; they do not authenticate or generate. Retain legacy diagnostics during rollback; remove UI and routes together only after checking all callers. |
| Owner routing settings | `functions/api/admin/ai-config.js` and related admin UI | Provider ordering is relevant only to legacy routing. Do not remove/alter persisted admin settings before confirming the intended rollback and its access controls. Once legacy routing is retired, remove both the UI and stored-config reader in one tested migration. |
| Sentinel diagnostics and admin companion | `functions/_lib/ovyx-sentinel.js`, `functions/api/admin/sentinel.js`, `functions/api/admin/sentinel-companion.js`, `assets/ovyx-sentinel.js`, `assets/ovyx-additional-ai-provider-diagnostics.js` | Sentinel's read-only provider credential probes now run only when the explicit legacy rollback mode is enabled. In guarded or unset/disabled mode, each old-provider probe is recorded as skipped and makes no external provider request. The Sentinel companion still imports the shared router as an admin helper; keep it as a tracked dependency until its guarded-mode behavior and production acceptance are verified. |
| Account-owned Universal Connections | `functions/_lib/universal-connections.js` and the selected-Brain call path | Not equivalent to the old platform-owned API-key router. Users may explicitly connect their own AI Brain; failures must remain exclusive and quota-safe. Do not remove this feature as a side effect of provider retirement without an explicit product decision. |
| Search, image, speech and other modality services | `functions/api/ai/web-search.js`, `functions/api/ai/image-generation.js`, browser speech APIs and related clients | Separate capabilities, not all text-model integrations. Do not label them migrated simply because ordinary text chat uses Cloudflare. Their own credentials, quota, privacy and acceptance requirements need separate treatment. |
| Internal live-generation evaluation | `functions/api/internal/live-generation-eval.js` | Uses the shared model adapter for guarded smoke/evaluation workflows and still contains provider-preflight cases. This is a controlled acceptance dependency, not a user-facing selector. Keep it until guarded live evaluation passes, then prune obsolete provider-specific cases with the same review. |

## Safety hardening delivered in this branch

- Admin `GET /api/ai/status` reports a small allowlisted `engineMode` value, `legacyProviderRoutingEnabled`, and whether external API keys are required. It never returns a secret value.
- The status endpoint checks `isCloudflareWorkersAIGuardedMode`, not just free-only mode, so both guarded Cloudflare modes avoid external provider probes.
- If engine mode is missing/unsupported, or the legacy mode string is present without the explicit paid-routing acknowledgement, the diagnostics endpoint reports integrations as disabled and makes no provider network calls.
- Real external model-list checks in the AI status, provider-availability and direct provider-test endpoints run only when legacy routing is explicitly enabled. These checks are configuration/connection probes, not proof of generation. The legacy direct test endpoint and Sentinel probes are gated in both free-only and paid-capped guarded modes.
- Sentinel's scheduled credential diagnostics also skip all old external provider probes unless the same explicit legacy-routing mode is enabled. Production secret presence may still appear as configuration metadata in health endpoints but is not read, changed, or used to imply that a retired provider is live.
- Regression tests cover free-only, paid-capped, unconfigured, legacy-disabled and legacy-enabled outcomes. Existing secret redaction and owner authorization assertions remain.

## Static reference scan performed

A targeted source scan covered all 179 JavaScript/ES module files under `functions/` and `assets/` present in the inspected main tree. It identified shared-router imports from Assistant, Gateway, Agent orchestration, the Sentinel admin companion, and the internal live-generation evaluator; direct provider health probes in the status, availability, provider-test and Sentinel modules; and duplicate adapters reachable through the nested legacy AI-tools route/orchestrator. Account-owned Universal Connections are a separate feature and are not to be swept up in platform-owned provider retirement.

This source scan does not replace a full audit of the large inline `index.html`, CI workflows, external Cloudflare runtime configuration, or real production acceptance. The current main-shell provider selector removal is covered by the Stage 8 regression contract, but the remaining HTML/admin script loading and runtime mode still require release verification before code deletion.

## Required evidence before deleting old integration code

1. Confirm deployed production mode through the owner-only status route after the branch is released. Expected mode must be the intended guarded mode; do not print raw bindings or values.
2. Run and record real, bounded acceptance through ordinary chat, Web Studio build/repair, App Studio build/fix and Agent Mode. Include actual routed-engine metadata from responses; mocked calls do not count.
3. Verify Free/Pro/Max entitlement checks, token quota reservation/settlement/refunds, daily Workers AI limits, selected-Brain exclusivity, structured output validation, Web Studio preview/approval and Agent cancellation/rollback.
4. Perform the import/caller audit on the exact release commit, including dynamic imports, inline main-shell handlers, Workers/Pages routes, admin scripts, tests, CI workflows and historical-but-deployed paths. Classify each reference as active, rollback, diagnostics, tests/docs or dead code and link the evidence.
5. Preserve all production secrets during migration. Disable legacy routing by confirming the safe runtime mode, not by deleting secrets. Do not rotate/remove any provider credential until after the rollback window and confirmed stable use of the replacement.
6. Only then remove the legacy provider-order surface, direct external adapter implementations, and truly unused duplicate adapters/endpoints as a separate reviewable change. Keep the rollback commit/reference and its validated instructions available during the agreed stability window.
7. Run the full test suite, static verification, build and Wrangler checks, plus the applicable real production acceptance before closing Stage 10.

## Evidence boundary / current status

The checked source confirms that guarded routing is implemented and that external-provider routing is gated by two explicit settings. The repository contains live references from the generation routes to the shared adapter and contains duplicate adapter modules and owner diagnostics. The latest recorded live-acceptance notes also contain a provider-readiness failure and do not demonstrate that all real production generation paths passed under the guarded engine.

This session does not have a supported means to inspect the Cloudflare Pages production runtime configuration or run authenticated, billable production acceptance as the owner. As a result, this branch does **not** claim that production is confirmed to be on the guarded engine or that all integrations are safe to delete. Stage 10 remains open until the release gates above have evidence. Keeping secrets and a rollback route intact is the safest correct outcome until then.
