# OVYX AI Audit — Stage 1 Inventory

**Audit date:** 2026-10-24  
**Scope:** Current `main` source tree (commit/tree SHA `e849f8878358e557a7d7610a58c941f62ce8987f`). Static source and test inventory only. This is not a claim that production secrets, live provider access, or every browser interaction were tested.

## Executive finding

OVYX currently has **two separate AI paths** rather than one unified engine:

1. **OVYX-native workspace assistant** — `POST /api/ai/ovyx` → `functions/_lib/ovyx-native-ai.js` → Cloudflare Workers AI binding `AI.run()`. It avoids Gemini/OpenAI/Anthropic/DeepSeek keys, but it is **not independent of hosted inference** and still depends on Cloudflare availability, account limits/billing, and OVYX quota.
2. **General assistant, Web Studio and App Studio generation** — `/api/ai/assistant` and `/api/ai/gateway` call `functions/_lib/providers.js`; website/app builds use multi-step generation helpers that receive the provider-routing function. This path still depends on configured provider API keys and/or the Cloudflare Workers AI fallback when available.

Agent Mode is a third workflow: `POST /api/generate` → `functions/_lib/orchestrator.js` → the shared provider/model functions, with job storage and streaming progress.

**Recommendation:** do not remove or rename providers yet. First make a single model-adapter interface and migrate one feature at a time, with a safe fallback/rollback. Do not count a provider health check as proof that it can generate a real website.

## 1. User-facing AI surfaces and modes found

| Surface / mode | Main source | Current AI path | Notes |
|---|---|---|---|
| Workspace Assistant / native OVYX AI | `assets/ovyx-assistant-workspace.js` | `POST /api/ai/ovyx` | Sends up to 12 conversation turns and workspace/project context; receives text and allowlisted workspace actions. Browser keeps a short in-memory history during the active chat. |
| General assistant | `assets/ovyx-assistant-workspace.js` and assistant runtime/UI | `POST /api/ai/assistant` and/or `POST /api/ai/gateway` (must confirm caller by feature) | Both server routes exist and have overlapping assistant/build logic. This overlap is a migration risk. |
| Web Studio — build / fix / ask | `functions/api/ai/gateway.js`, `functions/api/ai/assistant.js`, `functions/_lib/studio-multipage.js`, `functions/_lib/studio-singlepage.js`, `functions/_lib/experience.js`, `functions/_lib/prompts.js` | Shared provider router via `callModel` | Build requests can run multiple generation phases. Requires Web Studio entitlement. Prompt/context can include project files, brand profile and research. |
| App Studio — app-build / app-fix | `functions/api/ai/gateway.js`, `functions/api/ai/assistant.js` | Shared provider router via `callModel` | Requires App Studio entitlement; can load saved brand profile. |
| Agent Mode / repository task execution | `functions/api/generate.js`, `functions/_lib/orchestrator.js` | `runAgent` → `callJsonModel` / shared provider adapters | Streams progress, records a job and aggregates quota across multiple model calls. Requires agent access and `OVYX_JOBS` binding. |
| Online research for Web Studio | `functions/api/ai/web-search.js`, `functions/_lib/web-research.js`, `assets/ovyx-webstudio-research.js` | Search providers, not necessarily the text-inference provider | Uses configured search integrations such as Tavily, Brave or Serper; requires Web Studio entitlement. Keep distinct from model inference. |
| Provider availability / admin diagnostics | `assets/ovyx-provider-availability.js`, `assets/ovyx-additional-ai-provider-diagnostics.js` | `/api/ai/provider-availability`, `/api/ai/status` | Health checks only; do not prove successful text generation. |
| Provider test UI/action | `functions/api/test-provider.js` | Direct provider model-list endpoint | Connection probe only; it does not prove a real prompt can be generated. |
| AI feedback | `functions/api/ai/feedback.js` | Feedback record, not inference | Provider names are recorded from an allowlist. |
| Workspace file tools | `functions/api/ai/workspace-tools.js`, `assets/ovyx-assistant-workspace.js` | Authenticated project/file operations | Separate from inference. Includes safe path validation and project revision/history actions. |

**Important follow-up:** the exact caller mapping for every HTML control still needs a focused frontend event-binding trace. The source tree shows the main surfaces and routes above, but a static path inventory alone is not a browser interaction test.

