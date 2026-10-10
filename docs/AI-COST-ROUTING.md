# OVYX AI cost-aware routing

OVYX can keep the existing frontend provider choices while using lower-cost backend routes. The API response always reports the actual routed provider; it does not falsely claim that Groq or Workers AI is OpenAI or Anthropic.

## Routing

- `ChatGPT` / `openai` -> Groq OpenAI-compatible API.
- `Claude` / `anthropic` -> Cloudflare Workers AI binding `AI`.
- Automatic routing can use the configured `OVYX_AI_PROVIDER_ORDER`.

Groq uses the OpenAI-compatible endpoint `https://api.groq.com/openai/v1/chat/completions` and the server-side secret `GROQ_API_KEY`.

Workers AI uses the Pages Functions binding `context.env.AI`. The default model is `@cf/meta/llama-3.3-70b-instruct-fp8-fast` and can be overridden with `CLOUDFLARE_AI_MODEL`.

## Firebase chat history

Successful assistant/gateway turns are written server-side to:

`users/{uid}/aiConversations/{conversationId}/messages/{messageId}`

The backend accepts either `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT` for the service-account secret. No Firebase service-account value belongs in the repository.

## Cloudflare setup

For Pages Functions, create an AI binding named `AI` in the Pages project or through the Wrangler Pages configuration, then redeploy.

Create the `GROQ_API_KEY` as an encrypted Cloudflare secret.

The backend returns:

- `provider`: actual provider used.
- `requestedProvider`: frontend requested provider.
- `routedProvider`: backend route selected.
- `conversationId` and `history.saved`: chat history status.


## Custom OpenAI-compatible endpoints (BYO key)

When `OPENAI_BASE_URL` is set, the OpenAI/ChatGPT selection and an existing
automatic-order entry for `groq` use that configured endpoint instead of
silently calling a hard-coded URL. Set the endpoint to an HTTPS base such as
`https://api.groq.com/openai/v1`, or to its full
`.../chat/completions` URL. Do not put credentials in the URL.

The backend sends the configured key server-side using Bearer authentication.
For recognized hosts it prefers the matching secret (`GROQ_API_KEY`,
`OPENROUTER_API_KEY`, or `DEEPSEEK_API_KEY`); `OPENAI_API_KEY` is also
accepted as the key slot when the administrator intentionally stores a key
for the configured compatible endpoint there. Select a model supported by
that endpoint. For Groq, `GROQ_MODEL` / `GROQ_AGENT_MODEL` are preferred,
with the existing compatible-model default as a fallback.

Diagnostics keep the legacy OpenAI settings-card identifier so the current UI
continues to work, but include the actual upstream provider and use a truthful
label such as `Groq (OpenAI-compatible endpoint)`. This status probe performs
an authenticated models-list request; it does not prove that every model or
generation request will succeed.

## Per-user keys without global provider secrets

A user can use their own compatible API key without setting a global
`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`: create a Universal Connection with
the provider's HTTPS endpoint, its model, and the user's key; save it; then
select **Use as Brain**. OVYX encrypts the connection secret in the backend and
Automatic routing tries the saved Brain before global provider fallbacks.

An API key is not universally interchangeable: a Gemini key cannot authenticate
to OpenAI's official API, and an OpenAI key cannot authenticate to Anthropic's
official API. A key only works with the service that issued it, or with a
compatible gateway endpoint that explicitly accepts it. For non-OpenAI-style
providers, the endpoint and protocol must match the provider's API format.
