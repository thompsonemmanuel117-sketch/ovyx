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