## 2. Server routes and what each does

| Route | Purpose | Model/provider dependency |
|---|---|---|
| `POST /api/ai/ovyx` | Native workspace assistant; auth, prompt normalization, quota reservation/finalization/refund, chat persistence | Cloudflare Workers AI binding `AI`; model defaults to `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via `functions/_lib/ovyx-native-ai.js` |
| `POST /api/ai/assistant` | Assistant and some build/edit paths; can run multi-page/single-page generation | Shared `callModel` provider routing |
| `POST /api/ai/gateway` | Assistant and Web/App Studio gateway; classifies mode, checks entitlements, prepares prompts/context, routes generation | Shared `callModel` provider routing |
| `POST /api/generate` | Agent/repository task workflow, streaming progress and job state | `runAgent` / orchestrator and shared model adapters |
| `POST /api/ai/web-search` | Online research SSE workflow | `conductWebResearch`; search-provider credentials/config, not identical to text-model credentials |
| `GET /api/ai/provider-availability` | One selected provider availability check | Calls provider model-list endpoint; supports Gemini, DeepSeek, Claude/Anthropic and OpenAI |
| `GET /api/ai/status` | Owner/admin provider diagnostics | Checks Gemini, DeepSeek, OpenAI, Anthropic plus Groq and OpenRouter; checks whether Workers AI binding exists |
| `/api/test-provider` | Provider test probe | Direct model-list endpoint; check route method handling before relying on it |
| `/api/settings/ai` | User AI preferences | Stores/validates mode/model preference values; defaults include balanced/automatic and legacy named model choices |
| `/api/admin/ai-config` | Admin provider routing configuration | Provider-order configuration; allowed values include Gemini, DeepSeek, Claude, OpenAI, Groq and OpenRouter |
| `/api/ai/workspace-tools` | Authenticated inspect/search/read/diagnose/edit/revision operations on project files | Not an inference endpoint; model actions must be separately authorized/validated |
| `/api/ai/feedback` | AI feedback intake | Not an inference endpoint |
| `/api/api/ai/tools` | Legacy/nested AI tools route exists | Exact active callers and overlap require reference tracing before any removal |

## 3. Provider adapters, model configuration and external calls

### Main shared provider router

File: `functions/_lib/providers.js` (1,511 lines).

Provider/model families referenced in code:

- Gemini — `GEMINI_API_KEY`; model config `GEMINI_AGENT_MODEL` / `GEMINI_MODEL`; default currently coded as `gemini-3.8-flash`.
- Anthropic/Claude — `ANTHROPIC_API_KEY`; `ANTHROPIC_AGENT_MODEL` / `ANTHROPIC_MODEL`; default `claude-opus-5`.
- DeepSeek — `DEEPSEEK_API_KEY`; `DEEPSEEK_AGENT_MODEL` / `DEEPSEEK_MODEL`; default `deepseek-flash`.
- OpenAI — `OPENAI_API_KEY`; `OPENAI_AGENT_MODEL` / `OPENAI_MODEL`; default `gpt-6.1-sol`.
- Groq — `GROQ_API_KEY`; `GROQ_AGENT_MODEL` / `GROQ_MODEL`; default `openai/gpt-oss-20b`.
- OpenRouter — `OPENROUTER_API_KEY`; `OPENROUTER_AGENT_MODEL` / `OPENROUTER_MODEL`; may use account default if no model is pinned.
- Cloudflare Workers AI — binding `AI`; `CLOUDFLARE_AI_MODEL`; default `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

The router has provider ordering, explicit-provider handling, task-specific routing, timeouts/retries and model-family compatibility checks. An explicit provider choice is designed to remain exclusive; automatic routing skips unconfigured providers and may use Workers AI if its binding is available. This is existing behavior, not proof that any live provider is currently healthy.

### Separate/legacy adapter code

- `functions/_lib/brain/providers.js` contains another provider adapter for Gemini, Claude, DeepSeek and OpenAI.
- `functions/api/_lib/brain/providers.js` and `functions/api/_lib/providers.js` also exist.
- `functions/_lib/brain/registry.js` is a capability/tool registry, not itself a model.
- Before migrating, trace imports and route usage for these duplicate-looking adapters. Do not delete based on names alone.

### AI identity, tools and safety

