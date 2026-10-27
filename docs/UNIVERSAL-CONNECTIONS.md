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

The AI Brain selection is stored in the authenticated workspace profile as `activeBrainConnectionId`. The `activeWebStudioConnectionId` field may remain in existing profiles for compatibility, but it is not used to bypass OVYX's Cloudflare AI quota.

- **Ordinary OVYX AI Assistant chats:** Automatic uses the selected AI Brain exclusively. If that selected connection cannot be verified or fails, OVYX reports the failure instead of silently switching to Cloudflare or another provider.
- **Web Studio website builds:** Cloudflare Workers AI is the guarded platform route. Quota exhaustion is a hard stop: the request returns the quota error. OVYX does not switch to a personal or platform-paid provider to evade that limit.
- **App Studio:** the server-side plan entitlement is checked before generation. Neither assignment unlocks App Studio or bypasses its plan gate.
- **Other tools and integrations:** an HTTP, webhook, database, or generic tool connection is not automatically treated as a model or connected to property listings, enquiries, social actions, or other business functions. Each requires a feature-specific adapter and an explicit purpose assignment before OVYX sends data to it.

Use `action: "use-ai"` / `action: "clear-ai"` to select or clear the assistant Brain. Existing `action: "use-webstudio"` / `action: "clear-webstudio"` assignments are retained for profile compatibility, but they cannot be used as a quota fallback. Removing or disabling a connection clears any matching assignments. The Cloudflare free-only guard and platform plan gates remain enforced.

A key is not interchangeable between providers: put a Gemini key on a Gemini connection or in `GEMINI_API_KEY`; a DeepSeek key on a DeepSeek-compatible connection or in `DEEPSEEK_API_KEY`; an Anthropic key on an Anthropic connection or in `ANTHROPIC_API_KEY`; and an OpenAI key on an OpenAI connection or in `OPENAI_API_KEY`. For a custom OpenAI-compatible endpoint, configure `OPENAI_BASE_URL` and its matching secret. Do not put one provider's key into an unrelated provider secret.


## Connection purpose and supported behavior

OVYX does not treat every arbitrary endpoint as an AI model. The saved connection type and protocol determine the safe behavior:

- `ai` with `openai-chat`, `anthropic-messages`, or `gemini-generate-content`: can be tested and, after explicit selection, used as the account's AI Brain. Web Studio no longer uses Universal Connections as a quota fallback.
- `http`, `webhook`, `database`, and `tool` using `http-json`: are stored as account-owned HTTP integrations and can be tested with the read-only health check. They are not automatically invoked as an AI Brain or silently wired to listings/enquiry workflows; a feature-specific adapter and an explicit purpose mapping are required before OVYX sends business data to them.

Connection ownership is verified for each request, credentials remain encrypted and server-side, and a failed selected Brain does not fall back to a platform-owned key. Do not place secrets in URLs or in public generated-site code.
## Platform Automatic routing

With no active user Universal Connection selection, OVYX tries the providers in `OVYX_AI_PROVIDER_ORDER` (or the supported default order), skipping providers that are not configured. If Cloudflare Workers AI is bound to the Pages Functions environment as `AI`, it is appended as the final Automatic fallback. An explicitly chosen provider does not silently fall back to another one.

## Connection security and tests

Connection ownership is checked against both the authenticated UID and workspace email. Local/private targets are rejected. Credential-bearing connections and AI protocols require HTTPS. Listing responses expose only safe metadata such as `hasSecret`, `capabilities.canUseAsBrain`, and `capabilities.canUseForWebStudio`, never the credential.

The Test action performs a non-generation health check against a model-list/health endpoint where supported; it does not intentionally make a paid AI generation request. A successful test means the check endpoint responded, not that every model or billing feature is available.
