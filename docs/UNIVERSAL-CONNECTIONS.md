# OVYX Personal Connections

Personal Connections are account-owned server integrations. Existing credentials are encrypted with AES-GCM in Firestore and remain server-side; public listing responses never reveal saved secrets.

## AI model provider policy

Cloudflare Workers AI remains OVYX's default inference provider. Users may optionally save one supported personal AI provider connection (OpenAI-compatible, Anthropic, or Gemini) and explicitly select it as their personal Brain fallback. OVYX continues to use Cloudflare while the user's monthly, booster, or daily OVYX allowance is available. Only after the quota service returns `DAILY_RATION_EXHAUSTED` does an enabled personal Brain connection take over. If no personal connection is selected, the original quota error is returned.

Personal provider credentials use the existing AES-GCM encrypted connection storage and are decrypted only inside server-side request handling. They are never returned by connection listing APIs, sent to browser code, inserted into generated sites, or written into usage logs. Personal-provider inference does not consume OVYX token allowance; a minimal usage record stores provider/model and upstream usage metadata. Provider failures do not trigger retry loops or silently fall back to another external provider. The native OVYX assistant, Web Studio, App Studio, and Agent mode follow the same quota-exhaustion policy; Cloudflare remains the first route. Image generation remains on its separate Cloudflare Workers AI route because the personal text-provider adapters do not implement image-generation operations.

Supported personal AI protocols are OpenAI-compatible Chat Completions, Anthropic Messages, and Gemini Generate Content. Credential-bearing endpoints must use HTTPS and are revalidated before every outbound call. Redirects are not followed. A saved AI connection must be active, owned by the signed-in account, and explicitly selected as the personal Brain.

## Non-AI service connections

Personal Connections support for approved non-AI HTTP, webhook, database and tool integrations. These integrations are not model providers and are not automatically wired to business workflows. A feature-specific adapter and explicit purpose mapping are required before OVYX sends business data to them.

The read-only Test action is available for supported non-AI service connections. Saved AI-protocol records are deliberately excluded from health checks so the application cannot accidentally contact an external model endpoint.

## OAuth service connections

The Personal Connections centre supports account-bound OAuth authorization-code connections for Notion, Slack, Discord, Google Drive, Google Sheets and Google Calendar. OAuth uses a one-time 256-bit state stored server-side, a ten-minute expiry, and PKCE (S256) for Google and Discord. The callback consumes state before exchanging the code, verifies the provider account identity, encrypts access and refresh tokens with the existing \`OVYX_CONNECTION_ENCRYPTION_KEY\`, and stores the resulting connection in the same account-owned \`universal_connections\` collection. Provider tokens and client secrets never enter browser storage or project source.

The OAuth callback is \`https://your-ovyx-domain/api/settings/connection-oauth/callback\`. Configure that exact HTTPS URL as \`OVYX_CONNECTION_OAUTH_REDIRECT_URI\` in Cloudflare Pages. Configure these Cloudflare secrets for each provider you intend to enable:

- \`OVYX_CONNECTION_OAUTH_NOTION_CLIENT_ID\` and \`OVYX_CONNECTION_OAUTH_NOTION_CLIENT_SECRET\`
- \`OVYX_CONNECTION_OAUTH_SLACK_CLIENT_ID\` and \`OVYX_CONNECTION_OAUTH_SLACK_CLIENT_SECRET\`
- \`OVYX_CONNECTION_OAUTH_DISCORD_CLIENT_ID\` and \`OVYX_CONNECTION_OAUTH_DISCORD_CLIENT_SECRET\`
- \`OVYX_CONNECTION_OAUTH_GOOGLE_CLIENT_ID\` and \`OVYX_CONNECTION_OAUTH_GOOGLE_CLIENT_SECRET\`

Google Drive, Sheets and Calendar share one Google OAuth application. Only the service-specific scopes listed in the server registry are requested. OAuth readiness is reported per service; an unconfigured provider remains disabled in the catalogue and cannot start consent. Existing GitHub account OAuth remains separate and is not misrepresented as a project-scoped GitHub adapter.

Google, Discord and Slack token refresh is handled server-side when a refresh token is issued. If a provider does not issue a refresh token, an expired credential requires reconnecting. Notion tokens are retained according to Notion's token lifecycle. OAuth connection testing calls the configured provider health endpoint. Removing an OAuth connection deletes OVYX's encrypted tokens and all project access; provider-side consent must also be revoked from the provider's connected-app settings because OVYX does not claim remote token revocation for every provider. Revoking project access remains separate from disconnecting the account-level provider credential.

OAuth-enabled services currently use the generic HTTPS project adapter with a provider-issued credential. This does not claim native Notion, Slack, Discord or Google workflow coverage. Native adapters, webhook subscriptions and provider-specific event handling remain separately labelled unavailable until their implementations and end-to-end tests exist. A service is not considered natively integrated merely because OAuth consent succeeded.

## Project connection permissions

A user can grant an active non-AI connection to one of their own saved projects through `POST /api/settings/connection-grants`, list grants through `GET /api/settings/connection-grants?projectId=...`, and revoke access with the same POST endpoint using `action: "revoke"`. Each grant is project-specific and can allow only `read`, `write`, `delete`, and/or `execute` actions. The server verifies project ownership, connection ownership, active state, and the grant on every invocation.

A generated project invokes an approved connection through `POST /api/projects/connection-action`. The request must include its project ID, connection ID, HTTP method, and JSON payload where required. For generic HTTP integrations it may also include a relative `path` and simple `query` object; these are appended under the saved endpoint, cannot change hosts, reject path traversal, and block credential-like query keys. AI Brain credentials are deliberately excluded from project grants. Calls create a minimal audit record containing the project, connection, method, result and error code, never the request body or saved credential.

## Encryption configuration

Configure this Cloudflare secret before saving credential-bearing service connections:

\`OVYX_CONNECTION_ENCRYPTION_KEY\`

Keep the existing encryption key unchanged if saved connections use it. Changing it without first migrating encrypted credentials will make those credentials unreadable.

Credential-bearing connections must use HTTPS. Never put secrets in endpoint URLs or generated public-site code. Connection ownership is verified for each request and secret values remain server-side.

## Compatibility fields

Older profiles may still contain \`activeBrainConnectionId\` or \`activeWebStudioConnectionId\`. These legacy values are ignored by all model routes and are returned as \`null\` by the connections API. The \`clear-ai\` and \`clear-webstudio\` actions remain for compatibility and cleanup; assigning an external connection through \`use-ai\`, \`use-webstudio\`, \`useAsBrain\` or \`useForWebStudio\` is rejected.

## Cloudflare AI readiness

The admin AI health endpoint reports the Cloudflare Workers AI binding only. A successful binding check confirms that the Pages Function has an \`AI.run\` binding available; it does not make a paid inference request or prove that a particular prompt will succeed. Actual inference remains subject to the guarded per-user and daily budget controls.


## Product boundary and integration readiness

The Personal Connections screen is the account-level control centre. A saved endpoint is a securely stored credential and service address; it is not, by itself, a completed native OAuth connector or an automatic business-workflow integration. OVYX must only advertise a native app connection when its OAuth registration, callback, token refresh/revocation, scopes, provider API adapter, and end-to-end tests are implemented. For other services, users may connect an official HTTPS API endpoint and explicitly grant it to a project. Database products are connected through a supported HTTPS API or gateway, never by exposing raw database ports.

The Firestore collection and legacy profile counter fields retain their historical universal_connections names for backwards compatibility. They are internal storage identifiers, not the product name shown to users. Existing saved records and encrypted credentials must not be renamed or migrated as part of a visual refresh.