- `functions/_lib/ai-identity.js` supplies global OVYX identity instructions.
- `functions/_lib/ovyx-native-ai.js` contains native system instructions, output parsing and an allowlist of supported workspace actions/routes; file paths are checked against sensitive paths/extensions.
- `functions/_lib/brain/registry.js` registers capabilities/tools and entitlement gates.
- `functions/_lib/brain/tools.js` and the workspace tools route implement/validate tool operations.
- Model-proposed actions are not the same as completed actions; actual tools/operations must run and succeed before OVYX reports completion.

## 4. Quotas, history, context and user data

- `functions/_lib/token-quota.js` provides shared monthly token and daily-prompt limits. Defaults in source: Free 50,000 tokens/month and 4 daily prompts; Pro 500,000/month and 20 daily prompts; Max 5,000,000/month and 100 daily prompts. Admin configuration in Firestore can override these. These are OVYX product limits, separate from provider billing/quota.
- `/api/ai/ovyx`, `/api/ai/assistant`, `/api/ai/gateway` and Agent Mode reserve/finalize usage and refund on eligible failures; Agent Mode aggregates usage across its multi-call task.
- `functions/_lib/chat-history.js` stores user/assistant messages under each authenticated user's Firestore `aiConversations/{conversationId}/messages` collection, including provider/model metadata and usage for the assistant response.
- Native workspace assistant sends up to 12 turns and truncates message/context sizes. Its browser-side `history` is active-chat memory; persistent server history is separately attempted. History-save failures are logged and do not necessarily fail the AI response.
- Workspace/project context is separately assembled and passed into the model. The Web Studio pipeline may include project files, source-inspection context, brand DNA, experience brief and optional web research.
- Quota usage may be estimated if provider token usage is missing. Do not interpret estimated tokens as exact provider billing data.

## 5. Tests and acceptance coverage found

The package test command runs a large sequential set of Node tests. AI-related tests include:

- `scripts/provider-routing.test.mjs`
- `scripts/ovyx-native-ai.test.mjs`
- `scripts/ai-provider-status.test.mjs`
- `scripts/provider-availability.test.mjs`
- `scripts/ovyx-provider-availability.browser.test.mjs`
- `scripts/ovyx-settings-ai.browser.test.mjs`
- `scripts/prompt-contract.test.mjs`
- `scripts/ovyx-assistant-runtime.test.mjs`
- `scripts/ovyx-assistant-workspace.browser.test.mjs`
- `scripts/ovyx-webstudio-evaluation.test.mjs`
- `scripts/ovyx-webstudio-evaluation-runner.test.mjs`
- `scripts/ovyx-webstudio-generated-site-browser-eval.mjs` and its test
- `scripts/ovyx-webstudio-live-generation-eval.mjs` and live-generation contract tests
- Web Studio quality, reliability, feedback, code-search, export and full-stack-upgrade tests
- `scripts/ovyx-live-service-integration-eval.test.mjs`
- `scripts/ovyx-cloudflare-runtime-config-inventory.test.mjs`

Test intent varies: unit/contract tests often use fake model responses and browser tests may use mocked/simplified environments. A passing test is not proof that a real provider generated a real website. The previous recorded live acceptance run `40057418318` failed at provider readiness (Gemini HTTP 429) and generated zero real websites; this is a prior checkpoint, not a fresh live test in this audit.

## 6. Known blockers / evidence gaps

1. **Hosted inference is still present.** The native route is Cloudflare Workers AI, not a browser-local model. It can still be rate-limited, unavailable or billed.
2. **Website generation is still provider-routed.** Web Studio/App Studio/Agent workflows use the shared provider adapters and multi-stage model calls.
3. **There are overlapping routes/adapters.** Assistant and gateway share responsibilities; multiple brain/provider adapter files exist. The exact unused/active set needs an import/reference trace before consolidation.
4. **Provider health != generation success.** Model-list endpoints can return healthy while actual inference fails from quota, unsupported model IDs, context size or provider-specific constraints.
5. **Browser UI mapping is not yet line-by-line complete.** Need map every visible model/provider selector, mode button and event handler to its route, and identify any old/unused controls.
6. **Image generation, voice/audio and other modality features have not been confirmed as first-class inference routes in this pass.** They need a separate code-reference check; local text models cannot automatically replace these.
7. **External search remains a separate service.** Local text inference alone will not remove search-provider usage or any deployment/storage/auth costs.
8. **Live Cloudflare bindings and secrets were not read.** This audit intentionally did not retrieve secret values. No claim is made that the current production provider is ready.
9. **No files or provider configuration were removed/changed by this audit.**

