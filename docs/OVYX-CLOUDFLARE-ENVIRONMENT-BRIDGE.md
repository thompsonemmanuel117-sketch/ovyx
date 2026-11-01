# OVYX Cloudflare Environment Bridge

OVYX Pages Functions receive the environment variables and bindings configured for the Pages project at runtime through `context.env`. This bridge inventories binding names and exposes safe metadata to the authenticated OVYX owner. It never returns credential values.

## Admin diagnostics

`GET /api/admin/environment` returns:
- the Pages Functions runtime and count of discovered binding names;
- configured/missing states for the currently registered email, payments and messaging adapters;
- names of likely credential variables that have no adapter yet;
- names of legacy AI provider variables that were explicitly excluded from this bridge.

The endpoint requires an authenticated OVYX administrator/owner and sends no-store responses. It does not expose secret values or test external services.

## Registered adapter credentials

| Integration | Provider | Supported variable aliases |
| --- | --- | --- |
| Email | Resend | `RESEND_API_KEY` |
| Email | SendGrid | `SENDGRID_API_KEY` |
| Email | Mailgun | `MAILGUN_API_KEY` |
| Email | Brevo | `BREVO_API_KEY`, `SENDINBLUE_API_KEY` |
| Payments | Stripe | `STRIPE_SECRET_KEY`, `STRIPE_API_KEY` |
| Payments | Paystack | `PAYSTACK_SECRET_KEY`, `PAYSTACK_SECRET` |
| Payments | Flutterwave | `FLUTTERWAVE_SECRET_KEY`, `FLW_SECRET_KEY` |
| Messaging | Twilio | `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SECRET` |
| Messaging | WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TOKEN` |

The server-side `resolveIntegrationCredential(env, integrationId, providerId)` helper returns a credential only to a registered adapter. Do not serialize its result, log it, include it in prompts, or forward it to a caller-selected URL. Each provider still needs a narrowly scoped API adapter with fixed trusted endpoints, provider-specific authentication, request validation and response sanitization before it can perform work.

## Adding a provider safely

1. Add a provider entry and exact variable aliases to `INTEGRATION_ADAPTERS`.
2. Implement its server-only adapter using the resolver and fixed provider endpoints.
3. Add tests for success, failure, missing credentials, malformed responses and secret redaction.
4. Add an admin health check that reports status only, never request headers or response secrets.

Unknown credential-like names are reported as `unrecognizedCredentialNames`; they are never automatically used. This prevents a newly added key from being sent to the wrong service.

## Cloudflare deployment behavior

The bridge sees only bindings made available to the running Pages deployment's `context.env`. Add a new variable/secret to the appropriate Production or Preview environment and deploy that environment before expecting it to appear. Production and Preview are isolated and should be checked independently.

This is not an account-wide Cloudflare secret browser. A Pages Function cannot enumerate secrets stored only inside another Worker. A separate Worker must be connected through an explicit service binding or a narrowly scoped authenticated service API.

## AI provider isolation

The bridge does not resolve, validate, route, or modify Gemini, Claude/Anthropic, DeepSeek, OpenAI, Groq or OpenRouter credentials. Their existing provider setup and routing remain outside this feature.
