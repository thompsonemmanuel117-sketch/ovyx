# OVYX Stage 7 — AI feature migration audit

## Migration rule

Move AI features in small, ordered slices. Reuse the existing Cloudflare Workers AI path, quotas, response validation and safety controls wherever they already satisfy the requirement. Do not replace specialized capabilities with a generic text prompt, do not add a local model, and do not silently switch providers to get around a quota or upstream failure.

## Audit findings on `main`

### Phase 1 — Ordinary chat

The ordinary assistant is already connected to the native chat route:

- The workspace client sends messages to `POST /api/ai/ovyx`.
- The route authenticates the user, bounds the request, reserves and finalizes AI quota, refunds failed reservations where appropriate, and saves conversation history.
- `functions/_lib/ovyx-native-ai.js` uses the Cloudflare Workers AI binding. In the protected free-only mode it calls the guarded inference helper, which applies the existing daily neuron budget and stop conditions.
- Structured response parsing filters plans and actions through the existing allowlists before the client can act on them.
- Cloudflare Workers AI is the only platform model provider. Browser-supplied provider/model values, legacy global priority settings, and saved personal AI Brain assignments are ignored at the server boundary. Legacy encrypted AI records remain stored for compatibility but cannot be selected, tested, or called. Non-AI service connections remain separate.
- Stage 7 adds a migration contract suite to protect these existing behaviours. It does not replace a working chat route merely to make the diff larger.

### Phase 2 — Coding and reasoning modes

The code-agent route `functions/api/generate.js` uses `runAgent` from the existing orchestrator. Model calls go through `callJsonModel` and the shared provider adapter. In Cloudflare Workers AI guarded modes, the provider adapter ignores client-supplied external provider/model choices and routes through the guarded Cloudflare path. If no approved engine mode is configured, it fails closed rather than silently calling an external provider.

Existing provider-routing, quota, Stage 5 planning and workspace-tool suites remain registered. Do not change the agent's plan/execute/verify/rollback contracts as part of ordinary-chat migration.

### Phase 3 — Website and app generation

Generation remains a separate workflow rather than being replaced by ordinary chat. The multi-stage orchestrator keeps its structured planning, bounded batches, validation, and repair/rollback controls. Stage 6's Web Studio quality check is a read-only verification tool: it returns real inspector findings, does not edit source, and leaves edits behind preview and explicit approval.

The Stage 7 contract test verifies that these separate routes and controls remain present. A focused safety change removes the Web Studio post-quota personal-connection escape hatch from the browser, assistant/gateway routes, and guarded provider adapter. Exhausted Cloudflare or plan allowances now stop the request through normal quota errors; an existing Universal Connection assignment cannot bypass the limit. Saved personal AI Brain connections are no longer part of model routing; their encrypted records are retained but the platform does not query, test, or invoke them. A future code change should only alter a specific generation path after its existing route, bindings, entitlements, quota accounting, validation and rollback behaviour have been traced.

## OVYX platform knowledge for the assistant

The native assistant now retrieves a bounded, topic-relevant set of source-referenced OVYX architecture notes from `functions/_lib/ovyx-project-knowledge.js` and includes them in the ordinary chat system context. The companion `docs/OVYX-PLATFORM-MAP.md` records the main request paths, security boundaries, tests, research implementation and modality limitations. The retrieval query is used only to select trusted notes; raw user instructions are not copied into that trusted block.

This improves the assistant's knowledge of the platform without fine-tuning a model or loading the entire repository into every request. It also explicitly distinguishes OVYX's own GitHub codebase from each account's saved Firestore website/app project. For specific OVYX-source questions, the native assistant can request the `platform_repo_investigate` action, which calls the existing root-admin-only Guardian route. That route enforces same-origin and Firebase root-admin checks, uses the dedicated read-only GitHub token, redacts credential-like values, and inspects at most three safe source files. The result is bounded source evidence, not a full repository scan, live deployment check, or permission to change code. If the route or token is unavailable, the assistant must say so instead of guessing.

## Separate modality audit — not automatically migrated

