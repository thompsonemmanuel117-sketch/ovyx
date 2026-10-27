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

The Stage 7 contract test verifies that these separate routes and controls remain present. A future code change should only alter a specific generation path after its existing route, bindings, entitlements, quota accounting, validation and rollback behaviour have been traced.

## Separate modality audit — not automatically migrated

Research/search, image generation, voice/transcription/speech, and other advanced tools must be audited as distinct capabilities. A text model alone does not provide image output, audio input/output, web retrieval, or external integration delivery. This Stage 7 contract does not claim those capabilities have been migrated or live-tested. Their route, required binding/API, consent, data retention, quotas, output format, and failure handling must be verified individually before any change.

## Regression coverage

The new `scripts/ovyx-stage7-ai-migration.test.mjs` protects the ordinary-chat route and its safety boundaries, confirms the coding/generation orchestration still uses the shared guarded provider path, and prevents this stage from claiming specialized modalities are migrated by the text model alone.

It is registered in `npm test` alongside existing ordinary-chat, provider-routing, Cloudflare quota, Stage 5 intelligence, and Stage 6 website/coding regression suites.

## Acceptance checklist

1. Sign in and send a normal chat message. Confirm the assistant responds and the provider/model metadata is truthful.
2. Send a multi-turn follow-up. Confirm conversation history remains available.
3. Ask the assistant to inspect a saved project. Confirm it uses the authenticated workspace tools and does not invent file contents.
4. If a Universal Connection is explicitly selected, confirm its failure is surfaced without silent provider switching.
5. Test with the Cloudflare AI quota exhausted in a controlled test environment. Confirm the guarded route stops cleanly; do not raise the budget or bypass the stop.
6. Run the coding/reasoning agent in the configured Cloudflare guarded mode. Confirm a requested external provider in the client payload does not override the guarded server route.
7. Generate a small website/app and confirm its existing validation and repair-preview controls still work.
8. Confirm quality inspection itself never changes source; edits still require a preview and explicit approval.
9. Keep research, image, voice and other modality acceptance as separate follow-up tests.

## Completion boundary

This PR audits and locks the existing migration contracts; it does not claim live Cloudflare inference, a deployed generated-site acceptance run, or real image/voice/research integration tests have passed. Stage 4's live benchmark and the manual acceptance items above remain separate evidence requirements.
