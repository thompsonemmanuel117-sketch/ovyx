# OVYX Universal Connections

Universal Connections are account-owned server integrations. A connection may be used as an AI Brain when it is active and uses the OpenAI-compatible chat protocol.

## Supported connection modes

- AI Brain — OpenAI-compatible chat endpoint.
- HTTP API — generic JSON request/response integration.
- Webhook — HTTP/HTTPS endpoint with server-side authentication.
- Tool Endpoint — HTTP/HTTPS endpoint for server-routed tool integrations.
- Legacy HTTP Database — retained for compatibility with existing workspace contracts.

## Authentication

A connection does not inherently require an API key.

Supported server-side authentication modes are:

- `none`
- `bearer`
- `api-key` (sent as `X-API-Key`)
- `basic` (stored secret uses `username:password`)

Credentials are encrypted with AES-GCM before being stored in Firestore. The browser never receives the encrypted credential.

## Required production secret

Configure this Cloudflare secret before saving a connection with credentials:

`OVYX_CONNECTION_ENCRYPTION_KEY`

The secret is never committed to GitHub and must be supplied through the production environment.

## AI Brain selection

A workspace can persist one active Universal Connection Brain through:

- `POST /api/settings/connections` with `{ "action": "use-ai", "id": "<connection-id>" }`
- `POST /api/settings/connections` with `{ "action": "clear-ai" }`

The selected Brain is stored on the authenticated workspace profile as `activeBrainConnectionId`. Automatic server AI routing honors that selection.

A connection selected as the AI Brain must be active and use the `openai-chat` protocol.

## Security boundaries

Connection endpoints must use HTTP or HTTPS. Local/private targets and credentials embedded in URLs are rejected. Ownership is checked against both authenticated UID and workspace email before a connection can be read, tested or executed.

Secrets are decrypted only on the server at request time. Connection list responses expose capability metadata such as `hasSecret`, `requiresSecret` and `capabilities.canUseAsBrain`, but never expose the credential itself.

## Health checks

The Test action performs a lightweight authenticated reachability check without sending a paid AI generation request. HTTP 401/403 responses are treated as authentication failures; HTTP 405 may still be treated as endpoint reachability when a health endpoint does not accept GET.