## 7. Suggested improvements (safe, high value)

1. **Introduce one internal AI adapter contract** (e.g. `generateText({messages, system, context, task, signal})`) so chat, code and website generation can migrate without rewriting every feature.
2. **Add explicit capability metadata** for each engine: text, structured JSON, long context, code, vision, image/audio, streaming, local-only. Do not route a feature to an engine that cannot support it.
3. **Add an honest readiness state**: configured, connection-check passed, inference smoke-test passed, quota blocked, unsupported device/model, or offline. Do not call model-list health “ready for generation.”
4. **Add trace IDs and per-stage generation outcomes** without logging prompts, secrets or sensitive source files. This makes failures diagnosable without repeated costly runs.
5. **Use a small, non-billable or tightly controlled smoke test** before full website-generation acceptance. Only launch the expensive multi-page evaluation after readiness succeeds.
6. **Keep a provider-independent fallback plan**, but only report fallback if the fallback actually generated the answer. Never silently claim local mode when a remote provider answered.
7. **Preserve server-side quota/account safeguards** even if local inference is introduced; separately account for local compute, external research and hosting.
8. **Migrate feature-by-feature and keep rollback** until real device tests show the new path works. Do not delete legacy provider secrets until no production route references them.

## 8. Stage 1 completion criteria

**Status: COMPLETE — Stage 1 source-level inventory.** The main-shell AI controls and routing branches have now been traced alongside the native workspace assistant, Web Studio research, Agent Mode, backend routes/adapters, model/environment settings, quotas/history, workspace tools, and test contracts. The critical mismatches and migration dependencies are recorded below. No runtime code, production provider settings, or secrets were changed.

This is a code-and-test inventory, not a live-provider acceptance result. I did not claim a fresh successful real-model response or a real website generation. The latest known live acceptance run remains a separate failure at Gemini readiness (HTTP 429) with zero real websites generated. Live inference checks should stay separate and controlled.

## Primary source files

- `functions/api/ai/ovyx.js`
- `functions/_lib/ovyx-native-ai.js`
- `functions/api/ai/assistant.js`
- `functions/api/ai/gateway.js`
- `functions/api/generate.js`
- `functions/_lib/providers.js`
- `functions/_lib/brain/providers.js`
- `functions/api/_lib/brain/providers.js`
- `functions/api/_lib/providers.js`
- `functions/_lib/chat-history.js`
- `functions/_lib/token-quota.js`
- `functions/api/ai/status.js`
- `functions/api/ai/provider-availability.js`
- `functions/api/ai/web-search.js`
- `functions/_lib/web-research.js`
- `assets/ovyx-assistant-workspace.js`
- `assets/ovyx-webstudio-research.js`
- `docs/OVYX-NATIVE-AI.md`
- `docs/AI-COST-ROUTING.md`


## 9. Additional settings and frontend trace findings

- `functions/api/settings/ai.js` persists account-scoped preferences for `mode` (`balanced|fast|quality`), `model` (`automatic` plus four named provider models), `provider` (`gemini|anthropic|deepseek|openai`), routing/fallback, context inclusion, and budget/context limits.
- These preference options do not enumerate Groq, OpenRouter or Cloudflare Workers AI, although the shared router and admin status code support those options. This may be intentional legacy UI compatibility, but it is a configuration-surface mismatch to review before replacing the provider selector.
- The settings preference defaults use `provider: gemini`, while the native workspace assistant explicitly sends `provider: 'native-ovyx-ai'` in its feedback/context payload and calls `/api/ai/ovyx`. Do not assume the account's selected provider/model preference controls the native workspace path without tracing the relevant browser service.
- `assets/ovyx-assistant-workspace.js` clearly calls `/api/ai/ovyx`. Browser tests for Settings expect the AI preference UI to call `/api/settings/ai` and `/api/ai/assistant`. The older `index-updated.html` has a separate client wrapper pointing to `/api/ai/gateway` and `/api/ai/tools`; it should not be assumed to be the currently deployed main shell.
- The main `index.html` is about 2 MB and the available repository-file reader returned no text for it, so I cannot honestly claim a line-by-line trace of every inline UI handler from that file yet. The route/surface inventory above is grounded in readable source files and tests, but the main-shell event-binding trace remains open.
- No dedicated `functions/api/image*`, `functions/api/audio*`, `functions/api/voice*` or transcription route appears in the current API tree. This only establishes that there is no obvious dedicated route by those names; image/audio capability may be supplied through other UI or third-party services and must not be assumed migrated or absent without a focused reference trace.



