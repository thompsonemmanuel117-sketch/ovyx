# OVYX Universal Connections

Universal Connections are account-owned server integrations. AI Brain credentials are encrypted with AES-GCM before they are stored in Firestore; they are decrypted only inside the server request and never returned to the browser.

## Supported AI protocols

- `openai-chat` — OpenAI Chat Completions-compatible endpoints, including DeepSeek's compatible chat endpoint and compatible gateways.
- `anthropic-messages` — Anthropic's native Messages API for Claude.
- `gemini-generate-content` — Google's native Gemini Generate Content API.
- `http-json` — generic JSON HTTP integration for non-AI tools, webhooks and other endpoints.

Enter a provider's own API key in the connection's encrypted credential field. OVYX sends it using the provider's required server-side authentication header. AI endpoints and connections carrying credentials must use HTTPS. Do not paste a key into an endpoint URL.

## Required production secret

Configure this Cloudflare secret before saving connections that have credentials:

`OVYX_CONNECTION_ENCRYPTION_KEY`

Keep the existing encryption key unchanged if already-saved connections use it. Changing it without first migrating stored encrypted credentials will make those credentials unreadable.

## AI Brain selection and billing safety

A user can select one active Universal Connection Brain through:

- `POST /api/settings/connections` with `{ "action": "use-ai", "id": "<connection-id>" }`
- `POST /api/settings/connections` with `{ "action": "clear-ai" }`

The selection is stored in that user's authenticated workspace profile as `activeBrainConnectionId`. When a selection exists, Automatic routes exclusively through that connection. If it cannot be verified or fails, OVYX reports the failure instead of silently switching to platform-owned keys or another provider. Choose `clear-ai` to return to platform Automatic routing.

A key is not interchangeable between providers: put a Gemini key on a Gemini connection or in `GEMINI_API_KEY`; a DeepSeek key on a DeepSeek-compatible connection or in `DEEPSEEK_API_KEY`; an Anthropic key on an Anthropic connection or in `ANTHROPIC_API_KEY`; and an OpenAI key on an OpenAI connection or in `OPENAI_API_KEY`. For a custom OpenAI-compatible endpoint, configure `OPENAI_BASE_URL` and its matching secret. Do not put one provider's key into an unrelated provider secret.

## Platform Automatic routing

With no active user Universal Connection selection, OVYX tries the providers in `OVYX_AI_PROVIDER_ORDER` (or the supported default order), skipping providers that are not configured. If Cloudflare Workers AI is bound to the Pages Functions environment as `AI`, it is appended as the final Automatic fallback. An explicitly chosen provider does not silently fall back to another one.

## Connection security and tests

Connection ownership is checked against both the authenticated UID and workspace email. Local/private targets are rejected. Credential-bearing connections and AI protocols require HTTPS. Listing responses expose only safe metadata such as `hasSecret` and `capabilities.canUseAsBrain`, never the credential.

The Test action performs a non-generation health check against a model-list/health endpoint where supported; it does not intentionally make a paid AI generation request. A successful test means the check endpoint responded, not that every model or billing feature is available.
