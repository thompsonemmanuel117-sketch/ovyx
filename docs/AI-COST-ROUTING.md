# OVYX AI provider routing

OVYX uses **Setup A: separate provider connections**. A user chooses an AI provider; OVYX uses that provider's own configured server key and official API.

## Provider keys

Keep each key in its own Cloudflare Pages secret:

- `GEMINI_API_KEY` — Google Gemini.
- `DEEPSEEK_API_KEY` — DeepSeek.
- `ANTHROPIC_API_KEY` — Claude / Anthropic.
- `OPENAI_API_KEY` — OpenAI / ChatGPT.

OVYX can also use `GROQ_API_KEY` if the Groq choice is enabled. Cloudflare Workers AI is different: it uses a Pages Functions binding named `AI`, not a vendor API key.

Do not copy one vendor's key into another vendor's slot. The label on the slot does not change which service issued the key. Keep existing secrets in place; this code change does not replace production key values.

## What happens when a user chooses a provider?

- If that provider is configured, OVYX calls its provider-specific endpoint using its own key.
- If that provider has no key, OVYX stops and tells the user that it is unavailable for now, to try again later, or to connect their own AI Brain in Universal Connections.
- If the configured key is rejected or the provider is unavailable, OVYX reports the same helpful message. It does **not** secretly try another vendor.
- When the user selects **Automatic**, OVYX may try the configured provider order and skip providers that are not configured. Cloudflare Workers AI is an optional final Automatic fallback when the Pages binding exists.
- If the user has explicitly selected a Universal Connection as their AI Brain, that connection remains exclusive. If it fails, OVYX reports the failure instead of billing a platform key. Use **Clear AI Brain** to return to Automatic routing.

## Key safety

Provider keys stay in Cloudflare server-side environment secrets and are never returned to the browser. Never put keys in a URL, commit them into GitHub, or share them in chat. The Universal Connections credentials remain encrypted server-side. Keep `OVYX_CONNECTION_ENCRYPTION_KEY` unchanged if saved connections already exist; changing it without migrating stored values would make those credentials unreadable.

## Health checks and testing

The admin AI status endpoint checks each provider separately and reports `NOT_CONFIGURED`, `AUTH_FAILED`, `TIMEOUT`, or `UNAVAILABLE` as appropriate. A health check alone does not prove that every model or paid generation request works. The automated provider-routing tests use fake HTTP responses, so they do not spend money or expose real keys.

Successful assistant turns are stored server-side under:

`users/{uid}/aiConversations/{conversationId}/messages/{messageId}`

The backend accepts `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT` for the Firebase Admin service-account secret.
