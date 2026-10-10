# OVYX AI routing and provider setup

OVYX can use normal provider-specific APIs or one shared OpenAI-compatible gateway. The backend reports the service that actually answered the request, rather than pretending a gateway is a native Gemini/Anthropic/OpenAI service.

## Option A: one shared API endpoint for all API-key-backed AI brain choices

Set these Cloudflare Pages environment values/secrets:

- `OVYX_AI_BASE_URL` — HTTPS base URL for the compatible endpoint, for example `https://api.groq.com/openai/v1`.
- `OVYX_AI_MODEL` — a model identifier accepted by that endpoint, for example `openai/gpt-oss-20b` if the selected service supports it.
- `OVYX_AI_API_KEY` — the key issued by the service at that endpoint. This is the clearest secret name to use for shared-gateway mode.

When `OVYX_AI_BASE_URL` is configured, the OpenAI, Claude, Gemini and DeepSeek choices route through that same compatible endpoint and model. The key can be stored in `OVYX_AI_API_KEY` or, if necessary, in another configured provider key slot. OVYX does not require the secret's variable name to match the gateway's brand.

**Important:** the endpoint and the key must still match. For example, Groq documents its OpenAI-compatible API at `https://api.groq.com/openai/v1` and requires a Groq-issued key for that endpoint. [Groq OpenAI compatibility documentation](https://console.groq.com/docs/openai). An unrelated Gemini or OpenAI key is not made valid for Groq by putting it into a different environment-variable slot. Use a key that the selected endpoint accepts.

## Option B: keep separate native provider routes

If `OVYX_AI_BASE_URL` is not set, OVYX continues using separate native provider endpoints:

- **OpenAI / ChatGPT** uses the official OpenAI API unless `OPENAI_BASE_URL` is set to a compatible endpoint.
- **Claude / Anthropic** uses Anthropic's native Messages API and `ANTHROPIC_API_KEY`.
- **Gemini** uses Google's Gemini API and `GEMINI_API_KEY`.
- **DeepSeek** uses DeepSeek's chat completions API and `DEEPSEEK_API_KEY`.
- **Cloudflare Workers AI** is an optional final Automatic fallback when the Pages Functions environment has an AI binding named `AI`.

In this mode, each native provider endpoint must accept the key being supplied. For a custom OpenAI-compatible endpoint set `OPENAI_BASE_URL`; the backend can take a key from any configured provider API-key slot when a custom compatible endpoint is explicitly configured.

## Automatic routing and user's selected Brain

Without a shared gateway, set `OVYX_AI_PROVIDER_ORDER` (or `AI_PROVIDER_ORDER`) to a preference order such as `gemini,deepseek,claude,openai`. OVYX skips providers that are not configured and tries those that are available. Cloudflare Workers AI is appended as a final fallback when its binding exists.

If the authenticated user has selected a Universal Connection as their AI Brain, that connection takes priority for the user's AI requests. If OVYX cannot verify or use the selected connection, it reports an error instead of silently switching to a platform key. Use **Clear AI Brain** to return to platform Automatic routing.

## Security and diagnostics

Never put keys or credentials in endpoint URLs. Keys stay server-side, and AI connection credentials are encrypted before storage. Keep the existing `OVYX_CONNECTION_ENCRYPTION_KEY` unchanged unless the stored credentials have been migrated.

The admin status check checks the configured endpoint's models-list route. A successful check means that route responded, not that every model, generation request, billing entitlement or feature works. A real generation test is still required.

## Cloudflare and Firebase setup

For Cloudflare Workers AI, create a Pages Functions AI binding named `AI` in the Cloudflare Pages project and deploy the configuration.

Successful assistant/gateway turns are saved server-side under:

`users/{uid}/aiConversations/{conversationId}/messages/{messageId}`

The backend accepts `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT` for the service-account secret. Never place Firebase service-account values or provider keys in the repository or frontend.