## 10. Main-shell control-to-route trace (current `index.html`)

- **Home build composer:** `#prompt-home-input` + `#v59-build` calls `runBuild()`. The selected value in `#v59-model-select` is saved as `ovyx_selected_ai_brain` in browser local storage. The build flow creates a local draft project graph when needed, records a Web Studio handoff (`window.__OVYX_HOME_TO_WEBSTUDIO__`) with prompt/provider/attachments, and routes into Web Studio rather than proving a website was generated on the home screen.
- **Home provider selector:** `automatic`, `openai`, `anthropic`, `deepseek`, `gemini`. In the shared `secureGenerate` client, automatic requests go to `POST /api/ai/assistant`; explicit named-provider requests go to `POST /api/ai/gateway`. Both then use the shared server-side model routing system. This selector does not directly call `/api/ai/ovyx`.
- **General AI service payload:** `secureGenerate` sends prompt/messages, mode, context, project/files/attachments, a model value (defaulting to `automatic`), optional provider/routing fields and system instructions. The automatic branch sets `preferredProvider` to an empty string and `providerRouting` to `automatic` unless the caller explicitly supplies those fields.
- **Provider selection guard:** `patchAIBrain` is designed to keep an explicit provider exclusive and leave automatic routing to the server. It presents failures clearly rather than quietly claiming a different provider answered. The home selector itself exposes four provider names; Groq, OpenRouter and Cloudflare Workers AI are supported in server routing/diagnostics but not listed in that selector.
- **Microphone button:** `#v59-mic` uses browser `SpeechRecognition` / `webkitSpeechRecognition` to place a transcript into the prompt box. This is browser speech-to-text input, not evidence of OVYX-hosted transcription or text-to-speech.
- **File/photo/scan inputs:** the home composer accepts file attachments and image capture inputs; these are attached to the build request/context. No dedicated API route for image generation, voice synthesis, audio generation or transcription appears in the current function tree. Do not count image uploads as model-generated images or browser speech input as an OVYX voice engine.
- **Native workspace assistant:** `assets/ovyx-assistant-workspace.js` posts to `/api/ai/ovyx`; it has conversation UI actions such as copy/export conversation, project/history/asset navigation, workspace inspect/search/read/diagnose, approved edits and undo/revision review. It is a separate path from the home composer and general provider selector.
- **Web Studio research:** `assets/ovyx-webstudio-research.js` calls `POST /api/ai/web-search`. It uses configured search integrations and is separate from text-model inference.
- **Agent Mode:** the application endpoint registry includes `/api/generate`, which invokes the repository agent workflow and shared model adapters. This is not the same request path as the home composer.
- **Diagnostics and feedback:** admin status uses `/api/ai/status`; selected-provider availability uses `/api/ai/provider-availability`; the native assistant and Web Studio reliability components can submit feedback to `/api/ai/feedback`. Status/probe responses must not be treated as successful prompt generation.

## 11. Stage 1 findings and current resolution status

### P1 — AI Preferences account persistence and request propagation — RESOLVED

The Stage 1 source snapshot correctly identified a mismatch: preferences were saved locally and several advanced settings did not consistently reach generation. That finding was resolved by **PR #244**, merged into `main` as `d48d7d6a70efb1a9f54fd155b5cc7d64ab5c232e`.

- Signed-in preferences now use the authenticated, account-scoped `/api/settings/ai` GET/PUT contract. UI messaging distinguishes server-confirmed settings from local-only settings and does not claim a failed account write succeeded.
- The current generation request wrapper propagates mode, provider/model selection, budget and context preferences to the assistant/gateway request. Routing and fallback policy are passed through website generation follow-up stages and bounded repair calls.
- The desktop/mobile AI Preferences browser test passed on the final PR head; provider-routing, static verification, build preflight, Wrangler, settings regressions, owner-controls, Web Studio browser quality, and the combined assistant-workspace browser suite also passed before merge.
- These tests verify the application contract and mocked/browser boundary. They do **not** prove that any specific external provider is currently healthy, that the selected model is running locally, or that real websites have passed full live acceptance.
- **Do not reopen this item unless a new failing test or source trace identifies a regression.** The next AI milestone is browser-local inference, starting with the Stage 2 model-selection record.

