# OVYX Universal Connections

Universal Connections are account-owned server integrations. Existing credentials are encrypted with AES-GCM in Firestore and remain server-side; public listing responses never reveal saved secrets.

## AI model provider policy

**Cloudflare Workers AI is OVYX's only supported AI model provider.** The ordinary assistant, Web Studio, App Studio, OVYX Agent, automatic repair and other platform model-generation routes use the authenticated Cloudflare Pages Workers AI binding named \`AI\`.

OVYX does not call Gemini, Claude/Anthropic, DeepSeek, OpenAI, Groq, OpenRouter, or a user-saved AI Brain as alternate model providers. Browser-supplied provider/model preferences, old global provider-order settings and stale personal-Brain selections are ignored at the server boundary. If the Cloudflare binding is unavailable or its guarded quota is exhausted, OVYX returns an explicit error instead of silently switching providers.

Older encrypted AI connection records are retained for account-data compatibility. They are not used for model inference, cannot be newly created or selected as an OVYX AI Brain, and are not tested against their remote AI endpoint. Users can still remove an old record themselves. A change in this routing policy does not require deleting or rotating any saved credential.

## Non-AI service connections

Universal Connections remain available for approved non-AI HTTP, webhook, database and tool integrations. These integrations are not model providers and are not automatically wired to business workflows. A feature-specific adapter and explicit purpose mapping are required before OVYX sends business data to them.

The read-only Test action is available for supported non-AI service connections. Saved AI-protocol records are deliberately excluded from health checks so the application cannot accidentally contact an external model endpoint.

## Encryption configuration

Configure this Cloudflare secret before saving credential-bearing service connections:

\`OVYX_CONNECTION_ENCRYPTION_KEY\`

Keep the existing encryption key unchanged if saved connections use it. Changing it without first migrating encrypted credentials will make those credentials unreadable.

Credential-bearing connections must use HTTPS. Never put secrets in endpoint URLs or generated public-site code. Connection ownership is verified for each request and secret values remain server-side.

## Compatibility fields

Older profiles may still contain \`activeBrainConnectionId\` or \`activeWebStudioConnectionId\`. These legacy values are ignored by all model routes and are returned as \`null\` by the connections API. The \`clear-ai\` and \`clear-webstudio\` actions remain for compatibility and cleanup; assigning an external connection through \`use-ai\`, \`use-webstudio\`, \`useAsBrain\` or \`useForWebStudio\` is rejected.

## Cloudflare AI readiness

The admin AI health endpoint reports the Cloudflare Workers AI binding only. A successful binding check confirms that the Pages Function has an \`AI.run\` binding available; it does not make a paid inference request or prove that a particular prompt will succeed. Actual inference remains subject to the guarded per-user and daily budget controls.
