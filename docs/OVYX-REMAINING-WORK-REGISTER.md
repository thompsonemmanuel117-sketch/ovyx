# OVYX — Remaining Work Register

**Updated:** 2026-10-24  
**Purpose:** Keep unfinished work visible across AI migration and existing platform QA. Items close only when the listed evidence exists; a green build or mocked test is not proof of a live external service.

## AI migration stages

| Stage | Status | Evidence / exit requirement |
|---|---|---|
| Stage 1 — AI source and dependency audit | **Complete** | PR #243 merged. Audit covers routes, providers, model identifiers, quota/history, safety and known evidence gaps. |
| AI Preferences foundation | **Complete** | PR #244 merged as `d48d7d6a70efb1a9f54fd155b5cc7d64ab5c232e`. Account-scoped load/save/reset and settings-to-request propagation passed desktop/mobile browser tests and pre-merge checks. |
| Stage 2 — first local-model selection | **Complete** | PR #246 merged as `a4a114a188fac0943cc2c5b535261d59004c3133`. Qwen3.5-4B `q4f16_1` MLC selected as a **prototype candidate**, not yet integrated or quality-certified. |
| Stage 3 — local browser inference prototype | **Not started** | Pin the runtime and verify that the selected model actually loads on supported browsers/devices. Add explicit opt-in download, progress/cancel/retry, valid cache reuse, token streaming, cancellation, bounded memory/context and clear unsupported/low-storage errors. |
| Stage 4 — local intelligence benchmarks | **Not started** | Compare real outputs against a fixed suite: coding/debugging, single-page and multi-page websites, app scaffolding, project edits, bug repair and UI interactions. Record real outputs, latency, failures, browser builds, viewport screenshots and device class. No claim of equivalent intelligence until measured. |
| Stage 5 onward — reusable intelligence, project tools, staged feature migration | **Not started** | Migrate only after Stage 3/4 gates. Keep each feature reversible and retain existing paths until actual acceptance tests pass. |
| External-provider and duplicate-adapter retirement | **Blocked by migration** | Trace all callers/imports and production paths, then show no active feature depends on the old route before removing any adapter/secret. Never remove credentials as a shortcut. |

### Stage 3/4 non-negotiable gates

- Local-only inference must not silently fall back to Gemini, OpenAI, Anthropic, DeepSeek, Groq, OpenRouter or Cloudflare Workers AI. The UI must truthfully state which engine answered.
- Do not automatically download the approximately 2.39 GB candidate. The user must explicitly choose to download/run it and see size, progress, cancellation and cache status.
- Detect WebGPU/runtime incompatibility and memory/storage limitations. Do not leave the interface spinning indefinitely, freeze the main UI, or repeatedly download a valid cached model.
- Test with browser network capture that prompts, project source, attachments and history do not reach a remote inference endpoint in local-only mode. Public model hosting may deliver model files; it must not receive user prompts.
- Preserve sign-in and server authorization, quota/accounting policy, conversation history, safe project path/tool allowlists, destructive confirmation, cancellation, undo/rollback and recovery. If local usage has different cost/quota semantics, document and test it explicitly rather than bypassing controls.
- Validate model license and required notices when downloading/redistributing any model artifacts. The upstream WebLLM built-in list is a subset of MLC models and its documented Qwen family names Qwen2; Qwen3.5-4B may need a custom model record/build. Pin and verify the actual MLC/WebLLM runtime/model config; a model page alone is not proof of runtime compatibility. If incompatible, test the Qwen3-4B MLC artifact as a local-only alternative. Neither model may silently switch to a remote provider.
- If the 4B model is too weak, compare the 2B lower-resource option and 9B higher-resource option using the same test prompts. Treat large coding-specialized models as desktop/self-hosted candidates, not automatic mobile downloads.
- “Free” for this goal means avoiding per-prompt external inference charges when local inference runs on the user's own device; it does not mean unlimited speed, memory, battery, context, intelligence or every-device compatibility.

## Existing OVYX issues not to forget