Research/search has a real implementation path: `assets/ovyx-webstudio-research.js` calls `POST /api/ai/web-search`, handled by `functions/api/ai/web-search.js` and `functions/_lib/web-research.js`. The server-side research module can use configured Tavily, Brave Search or Serper credentials and opens a bounded selection of public source pages. This proves that a research implementation exists in source, but it does not prove those production secrets are configured or a live research request succeeded; require a completed report with real source records before claiming evidence-backed research. Image generation now has a separate Cloudflare-native implementation: the Web Studio UI calls `POST /api/ai/image-generation`, backed by `runCloudflareFreeImageInference` and `@cf/black-forest-labs/flux-1-schnell`. The route checks authentication, Web Studio entitlement and OVYX AI quota; the model helper enforces a fixed four-step limit, per-user rate limiting, the shared daily neuron ledger, bounded prompt/output sizes and fail-closed provider behavior. Generated images are returned for preview/download, not silently written into a project. Live production inference still requires a real acceptance run with Cloudflare allowance available; upload/reference support remains a separate feature. Voice uses browser-native `SpeechRecognition` / `webkitSpeechRecognition` and `speechSynthesis` in the Sentinel UI; it is not proof of a Cloudflare-native server-side transcription or voice-generation service. Image generation is now implemented in source and has regression contracts, but remains pending live production acceptance. Server-side voice remains unimplemented/unverified; browser speech APIs are not a server-side voice service. Any future server-side voice migration needs its own integration, consent, retention, quota, output-format and failure-handling tests.

## Regression coverage

The `scripts/ovyx-stage7-ai-migration.test.mjs` contract protects the ordinary-chat route and its safety boundaries, confirms the coding/generation orchestration still uses the shared guarded provider path, and prevents this stage from claiming specialized modalities are migrated by the text model alone. `scripts/ovyx-project-knowledge.test.mjs` additionally verifies topic retrieval, source-path existence, research-route accuracy, and the distinction between OVYX source and a user's saved project.

The Stage 7 migration, project-knowledge and project-awareness suites are registered in `npm test` alongside existing ordinary-chat, provider-routing, Cloudflare quota, Stage 5 intelligence, and Stage 6 website/coding regression suites.

## Acceptance checklist

1. Sign in and send a normal chat message. Confirm the assistant responds and provider/model metadata is truthful.
2. Send a multi-turn follow-up and confirm conversation history is preserved.
3. Ask the assistant to inspect a saved project; confirm it uses authenticated workspace tools and does not invent file contents.
4. Ask a root administrator a specific question about OVYX's own source code; confirm `platform_repo_investigate` returns bounded, redacted source evidence and no source edits. Test a non-admin account and missing-token configuration to confirm access is denied honestly.
5. Create or retain a legacy personal AI Brain record and confirm the platform ignores it for readiness and inference; no remote health check or model call should be made.
6. In a controlled test environment, exhaust the Cloudflare/plan allowance. Confirm Web Studio stops with a quota error and does not offer or automatically use another provider. Do not raise the budget or bypass the stop.
7. Run coding/reasoning in guarded Cloudflare mode. Confirm a client-supplied external provider/model cannot override the server route.
8. Generate a small website and an App Studio project. Confirm each existing validation, entitlement, quota, preview and repair control still works.
9. Confirm website quality inspection is read-only; edits still require preview and explicit approval.
10. In Web Studio, open **Create image**, generate a simple original image, preview it, download it and confirm a missing Cloudflare allowance produces a clear stop without switching providers. This is a live acceptance item, not proven by static tests.
11. Keep research, server-side voice and other modality live acceptance separate until their actual implementation paths are tested.
12. Run the complete `npm test`, static verification, production build preflight and Wrangler validation. Manual live Cloudflare inference and Stage 4 benchmark remain separate evidence requirements.

## Completion boundary

The code migration and regression contracts are in place, but live Cloudflare inference and deployed generated-site acceptance are not claimed as passed by static checks. Research, image, voice and other modality integrations remain a separate acceptance track. Stage 4's live benchmark and the manual acceptance items above remain separate evidence requirements.