### P2 — Provider labels and model identifiers are inconsistent

- The home provider selector calls OpenAI “GPT-3.5”.
- Another admin/runtime label calls OpenAI “GPT-4o Mini”, while the shared provider routing fallback currently uses the code default `gpt-6.1-sol` unless an environment model override is configured.
- Claude is variously labeled “Claude”, “Claude Sonnet 4.6” and the shared router's fallback is `claude-opus-5`; the AI preferences list also contains `claude-opus-5`.
- This does not prove the production model is any one of those identifiers—the environment may override them. It proves the UI and source defaults are inconsistent. Consolidate labels behind a server-returned model/capability registry, then only display the model actually routed in the response. Never claim a specific model merely from a UI label.

### P3 — Duplicate/legacy AI routing and tool-adapter paths

- `functions/api/ai/assistant.js` and `functions/api/ai/gateway.js` both classify assistant/Web/App Studio modes, call the shared `callModel`, save chat turns and handle quota. Their overlap should be mapped by callers and regression tests before one is retired.
- Provider adapter implementations exist in `functions/_lib/providers.js`, `functions/_lib/brain/providers.js`, `functions/api/_lib/brain/providers.js`, and `functions/api/_lib/providers.js`. The shared main generation routes use `functions/_lib/providers.js`; the nested/legacy tools route and API adapter still need import-use verification before removal.
- `functions/api/api/ai/tools.js` is nested under an extra `api/` directory and thus has a different path from the `/api/ai/tools` path referenced by the older `index-updated.html`. The current `index.html` has no `/api/ai/tools` reference. Treat this as legacy/path-risk evidence, not an active current-shell dependency, until it is verified through deployment routing.

## 12. Safe checks and current evidence boundary — updated 2026-10-24

Evidence updated 2026-10-24:

- **Stage 1 inventory:** PR #243 merged as `e3c4ed3f911a957c930d0337a2b18eb4419c3e0d`.
- **AI Preferences foundation:** PR #244 merged as `d48d7d6a70efb1a9f54fd155b5cc7d64ab5c232e`. The final PR head passed Provider-specific routing tests, static verification, production build preflight, Wrangler validation, Settings Regression Browser Tests, Owner Controls Regression, Web Studio browser quality, Live AI generation and five-viewport QA workflow, and the combined desktop/mobile Assistant Workspace Browser Tests. The AI Preferences browser test specifically passed in desktop and mobile Chromium. The live workflow's green PR/push result is not evidence of real production website generation because that workflow's push mode is preflight-only; the post-merge live acceptance workflow on main later failed and must be read separately.
- **Stage 2 model selection:** PR #246 merged as `a4a114a188fac0943cc2c5b535261d59004c3133`. Its model decision record is `docs/OVYX-AI-STAGE-2-LOCAL-MODEL-SELECTION.md`.
- A post-merge `OVYX Agent Verify`, `OVYX Settings Regression Browser Tests`, and `OVYX Owner Controls Regression` pass was observed on merge SHA `d48d7d6a70efb1a9f54fd155b5cc7d64ab5c232e`; other post-merge workflows were still running or separately blocked at the time this note was updated. Do not infer the last post-merge workflows passed until their actual conclusions are checked.

The full `npm test` script includes native-AI output/action tests, provider routing/status tests, assistant runtime tests, prompt-contract checks, Web Studio evaluation/reliability/quality tests and runtime configuration inventory tests. Passing static/build/browser-contract checks does not replace full live generation acceptance.

**Stage 1 inventory is complete; its P1 AI Preferences finding is resolved. Stage 2 model selection is recorded and merged.** Next is Stage 3: a reversible, isolated browser-local inference prototype using the selected MLC/Qwen candidate. Do not migrate or retire the existing AI routes until Stage 3/4 prove runtime compatibility, no-external-prompt leakage, model quality, and safe behavior on supported desktop/mobile devices.
