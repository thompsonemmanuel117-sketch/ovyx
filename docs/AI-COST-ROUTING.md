# OVYX AI routing and provider setup

OVYX sends AI requests through the provider selected by the user or by the configured Automatic routing order. The backend reports the provider that actually handled the request; a key from one company is not treated as a key for another company.

## Provider behavior

- **OpenAI / ChatGPT** uses the official OpenAI API when no custom endpoint is configured. If `OPENAI_BASE_URL` is set, this route uses that configured OpenAI-compatible endpoint instead.
- **Claude / Anthropic** uses Anthropic's native Messages API and `ANTHROPIC_API_KEY`.
- **Gemini** uses Google's Gemini API and `GEMINI_API_KEY`.
- **DeepSeek** uses DeepSeek's chat completions API and `DEEPSEEK_API_KEY`.
- **Cloudflare Workers AI** is an optional final fallback in Automatic routing only when the Pages Functions environment has an AI binding named `AI`. It is not the same service as Anthropic or OpenAI.

## Automatic routing

Set `OVYX_AI_PROVIDER_ORDER` (or `AI_PROVIDER_ORDER`) to a comma-separated order such as `gemini,deepseek,claude,openai`. OVYX skips providers that are not configured and tries configured providers in that order. Cloudflare Workers AI is appended as a final fallback when its binding is available.

An explicitly selected provider is not silently replaced with another provider. If a user has selected a Universal Connection as their AI Brain, OVYX uses that connection exclusively for that authenticated user's AI requests. If the selection cannot be verified or the connection fails, OVYX returns an error instead of silently switching to a platform key. The user must clear the selected Brain to return to platform Automatic routing.

## OpenAI-compatible endpoints

Set `OPENAI_BASE_URL` to an HTTPS base such as `https://api.groq.com/openai/v1`, or to a full `.../chat/completions` URL. Never include a key, credentials, query parameters, or a fragment in the URL.

The server uses Bearer authentication. For recognized hosts it prefers the matching secret (`GROQ_API_KEY`, `OPENROUTER_API_KEY`, or `DEEPSEEK_API_KEY`) and can use `OPENAI_API_KEY` when it is intentionally configured for the selected compatible endpoint. Set a model accepted by that endpoint; provider-specific model variables take priority where supported.

The admin status check calls the configured endpoint's models-list route. A successful check confirms that route answered, not that every model, generation request, billing entitlement or feature works.

## Universal Connections (user-owned keys)

Users can save their own provider key in a Universal Connection with the matching endpoint, protocol and model, then choose **Use as Brain**. Credentials are encrypted by the backend before storage and are not returned to browser code. AI connections and credential-bearing endpoints must use HTTPS. Do not paste credentials into endpoint URLs.

Use the matching provider protocol: OpenAI-compatible Chat Completions, Anthropic Messages, or Gemini Generate Content. A Gemini key does not authenticate to OpenAI, and an OpenAI key does not authenticate to Anthropic. A compatible gateway only accepts keys its own service supports.

## Cloudflare and Firebase setup

For Cloudflare Workers AI, create a Pages Functions AI binding named `AI` in the Cloudflare Pages project and deploy the configuration.

Successful assistant/gateway turns are saved server-side under:

`users/{uid}/aiConversations/{conversationId}/messages/{messageId}`

The backend accepts `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT` for the service-account secret. Never place Firebase service-account values or provider keys in the repository or frontend.
