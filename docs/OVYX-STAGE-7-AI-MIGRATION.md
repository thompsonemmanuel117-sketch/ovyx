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
- An account's explicitly selected Universal Connection remains an explicit, exclusive choice. A selected connection that fails must not silently fall back to another provider. This is not an automatic quota fallback.
- Stage 7 adds a migration contract suite to protect these existing behaviours. It does not replace a working chat route merely to make the diff larger.

### Phase 2 — Coding and reasoning modes

The code-agent route `functions/api/generate.js` uses `runAgent` from the existing orchestrator. Model calls go through `callJsonModel` and the shared provider adapter. In Cloudflare Workers AI guarded modes, the provider adapter ignores client-supplied external provider/model choices and routes through the guarded Cloudflare path. If no approved engine mode is configured, it fails closed rather than silently calling an external provider.

Existing provider-routing, quota, Stage 5 planning and workspace-tool suites remain registered. Do not change the agent's plan/execute/verify/rollback contracts as part of ordinary-chat migration.

### Phase 3 — Website and app generation

Generation remains a separate workflow rather than being replaced by ordinary chat. The multi-stage orchestrator keeps its structured planning, bounded batches, validation, and repair/rollback controls. Stage 6's Web Studio quality check is a read-only verification tool: it returns real inspector findings, does not edit source, and leaves edits behind preview and explicit approval.

The Stage 7 contract test verifies that these separate routes and controls remain present. A focused safety change removes the Web Studio post-quota personal-connection escape hatch from the browser, assistant/gateway routes, and guarded provider adapter. Exhausted Cloudflare or plan allowances now stop the request through normal quota errors; an existing Universal Connection assignment cannot bypass the limit. Explicitly selected AI Brain connections remain exclusive for ordinary assistant chat and are not silently replaced on failure. A future code change should only alter a specific generation path after its existing route, bindings, entitlements, quota accounting, validation and rollback behaviour have been traced.

## Separate modality audit — not automatically migrated

Research/search, image generation, voice/transcription/speech, and other advanced tools are not migrated by changing a text model route. The frontend's currently referenced API paths do not include dedicated `/api/research`, `/api/image`, or `/api/voice` endpoints. The existing microphone control uses browser `SpeechRecognition` / `webkitSpeechRecognition` for voice input; this is browser-native recognition, not a Cloudflare AI voice service. The asset store accepts image/audio uploads, but that is not image/audio generation. Web Studio includes research guidance in prompts, but prompt text alone is not proof of live web retrieval. No end-to-end, independently verified Cloudflare-native replacement for these modalities was established in this audit. Keep them out of the migrated capability list until dedicated routes/integrations, required bindings/APIs, consent, data retention, quotas, output formats, and failure handling are traced and tested.

## Regression coverage

The new `scripts/ovyx-stage7-ai-migration.test.mjs` protects the ordinary-chat route and its safety boundaries, confirms the coding/generation orchestration still uses the shared guarded provider path, and prevents this stage from claiming specialized modalities are migrated by the text model alone.

It is registered in `npm test` alongside existing ordinary-chat, provider-routing, Cloudflare quota, Stage 5 intelligence, and Stage 6 website/coding regression suites.

## Acceptance checklist

1. Sign in and send a normal chat message. Confirm the assistant responds and provider/model metadata is truthful.
2. Send a multi-turn follow-up and confirm conversation history is preserved.
3. Ask the assistant to inspect a saved project; confirm it uses authenticated workspace tools and does not invent file contents.
4. If an account explicitly selects a Universal Connection for ordinary assistant chat, confirm failure is surfaced without silent provider switching.
5. In a controlled test environment, exhaust the Cloudflare/plan allowance. Confirm Web Studio stops with a quota error and does not offer or automatically use another provider. Do not raise the budget or bypass the stop.
6. Run coding/reasoning in guarded Cloudflare mode. Confirm a client-supplied external provider/model cannot override the server route.
7. Generate a small website and an App Studio project. Confirm each existing validation, entitlement, quota, preview and repair control still works.
8. Confirm website quality inspection is read-only; edits still require preview and explicit approval.
9. Keep research, image, voice and other modality live acceptance separate until their actual implementation paths are identified and tested.
10. Run the complete `npm test`, static verification, production build preflight and Wrangler validation. Manual live Cloudflare inference and Stage 4 benchmark remain separate evidence requirements.

## Completion boundary

The code migration and regression contracts are in place, but live Cloudflare inference and deployed generated-site acceptance are not claimed as passed by static checks. Research, image, voice and other modality integrations remain a separate acceptance track. Stage 4's live benchmark and the manual acceptance items above remain separate evidence requirements.