| Item | Status | What closes it |
|---|---|---|
| Real production AI generation | **Not proven / provider blocker previously observed** | Use the current, safe provider preflight first. The post-merge trusted main run `40086196880` (2026-10-24) failed before full generation: Gemini HTTP 503 (provider server error), DeepSeek HTTP 402 (billing required), Claude/OpenAI HTTP 401 (authentication rejected), and Cloudflare Workers AI HTTP 429 (rate limit/quota). It generated zero websites. The same run's sanitized configuration audit reported no authoritative listings URL/authority flag and no approved public enquiry URL/external-probe opt-in. Fix the underlying service readiness and owner-approved data/delivery configuration before explicit full acceptance; do not treat model-list health or a push/preflight-only run as recovery. |
| Production website generation quality | **Not yet proven for the new local model** | Full generation of realistic prompts, saved outputs, deterministic integrity checks, build/load checks, screenshots at 320/390/768/1024/1440px, and manual review. Keep model acceptance separate from app-shell browser tests. |
| Authentic property listings | **Blocked until owner data source is configured and verified** | Use a real authoritative source or owner-controlled public-safe Cloudflare proxy. Verify provenance, active/inactive status, stable IDs, and that the generated property site displays real active feed records and excludes sold/withdrawn records. Never invent listings. |
| Real enquiry delivery on generated sites | **Not configured/proven in the prior acceptance record** | Owner-approved HTTPS public-safe endpoint, an explicit external-probe authorization, owner-controlled QA recipient and explicit delivery receipt. Get explicit user/owner authorization before sending actual test enquiries. A local fixture or HTTP 2xx alone does not prove delivery. |
| Email delivery | **Unproven** | Verify actual provider/sender configuration without exposing keys, then run a controlled owner-approved end-to-end email and capture a delivery receipt. A `RESEND_API_KEY` or `RESEND_FROM_EMAIL` name alone is not proof; current Settings copy must remain truthful until live delivery succeeds. |
| Token Boosters / credit fulfilment | **Real success path still requires verification** | Test a real or safe end-to-end authorized transaction: entitlement/payment verification, one-time balance credit, persistence after reload, duplicate replay/idempotency and failure/refund paths. Existing mocked failure tests do not prove purchase/fulfilment. Do not trigger a real charge without explicit approval. |
| Duplicate notifications / idempotency | **Needs end-to-end delivery confirmation** | Verify duplicate event/retry behavior on server and provider, exactly-once or explicitly idempotent semantics, and that failures do not generate repeated messages. Browser display tests alone are insufficient. |
| Connection and security labels | **Status wording is tested; production truth needs audit** | Make labels describe verified source and freshness: configured, connected, last check passed, service unavailable, or not verified. A saved connection or key name is not proof the service is healthy. Re-test after AI migration. |
| Provider/model labels | **Open — P2 from Stage 1** | Consolidate UI names/capabilities with the server-returned actual routed model/provider. Existing labels and source defaults conflict; do not advertise a model unless the response confirms it. |
| Duplicate/legacy AI provider adapters | **Open — P3 from Stage 1** | Trace route maps, imports, references and deployment paths. Add route-level regression coverage and prove unused before cleanup. Keep provider compatibility while current paths remain active. |
| Other modalities (image, voice/audio, transcription) | **Not inventoried to acceptance depth** | Trace each user-visible control to its actual implementation and test boundary. Do not assume a local text model replaces image generation, speech recognition, external search or audio services. |
| External web search | **Separate service/cost and dependency** | Map and label the current search source honestly. Local text inference does not itself replace retrieval/search, CORS, hosting or source data. Consider later local/public search options only after quality and license review. |

## Safety and release discipline

These are ongoing release gates, not optional cleanups:

- Preserve account authentication/authorization and server-side owner gates.
- Preserve Free/Pro/Max quotas and correct usage accounting; local inference must not make UI-only entitlement claims.
- Preserve conversation history behavior and avoid logging prompt/project contents in diagnostics.
- Preserve validated project paths, safe tool allowlists, explicit destructive-change confirmation, cancellation, undo and rollback/recovery.
- Never send private listing credentials, provider API keys, enquiry tokens or email keys to the browser, public model hosts, GitHub logs, screenshots or acceptance artifacts.
- Do not launch billable full-generation acceptance or real external enquiry/email probes as a routine CI side effect. Use the documented preflight, then explicit owner-approved acceptance.
- Keep current hosted AI routes available until each migrated feature has passed the same or stronger end-to-end tests. No wholesale removal or route switch before evidence.
- A workflow that is green because it used mocked responses, fixtures, or `preflight-only` does not count as proof of production generation/delivery.

## Evidence log

- Stage 1 audit PR #243: merged, audit source commit `e3c4ed3f911a957c930d0337a2b18eb4419c3e0d`.
- AI Preferences PR #244: merged, `d48d7d6a70efb1a9f54fd155b5cc7d64ab5c232e`; desktop/mobile Preferences tests and pre-merge checks passed.
- Stage 2 selection PR #246: merged, `a4a114a188fac0943cc2c5b535261d59004c3133`.
- Stage 2 selection document: `docs/OVYX-AI-STAGE-2-LOCAL-MODEL-SELECTION.md`.
- Live acceptance configuration and gates: `docs/OVYX-LIVE-ACCEPTANCE-SETUP.md`.
- On merge SHA `d48d7d6a70efb1a9f54fd155b5cc7d64ab5c232e`, post-merge Agent Verify, Settings Regression Browser Tests, Owner Controls, Cloudflare Diagnostics, Web Studio browser quality, and Assistant Workspace Browser Tests all completed successfully. The separate Live Website Generation and Acceptance Evidence run `40086196880` failed at provider-only preflight with the categories recorded above; full website generation and browser/integration probes were not run.
